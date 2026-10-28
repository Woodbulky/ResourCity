import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import {
  ArrowDown, ArrowRight, BadgeCheck, Building2, Camera, ChartColumn, CircleCheck, GraduationCap, ListOrdered, QrCode,
  Scale, ScrollText, Search, ShieldCheck, Sparkles, Undo2, Users, Wallet,
} from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Wordmark } from "@/components/brand";
import { ResourceCover } from "@/components/resource-cover";
import { Button, buttonVariants } from "@/components/ui/button";
import { APP_TIMEZONE, istInstant, minutesBetween } from "@/lib/domain/time";
import { signInWithGoogle } from "@/lib/server/account";
import { appNow } from "@/lib/server/clock";
import { createServiceClient } from "@/lib/server/supabase";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const STEPS = [
  { icon: Search, title: "Find your fit", text: "Search the campus shelf and see whether you qualify, and why, before you ask." },
  { icon: ScrollText, title: "Make a request", text: "Pick a slot and see the credit cost, approval path and no-show rule up front." },
  { icon: QrCode, title: "QR pickup", text: "The Owner scans your QR and you both sign off guided condition photos." },
  { icon: Undo2, title: "Return and pass it on", text: "Same photos at return, credits settled, and the full record in your timeline." },
];

const TRUST = [
  { icon: BadgeCheck, title: "Eligibility before you request", text: "Badges, department rules and credits are checked on every card." },
  { icon: ChartColumn, title: "Explainable allocation", text: "Busy slots go by a published 100-point score, not the fastest click." },
  { icon: Wallet, title: "Credits stop monopolies", text: "100 free credits a week. No cash value, no buying, no transfers." },
  { icon: Camera, title: "Two-party condition records", text: "Guided photos at pickup and return, acknowledged by both sides." },
  { icon: Scale, title: "Humans decide disputes", text: "AI can flag a difference. A Manager decides, after the student replies." },
  { icon: ShieldCheck, title: "Append-only audit trail", text: "Every consequential action keeps an actor, a reason and a time." },
];

const ROLES = [
  { icon: GraduationCap, title: "Students", tag: "Find. Borrow. Create.", tone: "bg-leaf/10 text-[#d1ef9a]" },
  { icon: Building2, title: "Owners", tag: "List. Lend. Hand over by QR.", tone: "bg-[#eebf90]/10 text-[#ebc39a]" },
  { icon: Scale, title: "Managers", tag: "Approve. Review. Keep it fair.", tone: "bg-[#c2c4e9]/10 text-[#d4d5fa]" },
  { icon: Users, title: "Admins", tag: "Verify. Grant roles. Version policy.", tone: "bg-[#9dcfc2]/10 text-[#a9dfcd]" },
];

