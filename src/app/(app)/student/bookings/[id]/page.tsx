import { notFound } from "next/navigation";
import { BOOKING_ROW_FIELDS, chipValues } from "@/components/booking-list";
import { StatusChip } from "@/components/status-chip";
import { Timeline } from "@/components/timeline";
import { formatDateTime } from "@/lib/domain/time";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Booking detail with its full audit timeline (PRD 12). RLS limits both reads to the student and org staff.
export default async function BookingPage({ params }: PageProps<"/student/bookings/[id]">) {
  const { id } = await params;
  await requireViewer();
  const supabase = await createClient();
  const [{ data: booking }, { data: events }] = await Promise.all([
    supabase.from("bookings").select(`${BOOKING_ROW_FIELDS}, status_reason`).eq("id", id).maybeSingle(),
    supabase
      .from("audit_events")
      .select("id, action, actor_role, reason, to_state, created_at")
      .eq("entity_type", "booking")
      .eq("entity_id", id)
      .order("created_at"),
  ]);
  if (!booking) notFound();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{booking.resources?.name ?? "Booking"}</h1>
        <p className="font-mono text-sm text-muted-foreground">
          {formatDateTime(new Date(booking.start_at))} – {formatDateTime(new Date(booking.end_at))}
        </p>
        <StatusChip status={booking.status} values={chipValues(booking)} />
        {booking.status_reason && <p className="text-sm">Reason: {booking.status_reason}</p>}
      </div>
      <section aria-labelledby="timeline-heading" className="space-y-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">Timeline</h2>
        <Timeline events={events ?? []} />
      </section>
    </div>
  );
}
