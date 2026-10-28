"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppArea } from "@/lib/domain/access";

const LABELS: Record<AppArea, string> = { student: "Student", owner: "Owner", manager: "Manager", admin: "Admin" };

// Shown only to users with more than one role (PRD 4).
export function RoleSwitcher({ areas }: { areas: AppArea[] }) {
  const current = usePathname().split("/")[1];
  if (areas.length < 2) return null;
  return (
    <nav aria-label="Switch role" className="flex gap-1 overflow-x-auto">
      {areas.map((a) => (
        <Link
          key={a}
          href={`/${a}`}
          aria-current={current === a ? "page" : undefined}
          className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted aria-[current=page]:bg-[var(--green-light-2)] aria-[current=page]:font-medium aria-[current=page]:text-evergreen"
        >
          {LABELS[a]}
        </Link>
      ))}
    </nav>
  );
}
