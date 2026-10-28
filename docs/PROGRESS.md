# ResourCity — progress

## Phase 0 — Setup (complete, 2026-10-29)

### Acceptance
- Production URL loads: https://resour-city.vercel.app/ (HTTP 200, placeholder landing), auto-deploys from `main`.
- AI router smoke test passed: base URL `https://api.airouter.in/v1`, model `deepseek/deepseek-v4.1-flash-1017`.
  - text: HTTP 200 in 2188 ms, reply `{"ok": true}`
  - image (data-URL PNG): HTTP 200 in 3607 ms, reply `{"colour": "green"}`
  - Fallback vision model also passes: `deepseek/deepseek-v4-flash-vision-exp`.

### Done
- Next.js 16.4 (App Router, TypeScript, `src/` dir), Tailwind v4, shadcn/ui (base-nova style), zod 4, date-fns + date-fns-tz, @supabase/ssr + supabase-js.
- Folder structure from PRD Section 2 (empty folders hold `.gitkeep`).
- docs/PRD.md (exported from the PRD doc), docs/PROGRESS.md, CLAUDE.md, .env.example, .gitignore (`.env*` ignored, `.env.example` allowed).
- Supabase clients: `src/lib/supabase/client.ts` (browser, anon), `src/lib/server/supabase.ts` (server user client + service-role client, `server-only`).
- Design tokens: `src/styles/tokens.css` (PRD Section 16), mapped onto shadcn semantic variables in `globals.css`. Inter + Source Code Pro, focus ring #00684A 2 px, skip link, reduced motion.
- Placeholder landing page at `/` (`src/app/(marketing)/page.tsx`).
- AI smoke test script: `scripts/ai-smoke.mjs`.

### Deviations from the PRD
- Model string: the router rejects `deepseek-v4.1-1017`; the exact id is `deepseek/deepseek-v4.1-flash-1017` (PRD Sections 2 and 14 asked to confirm it in Phase 0).
- Next.js 16 renames `middleware.ts` to `proxy.ts`; route guards (Section 4) will live in `src/proxy.ts`.
- Browser Supabase client lives in `src/lib/supabase/` (Section 2 lists only the server folder).

### Open questions raised while reading the PRD (to settle before Phase 1)
1. Exclusion constraint on `(unit_id, tstzrange)` is bypassed when `unit_id` is null; proposal: every resource gets at least one `resource_units` row.
2. Domain-check trigger cannot read `NEXT_PUBLIC_DEMO_MODE`; proposal: mirror the flag in a DB settings row.
3. Missing transitions: student cancel from `pending_allocation` / `pending_approval` / `waitlisted`; a pending request whose slot starts with no decision.
4. Penalty debt has no `credit_ledger` kind.

### Next
Phase 1 — Foundation: migrations, `app_now()`, `log_event()`, RLS baseline, contracts, domain functions with tests, `transitionBooking()` skeleton, seed.
