# PR #692 (closes #503): qualities review

Head c3c1b09. Diff is `4c0bc03f...HEAD`. Phase `poc`, so only a high or critical
finding on the happy path, a secret, or a one-way door sends this back to
implement. Everything else is a debt.

Probes run on a scratch copy of the head, with node_modules linked from main and
the env taken from `.env.example`:
- `vitest run app/routes/_home app/utils/athlete-calendar.test.ts app/utils/session-profile.test.ts`: every
  timeline, presenter, stream, scroll-hook, calm-today, calendar and profile test passes. The 52 failures are
  all DB-backed route tests (`index.*.test.ts`, `season.test.ts`) that have no Prisma DB here.
- `react-router typegen && tsc --noEmit`: no error in any file the PR touches. The 10 errors left are in
  `tests/playwright-utils.ts` and `tests/utils.ts` and come from the dependency tree linked from main.
- CI: commits d6c9456..c3c1b09 (the intensity cache, the fallback, the ADR text and the sentinel fix) have
  **no check runs**. The last CI run, on 0d04dd9, has 137 passed and 2 failed, and both failures are the
  WebKit project (see T1).

## Speed: PASS (one note)
- The formatter cache (`app/utils/athlete-calendar.ts:29-45`), the lazy week days (`presenter.ts:440`), the
  intensity cache (`session-profile.ts:197-221`) and the per-week Suspense boundaries
  (`stream.tsx:257`) all cut work per open. The props passed to `StreamWeek` are memoised
  (`home-timeline.tsx:203`, `:261`, `:353`, `:364`), so the memo holds.
- Note, not a regression: a revalidation (live import, mark done) rebuilds `season`, which gives every week
  a new object and a new WeakMap entry. Every mounted week then rebuilds its days synchronously in one
  render, the same cost as before. If it happens before the weeks have hydrated, all of them hydrate at
  once (the trap ADR 0113 finding 6 describes). Debt: measure a revalidation during load.

## Failure: PASS
No outbound call is added. `<Suspense fallback={null}>` never suspends. A throw from `weekDays` goes up to
the route's ErrorBoundary, as a throw from the presenter's `useMemo` did before.

