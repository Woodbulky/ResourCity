import { Suspense } from "react";
import { ShellProvider } from "@/components/shell/shell-context";
import { AppSidebar, SidebarSkeleton } from "@/components/shell/sidebar";
import { AppTopbar, TopbarSkeleton } from "@/components/shell/topbar";
import PageSkeleton from "./loading";

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

