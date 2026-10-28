import { DoorOpen, ShieldAlert } from "lucide-react";
import { DoorCheckinForm } from "@/components/booking-forms";
import { PageHeading, Panel } from "@/components/ui/kit";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Door QR self check-in for spaces (PRD 10). The code on the door opens this page; the server checks
// for an approved booking of this space within its pickup window when the student taps check in.
export default async function CheckinPage({ params }: PageProps<"/checkin/[token]">) {
  const [{ token }] = await Promise.all([params, requireViewer()]);
  const { data: r } = await (await createClient())
    .from("resources")
    .select("name, location")
    .eq("door_qr_token", token)
    .in("form_template", ["space", "lab"])
    .maybeSingle();

  return (
    <>
      <PageHeading eyebrow="Door check-in" title={r?.name ?? "Unknown door code"} description={r?.location} />
      <Panel className="max-w-md p-6">
        {r ? (
          <div className="grid gap-4">
            <p className="flex items-start gap-2 text-sm text-ink-soft">
              <DoorOpen aria-hidden className="mt-0.5 size-5 shrink-0 text-moss" />
              Check in from 15 minutes before your slot until the end of its grace period. Your booking completes on its own at the end time.
            </p>
            <DoorCheckinForm token={token} />
          </div>
        ) : (
          <p role="alert" className="flex items-center gap-2 font-semibold"><ShieldAlert aria-hidden className="size-5 text-danger-fg" /> This door code is not recognised.</p>
        )}
      </Panel>
    </>
  );
}
