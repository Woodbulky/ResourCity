"use client";
import { useActionState, useId } from "react";
import { CircleCheck, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { changeMembership } from "@/lib/server/account";

const field =
  "h-10 w-full rounded-[10px] border border-line-strong bg-paper px-3 text-sm focus:border-moss focus:outline-none focus:ring-3 focus:ring-moss/20";

interface Person {
  id: string;
  name: string;
}

function Result({ state, errorId }: { state: Awaited<ReturnType<typeof changeMembership>> | null; errorId: string }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-sage-strong">
      <CircleCheck aria-hidden className="size-4" /> {state.message}
    </p>
  ) : (
    <p id={errorId} role="alert" className="text-sm font-semibold text-danger-fg">{state.error}</p>
  );
}

// Grant Owner or Manager for one organisation (PRD 3, 12). A reason is mandatory and audited.
export function GrantRoleForm({ people, orgs }: { people: Person[]; orgs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(changeMembership, null);
  const id = useId();
  return (
    <form action={action} className="grid gap-3 p-5 md:grid-cols-2">
      <input type="hidden" name="grant" value="true" />
      <div className="space-y-1.5">
        <label htmlFor={`${id}-user`} className="text-sm font-semibold">Person</label>
        <select id={`${id}-user`} name="userId" required defaultValue="" className={field}>
          <option value="" disabled>Choose a person…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${id}-org`} className="text-sm font-semibold">Organisation</label>
          <select id={`${id}-org`} name="orgId" required defaultValue="" className={field}>
            <option value="" disabled>Choose…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-role`} className="text-sm font-semibold">Role</label>
          <select id={`${id}-role`} name="role" required defaultValue="owner" className={field}>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <label htmlFor={`${id}-reason`} className="text-sm font-semibold">Reason</label>
        <input id={`${id}-reason`} name="reason" required minLength={3} placeholder="e.g. New Photography Club lead for 2026–27" className={field} aria-describedby={state && !state.ok ? `${id}-err` : undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}><UserPlus aria-hidden /> Grant role</Button>
        <Result state={state} errorId={`${id}-err`} />
      </div>
    </form>
  );
}

// Revoke with a reason; the last Manager of an organisation needs a named replacement.
export function RevokeRole({
  userId,
  orgId,
  role,
  name,
  candidates,
}: {
  userId: string;
  orgId: string;
  role: "owner" | "manager";
  name: string;
  candidates: Person[];
}) {
  const [state, action, pending] = useActionState(changeMembership, null);
  const id = useId();
  if (state?.ok) return <Result state={state} errorId={`${id}-err`} />;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm font-semibold text-moss hover:bg-wash [&::-webkit-details-marker]:hidden">
        Revoke<span className="sr-only"> {role} role from {name}</span>
      </summary>
      <form action={action} className="mt-2 grid gap-2 rounded-xl border border-line bg-cream/60 p-3">
        <input type="hidden" name="grant" value="false" />
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="role" value={role} />
        <label htmlFor={`${id}-reason`} className="text-xs font-semibold">Reason</label>
        <input id={`${id}-reason`} name="reason" required minLength={3} className={field} />
        {role === "manager" && (
          <>
            <label htmlFor={`${id}-rep`} className="text-xs font-semibold">Replacement Manager (required if this is the last one)</label>
            <select id={`${id}-rep`} name="replacementUserId" defaultValue="" className={field}>
              <option value="">No replacement</option>
              {candidates.filter((c) => c.id !== userId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>
        )}
        <Button type="submit" variant="destructive" size="sm" disabled={pending} className="w-fit"><UserMinus aria-hidden /> Revoke role</Button>
        <Result state={state} errorId={`${id}-err`} />
      </form>
    </details>
  );
}
