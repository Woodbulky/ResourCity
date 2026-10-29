import "server-only";
import type { z } from "zod";

// One OpenAI-compatible chat call through the AI router (PRD 14). Server-side only. The model must
// reply with JSON; the reply is parsed with the caller's zod schema. Invalid JSON gets one retry,
// then the caller falls back to the manual workflow. 20-second timeout per attempt.
export type AiContent = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export type AiResult<T> = { ok: true; data: T; model: string } | { ok: false; error: string };

export const AI_UNAVAILABLE = "AI suggestion unavailable — continue manually.";

export async function aiJson<S extends z.ZodType>(schema: S, system: string, content: AiContent): Promise<AiResult<z.infer<S>>> {
  const { AI_ROUTER_BASE_URL: base, AI_ROUTER_API_KEY: key, AI_MODEL: model } = process.env;
  if (!base || !key || !model) return { ok: false, error: "AI is not configured." };
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: `${system}\nReply with one JSON object only: no prose, no code fences.` },
            { role: "user", content },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        error = `AI router returned HTTP ${res.status}`;
        continue;
      }
      const body = await res.json();
      const text: string = body.choices?.[0]?.message?.content ?? "";
      const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1); // tolerate fences or a stray sentence
      const parsed = schema.safeParse(JSON.parse(json));
      if (parsed.success) return { ok: true, data: parsed.data, model: body.model ?? model };
      error = `Reply did not match the schema: ${parsed.error.issues[0]?.message ?? ""}`;
    } catch (e) {
      error = e instanceof Error ? e.message : "AI call failed";
    }
  }
  return { ok: false, error };
}

// Images go as base64 data URLs (PRD 14); the browser already resized them to 1280 px.
export const dataUrl = (bytes: ArrayBuffer, type: string) => `data:${type || "image/jpeg"};base64,${Buffer.from(bytes).toString("base64")}`;