const SHARED = ["Seminar halls", "Labs & workshops", "Cameras & media", "Courts & grounds", "Machines", "Laptops & GPUs"];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip bg-cream">
      <header className="mx-auto flex h-[76px] w-[min(100%-32px,1280px)] items-center justify-between border-b border-ink/10">
        <Link href="/" aria-label="ResourCity home" className="rounded-md">
          <Wordmark />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-8 text-sm text-ink-soft md:flex">
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#what-we-share" className="hover:text-ink">What we share</a>
          <a href="#fair" className="hover:text-ink">Fair by design</a>
          <a href="#for-everyone" className="hover:text-ink">For everyone</a>
        </nav>
        <Link href="/login" className={buttonVariants({ size: "sm" })}>
          Sign in <ArrowRight aria-hidden />
        </Link>
      </header>

      <main id="main" className="mx-auto w-[min(100%-32px,1280px)]">
        <section className="grid items-center gap-10 py-12 md:min-h-[560px] md:grid-cols-2 md:py-14">
          <div className="max-w-xl">
            <p className="eyebrow flex items-center gap-2">
              <span className="grid size-5 place-items-center rounded-full bg-sage text-moss"><Sparkles aria-hidden className="size-3" /></span>
              Made for Deccan Valley
            </p>
            <h1 className="display mt-6 text-[clamp(3.6rem,8vw,6.5rem)] leading-[0.82] tracking-[-0.055em]">
              More campus.
              <br />
              <em>More possible.</em>
            </h1>
            <p className="mt-7 max-w-md text-base leading-relaxed text-ink-soft">
              Unlock your campus&apos;s idle equipment and spaces. Clubs, labs and departments lend what sits unused to
              verified students, with fair allocation, credit limits and QR handovers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <form action={signInWithGoogle}>
                <Button type="submit" variant="lime" size="lg">
                  Continue with Google <ArrowRight aria-hidden />
                </Button>
              </form>
              {DEMO_MODE ? (
                <Link href="/login#demo" className={buttonVariants({ variant: "outline", size: "lg" })}>
                  Try the demo
                </Link>
              ) : (
                <a href="#how-it-works" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink">
                  See how it works <ArrowDown aria-hidden className="size-4" />
                </a>
              )}
            </div>
            <div className="mt-10 flex items-center gap-3 text-sm leading-snug text-ink-soft">
              <span className="flex">
                {["Photography Club", "Makerspace", "ECE Department"].map((n) => (
                  <Avatar key={n} name={n} className="-ml-1.5 size-8 border-cream first:ml-0" />
                ))}
              </span>
              Shared by the clubs, labs and departments
              <br className="hidden sm:block" /> that make this campus feel like yours.
            </div>
          </div>
          <HeroVisual />
        </section>

        <div className="flex min-h-14 flex-wrap items-center justify-center gap-x-5 gap-y-2 border-y border-line py-3 text-sm text-ink-soft sm:justify-between">
          <span className="eyebrow text-moss">Your campus, more open</span>
          <Dot /> <span>Borrow with care.</span> <Dot /> <span>Share with everyone.</span> <Dot />
          <span className="hidden sm:inline">Built for Deccan Valley Institute of Technology</span>
        </div>

        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-6 py-20">
          <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Simple by design</p>
              <h2 id="how-heading" className="display mt-3 text-[clamp(2.5rem,5vw,3.6rem)]">
                From &ldquo;I need one&rdquo;
                <br />
                to <em>&ldquo;here you go.&rdquo;</em>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-ink-soft">
              One loop runs the whole product. Every step is clear before you take it, and recorded after.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="lift rounded-[var(--radius-card)] border border-line bg-paper/70 p-5">
                <div className="flex items-center justify-between text-sm text-ink-soft">
                  <span className="font-mono">0{i + 1}</span>
                  <span className="grid size-9 place-items-center rounded-[10px] bg-wash text-moss"><Icon aria-hidden className="size-4" /></span>
                </div>
                <h3 className="mt-6 font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="what-we-share" aria-labelledby="share-heading" className="grid scroll-mt-6 items-center gap-10 rounded-[18px] border border-line bg-[#ecefe3] px-6 py-10 md:grid-cols-[1fr_0.85fr] md:px-12 md:py-14">
          <div aria-hidden className="relative min-h-72">
            <ResourceCover category="seminar_hall" className="absolute left-0 top-2 h-56 w-[62%] -rotate-3 rounded-xl border-[6px] border-paper shadow-card" />
            <ResourceCover category="sports_ground" className="absolute bottom-0 right-0 h-56 w-[62%] rotate-3 rounded-xl border-[6px] border-paper shadow-card" />
            <span className="absolute left-[40%] top-[42%] z-10 grid size-24 -rotate-12 place-items-center rounded-full border border-white/80 bg-pine text-center font-serif text-sm leading-tight text-[#e7f3d5]">
              GOOD THINGS
              <br />
              GO FURTHER
            </span>
          </div>
          <div className="max-w-md">
            <p className="eyebrow">A campus has more than one story</p>
            <h2 id="share-heading" className="display mt-3 text-[clamp(2.5rem,5vw,3.6rem)]">
              Not just stuff.
              <br />
              <em>Possibility.</em>
            </h2>
            <p className="my-5 text-sm leading-relaxed text-ink-soft">
              The hall that brings people together. The machine that gets a project moving. The camera that catches the
              moment. Owners list what sits idle; students see exactly what they can borrow and when.
            </p>
            <ul className="mb-6 flex flex-wrap gap-2">
              {SHARED.map((s) => (
                <li key={s} className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-soft">{s}</li>
              ))}
            </ul>
            <Link href="/login" className={buttonVariants()}>
              See what&apos;s on campus <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>

        <section id="fair" aria-labelledby="fair-heading" className="scroll-mt-6 py-20">
          <div className="mb-8 max-w-2xl">
            <p className="eyebrow">Trust and fairness</p>
            <h2 id="fair-heading" className="display mt-3 text-[clamp(2.5rem,5vw,3.6rem)]">
              Fair, safe and <em>accountable.</em>
            </h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-[var(--radius-card)] border border-line bg-paper p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-moss"><Icon aria-hidden className="size-5" /></span>
                <span>
                  <strong className="block font-semibold">{title}</strong>
                  <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="stats-heading" className="rounded-[18px] border border-line bg-paper px-6 py-10 md:px-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="eyebrow">Live from the campus shelf</p>
              <h2 id="stats-heading" className="display mt-3 text-4xl">Already in motion.</h2>
            </div>
            <Suspense fallback={<StatsGrid stats={null} />}>
              <LiveStats />
            </Suspense>
          </div>
        </section>

        <section id="for-everyone" aria-labelledby="everyone-heading" className="on-dark mb-6 mt-16 scroll-mt-6 rounded-[18px] bg-pine-deep px-5 py-12 text-center text-[#f4f4e9] md:px-12">
          <p className="eyebrow justify-center text-[#b8ceac]">One campus, many hands</p>
          <h2 id="everyone-heading" className="display mt-3 text-[clamp(2.5rem,5vw,3.6rem)] text-[#f8f7ed]">
            Sharing works better
            <br />
            <em>when everyone&apos;s in.</em>
          </h2>
          <p className="mx-auto mb-8 mt-4 max-w-lg text-sm leading-relaxed text-[#c3d0c6]">
            Students find what they need. Owners bring quiet resources back to life. Managers keep decisions fair. Admins
            build trust into the whole system.
          </p>
          <ul className="mx-auto mb-8 grid max-w-3xl grid-cols-2 md:grid-cols-4">
            {ROLES.map(({ icon: Icon, title, tag, tone }) => (
              <li key={title} className="grid justify-items-center gap-1.5 border-white/10 p-4 max-md:[&:nth-child(-n+2)]:border-b md:border-r md:last:border-r-0 max-md:odd:border-r">
                <span className={`mb-1 grid size-10 place-items-center rounded-xl ${tone}`}><Icon aria-hidden className="size-5" /></span>
                <strong className="text-sm font-semibold">{title}</strong>
                <small className="text-xs text-[#a9bdae]">{tag}</small>
              </li>
            ))}
          </ul>
          {DEMO_MODE ? (
            <Link href="/login#demo" className={buttonVariants({ variant: "lime", size: "lg" })}>
              Step into the demo campus <ArrowRight aria-hidden />
            </Link>
          ) : (
            <form action={signInWithGoogle}>
              <Button type="submit" variant="lime" size="lg">Continue with Google <ArrowRight aria-hidden /></Button>
            </form>
          )}
        </section>
      </main>

      <footer className="mx-auto flex min-h-20 w-[min(100%-32px,1280px)] flex-wrap items-center justify-between gap-4 py-4 text-xs text-ink-soft">
        <Wordmark className="scale-90" />
        <span>Fictional demo campus: Deccan Valley Institute of Technology, Pune. All demo data is made up.</span>
        <a className="font-semibold text-moss underline-offset-4 hover:underline" href="https://github.com/Woodbulky/ResourCity">
          GitHub
        </a>
      </footer>
    </div>
  );
}

