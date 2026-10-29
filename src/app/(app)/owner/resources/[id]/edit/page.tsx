import { notFound } from "next/navigation";
import { ResourceForm, type ResourceDefaults } from "@/components/resource-form";
import { ResourceStatusForm } from "@/components/trust-forms";
import { Flag, PageHeading, Panel, PanelHeading } from "@/components/ui/kit";
import {
  bookingRulesSchema, checklistSchema, eligibilitySchema, safetyRulesSchema, TEMPLATE_FEATURES,
} from "@/lib/contracts/resource";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Edit a listing (PRD 6). Changes apply to new requests only.
export default async function EditResourcePage({ params }: PageProps<"/owner/resources/[id]/edit">) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
  const supabase = await createClient();
  const [{ data: r }, { data: windows }, { data: badgeTypes }] = await Promise.all([
    supabase.from("resources").select("*").eq("id", id).maybeSingle(),
    supabase.from("availability_windows").select("weekday, start_time, end_time").eq("resource_id", id),
    supabase.from("badge_types").select("id, name").order("name"),
  ]);
  const orgs = viewer.memberships.filter((m) => m.role === "owner").map((m) => ({ id: m.orgId, name: m.orgName }));
  if (!r || !orgs.some((o) => o.id === r.org_id)) notFound();

  const el = eligibilitySchema.safeParse(r.eligibility).data ?? eligibilitySchema.parse({});
  const rules = bookingRulesSchema.safeParse(r.booking_rules).data ?? bookingRulesSchema.parse({});
  const safety = safetyRulesSchema.safeParse(r.safety_rules).data ?? safetyRulesSchema.parse({});
  const checklist = checklistSchema.safeParse(r.checklist).data ?? { items: [], shots: [] };
  const fields = (r.category_fields ?? {}) as Record<string, unknown>;
  const feature = fields[TEMPLATE_FEATURES[r.form_template].key];
  const defaults: ResourceDefaults = {
    id: r.id,
    orgId: r.org_id,
    category: r.category,
    template: r.form_template,
    name: r.name,
    description: r.description,
    location: r.location,
    quantity: r.quantity,
    approvalMode: r.approval_mode,
    allocationMode: r.allocation_mode,
    cutoffHours: r.batch_cutoff_hours,
    baseRate: r.base_rate,
    rateUnit: r.rate_unit,
    peakMultiplier: Number(r.peak_multiplier),
    peakStart: rules.peak_window?.start ?? "",
    peakEnd: rules.peak_window?.end ?? "",
    replacementValue: r.replacement_value,
    usage: r.estimated_current_usage,
    weekdays: (windows ?? []).map((w) => w.weekday),
    openFrom: windows?.[0]?.start_time.slice(0, 5),
    openTo: windows?.[0]?.end_time.slice(0, 5),
    maxDurationHours: rules.max_duration_minutes ? Math.round(rules.max_duration_minutes / 60) : null,
    maxActive: rules.max_active_bookings,
    maxDurationMode: rules.modes.max_duration,
    maxActiveMode: rules.modes.max_active,
    creditsMode: rules.modes.credits,
    badgeTypeIds: el.required_badge_type_ids,
    departments: el.departments,
    years: el.years,
    orgMembersOnly: el.org_members_only,
    badgesMode: el.modes.badges,
    restrictedMode: el.modes.restricted,
    managerApproval: safety.manager_approval,
    supervisionRequired: safety.supervision_required,
    ppe: safety.ppe.join(", "),
    safetyNotes: safety.safety_notes,
    capacity: Number(fields.seating_capacity ?? fields.stations ?? fields.capacity) || null,
    features: Array.isArray(feature) ? feature.join("\n") : "",
    checklistItems: checklist.items.join("\n"),
    shots: checklist.shots.join("\n"),
  };
  return (
    <>
      <PageHeading eyebrow="Listings · edit" title={r.name} description="Changes apply to new requests only; existing bookings keep the rules they were approved under." />
      <Panel aria-labelledby="status-heading" className="mb-6">
        <PanelHeading
          id="status-heading"
          title="Availability"
          description="Pause a listing or take it in for maintenance. Upcoming bookings are cancelled with your reason and credits released."
          aside={<Flag tone={r.status === "active" ? "good" : r.status === "unsafe" ? "danger" : "warn"}>{r.status.replaceAll("_", " ")}</Flag>}
        />
        <div className="flex flex-wrap gap-x-8 gap-y-3 p-5">
          {r.status === "unsafe" ? (
            <p className="text-sm text-ink-soft">Marked unsafe after an incident. Only a Manager can confirm it is safe to use again.</p>
          ) : (
            <>
              {r.status !== "active" && <ResourceStatusForm resourceId={r.id} as="owner" to="active" label="Reopen for bookings" />}
              {r.status !== "paused" && <ResourceStatusForm resourceId={r.id} as="owner" to="paused" label="Pause bookings" />}
              {r.status !== "under_maintenance" && <ResourceStatusForm resourceId={r.id} as="owner" to="under_maintenance" label="Mark under maintenance" />}
            </>
          )}
        </div>
      </Panel>
      <ResourceForm orgs={orgs} badgeTypes={badgeTypes ?? []} defaults={defaults} />
    </>
  );
}
