"use client";
import { useActionState, useId, useState, useTransition, type FormEvent } from "react";
import { Siren } from "lucide-react";
import { Result } from "@/components/booking-forms";
import { Button } from "@/components/ui/button";
import { EMERGENCY_NOTICE } from "@/components/format";
import { field } from "@/components/ui/kit";
import { OVERRIDE_CATEGORIES } from "@/lib/contracts/ai";
import type { ActionResult } from "@/lib/contracts/api";
import {
  appealPenalty, changeResourceStatus, decideBadge, decideDamage, decidePenalty, overrideAllocation, raiseDamage, reportIncident,
  respondDamage, submitBadge, updateIncident,
} from "@/lib/server/trust-actions";
import { createClient } from "@/lib/supabase/client";
import { uploadAll } from "./upload";

const area = `${field} h-auto min-h-20 py-2`;
const label = "text-sm font-semibold";
const hint = "text-xs text-ink-soft";
type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

// A form whose files go to storage from the browser first; the action receives their paths as JSON.
function useUploadForm(action: Action, upload: (files: File[]) => Promise<string[]>, filesField: string, pathsField: string) {
  const [state, run, submitting] = useActionState(action, null);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    const form = new FormData(e.currentTarget);
    const files = form.getAll(filesField).filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > 6) return setError("Attach up to 6 photos.");
    form.delete(filesField);
    start(async () => {
      try {
        form.set(pathsField, JSON.stringify(files.length ? await upload(files) : []));
        run(form);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }
  return { state, onSubmit, pending: busy || submitting, uploading: busy, error };
}

const UploadError = ({ error }: { error?: string }) =>
  error ? <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{error}</p> : null;

// ---------------------------------------------------------------------------- damage (PRD 11)
export interface AiFlag {
  key: string; // "shotIndex:differenceIndex"
  text: string;
  confidence: number;
}

// Raise damage at return: description, severity, and which AI flags the Owner confirms.
export function RaiseDamageForm({ bookingId, as, flags }: { bookingId: string; as: "owner" | "manager"; flags: AiFlag[] }) {
  const [state, action, pending] = useActionState(raiseDamage, null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-danger-fg hover:underline">Raise damage for a Manager to decide</summary>
      <form action={action} className="mt-3 grid gap-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="as" value={as} />
        <input type="hidden" name="flags" value={JSON.stringify([...checked])} />
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-d`} className={label}>What is damaged?</label>
          <textarea id={`${id}-d`} name="description" required minLength={10} maxLength={1000} className={area} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-s`} className={label}>Severity</label>
          <select id={`${id}-s`} name="severity" defaultValue="minor" className={field}>
            <option value="minor">Minor: still usable</option>
            <option value="major">Major: needs repair</option>
            <option value="unusable">Unusable</option>
          </select>
        </div>
        {flags.length > 0 && (
          <fieldset className="grid gap-1.5">
            <legend className={label}>AI flags you confirm</legend>
            {flags.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked.has(f.key)}
                  onChange={(e) => setChecked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(f.key);
                    else next.delete(f.key);
                    return next;
                  })}
                />
                <span>{f.text} <span className="text-ink-soft">· confidence {Math.round(f.confidence * 100)}%</span></span>
              </label>
            ))}
            <p className={hint}>Unticked flags are recorded as dismissed. AI never decides damage.</p>
          </fieldset>
        )}
        <Button type="submit" variant="destructive" disabled={pending} className="w-fit">Raise damage</Button>
        <Result state={state} />
      </form>
    </details>
  );
}

