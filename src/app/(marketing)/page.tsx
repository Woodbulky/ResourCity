import { Suspense } from "react";
import Link from "next/link";
import { cacheLife } from "next/cache";
import {
  Building2, Camera, GraduationCap, QrCode, Scale, ScrollText, Search, ShieldCheck, Undo2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE, istInstant, minutesBetween } from "@/lib/domain/time";
import { signInWithGoogle } from "@/lib/server/account";
import { appNow } from "@/lib/server/clock";
import { createServiceClient } from "@/lib/server/supabase";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const STEPS = [
  { icon: Search, title: "Find and check eligibility", text: "See whether you qualify, and why, before you request." },
  { icon: ScrollText, title: "Request", text: "Credits are held, busy slots are allocated by a published score." },
  { icon: QrCode, title: "QR pickup", text: "The owner scans your QR and records guided condition photos with you." },
  { icon: Undo2, title: "Return", text: "Same photos at return, credits settled, the full record in your timeline." },
];

const ROLES = [
  { icon: GraduationCap, title: "Students", text: "Borrow cameras, labs, courts and halls with 100 credits a week." },
  { icon: Building2, title: "Owners", text: "Clubs and labs list what sits idle and hand it over by QR." },
  { icon: Scale, title: "Managers", text: "Faculty approve restricted requests and decide disputes after hearing the student." },
  { icon: Users, title: "Admins", text: "Verify students, grant roles and version every policy change." },
];

const TRUST = [
  "Eligibility shown before you request",
  "Explainable 100-point allocation score",
  "Weekly credits stop monopolies",
  "Two-party condition records with photos",
  "AI flags, humans decide disputes",
  "Append-only audit trail",
];

export default function LandingPage() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <section className="bg-evergreen px-6 py-20 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="font-mono text-sm text-spring">ResourCity</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Unlock your campus&apos;s idle equipment and spaces.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-mist">
            Departments, labs and clubs lend what sits unused to verified students, with fair allocation, credit
            limits, QR handovers and a record nobody can edit.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <form action={signInWithGoogle}>
              <Button type="submit" size="lg" className="bg-white px-4 text-evergreen hover:bg-mist">
                Continue with Google
              </Button>
            </form>
            {DEMO_MODE && (
              <Link href="/login" className="inline-flex h-9 items-center rounded-lg border border-spring px-4 text-sm font-medium text-white hover:bg-white/10">
                Try the demo
              </Link>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="how" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 id="how" className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-lg border bg-card p-5">
                <Icon aria-hidden className="size-6 text-forest" />
                <p className="mt-3 font-semibold"><span className="font-mono text-muted-foreground">{i + 1}. </span>{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="roles" className="bg-white px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 id="roles" className="text-2xl font-semibold">For everyone on campus</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-lg border p-5">
                <Icon aria-hidden className="size-6 text-forest" />
                <p className="mt-3 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="trust" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 id="trust" className="text-2xl font-semibold">Fair, safe and accountable</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST.map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-lg bg-mist p-4 text-sm font-medium text-evergreen">
                <ShieldCheck aria-hidden className="size-5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="stats" className="bg-evergreen px-6 py-14 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 id="stats" className="text-2xl font-semibold">Live on campus</h2>
          <Suspense fallback={<p className="mt-6 text-mist">Loading stats…</p>}>
            <LiveStats />
          </Suspense>
        </div>
      </section>

      <footer className="border-t px-6 py-6 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Camera aria-hidden className="size-4" />
          Fictional demo institution: Deccan Valley Institute of Technology, Pune. All demo data is made up.
          <a className="text-primary underline underline-offset-4" href="https://github.com/Woodbulky/ResourCity">
            GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}

// Aggregate counts only, no personal data, so the service client is safe here.
async function getStats() {
  "use cache";
  cacheLife("minutes");
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
  const s = await getStats();
  const items = [
    [s.listed, "resources listed"],
    [s.hours, "hours shared this month"],
    [s.idleNowUsed, "rarely used resources now in use"],
  ] as const;
  return (
    <dl className="mt-6 grid gap-6 sm:grid-cols-3">
      {items.map(([value, label]) => (
        <div key={label}>
          <dt className="text-sm text-mist">{label}</dt>
          <dd className="font-mono text-4xl font-semibold text-spring">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
