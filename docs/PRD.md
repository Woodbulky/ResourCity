# ResourCity — Product Requirements Document

Oct 29, 2026 · @Harsh

## 0. Instructions for Claude Code

This PRD is the single source of truth for ResourCity. Build it phase by phase (Section 18), verify each phase, and commit and push to `main` after every phase, because the judges check the commit history.

- **Repository:** [github.com/Woodbulky/ResourCity](https://github.com/Woodbulky/ResourCity), branch `main`.
- **Supabase project:** ref `ikqokswliwpezlggbbjo` ([dashboard](https://supabase.com/dashboard/project/ikqokswliwpezlggbbjo)). Local Claude Code is already connected to it.
- **Architect:** the user. The lead session reports to the architect at every checkpoint in Section 18.

### Golden rules

1. Save this PRD as `docs/PRD.md` in the repo before Phase 0 work starts. Create `CLAUDE.md` from the template below.
2. Build only what the current phase lists. Do not start the next phase until the current phase's acceptance checks pass.
3. **Commit and push to `main` after every completed task and at the end of every phase.** Message format: `phase-N: <what changed>`. Never force-push, never rewrite history, never squash old commits.
4. Only the lead session runs git. Teammates tell the lead when a task is done; the lead commits and pushes.
5. Update `docs/PROGRESS.md` at the end of each phase: what is done, deviations from this PRD, known issues, what is next.
6. Shared types live only in `src/lib/contracts/`. Change the contract first, then the code, then tell the other teammates.
7. Every booking status change goes through one server function, `transitionBooking()`. It validates the transition, writes the audit event, updates credits and queues notifications. The UI never writes a status directly.
8. Every time comparison uses the simulated clock: `app_now()` in SQL and `appNow()` in TypeScript. Never `now()`, `new Date()` or `Date.now()` for business logic.
9. Security lives in the backend: RLS on every table, the service-role key only on the server. A hidden button is not a permission check.
10. A reason is mandatory for every reject, cancel, override, penalty, suspension, role change and policy change.
11. AI is advisory only. It never approves, rejects, decides damage or applies penalties.
12. Ask the architect before changing the state machine, changing the schema shape after Phase 1, adding a heavy dependency, or dropping a must-have feature.
13. If an integration blocks you for more than 20 minutes, stub it behind a flag, record it in `PROGRESS.md` and move on.
14. Demo data is fictional. Never commit secrets: `.env.local` is git-ignored, `.env.example` is committed.

### CLAUDE.md template

```markdown
# ResourCity — rules for every Claude Code session

Read docs/PRD.md before working. Current phase and status: docs/PROGRESS.md.

- Stack: Next.js (App Router, TypeScript) + Tailwind on Vercel; Supabase (Postgres, RLS, Auth with Google, Storage); Render cron worker; AI via AI router (OpenAI-compatible).
- Only the lead runs git. Commit + push to main after every task and every phase: `phase-N: <change>`.
- Contracts: src/lib/contracts is the only place for shared types, booking states and API shapes.
- All status changes: transitionBooking() only. It writes audit_events and queues notifications.
- Time: app_now() / appNow() only. Never now(), new Date() or Date.now() in business logic.
- RLS on every table. Service-role key server-side only. Reasons required for consequential actions.
- AI = suggestions with confidence. Never decides access, damage or penalties.
- Folder ownership: lead = contracts, migrations, domain; backend = app/api, supabase functions; frontend = app pages, components; worker = worker/, lib/ai.
- Palette: MongoDB light theme tokens in src/styles/tokens.css. Never #00ED64 as text on white.
- Stuck > 20 min: stub behind a flag, note it in PROGRESS.md, continue.
```

## 1. Product overview

ResourCity lets one college's departments, labs, clubs and facilities lend underused spaces and equipment to verified students, with eligibility gates, explainable fair allocation, credit limits, QR handovers, photo condition records, human-reviewed disputes and a complete audit trail.

- **Hackathon:** 48-hour single-round build for the problem statement "Unlock Underused Equipment and Spaces".
- **Use case:** a single institution with many owning organisations. Demo institution: Deccan Valley Institute of Technology (DVIT), Pune, a fictional college with domain `dvit.edu.in`.
- **Users:** Students borrow. Owners (club leads, lab in-charges) list and hand over resources. Managers (faculty, HODs) handle restricted approvals, exceptions, disputes, penalties and incidents. Admins verify users, grant roles and set global policy.

### Why it beats an ordinary booking system

- Students see whether they qualify, and why, before they request.
- High-demand slots are allocated by a published, explainable priority score, not first click.
- A weekly credit allowance stops any one person from monopolising resources.
- Every handover and return is a QR scan plus guided condition photos, signed by both parties.
- AI flags possible damage; a human decides, after the student has had a chance to respond.
- Policies are versioned; each booking keeps the policy version it was approved under.
- Every consequential action has an actor, a reason and an audit record.

### Success criteria (mapped to judging)

| Judging criterion | Points | What proves it in ResourCity |
| --- | --- | --- |
| Understanding of the problem | 15 | Specific campus use case, eligibility and trust rules per resource type, project doc evidence |
| Strength of the core solution | 20 | One focused lifecycle that ends in a clear outcome for both student and owner |
| Working end-to-end product | 20 | A judge completes listing → request → approval → QR pickup → return → history alone, using demo logins |
| Technical depth and reliability | 15 | Single state machine, RLS, DB-level double-booking guard, worker jobs, versioned policies |
| Trust, safety and accountability | 10 | Verification, badges, two-party condition records, disputes with student response, append-only audit |
| Fair allocation and accessibility | 10 | Batch allocation with score breakdown, credits, no-show rules, accessible UI |
| Originality and real-world potential | 10 | Underused-resources report, emergency credits, policy versioning, door QR for spaces |

### Non-goals for the hackathon

Real money or payment gateways, multiple institutions, native mobile apps, a separate Supervisor role, per-permission role configuration, two-admin approval, Hindi or Marathi UI. Each is listed as future scope in Section 19.

## 2. Tech stack, environments and deployment

Next.js on Vercel, Supabase for data, auth and storage, a Render cron worker that ticks every minute, and DeepSeek V4.1 through the AI router.

| Layer | Choice | Notes |
| --- | --- | --- |
| App | Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui | Server actions and route handlers for all writes |
| Validation | zod | Every API input and every AI output is parsed with zod |
| Database | Supabase Postgres | RLS on every table; `btree_gist` for the double-booking constraint |
| Auth | Supabase Auth: Google provider + email/password for seeded demo accounts only | Domain restriction enforced in the database (Section 4) |
| Storage | Supabase Storage | Private buckets: `id-proofs`, `certificates`, `condition-photos`, `incident-evidence` |
| Scheduler | Render cron job, every minute | Calls `POST /api/cron/tick` with `CRON_SECRET`; all job logic lives in the Next.js app |
| AI | AI router, OpenAI-compatible chat completions, model `deepseek-v4.1-1017` | Vision via `image_url` data URLs; confirm exact model string and base URL in Phase 0 |
| QR | `qrcode` to render, `html5-qrcode` to scan in the browser | Owner scanner works on a phone camera |
| Dates | `date-fns` + `date-fns-tz`, time zone `Asia/Kolkata` | Weekly credit reset and display in IST |
| Email (optional) | Gmail SMTP app password via `nodemailer`, sent from the tick job | In-app notifications are primary |
| Hosting | Vercel (app), Render (cron), Supabase (data) | Vercel auto-deploys from `main` |

### Environment variables (`.env.example`)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only, never NEXT_PUBLIC
AI_ROUTER_BASE_URL=
AI_ROUTER_API_KEY=                # server only
AI_MODEL=deepseek-v4.1-1017
NEXT_PUBLIC_DEMO_MODE=true
ALLOWED_EMAIL_DOMAINS=dvit.edu.in
QR_SIGNING_SECRET=
CRON_SECRET=
APP_TIMEZONE=Asia/Kolkata
GMAIL_USER=                       # optional
GMAIL_APP_PASSWORD=               # optional
```

### Folder structure and ownership

```text
src/app/(marketing)/          landing page                         frontend
src/app/(auth)/               login, onboarding, pending           frontend
src/app/(app)/student|owner|manager|admin/   role dashboards       frontend
src/app/api/                  route handlers, cron tick            backend
src/lib/contracts/            shared types, states, API shapes     lead
src/lib/domain/               state machine, eligibility, fairness, credits, grace, pricing (pure functions + tests)   lead
src/lib/server/               Supabase server clients, transitionBooking(), audit, notifications   backend
src/lib/ai/                   AI router client + prompts + zod schemas   worker/AI
src/components/               UI kit, status chips, timeline, scanner    frontend
supabase/migrations/          SQL migrations                       lead
supabase/seed.sql             demo data                            lead
worker/                       Render cron script                   worker/AI
docs/                         PRD.md, PROGRESS.md, SUBMISSION.md   lead
```

### Scheduler design

The Render cron job is a 10-line script that calls `POST /api/cron/tick` every minute with the `CRON_SECRET` header. The tick route runs, in order: batch allocations past cutoff, expired waitlist offers, no-show detection, overdue marking and reminders, escalation timeouts, dispute response expiry, and the weekly credit reset. Every job reads `app_now()`, so the admin time-skip works. Admins also get a "Run scheduler now" button in demo mode.

## 3. Roles and permissions

Four roles: Student, Owner, Manager, Admin. Everyone signs up as a Student; Owner and Manager are granted only by an Admin and are scoped to one organisation each, so a user can hold several roles at once.

- **Owner** runs resources and everyday bookings for their organisation.
- **Manager** is the human-oversight layer for their organisation: restricted approvals, exceptions, disputes, penalties, incidents. Full Manager powers inside their organisation, none outside it.
- **Admin** controls platform access and configuration. Admins do not approve ordinary bookings.
- **Supervisor/Lab Staff** is future scope; supervised check-ins are done by the Owner for now.

| Capability | Student | Owner (own org) | Manager (own org) | Admin |
| --- | --- | --- | --- | --- |
| Browse resources | Yes (also when pending) | Yes | Yes | Yes |
| Request bookings | Verified only | Yes, as a student | Yes, as a student | No |
| List and edit resources | No | Yes | View | View |
| Approve ordinary requests | No | Yes | Yes | No |
| Approve restricted requests and exceptions | No | No (sees "Waiting for Manager") | Yes | Escalations only |
| QR handover and return, condition records | Acknowledge | Yes | Yes | No |
| Verify training certificates | No | For badges their org issues | For badges their org issues | No |
| Report damage | No | Yes | Yes | No |
| Decide disputes and confirm penalties | Respond only | No | Yes, unless they filed the report | Conflict-of-interest cases |
| Override a recommendation | No | No | Yes, with reason | No |
| Report safety incident | Yes | Yes | Yes | Yes |
| Mark resource unsafe / restore | No | Flag for review | Yes | Yes |
| Verify users, grant or revoke roles | No | No | No | Yes |
| Define badge types, global policies | No | No | No | Yes |
| Platform-wide suspension | No | No | Org-level restriction only | Yes |
| Approve emergency credits | Request only | No | No | Yes |
| Read audit log | Own bookings | Own org | Own org | All (read and export only) |
| Edit or delete audit records | No | No | No | No |
| Demo controls (time-skip, reset) | No | No | No | Yes, demo mode only |

**Conflict of interest:** whoever filed a damage report cannot decide that dispute. It goes to another Manager of the organisation, or to an Admin if there is none.

**Enforcement:** every permission above is enforced by RLS policies and server-side checks of `memberships`. Helper SQL functions: `is_admin()`, `is_owner_of(org_id)`, `is_manager_of(org_id)`.

## 4. Authentication, onboarding and verification

Real users sign in with Google through Supabase; seeded demo accounts use email and password behind the demo-mode flag, so judges get one-click role logins.

### Sign-in

- **Continue with Google** is the only sign-in for real users. Pass `hd=<college domain>` as a hint to Google's account picker; it is not security.
- **Domain enforcement:** a trigger on `auth.users` rejects any email whose domain is not in `allowed_domains`. The UI checks first and shows "Use your @dvit.edu.in Google account" instead of a raw database error.
- **Demo mode** (`NEXT_PUBLIC_DEMO_MODE=true`): the domain check accepts any Google account and lands it as a `pending_verification` student, so a judge can see the real signup flow.
- **Demo panel** on `/login`, demo mode only: buttons "Student — Riya", "Owner — Photography Club", "Manager — Prof. Mehta", "Admin". Each signs in a seeded email/password account. The shared demo password goes in the testing instructions.
- No passwords, password resets or confirmation emails for real users.

### Flow

1. Continue with Google → Supabase callback `/auth/callback` → a trigger creates the `profiles` row (name, email, avatar from Google).
2. `/onboarding` (forced until complete): department, year (1–4), roll number, optional phone, ID card photo upload.
3. `/pending`: the student can browse resources and see verification status, or the rejection reason and how to resubmit.
4. Admin verification queue, oldest first: verify, or reject with a reason. No duplicate pending requests per user. The ID photo is deleted from storage on either decision.
5. Verified students can request bookings. Role-based redirect after login; users with several roles get a role switcher in the navbar.

### Account states

| State | Can do |
| --- | --- |
| `pending_verification` | Log in, browse, complete onboarding |
| `verified` | Everything a Student can do |
| `suspended` | Log in, view own history and the suspension reason; cannot request |

### Route guards

Middleware checks, on every protected route: signed in → onboarding complete → account status → role for that area. A pending user typing `/student/request` lands on `/pending`.

### Manual setup for the architect (not Claude Code)

1. Google Cloud Console: project "ResourCity", OAuth consent screen External with scopes `openid`, `email`, `profile` only, then **Publish to production** (Testing mode blocks everyone not on the test-user list).
2. Credentials → OAuth client ID (Web): JavaScript origins `http://localhost:3000` and the Vercel URL; redirect URI = the Supabase callback `https://ikqokswliwpezlggbbjo.supabase.co/auth/v1/callback`.
3. Supabase → Authentication → Providers → Google: enable, paste client ID and secret.
4. Supabase → Authentication → URL Configuration: Site URL = Vercel production URL; redirect URLs `http://localhost:3000/**` and Vercel preview URLs.
5. Supabase → Email provider stays enabled (for demo accounts), with confirmation off.

## 5. Data model and booking state machine

The booking state machine is the core of the product: every feature reads from it, and only `transitionBooking()` may move a booking between states.

### Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `allowed_domains` | College email domains | `domain` |
| `profiles` | One row per user | `id`, `full_name`, `email`, `avatar_url`, `department`, `year`, `roll_number`, `status`, `status_reason`, `is_admin`, `onboarding_complete`, `id_proof_path` |
| `organizations` | Clubs, labs, departments, facilities | `id`, `name`, `type` |
| `memberships` | Org-scoped roles | `user_id`, `org_id`, `role` (owner/manager), `granted_by`, `reason` |
| `badge_types` | Training/qualification definitions | `id`, `name`, `issuing_org_id`, `validity_days` |
| `user_badges` | A student's badge claims | `user_id`, `badge_type_id`, `status` (pending/verified/rejected/expired/revoked), `certificate_path`, `issued_at`, `expires_at`, `verified_by`, `ai_extraction` |
| `resources` | Listings | `org_id`, `category`, `form_template`, `name`, `description`, `location`, `photos`, `quantity`, `status`, `approval_mode`, `allocation_mode`, `batch_cutoff_hours`, `eligibility` (jsonb), `booking_rules` (jsonb), `safety_rules` (jsonb), `category_fields` (jsonb), `checklist` (jsonb), `base_rate`, `rate_unit`, `peak_multiplier`, `replacement_value`, `estimated_current_usage`, `door_qr_token` |
| `resource_units` | Physical units when quantity > 1 | `resource_id`, `label`, `status` |
| `availability_windows` / `blackouts` | Bookable hours, closed dates | `resource_id`, `weekday`, `start_time`, `end_time` / `starts_at`, `ends_at`, `reason` |
| `policy_versions` | Versioned global policy | `version`, `values` (jsonb), `created_by`, `reason`, `created_at` |
| `bookings` | Requests and bookings | `resource_id`, `unit_id`, `user_id`, `start_at`, `end_at`, `status`, `purpose_category`, `purpose_text`, `purpose_verified`, `attachments`, `priority_score`, `score_breakdown`, `waitlist_position`, `offer_expires_at`, `policy_version_id`, `credit_hold`, `credit_charged`, `grace_minutes`, `picked_up_at`, `returned_at`, `approver_role` |
| `extension_requests` | Extension asks | `booking_id`, `new_end_at`, `reason`, `status`, `decided_by`, `decision_reason` |
| `condition_reports` | Check-out and return records | `booking_id`, `phase` (checkout/return), `checklist_results`, `photos`, `notes`, `owner_signed_by`, `student_ack_at`, `ai_analysis` |
| `damage_cases` | Damage disputes | `booking_id`, `reported_by`, `description`, `severity`, `status`, `student_response`, `response_deadline`, `assigned_to`, `outcome`, `credits_deducted`, `decision_reason` |
| `penalties` | Proposed and final penalties | `booking_id`, `kind` (late/no\_show/damage), `proposed_amount`, `final_amount`, `status` (proposed/confirmed/reduced/waived/auto\_applied/appealed), `decided_by`, `reason` |
| `incidents` | Safety incidents | `resource_id`, `booking_id`, `reported_by`, `occurred_at`, `location`, `description`, `evidence`, `severity`, `status`, `resolution` |
| `credit_ledger` | Every credit movement | `user_id`, `delta`, `kind` (allowance/hold/release/charge/penalty/forfeit/emergency\_grant/reset\_expiry), `booking_id`, `week_start`, `note` |
| `emergency_credit_requests` | Urgent credit asks | `user_id`, `booking_id`, `amount`, `reason`, `urgency`, `proof_path`, `status`, `granted_amount`, `decided_by`, `decision_reason` |
| `notifications` | In-app inbox | `user_id`, `type`, `title`, `body`, `link`, `dedupe_key`, `read_at`, `email_status` |
| `audit_events` | Append-only history | `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `from_state`, `to_state`, `reason`, `metadata`, `policy_version_id`, `created_at` |
| `app_clock` | Simulated clock, one row | `offset_seconds` |

- **Double-booking guard:** a Postgres exclusion constraint on `bookings` using `(unit_id, tstzrange(start_at, end_at))` for statuses that hold a slot (approved, offered, checked\_out, overdue). Requires `btree_gist`.
- **Balances** are computed from `credit_ledger`: available = sum of deltas − active holds. Never store a balance column.
- **No-show strikes** are computed: count of `no_show` bookings in the last 30 days by `app_now()`.
- **`app_now()`** returns `now() + offset_seconds` from `app_clock`. Use it in every default, constraint check and job.

### Booking states

| State | Meaning | Student label |
| --- | --- | --- |
| `pending_allocation` | Batch-mode request waiting for the decision cutoff | Allocation on {cutoff time} |
| `pending_approval` | Waiting for Owner, or Manager if `approver_role = manager` | Pending approval |
| `waitlisted` | Eligible but no slot | Waitlisted #n |
| `offered` | Slot freed, offered to this student until `offer_expires_at` | Slot offered — accept by {time} |
| `approved` | Slot held, credits on hold | Approved — awaiting pickup |
| `checked_out` | Picked up or checked in | Currently borrowed |
| `overdue` | Past `end_at`, not returned | Overdue |
| `returned` | Returned, condition recorded, decision pending | Returned |
| `under_review` | Damage case open | Returned — under review |
| `completed` | Closed, credits settled | Completed |
| `rejected` | Declined with reason | Rejected |
| `cancelled` | Cancelled by student, owner or system, with reason | Cancelled |
| `no_show` | Not collected within grace | No-show |
| `expired` | Offer or allocation lapsed | Expired |

### Transitions

| From | Event | To | Actor |
| --- | --- | --- | --- |
| (new) | submit, instant mode, auto-approve, slot free | `approved` | System |
| (new) | submit, instant mode, needs approval, slot free | `pending_approval` | System |
| (new) | submit, slot taken | `waitlisted` | System |
| (new) | submit, batch mode | `pending_allocation` | System |
| `pending_allocation` | cutoff reached, ranked into capacity | `approved` or `pending_approval` | System |
| `pending_allocation` | cutoff reached, outside capacity | `waitlisted` | System |
| `pending_approval` | approve / reject / waitlist | `approved` / `rejected` / `waitlisted` | Owner or Manager |
| `waitlisted` | slot frees up, top of list | `offered` | System |
| `offered` | accept / ignore past expiry | `approved` / `expired` | Student / System |
| `approved` | "I can't make it" before start, or owner cancel | `cancelled` | Student / Owner |
| `approved` | QR handover or door check-in | `checked_out` | Owner + Student / Student |
| `approved` | grace period ends | `no_show` | System |
| `checked_out` | `end_at` passes | `overdue` | System |
| `checked_out` / `overdue` | return scan + condition record | `returned` | Owner |
| `returned` | return OK | `completed` | Owner |
| `returned` | damage reported | `under_review` | Owner |
| `under_review` | dispute decided | `completed` | Manager |
| any active state | platform suspension | `cancelled` (except `checked_out`/`overdue`, which must still be returned) | Admin |

`transitionBooking(bookingId, event, actor, payload)` rejects any pair not in this table, requires a reason where Section 0 says so, writes one `audit_events` row, applies credit ledger changes and queues notifications, all in one database transaction.

## 6. Resource listing

Only Owners list resources, always on behalf of their organisation; the form changes by category through four form templates, and every rule the Owner sets is later enforced by eligibility, approval, handover and fairness.

### Categories and form templates

| Display category | Form template | Template-specific fields |
| --- | --- | --- |
| Classrooms and seminar halls | Space | Seating capacity, indoor/outdoor, facilities (projector, AC, mic) |
| Meeting rooms and shared facilities | Space | Seating capacity, facilities |
| Sports grounds and courts | Space | Capacity, outdoor, surface/type, lighting |
| Laboratories and workshops | Lab / Workshop | Number of stations, software or equipment available, supervision required |
| Computers and electronic equipment | Portable equipment | Included accessories, quantity, replacement value |
| Photography and media equipment | Portable equipment | Included accessories, quantity, replacement value |
| Sports equipment | Portable equipment | Kit contents, quantity, replacement value |
| Machines (CNC, laser cutter, 3D printer) | Machine | Training badge, supervision required, safety notes, PPE |
| Other institution-approved resources | Closest template, chosen by the Owner | As per template |

### Common fields (every listing)

- Name, description, photos, location, quantity (creates `resource_units` when > 1).
- Availability windows by weekday and blackout dates with reasons.
- Status: `active`, `paused`, `under_maintenance`, `unsafe` (unsafe is set only through the incident flow).
- Approval mode: `auto` (approve if eligible and the slot is free) or `owner` or `manager`.
- Allocation mode: `instant` (first valid request) or `batch` (scored at a decision cutoff, default 24 hours before the slot).
- Pricing: base rate, rate unit (hour/day), peak multiplier, or "free".
- Estimated current usage before listing: rarely / weekly / daily. Feeds the underused-resources report.
- **Condition checklist:** named items (e.g. body, lens, 2 batteries, charger, SD card, bag) plus **guided photo shots** (e.g. front, back, lens close-up, all accessories laid out). The same list and shots are used at check-out and return.
- Spaces get a printable door QR (`door_qr_token`) for self check-in.

### Rules: two groups, each rule set to block or to review

For every rule the Owner chooses whether breaking it **blocks** the request or **sends it for review** (an exception request).

| Booking rules | Safety and approval rules |
| --- | --- |
| Maximum booking duration | Manager approval required |
| Maximum active bookings per student | Supervision required at handover |
| Credit cost (from pricing) | Required training badges |
| Cancellation window (default: free until slot start) | Restricted access: departments, years, org membership |

### Default caps (Owners can be stricter, never looser than global policy)

| Resource type | Max active bookings | Max duration | Extra rule |
| --- | --- | --- | --- |
| Classroom | 2 | 4 hours | Department priority where applicable |
| Seminar hall | 1 | 4 hours | Manager approval, batch mode |
| Cricket ground | 1 | 2 hours | One person books for the team |
| Badminton court | 2 | 60 minutes | Peak multiplier 5–9 pm |
| DSLR camera | 1 unit | 48 hours | Photography Basics badge |
| Laptop | 1 | 48 hours | Return confirmation required |
| Oscilloscope | 1 unit | 4 hours | ECE Lab Safety badge |
| CNC machine | 1 slot | 2 hours | CNC Safety badge, Manager approval, supervision, batch mode |
| Sports equipment kit | 2 kits | 24 hours | Condition record required |
| GPU workstation | 1 slot | 4 hours | Verified project purpose, batch mode |

### Editing a live listing

Changes apply to new requests only. If an Owner pauses a resource or marks it under maintenance, approved future bookings are cancelled with the reason, credits are released and affected students are notified and offered the waitlist for a similar resource.

## 7. Discovery, search and eligibility

Students see whether they qualify, and exactly why not, on every result card before they request; ineligible requests are never submitted.

### Search

- One search bar for keywords and natural language: "camera for tomorrow's college event", "badminton court this evening for two", "GPU workstation for an ML project".
- **The AI only parses; the database decides.** The query goes to the AI parser (Section 14), which returns structured filters: category, keywords, date, start/end time, duration, quantity, capacity. A normal SQL query then applies availability and eligibility. If the parser is unsure about a date or duration, the UI asks the student instead of guessing.
- Hackathon filters: category, date and time, organisation, "eligible for me", approval type, credit cost (including free).
- Each result explains the match in one line, e.g. "Camera · available tomorrow 10 am–6 pm · 20 credits/day".

### Eligibility engine

One pure function, `checkEligibility(student, resource, slot)`, returns a list of checks. Each check is `pass`, `review` or `block`, with a reason and a fix.

| Check | Example block message | Fix shown |
| --- | --- | --- |
| Account verified | "Your account is awaiting verification." | Link to `/pending` |
| Not suspended | "Booking privileges suspended until 5 Nov: repeated late returns." | Contact Manager |
| Required badge valid | "CNC Safety Training missing." / "Badge expired on 12 Oct." | Upload certificate / next session date |
| Restricted access | "Open to ECE students only." | None |
| Max active bookings | "You already hold 1 of 1 allowed bookings for cameras." | Return or cancel the existing booking |
| Max duration | "Max 48 hours; you asked for 72." | Shorten, or request an exception (review) |
| Credits | "Needs 40 credits; you have 25 available." | Request emergency credits |
| No-show strikes | "3 no-shows in 30 days: requests need Manager review until 12 Nov." | Review path |
| Slot available | "Taken 2–4 pm." | Join waitlist, or see nearest free slots |

### Card states

| State | When | Example line |
| --- | --- | --- |
| Eligible | All checks pass, auto-approve | "Eligible. Instant approval." |
| Eligible, approval required | Checks pass, Owner or Manager must approve | "Eligible. CNC Safety Training verified. Manager approval required." |
| Action required | A fixable requirement is missing or pending | "Upload your Photography Basics certificate to book." |
| Not eligible | A mandatory requirement is not met | "Open to final-year students only." |
| Unavailable | No unit or slot available | "Fully booked today. Join waitlist (2 waiting)." |

Never show "Eligible" if any check could not be completed.

### Request form

1. Pick a slot on the availability calendar (and a quantity for multi-unit resources).
2. Purpose category (academic deadline, registered project or research, approved club activity, personal) plus a short description and an optional attachment. Purpose priority counts only after an Owner or Manager verifies the attachment.
3. Summary before submit: credit cost, hold amount, balance after hold, approval path, allocation mode and cutoff time, grace period, the no-show rule ("a 4th no-show in 30 days forfeits the hold").
4. A rule set to "review" turns the submit button into **Request exception**, which goes to the Manager with the student's reason.

## 8. Fairness and allocation

Low-demand resources go first-come-first-served; high-demand resources collect requests until a cutoff and then allocate by a published 100-point priority score that every student can see broken down.

### Two allocation modes

- **Instant:** the first valid request takes the slot (auto-approved or sent for approval). Later requests join the waitlist.
- **Batch:** requests for a slot sit in `pending_allocation` until the decision cutoff (default 24 hours before the slot, set per resource). The tick job then scores and ranks them, fills capacity, and waitlists the rest in rank order. After the cutoff, leftover capacity becomes first-come-first-served. Default batch resources: seminar hall, CNC machine, GPU workstation, badminton court at peak hours.

### Allocation procedure (batch)

1. Re-run eligibility for every request; drop failures with a reason.
2. Apply hard caps (active bookings, duration).
3. Compute each request's priority score.
4. Rank by score; ties go to fewer completed booking hours in the category, then the earlier request.
5. Fill capacity. For resources needing approval, the top requests go to `pending_approval` with the score as a recommendation; the approver can override only with a reason.
6. Store `priority_score`, `score_breakdown` and the rule used on every booking; write the audit events.

### Priority score (100 points)

| Factor | Max | Rule |
| --- | --- | --- |
| Recent usage | 40 | Fewer completed hours in this category in the last 30 days → more points |
| Previous allocations | 25 | Fewer successful allocations for this resource in the last 30 days → more points |
| Recent unsuccessful requests | 20 | More rejections or lost allocations in the last 30 days → more points (rewards the unlucky, not early clickers) |
| Verified purpose | 15 | From the purpose table, only after an Owner or Manager verifies proof |

```latex
\text{usage} = 40 \times \left(1 - \frac{\min(h,\ H_{cap})}{H_{cap}}\right)
```

```latex
\text{allocations} = 25 \times \left(1 - \frac{\min(a,\ A_{cap})}{A_{cap}}\right)
```

```latex
\text{unsuccessful} = 20 \times \frac{\min(u,\ 3)}{3}
```

Here h = completed hours in the category, a = successful allocations, u = unsuccessful requests, all over the last 30 days by `app_now()`. Category caps H\_cap and A\_cap live in the global policy (defaults: 20 hours, 4 allocations). If a cap is missing or zero, use the default; never divide by zero.

| Purpose (verified) | Points |
| --- | --- |
| Approved academic deadline or institutional priority | 15 |
| Registered academic project or research | 10 |
| Approved club activity or event | 5 |
| Personal or recreational, or unverified | 0 |

Auto-approve resources always score purpose as 0, because nobody verifies it.

### What the student sees

> You're number 2 on the waitlist. Your request scored 72/100. Recent usage 35/40 · Previous allocations 20/25 · Unsuccessful requests 12/20 · Verified purpose 5/15. One eligible request scored higher. Rule: batch allocation, policy v3.

Never show another student's name, history or score breakdown. Manager overrides appear to the affected student as "A Manager gave priority to another request: {category of reason}".

### Waitlist offers

When a slot frees up (cancellation, no-show, rejection), the top waitlisted student moves to `offered`. Accept window: 10 minutes for slots of 2 hours or less, 60 minutes for longer ones, and never past slot start plus grace. If the window lapses, the booking becomes `expired` and the next student is offered.

### Overrides

A Manager can override any recommendation with a mandatory reason. The `MANAGER_OVERRIDE` audit event stores the original recommendation, final decision, actor, timestamp and reason. Override counts per Manager appear in Admin insights as a signal to review, never as an accusation.

## 9. Credits

Every verified student gets 100 credits a week; bookings hold credits at approval and charge the actual cost at return. Credits have no cash value, cannot be bought or transferred, and double as the anti-monopolisation limit.

### Allowance

- 100 credits per verified student per week, granted every Monday 00:00 IST by the tick job (`allowance` ledger entry).
- Unused credits expire at the reset (`reset_expiry` entry). Active holds are not touched by the reset.
- The allowance is a versioned global policy value the Admin can change.

### Pricing

```latex
\text{cost} = \text{base rate} \times \text{duration units} \times \text{demand multiplier}
```

Demand multiplier: 1.0 normally, the resource's `peak_multiplier` (default 1.5) inside its published peak window. Both are shown on the card and in the request summary. No dynamic pricing in version one. Owners can mark a resource free.

| Category | Base rate |
| --- | --- |
| Classroom | 5 credits/hour |
| Seminar hall | 15 credits/hour |
| Sports ground or court | 10 credits/hour |
| Sports equipment | 2 credits/day |
| DSLR camera | 10 credits/day |
| Laptop | 8 credits/day |
| Oscilloscope | 5 credits/hour |
| CNC machine | 20 credits/hour |
| GPU workstation | 8 credits/hour |
| Meeting room | Free |

### Ledger flow

| Moment | Ledger entries |
| --- | --- |
| Request submitted | None; only a balance check |
| Approved (or offer accepted) | `hold` of the estimated cost |
| Rejected, expired, or cancelled before slot start ("I can't make it") | `release` of the full hold, no strike |
| Owner cancels or resource paused | `release` of the full hold |
| Returned and completed | `charge` = cost of min(actual, booked) duration; `release` of the rest. Returning early saves credits. |
| No-show (strikes 1–3 in 30 days) | `release` of the full hold, strike recorded |
| No-show (4th in 30 days) | `forfeit` of the hold, automatic and pre-announced, appealable to a Manager |
| Late return or damage | Penalty proposed; `penalty` entry only after a Manager confirms (Section 11) |

Available balance = sum of ledger deltas − active holds. A penalty can take the balance down to 0; any remainder is recorded as debt and deducted from the next weekly allowance.

### Emergency credits

- Shown when eligibility blocks on credits: **Request emergency credits**.
- Form: linked booking and slot, reason, urgency, optional proof (faculty email, deadline notice), amount (pre-filled with the shortfall).
- Lands in the Admin's action queue. The Admin approves fully or partially, or rejects with a reason.
- **One-time grant**, one per student per academic year, capped by a global policy limit. Free credits, not an advance.
- The Admin grants credits only: the booking still goes through normal eligibility and Owner/Manager approval, and joins the waitlist if the slot is taken. No queue jumping.
- Emergency grants per student and organisation appear in Admin insights.

## 10. Booking lifecycle: approval, pickup, no-shows, return, extensions, overdue

An approved booking produces a signed, time-limited QR; the Owner scans it to verify the student and start a two-party handover with guided photos, and scans it again at return.

### Approval and escalation

- Ordinary requests go to the Owner; requests with "Manager approval required", exceptions, or strike-triggered reviews go to the Manager. The Owner sees those as "Waiting for Manager".
- The approval screen shows the requester's verification and badges, history counts (on-time returns, damage cases, no-shows), purpose and attachments, eligibility results, competing requests, and the system recommendation with its score.
- Actions: Approve, Reject (reason), Waitlist (reason), Ask for more info (message).
- Escalation: no Owner decision within 24 hours, or by 2 hours before slot start if sooner → assigned to the Manager. No Manager decision in the next 24 hours → Admin alert. Escalation never auto-approves or auto-rejects.

### QR pickup (equipment)

1. On approval, the student's booking page shows a QR: an HMAC-signed token (`QR_SIGNING_SECRET`) carrying booking ID, user ID and expiry. It is valid from 15 minutes before start until the end of the grace period, and again during the return window.
2. The Owner opens **Scan** on a phone. A valid scan shows the student's name, Google photo, resource and slot; the Owner confirms it is the same person.
3. The scan opens the handover screen: checklist items (OK / issue + note), the guided photo shots (minimum 3), supervisor name if supervision is required.
4. The Owner signs; the student taps **Acknowledge condition** in their app. Both are stored on the `checkout` condition report. Booking → `checked_out`, `picked_up_at = app_now()`.

### Door check-in (spaces)

Classrooms, halls, courts and labs have a printed door QR. The student scans it inside the app; the server checks they hold an approved booking for that space now (within grace) and moves it to `checked_out`. The booking completes automatically at `end_at` unless someone files an incident.

### Grace period and no-shows

```latex
\text{grace} = \min\left(\max(0.25 \times \text{duration},\ 15\ \text{min}),\ 120\ \text{min}\right)
```

| Booking length | Grace |
| --- | --- |
| 1 hour | 15 min |
| 2 hours | 30 min |
| 4 hours | 60 min |
| 1 day or more | 120 min |

- Grace is stored on the booking at approval; the percentages and bounds are global policy values.
- When grace ends without a pickup: booking → `no_show`, the slot is released, and the top waitlisted student gets an offer immediately (Section 8).
- Strikes: 3 no-shows allowed in a rolling 30 days, shown on the student dashboard ("No-shows: 2 of 3 this month"). The 4th forfeits the hold (Section 9) and later requests need Manager review until the window clears.
- **I can't make it:** available until slot start; releases the slot and all credits, no strike.
- **Owner not present:** the student can mark this during the slot. No strike for the student; an audit event is logged against the organisation and shown in Manager and Admin insights.
- Late arrival within grace is allowed, but `end_at` does not move.

### Return

1. The Owner scans the student's QR (or opens the booking) and records the return checklist and the same guided photo shots.
2. The AI comparison runs in the background (Section 14) and shows flags with confidence on the Owner's screen.
3. The Owner chooses **Return OK** → `completed`, credits charged for min(actual, booked) duration, rest released. Or **Raise damage** → `under_review` (Section 11).

### Extensions

- Requested from the active booking: new end time, reason, optional note.
- The system checks max duration, conflicts with the next booking, eligibility and extra credits.
- Auto-approve resources: approved automatically if there is no conflict and it stays within limits. Otherwise the Owner decides; restricted resources go to the Manager.
- The original `end_at` stays in force until an extension is approved.

### Overdue

| When | Action |
| --- | --- |
| Before end, bookings over 24 h | Reminder 24 h before and 2 h before |
| Before end, shorter bookings | Reminder 30 min before |
| `end_at` passes | → `overdue`; the next booker of that unit is warned and shown alternatives |
| +1 hour | Notify student and Owner |
| +6 hours | Notify Manager |
| +24 hours | Urgent flag on the Manager dashboard |

On return, the system checks for approved extensions and reported problems, then proposes a late penalty under the booking's policy version. It goes to the Manager's penalty queue; nothing is deducted automatically.

## 11. Damage, disputes, penalties and incidents

The system gathers evidence and proposes; a Manager decides, after the student has had a chance to respond; and damage and safety incidents are separate workflows.

### Damage dispute

1. The Owner raises damage at return: description, severity (minor / major / unusable), the AI flags they confirm. Booking → `under_review`, `damage_cases` row created.
2. The student is notified and can respond with text and photos within the response window (policy default: 48 hours).
3. The case is assigned to a Manager of the organisation **other than the reporter**; if none, to an Admin.
4. The decision screen shows check-out and return photos side by side shot by shot, the check-out checklist (so pre-existing damage is visible), the Owner's report, the AI observations with confidence, the student's response, the replacement value and the booking timeline.
5. Outcomes, each with a mandatory reason: dismiss, warning, credit deduction (amount), temporary restriction in this organisation, request more evidence, or close for insufficient evidence.
6. If the response window expires, the Manager may decide without it; the timeline records "Student did not respond within 48 h".
7. The resource can be set to `under_maintenance` from the case. Booking → `completed` once decided.

### Penalties

| Kind | Proposed by | Applied |
| --- | --- | --- |
| Late return | System, from the booking's policy version | Only after a Manager confirms, reduces or waives it with a reason |
| Damage | Manager in the dispute decision | With the decision |
| 4th no-show in 30 days | Pre-announced rule shown at booking time | Automatically (`auto_applied`); the student can appeal to a Manager, who can reverse it |

The Manager's penalty screen shows expected and actual return times, approved extensions, the policy rule and version, the student's explanation and supporting records. Every decision notifies the student and writes an audit event.

### Safety incidents (separate from damage)

Examples: an injury in a workshop, a machine used without required supervision, unsafe operation that puts others at risk.

1. Any user reports from the resource or booking page: time, location, resource, description, evidence photos, severity.
2. Severity high → urgent notification to all Managers of the organisation and the Admins; the resource can be set to `unsafe` by a Manager, which blocks new bookings and notifies holders of upcoming bookings.
3. A Manager investigates, records actions and access restrictions, and closes the case.
4. Closing an incident never restores the resource. A Manager must separately confirm it is safe to use again.
5. The report screen always shows: "In an emergency, follow DVIT emergency procedures and call 112. ResourCity is not an emergency service."

### Platform suspension (Admin)

With a reason the student sees: pending requests are cancelled, approved future bookings are cancelled and offered to the waitlist, and items currently borrowed must still be returned through the normal flow. Lifting a suspension is also audited.

## 12. Dashboards per role

Every dashboard opens with what needs this person's action now, sorted by urgency, before any list or statistic.

### Student

- **Needs your action:** slot offers with countdown, items to collect today (QR button), returns due, damage cases awaiting your response.
- **My bookings:** every booking with its student label (Section 5), reason for rejections, waitlist position and score breakdown, and a timeline per booking showing every event, actor role and reason.
- **Credits wallet:** available balance, holds, ledger history, next reset time, emergency credit request status.
- **Standing:** no-show strikes ("1 of 3 in the last 30 days"), badges with expiry, account status.
- **Notifications** inbox.

### Owner (per organisation)

- **Today strip:** handovers and returns due today, with scan buttons.
- **Queues:** pending approvals (and those "Waiting for Manager"), AI condition flags to confirm or dismiss, badge certificates to verify for badges the org issues.
- **Status lists:** upcoming handovers, currently borrowed, overdue returns, damage reports filed.
- **Resources:** list, create, edit, pause, mark under maintenance, print door QR.
- **Scan** page, mobile-first.

### Manager (per organisation)

| Priority | Items |
| --- | --- |
| Critical | Safety incidents, major damage |
| Urgent | Approvals with pickup within 24 h, escalated requests, disputes ready to decide, no-show appeals |
| Normal | Exception requests, penalties to confirm, routine approvals |

- Oldest first within each level; each item shows how long it has waited.
- **Department overview:** utilisation per resource (booked vs available hours, actual from check-in/out), most-used resources, repeated no-shows, overdue returns, resources under maintenance, booking distribution across students, "Owner not present" count.
- **My decisions:** counts of approvals, rejections, disputes resolved, penalties confirmed or waived, overrides, and average time to decide. Shown for self-review, never as a score.

### Admin

- **Action required:** pending verifications, emergency credit requests, escalations, high-severity incidents.
- **Users:** verification queue, suspensions and their history.
- **Organisations and roles:** create orgs, grant or revoke Owner and Manager with a reason; cannot remove an org's last Manager without naming a replacement.
- **Badge types:** name, validity, issuing organisation; badge issue and revoke history.
- **Policies:** current values, version history, edit with validation and a before/after diff that must be confirmed with a reason. Policy keys: weekly allowance, emergency grant cap, category caps, grace percentage and bounds, strike limit and window, cancellation window, offer windows, escalation timeouts, dispute response window, late-penalty rate.
- **Insights:** underused resources report (estimated usage before listing vs recorded usage, labelled "before/after comparison, not proof of cause"), utilisation by organisation, booking distribution, no-show patterns, override frequency per Manager, emergency grants.
- **Audit log:** filters for user, resource, organisation, event type, actor, date range, policy version; CSV export without personal contact details.
- **Demo controls** (demo mode only): clock +15 min, +1 h, +1 day, reset clock, run scheduler now, reset demo data.

## 13. Notifications

Notifications are in-app first and are generated from audit events: when an audit event is written, one rules function decides who is told, so there is a single source of truth.

- Every notification links to its booking, resource, case or admin task.
- `dedupe_key` (event type + entity + recipient) prevents duplicates when the tick job reruns.
- Nobody is notified about another person's private case.
- Email (optional, Phase 7 if time allows): the tick job sends unsent notifications marked `email_eligible` through Gmail SMTP. A failed email never changes any decision; the in-app record stays.
- A bell with an unread count in the navbar; new items announced to screen readers through an `aria-live` region.

| Event | Student | Owner | Manager | Admin |
| --- | --- | --- | --- | --- |
| Verification approved / rejected | Yes | — | — | Audit only |
| Request submitted | Status | Yes | If approver | — |
| Approved / rejected / waitlisted | Yes | Yes | If involved | — |
| Batch allocation result | Yes | Yes | If approver | — |
| Slot offered | Yes (urgent) | — | — | — |
| Pickup or return approaching | Yes | Today strip | — | — |
| Extension requested / decided | Yes | Yes | If restricted | — |
| No-show recorded | Yes | Yes | — | — |
| Overdue | Yes | Yes | At +6 h | If escalated |
| Escalation | — | — | Yes | At second timeout |
| Damage reported | Yes | Yes | Assigned Manager | If conflict of interest |
| Student response submitted | — | Yes | Yes | — |
| Dispute decided | Yes | Yes | Yes | Audit only |
| Penalty proposed / decided | Yes | Yes | Yes | — |
| Safety incident | If involved | Yes | Urgent | High severity |
| Resource unsafe / restored | Upcoming bookers | Yes | Yes | — |
| Role granted / revoked | Affected user | — | — | Audit only |
| Suspension | Yes | — | — | Audit only |
| Emergency credits decided | Yes | — | — | — |
| Policy changed | — | Yes, if it affects their resources | Yes | Audit only |

## 14. AI features

Four AI features, all advisory, all through one server-side client in `src/lib/ai/`; two are must-haves (search parsing and photo comparison), and every one has a manual fallback.

### Client rules

- OpenAI-compatible chat completions against `AI_ROUTER_BASE_URL` with `AI_ROUTER_API_KEY` and `AI_MODEL=deepseek-v4.1-1017`. Server-side only.
- Images sent as base64 `image_url` data URLs, resized to max 1280 px on the long edge before sending.
- The model must return JSON only; every reply is parsed with a zod schema. Invalid JSON → one retry → fallback.
- 20-second timeout. On failure the UI says "AI suggestion unavailable — continue manually" and the workflow continues.
- Every AI output is stored with model name, timestamp and confidence, and shown labelled "AI suggestion". It never changes a state.
- **Phase 0 smoke test:** one text call and one image call through the router, logged in `PROGRESS.md`.

| Feature | Priority | Input | Output (zod) | Human step |
| --- | --- | --- | --- | --- |
| Search parser | Must | Query text + today's date (`appNow()`) + category list | `{category, keywords[], date, start_time, end_time, duration_minutes, quantity, capacity, needs_clarification, clarification_question}` | Student confirms or edits the parsed filter chips |
| Condition comparison | Must | Check-out photos and return photos, paired by shot name; checklist items | `{shots:[{shot, differences:[{description, location, confidence}], comparable}], missing_items[], overall:"no_change"/"possible_damage"/"inconclusive"}` | Owner confirms or dismisses each flag; a Manager decides any dispute |
| Certificate extraction | Should | Uploaded certificate image + expected badge name | `{name_on_certificate, course_title, issuer, issue_date, expiry_date, matches_student_name, confidence}` | Owner of the issuing org verifies or rejects |
| Case summary | Could | Incident or dispute text, timeline events | `{summary, key_facts[], open_questions[]}` | Manager reads it next to the raw evidence |

### Prompt guardrails

- Condition comparison must say "inconclusive" when lighting, angle or framing differ too much, and must never assign blame.
- Certificate extraction reports what it reads; it never decides validity.
- The search parser never invents a date: "tomorrow" is resolved against the provided `appNow()`; anything ambiguous sets `needs_clarification`.

## 15. Audit log, privacy and security

The audit log is append-only at the database level, every table has RLS, and personal data is kept to the minimum the workflow needs.

### Audit log

- `audit_events` accepts inserts only through a `SECURITY DEFINER` function `log_event(...)`. `UPDATE` and `DELETE` are revoked for every role, including the service role's application paths. Nobody can edit history, Admins included.
- Every event records actor, actor role, action, entity, from/to state, reason, metadata and policy version. Role and policy changes store previous and new values in `metadata`.
- Events that must exist: verification decisions; role grants/revokes; badge issue/verify/reject/revoke; policy changes; every booking transition; overrides (`MANAGER_OVERRIDE`); penalties proposed/decided/appealed; damage reports, responses and decisions; incidents and safety restrictions; suspensions; emergency credit decisions; extension decisions; "Owner not present"; demo clock changes and resets.
- Students read events for their own bookings; Owners and Managers for their organisation; Admins read and export everything.

### RLS principles

| Data | Who can read | Who can write |
| --- | --- | --- |
| `profiles` | Self; org staff see name/photo/department of their requesters; Admin all | Self (editable columns only); Admin through server actions |
| `memberships`, `badge_types`, `policy_versions` | All signed-in users (no personal data) | Admin only |
| `resources` | All signed-in users | Owners of the org |
| `bookings`, `condition_reports` | The student; Owners and Managers of the org; Admin | Only through `transitionBooking()` and handover actions |
| `damage_cases`, `penalties`, `incidents` | Parties involved; Managers of the org; Admin | Per Section 3 |
| `credit_ledger` | Self; Admin | Server only |
| `notifications` | Recipient | Server only |

- Profile column locking: users can update only `full_name`, `department`, `year`, `roll_number`, `onboarding_complete`; never `status` or `is_admin`. Status changes run server-side with the service role and write an audit event in the same action.

### Storage

| Bucket | Access | Retention |
| --- | --- | --- |
| `id-proofs` | Upload: own folder; read: Admin | Deleted on the verification decision |
| `certificates` | The student; Owners of the issuing org | Kept while the badge exists |
| `condition-photos` | The student, org staff, assigned Manager, Admin | Kept with the booking |
| `incident-evidence` | Reporter, org Managers, Admin | Kept with the incident |

### Other controls

- Service-role key, AI key, QR secret and cron secret never reach the browser.
- QR tokens are HMAC-signed, expire, and are bound to booking and user; a forwarded screenshot shows the real student's photo to the Owner.
- `/api/cron/tick` rejects calls without `CRON_SECRET`.
- Personal data never goes in URLs or query strings. CSV exports exclude emails and phone numbers.
- Phase 7 includes a forbidden-action test pass: a student tries to approve, an Owner tries another org's resource, a Manager tries to grant roles, anyone tries to edit an audit row. All must fail at the database or server.
- All demo data is fictional.

## 16. Design system, accessibility and landing page

ResourCity uses a light theme built on the MongoDB (LeafyGreen) palette: forest green for actions, near-black slate for text, and bright spring green only as an accent, never as text on white.

### Colour tokens (`src/styles/tokens.css`)

| Token | Hex | Use |
| --- | --- | --- |
| `--green-dark-3` (Evergreen) | `#023430` | Headings on light green, hero background |
| `--green-dark-2` (Forest) | `#00684A` | Primary buttons, links, focus ring |
| `--green-dark-1` | `#00A35C` | Icons, large decorative elements only |
| `--green-base` (Spring) | `#00ED64` | Accents, highlights, text on dark backgrounds only |
| `--green-light-2` | `#C0FAE6` | Selected states |
| `--green-light-3` (Mist) | `#E3FCF7` | Success backgrounds, hero tint |
| `--black` (Slate) | `#001E2B` | Body text |
| `--gray-dark-2` | `#3D4F58` | Secondary text |
| `--gray-base` | `#889397` | Disabled, placeholders on white backgrounds only with large text |
| `--gray-light-2` | `#E8EDEB` | Borders, dividers |
| `--gray-light-3` | `#F9FBFA` | Page background |
| `--white` | `#FFFFFF` | Cards, surfaces |
| `--blue-base` / `--blue-light-3` | `#016BF8` / `#E1F7FF` | Info, waitlist |
| `--yellow-dark-2` / `--yellow-light-3` | `#944F01` / `#FEF7DB` | Pending, warnings |
| `--red-base` / `--red-light-3` | `#DB3030` / `#FFEAE5` | Errors, overdue, rejected |
| `--purple-base` | `#B45AF2` | Currently borrowed |

Typography: MongoDB's Euclid Circular A is proprietary, so use **Inter** (UI) and **Source Code Pro** (codes, IDs, timestamps), with system fallbacks. Radius 8 px for cards, 6 px for inputs.

### Status chips (colour + icon + text, never colour alone)

| Status | Background / text | Icon |
| --- | --- | --- |
| Pending approval, Allocation pending | `#FEF7DB` / `#944F01` | Clock |
| Waitlisted, Slot offered | `#E1F7FF` / `#016BF8` (darker text `#1254B7`) | List-ordered / Bell |
| Approved — awaiting pickup | `#E3FCF7` / `#00684A` | Check-circle |
| Currently borrowed | Purple tint / `#B45AF2` text darkened for contrast | Package |
| Overdue, Rejected, No-show | `#FFEAE5` / `#DB3030` (bold) | Alert-triangle / X-circle / User-x |
| Returned — under review | `#FEF7DB` / `#944F01` | Search |
| Completed, Cancelled, Expired | `#E8EDEB` / `#3D4F58` | Check / Slash / Hourglass |

Approved uses an icon and the word "Approved" because the brand colour is also green; a chip must never rely on green alone to mean success.

### Accessibility (judging criterion 6)

- WCAG 2.1 AA contrast for all text; check every token pair. `#00ED64` and `#00A35C` never carry small text on white.
- Keyboard reachable everything, visible focus ring (`#00684A`, 2 px), skip-to-content link.
- Labels on every input, error text tied to fields, `aria-live` for notifications and timers.
- Mobile-first layouts; the Owner scanner and student QR pages are designed for phones first.
- Respect `prefers-reduced-motion`. Plain-language messages: say what happened, why, and what to do next.
- Alt text on resource photos; condition photos labelled by shot name.

### Landing page (`/`)

1. **Hero:** "Unlock your campus's idle equipment and spaces." Subline on fair, safe, accountable sharing. Buttons: **Continue with Google** and, in demo mode, **Try the demo**.
2. **How it works:** four steps: find and check eligibility → request → QR pickup with condition photos → return and see the full record.
3. **For each role:** one card each for Students, Owners, Managers, Admins.
4. **Trust and fairness:** eligibility before requesting, explainable allocation, credits, two-party condition records, human-reviewed disputes, audit trail.
5. **Live stats** from the database (resources listed, hours shared this month, idle resources now in use).
6. Footer: "Fictional demo institution" note, GitHub link.

## 17. Seed data, simulated clock and judge demo script

The seed makes ResourCity look like a living campus on first load: a pre-populated waitlist, an overdue item, an open dispute and 30 days of history, so a judge can run the whole journey alone in about 8 minutes.

### Organisations

Photography Club · Makerspace · ECE Department · Computer Engineering (AI Lab) · Sports Committee · Academic Office (classrooms, seminar hall, meeting rooms).

### Accounts (all `@dvit.edu.in`, fictional)

| Account | Role | Seeded state |
| --- | --- | --- |
| `admin@` | Admin | Sees 1 pending verification, 1 emergency credit request, 1 escalation |
| `prof.mehta@` | Manager: ECE Department + Makerspace + Computer Engineering | Has a late penalty to confirm (overdue laptop) and a CNC exception request |
| `prof.kulkarni@` | Manager: Academic Office + Sports Committee + Photography Club | Second Manager for conflict-of-interest routing |
| `photo.lead@` | Owner: Photography Club | Has a handover due today and an AI flag to confirm |
| `makerspace.lead@` | Owner: Makerspace | Has 1 CNC certificate to verify |
| `riya@` | Student, verified, Photography Basics badge | 100 credits, 0 strikes; main demo student |
| `aarav@` | Student, verified, no CNC badge | Shows "Action required" on CNC |
| `sneha@` | Student, verified, 10 credits left | Shows the emergency credits path |
| `kabir@` | Student, verified, 2 no-shows | Shows "2 of 3" strikes warning |
| `om@` | Student, pending verification | Appears in the Admin queue |

All demo accounts share one demo password, written in `docs/SUBMISSION.md` under testing instructions.

### Resources (one rule showcased each)

| Resource | Org | Showcases |
| --- | --- | --- |
| DSLR camera kit ×2 | Photography Club | Badge gate, Owner approval, guided photos, AI comparison |
| CNC machine | Makerspace | Batch mode, Manager approval, supervision, training badge |
| Seminar hall | Academic Office | Batch mode, Manager approval, door QR |
| GPU workstation | Computer Engineering | Batch mode, verified purpose priority, 4-hour cap |
| Oscilloscope ×3 | ECE Department | Multi-unit availability, ECE-only restriction |
| Badminton court | Sports Committee | Door QR self check-in, peak multiplier |
| Computer lab (40 stations) | Computer Engineering | Lab template, software list |
| Laptop ×5 | Computer Engineering | Return confirmation, 48-hour cap |
| Cricket kit ×2 | Sports Committee | Kit checklist, condition record |
| Meeting room | Academic Office | Free, auto-approve, instant |

### Pre-seeded situations

- A seminar hall slot in `pending_allocation` with 3 competing requests, cutoff in 1 hour of app time.
- A badminton court slot with 2 students waitlisted.
- One laptop `overdue` by 3 hours (late penalty proposed when returned).
- One camera `under_review` with a damage case filed by the Photography Club Owner, student response submitted, ready for Prof. Kulkarni to decide.
- One oscilloscope damage case reported by Prof. Mehta himself, so it routes to an Admin (conflict of interest).
- One incident (minor) open on the CNC machine.
- 30 days of completed bookings with check-in/out times, so the underused report and Manager overview show real numbers.
- Policy history: v1 → v2 (allowance changed), with one active booking still on v1.

### Simulated clock

`app_clock.offset_seconds` shifts `app_now()`. Admin demo controls: +15 min, +1 h, +1 day, reset to real time, run scheduler now. Every change writes an audit event. **Reset demo data** truncates demo tables and re-runs the seed through a server action, demo mode only.

### Judge demo script (testing instructions)

1. Open the landing page → **Try the demo** → log in as **Photography Club Owner**. Create a listing (Portable equipment template) and note the dynamic fields and the checklist with guided shots.
2. Log in as **Aarav** → search "cnc machine this week" → see "Action required: CNC Safety Training". Search "camera for tomorrow" → eligible.
3. Log in as **Riya** → request the DSLR for tomorrow → see the credit hold summary.
4. Log in as **Owner** → approve. Log in as **Riya** → see the QR.
5. **Admin** → clock +1 day. **Owner** → Scan (or "Start handover" without a camera) → confirm Riya's photo → checklist + photos → sign. **Riya** → acknowledge.
6. **Admin** → clock +1 day + 3 h (late). **Owner** → return with photos → AI flags a difference → Raise damage.
7. **Riya** → respond to the damage case.
8. **Prof. Kulkarni** (Manager, not the reporter) → review side-by-side evidence → partial deduction with reason → confirm or waive the late penalty.
9. **Riya** → open the booking timeline: every step, actor role and reason, plus the credit ledger.
10. **Admin** → run scheduler now → seminar hall batch allocates; open a waitlisted student's score breakdown; open the underused-resources report and the audit log.
11. Optional: **Sneha** → request emergency credits; **Admin** → approve a partial grant; **Admin** → verify **Om**, grant a role, change a policy and see the version diff.

## 18. Phase-by-phase implementation plan

One session builds the foundation in hours 0–4; then a lead plus two teammates build in parallel, a third joins once the happy path works, and the complete list-to-return journey must run on Vercel by hour 24. Every phase ends with acceptance checks, a commit and a push to `main`.

### Team operating model

1. **Hours 0–4: a single session** builds the schema, the state machine, the shared types and the seed data. No teammates yet.
2. **From hour 4: the lead plus 2 teammates**, backend/API and frontend/UI. **Add a third teammate**, worker + AI, once the happy path works (Phase 4).
3. **The architect (the user) stays the architect.** The lead reports at each checkpoint (hours 4, 10, 20, 30, 40) with: what is done, what is broken, decisions needed, the Vercel preview link. The architect tests the integration on the preview before the next phase starts.
4. **Contract-first, strict file ownership.** The lead owns `src/lib/contracts`, `src/lib/domain` and `supabase/migrations`. Teammates never edit outside their folders (Section 2); they message the lead to request a contract or schema change, and the lead tells everyone when it lands.
5. **Definition of done for every task, so Claude works better:** types compile, lint passes, domain logic has unit tests, the feature works on the Vercel preview with seeded accounts, the audit event is written, `PROGRESS.md` is updated, and the lead has committed and pushed. Every task cites the PRD section it implements, because teammates do not inherit the lead's conversation.

### Git protocol (judges watch commits)

- Only the lead runs git. After every completed task and at every phase end:

```bash
git add -A
git commit -m "phase-3: owner approval queue with reasons"
git push origin main
```

- Small commits, at least one push every 60–90 minutes of work. Phase ends get a tag-style message: `phase-3 complete: core happy path`.
- Never force-push, rebase shared history, or commit `.env.local`.

### Starting the agent team (copy-paste for the lead, at hour 4)

Enable the experimental flag in `~/.claude/settings.json` (`"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}`), restart Claude Code, then:

```text
Create an agent team for ResourCity. Read CLAUDE.md, docs/PRD.md and docs/PROGRESS.md first.
You are the lead: you own src/lib/contracts, src/lib/domain, supabase/migrations and all git commits.
Spawn 2 teammates:
- backend: owns src/app/api and src/lib/server. Implements PRD Sections 4, 5 (transitionBooking), 7, 9, 10, 11 server logic.
- frontend: owns src/app pages and src/components. Implements PRD Sections 4, 6, 7, 10, 12, 16 UI.
Teammates never edit outside their folders; contract or schema changes go through you.
Work Phase 2 then Phase 3 of PRD Section 18. After each finished task, commit and push to main.
Report to me at the end of each phase with: done, broken, decisions needed, preview link.
```

At Phase 4, tell the lead: "Spawn a third teammate, worker-ai, owning worker/ and src/lib/ai, for PRD Sections 2 (scheduler), 8, 10 (no-show, overdue), 13 and 14."

### Phases

**Phase 0 — Setup (hours 0–1, single session)**

- [ ] Next.js (App Router, TypeScript), Tailwind, shadcn/ui, zod, date-fns; folder structure from Section 2.
- [ ] `docs/PRD.md`, `docs/PROGRESS.md`, `CLAUDE.md`, `.env.example`, `.gitignore`.
- [ ] Supabase clients (browser, server, service role); design tokens file (Section 16).
- [ ] AI router smoke test: one text call, one image call; record the exact model string and base URL.
- [ ] Vercel project connected to `main`; placeholder landing page deployed.

* **Accept:** the preview URL loads; AI smoke test logged. **Push:** `phase-0 complete`.

**Phase 1 — Foundation (hours 1–4, single session)**

- [ ] Migrations for every table in Section 5, `btree_gist` exclusion constraint, `app_clock` + `app_now()`, `log_event()`, helper role functions, RLS baseline for every table, storage buckets and policies.
- [ ] `src/lib/contracts`: generated DB types, booking states, events, API shapes.
- [ ] `src/lib/domain` pure functions with unit tests: transition table, eligibility checks, priority score, grace period, pricing, ledger maths, no-show strikes.
- [ ] `transitionBooking()` skeleton (validate → audit → ledger → notify) in one transaction.
- [ ] Full seed (Section 17) loads cleanly; seeded demo logins work.

* **Accept:** migrations apply on the Supabase project; seed loads; all domain tests pass. **Push:** `phase-1 complete`. **Checkpoint 1 (hour 4).**

**Phase 2 — Auth, shells, landing (hours 4–10, lead + backend + frontend)**

- [ ] Backend: Google OAuth callback, domain trigger with demo-mode relaxation, onboarding API with ID upload, verification API, role grant/revoke API, middleware guards, role-based redirect.
- [ ] Frontend: login with demo panel, onboarding, pending page, app shell per role with role switcher, notification bell, status chips, timeline component, landing page v1.

* **Accept:** Google sign-in reaches onboarding; a non-college account is blocked (demo mode off); every demo button lands in the right dashboard; a pending user cannot reach request pages. **Push:** `phase-2 complete`. **Checkpoint 2 (hour 10).**

**Phase 3 — Core happy path (hours 10–20, lead + backend + frontend)**

- [ ] Owner listing form with four templates, rules (block/review), checklist with guided shots, door QR.
- [ ] Search with filters (non-AI first), eligibility engine on cards, request form with credit summary and exception requests.
- [ ] Instant-mode submit, Owner/Manager approval queues with reasons, credit hold.
- [ ] Signed QR, Owner scanner with identity confirm, handover with checklist + photos + two-party sign-off, door check-in for spaces.
- [ ] Return flow, completion, credit charge/release, booking timeline for both parties.

* **Accept:** on the Vercel preview, with demo accounts and the clock controls stubbed by direct SQL if needed, a full journey runs: list → discover → request → approve → QR pickup → return → timeline. **This is the hour-24 hard gate.** **Push:** `phase-3 complete`. **Checkpoint 3 (hour 20).**

**Phase 4 — Time, fairness, credits (hours 20–30, + worker-ai teammate)**

- [ ] Render cron + `/api/cron/tick`; Admin clock controls and "run scheduler now".
- [ ] Batch allocation at cutoff with score breakdown; waitlist and offers with accept windows.
- [ ] Grace period, no-shows, strikes, "I can't make it", "Owner not present", 4th-strike forfeit.
- [ ] Overdue states and reminders; escalation timeouts; extensions.
- [ ] Weekly allowance and reset; emergency credit request and Admin decision; in-app notifications per Section 13.
- [ ] Versioned policies with diff and confirm; bookings snapshot policy version.

* **Accept:** with time-skip, a no-show releases a slot and offers it; a batch slot allocates with visible scores; an overdue item escalates; a policy change leaves an existing booking on its old version. **Push:** `phase-4 complete`. **Checkpoint 4 (hour 30).**

**Phase 5 — Trust workflows and AI (hours 26–34, overlaps Phase 4)**

- [ ] Damage case: report, student response window, conflict-of-interest routing, Manager decision outcomes, maintenance status.
- [ ] Penalty queue (late, damage), no-show appeal, Manager overrides with `MANAGER_OVERRIDE`.
- [ ] Incidents: report, urgent notify, mark unsafe, separate restore step, emergency notice.
- [ ] AI: search parser (must), condition comparison (must), certificate extraction (should), case summary (could), each with fallback.

* **Accept:** demo script steps 6–8 run end to end; AI failure leaves every workflow usable. **Push:** `phase-5 complete`.

**Phase 6 — Dashboards and insights (hours 34–40)**

- [ ] Student action-needed panel, wallet, strikes, badges.
- [ ] Owner Today strip and queues; Manager urgency sorting, department overview, decision stats.
- [ ] Admin action queue, badge types, underused-resources report, audit log filters and CSV export.

* **Accept:** every dashboard opens with correct counts from the seed. **Push:** `phase-6 complete`. **Checkpoint 5 (hour 40).**

**Phase 7 — Hardening (hours 40–44)**

- [ ] Reset demo data button; fresh-eyes run of the full judge script from a logged-out browser.
- [ ] Forbidden-action test pass (Section 15); RLS gaps fixed.
- [ ] Accessibility pass (contrast, keyboard, labels), mobile pass on scanner and QR pages, loading and error states.
- [ ] Optional: Gmail SMTP emails for approvals, offers and overdue.

* **Accept:** the judge script runs twice in a row after a reset with zero manual fixes. **Push:** `phase-7 complete`.

**Phase 8 — Submission (hours 44–48)**

- [ ] `README.md`, `docs/SUBMISSION.md` (Section 19), testing instructions with demo password, disclosures.
- [ ] Final production deploy; all links checked from an incognito window.

* **Accept:** everything in Section 19 is ticked. **Final push by hour 47.** Then freeze.

### If behind schedule at hour 30, cut in this order

1. AI case summary
2. AI certificate extraction (Owners verify manually)
3. Email notifications
4. Audit CSV export
5. Manager decision stats and department analytics (keep the queues)
6. Escalation to Admin (keep Owner → Manager)
7. Door QR self check-in (Owner confirms spaces instead)

**Never cut:** the booking lifecycle, eligibility before request, credits hold and charge, QR handover with photos and two-party sign-off, the damage dispute with student response, the score explanation, the audit timeline, demo logins and the time-skip.

## 19. Submission checklist, known limitations and future scope

Every submission item must be live and accessible before the deadline and stay accessible through judging; `docs/SUBMISSION.md` holds the project document.

### Submission checklist

- [ ] Public link to the working product (Vercel production URL)
- [ ] Repository access: [github.com/Woodbulky/ResourCity](https://github.com/Woodbulky/ResourCity), public or judges added
- [ ] Project document: use case; target users and owners; why the problem matters; solution; full workflow; features built during the hackathon; stack and architecture; AI tools and services; privacy, security and fairness; known limitations; future scope
- [ ] Testing instructions: demo panel, shared demo password, the judge script from Section 17, how to use the clock controls
- [ ] Team and participant details, with each member's role and contribution
- [ ] Disclosures: Claude Code and agent teams used to write code; DeepSeek V4.1 via the AI router at runtime; shadcn/ui, Supabase, Next.js and all libraries; no pre-existing project code
- [ ] Commit history shows work only inside the 48-hour window
- [ ] All links tested from an incognito window

### Known limitations (state these honestly)

- One fictional institution; multi-institution sharing is not built.
- Credits only; no real deposits or payments.
- ID photos are deleted from storage on decision, but provider backups follow Supabase's retention policy.
- AI comparison quality depends on photo angle and lighting; it often returns "inconclusive", by design.
- Utilisation "before" figures are Owner estimates, not measurements.
- Email notifications are optional; in-app is the guaranteed channel.
- The simulated clock exists for demonstration only.

### Future scope

- Supervisor/Lab Staff role and supervised-session check-ins.
- Per-permission role configuration and two-Admin approval for sensitive actions.
- Group and team bookings with shared fairness accounting.
- Real monetary deposits for high-value equipment.
- Multi-institution federation (borrowing across nearby colleges).
- Hindi and Marathi interface.
- Anomaly detection on usage patterns, richer utilisation analytics.
- Native mobile app with offline QR scanning.
- Calendar integrations and IoT smart-lock check-in for rooms.
