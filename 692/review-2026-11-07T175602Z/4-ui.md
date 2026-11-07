# PR #692 — UI (emil-design-eng, break-ui report-only, mobile-native; animation-performance)

The .tsx changes are structural: `StreamWeek` = `memo(Suspense(WeekBlock))` (`stream.tsx:258`), `WeekBlock` reads `weekDays(week)`, `home-timeline.tsx:519` renders `StreamWeek`, `entry.server.tsx:116` streams finished boundaries in place. No markup, class, token or copy changes; `fallback={null}` is never shown on the server path (nothing suspends) and a client render renders at once.

## emil-design-eng (perceived performance, Review Format)
| Before | After | Why |
| --- | --- | --- |
| One hydration task of 1–2.4s on opening the full view; taps dead meanwhile | Weeks hydrate one by one; a tap on a dehydrated week hydrates it first and React replays it | Perceived performance: the page answers sooner. No change needed. |
Verdict: no Block. Press feedback on rows is CSS `:active` and works on server markup before hydration.

## break-ui (report only, worst case)
- 52-week season, 4 sessions/week past (the `home-stream-fixture.ts` case): cost now per week; fine.
- One very dense week (7 days × many sessions): its own boundary is one task proportional to that week, not the season. Not a break.
- Zero visible weeks / empty season: `visibleWeeks.map` renders nothing; unchanged.
- Long titles, non-Latin text, emoji: rendering paths unchanged by the diff.
- Timezone in odd casing (`europe/oslo`): renders the same; see Security X1 (cache key), not a visual break.
Nothing visual breaks.

## mobile-native
No new hover, input, viewport, overscroll or touch-action surface. Taps before hydration: React replays `click` on a dehydrated boundary; `pointerdown`-only handlers would not be replayed, and none were added. Needs a real phone: AC 11 (open and scroll the 52-week season on a mid-range Android and an iPhone) and the WebKit reading position on real Safari.

## animation-performance
Diff adds no motion (no transition/animation/keyframes/spring lines in .tsx/.css). Skipped as not applicable; scroll frame budget (AC 4) is QA's measurement.

No UI finding needs a change.
