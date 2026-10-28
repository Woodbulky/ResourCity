import "server-only";
import { cache } from "react";
import { addDays } from "date-fns";
import { ACTIVE_STATUSES } from "../contracts/booking";
import { DEFAULT_POLICY, policyValuesSchema, type PolicyValues } from "../contracts/policy";
import {
  bookingRulesSchema, eligibilitySchema,
  type AllocationMode, type ApprovalMode, type BookingRules, type Eligibility, type ResourceCategory, type ResourceStatus,
} from "../contracts/resource";
import { cardState, checkEligibility, type CardState, type EligibilityCheck, type EligibilityStudent } from "../domain/eligibility";
import { activeHolds, availableBalance } from "../domain/ledger";
import { noShowStrikes } from "../domain/strikes";
import { weekStart } from "../domain/time";
import { appNow } from "./clock";
import { createClient } from "./supabase";
import type { SessionViewer } from "./viewer";

export const STUDENT_BOOKING_FIELDS =
  "id, resource_id, status, start_at, end_at, created_at, waitlist_position, offer_expires_at, cutoff_at, status_reason, approver_role, credit_hold, credit_charged, priority_score, score_breakdown, allocation_rule, resources(name, category, location, organizations(name))" as const;

export const currentPolicy = cache(async (): Promise<{ version: number; values: PolicyValues }> => {
  const { data } = await (await createClient())
    .from("policy_versions")
    .select("version, values")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const parsed = policyValuesSchema.safeParse(data?.values);
  return { version: data?.version ?? 1, values: parsed.success ? parsed.data : DEFAULT_POLICY };
});

// Everything the student dashboards read about one student, once per request.
export const studentSnapshot = cache(async (viewer: SessionViewer) => {
  const supabase = await createClient();
  const [now, policy] = await Promise.all([appNow(), currentPolicy()]);
  const [{ data: profile }, { data: ledger }, { data: bookings }, { data: badges }, { data: restrictions }, { data: cases }, { data: emergency }] =
    await Promise.all([
      supabase.from("profiles").select("department, year, roll_number").eq("id", viewer.id).maybeSingle(),
      supabase
        .from("credit_ledger")
        .select("id, delta, kind, booking_id, note, created_at, bookings(resources(name))")
        .eq("user_id", viewer.id)
        .order("created_at", { ascending: false }),
      supabase.from("bookings").select(STUDENT_BOOKING_FIELDS).eq("user_id", viewer.id).order("start_at", { ascending: false }),
      supabase
        .from("user_badges")
        .select("id, badge_type_id, status, expires_at, badge_types(name, organizations(name))")
        .eq("user_id", viewer.id),
      supabase.from("org_restrictions").select("org_id, until, reason").eq("user_id", viewer.id),
      supabase
        .from("damage_cases")
        .select("id, booking_id, severity, status, response_deadline, bookings!inner(user_id, resources(name))")
        .eq("bookings.user_id", viewer.id)
        .neq("status", "decided"),
      supabase
        .from("emergency_credit_requests")
        .select("id, amount, status, granted_amount, decision_reason, created_at")
        .eq("user_id", viewer.id)
        .order("created_at", { ascending: false }),
    ]);

  const entries = ledger ?? [];
  const all = bookings ?? [];
  const strikes = noShowStrikes(
    all.map((b) => ({ status: b.status, start_at: new Date(b.start_at) })),
    now,
    policy.values.strikes,
  );
  // At the limit, the date the oldest strike in the window drops out (review lifts then).
  const windowStart = addDays(now, -policy.values.strikes.window_days);
  const oldestStrike = all
    .filter((b) => b.status === "no_show" && new Date(b.start_at) > windowStart && new Date(b.start_at) <= now)
    .map((b) => new Date(b.start_at))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    now,
    policy,
    profile,
    strikesClearOn: strikes >= policy.values.strikes.limit && oldestStrike ? addDays(oldestStrike, policy.values.strikes.window_days) : null,
    ledger: entries,
    available: availableBalance(entries),
    held: activeHolds(entries),
    nextReset: addDays(weekStart(now), 7),
    bookings: all,
    strikes,
    badges: badges ?? [],
    restrictions: (restrictions ?? []).filter((r) => new Date(r.until) > now),
    cases: cases ?? [],
    emergency: emergency ?? [],
  };
});

export type StudentSnapshot = Awaited<ReturnType<typeof studentSnapshot>>;

export interface ResourceCardData {
  id: string;
  name: string;
  category: ResourceCategory;
  description: string;
  orgName: string;
  location: string;
  baseRate: number;
  rateUnit: "hour" | "day";
  quantity: number;
  approvalMode: ApprovalMode;
  allocationMode: AllocationMode;
  state: CardState;
  headline: string; // one-line eligibility result for the card
  checks: EligibilityCheck[];
}

