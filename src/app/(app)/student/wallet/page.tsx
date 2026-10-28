import Link from "next/link";
import { BadgeCheck, CalendarClock, CircleMinus, CirclePlus, Coins, LifeBuoy, Lock, Sparkles, UserX, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { formatWhen, sentence } from "@/components/format";
import { EmptyState, Flag, Panel, PanelHeading, PageHeading, SectionTitle } from "@/components/ui/kit";
import type { LedgerKind } from "@/lib/domain/ledger";
import { studentSnapshot } from "@/lib/server/student";
import { requireViewer } from "@/lib/server/viewer";

const KIND: Record<LedgerKind, { label: string; icon: LucideIcon }> = {
  allowance: { label: "Weekly allowance added", icon: Sparkles },
  hold: { label: "Held for a booking", icon: Lock },
  release: { label: "Hold released", icon: CirclePlus },
  charge: { label: "Charged for a booking", icon: Coins },
  penalty: { label: "Penalty confirmed by a Manager", icon: CircleMinus },
  forfeit: { label: "Hold forfeited after a no-show", icon: UserX },
  emergency_grant: { label: "Emergency credits granted", icon: LifeBuoy },
  reset_expiry: { label: "Unused credits expired at reset", icon: CalendarClock },
};

// Credits wallet (PRD 9, 12): balance, holds, ledger history, next reset, emergency requests, standing.
export default async function WalletPage() {
  const viewer = await requireViewer();
  const s = await studentSnapshot(viewer);
  const allowance = s.policy.values.weekly_allowance;
  const usedThisWeek = s.ledger
    .filter((l) => new Date(l.created_at) >= new Date(s.nextReset.getTime() - 7 * 86_400_000))
    .filter((l) => l.kind === "charge" || l.kind === "penalty" || l.kind === "forfeit")
    .reduce((sum, l) => sum - l.delta, 0);
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(allowance, 1)) * 100))}%`;

  return (
    <>
      <PageHeading
        eyebrow="Your weekly allowance"
        title={
          <>
            A little credit goes <em>a long way.</em>
          </>
        }
        description="Credits make sure everyone gets a fair turn. They're free, shared equally, and never worth cash. They can't be bought or transferred."
      />

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rings relative min-h-60 overflow-hidden rounded-[18px] bg-[#e6eed8] p-6 text-moss [--ring-right:-32px] [--ring-size:300px] [--ring-top:-115px]">
          <p className="eyebrow relative text-moss">Available to borrow</p>
          <p className="display relative mt-4 text-7xl text-ink">
            {s.available}
            <small className="ml-2 font-sans text-base font-medium tracking-normal text-moss">credits</small>
          </p>
          <p className="relative mt-3 text-sm text-ink-soft">
            Your {allowance}-credit allowance refreshes {formatWhen(s.nextReset)} (Monday, campus time). Unused credits expire then; holds are kept.
          </p>
          <div className="relative mt-5 h-2 max-w-md overflow-hidden rounded-full bg-moss/15" role="img" aria-label={`${s.available} of ${allowance} credits available`}>
            <span className="block h-full rounded-full bg-moss" style={{ width: pct(s.available) }} />
          </div>
          <p className="relative mt-2 flex max-w-md justify-between text-xs text-ink-soft">
            <span>{usedThisWeek} used this week</span>
            <span>{s.held} held · {allowance} each week</span>
          </p>
          {s.available < 0 && (
            <p className="relative mt-3 text-sm font-semibold text-danger-fg">You owe {-s.available} credits; the next allowance pays this off first.</p>
          )}
        </article>

        <Panel className="flex flex-col justify-between p-5">
          <h2 className="font-semibold">Where your credits are</h2>
          <dl className="my-4 grid gap-3 text-sm">
            {[
              ["Ready to use", Math.max(0, s.available), "bg-moss"],
              ["Held for bookings", s.held, "bg-honey"],
              ["Used this week", usedThisWeek, "bg-line-strong"],
            ].map(([label, value, dot]) => (
              <div key={label as string} className="grid grid-cols-[12px_1fr_auto] items-center gap-2">
                <i aria-hidden className={cn("size-2.5 rounded-[3px]", dot as string)} />
                <dt className="text-ink-soft">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
            Holds are taken when a booking is approved and settled at return: you pay only for the time you actually used.
          </p>
        </Panel>
      </section>

      <SectionTitle title="Your standing" description="What affects whether a request goes straight through." />
      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5">
          <p className="text-sm text-ink-soft">No-shows, last {s.policy.values.strikes.window_days} days</p>
          <p className="display mt-2 text-4xl">{s.strikes} <span className="font-sans text-base text-ink-soft">of {s.policy.values.strikes.limit}</span></p>
          <p className="mt-2 text-xs text-ink-soft">At the limit, new requests need Manager review. One more after that forfeits the hold.</p>
        </Panel>
        <Panel className="p-5 md:col-span-2">
          <p className="text-sm text-ink-soft">Training badges</p>
          {s.badges.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {s.badges.map((b) => {
                const expired = b.expires_at && new Date(b.expires_at) <= s.now;
                const tone = b.status === "verified" && !expired ? "good" : b.status === "pending" ? "warn" : "danger";
                return (
                  <li key={b.id}>
                    <Flag tone={tone} icon={BadgeCheck}>
                      {b.badge_types?.name} · {expired ? "expired" : b.status}
                      {b.expires_at && !expired && b.status === "verified" ? ` until ${formatWhen(b.expires_at).split(" · ")[0]}` : ""}
                    </Flag>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm">No badges yet. Some machines and kits need training first; their cards tell you which.</p>
          )}
        </Panel>
      </div>

      {s.emergency.length > 0 && (
        <>
          <SectionTitle title="Emergency credit requests" description="One grant per academic year, decided by an Admin." />
          <Panel>
            <ul className="divide-y divide-line">
              {s.emergency.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <strong className="font-semibold">{e.amount} credits requested</strong>
                    <span className="text-ink-soft"> · {formatWhen(e.created_at)}</span>
                    {e.decision_reason && <span className="block text-ink-soft">{e.decision_reason}</span>}
                  </span>
                  <Flag tone={e.status === "pending" ? "warn" : e.status === "rejected" ? "danger" : "good"}>
                    {e.status === "partial" ? `Partly granted: ${e.granted_amount}` : sentence(e.status)}
                  </Flag>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}

      <SectionTitle title="Your credit story" description="Every allowance, hold, release and charge, newest first." />
      <Panel aria-labelledby="ledger-heading">
        <PanelHeading id="ledger-heading" title="Recent activity" aside={<span className="text-sm text-ink-soft">{s.ledger.length} entries</span>} />
        {s.ledger.length ? (
          <ul className="divide-y divide-line">
            {s.ledger.slice(0, 40).map((l) => {
              const k = KIND[l.kind];
              const resource = l.bookings?.resources?.name;
              return (
                <li key={l.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[36px_minmax(0,1fr)_auto_110px]">
                  <span className={cn("grid size-9 place-items-center rounded-[10px]", l.delta < 0 ? "bg-pending-bg text-pending-fg" : "bg-sage text-moss")}>
                    <k.icon aria-hidden className="size-4" />
                  </span>
                  <span className="grid min-w-0">
                    <strong className="truncate text-sm font-semibold">{resource ? `${resource} · ${k.label.toLowerCase()}` : k.label}</strong>
                    {l.note && <span className="truncate text-xs text-ink-soft">{l.note}</span>}
                    {l.booking_id && (
                      <Link href={`/student/bookings/${l.booking_id}`} className="w-fit text-xs font-semibold text-moss hover:underline">View booking</Link>
                    )}
                  </span>
                  <span className={cn("text-sm font-bold", l.delta < 0 ? "text-pending-fg" : "text-moss")}>{l.delta > 0 ? `+${l.delta}` : `−${-l.delta}`}</span>
                  <span className="hidden text-right text-xs text-ink-soft sm:block">{formatWhen(l.created_at)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={Coins} title="No credit activity yet.">
            Your weekly allowance arrives every Monday once your account is verified.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}
