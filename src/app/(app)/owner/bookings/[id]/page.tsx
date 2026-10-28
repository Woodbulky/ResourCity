import { BookingDetail } from "@/components/booking-detail";
import { requireViewer } from "@/lib/server/viewer";

// Staff view of one booking (PRD 10): requester, purpose, score, timeline and the next decision.
export default async function OwnerBookingPage({ params }: PageProps<"/owner/bookings/[id]">) {
  const { id } = await params;
  await requireViewer();
  return <BookingDetail id={id} as="owner" />;
}
