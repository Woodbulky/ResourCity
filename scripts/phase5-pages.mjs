// Phase 5 page smoke test: renders the trust-workflow screens for each role against the seeded
// situations and fails on any non-200, error boundary or missing text.
// Run: npx next start -p 3005, then node --env-file=.env.local scripts/phase5-pages.mjs [base URL]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3005";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failures = 0;

// @supabase/ssr session cookie, chunked like the library does.
async function cookieFor(email) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${email}@dvit.edu.in`, password: "DvitDemo@2026" });
  if (error) throw error;
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  return value.match(/.{1,3180}/g).map((part, i) => `${name}.${i}=${part}`).join("; ");
}

async function page(who, path, expect = [], absent = []) {
  const res = await fetch(base + path, { headers: { cookie: await cookieFor(who) }, redirect: "manual" });
  const html = (await res.text()).replaceAll("&#x27;", "'").replaceAll("&amp;", "&");
  const bad = res.status !== 200 || /Application error|Internal Server Error/i.test(html);
  const missing = expect.filter((t) => !html.includes(t));
  const present = absent.filter((t) => html.includes(t));
  if (bad || missing.length || present.length) {
    failures++;
    console.log(`FAIL ${who} ${path} → ${res.status}${missing.length ? ` missing: ${missing.join(", ")}` : ""}${present.length ? ` unexpected: ${present.join(", ")}` : ""}`);
  } else console.log(`ok   ${who} ${path}`);
}

await service.rpc("seed_demo");
const id = async (purpose) => (await service.from("bookings").select("id").eq("purpose_text", purpose).single()).data.id;
const [camDispute, oscDispute, camFlag, late, wait] = await Promise.all(
  ["Annual fest photography", "Signals lab assignment", "Weekend trek photos", "Internship interview prep"].map(id).concat(
    service.from("bookings").select("id").eq("status", "waitlisted").eq("waitlist_position", 1).limit(1).single().then((r) => r.data.id),
  ),
);
const { data: dslr } = await service.from("resources").select("id").eq("name", "DSLR camera kit").single();

await page("prof.kulkarni", "/manager/cases", ["Safety incidents", "Damage disputes", "Assigned to you"]);
await page("prof.mehta", "/manager/cases", ["Coolant leaked", "Mark resource unsafe", "Record actions", "You filed this"]);
await page("prof.kulkarni", `/manager/bookings/${camDispute}`, ["Shot by shot", "Student response", "Outcome", "AI flags the Owner confirmed"]);
await page("prof.kulkarni", `/manager/bookings/${wait}`, ["Give this request priority"]);
await page("prof.mehta", `/manager/bookings/${late}`, ["Late penalty", "Confirm 16", "policy v2"]);
await page("prof.mehta", `/manager/bookings/${oscDispute}`, ["You filed this report, so another Manager decides it."], ["Request more evidence"]);
await page("admin", "/admin/cases", ["Conflict-of-interest disputes", "Digital oscilloscope", "Open safety incidents"]);
await page("admin", `/admin/bookings/${oscDispute}`, ["The student can respond until"]);
await page("photo.lead", `/owner/bookings/${camFlag}`, ["AI suggestion: condition comparison", "Possible fine scratch", "Raise damage for a Manager to decide", "Return OK"]);
await page("makerspace.lead", "/owner/badges", ["Waiting for you", "CNC Safety Training", "AI suggestion", "Verify badge"]);
await page("riya", "/student/wallet", ["Add a training certificate"]);
await page("riya", "/student/browse", ["Smart search"]);
await page("riya", `/student/browse/${dslr.id}`, ["Report a safety incident", "call 112"]);
await page("meera", `/student/bookings/${camDispute}`, ["Student response"], ["Send my response"]);
await page("ishaan", `/student/bookings/${oscDispute}`, ["Send my response"]);
await page("meera", `/student/bookings/${late}`, ["Late penalty", "Explain before the Manager decides"]);

await service.rpc("seed_demo");
console.log(failures ? `\n${failures} page(s) failed` : "\nAll Phase 5 pages render");
process.exit(failures ? 1 : 0);
