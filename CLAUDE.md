## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `leskraas/trainm8`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent,
ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### Seed data in production

Nothing seeds in production and `prisma db seed` must never be run there; corpus
data ships as `INSERT`s inside a migration. See
`docs/agents/production-seed-data.md`.
