import "server-only";
import {
  certificateExtractionSchema, conditionComparisonSchema, searchFiltersSchema, type SearchFilters, type StoredComparison,
  type StoredExtraction,
} from "../contracts/ai";
import type { Json } from "../contracts/database";
import { Constants } from "../contracts/database";
import { formatDateTime, istDate } from "../domain/time";
import { appNow } from "../server/clock";
import { createServiceClient } from "../server/supabase";
import { aiJson, dataUrl, type AiContent, type AiResult } from "./client";

// The four PRD 14 features minus the case summary (cut first, PRD 18). All advisory: the outputs are
// stored or shown labelled "AI suggestion" and never change a state.

// ---------------------------------------------------------------------------- search parser (must)
// The category codes with what each holds, so "camera" lands in media rather than electronics.
const CATEGORY_HINTS: Record<(typeof Constants.public.Enums.resource_category)[number], string> = {
  classroom: "classrooms", seminar_hall: "seminar halls, auditoriums", meeting_room: "meeting rooms, discussion rooms",
  sports_ground: "sports grounds and courts (badminton, cricket)", lab: "laboratories, computer labs, workshops",
  electronics: "computers and electronic equipment (laptops, oscilloscopes, GPU workstations)",
  media: "photography and media equipment (cameras, DSLR, video, microphones)", sports_equipment: "sports kits and equipment",
  machine: "machines (CNC, laser cutter, 3D printer)", other: "anything else",
};

const SEARCH_PROMPT = `You turn a student's search for campus resources into filters. You only parse; you never decide availability.
Fields: category (one code from: ${Object.entries(CATEGORY_HINTS).map(([k, v]) => `${k} = ${v}`).join("; ")}; or null if unsure), keywords (short nouns to match names, e.g. "camera"),
date (yyyy-MM-dd), start_time and end_time (HH:mm, 24 h, campus time), duration_minutes, quantity (units wanted), capacity (people),
needs_clarification (true when a date, time or duration is vague, e.g. "soon", "next week", "evening" with no day), clarification_question.
Resolve "today", "tomorrow" and weekday names against the current date given. "This evening" means 17:00-21:00 today, "morning" 09:00-12:00,
"afternoon" 13:00-17:00. Never invent a date or time the student did not ask for: leave it null.`;

export async function parseSearch(query: string): Promise<AiResult<SearchFilters>> {
  const now = await appNow();
  return aiJson(searchFiltersSchema, SEARCH_PROMPT,
    `Current date and time on campus (Asia/Kolkata): ${istDate(now)}, ${formatDateTime(now)}.\nSearch: ${JSON.stringify(query.slice(0, 300))}`);
}

// ---------------------------------------------------------------------------- condition comparison (must)
const CONDITION_PROMPT = `You compare photos of the same campus equipment taken at pickup and at return, shot by shot.
For each shot report visible differences (scratches, dents, cracks, missing parts, stains) with where they are and a confidence 0-1.
Mark a shot comparable=false and add no differences when lighting, angle or framing differ too much to tell.
List checklist items you cannot see in the return photos as missing_items only if they are clearly absent.
overall: "no_change", "possible_damage", or "inconclusive" when you are unsure. Describe what you see; never assign blame or decide damage.`;

type Photo = { shot: string; path: string };

