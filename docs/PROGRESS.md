# ResourCity — progress

## Phase 4 — Time, fairness, credits (complete, 2026-10-29)

### Acceptance
- Migration 8 `time_fairness_credits` applied: `scheduler_tick()`, `offer_next()`, `free_units()`, the full Section 13 `queue_notifications()` (+ `notify`, `notify_staff`, `notify_admins`), `transition_booking()` v3, `report_owner_absent()`, `request_extension()` / `decide_extension()`, `request_emergency_credits()` / `decide_emergency_credits()`, `change_policy()`, `set_clock()`, helpers `policy_values()`, `ist()`, `academic_year()`. All service role only.
- `npm test` → 45 passed (adds capacity fill, batch ranking, policy diff). `tsc`, `eslint`, `next build` pass.
- Live: `node --env-file=.env.local scripts/phase4-check.mjs` against `next start` → 15 passed, walking the demo clock forward: the tick refuses calls without `CRON_SECRET`; only an Admin moves the clock, forward only, audited; **batch**: the seminar slot allocates at the cutoff (top request → pending Manager approval with its score, the other two waitlisted #1/#2 with "N eligible requests scored higher", rule "Batch allocation, policy v2", Prof. Kulkarni notified); **no-show**: Dev misses the court slot → `no_show`, hold released, Kabir offered (urgent notification), Tanvi moves up to #1; Kabir accepts; **overdue**: the laptop alerts at +1 h (student, Owner) and +6 h (Manager); a 3rd strike, then the 4th no-show forfeits the hold with an `auto_applied` penalty; **policy**: v3 with a diff, existing bookings stay on v2, a new request gets v3, Owners notified; a late return proposes a penalty under the booking's own v1; extension auto-approved, refused on a clash; Owner not present cancels with no strike; emergency credits → partial grant needs a reason → once per academic year; **escalation**: Owner silent 24 h → Manager (the Owner can no longer approve), Manager silent 24 h → Admin alert, never decided automatically; **Monday reset**: unused credits expire, the v3 allowance (120) arrives, a second tick is a no-op.
- `phase1-check` 16/16 (one assertion updated: notification titles now name the resource), `phase2-check` 12/12, `phase3-check` 13/13 still pass. `scripts/phase3-pages.mjs` also renders `/admin` (demo controls, emergency decisions), `/admin/policies` (editor), the wallet emergency form and the extension form.

### Built
- **Scheduler** (PRD 2): `POST /api/cron/tick` (Bearer `CRON_SECRET`, constant-time compare) → `runScheduler()` in `src/lib/server/scheduler.ts`: TypeScript batch allocation, then `scheduler_tick()` in PRD order: expired offers, no-shows, lapses, overdue/auto-complete, overdue alerts, reminders, escalation, dispute response expiry, weekly reset. An advisory lock keeps the cron and the Admin button from overlapping; each row runs in its own subtransaction, failures are reported and never block the rest. `worker/tick.mjs` + `render.yaml` for the Render cron.
- **Batch allocation** (PRD 8): re-runs `checkEligibility()` at the cutoff (drops with the reason), scores with `priorityScore()`, ranks with `rankRequests()`, fills capacity with `fillCapacity()`; top requests go to `pending_approval` (or `approved` on auto resources), the rest `waitlisted` in rank order. The breakdown stores rank and how many scored higher, never other students' data.
- **Waitlist offers**: `offer_next()` runs whenever a booking stops claiming a slot (cancel, no-show, expiry, rejection, return); pending approvals keep their claim. Accept window 10/60 min from policy; the student accepts on the booking page (expired offers refused).
- **No-shows and strikes** use the booking's own policy version; the over-limit no-show forfeits the hold and records an `auto_applied` penalty (appeals are Phase 5). Strike review now says when it lifts. **Owner not present** during the pickup window: audited against the org, booking cancelled, no strike.
- **Overdue**: `checked_out` past the end → `overdue` (handed over) or `completed` (door check-in). Alerts at +1/+6/+24 h; the Manager queue shows overdue 6 h+ (urgent at 24 h). Reminders: pickup 30 min before; returns 24 h and 2 h before for loans over a day, else 30 min. A late return proposes a penalty (late units × rate × multiplier, booking's policy version).
- **Escalation**: Owner → Manager after 24 h or 2 h before start; Manager → Admin after 24 h.
- **Extensions**: student form (new end, reason, note); max duration, bookable hours, unit conflict and extra credits checked; auto resources extend at once; otherwise the Owner/Manager approves or declines with a reason on the booking page; the extra cost is held on approval.
- **Credits**: Monday 00:00 IST reset and allowance in the tick (newly verified students get the full allowance at the next tick, closing the Phase 2 known issue). Emergency credits: wallet form (linked from the credits eligibility fix), Admin grant/partial/decline on the Admin home.
- **Policies**: editor on `/admin/policies` → live before/after diff → reason → new version; the diff (recomputed server-side) is the audit metadata.
- **Demo controls** on `/admin` (demo mode): +15 min, +1 h, +1 day, reset clock, run scheduler now, reset demo data. All audited.
- **Notifications** (Section 13): student status for every transition (titles name the resource), Owners on requests, decisions, no-shows, overdue and extensions, Managers when they approve or are escalated to, Admins on escalations and emergency requests, every Owner/Manager on policy changes. Links go to each recipient's own page.

### Decisions and deviations
1. **Late offers.** PRD 8 says an offer never runs past slot start + grace, but a no-show is only detected at start + grace, so that rule would make the PRD's own "a no-show releases the slot and offers it" impossible. Offers run to `min(now + window, end − 15 min)`; if that passes the original grace, the offered booking's pickup deadline moves to the offer expiry plus its grace. Waitlisted requests lapse 15 min before the slot ends (not at the start) so they can still be offered.
2. Reminders go straight to notifications with a dedupe key, not through audit events, so the audit log stays consequential.
3. Escalation moves `approver_role` to `manager`; overdue alerts reuse `escalation_level`/`escalated_at` (reset to 0 when a booking turns overdue). No schema change.
4. The weekly allowance goes to every verified non-Admin (staff can book as students). Unspent emergency grants also expire at the Monday reset.
5. Per-category caps are not editable in the policy editor yet (the default cap is). Emergency requests take no proof upload yet.
6. Batch capacity counts overlapping claims; exact when requests share one slot (marked `ponytail:`).

### Known issues / for the architect
- **The Render cron is not running yet.** Create it from `render.yaml` (or a Render cron job: schedule `* * * * *`, command `node worker/tick.mjs`, env `APP_URL`, `CRON_SECRET`) and add the same `CRON_SECRET` to Vercel. Until then "Run scheduler now" on `/admin` drives every job.
- Not yet clicked through in a browser on production; the live checks ran against `next start` locally on the production database.

## Phase 3 — Core happy path (complete, 2026-10-29)

### Acceptance
- Migration 7 `booking_flow` applied: `submit_booking()` (validate → insert → hold if approved → audit → notify, one transaction), `free_unit()`, `transition_booking()` now assigns a free unit on approve/offer (pending requests hold no unit), `record_condition()` (Owner-signed checklist + ≥ 3 photos under `condition-photos/{booking}/`, supervisor when required, then handover/return in the same transaction), `acknowledge_condition()`, `door_checkin()`. All service role only.
- `npm test` → 41 passed (adds bookable hours, submission routing, signed QR). `next build` passes.
- Live journey: `node --env-file=.env.local scripts/phase3-check.mjs` → 13 passed: students cannot call `submit_booking`; unverified refused; submit → pending with no unit or hold; duplicate refused; reject needs a reason; another org's Owner refused; approve assigns a unit and holds 10; handover needs 3 photos in the booking's folder; signed handover → checked_out; only the student acknowledges, once; return → Return OK charges 10, ledger `hold −10, release +10, charge −10`; timeline has all six events; instant meeting room + door check-in (wrong student and bad code refused); a full slot refuses a second auto-approve and waitlists at #1. `phase1-check` 16/16 and `phase2-check` 12/12 still pass.
- Pages: `scripts/phase3-pages.mjs` (against `next start`) renders all 18 Phase 3 pages as Riya, the Photography Club Owner and Prof. Mehta: slot summary, out-of-hours error, pickup QR, cancel/withdraw, door check-in, approval form with requester history, scan with a valid and a tampered code, handover with and without a scan, listing new/edit, handover desk.
- **Browser, production URL** (clock set to 10:00 IST by SQL, as PRD 18 allows): Owner lists "GoPro HERO action camera" → Riya finds it by search, picks 10:15 today → 10:15 tomorrow, sees 9 passing checks and the summary (6 credits, 94 after hold, Owner approval, 120 min grace), sends the request → Owner approves (6 held) → Riya's pickup QR renders (so `QR_SIGNING_SECRET` is set on Vercel) → Owner pastes the code into the scanner, sees the identity card, opens the handover, marks one item as an issue with a note, attaches 3 photos (uploaded to storage, shown back via signed URLs) → checked out → Owner records the return with 3 photos → Return OK (returned before the start, so 0 charged, 6 released) → Riya acknowledges both records; the timeline shows all seven events. Demo data re-seeded and the clock reset afterwards.
- Found and fixed in the run: the slot picker defaulted to :30 (rounded to the UTC hour, not IST); the decision panel mentioned "ask for more information", which is not built.

### Built
- **Request** (`/student/browse/[id]`): slot picker (GET form, campus time), full eligibility for that slot including availability and bookable hours, request summary (cost, hold, balance after hold, where it lands, cutoff, grace, no-show rule), purpose, exception reason when a rule is set to review. Submit lands as approved / pending approval (Owner or Manager) / waitlisted / pending allocation via `planSubmission()`.
- **Decisions** (booking detail, Owner and Manager): approve, waitlist (reason), reject (reason); Owners see "Waiting for Manager" on restricted requests. Requester status, badges, history counts and competing requests.
- **Pickup**: signed HMAC QR (`src/lib/domain/qr.ts`) encoding the Owner scan URL, valid 15 min before start → end of grace; `/owner/scan` (camera via `html5-qrcode`, paste fallback) → identity confirm (photo, name, slot) → handover screen with checklist OK/issue + note, guided shots padded to 3, supervisor, notes; photos upload from the browser. Student acknowledges on their booking page.
- **Return**: return QR / "Record return" → same checklist and shots → Return OK charges min(actual, booked), releases the rest.
- **Spaces**: printable door QR (`/owner/resources/[id]/door`), `/checkin/[token]` and an in-app `/student/scan`.
- **Student**: "I can't make it" (approved, before start, no strike) and withdraw for pending/waitlisted/offered.
- **Listing form** (`/owner/resources/new`, `/edit`): four templates by category (Other picks the closest), template fields, bookable hours, approval/allocation/cutoff, pricing with peak window or free, rules with block/review, badges, departments, years, org-only, PPE, safety notes, checklist and shots. Audited `RESOURCE_CREATED/UPDATED`.

### Decisions and deviations
1. Pickup moves the booking to `checked_out` when the Owner signs; the student acknowledges afterwards (both stamps kept on the record). Waiting for the student would leave the Owner stuck at the desk and needs a new actor on `handover`.
2. Bookable hours: the start and the end must each fall inside an opening window (pickup and return happen while open), so a 2-day camera loan over a night is allowed.
3. `submit_booking` logs actor `student` (the PRD table says System) so the timeline shows who asked.
4. One unit per request; quantity > 1 per request, "Ask for more info", attachments and the date/time filter on browse cards are not built yet.
5. The scanner lives under `/owner`; a Manager who is not also an Owner records returns from the booking page but cannot scan a pickup.
6. Editing a listing cannot change quantity or status; pause/maintenance with booking cancellation is Phase 6. Resource create + its audit event are two calls, not one transaction (marked `ponytail:`).
7. No notifications to Owners/Managers for new requests yet (Section 13 matrix is Phase 4).

### Known issues
- Fixed: Vercel functions ran in `iad1` (Washington) while Supabase is in `eu-west-1` (Ireland), so every query crossed the Atlantic. `vercel.json` now pins `dub1`. `scripts/timing.mjs`, warm signed-in pages from India: overview 2.4–2.6 s → 0.7–0.9 s, slot summary 2.7–3.3 s → 0.66–0.88 s, bookings 1.4–2.0 s → 0.49–0.64 s. Cold starts are still 1.5–3.7 s.
- A click made while a page is still streaming can be lost (forms need JS to submit). Revisit in the Phase 7 hardening pass.
- Fixed: booking pages now highlight Requests (Owner) or Decision queue (Manager) in the sidebar.
- Seeded demo accounts have no Google photo, so the scanner's identity card shows initials.

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
Phase 5 — trust workflows and AI (PRD 18): damage cases, penalty queue and no-show appeals, overrides, incidents, AI search parser and condition comparison.
