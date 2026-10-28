import { formatDateTime } from "@/lib/domain/time";

export interface TimelineEvent {
  id: number | string;
  action: string;
  actor_role: string;
  reason: string | null;
  to_state: string | null;
  created_at: string;
}

const words = (s: string) => s.toLowerCase().replaceAll("_", " ");

// Booking or case history from audit_events (PRD 12): every event, actor role and reason.
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-forest" />
          <p className="text-sm font-medium first-letter:uppercase">
            {words(e.action)}
            {e.to_state && <span className="font-normal text-muted-foreground"> → {words(e.to_state)}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            <time className="font-mono" dateTime={e.created_at}>
              {formatDateTime(new Date(e.created_at))}
            </time>{" "}
            · by {e.actor_role}
          </p>
          {e.reason && <p className="mt-1 text-sm">Reason: {e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
