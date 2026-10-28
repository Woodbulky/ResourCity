import Link from "next/link";
import { Bell, BellRing, Inbox } from "lucide-react";
import { cn } from "cn";
import { formatWhen } from "@/components/format";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeading, Panel } from "@/components/ui/kit";
import { markNotificationsRead } from "@/lib/server/account";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

export default async function NotificationsPage() {
  await requireViewer();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("notifications")
    .select("id, title, body, link, urgent, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const unread = items?.filter((n) => !n.read_at).length ?? 0;

  return (
    <>
      <PageHeading
        eyebrow="Good to know"
        title={
          <>
            Your campus, <em>in the loop.</em>
          </>
        }
        description="Every update about your bookings, cases and roles. Nobody is ever told about someone else's private case."
        actions={
          unread > 0 && (
            <form action={markNotificationsRead}>
              <Button type="submit" variant="outline">Mark all read</Button>
            </form>
          )
        }
      />
      {items?.length ? (
        <Panel>
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Link href={n.link ?? "#"} className={cn("relative flex gap-3 px-5 py-4 hover:bg-cream/60", !n.read_at && "bg-[#f7f9f1]")}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", n.urgent ? "bg-danger-bg text-danger-fg" : "bg-sage text-moss")}>
                    {n.urgent ? <BellRing aria-hidden className="size-4" /> : <Bell aria-hidden className="size-4" />}
                  </span>
                  <span className="grid min-w-0 gap-1 pr-6">
                    <strong className="text-sm font-semibold">
                      {!n.read_at && <span className="sr-only">Unread: </span>}
                      {n.urgent && <span className="mr-2 rounded bg-danger-bg px-1.5 py-0.5 text-xs font-bold text-danger-fg">Urgent</span>}
                      {n.title}
                    </strong>
                    {n.body && <span className="text-sm leading-relaxed text-ink-soft">{n.body}</span>}
                    <time className="text-xs text-ink-soft" dateTime={n.created_at}>{formatWhen(n.created_at)}</time>
                  </span>
                  {!n.read_at && <i aria-hidden className="absolute right-5 top-5 size-2 rounded-full bg-moss" />}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <EmptyState icon={Inbox} title="All quiet.">Approvals, offers, reminders and decisions will land here.</EmptyState>
      )}
    </>
  );
}
