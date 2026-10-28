import { VerificationDecision } from "@/components/verification-decision";
import { formatDateTime } from "@/lib/domain/time";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Admin home (PRD 12). Phase 2: the verification queue, oldest first (PRD 4).
export default async function AdminDashboard() {
  await requireViewer();
  const supabase = await createClient();
  const { data: queue } = await supabase
    .from("profiles")
    .select("id, full_name, email, department, year, roll_number, id_proof_path, verification_submitted_at")
    .eq("status", "pending_verification")
    .not("verification_submitted_at", "is", null)
    .order("verification_submitted_at");

  // Signed with the admin's own session: the id-proofs bucket lets only Admins read.
  const photos = await Promise.all(
    (queue ?? []).map(async (p) =>
      p.id_proof_path
        ? (await supabase.storage.from("id-proofs").createSignedUrl(p.id_proof_path, 300)).data?.signedUrl
        : undefined,
    ),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <section aria-labelledby="verify-heading" className="space-y-3">
        <h2 id="verify-heading" className="text-lg font-semibold">
          Pending verifications <span className="font-mono text-muted-foreground">({queue?.length ?? 0})</span>
        </h2>
        {!queue?.length && <p className="text-sm text-muted-foreground">No one is waiting.</p>}
        <ul className="space-y-4">
          {queue?.map((p, i) => (
            <li key={p.id} className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-[240px_1fr]">
              {photos[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={photos[i]} alt={`College ID card of ${p.full_name}`} className="w-full rounded-md border object-contain" />
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ID photo not available.</p>
              )}
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">{p.email}</p>
                  <p className="text-sm">
                    {p.department} · Year {p.year} · Roll <span className="font-mono">{p.roll_number}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDateTime(new Date(p.verification_submitted_at!))}
                  </p>
                </div>
                <VerificationDecision userId={p.id} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
