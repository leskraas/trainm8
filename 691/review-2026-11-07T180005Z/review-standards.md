# Standards review, PR #691 at 4ea4dcf (bredvid-code-review, Standards axis, run inline)

Diff: `git diff origin/main...HEAD` (15 files, +1218/-117). Standards read: CLAUDE.md (guard files, exact deps, labels in labels.ts), docs/agents/*.md, GLOSSARY.md, ADR 0053/0081/0085/0112, docs/design/design-system.md.

- No guard file touched (.github, .claude, AGENTS.md, CLAUDE.md, fly.toml, other/). No dependency added.
- Words live in `labels/plan-generate.ts` (ADR 0081: words at the edge); `previewSeason` returns numbers and codes, the route words them with `wordTrackWeek`. Holds.
- `volumeSessionOf` delegates to `prescriptionVolumeOf`; `discipline` now reads `workout.discipline ?? getSessionDiscipline(session)`, equal to `getSessionDiscipline` (training.ts:38). No behaviour change to Sesong. Holds.
- GLOSSARY `Planned Volume` extended with the preview reading, ADR 0112 added. Holds.
- Formatting: left to `npm run lint` / prettier in the check run.

No Standards finding.
