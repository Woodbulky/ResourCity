"use client";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { ResourceCardData } from "@/lib/server/student";
import { searchResources, type SearchOutcome } from "@/lib/server/trust-actions";
import { CATEGORIES, CATEGORY_GROUPS, type CategoryGroup } from "./category";
import { ResourceCard } from "./resource-card";
import { EmptyState } from "./ui/kit";

const TOGGLES = [
  { key: "eligible", label: "Eligible for me", test: (r: ResourceCardData) => r.state === "eligible" || r.state === "eligible_approval" },
  { key: "instant", label: "Instant approval", test: (r: ResourceCardData) => r.approvalMode === "auto" && r.allocationMode === "instant" },
  { key: "free", label: "Free to book", test: (r: ResourceCardData) => r.baseRate === 0 },
] as const;
type ToggleKey = (typeof TOGGLES)[number]["key"];

type Parsed = Extract<SearchOutcome, { ok: true }>;
type ChipKey = "category" | "keywords" | "slot" | "quantity";
const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h! + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h! < 12 ? "am" : "pm"}`;
};

// Search and filters over the catalogue (PRD 7). Typing matches names, places and organisations.
// Pressing Enter sends the words to the AI parser, which only turns them into filter chips the student
// can remove; availability for a parsed slot comes from the database, never from the AI.
export function ResourceBrowser({ resources }: { resources: ResourceCardData[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CategoryGroup | "All">("All");
  const [toggles, setToggles] = useState<Set<ToggleKey>>(new Set());
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [removed, setRemoved] = useState<Set<ChipKey>>(new Set());
  const [aiNote, setAiNote] = useState<string>();
  const [parsing, startParse] = useTransition();
  const deferred = useDeferredValue(query);
  const input = useRef<HTMLInputElement>(null);

  const ask = () =>
    startParse(async () => {
      setAiNote(undefined);
      const res = await searchResources(query);
      if (res.ok) {
        setParsed(res);
        setRemoved(new Set());
      } else {
        setParsed(null);
        setAiNote(res.error);
      }
    });
  const f = parsed?.filters;
  const has = (k: ChipKey) => !!parsed && !removed.has(k);
  const p = parsed?.slot;
  const slotLabel = p ? `${hm(p.start_time)}–${hm(p.end_time)}, ${p.start_date}${p.end_date !== p.start_date ? ` to ${p.end_date}` : ""}` : "";
  const slot = p && parsed.free && has("slot") ? p : null;
  const chips: { key: ChipKey; label: string }[] = parsed
    ? [
        ...(f?.category ? [{ key: "category" as const, label: CATEGORIES[f.category].label }] : []),
        ...(f?.keywords.length ? [{ key: "keywords" as const, label: `“${f.keywords.join(", ")}”` }] : []),
        ...(parsed.slot ? [{ key: "slot" as const, label: slotLabel }] : []),
        ...(f?.date && !parsed.slot ? [{ key: "slot" as const, label: `On ${f.date} (pick a time on the resource)` }] : []),
        ...(f?.quantity && f.quantity > 1 ? [{ key: "quantity" as const, label: `${f.quantity} units` }] : []),
      ].filter((c) => !removed.has(c.key))
    : [];

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

  // A sentence sent to the parser is not a list of words every card must contain.
  const words = parsed || parsing ? [] : deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const keywords = has("keywords") ? (f?.keywords ?? []).map((k) => k.toLowerCase()) : [];
  const shown = resources.filter((r) => {
    if (group !== "All" && CATEGORIES[r.category].group !== group) return false;
    for (const t of TOGGLES) if (toggles.has(t.key) && !t.test(r)) return false;
    const hay = `${r.name} ${r.orgName} ${r.location} ${r.description} ${CATEGORIES[r.category].label}`.toLowerCase();
    if (has("category") && f?.category && r.category !== f.category) return false;
    // A category match is enough; keywords narrow only when there is no category.
    if (keywords.length && !(has("category") && f?.category) && !keywords.some((k) => hay.includes(k))) return false;
    if (slot && has("quantity") && f?.quantity && (parsed!.free![r.id] ?? 0) < f.quantity) return false;
    return words.every((w) => hay.includes(w));
  });
  const slotFor = (id: string) =>
    slot && parsed?.free
      ? {
          query: new URLSearchParams({ start_date: slot.start_date, start_time: slot.start_time, end_date: slot.end_date, end_time: slot.end_time }).toString(),
          free: parsed.free[id] ?? 0,
          label: slotLabel,
        }
      : undefined;
  const groups = CATEGORY_GROUPS.filter((g) => resources.some((r) => CATEGORIES[r.category].group === g));
  const flip = (k: ToggleKey) =>
    setToggles((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const filtered = group !== "All" || toggles.size > 0 || words.length > 0 || !!parsed;

  return (
    <>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim().length >= 3) ask();
        }}
      >
        <label className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-paper px-4 shadow-[0_5px_18px_rgba(32,54,42,0.03)] focus-within:border-moss focus-within:ring-3 focus-within:ring-moss/15">
          <Search aria-hidden className="size-5 text-ink-soft" />
          <span className="sr-only">Search resources</span>
          <input
            ref={input}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParsed(null);
              setAiNote(undefined);
            }}
            placeholder="Try “camera for tomorrow's college event” and press Enter"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-soft"
          />
          <button type="submit" disabled={parsing || query.trim().length < 3} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold text-moss hover:bg-sage/50 disabled:opacity-50">
            <Sparkles aria-hidden className="size-4" /> {parsing ? "Reading…" : "Smart search"}
          </button>
        </label>
      </form>
      <div aria-live="polite" className="mt-2 grid gap-2">
        {parsing && <p className="text-sm text-ink-soft">Reading your search… the AI turns it into filters you can edit; this can take a few seconds.</p>}
        {aiNote && <p className="text-sm text-ink-soft">{aiNote} Matching your words instead.</p>}
        {parsed && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">AI suggestion · filters</span>
            {chips.length ? (
              chips.map((c) => (
                <button
                  key={c.key + c.label}
                  type="button"
                  onClick={() => setRemoved((prev) => new Set(prev).add(c.key))}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-moss bg-sage px-3 font-semibold text-sage-strong"
                  aria-label={`Remove filter ${c.label}`}
                >
                  {c.label} <X aria-hidden className="size-3.5" />
                </button>
              ))
            ) : (
              <span className="text-ink-soft">No filters understood. Showing everything.</span>
            )}
          </div>
        )}
        {f?.needs_clarification && (
          <p className="rounded-lg bg-pending-bg px-3 py-2 text-sm text-pending-fg">
            {f.clarification_question ?? "When do you need it?"} Add the day and time to your search, or pick a slot on the resource page.
          </p>
        )}
      </div>

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
              setParsed(null);
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
            <ResourceCard key={r.id} r={r} detailed slot={slotFor(r.id)} />
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
