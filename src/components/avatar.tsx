import { cn } from "cn";

const TONES = [
  "bg-[#e8cbb6] text-[#5f3d30]",
  "bg-[#ccd8c5] text-[#2c4d39]",
  "bg-[#ddd5f0] text-[#4a3f6b]",
  "bg-[#e9dcc0] text-[#5b4a26]",
  "bg-[#c9dfe3] text-[#24505a]",
];

export const initials = (name: string) =>
  name
    .replace(/^(prof|dr)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const tone = (name: string) => TONES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TONES.length];

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const base = cn("grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-paper text-xs font-bold", className);
  if (src)
    // eslint-disable-next-line @next/next/no-img-element -- Google profile photo, external and tiny
    return <img src={src} alt="" referrerPolicy="no-referrer" className={cn(base, "object-cover")} />;
  return (
    <span aria-hidden className={cn(base, tone(name))}>
      {initials(name)}
    </span>
  );
}
