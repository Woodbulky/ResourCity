// Shapes of the jsonb rule columns on resources (PRD Section 6).
import { z } from "zod";
import type { Database } from "./database";

export type ResourceCategory = Database["public"]["Enums"]["resource_category"];
export type ApprovalMode = Database["public"]["Enums"]["approval_mode"];
export type AllocationMode = Database["public"]["Enums"]["allocation_mode"];
export type RateUnit = Database["public"]["Enums"]["rate_unit"];
export type ResourceStatus = Database["public"]["Enums"]["resource_status"];

// Breaking a rule either blocks the request or sends it for review (an exception request).
export const ruleMode = z.enum(["block", "review"]);
export type RuleMode = z.infer<typeof ruleMode>;

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

// resources.eligibility
export const eligibilitySchema = z.object({
  required_badge_type_ids: z.array(z.string().uuid()).default([]),
  departments: z.array(z.string()).default([]), // empty = open to all
  years: z.array(z.number().int().min(1).max(4)).default([]),
  org_members_only: z.boolean().default(false),
  modes: z
    .object({ badges: ruleMode.default("block"), restricted: ruleMode.default("block") })
    .default({ badges: "block", restricted: "block" }),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

// resources.booking_rules
export const bookingRulesSchema = z.object({
  max_duration_minutes: z.number().int().positive().nullable().default(null),
  max_active_bookings: z.number().int().positive().nullable().default(null),
  cancellation_window_minutes: z.number().int().nonnegative().nullable().default(null),
  peak_window: z.object({ start: hhmm, end: hhmm }).nullable().default(null), // IST
  return_confirmation: z.boolean().default(false),
  condition_record_required: z.boolean().default(false),
  modes: z
    .object({
      max_duration: ruleMode.default("review"),
      max_active: ruleMode.default("block"),
      credits: ruleMode.default("block"),
    })
    .default({ max_duration: "review", max_active: "block", credits: "block" }),
});
export type BookingRules = z.infer<typeof bookingRulesSchema>;

// resources.safety_rules
export const safetyRulesSchema = z.object({
  manager_approval: z.boolean().default(false),
  supervision_required: z.boolean().default(false),
  ppe: z.array(z.string()).default([]),
  safety_notes: z.string().default(""),
});
export type SafetyRules = z.infer<typeof safetyRulesSchema>;

// resources.checklist: named items plus guided photo shots, used at check-out and return.
export const checklistSchema = z.object({
  items: z.array(z.string()).default([]),
  shots: z.array(z.string()).default([]),
});
export type Checklist = z.infer<typeof checklistSchema>;
