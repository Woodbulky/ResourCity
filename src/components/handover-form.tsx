"use client";
import { useActionState, useId, useState, useTransition, type FormEvent } from "react";
import { Camera, PenLine } from "lucide-react";
import { Result } from "@/components/booking-forms";
import { Button } from "@/components/ui/button";
import { field } from "@/components/ui/kit";
import { recordCondition } from "@/lib/server/booking-actions";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024; // condition-photos bucket limit

// Checklist (OK / issue + note) and guided photos, signed by the Owner (PRD 10). Photos go from the
// browser into condition-photos/{bookingId}/ (storage RLS: booking parties only).
export function HandoverForm({
  bookingId,
  as,
  phase,
  token,
  items,
  shots,
  supervisionRequired,
}: {
  bookingId: string;
  as: "owner" | "manager";
  phase: "checkout" | "return";
  token?: string;
  items: string[];
  shots: string[];
  supervisionRequired: boolean;
}) {
  const [state, action, submitting] = useActionState(recordCondition, null);
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string>();
  const [issues, setIssues] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const id = useId();
  const busy = uploading || submitting;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError(undefined);
    const form = new FormData(e.currentTarget);
    const files = shots.map((shot, i) => ({ shot, file: form.get(`shot-${i}`) }));
    const missing = files.find((f) => !(f.file instanceof File) || f.file.size === 0);
    if (missing) return setUploadError(`Take the “${missing.shot}” photo.`);
    if (files.some((f) => (f.file as File).size > MAX_BYTES)) return setUploadError("Each photo must be 10 MB or smaller.");
    const checklist = items.map((item, i) => ({ item, ok: !issues.has(item), note: String(form.get(`note-${i}`) ?? "").trim() || undefined }));

    startUpload(async () => {
      const storage = createClient().storage.from("condition-photos");
      const photos: { shot: string; path: string }[] = [];
      for (const [i, { shot, file }] of files.entries()) {
        const f = file as File;
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${bookingId}/${phase}-${i + 1}-${crypto.randomUUID()}.${ext}`;
        const { error } = await storage.upload(path, f, { contentType: f.type });
        if (error) return setUploadError(`The “${shot}” photo did not upload. Use JPG, PNG or WebP and try again.`);
        photos.push({ shot, path });
      }
      const payload = new FormData();
      for (const [k, v] of Object.entries({
        bookingId, as, phase, token: token ?? "", checklist: JSON.stringify(checklist), photos: JSON.stringify(photos),
        notes: String(form.get("notes") ?? ""), supervisor: String(form.get("supervisor") ?? ""),
      })) payload.set(k, v);
      action(payload);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6" noValidate>
      {items.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">Checklist</legend>
          {items.map((item, i) => {
            const issue = issues.has(item);
            return (
              <div key={item} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{item}</span>
                  <span role="radiogroup" aria-label={item} className="flex gap-1">
                    {(["OK", "Issue"] as const).map((label) => {
                      const selected = (label === "Issue") === issue;
                      return (
                        <button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setIssues((prev) => {
                            const next = new Set(prev);
                            if (label === "Issue") next.add(item);
                            else next.delete(item);
                            return next;
                          })}
                          className="h-8 rounded-lg border border-line px-3 text-sm aria-checked:border-pine aria-checked:bg-pine aria-checked:font-semibold aria-checked:text-paper"
                        >
                          {label}
                        </button>
                      );
                    })}
                  </span>
                </div>
                {issue && (
                  <div className="mt-2 grid gap-1">
                    <label htmlFor={`${id}-note-${i}`} className="text-xs font-semibold">What is wrong?</label>
                    <input id={`${id}-note-${i}`} name={`note-${i}`} required className={field} />
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Guided photos <span className="font-normal text-ink-soft">({shots.length} shots, taken the same way at pickup and return)</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {shots.map((shot, i) => (
            <label key={shot} htmlFor={`${id}-shot-${i}`} className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-cream/60 p-3 hover:border-moss has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-moss/30">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sage text-moss"><Camera aria-hidden className="size-5" /></span>
              <span className="grid min-w-0">
                <span className="text-sm font-semibold">{shot}</span>
                <span className="truncate text-xs text-ink-soft">{chosen[shot] ?? "Tap to take or choose a photo"}</span>
              </span>
              <input
                id={`${id}-shot-${i}`}
                name={`shot-${i}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const name = e.currentTarget.files?.[0]?.name;
                  setChosen((prev) => ({ ...prev, [shot]: name ?? "" }));
                }}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {supervisionRequired && phase === "checkout" && (
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-sup`} className="text-sm font-semibold">Supervisor present</label>
          <input id={`${id}-sup`} name="supervisor" required className={field} placeholder="Full name" />
        </div>
      )}
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-notes`} className="text-sm font-semibold">Notes <span className="font-normal text-ink-soft">(optional)</span></label>
        <textarea id={`${id}-notes`} name="notes" maxLength={1000} className={`${field} h-auto min-h-20 py-2`} />
      </div>

      {uploadError && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg">{uploadError}</p>}
      <Result state={state} />
      <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-fit">
        <PenLine aria-hidden /> {uploading ? "Uploading photos…" : submitting ? "Signing…" : phase === "checkout" ? "Sign and hand over" : "Sign return record"}
      </Button>
      <p className="text-xs text-ink-soft">The student then acknowledges this record from their booking page. Both signatures are kept on the record.</p>
    </form>
  );
}
