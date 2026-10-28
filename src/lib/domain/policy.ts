// Policy change diff (PRD 12): every changed leaf, shown before the Admin confirms with a reason
// and stored in the POLICY_CHANGED audit event.
import type { PolicyValues } from "../contracts/policy";

export interface PolicyChange {
  path: string; // e.g. "grace.min_minutes"
  before: unknown;
  after: unknown;
}

function leaves(v: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) leaves(x, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = v;
  return out;
}

export function policyDiff(before: PolicyValues, after: PolicyValues): PolicyChange[] {
  const a = leaves(before);
  const b = leaves(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((p) => JSON.stringify(a[p]) !== JSON.stringify(b[p]))
    .map((path) => ({ path, before: a[path], after: b[path] }));
}

// {previous, new} objects keyed by path, as the audit metadata stores them (PRD 15).
export const diffMetadata = (changes: readonly PolicyChange[]) => ({
  previous: Object.fromEntries(changes.map((c) => [c.path, c.before])),
  new: Object.fromEntries(changes.map((c) => [c.path, c.after])),
});