## Access: PASS
The markup and aria are unchanged (`aria-label` on each week's `<section>` is kept). A tap on a week that
has not hydrated yet is replayed by React. Hover and focus come from CSS. axe was not run here; that is
QA's budget.

## Security: PASS
- Two caches are module-level and shared across requests on the server: `FORMATTERS` and `intensityZones`.
  Each value is a pure function of its key (`intensityTargetToZone` and `zoneLabelToZone` read no athlete
  data), so nothing from one athlete can reach another.
- `intensityZones` is capped at 512 entries. `FORMATTERS` grows only with valid zones (an invalid zone
  throws before it is stored) and keys on the lower-cased name, so its size is bounded. No secret or log
  is added.

## Insight: PASS
The new failure mode, `weekDays` on a week no presenter built, throws with the week's key and the fix in
the message (`presenter.ts:443-446`).

## Data: PASS (N/A)
No migration and no schema change.

## Correctness under worst-case data

**C1 — medium (PLAUSIBLE, not run in a browser): with only one week ahead in the first render, the Stream can land short and then jump after the first paint, on a weekend or on a tall screen.**
`anchoring.ts:83` (`AHEAD_LANDING = 1`), `use-timeline-scroll.ts:119`, `:145-152`, `:231`.
- The landing script (`anchoring.ts:387-411`) sets `scrollTop` to either the week's top or
  `today - (header + 12)`. The browser clamps that to `scrollHeight - clientHeight`. Below today there is
  now only the rest of this week and one more week. That is about 378px for an empty week (header 36, plus
  7 days at 46). Nothing pads the end: the sentinel is a 0px div and `EndCap` only appears at the season's
  end.
- Two cases run out of room:
  - **Landing late in the week.** On a Saturday or Sunday with a dense week that does not fit, so the
    target is `today - off`, the room left is about today's row plus about 378px. On a 390×844 phone that
    is below the Stream's ~550px.
  - **Tall screens.** On a desktop with a stream height of about 1000px, two sparse weeks (about 760px)
    are too short even when the target is the week's top.
- In both cases the first paint shows today lower than the Landing Position. Then the effect at `:145`
  appends the rest of the first chunk. That grows the content box, so the `ResizeObserver` at `:231`
  calls `land()`, and `jumpTo` writes `scrollTop` after the paint. That breaks #503 criterion 5 ("does not
  move after the first paint"). The same path runs on in-app navigation.
- Before this PR, `AHEAD_INITIAL = 6` weeks were below today, so this only happened at the end of a
  season. The issue's decision "Server-render one week ahead" names a Sunday landing as the risk and
  accepts it. No test or measurement covers it.
- To show it: a Playwright test at a 1920×1300 viewport (or 390×844 with `middayTimezone` chosen so that
  today is a Sunday), seeded with a dense current week and an empty next week. Read the top of
  `[data-timeline-today]` inside the stream from a `DOMContentLoaded` handler, then again after 2s. They
  differ by the clamped amount. A fix that keeps the budget: reserve the rest of the chunk's estimated
  height (`weekHeightEstimate`) as bottom padding until the append lands. Or make `AHEAD_LANDING` large
  enough that the room below today is always at least `clientHeight`.

**C2 — low: the sentinel's `setAfter` now takes a value instead of an updater, so it can lower `after`.**
`use-timeline-scroll.ts:349-353`.
- `setAfter(nextAhead(afterRef.current, …))` reads the last rendered value. Suppose a `goToWeek`
  (`:444`, `setAfter(index - todayIndex)`) is still waiting to render when the sentinel callback runs.
  The sentinel then overwrites it with `afterRef.current + 6`. If that is smaller, the target week is not
  mounted.
- React flushes discrete events synchronously, so the window is small. Still, an updater
  `setAfter(n => Math.max(n, nextAhead(afterRef.current, max)))` keeps the fix (no two chunks at once)
  and keeps `after` from going down.
- To show it: a unit test in `use-timeline-scroll.test.tsx` that calls `goToWeek` to a far week and
  fires the sentinel's IntersectionObserver callback in the same `act`. Then check that `after` stays at
  least the jump's index.

Also checked and correct:
- `findDay` returning null early (`day-lookup.ts:21-27`).
- The calm view's `nextAfter` walk (`__calm-today.ts:211-229`). Skipping weeks whose Sunday is at or
  before `after` is the same as the old flatten-and-filter.
- `readIntensityZone` reading only text that starts with `{` (same zone as before for every input).
- Lower-cased formatter keys (the output does not include the zone's name).

## Tests

**T1 — high (CONFIRMED, merge-ordering): the new `webkit` Playwright project makes CI's Playwright job fail, and that job gates deploy.**
`playwright.config.ts:31-41`, with `.github/workflows/deploy.yml:110-111` (installs `chromium` only) and
`:186` (`deploy` needs `playwright`).
- To show it: the Playwright check run for 0d04dd9 (job 128489927470) fails with
  `[webkit] … browserType.launch: Executable doesn't exist at …/webkit-2215/pw_run.sh` (2 failed,
  137 passed).
- The install line is in a guard file, so the fix is a human step. Merged as it is, every push to main
  fails Playwright and deploy never runs.
- Before merging, a human must either add webkit to the workflow's install step, or the PR must gate the
  `webkit` project behind an env flag until that step has landed.

**T2 — low: no CI run on the last four commits.** d6c9456, 87ebed6, 33798f2 and c3c1b09 have no check runs,
so the head's e2e suite has never run. That includes the `home-timeline` tests, which now meet weeks
hydrating one by one. To show it: `gh api repos/leskraas/trainm8/commits/c3c1b09/check-runs` returns
nothing.

**T3 — low: the e2e "weeks that mount after the first paint" test does not exercise the new post-hydration append.**
`tests/e2e/home-reading-position.test.ts:167` waits 1500ms before it counts the weeks, so the append from
`AHEAD_LANDING` to `AHEAD_INITIAL` has already happened. The test then checks an append made by the
sentinel, which is below the reader in any case. Neither test covers C1. Both tests also wait on fixed
`waitForTimeout` calls (`:109`, `:114`, `:149`, `:167`, `:179`), which is a flake risk on a slow WebKit
runner.

**T4 — low: two of the load fixes have nothing to catch them being undone.**
- `progressiveChunkSize: Infinity` (`entry.server.tsx:116`). Dropping it brings back the jump from the
  top of the season to today, and no test fails. ADR 0113 says as much.
- The load-bearing `memo` on `StreamWeek` (`stream.tsx:257`).
- A cheap pin: render the full view through `entry.server` and assert that no `<div hidden id="S:`
  segment appears before the landing script.

## Maintainability

**M1 — low: ADR 0113 §3 still describes the rejected mechanism.** `docs/adr/0113-…md:91-94` says the week
elements are "built in a `useMemo` over the visible weeks". The code uses `memo(StreamWeek)` outside each
boundary (`stream.tsx:257`), and the implement decision explicitly rejected the `useMemo` list. Someone
following the ADR would rebuild what was rejected. Line to fix: ADR 0113:92.

**M2 — low: `SessionEntryRow` is imported under the name of a different type.** `presenter.ts:111`,
`row-content.ts:80`, `import-link.ts:39` and `strength-log.ts:12` all import
`type SessionEntryRow as SessionRow`, while `session-ledger-rows.ts` still exports a different
`SessionRow` (the one with bars). Reading `SessionRow` in those files misleads. Use `SessionEntryRow`
directly.

**M3 — low: the week's days depend on object identity that the type cannot express.** `presenter.ts:440-463`.
Any `{...week}` copy of a `TimelineWeek` compiles and then throws at runtime in `weekDays`. That is pinned
by `presenter.week-days.test.ts` ("a week built outside the presenter"), but nothing at a call site
warns about it. Today the only spread (`stream.tsx:197`) passes the copy to `weekHeightEstimate`, which
is safe. Debt: a branded type, or a note on `TimelineWeek`'s doc, so the next spread is caught in review.

**M4 — low:** the module doc in `presenter.ts:25-27` still says the shape bars come from "`buildLedgerRows`'
own profile rule". They now come from `sessionProfile` in `buildSession` (`presenter.ts:1238`).

## Bar (poc)
- **T1** is the only finding that blocks merge. Its fix belongs to a human (guard file), or to a one-line
  env gate in `playwright.config.ts`. It is merge-ordering, not a defect on the happy path.
- **C1** affects the happy path only on weekends and on tall screens, and the decision log accepts it
  knowingly. Under `poc` record it as **Debt:** with the repro above, unless the people judging the demo
  open on a weekend or a desktop.
- C2, T2-T4 and M1-M4 are debts.
- No secret, no one-way door (ADR changes are two-way under `poc`), no new dependency (the `webkit`
  browser binary is not a package).
