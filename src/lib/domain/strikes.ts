// No-show strikes (PRD 9, 10): computed, never stored. Count no_show bookings whose slot
// started within the rolling window by app_now().
import { subDays } from "date-fns";
import type { BookingStatus } from "../contracts/booking";
import type { PolicyValues } from "../contracts/policy";

export function noShowStrikes(
  bookings: readonly { status: BookingStatus; start_at: Date }[],
  now: Date,
  strikes: PolicyValues["strikes"],
): number {
  const since = subDays(now, strikes.window_days);
  return bookings.filter((b) => b.status === "no_show" && b.start_at >= since && b.start_at <= now).length;
}

// The no-show that goes past the limit (the 4th by default) forfeits the hold.
export const forfeitsHold = (strikesBefore: number, strikes: PolicyValues["strikes"]) =>
  strikesBefore + 1 > strikes.limit;

// At the limit, new requests need Manager review until the window clears.
export const needsStrikeReview = (current: number, strikes: PolicyValues["strikes"]) => current >= strikes.limit;
