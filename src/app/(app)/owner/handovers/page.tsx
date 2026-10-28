import { PackageOpen, ScanLine } from "lucide-react";
import { BookingCard, type BookingRow } from "@/components/booking-list";
import { Button } from "@/components/ui/button";
import { ComingNext, EmptyState, PageHeading, TabRail } from "@/components/ui/kit";
import { ownerDesk } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

const NOTES = {
  today: "Scan the student's QR, confirm their photo, then record the checklist and guided shots together.",
  upcoming: "Approved and awaiting pickup.",
  borrowed: "Out with the student.",
  returned: "Back with you. Close it with Return OK, or raise damage for a Manager.",
} as const;
type Tab = keyof typeof NOTES;

// Handover desk (PRD 10, 12): pickups and returns, mobile-first.
export default async function Handovers({ searchParams }: PageProps<"/owner/handovers">) {
  const viewer = await requireViewer();
  const [{ tab: raw }, d] = await Promise.all([searchParams, ownerDesk(viewer)]);
  const lists: Record<Tab, typeof d.needsReview> = {
    today: [...d.pickupsToday, ...d.returnsDue],
    upcoming: d.upcomingPickups,
    borrowed: d.borrowed,
    returned: [...d.toClose, ...d.underReview],
  };
  const tab: Tab = typeof raw === "string" && raw in lists ? (raw as Tab) : "today";
  const labels: Record<Tab, string> = { today: "Today", upcoming: "Upcoming pickups", borrowed: "Currently borrowed", returned: "Returned" };

  return (
    <>
      <PageHeading
        eyebrow={`${d.orgs.map((o) => o.orgName).join(" · ")} · handover desk`}
        title="A careful handover starts here."
        description="Scan, check together and give every item a clear beginning and end. Both of you sign the condition record."
        actions={<Button disabled><ScanLine aria-hidden /> Open scanner</Button>}
      />
      <div className="mb-5 max-w-xl">
        <ComingNext phase={3}>The phone scanner, signed QR check and the photo handover screen.</ComingNext>
      </div>
      <TabRail
        label="Handovers"
        active={tab}
        hrefFor={(k) => `/owner/handovers?tab=${k}`}
        tabs={(Object.keys(lists) as Tab[]).map((k) => ({ key: k, label: labels[k], count: lists[k].length }))}
      />
      {lists[tab].length ? (
        <div className="grid gap-3">
          {lists[tab].map((b) => (
            <BookingCard
              key={b.id}
              href={`/owner/bookings/${b.id}`}
              booking={b as unknown as BookingRow}
              person={b.profiles?.full_name ?? "Student"}
              note={b.status === "overdue" ? "Overdue: the student and their Manager have been told." : b.status === "under_review" ? "Damage case open with a Manager." : NOTES[tab]}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={PackageOpen} title="Nothing here right now.">Handovers appear as soon as requests are approved.</EmptyState>
      )}
    </>
  );
}
