"use client";
import { useActionState, useId } from "react";
import { Button } from "@/components/ui/button";
import { decideVerification } from "@/lib/server/account";

export function VerificationDecision({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(decideVerification, null);
  const reasonId = useId();
  const errorId = useId();
  if (state?.ok) return <p role="status" className="text-sm font-medium text-forest">{state.message}</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <label htmlFor={reasonId} className="block text-sm font-medium">
        Reason (required to reject)
      </label>
      <input
        id={reasonId}
        name="reason"
        className="w-full rounded-md border bg-white px-3 py-2 text-sm"
        aria-describedby={state && !state.ok ? errorId : undefined}
      />
      {state && !state.ok && (
        <p id={errorId} role="alert" className="text-sm text-[var(--red-base)]">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve" disabled={pending}>Verify</Button>
        <Button type="submit" name="decision" value="reject" variant="destructive" disabled={pending}>Reject</Button>
      </div>
    </form>
  );
}
