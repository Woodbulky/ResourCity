// Phase 6 check: dashboards open with the seed's counts, audit filters and CSV export, badge types.
// Run: npx next start -p 3005, then node --env-file=.env.local scripts/phase6-check.mjs [base URL]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3005";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failures = 0;

const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` → ${detail}` : ""}`);
};

async function signIn(who) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${who}@dvit.edu.in`, password: "DvitDemo@2026" });
  if (error) throw error;
  return { client: c, session: data.session };
}

// @supabase/ssr session cookie, chunked like the library does.
async function cookieFor(who) {
  const { session } = await signIn(who);
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  return value.match(/.{1,3180}/g).map((part, i) => `${name}.${i}=${part}`).join("; ");
}

async function get(who, path) {
  const res = await fetch(base + path, { headers: { cookie: await cookieFor(who) }, redirect: "manual" });
  return { status: res.status, type: res.headers.get("content-type") ?? "", text: (await res.text()).replaceAll("&#x27;", "'").replaceAll("&amp;", "&").replaceAll("<!-- -->", "") };
}

async function page(who, path, expect = [], absent = []) {
  const { status, text } = await get(who, path);
  const bad = status !== 200 || /Application error|Internal Server Error/i.test(text);
  const missing = expect.filter((t) => !text.includes(t));
  const present = absent.filter((t) => text.includes(t));
  check(`${who} ${path}`, !bad && !missing.length && !present.length,
    `${status}${missing.length ? ` missing: ${missing.join(" | ")}` : ""}${present.length ? ` unexpected: ${present.join(" | ")}` : ""}`);
}

await service.rpc("seed_demo");
const count = async (q) => (await q).count ?? 0;
const [verifications, emergency, escalated, certs] = await Promise.all([
  count(service.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending_verification").not("verification_submitted_at", "is", null)),
  count(service.from("emergency_credit_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
  count(service.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending_approval").gte("escalation_level", 2)),
  count(service.from("user_badges").select("id", { count: "exact", head: true }).eq("status", "pending")),
]);
check("seed: 1 emergency request, 1 escalation, 1 certificate", emergency === 1 && escalated === 1 && certs === 1, `${emergency}/${escalated}/${certs}`);
const { data: dslr } = await service.from("resources").select("id").eq("name", "DSLR camera kit").single();

// Dashboards open with the seed's counts.
await page("admin", "/admin", [`${verifications + emergency + escalated} waiting`, "Manager has not decided"]);
await page("photo.lead", "/owner", ["Also waiting on you", "AI flagged a possible difference"]);
await page("makerspace.lead", "/owner", ["1 training certificate to verify"]);
await page("photo.lead", `/owner/resources/${dslr.id}/edit`, ["Availability", "Pause bookings", "Mark under maintenance"], ["Reopen for bookings"]);
await page("prof.mehta", "/manager", ["Your decision queue"]);
await page("prof.mehta", "/manager/insights", ["My decisions", "People and patterns", "Repeated no-shows", "Open h", "Booked h"]);
await page("kabir", "/student", ["Needs your action", "2 / 3"]);
await page("riya", "/student/wallet", ["Training badges"]);
await page("admin", "/admin/insights", ["Underused resources", "not proof of cause", "Utilisation by organisation", "Override frequency per Manager", "No-shows by weekday"]);
await page("admin", "/admin/badges", ["Badge types", "CNC Safety Training", "Photography Basics", "Add badge type", "Issue and revoke history"]);

// Audit filters (server side) and CSV export without contact details.
await page("admin", "/admin/audit?action=POLICY_CHANGED", ["POLICY_CHANGED"], ["BOOKING_APPROVE"]);
await page("admin", `/admin/audit?resource=${dslr.id}`, ["DSLR camera kit"], ["POLICY_CHANGED"]);
const csv = await get("admin", "/admin/audit/export?action=BOOKING_");
const lines = csv.text.trim().split("\r\n");
check("CSV export: header, rows, no emails", csv.status === 200 && csv.type.startsWith("text/csv") && lines[0].startsWith("id,time_ist,action") && lines.length > 1 && !csv.text.includes("@dvit.edu.in"),
  `${csv.status} ${csv.type} ${lines.length} lines`);
check("CSV export: action filter applied", lines.slice(1).every((l) => l.match(/^"[^"]*","[^"]*","([^"]*)"/)?.[1].startsWith("BOOKING_")));
const denied = await get("riya", "/admin/audit/export");
check("CSV export refused for a student", denied.status !== 200 || !denied.text.startsWith("id,"), String(denied.status));

// RLS on audit_search: a student only sees events about their own bookings.
const riya = await signIn("riya");
const { data: mine, error: mineErr } = await riya.client.rpc("audit_search", { p_limit: 5000 });
const { count: total } = await service.from("audit_events").select("id", { count: "exact", head: true });
check("audit_search respects RLS for students", !mineErr && mine.length > 0 && mine.length < total, mineErr?.message ?? `${mine?.length} of ${total}`);

// Badge types: Admin only, validated, audited.
const { data: adminProfile } = await service.from("profiles").select("id").eq("email", "admin@dvit.edu.in").single();
const { data: org } = await service.from("organizations").select("id").eq("name", "Makerspace").single();
const name = `Soldering Safety ${Date.now()}`;
const { error: denyErr } = await riya.client.rpc("create_badge_type", { p_actor: adminProfile.id, p_name: name, p_description: "", p_org: org.id, p_validity_days: 365 });
check("create_badge_type refused for signed-in users", !!denyErr && /permission denied/i.test(denyErr.message), denyErr?.message);
const { data: notAdmin } = await service.from("profiles").select("id").eq("email", "riya@dvit.edu.in").single();
const { error: forbidden } = await service.rpc("create_badge_type", { p_actor: notAdmin.id, p_name: name, p_description: "", p_org: org.id, p_validity_days: 365 });
check("create_badge_type refused for a non-Admin actor", /forbidden/.test(forbidden?.message ?? ""), forbidden?.message);
const { data: created, error: createErr } = await service.rpc("create_badge_type", { p_actor: adminProfile.id, p_name: name, p_description: "Basic soldering", p_org: org.id, p_validity_days: 180 });
check("create_badge_type by an Admin", !createErr && created?.validity_days === 180, createErr?.message);
const { error: dupErr } = await service.rpc("create_badge_type", { p_actor: adminProfile.id, p_name: name.toUpperCase(), p_description: "", p_org: org.id, p_validity_days: 180 });
check("duplicate badge type refused", /duplicate/.test(dupErr?.message ?? ""), dupErr?.message);
const { count: logged } = await service.from("audit_events").select("id", { count: "exact", head: true }).eq("action", "BADGE_TYPE_CREATED").eq("entity_id", created?.id ?? "");
check("BADGE_TYPE_CREATED audited", logged === 1);

await service.rpc("seed_demo"); // leave the demo as the judges will find it
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
