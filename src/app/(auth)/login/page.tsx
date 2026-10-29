import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/contracts/api";
import { signInDemo, signInWithGoogle } from "@/lib/server/account";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DOMAIN = process.env.ALLOWED_EMAIL_DOMAINS?.split(",")[0] ?? "dvit.edu.in";

const ERRORS: Record<string, string> = {
  domain: `Use your @${DOMAIN} Google account.`,
  oauth: "Google sign-in did not finish. Please try again.",
  demo: "The demo sign-in failed. The demo data may need a reset.",
};

// What each seeded account shows a judge (PRD 17).
const DEMO_COPY: Record<DemoAccount, { name: string; text: string }> = {
  student: { name: "Riya Sharma", text: "Browse, check eligibility, request and track bookings" },
  aarav: { name: "Aarav Deshmukh", text: "No CNC training: sees Action required on the CNC" },
  sneha: { name: "Sneha Iyer", text: "10 credits left: the emergency credits path" },
  kabir: { name: "Kabir Singh", text: "2 no-shows: the strike warning" },
  om: { name: "Om Kale", text: "Awaiting verification by the Admin" },
  owner: { name: "Photography Club", text: "Approve requests, hand over by QR, record returns" },
  manager: { name: "Prof. Mehta", text: "Restricted approvals, disputes, penalties, incidents" },
  manager2: { name: "Prof. Kulkarni", text: "Decides the damage case the Photography Club Owner filed" },
  admin: { name: "Campus Admin", text: "Verify students, grant roles, policies and audit log" },
};

const GoogleG = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.8-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
  </svg>
);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Welcome back</p>
        <h1 className="display mt-2 text-5xl">
          Step into <em>campus.</em>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Sign in with your @{DOMAIN} Google account. No passwords to remember.
        </p>
      </div>
      {message && (
        <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-fg">
          {message}
        </p>
      )}
      <form action={signInWithGoogle}>
        <Button type="submit" variant="outline" size="lg" className="w-full border-line-strong">
          <GoogleG /> Continue with Google
        </Button>
      </form>

      {DEMO_MODE && (
        <section id="demo" aria-labelledby="demo-heading" className="scroll-mt-6 space-y-3 border-t border-line pt-6">
          <div>
            <h2 id="demo-heading" className="font-semibold">Try the demo</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              One-click logins for the fictional DVIT campus. Any Google account also works in demo mode and lands as a
              student awaiting verification.
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(DEMO_ACCOUNTS) as DemoAccount[]).map((key) => (
              <li key={key}>
                <form action={signInDemo.bind(null, key)}>
                  <button
                    type="submit"
                    className="lift group flex h-full w-full items-start gap-3 rounded-xl border border-line bg-cream/60 p-3 text-left"
                  >
                    <Avatar name={DEMO_COPY[key].name} className="size-9" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <strong className="flex items-center justify-between gap-2 text-sm font-semibold">
                        {DEMO_ACCOUNTS[key].label}
                        <ArrowRight aria-hidden className="size-4 shrink-0 text-moss transition-transform group-hover:translate-x-0.5" />
                      </strong>
                      <small className="text-xs leading-relaxed text-ink-soft">{DEMO_COPY[key].text}</small>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
