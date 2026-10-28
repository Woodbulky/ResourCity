// Phase 1 acceptance check against the live Supabase project: demo logins work, the state machine
// moves a booking and its credits, and forbidden actions fail at the database.
// Run: node --env-file=.env.local scripts/phase1-check.mjs   (then re-seed: select public.seed_demo();)
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "DvitDemo@2026";
const MEHTA = "00000000-0000-4000-a000-000000000002";
const MAKER = "00000000-0000-4000-a000-000000000005";
const ROHAN = "00000000-0000-4000-a000-000000000014";
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
async function signIn(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}
const balance = async (user) =>
  (await service.from("credit_ledger").select("delta").eq("user_id", user)).data.reduce((s, r) => s + r.delta, 0);

for (const email of ["riya", "photo.lead", "prof.mehta", "admin"].map((u) => `${u}@dvit.edu.in`))
  await check(`demo login ${email}`, () => signIn(email));

const { data: exception } = await service
  .from("bookings")
  .select("id, credit_hold")
  .eq("user_id", ROHAN)
  .eq("status", "pending_approval")
  .single();

await check("an Owner cannot approve a Manager-approval request", async () => {
  const { error } = await service.rpc("transition_booking", {
    p_booking_id: exception.id, p_event: "approve", p_actor_id: MAKER, p_actor_role: "owner",
  });
  assert.match(error?.message ?? "", /needs a Manager/);
});

await check("rejecting without a reason fails", async () => {
  const { error } = await service.rpc("transition_booking", {
    p_booking_id: exception.id, p_event: "reject", p_actor_id: MEHTA, p_actor_role: "manager",
  });
  assert.match(error?.message ?? "", /reason_required/);
});

await check("Manager approval holds credits and writes audit + notification", async () => {
  const before = await balance(ROHAN);
  const unit = (await service.from("resource_units").select("id").eq("label", "Unit 1")
    .eq("resource_id", "00000000-0000-4000-d000-000000000002").single()).data.id;
  const { data, error } = await service.rpc("transition_booking", {
    p_booking_id: exception.id, p_event: "approve", p_actor_id: MEHTA, p_actor_role: "manager",
    p_payload: { unit_id: unit, grace_minutes: 45 },
  });
  assert.equal(error, null, error?.message);
  assert.equal(data.status, "approved");
  assert.equal(await balance(ROHAN), before - exception.credit_hold);
  const audit = await service.from("audit_events").select("action").eq("entity_id", exception.id).eq("action", "BOOKING_APPROVE");
  assert.equal(audit.data.length, 1);
  const notes = await service.from("notifications").select("title").eq("user_id", ROHAN).like("title", "Booking approved%");
  assert.equal(notes.data.length, 1);
});

await check("an invalid transition is rejected", async () => {
  const { error } = await service.rpc("transition_booking", {
    p_booking_id: exception.id, p_event: "complete", p_actor_id: MEHTA, p_actor_role: "manager",
  });
  assert.match(error?.message ?? "", /invalid_transition/);
});

await check("the double-booking guard blocks an overlapping slot", async () => {
  const { data: b } = await service.from("bookings").select("*").eq("id", exception.id).single();
  const { error } = await service.from("bookings").insert({
    resource_id: b.resource_id, unit_id: b.unit_id, user_id: MAKER, start_at: b.start_at, end_at: b.end_at,
    status: "approved", policy_version_id: b.policy_version_id,
  });
  assert.match(error?.message ?? "", /bookings_no_double_booking/);
});

const riya = await signIn("riya@dvit.edu.in");
await check("a student sees only their own bookings", async () => {
  const { data } = await riya.from("bookings").select("user_id");
  assert.ok(data.length > 0);
  assert.ok(data.every((b) => b.user_id === "00000000-0000-4000-a000-000000000006"));
});
await check("a student cannot call transition_booking", async () => {
  const { error } = await riya.rpc("transition_booking", {
    p_booking_id: exception.id, p_event: "cancel", p_actor_id: ROHAN, p_actor_role: "student", p_reason: "x",
  });
  assert.ok(error, "expected permission denied");
});
await check("a student cannot write a booking status directly", async () => {
  const { data } = await riya.from("bookings").update({ status: "completed" }).eq("id", exception.id).select();
  assert.equal(data?.length ?? 0, 0);
});
await check("a student cannot make themselves admin", async () => {
  const { error } = await riya.from("profiles").update({ is_admin: true }).eq("id", "00000000-0000-4000-a000-000000000006");
  assert.ok(error, "expected column permission error");
});
await check("nobody can edit the audit log, not even the service role", async () => {
  const { error } = await service.from("audit_events").update({ reason: "edited" }).eq("action", "DEMO_SEEDED");
  assert.ok(error, "expected permission denied");
});
await check("signed-out callers get nothing", async () => {
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await anonClient.from("resources").select("id");
  assert.ok(error || data.length === 0);
});
await check("password sign-up through the Auth API is refused", async () => {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signUp({ email: `intruder${Math.random()}@dvit.edu.in`, password: "Passw0rd!x" });
  assert.ok(error, "expected sign-up to fail");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
