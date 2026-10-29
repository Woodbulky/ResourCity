import { BadgeCheck, CircleCheck } from "lucide-react";
import { formatWhen } from "@/components/format";
import { BadgeDecisionForm } from "@/components/trust-forms";
import { CountBadge, EmptyState, Flag, PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import type { StoredExtraction } from "@/lib/contracts/ai";
import { ownerDesk } from "@/lib/server/queues";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Training certificates for badges this organisation issues (PRD 6, 12, 14). The AI reading sits
// next to the certificate as a suggestion; the Owner verifies or rejects.
export default async function OwnerBadges() {
  const viewer = await requireViewer();
  const d = await ownerDesk(viewer);
  const paths = d.certificates.flatMap((c) => (c.certificate_path ? [c.certificate_path] : []));
  const { data: signed } = paths.length ? await (await createClient()).storage.from("certificates").createSignedUrls(paths, 600) : { data: [] };
  const url = Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path!, s.signedUrl]));

  return (
    <>
      <PageHeading
        eyebrow="Training and qualifications"
        title={<>Certificates to <em>verify.</em></>}
        description="A verified badge unlocks resources that require it until it expires. Check the certificate itself; the AI reading is only a suggestion."
      />
      <Panel aria-labelledby="certs-heading">
        <PanelHeading id="certs-heading" title="Waiting for you" description="Oldest first." aside={<CountBadge>{d.certificates.length} waiting</CountBadge>} />
        {d.certificates.length ? (
          <ul className="divide-y divide-line">
            {d.certificates.map((c) => {
              const ai = c.ai_extraction as StoredExtraction | null;
              const href = c.certificate_path ? url[c.certificate_path] : undefined;
              return (
                <li key={c.id} className="grid gap-4 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)_280px]">
                  <div>
                    {href ? (
                      c.certificate_path?.endsWith(".pdf") ? (
                        <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-moss hover:underline">Open the PDF certificate</a>
                      ) : (
                        <a href={href} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                          <img src={href} alt={`${c.badge_types.name} certificate from ${c.profiles?.full_name ?? "the student"}`} className="w-full rounded-lg border border-line object-cover" />
                        </a>
                      )
                    ) : (
                      <p className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-line text-xs text-ink-soft">Certificate file unavailable</p>
                    )}
                  </div>
                  <div className="grid content-start gap-2 text-sm">
                    <p className="flex items-center gap-2 font-semibold"><BadgeCheck aria-hidden className="size-4 text-moss" /> {c.badge_types.name}</p>
                    <p>{c.profiles?.full_name ?? "Student"} · {c.profiles?.department ?? "Department not set"}{c.profiles?.year ? ` · Year ${c.profiles.year}` : ""}</p>
                    <p className="text-ink-soft">Sent {formatWhen(c.created_at)} · valid {c.badge_types.validity_days} days from the issue date</p>
                    <div className="rounded-lg border border-line p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">AI suggestion</p>
                      {!ai ? (
                        <p className="mt-1">Reading the certificate… refresh in a moment, or check it by eye.</p>
                      ) : "status" in ai ? (
                        <p className="mt-1">AI suggestion unavailable — continue manually. <span className="text-ink-soft">({ai.error})</span></p>
                      ) : (
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                          <dt className="text-ink-soft">Name</dt><dd>{ai.name_on_certificate ?? "—"} {ai.matches_student_name ? <Flag tone="good">matches</Flag> : <Flag tone="warn">check name</Flag>}</dd>
                          <dt className="text-ink-soft">Course</dt><dd>{ai.course_title ?? "—"}</dd>
                          <dt className="text-ink-soft">Issuer</dt><dd>{ai.issuer ?? "—"}</dd>
                          <dt className="text-ink-soft">Issued</dt><dd>{ai.issue_date ?? "—"}{ai.expiry_date ? ` · expires ${ai.expiry_date}` : ""}</dd>
                          <dt className="text-ink-soft">Confidence</dt><dd>{Math.round(ai.confidence * 100)}%</dd>
                        </dl>
                      )}
                    </div>
                  </div>
                  <BadgeDecisionForm badgeId={c.id} as="owner" issued={ai && !("status" in ai) ? ai.issue_date : null} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={CircleCheck} title="No certificates waiting." />
        )}
      </Panel>
    </>
  );
}
