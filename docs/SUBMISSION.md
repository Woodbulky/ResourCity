# ResourCity — submission

**Problem statement:** Unlock Underused Equipment and Spaces · 48-hour single-round build

| | |
| --- | --- |
| Working product | https://resour-city.vercel.app |
| Repository | https://github.com/Woodbulky/ResourCity (public) |
| Demo password (all demo accounts) | `DvitDemo@2026` |
| Requirements / build log | [docs/PRD.md](PRD.md) · [docs/PROGRESS.md](PROGRESS.md) |

The demo institution, Deccan Valley Institute of Technology (DVIT), Pune, and every person, booking and email address in it are fictional.

---

## 1. Use case

A college owns far more than any one group uses: a club's DSLR kits sit in a cupboard between events, a department's oscilloscopes are idle outside lab hours, the seminar hall is empty most afternoons, and the Makerspace CNC waits for the few students who know how to book it. ResourCity lets the **departments, labs, clubs and facilities of one college lend their underused spaces and equipment to verified students**, under rules each owner sets, with a complete record of who had what, when, and in what condition.

## 2. Target users and owners

| Role | Who | What they do |
| --- | --- | --- |
| **Student** | Any verified student | Finds resources, sees whether they qualify before asking, requests, picks up by QR, returns, responds to disputes |
| **Owner** | Club leads, lab in-charges, facility staff | Lists resources with rules, approves requests, hands over and takes back with a QR scan, checklist and guided photos |
| **Manager** | Faculty in charge, HODs | Restricted approvals and exceptions, damage disputes, penalties and appeals, safety incidents, department insights |
| **Admin** | Campus administration | Verifies students, grants roles, sets the versioned campus policy, reads and exports the audit log |

One person can hold several roles (a lab in-charge who is also a Manager) and switches workspace from the sidebar.

## 3. Why the problem matters

- **Idle assets are sunk cost.** Equipment bought for one course or club is used a few hours a week; students who need it elsewhere on campus can't find it, or don't know they're allowed to ask.
- **Informal lending breaks trust.** Today lending happens over WhatsApp and a notebook. When a lens comes back scratched there is no condition record, no fair process and no history, so owners stop lending.
- **First-click booking is unfair.** For the seminar hall or the GPU workstation, whoever refreshes fastest wins, and the same few people win every week.
- **Safety-critical resources need gates.** A CNC mill must only go to students with verified training. A booking form can't enforce that; an eligibility engine can.

## 4. The solution

ResourCity is one booking lifecycle with trust built into every step:

1. **Eligibility before requesting.** Every resource card runs the eligibility engine for the signed-in student: verification, training badges, department/year restrictions, active-booking caps, credits, no-show record. The student sees *Eligible*, *Action required* (and the fix, such as "Upload your CNC Safety Training certificate") or *Not eligible* with the reason, before they ask.
2. **Fair allocation.** Low-demand resources are instant. High-demand slots collect requests until a cutoff, then a published **100-point priority score** ranks them: recent usage (40), previous allocations (25), recent unsuccessful requests (20), verified purpose (15). Every student can open their own breakdown.
3. **Credits.** A weekly allowance (100 credits under policy v2) is held on approval, charged on return and released on cancellation, so nobody can monopolise a resource. Emergency credits go through an Admin, once per academic year.
4. **QR handover with two-party condition records.** The student shows an HMAC-signed QR; the Owner scans it, confirms the student's photo, goes through the checklist and the guided shots ("Front", "Lens close-up", …) and signs. The student acknowledges. The same happens at return.
5. **AI flags, humans decide.** At return the AI compares pickup and return photos shot by shot and suggests possible damage with a confidence. The Owner confirms or dismisses each flag; a Manager who didn't file the report decides, after the student has had a window to respond.
6. **Accountability.** Every consequential action needs a reason and writes an append-only audit event. Policies are versioned, and each booking keeps the version it was approved under.

## 5. Full workflow

```
Owner lists resource (template, rules, checklist, guided shots)
        │
Student browses ──► eligibility shown per card ──► picks a slot ──► credit summary ──► request
        │                                                                   │
        │                                     instant: auto-approve or Owner/Manager approval
        │                                     batch:   pending_allocation ──► cutoff ──► score ──► approve / waitlist
        ▼
Approved ──► pickup QR (opens 60 min before the slot) ──► Owner scans, checklist + photos, signs ──► student acknowledges
        │                         │
        │                         └─ not collected within grace ──► no-show, strike, slot offered to waitlist
        ▼
Checked out ──► overdue alerts (student → Owner → Manager) ──► return QR ──► return photos ──► AI comparison
        │
        ├─ Return OK ──► completed: credits charged, hold released
        └─ Raise damage ──► student responds ──► Manager (not the reporter) decides ──► credits / restriction / maintenance
                                                                                    │
                                     every step ──► audit timeline visible to the student, the org's staff and Admins
```

