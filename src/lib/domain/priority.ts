// Batch allocation priority score, 100 points (PRD 8).
import type { Database } from "../contracts/database";
import type { PolicyValues } from "../contracts/policy";

export type PurposeCategory = Database["public"]["Enums"]["purpose_category"];

export const PURPOSE_POINTS: Record<PurposeCategory, number> = {
  academic_deadline: 15,
  project_research: 10,
  club_activity: 5,
  personal: 0,
};

export interface PriorityInput {
  completedHours: number; // h: completed hours in this category, last 30 days
  allocations: number; // a: successful allocations for this resource, last 30 days
  unsuccessful: number; // u: rejections or lost allocations, last 30 days
  purposeCategory: PurposeCategory;
  purposeVerified: boolean;
  autoApprove: boolean; // nobody verifies purpose on auto-approve resources
}

export interface ScoreBreakdown {
  usage: number; // of 40
  allocations: number; // of 25
  unsuccessful: number; // of 20
  purpose: number; // of 15
  total: number; // of 100
}

// A missing or zero cap falls back to the default, so we never divide by zero.
export function categoryCap(policy: PolicyValues, category: string) {
  const c = policy.category_caps[category];
  return {
    hours: c?.hours || policy.default_category_cap.hours || 20,
    allocations: c?.allocations || policy.default_category_cap.allocations || 4,
  };
}

export function priorityScore(input: PriorityInput, cap: { hours: number; allocations: number }): ScoreBreakdown {
  const usage = Math.round(40 * (1 - Math.min(input.completedHours, cap.hours) / cap.hours));
  const allocations = Math.round(25 * (1 - Math.min(input.allocations, cap.allocations) / cap.allocations));
  const unsuccessful = Math.round((20 * Math.min(input.unsuccessful, 3)) / 3);
  const purpose = input.purposeVerified && !input.autoApprove ? PURPOSE_POINTS[input.purposeCategory] : 0;
  return { usage, allocations, unsuccessful, purpose, total: usage + allocations + unsuccessful + purpose };
}

export interface RankableRequest {
  id: string;
  score: number;
  completedHours: number;
  createdAt: Date;
}

// Highest score first; ties go to fewer completed hours, then the earlier request.
export function rankRequests<T extends RankableRequest>(requests: readonly T[]): T[] {
  return [...requests].sort(
    (a, b) =>
      b.score - a.score || a.completedHours - b.completedHours || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export interface Slot {
  start: Date;
  end: Date;
}

const overlaps = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end;

// Batch fill (PRD 8 step 5): in rank order, a request fits while fewer than `units` claims
// (existing bookings plus requests already accepted) overlap it.
// ponytail: counts overlaps, not an interval colouring; exact when requests share one slot (the batch case).
export function fillCapacity<T extends Slot>(ranked: readonly T[], taken: readonly Slot[], units: number) {
  const accepted: T[] = [];
  const rest: T[] = [];
  for (const r of ranked) {
    const claims = [...taken, ...accepted].filter((c) => overlaps(c, r)).length;
    (claims < units ? accepted : rest).push(r);
  }
  return { accepted, rest };
}
