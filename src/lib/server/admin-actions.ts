"use server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../contracts/api";
import type { Json } from "../contracts/database";
import { policyValuesSchema } from "../contracts/policy";
import { diffMetadata, policyDiff } from "../domain/policy";
import { friendlyError } from "./booking";
import { runScheduler } from "./scheduler";
import { currentPolicy } from "./student";
import { createServiceClient } from "./supabase";
import { getViewer } from "./viewer";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const str = (form: FormData, k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string).trim() : "");

async function admin() {
  const viewer = await getViewer();
  return viewer?.isAdmin ? viewer : null;
}
const NOT_ADMIN: ActionResult = { ok: false, error: "Only an Admin can do this." };

const done = (message: string): ActionResult => {
  revalidatePath("/", "layout"); // the clock and every queue move together
  return { ok: true, message };
};

// ---------------------------------------------------------------------------- demo controls (PRD 12, 17)
const STEPS: Record<string, number | null> = { "15m": 15 * 60, "1h": 3600, "1d": 86_400, reset: null };

export async function moveClock(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  const step = str(form, "step");
  if (!DEMO_MODE || !(step in STEPS)) return { ok: false, error: "Clock controls work only in demo mode." };
  const { error } = await createServiceClient().rpc("set_clock", { p_admin: a.id, p_advance_seconds: STEPS[step] });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(step === "reset" ? "Clock back to real time." : "Clock moved forward. Run the scheduler to apply it.");
}

export async function runSchedulerNow(): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  if (!DEMO_MODE) return { ok: false, error: "Run the scheduler by hand only in demo mode." };
  try {
    const r = await runScheduler();
    const n = (k: string) => Number((r as Record<string, unknown>)[k] ?? 0);
    const parts = [
      `${r.batch.allocated + r.batch.waitlisted + r.batch.dropped} batch decisions`,
      `${n("no_shows")} no-shows`,
      `${n("offers_expired")} expired offers`,
      `${n("lapsed")} lapsed`,
      `${n("ended")} ended`,
      `${n("overdue_alerts")} overdue alerts`,
      `${n("escalations")} escalations`,
      `${n("allowances")} allowances`,
    ];
    const errors = [...r.batch.errors, ...(((r as Record<string, unknown>).errors as string[]) ?? [])];
    return done(`Scheduler ran: ${parts.join(" · ")}.${errors.length ? ` ${errors.length} item(s) skipped.` : ""}`);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The scheduler failed." };
  }
}

export async function resetDemoData(): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  if (!DEMO_MODE) return { ok: false, error: "Reset works only in demo mode." };
  const db = createServiceClient();
  const { error } = await db.rpc("seed_demo");
  if (error) return { ok: false, error: friendlyError(error.message) };
  await db.rpc("log_event", {
    p_actor_id: a.id, p_actor_role: "admin", p_action: "DEMO_RESET", p_entity_type: "demo", p_entity_id: "seed",
    p_reason: "Demo data reset from the Admin demo controls",
  });
  return done("Demo data reset and the clock is back to real time.");
}

// ---------------------------------------------------------------------------- policy (PRD 12)
// The form posts the full new values as JSON; the diff is recomputed here, never trusted.
export async function changePolicy(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  let raw: unknown;
  try {
    raw = JSON.parse(str(form, "values"));
  } catch {
    return { ok: false, error: "The policy could not be read. Try again." };
  }
  const parsed = policyValuesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}` };
  const v = parsed.data;
  if (v.grace.min_minutes > v.grace.max_minutes) return { ok: false, error: "Grace minimum must not exceed the maximum." };
  if (v.grace.percent > 1) return { ok: false, error: "Grace share must be at most 100% of the slot." };
  const reason = str(form, "reason");
  if (reason.length < 3) return { ok: false, error: "A reason is required; it is stored with the new version." };
  const changes = policyDiff((await currentPolicy()).values, v);
  if (!changes.length) return { ok: false, error: "Nothing changed." };
  const { data, error } = await createServiceClient().rpc("change_policy", {
    p_admin: a.id, p_values: v, p_diff: diffMetadata(changes) as Json, p_reason: reason,
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(`Policy v${data} is live. Existing bookings keep their version.`);
}

// ---------------------------------------------------------------------------- emergency credits (PRD 9)
export async function decideEmergencyCredits(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  const decision = str(form, "decision");
  const grant = decision === "reject" ? 0 : Number(str(form, "grant"));
  if (!Number.isInteger(grant) || grant < 0) return { ok: false, error: "Enter a whole number of credits." };
  const { data, error } = await createServiceClient().rpc("decide_emergency_credits", {
    p_admin: a.id, p_request: str(form, "requestId"), p_grant: grant, p_reason: str(form, "reason"),
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done(data.status === "rejected" ? "Request declined." : `${grant} credits granted.`);
}

// ---------------------------------------------------------------------------- badge types (PRD 12)
export async function createBadgeType(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const a = await admin();
  if (!a) return NOT_ADMIN;
  const { error } = await createServiceClient().rpc("create_badge_type", {
    p_actor: a.id, p_name: str(form, "name").slice(0, 120), p_description: str(form, "description").slice(0, 500),
    p_org: str(form, "orgId"), p_validity_days: Number(str(form, "validityDays")),
  });
  if (error) return { ok: false, error: friendlyError(error.message) };
  return done("Badge type added. Owners can now require it and verify certificates for it.");
}