// The student's side, with photos into condition-photos/{booking}/ (booking parties only).
export function DamageResponseForm({ caseId, bookingId }: { caseId: string; bookingId: string }) {
  const f = useUploadForm(respondDamage, (files) => uploadAll("condition-photos", bookingId, "response", files), "files", "photos");
  const id = useId();
  if (f.state?.ok) return <Result state={f.state} />;
  return (
    <form onSubmit={f.onSubmit} className="grid gap-3" noValidate>
      <input type="hidden" name="caseId" value={caseId} />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-t`} className={label}>Your side</label>
        <textarea id={`${id}-t`} name="text" required minLength={10} maxLength={2000} className={area} placeholder="What happened, and anything the Owner may not know." />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-p`} className={label}>Photos <span className="font-normal text-ink-soft">(optional, up to 6)</span></label>
        <input id={`${id}-p`} name="files" type="file" multiple accept="image/jpeg,image/png,image/webp" className="text-sm" />
      </div>
      <UploadError error={f.error} />
      <Button type="submit" disabled={f.pending} className="w-fit">{f.uploading ? "Uploading…" : "Send my response"}</Button>
      <Result state={f.state} />
    </form>
  );
}

const OUTCOMES = [
  ["dismissed", "Dismiss: no damage by the student"],
  ["warning", "Warning"],
  ["credit_deduction", "Credit deduction"],
  ["restriction", "Temporary restriction in this organisation"],
  ["insufficient_evidence", "Close: insufficient evidence"],
  ["more_evidence", "Request more evidence"],
] as const;

export function DamageDecisionForm({ caseId, as, replacementValue }: { caseId: string; as: "manager" | "admin"; replacementValue: number | null }) {
  const [state, action, pending] = useActionState(decideDamage, null);
  const [outcome, setOutcome] = useState<string>("dismissed");
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="as" value={as} />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-o`} className={label}>Outcome</label>
        <select id={`${id}-o`} name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className={field}>
          {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {outcome === "credit_deduction" && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-c`} className={label}>Credits to deduct</label>
          <input id={`${id}-c`} name="credits" type="number" min={1} max={1000} required className={field} />
          {replacementValue !== null && <p className={hint}>Replacement value on the listing: {replacementValue}.</p>}
        </div>
      )}
      {outcome === "restriction" && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-r`} className={label}>Restricted for (days)</label>
          <input id={`${id}-r`} name="days" type="number" min={1} max={180} defaultValue={14} required className={field} />
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-why`} className={label}>{outcome === "more_evidence" ? "What do you need from the student?" : "Reason (the student sees it)"}</label>
        <textarea id={`${id}-why`} name="reason" required minLength={3} maxLength={1000} className={area} />
      </div>
      {outcome !== "more_evidence" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="maintenance" /> Also set the resource under maintenance (cancels its upcoming bookings)
        </label>
      )}
      <Button type="submit" disabled={pending} className="w-fit">{outcome === "more_evidence" ? "Request evidence" : "Decide"}</Button>
      <Result state={state} />
    </form>
  );
}