Spaces with a door QR (badminton court, seminar hall) let the student check in themselves within the pickup window.

## 6. Features built during the hackathon

All of it, from an empty repository at 00:23 IST on 29 October 2026 (see the commit history).

**Students:** Google sign-in restricted to the college domain, onboarding with ID upload; discovery with filters and AI smart search; eligibility on every card and resource page; request form with live credit summary and exception requests; pickup and return QR; "I can't make it"; waitlist offers with accept windows; extensions; credits wallet with ledger; training-certificate upload; strike warnings; damage-case response; penalty appeals; safety incident reports; full booking timeline.

**Owners:** listing form with four templates (space, lab, portable equipment, machine), block/review rules per eligibility check, checklist and guided photo shots; approval queue with requester history; QR scanner (phone camera or pasted code) with identity confirmation; handover and return with checklist, photos and signature; door QR for spaces; AI condition flags to confirm or dismiss; certificate verification with AI extraction; pause and maintenance with reasons.

**Managers:** urgency-sorted decision queue; restricted approvals and exceptions; damage disputes with shot-by-shot evidence, the student's response and confirmed AI flags; conflict-of-interest routing (a Manager never decides a case they filed); penalty confirm / reduce / waive; overrides with `MANAGER_OVERRIDE`; incidents with mark-unsafe and a separate restore step; department insights (booked vs open vs used hours, overdue, "Owner not present", booking distribution, repeated no-shows) and "My decisions" for self-review.

**Admins:** verification queue; role grants and revokes with reasons; versioned policy editor with a diff and confirmation; badge types; emergency credit decisions; escalations and high-severity incidents; underused-resources report; audit log with filters and CSV export; demo clock and demo-data reset.

**System:** single booking state machine (`transition_booking`) for every status change; scheduler (batch allocation, offers, no-shows, overdue, reminders, escalation, dispute expiry, weekly reset); in-app notifications for every Section 13 event; double-booking guard in the database.

## 7. Stack and architecture

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router, TypeScript, React 19), Tailwind CSS 4, shadcn/ui on Base UI, lucide icons |
| Validation | zod on every server-action input and every AI output |
| Database | Supabase Postgres: RLS on every table, `btree_gist` exclusion constraint against double booking, domain logic in `SECURITY DEFINER` functions |
| Auth | Supabase Auth: Google (college domain enforced in a database trigger) + email/password for seeded demo accounts only |
| Storage | Private Supabase buckets for ID proofs, certificates, condition photos, incident evidence; signed URLs |
| Scheduler | `POST /api/cron/tick` (Bearer `CRON_SECRET`), designed for a one-minute Render cron (`render.yaml`, `worker/tick.mjs`); in this deployment it runs from **Run scheduler now** |
| AI | AI router (OpenAI-compatible) with DeepSeek V4.1 Flash, server-side only |
| QR | `qrcode` to render, `html5-qrcode` to scan; tokens HMAC-signed with `QR_SIGNING_SECRET` |
| Time | `date-fns` / `date-fns-tz`, campus time Asia/Kolkata; all business logic reads `app_now()` so the demo clock moves everything |
| Hosting | Vercel (Dublin, next to Supabase in eu-west-1) |

```
Browser ──► Next.js on Vercel ──► server actions / route handlers
                                     │  pure domain logic (src/lib/domain: eligibility, priority, pricing, grace, strikes, QR)
                                     │  shared contracts (src/lib/contracts: types, states, zod schemas)
                                     ▼
                              Supabase Postgres ── transition_booking() → audit_events + notifications
                                     │                 RLS on every table, append-only audit
                              Supabase Storage (private buckets)
Cron / "Run scheduler now" ──► /api/cron/tick ──► batch allocation + scheduler_tick()
Server ──► AI router (DeepSeek) ──► zod-validated suggestions, stored with model, time, confidence
```

Code map: `src/lib/contracts` (types and states), `src/lib/domain` (pure functions with unit tests), `src/lib/server` (server actions, queries, scheduler), `src/lib/ai` (client, prompts, schemas), `supabase/migrations` (schema, functions, RLS, seed), `scripts/` (live acceptance checks per phase).

**Verification:** 50 unit tests (`npm test`) and a live acceptance script per phase. Phase 7 adds the judge script run twice after a reset (`scripts/phase7-judge.mjs`), a forbidden-action sweep over every table for every role (`phase7-forbidden.mjs`) and a rendered-markup accessibility audit of 36 pages (`phase7-a11y.mjs`).

