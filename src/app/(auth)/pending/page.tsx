import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain/time";
import { signOut } from "@/lib/server/account";
import { requireViewer } from "@/lib/server/viewer";

// PRD 4: verification status, or the rejection reason and how to resubmit.
export default async function PendingPage() {
  const viewer = await requireViewer();
  return (
    <div className="space-y-6">
      {viewer.verificationSubmittedAt ? (
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clock aria-hidden className="size-6 text-[var(--yellow-dark-2)]" /> Verification pending
          </h1>
          <p className="text-sm">
            An Admin is checking your college ID (submitted {formatDateTime(new Date(viewer.verificationSubmittedAt))}).
            You will get a notification when they decide.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold">Verification needed</h1>
          {viewer.statusReason && (
            <p role="alert" className="rounded-md bg-[var(--red-light-3)] p-3 text-sm text-[var(--red-base)]">
              Not approved: {viewer.statusReason}
            </p>
          )}
          <p className="text-sm">Upload a clear photo of your college ID card to request resources.</p>
          <Link href="/onboarding" className={buttonVariants()}>Resubmit verification</Link>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t pt-6">
        <Link href="/student/browse" className={buttonVariants({ variant: "outline" })}>Browse resources</Link>
        <Link href="/notifications" className={buttonVariants({ variant: "ghost" })}>Notifications</Link>
        <form action={signOut}>
          <button type="submit" className={buttonVariants({ variant: "ghost" })}>Sign out</button>
        </form>
      </div>
    </div>
  );
}
