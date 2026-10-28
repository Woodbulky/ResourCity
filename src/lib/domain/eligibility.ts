// Eligibility engine (PRD 7): one pure function returning every check with a reason and a fix.
import type { Database } from "../contracts/database";
import type { ApprovalMode, BookingRules, Eligibility } from "../contracts/resource";
import { formatShortDate, minutesBetween } from "./time";

type AccountStatus = Database["public"]["Enums"]["account_status"];
type BadgeStatus = Database["public"]["Enums"]["badge_status"];

export type CheckResult = "pass" | "review" | "block";
export type CheckKey =
  | "account_verified"
  | "not_suspended"
  | "badges"
  | "restricted_access"
  | "max_active"
  | "max_duration"
  | "credits"
  | "no_show_strikes"
  | "slot_available";

export interface EligibilityCheck {
  key: CheckKey;
  result: CheckResult;
  reason: string;
  fix: string | null;
}

export interface EligibilityStudent {
  status: AccountStatus;
  status_reason: string | null;
  suspended_until: Date | null;
  department: string | null;
  year: number | null;
  memberOfOrg: boolean;
  orgRestriction: { until: Date; reason: string } | null; // active restriction in this resource's org
  badges: readonly { badge_type_id: string; status: BadgeStatus; expires_at: Date | null }[];
}

export interface EligibilityResource {
  eligibility: Eligibility;
  booking_rules: BookingRules;
  approval_mode: ApprovalMode;
  badgeNames: Record<string, string>; // badge_type_id → display name
}

export interface EligibilityContext {
  now: Date;
  activeBookingsHere: number; // the student's active bookings for this resource
  availableCredits: number;
  cost: number;
  noShowStrikes: number;
  strikeLimit: number;
  strikesClearOn: Date | null;
  slotFree: boolean | null; // null = availability could not be checked
  takenLabel?: string; // e.g. "Taken 2–4 pm."
}

const pass = (key: CheckKey, reason = ""): EligibilityCheck => ({ key, result: "pass", reason, fix: null });