## 8. AI tools and services

**At runtime:** DeepSeek V4.1 Flash (`deepseek/deepseek-v4.1-flash-1017`) through an OpenAI-compatible AI router, called only from the server. Every reply must be JSON, is parsed with zod, gets one retry and then falls back. 20-second timeout. Outputs are stored with model, time and confidence, labelled "AI suggestion", and **never change a state**.

| Feature | What it does | Human step | Without AI |
| --- | --- | --- | --- |
| Smart search | "cnc machine this week" → category, dates, times, quantity as editable filter chips; asks when ambiguous | Student confirms or edits the chips | Plain filters and text search |
| Condition comparison | Pairs pickup and return photos by shot name; lists possible differences with confidence; says "inconclusive" when angle or lighting differ | Owner confirms or dismisses each flag; a Manager decides any dispute | Owner compares the photos side by side |
| Certificate extraction | Reads name, course, issuer and dates from an uploaded training certificate | Owner of the issuing org verifies or rejects | Owner reads the certificate |

A fourth feature (AI case summary for Managers) was planned as a "could" and cut for time.

**To build it:** see Disclosures.

## 9. Privacy, security and fairness

**Security**
- Row-level security on every table; signed-out callers can read nothing. A Phase 7 sweep had a student, an Owner, a Manager and an Admin each try to insert into and delete from every table over the API: all refused, no rows lost.
- All status changes go through one database function that checks the actor holds the role they claim and writes the audit event in the same transaction.
- The audit log is append-only at the database level: `UPDATE`/`DELETE` are revoked for every role, the service role included.
- Students can update only their own name, department, year, roll number and phone, never their status or admin flag (column-level grants).
- The service-role key, AI key, QR secret and cron secret stay on the server. QR tokens are HMAC-signed, expire and are bound to the booking and the student; the Owner sees the real student's photo before handing over.

**Privacy**
- ID photos sit in a private bucket readable only by Admins and are deleted on the verification decision.
- Owners see only the name, photo and department of students requesting their resources. CSV exports exclude emails and phone numbers. No personal data goes in URLs.
- Real sign-in is limited to the college's Google domain, enforced in the database.

**Fairness**
- Eligibility is shown before the request, with the reason and the fix.
- Batch allocation uses a published score that every student can see broken down, and it rewards the unlucky, not the fastest clicker. Overriding the recommendation requires a reason.
- Weekly credits and active-booking caps prevent monopolising. No-show strikes (3 in 30 days, the 4th forfeits the hold) protect other students' slots. "I can't make it" before the start is always free. "Owner not present" never costs the student.
- Damage is decided by a person who didn't file the report, only after the student has had a chance to respond. AI never decides access, damage or penalties.

**Accessibility:** WCAG 2.1 AA contrast on every colour pair in use; skip link; visible focus ring; labels on every input; status shown with icon and text, never colour alone; `aria-live` for notifications and timers; reduced motion respected; phone-first scanner and QR pages.

## 10. Testing instructions

Open https://resour-city.vercel.app in a fresh browser and choose **Try the demo**. Each demo button signs in one account with a single click. The same accounts also work with the demo password `DvitDemo@2026`.

| Button | Shows |
| --- | --- |
| Student — Riya | Main demo student: 100 credits, Photography Basics badge |
| Student — Aarav | No CNC badge: "Action required" on the CNC |
| Student — Sneha | 10 credits left: the emergency credits path |
| Student — Kabir | 2 no-shows: the "2 of 3" strike warning |
| Student — Om (pending) | Awaiting verification |
| Owner — Photography Club | Requests, handovers, AI flag to confirm |
| Manager — Prof. Mehta | Late penalty, CNC exception, cases he filed (routed to the Admin) |
| Manager — Prof. Kulkarni | Decides the damage case the Photography Club Owner files |
| Admin | Verification, emergency credits, escalation, policies, audit |

To switch account: avatar menu (bottom of the sidebar) → **Sign out**, then pick another demo button.

**Demo clock.** Admin → Overview → **Demo controls**: **+15 min**, **+1 hour**, **+1 day**, **Reset clock**, **Run scheduler now**, **Reset demo data**. The clock only moves forward. In this deployment the scheduler is not on a background cron, so **press Run scheduler now after every clock move**: that is what allocates batch slots, marks no-shows and overdue items, and sends reminders. **Reset demo data** restores the seed and the real time (do this first if someone has used the demo before you).

### Judge script (about 8 minutes)

