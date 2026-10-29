import "server-only";
import { cache } from "react";
import { addDays } from "date-fns";
import type { StoredComparison } from "../contracts/ai";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE, formatDateTime, istDate, istInstant } from "../domain/time";
import { appNow } from "./clock";
import { createClient } from "./supabase";
import type { SessionViewer } from "./viewer";

// Read models behind the role dashboards (PRD 12): what needs this person's action now.
// Everything is read as the signed-in user, so RLS decides what each role may see.

const STAFF_BOOKING_FIELDS =
  "id, status, start_at, end_at, created_at, approver_role, is_exception, exception_reason, purpose_category, purpose_text, priority_score, escalation_level, waitlist_position, offer_expires_at, cutoff_at, status_reason, credit_hold, credit_charged, user_id, profiles!bookings_user_id_fkey(full_name, department, year), resources!inner(id, name, category, location, org_id, organizations(name))" as const;

export const todayBounds = (now: Date) => {
  const start = istInstant(istDate(now), "00:00");
  return { start, end: addDays(start, 1) };
};

const orgIds = (viewer: SessionViewer, role: "owner" | "manager") =>
  viewer.memberships.filter((m) => m.role === role).map((m) => m.orgId);

export const ownerDesk = cache(async (viewer: SessionViewer) => {
  const supabase = await createClient();
  const now = await appNow();
  const ids = orgIds(viewer, "owner");
  const { end: todayEnd } = todayBounds(now);
  const live = ["pending_approval", "approved", "checked_out", "overdue", "returned", "under_review"] as const;
  const [{ data: bookings }, { data: resources }, { data: certificates }] = await Promise.all([
    supabase
      .from("bookings")
      .select(STAFF_BOOKING_FIELDS)
      .in("resources.org_id", ids)
      .in("status", live)
      .order("created_at"),
    supabase
      .from("resources")
      .select("id, name, category, form_template, status, quantity, base_rate, rate_unit, approval_mode, allocation_mode, location, org_id, estimated_current_usage")
      .in("org_id", ids)
      .order("name"),
    // Certificates waiting for badges these organisations issue (PRD 12 Owner queues).
    supabase
      .from("user_badges")
      .select("id, certificate_path, ai_extraction, created_at, user_id, profiles!user_badges_user_id_fkey(full_name, department, year), badge_types!inner(name, validity_days, issuing_org_id)")
      .in("badge_types.issuing_org_id", ids)
      .eq("status", "pending")
      .order("created_at"),
  ]);
  const all = bookings ?? [];
  // Returns whose AI comparison suggests damage and that the Owner has not yet confirmed or dismissed.
  const returnedIds = all.filter((b) => b.status === "returned").map((b) => b.id);
  const { data: reports } = returnedIds.length
    ? await supabase.from("condition_reports").select("booking_id, ai_analysis").eq("phase", "return").in("booking_id", returnedIds)
    : { data: [] };
  const flagged = new Set(
    (reports ?? [])
      .filter((r) => {
        const a = r.ai_analysis as StoredComparison | null;
        return !!a && "overall" in a && a.overall === "possible_damage" && !a.owner_decision;
      })
      .map((r) => r.booking_id),
  );
  const byStart = (a: { start_at: string }, b: { start_at: string }) => a.start_at.localeCompare(b.start_at);
  return {
    now,
    orgs: viewer.memberships.filter((m) => m.role === "owner"),
    needsReview: all.filter((b) => b.status === "pending_approval" && b.approver_role === "owner"),
    waitingForManager: all.filter((b) => b.status === "pending_approval" && b.approver_role === "manager"),
    pickupsToday: all.filter((b) => b.status === "approved" && new Date(b.start_at) < todayEnd).sort(byStart),
    upcomingPickups: all.filter((b) => b.status === "approved").sort(byStart),
    returnsDue: all
      .filter((b) => (b.status === "checked_out" || b.status === "overdue") && new Date(b.end_at) < todayEnd)
      .sort((a, b) => a.end_at.localeCompare(b.end_at)),
    borrowed: all.filter((b) => b.status === "checked_out" || b.status === "overdue").sort((a, b) => a.end_at.localeCompare(b.end_at)),
    toClose: all.filter((b) => b.status === "returned"),
    aiFlags: all.filter((b) => flagged.has(b.id)),
    underReview: all.filter((b) => b.status === "under_review"),
    resources: resources ?? [],
    certificates: certificates ?? [],
  };
});

