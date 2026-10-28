import { createClient } from "@/lib/server/supabase";
import { requireViewer } from "@/lib/server/viewer";

// Phase 2: plain resource list so pending students can browse. Search, filters and eligibility
// on each card arrive in Phase 3 (PRD 7).
export default async function BrowsePage() {
  await requireViewer();
  const { data: resources } = await (await createClient())
    .from("resources")
    .select("id, name, location, description, organizations(name)")
    .eq("status", "active")
    .order("name");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Browse resources</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {resources?.map((r) => (
          <li key={r.id} className="space-y-1 rounded-lg border bg-card p-4">
            <h2 className="font-semibold">{r.name}</h2>
            <p className="text-sm text-muted-foreground">{r.organizations?.name} · {r.location}</p>
            <p className="line-clamp-3 text-sm">{r.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
