# PR #695 — Standards and Spec (bredvid-code-review, two axes, run in sequence by one agent)
Head reviewed: abf5c0d. Diff: `git diff origin/main...HEAD`. Spec: issue #673 (criteria, Design, Architecture, Decisions), ADR 0112.

## Standards
- S1 (medium) app/utils/plan-outline/season-edit-schema.ts:212-216 — `addWeekKey`/`setWeekKey`/`removeWeekKey` are `z.string()`, not `WeekKeySchema` (authoring-schema.ts:39, "YYYY-MM-DD and a Monday", ADR 0044 §3) which the direct anchor editor's schemas use for the same column. Scenario: post `addWeekKey=2026-10-21` (a Wednesday): `weekIndexOf` rounds it into week 43, it passes `inPlan` and the lived check, and `applySeasonEdit` upserts a segment keyed `2026-10-21`; a later add on `2026-10-19` then creates a second segment in the same week, which `editAnchorList` ("two segments cannot share a week") cannot see. Fix: `blankIsKeep(WeekKeySchema)`.
- S2 (low) app/routes/training/__season-edits.tsx `weekPickLabel(prefix = 'Uke')`, held row `Uke {week.weekNumber}`, preview row `Uke {row.weekNumber}` — copy outside `labels.ts` (CLAUDE/criterion 12). Base copies the pattern in `weekLabel`, the PR adds three more. Fix: a `week` label in SEASON_ANCHOR_EDIT_LABELS.
- Lint on touched folders (`eslint app/routes/training app/utils/plan-outline app/utils/labels`): 0 errors, 2 warnings in untouched files. Typecheck clean.
- Tests: 7 touched test files, 295 passed; related (from-rows, attach-event, authoring.server, philosophy) 204 passed.

## Spec
Criteria 1–11 met at the head (lead row + deep link, three acts, preview with rise warnings and held, digest-tied confirm with stale message, lived refusals with offer, earliest not removable, add-on-held-week merges, override held, gated re-lay with server pins, authored|derived marker + derivation one tap away, Avansert editor unchanged).
- P1 (medium) criterion 2 ("in the track's Volume Currency") / Design "before → after": preview rows render bare figures (`4 → 5`, see plan.season-edits.test.ts row `before: '4', after: '5'` for an hours track); `SeasonAnchorPreviewView.unit` is computed and never rendered. A minutes/hours/km track reads ambiguously. Fix: show the unit after the after-figure.
- P2 (low) criterion 12: see S2.
