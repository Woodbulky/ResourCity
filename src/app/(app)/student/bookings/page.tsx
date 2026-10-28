import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { BookingCard, type BookingRow } from "@/components/booking-list";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeading, TabRail } from "@/components/ui/kit";
import type { BookingStatus } from "@/lib/contracts/booking";
import { studentSnapshot } from "@/lib/server/student";
import { requireViewer } from "@/lib/server/viewer";

const TABS = {
  upcoming: { label: "Upcoming", statuses: ["pending_allocation", "pending_approval", "waitlisted", "offered", "approved"] },
  active: { label: "In progress", statuses: ["checked_out", "overdue", "returned", "under_review"] },
  history: { label: "History", statuses: ["completed", "rejected", "cancelled", "no_show", "expired"] },
} satisfies Record<string, { label: string; statuses: BookingStatus[] }>;
type Tab = keyof typeof TABS;

export default async function MyBookings({ searchParams }: PageProps<"/student/bookings">) {
  const viewer = await requireViewer();
  const [{ tab: raw }, snap] = await Promise.all([searchParams, studentSnapshot(viewer)]);
  const tab: Tab = typeof raw === "string" && raw in TABS ? (raw as Tab) : "upcoming";
  const inTab = (t: Tab) => snap.bookings.filter((b) => (TABS[t].statuses as BookingStatus[]).includes(b.status));
  // History newest first; upcoming and in-progress soonest first.
  const list = tab === "history" ? inTab(tab) : [...inTab(tab)].sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <>
      <PageHeading
        eyebrow="Your borrowing, at a glance"
        title="My bookings."
        description="Everything you've asked for, picked up and brought back, with the reason behind every decision."
        actions={<Link href="/student/browse" className={buttonVariants()}>Find a resource <ArrowRight aria-hidden /></Link>}
      />
      <TabRail
        label="Booking status"
        active={tab}
        hrefFor={(k) => `/student/bookings?tab=${k}`}
        tabs={(Object.keys(TABS) as Tab[]).map((k) => ({ key: k, label: TABS[k].label, count: inTab(k).length }))}
      />
      {list.length ? (
        <div className="grid gap-3">
          {list.map((b) => (
            <BookingCard key={b.id} href={`/student/bookings/${b.id}`} booking={b as BookingRow} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="A little breathing room."
          action={<Link href="/student/browse" className={buttonVariants()}>Explore campus resources <ArrowRight aria-hidden /></Link>}
        >
          Nothing in this section right now. Your next good idea might be waiting on the campus shelf.
        </EmptyState>
      )}
    </>
  );
}
