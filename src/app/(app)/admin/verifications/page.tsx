import { CircleCheck, IdCard } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatWhen } from "@/components/format";
import { VerificationDecision } from "@/components/verification-decision";
import { CountBadge, EmptyState, PageHeading, waited } from "@/components/ui/kit";
import { appNow } from "@/lib/server/clock";
import { adminQueue } from "@/lib/server/queues";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Verification queue (PRD 4), oldest first. ID photos are private and deleted on either decision.
export default async function Verifications() {
  await requireViewer();
  const [{ verifications }, now] = await Promise.all([adminQueue(), appNow()]);
  const supabase = await createClient();
  // Signed with the admin's own session: the id-proofs bucket lets only Admins read.
  const photos = await Promise.all(
    verifications.map(async (p) =>
      p.id_proof_path ? (await supabase.storage.from("id-proofs").createSignedUrl(p.id_proof_path, 300)).data?.signedUrl : undefined,
    ),
  );

  return (
    <>
      <PageHeading
        eyebrow="Campus admin · student verification"
        title={
          <>
            A student&apos;s <em>first hello.</em>
          </>
        }
        description="Check the college details against the ID, then verify, or reject with a reason the student will see. The ID photo is deleted as soon as you decide."
        actions={<CountBadge>{verifications.length} waiting</CountBadge>}
      />
      {verifications.length ? (
        <ul className="grid gap-4">
          {verifications.map((p, i) => (
            <li key={p.id} className="grid gap-5 rounded-[var(--radius-card)] border border-line bg-paper p-5 md:grid-cols-[260px_1fr]">
              {photos[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={photos[i]} alt={`College ID card of ${p.full_name}`} className="w-full rounded-xl border border-line bg-cream object-contain" />
              ) : (
                <p className="grid min-h-36 place-items-center rounded-xl border border-dashed border-line-strong bg-cream p-4 text-center text-sm text-ink-soft">
                  <span><IdCard aria-hidden className="mx-auto mb-2 size-6" />ID photo not available.</span>
                </p>
              )}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Avatar name={p.full_name} className="size-11" />
                  <div className="min-w-0">
                    <p className="font-semibold">{p.full_name}</p>
                    <p className="truncate text-sm text-ink-soft">{p.email}</p>
                  </div>
                  <span className="ml-auto whitespace-nowrap text-xs font-medium text-pending-fg">waiting {waited(p.verification_submitted_at!, now)}</span>
                </div>
                <dl className="grid grid-cols-3 gap-3 rounded-xl bg-cream/70 p-3 text-sm">
                  <div><dt className="text-xs text-ink-soft">Department</dt><dd className="font-semibold">{p.department ?? "—"}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Year</dt><dd className="font-semibold">{p.year ?? "—"}</dd></div>
                  <div><dt className="text-xs text-ink-soft">Roll number</dt><dd className="font-mono font-semibold">{p.roll_number ?? "—"}</dd></div>
                </dl>
                <p className="text-xs text-ink-soft">Submitted {formatWhen(p.verification_submitted_at!)}</p>
                <VerificationDecision userId={p.id} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CircleCheck} title="Everyone is up to date.">New verification requests will show up here, oldest first.</EmptyState>
      )}
    </>
  );
}
