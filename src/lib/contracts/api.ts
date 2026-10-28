// API shapes shared by server and UI.
import { z } from "zod";
import { BOOKING_EVENTS } from "./booking";

export const actorRoleSchema = z.enum(["student", "owner", "manager", "admin", "system"]);

// Fields transitionBooking() may set alongside a status change (computed in src/lib/domain).
export const transitionPayloadSchema = z
  .object({
    unit_id: z.string().uuid(),
    grace_minutes: z.number().int().nonnegative(),
    waitlist_position: z.number().int().positive(),
    offer_expires_at: z.string().datetime({ offset: true }),
    priority_score: z.number(),
    score_breakdown: z.record(z.string(), z.unknown()),
    allocation_rule: z.string(),
    charge: z.number().int().nonnegative(),
    forfeit: z.boolean(),
  })
  .partial()
  .catchall(z.unknown()); // extra context (e.g. suspension id) lands in audit metadata

export const transitionBookingInputSchema = z.object({
  bookingId: z.string().uuid(),
  event: z.enum(BOOKING_EVENTS),
  actor: z.object({ id: z.string().uuid().nullable(), role: actorRoleSchema }),
  reason: z.string().trim().max(1000).optional(),
  payload: transitionPayloadSchema.default({}),
});
export type TransitionBookingInput = z.input<typeof transitionBookingInputSchema>;
