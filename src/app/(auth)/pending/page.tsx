import Link from "next/link";
import { Bell, CircleCheck, Clock, IdCard, LogOut, Search, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain/time";
import { signOut } from "@/lib/server/account";
import { requireViewer } from "@/lib/server/viewer";

// PRD 4: verification status, or the rejection reason and how to resubmit.
export default async function PendingPage() {
  const viewer = await requireViewer();
  const submitted = viewer.verificationSubmittedAt;
  const steps = [
    { icon: CircleCheck, label: "Signed in with Google", done: true },
    { icon: IdCard, label: "College details and ID submitted", done: !!submitted },
    { icon: Clock, label: "Admin verifies your ID", done: false, current: !!submitted },
  ];

  return (
    <div className="space-y-6">
      {submitted ? (
        <div>
          <p className="eyebrow">Step 2 of 2 · verification</p>
          <h1 className="display mt-2 text-5xl">
            Almost <em>there.</em>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            An Admin is checking your college ID, submitted {formatDateTime(new Date(submitted))}. You&apos;ll get a
            notification the moment they decide, and your 100 weekly credits start then.
          </p>
        </div>
      ) : (
        <div>
          <p className="eyebrow">Verification needed</p>
          <h1 className="display mt-2 text-5xl">
            One more <em>look.</em>
          </h1>
          {viewer.statusReason && (
            <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Not approved:</strong> {viewer.statusReason}
              </span>
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">Upload a clear photo of your college ID card to request resources.</p>
        </div>
      )}

      <ol className="grid gap-2 rounded-xl border border-line bg-cream/60 p-4">
        {steps.map(({ icon: Icon, label, done, current }) => (
          <li key={label} className="flex items-center gap-3 text-sm">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-lg",
                done ? "bg-sage text-moss" : current ? "bg-pending-bg text-pending-fg" : "bg-wash text-ink-soft",
              )}
            >
              <Icon aria-hidden className="size-4" />
            </span>
            <span className={done || current ? "font-semibold" : "text-ink-soft"}>{label}</span>
            <span className="sr-only">{done ? "(done)" : current ? "(in progress)" : "(to do)"}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2 border-t border-line pt-6">
        {!submitted && (
          <Link href="/onboarding" className={buttonVariants()}>
            Resubmit verification
          </Link>
        )}
        <Link href="/student/browse" className={buttonVariants({ variant: submitted ? "default" : "outline" })}>
          <Search aria-hidden /> Browse resources
        </Link>
        <Link href="/notifications" className={buttonVariants({ variant: "ghost" })}>
          <Bell aria-hidden /> Notifications
        </Link>
        <form action={signOut}>
          <button type="submit" className={buttonVariants({ variant: "ghost" })}>
            <LogOut aria-hidden /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
