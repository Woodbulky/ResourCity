"use client";
import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import { Result } from "@/components/booking-forms";
import { CATEGORIES } from "@/components/category";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/kit";
import { DEPARTMENTS } from "@/lib/contracts/api";
import { CATEGORY_TEMPLATE, TEMPLATE_FEATURES, type FormTemplate, type ResourceCategory, type ResourceInput } from "@/lib/contracts/resource";
import { saveResource } from "@/lib/server/resource-actions";

export type ResourceDefaults = Partial<Omit<ResourceInput, "ppe" | "features" | "checklistItems" | "shots">> & {
  ppe?: string; features?: string; checklistItems?: string; shots?: string;
};

const TEMPLATE_LABELS: Record<FormTemplate, string> = { space: "Space", lab: "Lab / Workshop", portable: "Portable equipment", machine: "Machine" };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const area = `${field} h-auto min-h-20 py-2`;
const label = "text-sm font-semibold";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-[var(--radius-card)] border border-line bg-paper p-5">
      <legend className="px-1 text-[0.9375rem] font-semibold">{title}</legend>
      {hint && <p className="-mt-2 text-sm text-ink-soft">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ id, text, children, hint }: { id: string; text: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function Check({ name, value, text, defaultChecked, onChange }: { name: string; value?: string; text: string; defaultChecked?: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} onChange={onChange && ((e) => onChange(e.target.checked))} className="size-4 accent-[var(--color-moss,#2d6a4f)]" />
      {text}
    </label>
  );
}

// "Block" stops the request; "Review" lets the student ask the Manager for an exception (PRD 6).
function Mode({ name, defaultValue }: { name: string; defaultValue?: "block" | "review" }) {
  return (
    <select name={name} aria-label="When this rule is broken" defaultValue={defaultValue ?? "block"} className={`${field} w-auto`}>
      <option value="block">Breaking it blocks</option>
      <option value="review">Breaking it goes to review</option>
    </select>
  );
}

