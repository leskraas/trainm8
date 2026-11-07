# PR #689 — code-review (Bredvid two-axis), run by hand, head f2d1a14

Diff: `git diff origin/main...HEAD` (2 commits: 2bdf764 docs ADR, f2d1a14 feat). Spec: issue #463 (AC, Scope, Architecture 1–8, Decisions).
Standards sources: CLAUDE.md (guard files, no --no-verify, exact dep versions), docs/agents/domain.md, GLOSSARY.md, docs/adr/ (0006, 0046, 0081, 0107), docs/agents/production-seed-data.md (trap 5), factory references/workspace.md (numbered files). Plus the Fowler smell baseline.

## Standards: PASS (0 findings)
- Guard files untouched; no new dependency.
- Migration header states that no displayed number moves and no notice is owed (production-seed-data.md trap 5): migration.sql lines 31–33. Nothing seeded.
- ADR 0081 (labels own words only): `moved` lives in `recompute-notice.ts`, copy stays in `RECOMPUTE_NOTICE_LABELS`.
- Glossary terms used as defined; "no CTL movement to name" kept distinct from **Unavailable Metric** in code, tests, GLOSSARY, ADR.
- Hand-written CHECK pinned by `recompute-notice.constraints.test.ts`, same shape as `plan-outline/constraints.test.ts`.
- Smells considered and suppressed: Speculative Generality (`'prescription'`, `CtlFor`) — the spec asks for the declaration and the type refusal before a prescription kind exists (AC 8, Architecture 3). `LOAD_RECOMPUTE_KINDS` is derived with an `as` cast from `Object.keys`; a judgement call, harmless because the table is `as const`.
- Note, not a finding: `docs/adr/0112-…` shares its number with main's `0112-derived-never-authored-…` (landed on main 2026-11-07 12:34, after this branch's merge base 6ec5b58). workspace.md "Numbered files": parallel runs taking the same number is expected and `update-branch` renumbers it when it brings the branch up to date; the PR is behind main, so the queue runs update-branch before QA/merge.

## Spec: PASS (0 findings)
AC by AC:
1. Swim backfill writes absent pair, incl. no-Load-Snapshot swimmer — `swim-pace-backfill.server.ts:268`, tests "a swimmer without CSS…" and "a swimmer with no Load Snapshots…".
2. Absent-pair notice shows kicker, explanation, Skjønner, no movement — `index.dashboard.test.tsx` new test (no digits/NaN/null/→, one `<p>`).
3. Pair notices render as today — presenter tests unchanged in substance.
4. Skjønner dismisses that notice only; next kind shown after reload — `recompute-notice.server.test.ts` "dismissing an absent-pair notice…".
5. Migration keeps every row, dates; swim equal pairs → NULL; strength equal pair untouched — `recompute-notice.migration.test.ts` runs the real SQL on the old table.
6. Rerun writes no second notice / no overwrite — server test "a second write…" and swim rerun test.
7. Export lists absent pair as null — server test "the data export…".
8. Kind declares load/prescription; prescription with pair is a type error (`@ts-expect-error` on `CtlFor<'prescription'>`); completeness test covers copy and declaration — `labels.test.ts`, `recompute-notice.test.ts`.
9. Unknown kind renders nothing with or without pair — presenter test.
Architecture 1–8 followed (one read seam folding the columns; kinds table; conditional writer type; both writers; one migration with CHECK, index, cascade, INSERT…SELECT; constraints test; migration test; export test). ADR 0112 + pointer notes in 0006 and 0107 §2 as decided. No scope creep (no prescription copy, no I dag notice, strength rule unchanged).

Summary: Standards 0, Spec 0.
