# Spec review: PR #692 (#503), head 60784f9

Spec: #503's body (Architecture and Decisions included). There are no human comments. The ADR is 0119 at head, and every reference to it agrees. No guard files are touched.

## Criteria
- **C1** "hydrated" ≤25%, ≥20 runs: ADR 0119 reports +20.7%. Met as claimed; the repo cannot reproduce it.
- **C2/C3** longest task ≤15%, by URL and by nav: ADR reports +1.6% / +2.6%, and `--nav` is added. Met as claimed.
- **C4** scroll median ≤17ms, p90 <32ms: **partial** (F5).
- **C5** parked before first paint, same offset on both seasons, no move: **partial** (F1, F2, F5).
- **C6** strip jump "the moment the full view appears… never dropped": **partial** (F4).
- **C7** content above never moves the reader, in Chromium and WebKit: implemented, but the test is weak (F2, F3).
- **C8** no `scrollTop` while scrolling: covered by a unit test (`writes == [landing()]`) and the existing e2e.
- **C9/C10** the pill, and all 52 weeks at 390px: unchanged; existing tests cover both.
- **C11** real phones: **missing**. This is the owner's step; list it as open.

Architecture steps 1–6 and the later Decisions are all built.

## Findings

**F1 — medium (plausible). C5: the `h-dvh` spacer can move today after the first paint on a short-ahead season.**
`home-timeline.tsx:273,546-547`, `use-timeline-scroll.ts:147`. The landing parks today using the spacer's room. The append then removes the spacer. If the weeks still to come plus `EndCap` are shorter than the spacer, the browser clamps `scrollTop` and today moves. On main, the landing was clamped from the first paint and never moved.
The seed season is this case: per ADR 0119 finding 3 it mounts 28 weeks = 25 past + this week + 2 ahead. The C5 e2e seeds +120 days, so it misses this.
How to show it: rerun `home-reading-position.test.ts` test 3 with the season ending 2 weeks ahead, at 1280×1400, or read the seed server's `todayDrift` from the measure script.

**F2 — medium. The C5/C7 append test never waits for the append.**
`tests/e2e/home-reading-position.test.ts:229-234`. The comment says "Until the rest of the first chunk has been appended", but the poll checks `count() > 0`, which is true at the first paint. A late transition still passes.
Fix: poll until the week count reaches today + 1 + `AHEAD_INITIAL`, or until the spacer is gone.

**F3 — medium. The WebKit half of C7 can be skipped silently.**
`playwright.config.ts:38`. The project exists only if `existsSync(webkit.executablePath())`. With WebKit missing, the run is green and contains no WebKit test, while C7 requires "an e2e test pins both". Show it with `npx playwright test --list` without WebKit installed.
Also low: the comment at `:36` ("CI installs only Chromium") is out of date, because main's `deploy.yml:113` already installs WebKit.

**F4 — medium. C6 is not pinned at load time.**
The strip-jump e2e (`tests/e2e/home-timeline.test.ts:683`) taps the oldest week only after `readToTheEnd`. The unit test covers only a jump racing the sentinel. Nothing taps right after `toBeVisible()`, either to the oldest week or to a week +4 that is not yet mounted (likely now, with `AHEAD_LANDING = 1`). The ADR's "the tap is replayed" claim is untested.
Fix: an e2e doing both taps right after `toBeVisible()`, asserting the week top is within 4px.

**F5 — low. No post-build evidence for C4 or for C5's same offset.**
ADR 0119:192 records only the C1–C3 deltas. The script records `median`, `p90` and `todayTop` per season, but none of those figures are recorded.

**F6 — low. "hydrated" now means less.**
`scripts/measure-home-stream.ts:107`. With a boundary per week, the stream element gets React's props when the frame commits, before the weeks hydrate. C1 names this proxy, so it is met as written, but the budget summary (`:338`) should print `weeksHydrated` too.

## Scope creep
Nothing material.
- `buildLedgerRows`, `NowRow` and `LedgerRow` were removed (no callers left), which follows the "bars built with the day" Decision.
- `progressiveChunkSize` applies document-wide, which a Decision covers.
- `findDay`'s lookup by Monday and the verify-doc note are in scope.
