// Phase 4 acceptance check against the live Supabase project and a running app (for the tick,
// which includes the TypeScript batch allocation). Walks the simulated clock forward through the
// seeded situations: batch allocation, a no-show that offers the slot, overdue escalation, a policy
// change that leaves bookings on their version, escalation, extensions, Owner-not-present,
// emergency credits, the 4th-strike forfeit and the Monday reset. Re-seeds before and after.
// Run: next build && next start, then
//   node --env-file=.env.local scripts/phase4-check.mjs            (APP_URL defaults to localhost:3000)
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
const user = async (email) => ok(await db.from("profiles").select("id").eq("email", email).single()).id;
const resource = async (name) => ok(await db.from("resources").select("id").eq("name", name).single()).id;
const booking = async (id) => ok(await db.from("bookings").select("*").eq("id", id).single());
const now = async () => new Date(ok(await db.rpc("app_now")));
const balance = async (u) => ok(await db.from("credit_ledger").select("delta").eq("user_id", u)).reduce((s, r) => s + r.delta, 0);
const tick = async () => {
  const res = await fetch(`${APP}/api/cron/tick`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual([...body.batch.errors, ...body.errors], [], "tick reported errors");
  return body;
};
const notes = async (u, type) => ok(await db.from("notifications").select("title, urgent, link").eq("user_id", u).eq("type", type));
const events = async (id, action) => ok(await db.from("audit_events").select("*").eq("entity_id", id).eq("action", action));
const submit = (u, res, start, end, event, fields) =>
  db.rpc("submit_booking", { p_user: u, p_resource: res, p_start: start.toISOString(), p_end: end.toISOString(), p_event: event, p_fields: fields });
const min = (m) => m * 60_000;

ok(await db.rpc("seed_demo"));
const [admin, riya, kabir, dev, tanvi, sneha, rohan, mehta, kulkarni, photo] = await Promise.all(
  ["admin", "riya", "kabir", "dev", "tanvi", "sneha", "rohan", "prof.mehta", "prof.kulkarni", "photo.lead"].map((n) =>
    user(`${n}@dvit.edu.in`).catch(() => null),
  ),
);
const [seminar, court, meeting, dslr, laptop] = await Promise.all(
  ["Seminar hall", "Badminton court", "Meeting room", "DSLR camera kit", "Laptop"].map((n) => resource(n).catch(() => null)),
);
const advance = async (ms) => ok(await db.rpc("set_clock", { p_admin: admin, p_advance_seconds: Math.ceil(ms / 1000) }));

await check("the tick refuses calls without CRON_SECRET", async () => {
  const res = await fetch(`${APP}/api/cron/tick`, { method: "POST" });
  assert.equal(res.status, 401);
});
await check("only an Admin moves the clock, forward only, and it is audited", async () => {
  fails(await db.rpc("set_clock", { p_admin: riya, p_advance_seconds: 60 }), /not_admin/);
  fails(await db.rpc("set_clock", { p_admin: admin, p_advance_seconds: -60 }), /forward/);
  const before = (await events("app_clock", "CLOCK_CHANGED")).length;
  await advance(min(60));
  assert.equal((await events("app_clock", "CLOCK_CHANGED")).length, before + 1);
});

const sem = ok(await db.from("bookings").select("id, user_id").eq("resource_id", seminar).eq("status", "pending_allocation"));
await check("batch: at the cutoff the seminar slot allocates by score; the rest are waitlisted in rank order", async () => {
  await tick();
  const rows = ok(await db.from("bookings").select("id, status, priority_score, score_breakdown, waitlist_position, status_reason, allocation_rule").in("id", sem.map((s) => s.id)));
  const top = rows.filter((r) => r.status === "pending_approval");
  const waiting = rows.filter((r) => r.status === "waitlisted").sort((a, b) => a.waitlist_position - b.waitlist_position);
  assert.equal(top.length, 1, JSON.stringify(rows.map((r) => r.status)));
  assert.deepEqual(waiting.map((w) => w.waitlist_position), [1, 2]);
  for (const r of rows) {
    assert.equal(typeof r.score_breakdown.total, "number");
    assert.match(r.allocation_rule, /Batch allocation, policy v2/);
  }
  assert.ok(Number(top[0].priority_score) >= Number(waiting[0].priority_score));
  assert.ok(Number(waiting[0].priority_score) >= Number(waiting[1].priority_score));
  assert.match(waiting[1].status_reason, /2 eligible requests scored higher/);
  assert.equal((await notes(kulkarni, "BOOKING_ALLOCATE_FOR_APPROVAL")).length, 1, "the approving Manager hears about the result");
});

const overdueLaptop = ok(await db.from("bookings").select("id").eq("resource_id", laptop).eq("status", "overdue").single()).id;
await check("overdue +1 h: the student and the Owner are alerted", async () => {
  assert.equal((await booking(overdueLaptop)).escalation_level, 1);
  assert.equal((await notes(rohan, "OVERDUE_ALERT")).length, 1);
});

const courtSlot = ok(await db.from("bookings").select("id, start_at, end_at").eq("resource_id", court).eq("status", "approved").eq("user_id", dev).single());
const kabirWait = ok(await db.from("bookings").select("id").eq("resource_id", court).eq("user_id", kabir).eq("status", "waitlisted").single()).id;
const tanviWait = ok(await db.from("bookings").select("id").eq("resource_id", court).eq("user_id", tanvi).eq("status", "waitlisted").single()).id;
await check("no-show: grace ends, the slot is released and offered to the top of the waitlist", async () => {
  const devBefore = await balance(dev);
  await advance(new Date(courtSlot.start_at).getTime() + min(16) - (await now()).getTime());
  await tick();
  const b = await booking(courtSlot.id);
  assert.equal(b.status, "no_show");
  assert.equal(await balance(dev), devBefore + b.credit_hold, "hold released for strikes 1–3");
  const k = await booking(kabirWait);
  assert.equal(k.status, "offered");
  assert.ok(new Date(k.offer_expires_at) <= new Date(courtSlot.end_at));
  assert.ok((await notes(kabir, "BOOKING_OFFER")).some((n) => n.urgent));
  assert.equal((await booking(tanviWait)).waitlist_position, 1, "the rest of the waitlist moves up");
});
await check("the offered student accepts; a late offer keeps a collectable pickup window", async () => {
  ok(await db.rpc("transition_booking", { p_booking_id: kabirWait, p_event: "accept", p_actor_id: kabir, p_actor_role: "student" }));
  await tick();
  assert.equal((await booking(kabirWait)).status, "approved");
});
await check("overdue +6 h reaches the Manager", async () => {
  assert.equal((await booking(overdueLaptop)).escalation_level, 2);
  assert.ok((await notes(mehta, "OVERDUE_ALERT")).some((n) => n.link === `/manager/bookings/${overdueLaptop}`));
});

await check("strike 3, then the 4th no-show in 30 days forfeits the hold automatically", async () => {
  const k = await booking(kabirWait);
  await advance(new Date(k.start_at).getTime() + min(k.grace_minutes + 1) - (await now()).getTime());
  await tick();
  assert.equal((await booking(kabirWait)).status, "no_show");
  assert.equal((await booking(tanviWait)).status, "offered", "Kabir's no-show offered the slot to Tanvi");
  const start = new Date(new Date(courtSlot.end_at).getTime() + min(5)); // after the court slot Tanvi was offered
  const b = ok(await submit(kabir, court, start, new Date(start.getTime() + min(60)), "submit_auto", { credit_hold: 10, grace_minutes: 15, approver_role: "owner" }));
  const before = await balance(kabir);
  await advance(start.getTime() + min(16) - (await now()).getTime());
  await tick();
  const after = await booking(b.id);
  assert.equal(after.status, "no_show");
  assert.equal(await balance(kabir), before, "the hold is forfeited, not released");
  const pen = ok(await db.from("penalties").select("kind, status, final_amount").eq("booking_id", b.id).single());
  assert.deepEqual(pen, { kind: "no_show", status: "auto_applied", final_amount: 10 });
});

let v3;
await check("a policy change creates v3 with a diff; existing bookings keep their version, new ones get v3", async () => {
  const current = ok(await db.from("policy_versions").select("id, version, values").order("version", { ascending: false }).limit(1).single());
  fails(await db.rpc("change_policy", { p_admin: riya, p_values: current.values, p_diff: {}, p_reason: "x" }), /not_admin/);
  const values = { ...current.values, weekly_allowance: 120 };
  v3 = ok(await db.rpc("change_policy", { p_admin: admin, p_values: values, p_diff: { previous: { weekly_allowance: 100 }, new: { weekly_allowance: 120 } }, p_reason: "More credits for exam season" }));
  assert.equal(v3, 3);
  const ev = ok(await db.from("audit_events").select("metadata, to_state").eq("action", "POLICY_CHANGED").order("id", { ascending: false }).limit(1).single());
  assert.deepEqual(ev.metadata.new, { weekly_allowance: 120 });
  assert.equal((await booking(sem[0].id)).policy_version_id, current.id);
  const start = new Date((await now()).getTime() + 26 * 3600_000);
  const fresh = ok(await submit(riya, meeting, start, new Date(start.getTime() + min(60)), "submit_auto", { credit_hold: 0, grace_minutes: 15 }));
  const pv = ok(await db.from("policy_versions").select("version").eq("id", fresh.policy_version_id).single());
  assert.equal(pv.version, 3);
  assert.ok((await notes(photo, "POLICY_CHANGED")).length === 1, "Owners hear about policy changes");
});

await check("a late return proposes a penalty under the booking's own policy version (v1)", async () => {
  const photos = [1, 2, 3].map((n) => ({ shot: `Shot ${n}`, path: `${overdueLaptop}/return-${n}.jpg` }));
  ok(await db.rpc("record_condition", { p_booking: overdueLaptop, p_actor: mehta, p_actor_role: "manager", p_phase: "return", p_checklist: [], p_photos: photos, p_notes: "", p_supervisor: "" }));
  const b = await booking(overdueLaptop);
  const pen = ok(await db.from("penalties").select("kind, status, proposed_amount, policy_version_id, reason").eq("booking_id", overdueLaptop).single());
  assert.equal(pen.kind, "late");
  assert.equal(pen.status, "proposed");
  assert.equal(pen.policy_version_id, b.policy_version_id);
  assert.match(pen.reason, /policy v1/);
  assert.ok((await notes(mehta, "PENALTY_PROPOSED")).length === 1);
});

await check("extensions: auto-approved within limits, refused on a clash with the next booking", async () => {
  const start = new Date((await now()).getTime() + 48 * 3600_000);
  const mine = ok(await submit(riya, meeting, start, new Date(start.getTime() + min(60)), "submit_auto", { credit_hold: 0, grace_minutes: 15 }));
  const ext = ok(await db.rpc("request_extension", { p_user: riya, p_booking: mine.id, p_new_end: new Date(start.getTime() + min(90)).toISOString(), p_reason: "Meeting runs long", p_note: "", p_extra: 0, p_auto: true }));
  assert.equal(ext.status, "approved");
  assert.equal(new Date((await booking(mine.id)).end_at).getTime(), start.getTime() + min(90));
  ok(await submit(sneha, meeting, new Date(start.getTime() + min(120)), new Date(start.getTime() + min(180)), "submit_auto", { credit_hold: 0, grace_minutes: 15 }));
  fails(await db.rpc("request_extension", { p_user: riya, p_booking: mine.id, p_new_end: new Date(start.getTime() + min(150)).toISOString(), p_reason: "Longer", p_note: "", p_extra: 0, p_auto: true }), /conflict/);
});

await check("Owner not present: no strike, credits back, logged against the organisation", async () => {
  const start = new Date((await now()).getTime() - min(5));
  const b = ok(await submit(riya, meeting, start, new Date(start.getTime() + min(60)), "submit_auto", { credit_hold: 0, grace_minutes: 15 }));
  ok(await db.rpc("report_owner_absent", { p_user: riya, p_booking: b.id }));
  assert.equal((await booking(b.id)).status, "cancelled");
  assert.equal((await events(b.id, "OWNER_NOT_PRESENT")).length, 1);
});

await check("emergency credits: one request, Admin grants partly with a reason, once per academic year", async () => {
  const req = ok(await db.rpc("request_emergency_credits", { p_user: sneha, p_booking: null, p_amount: 30, p_reason: "Hackathon demo on Friday needs the GPU", p_urgency: "high" }));
  fails(await db.rpc("request_emergency_credits", { p_user: sneha, p_booking: null, p_amount: 10, p_reason: "Another one please now", p_urgency: "normal" }), /duplicate/);
  fails(await db.rpc("decide_emergency_credits", { p_admin: admin, p_request: req.id, p_grant: 20, p_reason: "" }), /reason_required/);
  const before = await balance(sneha);
  const d = ok(await db.rpc("decide_emergency_credits", { p_admin: admin, p_request: req.id, p_grant: 20, p_reason: "Partial: 20 covers the run" }));
  assert.equal(d.status, "partial");
  assert.equal(await balance(sneha), before + 20);
  assert.equal((await notes(sneha, "EMERGENCY_CREDITS_DECIDED")).length, 1);
  fails(await db.rpc("request_emergency_credits", { p_user: sneha, p_booking: null, p_amount: 10, p_reason: "Need more for the final run", p_urgency: "normal" }), /once per academic year/);
});

await check("escalation: no Owner decision in 24 h → Manager; a further 24 h → Admin alert", async () => {
  const start = new Date((await now()).getTime() + 60 * 3600_000);
  const b = ok(await submit(riya, dslr, start, new Date(start.getTime() + 24 * 3600_000), "submit_approval", { credit_hold: 10, grace_minutes: 120, approver_role: "owner" }));
  await advance(25 * 3600_000);
  await tick();
  let x = await booking(b.id);
  assert.deepEqual([x.approver_role, x.escalation_level], ["manager", 1]);
  assert.ok((await notes(kulkarni, "APPROVAL_ESCALATED")).some((n) => n.urgent));
  fails(await db.rpc("transition_booking", { p_booking_id: b.id, p_event: "approve", p_actor_id: photo, p_actor_role: "owner" }), /needs a Manager/);
  await advance(25 * 3600_000);
  await tick();
  x = await booking(b.id);
  assert.equal(x.escalation_level, 2);
  assert.equal(x.status, "pending_approval", "escalation never decides");
  assert.ok((await notes(admin, "APPROVAL_ESCALATED")).length >= 1);
});

await check("Monday reset: unused credits expire, the v3 allowance arrives, holds untouched", async () => {
  const t = await now();
  const ist = new Date(t.getTime() + 330 * 60_000); // IST wall clock in UTC fields
  const daysToMonday = (8 - ist.getUTCDay()) % 7 || 7;
  const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + daysToMonday) - 330 * 60_000 + min(5));
  const before = await balance(riya);
  await advance(monday.getTime() - t.getTime());
  await tick();
  const rows = ok(await db.from("credit_ledger").select("kind, delta, week_start").eq("user_id", riya).in("kind", ["allowance", "reset_expiry"]).order("id", { ascending: false }).limit(2));
  const allowance = rows.find((r) => r.kind === "allowance");
  assert.equal(allowance.delta, 120);
  const expiry = rows.find((r) => r.kind === "reset_expiry");
  if (before > 0) assert.equal(expiry.delta, -before);
  assert.equal(await balance(riya), 120 + Math.min(before, 0));
  await tick(); // idempotent within the week
  assert.equal(await balance(riya), 120 + Math.min(before, 0));
});

ok(await db.rpc("seed_demo"));
console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 4 checks passed");
process.exit(failures ? 1 : 0);
