// Phase 7 forbidden-action pass (PRD 15) against the live Supabase project. First a sweep: every
// signed-in role (student, Owner, Manager, Admin) tries to insert into and delete from every public
// table over REST; RLS or a missing grant must refuse it and no row may disappear. Then the named
// cases: a student approves, an Owner touches another org's resource or skips the audited status
// path, a Manager grants roles, anyone edits an audit row, a student reads another student's data.
// Re-seeds before and after. Run: node --env-file=.env.local scripts/phase7-forbidden.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "DvitDemo@2026";
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
const refused = (res, pattern = /permission denied|row-level security|not_admin|forbidden|not_|actor|mismatch/i) => {
  assert.ok(res.error, "expected an error");
  assert.match(res.error.message, pattern);
};
const none = ({ data, error }) => assert.ok(error || (data ?? []).length === 0, `changed ${data?.length} row(s)`);
async function signIn(email) {
  const c = createClient(url, anonKey, { auth: { persistSession: false } });
  ok(await c.auth.signInWithPassword({ email: `${email}@dvit.edu.in`, password: PASSWORD }));
  return c;
}
const id = async (table, col, val) => ok(await db.from(table).select("id").eq(col, val).single()).id;
const count = async (table) => {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true });
  assert.equal(error, null, error?.message);
  return n;
};

// Table → a column every row has a value in, so "delete where it is not null" targets every row.
const TABLES = {
  allowed_domains: "domain", app_clock: "id", app_settings: "id", audit_events: "id", availability_windows: "id",
  badge_types: "id", blackouts: "id", booking_transitions: "from_status", bookings: "id", condition_reports: "id",
  credit_ledger: "id", damage_cases: "id", emergency_credit_requests: "id", extension_requests: "id", incidents: "id",
  memberships: "id", notifications: "id", org_restrictions: "id", organizations: "id", penalties: "id",
  policy_versions: "id", profiles: "id", resource_units: "id", resources: "id", user_badges: "id",
};
// Owners may legitimately rewrite their own resources' opening hours and blackouts (PRD 15 RLS table).
const OWNER_WRITES = new Set(["availability_windows", "blackouts"]);

ok(await db.rpc("seed_demo"));
const roles = { student: "riya", owner: "photo.lead", manager: "prof.mehta", admin: "admin" };
const clients = {};
for (const [role, email] of Object.entries(roles)) clients[role] = await signIn(email);
const [riya, mehta, photoClub, makerspace] = await Promise.all([
  id("profiles", "email", "riya@dvit.edu.in"), id("profiles", "email", "prof.mehta@dvit.edu.in"),
  id("organizations", "name", "Photography Club"), id("organizations", "name", "Makerspace"),
]);
const [cnc, dslr] = await Promise.all([id("resources", "name", "CNC milling machine"), id("resources", "name", "DSLR camera kit")]);
const cncBooking = ok(await db.from("bookings").select("id").eq("resource_id", cnc).eq("status", "pending_approval").single()).id;

// ---------------------------------------------------------------- sweep
for (const [role, c] of Object.entries(clients)) {
  await check(`${role}: every table refuses an insert and a delete-all over REST`, async () => {
    const before = Object.fromEntries(await Promise.all(Object.keys(TABLES).map(async (t) => [t, await count(t)])));
    const leaks = [];
    await Promise.all(Object.entries(TABLES).map(async ([t, col]) => {
      const ins = await c.from(t).insert({}).select();
      if (!ins.error) leaks.push(`${t}: insert accepted`);
      else if (!/permission denied|row-level security/i.test(ins.error.message)) leaks.push(`${t}: insert failed late (${ins.error.message})`);
      if (role === "owner" && OWNER_WRITES.has(t)) return;
      await c.from(t).delete().not(col, "is", null);
    }));
    for (const t of Object.keys(TABLES)) {
      if (role === "owner" && OWNER_WRITES.has(t)) continue;
      const after = await count(t);
      if (after !== before[t]) leaks.push(`${t}: ${before[t]} → ${after} rows`);
    }
    assert.deepEqual(leaks, []);
  });
}

// ---------------------------------------------------------------- a student tries to approve
await check("a student cannot approve: no RPC access, no direct status write, no borrowed role", async () => {
  const s = clients.student;
  refused(await s.rpc("transition_booking", { p_booking_id: cncBooking, p_event: "approve", p_actor_id: mehta, p_actor_role: "manager" }));
  none(await s.from("bookings").update({ status: "approved" }).eq("id", cncBooking).select());
  for (const role of ["student", "owner", "manager"])
    refused(await db.rpc("transition_booking", { p_booking_id: cncBooking, p_event: "approve", p_actor_id: riya, p_actor_role: role }), /.+/);
  assert.equal(ok(await db.from("bookings").select("status").eq("id", cncBooking).single()).status, "pending_approval");
});

