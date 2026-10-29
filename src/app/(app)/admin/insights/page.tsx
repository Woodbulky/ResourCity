import { Clock, LifeBuoy, Shuffle, UserX } from "lucide-react";
import { ResourceUseTable } from "@/components/staff";
import { PageHeading, Panel, PanelHeading, SummaryCard, SummaryRow } from "@/components/ui/kit";
import { insights } from "@/lib/server/queues";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Admin insights (PRD 12): underused resources, utilisation by organisation, booking distribution,
// no-show patterns, override frequency per Manager and emergency grants.
export default async function AdminInsights() {
  await requireViewer();
  const supabase = await createClient();
  const [{ data: orgs }, { data: overrides }, { data: emergency }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase.from("audit_events").select("actor_id, profiles!audit_events_actor_id_fkey(full_name)").eq("action", "MANAGER_OVERRIDE"),
    supabase.from("emergency_credit_requests").select("status, amount, granted_amount"),
  ]);
  const ins = await insights((orgs ?? []).map((o) => o.id));

  const byOrg = (orgs ?? []).map((o) => {
    const mine = ins.perResource.filter((r) => r.org_id === o.id);
    const hours = mine.reduce((s, r) => s + r.hours, 0);
    const open = mine.reduce((s, r) => s + r.available, 0);
    return { ...o, resources: mine.length, hours, open, use: open ? Math.round((hours / open) * 100) : null, noShows: mine.reduce((s, r) => s + r.noShows, 0) };
  });
  const perManager = new Map<string, number>();
  for (const e of overrides ?? []) {
    const name = e.profiles?.full_name ?? "Unknown";
    perManager.set(name, (perManager.get(name) ?? 0) + 1);
  }
  const grants = (emergency ?? []).filter((e) => e.status === "approved" || e.status === "partial");
  const underused = [...ins.perResource].sort((a, b) => (a.utilisation ?? Infinity) - (b.utilisation ?? Infinity));
  const peakNoShow = Math.max(1, ...ins.noShowsByWeekday);

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · insights"
        title={
          <>
            What&apos;s shared, <em>and what still sits still.</em>
          </>
        }
        description="Last 30 days across every organisation. Before/after comparison, not proof of cause."
      />
      <SummaryRow>
        <SummaryCard label="Hours shared" value={ins.hours30} note="Recorded check-out to return" icon={Clock} />
        <SummaryCard label="No-shows" value={ins.noShows} note={`${ins.repeatNoShows.length} students with 2 or more`} tone={ins.noShows ? "alert" : "default"} icon={UserX} />
        <SummaryCard label="Manager overrides" value={overrides?.length ?? 0} note="All time, with reasons in the audit log" icon={Shuffle} />
        <SummaryCard label="Emergency grants" value={grants.length} note={`${grants.reduce((s, e) => s + (e.granted_amount ?? 0), 0)} credits granted`} icon={LifeBuoy} />
      </SummaryRow>

      <Panel aria-labelledby="underused-heading">
        <PanelHeading
          id="underused-heading"
          title="Underused resources"
          description="Least used first. The Owner's estimate before listing beside recorded use since: a before/after comparison, not proof of cause."
        />
        <ResourceUseTable rows={underused} showOrg />
      </Panel>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel aria-labelledby="org-heading">
          <PanelHeading id="org-heading" title="Utilisation by organisation" description="Recorded hours ÷ open hours." />
          <ul className="divide-y divide-line">
            {byOrg.map((o) => (
              <li key={o.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">{o.name}</span>
                  <span className="shrink-0 text-ink-soft">
                    {o.hours} of {o.open} h · <strong className="text-ink">{o.use === null ? "—" : `${o.use}%`}</strong> · {o.noShows} no-shows
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash">
                  <span className="block h-full rounded-full bg-moss" style={{ width: `${Math.min(100, o.use ?? 0)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel aria-labelledby="dist-heading">
          <PanelHeading id="dist-heading" title="Booking distribution and no-shows" />
          <p className="px-5 pt-4 text-sm text-ink-soft">
            {ins.distribution.students} students held {ins.distribution.bookings} bookings.
            {ins.distribution.topShare !== null && ` The busiest ${ins.distribution.topCount} held ${ins.distribution.topShare}% of them.`}
          </p>
          <div className="mt-4 flex h-28 items-end gap-2 px-5" role="img" aria-label={`No-shows by weekday: ${DAYS.map((d, i) => `${d} ${ins.noShowsByWeekday[i]}`).join(", ")}`}>
            {ins.noShowsByWeekday.map((n, i) => (
              <div key={DAYS[i]} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold text-ink-soft">{n}</span>
                <span className="w-full rounded-t-md bg-[#83a77c]" style={{ height: `${Math.max(3, (n / peakNoShow) * 72)}px` }} />
                <span className="text-xs text-ink-soft">{DAYS[i]}</span>
              </div>
            ))}
          </div>
          <p className="px-5 pb-4 pt-2 text-xs text-ink-soft">No-shows by weekday of the slot. Owner not present: {ins.ownerNotPresent}.</p>
        </Panel>
      </div>

      <Panel aria-labelledby="override-heading" className="mt-6">
        <PanelHeading id="override-heading" title="Override frequency per Manager" description="A signal to review, never an accusation." />
        {perManager.size ? (
          <ul className="divide-y divide-line">
            {[...perManager].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
              <li key={name} className="flex justify-between px-5 py-2.5 text-sm">
                <span>{name}</span>
                <span className="font-mono">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-soft">No recommendations have been overridden.</p>
        )}
      </Panel>
    </>
  );
}
