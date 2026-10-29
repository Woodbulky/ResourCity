// Display formatting in campus time (IST). Pure: callers pass the simulated now where it matters.
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE, istDate } from "@/lib/domain/time";

const f = (d: Date, pattern: string) => formatInTimeZone(d, APP_TIMEZONE, pattern);
const clock = (d: Date) => f(d, "h:mm a").toLowerCase();

// "Fri 30 Oct · 5:00 pm–6:00 pm", or both ends in full when the slot spans days.
export function formatSlot(start: string | Date, end: string | Date): string {
  const s = new Date(start);
  const e = new Date(end);
  if (istDate(s) === istDate(e)) return `${f(s, "EEE d MMM")} · ${clock(s)}–${clock(e)}`;
  return `${f(s, "d MMM, ")}${clock(s)} → ${f(e, "d MMM, ")}${clock(e)}`;
}

export const formatDay = (d: string | Date) => f(new Date(d), "EEE d MMM");
export const formatTime = (d: string | Date) => clock(new Date(d));
export const formatWhen = (d: string | Date) => `${f(new Date(d), "d MMM")} · ${clock(new Date(d))}`;

// "Today", "Tomorrow" or the weekday, relative to the simulated clock.
export function relativeDay(d: string | Date, now: Date): string {
  const day = istDate(new Date(d));
  if (day === istDate(now)) return "Today";
  if (day === istDate(new Date(now.getTime() + 86_400_000))) return "Tomorrow";
  if (day === istDate(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return formatDay(d);
}

export const longDate = (now: Date) => f(now, "EEEE, d MMMM");

export const words = (s: string) => s.toLowerCase().replaceAll("_", " ");
export const sentence = (s: string) => {
  const w = words(s);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

export const rateLabel = (rate: number, unit: "hour" | "day") => (rate === 0 ? "Free" : `${rate} credits / ${unit}`);

// Shown wherever an incident is reported or handled (PRD 11).
export const EMERGENCY_NOTICE = "In an emergency, follow DVIT emergency procedures and call 112. ResourCity is not an emergency service.";
