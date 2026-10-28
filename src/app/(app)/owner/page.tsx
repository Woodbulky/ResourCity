import Link from "next/link";
import { Building2, CalendarClock, CircleCheck, ClipboardList, PackageCheck, PackageOpen, TriangleAlert, Undo2, Users } from "lucide-react";
import { formatTime, relativeDay } from "@/components/format";
import { ActivityLine, QueueRow, ResourceTile } from "@/components/staff";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLink, CountBadge, EmptyState, PageHeading, Panel, PanelFooterLink, PanelHeading, SectionTitle, SummaryCard, SummaryRow, waited } from "@/components/ui/kit";
import { ownerDesk } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Owner home (PRD 12): today strip, queues, status lists and the lending shelf.
export default async function OwnerHome() {
  const viewer = await requireViewer();
  const d = await ownerDesk(viewer);
  const orgLabel = d.orgs.map((o) => o.orgName).join(" · ");
  const overdue = d.borrowed.filter((b) => b.status === "overdue").length;
  const today = [
    ...d.pickupsToday.map((b) => ({ b, kind: "pickup" as const, at: b.start_at })),
    ...d.returnsDue.map((b) => ({ b, kind: "return" as const, at: b.end_at })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  const outByResource = new Map<string, number>();
  for (const b of d.borrowed) outByResource.set(b.resources.id, (outByResource.get(b.resources.id) ?? 0) + 1);

  return (
    <>
      <PageHeading
        eyebrow={`${orgLabel} · resource desk`}
        title={
          <>
            Your campus shares. <em>You make it happen.</em>
          </>
        }
        description="A good day starts with a clear handover and a little room for the next request."
        actions={<Link href="/owner/resources" className={buttonVariants()}><Building2 aria-hidden /> Manage resources</Link>}
      />

      <SummaryRow>
        <SummaryCard label="Needs your review" value={d.needsReview.length} note={d.needsReview[0] ? `oldest waiting ${waited(d.needsReview[0].created_at, d.now)}` : "All caught up"} icon={ClipboardList} href="/owner/requests" />
        <SummaryCard label="Handovers today" value={today.length} note={`${d.pickupsToday.length} pickups · ${d.returnsDue.length} returns`} icon={PackageOpen} href="/owner/handovers" />
        <SummaryCard label="Out with students" value={d.borrowed.length} note={overdue ? `${overdue} overdue` : "All on track"} tone={overdue ? "alert" : "default"} icon={Users} href="/owner/handovers?tab=borrowed" />
        <SummaryCard label="Returns to close" value={d.toClose.length + d.underReview.length} note={d.underReview.length ? `${d.underReview.length} under Manager review` : "Condition records"} icon={Undo2} href="/owner/handovers?tab=returned" />
      </SummaryRow>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <Panel aria-labelledby="requests-heading">
          <PanelHeading
            id="requests-heading"
            title="Requests to look over"
            description="Oldest first. A thoughtful yes can get a good idea moving."
            aside={<CountBadge>{d.needsReview.length} waiting</CountBadge>}
          />
          {d.needsReview.length ? (
            <ul className="divide-y divide-line">
              {d.needsReview.slice(0, 4).map((b) => (
                <QueueRow
                  key={b.id}
                  name={b.profiles?.full_name ?? "Student"}
                  title={b.resources.name}
                  detail={`${b.profiles?.full_name ?? "Student"} · ${relativeDay(b.start_at, d.now)}, ${formatTime(b.start_at)} · ${b.purpose_category.replaceAll("_", " ")}`}
                  since={b.created_at}
                  now={d.now}
                  href={`/owner/bookings/${b.id}`}
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="All caught up.">Every request has a place to land. You&apos;re clear for now.</EmptyState>
          )}
          {d.waitingForManager.length > 0 && (
            <p className="border-t border-line px-5 py-3 text-sm text-ink-soft">
              <strong className="font-semibold text-ink">{d.waitingForManager.length} waiting for Manager</strong> · restricted or exception requests your Manager decides.
            </p>
          )}
          <PanelFooterLink href="/owner/requests">Open all requests</PanelFooterLink>
        </Panel>

        <Panel aria-labelledby="today-heading">
          <PanelHeading id="today-heading" title="Today at the desk" description="Pickups and returns due today." aside={<span className="rounded-md bg-wash px-2 py-1 text-xs font-semibold text-moss">TODAY</span>} />
          {today.length ? (
            <ul className="py-1">
              {today.slice(0, 5).map(({ b, kind, at }) => (
                <ActivityLine
                  key={`${kind}-${b.id}`}
                  icon={kind === "pickup" ? PackageOpen : b.status === "overdue" ? TriangleAlert : PackageCheck}
                  title={b.resources.name}
                  detail={`${kind === "pickup" ? "Pickup with" : "Return from"} ${b.profiles?.full_name ?? "student"} · ${formatTime(at)}`}
                  when={b.status === "overdue" ? "Overdue" : kind === "pickup" ? "Scan QR to hand over" : "Record return"}
                  href={`/owner/bookings/${b.id}`}
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CalendarClock} title="A quiet day.">No pickups or returns are due today.</EmptyState>
          )}
          <PanelFooterLink href="/owner/handovers">Open the handover desk</PanelFooterLink>
        </Panel>
      </section>

      <SectionTitle
        title="Your lending shelf"
        description={`${d.resources.length} listings · ${d.resources.filter((r) => r.status !== "active").length} not bookable right now`}
        action={<ArrowLink href="/owner/resources">View resources</ArrowLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {d.resources.slice(0, 3).map((r) => <ResourceTile key={r.id} r={r} out={outByResource.get(r.id)} />)}
      </div>
    </>
  );
}
