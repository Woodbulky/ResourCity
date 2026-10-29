import { afterEach, describe, expect, it, vi } from "vitest";
import { conditionComparisonSchema, searchFiltersSchema } from "../contracts/ai";

vi.mock("server-only", () => ({}));
const { aiJson } = await import("./client");

const reply = (content: string) => new Response(JSON.stringify({ model: "m", choices: [{ message: { content } }] }), { status: 200 });

describe("aiJson (PRD 14: JSON only, zod-parsed, one retry, then fallback)", () => {
  afterEach(() => vi.unstubAllGlobals());
  process.env.AI_ROUTER_BASE_URL = "https://router.test/v1";
  process.env.AI_ROUTER_API_KEY = "k";
  process.env.AI_MODEL = "m";

  it("parses a fenced JSON reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('```json\n{"overall":"no_change","shots":[],"missing_items":[]}\n```')));
    const r = await aiJson(conditionComparisonSchema, "s", "u");
    expect(r).toEqual({ ok: true, model: "m", data: { overall: "no_change", shots: [], missing_items: [] } });
  });

  it("retries once on invalid JSON, then succeeds", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply("not json")).mockResolvedValueOnce(reply('{"overall":"inconclusive","shots":[]}'));
    vi.stubGlobal("fetch", fetch);
    const r = await aiJson(conditionComparisonSchema, "s", "u");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it("falls back after two failures, a timeout or an HTTP error, never throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('{"overall":"blame the student"}')));
    expect((await aiJson(conditionComparisonSchema, "s", "u")).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    expect(await aiJson(conditionComparisonSchema, "s", "u")).toEqual({ ok: false, error: "timed out" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 502 })));
    expect(await aiJson(conditionComparisonSchema, "s", "u")).toEqual({ ok: false, error: "AI router returned HTTP 502" });
  });

  it("is off without configuration", async () => {
    delete process.env.AI_MODEL;
    expect((await aiJson(conditionComparisonSchema, "s", "u")).ok).toBe(false);
    process.env.AI_MODEL = "m";
  });
});

describe("searchFiltersSchema", () => {
  it("turns fields the model got wrong into null instead of failing the reply", () => {
    const f = searchFiltersSchema.parse({ category: "camera", keywords: ["camera"], date: "tomorrow", start_time: "10:00", quantity: "2", needs_clarification: false });
    expect(f).toMatchObject({ category: null, date: null, start_time: "10:00", quantity: 2, end_time: null, clarification_question: null });
  });
});
