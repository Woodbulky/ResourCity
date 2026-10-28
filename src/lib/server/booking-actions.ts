"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "../contracts/api";
import type { Json } from "../contracts/database";
import { bookingRulesSchema } from "../contracts/resource";
import { returnCharge } from "../domain/pricing";
import { friendlyError, transitionBooking } from "./booking";
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
  const { data: b } = await createServiceClient()
    .from("bookings")
    .select("start_at, end_at, returned_at, credit_hold, resources(base_rate, rate_unit, peak_multiplier, booking_rules)")
    .eq("id", bookingId)
    .single();
  if (!b?.resources || !b.returned_at) return { ok: false, error: "Record the return first." };
  const rules = bookingRulesSchema.safeParse(b.resources.booking_rules).data ?? bookingRulesSchema.parse({});
  const charge = Math.min(
    b.credit_hold,
    returnCharge(
      { base_rate: b.resources.base_rate, rate_unit: b.resources.rate_unit, peak_multiplier: Number(b.resources.peak_multiplier), peak_window: rules.peak_window },
      new Date(b.start_at),
      new Date(b.end_at),
      new Date(b.returned_at),
    ),
  );
  const result = await transitionBooking({ bookingId, event: "complete", actor: { id: viewer.id, role }, payload: { charge } });
  return result.ok ? done(`Completed. ${charge} credits charged, ${b.credit_hold - charge} released.`) : result;
}
