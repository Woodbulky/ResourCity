import { describe, expect, it } from "vitest";
import { slotProblem } from "./availability";
import type { EligibilityCheck } from "./eligibility";
import { qrWindow, signQr, verifyQr } from "./qr";
import { planSubmission } from "./request";
import { istInstant } from "./time";

const at = (date: string, hhmm: string) => istInstant(date, hhmm);
// 2026-11-02 is a Monday.
const MON_TO_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "08:00:00", end_time: "20:00:00" }));

describe("bookable hours", () => {
  it("accepts a slot whose start and end are both inside open hours, even across days", () => {
    expect(slotProblem(at("2026-11-02", "10:00"), at("2026-11-02", "20:00"), MON_TO_SAT, [])).toBeNull();
    expect(slotProblem(at("2026-11-02", "10:00"), at("2026-11-04", "10:00"), MON_TO_SAT, [])).toBeNull();
  });
  it("rejects starts or ends outside open hours and on closed weekdays", () => {
    expect(slotProblem(at("2026-11-02", "07:00"), at("2026-11-02", "09:00"), MON_TO_SAT, [])).toMatch(/Outside/);
    expect(slotProblem(at("2026-11-02", "19:00"), at("2026-11-02", "21:00"), MON_TO_SAT, [])).toMatch(/Outside/);
    expect(slotProblem(at("2026-11-01", "10:00"), at("2026-11-01", "11:00"), MON_TO_SAT, [])).toMatch(/Outside/); // Sunday
  });
  it("treats no windows as open any time, and blocks closures", () => {
    expect(slotProblem(at("2026-11-01", "03:00"), at("2026-11-01", "04:00"), [], [])).toBeNull();
    const closure = [{ starts_at: at("2026-11-02", "08:00"), ends_at: at("2026-11-02", "20:00"), reason: "Rehearsal" }];
    expect(slotProblem(at("2026-11-02", "10:00"), at("2026-11-02", "11:00"), MON_TO_SAT, closure)).toBe("Closed then: Rehearsal.");
    expect(slotProblem(at("2026-11-02", "11:00"), at("2026-11-02", "10:00"), [], [])).toMatch(/after the start/);
  });
});

const check = (key: EligibilityCheck["key"], result: EligibilityCheck["result"]): EligibilityCheck => ({ key, result, reason: key, fix: null });
const allPass = [check("account_verified", "pass"), check("slot_available", "pass")];
const instant: Parameters<typeof planSubmission>[1] = { approval_mode: "owner", allocation_mode: "instant", manager_approval: false };

describe("submission routing", () => {
  const plan = (checks: EligibilityCheck[], r = instant, cutoffPassed = false) => planSubmission(checks, r, { cutoffPassed });
  it("auto-approves only when every check passes on an auto resource", () => {
    expect(plan(allPass, { ...instant, approval_mode: "auto" })).toEqual({
      ok: true, plan: { event: "submit_auto", approverRole: "owner", isException: false },
    });
    expect(plan(allPass)).toMatchObject({ ok: true, plan: { event: "submit_approval", approverRole: "owner" } });
  });
  it("sends exceptions and strike reviews to the Manager", () => {
    expect(plan([...allPass, check("max_duration", "review")], { ...instant, approval_mode: "auto" })).toMatchObject({
      ok: true, plan: { event: "submit_approval", approverRole: "manager", isException: true },
    });
    expect(plan([...allPass, check("no_show_strikes", "review")])).toMatchObject({
      ok: true, plan: { approverRole: "manager", isException: false },
    });
    expect(plan(allPass, { ...instant, manager_approval: true })).toMatchObject({ ok: true, plan: { approverRole: "manager" } });
  });
  it("waitlists a taken slot and never submits a blocked request", () => {
    expect(plan([check("slot_available", "block")])).toMatchObject({ ok: true, plan: { event: "submit_waitlist" } });
    expect(plan([check("credits", "block"), check("slot_available", "block")])).toEqual({ ok: false, error: "credits" });
  });
  it("holds batch requests until the cutoff, then works first-come-first-served", () => {
    const batch = { ...instant, allocation_mode: "batch" as const };
    expect(plan(allPass, batch)).toMatchObject({ ok: true, plan: { event: "submit_batch" } });
    expect(plan(allPass, batch, true)).toMatchObject({ ok: true, plan: { event: "submit_approval" } });
  });
});

describe("signed QR", () => {
  const secret = "test-secret";
  const start = at("2026-11-02", "10:00");
  const booking = { status: "approved", start_at: start, end_at: at("2026-11-02", "12:00"), grace_minutes: 30 };
  const token = signQr({ b: "b1", u: "u1", ...qrWindow(booking, start)! }, secret);
  const mins = (m: number) => new Date(start.getTime() + m * 60_000);

  it("is valid from 60 minutes before the start until the end of grace", () => {
    expect(verifyQr(token, secret, mins(-61)).ok).toBe(false);
    expect(verifyQr(token, secret, mins(-60))).toMatchObject({ ok: true, payload: { b: "b1", u: "u1", p: "pickup" } });
    expect(verifyQr(token, secret, mins(30)).ok).toBe(true);
    expect(verifyQr(token, secret, mins(31))).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
  });
  it("rejects a tampered token or the wrong secret", () => {
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ b: "b2", u: "u1", p: "pickup", nbf: 0, exp: 9e9 })).toString("base64url");
    expect(verifyQr(`${forged}.${sig}`, secret, start).ok).toBe(false);
    expect(verifyQr(`${body}.${sig}`, "other", start).ok).toBe(false);
    expect(verifyQr("garbage", secret, start).ok).toBe(false);
  });
  it("issues a return code while borrowed and none for closed bookings", () => {
    expect(qrWindow({ ...booking, status: "overdue" }, mins(600))?.p).toBe("return");
    expect(qrWindow({ ...booking, status: "completed" }, start)).toBeNull();
  });
});
