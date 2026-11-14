# Spec review: PR #691 (closes #472) at 76bff60

Bar: `poc`. Judged cold against #472's body, its 12 acceptance criteria (as rewritten 2026-11-14), its `## Design`, `## Architecture` and `## Decisions`. I did not read the PR body or the factory's comments.

**Verdict: every criterion is met. Nothing is high or critical. One medium finding, outside the code: the PR's ADR number now collides with main.** Under `poc` it is not a send-back to `implement`. It is a rename anyone can make without a human decision.

Tests run (`VITEST_DB_TAG=spec691r2`, env from `.env.example`): `generate.server.test.ts`, `planned-volume.test.ts`, `week-volumes.test.ts`, `plan.generate.$eventId.route.test.tsx`, `labels.plan-generate.test.ts`. All 102 tests pass across the 5 files. The Playwright e2e was not run, because it needs the dev server.

## Findings

### 1. ADR 0119 is now taken twice: main merged its own ADR 0119 today (medium, fixable without a human)
- Spec: Architecture: "**The build must follow ADR 0119** (`docs/adr/0119-a-generated-weeks-planned-volume-…md` on the PR's branch; written as ADR 0112, renumbered when the branch was brought up to date…)".
- Main's `docs/adr/0119-every-page-is-on-the-luma-steps-…md` came in with #712 (`370e26b`, 2026-11-14 06:13 UTC). The branch is behind `origin/main`. Git merges it cleanly because the filenames differ, so the result would hold two ADR 0119s.
- Where: `docs/adr/0119-a-generated-weeks-planned-volume-is-read-outside-the-seam-as-sesong-will-read-it.md`. The number is cited in 12 places: `GLOSSARY.md:2926`, `app/utils/plan-outline/week-volumes.ts:276,351`, `week-volumes.test.ts:850`, `labels/plan-generate.ts:149`, `plan-generation/planned-volume.ts:3,39`, `generate.server.ts:182,528,744`, `generate.server.test.ts:435`, `plan.generate.$eventId.tsx:869`.
- How to show it: `git ls-tree --name-only origin/main docs/adr/ | grep 0119` and `git merge-base --is-ancestor origin/main HEAD`, which prints "behind".
- Fix: merge main, renumber to 0120 and update the citations. The issue's Architecture text, which names 0119, needs the same edit. No criterion is contradicted; only the spec's pointer goes stale.
- I also checked main's new `luma-steps` lint rule against the new classes. The new code uses `text-footnote` and no raw `text-*` or `rounded-*`, so the rule has nothing to flag.

### 2. The preview = Sesong test leaves two paths unexercised (low, test coverage, fixable)
- Spec: criterion 2: "A test pins the two readings to one function". Architecture 6(a): "compare planned figure, unmeasured count and drift mark, with one week holding a session the athlete already had".
- `generate.server.test.ts:487-567` does this against `getWeekVolumes`. It compares `driftMark` and checks `hasSessions` against the ledger row count. Two things are not covered:
  - The Sesong presenter path (`presenter.ts:927-976`) is not compared directly. It is equivalent, since it uses the same `volumeSessionOf`, `buildWeekVolumes` and gate.
  - `NOW` falls before the season starts. So the recorded decision "Status of a placed session … a fixed 'planned' would differ for days already past in the current week" is never tested with a season that starts this week.
- Debt only. The code path is shared and reads correctly: `placedAt` feeds `deriveLedgerStatus` (`generate.server.ts:169-177`).

### 3. Approval now copies stock rows only (low, scope creep, fixable or acceptable)
- Spec: Architecture 2: "The placed sessions' Stock Workouts come through `workoutCopySelect`, through one reader that `writeSessions` also uses."
- `readStockWorkouts` adds `authorship: 'system'` (`generate.server.ts:263`), so `writeSessions` now skips a workout id that is not a stock row. Before, it would copy any id. No criterion asks for this, and it changes the approve path's behaviour.
- It matches the corpus read (`readGenerationCorpus`, `generate.server.ts:203`, `workout: { authorship: 'system' }`), so the shipped generator never meets the new filter. It is pinned by the test "a placed session whose id is not a Stock Workout is neither read into the preview nor copied on approval".
- Harmless hardening, but it should be named in the PR. No human decision is needed.

