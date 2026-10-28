import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/domain/time";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {items?.some((n) => !n.read_at) && (
          <form action={markNotificationsRead}>
            <Button type="submit" variant="outline">Mark all read</Button>
          </form>
        )}
      </div>
      {!items?.length && <p className="text-sm text-muted-foreground">You have no notifications.</p>}
      <ul className="divide-y rounded-lg border bg-card">
        {items?.map((n) => (
          <li key={n.id} className={n.read_at ? "" : "bg-[var(--green-light-3)]"}>
            <Link href={n.link ?? "#"} className="block p-3 hover:bg-muted">
              <p className="font-medium">
                {!n.read_at && <span className="sr-only">Unread: </span>}
                {n.urgent && <span className="mr-2 rounded bg-[var(--red-light-3)] px-1.5 text-xs font-semibold text-[var(--red-base)]">Urgent</span>}
                {n.title}
              </p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="font-mono text-xs text-muted-foreground">{formatDateTime(new Date(n.created_at))}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
