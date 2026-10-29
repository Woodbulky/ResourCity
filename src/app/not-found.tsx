import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { EmptyState } from "@/components/ui/kit";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid flex-1 place-items-center px-4 py-16">
      <EmptyState
        icon={MapPinOff}
        title="We couldn’t find that page"
        action={<Link href="/login" className={buttonVariants()}>Go to my dashboard</Link>}
      >
        The link may be old, or the booking or resource may belong to an organisation you can&apos;t see. Head back to
        your dashboard and open it from there.
      </EmptyState>
    </main>
  );
}
