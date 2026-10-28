# ResourCity — progress

## UI redesign (2026-10-29, between Phase 2 and Phase 3; architect request)

The architect supplied an HTML/CSS/JS mockup as the visual direction. The UI was rebuilt in that format in Next.js against our real backend and flows; the mockup's sample data and flows were not copied.

### Built
- **Design system:** new "campus green" palette in `src/styles/tokens.css` (pine, moss, leaf, cream, paper + status tones), every text pair checked at WCAG AA (≥ 4.5:1). DM Sans for UI, Instrument Serif for display headings, Source Code Pro for codes and times. Shared kit in `src/components/ui/kit.tsx` (page heading, panels, summary cards, tabs, empty states, `ComingNext`).
- **Shell:** dark sidebar per role area with live counts, workspace/role menu with sign-out, topbar with simulated-clock date, notification popover (latest 5, mark all read, `aria-live` count), mobile drawer. Each part streams in its own Suspense boundary.
- **Public:** landing (hero with product vignette, how it works, what we share, fairness, live stats that degrade to "—" if the database is unreachable, roles), split-screen login with demo role cards, onboarding with ID dropzone, pending page with progress steps.
- **Student:** overview (needs-your-action first, hero, wallet card, standing, picks, coming up), browse with search, category chips and "eligible for me / instant / free" filters, resource detail (full eligibility checklist from `checkEligibility()`, rules, bookable hours, condition checklist, request summary), My bookings with tabs, booking detail (score breakdown, timeline, credits, condition records, damage case), credits wallet (balance, holds, ledger, standing, emergency requests).
- **Owner:** desk overview, requests (needs review / waiting for Manager), handover desk tabs, resources. **Manager:** urgency-sorted decision queue (critical → urgent → normal, oldest first), safety and disputes, department insights (recorded hours per week and resource, on-time rate, no-shows). **Admin:** overview, verifications, people and roles (grant/revoke wired to `changeMembership`, with reasons and replacement), campus policies with version history, audit log with search and filters. Owners and Managers share a staff booking detail page.
- Read models: `src/lib/server/queues.ts` (owner desk, manager queue, admin queue, insights, inbox) and `src/lib/server/student.ts` (student snapshot, catalogue with eligibility per card). All reads go through RLS as the signed-in user.

### Decisions and deviations
1. **Palette changed from the PRD 16 MongoDB tokens** to the mockup's green family, at the architect's request. CLAUDE.md updated. Status chips still use colour + icon + text.
2. Resource covers are illustrated per category (no stock photos): the sandbox cannot reach image hosts, and real photos arrive with Owner uploads.
3. Actions whose server flow is a later phase (request submit, approve/reject, scanner, handover, dispute decisions, policy edit, CSV export) are shown disabled with a "Arrives in Phase N" note instead of being faked.
4. Card eligibility runs every slot-independent check; availability and duration are checked once a slot is picked, so a card never claims "Eligible" for a check it did not run (PRD 7).

### Verified
- `tsc`, `eslint` and `npm test` (31) pass; `next build` passes with Cache Components.
- Landing and login screenshotted at 1440 px and 390 px with no horizontal overflow; shell, drawer, popover and dashboard components checked on a throwaway preview route with sample data.
- **Not yet verified against the live database** from this environment (no Supabase access here): run the four demo logins on the Vercel preview.

## Phase 2 — Auth, shells, landing (code complete, 2026-10-29; Google sign-in awaits provider setup)

### Acceptance
- Migration 6 `account_actions` applied: `submit_verification()`, `decide_verification()`, `set_membership()`, `require_admin()` (service role only, one transaction each with audit event + notification); `queue_notifications()` extended for verification and role events; recipients may update only `notifications.read_at`.
- `npm test` → 31 passed (adds route-guard tests). `npx next build` passes with Cache Components.
- Live check: `node --env-file=.env.local scripts/phase2-check.mjs` → 12 passed (reject needs reason, non-admin refused, reject → resubmit → approve, ID photo only in own folder and only Admin reads it, photo deleted on decision, column locks, one pending request, role grant/revoke with audit diff + notification, last-Manager guard, notifications read-only except `read_at`). Re-seeds before and after. `phase1-check.mjs` still 16/16.
- Browser (production build): all four demo buttons land in `/student`, `/owner`, `/manager`, `/admin`; Owner/Manager see the role switcher; Admin rejects Om with a reason (empty reason shows an inline error).
- Guards with real sessions: pending Om → `/student`, `/student/request/*`, `/owner`, `/onboarding`, `/login` all redirect to `/pending`; `/student/browse` opens. Verified Kabir → `/pending`, `/onboarding`, `/manager` redirect to `/student`.
- Non-college account blocked: with `demo_mode` off, inserting a Google user with an `@gmail.com` email is refused by the trigger; the callback maps the error to "Use your @dvit.edu.in Google account."
- **Not yet verified: real Google sign-in.** Supabase `/auth/v1/settings` reports `google: false`, so the authorize URL returns "provider is not enabled". `mailer_autoconfirm` is also false (email confirmation still on; seeded demo logins are unaffected).

### Built
- `src/proxy.ts`: refreshes the Supabase session and applies `redirectFor()` (`src/lib/domain/access.ts`): signed in → onboarding → status → role area. Pages and server actions check again; the proxy is the redirect layer.
- `src/lib/server/viewer.ts` (`getViewer`, `requireViewer`, `loadViewer`), `src/lib/server/account.ts` (server actions: Google + demo sign-in, sign-out, onboarding, verification decision, role change, mark notifications read).
- `/auth/callback`, `/login` (demo panel in demo mode), `/onboarding` (ID photo uploaded from the browser straight into `id-proofs/{uid}/`), `/pending` (status or rejection reason + resubmit).
- App shell with role switcher, notification bell (unread count + `aria-live`), sign-out; `/notifications`; `/student` (bookings with status chips), `/student/bookings/[id]` (timeline), `/student/browse` (plain list), `/owner` and `/manager` (per-org booking counts by status), `/admin` (verification queue, oldest first, signed ID photo URL).
- Components: `StatusChip` (colour + icon + text, PRD 16), `Timeline`, `BookingList`.
- Landing v1: hero, how it works, roles, trust, live stats (cached 1 min, aggregates only), footer.

### Decisions and deviations
1. Rejection keeps `pending_verification`, stores the reason in `status_reason` and clears `verification_submitted_at`; `/onboarding` reopens for resubmission.
2. Staff and admin accounts skip student onboarding. Admin-only users have no Student area (Admins do not book, PRD 3).
3. Department is a fixed list (`DEPARTMENTS` in contracts) so it matches resource department restrictions exactly.
4. Role grant/revoke has its API (server action + SQL) but no Admin screen yet; that is Phase 6 "Organisations and roles".

### Known issues
- A student verified mid-week has 0 credits until the Monday allowance; decide in Phase 4 whether verification grants a pro-rated allowance.
- Seeded booking history has few audit events, so most old timelines read "No events yet."
- Danger chip (`#DB3030` on `#FFEAE5`, bold 12 px) is close to the 4.5:1 limit; recheck in the Phase 7 accessibility pass.

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
Phase 2 sign-off once Google sign-in is tested end to end (enable the Google provider in Supabase first). Then Phase 3 — core happy path (PRD 18): listing form, search + eligibility cards, request + approval, QR handover, return, timeline.
