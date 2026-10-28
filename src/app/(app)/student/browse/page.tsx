import { ResourceBrowser } from "@/components/resource-browser";
import { PageHeading } from "@/components/ui/kit";
import { catalog, toCard } from "@/lib/server/student";
import { requireViewer } from "@/lib/server/viewer";

// Discovery (PRD 7): every card runs the eligibility engine for this student, so they see
// whether they qualify, and why not, before they request. Pending students may browse.
export default async function BrowsePage() {
  const viewer = await requireViewer();
  const resources = await catalog(viewer);

  return (
    <>
      <PageHeading
        eyebrow="The campus, open to you"
        title={
          <>
            Find your next <em>something.</em>
          </>
        }
        description="A room for the whole team, a camera for a new idea, a machine for your project. Every card shows whether you qualify before you ask."
      />
      <ResourceBrowser resources={resources.map(toCard)} />
    </>
  );
}
