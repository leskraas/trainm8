# PR #692 (#503): Standards review

Head 60784f9 against `origin/main`, 28 commits, 34 files. Sources checked: CLAUDE.md (no AGENTS.md), docs/agents/domain.md, GLOSSARY.md, ADR 0078/0086/0119, docs/guiding-principles.md, docs/testing.md, the domain-modeling ADR-FORMAT, and the mobile-native skill. The diff adds no motion, so review-animations has nothing to check.

Passes: no guard files changed (`.github/**`, `.claude/**`, CLAUDE.md, fly.toml, `other/**`). No new dependencies. ADR 0119 has the next free number and the repo's ADR shape. ADRs 0078 and 0086 link to it instead of being silently overridden. The glossary now names `sessionProfile` in place of the removed `buildLedgerRows`.

## Findings

**1. Formatting drift, Prettier not run.** Hard (docs/testing.md: "We use Prettier"; Prettier is not in lint or CI, so nothing else catches it). Severity: low.
- `app/routes/_home/timeline/home-timeline.tsx:69`: the `../presenter.ts` import is split over 4 lines. Prettier collapses it to one line.
- `docs/adr/0119-…md:91-96, 102-104, 138-142` and `docs/adr/0078-…md:339`: these lines are not reflowed to Prettier's width. On main, ADR 0078 passes `prettier --check`; at head it fails. ADR 0086 and GLOSSARY.md already failed on main.

**2. Duplicated Code: a third per-timezone formatter cache.** Judgement (guiding-principles "Only one way"). Severity: medium.
- `app/utils/athlete-calendar.ts:29` `FORMATTERS` + `cachedFormatter` duplicates `NB_PART_FORMATTERS`/`nbParts` (`format.ts:283`) and `NB_CLOCK_FORMATTERS` (`format.ts:1013`).
- `nbParts` builds the same `en-CA` year/month/day formatter as `localDate`'s `'date'` shape.
- The two caches now key differently. The new one lower-cases the zone "so it stays bounded"; `nbParts` keys on the raw zone, which leaves the unbounded growth the PR's own test describes.
- The issue named `nbParts` as the pattern to follow. A shared helper would remove the duplication.

**3. Primitive Obsession / Data Clumps in `cachedFormatter`.** Judgement. Severity: low.
- `athlete-calendar.ts:31-32`: `shape: string` together with a separate `build` closure means the cache key and the formatter's options can disagree without any error.
- A small typed table (`'date' | 'wall-clock' | 'time-of-day'` mapped to options) would keep each key and its options together.

**4. The type no longer shows that a week has days.** Judgement (hidden contract). Severity: medium.
- `presenter.ts:427-460`: a week's days now live in a module `WeakMap` keyed by object identity (`WEEK_DAYS`, `weekDays`, `withWeekDays`).
- Any value that type-checks as a `TimelineWeek` but is a copy (for example `{...week, opensHorizon}`) makes `weekDays` throw at runtime (`:444`). The new test pins the throw, so the risk is known.
- The skeleton/days split is what ADR 0119 §2 asks for. Its weak point is that the type system cannot catch a copied week. A lazy `days()` member on the type would close the gap.

**5. Speculative Generality.** Judgement. Severity: low.
- `withWeekDays<Week extends TimelineWeek>` (`presenter.ts:~458`): every caller passes `TimelineWeek`, and the test builders spell it out explicitly (`composer.test.tsx:80`, `stream.test.tsx`).

**6. Feature Envy / Shotgun Surgery: the frame recomputes the scroll engine's chunk rule.** Judgement. Severity: low.
- `home-timeline.tsx:273-275` `firstChunkPending` recomputes `min(weeks-1, todayIndex + AHEAD_INITIAL)`.
- `use-timeline-scroll.ts:148` holds the same clamp (`Math.min(maxAfter, AHEAD_INITIAL)`), and `useTimelineScroll` owns `after`.
- If one changes without the other, the spacer either stays or disappears too early. The hook should expose the flag.

**7. `h-dvh` spacer.** Judgement (mobile-native: "`dvh` resizes as the URL bar collapses… causes layout shifts mid-scroll; `svh` is stable"). Severity: low.
- `home-timeline.tsx:~547`: the spacer only has to reserve at least one screen of room, so `h-svh` fits better.
- The spacer sits below the reader, so this is about tidiness, not visible movement. A real-phone check would settle it.

**8. Lost parameter docs.** Judgement. Severity: low.
- `app/utils/session-ledger-rows.ts:46-47`: `buildSessionRows` dropped the doc comments on `timezone` ("today's sessions stay planned") and `thresholds` ("#615").
- Both parameters remain, and those comments explained why they exist.

**9. Primitive Obsession in the measurement script.** Judgement. Severity: low.
- `scripts/measure-home-stream.ts:79`: `type Run = Record<string, number>` replaces a named field type. A mistyped figure name now type-checks.

**10. Test wording and waits.** Judgement. Severity: medium for the first item, low for the rest.
- `tests/e2e/home-reading-position.test.ts:229-234`: the comment says "Until the rest of the first chunk has been appended below", but the poll checks `count > 0`. That is true at once, so the test actually relies on the fixed `waitForTimeout(1000)` that follows.
- `:155`: fixed `waitForTimeout(1500)`, although `untilHydrated` exists and is used later in the same file.
- `stream.test.tsx:492` asserts React's internal `<!--$-->` boundary markers, which can change on a React upgrade.
- `presenter.week-days.test.ts:21,34` counts calls through `vi.mock` of `format.ts`/`session-profile.ts`. That is implementation-level, but the issue asked for "an unread week builds no days" to be pinned, so it is acceptable.

**11. Glossary gap.** Judgement (domain.md "note it for /domain-modeling"). Severity: low.
- `presenter.ts:30-41` and ADR 0119 bold **week skeleton** and **days** as terms. Neither is in GLOSSARY.md.

**12. Stale reference.** Judgement. Severity: low.
- `docs/wayfinder/plan-builder-mobile-ux/dnd-kit-and-tanstack-for-the-plan-calendar.md:148` still names `buildLedgerRows`. It is a research note, so it can stay as a dated note.

## Not checkable cold

CLAUDE.md asks that UI changes run review-animations, the mobile-native checklist and break-ui, and that the PR say what still needs a real phone. Those live in the PR body or process, which this review did not read.

## Verdict

No critical or high findings. The two medium judgement findings worth acting on are #2 (formatter cache duplication) and #10 (the misleading e2e poll). #1 is a hard but trivial fix: run `npm run format` on the touched files.
