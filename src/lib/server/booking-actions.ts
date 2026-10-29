"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../contracts/api";
import type { Json } from "../contracts/database";
import { bookingRulesSchema, safetyRulesSchema } from "../contracts/resource";
import { slotProblem } from "../domain/availability";
import { compareCondition } from "../ai/features";
import { creditCost } from "../domain/pricing";
import { istInstant, minutesBetween } from "../domain/time";
import { friendlyError, transitionBooking } from "./booking";
import { actualCharge, markAiFlags } from "./charges";
import { appNow } from "./clock";
import { checkQr, evaluateRequest, parseSlot } from "./requests";
import { createClient, createServiceClient } from "./supabase";
import { getViewer, type SessionViewer } from "./viewer";

const str = (form: FormData, k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string).trim() : "");
const SESSION_ENDED: ActionResult = { ok: false, error: "Your session has ended. Sign in again." };

// The role a staff member acts in for this booking: what they asked for, if they hold it in the
// resource's organisation (transition_booking() checks again).
async function staffRole(viewer: SessionViewer, bookingId: string, as: string): Promise<"owner" | "manager" | null> {
  const { data } = await (await createClient()).from("bookings").select("resources(org_id)").eq("id", bookingId).maybeSingle();
  const org = data?.resources?.org_id;
  const holds = (role: "owner" | "manager") => viewer.memberships.some((m) => m.orgId === org && m.role === role);
  if (as === "manager" && holds("manager")) return "manager";
  if (as === "owner" && holds("owner")) return "owner";
  return null;
}

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout"); // dashboards, sidebar counts and the bell all read booking state
  return { ok: true, message };
};

// ---------------------------------------------------------------------------- student (PRD 7, 10)
const PURPOSES = ["academic_deadline", "project_research", "club_activity", "personal"] as const;

export async function submitRequest(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  if (viewer.status !== "verified") return { ok: false, error: "Only verified students can request bookings." };
  const slot = parseSlot({
    startDate: str(form, "startDate"), startTime: str(form, "startTime"), endDate: str(form, "endDate"), endTime: str(form, "endTime"),
  });
  if (!slot) return { ok: false, error: "Pick a start and end time." };
  const purpose = z.enum(PURPOSES).safeParse(str(form, "purposeCategory"));
  if (!purpose.success) return { ok: false, error: "Choose a purpose." };
  const purposeText = str(form, "purposeText").slice(0, 500);
  if (purposeText.length < 3) return { ok: false, error: "Describe what you need it for in a few words." };

  const ev = await evaluateRequest(viewer, str(form, "resourceId"), slot);
  if (!ev) return { ok: false, error: "Resource not found." };
  if (ev.problem) return { ok: false, error: ev.problem };
  if (!ev.plan.ok) return { ok: false, error: ev.plan.error };
  const { plan } = ev.plan;
  const exceptionReason = str(form, "exceptionReason").slice(0, 500);
  if (plan.isException && exceptionReason.length < 3)
    return { ok: false, error: "Explain why you need an exception; the Manager reads it." };

  const { data, error } = await createServiceClient().rpc("submit_booking", {
    p_user: viewer.id,
    p_resource: ev.resource.id,
    p_start: slot.start.toISOString(),
    p_end: slot.end.toISOString(),
    p_event: plan.event,
    p_fields: {
      purpose_category: purpose.data,
      purpose_text: purposeText,
      is_exception: plan.isException,
      exception_reason: plan.isException ? exceptionReason : null,
      approver_role: plan.approverRole,
      credit_hold: ev.cost,
      grace_minutes: ev.grace,
      cutoff_at: ev.cutoffAt?.toISOString() ?? null,
      eligibility_snapshot: ev.checks as unknown as Json,
    },
  });
  if (error || !data) return { ok: false, error: friendlyError(error?.message) };
  revalidatePath("/", "layout");
  redirect(`/student/bookings/${(data as { id: string }).id}`);
}

// "I can't make it" (PRD 10): free until the slot starts, no strike. Pending requests withdraw anytime.
export async function cancelBooking(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const reason = str(form, "reason");
  if (reason.length < 3) return { ok: false, error: "Give a short reason." };
  const bookingId = str(form, "bookingId");
  const [{ data: b }, now] = await Promise.all([
    (await createClient()).from("bookings").select("status, start_at").eq("id", bookingId).maybeSingle(),
    appNow(),
  ]);
  if (b?.status === "approved" && new Date(b.start_at) <= now)
    return { ok: false, error: "The slot has started, so it can no longer be cancelled here." };
  const result = await transitionBooking({ bookingId, event: "cancel", actor: { id: viewer.id, role: "student" }, reason });
  return result.ok ? done("Cancelled. Any held credits are back in your wallet.") : result;
}

export async function acknowledgeCondition(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const phase = str(form, "phase") === "return" ? "return" : "checkout";
  const { error } = await createServiceClient().rpc("acknowledge_condition", {
    p_user: viewer.id, p_booking: str(form, "bookingId"), p_phase: phase,
  });
  return error ? { ok: false, error: friendlyError(error.message) } : done("Condition record acknowledged.");
}