export type StaffBooking = NonNullable<Awaited<ReturnType<typeof ownerDesk>>["needsReview"]>[number];

export type QueueLevel = "critical" | "urgent" | "normal";
export interface QueueItem {
  id: string;
  level: QueueLevel;
  kind: "Incident" | "Damage" | "Approval" | "Exception" | "Escalated" | "Dispute" | "Penalty" | "Appeal" | "Overdue";
  title: string;
  detail: string;
  since: string;
  href: string;
}

const LEVEL_ORDER: Record<QueueLevel, number> = { critical: 0, urgent: 1, normal: 2 };

// Manager decision queue (PRD 12): critical → urgent → normal, oldest first within each level.
export const managerQueue = cache(async (viewer: SessionViewer) => {
  const supabase = await createClient();
  const now = await appNow();
  const ids = orgIds(viewer, "manager");
  const soon = new Date(now.getTime() + 24 * 3_600_000);

  const [{ data: approvals }, { data: cases }, { data: penalties }, { data: incidents }, { data: overdue }, { data: outOfService }] = await Promise.all([
    supabase
      .from("bookings")
      .select(STAFF_BOOKING_FIELDS)
      .in("resources.org_id", ids)
      .eq("status", "pending_approval")
      .order("created_at"),
    supabase
      .from("damage_cases")
      .select("id, booking_id, severity, status, description, created_at, response_deadline, reported_by, assigned_to, bookings!inner(id, profiles!bookings_user_id_fkey(full_name), resources!inner(name, org_id, organizations(name)))")
      .in("bookings.resources.org_id", ids)
      .neq("status", "decided")
      .order("created_at"),
    supabase
      .from("penalties")
      .select("id, booking_id, kind, status, proposed_amount, created_at, profiles!penalties_user_id_fkey(full_name), bookings!inner(resources!inner(name, org_id))")
      .in("bookings.resources.org_id", ids)
      .in("status", ["proposed", "appealed"])
      .order("created_at"),
    supabase
      .from("incidents")
      .select("id, severity, status, description, location, created_at, occurred_at, booking_id, actions, evidence, resources!inner(id, name, status, org_id, organizations(name))")
      .in("resources.org_id", ids)
      .neq("status", "closed")
      .order("created_at"),
    // Overdue 6 h+ reaches the Manager; 24 h+ is flagged urgent (PRD 10).
    supabase
      .from("bookings")
      .select(STAFF_BOOKING_FIELDS)
      .in("resources.org_id", ids)
      .eq("status", "overdue")
      .gte("escalation_level", 2)
      .order("end_at"),
    // Unsafe or under maintenance: restoring is a separate, deliberate step (PRD 11).
    supabase.from("resources").select("id, name, status, updated_at, organizations(name)").in("org_id", ids).neq("status", "active").order("updated_at"),
  ]);

  const items: QueueItem[] = [];
  for (const b of overdue ?? [])
    items.push({
      id: `overdue-${b.id}`,
      level: b.escalation_level >= 3 ? "urgent" : "normal",
      kind: "Overdue",
      title: `${b.resources.name} · not returned`,
      detail: `${b.profiles?.full_name ?? "Student"} · was due ${formatDateTime(new Date(b.end_at))}`,
      since: b.end_at,
      href: `/manager/bookings/${b.id}`,
    });
  for (const i of incidents ?? [])
    items.push({
      id: `incident-${i.id}`,
      level: "critical",
      kind: "Incident",
      title: `${i.resources.name} · safety incident`,
      detail: `${i.severity} severity · ${i.status} · ${i.description}`,
      since: i.created_at,
      href: `/manager/cases#incident-${i.id}`,
    });
  for (const c of cases ?? []) {
    const reporter = c.reported_by === viewer.id;
    const major = c.severity !== "minor";
    items.push({
      id: `damage-${c.id}`,
      level: major ? "critical" : c.status === "ready_for_decision" ? "urgent" : "normal",
      kind: c.status === "ready_for_decision" ? "Dispute" : "Damage",
      title: `${c.bookings.resources.name} · ${c.severity} damage`,
      detail: `${c.bookings.profiles?.full_name ?? "Student"} · ${c.status.replaceAll("_", " ")}${reporter ? " · you filed this, another Manager decides" : ""}`,
      since: c.created_at,
      href: `/manager/bookings/${c.booking_id}`,
    });
  }
  for (const b of approvals ?? []) {
    if (b.approver_role !== "manager" && b.escalation_level < 1) continue;
    const escalated = b.escalation_level >= 1;
    const urgent = escalated || new Date(b.start_at) < soon;
    items.push({
      id: `booking-${b.id}`,
      level: urgent ? "urgent" : "normal",
      kind: escalated ? "Escalated" : b.is_exception ? "Exception" : "Approval",
      title: `${b.resources.name}${b.is_exception ? " · exception request" : ""}`,
      detail: `${b.profiles?.full_name ?? "Student"} · ${b.resources.organizations?.name ?? ""}`,
      since: b.created_at,
      href: `/manager/bookings/${b.id}`,
    });
  }
  for (const p of penalties ?? [])
    items.push({
      id: `penalty-${p.id}`,
      level: p.status === "appealed" ? "urgent" : "normal",
      kind: p.status === "appealed" ? "Appeal" : "Penalty",
      title: `${p.bookings.resources.name} · ${p.kind.replace("_", "-")} penalty`,
      detail: `${p.profiles?.full_name ?? "Student"} · ${p.proposed_amount} credits proposed`,
      since: p.created_at,
      href: `/manager/bookings/${p.booking_id}`,
    });

  items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.since.localeCompare(b.since));
  return { now, items, incidents: incidents ?? [], cases: cases ?? [], penalties: penalties ?? [], outOfService: outOfService ?? [] };
});

