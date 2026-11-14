# Qualities review: PR #691 (closes #472), head 76bff60

Phase `poc` (`docs/agents/factory.md:16`). I read the diff `git diff origin/main...HEAD` (21 files, +1494/−201) against every quality in
`.claude/skills/factory/references/qualities.md`. I also checked it against `CLAUDE.md` (UI craft), `docs/design/design-system.md`, ADR 0119, ADR 0053 §6/§8 and
the spec of #472. I did not read the PR body or the factory's comments.

The PR's tests pass at the head:
`vitest run planned-volume.test.ts week-volumes.test.ts labels.plan-generate.test.ts generate.server.test.ts plan.generate.$eventId.route.test.tsx`
gives 5 files and 102 tests passed. I ran them with `.env.example` sourced into the shell; no file was written.

## Verdict

There is no critical, high or medium finding. Three low findings follow. Under `poc` each one is a debt to record and none needs to go back to `implement`. Security and Data hold.

## Findings

### 1. Insight: a dropped placed session leaves no trace, and the card's rows and figure then disagree (low)

- **Where:** `app/utils/plan-generation/generate.server.ts:568-569` (`if (!workout) return []` in `readPreviewWeekVolumes`). The same drop happens on the approval path at `readStockWorkouts`, `generate.server.ts:746-756`, where `writeSessions` skips the session.
- **What:** a placed session whose `workoutId` is not a live `authorship: 'system'` Workout is left out of the week's Planned Volume and out of `hasSessions`. `WeekCard` still lists the session's row, because it renders from `season.sessions`. So the figure can be smaller than the rows under it, and no log line records which id was dropped, for which athlete, or why. With the shipped deterministic generator this can't happen today, because the corpus read applies the same filter. It becomes possible with a model-backed generator (the seam ADR 0053 keeps open), or when the corpus is re-seeded between a preview and its approval.
- **How to show it:** run `previewSeason` with a `generator` that returns one session whose `workoutId` does not exist. The test `a placed session whose id is not a Stock Workout is neither read into the preview nor copied on approval` already sets this up. The week's `volumes.tracks[].sessions.planned` is then one less than the number of rows the card renders for that week, and nothing reaches stdout or stderr.
- **Fixable without a human decision:** yes. Add one `console.warn` with the dropped ids and the athlete id in `readStockWorkouts`, or have it return the missing ids so the caller can log them. Under `poc` this is a debt.

### 2. Speed: the preview ships the whole week model to the browser on every rebuild (low)

- **Where:** `generate.server.ts:186` (`weekVolumes: PreviewWeekVolumes[]` on `SeasonPreview`). The loader returns the preview unchanged (`plan.generate.$eventId.tsx`, `loader`).
- **What:** each preview week carries full `WeekVolumes`: per track, `grade`, `pace`, `zones` with `secondsByZone`, the `plannedUnmeasured` and `actualUnmeasured` lists, `stripValue`, `partial`, and so on, plus `other`. The card renders about eight fields per track: target, planned, the unmeasured count, drift, name and unit. Every change of answer is a navigation that re-sends all of it for every season week. I estimate 0.6–1 KB per track-week, so a 24-week, 3-track season adds roughly 45–70 KB of loader JSON per rebuild. This is an estimate, not a measurement. Query count does not grow per row: there are two extra reads per preview (`readStockWorkouts` and `getLedgerWeeks`), they run in parallel (`Promise.all`, `generate.server.ts:551`), and each is one `findMany` with nested selects, so there is no N+1.
- **How to show it:** in the route test or the e2e test, take `JSON.stringify(loaderData.preview.weekVolumes).length` for the default season. In a browser, check the size of the `.data` response before and after this PR when an anchor changes.
- **Fixable without a human decision:** yes, but it is not free. One option is to word the tracks on the server in the loader and send only `TimelineTrackWeek`'s rendered fields. Another is to project `WeekVolumes` to the fields `wordTrackWeek` reads before returning it. Either way, ADR 0081's "words at the edge" still holds, because the loader is the edge. This is a debt under `poc`. Nobody judging the demo would notice it on a local connection.
- **Note (no change needed):** the placed Stock Workouts are read twice per preview, once in `readGenerationCorpus` and once in `readStockWorkouts`. ADR 0119 §2 chooses this on purpose (one reader shared with approval), and it is one constant query.

### 3. Access / break-ui: the name stacks at a breakpoint set in pixels, so text-only scaling isn't covered (low, plausible)

