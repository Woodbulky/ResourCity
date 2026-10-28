// Phase 3 page smoke test: signs in as each demo role, renders every Phase 3 page on a running
// server and fails on any non-200 or error boundary. Leaves one approved DSLR booking for Riya so
// the QR, scan and handover pages have something to render, then re-seeds at the end.
// Run: npx next start -p 3005, then node --env-file=.env.local scripts/phase3-pages.mjs [base URL]
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

const base = process.argv[2] ?? "http://localhost:3005";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const RIYA = "00000000-0000-4000-a000-000000000006";
let failures = 0;

// @supabase/ssr session cookie, chunked like the library does.
async function cookieFor(email) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: "DvitDemo@2026" });
  if (error) throw error;
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  return value.match(/.{1,3180}/g).map((part, i) => `${name}.${i}=${part}`).join("; ");
}

async function page(cookie, path, expect = []) {
  const res = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
  const html = await res.text();
  const bad = res.status !== 200 || /Application error|Internal Server Error|digest/i.test(html);
  const missing = expect.filter((t) => !html.includes(t));
  if (bad || missing.length) {
    failures++;
    console.log(`FAIL ${path} → ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}${missing.length ? ` missing: ${missing.join(", ")}` : ""}`);
  } else console.log(`ok   ${path}`);
}

const qr = (payload) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", process.env.QR_SIGNING_SECRET).update(body).digest("base64url")}`;
};

await service.rpc("seed_demo");
const now = new Date((await service.rpc("app_now")).data);
const { data: dslr } = await service.from("resources").select("id").eq("name", "DSLR camera kit").single();
const { data: meeting } = await service.from("resources").select("id, door_qr_token").eq("name", "Meeting room").single();
const { data: owner } = await service.from("profiles").select("id").eq("email", "photo.lead@dvit.edu.in").single();
const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const later = (days) => day(new Date(now.getTime() + days * 86_400_000));

// Request flow first, while Riya holds no booking (the DSLR allows one). Next Monday → Tuesday stays
// inside its Mon–Sat hours.
const toMonday = ((8 - new Date(`${later(0)}T12:00:00Z`).getUTCDay()) % 7) || 7;
const riyaFirst = await cookieFor("riya@dvit.edu.in");
await page(riyaFirst, `/student/browse/${dslr.id}`, ["Check this slot"]);
await page(riyaFirst, `/student/browse/${dslr.id}?start_date=${later(toMonday)}&start_time=10:00&end_date=${later(toMonday + 1)}&end_time=10:00`, ["Credit cost", "Send request"]);
await page(riyaFirst, `/student/browse/${meeting.id}?start_date=${later(1)}&start_time=03:00&end_date=${later(1)}&end_time=04:00`, ["Outside bookable hours"]);

const start = new Date(now.getTime() + 5 * 60_000);
const { data: b, error } = await service.rpc("submit_booking", {
  p_user: RIYA, p_resource: dslr.id, p_start: start.toISOString(), p_end: new Date(start.getTime() + 86_400_000).toISOString(),
  p_event: "submit_approval", p_fields: { purpose_category: "club_activity", purpose_text: "Smoke test", credit_hold: 10, grace_minutes: 120 },
});
if (error) throw error;
const { data: pending } = await service.rpc("submit_booking", {
  p_user: RIYA, p_resource: dslr.id, p_start: new Date(start.getTime() + 3 * 86_400_000).toISOString(),
  p_end: new Date(start.getTime() + 4 * 86_400_000).toISOString(), p_event: "submit_approval",
  p_fields: { purpose_category: "personal", purpose_text: "Pending for the queue", credit_hold: 10, grace_minutes: 120 },
});
await service.rpc("transition_booking", { p_booking_id: b.id, p_event: "approve", p_actor_id: owner.id, p_actor_role: "owner" });
const token = qr({ b: b.id, u: RIYA, p: "pickup", nbf: Math.floor(start.getTime() / 1000) - 900, exp: Math.floor(start.getTime() / 1000) + 7200 });

const riya = await cookieFor("riya@dvit.edu.in");
await page(riya, `/student/bookings/${b.id}`, ["Pickup QR", "I can&#x27;t make it"]);
await page(riya, `/student/bookings/${pending.id}`, ["Withdraw this request"]);
await page(riya, "/student/scan", ["Start camera"]);
await page(riya, `/checkin/${meeting.door_qr_token}`, ["Check in now"]);

const photo = await cookieFor("photo.lead@dvit.edu.in");
await page(photo, `/owner/bookings/${pending.id}`, ["Approve", "Reject", "On time"]);
await page(photo, `/owner/bookings/${b.id}`, ["Scan pickup QR"]);
await page(photo, "/owner/scan", ["Start camera"]);
await page(photo, `/owner/scan?t=${token}`, ["start handover", "Not them"]);
await page(photo, `/owner/scan?t=${token.slice(0, -2)}xx`, ["signature is not valid"]);
await page(photo, `/owner/bookings/${b.id}/handover?t=${token}`, ["Sign and hand over", "Camera body"]);
await page(photo, `/owner/bookings/${b.id}/handover`, ["Scan the student"]);
await page(photo, "/owner/resources", ["Add a resource", "Edit"]);
await page(photo, "/owner/resources/new", ["Publish listing"]);
await page(photo, `/owner/resources/${dslr.id}/edit`, ["Save changes", "Camera body"]);
await page(photo, "/owner/handovers", ["Open scanner"]);

const mehta = await cookieFor("prof.mehta@dvit.edu.in");
await page(mehta, "/manager/queue");
await service.rpc("seed_demo");
console.log(failures ? `\n${failures} page(s) failed` : "\nall pages rendered");
process.exit(failures ? 1 : 0);