// Department overview (PRD 12): recorded use per resource and week over the last 6 weeks.
const BOOKED = new Set(["approved", "checked_out", "overdue", "returned", "under_review", "completed", "no_show"]);
const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

export async function insights(ids: string[]) {
  const supabase = await createClient();
  const now = await appNow();
  const since = new Date(now.getTime() - 42 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [{ data: resources }, { data: bookings }, { data: windows }, { count: ownerAbsent }] = await Promise.all([
    supabase.from("resources").select("id, name, category, status, quantity, estimated_current_usage, org_id, organizations(name)").in("org_id", ids).order("name"),
    supabase
      .from("bookings")
      .select("id, status, start_at, end_at, picked_up_at, returned_at, user_id, resource_id, profiles!bookings_user_id_fkey(full_name), resources!inner(org_id)")
      .in("resources.org_id", ids)
      .gte("start_at", since.toISOString()),
    supabase.from("availability_windows").select("resource_id, start_time, end_time, resources!inner(org_id)").in("resources.org_id", ids),
    // "Owner not present" is logged against the organisation, never as a student strike (PRD 10).
    supabase
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("action", "OWNER_NOT_PRESENT")
      .in("org_id", ids)
      .gte("created_at", since30.toISOString()),
  ]);
  const rows = bookings ?? [];
  const hoursOf = (b: (typeof rows)[number]) => (b.picked_up_at && b.returned_at ? hoursBetween(b.picked_up_at, b.returned_at) : 0);
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const hours = rows.filter((b) => b.picked_up_at && new Date(b.picked_up_at) >= start && new Date(b.picked_up_at) < end).reduce((s, b) => s + hoursOf(b), 0);
    return { start, hours: Math.round(hours) };
  });
  const last30 = rows.filter((b) => new Date(b.start_at) >= since30);
  // ponytail: open hours ignore blackouts; good enough for a utilisation ratio.
  const weeklyOpen = new Map<string, number>();
  for (const w of windows ?? []) weeklyOpen.set(w.resource_id, (weeklyOpen.get(w.resource_id) ?? 0) + hoursBetween(`2000-01-01T${w.start_time}Z`, `2000-01-01T${w.end_time}Z`));
  const perResource = (resources ?? []).map((r) => {
    const mine = last30.filter((b) => b.resource_id === r.id);
    const hours = Math.round(mine.reduce((s, b) => s + hoursOf(b), 0));
    const available = Math.round(((weeklyOpen.get(r.id) ?? 0) * 30 * r.quantity) / 7);
    return {
      ...r,
      hours,
      booked: Math.round(mine.filter((b) => BOOKED.has(b.status)).reduce((s, b) => s + hoursBetween(b.start_at, b.end_at), 0)),
      available,
      utilisation: available ? Math.round((hours / available) * 100) : null,
      bookings: mine.filter((b) => b.status === "completed").length,
      noShows: mine.filter((b) => b.status === "no_show").length,
    };
  });
  const completed = last30.filter((b) => b.status === "completed");
  const onTime = completed.filter((b) => b.returned_at && new Date(b.returned_at) <= new Date(b.end_at)).length;

  // Booking distribution across students and repeated no-shows (PRD 12).
  const perStudent = new Map<string, { name: string; booked: number; noShows: number }>();
  for (const b of last30) {
    const p = perStudent.get(b.user_id) ?? { name: b.profiles?.full_name ?? "Student", booked: 0, noShows: 0 };
    if (BOOKED.has(b.status)) p.booked++;
    if (b.status === "no_show") p.noShows++;
    perStudent.set(b.user_id, p);
  }
  const students = [...perStudent.values()].filter((p) => p.booked > 0).sort((a, b) => b.booked - a.booked);
  const totalBooked = students.reduce((s, p) => s + p.booked, 0);
  const top = Math.max(1, Math.ceil(students.length / 5));
  return {
    now,
    weeks,
    perResource: perResource.sort((a, b) => b.hours - a.hours),
    hours30: perResource.reduce((s, r) => s + r.hours, 0),
    onTimeRate: completed.length ? Math.round((onTime / completed.length) * 100) : null,
    noShows: last30.filter((b) => b.status === "no_show").length,
    overdue: rows.filter((b) => b.status === "overdue").length,
    borrowedNow: rows.filter((b) => b.status === "checked_out" || b.status === "overdue").length,
    students: new Set(completed.map((b) => b.user_id)).size,
    ownerNotPresent: ownerAbsent ?? 0,
    noShowsByWeekday: [0, 1, 2, 3, 4, 5, 6].map(
      (d) => last30.filter((b) => b.status === "no_show" && Number(formatInTimeZone(new Date(b.start_at), APP_TIMEZONE, "i")) % 7 === d).length,
    ),
    repeatNoShows: [...perStudent.values()].filter((p) => p.noShows >= 2).sort((a, b) => b.noShows - a.noShows),
    distribution: {
      students: students.length,
      bookings: totalBooked,
      topCount: top,
      topShare: totalBooked ? Math.round((students.slice(0, top).reduce((s, p) => s + p.booked, 0) / totalBooked) * 100) : null,
    },
  };
}

