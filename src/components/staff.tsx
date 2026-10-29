// Building blocks for the Owner, Manager and Admin desks (PRD 12).
import Link from "next/link";
import { MapPin, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import type { ResourceCategory, ResourceStatus } from "@/lib/contracts/resource";
import type { QueueItem, QueueLevel } from "@/lib/server/queues";
import { Avatar } from "./avatar";
import { CATEGORIES } from "./category";
import { rateLabel } from "./format";
import { ResourceCover } from "./resource-cover";
import { buttonVariants } from "./ui/button";
import { Flag, waited, type FlagTone } from "./ui/kit";

export function QueueRow({
  name,
  title,
  detail,
  since,
  now,
  href,
  cta = "Review",
  primary = false,
}: {
  name: string;
  title: string;
  detail: string;
  since: string;
  now: Date;
  href: string;
  cta?: string;
  primary?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <Avatar name={name} />
      <span className="grid min-w-0 flex-1 max-sm:basis-[calc(100%-3.5rem)]">
        <strong className="truncate text-sm font-semibold">{title}</strong>
        <span className="truncate text-sm text-ink-soft">{detail}</span>
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-pending-fg max-sm:ml-12">waiting {waited(since, now)}</span>
      <Link href={href} className={buttonVariants({ variant: primary ? "default" : "outline", size: "sm", className: "max-sm:ml-auto" })}>{cta}</Link>
    </li>
  );
}

const LEVEL: Record<QueueLevel, { bar: string; tone: FlagTone; label: string }> = {
  critical: { bar: "bg-coral", tone: "danger", label: "Critical" },
  urgent: { bar: "bg-honey", tone: "warn", label: "Urgent" },
  normal: { bar: "bg-[#7ca274]", tone: "neutral", label: "Normal" },
};

export function DecisionRow({ item, now }: { item: QueueItem; now: Date }) {
  const l = LEVEL[item.level];
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span aria-hidden className={cn("w-1 self-stretch rounded-full", l.bar)} />
      <span className="grid min-w-0 flex-1 gap-0.5 max-sm:basis-[calc(100%-1.5rem)]">
        <span className="flex flex-wrap items-center gap-2">
          <Flag tone={l.tone}>{l.label}</Flag>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{item.kind}</span>
        </span>
        <strong className="truncate text-sm font-semibold">{item.title}</strong>
        <span className="truncate text-sm text-ink-soft">{item.detail}</span>
      </span>
      <span className="whitespace-nowrap text-xs font-medium text-ink-soft max-sm:ml-4">waiting {waited(item.since, now)}</span>
      <Link href={item.href} className={buttonVariants({ variant: item.level === "critical" ? "default" : "outline", size: "sm", className: "max-sm:ml-auto" })}>Review</Link>
    </li>
  );
}

export function ActivityLine({ icon: Icon, title, detail, when, href }: { icon: LucideIcon; title: string; detail: string; when: string; href?: string }) {
  const body = (
    <>
      <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-[#f6f8f0] text-moss">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className="truncate text-sm font-semibold">{title}</strong>
        <span className="truncate text-sm text-ink-soft">{detail}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-moss">{when}</span>
      </span>
    </>
  );
  return (
    <li className="relative [&+&]:before:absolute [&+&]:before:-top-3 [&+&]:before:left-9 [&+&]:before:h-5 [&+&]:before:w-px [&+&]:before:bg-line">
      {href ? (
        <Link href={href} className="flex items-start gap-3 px-5 py-3 hover:bg-cream/60">{body}</Link>
      ) : (
        <div className="flex items-start gap-3 px-5 py-3">{body}</div>
      )}
    </li>
  );
}

const RES_STATUS: Record<ResourceStatus, { tone: FlagTone; label: string }> = {
  active: { tone: "good", label: "Active" },
  paused: { tone: "neutral", label: "Paused" },
  under_maintenance: { tone: "warn", label: "Under maintenance" },
  unsafe: { tone: "danger", label: "Unsafe" },
};

export function ResourceTile({
  r,
  out,
  children,
}: {
  children?: React.ReactNode;
  r: { id: string; name: string; category: ResourceCategory; status: ResourceStatus; quantity: number; base_rate: number; rate_unit: "hour" | "day"; location: string; allocation_mode: string; approval_mode: string };
  out?: number;
}) {
  const s = RES_STATUS[r.status];
  return (
    <article className="lift overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
      <ResourceCover category={r.category} className="h-32" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">{r.name}</h3>
          <span className="shrink-0 text-sm font-bold text-moss">{rateLabel(r.base_rate, r.rate_unit).replace(" credits", "")}</span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-sm text-ink-soft">
          <MapPin aria-hidden className="size-3.5" /> <span className="truncate">{r.location}</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Flag tone={s.tone}>{s.label}</Flag>
          <Flag>{r.quantity} {r.quantity === 1 ? "unit" : "units"}{out ? ` · ${out} out` : ""}</Flag>
          <Flag tone="info">{r.allocation_mode === "batch" ? "Batch" : r.approval_mode === "auto" ? "Auto-approve" : `${r.approval_mode === "manager" ? "Manager" : "Owner"} approval`}</Flag>
        </div>
        <p className="sr-only">{CATEGORIES[r.category].label}</p>
        {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
      </div>
    </article>
  );
}

// Per-resource use, last 30 days (PRD 12): estimate before listing, booked vs open hours, recorded use.
export interface ResourceUse {
  id: string;
  name: string;
  category: ResourceCategory;
  status: ResourceStatus;
  estimated_current_usage: string;
  organizations?: { name: string } | null;
  hours: number;
  booked: number;
  available: number;
  utilisation: number | null;
  bookings: number;
  noShows: number;
}

export function ResourceUseTable({ rows, showOrg }: { rows: ResourceUse[]; showOrg?: boolean }) {
  const cell = "px-3 py-3 text-right font-mono";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
            <th scope="col" className="px-5 py-3 font-semibold">Resource</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
            <th scope="col" className="px-3 py-3 font-semibold">Before listing</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Open h</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Booked h</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Used h</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Use</th>
            <th scope="col" className="px-3 py-3 text-right font-semibold">Completed</th>
            <th scope="col" className="px-5 py-3 text-right font-semibold">No-shows</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id}>
              <th scope="row" className="px-5 py-3 text-left font-semibold">
                {r.name} <span className="font-normal text-ink-soft">· {showOrg ? r.organizations?.name : CATEGORIES[r.category].label}</span>
              </th>
              <td className="px-3 py-3">
                <Flag tone={r.status === "active" ? "good" : r.status === "unsafe" ? "danger" : "warn"}>{r.status.replaceAll("_", " ")}</Flag>
              </td>
              <td className="px-3 py-3 text-ink-soft">{r.estimated_current_usage}</td>
              <td className={cell}>{r.available || "—"}</td>
              <td className={cell}>{r.booked}</td>
              <td className={cell}>{r.hours}</td>
              <td className={cell}>{r.utilisation === null ? "—" : `${r.utilisation}%`}</td>
              <td className={cell}>{r.bookings}</td>
              <td className="px-5 py-3 text-right font-mono">{r.noShows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
