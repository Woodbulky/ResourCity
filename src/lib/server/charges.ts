import "server-only";
import type { Json } from "../contracts/database";
import { bookingRulesSchema } from "../contracts/resource";
import { returnCharge } from "../domain/pricing";
import { createServiceClient } from "./supabase";

// Credits for actual use when a returned booking closes (PRD 9): min(actual, booked) duration,
// never more than the hold. Used by Return OK and by the dispute decision.
export async function actualCharge(bookingId: string): Promise<{ charge: number; hold: number } | null> {
  const { data: b } = await createServiceClient()
    .from("bookings")
    .select("start_at, end_at, returned_at, credit_hold, resources(base_rate, rate_unit, peak_multiplier, booking_rules)")
    .eq("id", bookingId)
    .single();
  if (!b?.resources || !b.returned_at) return null;
  const rules = bookingRulesSchema.safeParse(b.resources.booking_rules).data ?? bookingRulesSchema.parse({});
  const charge = Math.min(
    b.credit_hold,
    returnCharge(
      { base_rate: b.resources.base_rate, rate_unit: b.resources.rate_unit, peak_multiplier: Number(b.resources.peak_multiplier), peak_window: rules.peak_window },
      new Date(b.start_at),
      new Date(b.end_at),
      new Date(b.returned_at),
    ),
  );
  return { charge, hold: b.credit_hold };
}

// The Owner's decision on the AI condition flags (PRD 14): "confirmed" when raised as damage,
// "dismissed" on Return OK. The suggestion itself is kept unchanged next to the decision.
export async function markAiFlags(bookingId: string, decision: "confirmed" | "dismissed") {
  const db = createServiceClient();
  const { data } = await db.from("condition_reports").select("ai_analysis").eq("booking_id", bookingId).eq("phase", "return").maybeSingle();
  const ai = data?.ai_analysis as Record<string, unknown> | null | undefined;
  if (!ai || "status" in ai) return;
  await db.from("condition_reports").update({ ai_analysis: { ...ai, owner_decision: decision } as Json }).eq("booking_id", bookingId).eq("phase", "return");
}
