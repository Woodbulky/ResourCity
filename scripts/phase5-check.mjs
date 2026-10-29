// Phase 5 acceptance check against the live Supabase project: demo script steps 6-8 (late return →
// damage raised → student responds → a Manager who did not file it decides, late penalty decided),
// conflict-of-interest routing to an Admin, a no-show appeal reversed, a Manager override, a safety
// incident with unsafe / restore as separate steps, badge verification, and the new functions closed
// to signed-in users. None of these needs the AI: every workflow runs with it switched off.
// Re-seeds before and after. Run: node --env-file=.env.local scripts/phase5-check.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
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
const ledger = async (b) => ok(await db.from("credit_ledger").select("delta, kind").eq("booking_id", b).order("id"));
const notes = async (u, type) => ok(await db.from("notifications").select("title, urgent, link").eq("user_id", u).eq("type", type));
const events = async (id, action) => ok(await db.from("audit_events").select("*").eq("entity_id", id).eq("action", action));
const photos = (b, phase) => ["Front", "Back", "Lens close-up", "All accessories laid out"].map((shot, i) => ({ shot, path: `${b}/${phase}-${i}.jpg` }));
const H = 3_600_000;

ok(await db.rpc("seed_demo"));
const [admin, riya, aarav, meera, mehta, kulkarni, photo, maker, dev] = await Promise.all(
  ["admin", "riya", "aarav", "meera", "prof.mehta", "prof.kulkarni", "photo.lead", "makerspace.lead", "dev"].map((n) => user(`${n}@dvit.edu.in`)),
);
const [dslr, cnc, seminar] = await Promise.all(["DSLR camera kit", "CNC milling machine", "Seminar hall"].map(resource));
const advance = async (ms) => ok(await db.rpc("set_clock", { p_admin: admin, p_advance_seconds: Math.ceil(ms / 1000) }));

// ---------------------------------------------------------------- demo steps 3-8
const t0 = await now();
const start = new Date(Math.ceil((t0.getTime() + 20 * H) / H) * H);
const b = ok(await db.rpc("submit_booking", {
  p_user: riya, p_resource: dslr, p_start: start.toISOString(), p_end: new Date(start.getTime() + 24 * H).toISOString(),
  p_event: "submit_approval", p_fields: { purpose_category: "club_activity", purpose_text: "Tech fest", credit_hold: 10, grace_minutes: 120, approver_role: "owner" },
})).id;
ok(await db.rpc("transition_booking", { p_booking_id: b, p_event: "approve", p_actor_id: photo, p_actor_role: "owner" }));
await advance(start.getTime() - t0.getTime() + 10 * 60_000);
ok(await db.rpc("record_condition", { p_booking: b, p_actor: photo, p_actor_role: "owner", p_phase: "checkout",
  p_checklist: [{ item: "Camera body", ok: true }], p_photos: photos(b, "checkout"), p_notes: "", p_supervisor: "" }));
await advance(27 * H); // due back after 24 h, returned ~3 h late
ok(await db.rpc("record_condition", { p_booking: b, p_actor: photo, p_actor_role: "owner", p_phase: "return",
  p_checklist: [{ item: "Camera body", ok: false, note: "Scratch on the lens" }], p_photos: photos(b, "return"), p_notes: "", p_supervisor: "" }));

await check("a late return proposes a late penalty under the booking's policy version; nothing is deducted", async () => {
  const [p] = ok(await db.from("penalties").select("*").eq("booking_id", b));
  assert.equal(p.kind, "late");
  assert.equal(p.status, "proposed");
  assert.ok(p.proposed_amount > 0);
  assert.equal((await ledger(b)).filter((l) => l.kind === "penalty").length, 0);
});

let caseId;
await check("raise damage: a reason is required, the booking goes under review, the case goes to the other Manager", async () => {
  fails(await db.rpc("report_damage", { p_booking: b, p_actor: photo, p_role: "owner", p_description: "bad", p_severity: "minor", p_ai_flags: null }), /reason_required/);
  fails(await db.rpc("report_damage", { p_booking: b, p_actor: riya, p_role: "owner", p_description: "Scratch across the lens", p_severity: "minor", p_ai_flags: null }), /actor_mismatch/);
  const c = ok(await db.rpc("report_damage", {
    p_booking: b, p_actor: photo, p_role: "owner", p_description: "Fine scratch across the front lens element", p_severity: "minor",
    p_ai_flags: [{ shot: "Lens close-up", description: "Possible scratch", confidence: 0.6, source: "ai" }],
  }));
  caseId = c.id;
  assert.equal(c.assigned_to, kulkarni);
  assert.equal((await booking(b)).status, "under_review");
  assert.equal((await notes(kulkarni, "DAMAGE_CASE_ASSIGNED")).length, 1);
  assert.ok((await notes(riya, "BOOKING_REPORT_DAMAGE"))[0].urgent);
});

