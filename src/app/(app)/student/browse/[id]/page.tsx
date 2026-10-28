import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Ban, CalendarClock, Camera, CircleAlert, CircleCheck, ClipboardCheck, HardHat, MapPin, ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "cn";
import { RequestForm } from "@/components/booking-forms";
import { CARD_STATES } from "@/components/resource-card";
import { CATEGORIES } from "@/components/category";
import { formatSlot, formatWhen, rateLabel, sentence } from "@/components/format";
import { ResourceCover } from "@/components/resource-cover";
import { Button } from "@/components/ui/button";
import { field, Flag, Panel, PanelHeading } from "@/components/ui/kit";
import { checklistSchema, safetyRulesSchema } from "@/lib/contracts/resource";
import type { CheckKey, CheckResult } from "@/lib/domain/eligibility";
import { APP_TIMEZONE, istDate } from "@/lib/domain/time";
import { evaluateRequest, parseSlot, type RequestEvaluation, type SlotInput as SlotFields } from "@/lib/server/requests";
import { createClient } from "@/lib/server/supabase";
import { approvalLine, catalog, studentSnapshot } from "@/lib/server/student";
import { requireViewer } from "@/lib/server/viewer";

const CHECK_LABELS: Record<CheckKey, string> = {
  account_verified: "Account verified",
  not_suspended: "Booking privileges",
  badges: "Training badges",
  restricted_access: "Access rules",
  max_active: "Active bookings",
  max_duration: "Booking length",
  credits: "Credits for the shortest slot",
  no_show_strikes: "No-show record",
  slot_available: "Slot available",
};
const RESULT: Record<CheckResult, { icon: LucideIcon; cls: string; word: string }> = {
  pass: { icon: CircleCheck, cls: "text-moss", word: "Pass" },
  review: { icon: CircleAlert, cls: "text-pending-fg", word: "Needs review" },
  block: { icon: Ban, cls: "text-danger-fg", word: "Blocked" },
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h! + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! < 12 ? "am" : "pm"}`;
};
const minutesLabel = (m: number) => (m % 1440 === 0 ? `${m / 1440} day${m === 1440 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`);

const ordinal = (n: number) => `${n}${(n % 100 > 10 && n % 100 < 14) ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

function fieldValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ResourcePage({ params, searchParams }: PageProps<"/student/browse/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer();
  const [entries, snap] = await Promise.all([catalog(viewer, { resourceId: id }), studentSnapshot(viewer)]);
  const r = entries[0];
  if (!r) notFound();

  // The slot picker is a plain GET form, so the summary below is always computed on the server.
  const IST_OFFSET = 330 * 60_000; // whole hours in campus time, not UTC (IST is UTC+5:30)
  const nextHour = new Date(Math.ceil((snap.now.getTime() + IST_OFFSET) / 3_600_000) * 3_600_000 - IST_OFFSET);
  const defaultEnd = addMinutes(nextHour, r.rateUnit === "day" ? 24 * 60 : 60);
  const slotInput = {
    startDate: one(sp.start_date) ?? istDate(nextHour),
    startTime: one(sp.start_time) ?? formatInTimeZone(nextHour, APP_TIMEZONE, "HH:mm"),
    endDate: one(sp.end_date) ?? istDate(defaultEnd),
    endTime: one(sp.end_time) ?? formatInTimeZone(defaultEnd, APP_TIMEZONE, "HH:mm"),
  };
  const picked = one(sp.start_date) ? parseSlot(slotInput) : null;
  const ev = picked ? await evaluateRequest(viewer, id, picked) : null;
  const shownChecks = ev && !ev.problem ? ev.checks : r.checks;

  const supabase = await createClient();
  const [{ data: extra }, { data: windows }, { data: blackouts }] = await Promise.all([
    supabase
      .from("resources")
      .select("category_fields, checklist, safety_rules, peak_multiplier, batch_cutoff_hours, replacement_value")
      .eq("id", id)
      .single(),
    supabase.from("availability_windows").select("weekday, start_time, end_time").eq("resource_id", id).order("weekday"),
    supabase
      .from("blackouts")
      .select("starts_at, ends_at, reason")
      .eq("resource_id", id)
      .gte("ends_at", snap.now.toISOString())
      .order("starts_at")
      .limit(3),
  ]);
  const checklist = checklistSchema.safeParse(extra?.checklist).data ?? { items: [], shots: [] };
  const safety = safetyRulesSchema.safeParse(extra?.safety_rules).data ?? safetyRulesSchema.parse({});
  const fields = Object.entries((extra?.category_fields ?? {}) as Record<string, unknown>);
  const state = CARD_STATES[r.state];
  const canRequest = r.state === "eligible" || r.state === "eligible_approval";
  const fix = r.checks.find((c) => c.result === "block" && c.fix)?.fix;
  const unavailable = r.status !== "active";

  const rules: [string, string][] = [
    ["Approval", approvalLine(r.approvalMode, r.allocationMode)],
    ...(r.allocationMode === "batch"
      ? [["Allocation", `Requests are scored ${extra?.batch_cutoff_hours ?? 24} h before the slot, then filled by score`] as [string, string]]
      : []),
    ...(r.rules.max_duration_minutes ? [["Longest booking", minutesLabel(r.rules.max_duration_minutes)] as [string, string]] : []),
    ...(r.rules.max_active_bookings ? [["Active bookings", `Up to ${r.rules.max_active_bookings} at a time`] as [string, string]] : []),
    ["Cancellation", r.rules.cancellation_window_minutes ? `Free until ${minutesLabel(r.rules.cancellation_window_minutes)} before` : "Free until the slot starts"],
    ...(r.rules.peak_window
      ? [["Peak hours", `${hm(r.rules.peak_window.start)}–${hm(r.rules.peak_window.end)} cost ${Number(extra?.peak_multiplier ?? 1.5)}×`] as [string, string]]
      : []),
    ...(safety.supervision_required ? [["Supervision", "A supervisor is present at handover"] as [string, string]] : []),
  ];

  return (
    <>
      <Link href="/student/browse" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-moss hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> All resources
      </Link>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <section className="grid overflow-hidden rounded-[18px] border border-line bg-paper md:grid-cols-[0.9fr_1.1fr]">
            <ResourceCover category={r.category} className="min-h-56 md:min-h-full" />
            <div className="p-6">
              <p className="eyebrow">{CATEGORIES[r.category].label} · {r.orgName}</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <h1 className="display text-5xl">{r.name}</h1>
                <span className="mt-2 text-base font-bold text-moss">{rateLabel(r.baseRate, r.rateUnit)}</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-soft">
                <MapPin aria-hidden className="size-4" /> {r.location}
                {r.quantity > 1 && <> · {r.quantity} units</>}
              </p>
              {r.description && <p className="mt-4 text-[0.9375rem] leading-relaxed text-ink-soft">{r.description}</p>}
              {fields.length > 0 && (
                <dl className="mt-5 flex flex-wrap gap-2">
                  {fields.map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-line px-3 py-1.5 text-sm">
                      <dt className="inline text-ink-soft">{sentence(k)}: </dt>
                      <dd className="inline font-medium">{fieldValue(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>

          <Panel aria-labelledby="eligibility-heading">
            <PanelHeading
              id="eligibility-heading"
              title="Before you request"
              description={
                ev && !ev.problem
                  ? `Checked for ${formatSlot(picked!.start, picked!.end)} against your account right now.`
                  : "Checked against your account right now. Availability and cost are checked when you pick a slot."
              }
              aside={<Flag tone={state.tone} icon={state.icon}>{state.label}</Flag>}
            />
            <ul className="divide-y divide-line">
              {shownChecks.map((c) => {
                const res = RESULT[c.result];
                return (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-3">
                    <res.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", res.cls)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {c.key === "credits" && ev ? "Credits" : CHECK_LABELS[c.key]} <span className="sr-only">: {res.word}</span>
                      </p>
                      {c.reason && <p className="text-sm text-ink-soft">{c.reason}</p>}
                      {c.result !== "pass" && c.fix && (
                        <p className="mt-0.5 text-sm font-medium text-ink">
                          What to do:{" "}
                          {c.key === "credits" ? (
                            <Link href="/student/wallet#emergency" className="text-moss underline">{c.fix}</Link>
                          ) : c.fix.startsWith("/") ? "finish verification" : c.fix}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel aria-labelledby="rules-heading">
              <PanelHeading id="rules-heading" title="How booking works here" />
              <dl className="divide-y divide-line">
                {rules.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[130px_1fr] gap-3 px-5 py-3 text-sm">
                    <dt className="text-ink-soft">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel aria-labelledby="availability-heading">
              <PanelHeading id="availability-heading" title="Bookable hours" description="Campus time (IST)" />
              {windows?.length ? (
                <ul className="divide-y divide-line">
                  {windows.map((w) => (
                    <li key={`${w.weekday}-${w.start_time}`} className="flex justify-between px-5 py-2.5 text-sm">
                      <span className="font-medium">{WEEKDAYS[w.weekday]}</span>
                      <span className="text-ink-soft">{hm(w.start_time)}–{hm(w.end_time)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-soft">
                  <CalendarClock aria-hidden className="size-4" /> Open any time unless a closure is listed.
                </p>
              )}
              {!!blackouts?.length && (
                <ul className="border-t border-line px-5 py-3 text-sm">
                  {blackouts.map((b) => (
                    <li key={b.starts_at} className="text-danger-fg">
                      Closed {formatWhen(b.starts_at)} – {formatWhen(b.ends_at)}: {b.reason}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {(checklist.items.length > 0 || checklist.shots.length > 0 || safety.ppe.length > 0 || safety.safety_notes) && (
            <Panel aria-labelledby="condition-heading">
              <PanelHeading
                id="condition-heading"
                title="Condition record at pickup and return"
                description="You and the Owner check these together, then you acknowledge the record in the app."
              />
              <div className="grid gap-5 p-5 md:grid-cols-2">
                {checklist.items.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ClipboardCheck aria-hidden className="size-4 text-moss" /> Checklist</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {checklist.items.map((i) => <li key={i} className="rounded-md bg-wash px-2 py-1 text-sm">{i}</li>)}
                    </ul>
                  </div>
                )}
                {checklist.shots.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Camera aria-hidden className="size-4 text-moss" /> Guided photos</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {checklist.shots.map((s) => <li key={s} className="rounded-md bg-wash px-2 py-1 text-sm">{s}</li>)}
                    </ul>
                  </div>
                )}
                {(safety.ppe.length > 0 || safety.safety_notes) && (
                  <div className="md:col-span-2">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><HardHat aria-hidden className="size-4 text-pending-fg" /> Safety</h3>
                    {safety.ppe.length > 0 && <p className="text-sm">Wear: {safety.ppe.join(", ")}</p>}
                    {safety.safety_notes && <p className="mt-1 text-sm text-ink-soft">{safety.safety_notes}</p>}
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>

        <aside aria-labelledby="request-heading" className="h-fit space-y-4 xl:sticky xl:top-24">
          <Panel className="rings relative bg-sage text-moss [--ring-right:-80px] [--ring-size:220px] [--ring-top:-110px]">
            <div className="relative p-5 text-ink">
              <p className="eyebrow text-moss">Request summary</p>
              <h2 id="request-heading" className="display mt-2 text-4xl">
                {r.baseRate === 0 ? "Free to book" : <>{r.baseRate} <small className="font-sans text-base text-ink-soft">credits / {r.rateUnit}</small></>}
              </h2>
              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between"><dt className="text-ink-soft">Your available credits</dt><dd className="font-semibold">{snap.available}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">Held only once approved</dt><dd className="font-semibold">Yes</dd></div>
                <div className="flex justify-between"><dt className="text-ink-soft">No-shows (30 days)</dt><dd className="font-semibold">{snap.strikes} of {snap.policy.values.strikes.limit}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-relaxed text-ink-soft">
                Pick-up grace is {Math.round(snap.policy.values.grace.percent * 100)}% of the slot ({snap.policy.values.grace.min_minutes} min to{" "}
                {minutesLabel(snap.policy.values.grace.max_minutes)}). A {ordinal(snap.policy.values.strikes.limit + 1)} no-show in{" "}
                {snap.policy.values.strikes.window_days} days forfeits the hold. &ldquo;I can&apos;t make it&rdquo; before the start is always free.
              </p>
              <div className="mt-5 grid gap-3">
                {unavailable ? (
                  <p className="rounded-lg bg-neutral-bg px-3 py-2 text-sm font-semibold text-neutral-fg">
                    {r.status === "unsafe" ? "Marked unsafe while a Manager reviews it." : `Currently ${r.status.replaceAll("_", " ")}.`}
                  </p>
                ) : canRequest ? (
                  <>
                    <form method="get" className="grid gap-2 rounded-xl bg-paper p-3" aria-label="Pick a slot">
                      <p className="text-sm font-semibold">Pick a slot <span className="font-normal text-ink-soft">(campus time)</span></p>
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <label className="sr-only" htmlFor="start_date">Start date</label>
                        <input id="start_date" name="start_date" type="date" required defaultValue={slotInput.startDate} className={field} />
                        <label className="sr-only" htmlFor="start_time">Start time</label>
                        <input id="start_time" name="start_time" type="time" required step={900} defaultValue={slotInput.startTime} className={field} />
                        <label className="sr-only" htmlFor="end_date">End date</label>
                        <input id="end_date" name="end_date" type="date" required defaultValue={slotInput.endDate} className={field} />
                        <label className="sr-only" htmlFor="end_time">End time</label>
                        <input id="end_time" name="end_time" type="time" required step={900} defaultValue={slotInput.endTime} className={field} />
                      </div>
                      <Button type="submit" variant="outline"><CalendarClock aria-hidden /> Check this slot</Button>
                    </form>
                    {picked === null && one(sp.start_date) && <p role="alert" className="text-sm font-semibold text-danger-fg">Enter a valid start and end.</p>}
                    {ev?.problem && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{ev.problem}</p>}
                    {ev && !ev.problem && <RequestSummary ev={ev} slot={slotInput} resourceId={id} />}
                  </>
                ) : (
                  <p className="rounded-lg bg-paper px-3 py-2 text-sm">
                    <strong className="font-semibold">{state.label}.</strong> {fix && !fix.startsWith("/") ? fix : r.headline}
                  </p>
                )}
                {fix === "/pending" && (
                  <Link href="/pending" className="text-sm font-semibold text-moss hover:underline">See your verification status →</Link>
                )}
              </div>
            </div>
          </Panel>
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-ink-soft">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-moss" />
            Busy resources are allocated by a published score, never by who clicked first. You always see your own breakdown.
          </p>
        </aside>
      </div>
    </>
  );
}

const LANDS: Record<string, (ev: RequestEvaluation) => string> = {
  submit_auto: () => "Approved instantly; credits are held now",
  submit_approval: (ev) => (ev.plan.ok && ev.plan.plan.approverRole === "manager" ? "Goes to the organisation Manager" : "Goes to the Owner for approval"),
  submit_waitlist: () => "Every unit is taken, so you join the waitlist",
  submit_batch: (ev) => `Scored with every request at ${ev.cutoffAt ? formatWhen(ev.cutoffAt) : "the cutoff"}`,
};

// Request summary before submit (PRD 7): cost, hold, balance after hold, approval path, allocation
// and cutoff, grace and the no-show rule.
function RequestSummary({ ev, slot, resourceId }: { ev: RequestEvaluation; slot: SlotFields; resourceId: string }) {
  if (!ev.plan.ok)
    return <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{ev.plan.error}</p>;
  const { plan } = ev.plan;
  const holdsNow = plan.event === "submit_auto";
  const rows: [string, string][] = [
    ["Credit cost", ev.cost === 0 ? "Free" : `${ev.cost} credits`],
    ["Held", holdsNow ? `${ev.cost} now` : `${ev.cost} once approved`],
    ["Balance after hold", `${ev.available - ev.cost} of ${ev.available}`],
    ["What happens", LANDS[plan.event]!(ev)],
    ["Pickup grace", `${ev.grace} min after the start`],
  ];
  const strikes = ev.policy.values.strikes;
  return (
    <div className="grid gap-3">
      <dl className="grid gap-2 rounded-xl bg-paper p-3 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-ink-soft">
        Not collected within the grace period counts as a no-show. A {ordinal(strikes.limit + 1)} no-show in {strikes.window_days} days forfeits the hold.
      </p>
      <RequestForm
        resourceId={resourceId}
        slot={slot}
        exception={plan.isException}
        submitLabel={plan.isException ? "Request exception" : plan.event === "submit_waitlist" ? "Join waitlist" : plan.event === "submit_auto" ? "Book now" : "Send request"}
      />
    </div>
  );
}
