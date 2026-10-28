// Phase 3 acceptance check against the live Supabase project: the core journey
// request → approve → handover (condition record) → acknowledge → return → complete, with credit
// hold, charge and release, plus the guards around it. Re-seeds before and after.
// Run: node --env-file=.env.local scripts/phase3-check.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RIYA = "00000000-0000-4000-a000-000000000006";
const OM = "00000000-0000-4000-a000-000000000010";
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
const ok = ({ data, error }) => {
  assert.equal(error, null, error?.message);
  return data;
};
const fails = (res, pattern) => {
  assert.ok(res.error, "expected an error");
  if (pattern) assert.match(res.error.message, pattern);
};
const balance = async (user) =>
  (ok(await service.from("credit_ledger").select("delta").eq("user_id", user))).reduce((s, r) => s + r.delta, 0);
const byEmail = async (email) => ok(await service.from("profiles").select("id").eq("email", email).single()).id;
const resource = async (name) => ok(await service.from("resources").select("id, org_id").eq("name", name).single());

ok(await service.rpc("seed_demo"));
const now = new Date(ok(await service.rpc("app_now")));
const owner = await byEmail("photo.lead@dvit.edu.in");
const mehta = await byEmail("prof.mehta@dvit.edu.in");
const dslr = await resource("DSLR camera kit");
const meeting = await resource("Meeting room");
const start = new Date(now.getTime() + 5 * 60_000);
const end = new Date(start.getTime() + 24 * 3_600_000);
const fields = { purpose_category: "club_activity", purpose_text: "Tech Fest coverage", approver_role: "owner", credit_hold: 10, grace_minutes: 120 };
const submit = (user, res, event, f = fields, s = start, e = end) =>
  service.rpc("submit_booking", { p_user: user, p_resource: res, p_start: s.toISOString(), p_end: e.toISOString(), p_event: event, p_fields: f });
const transition = (id, event, actor, role, reason, payload = {}) =>
  service.rpc("transition_booking", { p_booking_id: id, p_event: event, p_actor_id: actor, p_actor_role: role, p_reason: reason, p_payload: payload });
const photos = (id) => [1, 2, 3].map((n) => ({ shot: `Shot ${n}`, path: `${id}/checkout-${n}.jpg` }));

let booking;
const before = await balance(RIYA);

