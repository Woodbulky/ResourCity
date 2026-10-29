// API shapes shared by server and UI.
import { z } from "zod";
import { BOOKING_EVENTS } from "./booking";

export const actorRoleSchema = z.enum(["student", "owner", "manager", "admin", "system"]);

// Fields transitionBooking() may set alongside a status change (computed in src/lib/domain).
export const transitionPayloadSchema = z
  .object({
    unit_id: z.guid(),
    grace_minutes: z.number().int().nonnegative(),
    waitlist_position: z.number().int().positive(),
    offer_expires_at: z.string().datetime({ offset: true }),
    priority_score: z.number(),
    score_breakdown: z.record(z.string(), z.unknown()),
    allocation_rule: z.string(),
    charge: z.number().int().nonnegative(),
    forfeit: z.boolean(),
  })
  .partial()
  .catchall(z.unknown()); // extra context (e.g. suspension id) lands in audit metadata

export const transitionBookingInputSchema = z.object({
  bookingId: z.guid(),
  event: z.enum(BOOKING_EVENTS),
  actor: z.object({ id: z.guid().nullable(), role: actorRoleSchema }),
  reason: z.string().trim().max(1000).optional(),
  payload: transitionPayloadSchema.default({}),
});
export type TransitionBookingInput = z.input<typeof transitionBookingInputSchema>;

// Department names match resource eligibility restrictions exactly (PRD 6, 7).
export const DEPARTMENTS = [
  "Computer Engineering", "IT", "ECE", "Mechanical", "Civil", "Electrical", "Chemical", "Administration",
] as const;

// Onboarding and verification resubmission (PRD 4).
export const onboardingInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  department: z.enum(DEPARTMENTS, { error: "Choose your department." }),
  year: z.coerce.number().int().min(1, "Choose your year.").max(4),
  rollNumber: z.string().trim().min(2, "Enter your roll number.").max(30),
  phone: z.string().trim().max(20).regex(/^[+\d\s-]*$/, "Use digits only.").optional(),
  idProofPath: z.string().min(1, "Upload a photo of your college ID card."),
});
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;

export const verificationDecisionSchema = z
  .object({
    userId: z.guid(),
    approve: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.approve || !!d.reason, { message: "Give a reason for the rejection.", path: ["reason"] });

export const membershipChangeSchema = z.object({
  userId: z.guid(),
  orgId: z.guid(),
  role: z.enum(["owner", "manager"]),
  grant: z.boolean(),
  reason: z.string().trim().min(3, "A reason is required.").max(500),
  replacementUserId: z.guid().optional(),
});

// One-click demo logins (PRD 4), demo mode only.
export const DEMO_ACCOUNTS = {
  student: { label: "Student — Riya", email: "riya@dvit.edu.in" },
  owner: { label: "Owner — Photography Club", email: "photo.lead@dvit.edu.in" },
  manager: { label: "Manager — Prof. Mehta", email: "prof.mehta@dvit.edu.in" },
  // Second Manager: decides cases the Photography Club Owner files (demo script step 8, conflict of interest).
  manager2: { label: "Manager — Prof. Kulkarni", email: "prof.kulkarni@dvit.edu.in" },
  admin: { label: "Admin", email: "admin@dvit.edu.in" },
} as const;
export type DemoAccount = keyof typeof DEMO_ACCOUNTS;

// Result of a form server action.
export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
