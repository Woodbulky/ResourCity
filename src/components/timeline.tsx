import { CircleDot } from "lucide-react";
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
  if (!events.length)
    return <p className="px-5 py-6 text-sm text-ink-soft">No events recorded yet. Every step from here on appears in this timeline.</p>;
  return (
    <ol className="px-5 py-3">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 py-3">
          {i < events.length - 1 && <span aria-hidden className="absolute left-[13px] top-10 h-[calc(100%-1.5rem)] w-px bg-line" />}
          <span aria-hidden className="z-10 grid size-7 shrink-0 place-items-center rounded-full border border-line bg-wash text-moss">
            <CircleDot className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold first-letter:uppercase">
              {words(e.action)}
              {e.to_state && <span className="font-normal text-ink-soft"> → {words(e.to_state)}</span>}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              <time className="font-mono" dateTime={e.created_at}>
                {formatDateTime(new Date(e.created_at))}
              </time>{" "}
              · by {e.actor_role}
            </p>
            {e.reason && <p className="mt-1.5 rounded-lg bg-wash px-3 py-2 text-sm">Reason: {e.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