// Owner listing form (PRD 6): four templates, rules with block / review, checklist and guided shots.
export function ResourceForm({
  orgs,
  badgeTypes,
  defaults = {},
}: {
  orgs: { id: string; name: string }[];
  badgeTypes: { id: string; name: string }[];
  defaults?: ResourceDefaults;
}) {
  const [state, action, pending] = useActionState(saveResource, null);
  const [category, setCategory] = useState<ResourceCategory>(defaults.category ?? "media");
  const [template, setTemplate] = useState<FormTemplate>(defaults.template ?? "portable");
  const [allocation, setAllocation] = useState(defaults.allocationMode ?? "instant");
  const [free, setFree] = useState(defaults.baseRate === 0);
  const feature = TEMPLATE_FEATURES[template];
  const editing = !!defaults.id;

  return (
    <form action={action} className="grid max-w-4xl gap-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <input type="hidden" name="template" value={template} />

      <Section title="What you are sharing">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="orgId" text="Organisation">
            <select id="orgId" name="orgId" defaultValue={defaults.orgId ?? orgs[0]?.id} disabled={editing} className={field}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {editing && <input type="hidden" name="orgId" value={defaults.orgId} />}
          </Field>
          <Field id="category" text="Category">
            <select
              id="category"
              name="category"
              value={category}
              onChange={(e) => {
                const c = e.target.value as ResourceCategory;
                setCategory(c);
                setTemplate(CATEGORY_TEMPLATE[c] ?? template);
              }}
              className={field}
            >
              {(Object.keys(CATEGORIES) as ResourceCategory[]).map((c) => <option key={c} value={c}>{CATEGORIES[c].label}</option>)}
            </select>
          </Field>
          {CATEGORY_TEMPLATE[category] === null && (
            <Field id="templatePick" text="Closest form template">
              <select id="templatePick" value={template} onChange={(e) => setTemplate(e.target.value as FormTemplate)} className={field}>
                {(Object.keys(TEMPLATE_LABELS) as FormTemplate[]).map((t) => <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>)}
              </select>
            </Field>
          )}
          <Field id="name" text="Name"><input id="name" name="name" required defaultValue={defaults.name} className={field} /></Field>
          <Field id="location" text="Location"><input id="location" name="location" required defaultValue={defaults.location} className={field} /></Field>
          <Field id="quantity" text="Quantity" hint={editing ? "Units are fixed once listed." : "More than 1 creates separate units."}>
            <input id="quantity" name="quantity" type="number" min={1} max={50} defaultValue={defaults.quantity ?? 1} disabled={editing} className={field} />
          </Field>
          <Field id="usage" text="How often is it used today?" hint="Feeds the underused-resources report.">
            <select id="usage" name="usage" defaultValue={defaults.usage ?? "rarely"} className={field}>
              <option value="rarely">Rarely</option><option value="weekly">Weekly</option><option value="daily">Daily</option>
            </select>
          </Field>
        </div>
        <Field id="description" text="Description"><textarea id="description" name="description" defaultValue={defaults.description} className={area} /></Field>
      </Section>

      <Section title={`${TEMPLATE_LABELS[template]} details`}>
        <div className="grid gap-4 sm:grid-cols-2">
          {feature.capacity && (
            <Field id="capacity" text={feature.capacity}>
              <input id="capacity" name="capacity" type="number" min={1} defaultValue={defaults.capacity ?? undefined} className={field} />
            </Field>
          )}
          <Field id="features" text={feature.label} hint="Comma or line separated.">
            <textarea id="features" name="features" defaultValue={defaults.features} className={area} />
          </Field>
          {template !== "space" && (
            <Field id="replacementValue" text="Replacement value (₹)">
              <input id="replacementValue" name="replacementValue" type="number" min={1} defaultValue={defaults.replacementValue ?? undefined} className={field} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Bookable hours" hint="Campus time (IST). Pickup and return happen inside these hours. Leave every day unticked to allow any time.">
        <div className="flex flex-wrap gap-3">
          {WEEKDAYS.map((d, i) => (
            <Check key={d} name="weekdays" value={String(i)} text={d} defaultChecked={defaults.weekdays ? defaults.weekdays.includes(i) : i >= 1 && i <= 6} />
          ))}
        </div>
        <div className="grid max-w-md grid-cols-2 gap-4">
          <Field id="openFrom" text="Opens"><input id="openFrom" name="openFrom" type="time" defaultValue={defaults.openFrom ?? "08:00"} className={field} /></Field>
          <Field id="openTo" text="Closes"><input id="openTo" name="openTo" type="time" defaultValue={defaults.openTo ?? "20:00"} className={field} /></Field>
        </div>
      </Section>

      <Section title="Approval and allocation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="approvalMode" text="Approval">
            <select id="approvalMode" name="approvalMode" defaultValue={defaults.approvalMode ?? "owner"} className={field}>
              <option value="auto">Automatic if eligible and free</option>
              <option value="owner">Owner approves</option>
              <option value="manager">Manager approves</option>
            </select>
          </Field>
          <Field id="allocationMode" text="Allocation">
            <select id="allocationMode" name="allocationMode" value={allocation} onChange={(e) => setAllocation(e.target.value as "instant" | "batch")} className={field}>
              <option value="instant">Instant: first valid request</option>
              <option value="batch">Batch: scored at a cutoff (high demand)</option>
            </select>
          </Field>
          {allocation === "batch" && (
            <Field id="cutoffHours" text="Decision cutoff (hours before the slot)">
              <input id="cutoffHours" name="cutoffHours" type="number" min={0} max={336} defaultValue={defaults.cutoffHours ?? 24} className={field} />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Pricing" hint="Credits only. Cost = base rate × duration × peak multiplier inside the peak window.">
        <Check name="free" text="Free to book" defaultChecked={free} onChange={setFree} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="baseRate" text="Base rate (credits)">
            <input id="baseRate" name="baseRate" type="number" min={0} max={1000} disabled={free} defaultValue={defaults.baseRate ?? 10} className={field} />
          </Field>
          <Field id="rateUnit" text="Per">
            <select id="rateUnit" name="rateUnit" defaultValue={defaults.rateUnit ?? "hour"} className={field}>
              <option value="hour">Hour</option><option value="day">Day</option>
            </select>
          </Field>
          <Field id="peakMultiplier" text="Peak multiplier">
            <input id="peakMultiplier" name="peakMultiplier" type="number" min={1} max={5} step={0.25} defaultValue={defaults.peakMultiplier ?? 1.5} className={field} />
          </Field>
          <Field id="peakStart" text="Peak from (optional)"><input id="peakStart" name="peakStart" type="time" defaultValue={defaults.peakStart} className={field} /></Field>
          <Field id="peakEnd" text="Peak until"><input id="peakEnd" name="peakEnd" type="time" defaultValue={defaults.peakEnd} className={field} /></Field>
        </div>
      </Section>

      <Section title="Booking rules" hint="Each rule either blocks the request or sends it to the Manager as an exception.">
        <div className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field id="maxDurationHours" text="Longest booking (hours)">
              <input id="maxDurationHours" name="maxDurationHours" type="number" min={1} defaultValue={defaults.maxDurationHours ?? undefined} className={`${field} w-36`} />
            </Field>
            <Mode name="maxDurationMode" defaultValue={defaults.maxDurationMode ?? "review"} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field id="maxActive" text="Active bookings per student">
              <input id="maxActive" name="maxActive" type="number" min={1} defaultValue={defaults.maxActive ?? undefined} className={`${field} w-36`} />
            </Field>
            <Mode name="maxActiveMode" defaultValue={defaults.maxActiveMode} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">Not enough credits</span>
            <Mode name="creditsMode" defaultValue={defaults.creditsMode} />
          </div>
        </div>
      </Section>

      <Section title="Safety and access">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check name="managerApproval" text="Manager approval required" defaultChecked={defaults.managerApproval ?? template === "machine"} />
          <Check name="supervisionRequired" text="Supervision required at handover" defaultChecked={defaults.supervisionRequired ?? template === "machine"} />
          <Check name="orgMembersOnly" text="Members of this organisation only" defaultChecked={defaults.orgMembersOnly} />
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className={label}>Required training badges</span><Mode name="badgesMode" defaultValue={defaults.badgesMode} /></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {badgeTypes.map((b) => <Check key={b.id} name="badgeTypeIds" value={b.id} text={b.name} defaultChecked={defaults.badgeTypeIds?.includes(b.id)} />)}
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className={label}>Open to departments and years <span className="font-normal text-ink-soft">(none ticked = everyone)</span></span><Mode name="restrictedMode" defaultValue={defaults.restrictedMode} /></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {DEPARTMENTS.map((d) => <Check key={d} name="departments" value={d} text={d} defaultChecked={defaults.departments?.includes(d)} />)}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {[1, 2, 3, 4].map((y) => <Check key={y} name="years" value={String(y)} text={`Year ${y}`} defaultChecked={defaults.years?.includes(y)} />)}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ppe" text="PPE to wear" hint="Comma separated."><input id="ppe" name="ppe" defaultValue={defaults.ppe} className={field} /></Field>
          <Field id="safetyNotes" text="Safety notes"><textarea id="safetyNotes" name="safetyNotes" defaultValue={defaults.safetyNotes} className={area} /></Field>
        </div>
      </Section>

      <Section title="Condition checklist" hint="Used at both pickup and return. One per line. At least 3 photos are always taken; extra shots are added if you list fewer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="checklistItems" text="Items to check"><textarea id="checklistItems" name="checklistItems" required defaultValue={defaults.checklistItems} placeholder={"Camera body\nLens\nBattery\nCharger"} className={`${area} min-h-32`} /></Field>
          <Field id="shots" text="Guided photo shots"><textarea id="shots" name="shots" defaultValue={defaults.shots} placeholder={"Front\nBack\nAll accessories laid out"} className={`${area} min-h-32`} /></Field>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}><Save aria-hidden /> {pending ? "Saving…" : editing ? "Save changes" : "Publish listing"}</Button>
        <p className="text-sm text-ink-soft">Changes apply to new requests only.</p>
      </div>
      <Result state={state} />
    </form>
  );
}
