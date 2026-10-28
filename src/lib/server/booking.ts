import "server-only";
import { transitionBookingInputSchema, type TransitionBookingInput } from "../contracts/api";
import type { Database } from "../contracts/database";
import { checkTransition } from "../domain/transitions";
import { createServiceClient } from "./supabase";

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type TransitionResult = { ok: true; booking: Booking } | { ok: false; error: string };

// The only way a booking changes status (PRD 0, 5). Validates the input and the transition here
// for a clear message, then public.transition_booking() re-validates, writes the audit event,
// moves credits and queues notifications in one database transaction.
export async function transitionBooking(input: TransitionBookingInput): Promise<TransitionResult> {
  const parsed = transitionBookingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const { bookingId, event, actor, reason, payload } = parsed.data;

  const supabase = createServiceClient();
  const { data: current, error: readError } = await supabase
    .from("bookings")
    .select("status")
    .eq("id", bookingId)
    .single();
  if (readError || !current) return { ok: false, error: "Booking not found." };

  const check = checkTransition(current.status, event, actor.role, reason);
  if (!check.ok) return check;

  const { data, error } = await supabase.rpc("transition_booking", {
    p_booking_id: bookingId,
    p_event: event,
    p_actor_id: actor.id as string, // null for system actions; the generated type omits nullability
    p_actor_role: actor.role,
    p_reason: reason,
    p_payload: payload as Database["public"]["Functions"]["transition_booking"]["Args"]["p_payload"],
  });
  if (error || !data) return { ok: false, error: friendlyError(error?.message) };
  return { ok: true, booking: data as Booking };
}

// Database errors are raised as "<code>: <detail>"; show the detail, map the guard to plain words.
export function friendlyError(message = "Unknown error"): string {
  if (message.includes("bookings_no_double_booking")) return "That slot was just taken. Pick another time.";
  const detail = message.split(": ").slice(1).join(": ");
  return detail || message;
}
