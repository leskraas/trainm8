## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on `leskraas/trainm8`. See
`docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent,
ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `GLOSSARY.md` + `docs/adr/` at the repo root. See
`docs/agents/domain.md`.

### UI craft: Emil Kowalski's skills

Every change to UI or motion is held to Emil Kowalski's skills in
`.claude/skills/` (installed from `emilkowalski/skills`, see
`skills-lock.json`), on top of the design system in
`docs/design/design-system.md` (ADR 0085). Read `emil-design-eng` and
`apple-design` before designing, `animate` before adding motion, and
`mobile-native` for anything a thumb touches. Before a UI change is done, run
`review-animations` (its Before/After/Why table and verdict; fix every Block),
the `mobile-native` checklist, and `break-ui` with worst-case data, and say in
the PR what still needs a real phone. `pick-ui-library` decides library choices;
`improve-animations` and `find-animation-opportunities` audit motion across the
app.

### Seed data in production

Nothing seeds in production and `prisma db seed` must never be run there; corpus
data ships as `INSERT`s inside a migration. See
`docs/agents/production-seed-data.md`.

### Private notes

This repository is public. Notes that must not be public live in the private
repository `leskraas/trainm8-private` (attach it to the session to read them);
its `README.md` lists what is there. Today that is
`docs/research/agent-native-security-findings.md`, the 15 candidate security
issues behind §17 of `docs/research/agent-native-deep-dive.md`. Never copy
their contents into this repository.