const Dot = () => <i aria-hidden className="size-1 rounded-full bg-line-strong" />;

// A glimpse of the product instead of a stock photo: an eligible card, a waitlist score, a handover.
function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto min-h-[440px] w-full max-w-[520px] sm:min-h-[480px]">
      <span className="absolute right-0 top-0 -z-0 size-80 rounded-full border border-moss/20" />
      <span className="absolute -bottom-4 -right-10 size-56 rounded-full border border-[#dc9c61]/30" />
      <div className="absolute inset-x-6 bottom-6 top-8 overflow-hidden rounded-[48%_48%_18px_18px] border-[7px] border-paper bg-pine shadow-[0_24px_60px_rgba(34,58,43,0.16)] sm:inset-x-12">
        <span className="absolute -right-16 -top-20 size-72 rounded-full border border-leaf/20 shadow-[0_0_0_28px_rgba(191,232,121,0.05),0_0_0_58px_rgba(191,232,121,0.035)]" />
        <div className="absolute inset-x-5 bottom-14 rounded-2xl bg-paper p-3 shadow-pop">
          <ResourceCover category="media" className="h-28 rounded-xl" />
          <div className="mt-3 flex items-start justify-between gap-2 px-1">
            <div>
              <p className="text-sm font-semibold text-ink">DSLR camera kit</p>
              <p className="text-xs text-ink-soft">Photography Club · B-104</p>
            </div>
            <span className="text-xs font-bold text-moss">10 / day</span>
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-sage px-2.5 py-2 text-xs font-semibold text-sage-strong">
            <CircleCheck className="size-3.5" /> Eligible · Photography Basics verified
          </p>
        </div>
        <p className="absolute inset-x-0 top-[13%] text-center max-sm:hidden text-[0.6875rem] font-bold tracking-[0.17em] text-[#d2ecaa]">A NEW IDEA, READY TO GO</p>
      </div>
      <div className="pop-in absolute right-0 top-20 flex items-center gap-2.5 rounded-xl border border-white/80 bg-paper/95 px-3.5 py-2.5 shadow-card backdrop-blur">
        <span className="grid size-8 place-items-center rounded-lg bg-info-bg text-info-fg"><ListOrdered className="size-4" /></span>
        <span className="grid">
          <strong className="text-xs font-semibold text-ink">Waitlisted #2 · 72/100</strong>
          <small className="text-xs text-ink-soft">Score breakdown always visible</small>
        </span>
      </div>
      <div className="pop-in absolute bottom-0 left-0 flex items-center gap-2.5 rounded-xl border border-white/80 bg-paper/95 px-3.5 py-2.5 shadow-card backdrop-blur [animation-delay:120ms]">
        <span className="grid size-8 place-items-center rounded-lg bg-sage text-moss"><QrCode className="size-4" /></span>
        <span className="grid">
          <strong className="text-xs font-semibold text-ink">Handover signed by both</strong>
          <small className="text-xs text-ink-soft">4 guided condition photos</small>
        </span>
      </div>
    </div>
  );
}