await check("before the student responds the Manager cannot decide; nobody else can respond for her", async () => {
  fails(await db.rpc("decide_damage", { p_case: caseId, p_actor: kulkarni, p_role: "manager", p_outcome: "warning", p_reason: "Seen", p_credits: null, p_restriction_days: null, p_charge: 10, p_maintenance: false }), /too_early/);
  fails(await db.rpc("respond_damage", { p_user: meera, p_case: caseId, p_text: "Not my booking but hi", p_photos: [] }), /not_found/);
  fails(await db.rpc("respond_damage", { p_user: riya, p_case: caseId, p_text: "It was already there at pickup.", p_photos: ["someone-else/x.jpg"] }), /invalid_path/);
});

await check("step 7: the student responds with text and a photo; Owner and assigned Manager are told", async () => {
  const c = ok(await db.rpc("respond_damage", { p_user: riya, p_case: caseId, p_text: "The mark was there at pickup; see the front photo.", p_photos: [`${b}/response-1.jpg`] }));
  assert.equal(c.status, "ready_for_decision");
  assert.equal((await notes(kulkarni, "DAMAGE_RESPONSE_SUBMITTED")).length, 1);
  assert.equal((await notes(photo, "DAMAGE_RESPONSE_SUBMITTED")).length, 1);
});

await check("the reporter cannot decide; a non-Manager cannot; an Admin cannot decide a case assigned to a Manager", async () => {
  ok(await db.from("memberships").insert({ user_id: photo, org_id: ok(await db.from("resources").select("org_id").eq("id", dslr).single()).org_id, role: "manager", reason: "check" }));
  fails(await db.rpc("decide_damage", { p_case: caseId, p_actor: photo, p_role: "manager", p_outcome: "warning", p_reason: "Seen", p_credits: null, p_restriction_days: null, p_charge: 10, p_maintenance: false }), /conflict_of_interest/);
  ok(await db.from("memberships").delete().eq("user_id", photo).eq("role", "manager").eq("reason", "check"));
  fails(await db.rpc("decide_damage", { p_case: caseId, p_actor: mehta, p_role: "manager", p_outcome: "warning", p_reason: "Seen", p_credits: null, p_restriction_days: null, p_charge: 10, p_maintenance: false }), /actor_mismatch/);
  fails(await db.rpc("decide_damage", { p_case: caseId, p_actor: admin, p_role: "admin", p_outcome: "warning", p_reason: "Seen", p_credits: null, p_restriction_days: null, p_charge: 10, p_maintenance: false }), /conflict-of-interest/);
});

await check("step 8: partial deduction with a reason completes the booking; credits settle; the timeline has every step", async () => {
  fails(await db.rpc("decide_damage", { p_case: caseId, p_actor: kulkarni, p_role: "manager", p_outcome: "credit_deduction", p_reason: "", p_credits: 15, p_restriction_days: null, p_charge: 10, p_maintenance: false }), /reason_required/);
  const c = ok(await db.rpc("decide_damage", {
    p_case: caseId, p_actor: kulkarni, p_role: "manager", p_outcome: "credit_deduction",
    p_reason: "Photos suggest the mark was partly pre-existing; half the repair estimate", p_credits: 15, p_restriction_days: null, p_charge: 10, p_maintenance: false,
  }));
  assert.equal(c.status, "decided");
  const bk = await booking(b);
  assert.equal(bk.status, "completed");
  assert.equal(bk.credit_charged, 10);
  assert.deepEqual((await ledger(b)).map((l) => `${l.kind}${l.delta}`), ["hold-10", "release10", "charge-10", "penalty-15"]);
  const [dmg] = ok(await db.from("penalties").select("status, final_amount").eq("booking_id", b).eq("kind", "damage"));
  assert.deepEqual(dmg, { status: "confirmed", final_amount: 15 });
  const actions = ok(await db.from("audit_events").select("action").eq("entity_id", b).order("id")).map((e) => e.action);
  for (const a of ["BOOKING_APPROVE", "BOOKING_HANDOVER", "BOOKING_RETURN", "PENALTY_PROPOSED", "BOOKING_REPORT_DAMAGE", "DAMAGE_CASE_ASSIGNED", "DAMAGE_RESPONSE_SUBMITTED", "BOOKING_DECIDE_DISPUTE"])
    assert.ok(actions.includes(a), `timeline lacks ${a}`);
  assert.match((await notes(riya, "BOOKING_DECIDE_DISPUTE"))[0].title, /Damage case decided/);
});

