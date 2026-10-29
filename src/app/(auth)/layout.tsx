import { Suspense } from "react";
import Link from "next/link";
import { BadgeCheck, QrCode, Wallet } from "lucide-react";
import { Wordmark } from "@/components/brand";

const FACTS = [
  { icon: BadgeCheck, text: "Verified students only: college Google account and ID check" },
  { icon: Wallet, text: "100 free credits every Monday, never worth cash" },
  { icon: QrCode, text: "QR handovers with photos signed by both sides" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen flex-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <aside className="on-dark relative hidden overflow-hidden bg-pine-deep px-12 py-10 text-[#e9f0e5] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:self-start">
        <span aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full border border-leaf/15 shadow-[0_0_0_34px_rgba(191,232,121,0.04),0_0_0_70px_rgba(191,232,121,0.03)]" />
        <Link href="/" className="relative w-fit rounded-md" aria-label="ResourCity home">
          <Wordmark dark />
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="eyebrow text-[#b8ceac]">Deccan Valley · shared campus</p>
          <p className="display mt-4 text-6xl text-[#f8f7ed]">
            Good things shouldn&apos;t sit <em>still.</em>
          </p>
          <ul className="mt-8 grid gap-3">
            {FACTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-[#c3d0c6]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-leaf/10 text-leaf"><Icon aria-hidden className="size-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main id="main" className="flex flex-col items-center bg-cream px-4 py-8 sm:px-8 lg:justify-center">
        <Link href="/" className="mb-8 rounded-md lg:hidden" aria-label="ResourCity home">
          <Wordmark />
        </Link>
        <div className="page-in w-full max-w-lg rounded-[18px] border border-line bg-paper p-6 shadow-card sm:p-8">
          <Suspense fallback={<p className="text-sm text-ink-soft">Loading…</p>}>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
