"use client";

// Replaces the root layout when it fails, so no app CSS or fonts load: inline styles only.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f5ed", color: "#18372f", fontFamily: "system-ui, sans-serif", padding: 16 }}>
        <title>ResourCity is unavailable</title>
        <main role="alert" style={{ maxWidth: 440, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>ResourCity didn&apos;t load</h1>
          <p style={{ color: "#566a5e", lineHeight: 1.5, margin: "0 0 20px" }}>
            Something went wrong on our side. Nothing you did was lost or changed. Try again in a moment.
          </p>
          <button
            onClick={() => retry()}
            style={{ background: "#123e34", color: "#fffefa", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
