// Live AI check against the router and the Supabase project (PRD 14). Skipped unless AI_LIVE=1:
//   AI_LIVE=1 npx vitest run src/lib/ai/features.live.test.ts
// Uploads two synthetic photo pairs for a seeded returned booking, runs the condition comparison and
// the search parser, then re-seeds.
import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const live = process.env.AI_LIVE === "1";
if (live) process.loadEnvFile(".env.local");

// A grey 96×96 PNG, optionally with a dark diagonal "scratch".
function png(scratch: boolean) {
  const size = 96;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: size }, (_, y) =>
    Buffer.concat([Buffer.from([0]), ...Array.from({ length: size }, (_, x) => Buffer.from(scratch && Math.abs(x - y) < 3 ? [20, 20, 20] : [170, 170, 170]))]),
  );
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

describe.runIf(live)("AI features, live", () => {
  it("search parser resolves 'tomorrow' against app time and picks the category", async () => {
    const { parseSearch } = await import("./features");
    const r = await parseSearch("camera for tomorrow's college event 10am to 4pm");
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.data.category).toBe("media");
    expect(r.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.data.start_time).toBe("10:00");
    expect(r.data.end_time).toBe("16:00");
  }, 60_000);

  it("condition comparison stores a parsed suggestion on the return record", async () => {
    const { createServiceClient } = await import("../server/supabase");
    const { compareCondition } = await import("./features");
    const db = createServiceClient();
    await db.rpc("seed_demo");
    const { data: b } = await db.from("bookings").select("id").eq("purpose_text", "Weekend trek photos").single();
    const { data: reports } = await db.from("condition_reports").select("phase, photos").eq("booking_id", b!.id);
    for (const r of reports ?? [])
      for (const [i, p] of (r.photos as { path: string }[]).entries())
        await db.storage.from("condition-photos").upload(p.path, png(r.phase === "return" && i === 2), { contentType: "image/png", upsert: true });
    await db.from("condition_reports").update({ ai_analysis: null }).eq("booking_id", b!.id).eq("phase", "return");

    await compareCondition(b!.id);
    const { data: rep } = await db.from("condition_reports").select("ai_analysis").eq("booking_id", b!.id).eq("phase", "return").single();
    const ai = rep!.ai_analysis as Record<string, unknown>;
    expect(ai.status, JSON.stringify(ai)).toBeUndefined();
    expect(["no_change", "possible_damage", "inconclusive"]).toContain(ai.overall);
    expect(ai.model).toBeTruthy();
    console.log("comparison:", JSON.stringify(ai).slice(0, 600));
    await db.rpc("seed_demo");
  }, 120_000);
});
