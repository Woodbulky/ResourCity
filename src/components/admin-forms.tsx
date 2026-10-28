"use client";
import { useActionState, useId, useMemo, useState } from "react";
import { Clock, Play, RotateCcw } from "lucide-react";
import { Result } from "@/components/booking-forms";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/kit";
import type { PolicyValues } from "@/lib/contracts/policy";
import { policyDiff } from "@/lib/domain/policy";
import { changePolicy, decideEmergencyCredits, moveClock, resetDemoData, runSchedulerNow } from "@/lib/server/admin-actions";

// Demo controls (PRD 12, 17): clock +15 min / +1 h / +1 day / reset, run scheduler, reset demo data.
export function DemoControls() {
  const [clock, clockAction, clockPending] = useActionState(moveClock, null);
  const [run, runAction, runPending] = useActionState(runSchedulerNow, null);
  const [reset, resetAction, resetPending] = useActionState(resetDemoData, null);
  return (
    <div className="grid gap-3 p-5">
      <form action={clockAction} className="flex flex-wrap gap-2">
        {[["15m", "+15 min"], ["1h", "+1 hour"], ["1d", "+1 day"]].map(([step, label]) => (
          <Button key={step} type="submit" name="step" value={step} variant="outline" size="sm" disabled={clockPending}>
            <Clock aria-hidden /> {label}
          </Button>
        ))}
        <Button type="submit" name="step" value="reset" variant="ghost" size="sm" disabled={clockPending}>Reset clock</Button>
      </form>
      <Result state={clock} />
      <form action={runAction}>
        <Button type="submit" size="sm" disabled={runPending}><Play aria-hidden /> {runPending ? "Running…" : "Run scheduler now"}</Button>
      </form>
      <Result state={run} />
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-danger-fg">Reset demo data</summary>
        <form action={resetAction} className="mt-2 grid gap-2">
          <p className="text-xs text-ink-soft">Reloads every seeded account, booking and situation and resets the clock. The audit log is kept.</p>
          <Button type="submit" variant="destructive" size="sm" disabled={resetPending} className="w-fit">
            <RotateCcw aria-hidden /> {resetPending ? "Resetting…" : "Reset everything"}
          </Button>
        </form>
      </details>
      <Result state={reset} />
    </div>
  );
}

export function EmergencyDecisionForm({ requestId, amount, cap }: { requestId: string; amount: number; cap: number }) {
  const [state, action, pending] = useActionState(decideEmergencyCredits, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor={`${id}-g`} className="text-xs font-semibold">Grant</label>
          <input id={`${id}-g`} type="number" name="grant" min={1} max={Math.min(amount, cap)} defaultValue={Math.min(amount, cap)} className={`${field} w-24`} />
        </div>
        <div className="grid min-w-48 flex-1 gap-1">
          <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason <span className="font-normal text-ink-soft">(required for partial or decline)</span></label>
          <input id={`${id}-r`} name="reason" maxLength={300} className={field} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="grant" size="sm" disabled={pending}>Grant</Button>
        <Button type="submit" name="decision" value="reject" variant="destructive" size="sm" disabled={pending}>Decline</Button>
      </div>
      <Result state={state} />
    </form>
  );
}

// Editable policy keys (PRD 12). Per-category caps stay on the default cap for now.
const FIELDS: [string, string, number][] = [
  ["weekly_allowance", "Weekly allowance (credits)", 1],
  ["emergency_grant_cap", "Emergency grant cap (credits)", 1],
  ["default_category_cap.hours", "Category cap: hours in 30 days", 1],
  ["default_category_cap.allocations", "Category cap: allocations in 30 days", 1],
  ["grace.percent", "Grace: share of the slot (0–1)", 0.05],
  ["grace.min_minutes", "Grace: minimum minutes", 1],
  ["grace.max_minutes", "Grace: maximum minutes", 1],
  ["strikes.limit", "No-show strike limit", 1],
  ["strikes.window_days", "Strike window (days)", 1],
  ["cancellation_window_minutes", "Cancellation window (minutes before start, 0 = until start)", 1],
  ["offer_windows.short_slot_max_minutes", "Offer: short slot up to (minutes)", 1],
  ["offer_windows.short_minutes", "Offer window, short slots (minutes)", 1],
  ["offer_windows.long_minutes", "Offer window, long slots (minutes)", 1],
  ["escalation.owner_hours", "Escalate to Manager after (hours)", 1],
  ["escalation.owner_before_start_hours", "…or this many hours before start", 1],
  ["escalation.manager_hours", "Alert Admin after Manager hours", 1],
  ["dispute_response_hours", "Dispute response window (hours)", 1],
  ["late_penalty_multiplier", "Late penalty multiplier (× rate)", 0.5],
];

const get = (v: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], v) as number;
function set(v: PolicyValues, path: string, value: number): PolicyValues {
  const next = structuredClone(v) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let o = next;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  o[keys.at(-1)!] = value;
  return next as unknown as PolicyValues;
}

// Edit → review the before/after diff → confirm with a reason (PRD 12).
export function PolicyEditor({ current, version }: { current: PolicyValues; version: number }) {
  const [values, setValues] = useState(current);
  const [state, action, pending] = useActionState(changePolicy, null);
  const changes = useMemo(() => policyDiff(current, values), [current, values]);
  const id = useId();
  if (state?.ok) return <div className="p-5"><Result state={state} /></div>;
  return (
    <form action={action} className="grid gap-5 p-5">
      <input type="hidden" name="values" value={JSON.stringify(values)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([path, label, step]) => (
          <div key={path} className="grid gap-1">
            <label htmlFor={`${id}-${path}`} className="text-xs font-semibold">{label}</label>
            <input
              id={`${id}-${path}`}
              type="number"
              min={0}
              step={step}
              value={Number.isNaN(get(values, path)) ? "" : get(values, path)}
              onChange={(e) => setValues((v) => set(v, path, e.target.valueAsNumber))}
              className={field}
            />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-line p-4" aria-live="polite">
        <h3 className="text-sm font-semibold">Changes from v{version}</h3>
        {changes.length ? (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="py-1 font-semibold">Setting</th><th className="font-semibold">Before</th><th className="font-semibold">After</th></tr></thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.path} className="border-t border-line">
                  <td className="py-1.5 font-mono text-xs">{c.path}</td>
                  <td className="text-ink-soft line-through">{String(c.before)}</td>
                  <td className="font-semibold">{String(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">Nothing changed yet.</p>
        )}
      </div>
      {changes.length > 0 && (
        <div className="grid gap-2">
          <label htmlFor={`${id}-reason`} className="text-sm font-semibold">Reason for this change</label>
          <textarea id={`${id}-reason`} name="reason" required minLength={3} maxLength={500} className={`${field} h-auto min-h-20 py-2`} />
          <Button type="submit" disabled={pending} className="w-fit">Confirm and publish v{version + 1}</Button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}
