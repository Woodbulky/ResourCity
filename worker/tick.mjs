// Render cron job (PRD 2), every minute: all job logic lives in the Next.js app.
// Env: APP_URL (e.g. https://resour-city.vercel.app), CRON_SECRET.
const res = await fetch(`${process.env.APP_URL}/api/cron/tick`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(55_000),
});
console.log(res.status, await res.text());
if (!res.ok) process.exit(1);
