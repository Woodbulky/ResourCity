import { BookingDetail } from "@/components/booking-detail";
import { requireViewer } from "@/lib/server/viewer";

// Staff view of one booking (PRD 10): requester, purpose, score, timeline and the next decision.
export default async function ManagerBookingPage({ params }: PageProps<"/manager/bookings/[id]">) {
  const { id } = await params;
  await requireViewer();
  return <BookingDetail id={id} as="manager" />;
}
