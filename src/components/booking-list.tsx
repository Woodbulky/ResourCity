import Link from "next/link";
import type { BookingStatus } from "@/lib/contracts/booking";
import { formatDateTime } from "@/lib/domain/time";
import { StatusChip } from "./status-chip";

export interface BookingRow {
  id: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  waitlist_position: number | null;
  offer_expires_at: string | null;
  cutoff_at: string | null;
  resources: { name: string } | null;
}

export const chipValues = (b: BookingRow) => ({
  position: String(b.waitlist_position ?? "…"),
  expires: b.offer_expires_at ? formatDateTime(new Date(b.offer_expires_at)) : "…",
  cutoff: b.cutoff_at ? formatDateTime(new Date(b.cutoff_at)) : "…",
});

export function BookingList({ bookings, hrefBase }: { bookings: BookingRow[]; hrefBase?: string }) {
  if (!bookings.length) return <p className="text-sm text-muted-foreground">No bookings yet.</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {bookings.map((b) => {
        const body = (
          <>
            <div className="min-w-0">
              <p className="truncate font-medium">{b.resources?.name ?? "Resource"}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatDateTime(new Date(b.start_at))} – {formatDateTime(new Date(b.end_at))}
              </p>
            </div>
            <StatusChip status={b.status} values={chipValues(b)} />
          </>
        );
        return (
          <li key={b.id}>
            {hrefBase ? (
              <Link href={`${hrefBase}/${b.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted">
                {body}
              </Link>
            ) : (
              <div className="flex items-center justify-between gap-3 p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const BOOKING_ROW_FIELDS =
  "id, status, start_at, end_at, waitlist_position, offer_expires_at, cutoff_at, resources(name)" as const;
