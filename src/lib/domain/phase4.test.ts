import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../contracts/policy";
import { diffMetadata, policyDiff } from "./policy";
import { fillCapacity, priorityScore, rankRequests } from "./priority";

const h = (n: number) => new Date(Date.UTC(2026, 10, 2, n));

describe("batch capacity fill", () => {
  const req = (id: string, s: number, e: number) => ({ id, start: h(s), end: h(e) });
  it("fills one unit with the top-ranked request and waitlists the rest in rank order", () => {
    const { accepted, rest } = fillCapacity([req("a", 10, 13), req("b", 10, 13), req("c", 10, 13)], [], 1);
    expect(accepted.map((r) => r.id)).toEqual(["a"]);
    expect(rest.map((r) => r.id)).toEqual(["b", "c"]);
  });
  it("counts existing bookings and lets non-overlapping requests through", () => {
    const { accepted } = fillCapacity([req("a", 10, 12), req("b", 12, 14), req("c", 11, 13)], [{ start: h(9), end: h(11) }], 2);
    expect(accepted.map((r) => r.id)).toEqual(["a", "b"]); // c overlaps the existing booking and a
  });
});

describe("batch ranking", () => {
  it("ranks the unlucky, verified-purpose request above a heavy recent user", () => {
    const cap = { hours: 20, allocations: 4 };
    const unlucky = priorityScore({ completedHours: 0, allocations: 0, unsuccessful: 2, purposeCategory: "academic_deadline", purposeVerified: true, autoApprove: false }, cap);
    const heavy = priorityScore({ completedHours: 18, allocations: 3, unsuccessful: 0, purposeCategory: "academic_deadline", purposeVerified: false, autoApprove: false }, cap);
    expect(unlucky.total).toBe(40 + 25 + 13 + 15);
    const ranked = rankRequests([
      { id: "heavy", score: heavy.total, completedHours: 18, createdAt: h(1) },
      { id: "unlucky", score: unlucky.total, completedHours: 0, createdAt: h(2) },
    ]);
    expect(ranked[0].id).toBe("unlucky");
  });
});

describe("policy diff", () => {
  it("lists only changed leaves with before and after values", () => {
    const next = { ...DEFAULT_POLICY, weekly_allowance: 120, grace: { ...DEFAULT_POLICY.grace, min_minutes: 20 } };
    const changes = policyDiff(DEFAULT_POLICY, next);
    expect(changes).toEqual([
      { path: "weekly_allowance", before: 100, after: 120 },
      { path: "grace.min_minutes", before: 15, after: 20 },
    ]);
    expect(diffMetadata(changes)).toEqual({
      previous: { weekly_allowance: 100, "grace.min_minutes": 15 },
      new: { weekly_allowance: 120, "grace.min_minutes": 20 },
    });
    expect(policyDiff(DEFAULT_POLICY, structuredClone(DEFAULT_POLICY))).toEqual([]);
  });
});
