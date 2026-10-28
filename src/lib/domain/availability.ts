// Bookable hours and closures (PRD 6, 7). Pickup and return both happen while the resource is
// open, so the start and the end must each fall inside an availability window on their IST day.
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE, istDate, istInstant } from "./time";

export interface AvailabilityWindow {
  weekday: number; // 0 = Sunday, IST
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
}
export interface Blackout {
  starts_at: Date;
  ends_at: Date;
  reason: string;
}

const insideWindow = (t: Date, windows: readonly AvailabilityWindow[], isEnd: boolean) => {
  const day = istDate(t);
  const weekday = Number(formatInTimeZone(t, APP_TIMEZONE, "i")) % 7; // ISO 7 = Sunday → 0
  return windows.some((w) => {
    if (w.weekday !== weekday) return false;
    const ws = istInstant(day, w.start_time.slice(0, 5));
    const we = istInstant(day, w.end_time.slice(0, 5));
    return isEnd ? t > ws && t <= we : t >= ws && t < we;
  });
};

// Why this slot cannot be booked at all (not a waitlist case), or null when it can.
export function slotProblem(
  start: Date,
  end: Date,
  windows: readonly AvailabilityWindow[],
  blackouts: readonly Blackout[],
): string | null {
  if (end <= start) return "The end must be after the start.";
  if (windows.length && (!insideWindow(start, windows, false) || !insideWindow(end, windows, true)))
    return "Outside bookable hours. Pick a start and end within the hours listed.";
  const closed = blackouts.find((b) => b.starts_at < end && b.ends_at > start);
  return closed ? `Closed then: ${closed.reason}.` : null;
}