1. **Owner — Photography Club** → My resources → **Add a resource** → *Portable equipment*. Note the dynamic fields, the rules (block / review) and the checklist with guided photo shots.
2. **Student — Aarav** → Find a resource → search "cnc machine this week" → the CNC shows **Action required: CNC Safety Training**. Search "camera for tomorrow" → the DSLR shows **Eligible**.
3. **Student — Riya** → DSLR camera kit → pick tomorrow's date (keep the default time) → **Check this slot** → see the credit hold summary → **Send request**.
4. **Owner** → Requests → approve. **Riya** → My bookings → the booking shows the **Pickup QR**.
5. **Admin** → **+1 day** → **Run scheduler now**. **Owner** → **Scan** (point the camera at Riya's QR, or on Riya's booking open "Can't scan? Show the code" and paste it) → confirm Riya's photo → checklist + guided photos → sign. **Riya** → acknowledge the condition record.
6. **Admin** → **+1 day**, then **+1 hour** three times (now late) → **Run scheduler now**. **Owner** → Handovers → record the return with photos → the AI compares the shots → **Raise damage for a Manager to decide**.
7. **Riya** → the booking → respond to the damage case.
8. **Prof. Kulkarni** → Safety & disputes → the case: side-by-side evidence, Riya's response → choose a partial credit deduction with a reason. On the same booking, confirm or waive the late penalty.
9. **Riya** → the booking: the timeline shows every step with actor role and reason; Credits wallet shows the ledger.
10. **Admin** → **Run scheduler now** → the seminar hall batch is allocated → open a waitlisted request to see its **Priority score** breakdown → Insights (underused-resources report) → Audit log (filters, **Export CSV**).
11. Optional: **Sneha** → Credits wallet → request emergency credits; **Admin** → approve a partial grant. **Admin** → Verifications → verify **Om**; People & roles → grant a role; Campus policies → change a value and see the version diff.

If the AI router is slow or unavailable, every AI panel says so and the manual path continues.

## 11. Team and participants

> **TODO (team):** name, role and contribution of each member.

## 12. Disclosures

- **Code written with AI:** the code was written with **Claude Code** (Anthropic), including parallel agent sessions for backend, frontend and worker tasks, directed and reviewed by the team. One commit (`7be4a36`, the UI redesign) is authored as "Claude" because it came from a Claude Code cloud session.
- **AI at runtime:** DeepSeek V4.1 Flash via an OpenAI-compatible AI router (search parsing, condition comparison, certificate extraction).
- **Frameworks, services and libraries:** Next.js, React, Tailwind CSS, shadcn/ui and Base UI, lucide-react, Supabase (Postgres, Auth, Storage) and `@supabase/ssr`, zod, date-fns and date-fns-tz, qrcode, html5-qrcode, class-variance-authority, tw-animate-css, Vitest, ESLint; hosted on Vercel. Fonts: DM Sans, Instrument Serif and Source Code Pro via Google Fonts.
- **No pre-existing project code:** the repository starts empty at the first commit (29 October 2026, 00:23 IST); all commits fall inside the 48-hour window.
- **Demo data is fictional:** institution, people, email addresses and bookings.

## 13. Known limitations

- One fictional institution; multi-institution sharing is not built.
- Credits only; no real deposits or payments.
- The scheduler runs from **Run scheduler now** in this deployment: the one-minute Render cron (`render.yaml`) is written but not deployed. Without it, no-shows, overdue alerts and batch allocation wait for the next manual run.
- Email notifications are not built; in-app notifications are the channel. Demo addresses are on a domain we don't own, so we chose not to send mail.
- The AI case summary for Managers was cut.
- ID photos are deleted from storage on decision, but provider backups follow Supabase's retention policy.
- AI comparison quality depends on photo angle and lighting; it often returns "inconclusive", by design.
- Utilisation "before" figures are Owner estimates, not measurements.
- The simulated clock exists for demonstration only. The audit log is append-only, so it keeps events from earlier demo runs after a reset.
- In demo mode any Google account can sign in and lands as a student awaiting verification; with demo mode off only the college domain is allowed.

## 14. Future scope

- Supervisor/Lab Staff role and supervised-session check-ins.
- Per-permission role configuration and two-Admin approval for sensitive actions.
- Group and team bookings with shared fairness accounting.
- Real monetary deposits for high-value equipment.
- Multi-institution federation (borrowing across nearby colleges).
- Hindi and Marathi interface.
- Anomaly detection on usage patterns, richer utilisation analytics.
- Native mobile app with offline QR scanning.
- Calendar integrations and IoT smart-lock check-in for rooms.
- Email and WhatsApp notifications to verified addresses.
