# ResourCity — progress

## Phase 0 — Setup (in progress)

### Done
- Next.js 16.4 (App Router, TypeScript, `src/` dir), Tailwind v4, shadcn/ui (base-nova style), zod 4, date-fns + date-fns-tz, @supabase/ssr + supabase-js.
- Folder structure from PRD Section 2 (empty folders hold `.gitkeep`).
- docs/PRD.md (exported from the PRD doc), docs/PROGRESS.md, CLAUDE.md, .env.example, .gitignore (`.env*` ignored, `.env.example` allowed).
- Supabase clients: `src/lib/supabase/client.ts` (browser, anon), `src/lib/server/supabase.ts` (server user client + service-role client, `server-only`).
- Design tokens: `src/styles/tokens.css` (PRD Section 16), mapped onto shadcn semantic variables in `globals.css`. Inter + Source Code Pro, focus ring #00684A 2 px, skip link, reduced motion.
- Placeholder landing page at `/` (`src/app/(marketing)/page.tsx`).
- AI smoke test script: `scripts/ai-smoke.mjs`.

### Pending (needs the architect)
- AI router smoke test: needs `AI_ROUTER_BASE_URL` and `AI_ROUTER_API_KEY` in `.env.local`; exact model string and base URL to be recorded here once it passes.
- `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Supabase dashboard → Project Settings → API keys).
- Vercel project connected to `main` with the env vars set; preview URL to be recorded here.

### Deviations from the PRD
- Next.js 16 renames `middleware.ts` to `proxy.ts`; route guards (Section 4) will live in `src/proxy.ts`.
- Browser Supabase client lives in `src/lib/supabase/` (Section 2 lists only the server folder).

### Open questions raised while reading the PRD (to settle before Phase 1)
1. Exclusion constraint on `(unit_id, tstzrange)` is bypassed when `unit_id` is null; proposal: every resource gets at least one `resource_units` row.
2. Domain-check trigger cannot read `NEXT_PUBLIC_DEMO_MODE`; proposal: mirror the flag in a DB settings row.
3. Missing transitions: student cancel from `pending_allocation` / `pending_approval` / `waitlisted`; a pending request whose slot starts with no decision.
4. Penalty debt has no `credit_ledger` kind.

### Next
Phase 1 — Foundation: migrations, `app_now()`, `log_event()`, RLS baseline, contracts, domain functions with tests, `transitionBooking()` skeleton, seed.
