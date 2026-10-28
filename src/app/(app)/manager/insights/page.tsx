import { BadgeCheck, Building2, Clock, UserX } from "lucide-react";
import { CATEGORIES } from "@/components/category";
import { formatDay } from "@/components/format";
import { EmptyState, Flag, PageHeading, Panel, PanelHeading, SummaryCard, SummaryRow } from "@/components/ui/kit";
import { orgInsights } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

// Department overview (PRD 12): recorded utilisation from check-in/out times.
export default async function Insights() {
  const viewer = await requireViewer();
  const ins = await orgInsights(viewer);
  const peak = Math.max(1, ...ins.weeks.map((w) => w.hours));
  const top = Math.max(1, ...ins.perResource.map((r) => r.hours));
  const notBookable = ins.perResource.filter((r) => r.status !== "active");

  return (
    <>
      <PageHeading
        eyebrow="Campus oversight · department insights"
        title={
          <>
            A clearer view of <em>what gets shared.</em>
          </>
        }
        description="Usage helps departments decide what to keep, move or retire. A before-and-after comparison is not proof of cause."
      />
      <SummaryRow>
        <SummaryCard label="Hours shared" value={ins.hours30} note="Recorded, last 30 days" icon={Clock} />
        <SummaryCard label="Students served" value={ins.students} note="Completed a booking, 30 days" icon={BadgeCheck} />
        <SummaryCard label="On-time returns" value={ins.onTimeRate === null ? "—" : `${ins.onTimeRate}%`} note="Of completed bookings" icon={Building2} />
        <SummaryCard label="No-shows" value={ins.noShows} note="Last 30 days" tone={ins.noShows ? "alert" : "default"} icon={UserX} />
      </SummaryRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel aria-labelledby="weekly-heading" className="p-5">
          <h2 id="weekly-heading" className="font-semibold">Sharing, week by week</h2>
          <p className="text-sm text-ink-soft">Recorded booking hours across your organisations.</p>
          <div className="mt-6 flex h-40 items-end gap-2" role="img" aria-label={`Hours per week: ${ins.weeks.map((w) => `${formatDay(w.start)} ${w.hours}`).join(", ")}`}>
            {ins.weeks.map((w, i) => (
              <div key={w.start.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-ink-soft">{w.hours}</span>
                <span
                  className={`w-full rounded-t-md ${i === ins.weeks.length - 1 ? "bg-leaf" : i % 2 ? "bg-[#c8d9b7]" : "bg-[#83a77c]"}`}
                  style={{ height: `${Math.max(4, (w.hours / peak) * 120)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-2 text-xs text-ink-soft">
            {ins.weeks.map((w) => <span key={w.start.toISOString()} className="flex-1 text-center">{formatDay(w.start).split(" ").slice(1).join(" ")}</span>)}
          </div>
        </Panel>

        <Panel aria-labelledby="before-heading">
          <PanelHeading id="before-heading" title="Before and after listing" description="Owner's estimate before listing vs. recorded use in the last 30 days." />
          {ins.perResource.length ? (
            <ul className="divide-y divide-line">
              {ins.perResource.slice(0, 6).map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{r.name}</span>
                    <span className="shrink-0 text-ink-soft">{r.estimated_current_usage} → <strong className="text-ink">{r.hours} h</strong></span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-wash">
                    <span className="block h-full rounded-full bg-moss" style={{ width: `${(r.hours / top) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Clock} title="No resources yet." />
          )}
        </Panel>
      </div>

      <Panel aria-labelledby="table-heading" className="mt-6">
        <PanelHeading id="table-heading" title="Every resource" description={notBookable.length ? `${notBookable.length} paused, under maintenance or unsafe` : "All resources bookable"} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                <th scope="col" className="px-5 py-3 font-semibold">Resource</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Hours, 30 d</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Completed</th>
                <th scope="col" className="px-5 py-3 text-right font-semibold">No-shows</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ins.perResource.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="px-5 py-3 text-left font-semibold">
                    {r.name} <span className="font-normal text-ink-soft">· {CATEGORIES[r.category].label}</span>
                  </th>
                  <td className="px-3 py-3">
                    <Flag tone={r.status === "active" ? "good" : r.status === "unsafe" ? "danger" : "warn"}>{r.status.replaceAll("_", " ")}</Flag>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{r.hours}</td>
                  <td className="px-3 py-3 text-right font-mono">{r.bookings}</td>
                  <td className="px-5 py-3 text-right font-mono">{r.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
