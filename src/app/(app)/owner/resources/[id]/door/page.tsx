import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/booking-forms";
import { Panel } from "@/components/ui/kit";
import { origin } from "@/lib/server/requests";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Printable door QR for spaces (PRD 6, 10). Students scan it to check in to an approved booking.
export default async function DoorQrPage({ params }: PageProps<"/owner/resources/[id]/door">) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
  const { data: r } = await (await createClient())
    .from("resources")
    .select("name, location, door_qr_token, form_template, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!r || !viewer.memberships.some((m) => m.orgId === r.org_id) || !["space", "lab"].includes(r.form_template)) notFound();
  const url = `${await origin()}/checkin/${r.door_qr_token}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <Panel className="mx-auto grid max-w-lg justify-items-center gap-4 p-8 text-center print:border-0">
      <p className="eyebrow">ResourCity · door check-in</p>
      <h1 className="display text-4xl">{r.name}</h1>
      <p className="text-ink-soft">{r.location}</p>
      <div role="img" aria-label="Door check-in QR code" className="size-72 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="max-w-sm text-sm">Booked this space? Scan with your phone within 15 minutes of your start time to check in.</p>
      <PrintButton />
    </Panel>
  );
}
