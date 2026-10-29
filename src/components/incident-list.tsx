import { CircleCheck, Siren } from "lucide-react";
import { formatWhen, sentence } from "@/components/format";
import { IncidentUpdateForm, ResourceStatusForm } from "@/components/trust-forms";
import { EmptyState, Flag, waited } from "@/components/ui/kit";
import { createClient } from "@/lib/server/supabase";

export interface IncidentRow {
  id: string;
  severity: "low" | "medium" | "high";
  status: string;
  description: string;
  location: string;
  created_at: string;
  occurred_at: string;
  booking_id: string | null;
  actions: string | null;
  evidence: string[];
  resources: { id: string; name: string; status: string; organizations: { name: string } | null };
}

// Open safety incidents with the Manager's (or Admin's) actions (PRD 11). Marking a resource unsafe
// and confirming it is safe again are separate, reasoned steps; closing never restores it.
export async function IncidentList({ incidents, as, now }: { incidents: IncidentRow[]; as: "manager" | "admin"; now: Date }) {
  if (!incidents.length) return <EmptyState compact icon={CircleCheck} title="No open incidents." />;
  const paths = incidents.flatMap((i) => i.evidence);
  const { data: signed } = paths.length
    ? await (await createClient()).storage.from("incident-evidence").createSignedUrls(paths, 600)
    : { data: [] };
  const url = Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path!, s.signedUrl]));
  return (
    <ul className="divide-y divide-line">
      {incidents.map((i) => (
        <li key={i.id} id={`incident-${i.id}`} className="grid scroll-mt-24 gap-3 px-5 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-danger-bg text-danger-fg"><Siren aria-hidden className="size-4" /></span>
            <span className="grid min-w-0 flex-1 gap-1">
              <strong className="text-sm font-semibold">{i.resources.name} · {i.resources.organizations?.name}</strong>
              <span className="text-sm text-ink-soft">{i.description}</span>
              <span className="flex flex-wrap gap-1.5">
                <Flag tone={i.severity === "high" ? "danger" : i.severity === "medium" ? "warn" : "neutral"}>{sentence(i.severity)} severity</Flag>
                <Flag>{sentence(i.status)}</Flag>
                {i.location && <Flag>{i.location}</Flag>}
                <Flag tone={i.resources.status === "unsafe" ? "danger" : "neutral"}>Resource {sentence(i.resources.status).toLowerCase()}</Flag>
              </span>
              <span className="text-xs text-ink-soft">Happened {formatWhen(i.occurred_at)} · reported {waited(i.created_at, now)} ago</span>
            </span>
          </div>
          {i.actions && <p className="whitespace-pre-line rounded-lg bg-wash px-3 py-2 text-sm"><strong>Actions so far:</strong> {i.actions}</p>}
          {i.evidence.some((p) => url[p]) && (
            <ul className="grid max-w-md grid-cols-4 gap-2">
              {i.evidence.map((p, n) =>
                url[p] ? (
                  <li key={p}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={url[p]} alt={`Evidence photo ${n + 1}`} className="aspect-square w-full rounded-lg border border-line object-cover" />
                  </li>
                ) : null,
              )}
            </ul>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <IncidentUpdateForm incidentId={i.id} as={as} hasBooking={!!i.booking_id} />
            <div className="grid content-start gap-2">
              {i.resources.status === "unsafe" ? (
                <ResourceStatusForm resourceId={i.resources.id} as={as} to="active" label="Confirm safe to use again" />
              ) : (
                <ResourceStatusForm resourceId={i.resources.id} as={as} to="unsafe" label="Mark resource unsafe" />
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