- **Where:** `app/routes/training/plan.generate.$eventId.tsx:908`, `@max-[300px]:grid-cols-1` on the track list. Its `@container` is at `:903`.
- **What:** the breakpoint where the name stacks above its figures is container width in CSS px. Browser zoom shrinks the container and stacks correctly, which is the 195-px check the design names. Text-only scaling enlarges `text-footnote` (rem, `app/styles/tailwind.css:368`) without changing the container's width. Examples are Android Chrome's text scaling, Firefox's "zoom text only", and a raised minimum font size. At about 200 % text on a 390–412 px phone, the card stays two columns. The widest `whitespace-nowrap` group, `+12 uten timer ≠`, is then about 200–215 px wide in a figure column of about 220 px, at the edge of overflowing the `minmax(0,1fr)` column. I reasoned this through and did not render it.
- **How to show it:** use Playwright at 390×844, set `document.documentElement.style.fontSize = '200%'`, and seed a week with an hours track that has more than 9 unmeasured sessions and drift. Then assert `scrollWidth <= clientWidth` for each `[data-week-track]` and for the page.
- **Fixable without a human decision:** yes. Write the breakpoint in `em` (for example `@max-[20em]`), which container queries resolve against the container's own font size, so it scales with the text. The spec already sends "iOS Larger Text at its largest size" to a real phone. This check belongs with that one.

## Qualities checked and found clean

- **Security.** Every new read is scoped:
  - `getLedgerWeeks` filters by `userId` (`app/utils/training.server.ts:1691-1703`).
  - Thresholds come from `athleteId`.
  - The event is checked against `athleteId` in `readContext` (`generate.server.ts:318`).
  - `readStockWorkouts` tightens the approval path. It now reads only `authorship: 'system'` rows (`generate.server.ts:752`), where `writeSessions` used to read any Workout id the seam handed back. A test pins this.

  Answers still come from the URL and are regenerated server-side on POST (ADR 0053 §8), and nothing from the browser is trusted. The loader sends only the athlete's own aggregates. No secret and no log is involved.
- **Data.** No migration and no schema change. `prisma/` is not in the diff. The preview still writes nothing, and the test `a preview writes nothing at all` checks that.
- **Failure.**
  - The change makes no outbound call, so no timeout or retry applies. The new reads are local DB reads in the same loader, so a failure goes to the existing error boundary, as the other reads in `readContext` already do.
  - Empty and missing states are handled by the shared week model:
    - A week with nothing placed reads `planlagt 0 km`.
    - A week whose sessions are all unmeasured reads `2 økter uten km` (`figureNotes.planned`), never `0 km`.
    - A `null` target reads `—`, plus `ikke tilgjengelig` for screen readers.
    - The `'—'` fallback for `planned` can't be reached, because `total()` returns null only when there are unmeasured sessions.
  - A season with no weeks returns `[]`.
  - `figures` is null only if `weekVolumes` lacks a week, which can't happen because the mapping is 1:1 over `season.weeks`.
- **Speed, apart from finding 2.** There is no N+1 and no waterfall. Approval drops a read: `defaultTrainingTime` was a separate `findUnique` and now rides on `readContext`'s profile read. The O(n) per-week grouping in `previewWeekVolumes` is trivial.
- **Access.**
  - The track list has `role="list"` and its `aria-label` from `labels.ts`.
  - The `·` separator is `aria-hidden`.
  - `≠` is the shared `DriftMark` (`role="img"` with `DRIFT_MARK_LABEL`) and sits inside a `nowrap` group with a thin space before it, so it never stands alone.
  - Rows are a `subgrid` rather than `display: contents`.
  - Colours are design-system tokens: `text-track-*-ink` (≥5:1), `muted-foreground` (5.5 on the card) and `status-under` (5.0 on the card), all AA per `docs/design/design-system.md:204-207`.
  - Nothing interactive was added, so the keyboard path is unchanged.
- **UI craft** (CLAUDE.md):
  - No motion was added, so `review-animations` has nothing to block.
  - No touch target was added (`mobile-native`).
  - The design-system rules hold: `text-footnote`, `tabular-nums`, the Norwegian comma via `formatNbVolumeFigure`, labels in `labels.ts`, and no-break spaces in the page sentence.
  - break-ui cases are covered: long numbers (`1 270,5 km` stays whole), zero items, missing values, a `null` target, and track names with `[overflow-wrap:anywhere]`. The one open case is finding 3.
  - For a real phone: VoiceOver on iOS Safari reading the list and the `≠`, and iOS Larger Text at its largest size. The spec already names both.
- **Behaviour kept:**
  - The `volumeSessionOf` split keeps Sesong's reading: the discipline falls back through `getSessionDiscipline` only where there is no Workout, as before.
  - `ledgerVolumeSessions` replaces two identical inline mappings in `get-season.server.ts` and `week-volumes.server.ts`.
  - The existing `week-volumes` tests are unchanged and pass.