### 4. Unrelated verify-doc repair (low, scope creep)
- `docs/agents/verify/features/season-plan.md:9-20` re-orders a Week Pattern sentence that a main merge had garbled (`877990f`). It has nothing to do with #472. It is correct and harmless.

### Not findings (checked)
- The `TRACK_INK` and `DriftMark` move into `_home/timeline/track-marks.tsx` touches `stream.tsx` and `season-pane.tsx`. It does not change what they render, and the Design asks for "Sesong's words, ink and ≠".
- The `volumeSessionOf` split (`week-volumes.ts:410-455`) is equivalent whenever `workout` is present. `getSessionDiscipline` returns `workout.discipline` first, and the null-workout fallbacks are kept. No existing `week-volumes` test changed, which satisfies 6(b).

## Criterion by criterion

| # | Criterion (short) | Status | Where / evidence |
|---|---|---|---|
| 1 | Week Target and Planned Volume per track, placed plus the athlete's own sessions; one "how many" line; two labelled figures, never blended | Met | `generate.server.ts:141-184` reads placed Stock Workouts plus a `getLedgerWeeks` range read. `planned-volume.ts:385-438`. Route `TrackFigures` / `TrackFigureLine` (`plan.generate.$eventId.tsx:902-1002`). `L.alreadyInWeek`. Route test "a session the athlete already has…" |
| 2 | Preview = Sesong after an unchanged approval; a test pins one function | Met (see F2) | Shared `prescriptionVolumeOf`, `ledgerVolumeSessions` and `buildWeekVolumes`. `getLedgerWeeks` has the same `where` and select as `getLedgerWeek`. Test `generate.server.test.ts:487` |
| 3 | An unmeasured session is counted apart (`+2 uten km`), never as 0 | Met | `tally` / `total` (`week-volumes.ts:647-671`). `unmeasuredCountLabel` beside the sum. Route test |
| 4 | All placed sessions unmeasured: no figure, the existing words, not `0 km` | Met | `figureNotes.planned`, which is `unmeasuredFigureLabel` (`2 økter uten km`). Route test |
| 5 | Nothing placed and nothing of the athlete's: planned 0, unfilled lines unchanged | Met | `total` of an empty tally gives 0. Route test "nothing placed plans 0…" |
| 6 | `≠` by Sesong's `drift` and `DRIFT_TOLERANCE`; no mark when unmeasured sessions could explain a short sum | Met | `drift()` is shared (`week-volumes.ts:885`). `wordTrackWeek` gates on whole-week `hasSessions`, as `presenter.ts:975` does |
| 7 | Target `null` reads `—` and the planned figure still shows | Met | `TrackFigureLine`: `—` is aria-hidden and the screen reader hears `ikke tilgjengelig`. Route test, plus the e2e regex |
| 8 | Hours track: a distance step is timed through thresholds; without them `+1 uten timer` | Met | `fixedDayVolume` with `getDisciplineThresholds`. Unit test `week-volumes.test.ts:554`. Route test for hours |
| 9 | One Norwegian sentence above the weeks, in `PLAN_GENERATE_LABELS` | Met | `labels/plan-generate.ts:138`, rendered once under «Sesongen» (`plan.generate.$eventId.tsx:376`), with no-break spaces |
| 10 | No rescaling; a copy equals its Stock Workout; a test pins it | Met | Test `generate.server.test.ts:552` compares the blocks field by field |
| 11 | Changing an answer shows both figures; approval regenerates on the server | Met | The loader recomputes `weekVolumes` from the URL answers. The action is unchanged. The e2e re-asserts the row after the anchor is typed |
| 12 | At 390×844 no overflow; break rules; stack below ~300 px; a screen reader names each figure | Met by code; layout not run | `@container` plus `@max-[300px]:grid-cols-1` and subgrid rows. `nowrap` covers value+unit, the target group (`mål 142 km ·`) and the last group with `≠`. The existing e2e overflow gates at 390 and 320 px at 200 % text cover the new rows, but I did not run them. VoiceOver needs a real phone, as the Design says |

## For the factory
- Back to `implement`? No. Nothing is high or critical, and nothing touches the happy path, a secret or a one-way door.
- Fix without a human: F1 (renumber the ADR after merging main).
- Debts: F2 (test with a season starting in the current week, and against the presenter), F3 (name the stock-only filter in the PR).
