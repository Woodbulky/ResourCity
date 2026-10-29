// Phase 7 acceptance (PRD 18): the judge demo script (PRD 17, steps 1-11) runs twice in a row after a
// reset with zero manual fixes. Each step makes the same database call as the server action behind the
// button and then renders the page that role would look at next. After every clock move the scheduler
// ticks, as the Render cron would between the judge's clicks. AI is not needed: every step has a fallback.
// Run: npx next start -p 3005, then node --env-file=.env.local scripts/phase7-judge.mjs [base URL]
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3005";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const H = 3_600_000;
let failures = 0;

async function step(name, fn) {
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

const sessions = {};
async function signIn(email) {
  if (sessions[email]) return sessions[email];
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { session } = ok(await c.auth.signInWithPassword({ email: `${email}@dvit.edu.in`, password: "DvitDemo@2026" }));
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  const cookie = value.length <= 3180 ? `${name}=${value}` : value.match(/.{1,3180}/g).map((p, i) => `${name}.${i}=${p}`).join("; ");
  return (sessions[email] = { client: c, cookie });
}
async function page(who, path, expect = []) {
  const res = await fetch(base + path, { headers: who ? { cookie: (await signIn(who)).cookie } : {}, redirect: "manual" });
  const html = (await res.text()).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
  assert.equal(res.status, 200, `${who ?? "signed out"} ${path} → ${res.status}`);
  assert.ok(!/Application error|This page didn.t load/.test(html), `${path} hit the error boundary`);
  const missing = expect.filter((t) => !html.includes(t));
  assert.deepEqual(missing, [], `${path} missing text`);
}
const user = async (n) => ok(await db.from("profiles").select("id").eq("email", `${n}@dvit.edu.in`).single()).id;
const resource = async (n) => ok(await db.from("resources").select("id, org_id").eq("name", n).single());
const now = async () => new Date(ok(await db.rpc("app_now")));
const balance = async (u) => ok(await db.from("credit_ledger").select("delta").eq("user_id", u)).reduce((s, r) => s + r.delta, 0);
const tick = async () => {
  const res = await fetch(`${base}/api/cron/tick`, { method: "POST", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.deepEqual([...body.batch.errors, ...body.errors], [], "tick reported errors");
};

async function judgeRun(run) {
  console.log(`\n--- run ${run}`);
  // Reset demo data: what the Admin button does (resetDemoData), then the seed is all a judge sees.
  ok(await db.rpc("seed_demo"));
  for (const k of Object.keys(sessions)) delete sessions[k];
  const [admin, riya, aarav, sneha, om, photo, kulkarni] = await Promise.all(
    ["admin", "riya", "aarav", "sneha", "om", "photo.lead", "prof.kulkarni"].map(user),
  );
  const [dslr, cnc, seminar] = await Promise.all(["DSLR camera kit", "CNC milling machine", "Seminar hall"].map(resource));
  const clock = async (seconds) => {
    ok(await db.rpc("set_clock", { p_admin: admin, p_advance_seconds: seconds }));
    await tick();
  };
  let b;

  await step("1. landing → Try the demo → Owner creates a Portable equipment listing", async () => {
    await page(null, "/", ["Try the demo"]);
    await page(null, "/login", ["Try the demo", "Prof. Kulkarni"]);
    await page("photo.lead", "/owner/resources/new", ["Portable equipment", "Guided photo shots"]);
    const { client } = await signIn("photo.lead");
    const name = `Tripod (judge run ${run})`;
    ok(await client.from("resources").insert({
      org_id: dslr.org_id, category: "media", form_template: "portable", name, description: "Carbon tripod with ball head",
      location: "Media room", quantity: 1, approval_mode: "owner", allocation_mode: "instant", base_rate: 5, rate_unit: "day",
      checklist: { items: ["Tripod legs", "Ball head"], shots: ["Front", "Ball head close-up", "Folded"] },
    }).select("id").single());
    await page("photo.lead", "/owner/resources", [name]);
  });

  await step("2. Aarav: CNC shows Action required (training badge); the camera shows Eligible", async () => {
    await page("aarav", `/student/browse/${cnc.id}`, ["Action required", "CNC Safety Training"]);
    await page("aarav", `/student/browse/${dslr.id}`, ["Eligible"]);
  });

  await step("3. Riya requests the DSLR for tomorrow and sees the credit hold summary", async () => {
    await page("riya", `/student/browse/${dslr.id}`, ["Eligible"]);
    // The request form's default slot: the next whole IST hour, moved to tomorrow, for one day.
    const IST = 330 * 60_000;
    const next = Math.ceil(((await now()).getTime() + IST) / H) * H - IST;
    const start = new Date(next + 24 * H);
    b = ok(await db.rpc("submit_booking", {
      p_user: riya, p_resource: dslr.id, p_start: start.toISOString(), p_end: new Date(start.getTime() + 24 * H).toISOString(),
      p_event: "submit_approval", p_fields: { purpose_category: "club_activity", purpose_text: `Judge run ${run}`, credit_hold: 10, grace_minutes: 120, approver_role: "owner" },
    })).id;
    await page("riya", `/student/bookings/${b}`, ["Pending approval"]);
  });

  await step("4. Owner approves; Riya sees the pickup QR", async () => {
    await page("photo.lead", "/owner/requests", [`Judge run ${run}`]);
    ok(await db.rpc("transition_booking", { p_booking_id: b, p_event: "approve", p_actor_id: photo, p_actor_role: "owner" }));
    await page("riya", `/student/bookings/${b}`, ["Pickup QR"]);
  });

  await step("5. clock +1 day; the Owner opens Riya's code (no camera) and it is valid at once", async () => {
    await clock(86_400);
    const res = await fetch(`${base}/student/bookings/${b}`, { headers: { cookie: (await signIn("riya")).cookie } });
    const code = (await res.text()).match(/font-mono">(https?:[^<]+)<\/p>/)?.[1]?.replaceAll("&amp;", "&");
    assert.ok(code, "Riya's page shows the code under \"Can't scan?\"");
    const scan = new URL(code);
    for (let i = 0; ; i++) {
      const html = await (await fetch(`${base}${scan.pathname}${scan.search}`, { headers: { cookie: (await signIn("photo.lead")).cookie } })).text();
      if (!html.includes("not valid yet")) break;
      if (i === 0) {
        failures++;
        console.log("FAIL 5a. right after +1 day the pickup QR is not valid yet (opens 15 min before the slot); a judge must add +15 min");
      }
      assert.ok(i < 4, "still not valid after +1 h");
      await clock(15 * 60);
    }
    await page("photo.lead", `/owner/bookings/${b}/handover?t=${encodeURIComponent(scan.searchParams.get("t"))}`, ["Front", "Lens close-up"]);
  });

  await step("5b. Owner signs the checklist and photos; Riya acknowledges", async () => {
    const shots = ["Front", "Back", "Lens close-up", "All accessories laid out"];
    ok(await db.rpc("record_condition", { p_booking: b, p_actor: photo, p_actor_role: "owner", p_phase: "checkout",
      p_checklist: [{ item: "Camera body", ok: true }], p_photos: shots.map((shot, i) => ({ shot, path: `${b}/checkout-${i}.jpg` })), p_notes: "", p_supervisor: "" }));
    ok(await db.rpc("acknowledge_condition", { p_user: riya, p_booking: b, p_phase: "checkout" }));
    await page("riya", `/student/bookings/${b}`, ["Return QR"]);
  });

  let caseId;
  await step("6. clock +1 day 3 h (late); Owner records the return and raises damage", async () => {
    await clock(86_400 + 3 * 3600);
    const st = ok(await db.from("bookings").select("status").eq("id", b).single()).status;
    assert.equal(st, "overdue", "the cron marks it overdue before the Owner records the return");
    const shots = ["Front", "Back", "Lens close-up", "All accessories laid out"];
    ok(await db.rpc("record_condition", { p_booking: b, p_actor: photo, p_actor_role: "owner", p_phase: "return",
      p_checklist: [{ item: "Camera body", ok: false, note: "Scratch on the lens" }], p_photos: shots.map((shot, i) => ({ shot, path: `${b}/return-${i}.jpg` })), p_notes: "", p_supervisor: "" }));
    await page("photo.lead", `/owner/bookings/${b}`, ["Raise damage for a Manager to decide"]);
    caseId = ok(await db.rpc("report_damage", { p_booking: b, p_actor: photo, p_role: "owner", p_description: "Fine scratch across the front lens element", p_severity: "minor", p_ai_flags: null })).id;
  });

  await step("7. Riya responds to the damage case", async () => {
    await page("riya", `/student/bookings/${b}`, ["Send my response"]);
    ok(await db.rpc("respond_damage", { p_user: riya, p_case: caseId, p_text: "The mark was there at pickup; see the front photo.", p_photos: [] }));
  });

  await step("8. Prof. Kulkarni reviews the evidence, deducts partly with a reason, waives the late penalty", async () => {
    await page("prof.kulkarni", `/manager/bookings/${b}`, ["Shot by shot", "Student response", "Late penalty"]);
    ok(await db.rpc("decide_damage", { p_case: caseId, p_actor: kulkarni, p_role: "manager", p_outcome: "credit_deduction",
      p_reason: "Photos suggest the mark was partly pre-existing", p_credits: 15, p_restriction_days: null, p_charge: 10, p_maintenance: false }));
    const [late] = ok(await db.from("penalties").select("id").eq("booking_id", b).eq("kind", "late"));
    ok(await db.rpc("decide_penalty", { p_penalty: late.id, p_actor: kulkarni, p_decision: "waive", p_amount: null, p_reason: "Owner desk was closed at the due time" }));
  });

  await step("9. Riya's timeline shows every step with actor role and reason, plus the ledger", async () => {
    const actions = ok(await db.from("audit_events").select("action").eq("entity_id", b)).map((e) => e.action);
    for (const a of ["BOOKING_SUBMIT_APPROVAL", "BOOKING_APPROVE", "BOOKING_HANDOVER", "CONDITION_ACKNOWLEDGED", "BOOKING_RETURN", "BOOKING_REPORT_DAMAGE", "BOOKING_DECIDE_DISPUTE"])
      assert.ok(actions.includes(a), `timeline lacks ${a}`);
    await page("riya", `/student/bookings/${b}`, ["Completed", "Photos suggest the mark was partly pre-existing"]);
    await page("riya", "/student/wallet", ["Credits"]);
  });

  await step("10. Admin runs the scheduler: the seminar hall has allocated with scores; reports and audit open", async () => {
    await tick();
    const sem = ok(await db.from("bookings").select("id, status, score_breakdown").eq("resource_id", seminar.id).not("score_breakdown", "is", null));
    assert.ok(sem.length >= 3, `${sem.length} scored seminar requests`);
    const waiting = sem.find((s) => s.status === "waitlisted") ?? sem.find((s) => s.status !== "approved");
    await page("admin", `/admin/bookings/${waiting.id}`, ["Priority score"]);
    await page("admin", "/admin/insights", ["Underused"]);
    await page("admin", "/admin/audit", ["Export CSV"]);
  });

  await step("11. Sneha asks for emergency credits, Admin grants part; Admin verifies Om, grants a role, changes a policy", async () => {
    const before = await balance(sneha);
    const req = ok(await db.rpc("request_emergency_credits", { p_user: sneha, p_booking: null, p_amount: 30, p_reason: "Final-year project demo on Friday", p_urgency: "high" }));
    await page("admin", "/admin", ["Emergency credits"]);
    ok(await db.rpc("decide_emergency_credits", { p_admin: admin, p_request: req.id, p_grant: 20, p_reason: "Partial: 20 covers the demo" }));
    assert.equal(await balance(sneha), before + 20);
    await page("admin", "/admin/verifications", ["Om"]);
    ok(await db.rpc("decide_verification", { p_admin: admin, p_user: om, p_approve: true, p_reason: "" }));
    ok(await db.rpc("set_membership", { p_admin: admin, p_user: aarav, p_org: cnc.org_id, p_role: "owner", p_grant: true, p_reason: "Makerspace volunteer this term", p_replacement: null }));
    const cur = ok(await db.from("policy_versions").select("version, values").order("version", { ascending: false }).limit(1).single());
    const prev = cur.values.weekly_allowance;
    ok(await db.rpc("change_policy", { p_admin: admin, p_values: { ...cur.values, weekly_allowance: prev + 20 }, p_diff: { previous: { weekly_allowance: prev }, new: { weekly_allowance: prev + 20 } }, p_reason: "More credits for exam season" }));
    await page("admin", "/admin/policies", [`v${cur.version + 1}`]);
  });
}

await judgeRun(1);
await judgeRun(2);
ok(await db.rpc("seed_demo"));
console.log(failures ? `\n${failures} step(s) failed` : "\nThe judge script ran twice after a reset with zero manual fixes");
process.exit(failures ? 1 : 0);
