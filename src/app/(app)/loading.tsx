// Shown at once on every navigation inside the signed-in shell while the next page renders on the server.
export default function Loading() {
  return (
    <div role="status" aria-busy className="animate-pulse space-y-4 motion-reduce:animate-none">
      <span className="sr-only">Loading…</span>
      <div className="h-4 w-40 rounded bg-wash" />
      <div className="h-12 w-2/3 max-w-xl rounded-lg bg-wash" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-[var(--radius-card)] bg-wash" />
        ))}
      </div>
      <div className="h-64 rounded-[var(--radius-card)] bg-wash" />
    </div>
  );
}
