import { BookingDetail } from "@/components/booking-detail";
import { requireViewer } from "@/lib/server/viewer";

// Admin view of one booking (PRD 3, 11): conflict-of-interest damage cases are decided here.
export default async function AdminBookingPage({ params }: PageProps<"/admin/bookings/[id]">) {
  const { id } = await params;
  await requireViewer();
  return <BookingDetail id={id} as="admin" />;
}
