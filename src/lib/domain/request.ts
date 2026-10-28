// Where a new request lands (PRD 5 "new" transitions, PRD 8 allocation modes, PRD 10 approval routing).
import type { BookingEvent } from "../contracts/booking";
import type { AllocationMode, ApprovalMode } from "../contracts/resource";
import type { EligibilityCheck } from "./eligibility";

export interface SubmissionPlan {
  event: Extract<BookingEvent, "submit_auto" | "submit_approval" | "submit_waitlist" | "submit_batch">;
  approverRole: "owner" | "manager";
  isException: boolean;
}

export type PlanResult = { ok: true; plan: SubmissionPlan } | { ok: false; error: string };

export function planSubmission(
  checks: readonly EligibilityCheck[],
  r: { approval_mode: ApprovalMode; allocation_mode: AllocationMode; manager_approval: boolean },
  opts: { cutoffPassed: boolean },
): PlanResult {
  // Ineligible requests are never submitted (PRD 7); a taken slot means the waitlist instead.
  const block = checks.find((c) => c.result === "block" && c.key !== "slot_available");
  if (block) return { ok: false, error: block.reason };
  const slotTaken = checks.some((c) => c.key === "slot_available" && c.result === "block");
  const reviews = checks.filter((c) => c.result === "review");
  const isException = reviews.some((c) => c.key !== "no_show_strikes");
  const approverRole = r.approval_mode === "manager" || r.manager_approval || reviews.length > 0 ? "manager" : "owner";

  // Batch requests wait for the cutoff; after it, leftover capacity is first-come-first-served (PRD 8).
  const event: SubmissionPlan["event"] =
    r.allocation_mode === "batch" && !opts.cutoffPassed
      ? "submit_batch"
      : slotTaken
        ? "submit_waitlist"
        : r.approval_mode === "auto" && reviews.length === 0 && !r.manager_approval
          ? "submit_auto"
          : "submit_approval";
  return { ok: true, plan: { event, approverRole, isException } };
}