// ---------------------------------------------------------------- an Owner tries another org's resource
await check("an Owner cannot edit, list into, re-hour or decide for another org", async () => {
  const o = clients.owner;
  none(await o.from("resources").update({ name: "Hijacked" }).eq("id", cnc).select());
  refused(await o.from("resources").insert({ org_id: makerspace, name: "Fake", category: "machine", form_template: "machine" }));
  const windows = await count("availability_windows");
  await o.from("availability_windows").delete().eq("resource_id", cnc);
  assert.equal(await count("availability_windows"), windows);
  refused(await o.from("availability_windows").insert({ resource_id: cnc, weekday: 1, start_time: "09:00", end_time: "10:00" }));
  const photo = await id("profiles", "email", "photo.lead@dvit.edu.in");
  refused(await db.rpc("transition_booking", { p_booking_id: cncBooking, p_event: "approve", p_actor_id: photo, p_actor_role: "owner" }), /.+/);
  refused(await db.rpc("set_resource_status", { p_resource: cnc, p_actor: photo, p_role: "owner", p_status: "paused", p_reason: "Not my resource at all" }), /.+/);
  assert.equal(ok(await db.from("resources").select("name").eq("id", cnc).single()).name, "CNC milling machine");
});

await check("an Owner edits their own listing, but status, quantity, door QR and units only change server-side", async () => {
  const o = clients.owner;
  assert.equal(ok(await o.from("resources").update({ description: "Edited by the Owner" }).eq("id", dslr).select()).length, 1);
  refused(await o.from("resources").update({ status: "paused" }).eq("id", dslr));
  refused(await o.from("resources").update({ quantity: 9 }).eq("id", dslr));
  refused(await o.from("resources").update({ door_qr_token: "guessable" }).eq("id", dslr));
  refused(await o.from("resource_units").update({ status: "active" }).eq("resource_id", dslr));
  refused(await o.from("resource_units").delete().eq("resource_id", dslr));
  const r = ok(await db.from("resources").select("status, quantity").eq("id", dslr).single());
  assert.deepEqual([r.status, r.quantity], ["active", 2]);
});

// ---------------------------------------------------------------- a Manager tries to grant roles
await check("a Manager cannot grant roles, verify students or make themselves Admin", async () => {
  const m = clients.manager;
  refused(await m.from("memberships").insert({ user_id: riya, org_id: makerspace, role: "owner", reason: "Helping out" }));
  refused(await m.rpc("set_membership", { p_admin: mehta, p_user: riya, p_org: makerspace, p_role: "owner", p_grant: true, p_reason: "x" }));
  refused(await db.rpc("set_membership", { p_admin: mehta, p_user: riya, p_org: makerspace, p_role: "owner", p_grant: true, p_reason: "Helping out" }), /not_admin/);
  refused(await m.from("profiles").update({ is_admin: true }).eq("id", mehta));
  refused(await m.from("profiles").update({ status: "verified" }).eq("email", "om@dvit.edu.in"));
  assert.equal((await db.from("memberships").select("id").eq("user_id", riya)).data.length, 0);
});

// ---------------------------------------------------------------- anyone tries to edit an audit row
await check("nobody edits or deletes an audit row: not a student, Owner, Manager, Admin or the service role", async () => {
  const [row] = ok(await db.from("audit_events").select("id, reason").order("id").limit(1));
  for (const c of [...Object.values(clients), db]) {
    const u = await c.from("audit_events").update({ reason: "rewritten" }).eq("id", row.id).select();
    assert.ok(u.error || u.data.length === 0);
    const d = await c.from("audit_events").delete().eq("id", row.id).select();
    assert.ok(d.error || d.data.length === 0);
  }
  refused(await clients.admin.rpc("log_event", { p_actor_id: riya, p_actor_role: "admin", p_action: "FORGED", p_entity_type: "x", p_entity_id: "x" }));
  assert.equal(ok(await db.from("audit_events").select("reason").eq("id", row.id).single()).reason, row.reason);
});

// ---------------------------------------------------------------- a student reads someone else's data
await check("a student sees only their own ledger, notifications, cases and penalties", async () => {
  const s = clients.student;
  const mine = new Set(ok(await db.from("bookings").select("id").eq("user_id", riya)).map((b) => b.id));
  assert.ok(ok(await s.from("credit_ledger").select("user_id")).every((r) => r.user_id === riya));
  assert.ok(ok(await s.from("notifications").select("user_id")).every((r) => r.user_id === riya));
  assert.ok(ok(await s.from("damage_cases").select("booking_id")).every((r) => mine.has(r.booking_id)));
  assert.ok(ok(await s.from("penalties").select("booking_id")).every((r) => mine.has(r.booking_id)));
  assert.equal(ok(await s.from("profiles").select("id").neq("id", riya).ilike("email", "%@dvit.edu.in")).length, 0);
  assert.equal(ok(await s.storage.from("id-proofs").list()).length, 0);
});

await check("signed-out callers cannot read or call anything", async () => {
  const a = createClient(url, anonKey, { auth: { persistSession: false } });
  for (const t of ["profiles", "bookings", "audit_events", "credit_ledger"]) {
    const { data, error } = await a.from(t).select("*").limit(1);
    assert.ok(error || data.length === 0, t);
  }
  refused(await a.rpc("app_now"));
});

ok(await db.rpc("seed_demo"));
console.log(failures ? `\n${failures} check(s) failed` : "\nAll Phase 7 forbidden-action checks passed");
process.exit(failures ? 1 : 0);