export function checkEligibility(
  student: EligibilityStudent,
  resource: EligibilityResource,
  slot: { start: Date; end: Date },
  ctx: EligibilityContext,
): EligibilityCheck[] {
  const { eligibility: el, booking_rules: rules } = resource;
  const checks: EligibilityCheck[] = [];

  checks.push(
    student.status === "pending_verification"
      ? { key: "account_verified", result: "block", reason: "Your account is awaiting verification.", fix: "/pending" }
      : pass("account_verified"),
  );

  const suspendedUntil = student.status === "suspended" ? student.suspended_until : null;
  if (student.status === "suspended" || student.orgRestriction) {
    const until = suspendedUntil ?? student.orgRestriction?.until ?? null;
    const why = (student.status === "suspended" ? student.status_reason : student.orgRestriction?.reason) ?? "";
    checks.push({
      key: "not_suspended",
      result: "block",
      reason: `Booking privileges suspended${until ? ` until ${formatShortDate(until)}` : ""}${why ? `: ${why}` : ""}.`,
      fix: "Contact Manager",
    });
  } else checks.push(pass("not_suspended"));

  const badgeProblems: string[] = [];
  let badgeFix: string | null = null;
  for (const id of el.required_badge_type_ids) {
    const name = resource.badgeNames[id] ?? "Required training";
    const held = student.badges.filter((b) => b.badge_type_id === id);
    const valid = held.find((b) => b.status === "verified" && (!b.expires_at || b.expires_at > ctx.now));
    if (valid) continue;
    const expired = held.find((b) => b.expires_at && b.expires_at <= ctx.now && b.status !== "rejected");
    if (held.some((b) => b.status === "pending")) {
      badgeProblems.push(`${name} certificate is under review.`);
      badgeFix ??= "Wait for the Owner to verify your certificate";
    } else if (expired?.expires_at) {
      badgeProblems.push(`${name} expired on ${formatShortDate(expired.expires_at)}.`);
      badgeFix = "Upload a renewed certificate";
    } else {
      badgeProblems.push(`${name} missing.`);
      badgeFix = `Upload your ${name} certificate`;
    }
  }
  if (badgeProblems.length) {
    checks.push({ key: "badges", result: el.modes.badges, reason: badgeProblems.join(" "), fix: badgeFix });
  } else if (el.required_badge_type_ids.length) {
    const names = el.required_badge_type_ids.map((id) => resource.badgeNames[id] ?? "Training");
    checks.push(pass("badges", `${names.join(", ")} verified.`));
  } else checks.push(pass("badges"));

  const restricted: string[] = [];
  if (el.departments.length && !el.departments.includes(student.department ?? ""))
    restricted.push(`Open to ${el.departments.join(", ")} students only.`);
  if (el.years.length && !el.years.includes(student.year ?? 0))
    restricted.push(`Open to year ${el.years.join(", ")} students only.`);
  if (el.org_members_only && !student.memberOfOrg) restricted.push("Open to members of this organisation only.");
  checks.push(
    restricted.length
      ? { key: "restricted_access", result: el.modes.restricted, reason: restricted.join(" "), fix: null }
      : pass("restricted_access"),
  );

  const maxActive = rules.max_active_bookings;
  checks.push(
    maxActive !== null && ctx.activeBookingsHere >= maxActive
      ? {
          key: "max_active",
          result: rules.modes.max_active,
          reason: `You already hold ${ctx.activeBookingsHere} of ${maxActive} allowed bookings here.`,
          fix: "Return or cancel the existing booking",
        }
      : pass("max_active"),
  );

  const asked = minutesBetween(slot.start, slot.end);
  const maxDur = rules.max_duration_minutes;
  checks.push(
    maxDur !== null && asked > maxDur
      ? {
          key: "max_duration",
          result: rules.modes.max_duration,
          reason: `Max ${formatDuration(maxDur)}; you asked for ${formatDuration(asked)}.`,
          fix: rules.modes.max_duration === "review" ? "Shorten, or request an exception" : "Shorten the booking",
        }
      : pass("max_duration"),
  );

  checks.push(
    ctx.cost > ctx.availableCredits
      ? {
          key: "credits",
          result: rules.modes.credits,
          reason: `Needs ${ctx.cost} credits; you have ${Math.max(0, ctx.availableCredits)} available.`,
          fix: "Request emergency credits",
        }
      : pass("credits", ctx.cost === 0 ? "Free." : `${ctx.cost} credits.`),
  );

  checks.push(
    ctx.noShowStrikes >= ctx.strikeLimit
      ? {
          key: "no_show_strikes",
          result: "review",
          reason: `${ctx.noShowStrikes} no-shows in 30 days: requests need Manager review${
            ctx.strikesClearOn ? ` until ${formatShortDate(ctx.strikesClearOn)}` : ""
          }.`,
          fix: "Review path",
        }
      : pass("no_show_strikes"),
  );

  if (ctx.slotFree === null) {
    // Never show "Eligible" when a check could not be completed (PRD 7).
    checks.push({
      key: "slot_available",
      result: "block",
      reason: "Couldn't confirm availability.",
      fix: "Try again",
    });
  } else {
    checks.push(
      ctx.slotFree
        ? pass("slot_available")
        : {
            key: "slot_available",
            result: "block",
            reason: ctx.takenLabel ?? "That slot is taken.",
            fix: "Join waitlist, or see nearest free slots",
          },
    );
  }
  return checks;
}

export type CardState = "eligible" | "eligible_approval" | "action_required" | "not_eligible" | "unavailable";

// Blocks the student can fix themselves (upload, wait for verification, get credits).
const FIXABLE: readonly CheckKey[] = ["account_verified", "badges", "credits"];

export function cardState(checks: readonly EligibilityCheck[], approvalMode: ApprovalMode): CardState {
  const blocks = checks.filter((c) => c.result === "block");
  if (blocks.length === 0) {
    const needsReview = checks.some((c) => c.result === "review");
    return needsReview || approvalMode !== "auto" ? "eligible_approval" : "eligible";
  }
  if (blocks.some((c) => !FIXABLE.includes(c.key) && c.key !== "slot_available")) return "not_eligible";
  if (blocks.some((c) => FIXABLE.includes(c.key))) return "action_required";
  return "unavailable";
}

// A rule set to "review" turns submit into "Request exception" (PRD 7).
export const isExceptionRequest = (checks: readonly EligibilityCheck[]) =>
  checks.some((c) => c.result === "review" && c.key !== "no_show_strikes");

function formatDuration(minutes: number): string {
  if (minutes % 60 !== 0) return `${Math.round(minutes)} minutes`;
  const h = minutes / 60;
  return `${h} hour${h === 1 ? "" : "s"}`;
}
