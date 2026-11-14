# Spec review: PR #691 against issue #472 (head 5eaf9b3)

**Verdict:** every acceptance criterion is implemented and traced through the code. I found no high or critical finding on the happy path. Three criteria are met in a form that differs from their literal wording, and each difference comes from a `## Decisions` entry (criteria 1/5, 8 and 12). One doc change is unrelated churn. Phase `poc`: nothing here needs to go back to `implement`.

Tests I ran (env from `.env.example`): `npx vitest run app/utils/plan-generation/ 'app/routes/training/plan.generate.$eventId.route.test.tsx' app/utils/plan-outline/week-volumes.test.ts app/utils/labels.plan-generate.test.ts`. 254 of 255 passed on the first run. Running `generate.server.test.ts` alone gave 4 failures, then 15 of 15 passed. The failures were always older tests (seed `Unique constraint failed on (id, authorship, archetype)`) and a different set each run, which points to a shared test DB rather than this diff. The new tests passed on every run.

## Criteria traced

| # | Criterion (short) | Status | Where |
|---|---|---|---|
| 1 | Target + Planned Volume per track, two labelled figures, units, never blended | Met (see F1 on "placed") | `plan.generate.$eventId.tsx` `TrackFigures`/`TrackFigureLine` (~l.905-1003); route test "a week card shows each track's target and planned figure" |
| 2 | Preview Planned = Sesong after approval; a test pins it | Met | `generate.server.ts` `readPreviewWeekVolumes` (l.533-583) → `planned-volume.ts` `previewWeekVolumes` → `buildWeekVolumes`; test "a preview week's Planned Volume is the one Sesong reads…" compares target, planned, unmeasured count, driftMark and hasSessions against `getWeekVolumes`/`getLedgerWeek`, including an existing session of the athlete's |
| 3 | Unmeasured counted apart (`+2 uten km`), never as zero | Met | `trackWeek` tally + `unmeasuredCountLabel`; route test "…counted apart, never as zero" |
| 4 | All unmeasured → no figure, existing words, not `0 km` | Met | `figureNotes.planned` (`2 økter uten km`); route test |
| 5 | Nothing placed → `planlagt 0`, unfilled lines unchanged | Met when the week has no existing session (see F1) | route test "a week with nothing placed plans 0…" |
| 6 | `≠` by `DRIFT_TOLERANCE`, not when unmeasured explain a short sum | Met. It uses the shared `drift()` through `wordTrackWeek`, gated per week as in `presenter.ts:975` | route test "≠ marks a week…" |
| 7 | Target `null` → `—`, planned still shown | Met | route test "…reads “—” for its target and still shows what is planned" |
| 8 | Hours track: distance step timed by thresholds, otherwise counted apart, no assumed pace | Met (wording: F2) | `prescriptionVolumeOf(workout, { thresholds: context.thresholds })`; `week-volumes.test.ts` "an hours figure times a distance step through the athlete's own thresholds…" |
| 9 | One Norwegian sentence above the weeks, in `PLAN_GENERATE_LABELS` | Met | `labels/plan-generate.ts` `placedAsPublished`; rendered once under «Sesongen» (route l.373-376); route + label tests |
| 10 | No rescale; copied blocks equal the Stock Workout's; a test pins it | Met | test "a placed session is not rescaled…" compares `blocks` field by field via `workoutCopySelect` |
| 11 | Regenerated season shows both figures; approval regenerates server-side; browser not trusted | Met | loader `previewSeason(…, readAnswers(url))`; action unchanged (answers from the URL, `approveSeason` regenerates); `weekVolumes` is never posted back |
| 12 | 390×844 no overflow; figures stay together or wrap as a unit; SR hears target vs planned | Implemented as the design specifies (wrapping: F3). Layout and VoiceOver were not verified by me (F4) | subgrid `li`, `@max-[300px]:grid-cols-1`, nowrap value+unit, `·` `aria-hidden`, `≠` `role="img"` |

Architecture §1–§7 and the implement decisions are followed. The generator and its payload are unchanged. Figures are on `previewSeason`'s result, numbers only, and the route words them. `readStockWorkouts`/`stockWorkoutSelect` is shared with `writeSessions`. `prescriptionVolumeOf` is split out and `volumeSessionOf` delegates to it (the `discipline` fallback is equivalent: `getSessionDiscipline` returns `workout.discipline` when there is a workout). `placedAt` is shared with `deriveLedgerStatus`. The `week-volumes` test diff only adds tests.

## Findings

