import { HandoverScreen } from "@/components/handover-screen";
import { requireViewer } from "@/lib/server/viewer";

// Pickup or return condition record for one booking (PRD 10).
export default async function OwnerHandoverPage({ params, searchParams }: PageProps<"/owner/bookings/[id]/handover">) {
  const [{ id }, sp] = await Promise.all([params, searchParams, requireViewer()]);
  const token = typeof sp.t === "string" ? sp.t : undefined;
  return <HandoverScreen id={id} as="owner" token={token} phase={sp.phase === "return" ? "return" : "checkout"} />;
}
