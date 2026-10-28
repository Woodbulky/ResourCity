import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, ClipboardCheck, Coins, QrCode, Scale, ScanLine, Target, UserRound, Users } from "lucide-react";
import QRCode from "qrcode";
import { cn } from "cn";
import { Avatar } from "@/components/avatar";
import { BookingCard, studentNote, type BookingRow } from "@/components/booking-list";
import { formatWhen, sentence } from "@/components/format";
import { Timeline } from "@/components/timeline";
import { AckForm, CancelForm, CompleteReturnForm, DecisionForm } from "@/components/booking-forms";
import { StatusChip } from "@/components/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { ComingNext, Panel, PanelHeading } from "@/components/ui/kit";
import { ACTIVE_STATUSES } from "@/lib/contracts/booking";
import type { ScoreBreakdown } from "@/lib/domain/priority";
import { appNow } from "@/lib/server/clock";
import { bookingQrUrl } from "@/lib/server/requests";
import { createClient } from "@/lib/server/supabase";

const FIELDS =
  "id, status, start_at, end_at, created_at, waitlist_position, offer_expires_at, cutoff_at, status_reason, approver_role, credit_hold, credit_charged, priority_score, score_breakdown, allocation_rule, purpose_category, purpose_text, purpose_verified, is_exception, exception_reason, grace_minutes, picked_up_at, returned_at, user_id, resource_id, profiles!bookings_user_id_fkey(full_name, department, year, status), resources(name, category, location, organizations(name))" as const;

const FACTORS: [keyof Omit<ScoreBreakdown, "total">, string, number][] = [
  ["usage", "Recent usage", 40],
  ["allocations", "Previous allocations", 25],
  ["unsuccessful", "Unsuccessful requests", 20],
  ["purpose", "Verified purpose", 15],
];

const STAFF_NEXT: Partial<Record<string, string>> = {
  pending_approval: "Approve, or reject or waitlist with a reason the student will see.",
  approved: "Scan the student's QR at pickup, then record the checklist and guided photos together.",
  checked_out: "At return, scan again and record the same checklist and photos.",
  overdue: "Record the return when it comes back; a late penalty is proposed to the Manager.",
  returned: "Choose Return OK to settle credits, or raise damage for a Manager to decide.",
  under_review: "A Manager other than the reporter decides after the student's response window.",
};