await check("step 8: the late penalty: reduce needs a valid amount, waiving needs a reason, then it is final", async () => {
  const [p] = ok(await db.from("penalties").select("id, proposed_amount").eq("booking_id", b).eq("kind", "late"));
  ok(await db.rpc("appeal_penalty", { p_user: riya, p_penalty: p.id, p_text: "The Owner's desk was closed when I came back on time." }));
  fails(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: kulkarni, p_decision: "reduce", p_amount: p.proposed_amount, p_reason: "Partly late" }), /invalid_amount/);
  fails(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: kulkarni, p_decision: "waive", p_amount: null, p_reason: "" }), /reason_required/);
  fails(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: mehta, p_decision: "waive", p_amount: null, p_reason: "Not mine" }), /actor_mismatch/);
  const d = ok(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: kulkarni, p_decision: "waive", p_amount: null, p_reason: "Desk closure confirmed by the Owner" }));
  assert.deepEqual([d.status, d.final_amount], ["waived", 0]);
  assert.equal((await ledger(b)).filter((l) => l.kind === "penalty").length, 1, "only the damage deduction");
  fails(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: kulkarni, p_decision: "confirm", p_amount: null, p_reason: "Again" }), /already decided/);
  assert.equal((await notes(riya, "PENALTY_DECIDED")).length, 1);
});

// ---------------------------------------------------------------- conflict of interest
await check("the oscilloscope case Prof. Mehta filed is the Admin's: Mehta cannot decide, the Admin can once the window closes", async () => {
  const [c] = ok(await db.from("damage_cases").select("id, assigned_to, response_deadline, status").eq("reported_by", mehta).neq("status", "decided"));
  assert.equal(c.assigned_to, admin);
  fails(await db.rpc("decide_damage", { p_case: c.id, p_actor: mehta, p_role: "manager", p_outcome: "warning", p_reason: "Mine", p_credits: null, p_restriction_days: null, p_charge: 0, p_maintenance: false }), /conflict_of_interest/);
  const left = new Date(c.response_deadline).getTime() - (await now()).getTime();
  if (left > 0) await advance(left + 60_000);
  const bk = ok(await db.from("bookings").select("id, credit_hold").eq("id", ok(await db.from("damage_cases").select("booking_id").eq("id", c.id).single()).booking_id).single());
  ok(await db.rpc("decide_damage", { p_case: c.id, p_actor: admin, p_role: "admin", p_outcome: "insufficient_evidence", p_reason: "No pickup test of channel 2 was recorded", p_credits: null, p_restriction_days: null, p_charge: bk.credit_hold, p_maintenance: true }));
  assert.equal((await booking(bk.id)).status, "completed");
  assert.equal(ok(await db.from("resources").select("status").eq("name", "Digital oscilloscope").single()).status, "under_maintenance");
});

// ---------------------------------------------------------------- no-show appeal
await check("a no-show forfeit appealed and reversed refunds the hold", async () => {
  const [nb] = ok(await db.from("bookings").select("id, user_id, policy_version_id").eq("status", "completed").eq("user_id", dev).limit(1));
  const p = ok(await db.from("penalties").insert({ booking_id: nb.id, user_id: dev, kind: "no_show", proposed_amount: 12, final_amount: 12, status: "auto_applied", policy_version_id: nb.policy_version_id, reason: "Pre-announced rule" }).select().single());
  ok(await db.from("credit_ledger").insert({ user_id: dev, delta: -12, kind: "forfeit", booking_id: nb.id, note: "check" }));
  fails(await db.rpc("appeal_penalty", { p_user: riya, p_penalty: p.id, p_text: "Not mine at all, sorry" }), /not_found/);
  const a = ok(await db.rpc("appeal_penalty", { p_user: dev, p_penalty: p.id, p_text: "I was in the hospital; the note is with the HOD." }));
  assert.equal(a.status, "appealed");
  const org = ok(await db.from("bookings").select("resources(org_id)").eq("id", nb.id).single()).resources.org_id;
  const [m] = ok(await db.from("memberships").select("user_id").eq("org_id", org).eq("role", "manager"));
  assert.ok((await notes(m.user_id, "PENALTY_APPEALED"))[0].urgent);
  const d = ok(await db.rpc("decide_penalty", { p_penalty: p.id, p_actor: m.user_id, p_decision: "waive", p_amount: null, p_reason: "Medical note verified" }));
  assert.equal(d.status, "waived");
  const refunds = ok(await db.from("credit_ledger").select("delta").eq("booking_id", nb.id).eq("kind", "release").eq("note", "Forfeit refunded on appeal"));
  assert.deepEqual(refunds.map((r) => r.delta), [12]);
});

