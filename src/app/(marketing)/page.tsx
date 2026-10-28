// Placeholder landing page (Phase 0). Full landing per PRD Section 16 lands in Phase 2.
export default function LandingPage() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <section className="bg-evergreen px-6 py-24 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="font-mono text-sm text-spring">ResourCity</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Unlock your campus&apos;s idle equipment and spaces.
          </h1>
          <p className="mt-6 text-lg text-mist">
            Fair, safe, accountable sharing between departments, labs, clubs
            and verified students.
          </p>
        </div>
      </section>
      <footer className="mt-auto border-t px-6 py-6 text-sm text-muted-foreground">
        Fictional demo institution: Deccan Valley Institute of Technology.{" "}
        <a
          className="text-primary underline underline-offset-4"
          href="https://github.com/Woodbulky/ResourCity"
        >
          GitHub
        </a>
      </footer>
    </main>
  );
}
