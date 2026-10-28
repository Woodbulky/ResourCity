"use client";
import { useActionState, useId } from "react";
import { CircleCheck, DoorOpen, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/kit";
import type { ActionResult } from "@/lib/contracts/api";
import {
  acknowledgeCondition, cancelBooking, completeReturn, decideRequest, doorCheckin, submitRequest,
} from "@/lib/server/booking-actions";

const area = `${field} h-auto min-h-20 py-2`;

export function Result({ state, id }: { state: ActionResult | null; id?: string }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-sage-strong">
      <CircleCheck aria-hidden className="size-4" /> {state.message}
    </p>
  ) : (
    <p id={id} role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{state.error}</p>
  );
}

const PURPOSES = [
  ["academic_deadline", "Academic deadline"],
  ["project_research", "Registered project or research"],
  ["club_activity", "Approved club activity or event"],
  ["personal", "Personal or recreational"],
] as const;

// Request form (PRD 7): purpose, then submit. A rule set to "review" makes it an exception request.
export function RequestForm({
  resourceId,
  slot,
  submitLabel,
  exception,
}: {
  resourceId: string;
  slot: { startDate: string; startTime: string; endDate: string; endTime: string };
  submitLabel: string;
  exception: boolean;
}) {
  const [state, action, pending] = useActionState(submitRequest, null);
  const id = useId();
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="resourceId" value={resourceId} />
      {Object.entries(slot).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-cat`} className="text-sm font-semibold">Purpose</label>
        <select id={`${id}-cat`} name="purposeCategory" defaultValue="personal" className={field}>
          {PURPOSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="text-xs text-ink-soft">Purpose counts toward priority only after an Owner or Manager verifies it.</p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-text`} className="text-sm font-semibold">What is it for?</label>
        <textarea id={`${id}-text`} name="purposeText" required minLength={3} maxLength={500} className={area} placeholder="e.g. Shooting the Tech Fest opening for the club magazine" />
      </div>
      {exception && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-exc`} className="text-sm font-semibold">Why you need an exception</label>
          <textarea id={`${id}-exc`} name="exceptionReason" required minLength={3} maxLength={500} className={area} />
          <p className="text-xs text-ink-soft">This goes to the organisation&apos;s Manager with your request.</p>
        </div>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full"><Send aria-hidden /> {pending ? "Sending…" : submitLabel}</Button>
      <Result state={state} />
    </form>
  );
}

export function CancelForm({ bookingId, label = "I can't make it", defaultReason = "I can't make it" }: { bookingId: string; label?: string; defaultReason?: string }) {
  const [state, action, pending] = useActionState(cancelBooking, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm font-semibold text-moss hover:underline [&::-webkit-details-marker]:hidden">{label}</summary>
      <form action={action} className="mt-2 grid gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <label htmlFor={`${id}-r`} className="text-xs font-semibold">Reason</label>
        <input id={`${id}-r`} name="reason" required minLength={3} defaultValue={defaultReason} className={field} />
        <Button type="submit" variant="destructive" size="sm" disabled={pending} className="w-fit">Cancel booking</Button>
        <Result state={state} />
      </form>
    </details>
  );
}

export function AckForm({ bookingId, phase }: { bookingId: string; phase: "checkout" | "return" }) {
  const [state, action, pending] = useActionState(acknowledgeCondition, null);
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="phase" value={phase} />
      <Button type="submit" disabled={pending}>Acknowledge condition</Button>
      <Result state={state} />
    </form>
  );
}

// Approve, reject (reason) or waitlist (reason) (PRD 10).
export function DecisionForm({ bookingId, as }: { bookingId: string; as: "owner" | "manager" }) {
  const [state, action, pending] = useActionState(decideRequest, null);
  const id = useId();
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="as" value={as} />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-r`} className="text-sm font-semibold">Reason <span className="font-normal text-ink-soft">(required to reject or waitlist)</span></label>
        <textarea id={`${id}-r`} name="reason" maxLength={500} className={area} aria-describedby={state && !state.ok ? `${id}-err` : undefined} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>Approve</Button>
        <Button type="submit" name="decision" value="waitlist" variant="outline" disabled={pending}>Waitlist</Button>
        <Button type="submit" name="decision" value="reject" variant="destructive" disabled={pending}>Reject</Button>
      </div>
      <Result state={state} id={`${id}-err`} />
    </form>
  );
}

export function CompleteReturnForm({ bookingId, as }: { bookingId: string; as: "owner" | "manager" }) {
  const [state, action, pending] = useActionState(completeReturn, null);
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="as" value={as} />
      <Button type="submit" disabled={pending} className="w-fit">Return OK — settle credits</Button>
      <Result state={state} />
    </form>
  );
}

export function DoorCheckinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(doorCheckin, null);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full"><DoorOpen aria-hidden /> Check in now</Button>
      <Result state={state} />
    </form>
  );
}
