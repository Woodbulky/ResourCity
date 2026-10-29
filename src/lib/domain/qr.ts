// Signed, time-limited booking QR (PRD 10): HMAC-SHA256 over booking, student and validity window.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface QrPayload {
  b: string; // booking id
  u: string; // student id
  p: "pickup" | "return";
  nbf: number; // valid from, epoch seconds (simulated clock)
  exp: number; // valid until
}

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signQr(payload: QrPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}

export type QrCheck = { ok: true; payload: QrPayload } | { ok: false; error: string };

export function verifyQr(token: string, secret: string, now: Date): QrCheck {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, error: "This is not a ResourCity booking code." };
  const expected = Buffer.from(mac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return { ok: false, error: "This code's signature is not valid." };
  let payload: QrPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return { ok: false, error: "This is not a ResourCity booking code." };
  }
  const t = now.getTime() / 1000;
  if (t < payload.nbf) return { ok: false, error: "This code is not valid yet: it opens 60 minutes before the slot." };
  if (t > payload.exp) return { ok: false, error: "This code has expired. Ask the student to refresh their booking page." };
  return { ok: true, payload };
}

// Pickup: 60 minutes before start until the end of grace (PRD 10; door check-in stays 15). Return: from start until a day after
// the later of the end time and now (an overdue item can still come back).
export function qrWindow(
  b: { status: string; start_at: Date; end_at: Date; grace_minutes: number | null },
  now: Date,
): Pick<QrPayload, "p" | "nbf" | "exp"> | null {
  const s = (d: Date | number) => Math.floor(new Date(d).getTime() / 1000);
  if (b.status === "approved")
    return { p: "pickup", nbf: s(b.start_at) - 60 * 60, exp: s(b.start_at) + (b.grace_minutes ?? 15) * 60 };
  if (b.status === "checked_out" || b.status === "overdue")
    return { p: "return", nbf: s(b.start_at), exp: Math.max(s(b.end_at), s(now)) + 24 * 3600 };
  return null;
}
