import { ResourceForm } from "@/components/resource-form";
import { PageHeading } from "@/components/ui/kit";
import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// New listing (PRD 6), always on behalf of one of the Owner's organisations.
export default async function NewResourcePage() {
  const viewer = await requireViewer();
  const { data: badgeTypes } = await (await createClient()).from("badge_types").select("id, name").order("name");
  const orgs = viewer.memberships.filter((m) => m.role === "owner").map((m) => ({ id: m.orgId, name: m.orgName }));
  return (
    <>
      <PageHeading eyebrow="Listings · new" title={<>Share something <em>new.</em></>} description="The form changes with the category. Every rule you set here is enforced at request, approval and handover." />
      <ResourceForm orgs={orgs} badgeTypes={badgeTypes ?? []} />
    </>
  );
}
