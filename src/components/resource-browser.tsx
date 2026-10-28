"use client";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { ResourceCardData } from "@/lib/server/student";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryGroup } from "./category";
import { ResourceCard } from "./resource-card";
import { EmptyState } from "./ui/kit";

const TOGGLES = [
  { key: "eligible", label: "Eligible for me", test: (r: ResourceCardData) => r.state === "eligible" || r.state === "eligible_approval" },
  { key: "instant", label: "Instant approval", test: (r: ResourceCardData) => r.approvalMode === "auto" && r.allocationMode === "instant" },
  { key: "free", label: "Free to book", test: (r: ResourceCardData) => r.baseRate === 0 },
] as const;
type ToggleKey = (typeof TOGGLES)[number]["key"];

// Keyword search and filters over the catalogue (PRD 7). The AI parser for natural-language
// queries lands in Phase 5; until then the search matches names, places and organisations.
export function ResourceBrowser({ resources }: { resources: ResourceCardData[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CategoryGroup | "All">("All");
  const [toggles, setToggles] = useState<Set<ToggleKey>>(new Set());
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const words = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = resources.filter((r) => {
    if (group !== "All" && CATEGORIES[r.category].group !== group) return false;
    for (const t of TOGGLES) if (toggles.has(t.key) && !t.test(r)) return false;
    const hay = `${r.name} ${r.orgName} ${r.location} ${r.description} ${CATEGORIES[r.category].label}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const groups = CATEGORY_GROUPS.filter((g) => resources.some((r) => CATEGORIES[r.category].group === g));
  const flip = (k: ToggleKey) =>
    setToggles((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const filtered = group !== "All" || toggles.size > 0 || words.length > 0;

  return (
    <>
      <label className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-paper px-4 shadow-[0_5px_18px_rgba(32,54,42,0.03)] focus-within:border-moss focus-within:ring-3 focus-within:ring-moss/15">
        <Search aria-hidden className="size-5 text-ink-soft" />
        <span className="sr-only">Search resources</span>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try “camera”, “seminar hall” or “ECE”"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-soft"
        />
        <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-xs text-ink-soft sm:block">Ctrl K</kbd>
      </label>

      <div className="my-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
        {(["All", ...groups] as const).map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className="h-9 rounded-full border border-line bg-[#f8f9f3] px-3.5 text-sm text-ink-soft transition hover:border-line-strong hover:bg-sage/50 aria-pressed:border-pine aria-pressed:bg-pine aria-pressed:text-paper"
          >
            {g === "All" ? "All resources" : g}
          </button>
        ))}
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <span className="sr-only">More filters:</span>
        {TOGGLES.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={toggles.has(t.key)}
            onClick={() => flip(t.key)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 text-sm text-ink-soft transition hover:bg-sage/50 aria-pressed:border-solid aria-pressed:border-moss aria-pressed:bg-sage aria-pressed:font-semibold aria-pressed:text-sage-strong"
          >
            {t.key === "free" ? <Sparkles aria-hidden className="size-3.5" /> : <SlidersHorizontal aria-hidden className="size-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between text-sm text-ink-soft">
        <p aria-live="polite">
          <strong className="font-semibold text-ink">
            {shown.length} {shown.length === 1 ? "resource" : "resources"}
          </strong>{" "}
          to explore around campus
        </p>
        {filtered && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setGroup("All");
              setToggles(new Set());
            }}
            className="inline-flex items-center gap-1 font-semibold text-moss hover:underline"
          >
            <X aria-hidden className="size-4" /> Clear filters
          </button>
        )}
      </div>

      {shown.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => (
            <ResourceCard key={r.id} r={r} detailed />
          ))}
        </div>
      ) : (
        <EmptyState icon={Search} title="Nothing on this shelf just yet.">
          Try a different word, or clear the filters to see everything on campus.
        </EmptyState>
      )}
    </>
  );
}
