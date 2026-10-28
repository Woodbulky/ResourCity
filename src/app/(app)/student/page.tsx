import { BOOKING_ROW_FIELDS, BookingList } from "@/components/booking-list";
import { formatDateTime } from "@/lib/domain/time";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

export default async function StudentDashboard() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select(BOOKING_ROW_FIELDS)
    .eq("user_id", viewer.id)
    .order("start_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Hi {viewer.fullName.split(" ")[0] || "there"}</h1>

      {viewer.status === "suspended" && (
        <div role="alert" className="rounded-lg border border-[var(--red-base)] bg-[var(--red-light-3)] p-4 text-sm">
          <p className="font-semibold">Booking privileges suspended
            {viewer.suspendedUntil && ` until ${formatDateTime(new Date(viewer.suspendedUntil))}`}.
          </p>
          {viewer.statusReason && <p className="mt-1">Reason: {viewer.statusReason}</p>}
          <p className="mt-1">You can still view your history and must return anything you have borrowed.</p>
        </div>
      )}

      <section aria-labelledby="action-heading" className="space-y-3">
        <h2 id="action-heading" className="text-lg font-semibold">Needs your action</h2>
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Nothing needs you right now.</p>
      </section>

      <section aria-labelledby="bookings-heading" className="space-y-3">
        <h2 id="bookings-heading" className="text-lg font-semibold">My bookings</h2>
        <BookingList bookings={bookings ?? []} hrefBase="/student/bookings" />
      </section>
    </div>
  );
}
