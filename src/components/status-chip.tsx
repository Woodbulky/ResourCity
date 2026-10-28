import {
  Bell, Check, CircleCheck, CircleX, Clock, Hourglass, ListOrdered, Package, Search, Slash, TriangleAlert, UserX,
  type LucideIcon,
} from "lucide-react";
import { STUDENT_LABELS, type BookingStatus } from "@/lib/contracts/booking";

// PRD 16: colour + icon + text, never colour alone.
const TONES = {
  pending: "bg-[var(--yellow-light-3)] text-[var(--yellow-dark-2)]",
  info: "bg-[var(--blue-light-3)] text-[var(--blue-dark-1)]",
  approved: "bg-[var(--green-light-3)] text-[var(--green-dark-2)]",
  borrowed: "bg-[var(--purple-light-3)] text-[var(--purple-dark-1)]",
  danger: "bg-[var(--red-light-3)] text-[var(--red-base)] font-semibold",
  neutral: "bg-[var(--gray-light-2)] text-[var(--gray-dark-2)]",
} as const;

const CHIPS: Record<BookingStatus, [keyof typeof TONES, LucideIcon]> = {
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

// `values` fills the label placeholders: {cutoff}, {position}, {expires}.
export function StatusChip({ status, values = {} }: { status: BookingStatus; values?: Record<string, string> }) {
  const [tone, Icon] = CHIPS[status];
  const label = STUDENT_LABELS[status].replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "…");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs ${TONES[tone]}`}>
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
