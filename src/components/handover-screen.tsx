import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { formatSlot } from "@/components/format";
import { HandoverForm } from "@/components/handover-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeading, Panel } from "@/components/ui/kit";
import { checklistSchema, safetyRulesSchema } from "@/lib/contracts/resource";
import { checkQr } from "@/lib/server/requests";
import { createClient } from "@/lib/server/supabase";

// Handover (pickup) or return screen (PRD 10). The resource's own checklist and guided shots, padded
// to the minimum of 3 photos. Pickup opens only from a valid scan of the student's QR.
export async function HandoverScreen({ id, as, token, phase }: { id: string; as: "owner" | "manager"; token?: string; phase: "checkout" | "return" }) {
  const { data: b } = await (await createClient())
    .from("bookings")
    .select("id, status, start_at, end_at, profiles!bookings_user_id_fkey(full_name), resources(name, checklist, safety_rules)")
    .eq("id", id)
    .maybeSingle();
  if (!b?.resources) notFound();

  const expected = phase === "checkout" ? ["approved"] : ["checked_out", "overdue"];
  const qr = phase === "checkout" ? (token ? await checkQr(token) : { ok: false as const, error: "Scan the student's pickup QR to start the handover." }) : null;
  const error = !expected.includes(b.status)
    ? `This booking is ${b.status.replaceAll("_", " ")}.`
    : qr && !qr.ok
      ? qr.error
      : qr?.ok && qr.payload.b !== b.id
        ? "That QR belongs to a different booking."
        : null;

  const checklist = checklistSchema.safeParse(b.resources.checklist).data ?? { items: [], shots: [] };
  const shots = [...checklist.shots];
  for (let n = 1; shots.length < 3; n++) if (!shots.includes(`Overall view ${n}`)) shots.push(`Overall view ${n}`);
  const safety = safetyRulesSchema.safeParse(b.resources.safety_rules).data ?? safetyRulesSchema.parse({});

  return (
    <>
      <Link href={`/${as}/bookings/${b.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-moss hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Booking
      </Link>
      <PageHeading
        eyebrow={`${phase === "checkout" ? "Pickup" : "Return"} · condition record`}
        title={b.resources.name}
        description={`${b.profiles?.full_name ?? "Student"} · ${formatSlot(b.start_at, b.end_at)}. Check each item together and take every shot.`}
      />
      {error ? (
        <Panel className="max-w-md p-6">
          <ShieldAlert aria-hidden className="size-8 text-danger-fg" />
          <p role="alert" className="mt-3 font-semibold">{error}</p>
          {phase === "checkout" && <Link href="/owner/scan" className={buttonVariants({ className: "mt-4" })}>Open scanner</Link>}
        </Panel>
      ) : (
        <Panel className="max-w-3xl p-5 sm:p-6">
          <HandoverForm
            bookingId={b.id}
            as={as}
            phase={phase}
            token={token}
            items={checklist.items}
            shots={shots}
            supervisionRequired={safety.supervision_required}
          />
        </Panel>
      )}
    </>
  );
}
