import {
  Bell, Check, CircleCheck, CircleX, Clock, Hourglass, ListOrdered, Package, Search, Slash, TriangleAlert, UserX,
  type LucideIcon,
} from "lucide-react";
import { STUDENT_LABELS, type BookingStatus } from "@/lib/contracts/booking";

// Colour + icon + text, never colour alone (PRD 16).
const TONES = {
  pending: "bg-pending-bg text-pending-fg",
  info: "bg-info-bg text-info-fg",
  approved: "bg-sage text-sage-strong",
  borrowed: "bg-borrowed-bg text-borrowed-fg",
  danger: "bg-danger-bg text-danger-fg font-bold",
  neutral: "bg-neutral-bg text-neutral-fg",
} as const;

export type StatusTone = keyof typeof TONES;

const CHIPS: Record<BookingStatus, [StatusTone, LucideIcon]> = {
  pending_allocation: ["pending", Clock],
  pending_approval: ["pending", Clock],
  waitlisted: ["info", ListOrdered],
  offered: ["info", Bell],
  approved: ["approved", CircleCheck],
  checked_out: ["borrowed", Package],
  overdue: ["danger", TriangleAlert],
  returned: ["pending", Search],
  under_review: ["pending", Search],
  completed: ["neutral", Check],
  rejected: ["danger", CircleX],
  cancelled: ["neutral", Slash],
  no_show: ["danger", UserX],
  expired: ["neutral", Hourglass],
};

export const statusTone = (s: BookingStatus) => CHIPS[s][0];

// `values` fills the label placeholders: {cutoff}, {position}, {expires}.
export function StatusChip({ status, values = {} }: { status: BookingStatus; values?: Record<string, string> }) {
  const [tone, Icon] = CHIPS[status];
  const label = STUDENT_LABELS[status].replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "…");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
