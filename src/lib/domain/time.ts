// Calendar helpers in campus time (IST). Business "now" always comes from app_now()/appNow().
import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const APP_TIMEZONE = "Asia/Kolkata";

export const minutesBetween = (start: Date, end: Date) => (end.getTime() - start.getTime()) / 60_000;

// IST calendar date (yyyy-MM-dd) of an instant.
export const istDate = (d: Date) => formatInTimeZone(d, APP_TIMEZONE, "yyyy-MM-dd");

// The instant of an IST wall-clock time on an IST date.
export const istInstant = (date: string, hhmm: string) => fromZonedTime(`${date}T${hhmm}:00`, APP_TIMEZONE);

// Monday 00:00 IST of the week containing `now` (weekly credit reset, PRD 9).
export function weekStart(now: Date): Date {
  const isoWeekday = Number(formatInTimeZone(now, APP_TIMEZONE, "i")); // 1 = Monday
  return addDays(istInstant(istDate(now), "00:00"), 1 - isoWeekday);
}

export const formatShortDate = (d: Date) => formatInTimeZone(d, APP_TIMEZONE, "d MMM");

// Minutes of [start, end) that fall inside a daily IST window such as 17:00–21:00.
export function minutesInDailyWindow(start: Date, end: Date, window: { start: string; end: string }): number {
  let total = 0;
  for (let day = istDate(addMinutes(start, -24 * 60)); ; ) {
    const ws = istInstant(day, window.start);
    if (ws >= end) break;
    const we = istInstant(day, window.end);
    const overlap = Math.min(end.getTime(), we.getTime()) - Math.max(start.getTime(), ws.getTime());
    if (overlap > 0) total += overlap / 60_000;
    day = istDate(addDays(ws, 1));
  }
  return total;
}
