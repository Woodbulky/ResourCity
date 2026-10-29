"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { addDays, addMinutes } from "date-fns";
import { z } from "zod";
import { extractCertificate, parseSearch } from "../ai/features";
import { AI_UNAVAILABLE } from "../ai/client";
import { OVERRIDE_CATEGORIES, type SearchFilters, type StoredComparison } from "../contracts/ai";
import type { ActionResult } from "../contracts/api";
import type { Json } from "../contracts/database";
import { istDate, istInstant } from "../domain/time";
import { friendlyError } from "./booking";
import { actualCharge, markAiFlags } from "./charges";
import { createServiceClient } from "./supabase";
import { getViewer, type SessionViewer } from "./viewer";

// Phase 5 server actions (PRD 8, 11, 14): damage cases, penalties and appeals, overrides,
// incidents, resource status and badges. Each checks the caller, then one SQL function checks again,
// writes the audit event and queues notifications in one transaction.

const str = (form: FormData, k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string).trim() : "");
const int = (form: FormData, k: string) => (str(form, k) ? Number(str(form, k)) : null);
const SESSION_ENDED: ActionResult = { ok: false, error: "Your session has ended. Sign in again." };
const NOT_STAFF: ActionResult = { ok: false, error: "You are not staff of this organisation." };
const json = <T,>(form: FormData, k: string, fallback: T): T => {
  try {
    return JSON.parse(str(form, k) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const result = (error: { message: string } | null, message: string) => (error ? { ok: false as const, error: friendlyError(error.message) } : done(message));

// The role the viewer acts in for an organisation: what they asked for, if they hold it.
function roleIn(viewer: SessionViewer, orgId: string | undefined, as: string): "owner" | "manager" | "admin" | null {
  if (as === "admin") return viewer.isAdmin ? "admin" : null;
  if (as !== "owner" && as !== "manager") return null;
  return viewer.memberships.some((m) => m.orgId === orgId && m.role === as) ? as : null;
}
async function bookingOrg(bookingId: string) {
  const { data } = await createServiceClient().from("bookings").select("resources(org_id)").eq("id", bookingId).maybeSingle();
  return data?.resources?.org_id;
}

// ---------------------------------------------------------------------------- AI search (PRD 7, 14)
export type SearchOutcome =
  | { ok: true; filters: SearchFilters; slot: { start_date: string; start_time: string; end_date: string; end_time: string } | null; free: Record<string, number> | null }
  | { ok: false; error: string };

// The AI only parses; the database decides: free units per resource for the parsed slot.
export async function searchResources(query: string): Promise<SearchOutcome> {
  if (!(await getViewer())) return { ok: false, error: "Your session has ended. Sign in again." };
  const q = query.trim();
  if (q.length < 3) return { ok: false, error: "Type a few words." };
  const parsed = await parseSearch(q);
  if (!parsed.ok) return { ok: false, error: AI_UNAVAILABLE };
  const f = parsed.data;
  if (!f.date || !f.start_time || (!f.end_time && !f.duration_minutes)) return { ok: true, filters: f, slot: null, free: null };

  const start = istInstant(f.date, f.start_time);
  let end = f.end_time ? istInstant(f.date, f.end_time) : addMinutes(start, f.duration_minutes!);
  if (end <= start) end = addDays(end, 1);
  const hm = (d: Date) => d.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
  const db = createServiceClient();
  const { data: resources } = await db.from("resources").select("id").eq("status", "active");
  const counts = await Promise.all(
    (resources ?? []).map(async (r) => {
      const { data } = await db.rpc("free_units", { p_resource: r.id, p_start: start.toISOString(), p_end: end.toISOString() });
      return [r.id, Number(data ?? 0)] as const;
    }),
  );
  return {
    ok: true,
    filters: f,
    slot: { start_date: istDate(start), start_time: hm(start), end_date: istDate(end), end_time: hm(end) },
    free: Object.fromEntries(counts),
  };
}

// ---------------------------------------------------------------------------- damage (PRD 11)
const SEVERITIES = ["minor", "major", "unusable"] as const;

export async function raiseDamage(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const role = roleIn(viewer, await bookingOrg(bookingId), str(form, "as"));
  if (role !== "owner" && role !== "manager") return NOT_STAFF;
  const severity = z.enum(SEVERITIES).safeParse(str(form, "severity"));
  if (!severity.success) return { ok: false, error: "Choose a severity." };

  // Only the AI flags the Owner ticked go on the case, as "AI suggestion confirmed by the Owner".
  const picked = new Set(json<string[]>(form, "flags", []));
  const { data: rep } = await createServiceClient().from("condition_reports").select("ai_analysis").eq("booking_id", bookingId).eq("phase", "return").maybeSingle();
  const ai = rep?.ai_analysis as StoredComparison | null;
  const flags = ai && !("status" in ai)
    ? ai.shots.flatMap((s, i) => s.differences.flatMap((d, j) => (picked.has(`${i}:${j}`) ? [{ shot: s.shot, ...d, source: "ai", model: ai.model }] : [])))
    : [];

  const { error } = await createServiceClient().rpc("report_damage", {
    p_booking: bookingId, p_actor: viewer.id, p_role: role, p_description: str(form, "description"),
    p_severity: severity.data, p_ai_flags: flags.length ? (flags as Json) : null,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  await markAiFlags(bookingId, flags.length ? "confirmed" : "dismissed");
  return done("Damage reported. The student can respond, then a Manager who did not file it decides.");
}

export async function respondDamage(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const { error } = await createServiceClient().rpc("respond_damage", {
    p_user: viewer.id, p_case: str(form, "caseId"), p_text: str(form, "text").slice(0, 2000),
    p_photos: json<string[]>(form, "photos", []).slice(0, 6),
  });
  return result(error, "Response sent. The Manager reads it next to the photos before deciding.");
}

const OUTCOMES = ["dismissed", "warning", "credit_deduction", "restriction", "insufficient_evidence", "more_evidence"] as const;

export async function decideDamage(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const db = createServiceClient();
  const { data: c } = await db.from("damage_cases").select("booking_id").eq("id", str(form, "caseId")).maybeSingle();
  if (!c) return { ok: false, error: "Case not found." };
  const role = roleIn(viewer, await bookingOrg(c.booking_id), str(form, "as"));
  if (role !== "manager" && role !== "admin") return { ok: false, error: "Only a Manager decides damage cases." };
  const outcome = z.enum(OUTCOMES).safeParse(str(form, "outcome"));
  if (!outcome.success) return { ok: false, error: "Choose an outcome." };
  const settled = outcome.data === "more_evidence" ? { charge: 0 } : await actualCharge(c.booking_id);
  if (!settled) return { ok: false, error: "The return is not recorded." };

  const { error } = await db.rpc("decide_damage", {
    p_case: str(form, "caseId"), p_actor: viewer.id, p_role: role, p_outcome: outcome.data, p_reason: str(form, "reason"),
    p_credits: outcome.data === "credit_deduction" ? int(form, "credits") : null,
    p_restriction_days: outcome.data === "restriction" ? int(form, "days") : null,
    p_charge: settled.charge, p_maintenance: str(form, "maintenance") === "on",
  });
  return result(error, outcome.data === "more_evidence" ? "The student has a new response window." : "Decided. The booking is completed and the student is told why.");
}

// ---------------------------------------------------------------------------- penalties (PRD 11)
export async function decidePenalty(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const decision = z.enum(["confirm", "reduce", "waive"]).safeParse(str(form, "decision"));
  if (!decision.success) return { ok: false, error: "Confirm, reduce or waive." };
  const { error } = await createServiceClient().rpc("decide_penalty", {
    p_penalty: str(form, "penaltyId"), p_actor: viewer.id, p_decision: decision.data,
    p_amount: decision.data === "reduce" ? int(form, "amount") : null, p_reason: str(form, "reason"),
  });
  return result(error, "Penalty decided. The student is notified with your reason.");
}

export async function appealPenalty(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const { error } = await createServiceClient().rpc("appeal_penalty", {
    p_user: viewer.id, p_penalty: str(form, "penaltyId"), p_text: str(form, "text").slice(0, 1000),
  });
  return result(error, "Sent to the Manager, who reads it before deciding.");
}

// ---------------------------------------------------------------------------- overrides (PRD 8)
export async function overrideAllocation(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const category = z.enum(OVERRIDE_CATEGORIES).safeParse(str(form, "category"));
  if (!category.success) return { ok: false, error: "Choose the reason category." };
  const { error } = await createServiceClient().rpc("override_allocation", {
    p_actor: viewer.id, p_chosen: str(form, "bookingId"), p_category: category.data, p_reason: str(form, "reason").slice(0, 500),
  });
  return result(error, "Priority given. The student is offered the place; the override is in the audit log.");
}

// ---------------------------------------------------------------------------- incidents (PRD 11)
export async function reportIncident(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const severity = z.enum(["low", "medium", "high"]).safeParse(str(form, "severity"));
  if (!severity.success) return { ok: false, error: "Choose a severity." };
  const date = str(form, "date");
  const time = str(form, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "When did it happen?" };
  const { error } = await createServiceClient().rpc("report_incident", {
    p_user: viewer.id, p_resource: str(form, "resourceId"), p_booking: str(form, "bookingId") || null,
    p_occurred_at: istInstant(date, time).toISOString(), p_location: str(form, "location").slice(0, 200),
    p_description: str(form, "description").slice(0, 2000), p_severity: severity.data,
    p_evidence: json<string[]>(form, "evidence", []).slice(0, 6),
  });
  return result(error, "Incident reported. The organisation's Managers have been alerted.");
}

export async function updateIncident(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const status = z.enum(["investigating", "closed"]).safeParse(str(form, "status"));
  if (!status.success) return { ok: false, error: "Choose investigating or closed." };
  const role = str(form, "as") === "admin" && viewer.isAdmin ? "admin" : "manager";
  const { error } = await createServiceClient().rpc("update_incident", {
    p_incident: str(form, "incidentId"), p_actor: viewer.id, p_role: role, p_status: status.data,
    p_note: str(form, "note").slice(0, 2000), p_restrict_days: int(form, "restrictDays"),
  });
  return result(error, status.data === "closed" ? "Incident closed. The resource stays as it is until someone confirms it is safe." : "Actions recorded.");
}

export async function changeResourceStatus(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const resourceId = str(form, "resourceId");
  const { data: r } = await createServiceClient().from("resources").select("org_id").eq("id", resourceId).maybeSingle();
  const role = roleIn(viewer, r?.org_id, str(form, "as"));
  if (!role) return NOT_STAFF;
  const status = z.enum(["active", "paused", "under_maintenance", "unsafe"]).safeParse(str(form, "status"));
  if (!status.success) return { ok: false, error: "Choose a status." };
  const { data, error } = await createServiceClient().rpc("set_resource_status", {
    p_resource: resourceId, p_actor: viewer.id, p_role: role, p_status: status.data, p_reason: str(form, "reason").slice(0, 500),
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(status.data === "active" ? "Back in service and bookable." : `Done. ${data ?? 0} upcoming booking(s) cancelled with your reason and credits released.`);
}

// ---------------------------------------------------------------------------- badges (PRD 6, 14)
export async function submitBadge(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const { data, error } = await createServiceClient().rpc("submit_badge", {
    p_user: viewer.id, p_badge_type: str(form, "badgeTypeId"), p_path: json<string[]>(form, "paths", [])[0] ?? "",
  });
  if (error || !data) return { ok: false, error: friendlyError(error?.message) };
  after(() => extractCertificate(data.id)); // an AI reading of the certificate, shown to the verifier
  return done("Certificate sent. The issuing organisation verifies it.");
}

export async function decideBadge(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const approve = str(form, "decision") === "approve";
  const as = str(form, "as") === "manager" ? "manager" : "owner";
  const { error } = await createServiceClient().rpc("decide_badge", {
    p_badge: str(form, "badgeId"), p_actor: viewer.id, p_role: as, p_approve: approve,
    p_issued: str(form, "issued") || null, p_reason: str(form, "reason").slice(0, 500),
  });
  return result(error, approve ? "Badge verified." : "Certificate rejected. The student sees your reason.");
}