await check("a signed-in student cannot call submit_booking directly", async () => {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  ok(await c.auth.signInWithPassword({ email: "riya@dvit.edu.in", password: "DvitDemo@2026" }));
  fails(await c.rpc("submit_booking", { p_user: RIYA, p_resource: dslr.id, p_start: start.toISOString(), p_end: end.toISOString(), p_event: "submit_auto", p_fields: fields }));
});
await check("an unverified student cannot request", async () => {
  fails(await submit(OM, dslr.id, "submit_approval"), /not_verified/);
});
await check("submit for owner approval: pending, no unit, no hold yet, audited", async () => {
  booking = ok(await submit(RIYA, dslr.id, "submit_approval"));
  assert.equal(booking.status, "pending_approval");
  assert.equal(booking.unit_id, null);
  assert.equal(await balance(RIYA), before);
  const ev = ok(await service.from("audit_events").select("action").eq("entity_id", booking.id));
  assert.deepEqual(ev.map((e) => e.action), ["BOOKING_SUBMIT_APPROVAL"]);
});
await check("a second request for the same slot is refused", async () => {
  fails(await submit(RIYA, dslr.id, "submit_approval"), /duplicate/);
});
await check("rejecting needs a reason; another org's owner cannot decide", async () => {
  fails(await transition(booking.id, "reject", owner, "owner", null), /reason_required/);
  fails(await transition(booking.id, "approve", mehta, "owner", null), /actor_mismatch/);
});
await check("approve assigns a unit and holds the credits", async () => {
  const b = ok(await transition(booking.id, "approve", owner, "owner", null));
  assert.equal(b.status, "approved");
  assert.ok(b.unit_id);
  assert.equal(await balance(RIYA), before - 10);
});
await check("handover needs 3 photos under this booking's folder", async () => {
  const two = photos(booking.id).slice(0, 2);
  fails(await service.rpc("record_condition", { p_booking: booking.id, p_actor: owner, p_actor_role: "owner", p_phase: "checkout", p_checklist: [], p_photos: two, p_notes: "", p_supervisor: "" }), /photos_required/);
  const foreign = photos("00000000-0000-4000-c000-000000000000");
  fails(await service.rpc("record_condition", { p_booking: booking.id, p_actor: owner, p_actor_role: "owner", p_phase: "checkout", p_checklist: [], p_photos: foreign, p_notes: "", p_supervisor: "" }), /invalid_path/);
});
await check("signed handover → checked_out with the condition record", async () => {
  const b = ok(await service.rpc("record_condition", {
    p_booking: booking.id, p_actor: owner, p_actor_role: "owner", p_phase: "checkout",
    p_checklist: [{ item: "Camera body", ok: true }, { item: "Lens", ok: false, note: "Small scratch on hood" }],
    p_photos: photos(booking.id), p_notes: "", p_supervisor: "",
  }));
  assert.equal(b.status, "checked_out");
  assert.ok(b.picked_up_at);
  const rep = ok(await service.from("condition_reports").select("owner_signed_by, student_ack_at").eq("booking_id", booking.id).single());
  assert.equal(rep.owner_signed_by, owner);
  assert.equal(rep.student_ack_at, null);
});
await check("only the booking's student can acknowledge, once", async () => {
  fails(await service.rpc("acknowledge_condition", { p_user: OM, p_booking: booking.id, p_phase: "checkout" }), /not_found/);
  ok(await service.rpc("acknowledge_condition", { p_user: RIYA, p_booking: booking.id, p_phase: "checkout" }));
  fails(await service.rpc("acknowledge_condition", { p_user: RIYA, p_booking: booking.id, p_phase: "checkout" }), /invalid_state/);
});
await check("return → returned, then Return OK charges and releases", async () => {
  const back = photos(booking.id).map((p) => ({ ...p, path: p.path.replace("checkout", "return") }));
  const r = ok(await service.rpc("record_condition", { p_booking: booking.id, p_actor: owner, p_actor_role: "owner", p_phase: "return", p_checklist: [], p_photos: back, p_notes: "", p_supervisor: "" }));
  assert.equal(r.status, "returned");
  fails(await transition(booking.id, "complete", owner, "owner", null, { charge: 11 }), /invalid_charge/);
  const c = ok(await transition(booking.id, "complete", owner, "owner", null, { charge: 10 }));
  assert.equal(c.status, "completed");
  assert.equal(c.credit_charged, 10);
  assert.equal(await balance(RIYA), before - 10);
  const kinds = ok(await service.from("credit_ledger").select("kind, delta").eq("booking_id", booking.id).order("id"));
  assert.deepEqual(kinds.map((k) => `${k.kind}:${k.delta}`), ["hold:-10", "release:10", "charge:-10"]);
});
await check("the timeline has every step", async () => {
  const ev = ok(await service.from("audit_events").select("action").eq("entity_id", booking.id).order("id"));
  assert.deepEqual(ev.map((e) => e.action), [
    "BOOKING_SUBMIT_APPROVAL", "BOOKING_APPROVE", "BOOKING_HANDOVER", "CONDITION_ACKNOWLEDGED", "BOOKING_RETURN", "BOOKING_COMPLETE",
  ]);
});
await check("instant booking of a free space, then door check-in only in its window", async () => {
  // Meeting room hours are 08:00–20:00 IST Mon–Sat, but submit_booking trusts the server's hours check.
  const s = new Date(now.getTime() + 60_000);
  const b = ok(await submit(RIYA, meeting.id, "submit_auto", { ...fields, credit_hold: 0, grace_minutes: 15 }, s, new Date(s.getTime() + 3_600_000)));
  assert.equal(b.status, "approved");
  const { door_qr_token } = ok(await service.from("resources").select("door_qr_token").eq("id", meeting.id).single());
  fails(await service.rpc("door_checkin", { p_user: OM, p_token: door_qr_token }), /no_booking/);
  fails(await service.rpc("door_checkin", { p_user: RIYA, p_token: "nope" }), /not_found/);
  const c = ok(await service.rpc("door_checkin", { p_user: RIYA, p_token: door_qr_token }));
  assert.equal(c.status, "checked_out");
});
await check("a fully booked slot cannot be auto-approved twice", async () => {
  const s = new Date(now.getTime() + 2 * 86_400_000);
  const e = new Date(s.getTime() + 3_600_000);
  const meetingFields = { ...fields, credit_hold: 0 };
  ok(await submit(RIYA, meeting.id, "submit_auto", meetingFields, s, e));
  const other = await byEmail("ishaan@dvit.edu.in");
  fails(await submit(other, meeting.id, "submit_auto", meetingFields, s, e), /slot_taken/);
  const w = ok(await submit(other, meeting.id, "submit_waitlist", meetingFields, s, e));
  assert.equal(w.status, "waitlisted");
  assert.equal(w.waitlist_position, 1);
});

ok(await service.rpc("seed_demo"));
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
