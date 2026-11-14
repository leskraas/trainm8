# Spec review: PR #692 (closes #503), head c3c1b09

Diff `4c0bc03f...HEAD`, 16 commits, 32 files. The spec is issue #503: its acceptance criteria (criterion 1 as changed by spec run 2: 25%, over at least 20 runs), its Architecture section and its Decisions. Phase `poc`. Under the `poc` bar, only a high or critical finding on the happy path, a secret or a one-way door sends the PR back to implement. Every other finding is a debt.

**Verdict: no high or critical finding.** Every criterion an agent can build is built, and the build follows ADR 0113 and the Decisions. One medium risk on criterion 5 has no test. The rest are low or need a human. Nothing in the diff is scope creep.

**Not run here:** the worktree has no `node_modules`, so no vitest, Playwright or measurement run happened and nothing was installed. Every number below for criteria 1–4 is the build's own claim, as recorded in ADR 0113 and the Decisions. This review did not reproduce any of it.

## Criteria, one by one

| # | Status | Where |
|---|---|---|
| 1 hydrated by URL ≤ +25% over ≥20 runs | Claimed met (+20.7% over 24 runs in Decisions; ADR says 17–23% over 19 runs). The script supports `--runs 20`. Not reproduced. | `scripts/measure-home-stream.ts:51-54` |
| 2 longest task by URL ≤ +15% | Claimed met (+1.6%). Not reproduced. | ADR 0113 Consequences |
| 3 longest task by navigation ≤ +15% | Claimed met (+2.6%). `--nav` was added. See finding L2 on how it is measured. | `scripts/measure-home-stream.ts:246-286` |
| 4 scroll median ≤ 17ms, p90 < 32ms | Implemented in the script, but no figure from after the build is recorded in ADR 0113 or the Decisions. Not reproduced. | `scripts/measure-home-stream.ts` (scroll pass) |
| 5 parked before first paint, same offset, no move after | Built (`progressiveChunkSize: Infinity`, landing script, `todayTop`/`todayDrift` in the script). **Partial:** see M1 (fewer weeks ahead in the server render). | `app/entry.server.tsx:116`, `use-timeline-scroll.ts:119` |
| 6 strip jump at once lands, tap never dropped | Built: the strip hydrates outside the week boundaries, `goToWeek` mounts ahead and queues the jump, past weeks are server-rendered. No new test, and none needed by the diff. | `use-timeline-scroll.ts:437-447` |
| 7 content above never moves the reader, Chromium + WebKit, e2e pins both | Built: new e2e file plus a `webkit` project limited to it. See L3 (CI) and L4 (WebKit path not asserted). | `tests/e2e/home-reading-position.test.ts`, `playwright.config.ts:31-41` |
| 8 no `scrollTop` under a scrolling reader | Held: the append after hydration writes nothing (unit test `writes` equals `[landing()]`), and `land()` stops at the reader's first input. | `use-timeline-scroll.test.tsx` ("the server renders this week and the next…") |
| 9 Back-to-Today Pill | Not touched by the diff; `backToToday` still uses `landingTarget`. | — |
| 10 strip draws every week at 390px | Not touched by the diff; `MIN_BAR_PX = 6` and 358/6 = 59 ≥ 52 (`strip.test.ts` "a season that fits is shown whole"). | `app/routes/_home/timeline/strip.ts:210` |
| 11 real mid-range Android and iPhone | **Open, human step.** Nothing an agent can do; it must be named for the owner. | — |

Architecture steps 1–6 are each present: formatter cache (`athlete-calendar.ts:29-46`), `weekDays` accessor and the skeleton/days split (`presenter.ts:422-463`) with every reader moved to it (`anchoring.ts`, `day-lookup.ts`, `week-change.ts`, `__calm-today.ts`), a unit test that an unread week builds no days (`presenter.week-days.test.ts:79-126`), a Suspense boundary per week with a memo outside it (`stream.tsx:238-265`, as the "Memoise each week outside its Suspense boundary" decision replaced the useMemo wording), the measurement by navigation, the fallback (`AHEAD_LANDING = 1`), and a WebKit project for the one file.

