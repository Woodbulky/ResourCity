import Link from "next/link";
import { CircleCheck, ClipboardList, Clock, Gauge, ShieldAlert, Users } from "lucide-react";
import { DecisionRow } from "@/components/staff";
import { buttonVariants } from "@/components/ui/button";
import { CountBadge, EmptyState, PageHeading, Panel, PanelFooterLink, PanelHeading, SummaryCard, SummaryRow, waited } from "@/components/ui/kit";
import { managerQueue, orgInsights } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Manager home (PRD 12): what needs a human decision first, then the department picture.
export default async function ManagerHome() {
  const viewer = await requireViewer();
  const [q, ins] = await Promise.all([managerQueue(viewer), orgInsights(viewer)]);
  const orgs = viewer.memberships.filter((m) => m.role === "manager").map((m) => m.orgName);
  const critical = q.items.filter((i) => i.level === "critical");
  const urgent = q.items.filter((i) => i.level === "urgent");

  return (
    <>
      <PageHeading
        eyebrow={orgs.join(" · ")}
        title={
          <>
            A campus that works, <em>together.</em>
          </>
        }
        description="Your queues, ordered by what needs a human decision first: safety, then the clock, then routine."
        actions={<Link href="/manager/insights" className={buttonVariants({ variant: "outline" })}><Gauge aria-hidden /> Department insights</Link>}
      />

      <SummaryRow>
        <SummaryCard label="Critical to review" value={critical.length} note={critical.length ? "Incidents and major damage" : "Nothing critical"} tone={critical.length ? "alert" : "default"} icon={ShieldAlert} href="/manager/queue?level=critical" />
        <SummaryCard label="Urgent decisions" value={urgent.length} note="Pickup within 24 h, escalations, disputes" icon={ClipboardList} href="/manager/queue?level=urgent" />
        <SummaryCard label="Currently borrowed" value={ins.borrowedNow} note={ins.overdue ? `${ins.overdue} overdue` : "None overdue"} tone={ins.overdue ? "alert" : "default"} icon={Users} />
        <SummaryCard label="Hours shared" value={ins.hours30} note="Recorded, last 30 days" icon={Clock} href="/manager/insights" />
      </SummaryRow>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <Panel aria-labelledby="queue-heading">
          <PanelHeading
            id="queue-heading"
            title="Your decision queue"
            description="Oldest first within each level. Each item shows how long it has waited."
            aside={<CountBadge tone={critical.length ? "danger" : "pending"}>{q.items.length} open</CountBadge>}
          />
          {q.items.length ? (
            <ul className="divide-y divide-line">
              {q.items.slice(0, 5).map((i) => <DecisionRow key={i.id} item={i} now={q.now} />)}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="Nothing waiting on you.">All decisions are up to date.</EmptyState>
          )}
          <PanelFooterLink href="/manager/queue">Open the decision queue</PanelFooterLink>
        </Panel>

        <Panel aria-labelledby="safety-heading">
          <PanelHeading id="safety-heading" title="Safety and trust" description="Kept separate, documented and in front of a human." />
          {q.incidents.length || q.cases.length ? (
            <ul className="divide-y divide-line">
              {q.incidents.slice(0, 3).map((i) => (
                <li key={i.id} className="flex gap-3 px-5 py-3">
                  <span aria-hidden className="w-1 self-stretch rounded-full bg-coral" />
                  <span className="grid gap-0.5">
                    <strong className="text-sm font-semibold">{i.resources.name} · incident</strong>
                    <span className="text-sm text-ink-soft">{i.severity} severity · {i.status}</span>
                    <small className="text-xs text-ink-soft">reported {waited(i.created_at, q.now)} ago</small>
                  </span>
                </li>
              ))}
              {q.cases.slice(0, 3).map((c) => (
                <li key={c.id} className="flex gap-3 px-5 py-3">
                  <span aria-hidden className={`w-1 self-stretch rounded-full ${c.severity === "minor" ? "bg-honey" : "bg-coral"}`} />
                  <span className="grid gap-0.5">
                    <strong className="text-sm font-semibold">{c.bookings.resources.name} · {c.severity} damage</strong>
                    <span className="text-sm text-ink-soft">{c.status.replaceAll("_", " ")}</span>
                    <small className="text-xs text-ink-soft">filed {waited(c.created_at, q.now)} ago</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={ShieldAlert} title="All clear.">No open incidents or damage cases.</EmptyState>
          )}
          <PanelFooterLink href="/manager/cases">Review safety and disputes</PanelFooterLink>
        </Panel>
      </section>
    </>
  );
}