export async function BookingDetail({ id, as }: { id: string; as: "student" | "owner" | "manager" }) {
  const supabase = await createClient();
  const [{ data: b }, { data: events }, { data: reports }, { data: cases }, { data: ledger }] = await Promise.all([
    supabase.from("bookings").select(FIELDS).eq("id", id).maybeSingle(),
    supabase
      .from("audit_events")
      .select("id, action, actor_role, reason, to_state, created_at")
      .eq("entity_type", "booking")
      .eq("entity_id", id)
      .order("created_at"),
    supabase.from("condition_reports").select("phase, checklist_results, photos, owner_signed_at, student_ack_at, ai_analysis").eq("booking_id", id),
    supabase.from("damage_cases").select("id, severity, status, description, student_response, response_deadline, outcome, decision_reason").eq("booking_id", id),
    as === "student"
      ? supabase.from("credit_ledger").select("id, delta, kind, created_at").eq("booking_id", id).order("created_at")
      : Promise.resolve({ data: null }),
  ]);
  if (!b) notFound();
  const now = await appNow();
  const staff = as !== "student";
  const [qr, photoUrls, history, competing] = await Promise.all([
    as === "student" ? bookingQrUrl(b) : null,
    signedPhotos(supabase, reports ?? []),
    staff
      ? Promise.all([
          supabase.from("bookings").select("status, end_at, returned_at").eq("user_id", b.user_id).neq("id", b.id),
          supabase.from("user_badges").select("badge_types(name)").eq("user_id", b.user_id).eq("status", "verified"),
        ])
      : null,
    staff
      ? supabase
          .from("bookings")
          .select("id, status, start_at, profiles!bookings_user_id_fkey(full_name)")
          .eq("resource_id", b.resource_id)
          .neq("id", b.id)
          .in("status", ACTIVE_STATUSES)
          .lt("start_at", b.end_at)
          .gt("end_at", b.start_at)
      : null,
  ]);
  const qrSvg = qr ? await QRCode.toString(qr.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : null;
  const past = history?.[0].data ?? [];
  const stats = [
    ["Completed", past.filter((x) => x.status === "completed").length],
    ["On time", past.filter((x) => x.status === "completed" && x.returned_at && x.returned_at <= x.end_at).length],
    ["No-shows", past.filter((x) => x.status === "no_show").length],
  ] as const;
  const toAck = (reports ?? []).filter((r) => r.owner_signed_at && !r.student_ack_at);
  const studentCanCancel =
    as === "student" &&
    (["pending_allocation", "pending_approval", "waitlisted", "offered"].includes(b.status) ||
      (b.status === "approved" && new Date(b.start_at) > now));

  const back = as === "student" ? { href: "/student/bookings", label: "My bookings" } : as === "owner" ? { href: "/owner/requests", label: "Requests" } : { href: "/manager/queue", label: "Decision queue" };
  const breakdown = b.score_breakdown as unknown as ScoreBreakdown | null;
  const person = b.profiles;
  const row = b as unknown as BookingRow;

  return (
    <>
      <Link href={back.href} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-moss hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> {back.label}
      </Link>
      <h1 className="sr-only">{b.resources?.name ?? "Booking"}</h1>
      <BookingCard
        href={`#timeline`}
        booking={row}
        person={as === "student" ? undefined : person?.full_name}
        note={as === "student" ? studentNote(row) : STAFF_NEXT[b.status] ?? b.status_reason ?? undefined}
        actions={<span className="font-mono text-xs text-ink-soft">#{b.id.slice(0, 8)}</span>}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {breakdown && (
            <Panel aria-labelledby="score-heading">
              <PanelHeading
                id="score-heading"
                title={`Priority score ${Math.round(breakdown.total)}/100`}
                description={`${b.allocation_rule ?? "Batch allocation"}. ${as === "student" ? "Only your own breakdown is ever shown." : "Shown to the student exactly like this."}`}
                aside={<Target aria-hidden className="size-5 text-moss" />}
              />
              <ul className="grid gap-3 p-5 sm:grid-cols-2">
                {FACTORS.map(([key, label, max]) => (
                  <li key={key}>
                    <div className="flex justify-between text-sm"><span>{label}</span><strong>{breakdown[key]}/{max}</strong></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash">
                      <span className="block h-full rounded-full bg-moss" style={{ width: `${(breakdown[key] / max) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel id="timeline" aria-labelledby="timeline-heading" className="scroll-mt-24">
            <PanelHeading id="timeline-heading" title="Timeline" description="Every step, who took it and why. This record cannot be edited." />
            <Timeline events={events ?? []} />
          </Panel>

          {!!reports?.length && (
            <Panel aria-labelledby="condition-heading">
              <PanelHeading id="condition-heading" title="Condition records" description="Checked out and returned with the same checklist and shots." />
              <div className="grid gap-4 p-5 md:grid-cols-2">
                {(["checkout", "return"] as const).map((phase) => {
                  const rep = reports.find((r) => r.phase === phase);
                  const items = (rep?.checklist_results ?? []) as { item: string; ok: boolean; note?: string }[];
                  const photos = (rep?.photos ?? []) as { shot: string; path: string }[];
                  return (
                    <div key={phase} className="rounded-xl border border-line p-4">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        {phase === "checkout" ? <ClipboardCheck aria-hidden className="size-4 text-moss" /> : <Camera aria-hidden className="size-4 text-moss" />}
                        {phase === "checkout" ? "At pickup" : "At return"}
                      </h3>
                      {rep ? (
                        <>
                          <ul className="mt-2 grid gap-1 text-sm">
                            {items.map((i) => (
                              <li key={i.item} className={cn(!i.ok && "font-semibold text-danger-fg")}>{i.ok ? "✓" : "!"} {i.item}{i.note ? ` — ${i.note}` : ""}</li>
                            ))}
                          </ul>
                          {photos.some((ph) => photoUrls[ph.path]) && (
                            <ul className="mt-3 grid grid-cols-3 gap-2">
                              {photos.map((ph) =>
                                photoUrls[ph.path] ? (
                                  <li key={ph.path}>
                                    <a href={photoUrls[ph.path]} target="_blank" rel="noreferrer" className="block">
                                      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                                      <img src={photoUrls[ph.path]} alt={ph.shot} className="aspect-square w-full rounded-lg border border-line object-cover" />
                                    </a>
                                    <span className="mt-0.5 block truncate text-[0.6875rem] text-ink-soft">{ph.shot}</span>
                                  </li>
                                ) : null,
                              )}
                            </ul>
                          )}
                          <p className="mt-2 text-xs text-ink-soft">
                            {photos.length} photo{photos.length === 1 ? "" : "s"} · Owner {rep.owner_signed_at ? "signed" : "not signed"} · student {rep.student_ack_at ? "acknowledged" : "not yet acknowledged"}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-ink-soft">Not recorded yet.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        <aside className="space-y-4">
          {qr && qrSvg && (
            <Panel aria-labelledby="qr-heading">
              <PanelHeading id="qr-heading" title={qr.phase === "pickup" ? "Pickup QR" : "Return QR"} aside={<QrCode aria-hidden className="size-5 text-moss" />} />
              <div className="grid justify-items-center gap-3 p-5 text-center">
                <div
                  role="img"
                  aria-label={`${qr.phase === "pickup" ? "Pickup" : "Return"} QR code`}
                  className="size-48 rounded-2xl border border-line bg-white p-2 [&_svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <p className="text-sm text-ink-soft">
                  Show this to the Owner.{" "}
                  {now < qr.validFrom ? <>It opens at <strong>{formatWhen(qr.validFrom)}</strong>.</> : <>Valid until <strong>{formatWhen(qr.validUntil)}</strong>.</>}
                </p>
                <details className="w-full text-left text-xs">
                  <summary className="cursor-pointer font-semibold text-moss">Can&apos;t scan? Show the code</summary>
                  <p className="mt-2 break-all rounded-lg bg-wash p-2 font-mono">{qr.url}</p>
                </details>
              </div>
            </Panel>
          )}

          {(studentCanCancel || (as === "student" && toAck.length > 0)) && (
            <Panel aria-labelledby="next-heading">
              <PanelHeading id="next-heading" title="Your next step" />
              <div className="grid gap-4 p-5 text-sm">
                {as === "student" &&
                  toAck.map((r) => (
                    <div key={r.phase} className="grid gap-2">
                      <p>The Owner signed the {r.phase === "checkout" ? "pickup" : "return"} condition record. Check it, then acknowledge it.</p>
                      <AckForm bookingId={b.id} phase={r.phase} />
                    </div>
                  ))}
                {studentCanCancel && (
                  <CancelForm
                    bookingId={b.id}
                    label={b.status === "approved" ? "I can't make it (free before the start, no strike)" : "Withdraw this request"}
                    defaultReason={b.status === "approved" ? "I can't make it" : "No longer needed"}
                  />
                )}
              </div>
            </Panel>
          )}

          {as !== "student" && person && (
            <Panel aria-labelledby="requester-heading">
              <PanelHeading id="requester-heading" title="Requester" aside={<UserRound aria-hidden className="size-5 text-moss" />} />
              <div className="flex items-center gap-3 p-5">
                <Avatar name={person.full_name} className="size-11" />
                <div>
                  <p className="font-semibold">{person.full_name}</p>
                  <p className="text-sm text-ink-soft">
                    {person.department ?? "Department not set"}
                    {person.year ? ` · Year ${person.year}` : ""} · {sentence(person.status)}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-3 border-t border-line text-center text-sm">
                {stats.map(([k, v]) => (
                  <div key={k} className="px-2 py-3">
                    <dt className="text-xs text-ink-soft">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              {!!history?.[1].data?.length && (
                <p className="border-t border-line px-5 py-3 text-sm">Badges: {history[1].data.map((x) => x.badge_types?.name).join(", ")}</p>
              )}
              <p className="border-t border-line px-5 py-2 text-xs text-ink-soft">History within your organisation.</p>
            </Panel>
          )}

          {staff && !!competing?.data?.length && (
            <Panel aria-labelledby="competing-heading">
              <PanelHeading
                id="competing-heading"
                title="Competing requests"
                description="Other active bookings overlapping this slot."
                aside={<Users aria-hidden className="size-5 text-moss" />}
              />
              <ul className="divide-y divide-line">
                {competing.data.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span>{c.profiles?.full_name ?? "Student"} · {formatWhen(c.start_at)}</span>
                    <StatusChip status={c.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel aria-labelledby="purpose-heading">
            <PanelHeading id="purpose-heading" title="Purpose" />
            <div className="space-y-2 p-5 text-sm">
              <p><span className="text-ink-soft">Category:</span> <strong className="font-semibold">{sentence(b.purpose_category)}</strong> {b.purpose_verified ? "· verified" : "· not verified"}</p>
              {b.purpose_text && <p className="rounded-lg bg-wash px-3 py-2">{b.purpose_text}</p>}
              {b.is_exception && <p className="rounded-lg bg-pending-bg px-3 py-2 text-pending-fg"><strong>Exception request:</strong> {b.exception_reason ?? "No reason given."}</p>}
              {b.status_reason && <p><span className="text-ink-soft">Decision reason:</span> {b.status_reason}</p>}
            </div>
          </Panel>

          <Panel aria-labelledby="credits-heading">
            <PanelHeading id="credits-heading" title="Credits" aside={<Coins aria-hidden className="size-5 text-moss" />} />
            <dl className="grid gap-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-ink-soft">Held</dt><dd className="font-semibold">{b.credit_hold}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Charged</dt><dd className="font-semibold">{b.credit_charged ?? "—"}</dd></div>
              {b.grace_minutes !== null && <div className="flex justify-between"><dt className="text-ink-soft">Pickup grace</dt><dd className="font-semibold">{b.grace_minutes} min</dd></div>}
              {b.picked_up_at && <div className="flex justify-between"><dt className="text-ink-soft">Picked up</dt><dd className="font-semibold">{formatWhen(b.picked_up_at)}</dd></div>}
              {b.returned_at && <div className="flex justify-between"><dt className="text-ink-soft">Returned</dt><dd className="font-semibold">{formatWhen(b.returned_at)}</dd></div>}
            </dl>
            {!!ledger?.length && (
              <ul className="border-t border-line px-5 py-3 text-sm">
                {ledger.map((l) => (
                  <li key={l.id} className="flex justify-between py-1">
                    <span>{sentence(l.kind)} · <span className="text-ink-soft">{formatWhen(l.created_at)}</span></span>
                    <strong className={l.delta < 0 ? "text-pending-fg" : "text-moss"}>{l.delta > 0 ? `+${l.delta}` : l.delta}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {!!cases?.length && (
            <Panel aria-labelledby="case-heading">
              <PanelHeading id="case-heading" title="Damage case" aside={<Scale aria-hidden className="size-5 text-pending-fg" />} />
              {cases.map((c) => (
                <div key={c.id} className="space-y-2 p-5 text-sm">
                  <p><strong className="font-semibold">{sentence(c.severity)}</strong> · {sentence(c.status)}</p>
                  <p className="text-ink-soft">{c.description}</p>
                  {c.student_response ? (
                    <p className="rounded-lg bg-wash px-3 py-2"><strong>Student response:</strong> {c.student_response}</p>
                  ) : (
                    <p className="text-ink-soft">Response window closes {formatWhen(c.response_deadline)}.</p>
                  )}
                  {c.outcome && <p><strong>Outcome:</strong> {sentence(c.outcome)} — {c.decision_reason}</p>}
                  {as === "student" && c.status === "awaiting_response" && <ComingNext phase={5}>Responding with text and photos.</ComingNext>}
                </div>
              ))}
            </Panel>
          )}

          {staff && STAFF_NEXT[b.status] && (
            <Panel aria-labelledby="decide-heading">
              <PanelHeading id="decide-heading" title="Your decision" description={STAFF_NEXT[b.status]} />
              <div className="grid gap-3 p-5">
                {b.status === "pending_approval" ? (
                  b.approver_role === "manager" && as === "owner" ? (
                    <p className="rounded-lg bg-pending-bg px-3 py-2 text-sm text-pending-fg">Waiting for Manager: this request needs the organisation Manager.</p>
                  ) : (
                    <DecisionForm bookingId={b.id} as={as} />
                  )
                ) : b.status === "approved" ? (
                  <Link href="/owner/scan" className={buttonVariants({ className: "w-fit" })}>
                    <ScanLine aria-hidden /> Scan pickup QR
                  </Link>
                ) : b.status === "checked_out" || b.status === "overdue" ? (
                  <Link href={`/${as}/bookings/${b.id}/handover?phase=return`} className={buttonVariants({ className: "w-fit" })}>
                    <Camera aria-hidden /> Record return
                  </Link>
                ) : b.status === "returned" ? (
                  <>
                    <CompleteReturnForm bookingId={b.id} as={as} />
                    <ComingNext phase={5}>Raise damage for a Manager to decide, with AI condition flags.</ComingNext>
                  </>
                ) : (
                  <ComingNext phase={5}>Dispute decisions with the student&apos;s response.</ComingNext>
                )}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

// Short-lived signed URLs for the condition photos this viewer may read (storage RLS decides).
async function signedPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reports: { photos: unknown }[],
): Promise<Record<string, string>> {
  const paths = reports.flatMap((r) => ((r.photos ?? []) as { path?: string }[]).flatMap((ph) => (ph.path ? [ph.path] : [])));
  if (!paths.length) return {};
  const { data } = await supabase.storage.from("condition-photos").createSignedUrls(paths, 600);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}
