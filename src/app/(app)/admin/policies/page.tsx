import { Check, Scale, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { PolicyEditor } from "@/components/admin-forms";
import { formatWhen } from "@/components/format";
import { PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import { policyValuesSchema, type PolicyValues } from "@/lib/contracts/policy";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

const LINES = (v: PolicyValues): [string, string][] => [
  ["Weekly student allowance", `${v.weekly_allowance} credits`],
  ["Emergency grant cap", `${v.emergency_grant_cap} credits, once per academic year`],
  ["Default category caps", `${v.default_category_cap.hours} h · ${v.default_category_cap.allocations} allocations / 30 days`],
  ["Pickup grace", `${Math.round(v.grace.percent * 100)}% of the slot, ${v.grace.min_minutes}–${v.grace.max_minutes} min`],
  ["No-show strikes", `${v.strikes.limit} in ${v.strikes.window_days} days`],
  ["Cancellation window", v.cancellation_window_minutes ? `${v.cancellation_window_minutes} min before start` : "Free until the slot starts"],
  ["Waitlist offer windows", `${v.offer_windows.short_minutes} min (slots ≤ ${v.offer_windows.short_slot_max_minutes / 60} h) · ${v.offer_windows.long_minutes} min`],
  ["Escalation", `Owner ${v.escalation.owner_hours} h (or ${v.escalation.owner_before_start_hours} h before start) → Manager ${v.escalation.manager_hours} h → Admin`],
  ["Dispute response window", `${v.dispute_response_hours} hours`],
  ["Late penalty", `${v.late_penalty_multiplier}× the rate per late unit, Manager-confirmed`],
];

// Versioned global policy (PRD 9, 12): edit, review the before/after diff, confirm with a reason.
export default async function Policies() {
  await requireViewer();
  const { data: versions } = await (await createClient())
    .from("policy_versions")
    .select("id, version, values, reason, created_at, profiles!policy_versions_created_by_fkey(full_name)")
    .order("version", { ascending: false });
  const current = versions?.[0];
  const values = policyValuesSchema.safeParse(current?.values).data;

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · versioned rules"
        title={
          <>
            Fairness, <em>written down.</em>
          </>
        }
        description="Changes apply to new requests. Every edit needs a reason, shows a before-and-after diff, and creates a new version; earlier bookings keep theirs."
      />
      {values && (
        <Panel aria-labelledby="edit-heading" className="mb-6">
          <details>
            <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 font-semibold text-moss">
              <SlidersHorizontal aria-hidden className="size-4" /> <span id="edit-heading">Propose a change</span>
            </summary>
            <PolicyEditor current={values} version={current?.version ?? 1} />
          </details>
        </Panel>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Panel aria-labelledby="current-heading">
          <PanelHeading id="current-heading" title={`Current policy · v${current?.version ?? "—"}`} aside={<span className="rounded-md bg-sage px-2 py-1 text-xs font-semibold text-sage-strong">ACTIVE</span>} />
          {values ? (
            <dl className="divide-y divide-line">
              {LINES(values).map(([k, v]) => (
                <div key={k} className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[200px_1fr]">
                  <dt className="text-ink-soft">{k}</dt>
                  <dd className="font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="px-5 py-4 text-sm text-danger-fg">The current policy could not be read.</p>
          )}
        </Panel>
        <Panel aria-labelledby="fair-heading" className="h-fit">
          <PanelHeading id="fair-heading" title="How decisions stay fair" aside={<Sparkles aria-hidden className="size-5 text-moss" />} />
          <ul className="divide-y divide-line">
            {[
              [Scale, "Published allocation score", "Recent use · allocations · unsuccessful requests · verified purpose"],
              [ShieldCheck, "Humans decide what matters", "AI can flag a condition difference. A person always decides."],
              [Check, "Append-only audit", "Consequential decisions keep an actor, a reason and a timestamp."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Scale;
              return (
                <li key={t as string} className="flex gap-3 px-5 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-wash text-moss"><I aria-hidden className="size-4" /></span>
                  <span className="grid"><strong className="text-sm font-semibold">{t as string}</strong><span className="text-sm text-ink-soft">{d as string}</span></span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </section>

      <Panel aria-labelledby="history-heading" className="mt-6">
        <PanelHeading id="history-heading" title="Policy history" description="Earlier bookings keep the version they were approved under." />
        <ol className="py-2">
          {versions?.map((v, i) => (
            <li key={v.id} className="relative flex gap-3 px-5 py-3">
              {i < versions.length - 1 && <span aria-hidden className="absolute left-[33px] top-11 h-[calc(100%-1.75rem)] w-px bg-line" />}
              <span className="z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-wash text-xs font-bold text-moss">v{v.version}</span>
              <span className="grid">
                <strong className="text-sm font-semibold">{v.reason}</strong>
                <span className="text-xs text-ink-soft">{formatWhen(v.created_at)} · {v.profiles?.full_name ?? "System"}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
