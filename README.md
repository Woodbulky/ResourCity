# ResourCity

Lend a college's underused spaces and equipment to verified students, with eligibility gates, explainable fair allocation, credit limits, QR handovers, photo condition records, human-reviewed disputes and a full audit trail.

- **Live:** https://resour-city.vercel.app → **Try the demo** (one-click logins; demo password `DvitDemo@2026`)
- **Project document, testing instructions and judge script:** [docs/SUBMISSION.md](docs/SUBMISSION.md)
- Requirements: [docs/PRD.md](docs/PRD.md) · Build log per phase: [docs/PROGRESS.md](docs/PROGRESS.md)

Built in 48 hours for "Unlock Underused Equipment and Spaces". The demo institution (Deccan Valley Institute of Technology) and all demo data are fictional.

## Stack

Next.js 16 (App Router, TypeScript) + Tailwind on Vercel · Supabase (Postgres with RLS, Auth with Google, Storage) · scheduler at `POST /api/cron/tick` (Render cron in `render.yaml`) · DeepSeek V4.1 Flash through an OpenAI-compatible AI router.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

Apply `supabase/migrations/` in order to a Supabase project, then load the demo data with `select public.seed_demo();`.

## Checks

```bash
npm test                                                   # unit tests (domain logic, AI client)
npx next build && npx next start -p 3005                   # the live checks below run against this
node --env-file=.env.local scripts/phase7-judge.mjs        # the judge script, twice, after a reset
node --env-file=.env.local scripts/phase7-forbidden.mjs    # forbidden actions for every role and table
node --env-file=.env.local scripts/phase7-a11y.mjs         # accessibility markup on 36 pages
```

`scripts/phase1-check.mjs` … `phase6-check.mjs` are the acceptance checks for each earlier phase (`APP_URL=http://localhost:3005` for phase 4). Every live check re-seeds the demo data.
