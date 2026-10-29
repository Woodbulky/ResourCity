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
// Ids use z.guid(), not z.uuid(): Zod 4's uuid() rejects the seed's non-RFC variant ids
// (…-c000-…), and a failed parse here falls back to "no requirements" in every reader.
export const eligibilitySchema = z.object({
  required_badge_type_ids: z.array(z.guid()).default([]),
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

export type FormTemplate = Database["public"]["Enums"]["form_template"];
export type UsageEstimate = Database["public"]["Enums"]["usage_estimate"];

// Display category → listing form template (PRD 6). "other" lets the Owner pick the closest one.
export const CATEGORY_TEMPLATE: Record<ResourceCategory, FormTemplate | null> = {
  classroom: "space",
  seminar_hall: "space",
  meeting_room: "space",
  sports_ground: "space",
  lab: "lab",
  electronics: "portable",
  media: "portable",
  sports_equipment: "portable",
  machine: "machine",
  other: null,
};

const list = z.preprocess(
  (v) => (typeof v === "string" ? v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string().max(120)).max(30),
);
const lines = z.preprocess(
  (v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string().max(120)).max(30),
);
const optionalInt = (max: number) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(max).nullable());

// The Owner listing form (PRD 6). Rules carry their own block / review mode.
export const resourceInputSchema = z
  .object({
    id: z.guid().optional(),
    orgId: z.guid(),
    category: z.enum(["classroom", "seminar_hall", "meeting_room", "sports_ground", "lab", "electronics", "media", "sports_equipment", "machine", "other"]),
    template: z.enum(["space", "lab", "portable", "machine"]),
    name: z.string().trim().min(3, "Give the resource a name.").max(120),
    description: z.string().trim().max(2000),
    location: z.string().trim().min(2, "Say where it is.").max(200),
    quantity: z.coerce.number().int().min(1).max(50),
    approvalMode: z.enum(["auto", "owner", "manager"]),
    allocationMode: z.enum(["instant", "batch"]),
    cutoffHours: z.coerce.number().int().min(0).max(336),
    baseRate: z.coerce.number().int().min(0).max(1000),
    rateUnit: z.enum(["hour", "day"]),
    peakMultiplier: z.coerce.number().min(1).max(5),
    peakStart: z.string().regex(/^(\d{2}:\d{2})?$/),
    peakEnd: z.string().regex(/^(\d{2}:\d{2})?$/),
    replacementValue: optionalInt(10_000_000),
    usage: z.enum(["rarely", "weekly", "daily"]),
    weekdays: z.array(z.coerce.number().int().min(0).max(6)),
    openFrom: z.string().regex(/^(\d{2}:\d{2})?$/),
    openTo: z.string().regex(/^(\d{2}:\d{2})?$/),
    maxDurationHours: optionalInt(24 * 14),
    maxActive: optionalInt(20),
    maxDurationMode: ruleMode,
    maxActiveMode: ruleMode,
    creditsMode: ruleMode,
    badgeTypeIds: z.array(z.guid()),
    departments: z.array(z.string()),
    years: z.array(z.coerce.number().int().min(1).max(4)),
    orgMembersOnly: z.boolean(),
    badgesMode: ruleMode,
    restrictedMode: ruleMode,
    managerApproval: z.boolean(),
    supervisionRequired: z.boolean(),
    ppe: list,
    safetyNotes: z.string().trim().max(1000),
    capacity: optionalInt(10_000),
    features: list, // facilities, software, accessories or kit contents, by template
    checklistItems: lines,
    shots: lines,
  })
  .refine((d) => !d.weekdays.length || (d.openFrom && d.openTo && d.openTo > d.openFrom), {
    message: "Set opening hours with the closing time after the opening time.",
    path: ["openTo"],
  })
  .refine((d) => (!d.peakStart && !d.peakEnd) || (d.peakStart && d.peakEnd && d.peakEnd > d.peakStart), {
    message: "Give the peak window a start and a later end, or leave both empty.",
    path: ["peakEnd"],
  })
  .refine((d) => d.checklistItems.length > 0, { message: "Add at least one checklist item.", path: ["checklistItems"] });
export type ResourceInput = z.infer<typeof resourceInputSchema>;

// Which category_fields key the template's list field fills (PRD 6 template-specific fields).
export const TEMPLATE_FEATURES: Record<FormTemplate, { key: string; label: string; capacity: string | null }> = {
  space: { key: "facilities", label: "Facilities (projector, AC, mic…)", capacity: "Seating capacity" },
  lab: { key: "software", label: "Software or equipment available", capacity: "Number of stations" },
  portable: { key: "included_accessories", label: "Included accessories or kit contents", capacity: null },
  machine: { key: "safety_equipment", label: "Equipment and PPE provided", capacity: null },
};
