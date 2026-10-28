import { Suspense } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="main" className="flex flex-1 flex-col items-center bg-mist px-4 py-10">
      <Link href="/" className="mb-8 font-semibold text-evergreen">ResourCity</Link>
      <div className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-sm">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>{children}</Suspense>
      </div>
    </main>
  );
}
