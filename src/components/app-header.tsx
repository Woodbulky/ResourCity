import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { areasFor, homeFor } from "@/lib/domain/access";
import { signOut } from "@/lib/server/account";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";
import { RoleSwitcher } from "./role-switcher";

export async function AppHeader() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  const unread = count ?? 0;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href={homeFor(viewer)} className="font-semibold text-evergreen">
          ResourCity
        </Link>
        <RoleSwitcher areas={areasFor(viewer)} />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/notifications"
            className="relative rounded-md p-2 hover:bg-muted"
            aria-label={`Notifications, ${unread} unread`}
          >
            <Bell aria-hidden className="size-5" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-[var(--red-base)] px-1 text-center text-xs font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <p role="status" aria-live="polite" className="sr-only">
            {unread ? `${unread} unread notifications` : ""}
          </p>
          <span className="hidden text-sm text-muted-foreground sm:inline">{viewer.fullName || viewer.email}</span>
          <form action={signOut}>
            <button type="submit" className="rounded-md p-2 hover:bg-muted" aria-label="Sign out">
              <LogOut aria-hidden className="size-5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
