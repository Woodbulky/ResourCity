import { QrScanner } from "@/components/qr-scanner";
import { PageHeading } from "@/components/ui/kit";

// In-app door QR scanner for spaces (PRD 10); the code opens /checkin/{token}.
export default function StudentScanPage() {
  return (
    <>
      <PageHeading eyebrow="Door check-in" title="Scan the door code." description="At a classroom, hall, court or lab you booked, scan the QR on the door to check in." />
      <QrScanner hint="Point the camera at the QR code on the door." />
    </>
  );
}
