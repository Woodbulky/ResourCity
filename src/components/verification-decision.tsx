"use client";
import { useActionState, useId } from "react";
import { Check, CircleCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decideVerification } from "@/lib/server/account";

export function VerificationDecision({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(decideVerification, null);
  const reasonId = useId();
  const errorId = useId();
  if (state?.ok)
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-sage px-3 py-2 text-sm font-semibold text-sage-strong">
        <CircleCheck aria-hidden className="size-4" /> {state.message} The student has been notified.
      </p>
    );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={reasonId} className="flex justify-between text-sm font-semibold">
        Reason <span className="font-normal text-ink-soft">Required to reject</span>
      </label>
      <textarea
        id={reasonId}
        name="reason"
        rows={2}
        placeholder="e.g. The roll number on the ID card does not match the form."
        className="w-full resize-y rounded-[10px] border border-line-strong bg-paper px-3 py-2 text-sm placeholder:text-ink-soft focus:border-moss focus:outline-none focus:ring-3 focus:ring-moss/20 aria-invalid:border-danger-fg"
        aria-invalid={state && !state.ok ? true : undefined}
        aria-describedby={state && !state.ok ? errorId : undefined}
      />
      {state && !state.ok && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger-fg">{state.error}</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" name="decision" value="approve" disabled={pending}><Check aria-hidden /> Verify student</Button>
        <Button type="submit" name="decision" value="reject" variant="destructive" disabled={pending}><X aria-hidden /> Reject with reason</Button>
      </div>
    </form>
  );
}
