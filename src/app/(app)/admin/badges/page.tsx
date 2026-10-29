import { BadgeCheck } from "lucide-react";
import { BadgeTypeForm } from "@/components/admin-forms";
import { formatWhen, words } from "@/components/format";
import { EmptyState, Flag, PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import { appNow } from "@/lib/server/clock";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Badge types (PRD 12 Admin): name, validity, issuing organisation; issue and revoke history.
export default async function BadgeTypes() {
  await requireViewer();
  const supabase = await createClient();
  const [{ data: types }, { data: held }, { data: orgs }, { data: history }, now] = await Promise.all([
    supabase.from("badge_types").select("id, name, description, validity_days, organizations(name)").order("name"),
    supabase.from("user_badges").select("badge_type_id, status, expires_at"),
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("audit_events")
      .select("id, action, actor_role, reason, metadata, created_at, actor:profiles!audit_events_actor_id_fkey(full_name), subject:profiles!audit_events_subject_user_id_fkey(full_name)")
      .like("action", "BADGE_%")
      .neq("action", "BADGE_SUBMITTED")
      .order("id", { ascending: false })
      .limit(40),
    appNow(),
  ]);
  const tally = (id: string) => {
    const mine = (held ?? []).filter((b) => b.badge_type_id === id);
    return {
      active: mine.filter((b) => b.status === "verified" && (!b.expires_at || new Date(b.expires_at) > now)).length,
      pending: mine.filter((b) => b.status === "pending").length,
    };
  };
  const events = history ?? [];
  const badgeName = (m: unknown) => (m && typeof m === "object" && "name" in m ? String(m.name) : m && typeof m === "object" && "badge" in m ? String(m.badge) : "");

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · training badges"
        title={
          <>
            Trained hands, <em>verified.</em>
          </>
        }
        description="Badges gate machines and labs that need training first. The issuing organisation verifies each certificate; the badge expires after its validity."
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <Panel aria-labelledby="types-heading">
          <PanelHeading id="types-heading" title="Badge types" description={`${types?.length ?? 0} defined`} />
          {types?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                    <th scope="col" className="px-5 py-3 font-semibold">Badge</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Issued by</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Validity</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Holders</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">To verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {types.map((t) => {
                    const c = tally(t.id);
                    return (
                      <tr key={t.id} className="align-top">
                        <th scope="row" className="px-5 py-3 text-left">
                          <span className="block font-semibold">{t.name}</span>
                          {t.description && <span className="text-xs font-normal text-ink-soft">{t.description}</span>}
                        </th>
                        <td className="px-3 py-3">{t.organizations?.name}</td>
                        <td className="px-3 py-3 text-right font-mono">{t.validity_days} d</td>
                        <td className="px-3 py-3 text-right font-mono">{c.active}</td>
                        <td className="px-5 py-3 text-right font-mono">{c.pending}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={BadgeCheck} title="No badge types yet.">Add the first one alongside.</EmptyState>
          )}
        </Panel>
        <Panel aria-labelledby="new-heading">
          <PanelHeading id="new-heading" title="Add a badge type" description="Existing badges keep the validity they were issued with." />
          <BadgeTypeForm orgs={orgs ?? []} />
        </Panel>
      </div>

      <Panel aria-labelledby="history-heading" className="mt-6">
        <PanelHeading id="history-heading" title="Issue and revoke history" description="Verifications, rejections and new badge types, newest first." />
        {events.length ? (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Flag tone={e.action === "BADGE_VERIFIED" ? "good" : e.action === "BADGE_TYPE_CREATED" ? "neutral" : "danger"}>{words(e.action.replace("BADGE_", ""))}</Flag>
                <span className="min-w-0 flex-1">
                  <strong className="font-semibold">{badgeName(e.metadata) || "Badge"}</strong>
                  <span className="text-ink-soft">{e.subject ? ` · ${e.subject.full_name}` : ""} · by {e.actor?.full_name ?? e.actor_role}{e.reason ? ` · ${e.reason}` : ""}</span>
                </span>
                <span className="font-mono text-xs text-ink-soft">{formatWhen(e.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={BadgeCheck} title="No badge decisions yet." />
        )}
      </Panel>
    </>
  );
}
