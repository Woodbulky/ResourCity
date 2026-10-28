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

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your @{DOMAIN} Google account. No passwords.
        </p>
      </div>
      {message && (
        <p role="alert" className="rounded-md bg-[var(--red-light-3)] p-3 text-sm font-medium text-[var(--red-base)]">
          {message}
        </p>
      )}
      <form action={signInWithGoogle}>
        <Button type="submit" size="lg" className="w-full">Continue with Google</Button>
      </form>

      {DEMO_MODE && (
        <section aria-labelledby="demo-heading" className="space-y-3 border-t pt-6">
          <h2 id="demo-heading" className="font-semibold">Try the demo</h2>
          <p className="text-sm text-muted-foreground">
            One-click logins for the fictional DVIT campus. Any Google account also works in demo mode and lands as a
            student awaiting verification.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(DEMO_ACCOUNTS) as DemoAccount[]).map((key) => (
              <form key={key} action={signInDemo.bind(null, key)}>
                <Button type="submit" variant="outline" className="w-full">{DEMO_ACCOUNTS[key].label}</Button>
              </form>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
