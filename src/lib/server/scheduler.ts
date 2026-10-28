import "server-only";
import { subDays } from "date-fns";
import { ACTIVE_STATUSES } from "../contracts/booking";
import type { Json } from "../contracts/database";
import { policyValuesSchema, DEFAULT_POLICY } from "../contracts/policy";
import { bookingRulesSchema, eligibilitySchema } from "../contracts/resource";
import { checkEligibility } from "../domain/eligibility";
import { categoryCap, fillCapacity, priorityScore, rankRequests } from "../domain/priority";
import { noShowStrikes } from "../domain/strikes";
import { minutesBetween } from "../domain/time";
import { transitionBooking } from "./booking";
import { createServiceClient } from "./supabase";

// The scheduler (PRD 2): batch allocation first, then every other job in public.scheduler_tick().
// Called by POST /api/cron/tick (Render cron, every minute) and the Admin "Run scheduler now".
export async function runScheduler() {
  const batch = await runBatchAllocation();
  const { data, error } = await createServiceClient().rpc("scheduler_tick");
  if (error) throw new Error(`scheduler_tick failed: ${error.message}`);
  return { batch, ...(data as Record<string, unknown>) };
}

const SLOT_HOLDING = ["approved", "offered", "checked_out", "overdue"] as const;
const ALLOCATED = ["approved", "checked_out", "overdue", "returned", "under_review", "completed"] as const;

