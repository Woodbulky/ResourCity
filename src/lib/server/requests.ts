import "server-only";
import { headers } from "next/headers";
import { subHours } from "date-fns";
import {
  bookingRulesSchema, checklistSchema, eligibilitySchema, safetyRulesSchema,
} from "../contracts/resource";
import { slotProblem } from "../domain/availability";
import { checkEligibility } from "../domain/eligibility";
import { graceMinutes } from "../domain/grace";
import { creditCost } from "../domain/pricing";
import { qrWindow, signQr, verifyQr } from "../domain/qr";
import { planSubmission } from "../domain/request";
import { istInstant } from "../domain/time";
import { appNow } from "./clock";
import { activeBookingsAt, eligibilityStudent, studentSnapshot } from "./student";
import { createClient, createServiceClient } from "./supabase";
import type { SessionViewer } from "./viewer";

export const RESOURCE_FULL_FIELDS =
  "id, org_id, name, category, form_template, status, quantity, approval_mode, allocation_mode, batch_cutoff_hours, eligibility, booking_rules, safety_rules, checklist, base_rate, rate_unit, peak_multiplier, organizations(name)" as const;

export interface SlotInput {
  startDate: string; // yyyy-MM-dd, IST
  startTime: string; // HH:mm
  endDate: string;
  endTime: string;
}

export function parseSlot(s: Partial<SlotInput>): { start: Date; end: Date } | null {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^\d{2}:\d{2}$/;
  if (!date.test(s.startDate ?? "") || !date.test(s.endDate ?? "") || !time.test(s.startTime ?? "") || !time.test(s.endTime ?? ""))
    return null;
  const start = istInstant(s.startDate!, s.startTime!);
  const end = istInstant(s.endDate!, s.endTime!);
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? null : { start, end };
}

// Everything a request for this slot depends on (PRD 7, 9, 10): the full eligibility checks with
// availability, the credit cost, grace, cutoff and where the request will land. The resource page
// shows it as the summary and submitRequest() re-runs it, so the two can never disagree.
export async function evaluateRequest(viewer: SessionViewer, resourceId: string, slot: { start: Date; end: Date }) {
  const supabase = await createClient();
  const [snap, { data: r }, { data: windows }, { data: blackouts }, { data: badgeTypes }] = await Promise.all([
    studentSnapshot(viewer),
    supabase.from("resources").select(RESOURCE_FULL_FIELDS).eq("id", resourceId).maybeSingle(),
    supabase.from("availability_windows").select("weekday, start_time, end_time").eq("resource_id", resourceId),
    supabase.from("blackouts").select("starts_at, ends_at, reason").eq("resource_id", resourceId),
    supabase.from("badge_types").select("id, name"),
  ]);
  if (!r) return null;
  const now = snap.now;
  const eligibility = eligibilitySchema.safeParse(r.eligibility).data ?? eligibilitySchema.parse({});
  const rules = bookingRulesSchema.safeParse(r.booking_rules).data ?? bookingRulesSchema.parse({});
  const safety = safetyRulesSchema.safeParse(r.safety_rules).data ?? safetyRulesSchema.parse({});

  const problem =
    r.status !== "active"
      ? "This resource is not taking bookings right now."
      : slot.start < new Date(now.getTime() - 15 * 60_000)
        ? "That time has already passed. Pick a later slot."
        : slotProblem(
            slot.start,
            slot.end,
            windows ?? [],
            (blackouts ?? []).map((b) => ({ starts_at: new Date(b.starts_at), ends_at: new Date(b.ends_at), reason: b.reason })),
          );
  const cost = creditCost(
    { base_rate: r.base_rate, rate_unit: r.rate_unit, peak_multiplier: Number(r.peak_multiplier), peak_window: rules.peak_window },
    slot.start,
    slot.end,
  );
  let slotFree: boolean | null = null;
  if (!problem) {
    const { data, error } = await createServiceClient().rpc("free_unit", {
      p_resource: r.id,
      p_start: slot.start.toISOString(),
      p_end: slot.end.toISOString(),
    });
    slotFree = error ? null : data !== null;
  }
  const checks = checkEligibility(
    eligibilityStudent(viewer, snap, r.org_id),
    { eligibility, booking_rules: rules, approval_mode: r.approval_mode, badgeNames: Object.fromEntries((badgeTypes ?? []).map((b) => [b.id, b.name])) },
    slot,
    {
      now,
      activeBookingsHere: activeBookingsAt(snap, r.id),
      availableCredits: snap.available,
      cost,
      noShowStrikes: snap.strikes,
      strikeLimit: snap.policy.values.strikes.limit,
      strikesClearOn: null,
      slotFree,
      takenLabel: "Every unit is taken at that time.",
    },
  );
  const cutoffAt = r.allocation_mode === "batch" ? subHours(slot.start, r.batch_cutoff_hours) : null;
  const plan = planSubmission(
    checks,
    { approval_mode: r.approval_mode, allocation_mode: r.allocation_mode, manager_approval: safety.manager_approval },
    { cutoffPassed: !cutoffAt || cutoffAt <= now },
  );
  return {
    now,
    resource: r,
    problem,
    checks,
    cost,
    grace: graceMinutes(slot.start, slot.end, snap.policy.values.grace),
    cutoffAt: cutoffAt && cutoffAt > now ? cutoffAt : null,
    plan,
    available: snap.available,
    policy: snap.policy,
    checklist: checklistSchema.safeParse(r.checklist).data ?? { items: [], shots: [] },
  };
}

export type RequestEvaluation = NonNullable<Awaited<ReturnType<typeof evaluateRequest>>>;

// ---------------------------------------------------------------------------- signed QR (PRD 10)
const secret = () => {
  const s = process.env.QR_SIGNING_SECRET;
  if (!s) throw new Error("QR_SIGNING_SECRET is not set");
  return s;
};

export async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

// The student's QR encodes the Owner's scan URL, so even a phone's own camera opens the right page.
export async function bookingQrUrl(
  b: { id: string; user_id: string; status: string; start_at: string; end_at: string; grace_minutes: number | null },
): Promise<{ url: string; phase: "pickup" | "return"; validFrom: Date; validUntil: Date } | null> {
  const now = await appNow();
  const w = qrWindow({ ...b, start_at: new Date(b.start_at), end_at: new Date(b.end_at) }, now);
  if (!w) return null;
  const token = signQr({ b: b.id, u: b.user_id, ...w }, secret());
  return { url: `${await origin()}/owner/scan?t=${token}`, phase: w.p, validFrom: new Date(w.nbf * 1000), validUntil: new Date(w.exp * 1000) };
}

export async function checkQr(token: string) {
  return verifyQr(token, secret(), await appNow());
}
