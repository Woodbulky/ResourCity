import Link from "next/link";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import type { BookingStatus } from "@/lib/contracts/booking";
import type { ResourceCategory } from "@/lib/contracts/resource";
import { formatDateTime } from "@/lib/domain/time";
import { formatSlot, formatWhen } from "./format";
import { ResourceCover } from "./resource-cover";
import { StatusChip } from "./status-chip";

export interface BookingRow {
  id: string;
  status: BookingStatus;
  start_at: string;
  end_at: string;
  waitlist_position: number | null;
  offer_expires_at: string | null;
  cutoff_at: string | null;
  status_reason: string | null;
  approver_role: "owner" | "manager";
  credit_hold: number;
  credit_charged: number | null;
  resources: {
    name: string;
    category: ResourceCategory;
    location: string;
    organizations: { name: string } | null;
  } | null;
}

export const BOOKING_ROW_FIELDS =
  "id, status, start_at, end_at, waitlist_position, offer_expires_at, cutoff_at, status_reason, approver_role, credit_hold, credit_charged, resources(name, category, location, organizations(name))" as const;

export const chipValues = (b: Pick<BookingRow, "waitlist_position" | "offer_expires_at" | "cutoff_at">) => ({
  position: String(b.waitlist_position ?? "…"),
  expires: b.offer_expires_at ? formatDateTime(new Date(b.offer_expires_at)) : "…",
  cutoff: b.cutoff_at ? formatDateTime(new Date(b.cutoff_at)) : "…",
});

// What the student should know or do next, in plain words (PRD 5 labels, PRD 16 copy).
export function studentNote(b: BookingRow): string {
  switch (b.status) {
    case "pending_allocation":
      return `Batch allocation${b.cutoff_at ? ` on ${formatWhen(b.cutoff_at)}` : ""}. Your score breakdown appears after the cutoff.`;
    case "pending_approval":
      return `Waiting for the ${b.approver_role === "manager" ? "organisation Manager" : "resource Owner"}. No credits are held yet.`;
    case "waitlisted":
      return `You're #${b.waitlist_position ?? "…"} on the waitlist. If a slot frees up, you'll get an offer.`;
    case "offered":
      return `A slot is yours if you accept${b.offer_expires_at ? ` by ${formatWhen(b.offer_expires_at)}` : ""}.`;
    case "approved":
      return `${b.credit_hold} credits on hold. Your pickup QR opens 15 minutes before the slot.`;
    case "checked_out":
      return `Return by ${formatWhen(b.end_at)}${b.resources?.location ? ` · ${b.resources.location}` : ""}.`;
    case "overdue":
      return "Past the return time. Bring it back as soon as you can; the Owner has been told.";
    case "returned":
      return "Returned. The Owner is finishing the condition record.";
    case "under_review":
      return "A damage report is open. You can respond before a Manager decides.";
    case "completed":
      return b.credit_charged ? `Completed · ${b.credit_charged} credits charged.` : "Completed · nothing charged.";
    default:
      return b.status_reason ?? "Closed.";
  }
}

export function BookingCard({
  href,
  booking,
  note,
  person,
  actions,
}: {
  href: string;
  booking: BookingRow;
  note?: string;
  person?: string;
  actions?: React.ReactNode;
}) {
  const r = booking.resources;
  return (
    <article className="lift group relative grid grid-cols-[72px_minmax(0,1fr)] items-center gap-4 rounded-[var(--radius-card)] border border-line bg-paper p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto]">
      <ResourceCover category={r?.category ?? "other"} label={false} className="size-[72px] rounded-xl sm:h-20 sm:w-24" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={booking.status} values={chipValues(booking)} />
        </div>
        <h3 className="mt-1.5 truncate text-base font-semibold">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {r?.name ?? "Resource"}
          </Link>
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-3.5" />
            {formatSlot(booking.start_at, booking.end_at)}
          </span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" />
            {person ?? r?.organizations?.name}
          </span>
        </p>
        <p className="mt-1.5 text-sm text-moss">{note ?? studentNote(booking)}</p>
      </div>
      <div className="relative z-10 col-span-2 flex items-center gap-2 sm:col-span-1">
        {actions ?? (
          <span className="hidden items-center gap-1 text-sm font-semibold text-moss sm:inline-flex">
            Details <ArrowRight aria-hidden className="size-4" />
          </span>
        )}
      </div>
    </article>
  );
}
