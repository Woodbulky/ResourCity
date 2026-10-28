import { Download } from "lucide-react";
import { AuditTable } from "@/components/audit-table";
import { formatWhen } from "@/components/format";
import { Button } from "@/components/ui/button";
import { ComingNext, PageHeading } from "@/components/ui/kit";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

const words = (s: string | null) => (s ? s.toLowerCase().replaceAll("_", " ") : "");

// Append-only audit log (PRD 12, 15): read-only for everyone, Admins included.
export default async function AuditLog() {
  await requireViewer();
  const { data } = await (await createClient())
    .from("audit_events")
    .select("id, action, actor_role, entity_type, from_state, to_state, reason, created_at, profiles!audit_events_actor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · append-only record"
        title={
          <>
            Every important thing, <em>accounted for.</em>
          </>
        }
        description="Actor, role and reason beside every consequential change. Nobody can edit or delete these records, Admins included."
        actions={<Button variant="outline" disabled><Download aria-hidden /> Export CSV</Button>}
      />
      <div className="mb-5 max-w-xl">
        <ComingNext phase={6}>Date, organisation and policy-version filters, and CSV export without contact details.</ComingNext>
      </div>
      <AuditTable
        rows={(data ?? []).map((e) => ({
          id: e.id,
          action: e.action,
          actor: e.profiles?.full_name ?? (e.actor_role === "system" ? "System" : "—"),
          actorRole: e.actor_role,
          entity: e.entity_type,
          change: e.from_state || e.to_state ? `${words(e.from_state) || "new"} → ${words(e.to_state)}` : "",
          reason: e.reason,
          when: formatWhen(e.created_at),
        }))}
      />
    </>
  );
}
