import { CircleCheck } from "lucide-react";
import { DecisionRow } from "@/components/staff";
import { CountBadge, EmptyState, PageHeading, Panel, PanelHeading, TabRail } from "@/components/ui/kit";
import { managerQueue, type QueueLevel } from "@/lib/server/queues";
import { requireViewer } from "@/lib/server/viewer";

const LEVELS = ["all", "critical", "urgent", "normal"] as const;
type Level = (typeof LEVELS)[number];
const LABEL: Record<Level, string> = { all: "All priorities", critical: "Critical", urgent: "Urgent", normal: "Normal" };

// Manager decision queue (PRD 12): critical → urgent → normal, oldest first.
export default async function DecisionQueue({ searchParams }: PageProps<"/manager/queue">) {
  const viewer = await requireViewer();
  const [{ level: raw }, q] = await Promise.all([searchParams, managerQueue(viewer)]);
  const level: Level = (LEVELS as readonly string[]).includes(raw as string) ? (raw as Level) : "all";
  const shown = level === "all" ? q.items : q.items.filter((i) => i.level === (level as QueueLevel));

  return (
    <>
      <PageHeading
        eyebrow="Campus oversight · decision queue"
        title={
          <>
            A fair call, <em>with the full picture.</em>
          </>
        }
        description="Review why each item needs you, and leave a reason with every consequential decision. Overrides are recorded with the original recommendation."
      />
      <TabRail
        label="Priority"
        active={level}
        hrefFor={(k) => (k === "all" ? "/manager/queue" : `/manager/queue?level=${k}`)}
        tabs={LEVELS.map((l) => ({ key: l, label: LABEL[l], count: l === "all" ? q.items.length : q.items.filter((i) => i.level === l).length }))}
      />
      <Panel aria-labelledby="decisions-heading">
        <PanelHeading
          id="decisions-heading"
          title="Decisions waiting for you"
          description="Sorted by urgency, then by how long each has waited."
          aside={<CountBadge>{shown.length} open</CountBadge>}
        />
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((i) => <DecisionRow key={i.id} item={i} now={q.now} />)}
          </ul>
        ) : (
          <EmptyState compact icon={CircleCheck} title="Nothing waiting on you.">All decisions at this level are up to date.</EmptyState>
        )}
      </Panel>
    </>
  );
}
