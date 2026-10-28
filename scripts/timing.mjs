// Response time of signed-in pages on a deployment (default: production). The slot summary runs
// the same evaluation as submitting a request, so it tracks action latency.
// Run: node --env-file=.env.local scripts/timing.mjs [base URL]
import { createClient } from "@supabase/supabase-js";

const base = process.argv[2] ?? "https://resour-city.vercel.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(url).hostname.split(".")[0];
const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await c.auth.signInWithPassword({ email: "riya@dvit.edu.in", password: "DvitDemo@2026" });
if (error) throw error;
const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;
const name = `sb-${ref}-auth-token`;
const cookie = value.length <= 3180 ? `${name}=${value}` : value.match(/.{1,3180}/g).map((p, i) => `${name}.${i}=${p}`).join("; ");

const DSLR = "00000000-0000-4000-d000-000000000001";
const day = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(Date.now() + offset * 86_400_000);
const paths = {
  overview: "/student",
  "slot summary": `/student/browse/${DSLR}?start_date=${day(5)}&start_time=10:00&end_date=${day(6)}&end_time=10:00`,
  bookings: "/student/bookings",
};

for (const [label, path] of Object.entries(paths)) {
  const times = [];
  let region = "";
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    const res = await fetch(base + path, { headers: { cookie } });
    await res.text();
    times.push(Math.round(performance.now() - t));
    region = res.headers.get("x-vercel-id")?.split("::").slice(0, -1).join("→") ?? "";
  }
  console.log(`${label.padEnd(13)} ${times.join(" / ")} ms  (first is cold)  ${region}`);
}
