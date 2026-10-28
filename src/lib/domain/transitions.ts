// Pure state-machine checks over the contract table (PRD 5). The database enforces the same
// rules in transition_booking(); this copy lets the UI and server fail fast with a clear message.
import {
  BOOKING_TRANSITIONS,
  type ActorRole,
  type BookingEvent,
  type BookingStatus,
  type BookingTransition,
} from "../contracts/booking";

export const findTransition = (from: BookingStatus | "new", event: BookingEvent): BookingTransition | undefined =>
  BOOKING_TRANSITIONS.find((t) => t.from === from && t.event === event);

export const eventsFrom = (from: BookingStatus | "new", actor: ActorRole) =>
  BOOKING_TRANSITIONS.filter((t) => t.from === from && t.actors.includes(actor)).map((t) => t.event);

export type TransitionCheck = { ok: true; transition: BookingTransition } | { ok: false; error: string };

export function checkTransition(
  from: BookingStatus | "new",
  event: BookingEvent,
  actor: ActorRole,
  reason?: string,
): TransitionCheck {
  const transition = findTransition(from, event);
  if (!transition) return { ok: false, error: `A ${from} booking cannot ${event}.` };
  if (!transition.actors.includes(actor)) return { ok: false, error: `A ${actor} cannot ${event} this booking.` };
  if (transition.reasonRequired && !reason?.trim()) return { ok: false, error: `A reason is required to ${event}.` };
  return { ok: true, transition };
}
