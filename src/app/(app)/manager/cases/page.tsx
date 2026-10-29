import Link from "next/link";
import { Camera, CircleCheck, Coins, Siren, Wrench } from "lucide-react";
import { EMERGENCY_NOTICE, formatWhen, sentence } from "@/components/format";
import { IncidentList } from "@/components/incident-list";
import { ResourceStatusForm } from "@/components/trust-forms";
import { buttonVariants } from "@/components/ui/button";
import { CountBadge, EmptyState, Flag, PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import { managerQueue } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Safety incidents, damage disputes and penalties (PRD 11). Damage and safety stay separate.
export default async function Cases() {
  const viewer = await requireViewer();
  const q = await managerQueue(viewer);

  return (
    <>
      <PageHeading
        eyebrow="Campus oversight · safety and trust"
        title={
          <>
            People first. <em>Evidence always.</em>
          </>
        }
        description="The system gathers evidence and proposes. You decide, after the student has had the chance to respond. Whoever filed a report never decides it."
      />
      <p className="mb-6 flex items-start gap-2 rounded-xl border border-danger-fg/20 bg-danger-bg px-4 py-3 text-sm text-danger-fg">
        <Siren aria-hidden className="mt-0.5 size-4 shrink-0" />
        {EMERGENCY_NOTICE}
      </p>

      <div className="grid gap-6">
        <Panel aria-labelledby="incidents-heading">
          <PanelHeading id="incidents-heading" title="Safety incidents" description="Closing an incident never restores the resource; that is a separate step." aside={<CountBadge tone={q.incidents.length ? "danger" : "neutral"}>{q.incidents.length} open</CountBadge>} />
          <IncidentList incidents={q.incidents} as="manager" now={q.now} />
        </Panel>

        {q.outOfService.length > 0 && (
          <Panel aria-labelledby="oos-heading">
            <PanelHeading id="oos-heading" title="Out of service" description="Unsafe or under maintenance. Bring a resource back only once you have confirmed it is safe to use." aside={<Wrench aria-hidden className="size-5 text-moss" />} />
            <ul className="divide-y divide-line">
              {q.outOfService.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <span className="grid gap-1">
                    <strong className="text-sm font-semibold">{r.name} · {r.organizations?.name}</strong>
                    <span><Flag tone={r.status === "unsafe" ? "danger" : "warn"}>{sentence(r.status)}</Flag> <span className="text-xs text-ink-soft">since {formatWhen(r.updated_at)}</span></span>
                  </span>
                  <div className="min-w-64"><ResourceStatusForm resourceId={r.id} as="manager" to="active" label="Confirm safe to use again" /></div>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel aria-labelledby="damage-heading">
          <PanelHeading id="damage-heading" title="Damage disputes" description="Check-out and return photos side by side, the student's response, then a reasoned outcome." aside={<CountBadge>{q.cases.length} open</CountBadge>} />
          {q.cases.length ? (
            <ul className="divide-y divide-line">
              {q.cases.map((c) => {
                const reporter = c.reported_by === viewer.id;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-pending-bg text-pending-fg"><Camera aria-hidden className="size-4" /></span>
                    <span className="grid min-w-0 flex-1 gap-1">
                      <strong className="text-sm font-semibold">{c.bookings.resources.name} · {c.bookings.profiles?.full_name ?? "Student"}</strong>
                      <span className="line-clamp-2 text-sm text-ink-soft">{c.description}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <Flag tone={c.severity === "minor" ? "warn" : "danger"}>{sentence(c.severity)}</Flag>
                        <Flag tone={c.status === "ready_for_decision" ? "info" : "neutral"}>{sentence(c.status)}</Flag>
                        {c.status !== "ready_for_decision" && <Flag>Response by {formatWhen(c.response_deadline)}</Flag>}
                        {reporter && <Flag tone="warn">You filed this · another Manager decides</Flag>}
                        {c.assigned_to === viewer.id && <Flag tone="info">Assigned to you</Flag>}
                      </span>
                    </span>
                    <Link href={`/manager/bookings/${c.booking_id}`} className={buttonVariants({ variant: c.status === "ready_for_decision" && !reporter ? "default" : "outline", size: "sm" })}>
                      Review evidence
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="No open disputes." />
          )}
        </Panel>

        <Panel aria-labelledby="penalties-heading">
          <PanelHeading id="penalties-heading" title="Penalties and appeals" description="Nothing is deducted until you confirm, reduce or waive it with a reason. Appeals of a no-show forfeit can be reversed." aside={<CountBadge>{q.penalties.length} waiting</CountBadge>} />
          {q.penalties.length ? (
            <ul className="divide-y divide-line">
              {q.penalties.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-wash text-moss"><Coins aria-hidden className="size-4" /></span>
                  <span className="grid min-w-0 flex-1">
                    <strong className="text-sm font-semibold">{p.bookings.resources.name} · {p.kind.replace("_", "-")} penalty</strong>
                    <span className="text-sm text-ink-soft">{p.profiles?.full_name ?? "Student"} · {p.proposed_amount} credits · {p.status === "appealed" ? "appealed by the student" : "proposed"}</span>
                  </span>
                  <Link href={`/manager/bookings/${p.booking_id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Review and decide</Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="No penalties waiting." />
          )}
        </Panel>
      </div>
    </>
  );
}
