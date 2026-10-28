import { Building2, Clock, PackageOpen, Plus, TriangleAlert } from "lucide-react";
import { ResourceTile } from "@/components/staff";
import { Button } from "@/components/ui/button";
import { ComingNext, EmptyState, PageHeading, SummaryCard, SummaryRow } from "@/components/ui/kit";
import { ownerDesk } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Owner listings (PRD 6). The listing form with four templates lands in Phase 3.
export default async function OwnerResources() {
  const viewer = await requireViewer();
  const d = await ownerDesk(viewer);
  const out = new Map<string, number>();
  for (const b of d.borrowed) out.set(b.resources.id, (out.get(b.resources.id) ?? 0) + 1);
  const notBookable = d.resources.filter((r) => r.status !== "active");
  const units = d.resources.reduce((s, r) => s + r.quantity, 0);

  return (
    <>
      <PageHeading
        eyebrow={`${d.orgs.map((o) => o.orgName).join(" · ")} · listings`}
        title={
          <>
            A shelf <em>worth sharing.</em>
          </>
        }
        description="Keep resources up to date and easy to find. Rule changes apply to new requests only."
        actions={<Button disabled><Plus aria-hidden /> Add a resource</Button>}
      />
      <div className="mb-5 max-w-xl">
        <ComingNext phase={3}>The listing form with Space, Lab, Portable and Machine templates, rules and guided shots.</ComingNext>
      </div>
      <SummaryRow>
        <SummaryCard label="Listings" value={d.resources.length} note={`${units} units in total`} icon={Building2} />
        <SummaryCard label="Borrowed now" value={d.borrowed.length} note={`${d.returnsDue.length} due back today`} icon={PackageOpen} />
        <SummaryCard label="Awaiting pickup" value={d.upcomingPickups.length} note="Approved bookings" icon={Clock} />
        <SummaryCard label="Not bookable" value={notBookable.length} note={notBookable.length ? "Paused, maintenance or unsafe" : "Everything is open"} tone={notBookable.length ? "alert" : "default"} icon={TriangleAlert} />
      </SummaryRow>
      {d.resources.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {d.resources.map((r) => <ResourceTile key={r.id} r={r} out={out.get(r.id)} />)}
        </div>
      ) : (
        <EmptyState icon={Building2} title="No listings yet.">Your first resource will appear here.</EmptyState>
      )}
    </>
  );
}
