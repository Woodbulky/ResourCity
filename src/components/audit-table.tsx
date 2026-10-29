"use client";
import { useDeferredValue, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "./ui/kit";

export interface AuditRow {
  id: number;
  action: string;
  actor: string;
  actorRole: string;
  entity: string;
  change: string;
  reason: string | null;
  when: string;
}

const FILTERS = {
  all: { label: "All activity", test: () => true },
  bookings: { label: "Bookings", test: (r: AuditRow) => r.entity.startsWith("booking") },
  people: { label: "People and roles", test: (r: AuditRow) => r.entity.startsWith("profile") || r.entity.startsWith("membership") },
  policy: { label: "Policies", test: (r: AuditRow) => r.entity.startsWith("policy") },
  trust: { label: "Trust and safety", test: (r: AuditRow) => /damage|penalt|incident|suspen/i.test(`${r.entity} ${r.action}`) },
} as const;
type Filter = keyof typeof FILTERS;

// Filterable view of the append-only log (PRD 15). Contact details never appear here.
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useDeferredValue(query).trim().toLowerCase();
  const shown = rows.filter(
    (r) => FILTERS[filter].test(r) && (!q || `${r.action} ${r.actor} ${r.entity} ${r.change} ${r.reason ?? ""}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-paper px-4 focus-within:border-moss focus-within:ring-3 focus-within:ring-moss/15">
        <Search aria-hidden className="size-5 text-ink-soft" />
        <span className="sr-only">Search the audit log</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, actions or reasons"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-soft"
        />
      </label>
      <div className="my-4 flex flex-wrap gap-2" role="group" aria-label="Filter events">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="h-9 rounded-full border border-line bg-[#f8f9f3] px-3.5 text-sm text-ink-soft hover:bg-sage/50 aria-pressed:border-pine aria-pressed:bg-pine aria-pressed:text-paper"
          >
            {FILTERS[f].label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="mb-3 text-sm text-ink-soft">{shown.length} of {rows.length} recent events</p>
      {shown.length ? (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-paper">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                <th scope="col" className="px-5 py-3 font-semibold">Action</th>
                <th scope="col" className="px-3 py-3 font-semibold">Actor</th>
                <th scope="col" className="px-3 py-3 font-semibold">Change and reason</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((r) => (
                <tr key={r.id} className="align-top">
                  <th scope="row" className="px-5 py-3 text-left">
                    <span className="block font-mono text-xs font-semibold">{r.action}</span>
                    <span className="text-xs font-normal text-ink-soft">{r.entity}</span>
                  </th>
                  <td className="px-3 py-3">
                    <span className="block font-medium">{r.actor}</span>
                    <span className="text-xs text-ink-soft">{r.actorRole}</span>
                  </td>
                  <td className="px-3 py-3">
                    {r.change && <span className="block">{r.change}</span>}
                    {r.reason && <span className="block text-ink-soft">Reason: {r.reason}</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-xs text-ink-soft">{r.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Search} title="No matching events.">Try another word or filter.</EmptyState>
      )}
    </>
  );
}
