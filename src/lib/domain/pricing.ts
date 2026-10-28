// Credit pricing (PRD 9): cost = base rate × duration units × demand multiplier.
import type { RateUnit } from "../contracts/resource";
import { minutesBetween, minutesInDailyWindow } from "./time";

export interface PricedResource {
  base_rate: number; // credits per rate_unit; 0 = free
  rate_unit: RateUnit;
  peak_multiplier: number;
  peak_window: { start: string; end: string } | null; // IST, from booking_rules
}

// Hourly resources pay the peak multiplier only for the minutes inside the peak window.
// Daily resources are charged per started day and have no peak pricing.
export function creditCost(r: PricedResource, start: Date, end: Date): number {
  const minutes = Math.max(0, minutesBetween(start, end));
  if (r.base_rate === 0 || minutes === 0) return 0;
  if (r.rate_unit === "day") return r.base_rate * Math.ceil(minutes / (24 * 60));
  const peak = r.peak_window ? minutesInDailyWindow(start, end, r.peak_window) : 0;
  const hours = (minutes - peak) / 60 + (peak / 60) * r.peak_multiplier;
  return Math.ceil(r.base_rate * hours - 1e-9);
}

// On return: charge min(actual, booked) duration, so returning early saves credits.
export function returnCharge(r: PricedResource, start: Date, end: Date, returnedAt: Date): number {
  const actualEnd = returnedAt < end ? (returnedAt < start ? start : returnedAt) : end;
  return creditCost(r, start, actualEnd);
}