### F1: Criteria 1 and 5 are met in a broader form, set by a Decision (one-way door)
- **Spec:** criterion 1, "the **Planned Volume** of the sessions placed in that week"; criterion 5, "A week with nothing placed (every slot unfilled) shows a planned figure of 0".
- **Build:** the planned figure also counts the athlete's sessions already in that week (`planned-volume.ts:110-124`, `generate.server.ts:541-581`). A week with nothing placed and one existing 12 km run reads `planlagt 12 km`, not `0 km`. The card then adds «Planlagt teller også med 1 økt du allerede har denne uka.» (`plan-generate.ts` `alreadyInWeek`).
- **Why:** Decisions, "Which sessions a generated preview week's planned figure covers" (ADR 0119 §4). It is needed for criterion 2 and says it rejects criterion 1's literal wording. The factory decided it as a **one-way door** under autonomy `full`.
- **Show:** route test "a session the athlete already has in the week is counted, and the card says so"; `planned-volume.test.ts`.
- **Severity:** low, since it is intended. It is flagged so a human can ratify the one-way door.
- **Fixable without a human:** no. Changing it means reversing a recorded decision.

### F2: Criterion 8's wording `uten t` is built as `uten timer`, set by a Decision
- **Spec:** criterion 8, "Without the threshold the session is counted apart (`uten t`)".
- **Build:** `unmeasuredCountLabel(n, 'hours')` → `+1 uten timer` (route test "an hours track counts a session it cannot time apart…").
- **Why:** Decisions, "Hours wording for unmeasured sessions". Criterion 3 asks for the existing wording.
- **Severity:** low. **Fixable without a human:** not needed. The decision already settles it.

### F3: Criterion 12's "wrap as a unit" is built as "break only between label and value", set by a Decision
- **Spec:** criterion 12, "each track's figures stay together on one line or wrap as a unit".
- **Build:** `whitespace-nowrap` sits only on value+unit (and on the last value with `≠`). A row can break after `mål 32 km ·` (`plan.generate.$eventId.tsx` `TrackFigureLine`, ~l.966-1001).
- **Why:** Decisions, "Large-text reflow and wrapping rules". Nowrap groups overflowed by about 66 px at 200 % text, and that option was rejected.
- **Severity:** low. **Fixable without a human:** not needed. The decision already settles it.

### F4: Criterion 12's layout and screen-reader half is not shown by any test in the diff
- **Spec:** criterion 12, "At 390 × 844 the page has no horizontal overflow … a screen reader hears which figure is the target and which is planned". The Design section adds the 195 CSS px check.
- **Build:** the route tests run in jsdom and check text only. The e2e test (`tests/e2e/plan-generate.test.ts`) checks the row's text and does not check width or overflow. The code follows the design (subgrid, a container-query stack under 300 px, `min-w-0`, `[overflow-wrap:anywhere]` on the name). I did not run a browser.
- **Show:** Playwright at 390×844 and at 195 px CSS width on `/training/plan/generate/:eventId?anchor-run=32&anchor-bike=5`, checking `document.documentElement.scrollWidth <= innerWidth`. VoiceOver on iOS Safari needs a real phone (Design, "Needs a real phone").
- **Severity:** low under `poc` (Debt).
- **Fixable without a human:** yes for the viewport check. The VoiceOver check needs a human with a phone.

### F5: Scope creep: an unrelated paragraph in the verify doc was reflowed
- **Where:** `docs/agents/verify/features/season-plan.md:13-19`.
- **What:** the diff rewraps the Guard Notices bullet (ADR 0118). That text has nothing to do with #472, and it already holds a broken sentence from an earlier merge («None renders inside _Avansert_. holding the season editors (ADR 0101 §2). Its Week Pattern editor…»), which the reflow keeps. The #472 addition further down (l.24-34) is in scope.
- **Severity:** low, doc-only churn.
- **Fixable without a human:** yes. Revert the reflow of that bullet, or leave it to a separate doc fix.

## Things I checked and found sound
- Preview = Sesong inputs. Sessions come from the same `ledgerSessionSelect` over the same local-week bounds (`getLedgerWeeks`) with the same thresholds (`getDisciplineThresholds`). Status is `deriveLedgerStatus` on the `scheduledAt` that approval writes (`placedAt`). The `planStartWeekKey` is the season start, which matches the written outline's start. `closed` is left out, and it only affects the grade, which the preview does not show.
- `existingSessions` counts only the rows a track's planned figure reads (on a season track, not in Annet, with a prescription), which matches `trackWeek`'s `plannedSessions` filter.
- `hasSessions` covers the whole week (placed + existing, Annet included), as `presenter.ts:975` does. The pinning test checks it against `getLedgerWeek(...).length`.
- The `≠` mark's `title` matches Sesong's `stream.tsx:613`, so it is not new behaviour.
- ADR numbering: the spec links ADR 0112, which main has since taken for another ADR. The PR's ADR 0119 and the GLOSSARY reference to it are consistent.
