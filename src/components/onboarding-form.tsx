"use client";
import { useActionState, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DEPARTMENTS } from "@/lib/contracts/api";
import { submitOnboarding } from "@/lib/server/account";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 5 * 1024 * 1024; // matches the id-proofs bucket limit
const field = "w-full rounded-md border bg-white px-3 py-2 text-sm";

interface Props {
  userId: string;
  defaults: { fullName: string; department: string | null; year: number | null; rollNumber: string | null };
}

// The ID photo goes straight from the browser into the user's own id-proofs folder; the server
// action then records the path and queues the verification.
export function OnboardingForm({ userId, defaults }: Props) {
  const [state, action, submitting] = useActionState(submitOnboarding, null);
  const [uploadError, setUploadError] = useState<string>();
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="fullName" className="block text-sm font-medium">Full name</label>
        <input id="fullName" name="fullName" required defaultValue={defaults.fullName} className={field} autoComplete="name" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="department" className="block text-sm font-medium">Department</label>
          <select id="department" name="department" required defaultValue={defaults.department ?? ""} className={field}>
            <option value="" disabled>Choose…</option>
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="year" className="block text-sm font-medium">Year</label>
          <select id="year" name="year" required defaultValue={defaults.year ?? ""} className={field}>
            <option value="" disabled>Choose…</option>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>Year {y}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="rollNumber" className="block text-sm font-medium">Roll number</label>
          <input id="rollNumber" name="rollNumber" required defaultValue={defaults.rollNumber ?? ""} className={`${field} font-mono`} />
        </div>
        <div className="space-y-1">
          <label htmlFor="phone" className="block text-sm font-medium">Phone (optional)</label>
          <input id="phone" name="phone" type="tel" className={field} autoComplete="tel" />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="idCard" className="block text-sm font-medium">College ID card photo</label>
        <input id="idCard" name="idCard" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="block w-full text-sm" aria-describedby="idCard-hint" />
        <p id="idCard-hint" className="text-xs text-muted-foreground">
          Only an Admin sees it, and it is deleted as soon as they decide.
        </p>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-[var(--red-base)]">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {uploading ? "Uploading…" : submitting ? "Submitting…" : "Submit for verification"}
      </Button>
    </form>
  );
}