// ---------------------------------------------------------------- override
await check("override: a Manager gives a waitlisted request priority; the recommendation moves to #1; MANAGER_OVERRIDE keeps both", async () => {
  const s = new Date(Math.ceil(((await now()).getTime() + 72 * H) / H) * H);
  const e = new Date(s.getTime() + 2 * H);
  const fields = () => ({ purpose_text: "Talk", credit_hold: 30, approver_role: "manager", grace_minutes: 30 });
  const rec = ok(await db.rpc("submit_booking", { p_user: meera, p_resource: seminar, p_start: s.toISOString(), p_end: e.toISOString(), p_event: "submit_approval", p_fields: fields() })).id;
  ok(await db.from("bookings").update({ priority_score: 80 }).eq("id", rec));
  const w = ok(await db.rpc("submit_booking", { p_user: aarav, p_resource: seminar, p_start: s.toISOString(), p_end: e.toISOString(), p_event: "submit_waitlist", p_fields: fields() })).id;
  fails(await db.rpc("override_allocation", { p_actor: kulkarni, p_chosen: w, p_category: "Academic deadline", p_reason: "short" }), /reason_required/);
  fails(await db.rpc("override_allocation", { p_actor: mehta, p_chosen: w, p_category: "Academic deadline", p_reason: "Accreditation visit needs this room" }), /actor_mismatch/);
  ok(await db.rpc("override_allocation", { p_actor: kulkarni, p_chosen: w, p_category: "Institutional priority", p_reason: "Accreditation visit needs this room" }));
  assert.equal((await booking(w)).status, "offered");
  const r = await booking(rec);
  assert.deepEqual([r.status, r.waitlist_position], ["waitlisted", 1]);
  assert.equal(r.status_reason, "A Manager gave priority to another request: Institutional priority");
  const [o] = await events(w, "MANAGER_OVERRIDE");
  assert.equal(o.subject_user_id, null, "neither student reads the other's score");
  assert.equal(o.metadata.original_recommendation.booking_id, rec);
  assert.equal(Number(o.metadata.original_recommendation.priority_score), 80);
});

// ---------------------------------------------------------------- incidents
await check("incident: a student reports high severity; Managers and Admins get urgent alerts; the emergency path is the reporter's", async () => {
  fails(await db.rpc("report_incident", { p_user: aarav, p_resource: cnc, p_booking: null, p_occurred_at: (await now()).toISOString(), p_location: "", p_description: "short", p_severity: "high", p_evidence: [] }), /reason_required/);
  fails(await db.rpc("report_incident", { p_user: aarav, p_resource: cnc, p_booking: null, p_occurred_at: (await now()).toISOString(), p_location: "", p_description: "Guard missing on the spindle", p_severity: "high", p_evidence: [`${riya}/x.jpg`] }), /invalid_path/);
  const i = ok(await db.rpc("report_incident", { p_user: aarav, p_resource: cnc, p_booking: null, p_occurred_at: (await now()).toISOString(), p_location: "", p_description: "The spindle guard is missing and chips fly out", p_severity: "high", p_evidence: [`${aarav}/e1.jpg`] }));
  assert.ok((await notes(mehta, "INCIDENT_REPORTED"))[0].urgent);
  assert.ok((await notes(admin, "INCIDENT_REPORTED"))[0].urgent);
  assert.equal((await notes(maker, "INCIDENT_REPORTED")).length, 1);
  globalThis.incident = i.id;
});