// Aggregate counts only, no personal data, so the service client is safe here.
async function getStats() {
  "use cache";
  cacheLife("minutes");
  // The landing page must never fail because the database is unreachable.
  try {
    return await readStats();
  } catch {
    return null;
  }
}

async function readStats() {
  const supabase = createServiceClient();
  const now = await appNow();
  const monthStart = istInstant(formatInTimeZone(now, APP_TIMEZONE, "yyyy-MM-01"), "00:00");
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [{ count: listed }, { data: used }, { data: recent }] = await Promise.all([
    supabase.from("resources").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("bookings")
      .select("picked_up_at, returned_at")
      .eq("status", "completed")
      .gte("picked_up_at", monthStart.toISOString()),
    supabase
      .from("bookings")
      .select("resource_id, resources!inner(estimated_current_usage)")
      .in("status", ["completed", "checked_out", "overdue"])
      .eq("resources.estimated_current_usage", "rarely")
      .gte("start_at", since30.toISOString()),
  ]);
  const minutes = (used ?? []).reduce(
    (sum, b) => sum + (b.picked_up_at && b.returned_at ? minutesBetween(new Date(b.picked_up_at), new Date(b.returned_at)) : 0),
    0,
  );
  return {
    listed: listed ?? 0,
    hours: Math.round(minutes / 60),
    idleNowUsed: new Set((recent ?? []).map((r) => r.resource_id)).size,
  };
}

async function LiveStats() {
  return <StatsGrid stats={await getStats()} />;
}

function StatsGrid({ stats }: { stats: Awaited<ReturnType<typeof readStats>> | null }) {
  const items = [
    [stats?.listed, "resources listed"],
    [stats?.hours, "hours shared this month"],
    [stats?.idleNowUsed, "rarely used resources now in use"],
  ] as const;
  return (
    <dl className="grid grid-cols-3 gap-6 md:gap-12">
      {items.map(([value, label]) => (
        <div key={label} className="flex min-w-0 flex-col-reverse">
          <dt className="mt-1 text-xs text-ink-soft sm:text-sm">{label}</dt>
          <dd className="display text-5xl text-pine">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
