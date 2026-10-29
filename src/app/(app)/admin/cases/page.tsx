import Link from "next/link";
import { Camera, CircleCheck, Siren } from "lucide-react";
import { EMERGENCY_NOTICE, formatWhen, sentence } from "@/components/format";
import { IncidentList } from "@/components/incident-list";
import { buttonVariants } from "@/components/ui/button";
import { CountBadge, EmptyState, Flag, PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import { appNow } from "@/lib/server/clock";
import { adminQueue } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Admin oversight (PRD 3, 11, 12): conflict-of-interest damage cases and open safety incidents.
export default async function AdminCases() {
  await requireViewer();
  const [q, now] = await Promise.all([adminQueue(), appNow()]);
  return (
    <>
      <PageHeading
        eyebrow="Platform oversight"
        title={<>Cases &amp; <em>incidents.</em></>}
        description="Admins decide damage cases only when the reporter is the organisation's only Manager. Incidents are handled with the organisation's Managers."
      />
      <p className="mb-6 flex items-start gap-2 rounded-xl border border-danger-fg/20 bg-danger-bg px-4 py-3 text-sm text-danger-fg">
        <Siren aria-hidden className="mt-0.5 size-4 shrink-0" /> {EMERGENCY_NOTICE}
      </p>
      <div className="grid gap-6">
        <Panel aria-labelledby="coi-heading">
          <PanelHeading id="coi-heading" title="Conflict-of-interest disputes" description="The reporter cannot decide their own report, and there was no other Manager." aside={<CountBadge>{q.cases.length} open</CountBadge>} />
          {q.cases.length ? (
            <ul className="divide-y divide-line">
              {q.cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-pending-bg text-pending-fg"><Camera aria-hidden className="size-4" /></span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="text-sm font-semibold">{c.bookings.resources.name} · {c.bookings.profiles?.full_name ?? "Student"} · {c.bookings.resources.organizations?.name}</strong>
                    <span className="line-clamp-2 text-sm text-ink-soft">{c.description}</span>
                    <span className="flex flex-wrap gap-1.5">
                      <Flag tone={c.severity === "minor" ? "warn" : "danger"}>{sentence(c.severity)}</Flag>
                      <Flag tone={c.status === "ready_for_decision" ? "info" : "neutral"}>{sentence(c.status)}</Flag>
                      {c.status !== "ready_for_decision" && <Flag>Response by {formatWhen(c.response_deadline)}</Flag>}
                    </span>
                  </span>
                  <Link href={`/admin/bookings/${c.booking_id}`} className={buttonVariants({ size: "sm" })}>Review evidence</Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="No conflict-of-interest cases." />
          )}
        </Panel>
        <Panel aria-labelledby="inc-heading">
          <PanelHeading id="inc-heading" title="Open safety incidents" description="All organisations. High severity first reaches you as an urgent notification." aside={<CountBadge tone={q.highIncidents ? "danger" : "neutral"}>{q.incidents.length} open</CountBadge>} />
          <IncidentList incidents={[...q.incidents].sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1))} as="admin" now={now} />
        </Panel>
      </div>
    </>
  );
}
