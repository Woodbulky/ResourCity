"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "../contracts/api";
import { resourceInputSchema, TEMPLATE_FEATURES } from "../contracts/resource";
import { createClient, createServiceClient } from "./supabase";
import { getViewer } from "./viewer";

// Create or edit a listing (PRD 6). The write runs as the Owner, so RLS decides whether they own
// the organisation; edits apply to new requests only (bookings keep their own copies).
export async function saveResource(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Your session has ended. Sign in again." };
  const get = (k: string) => (form.get(k) ?? "") as string;
  const parsed = resourceInputSchema.safeParse({
    id: get("id") || undefined,
    orgId: get("orgId"),
    category: get("category"),
    template: get("template"),
    name: get("name"),
    description: get("description"),
    location: get("location"),
    quantity: get("quantity") || 1,
    approvalMode: get("approvalMode"),
    allocationMode: get("allocationMode"),
    cutoffHours: get("cutoffHours") || 24,
    baseRate: get("free") === "on" ? 0 : get("baseRate") || 0,
    rateUnit: get("rateUnit"),
    peakMultiplier: get("peakMultiplier") || 1.5,
    peakStart: get("peakStart"),
    peakEnd: get("peakEnd"),
    replacementValue: get("replacementValue"),
    usage: get("usage"),
    weekdays: form.getAll("weekdays"),
    openFrom: get("openFrom"),
    openTo: get("openTo"),
    maxDurationHours: get("maxDurationHours"),
    maxActive: get("maxActive"),
    maxDurationMode: get("maxDurationMode"),
    maxActiveMode: get("maxActiveMode"),
    creditsMode: get("creditsMode"),
    badgeTypeIds: form.getAll("badgeTypeIds"),
    departments: form.getAll("departments"),
    years: form.getAll("years"),
    orgMembersOnly: get("orgMembersOnly") === "on",
    badgesMode: get("badgesMode"),
    restrictedMode: get("restrictedMode"),
    managerApproval: get("managerApproval") === "on",
    supervisionRequired: get("supervisionRequired") === "on",
    ppe: get("ppe"),
    safetyNotes: get("safetyNotes"),
    capacity: get("capacity"),
    features: get("features"),
    checklistItems: get("checklistItems"),
    shots: get("shots"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  if (!viewer.memberships.some((m) => m.orgId === d.orgId && m.role === "owner"))
    return { ok: false, error: "Only an Owner of this organisation can list resources for it." };

  const feature = TEMPLATE_FEATURES[d.template];
  const row = {
    org_id: d.orgId,
    category: d.category,
    form_template: d.template,
    name: d.name,
    description: d.description,
    location: d.location,
    approval_mode: d.managerApproval ? ("manager" as const) : d.approvalMode,
    allocation_mode: d.allocationMode,
    batch_cutoff_hours: d.cutoffHours,
    base_rate: d.baseRate,
    rate_unit: d.rateUnit,
    peak_multiplier: d.peakMultiplier,
    replacement_value: d.replacementValue,
    estimated_current_usage: d.usage,
    eligibility: {
      required_badge_type_ids: d.badgeTypeIds,
      departments: d.departments,
      years: d.years,
      org_members_only: d.orgMembersOnly,
      modes: { badges: d.badgesMode, restricted: d.restrictedMode },
    },
    booking_rules: {
      max_duration_minutes: d.maxDurationHours ? d.maxDurationHours * 60 : null,
      max_active_bookings: d.maxActive,
      cancellation_window_minutes: null,
      peak_window: d.peakStart ? { start: d.peakStart, end: d.peakEnd } : null,
      return_confirmation: false,
      condition_record_required: true,
      modes: { max_duration: d.maxDurationMode, max_active: d.maxActiveMode, credits: d.creditsMode },
    },
    safety_rules: {
      manager_approval: d.managerApproval,
      supervision_required: d.supervisionRequired,
      ppe: d.ppe,
      safety_notes: d.safetyNotes,
    },
    category_fields: {
      ...(feature.capacity && d.capacity ? { [d.template === "lab" ? "stations" : "seating_capacity"]: d.capacity } : {}),
      ...(d.features.length ? { [feature.key]: d.features } : {}),
    },
    checklist: { items: d.checklistItems, shots: d.shots },
  };

  const supabase = await createClient();
  const { data: saved, error } = d.id
    ? await supabase.from("resources").update(row).eq("id", d.id).select("id").maybeSingle()
    : await supabase.from("resources").insert({ ...row, quantity: d.quantity }).select("id").maybeSingle();
  if (error || !saved) return { ok: false, error: error?.message ?? "You cannot edit this resource." };

  // Bookable hours: one opening time on the chosen weekdays (IST). No weekdays = open any time.
  await supabase.from("availability_windows").delete().eq("resource_id", saved.id);
  if (d.weekdays.length) {
    const { error: wErr } = await supabase
      .from("availability_windows")
      .insert(d.weekdays.map((weekday) => ({ resource_id: saved.id, weekday, start_time: d.openFrom, end_time: d.openTo })));
    if (wErr) return { ok: false, error: `Saved, but the opening hours failed: ${wErr.message}` };
  }
  // ponytail: insert then audit is two calls, not one transaction; move into a SQL function if a
  // missing RESOURCE_* event ever matters.
  await createServiceClient().rpc("log_event", {
    p_actor_id: viewer.id,
    p_actor_role: "owner",
    p_action: d.id ? "RESOURCE_UPDATED" : "RESOURCE_CREATED",
    p_entity_type: "resource",
    p_entity_id: saved.id,
    p_org_id: d.orgId,
    p_metadata: { name: d.name, category: d.category, template: d.template },
  });
  revalidatePath("/", "layout");
  redirect("/owner/resources");
}
