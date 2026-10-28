import { cn } from "cn";

// Leaf-in-a-pin mark from the brand sketch.
export function BrandMark({ className, leaf = "#cdf27b" }: { className?: string; leaf?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={cn("size-9", className)}>
      <path
        d="M20 5.5c-7.2 0-13 5.8-13 13 0 8.9 9.5 15.9 12.1 17.7a1.5 1.5 0 0 0 1.8 0C23.5 34.4 33 27.4 33 18.5c0-7.2-5.8-13-13-13Z"
        fill="currentColor"
      />
      <path
        d="M20 27V13m0 7c-3.7 0-6.2-1.8-7.5-4m7.5 8c3.7 0 6.2-1.8 7.5-4"
        fill="none"
        stroke={leaf}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Wordmark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className={dark ? "text-leaf" : "text-pine"} leaf={dark ? "#0c3029" : "#cdf27b"} />
      <span className={cn("text-xl font-bold tracking-[-0.05em]", dark ? "text-white" : "text-pine")}>
        resour<span className={dark ? "text-leaf" : "text-moss"}>city</span>
      </span>
      <span aria-hidden className={cn("-ml-1.5 mb-3 size-1.5 rounded-full", dark ? "bg-leaf" : "bg-moss")} />
    </span>
  );
}
