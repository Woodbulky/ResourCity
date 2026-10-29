// AI output shapes (PRD 14). Every model reply is parsed with these; anything else is a failure
// and the workflow continues manually. Stored outputs add the model name and a timestamp.
import { z } from "zod";
import { Constants } from "./database";

const RESOURCE_CATEGORIES = Constants.public.Enums.resource_category;

// A field the model got wrong becomes null instead of failing the whole reply.
const opt = <T extends z.ZodType>(s: T) => s.nullish().catch(null).transform((v) => v ?? null);
const conf = z.coerce.number().min(0).max(1);

export const searchFiltersSchema = z.object({
  category: z.enum(RESOURCE_CATEGORIES).nullish().catch(null).transform((v) => v ?? null),
  keywords: z.array(z.string().trim().min(1).max(40)).max(8).catch([]),
  date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  start_time: opt(z.string().regex(/^\d{2}:\d{2}$/)),
  end_time: opt(z.string().regex(/^\d{2}:\d{2}$/)),
  duration_minutes: opt(z.coerce.number().int().positive().max(14 * 1440)),
  quantity: opt(z.coerce.number().int().positive().max(50)),
  capacity: opt(z.coerce.number().int().positive().max(2000)),
  needs_clarification: z.boolean().catch(false),
  clarification_question: opt(z.string().max(200)),
});
export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const conditionComparisonSchema = z.object({
  shots: z.array(
    z.object({
      shot: z.string(),
      comparable: z.boolean(),
      differences: z.array(z.object({ description: z.string().max(300), location: z.string().max(120).catch(""), confidence: conf })).max(10),
    }),
  ),
  missing_items: z.array(z.string()).catch([]),
  overall: z.enum(["no_change", "possible_damage", "inconclusive"]),
});
export type ConditionComparison = z.infer<typeof conditionComparisonSchema>;

// What condition_reports.ai_analysis holds: the comparison, or why there is none, plus the
// Owner's decision on the flags ("confirmed" when raised as damage, "dismissed" on Return OK).
export type StoredComparison =
  | (ConditionComparison & { model: string; at: string; owner_decision?: "confirmed" | "dismissed" | null })
  | { status: "unavailable"; error: string; at: string };

export const certificateExtractionSchema = z.object({
  name_on_certificate: opt(z.string().max(120)),
  course_title: opt(z.string().max(160)),
  issuer: opt(z.string().max(160)),
  issue_date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  expiry_date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  matches_student_name: z.boolean().catch(false),
  confidence: conf,
});
export type CertificateExtraction = z.infer<typeof certificateExtractionSchema>;
export type StoredExtraction =
  | (CertificateExtraction & { model: string; at: string })
  | { status: "unavailable"; error: string; at: string };

// Reason categories a Manager picks when overriding a recommendation (PRD 8). The affected student
// sees only the category.
export const OVERRIDE_CATEGORIES = [
  "Academic deadline",
  "Institutional priority",
  "Accessibility need",
  "Safety or supervision",
  "Other",
] as const;