export async function doorCheckin(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const { data, error } = await createServiceClient().rpc("door_checkin", { p_user: viewer.id, p_token: str(form, "token") });
  if (error || !data) return { ok: false, error: friendlyError(error?.message) };
  revalidatePath("/", "layout");
  redirect(`/student/bookings/${(data as { id: string }).id}`);
}

// ---------------------------------------------------------------------------- staff (PRD 10)
const DECISIONS = { approve: "Approved.", reject: "Rejected. The student sees your reason.", waitlist: "Moved to the waitlist." } as const;

export async function decideRequest(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const decision = str(form, "decision") as keyof typeof DECISIONS;
  if (!(decision in DECISIONS)) return { ok: false, error: "Choose a decision." };
  const role = await staffRole(viewer, bookingId, str(form, "as"));
  if (!role) return { ok: false, error: "You are not staff of this resource's organisation." };
  const reason = str(form, "reason") || undefined;
  if (decision !== "approve" && !reason) return { ok: false, error: "A reason is required; the student will see it." };

  let payload = {};
  if (decision === "waitlist") {
    const { data: b } = await createServiceClient().from("bookings").select("resource_id, start_at, end_at").eq("id", bookingId).single();
    const { count } = await createServiceClient()
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("resource_id", b?.resource_id ?? "")
      .eq("status", "waitlisted")
      .lt("start_at", b?.end_at ?? "")
      .gt("end_at", b?.start_at ?? "");
    payload = { waitlist_position: (count ?? 0) + 1 };
  }
  const result = await transitionBooking({ bookingId, event: decision, actor: { id: viewer.id, role }, reason, payload });
  return result.ok ? done(DECISIONS[decision]) : result;
}

const conditionSchema = z.object({
  checklist: z.array(z.object({ item: z.string(), ok: z.boolean(), note: z.string().max(300).optional() })),
  photos: z.array(z.object({ shot: z.string(), path: z.string() })).min(3, "Take at least 3 guided photos."),
});

