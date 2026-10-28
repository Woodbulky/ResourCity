import Link from "next/link";
import { BadgeCheck, Ban, CircleCheck, Clock, MapPin, Zap, type LucideIcon } from "lucide-react";
import type { CardState } from "@/lib/domain/eligibility";
import type { ResourceCardData } from "@/lib/server/student";
import { rateLabel } from "./format";
import { ResourceCover } from "./resource-cover";
import { Flag, type FlagTone } from "./ui/kit";

// PRD 7 card states, each with colour + icon + text.
export const CARD_STATES: Record<CardState, { tone: FlagTone; icon: LucideIcon; label: string }> = {
  eligible: { tone: "good", icon: Zap, label: "Eligible" },
  eligible_approval: { tone: "good", icon: CircleCheck, label: "Eligible" },
  action_required: { tone: "warn", icon: BadgeCheck, label: "Action required" },
  not_eligible: { tone: "danger", icon: Ban, label: "Not eligible" },
  unavailable: { tone: "neutral", icon: Clock, label: "Unavailable" },
};

export function ResourceCard({ r, detailed = false }: { r: ResourceCardData; detailed?: boolean }) {
  const s = CARD_STATES[r.state];
  return (
    <article className="lift group relative flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
      <ResourceCover
        category={r.category}
        className={detailed ? "h-44" : "h-36"}
        badge={
          r.quantity > 1 ? (
            <span className="rounded-full bg-white/85 px-2 py-0.5 text-xs font-semibold text-pine">{r.quantity} units</span>
          ) : undefined
        }
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">
            <Link href={`/student/browse/${r.id}`} className="after:absolute after:inset-0 after:content-[''] hover:text-moss focus-visible:outline-none">
              {r.name}
            </Link>
          </h3>
          <span className="shrink-0 text-sm font-bold text-moss">{rateLabel(r.baseRate, r.rateUnit).replace(" credits", "")}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{r.orgName} · {r.location}</span>
        </p>
        {detailed && r.description && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{r.description}</p>}
        <div className="mt-auto pt-3">
          <p className="flex items-start gap-1.5 text-sm">
            <span className="sr-only">{s.label}: </span>
            <Flag tone={s.tone} icon={s.icon}>{s.label}</Flag>
          </p>
          <p className="mt-1.5 text-sm leading-snug text-ink">{r.headline.replace(/^Eligible · /, "")}</p>
        </div>
      </div>
    </article>
  );
}
