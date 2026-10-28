# ResourCity — progress

## Phase 1 — Foundation (complete, 2026-10-29)

### Acceptance
- 5 migrations applied to Supabase project `ikqokswliwpezlggbbjo` (`supabase/migrations/`).
- Seed loads cleanly: `select public.seed_demo();` → 15 accounts, 6 orgs, 10 resources (18 units), 113 bookings (96 completed over 30 days), 46 audit events.
- Domain tests: `npm test` → 26 passed (transition table, eligibility, priority score, grace, pricing, ledger, strikes, IST week start, and a check that the TS and SQL transition tables are identical).
- Live database check: `node --env-file=.env.local scripts/phase1-check.mjs` → 16 passed (demo logins, approval with credit hold + audit + notification, invalid transition, double-booking guard, student isolation, forbidden writes, audit immutability, anon lockout, password sign-up refused). Re-seed afterwards.

### Built
- **Schema** (PRD 5): every table, enums, `app_clock` + `app_now()`, btree_gist exclusion constraint `bookings_no_double_booking`.
- **State machine**: `booking_transitions` table + `transition_booking()` (validate → actor check → ledger → audit → notify, one transaction, service role only). TS mirror in `src/lib/contracts/booking.ts`; wrapper `transitionBooking()` in `src/lib/server/booking.ts`.
- **Audit**: inserts only via `log_event()`; UPDATE/DELETE blocked by trigger for every role.
- **Auth**: `handle_new_user()` trigger enforces `allowed_domains` unless `app_settings.demo_mode`; creates the profile from Google metadata. Profile columns locked with column grants.
- **RLS** on every table (PRD 15 matrix); anon has no table access and no function access.
- **Storage**: private buckets `id-proofs`, `certificates`, `condition-photos`, `incident-evidence` with path-based policies.
- **Contracts** (`src/lib/contracts/`): generated DB types, booking states/events/labels, policy schema + defaults, resource rule schemas, transition API shape.
- **Domain** (`src/lib/domain/`): eligibility + card state, priority score + ranking, grace, pricing (peak minutes in IST), ledger maths, strikes, IST time helpers.
- **Seed** (`public.seed_demo()`): every Section 17 account and situation. Demo password `DvitDemo@2026`.

### Decisions and deviations from the PRD (architect approved the four fixes)
1. Every resource gets at least one `resource_units` row (trigger), so the double-booking guard always has a unit.
2. `app_settings.demo_mode` mirrors `NEXT_PUBLIC_DEMO_MODE` for the domain trigger (seed sets it true).
3. Added transitions: student/system cancel from `pending_allocation`, `pending_approval`, `waitlisted`, `offered`; `lapse` → `expired` for pending/waitlisted requests whose slot starts; `allocate_drop` → `rejected`; `checked_out` → `completed` via `auto_complete` (door check-in spaces).
4. No `debt` ledger kind needed: penalties may take the balance below zero and the weekly reset expires only positive balances, so the next allowance absorbs the debt. Holds are negative ledger deltas, so available = sum(delta).
5. Added columns: `audit_events.org_id` + `subject_user_id` (RLS scoping), `profiles.suspended_until` + `verification_submitted_at`, booking escalation/exception/cutoff fields, `notifications.urgent`. Added table `org_restrictions` (damage outcome "restriction in this organisation").
6. `audit_events.org_id` / `policy_version_id` are plain columns, not foreign keys, so the append-only log never blocks a demo reset. "Reset demo data" will not truncate the audit log; it logs `DEMO_SEEDED`.
7. Password sign-ups through the Auth API are refused by the trigger (email provider stays on only for seeded demo accounts).
8. Extra fictional seed students (ishaan, meera, tanvi, rohan, dev) populate waitlists, disputes and history.
9. `policy_versions."values"` is quoted (reserved word); `late_penalty_multiplier` (default 2) is a new policy key, since the PRD names a late-penalty rate without a value.

### Known issues
- Seeded condition photos and certificates point to storage paths with no files yet; upload sample images before Phase 3 UI work.
- Seminar batch cutoff is 0–60 min after seeding (date_trunc to the hour); make it exactly 60 min when the Phase 4 scheduler lands.
- `queue_notifications()` is a skeleton (student only); full Section 13 matrix in Phase 4.

## Phase 0 — Setup (complete, 2026-10-29)
- Production URL: https://resour-city.vercel.app/ (auto-deploys from `main`).
- AI router smoke test passed: base URL `https://api.airouter.in/v1`, model `deepseek/deepseek-v4.1-flash-1017` (text HTTP 200 in 2188 ms, image HTTP 200 in 3607 ms). The PRD's `deepseek-v4.1-1017` is rejected by the router. Fallback vision model also passes: `deepseek/deepseek-v4-flash-vision-exp`.
- Next.js 16.4, Tailwind v4, shadcn/ui, zod 4, date-fns + date-fns-tz, @supabase/ssr. Next 16 renames `middleware.ts` to `proxy.ts`.

## Next
Phase 2 — Auth, shells, landing: Google OAuth callback, onboarding with ID upload, verification and role APIs, `src/proxy.ts` route guards, login demo panel, role app shells, status chips, timeline, landing v1. Needs the architect's Google Cloud + Supabase Auth setup (PRD 4, "Manual setup").
