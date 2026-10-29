// Phase 7 accessibility pass (PRD 16) on the rendered HTML of every page each role can reach:
// form controls have a label, images have alt text, buttons and links have a name, one <main id="main">
// for the skip link, no duplicate ids, html lang set. Static markup only: contrast is checked against
// the tokens (all pairs pass AA), keyboard order and focus by hand.
// Run: npx next start -p 3005, then node --env-file=.env.local scripts/phase7-a11y.mjs [base URL]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "http://localhost:3005";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let failures = 0;

async function cookieFor(email) {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: `${email}@dvit.edu.in`, password: "DvitDemo@2026" });
  if (error) throw error;
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
  const name = `sb-${ref}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  return value.match(/.{1,3180}/g).map((part, i) => `${name}.${i}=${part}`).join("; ");
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const text = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, "x").trim();

export function audit(raw) {
  // Drop scripts and templates React streams in: they repeat markup that is not on the page yet.
  const html = raw.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<template[\s\S]*?<\/template>/g, "");
  const issues = [];
  const labelFor = new Set([...html.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]));
  const labelledIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  // Walk tags once, tracking whether we are inside a <label>.
  let inLabel = 0;
  for (const m of html.matchAll(/<\/?(label|input|select|textarea|img)\b[^>]*>/g)) {
    const [tag, name] = m;
    if (name === "label") { inLabel += tag.startsWith("</") ? -1 : 1; continue; }
    if (tag.startsWith("</")) continue;
    if (name === "img") { if (attr(tag, "alt") === undefined) issues.push(`img without alt: ${attr(tag, "src")?.slice(0, 60)}`); continue; }
    const type = attr(tag, "type") ?? "text";
    if (name === "input" && ["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    const id = attr(tag, "id");
    const named = inLabel > 0 || attr(tag, "aria-label") || (attr(tag, "aria-labelledby") ?? "").split(" ").some((i) => labelledIds.has(i)) || (id && labelFor.has(id)) || attr(tag, "title");
    if (!named) issues.push(`${name}[${type}] name="${attr(tag, "name") ?? ""}" has no label`);
  }
  for (const m of html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, el, attrs, inner] = m;
    if (el === "a" && !/\shref=/.test(attrs)) continue;
    if (!text(inner) && !/aria-label(ledby)?="[^"]+"/.test(attrs) && !/aria-label="[^"]+"|alt="[^"]+"|<span class="sr-only/.test(inner))
      issues.push(`${el} without a name: ${attrs.slice(0, 80)}`);
  }
  const mains = [...html.matchAll(/<main\b[^>]*>/g)];
  if (mains.length !== 1 || !/id="main"/.test(mains[0]?.[0] ?? "")) issues.push(`${mains.length} <main> element(s), skip link needs exactly one id="main"`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = [...new Set(ids.filter((v, i) => ids.indexOf(v) !== i))];
  if (dup.length) issues.push(`duplicate ids: ${dup.join(", ")}`);
  if (!/<html[^>]*\slang="/.test(html)) issues.push("html without lang");
  return issues;
}

async function page(who, path) {
  const res = await fetch(base + path, { headers: who ? { cookie: await cookieFor(who) } : {}, redirect: "manual" });
  const issues = res.status === 200 ? audit(await res.text()) : [`status ${res.status}`];
  if (issues.length) {
    failures++;
    console.log(`FAIL ${who ?? "signed out"} ${path}\n       ${[...new Set(issues)].join("\n       ")}`);
  } else console.log(`ok   ${who ?? "signed out"} ${path}`);
}

await service.rpc("seed_demo");
const one = async (q) => (await q.limit(1).single()).data.id;
const [dslr, booking, approved] = await Promise.all([
  one(service.from("resources").select("id").eq("name", "DSLR camera kit")),
  one(service.from("bookings").select("id").eq("purpose_text", "Annual fest photography")),
  one(service.from("bookings").select("id, resources!inner(name)").eq("status", "approved").eq("resources.name", "DSLR camera kit")),
]);

const pages = {
  [""]: ["/", "/login"],
  riya: ["/student", "/student/browse", `/student/browse/${dslr}`, "/student/bookings", "/student/wallet", "/student/scan", "/notifications"],
  tanvi: [`/student/bookings/${approved}`], // the seeded approved DSLR booking: QR page
  om: ["/pending"],
  "photo.lead": ["/owner", "/owner/requests", "/owner/handovers", "/owner/resources", "/owner/resources/new", `/owner/resources/${dslr}/edit`, `/owner/resources/${dslr}/door`, "/owner/scan", "/owner/badges", `/owner/bookings/${booking}`, `/owner/bookings/${approved}/handover`],
  "prof.kulkarni": ["/manager", "/manager/queue", "/manager/cases", "/manager/insights", `/manager/bookings/${booking}`],
  admin: ["/admin", "/admin/verifications", "/admin/people", "/admin/policies", "/admin/badges", "/admin/cases", "/admin/insights", "/admin/audit", `/admin/bookings/${booking}`],
};
for (const [who, paths] of Object.entries(pages)) for (const p of paths) await page(who || null, p);

console.log(failures ? `\n${failures} page(s) with issues` : "\nAll pages pass the markup checks");
process.exit(failures ? 1 : 0);
