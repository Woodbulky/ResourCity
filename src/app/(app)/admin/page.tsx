import Link from "next/link";
import { BellRing, Building2, CircleCheck, Clock, LifeBuoy, ScrollText, ShieldCheck, Siren, Users } from "lucide-react";
import { DemoControls, EmergencyDecisionForm } from "@/components/admin-forms";
import { formatWhen } from "@/components/format";
import { QueueRow } from "@/components/staff";
import { buttonVariants } from "@/components/ui/button";
import { CountBadge, EmptyState, MiniStat, PageHeading, Panel, PanelFooterLink, PanelHeading, SectionTitle, SummaryCard, SummaryRow } from "@/components/ui/kit";
import { appNow } from "@/lib/server/clock";
import { adminQueue } from "@/lib/server/queues";
import { currentPolicy } from "@/lib/server/student";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Admin home (PRD 12): action required first, then policy and the campus at a glance.
export default async function AdminHome() {
  await requireViewer();
  const supabase = await createClient();
  const [q, policy, now, { count: listings }, { count: orgs }, { count: students }, { data: latest }] = await Promise.all([
    adminQueue(),
    currentPolicy(),
    appNow(),
    supabase.from("resources").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("organizations").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "verified"),
    supabase.from("policy_versions").select("version, reason, created_at").order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const v = policy.values;

  return (
    <>
      <PageHeading
        eyebrow="Deccan Valley · campus administration"
        title={
          <>
            The shared campus, <em>in good hands.</em>
          </>
        }
        description="A calm, accountable overview of the people, policies and decisions that keep sharing fair. Admins never approve ordinary bookings."
        actions={<Link href="/admin/audit" className={buttonVariants({ variant: "outline" })}><Clock aria-hidden /> Open audit log</Link>}
      />

      <SummaryRow>
        <SummaryCard label="Verifications" value={q.verifications.length} note="Oldest first" icon={ShieldCheck} href="/admin/verifications" />
        <SummaryCard label="Emergency credits" value={q.emergency.length} note={q.emergency.length ? "Need a decision" : "None waiting"} icon={LifeBuoy} />
        <SummaryCard label="Escalations" value={q.escalations} note="Never auto-decided" icon={BellRing} />
        <SummaryCard label="High-severity incidents" value={q.highIncidents} note={q.highIncidents ? "Open now" : "None open"} tone={q.highIncidents ? "alert" : "default"} icon={Siren} />
      </SummaryRow>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <Panel aria-labelledby="action-heading">
          <PanelHeading id="action-heading" title="Action required" description="Student verification and emergency credit requests, oldest first." aside={<CountBadge>{q.verifications.length + q.emergency.length} waiting</CountBadge>} />
          {q.verifications.length || q.emergency.length ? (
            <ul className="divide-y divide-line">
              {q.verifications.slice(0, 4).map((p) => (
                <QueueRow
                  key={p.id}
                  name={p.full_name}
                  title={`${p.full_name} · verification`}
                  detail={`${p.department ?? "Department not set"} · Year ${p.year ?? "—"}`}
                  since={p.verification_submitted_at!}
                  now={now}
                  href="/admin/verifications"
                  primary
                />
              ))}
              {q.emergency.map((e) => (
                <li key={e.id} className="grid gap-3 px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-full bg-info-bg text-info-fg"><LifeBuoy aria-hidden className="size-4" /></span>
                    <span className="grid min-w-0 flex-1">
                      <strong className="text-sm font-semibold">{e.profiles?.full_name ?? "Student"} · {e.amount} emergency credits</strong>
                      <span className="text-sm text-ink-soft">{e.urgency === "high" ? "Urgent · " : ""}{e.reason}</span>
                    </span>
                    <span className="text-xs text-ink-soft">{formatWhen(e.created_at)}</span>
                  </div>
                  <EmergencyDecisionForm requestId={e.id} amount={e.amount} cap={v.emergency_grant_cap} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={CircleCheck} title="Nothing waiting.">Verifications and emergency requests land here.</EmptyState>
          )}
          <PanelFooterLink href="/admin/verifications">Open the verification queue</PanelFooterLink>
        </Panel>

        <Panel aria-labelledby="policy-heading">
          <PanelHeading id="policy-heading" title="Campus policy" description="Versioned. Bookings keep the version they were approved under." aside={<span className="rounded-md bg-wash px-2 py-1 text-xs font-semibold text-moss">VERSION {policy.version}</span>} />
          <ul className="divide-y divide-line">
            {[
              ["Weekly student allowance", `${v.weekly_allowance} credits · resets Monday 00:00 IST`],
              ["Emergency grant cap", `${v.emergency_grant_cap} credits · once per academic year`],
              ["No-show strikes", `${v.strikes.limit} in ${v.strikes.window_days} days, then Manager review`],
              ["Dispute response window", `${v.dispute_response_hours} hours`],
            ].map(([k, val]) => (
              <li key={k} className="flex gap-3 px-5 py-3">
                <span aria-hidden className="w-1 self-stretch rounded-full bg-[#7ca274]" />
                <span className="grid"><strong className="text-sm font-semibold">{k}</strong><span className="text-sm text-ink-soft">{val}</span></span>
              </li>
            ))}
          </ul>
          {latest && <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">v{latest.version} · {formatWhen(latest.created_at)} · {latest.reason}</p>}
          <PanelFooterLink href="/admin/policies">Review campus policies</PanelFooterLink>
        </Panel>
      </section>

      {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && (
        <Panel aria-labelledby="demo-heading" className="mt-6">
          <PanelHeading
            id="demo-heading"
            title="Demo controls"
            description={`Campus time is ${formatWhen(now)}. Every change is audited; the scheduler also runs every minute.`}
            aside={<Clock aria-hidden className="size-5 text-moss" />}
          />
          <DemoControls />
        </Panel>
      )}

      <SectionTitle title="Campus, at a glance" description="Shared resources are doing more, together." />
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat icon={Building2} value={listings ?? 0} label="Active resource listings" />
        <MiniStat icon={Users} value={orgs ?? 0} label="Campus organisations" />
        <MiniStat icon={ScrollText} value={students ?? 0} label="Verified students" />
      </div>
    </>
  );
}
