import Link from "next/link";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatSlot } from "@/components/format";
import { QrScanner } from "@/components/qr-scanner";
import { buttonVariants } from "@/components/ui/button";
import { PageHeading, Panel } from "@/components/ui/kit";
import { checkQr } from "@/lib/server/requests";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Owner scanner (PRD 10), mobile-first. A valid scan shows who the booking belongs to so the Owner
// confirms it is the same person before the handover or return screen opens.
export default async function ScanPage({ searchParams }: PageProps<"/owner/scan">) {
  const [{ t }] = await Promise.all([searchParams, requireViewer()]);
  const token = typeof t === "string" ? t : null;

  return (
    <>
      <PageHeading eyebrow="Handover desk · scanner" title="Scan the student's code." description="Pickup and return both start here. The code is signed and only works for its own slot." />
      {token ? <ScanResult token={token} /> : <QrScanner hint="Point the camera at the QR on the student's booking page." />}
    </>
  );
}

async function ScanResult({ token }: { token: string }) {
  const qr = await checkQr(token);
  const { data: b } = qr.ok
    ? await (await createClient())
        .from("bookings")
        .select("id, status, start_at, end_at, user_id, profiles!bookings_user_id_fkey(full_name, avatar_url, department, year, status), resources(name)")
        .eq("id", qr.payload.b)
        .maybeSingle()
    : { data: null };
  const expected = qr.ok && qr.payload.p === "pickup" ? ["approved"] : ["checked_out", "overdue"];
  const error = !qr.ok
    ? qr.error
    : !b
      ? "This booking is not for one of your resources."
      : b.user_id !== qr.payload.u
        ? "This code does not match the booking's student."
        : !expected.includes(b.status)
          ? `This booking is ${b.status.replaceAll("_", " ")}, so there is nothing to ${qr.payload.p === "pickup" ? "hand over" : "return"}.`
          : null;

  if (error || !b || !qr.ok)
    return (
      <Panel className="mx-auto max-w-md p-6 text-center">
        <ShieldAlert aria-hidden className="mx-auto size-10 text-danger-fg" />
        <p role="alert" className="mt-3 font-semibold">{error}</p>
        <Link href="/owner/scan" className={buttonVariants({ variant: "outline", className: "mt-4" })}>Scan again</Link>
      </Panel>
    );

  const p = b.profiles;
  const next = qr.payload.p === "pickup" ? `/owner/bookings/${b.id}/handover?t=${encodeURIComponent(token)}` : `/owner/bookings/${b.id}/handover?phase=return`;
  return (
    <Panel className="mx-auto max-w-md">
      <div className="grid justify-items-center gap-3 p-6 text-center">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-sage-strong"><ShieldCheck aria-hidden className="size-4" /> Valid {qr.payload.p} code</p>
        <Avatar name={p?.full_name ?? "Student"} src={p?.avatar_url} className="size-28 text-2xl" />
        <div>
          <h2 className="display text-3xl">{p?.full_name ?? "Student"}</h2>
          <p className="text-sm text-ink-soft">{p?.department}{p?.year ? ` · Year ${p.year}` : ""} · {p?.status === "verified" ? "Verified student" : p?.status.replaceAll("_", " ")}</p>
        </div>
        <p className="rounded-lg bg-wash px-3 py-2 text-sm"><strong>{b.resources?.name}</strong> · {formatSlot(b.start_at, b.end_at)}</p>
        <p className="text-sm text-ink-soft">Check the photo against the person in front of you.</p>
        <div className="grid w-full gap-2">
          <Link href={next} className={buttonVariants({ size: "lg" })}>Same person — {qr.payload.p === "pickup" ? "start handover" : "record return"} <ArrowRight aria-hidden /></Link>
          <Link href="/owner/scan" className={buttonVariants({ variant: "outline" })}>Not them — scan again</Link>
        </div>
      </div>
    </Panel>
  );
}