// ---------------------------------------------------------------------------- penalties (PRD 11)
export function PenaltyDecisionForm({ penaltyId, amount, appeal }: { penaltyId: string; amount: number; appeal: boolean }) {
  const [state, action, pending] = useActionState(decidePenalty, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="penaltyId" value={penaltyId} />
      <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason (required, the student sees it)</label>
      <input id={`${id}-r`} name="reason" required minLength={3} maxLength={500} className={field} />
      <label htmlFor={`${id}-a`} className="text-xs font-semibold">Reduced amount <span className="font-normal text-ink-soft">(only for Reduce)</span></label>
      <input id={`${id}-a`} name="amount" type="number" min={1} max={Math.max(1, amount - 1)} className={field} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="confirm" size="sm" disabled={pending}>{appeal ? "Uphold" : `Confirm ${amount}`}</Button>
        <Button type="submit" name="decision" value="reduce" size="sm" variant="outline" disabled={pending}>Reduce</Button>
        <Button type="submit" name="decision" value="waive" size="sm" variant="outline" disabled={pending}>{appeal ? "Reverse and refund" : "Waive"}</Button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function AppealForm({ penaltyId, appeal }: { penaltyId: string; appeal: boolean }) {
  const [state, action, pending] = useActionState(appealPenalty, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-moss hover:underline">{appeal ? "Appeal to a Manager" : "Explain before the Manager decides"}</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="penaltyId" value={penaltyId} />
        <label htmlFor={`${id}-t`} className="text-xs font-semibold">What happened?</label>
        <textarea id={`${id}-t`} name="text" required minLength={10} maxLength={1000} className={area} />
        <Button type="submit" size="sm" disabled={pending} className="w-fit">Send</Button>
        <Result state={state} />
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------- override (PRD 8)
export function OverrideForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(overrideAllocation, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-moss hover:underline">Give this request priority (override)</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <p className={hint}>The weakest recommendation still waiting for approval moves to the top of the waitlist and this student is offered the place. The other student sees only the category.</p>
        <label htmlFor={`${id}-c`} className="text-xs font-semibold">Reason category</label>
        <select id={`${id}-c`} name="category" className={field}>{OVERRIDE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason (kept in the audit log)</label>
        <textarea id={`${id}-r`} name="reason" required minLength={10} maxLength={500} className={area} />
        <Button type="submit" size="sm" disabled={pending} className="w-fit">Override recommendation</Button>
        <Result state={state} />
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------- incidents (PRD 11)
export function IncidentForm({ resourceId, bookingId, location, date, time }: { resourceId: string; bookingId?: string; location: string; date: string; time: string }) {
  const f = useUploadForm(reportIncident, async (files) => {
    const { data } = await createClient().auth.getUser(); // evidence goes in the reporter's own folder
    return uploadAll("incident-evidence", data.user?.id ?? "", "evidence", files);
  }, "files", "evidence");
  const id = useId();
  if (f.state?.ok) return <Result state={f.state} />;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-danger-fg hover:underline">Report a safety incident</summary>
      <form onSubmit={f.onSubmit} className="mt-3 grid gap-3" noValidate>
        <p className="flex items-start gap-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          <Siren aria-hidden className="mt-0.5 size-4 shrink-0" /> {EMERGENCY_NOTICE}
        </p>
        <input type="hidden" name="resourceId" value={resourceId} />
        {bookingId && <input type="hidden" name="bookingId" value={bookingId} />}
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <label htmlFor={`${id}-d`} className="text-xs font-semibold">Date</label>
            <input id={`${id}-d`} type="date" name="date" required defaultValue={date} className={field} />
          </div>
          <div className="grid gap-1">
            <label htmlFor={`${id}-t`} className="text-xs font-semibold">Time</label>
            <input id={`${id}-t`} type="time" name="time" required defaultValue={time} className={field} />
          </div>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-l`} className="text-xs font-semibold">Location</label>
          <input id={`${id}-l`} name="location" defaultValue={location} className={field} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-s`} className="text-xs font-semibold">Severity</label>
          <select id={`${id}-s`} name="severity" defaultValue="medium" className={field}>
            <option value="low">Low: no injury, no risk now</option>
            <option value="medium">Medium: someone could get hurt</option>
            <option value="high">High: injury or immediate danger</option>
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-w`} className="text-xs font-semibold">What happened?</label>
          <textarea id={`${id}-w`} name="description" required minLength={10} maxLength={2000} className={area} />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-e`} className="text-xs font-semibold">Evidence photos <span className="font-normal text-ink-soft">(optional)</span></label>
          <input id={`${id}-e`} name="files" type="file" multiple accept="image/jpeg,image/png,image/webp" className="text-sm" />
        </div>
        <UploadError error={f.error} />
        <Button type="submit" variant="destructive" size="sm" disabled={f.pending} className="w-fit">{f.uploading ? "Uploading…" : "Report incident"}</Button>
        <Result state={f.state} />
      </form>
    </details>
  );
}

export function IncidentUpdateForm({ incidentId, as, hasBooking }: { incidentId: string; as: "manager" | "admin"; hasBooking: boolean }) {
  const [state, action, pending] = useActionState(updateIncident, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="incidentId" value={incidentId} />
      <input type="hidden" name="as" value={as} />
      <label htmlFor={`${id}-n`} className="text-xs font-semibold">Actions taken, or the resolution when closing</label>
      <textarea id={`${id}-n`} name="note" required minLength={3} maxLength={2000} className={area} />
      {hasBooking && (
        <>
          <label htmlFor={`${id}-r`} className="text-xs font-semibold">Restrict the booking&apos;s student in this organisation (days, optional)</label>
          <input id={`${id}-r`} name="restrictDays" type="number" min={1} max={180} className={field} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="investigating" size="sm" variant="outline" disabled={pending}>Record actions</Button>
        <Button type="submit" name="status" value="closed" size="sm" disabled={pending}>Close incident</Button>
      </div>
      <p className={hint}>Closing never restores the resource; confirm it is safe separately.</p>
      <Result state={state} />
    </form>
  );
}

// Mark unsafe / under maintenance, or confirm it is safe to use again (a separate, reasoned step).
export function ResourceStatusForm({ resourceId, as, to, label: text }: { resourceId: string; as: "owner" | "manager" | "admin"; to: "active" | "unsafe" | "under_maintenance" | "paused"; label: string }) {
  const [state, action, pending] = useActionState(changeResourceStatus, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <details>
      <summary className={`cursor-pointer text-sm font-semibold hover:underline ${to === "unsafe" ? "text-danger-fg" : "text-moss"}`}>{text}</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="resourceId" value={resourceId} />
        <input type="hidden" name="as" value={as} />
        <input type="hidden" name="status" value={to} />
        {to !== "active" && <p className={hint}>New bookings stop, and upcoming bookings are cancelled with your reason and their credits released.</p>}
        <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason</label>
        <input id={`${id}-r`} name="reason" required minLength={3} maxLength={500} className={field} />
        <Button type="submit" size="sm" variant={to === "unsafe" ? "destructive" : "default"} disabled={pending} className="w-fit">{text}</Button>
        <Result state={state} />
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------- badges (PRD 6, 14)
export function BadgeSubmitForm({ userId, types }: { userId: string; types: { id: string; name: string; org: string }[] }) {
  const f = useUploadForm(submitBadge, (files) => uploadAll("certificates", userId, "certificate", files.slice(0, 1)), "files", "paths");
  const id = useId();
  if (f.state?.ok) return <Result state={f.state} />;
  return (
    <form onSubmit={f.onSubmit} className="grid gap-3" noValidate>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-b`} className={label}>Badge</label>
        <select id={`${id}-b`} name="badgeTypeId" className={field}>{types.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.org}</option>)}</select>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-f`} className={label}>Certificate photo or PDF</label>
        <input id={`${id}-f`} name="files" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
        <p className={hint}>The issuing organisation verifies it. An AI reading of a photo is shown to them as a suggestion.</p>
      </div>
      <UploadError error={f.error} />
      <Button type="submit" disabled={f.pending} className="w-fit">{f.uploading ? "Uploading…" : "Send for verification"}</Button>
      <Result state={f.state} />
    </form>
  );
}

export function BadgeDecisionForm({ badgeId, as, issued }: { badgeId: string; as: "owner" | "manager"; issued: string | null }) {
  const [state, action, pending] = useActionState(decideBadge, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="badgeId" value={badgeId} />
      <input type="hidden" name="as" value={as} />
      <label htmlFor={`${id}-i`} className="text-xs font-semibold">Issue date on the certificate</label>
      <input id={`${id}-i`} name="issued" type="date" defaultValue={issued ?? undefined} className={field} />
      <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason <span className="font-normal text-ink-soft">(required to reject)</span></label>
      <input id={`${id}-r`} name="reason" maxLength={500} className={field} />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>Verify badge</Button>
        <Button type="submit" name="decision" value="reject" size="sm" variant="destructive" disabled={pending}>Reject</Button>
      </div>
      <Result state={state} />
    </form>
  );
}
