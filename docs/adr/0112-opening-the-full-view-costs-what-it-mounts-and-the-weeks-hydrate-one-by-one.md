# Opening the full view costs what it mounts, and the weeks hydrate one by one

Status: Accepted · Issue #503 · **Decides the proposal in
[ADR 0078](0078-the-stream-keeps-its-own-windowing-and-the-cost-at-full-span-was-never-the-rows.md)
"Reopened"** (hydrate only the weeks near today, mount the rest of the past
after hydration): **not built**, because the profile below puts the cost
elsewhere. **Keeps** ADR 0078 §1 (no virtualiser; `use-timeline-scroll.ts`
owns scroll position) and
[ADR 0086](0086-i-dag-has-no-hero-reads-like-a-calendar-and-the-scroll-engine-never-writes-under-a-reader.md)
§4 whole: the past is mounted up front, nothing grows above the reader, and the
app writes no `scrollTop` under a scrolling reader.

Scope: `app/routes/_home/timeline/`, `app/utils/athlete-calendar.ts`, and the
calm I dag view's reading of the same season (`app/routes/_home/__calm-today.ts`).

## Context

ADR 0078 "Reopened" found the 52-week season slow to open (longest task 2.4s
against 0.96s on the seed season, at 4× CPU) and read it as "linear in the
rows". #503's spec asked for the cost to be attributed with a profile before a
mechanism was chosen.

### What the profile says (2026-11-07)

Production build, `scripts/home-stream-fixture.ts` against the plain seed,
390×844, 4× CPU, Chromium 141; CDP trace with the V8 sampling profiler, mapped
through the build's source maps. The probe scripts and their output are in the
#503 evidence.

1. **The longest task is the season presenter, not the rows.** Opening `/season`
   by URL, the longest task (1,336ms on the 52-week season, 471ms on the seed
   one) is `TimelineFrame`'s `useMemo(buildTimelineSeason)` running during
   hydration: 1,299ms of it is the presenter. React's hydration of the rows is
   time-sliced and is in no long task. Opening it from _Se hele sesongen_ is the
   same: 1,881ms of a 1,895ms task is the presenter, in the client render.
2. **Most of the presenter is building date formatters.** `localDate` and
   `tzOffsetMs` in the Athlete Calendar construct a new `Intl.DateTimeFormat`
   on every call, and the presenter calls them per day and per session: 812ms
   of the 1,336ms (61%) by URL, 1,263ms of 1,895ms (67%) by navigation. Next is
   `stepToZone` in `session-profile.ts` (143–230ms), per planned step.
3. **The presenter builds the whole season, mounted or not**: all 52 weeks and
   all 247 ledger sessions, where the Stream mounts 32 weeks on open (the past,
   this week and six ahead). The seed season mounts 28.
4. **The past is not the difference.** Both seasons mount the same **25 past
   weeks**. What the 52-week season adds on open is session density (4,180
   against 3,072 nodes in the same 25 weeks), four more weeks ahead in the first
   chunk (1,224 against 562 nodes), and the loader's ledger: 592KB of JSON
   against 95KB, 80% of it each session's whole `workout`, 111 of its 247
   sessions ahead of today.
5. **Probe: caching the two formatters per timezone** (as `format.ts`'s
   `nbParts` already does) cut the longest task by URL from 1,336ms to
   401–663ms, and the seed's from 471ms to 194–206ms. It is the biggest single
   lever and it is not enough: the presenter is still one task that grows with
   the season.
6. **Probe: each week block in its own `<Suspense>` boundary** (on top of 5)
   took "hydrated" from 3.8s to 2.8–3.4s on the 52-week season (seed 2.4–2.6s),
   because React 19 hydrates a dehydrated boundary at idle priority after its
   parent commits. It also showed the trap: a re-render of the frame that hands
   the boundaries new elements before they have hydrated makes React hydrate
   them all at once, synchronously (326–493ms tasks).

## Decision

Opening the full view does work in proportion to what it mounts and hydrates it
in pieces React can yield between.

1. **The Athlete Calendar caches its formatters.** `localDate`, `tzOffsetMs`
   and `localTimeOfDay` reuse one `Intl.DateTimeFormat` per timezone and shape
   (a module-level `Map`, as `format.ts` does). Same outputs, so server and
   client still agree; every caller of the module gains, the server render and
   the calm I dag view included.
