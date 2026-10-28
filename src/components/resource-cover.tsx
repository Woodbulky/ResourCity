import { cn } from "cn";
import type { ResourceCategory } from "@/lib/contracts/resource";
import { CATEGORIES, COVER_TONES } from "./category";

// Illustrated cover for a listing: the category's icon on a tinted field with soft rings.
// Real photos replace it once Owners upload them (resources.photos).
export function ResourceCover({
  category,
  className,
  label = true,
  badge,
}: {
  category: ResourceCategory;
  className?: string;
  label?: boolean;
  badge?: React.ReactNode;
}) {
  const meta = CATEGORIES[category];
  const Icon = meta.icon;
  return (
    <div
      aria-hidden
      className={cn(
        "relative isolate overflow-hidden bg-gradient-to-br text-pine",
        COVER_TONES[meta.tone],
        className,
      )}
    >
      <span className="absolute -right-10 -top-12 size-44 rounded-full border border-pine/10 shadow-[0_0_0_22px_rgba(18,62,52,0.035),0_0_0_46px_rgba(18,62,52,0.025)]" />
      <span className="absolute -bottom-16 left-6 size-32 rounded-full border border-pine/10" />
      <Icon strokeWidth={1.2} className="absolute bottom-3 right-4 size-[46%] max-h-28 max-w-28 opacity-30 transition-transform duration-700 group-hover:scale-105" />
      {label && (
        <span className="absolute bottom-3 left-3 rounded-full border border-white/50 bg-white/85 px-2.5 py-1 text-xs font-semibold text-pine backdrop-blur">
          {meta.label}
        </span>
      )}
      {badge && <span className="absolute right-3 top-3">{badge}</span>}
    </div>
  );
}
