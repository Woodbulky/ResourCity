import { Download, Filter } from "lucide-react";
import { AuditTable } from "@/components/audit-table";
import { formatWhen } from "@/components/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { field, PageHeading, Panel } from "@/components/ui/kit";
import { AUDIT_FILTERS, auditFilters, auditSearch } from "@/lib/server/queues";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

const words = (s: string | null) => (s ? s.toLowerCase().replaceAll("_", " ") : "");

// Append-only audit log (PRD 12, 15): read-only for everyone, Admins included.
export default async function AuditLog({ searchParams }: PageProps<"/admin/audit">) {
  await requireViewer();
  const sp = await searchParams;
  const f = auditFilters((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined));
  const supabase = await createClient();
  const [rows, { data: orgs }, { data: resources }, { data: versions }] = await Promise.all([
    auditSearch(f, 300),
    supabase.from("organizations").select("id, name").order("name"),
    supabase.from("resources").select("id, name").order("name"),
    supabase.from("policy_versions").select("version").order("version", { ascending: false }),
  ]);
  const query = new URLSearchParams(f as Record<string, string>).toString();
  const filtered = Object.keys(f).length > 0;

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
        actions={
          <a href={`/admin/audit/export${query ? `?${query}` : ""}`} className={buttonVariants({ variant: "outline" })} download>
            <Download aria-hidden /> Export CSV
          </a>
        }
      />

      <Panel aria-label="Filter the audit log" className="mb-5">
        <form method="get" className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Text name="actor" label="Actor (name or role)" value={f.actor} />
          <Text name="user" label="Affected user" value={f.user} />
          <Text name="action" label="Event type" value={f.action} placeholder="e.g. MANAGER_OVERRIDE" />
          <Pick name="resource" label="Resource" value={f.resource} options={(resources ?? []).map((r) => [r.id, r.name])} />
          <Pick name="org" label="Organisation" value={f.org} options={(orgs ?? []).map((o) => [o.id, o.name])} />
          <Pick name="version" label="Policy version" value={f.version} options={(versions ?? []).map((v) => [String(v.version), `v${v.version}`])} />
          <Text name="from" label="From" type="date" value={f.from} />
          <Text name="to" label="To" type="date" value={f.to} />
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm"><Filter aria-hidden /> Apply filters</Button>
            {filtered && <a href="/admin/audit" className={buttonVariants({ variant: "ghost", size: "sm" })}>Clear</a>}
          </div>
        </form>
      </Panel>

      <AuditTable
        rows={rows.map((e) => ({
          id: e.id,
          action: e.action,
          actor: e.actor_name ?? (e.actor_role === "system" ? "System" : "—"),
          actorRole: e.actor_role,
          entity: [words(e.entity_type), e.resource_name, e.org_name, e.subject_name && `about ${e.subject_name}`, e.policy_version && `policy v${e.policy_version}`]
            .filter(Boolean)
            .join(" · "),
          change: e.from_state || e.to_state ? `${words(e.from_state) || "new"} → ${words(e.to_state)}` : "",
          reason: e.reason,
          when: formatWhen(e.created_at),
        }))}
      />
    </>
  );
}

const label = "text-xs font-semibold";

function Text({ name, label: text, value, type = "text", placeholder }: { name: (typeof AUDIT_FILTERS)[number]; label: string; value?: string; type?: string; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className={label}>{text}</span>
      <input name={name} type={type} defaultValue={value} placeholder={placeholder} maxLength={100} className={field} />
    </label>
  );
}

function Pick({ name, label: text, value, options }: { name: (typeof AUDIT_FILTERS)[number]; label: string; value?: string; options: string[][] }) {
  return (
    <label className="grid gap-1">
      <span className={label}>{text}</span>
      <select name={name} defaultValue={value ?? ""} className={field}>
        <option value="">Any</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}
