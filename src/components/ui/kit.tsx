// Layout primitives shared by every dashboard: headings, panels, stats, tabs and empty states.
import Link from "next/link";
import { ArrowRight, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "cn";

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-sage text-moss">
            <Sparkles aria-hidden className="size-3" />
          </span>
          {eyebrow}
        </p>
        <h1 className="display mt-2 text-[2.5rem] text-ink sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section className={cn("overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper", className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeading({
  id,
  title,
  description,
  aside,
}: {
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 id={id} className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      {aside}
    </div>
  );
}

export function PanelFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-3">
      <ArrowLink href={href}>{children}</ArrowLink>
    </div>
  );
}

export function ArrowLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("group/arrow inline-flex items-center gap-1.5 text-sm font-semibold text-moss", className)}>
      {children}
      <ArrowRight aria-hidden className="size-4 transition-transform group-hover/arrow:translate-x-0.5" />
    </Link>
  );
}

export function CountBadge({ children, tone = "pending" }: { children: React.ReactNode; tone?: "pending" | "neutral" | "danger" }) {
  const tones = {
    pending: "bg-pending-bg text-pending-fg",
    neutral: "bg-neutral-bg text-neutral-fg",
    danger: "bg-danger-bg text-danger-fg",
  };
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
  href,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "alert";
}) {
  const body = (
    <>
      <span className="block pr-10 text-sm leading-snug text-ink-soft">{label}</span>
      <strong className="display mt-2 block text-4xl text-ink">{value}</strong>
      {note && <span className={cn("mt-2 block text-xs font-medium", tone === "alert" ? "text-danger-fg" : "text-moss")}>{note}</span>}
      <span className={cn("absolute right-4 top-4 grid size-8 place-items-center rounded-lg", tone === "alert" ? "bg-danger-bg text-danger-fg" : "bg-wash text-moss")}>
        <Icon aria-hidden className="size-4" />
      </span>
    </>
  );
  const cls = "relative block min-h-28 rounded-[var(--radius-card)] border border-line bg-paper p-4";
  return href ? <Link href={href} className={cn(cls, "lift")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SummaryRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function MiniStat({ icon: Icon, value, label }: { icon: LucideIcon; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-paper/80 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-wash text-moss">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="grid">
        <strong className="text-base font-semibold">{value}</strong>
        <span className="text-xs text-ink-soft">{label}</span>
      </span>
    </div>
  );
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 mt-9 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid justify-items-center text-center", compact ? "px-5 py-8" : "rounded-[var(--radius-card)] border border-dashed border-line-strong bg-paper/60 px-5 py-12")}>
      <span className="mb-3 grid size-12 place-items-center rounded-2xl border border-line bg-sage text-moss">
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="display text-2xl">{title}</h3>
      {children && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Link-based tabs: the active tab lives in the URL (?tab=), so they work without client JS.
export function TabRail({
  label,
  tabs,
  active,
  hrefFor,
}: {
  label: string;
  tabs: readonly { key: string; label: string; count?: number }[];
  active: string;
  hrefFor: (key: string) => string;
}) {
  return (
    <nav aria-label={label} className="mb-5 flex w-full max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-wash p-1 sm:w-fit">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hrefFor(t.key)}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm text-ink-soft transition hover:text-ink aria-[current=page]:bg-paper aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:shadow-[0_2px_6px_rgba(28,55,37,0.08)]"
        >
          {t.label}
          {t.count !== undefined && <span className="text-xs text-ink-soft">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

const FLAG_TONES = {
  good: "bg-sage text-sage-strong",
  warn: "bg-pending-bg text-pending-fg",
  info: "bg-info-bg text-info-fg",
  danger: "bg-danger-bg text-danger-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
} as const;
export type FlagTone = keyof typeof FLAG_TONES;

export function Flag({ tone = "neutral", icon: Icon, children }: { tone?: FlagTone; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex min-h-6 items-center gap-1 rounded-md px-2 text-xs font-semibold", FLAG_TONES[tone])}>
      {Icon && <Icon aria-hidden className="size-3.5" />}
      {children}
    </span>
  );
}

// Marks an action whose server flow lands in a later PRD phase, so the UI never fakes it.
export function ComingNext({ phase, children }: { phase: number; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-wash px-3 py-2 text-xs leading-relaxed text-ink-soft">
      <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-moss" />
      <span>
        {children} <span className="font-semibold text-ink">Arrives in Phase {phase}.</span>
      </span>
    </p>
  );
}

// "18 min ago" style age of a queue item, measured against the simulated clock.
export function waited(from: string | Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(from).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

// Text input / select styling shared by every form.
export const field =
  "h-10 w-full rounded-[10px] border border-line-strong bg-paper px-3 text-sm focus:border-moss focus:outline-none focus:ring-3 focus:ring-moss/20";
