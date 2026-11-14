# Qualities review: PR #691 (closes #472), head 5eaf9b3

Phase: `poc` (`docs/agents/factory.md`). Under `poc`, review sends work back to implement only for a high or critical finding on the happy path, a secret, or a one-way door. Everything else is recorded as a debt.

**Verdict: no high or critical finding. Nothing goes back to implement. There are 6 low findings, all of which can be fixed without a human decision, and each is a `Debt:` candidate.**

## What I ran

- `git diff origin/main...HEAD` (16 files). I read every non-test hunk and the new tests.
- Tests: `VITEST_DB_TAG=qual$$ npx vitest --run app/utils/plan-generation/ app/utils/plan-outline/week-volumes.test.ts app/utils/labels.plan-generate.test.ts app/routes/training/plan.generate app/utils/session-profile` (env from `.env.example`). Result: **12 files, 272 tests passed.**
  - Without `VITEST_DB_TAG`, the first two runs failed in `generate.server.test.ts` with `Unique constraint failed on the fields: (id,authorship,archetype)`. Each run failed a different number of tests (8, then 4), and some of the failures were in pre-existing #473 tests. The cause is other vitest processes in the same worktree using the same SQLite files (`tests/setup/db-setup.ts` warns about this). It is not a defect in the PR.
- I did not run the typecheck: `react-router typegen` would write into the worktree.
- Contrast: I converted the oklch tokens in `app/styles/tailwind.css` and computed WCAG contrast. All pass AA against the card and the page background. Light theme: muted 5.47, status-under 5.02, run-ink 5.44, bike-ink 5.37, swim-ink 5.37. Dark theme: ≥7.3.

## Findings

### 1. Speed: low. One extra `athleteProfile` read on every preview navigation
- **Where:** `app/utils/plan-generation/generate.server.ts:551` (`defaultTrainingTime(athleteId)` inside `readPreviewWeekVolumes`). It does `prisma.athleteProfile.findUnique` at line 694. `readContext` has already read the same row at line 331 (`select: { trainableWeekdays, weeklyCapacityHours }`).
- **How to show it:** read lines 331–334 and 694–697. The same row is read twice per loader run, and the loader runs again on every answer change.
- **Fix:** add `defaultTrainingTime: true` to the `readContext` profile select, carry it on `GenerationContext`, and pass it to `placedAt`. This also drops a read from `approveSeason`. **Fixable without a human.**

### 2. Speed: low. The loader sends the full week model for every season week to the browser
- **Where:** `generate.server.ts:515` puts `weekVolumes: PreviewWeekVolumes[]` on the preview, and the route loader (`plan.generate.$eventId.tsx:186`) returns it as is. Each entry holds a whole `WeekVolumes`: per track that is `grade`, `zones` (planned and done shares), `pace`, `sessions`, `plannedUnmeasured[]`, `actualUnmeasured[]`, `stripValue`, plus `other`. The card reads about six fields per track (`figures.target/planned`, `figureNotes.planned`, `plannedUnmeasuredCount`, `driftLabel`, `unit`/`name`). The route also brings `wordTrackWeek` (and its label and format imports) into the client bundle.
- **How to show it:** in the existing pin test (`generate.server.test.ts:487`), log `JSON.stringify(preview.preview.weekVolumes).length` for a season of 16 or more weeks, and compare it with the length of a projection to the fields above.
- **Fix:** project to a narrow per-track shape in the loader, or word the tracks in the loader and send only what is rendered. ADR 0119 §5 keeps the wording at the edge, and the loader is that edge. **Fixable without a human.** Under `poc` it is a debt, not a blocker.

### 3. Access: low. The track list may lose its list role and name in VoiceOver
- **Where:** `app/routes/training/plan.generate.$eventId.tsx:912-915` (`<ul aria-label={L.weekFiguresLabel} className="… grid …">`).
- **Why:** Tailwind preflight sets `list-style: none` on `ul`. WebKit/VoiceOver then removes the list semantics unless the list carries `role="list"`. `aria-label` on what then becomes a generic element is not announced. Criterion 12 is judged on VoiceOver. The visible `mål` / `planlagt` labels still say which figure is which, so the criterion's core holds. Only the list name and the item count are at risk. The design chose `subgrid` over `display: contents` for this same WebKit reason.
- **How to show it:** VoiceOver on iOS Safari over a week card, which needs a real phone. The Chromium e2e (`getByRole('list', { name: 'Mål og planlagt per idrett' })`) passes, but it cannot show the problem.
- **Fix:** add `role="list"` to the `ul`. **Fixable without a human.**

