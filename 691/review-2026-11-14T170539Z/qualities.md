# Qualities review: PR #691 (closes #472), head 19e79f4

Phase `poc`. I read the diff against every quality in `qualities.md`: Speed, Failure, Access, Security, Insight and Data. **Nothing is high or critical, so nothing goes back to implement.** The three low findings are debts.

## Findings

### 1. Speed (low, debt): the loader ships the whole week model to the client for four figures
`app/utils/plan-generation/generate.server.ts:466-489`, worded at `app/routes/training/plan.generate.$eventId.tsx:259,870`.
`weekVolumes` holds a full `WeekVolumes` for every season week: per track `grade`, `pace`, `zones`, `partial`, `actualUnmeasured`, `stripValue`, `sessions`, plus `other`. The card reads only `target`, `planned`, the unmeasured count and `driftMark`. A 20-week triathlon season has about 60 track-weeks, and every answer change (shape, intent, anchor, start week) is a navigation that serialises all of them again, along with the `season` payload that is already there.
**Show it:** in the browser, measure the loader JSON bytes for `/training/plan/generate/:eventId?anchor-run=32&anchor-bike=5` against `origin/main`. A fix calls `wordTrackWeek` on the server, or keeps only the fields the card reads, and a route test asserts that `grade` and `pace` are not in the loader data.

### 2. Insight (low, debt): the dropped-id warning does not say for whom, and repeats on every preview
`app/utils/plan-generation/write-sessions.server.ts:66`.
`readStockWorkouts` now drops ids that are not `authorship: 'system'`, which is good hardening, and it logs the ids. The log line does not name the athlete, the event or the generator, and the preview calls it on every loader run, so one bad generator logs once per click. An operator who sees "N placed Workout id(s) are not Stock Workouts" cannot tell whose season came out short.
**Show it:** the existing test `a placed session whose id is not a Stock Workout…` could assert that the warning contains `event.id` or the generator id. It fails today.

### 3. Failure (low, debt): the figures can take down the whole preview
`generate.server.ts:466` calls `readPreviewWeekVolumes` without a guard. Before this change the preview stood without these two reads. Now a throw in `getLedgerWeeks`, `readStockWorkouts` or the prescription reading (`fixedDayVolume` or `deriveSessionProfile` on a malformed stored row) sends the athlete to the error boundary instead of a preview without figures. This is the same database, so the risk is small. The finding is that a single malformed Stock Workout row now breaks the page, not only the figure.
**Show it:** add a stock row whose step `intensity` is not valid JSON and load the preview. The page fails where `main` rendered.

## Checked and clean
- **Security:** the loader and the action keep `requireUserId`, and `getLedgerWeeks` is scoped by `userId`. Approval still regenerates on the server (ADR 0053 §8). The new `authorship: 'system'` filter keeps another athlete's Workout out (a test pins it). The client gets only numbers.
- **Speed (queries):** two new reads, run side by side, with no N+1. The `volumeSessionOf` split and the refactors of `getLedgerWeek` and `getSeasonAction` change no behaviour.
- **Data:** no migration. The preview writes nothing (tested).
- **Access:** each track list has a labelled `role="list"`. The `—` target has screen-reader text, `≠` is `role="img"` with a label, rows use subgrid (not `display: contents`), and there is no motion. `≠` never wraps alone.
- **Tests and i18n:** preview = _Sesong_ is pinned week by week, with a check that the comparison is not vacuous. No rescaling, every card state and the label strings are tested.
- **Needs a real phone:** VoiceOver and iOS Larger Text at 200 %.