// Runs after the return is recorded (PRD 10): pairs pickup and return photos by shot name and stores
// the result, or why there is none, on the return condition record.
export async function compareCondition(bookingId: string): Promise<void> {
  const db = createServiceClient();
  const [{ data: reports }, { data: booking }, now] = await Promise.all([
    db.from("condition_reports").select("phase, photos, checklist_results").eq("booking_id", bookingId),
    db.from("bookings").select("user_id, policy_version_id, resources(name, org_id)").eq("id", bookingId).single(),
    appNow(),
  ]);
  const out = reports?.find((r) => r.phase === "checkout");
  const back = reports?.find((r) => r.phase === "return");
  if (!back || !booking) return;
  const store = (analysis: StoredComparison) =>
    db.from("condition_reports").update({ ai_analysis: analysis as unknown as Json }).eq("booking_id", bookingId).eq("phase", "return");

  const before = (out?.photos ?? []) as Photo[];
  const after = (back.photos ?? []) as Photo[];
  const pairs = after.flatMap((a) => {
    const b = before.find((x) => x.shot === a.shot);
    return b ? [{ shot: a.shot, before: b.path, after: a.path }] : [];
  });
  if (!pairs.length) {
    await store({ status: "unavailable", error: "No pickup photos to compare with.", at: now.toISOString() });
    return;
  }

  const content: Exclude<AiContent, string> = [];
  try {
    for (const p of pairs) {
      for (const [label, path] of [["pickup", p.before], ["return", p.after]] as const) {
        const { data, error } = await db.storage.from("condition-photos").download(path);
        if (error || !data) throw new Error(`Photo missing: ${p.shot}`);
        content.push({ type: "text", text: `Shot "${p.shot}", ${label}:` });
        content.push({ type: "image_url", image_url: { url: dataUrl(await data.arrayBuffer(), data.type) } });
      }
    }
  } catch (e) {
    await store({ status: "unavailable", error: e instanceof Error ? e.message : "Photos unavailable", at: now.toISOString() });
    return;
  }
  const items = ((out?.checklist_results ?? []) as { item: string; ok: boolean; note?: string }[])
    .map((i) => `${i.item}${i.ok ? "" : ` (already noted at pickup: ${i.note ?? "issue"})`}`);
  content.unshift({ type: "text", text: `Checklist: ${items.join("; ") || "none"}. Shots in order: ${pairs.map((p) => p.shot).join(", ")}.` });

  const res = await aiJson(conditionComparisonSchema, CONDITION_PROMPT, content);
  if (!res.ok) {
    await store({ status: "unavailable", error: res.error, at: now.toISOString() });
    return;
  }
  await store({ ...res.data, model: res.model, at: now.toISOString(), owner_decision: null });
  if (res.data.overall === "possible_damage") {
    const top = res.data.shots.flatMap((s) => s.differences).sort((a, b) => b.confidence - a.confidence)[0];
    await db.rpc("log_event", {
      p_actor_id: null as unknown as string, p_actor_role: "system", p_action: "AI_CONDITION_FLAGGED", p_entity_type: "booking",
      p_entity_id: bookingId, p_org_id: booking.resources?.org_id, p_subject_user_id: booking.user_id,
      p_reason: `AI suggestion: ${top?.description ?? "possible damage"} (confidence ${top?.confidence.toFixed(2) ?? "?"})`,
      p_metadata: { model: res.model }, p_policy_version_id: booking.policy_version_id,
    });
  }
}

// ---------------------------------------------------------------------------- certificate extraction (should)
const CERT_PROMPT = `You read a training certificate image and report what is printed: name_on_certificate, course_title, issuer,
issue_date and expiry_date (yyyy-MM-dd, null if absent), matches_student_name (true only if the printed name is clearly the
student's name), and your confidence 0-1. Report only what you read; never decide whether the certificate is valid.`;

export async function extractCertificate(badgeId: string): Promise<void> {
  const db = createServiceClient();
  const [{ data: badge }, now] = await Promise.all([
    db.from("user_badges").select("certificate_path, badge_types(name), profiles!user_badges_user_id_fkey(full_name)").eq("id", badgeId).single(),
    appNow(),
  ]);
  if (!badge?.certificate_path) return;
  const store = (x: StoredExtraction) => db.from("user_badges").update({ ai_extraction: x as unknown as Json }).eq("id", badgeId);
  const { data: file } = await db.storage.from("certificates").download(badge.certificate_path);
  if (!file || !file.type.startsWith("image/")) {
    await store({ status: "unavailable", error: "Only photos of certificates can be read; check the PDF by eye.", at: now.toISOString() });
    return;
  }
  const res = await aiJson(certificateExtractionSchema, CERT_PROMPT, [
    { type: "text", text: `Expected badge: ${badge.badge_types?.name}. Student name: ${badge.profiles?.full_name}.` },
    { type: "image_url", image_url: { url: dataUrl(await file.arrayBuffer(), file.type) } },
  ]);
  await store(res.ok ? { ...res.data, model: res.model, at: now.toISOString() } : { status: "unavailable", error: res.error, at: now.toISOString() });
}
