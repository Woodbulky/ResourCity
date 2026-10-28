import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowRight, BadgeCheck, Bell, CalendarDays, CircleCheck, Package, QrCode, Scale, Search, ShieldAlert, Sparkles,
  TriangleAlert, Wallet, type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { formatSlot, formatWhen, relativeDay } from "@/components/format";
import { ResourceCard } from "@/components/resource-card";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLink, EmptyState, MiniStat, Panel, PanelHeading, SectionTitle } from "@/components/ui/kit";
import { ACTIVE_STATUSES } from "@/lib/contracts/booking";
import { APP_TIMEZONE } from "@/lib/domain/time";
import { todayBounds } from "@/lib/server/queues";
import { catalog, studentSnapshot, toCard } from "@/lib/server/student";
import { requireViewer } from "@/lib/server/viewer";

interface Action {
  id: string;
  icon: LucideIcon;
  tone: "info" | "good" | "warn" | "danger";
  title: string;
  detail: string;
  href: string;
  cta: string;
}

const TONE = {
  info: "bg-info-bg text-info-fg",
  good: "bg-sage text-moss",
  warn: "bg-pending-bg text-pending-fg",
  danger: "bg-danger-bg text-danger-fg",
};

export default async function StudentHome() {
  const viewer = await requireViewer();
  const snap = await studentSnapshot(viewer);
  const resources = await catalog(viewer);
  const { now } = snap;
  const { end: todayEnd } = todayBounds(now);
  const hour = Number(formatInTimeZone(now, APP_TIMEZONE, "H"));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = viewer.fullName.split(" ")[0] || "there";

  // PRD 12: what needs this student now, most urgent first.
  const actions: Action[] = [];
  for (const b of snap.bookings) {
    const name = b.resources?.name ?? "Resource";
    if (b.status === "offered")
      actions.push({ id: b.id, icon: Bell, tone: "info", title: `Slot offered: ${name}`, detail: `Accept by ${b.offer_expires_at ? formatWhen(b.offer_expires_at) : "soon"} or it passes to the next student.`, href: `/student/bookings/${b.id}`, cta: "Review offer" });
    if (b.status === "overdue")
      actions.push({ id: b.id, icon: TriangleAlert, tone: "danger", title: `${name} is overdue`, detail: `It was due back ${formatWhen(b.end_at)}. Return it as soon as you can.`, href: `/student/bookings/${b.id}`, cta: "Return details" });
    if (b.status === "approved" && new Date(b.start_at) < todayEnd)
      actions.push({ id: b.id, icon: QrCode, tone: "good", title: `Collect today: ${name}`, detail: `${formatSlot(b.start_at, b.end_at)}. Show your QR to the Owner.`, href: `/student/bookings/${b.id}`, cta: "Open QR" });
    if (b.status === "checked_out" && new Date(b.end_at) < todayEnd)
      actions.push({ id: b.id, icon: Package, tone: "warn", title: `Return today: ${name}`, detail: `Due back by ${formatWhen(b.end_at)}.`, href: `/student/bookings/${b.id}`, cta: "Return details" });
  }
  for (const c of snap.cases)
    if (c.status === "awaiting_response")
      actions.push({ id: c.id, icon: Scale, tone: "warn", title: `Respond to a damage report: ${c.bookings.resources?.name ?? "booking"}`, detail: `Share your side before ${formatWhen(c.response_deadline)}. A Manager decides after reading it.`, href: `/student/bookings/${c.booking_id}`, cta: "Respond" });

  const upcoming = snap.bookings
    .filter((b) => ACTIVE_STATUSES.includes(b.status))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const verifiedBadges = snap.badges.filter((b) => b.status === "verified" && (!b.expires_at || new Date(b.expires_at) > now));
  const picks = [...resources]
    .sort((a, b) => Number(b.state.startsWith("eligible")) - Number(a.state.startsWith("eligible")))
    .slice(0, 3);
  const allowance = snap.policy.values.weekly_allowance;

  return (
    <>
      {viewer.status === "suspended" && (
        <div role="alert" className="mb-6 flex gap-3 rounded-[var(--radius-card)] border border-danger-fg/30 bg-danger-bg p-4 text-sm text-danger-fg">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              Booking privileges suspended{viewer.suspendedUntil && ` until ${formatWhen(viewer.suspendedUntil)}`}.
            </p>
            {viewer.statusReason && <p className="mt-1">Reason: {viewer.statusReason}</p>}
            <p className="mt-1">You can still view your history, and anything you have borrowed must be returned.</p>
          </div>
        </div>
      )}

      <section className="mb-6 flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full bg-sage text-moss"><Sparkles aria-hidden className="size-3" /></span>
            Your campus, a little closer
          </p>
          <h1 className="display mt-2 flex flex-wrap items-center gap-x-3 text-[2.6rem] sm:text-5xl">
            <span>
              {greeting}, <em>{first}.</em>
            </span>
            {viewer.status === "verified" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#dce7ce] bg-[#eff5e6] px-2.5 py-1 font-sans text-xs font-semibold tracking-normal text-sage-strong">
                <BadgeCheck aria-hidden className="size-3.5" /> Verified student
              </span>
            )}
          </h1>
          <p className="mt-2 text-[0.9375rem] text-ink-soft">Find something useful. Make something happen. Share it when you&apos;re done.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/student/bookings" className={buttonVariants({ variant: "outline" })}><CalendarDays aria-hidden /> My bookings</Link>
          <Link href="/student/browse" className={buttonVariants()}>Find a resource <ArrowRight aria-hidden /></Link>
        </div>
      </section>

      <Panel aria-labelledby="actions-heading" className="mb-6">
        <PanelHeading
          id="actions-heading"
          title="Needs your action"
          description={actions.length ? "Most urgent first." : undefined}
          aside={actions.length ? <span className="rounded-full bg-pending-bg px-2.5 py-1 text-xs font-semibold text-pending-fg">{actions.length} to do</span> : undefined}
        />
        {actions.length ? (
          <ul className="divide-y divide-line">
            {actions.map((a) => (
              <li key={`${a.id}-${a.title}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", TONE[a.tone])}><a.icon aria-hidden className="size-4" /></span>
                <span className="grid min-w-0 flex-1">
                  <strong className="text-sm font-semibold">{a.title}</strong>
                  <span className="text-sm text-ink-soft">{a.detail}</span>
                </span>
                <Link href={a.href} className={buttonVariants({ variant: "outline", size: "sm" })}>{a.cta}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-soft">
            <CircleCheck aria-hidden className="size-4 text-moss" /> Nothing needs you right now. Offers, pickups and returns show up here first.
          </p>
        )}
      </Panel>

      <section aria-label="Discovery and credits" className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.8fr)]">
        <article className="on-dark rings relative isolate flex min-h-72 items-end overflow-hidden rounded-[18px] bg-pine p-7 text-[#f9f8ee] [--ring-right:80px] [--ring-top:-92px] [--ring-size:260px]">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,#2f6448_0%,transparent_55%),radial-gradient(80%_80%_at_85%_100%,#1f5141_0%,transparent_60%)]" />
          <div className="relative max-w-md">
            <p className="flex items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.17em] text-[#d2ecaa]">
              <span className="size-1.5 rounded-full bg-[#d2ecaa] shadow-[0_0_0_4px_rgba(210,236,170,0.13)]" /> Deccan Valley · shared campus
            </p>
            <h2 className="display mt-3 text-[2.6rem] sm:text-5xl">
              Good things shouldn&apos;t sit <em>still.</em>
            </h2>
            <p className="mb-5 mt-3 max-w-sm text-sm leading-relaxed text-[#d3e0d4]">
              {resources.length} resources from clubs, labs and departments, from a camera for your next idea to a hall for your whole team.
            </p>
            <Link href="/student/browse" className={buttonVariants({ variant: "lime" })}>Explore what&apos;s available <ArrowRight aria-hidden /></Link>
          </div>
        </article>

        <article className="rings relative flex min-h-72 flex-col overflow-hidden rounded-[18px] border border-line bg-[#e8efda] p-5 text-moss [--ring-right:-52px] [--ring-top:-53px] [--ring-size:169px]">
          <div className="relative flex items-center justify-between">
            <span className="eyebrow text-moss">Your weekly credits</span>
            <span className="grid size-8 place-items-center rounded-lg border border-[#cddbbf]"><Wallet aria-hidden className="size-4" /></span>
          </div>
          <p className="relative mt-5 text-ink">
            <strong className="display block text-6xl">{snap.available}</strong>
            <span className="mt-1 inline-flex items-center gap-1 text-sm text-ink-soft"><Sparkles aria-hidden className="size-3.5 text-moss" /> available to borrow</span>
          </p>
          <div className="relative my-4 h-px bg-moss/15" />
          <dl className="relative flex justify-between gap-3 text-ink">
            <div><dt className="text-xs text-ink-soft">Held for bookings</dt><dd className="text-sm font-semibold">{snap.held} credits</dd></div>
            <div><dt className="text-xs text-ink-soft">Weekly allowance</dt><dd className="text-sm font-semibold">{allowance} credits</dd></div>
          </dl>
          <ArrowLink href="/student/wallet" className="relative mt-auto justify-between pt-4">View your wallet</ArrowLink>
        </article>
      </section>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniStat icon={CalendarDays} value={upcoming.length} label="Active bookings" />
        <MiniStat icon={CircleCheck} value={`${snap.strikes} / ${snap.policy.values.strikes.limit}`} label="No-shows in the last 30 days" />
        <MiniStat icon={BadgeCheck} value={verifiedBadges.length} label={verifiedBadges.length === 1 ? "Verified badge" : "Verified badges"} />
      </div>

      <SectionTitle title="Picked for you" description="Good places to start, eligible ones first." action={<ArrowLink href="/student/browse">See all resources</ArrowLink>} />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        {picks.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((p) => <ResourceCard key={p.id} r={toCard(p)} />)}
          </div>
        ) : (
          <EmptyState icon={Search} title="The shelf is empty for now.">Owners are still listing their resources.</EmptyState>
        )}
        <Panel aria-labelledby="coming-heading" className="flex flex-col">
          <PanelHeading id="coming-heading" title="Coming up" aside={<span className="rounded-md bg-wash px-2 py-1 text-xs font-semibold text-moss">YOURS</span>} />
          {upcoming.length ? (
            <ul className="flex-1 divide-y divide-line">
              {upcoming.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <Link href={`/student/bookings/${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-cream/60">
                    <span className="grid w-14 shrink-0 border-r border-line pr-2 text-xs font-semibold uppercase">
                      {relativeDay(b.start_at, now)}
                      <small className="font-medium normal-case text-ink-soft">{formatInTimeZone(new Date(b.start_at), APP_TIMEZONE, "h:mm a").toLowerCase()}</small>
                    </span>
                    <span className="grid min-w-0">
                      <strong className="truncate text-sm font-semibold">{b.resources?.name}</strong>
                      <small className="truncate text-xs text-ink-soft">{b.resources?.organizations?.name}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex-1 px-5 py-4 text-sm text-ink-soft">No bookings yet. Your next request will show up here.</p>
          )}
          <div className="border-t border-line px-5 py-3"><ArrowLink href="/student/bookings">All my bookings</ArrowLink></div>
        </Panel>
      </section>
    </>
  );
}