2. **A week's days are built when the week is read, once.** The presenter
   splits along the seam the profile shows: `buildTimelineSeason` builds the
   season's **week skeleton** (shape, header, track volumes, phase, what the
   Week Strip and the headers read), and a week's **days** (`buildDay`,
   `buildSession`, and the per-session row facts) are built by one cached
   accessor per week, keyed on the week object, the first time anything reads
   them. `WeekBlock` reads them in its own render, so the work happens per week
   inside React's sliced hydration and render, and a week that never mounts
   never builds its days. Every other reader goes through the same accessor:
   `weekHeightEstimate`, `day-lookup.ts`, the Ukeskiftet card's
   `week-change.ts`, and the calm view's `__calm-today.ts`, whose search for
   the next planned session walks weeks lazily and stops at the first hit
   rather than flattening every week's days.
3. **Each week block hydrates on its own.** Every week in the Stream is its own
   `<Suspense>` boundary. The server renders every mounted week as today, so
   the Landing Position, the Week Strip's jumps, the anchoring and Safari's
   behaviour do not change; on the client the frame, the top line, the Week
   Strip and the Stream element hydrate first, and the weeks follow at idle
   priority. A tap on a week not yet hydrated hydrates that week first and
   React replays the tap, so no tap is dropped. **The week elements handed to
   the boundaries are referentially stable** (built in a `useMemo` over the
   visible weeks and their stable props), so a frame state change during load
   does not force every boundary to hydrate in one task (finding 6).

### If the budget is still missed

#503 sets the budget: the 52-week season within 15% of the seed season, by URL
and by navigation. After 1–3 the build measures with
`scripts/measure-home-stream.ts`, and only if a criterion is still over takes
these, in order, re-measuring after each:

- **Server-render fewer weeks ahead.** The first chunk ahead in the server
  render shrinks to what a landing can show (this week and the next); the rest
  of the chunk is appended after hydration, below the reader, which ADR 0086
  §4 already allows.
- **Then stop.** If a criterion is still over, the remainder is the ledger
  payload and the parse and style of the mounted markup. The build returns the
  numbers to the spec rather than changing what the loader ships: which
  sessions carry their whole `workout` to the client is a loader-shape decision
  with its own trade-offs (the composer, the popover and appended weeks read
  it) and is not taken on a guess.

## Considered options

- **ADR 0078's proposal: server-render and hydrate only the weeks near today,
  mount the rest of the past after hydration.** Rejected. Both seasons mount
  the same 25 past weeks, so it attacks a difference that is not there, while
  bringing back growth above the reader that ADR 0086 removed: a `ReadingHold`
  write on Safari during load, which #503's "no `scrollTop` while the reader is
  scrolling" forbids, and a Week Strip jump to a past week that has not mounted
  yet. Selective hydration gets the same deferral with every week's markup
  already in place.
- **Only cache the formatters.** Rejected as the whole answer: measured, the
  longest task falls by two thirds and is still one task that grows with the
  season (finding 5).
- **Ship the presenter's output from the server instead of recomputing it on the
  client.** Rejected: it adds a derived copy of the season to a payload that is
  already the biggest difference between the two seasons, it freezes the view
  model into the loader's wire shape, and it does nothing for in-app
  navigation's render.
- **Move the presenter into a Web Worker or `requestIdleCallback`.** Rejected:
  hydration needs the same tree the server rendered on its first pass, so the
  data cannot arrive late without a mismatch or a second render.
- **A virtualiser.** Rejected by ADR 0078 §1; the profile adds nothing for it:
  scrolling holds at 364 rows and the rows are not in the long task.

## Consequences

- **The week skeleton and the days are two halves of one presenter, and stay in
  `presenter.ts`.** A field a header or the strip reads belongs to the
  skeleton; a field only a row reads belongs to the days. Putting a row field on
  the skeleton quietly brings back the whole-season pass.
- **The boundaries' elements must stay stable**, beside the memoised `WeekBlock`
  and `DayRow` ADR 0078 already made load-bearing. Like those memos, nothing
  fails loudly if a later change breaks it: the load just gets slow again, in
  one task. A comment at the boundary carries the measurement.
- **A week that is not yet hydrated is not yet interactive** for anything but a
  tap or a click, which React replays. Hover and focus styles are CSS and work
  from the server's markup.
- **The formatter cache is per process and per timezone**, and never evicted.
  The set of timezones is small and bounded by IANA; that is fine on the server
  as on the client.
- **The ledger still ships every session's whole `workout`.** The 52-week
  season's payload is 6× the seed's. It is in no long task today; it is the
  named next lever if the budget is missed (above).
- **In-app navigation has no script yet.** `scripts/measure-home-stream.ts`
  measures a load by URL; #503's third criterion needs it to measure the
  navigation from _Se hele sesongen_ on I dag as well.
