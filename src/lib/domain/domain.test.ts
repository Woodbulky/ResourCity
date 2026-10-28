import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKING_TRANSITIONS } from "../contracts/booking";
import { DEFAULT_POLICY } from "../contracts/policy";
import { bookingRulesSchema, eligibilitySchema } from "../contracts/resource";
import { cardState, checkEligibility, type EligibilityContext, type EligibilityStudent } from "./eligibility";
import { graceMinutes } from "./grace";
import { activeHolds, availableBalance, debt, weeklyResetEntries, type LedgerEntry } from "./ledger";
import { creditCost, returnCharge, type PricedResource } from "./pricing";
import { categoryCap, priorityScore, rankRequests } from "./priority";
import { forfeitsHold, needsStrikeReview, noShowStrikes } from "./strikes";
import { istInstant, minutesInDailyWindow, weekStart } from "./time";
import { checkTransition, eventsFrom } from "./transitions";

const at = (date: string, hhmm: string) => istInstant(date, hhmm);
const hours = (h: number) => h * 3_600_000;

describe("transitions", () => {
  it("matches the database copy in the functions migration", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_functions.sql"))!;
    const sql = readFileSync(join(dir, file), "utf8");
    const rows = [...sql.matchAll(/\('([a-z_]+)', '([a-z_]+)', '([a-z_]+)', '\{([a-z,]+)\}', (true|false)\)/g)].map(
      (m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}|${m[5]}`,
    );
    const ts = BOOKING_TRANSITIONS.map(
      (t) => `${t.from}|${t.event}|${t.to}|${t.actors.join(",")}|${t.reasonRequired}`,
    );
    expect(rows).toEqual(ts);
  });

  it("allows the happy path and rejects pairs outside the table", () => {
    expect(checkTransition("pending_approval", "approve", "owner").ok).toBe(true);
    expect(checkTransition("approved", "handover", "owner").ok).toBe(true);
    expect(checkTransition("checked_out", "return", "owner").ok).toBe(true);
    expect(checkTransition("returned", "complete", "owner").ok).toBe(true);
    expect(checkTransition("pending_approval", "handover", "owner").ok).toBe(false);
    expect(checkTransition("completed", "cancel", "admin").ok).toBe(false);
  });

  it("enforces actors and mandatory reasons", () => {
    expect(checkTransition("pending_approval", "approve", "student").ok).toBe(false);
    expect(checkTransition("pending_approval", "reject", "owner").ok).toBe(false);
    expect(checkTransition("pending_approval", "reject", "owner", "Clashes with exam").ok).toBe(true);
    expect(checkTransition("under_review", "decide_dispute", "owner", "x").ok).toBe(false);
  });

  it("lets a student cancel at every pre-pickup stage, never after pickup", () => {
    for (const from of ["pending_allocation", "pending_approval", "waitlisted", "offered", "approved"] as const)
      expect(eventsFrom(from, "student")).toContain("cancel");
    expect(eventsFrom("checked_out", "student")).not.toContain("cancel");
    expect(eventsFrom("overdue", "admin")).not.toContain("cancel");
  });
});

describe("grace period (PRD 10 table)", () => {
  const g = (h: number) => graceMinutes(new Date(0), new Date(hours(h)), DEFAULT_POLICY.grace);
  it("follows the published table", () => {
    expect(g(1)).toBe(15);
    expect(g(2)).toBe(30);
    expect(g(4)).toBe(60);
    expect(g(24)).toBe(120);
    expect(g(0.5)).toBe(15);
  });
});

describe("pricing", () => {
  const court: PricedResource = {
    base_rate: 10,
    rate_unit: "hour",
    peak_multiplier: 1.5,
    peak_window: { start: "17:00", end: "21:00" },
  };
  it("charges base rate off-peak and the multiplier only inside the peak window", () => {
    expect(creditCost(court, at("2026-11-02", "10:00"), at("2026-11-02", "11:00"))).toBe(10);
    expect(creditCost(court, at("2026-11-02", "17:00"), at("2026-11-02", "18:00"))).toBe(15);
    expect(creditCost(court, at("2026-11-02", "16:00"), at("2026-11-02", "18:00"))).toBe(25);
  });
  it("finds peak minutes across midnight-spanning bookings", () => {
    expect(minutesInDailyWindow(at("2026-11-02", "20:00"), at("2026-11-03", "18:00"), court.peak_window!)).toBe(120);
  });
  it("charges daily resources per started day and frees free resources", () => {
    const camera: PricedResource = { base_rate: 10, rate_unit: "day", peak_multiplier: 1.5, peak_window: null };
    expect(creditCost(camera, new Date(0), new Date(hours(30)))).toBe(20);
    expect(creditCost({ ...camera, base_rate: 0 }, new Date(0), new Date(hours(30)))).toBe(0);
  });
  it("charges min(actual, booked) on return", () => {
    const lab: PricedResource = { base_rate: 5, rate_unit: "hour", peak_multiplier: 1, peak_window: null };
    const s = new Date(0);
    const e = new Date(hours(4));
    expect(returnCharge(lab, s, e, new Date(hours(2)))).toBe(10);
    expect(returnCharge(lab, s, e, new Date(hours(7)))).toBe(20);
  });
});

describe("ledger", () => {
  const e = (delta: number, kind: LedgerEntry["kind"], booking_id: string | null = null): LedgerEntry => ({
    delta,
    kind,
    booking_id,
  });
  it("computes available and held credits from deltas only", () => {
    const entries = [e(100, "allowance"), e(-40, "hold", "b1"), e(-20, "hold", "b2"), e(20, "release", "b2")];
    expect(availableBalance(entries)).toBe(60);
    expect(activeHolds(entries)).toBe(40);
  });
  it("settles a completion as release plus a smaller charge", () => {
    const entries = [e(100, "allowance"), e(-40, "hold", "b1"), e(40, "release", "b1"), e(-25, "charge", "b1")];
    expect(availableBalance(entries)).toBe(75);
    expect(activeHolds(entries)).toBe(0);
  });
  it("expires unused credits at reset but leaves holds and lets the allowance absorb debt", () => {
    expect(weeklyResetEntries(60, 100)).toEqual([
      { kind: "reset_expiry", delta: -60 },
      { kind: "allowance", delta: 100 },
    ]);
    expect(weeklyResetEntries(-30, 100)).toEqual([{ kind: "allowance", delta: 100 }]);
    expect(debt([e(20, "allowance"), e(-50, "penalty")])).toBe(30);
  });
});

describe("no-show strikes", () => {
  const now = at("2026-11-10", "12:00");
  const ns = (daysAgo: number) => ({ status: "no_show" as const, start_at: new Date(now.getTime() - daysAgo * 86_400_000) });
  it("counts only no-shows inside the rolling window", () => {
    const list = [ns(1), ns(10), ns(29), ns(31), { status: "completed" as const, start_at: ns(2).start_at }];
    expect(noShowStrikes(list, now, DEFAULT_POLICY.strikes)).toBe(3);
  });
  it("forfeits on the 4th and reviews from the 3rd", () => {
    expect(forfeitsHold(2, DEFAULT_POLICY.strikes)).toBe(false);
    expect(forfeitsHold(3, DEFAULT_POLICY.strikes)).toBe(true);
    expect(needsStrikeReview(2, DEFAULT_POLICY.strikes)).toBe(false);
    expect(needsStrikeReview(3, DEFAULT_POLICY.strikes)).toBe(true);
  });
});

describe("priority score (PRD 8)", () => {
  const cap = categoryCap(DEFAULT_POLICY, "seminar_hall");
  it("gives a fresh student with a verified deadline the full score", () => {
    const s = priorityScore(
      { completedHours: 0, allocations: 0, unsuccessful: 3, purposeCategory: "academic_deadline", purposeVerified: true, autoApprove: false },
      cap,
    );
    expect(s).toEqual({ usage: 40, allocations: 25, unsuccessful: 20, purpose: 15, total: 100 });
  });
  it("caps usage, ignores unverified purpose, and scores purpose 0 on auto-approve", () => {
    const heavy = priorityScore(
      { completedHours: 50, allocations: 9, unsuccessful: 0, purposeCategory: "project_research", purposeVerified: false, autoApprove: false },
      cap,
    );
    expect(heavy.total).toBe(0);
    const auto = priorityScore(
      { completedHours: 10, allocations: 2, unsuccessful: 1, purposeCategory: "academic_deadline", purposeVerified: true, autoApprove: true },
      cap,
    );
    expect(auto).toMatchObject({ usage: 20, allocations: 13, unsuccessful: 7, purpose: 0 });
  });
  it("never divides by zero when a cap is missing or zero", () => {
    const c = categoryCap({ ...DEFAULT_POLICY, category_caps: { lab: { hours: 0, allocations: 0 } } }, "lab");
    expect(c).toEqual({ hours: 20, allocations: 4 });
  });
  it("breaks ties by fewer completed hours, then the earlier request", () => {
    const r = (id: string, score: number, h: number, t: number) => ({ id, score, completedHours: h, createdAt: new Date(t) });
    const ranked = rankRequests([r("late", 70, 2, 2), r("early", 70, 2, 1), r("light", 70, 0, 3), r("top", 90, 9, 4)]);
    expect(ranked.map((x) => x.id)).toEqual(["top", "light", "early", "late"]);
  });
});

describe("eligibility", () => {
  const CNC = "00000000-0000-4000-8000-000000000001";
  const student: EligibilityStudent = {
    status: "verified",
    status_reason: null,
    suspended_until: null,
    department: "ECE",
    year: 3,
    memberOfOrg: false,
    orgRestriction: null,
    badges: [],
  };
  const resource = {
    eligibility: eligibilitySchema.parse({ required_badge_type_ids: [CNC] }),
    booking_rules: bookingRulesSchema.parse({ max_duration_minutes: 120, max_active_bookings: 1 }),
    approval_mode: "manager" as const,
    badgeNames: { [CNC]: "CNC Safety Training" },
  };
  const slot = { start: at("2026-11-05", "10:00"), end: at("2026-11-05", "12:00") };
  const ctx: EligibilityContext = {
    now: at("2026-11-01", "09:00"),
    activeBookingsHere: 0,
    availableCredits: 100,
    cost: 40,
    noShowStrikes: 0,
    strikeLimit: 3,
    strikesClearOn: null,
    slotFree: true,
  };
  const find = (checks: ReturnType<typeof checkEligibility>, key: string) => checks.find((c) => c.key === key)!;

  it("shows Action required when a badge is missing", () => {
    const checks = checkEligibility(student, resource, slot, ctx);
    expect(find(checks, "badges")).toMatchObject({ result: "block", reason: "CNC Safety Training missing." });
    expect(cardState(checks, "manager")).toBe("action_required");
  });

  it("passes with a valid badge and needs approval on a manager resource", () => {
    const s = { ...student, badges: [{ badge_type_id: CNC, status: "verified" as const, expires_at: null }] };
    const checks = checkEligibility(s, resource, slot, ctx);
    expect(checks.every((c) => c.result === "pass")).toBe(true);
    expect(find(checks, "badges").reason).toBe("CNC Safety Training verified.");
    expect(cardState(checks, "manager")).toBe("eligible_approval");
  });

  it("reports an expired badge with its date", () => {
    const s = { ...student, badges: [{ badge_type_id: CNC, status: "verified" as const, expires_at: at("2026-10-12", "00:00") }] };
    expect(find(checkEligibility(s, resource, slot, ctx), "badges").reason).toBe("CNC Safety Training expired on 12 Oct.");
  });

  it("routes an over-long request to review and a credit shortfall to emergency credits", () => {
    const s = { ...student, badges: [{ badge_type_id: CNC, status: "verified" as const, expires_at: null }] };
    const long = { start: slot.start, end: at("2026-11-05", "13:00") };
    const checks = checkEligibility(s, resource, long, { ...ctx, availableCredits: 25 });
    expect(find(checks, "max_duration")).toMatchObject({ result: "review", reason: "Max 2 hours; you asked for 3 hours." });
    expect(find(checks, "credits")).toMatchObject({ result: "block", reason: "Needs 40 credits; you have 25 available." });
  });

  it("is never Eligible when availability could not be checked", () => {
    const s = { ...student, badges: [{ badge_type_id: CNC, status: "verified" as const, expires_at: null }] };
    const checks = checkEligibility(s, { ...resource, approval_mode: "auto" }, slot, { ...ctx, slotFree: null });
    expect(cardState(checks, "auto")).not.toBe("eligible");
  });

  it("marks restricted access as not eligible and a taken slot as unavailable", () => {
    const ece = { ...resource, eligibility: eligibilitySchema.parse({ departments: ["Mechanical"] }) };
    expect(cardState(checkEligibility(student, ece, slot, ctx), "owner")).toBe("not_eligible");
    const open = { ...resource, eligibility: eligibilitySchema.parse({}) };
    const taken = checkEligibility(student, open, slot, { ...ctx, slotFree: false, takenLabel: "Taken 2–4 pm." });
    expect(cardState(taken, "auto")).toBe("unavailable");
  });

  it("blocks pending and suspended accounts", () => {
    const pending = checkEligibility({ ...student, status: "pending_verification" }, resource, slot, ctx);
    expect(find(pending, "account_verified").reason).toBe("Your account is awaiting verification.");
    const suspended = checkEligibility(
      { ...student, status: "suspended", status_reason: "repeated late returns", suspended_until: at("2026-11-05", "00:00") },
      resource,
      slot,
      ctx,
    );
    expect(find(suspended, "not_suspended").reason).toBe("Booking privileges suspended until 5 Nov: repeated late returns.");
  });
});

describe("time", () => {
  it("finds Monday 00:00 IST", () => {
    expect(weekStart(at("2026-10-29", "15:00")).toISOString()).toBe(at("2026-10-26", "00:00").toISOString());
    expect(weekStart(at("2026-10-26", "00:30")).toISOString()).toBe(at("2026-10-26", "00:00").toISOString());
  });
});
