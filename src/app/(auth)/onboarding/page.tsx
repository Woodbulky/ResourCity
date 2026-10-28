import { OnboardingForm } from "@/components/onboarding-form";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

export default async function OnboardingPage() {
  const viewer = await requireViewer();
  const { data: p } = await (await createClient())
    .from("profiles")
    .select("department, year, roll_number")
    .eq("id", viewer.id)
    .single();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Set up your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          An Admin checks your college ID before you can request resources. You can browse while you wait.
        </p>
      </div>
      {viewer.statusReason && (
        <p role="alert" className="rounded-md bg-[var(--yellow-light-3)] p-3 text-sm text-[var(--yellow-dark-2)]">
          Your last request was not approved: {viewer.statusReason}
        </p>
      )}
      <OnboardingForm
        userId={viewer.id}
        defaults={{ fullName: viewer.fullName, department: p?.department ?? null, year: p?.year ?? null, rollNumber: p?.roll_number ?? null }}
      />
    </div>
  );
}
