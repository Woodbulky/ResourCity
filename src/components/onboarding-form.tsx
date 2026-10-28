"use client";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/contracts/api";
import { submitOnboarding } from "@/lib/server/account";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024; // matches the id-proofs bucket limit
const field =
  "h-11 w-full rounded-[10px] border border-line-strong bg-paper px-3 text-sm text-ink transition focus:border-moss focus:outline-none focus:ring-3 focus:ring-moss/20";
const label = "block text-sm font-semibold text-ink";

interface Props {
  userId: string;
  defaults: { fullName: string; department: string | null; year: number | null; rollNumber: string | null };
}

// The ID photo goes straight from the browser into the user's own id-proofs folder; the server
// action then records the path and queues the verification.
export function OnboardingForm({ userId, defaults }: Props) {
  const [state, action, submitting] = useActionState(submitOnboarding, null);
  const [uploadError, setUploadError] = useState<string>();
  const [fileName, setFileName] = useState<string>();
  const [uploading, startUpload] = useTransition();
  const error = uploadError ?? (state && !state.ok ? state.error : undefined);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(undefined);
    const form = new FormData(e.currentTarget);
    const file = form.get("idCard");
    if (!(file instanceof File) || file.size === 0) return setUploadError("Upload a photo of your college ID card.");
    if (file.size > MAX_BYTES) return setUploadError("The photo must be 5 MB or smaller.");
    startUpload(async () => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from("id-proofs").upload(path, file, { contentType: file.type });
      if (error) return setUploadError("The upload failed. Use a JPG, PNG, WebP or PDF and try again.");
      form.delete("idCard");
      form.set("idProofPath", path);
      action(form);
    });
  }

  const busy = uploading || submitting;
  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="fullName" className={label}>Full name</label>
        <input id="fullName" name="fullName" required defaultValue={defaults.fullName} className={field} autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="department" className={label}>Department</label>
          <select id="department" name="department" required defaultValue={defaults.department ?? ""} className={field}>
            <option value="" disabled>Choose…</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="year" className={label}>Year</label>
          <select id="year" name="year" required defaultValue={defaults.year ?? ""} className={field}>
            <option value="" disabled>Choose…</option>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="rollNumber" className={label}>Roll number</label>
          <input id="rollNumber" name="rollNumber" required defaultValue={defaults.rollNumber ?? ""} className={`${field} font-mono`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className={label}>Phone (optional)</label>
          <input id="phone" name="phone" type="tel" className={field} autoComplete="tel" />
        </div>
      </div>
      <div className="space-y-1.5">
        <span className={label}>College ID card photo</span>
        <label
          htmlFor="idCard"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-cream/60 px-4 py-6 text-center transition hover:border-moss hover:bg-sage/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-moss/30"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-sage text-moss">
            <IdCard aria-hidden className="size-5" />
          </span>
          <span className="text-sm font-semibold">{fileName ?? "Choose a photo or PDF"}</span>
          <span id="idCard-hint" className="text-xs text-ink-soft">
            JPG, PNG, WebP or PDF up to 5 MB. Only an Admin sees it, and it is deleted as soon as they decide.
          </span>
          <input
            id="idCard"
            name="idCard"
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            className="sr-only"
            aria-describedby="idCard-hint"
            onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name)}
          />
        </label>
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm font-semibold text-danger-fg">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {uploading ? "Uploading…" : submitting ? "Submitting…" : "Submit for verification"}
      </Button>
    </form>
  );
}
