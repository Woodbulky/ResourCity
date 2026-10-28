# ResourCity

Lend a college's underused spaces and equipment to verified students, with eligibility gates, explainable fair allocation, credit limits, QR handovers, photo condition records, human-reviewed disputes and a full audit trail.

- Requirements: [docs/PRD.md](docs/PRD.md)
- Build status: [docs/PROGRESS.md](docs/PROGRESS.md)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev                  # http://localhost:3000
```

AI router smoke test: `node --env-file=.env.local scripts/ai-smoke.mjs`

Demo institution (Deccan Valley Institute of Technology) and all demo data are fictional.
