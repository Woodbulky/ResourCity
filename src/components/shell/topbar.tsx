import { markNotificationsRead } from "@/lib/server/account";
import { appNow } from "@/lib/server/clock";
import { inbox } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";
import { Avatar } from "../avatar";
import { formatWhen, longDate } from "../format";
import { NotificationBell } from "./notification-bell";
import { MobileMenuButton } from "./shell-context";

export async function AppTopbar() {
  const [viewer, now, box] = await Promise.all([requireViewer(), appNow(), inbox()]);
  const role = viewer.isAdmin
    ? "Campus admin"
    : viewer.roles.manager
      ? "Manager"
      : viewer.roles.owner
        ? "Resource owner"
        : viewer.status === "verified"
          ? "Verified student"
          : viewer.status === "suspended"
            ? "Suspended student"
            : "Awaiting verification";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink/[0.07] bg-[#f9faf4]/85 px-4 backdrop-blur-lg sm:px-8 lg:px-10">
      <div className="flex min-w-0 items-center">
        <MobileMenuButton />
        <p className="flex min-w-0 items-center gap-2.5 text-sm text-ink-soft">
          <time dateTime={now.toISOString()} className="text-xs font-bold uppercase tracking-[0.12em] text-ink">
            {longDate(now)}
          </time>
          <span aria-hidden className="hidden size-1 rounded-full bg-line-strong md:block" />
          <span className="hidden truncate md:block">Deccan Valley Institute of Technology</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <NotificationBell
          unread={box.unread}
          markAllRead={markNotificationsRead}
          items={box.latest.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            link: n.link,
            urgent: n.urgent,
            unread: !n.read_at,
            when: formatWhen(n.created_at),
          }))}
        />
        <span aria-hidden className="hidden h-6 w-px bg-line sm:block" />
        <span className="flex items-center gap-2.5">
          <Avatar name={viewer.fullName || viewer.email} src={viewer.avatarUrl} className="size-8" />
          <span className="hidden min-w-0 sm:grid">
            <strong className="truncate text-sm font-semibold text-ink">{viewer.fullName || viewer.email}</strong>
            <small className="text-xs text-ink-soft">{role}</small>
          </span>
        </span>
      </div>
    </header>
  );
}

export function TopbarSkeleton() {
  return <div aria-hidden className="h-16 border-b border-ink/[0.07] bg-[#f9faf4]" />;
}