export const orgInsights = cache((viewer: SessionViewer) => insights(orgIds(viewer, "manager")));

// The signed-in user's inbox: unread count plus the latest few for the bell (PRD 13).
export const inbox = cache(async () => {
  const supabase = await createClient();
  const [{ count }, { data }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase
      .from("notifications")
      .select("id, title, body, link, urgent, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return { unread: count ?? 0, latest: data ?? [] };
});

// Admin action queue (PRD 12): verifications, emergency credits, escalations, high-severity incidents.
export const adminQueue = cache(async () => {
  const supabase = await createClient();
  const [{ data: verifications }, { data: emergency }, { data: escalated }, { count: highIncidents }, { data: cases }, { data: incidents }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, department, year, roll_number, id_proof_path, verification_submitted_at")
      .eq("status", "pending_verification")
      .not("verification_submitted_at", "is", null)
      .order("verification_submitted_at"),
    supabase
      .from("emergency_credit_requests")
      .select("id, amount, reason, urgency, created_at, profiles!emergency_credit_requests_user_id_fkey(full_name)")
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("bookings")
      .select("id, escalated_at, created_at, profiles!bookings_user_id_fkey(full_name), resources(name, organizations(name))")
      .eq("status", "pending_approval")
      .gte("escalation_level", 2)
      .order("created_at"),
    supabase
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .eq("severity", "high")
      .neq("status", "closed"),
    // Damage cases assigned to an Admin: conflict of interest (PRD 3, 11).
    supabase
      .from("damage_cases")
      .select("id, booking_id, severity, status, description, created_at, response_deadline, assigned_to, profiles!damage_cases_assigned_to_fkey!inner(is_admin), bookings!inner(profiles!bookings_user_id_fkey(full_name), resources!inner(name, organizations(name)))")
      .eq("profiles.is_admin", true)
      .neq("status", "decided")
      .order("created_at"),
    supabase
      .from("incidents")
      .select("id, severity, status, description, location, created_at, occurred_at, booking_id, actions, evidence, resources!inner(id, name, status, org_id, organizations(name))")
      .neq("status", "closed")
      .order("created_at"),
  ]);
  return {
    verifications: verifications ?? [],
    emergency: emergency ?? [],
    escalated: escalated ?? [],
    escalations: escalated?.length ?? 0,
    highIncidents: highIncidents ?? 0,
    cases: cases ?? [],
    incidents: incidents ?? [],
  };
});

// Audit log filters (PRD 12): one parser for the page and the CSV export, read through RLS.
export const AUDIT_FILTERS = ["actor", "user", "resource", "org", "action", "from", "to", "version"] as const;
export type AuditFilters = Partial<Record<(typeof AUDIT_FILTERS)[number], string>>;

export function auditFilters(get: (k: string) => string | null | undefined): AuditFilters {
  const out: AuditFilters = {};
  for (const k of AUDIT_FILTERS) {
    const v = get(k)?.trim().slice(0, 100);
    if (v) out[k] = v;
  }
  return out;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function auditSearch(f: AuditFilters, limit: number) {
  const { data, error } = await (await createClient()).rpc("audit_search", {
    p_actor: f.actor ?? null,
    p_user: f.user ?? null,
    p_resource: f.resource && UUID.test(f.resource) ? f.resource : null,
    p_org: f.org && UUID.test(f.org) ? f.org : null,
    p_action: f.action?.replaceAll(" ", "_").replace(/[\\%_]/g, "\\$&") ?? null, // literal match, not LIKE wildcards
    p_from: f.from && DAY.test(f.from) ? istInstant(f.from, "00:00").toISOString() : null,
    p_to: f.to && DAY.test(f.to) ? addDays(istInstant(f.to, "00:00"), 1).toISOString() : null,
    p_policy_version: Number.isInteger(Number(f.version)) && f.version ? Number(f.version) : null,
    p_limit: limit,
  });
  if (error) throw new Error(`audit_search failed: ${error.message}`);
  return data ?? [];
}

// "My decisions" (PRD 12): the Manager's own decision counts, for self-review, never as a score.
export const myDecisions = cache(async (viewer: SessionViewer) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_events")
    .select("action, entity_id, metadata, created_at")
    .eq("actor_id", viewer.id)
    .eq("actor_role", "manager")
    .in("action", ["BOOKING_APPROVE", "BOOKING_REJECT", "BOOKING_DECIDE_DISPUTE", "PENALTY_DECIDED", "MANAGER_OVERRIDE"])
    .order("created_at", { ascending: false });
  const events = data ?? [];
  const of = (action: string) => events.filter((e) => e.action === action);
  const penalties = of("PENALTY_DECIDED").map((e) => e.metadata as { final?: number; proposed?: number });
  // Average over the latest 100 approve/reject decisions (keeps the id list short).
  const decided = events.filter((e) => e.action === "BOOKING_APPROVE" || e.action === "BOOKING_REJECT").slice(0, 100);
  const { data: requested } = decided.length
    ? await supabase.from("bookings").select("id, created_at").in("id", decided.map((e) => e.entity_id))
    : { data: [] };
  const createdAt = new Map((requested ?? []).map((b) => [b.id, b.created_at]));
  const waits = decided.flatMap((e) => (createdAt.has(e.entity_id) ? [hoursBetween(createdAt.get(e.entity_id)!, e.created_at)] : []));
  return {
    approvals: of("BOOKING_APPROVE").length,
    rejections: of("BOOKING_REJECT").length,
    disputes: of("BOOKING_DECIDE_DISPUTE").length,
    penaltiesConfirmed: penalties.filter((p) => p.final === p.proposed).length,
    penaltiesReduced: penalties.filter((p) => p.final !== p.proposed && p.final !== 0).length,
    penaltiesWaived: penalties.filter((p) => p.final === 0).length,
    overrides: of("MANAGER_OVERRIDE").length,
    avgHoursToDecide: waits.length ? Math.round((waits.reduce((s, h) => s + h, 0) / waits.length) * 10) / 10 : null,
  };
});
