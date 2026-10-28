// Pickup grace period (PRD 10): grace = min(max(percent × duration, min), max).
import { addMinutes } from "date-fns";
import type { PolicyValues } from "../contracts/policy";
import { minutesBetween } from "./time";

export function graceMinutes(start: Date, end: Date, grace: PolicyValues["grace"]): number {
  const raw = grace.percent * minutesBetween(start, end);
  return Math.round(Math.min(Math.max(raw, grace.min_minutes), grace.max_minutes));
}

export const graceEndsAt = (start: Date, graceMins: number) => addMinutes(start, graceMins);
