# Qualities review: PR #692 (head 60784f9), issue #503

Read cold: diff, issue, repo at head. Lines are at head.

**Verdict:** No critical or high findings; 2 medium, 5 low. The formatter cache, lazy `weekDays` (WeakMap), bounded intensity cache, per-week `Suspense` with the memo outside it, and `progressiveChunkSize` all hold up.

## Findings

**1. Data (criterion 5), medium**: `home-timeline.tsx:547`, `use-timeline-scroll.ts:147`.
The `h-dvh` spacer and the appended weeks swap in one commit. If the season ends at `todayWeekIndex + 2`, the append adds only one week and the EndCap. That is real with no plan: the season ends at the last session's week. On a tall screen that can be shorter than the 100dvh it replaces. `scrollHeight` shrinks, the browser clamps `scrollTop`, and today moves after the first paint.
*Show:* e2e test 3 with sessions only on days 0–14, a 1280×1400 viewport and a Sunday `now`: `__todayTops` holds more than one value.
*Fix:* drop the spacer only when the appended content is at least as tall, or use `min-height` on the content box.

**2. Test (criterion 5), medium**: `tests/e2e/home-reading-position.test.ts:234`.
The comment says it waits until the first chunk is appended. The assertion is `count > 0`, which is already true at first paint, and then only hydration plus 1000ms. On a slow CI box the test samples before the append and passes without seeing the move it exists to catch.
*Show:* CPU 6×, log the week count at sampling: it equals today + 2.
*Fix:* poll until the count is at least `todayIndex + 1 + AHEAD_INITIAL`, then sample.

**3. Speed, low**: `stream.tsx:257`.
The memo only holds while the `week` objects stay the same. A revalidation while the weeks still hydrate rebuilds `season` and hands every pending boundary a new `week`. React then hydrates them all at once, the 326–493ms task the comment documents. Triggers: a live import event (`imports-events.ts:39`) or a colour-scheme change (`client-hints.tsx:44`). Any later fetcher revalidation still rebuilds every mounted week's days in one render. That predates this PR and is not measured. No test pins that a frame re-render skips unchanged weeks.
*Show:* profile a load, revalidate before `weeksHydrated`, look for one long task.

**4. Insight/Test (criterion 7), low**: `playwright.config.ts:38`.
The `webkit` project is dropped silently when WebKit is missing, and CI installs only Chromium. Nothing automated runs criterion 7's WebKit half, and no run reports the skip.
*Fix:* warn when `CI` is set and WebKit is absent.

**5. Insight, low**: `docs/adr/0119-opening-the-full-view-…`.
Main already has `0119-every-page-is-on-the-luma-steps…` and the merge is clean, so two ADRs share 0119. 14 comments cite "ADR 0119", including the warning at `entry.server.tsx:112` not to drop `progressiveChunkSize`. A reader can land on the luma ADR.
*Fix:* renumber before merge.

**6. Speed/memory, low**: `app/utils/athlete-calendar.ts:27`.
The comment says the cache is "bounded by IANA". Node 22 Intl also accepts offset zones (`+01:00`, `+0130`, `-23:59`), and the timezone is free text (`athlete-schema.ts:116`). That allows thousands of keys per shape for the life of the process: still bounded and harmless, but the comment is wrong.
*Fix:* correct it, or validate the zone on write with `Intl.supportedValuesOf`.

**7. Failure, low**: `anchoring.ts:83` with the spacer.
If JS fails or the root hydration throws, the view shows today's week, one week ahead, then a blank screen-height spacer. Before this PR: six weeks ahead.

## Checked, no finding

- **Security:** no loader or authorization change. The module caches hold pure functions of their key and no per-user data.
- **Data/timezone:**
  - Calendar helpers give the same outputs; DST is tested; an unknown zone throws and is never cached.
  - `findDay` matches on `mondayOfDay`, and week keys are always Mondays.
  - The calm view's `nextAfter` is equivalent to before.
  - Import facts are lazy but built once from the same input.
  - The `'{'` prefix check gives the same zone as before.
- **Access:** the spacer is `aria-hidden`. A tap on a week still hydrating is replayed.
- **Tests:** these pin that an unread week builds no days, one boundary per week, the server's week count, that the append writes no `scrollTop`, and that a jump keeps its week.