## (a) Missing or partial

**M1. Medium: criterion 5 is at risk on a Sunday, because the server renders only one week ahead.**
Spec: "The full view is parked on the **Landing Position** before the first paint … It does not move after the first paint."
`app/routes/_home/timeline/anchoring.ts:83` (`AHEAD_LANDING = 1`), `use-timeline-scroll.ts:119` and `:146-152`, and `ResizeObserver(() => land())` at `use-timeline-scroll.ts:231`.

The server now renders today's week and the next, nothing more. The landing parks today's row under its week header when the week does not fit on screen (`landingTop`, `anchoring.ts:128-148`). The browser clamps `scrollTop` to `scrollHeight - clientHeight`, which can stop the landing short of where it aims. That happens when everything below today's row (the rest of today's week plus one week ahead) is shorter than the stream's height less the landing offset.

The worst case is a Sunday whose week is taller than the screen: below today's row there is only next week, at least 36 + 20 + 7×46 ≈ 380px by `WEEK_HEIGHTS`, against roughly 550–600px needed at 390×844. When that happens the landing script stops early. The effect that runs after hydration then appends the rest of `AHEAD_INITIAL`, the content box grows, and the landing `ResizeObserver` calls `land()`, which writes `scrollTop` after the first paint. Today's row moves.

Before this PR, six weeks ahead were always in the first HTML, so this could not happen. The implement decision "Server-render one week ahead of today" names this risk ("Two weeks ahead, which is safer for a Sunday landing") and accepts it. No test pins the Sunday case: the new unit test uses the harness's middle-of-week layout, and the e2e tests do not set a weekday.

How to show it: in `use-timeline-scroll.test.tsx`, put today on the last day of a week that does not fit, make the next week short in the fake layout, and assert `writes` stays `[landing()]` after the append. Or, in Playwright, set the clock to a Sunday on a dense week (fixture season) and read `todayDrift` from `scripts/measure-home-stream.ts` (expect 0).

Possible fixes: keep `AHEAD_LANDING` at 2 (the rejected option), or let the landing script skip a target it cannot reach and leave the append to settle it. Under `poc` this is a **Debt:** line, not a return, unless the owner's demo lands on a Sunday.

**L1. Low: criterion 4 has no figure from after the build.**
Spec: "Scrolling the whole 52-week Stream from top to end, appended weeks included, keeps a median frame at or under 17ms and a p90 under 32ms."
ADR 0113 and the Decisions record figures after the build for criteria 1–3, but none for scrolling. Scrolling is unlikely to have got worse: the rows did not change, only how they are built and hydrated. Still, the criterion is unmeasured in anything this review read.
How to show it: `npx tsx scripts/measure-home-stream.ts --runs 5 seed=… long=…`, then read `median` and `p90`.

**Criterion 11 (real phone)** is not done, and an agent cannot do it. It must reach the owner as a human step.

## (b) Scope creep

None. Everything in the diff that goes past the Architecture section is covered by a recorded decision:
- `progressiveChunkSize: Infinity` for every route (`app/entry.server.tsx:108-116`): decisions "Render finished Suspense boundaries in place" and "Keep progressiveChunkSize: Infinity document-wide".
- The bounded intensity→zone map (`app/utils/session-profile.ts:186-221`): decision "Read each intensity's zone once".
- `buildSessionEntryRows` / `sessionProfile` export (`app/utils/session-ledger-rows.ts`): decision "A row's profile bars are built with its day".
- Adding `webkit` to `test:e2e:install` (`package.json:26`): local install for the webkit project, which is in scope.

## (c) Built, but the build looks wrong

**L2. Low: the measurement by navigation can stop waiting before the navigation's long task is recorded.**
Spec, criterion 3: "the longest task on the 52-week season is no more than 15% longer than on the seed season."
`scripts/measure-home-stream.ts:257` resets `__longTasks = []`, and `quiet()` (`:127-138`) then reads an empty list as quiet (`performance.now() - 0 > 2000` holds at once). `longtask` entries reach the `PerformanceObserver` asynchronously, after the task ends. After the `__hydrated` wait, the first check of `quiet()` can therefore pass before the render's entry lands, and `longestTask` then misses it or under-reports it. The later `page.evaluate` usually catches it, but nothing guarantees that.
How to show it: log `tasks.length` in the `--nav` run. A run reporting `longestTask: 0` or `longTasks: 0` is this case. Fix: wait for the click's long task to arrive, or time quiet from `__clickAt` (`now - max(lastEnd, clickAt) > 2000`).

