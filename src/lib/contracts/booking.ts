// Booking state machine contract (PRD Section 5). The database copy lives in
// public.booking_transitions (supabase/migrations/..._functions.sql); keep the two identical.
import type { Database } from "./database";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type ActorRole = "student" | "owner" | "manager" | "admin" | "system";

export const BOOKING_EVENTS = [
  "submit_auto",
  "submit_approval",
  "submit_waitlist",
  "submit_batch",
  "allocate",
  "allocate_for_approval",
  "allocate_waitlist",
  "allocate_drop",
  "approve",
  "reject",
  "waitlist",
  "offer",
  "accept",
  "offer_expire",
  "lapse",
  "cancel",
  "handover",
  "door_checkin",
  "no_show",
  "mark_overdue",
  "auto_complete",
  "return",
  "complete",
  "report_damage",
  "decide_dispute",
] as const;
export type BookingEvent = (typeof BOOKING_EVENTS)[number];

export interface BookingTransition {
  from: BookingStatus | "new";
  event: BookingEvent;
  to: BookingStatus;
  actors: readonly ActorRole[];
  reasonRequired: boolean;
}

const ANYONE_CANCELS = ["student", "owner", "manager", "admin", "system"] as const;
const t = (
  from: BookingTransition["from"],
  event: BookingEvent,
  to: BookingStatus,
  actors: readonly ActorRole[],
  reasonRequired = false,
): BookingTransition => ({ from, event, to, actors, reasonRequired });

export const BOOKING_TRANSITIONS: readonly BookingTransition[] = [
  t("new", "submit_auto", "approved", ["system"]),
  t("new", "submit_approval", "pending_approval", ["system"]),
  t("new", "submit_waitlist", "waitlisted", ["system"]),
  t("new", "submit_batch", "pending_allocation", ["system"]),
  t("pending_allocation", "allocate", "approved", ["system"]),
  t("pending_allocation", "allocate_for_approval", "pending_approval", ["system"]),
  t("pending_allocation", "allocate_waitlist", "waitlisted", ["system"]),
  t("pending_allocation", "allocate_drop", "rejected", ["system"], true),
  t("pending_allocation", "cancel", "cancelled", ANYONE_CANCELS, true),
  t("pending_approval", "approve", "approved", ["owner", "manager"]),
  t("pending_approval", "reject", "rejected", ["owner", "manager"], true),
  t("pending_approval", "waitlist", "waitlisted", ["owner", "manager"], true),
  t("pending_approval", "cancel", "cancelled", ANYONE_CANCELS, true),
  t("pending_approval", "lapse", "expired", ["system"], true),
  t("waitlisted", "offer", "offered", ["system"]),
  t("waitlisted", "cancel", "cancelled", ["student", "admin", "system"], true),
  t("waitlisted", "lapse", "expired", ["system"], true),
  t("offered", "accept", "approved", ["student"]),
  t("offered", "offer_expire", "expired", ["system"], true),
  t("offered", "cancel", "cancelled", ["student", "admin", "system"], true),
  t("approved", "cancel", "cancelled", ANYONE_CANCELS, true),
  t("approved", "handover", "checked_out", ["owner", "manager"]),
  t("approved", "door_checkin", "checked_out", ["student"]),
  t("approved", "no_show", "no_show", ["system"], true),
  t("checked_out", "mark_overdue", "overdue", ["system"]),
  t("checked_out", "auto_complete", "completed", ["system"]),
  t("checked_out", "return", "returned", ["owner", "manager"]),
  t("overdue", "return", "returned", ["owner", "manager"]),
  t("returned", "complete", "completed", ["owner", "manager"]),
  t("returned", "report_damage", "under_review", ["owner", "manager"], true),
  t("under_review", "decide_dispute", "completed", ["manager", "admin"], true),
];

// Statuses that occupy a unit's time slot (the database exclusion constraint uses the same set).
export const SLOT_HOLDING_STATUSES: readonly BookingStatus[] = ["approved", "offered", "checked_out", "overdue"];

// Statuses in which the booking's credit hold sits on the ledger.
export const CREDIT_HOLDING_STATUSES: readonly BookingStatus[] = [
  "approved",
  "checked_out",
  "overdue",
  "returned",
  "under_review",
];

// Statuses a student still has to act on or wait for ("active" for caps and suspension).
export const ACTIVE_STATUSES: readonly BookingStatus[] = [
  "pending_allocation",
  "pending_approval",
  "waitlisted",
  "offered",
  "approved",
  "checked_out",
  "overdue",
];

// Student-facing labels (PRD Section 5). {placeholders} are filled by the UI.
export const STUDENT_LABELS: Record<BookingStatus, string> = {
  pending_allocation: "Allocation on {cutoff}",
  pending_approval: "Pending approval",
  waitlisted: "Waitlisted #{position}",
  offered: "Slot offered — accept by {expires}",
  approved: "Approved — awaiting pickup",
  checked_out: "Currently borrowed",
  overdue: "Overdue",
  returned: "Returned",
  under_review: "Returned — under review",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  no_show: "No-show",
  expired: "Expired",
};