// Handover (checkout) or return: the Owner signs the condition record; the booking moves in the
// same transaction. Pickup needs a valid scan of the student's signed QR (identity confirmed).
export async function recordCondition(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const phase = str(form, "phase") === "return" ? "return" : "checkout";
  const role = await staffRole(viewer, bookingId, str(form, "as"));
  if (!role) return { ok: false, error: "You are not staff of this resource's organisation." };
  if (phase === "checkout") {
    const qr = await checkQr(str(form, "token"));
    if (!qr.ok) return qr;
    if (qr.payload.b !== bookingId || qr.payload.p !== "pickup") return { ok: false, error: "That QR belongs to a different booking." };
  }
  let parsed;
  try {
    parsed = conditionSchema.safeParse({ checklist: JSON.parse(str(form, "checklist") || "[]"), photos: JSON.parse(str(form, "photos") || "[]") });
  } catch {
    return { ok: false, error: "The checklist could not be read. Try again." };
  }
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const missingNote = parsed.data.checklist.find((c) => !c.ok && !c.note?.trim());
  if (missingNote) return { ok: false, error: `Describe the issue with “${missingNote.item}”.` };

  const { error } = await createServiceClient().rpc("record_condition", {
    p_booking: bookingId,
    p_actor: viewer.id,
    p_actor_role: role,
    p_phase: phase,
    p_checklist: parsed.data.checklist,
    p_photos: parsed.data.photos,
    p_notes: str(form, "notes"),
    p_supervisor: str(form, "supervisor"),
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  if (phase === "return") after(() => compareCondition(bookingId)); // AI flags appear on the booking page when ready
  revalidatePath("/", "layout");
  redirect(`/${role}/bookings/${bookingId}`);
}

// Return OK (PRD 9, 10): charge min(actual, booked) duration, release the rest.
export async function completeReturn(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const role = await staffRole(viewer, bookingId, str(form, "as"));
  if (!role) return { ok: false, error: "You are not staff of this resource's organisation." };
  const settled = await actualCharge(bookingId);
  if (!settled) return { ok: false, error: "Record the return first." };
  const { charge, hold } = settled;
  const result = await transitionBooking({ bookingId, event: "complete", actor: { id: viewer.id, role }, payload: { charge } });
  if (!result.ok) return result;
  await markAiFlags(bookingId, "dismissed"); // Return OK: the Owner saw the AI flags and found no damage
  return done(`Completed. ${charge} credits charged, ${hold - charge} released.`);
}

// ---------------------------------------------------------------------------- Phase 4: offers, absence, extensions, emergency credits
export async function acceptOffer(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const result = await transitionBooking({ bookingId: str(form, "bookingId"), event: "accept", actor: { id: viewer.id, role: "student" } });
  return result.ok ? done("Slot accepted. Your credits are on hold and the pickup QR is ready.") : result;
}

// "Owner not present" (PRD 10): no strike, logged against the organisation.
export async function reportOwnerAbsent(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const { error } = await createServiceClient().rpc("report_owner_absent", { p_user: viewer.id, p_booking: str(form, "bookingId") });
  return error ? { ok: false, error: friendlyError(error.message) } : done("Reported. No strike for you, and your credits are back.");
}

const EXT_FIELDS =
  "start_at, end_at, user_id, resource_id, resources(approval_mode, safety_rules, booking_rules, base_rate, rate_unit, peak_multiplier)" as const;

// Extra credits for moving the end (PRD 10): the cost of the longer slot minus what is already held.
function extraCost(b: { start_at: string; end_at: string; resources: { base_rate: number; rate_unit: "hour" | "day"; peak_multiplier: number; booking_rules: unknown } | null }, newEnd: Date) {
  const r = b.resources!;
  const rules = bookingRulesSchema.safeParse(r.booking_rules).data ?? bookingRulesSchema.parse({});
  const priced = { base_rate: r.base_rate, rate_unit: r.rate_unit, peak_multiplier: Number(r.peak_multiplier), peak_window: rules.peak_window };
  const start = new Date(b.start_at);
  return Math.max(0, creditCost(priced, start, newEnd) - creditCost(priced, start, new Date(b.end_at)));
}

export async function requestExtension(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const date = str(form, "endDate");
  const time = str(form, "endTime");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { ok: false, error: "Pick the new end date and time." };
  const newEnd = istInstant(date, time);
  const reason = str(form, "reason");
  if (reason.length < 3) return { ok: false, error: "Say why you need more time." };

  const supabase = await createClient();
  const { data: b } = await supabase.from("bookings").select(EXT_FIELDS).eq("id", bookingId).maybeSingle();
  if (!b?.resources || b.user_id !== viewer.id) return { ok: false, error: "Booking not found." };
  const rules = bookingRulesSchema.safeParse(b.resources.booking_rules).data ?? bookingRulesSchema.parse({});
  const safety = safetyRulesSchema.safeParse(b.resources.safety_rules).data ?? safetyRulesSchema.parse({});
  const asked = minutesBetween(new Date(b.start_at), newEnd);
  const overMax = rules.max_duration_minutes !== null && asked > rules.max_duration_minutes;
  if (overMax && rules.modes.max_duration === "block")
    return { ok: false, error: `That makes the booking longer than the ${(rules.max_duration_minutes ?? 0) / 60} h maximum.` };
  const [{ data: windows }, { data: blackouts }] = await Promise.all([
    supabase.from("availability_windows").select("weekday, start_time, end_time").eq("resource_id", b.resource_id),
    supabase.from("blackouts").select("starts_at, ends_at, reason").eq("resource_id", b.resource_id),
  ]);
  const problem = slotProblem(new Date(b.start_at), newEnd, windows ?? [],
    (blackouts ?? []).map((x) => ({ starts_at: new Date(x.starts_at), ends_at: new Date(x.ends_at), reason: x.reason })));
  if (problem) return { ok: false, error: problem };

  // Auto-approve resources extend at once when within limits; otherwise the Owner (or Manager) decides.
  const auto = b.resources.approval_mode === "auto" && !safety.manager_approval && !overMax;
  const { data, error } = await createServiceClient().rpc("request_extension", {
    p_user: viewer.id, p_booking: bookingId, p_new_end: newEnd.toISOString(), p_reason: reason,
    p_note: str(form, "note"), p_extra: extraCost(b, newEnd), p_auto: auto,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(data.status === "approved" ? "Extended. The new end time is in force." : "Extension requested. The original end time stays until it is approved.");
}

export async function decideExtension(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const bookingId = str(form, "bookingId");
  const role = await staffRole(viewer, bookingId, str(form, "as"));
  if (!role) return { ok: false, error: "You are not staff of this resource's organisation." };
  const approve = str(form, "decision") === "approve";
  const reason = str(form, "reason");
  if (!approve && reason.length < 3) return { ok: false, error: "A reason is required; the student will see it." };
  const db = createServiceClient();
  const [{ data: b }, { data: x }] = await Promise.all([
    db.from("bookings").select(EXT_FIELDS).eq("id", bookingId).single(),
    db.from("extension_requests").select("id, new_end_at").eq("id", str(form, "extensionId")).eq("booking_id", bookingId).single(),
  ]);
  if (!b || !x) return { ok: false, error: "Extension request not found." };
  const { error } = await db.rpc("decide_extension", {
    p_ext: x.id, p_actor: viewer.id, p_role: role, p_approve: approve, p_reason: reason,
    p_extra: approve ? extraCost(b, new Date(x.new_end_at)) : 0,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(approve ? "Extension approved." : "Extension declined.");
}

// Emergency credits (PRD 9): one grant per academic year, decided by an Admin.
export async function requestEmergencyCredits(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return SESSION_ENDED;
  const amount = Number(str(form, "amount"));
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, error: "Enter a whole number of credits." };
  const { error } = await createServiceClient().rpc("request_emergency_credits", {
    p_user: viewer.id, p_booking: str(form, "bookingId") || null, p_amount: amount,
    p_reason: str(form, "reason"), p_urgency: str(form, "urgency"),
  });
  return error ? { ok: false, error: friendlyError(error.message) } : done("Sent to the Admin. You will be notified of the decision.");
}