export interface CatalogEntry extends ResourceCardData {
  status: ResourceStatus;
  rules: BookingRules;
  eligibility: Eligibility;
}

const RESOURCE_FIELDS =
  "id, name, category, description, location, quantity, status, approval_mode, allocation_mode, eligibility, booking_rules, base_rate, rate_unit, org_id, organizations(name)" as const;

const approvalLine = (mode: ApprovalMode, allocation: AllocationMode) =>
  allocation === "batch"
    ? "Fair batch allocation"
    : mode === "auto"
      ? "Instant approval"
      : mode === "manager"
        ? "Manager approval required"
        : "Owner approval";

// The student side of checkEligibility() for one resource's organisation.
export function eligibilityStudent(viewer: SessionViewer, snap: StudentSnapshot, orgId: string): EligibilityStudent {
  const restriction = snap.restrictions.find((x) => x.org_id === orgId);
  return {
    status: viewer.status,
    status_reason: viewer.statusReason,
    suspended_until: viewer.suspendedUntil ? new Date(viewer.suspendedUntil) : null,
    department: snap.profile?.department ?? null,
    year: snap.profile?.year ?? null,
    memberOfOrg: viewer.memberships.some((m) => m.orgId === orgId),
    orgRestriction: restriction ? { until: new Date(restriction.until), reason: restriction.reason } : null,
    badges: snap.badges.map((b) => ({ badge_type_id: b.badge_type_id, status: b.status, expires_at: b.expires_at ? new Date(b.expires_at) : null })),
  };
}

export const activeBookingsAt = (snap: StudentSnapshot, resourceId: string) =>
  snap.bookings.filter((b) => b.resource_id === resourceId && ACTIVE_STATUSES.includes(b.status)).length;

// Slot-independent eligibility for a card (PRD 7). Availability and duration need a chosen
// slot, so the card says so instead of claiming "Eligible" for a check it could not run.
export const catalog = cache(async (viewer: SessionViewer, opts: { resourceId?: string } = {}) => {
  const supabase = await createClient();
  const snap = await studentSnapshot(viewer);
  let query = supabase.from("resources").select(RESOURCE_FIELDS).order("name");
  query = opts.resourceId ? query.eq("id", opts.resourceId) : query.eq("status", "active");
  const [{ data: resources }, { data: badgeTypes }] = await Promise.all([query, supabase.from("badge_types").select("id, name")]);
  const badgeNames = Object.fromEntries((badgeTypes ?? []).map((b) => [b.id, b.name]));

  return (resources ?? []).map((r): CatalogEntry => {
    const eligibility = eligibilitySchema.safeParse(r.eligibility).data ?? eligibilitySchema.parse({});
    const rules = bookingRulesSchema.safeParse(r.booking_rules).data ?? bookingRulesSchema.parse({});
    const oneUnitMinutes = r.rate_unit === "day" ? 24 * 60 : 60;
    const checks = checkEligibility(
      eligibilityStudent(viewer, snap, r.org_id),
      { eligibility, booking_rules: rules, approval_mode: r.approval_mode, badgeNames },
      { start: snap.now, end: new Date(snap.now.getTime() + oneUnitMinutes * 60_000) },
      {
        now: snap.now,
        activeBookingsHere: activeBookingsAt(snap, r.id),
        availableCredits: snap.available,
        cost: r.base_rate, // one rate unit: the smallest booking
        noShowStrikes: snap.strikes,
        strikeLimit: snap.policy.values.strikes.limit,
        strikesClearOn: snap.strikesClearOn,
        slotFree: true,
      },
    ).filter((c) => c.key !== "slot_available" && c.key !== "max_duration");
    const state = cardState(checks, r.approval_mode);
    const firstBlock = checks.find((c) => c.result === "block");
    const review = checks.find((c) => c.result === "review");
    const headline =
      state === "eligible" || state === "eligible_approval"
        ? `Eligible · ${review ? "needs Manager review" : approvalLine(r.approval_mode, r.allocation_mode)}`
        : (firstBlock?.reason ?? "Not available");
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      orgName: r.organizations?.name ?? "",
      location: r.location,
      baseRate: r.base_rate,
      rateUnit: r.rate_unit,
      quantity: r.quantity,
      approvalMode: r.approval_mode,
      allocationMode: r.allocation_mode,
      state,
      headline,
      checks,
      status: r.status,
      rules,
      eligibility,
    };
  });
});

export { approvalLine };

// The plain fields a resource card needs, safe to pass to a client component.
export const toCard = (e: CatalogEntry): ResourceCardData => ({
  id: e.id, name: e.name, category: e.category, description: e.description, orgName: e.orgName, location: e.location,
  baseRate: e.baseRate, rateUnit: e.rateUnit, quantity: e.quantity, approvalMode: e.approvalMode,
  allocationMode: e.allocationMode, state: e.state, headline: e.headline, checks: e.checks,
});
