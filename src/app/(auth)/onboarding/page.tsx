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
        <p className="eyebrow">Step 1 of 2 · your details</p>
        <h1 className="display mt-2 text-5xl">
          A student&apos;s <em>first hello.</em>
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          An Admin checks your college ID before you can request resources. You can browse the campus while you wait.
        </p>
      </div>
      {viewer.statusReason && (
        <p role="alert" className="rounded-xl bg-pending-bg p-3 text-sm text-pending-fg">
          <strong className="font-semibold">Your last request was not approved:</strong> {viewer.statusReason}
        </p>
      )}
      <OnboardingForm
        userId={viewer.id}
        defaults={{ fullName: viewer.fullName, department: p?.department ?? null, year: p?.year ?? null, rollNumber: p?.roll_number ?? null }}
      />
    </div>
  );
}