### 4. Access: low. An unavailable target is silent to a screen reader
- **Where:** `plan.generate.$eventId.tsx:947` (`track.figures.target == null ? '—' : …`). The `—` is the only content of the value.
- **Why:** with VoiceOver's default punctuation level an em dash is usually not spoken. The row is then heard as "Løping, mål, planlagt 24 km", and the listener cannot tell that the target is an **Unavailable Metric** rather than missing from the announcement.
- **How to show it:** VoiceOver on a season with no anchor (the e2e's first state, `mål —`).
- **Fix:** keep the visible `—` with `aria-hidden` and add sr-only text from `labels.ts`, reusing an existing Unavailable wording if there is one. **Fixable without a human.** Sesong uses the same `—`, so this is a shared, pre-existing pattern.

### 5. Security: low. The Stock Workout reader does not check that a row is stock (defense in depth; pre-existing)
- **Where:** `generate.server.ts:759-762` (`readStockWorkouts`: `where: { id: { in: workoutIds } }`).
- **Why:** today the ids come only from `readGenerationCorpus` (line 203, `workout: { authorship: 'system' }`), so the risk is not exploitable now. The read trusts whatever ids the `SeasonGenerator` returns. ADR 0053 plans a model behind that seam. A wrong or injected id would then read another athlete's Workout into the preview figure, and approval would copy it. `writeSessions` already did the unfiltered read before this PR. The PR moves it into a shared reader and extends it to the preview.
- **How to show it:** a failing-test idea. Inject a generator that places a session with `workoutId` set to a Workout owned by athlete B, preview as athlete A, and assert that the Workout is not read (the figure leaves it out) and that approval does not copy it.
- **Fix:** add `authorship: 'system'` to the `where`. One line, and both callers benefit. **Fixable without a human.**

### 6. Insight: low (debt). A placed session that is left out leaves no trace
- **Where:** `generate.server.ts:557-559` (`if (!workout) return []`).
- **Why:** a Stock Workout retired or reseeded between generation and the read is dropped from the preview figure without a log line. Approval drops it the same way, which is pre-existing in `writeSessions`. The two figures stay consistent, but nobody can see that the figure is one session short.
- **How to show it:** read the lines above. No log or trace is written on that branch.
- **Fix:** a `console.warn` or trace event with the workout id and the athlete id. **Fixable without a human.** This is a debt under `poc`.

## Qualities checked with nothing found

- **Speed: N+1 and waterfalls.** The three new reads run side by side (`Promise.all`, line 541). The athlete's sessions are one range read over the season's span (`getLedgerWeeks`), not one read per week, and Stock Workouts are one `findMany` over the deduplicated ids. Nothing runs per row. Approval does not run the new reads. Client-side lookup is a `Map` (`byWeek`).
- **Failure: loading, empty and error states.** "Nothing placed" reads `planlagt 0 km` (`total()` returns 0 with no sessions). "All unmeasured" uses `unmeasuredFigureLabel`, never `0 km`. A null target reads `mål —` and still shows the planned figure. Each is covered by a route test. `figures` is null only when a week is missing from `weekVolumes`, which cannot happen because `previewWeekVolumes` maps every `season.weeks` entry. The new reads add no outbound service, so no timeout is needed. A DB failure fails the loader as it did before.
- **Security: authorization and input.** `requireUserId` → `previewSeason(userId, …)`. The event is scoped by `athleteId` (line 315). `getLedgerWeeks` is scoped by `userId`. The browser sends nothing new: answers are parsed by the existing `readAnswers`, and approval still regenerates server-side. No secret reaches the client or a log. Rendered strings are React text, not `dangerouslySetInnerHTML`.
- **Data: migrations and correctness.** There is no migration and no schema change. Writes are unchanged: `writeSessions` uses the shared reader, and `buildBlocksCopy` copies fields one by one (`workout.server.ts:236-281`), so the extra block and step `id`s in `stockWorkoutSelect` never reach the copy. The pin test covers no-rescale. The `volumeSessionOf` split keeps Sesong's behaviour: `discipline` now comes from `workout.discipline` when a workout exists, and that is exactly `getSessionDiscipline` (`training.ts:42`). `easy`, `simpleActivity`, `plannedZones` and the TSS and sets rules are moved, not changed, and the existing week-volumes tests pass. Preview equals Sesong:
  - The same range predicate as `getLedgerWeek` (`weekBoundsFromMondayUTC`, `gte`/`lte`).
  - The same `localDate` bucketing.
  - The same `deriveLedgerStatus`.
  - The same `hasSessions` gate as `presenter.ts:975`.
  - `closed` is left out, but it only affects `grade`, which the preview does not render.
  - The test compares `target`, `planned`, `plannedUnmeasuredCount` and `driftMark` for every week, with one week holding the athlete's own session.
- **Access: contrast and the mark.** The contrast numbers are under "What I ran". `≠` is `role="img"` with `DRIFT_MARK_LABEL`. The `·` separator is `aria-hidden`. The labels `mål`/`planlagt` are visible text.
- **UI craft (design system, mobile-native, break-ui), static read.** The build follows the design: footnote, `tabular-nums`, muted labels, `font-medium` values, track ink, `subgrid` (not `display: contents`), `nowrap` only on value+unit, `·` hung on the target, `≠` inside the last nowrap group, `@max-[300px]` stack. There is no new motion and no touch target, so `review-animations` and the mobile-native checklist have nothing to judge. The worst-case widths look safe on paper: the longest nowrap unit is about `+12 uten timer ≠` (~115 px at footnote), and the names are fixed short labels (`nbTrackName`).
- **Not measured, needs a real phone (QA):** criterion 12's no-overflow at 390 × 844 and at a 195 px viewport has no automated test (the route tests are jsdom). VoiceOver needs a phone, see findings 3 and 4. So does iOS Larger Text.

## Note outside the qualities

- `docs/agents/verify/features/season-plan.md`: the re-wrap keeps a broken fragment that was already on main (`…None renders inside _Avansert_. holding the season editors (ADR 0101 §2). Its Week Pattern editor…`). This is docs only and was not introduced here.
