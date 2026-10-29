import { formatDateTime } from "@/lib/domain/time";
import { auditFilters, auditSearch } from "@/lib/server/queues";
import { getViewer } from "@/lib/server/viewer";

// CSV export of the filtered audit log (PRD 12, 15): names and roles only, never emails or phones.
const COLUMNS = [
  "id", "time_ist", "action", "actor", "actor_role", "entity_type", "entity_id", "organisation", "resource",
  "affected_user", "from_state", "to_state", "reason", "policy_version",
] as const;

// Quote every cell; a leading = + - @ is neutralised so spreadsheets never run it as a formula.
const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`;
};

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return new Response("Only an Admin can export the audit log.", { status: 403 });
  const params = new URL(request.url).searchParams;
  const rows = await auditSearch(auditFilters((k) => params.get(k)), 5000);
  const lines = rows.map((e) =>
    [e.id, formatDateTime(new Date(e.created_at)), e.action, e.actor_name, e.actor_role, e.entity_type, e.entity_id, e.org_name,
      e.resource_name, e.subject_name, e.from_state, e.to_state, e.reason, e.policy_version].map(cell).join(","),
  );
  return new Response([COLUMNS.join(","), ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="resourcity-audit.csv"',
      "Cache-Control": "no-store",
    },
  });
}
