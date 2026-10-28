import { CircleCheck } from "lucide-react";
import { BookingCard, type BookingRow } from "@/components/booking-list";
import { EmptyState, PageHeading, TabRail, waited } from "@/components/ui/kit";
import { ownerDesk } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

const TABS = [
  { key: "review", label: "Needs review" },
  { key: "manager", label: "Waiting for Manager" },
] as const;

// Owner approval queue (PRD 10): oldest first; restricted requests show as "Waiting for Manager".
export default async function OwnerRequests({ searchParams }: PageProps<"/owner/requests">) {
  const viewer = await requireViewer();
  const [{ tab: raw }, d] = await Promise.all([searchParams, ownerDesk(viewer)]);
  const tab = raw === "manager" ? "manager" : "review";
  const list = tab === "manager" ? d.waitingForManager : d.needsReview;

  return (
    <>
      <PageHeading
        eyebrow={`${d.orgs.map((o) => o.orgName).join(" · ")} · owner queue`}
        title={
          <>
            Every request, <em>a new possibility.</em>
          </>
        }
        description="Check the plan and the timing, then make a clear decision. Every reject or waitlist needs a reason the student will see."
      />
      <TabRail
        label="Request queue"
        active={tab}
        hrefFor={(k) => `/owner/requests?tab=${k}`}
        tabs={TABS.map((t) => ({ ...t, count: (t.key === "manager" ? d.waitingForManager : d.needsReview).length }))}
      />
      {list.length ? (
        <div className="grid gap-3">
          {list.map((b) => (
            <BookingCard
              key={b.id}
              href={`/owner/bookings/${b.id}`}
              booking={b as unknown as BookingRow}
              person={`${b.profiles?.full_name ?? "Student"}${b.profiles?.department ? ` · ${b.profiles.department}` : ""}`}
              note={
                tab === "manager"
                  ? `The Manager decides this one${b.is_exception ? " (exception request)" : ""}. Waiting ${waited(b.created_at, d.now)}.`
                  : `${b.purpose_category.replaceAll("_", " ")}${b.purpose_text ? `: ${b.purpose_text}` : ""} · waiting ${waited(b.created_at, d.now)}`
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={CircleCheck} title="All caught up.">
          {tab === "manager" ? "Nothing is waiting on a Manager." : "Every request has a place to land. You're clear for now."}
        </EmptyState>
      )}
    </>
  );
}
