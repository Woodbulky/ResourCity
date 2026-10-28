# ResourCity — rules for every Claude Code session

Read docs/PRD.md before working. Current phase and status: docs/PROGRESS.md.

@AGENTS.md

- Stack: Next.js 16 (App Router, TypeScript) + Tailwind on Vercel; Supabase (Postgres, RLS, Auth with Google, Storage); Render cron worker; AI via AI router (OpenAI-compatible). Next.js 16 renamed middleware to `proxy.ts`; check `node_modules/next/dist/docs/` before using a Next API.
- Only the lead runs git. Commit + push to main after every task and every phase: `phase-N: <change>`. Never add Co-Authored-By or "Generated with Claude Code" lines to commits or PRs.
- Contracts: src/lib/contracts is the only place for shared types, booking states and API shapes.
- All status changes: transitionBooking() only. It writes audit_events and queues notifications.
- Time: app_now() / appNow() only. Never now(), new Date() or Date.now() in business logic.
- RLS on every table. Service-role key server-side only. Reasons required for consequential actions.
- AI = suggestions with confidence. Never decides access, damage or penalties.
- Folder ownership: lead = contracts, migrations, domain; backend = app/api, supabase functions; frontend = app pages, components; worker = worker/, lib/ai.
- Palette: "campus green" tokens in src/styles/tokens.css (pine, moss, leaf, cream; replaced the MongoDB palette on the architect's request). --leaf / --leaf-bright never carry text on light backgrounds. Shared UI kit: src/components/ui/kit.tsx.
- Stuck > 20 min: stub behind a flag, note it in PROGRESS.md, continue.
