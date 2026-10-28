"use client";
import { createContext, use, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "cn";

// Mobile drawer state shared by the sidebar and the topbar menu button. They stream in
// separate Suspense boundaries, so the state lives above both. The drawer remembers the path
// it was opened on, so navigating anywhere closes it without an effect.
const ShellContext = createContext<{ openOn: string | null; setOpenOn: (path: string | null) => void } | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [openOn, setOpenOn] = useState<string | null>(null);
  useEffect(() => {
    if (!openOn) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openOn]);
  return <ShellContext value={{ openOn, setOpenOn }}>{children}</ShellContext>;
}

const useShell = () => {
  const ctx = use(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside ShellProvider");
  return ctx;
};

export function MobileMenuButton() {
  const { openOn, setOpenOn } = useShell();
  const pathname = usePathname();
  const open = openOn === pathname;
  return (
    <button
      type="button"
      onClick={() => setOpenOn(pathname)}
      aria-label="Open navigation"
      aria-expanded={open}
      aria-controls="app-sidebar"
      className="mr-3 grid size-10 place-items-center rounded-[10px] border border-line bg-paper text-ink lg:hidden"
    >
      <Menu aria-hidden className="size-5" />
    </button>
  );
}

// Both readers of the pathname render inside Suspense boundaries (sidebar and topbar).
export function SidebarFrame({ children }: { children: React.ReactNode }) {
  const { openOn, setOpenOn } = useShell();
  const open = openOn === usePathname();
  return (
    <>
      <div
        aria-hidden
        onClick={() => setOpenOn(null)}
        className={cn(
          "fixed inset-0 z-40 bg-pine-deep/40 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-pine-deep px-4 pb-4 pt-6 text-[#e9f0e5] transition-transform duration-300 lg:z-20 lg:w-64 lg:translate-x-0",
          open ? "translate-x-0 shadow-[15px_0_45px_rgba(7,32,23,0.2)]" : "-translate-x-[102%]",
        )}
      >
        {children}
      </aside>
    </>
  );
}
