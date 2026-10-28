// Credit ledger maths (PRD 9). Holds are negative deltas and releases positive, so the
// available balance is simply the sum of deltas. A penalty may push it below zero; that
// shortfall is the debt the next weekly allowance pays off.
import type { Database } from "../contracts/database";

export type LedgerKind = Database["public"]["Enums"]["ledger_kind"];
export interface LedgerEntry {
  delta: number;
  kind: LedgerKind;
  booking_id: string | null;
}

export const availableBalance = (entries: readonly LedgerEntry[]) => entries.reduce((s, e) => s + e.delta, 0);

export const debt = (entries: readonly LedgerEntry[]) => Math.max(0, -availableBalance(entries));

// Credits currently held for open bookings: holds not yet released.
export function activeHolds(entries: readonly LedgerEntry[]): number {
  const perBooking = new Map<string, number>();
  for (const e of entries) {
    if (!e.booking_id || (e.kind !== "hold" && e.kind !== "release")) continue;
    perBooking.set(e.booking_id, (perBooking.get(e.booking_id) ?? 0) - e.delta);
  }
  let total = 0;
  for (const v of perBooking.values()) total += Math.max(0, v);
  return total;
}

// Monday reset: unused credits expire (holds are already outside the available balance and
// stay untouched), then the new allowance is granted. A debt is not expired; the allowance covers it.
export function weeklyResetEntries(available: number, allowance: number): Omit<LedgerEntry, "booking_id">[] {
  const entries: Omit<LedgerEntry, "booking_id">[] = [];
  if (available > 0) entries.push({ kind: "reset_expiry", delta: -available });
  entries.push({ kind: "allowance", delta: allowance });
  return entries;
}