**L3. Low: the "hydrated" proxy now measures less than it did at baseline.**
Spec, criterion 1: "the Stream answers a tap (the script's "hydrated" proxy)".
With a Suspense boundary per week, the Stream element (`[data-timeline-stream]`) hydrates before any week does. So "hydrated" (`scripts/measure-home-stream.ts:104`) now marks the frame, not the rows. A tap on a week that has not hydrated yet waits for that week to hydrate and is then replayed. The script says so (`:11-14`) and adds `weeksHydrated`. The criterion names this proxy, so it is met as written. The point is that the +20.7% is not measured the same way as main's baseline (3,732 against 2,336ms), so the two should not be compared directly.
How to show it: compare `hydrated` with `weeksHydrated` in one run's JSON.

## (d) Contradictions with decisions made elsewhere

**L4. Low: criterion 7's WebKit half depends on a CI change in a guard file that is not in this PR.**
Spec: "It holds in Chromium and in WebKit … and an e2e test pins both". Architecture 6: "CI's browser install line is a guard file and is a human step."
`playwright.config.ts:31-41` adds the `webkit` project, but `.github/workflows/deploy.yml:111` still runs `npx playwright install chromium`, and CI runs `npx playwright test` with every project. Until a human changes that line, the 🎭 Playwright job fails on the webkit project. The spec expects this human step. It is listed here so the merge waits for it.
Related: the e2e never asserts that WebKit actually takes the `ReadingHold` path. If the Playwright WebKit build reports `CSS.supports('overflow-anchor','auto')` (`use-timeline-scroll.ts:541-547`), the test passes without exercising the Safari correction. A one-line `expect(CSS.supports('overflow-anchor','auto')).toBe(false)` under `testInfo.project.name === 'webkit'` would pin it.

**L5. Low: ADR 0113's text has drifted from the build and from the changed criterion 1.**
- `docs/adr/0113-…md:92` still says the boundaries' elements are "built in a `useMemo` over the visible weeks". The implement decision "Memoise each week outside its Suspense boundary" rejected that wording, and the code is `memo(Suspense(WeekBlock))` (`stream.tsx:258-265`).
- `:98` still says "#503 sets the budget: … within 15% … by URL and by navigation". Criterion 1 is now 25% over at least 20 runs.
- `:182` says "pooled over 19 interleaved runs". The Decisions say 24.
How to show it: read those lines. The ADR is the record of a one-way door, so it should match the build.

**L6. Low (expected): the ADR number collides with main.**
Main now has `docs/adr/0113-a-plan-holds-its-own-copy-of-every-workout-its-week-pattern-days-use.md`, and ADRs up to 0118. The Architecture section expects the renumber ("its number moves again when the branch next takes main"). 20 files on the branch say "ADR 0113" and will need it (`git grep -l "ADR 0113" HEAD -- app tests scripts docs playwright.config.ts`).

Checked, and nothing contradicts them: ADR 0078 §1 (no virtualiser, no new dependency), ADR 0086 §4 (the past is still server-rendered and mounted up front, the append goes below the reader, and no write happens under a reader), ADR 0082 §5 / 0086 §5 (strip untouched), and ADR 0113's "do not change what the loader ships" (the loader is untouched).

## Debts under `poc`
- Debt: Sunday landing with `AHEAD_LANDING = 1` untested and possibly moves after first paint (M1).
- Debt: no post-build scroll figures recorded for criterion 4 (L1).
- Debt: `--nav` quiet-wait race in the measurement script (L2).
- Debt: ADR 0113 text drift (L5) and renumber on next main merge (L6).
- Human: CI WebKit install line in `.github/workflows/deploy.yml` (L4); real-phone check (criterion 11).
