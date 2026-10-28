import { BookingDetail } from "@/components/booking-detail";
import { requireViewer } from "@/lib/server/viewer";

// Booking detail with its full audit timeline (PRD 12). RLS limits every read to the student and org staff.
export default async function BookingPage({ params }: PageProps<"/student/bookings/[id]">) {
  const { id } = await params;
  await requireViewer();
  return <BookingDetail id={id} as="student" />;
}
