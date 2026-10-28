import { Suspense } from "react";
import { ShellProvider } from "@/components/shell/shell-context";
import { AppSidebar, SidebarSkeleton } from "@/components/shell/sidebar";
import { AppTopbar, TopbarSkeleton } from "@/components/shell/topbar";

// Signed-in shell (PRD 12): sidebar per role area, topbar with campus date and inbox.
// Each part reads the session behind its own Suspense boundary so none blocks the others.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ShellProvider>
      <Suspense fallback={<SidebarSkeleton />}>
        <AppSidebar />
      </Suspense>
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <Suspense fallback={<TopbarSkeleton />}>
          <AppTopbar />
        </Suspense>
        <main id="main" tabIndex={-1} className="page-in mx-auto w-full max-w-[1440px] flex-1 px-4 py-7 outline-none sm:px-8 lg:px-10">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </main>
        <footer className="flex flex-wrap justify-between gap-3 px-4 pb-5 pt-2 text-xs text-ink-soft sm:px-8 lg:px-10">
          <span>Made for a campus that shares.</span>
          <span>ResourCity · Deccan Valley is a fictional demo campus</span>
        </footer>
      </div>
    </ShellProvider>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy className="animate-pulse space-y-4">
      <span className="sr-only">Loading…</span>
      <div className="h-4 w-40 rounded bg-wash" />
      <div className="h-12 w-2/3 max-w-xl rounded-lg bg-wash" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-[var(--radius-card)] bg-wash" />
        ))}
      </div>
      <div className="h-64 rounded-[var(--radius-card)] bg-wash" />
    </div>
  );
}
