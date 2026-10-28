import type { BookingStatus } from "@/lib/contracts/booking";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";
import { StatusChip } from "./status-chip";

const SHOWN: BookingStatus[] = [
  "pending_allocation", "pending_approval", "waitlisted", "offered", "approved",
  "checked_out", "overdue", "returned", "under_review",
];

// Owner and Manager home (PRD 12): one card per organisation with live booking counts by status.
// The queues themselves land with Phase 3 (approvals) and Phase 6 (dashboards).
export async function OrgOverview({ role }: { role: "owner" | "manager" }) {
  const viewer = await requireViewer();
  const orgs = viewer.memberships.filter((m) => m.role === role);
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("bookings")
    .select("status, approver_role, resources!inner(org_id)")
    .in("resources.org_id", orgs.map((o) => o.orgId))
    .in("status", SHOWN);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{role === "owner" ? "Owner" : "Manager"} dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {orgs.map((org) => {
          const mine = (rows ?? []).filter((r) => r.resources.org_id === org.orgId);
          const waitingForManager = mine.filter(
            (r) => r.status === "pending_approval" && r.approver_role === "manager",
          ).length;
          return (
            <section key={org.orgId} aria-labelledby={`org-${org.orgId}`} className="space-y-3 rounded-lg border bg-card p-4">
              <h2 id={`org-${org.orgId}`} className="font-semibold">{org.orgName}</h2>
              {mine.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active bookings.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {SHOWN.map((s) => {
                    const n = mine.filter((r) => r.status === s).length;
                    return n ? (
                      <li key={s} className="flex items-center gap-1 text-sm">
                        <span className="font-mono font-semibold">{n}</span>
                        <StatusChip status={s} />
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
              {role === "owner" && waitingForManager > 0 && (
                <p className="text-sm text-muted-foreground">{waitingForManager} waiting for Manager.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
