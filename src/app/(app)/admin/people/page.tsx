import { Building2, ShieldCheck, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { sentence } from "@/components/format";
import { GrantRoleForm, RevokeRole } from "@/components/role-forms";
import { Flag, PageHeading, Panel, PanelHeading, SummaryCard, SummaryRow } from "@/components/ui/kit";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Organisations and roles (PRD 12): grant or revoke Owner and Manager, scoped to one org, with a reason.
export default async function People() {
  await requireViewer();
  const supabase = await createClient();
  const [{ data: orgs }, { data: memberships }, { data: people }, { count: pending }] = await Promise.all([
    supabase.from("organizations").select("id, name, type").order("name"),
    supabase.from("memberships").select("id, user_id, org_id, role, reason, profiles!memberships_user_id_fkey(full_name, email)").order("role"),
    supabase.from("profiles").select("id, full_name, email, status, is_admin").order("full_name"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending_verification"),
  ]);
  const candidates = (people ?? []).filter((p) => !p.is_admin && p.status !== "pending_verification").map((p) => ({ id: p.id, name: `${p.full_name} · ${p.email}` }));
  const ms = memberships ?? [];

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · people and organisations"
        title={
          <>
            The people who <em>make it work.</em>
          </>
        }
        description="Owner and Manager roles are scoped to one organisation each, so one person can hold several. Every grant and revoke keeps its reason in the audit log."
      />
      <SummaryRow>
        <SummaryCard label="People" value={people?.length ?? 0} note={`${(people ?? []).filter((p) => p.status === "verified").length} verified`} icon={Users} />
        <SummaryCard label="Organisations" value={orgs?.length ?? 0} note="Clubs, labs, departments, offices" icon={Building2} />
        <SummaryCard label="Owners and Managers" value={ms.length} note="Roles scoped by organisation" icon={ShieldCheck} />
        <SummaryCard label="Pending verification" value={pending ?? 0} note="See the verification queue" icon={Users} href="/admin/verifications" />
      </SummaryRow>

      <Panel aria-labelledby="grant-heading" className="mb-6">
        <PanelHeading id="grant-heading" title="Grant a role" description="Pick a verified person, one organisation and a role. The person is notified and the change is audited." />
        <GrantRoleForm people={candidates} orgs={(orgs ?? []).map((o) => ({ id: o.id, name: o.name }))} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {(orgs ?? []).map((o) => {
          const mine = ms.filter((m) => m.org_id === o.id);
          return (
            <Panel key={o.id} aria-labelledby={`org-${o.id}`}>
              <PanelHeading id={`org-${o.id}`} title={o.name} aside={<Flag>{sentence(o.type)}</Flag>} />
              {mine.length ? (
                <ul className="divide-y divide-line">
                  {mine.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                      <Avatar name={m.profiles?.full_name ?? "?"} />
                      <span className="grid min-w-0 flex-1">
                        <strong className="truncate text-sm font-semibold">{m.profiles?.full_name}</strong>
                        <span className="truncate text-xs text-ink-soft">{m.reason}</span>
                      </span>
                      <Flag tone={m.role === "manager" ? "info" : "good"}>{sentence(m.role)}</Flag>
                      <RevokeRole userId={m.user_id} orgId={m.org_id} role={m.role} name={m.profiles?.full_name ?? ""} candidates={candidates} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-ink-soft">No Owners or Managers yet.</p>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}