await check("unsafe: the Owner cannot set it; the Manager does, upcoming bookings are cancelled, new requests refused", async () => {
  fails(await db.rpc("set_resource_status", { p_resource: cnc, p_actor: maker, p_role: "owner", p_status: "unsafe", p_reason: "Guard missing" }), /actor_not_allowed/);
  const pending = ok(await db.from("bookings").select("id").eq("resource_id", cnc).in("status", ["pending_approval", "approved", "pending_allocation", "waitlisted"]));
  const n = ok(await db.rpc("set_resource_status", { p_resource: cnc, p_actor: mehta, p_role: "manager", p_status: "unsafe", p_reason: "Guard missing; locked out" }));
  assert.equal(n, pending.length);
  for (const p of pending) assert.equal((await booking(p.id)).status, "cancelled");
  const s = new Date((await now()).getTime() + 100 * H);
  fails(await db.rpc("submit_booking", { p_user: riya, p_resource: cnc, p_start: s.toISOString(), p_end: new Date(s.getTime() + H).toISOString(), p_event: "submit_approval", p_fields: {} }), /unavailable/);
});

await check("closing the incident never restores the resource; restoring is a separate reasoned step", async () => {
  fails(await db.rpc("update_incident", { p_incident: globalThis.incident, p_actor: kulkarni, p_role: "manager", p_status: "closed", p_note: "Done", p_restrict_days: null }), /actor_mismatch/);
  ok(await db.rpc("update_incident", { p_incident: globalThis.incident, p_actor: mehta, p_role: "manager", p_status: "closed", p_note: "Guard refitted and tested", p_restrict_days: null }));
  assert.equal(ok(await db.from("resources").select("status").eq("id", cnc).single()).status, "unsafe");
  assert.equal((await notes(aarav, "INCIDENT_CLOSED")).length, 1);
  ok(await db.rpc("set_resource_status", { p_resource: cnc, p_actor: mehta, p_role: "manager", p_status: "active", p_reason: "Inspected and safe to use" }));
  assert.equal(ok(await db.from("resources").select("status").eq("id", cnc).single()).status, "active");
  assert.equal((await events(cnc, "RESOURCE_STATUS_CHANGED")).length, 2);
});

// ---------------------------------------------------------------- badges
await check("badge: Aarav submits a CNC certificate; only the issuing org's staff verify it; expiry from validity", async () => {
  const bt = ok(await db.from("badge_types").select("id, validity_days").eq("name", "CNC Safety Training").single());
  fails(await db.rpc("submit_badge", { p_user: aarav, p_badge_type: bt.id, p_path: `${riya}/c.jpg` }), /invalid_path/);
  const x = ok(await db.rpc("submit_badge", { p_user: aarav, p_badge_type: bt.id, p_path: `${aarav}/cnc.jpg` }));
  fails(await db.rpc("submit_badge", { p_user: aarav, p_badge_type: bt.id, p_path: `${aarav}/cnc2.jpg` }), /duplicate/);
  assert.equal((await notes(maker, "BADGE_SUBMITTED")).length, 1);
  fails(await db.rpc("decide_badge", { p_badge: x.id, p_actor: photo, p_role: "owner", p_approve: true, p_issued: "2026-10-01", p_reason: "" }), /actor_mismatch/);
  fails(await db.rpc("decide_badge", { p_badge: x.id, p_actor: maker, p_role: "owner", p_approve: false, p_issued: null, p_reason: "" }), /reason_required/);
  const v = ok(await db.rpc("decide_badge", { p_badge: x.id, p_actor: maker, p_role: "owner", p_approve: true, p_issued: "2026-10-01", p_reason: "" }));
  assert.equal(v.status, "verified");
  assert.equal(new Date(v.expires_at).toISOString().slice(0, 10), new Date(Date.UTC(2026, 9, 1 + bt.validity_days) - 330 * 60_000).toISOString().slice(0, 10));
  assert.equal((await notes(aarav, "BADGE_VERIFIED")).length, 1);
});

// ---------------------------------------------------------------- closed to signed-in users
await check("students cannot call the trust functions directly", async () => {
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  ok(await anon.auth.signInWithPassword({ email: "riya@dvit.edu.in", password: "DvitDemo@2026" }));
  for (const [fn, args] of [
    ["decide_damage", { p_case: caseId, p_actor: riya, p_role: "manager", p_outcome: "dismissed", p_reason: "x", p_credits: null, p_restriction_days: null, p_charge: 0, p_maintenance: false }],
    ["decide_penalty", { p_penalty: caseId, p_actor: riya, p_decision: "waive", p_amount: null, p_reason: "x" }],
    ["set_resource_status", { p_resource: cnc, p_actor: riya, p_role: "manager", p_status: "unsafe", p_reason: "xyz" }],
  ]) fails(await anon.rpc(fn, args), /permission denied/);
});

ok(await db.rpc("set_clock", { p_admin: admin, p_advance_seconds: null }));
ok(await db.rpc("seed_demo"));
console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 5 checks passed");
process.exit(failures ? 1 : 0);
