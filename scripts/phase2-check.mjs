// Phase 2 acceptance check against the live Supabase project: verification (reject → resubmit →
// approve), ID photo access, role grant/revoke with the last-Manager guard, notifications and
// column locks. Re-seeds before and after, so it leaves the demo data as it found it.
// Run: node --env-file=.env.local scripts/phase2-check.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PASSWORD = "DvitDemo@2026";
const ADMIN = "00000000-0000-4000-a000-000000000001";
const MEHTA = "00000000-0000-4000-a000-000000000002";
const KULKARNI = "00000000-0000-4000-a000-000000000003";
const RIYA = "00000000-0000-4000-a000-000000000006";
const OM = "00000000-0000-4000-a000-000000000010";
const PHOTO_CLUB = "00000000-0000-4000-b000-000000000001"; // Kulkarni is its only Manager
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
const ok = ({ error }) => assert.equal(error, null, error?.message);
const fails = (res, pattern) => {
  assert.ok(res.error, "expected an error");
  if (pattern) assert.match(res.error.message, pattern);
};
const lastEvent = async (action, user) =>
  (await service.from("audit_events").select("*").eq("action", action).eq("subject_user_id", user)
    .order("id", { ascending: false }).limit(1).single()).data;
const notified = async (type, user) =>
  (await service.from("notifications").select("id").eq("type", type).eq("user_id", user)).data.length > 0;
const submit = (path) =>
  service.rpc("submit_verification", {
    p_user: OM, p_full_name: "Om Kale", p_department: "Civil", p_year: 1, p_roll: "CV25012", p_phone: "", p_id_path: path,
  });

ok(await service.rpc("seed_demo"));
const om = await signIn("om@dvit.edu.in");
const riya = await signIn("riya@dvit.edu.in");
const admin = await signIn("admin@dvit.edu.in");
const png = new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0))], { type: "image/png" });
const idPath = `${OM}/check-${Math.random().toString(36).slice(2)}.png`;

await check("rejecting needs a reason", async () => {
  fails(await service.rpc("decide_verification", { p_admin: ADMIN, p_user: OM, p_approve: false, p_reason: " " }), /reason_required/);
});
await check("a non-admin cannot decide a verification", async () => {
  fails(await service.rpc("decide_verification", { p_admin: RIYA, p_user: OM, p_approve: true, p_reason: "" }), /not_admin/);
});
await check("admin rejects with a reason; student is told and can resubmit", async () => {
  ok(await service.rpc("decide_verification", { p_admin: ADMIN, p_user: OM, p_approve: false, p_reason: "Blurry photo" }));
  const { data: p } = await service.from("profiles").select("status, status_reason, verification_submitted_at").eq("id", OM).single();
  assert.deepEqual(p, { status: "pending_verification", status_reason: "Blurry photo", verification_submitted_at: null });
  assert.equal((await lastEvent("VERIFICATION_REJECTED", OM)).reason, "Blurry photo");
  assert.ok(await notified("VERIFICATION_REJECTED", OM));
});
await check("a student uploads an ID photo only into their own folder", async () => {
  ok(await om.storage.from("id-proofs").upload(idPath, png, { contentType: "image/png" }));
  fails(await om.storage.from("id-proofs").upload(`${RIYA}/x.png`, png, { contentType: "image/png" }));
});
await check("only an Admin can open the ID photo", async () => {
  ok(await admin.storage.from("id-proofs").createSignedUrl(idPath, 60));
  fails(await riya.storage.from("id-proofs").createSignedUrl(idPath, 60));
});
await check("a student cannot set their own ID path, status or call submit_verification", async () => {
  fails(await om.from("profiles").update({ id_proof_path: idPath }).eq("id", OM));
  fails(await om.from("profiles").update({ status: "verified" }).eq("id", OM));
  fails(await om.rpc("submit_verification", { p_user: OM, p_full_name: "", p_department: "", p_year: 1, p_roll: "", p_phone: "", p_id_path: idPath }));
});
await check("resubmission rejects another user's path, then queues once", async () => {
  fails(await submit(`${RIYA}/x.png`), /invalid_path/);
  ok(await submit(idPath));
  fails(await submit(idPath), /duplicate/);
});
await check("admin approves; ID photo is deleted; student is told", async () => {
  const { data: path, error } = await service.rpc("decide_verification", { p_admin: ADMIN, p_user: OM, p_approve: true, p_reason: "" });
  assert.equal(error, null);
  assert.equal(path, idPath);
  ok(await service.storage.from("id-proofs").remove([path])); // what the server action does next
  const { data: files } = await service.storage.from("id-proofs").list(OM);
  assert.ok(!files.some((f) => idPath.endsWith(f.name)), "ID photo still in storage");
  const { data: p } = await service.from("profiles").select("status, id_proof_path").eq("id", OM).single();
  assert.deepEqual(p, { status: "verified", id_proof_path: null });
  assert.ok(await notified("VERIFICATION_APPROVED", OM));
});
await check("admin grants and revokes a role with reason, audit diff and notification", async () => {
  const args = { p_admin: ADMIN, p_user: RIYA, p_org: PHOTO_CLUB, p_role: "owner", p_reason: "Club secretary" };
  fails(await service.rpc("set_membership", { ...args, p_grant: true, p_reason: "" }), /reason_required/);
  ok(await service.rpc("set_membership", { ...args, p_grant: true }));
  fails(await service.rpc("set_membership", { ...args, p_grant: true }), /duplicate/);
  const e = await lastEvent("ROLE_GRANTED", RIYA);
  assert.deepEqual([e.metadata.previous, e.metadata.new, e.org_id], [[], ["owner"], PHOTO_CLUB]);
  assert.ok(await notified("ROLE_GRANTED", RIYA));
  ok(await service.rpc("set_membership", { ...args, p_grant: false, p_reason: "Term ended" }));
  assert.equal((await service.from("memberships").select("id").eq("user_id", RIYA)).data.length, 0);
});
await check("a non-admin cannot grant roles", async () => {
  fails(await service.rpc("set_membership", { p_admin: MEHTA, p_user: RIYA, p_org: PHOTO_CLUB, p_role: "owner", p_grant: true, p_reason: "x" }), /not_admin/);
  fails(await riya.from("memberships").insert({ user_id: RIYA, org_id: PHOTO_CLUB, role: "manager", reason: "x" }));
});
await check("the last Manager cannot be removed without a replacement", async () => {
  const args = { p_admin: ADMIN, p_user: KULKARNI, p_org: PHOTO_CLUB, p_role: "manager", p_grant: false, p_reason: "Sabbatical" };
  fails(await service.rpc("set_membership", args), /last_manager/);
  ok(await service.rpc("set_membership", { ...args, p_replacement: MEHTA }));
  const { data } = await service.from("memberships").select("user_id").eq("org_id", PHOTO_CLUB).eq("role", "manager");
  assert.deepEqual(data.map((r) => r.user_id), [MEHTA]);
});
await check("a user marks their notifications read but cannot rewrite them", async () => {
  ok(await om.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", OM));
  fails(await om.from("notifications").update({ title: "edited" }).eq("user_id", OM));
  const { data } = await om.from("notifications").select("read_at");
  assert.ok(data.length > 0 && data.every((n) => n.read_at));
});

ok(await service.rpc("seed_demo"));
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