// Batch allocation at the cutoff (PRD 8): re-check eligibility, score, rank, fill capacity,
// waitlist the rest in rank order. Every move goes through transitionBooking().
export async function runBatchAllocation() {
  const db = createServiceClient();
  const { data: nowRaw } = await db.rpc("app_now");
  const now = new Date(nowRaw as string);
  const since = subDays(now, 30);
  const { data: due } = await db
    .from("bookings")
    .select(
      "id, user_id, resource_id, start_at, end_at, created_at, purpose_category, purpose_verified, approver_role, is_exception, credit_hold, grace_minutes, resources(org_id, category, approval_mode, eligibility, booking_rules)",
    )
    .eq("status", "pending_allocation")
    .lte("cutoff_at", now.toISOString());
  if (!due?.length) return { allocated: 0, waitlisted: 0, dropped: 0, errors: [] as string[] };

  const users = [...new Set(due.map((b) => b.user_id))];
  const [{ data: policyRow }, { data: profiles }, { data: memberships }, { data: restrictions }, { data: badges }, { data: ledger }, { data: history }, { data: badgeTypes }] =
    await Promise.all([
      db.from("policy_versions").select("version, values").order("version", { ascending: false }).limit(1).single(),
      db.from("profiles").select("id, status, status_reason, suspended_until, department, year").in("id", users),
      db.from("memberships").select("user_id, org_id").in("user_id", users),
      db.from("org_restrictions").select("user_id, org_id, until, reason").in("user_id", users).gt("until", now.toISOString()),
      db.from("user_badges").select("user_id, badge_type_id, status, expires_at").in("user_id", users),
      db.from("credit_ledger").select("user_id, delta").in("user_id", users),
      db
        .from("bookings")
        .select("id, user_id, resource_id, status, start_at, end_at, resources(category)")
        .in("user_id", users)
        .gte("start_at", subDays(now, 60).toISOString()),
      db.from("badge_types").select("id, name"),
    ]);
  const policy = policyValuesSchema.safeParse(policyRow?.values).data ?? DEFAULT_POLICY;
  const rule = `Batch allocation, policy v${policyRow?.version ?? 1}`;
  const badgeNames = Object.fromEntries((badgeTypes ?? []).map((b) => [b.id, b.name]));
  const past = history ?? [];
  const recent = past.filter((x) => new Date(x.start_at) >= since && new Date(x.start_at) <= now);

  const out = { allocated: 0, waitlisted: 0, dropped: 0, errors: [] as string[] };
  const move = async (id: string, event: "allocate" | "allocate_for_approval" | "allocate_waitlist" | "allocate_drop", reason?: string, payload = {}) => {
    const r = await transitionBooking({ bookingId: id, event, actor: { id: null, role: "system" }, reason, payload });
    if (!r.ok) out.errors.push(`${event} ${id}: ${r.error}`);
    return r.ok;
  };

  for (const resourceId of new Set(due.map((b) => b.resource_id))) {
    const group = due.filter((b) => b.resource_id === resourceId);
    const res = group[0].resources!;
    const eligibility = eligibilitySchema.safeParse(res.eligibility).data ?? eligibilitySchema.parse({});
    const rules = bookingRulesSchema.safeParse(res.booking_rules).data ?? bookingRulesSchema.parse({});
    const cap = categoryCap(policy, res.category);
    const [{ count: units }, { data: holding }] = await Promise.all([
      db.from("resource_units").select("id", { count: "exact", head: true }).eq("resource_id", resourceId).eq("status", "active"),
      db.from("bookings").select("start_at, end_at").eq("resource_id", resourceId).in("status", SLOT_HOLDING),
    ]);

    // 1–2. Eligibility and hard caps again, at the cutoff; failures are dropped with the reason.
    const eligible = [];
    for (const b of group) {
      const p = profiles?.find((x) => x.id === b.user_id);
      const restriction = restrictions?.find((x) => x.user_id === b.user_id && x.org_id === res.org_id);
      const mine = past.filter((x) => x.user_id === b.user_id);
      const slot = { start: new Date(b.start_at), end: new Date(b.end_at) };
      const checks = checkEligibility(
        {
          status: p?.status ?? "pending_verification",
          status_reason: p?.status_reason ?? null,
          suspended_until: p?.suspended_until ? new Date(p.suspended_until) : null,
          department: p?.department ?? null,
          year: p?.year ?? null,
          memberOfOrg: !!memberships?.some((m) => m.user_id === b.user_id && m.org_id === res.org_id),
          orgRestriction: restriction ? { until: new Date(restriction.until), reason: restriction.reason } : null,
          badges: (badges ?? []).filter((x) => x.user_id === b.user_id).map((x) => ({ ...x, expires_at: x.expires_at ? new Date(x.expires_at) : null })),
        },
        { eligibility, booking_rules: rules, approval_mode: res.approval_mode, badgeNames },
        slot,
        {
          now,
          activeBookingsHere: mine.filter((x) => x.resource_id === resourceId && x.id !== b.id && ACTIVE_STATUSES.includes(x.status)).length,
          availableCredits: (ledger ?? []).filter((l) => l.user_id === b.user_id).reduce((s, l) => s + l.delta, 0),
          cost: b.credit_hold,
          noShowStrikes: noShowStrikes(mine.map((x) => ({ status: x.status, start_at: new Date(x.start_at) })), now, policy.strikes),
          strikeLimit: policy.strikes.limit,
          strikesClearOn: null,
          slotFree: true, // capacity is decided by the fill below
        },
      );
      const block = checks.find((c) => c.result === "block");
      if (block) {
        if (await move(b.id, "allocate_drop", `Not allocated at the cutoff: ${block.reason}`)) out.dropped++;
        continue;
      }
      // 3. Score over the last 30 days.
      const myRecent = recent.filter((x) => x.user_id === b.user_id && x.id !== b.id);
      const completedHours = myRecent
        .filter((x) => x.status === "completed" && x.resources?.category === res.category)
        .reduce((s, x) => s + minutesBetween(new Date(x.start_at), new Date(x.end_at)) / 60, 0);
      const breakdown = priorityScore(
        {
          completedHours,
          allocations: myRecent.filter((x) => x.resource_id === resourceId && (ALLOCATED as readonly string[]).includes(x.status)).length,
          unsuccessful: myRecent.filter((x) => x.resource_id === resourceId && (x.status === "rejected" || x.status === "expired")).length,
          purposeCategory: b.purpose_category,
          purposeVerified: b.purpose_verified,
          autoApprove: res.approval_mode === "auto",
        },
        cap,
      );
      eligible.push({ ...b, start: slot.start, end: slot.end, score: breakdown.total, breakdown, completedHours, createdAt: new Date(b.created_at) });
    }

    // 4–5. Rank (ties: fewer hours, then earlier request), fill capacity, waitlist the rest.
    const ranked = rankRequests(eligible);
    const taken = (holding ?? []).map((x) => ({ start: new Date(x.start_at), end: new Date(x.end_at) }));
    const { accepted } = fillCapacity(ranked, taken, units ?? 0);
    const positions = new Map<string, number>();
    for (const [i, b] of ranked.entries()) {
      // 6. Score, breakdown and rule on every booking (only the student's own breakdown is shown).
      const payload = {
        priority_score: b.score,
        score_breakdown: { ...b.breakdown, rank: i + 1, competing: ranked.length, higher: i } as unknown as Record<string, Json>,
        allocation_rule: rule,
        grace_minutes: b.grace_minutes ?? undefined,
      };
      if (accepted.includes(b)) {
        const needsApproval = res.approval_mode !== "auto" || b.approver_role === "manager" || b.is_exception;
        if (needsApproval) {
          if (await move(b.id, "allocate_for_approval", undefined, payload)) out.allocated++;
          continue;
        }
        const r = await transitionBooking({ bookingId: b.id, event: "allocate", actor: { id: null, role: "system" }, payload });
        if (r.ok) {
          out.allocated++;
          continue;
        }
        if (await move(b.id, "allocate_drop", `Not allocated: ${r.error}`, payload)) out.dropped++;
        continue;
      }
      const key = `${b.start_at}|${b.end_at}`;
      const position = (positions.get(key) ?? 0) + 1;
      positions.set(key, position);
      const reason = `Outside capacity: ${i === 1 ? "one eligible request" : `${i} eligible requests`} scored higher.`;
      if (await move(b.id, "allocate_waitlist", reason, { ...payload, waitlist_position: position })) out.waitlisted++;
    }
  }
  return out;
}
