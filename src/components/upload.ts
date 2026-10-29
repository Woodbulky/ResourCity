"use client";
import { createClient } from "@/lib/supabase/client";

// Photos are resized in the browser to 1280 px on the long edge before upload (PRD 14): smaller
// uploads on phones, and the AI receives images at the size it expects.
export async function shrink(file: File, max = 1280): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  return blob ?? file;
}

// Upload files to a private bucket under a folder the storage policies allow; returns the paths.
export async function uploadAll(bucket: string, folder: string, prefix: string, files: File[]): Promise<string[]> {
  const storage = createClient().storage.from(bucket);
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const body = await shrink(f);
    const ext = body.type === "image/jpeg" ? "jpg" : f.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${folder}/${prefix}-${i + 1}-${crypto.randomUUID()}.${ext}`;
    const { error } = await storage.upload(path, body, { contentType: body.type || f.type });
    if (error) throw new Error(`“${f.name}” did not upload. Use JPG, PNG or WebP under 10 MB.`);
    paths.push(path);
  }
  return paths;
}
