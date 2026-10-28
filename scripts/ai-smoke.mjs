// Phase 0 AI router smoke test (PRD Section 14): one text call, one image call.
// Run: node --env-file=.env.local scripts/ai-smoke.mjs
import { deflateSync } from "node:zlib";

const { AI_ROUTER_BASE_URL, AI_ROUTER_API_KEY, AI_MODEL } = process.env;
if (!AI_ROUTER_BASE_URL || !AI_ROUTER_API_KEY || !AI_MODEL) {
  console.error("Set AI_ROUTER_BASE_URL, AI_ROUTER_API_KEY and AI_MODEL in .env.local");
  process.exit(1);
}

// 16x16 solid green PNG, built in memory so the test needs no image file.
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function greenPng(size = 16) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([0x00, 0x68, 0x4a]))]);
  const raw = Buffer.concat(Array(size).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function call(label, content) {
  const started = Date.now();
  const res = await fetch(`${AI_ROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_ROUTER_API_KEY}` },
    body: JSON.stringify({ model: AI_MODEL, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  const reply = body.choices?.[0]?.message?.content;
  console.log(`${label}: HTTP ${res.status} in ${Date.now() - started} ms, model=${body.model ?? "?"}`);
  console.log(`  reply: ${reply ?? JSON.stringify(body).slice(0, 300)}`);
  return res.ok && Boolean(reply);
}

const text = await call("text", 'Reply with JSON only: {"ok": true}');
const image = await call("image", [
  { type: "text", text: 'What single colour fills this image? Reply with JSON only: {"colour": "..."}' },
  { type: "image_url", image_url: { url: `data:image/png;base64,${greenPng().toString("base64")}` } },
]);
console.log(`base_url=${AI_ROUTER_BASE_URL} model=${AI_MODEL} text=${text ? "ok" : "FAIL"} image=${image ? "ok" : "FAIL"}`);
process.exit(text && image ? 0 : 1);
