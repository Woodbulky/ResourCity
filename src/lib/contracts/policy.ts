// Versioned global policy values (PRD Sections 9, 10, 12). Stored in policy_versions."values".
import { z } from "zod";

const categoryCap = z.object({
  hours: z.number().nonnegative(), // H_cap: completed hours in the category over 30 days
  allocations: z.number().nonnegative(), // A_cap: successful allocations over 30 days
});

export const policyValuesSchema = z.object({
  weekly_allowance: z.number().int().positive(),
  emergency_grant_cap: z.number().int().nonnegative(),
  category_caps: z.record(z.string(), categoryCap),
  default_category_cap: categoryCap,
  grace: z.object({
    percent: z.number().positive(), // share of the booking length
    min_minutes: z.number().int().positive(),
    max_minutes: z.number().int().positive(),
  }),
  strikes: z.object({ limit: z.number().int().positive(), window_days: z.number().int().positive() }),
  cancellation_window_minutes: z.number().int().nonnegative(), // 0 = free until slot start
  offer_windows: z.object({
    short_slot_max_minutes: z.number().int().positive(),
    short_minutes: z.number().int().positive(),
    long_minutes: z.number().int().positive(),
  }),
  escalation: z.object({
    owner_hours: z.number().positive(),
    owner_before_start_hours: z.number().positive(),
    manager_hours: z.number().positive(),
  }),
  dispute_response_hours: z.number().positive(),
  late_penalty_multiplier: z.number().nonnegative(), // × the resource rate for each late unit
});
export type PolicyValues = z.infer<typeof policyValuesSchema>;

export const DEFAULT_POLICY: PolicyValues = {
  weekly_allowance: 100,
  emergency_grant_cap: 50,
  category_caps: {},
  default_category_cap: { hours: 20, allocations: 4 },
  grace: { percent: 0.25, min_minutes: 15, max_minutes: 120 },
  strikes: { limit: 3, window_days: 30 },
  cancellation_window_minutes: 0,
  offer_windows: { short_slot_max_minutes: 120, short_minutes: 10, long_minutes: 60 },
  escalation: { owner_hours: 24, owner_before_start_hours: 2, manager_hours: 24 },
  dispute_response_hours: 48,
  late_penalty_multiplier: 2,
};
