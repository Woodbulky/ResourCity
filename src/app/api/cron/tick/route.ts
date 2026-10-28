import { timingSafeEqual } from "node:crypto";
import { runScheduler } from "@/lib/server/scheduler";

// Scheduler tick (PRD 2): the Render cron job calls this every minute with CRON_SECRET.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runScheduler());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Scheduler failed" }, { status: 500 });
  }
}
