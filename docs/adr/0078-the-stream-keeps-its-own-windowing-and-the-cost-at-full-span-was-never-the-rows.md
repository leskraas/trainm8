# The stream keeps its own windowing, and the cost at full span was never the rows

**§2–§3 are superseded by
[ADR 0086](0086-i-dag-has-no-hero-reads-like-a-calendar-and-the-scroll-engine-never-writes-under-a-reader.md)**:
the past is mounted up front and nothing grows above the reader; height that
changes there is the browser's scroll anchoring's to absorb.

Status: Accepted. **§4 is superseded by
[ADR 0082](0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)**
(#505 S9): the strip is fixed and draws every week at once, so its cells no
longer carry `content-visibility`. §1–§3 and §5 stand.

**Settles the open question in
[ADR 0065](./0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md)**
— _"Virtualisation, and who owns scroll position (#503 — a human call)"_. That
ADR deferred the fork unmeasured and said so; this one measures it and takes it.
**Confirms [ADR 0028](./0028-mobile-first-ui-standard.md)** — every number below
is taken at 390×844. **Depends on
[ADR 0075](./0075-the-past-band-stops-at-the-week-boundary-and-never-speaks-for-a-day-the-query-did-not-fetch.md)**
(#500), whose bands are the reason the row count never reaches what #503 was
written about.

Scope: `app/routes/_home/timeline/`. Issue #503.

## Context

ADR 0065 §1 made every day forward a row and stated the consequence: the stream
grows from 40–120 rows to as many as 364, about 8,000px of empty days ahead of
the reader. It named the standard answer (a virtualiser, and Virtuoso as the
repo's stated pick), named the reason it could not simply be adopted — **a
virtualiser owns scroll position, and so does `use-timeline-scroll.ts`** — and
refused to guess: _"Measure on a realistic account first; this ADR does not
settle it."_

### What was measured

kody's seeded account — real Strava history behind today — extended forward with
a four-a-week build to a race day 182 days out, so the season is the span the
question is about: **182 days behind today plus 182 ahead, 52 weeks**.
Production build, Chromium at 390×844, CPU throttled with the DevTools protocol.
A "fling" is 60 wheel ticks of 120px through the middle of the stream. Mid-range
phone is taken as 4×, low-end as 6×.

Three findings, and the second is the one that decides this.

**1. The 364-row worst case does not exist.** At full span the stream mounts
**52 weeks, 243 day rows, 4,578 nodes, 24,473px** — not 364 rows. #500's bands
are why: behind today a run of empty days is one band, so the half of the season
that would have been almost entirely blank rows is roughly one row per week plus
the days that actually hold something. The number the fork was framed around was
never reached.

**2. The cost was re-render fan-out, not row count.** One fling cost **1,470
`WeekBlock` renders and 1,560 `WeekCell` renders** — thirty full passes over the
whole season, and over the whole strip, per fling. `resync()` sets the active
week on every scroll frame that crosses a week header; nothing below that state
was memoised, and `visibleWeeks` was re-sliced on every render, so `loadedKeys`
was a new `Set` each time and every strip cell re-rendered with it. Script time
across one fling at 6× CPU was **3,061ms** — more than half the wall clock —
against 132ms of style and **0ms of layout**. A stream that was too long to
render would have shown up as layout and style. This showed up as script, which
is a different bug wearing the same symptom.

**3. Two `memo` calls and one `useMemo` fixed it.** Script across the same fling
at 6× fell to **561ms**, and the median frame at full span went from 33.3ms back
to **16.7ms — 60fps, on a 6×-throttled CPU, with the whole season mounted**. No
dependency, and `use-timeline-scroll.ts` was not touched to get it.

| Fling, full span     | before  | after  |
| -------------------- | ------- | ------ |
| script, 6× CPU       | 3,061ms | 561ms  |
| median frame, 6× CPU | 33.3ms  | 16.7ms |
| script, 4× CPU       | 1,939ms | 491ms  |
| frames >32ms, 4× CPU | 29.9%   | 19.8%  |
| script, 1× CPU       | 499ms   | 149ms  |

## Decision

### 1. The stream keeps its own windowing, and no virtualiser is adopted

`use-timeline-scroll.ts` goes on owning scroll position. The landing, the
`LANDING_OFFSET`-relative collapse threshold, the settle ladder and the
compensation stay exactly where they are, because the rewrite ADR 0065 warned
about would have bought nothing the measurement asked for: **the measured
problem was script, and the script is already gone.**

Stated as the dependency justification #503 asks for, in the negative: adopting
Virtuoso here would add a dependency, rewrite the four behaviours the module
holds, and hand the fixed problem to a library that does not fix it — a
virtualiser reduces how many nodes a re-render touches, but thirty full
re-renders per fling is a defect at any node count. It would have masked the bug
and charged the scroll module for it.

**This is not a claim that windowing beats virtualisation in general.** It is a
claim about this surface at this size, and §4 records the number that would
reopen it.

### 2. The window stays append-only, and that is a stated cost rather than an oversight

`before` and `after` only ever grow. An athlete who has crossed the whole season
keeps all 52 weeks mounted for the rest of the session, and the stream never
gives that memory back.

Evicting far weeks would make this the virtualiser-in-all-but-name ADR 0065
suspected it already was, and it is the obvious next move — but eviction needs
its own height compensation, the mirror of §3's, and §4's numbers do not yet ask
for it. It is written down here so the next person finds a decision rather than
an absence.

### 3. Height inserted above the reader is compensated generally, not only when a week loads

The compensation used to mark **the first mounted week** and credit its offset
delta, because the only thing that inserted height above the reader was a week
loading in at the top. That mark answers the wrong question. A revalidated
loader can put a session on a day the reader has already scrolled past, five
weeks below the top of the stream, and the first week does not move for it.

> **The mark is the week the reader is parked in, re-measured after every
> render.**

Everything inserted above that week moves it; nothing inserted below it does.
Growth at the top and a session arriving from a revalidation become the same
event, and growth **below** stays a non-event, which is the property the old
mark had and this one keeps.

This **dissolves a special case rather than adding one**: `grow()` no longer
records anything, and `pendingGrowthRef` is gone. The bug it fixes was real and
is now pinned by a test — before this change, a revalidation that inserted a
week's height above the reader walked them a full week down the stream.

### 4. The week strip keeps every cell and renders almost none of them

The strip stays the whole season — ADR 0065 §8's overview, and _an overview with
holes in it is not an overview_. What changes is that **being in the DOM and
being rendered stop being the same thing**: a cell carries
`content-visibility: auto`, so the browser skips its style, layout and paint
until it scrolls near. Measured at 390px on landing, **13 of 52 cells render**;
the other 39 are boxes.

`contain-intrinsic-size` states the cell's box so the strip's scroll width —
which `centreStrip` measures against — is the real one. It sizes the **content
box, not the border box**, and getting that wrong makes every skipped cell claim
a taller box than a drawn one, which is a strip that changes height as it is
scrolled. That is why the height is stated once, as a custom property on the
scroller, next to the cells that read it.

The same treatment was tried on the stream's week blocks and **rejected**: it
halved the worst frame without moving the long-frame share, and a week mounted
far from the viewport by a strip jump would be measured at its guessed height —
paying the anchoring arithmetic for a tail it did not close.

### 5. The remaining tail is recorded, not chased

At full span, **~20% of frames still exceed 32ms at 4× and 6× CPU**, with a p95
of 83ms and 117ms. The median is 16.7ms and the same fling at the landed window
is 0.8%, so this is a spiky tail over a smooth floor, not a slow surface. The
trace attributes it to the rendering pipeline over 52 mounted weeks — Paint
540ms, PrePaint 247ms, `UpdateLayoutTree` 235ms, Layerize 132ms across one 6×
fling — rather than to script.

Two things were identified and deliberately not done, so that the next person
starts from a list rather than a trace:

- **`resync()` reads a rect per mounted week on every scroll frame** —
  `querySelectorAll` plus 52 `getBoundingClientRect()` calls, measured at 2.3ms
  median and 6.4ms worst at 6× CPU. Caching the offsets means invalidating them
  on growth, on resize and on a band expanding, and stale offsets there are a
  reading position that drifts.
- **52 sticky week headers** are 52 composited layers, which is what PrePaint
  and Layerize are counting.

## Alternatives considered

- **Adopt Virtuoso.** Rejected — §1. It rewrites four working behaviours to
  address a cost the measurement says is not there.
- **Evict far weeks, keeping scroll ownership.** Not rejected — §2, deferred
  with its cost named.
- **`content-visibility: auto` on the stream's week blocks.** Rejected — §4,
  measured: it halves the worst frame, moves the long-frame share by nothing,
  and puts the landing and jump arithmetic at risk.
- **Cache `resync`'s per-frame rect reads now.** Deferred — §5. A real saving
  with three new invalidation paths, and the tail it would close is not the tail
  that hurts.
- **Keep marking the first mounted week and add a second mechanism for
  revalidation.** Rejected — §3. Two mechanisms crediting the same scroll
  position is how they end up crediting it twice.
- **Leave the strip rendering all 52 cells.** Rejected — #503 asks for it
  directly, and skipping is available without dropping a cell from the overview.

## Consequences

- **`use-timeline-scroll.ts` survives intact**, which is what makes the landing,
  the collapse threshold measured from it, and the back-to-today pill continue
  to behave — verified in Chromium at 390×844: today lands at exactly
  `LANDING_OFFSET`, the hero opens at 326px and folds to 0 on the way away, the
  pill arms at `away = -1`, and back-to-today returns to 96px.
- **`memo` on `WeekBlock` and `WeekCell` is now load-bearing, and it is quiet.**
  Nothing fails loudly if a later change gives either a prop that is rebuilt
  every render; the surface simply gets slow again at full span. Both memos
  carry the measurement in a comment for that reason, and `visibleWeeks` is
  memoised because `loadedKeys` cannot hold if it does not.
- **A week's props must stay referentially stable**, which they are because the
  season is memoised. A presenter change that rebuilds week objects per render
  would silently undo §1.
- **The account this was measured on is not in the repo.** The fixture — kody
  extended to a 182-day forward plan — was built for the measurement and thrown
  away, so re-running these numbers means rebuilding it. Nothing seeds it (see
  `docs/agents/production-seed-data.md`), and the seeded account's forward
  horizon is about two weeks, which is not this question.
- **The compensation now runs after every render rather than only after a
  growth.** It is one `querySelector` and one rect per render, not per frame,
  and it credits nothing when the offset has not moved — but it is a write to
  the scroll position on a path that used to have none, and it stays a
  `useEffect` rather than a layout effect, so a compensated frame can still
  paint once at the old position. That was already true of growth and is
  unchanged by this ADR.
- **`HELD_ATTR` is an opt-out, so a control that inserts height and holds its
  own position must remember to set it.** The past band is the only one today. A
  future control that corrects the scroll position itself and stays silent gets
  its correction applied twice; one that inserts height and holds nothing is
  covered for free.
- **A compensation cannot hold a sub-pixel position.** The credited delta is
  fractional (a measured week is 371.27px, not 371px) and Chrome snaps a written
  `scrollTop` to whole pixels, so each compensated growth leaves up to 1px of
  drift. It does **not** accumulate — the mark is re-measured after the write,
  so the next credit starts from where the scroller actually is — but a test
  that asserts the reading position is pixel-identical across a growth is
  asserting something the platform does not offer.
  `tests/e2e/home-timeline.test.ts`'s _"reading backwards loads earlier weeks
  without the reading position jumping"_ does exactly that, and fails by 1px in
  this environment **on the unmodified branch as well as with this change**. It
  is not touched here.
- **`ADR 0065`'s open question is closed**, and the two remaining items in §5
  are performance work with numbers attached rather than an architectural fork.

## Reopened (#503, 2026-10-24): the 364 rows are real again, measured 2026-10-25

ADR 0086 removed the bands this ADR's finding 1 relied on. Every past day is a
row again, so a 52-week season is **exactly 364 day rows**, the number #503 was
written about. The approach in place is ADR 0086 §4's:

- the past is mounted up front;
- weeks ahead are appended in chunks;
- `WeekBlock` and `DayRow` are memoised;
- where the browser anchors scrolling, each week is `content-visibility: auto`
  with an estimated `contain-intrinsic-size`.

No virtualiser is added, so `use-timeline-scroll.ts` keeps owning scroll
position (§1 stands).

### The fixture and the script

- **`scripts/home-stream-fixture.ts`** builds the season on a freshly seeded
  local database. The stream draws whole weeks from the first Monday inside the
  query's 182-day reach, so the fixture stretches kody's plan (34 or 35 weeks,
  by the weekday it is run) and moves his race until the stream is 52 weeks,
  with four sessions a week across the span. Run it with
  `npx tsx --env-file=.env scripts/home-stream-fixture.ts`. The consequence
  above, _"the fixture was thrown away"_, no longer holds.
- **`scripts/measure-home-stream.ts`** takes the numbers below against a local
  `npm run start:mocks`:
  `npx tsx scripts/measure-home-stream.ts http://localhost:3000 5`.
- Both are local only: each refuses `NODE_ENV=production`, and the script
  refuses a base URL that is not `localhost`. A production-mode server refuses
  the `CREDENTIALS_ENCRYPTION_KEY` published in `.env.example`, so a local
  `.env` needs its own key (`openssl rand -base64 32`), and the database paths
  in it must be absolute for the built server to find them.

### What was measured

The stream is the full view, `/season`, since ADR 0101 gave I dag a calm today
card. Production build, mocks on, Chromium at 390×844 (mobile emulation, DPR 3),
CPU throttled 4× with `Emulation.setCPUThrottlingRate`, a fresh browser context
per run. Each figure is the median of 5 runs, the fixture and the plain seed
season interleaved on an otherwise idle 4-core container.

- **First contentful paint**: the `first-contentful-paint` entry.
- **Hydrated**: the first animation frame at which the stream element carries
  React's props (`__reactProps$…`). React has no hydration-complete event; this
  is a proxy for "the stream's handlers are attached".
- **Long tasks on load**: `longtask` entries from navigation until 2s pass
  without one. Blocking time is the sum of each task over 50ms.
- **Scroll**: one key press first, as a reader's first touch would be, because
  the landing re-lands on late layout until the first input (ADR 0086 §4). Then
  the stream is scrolled from its top to its end, 40px a frame with instant
  writes, appended weeks included, recording every frame's duration.

| 390×844, 4× CPU, median of 5      | seed season      | 364-row season   |
| --------------------------------- | ---------------- | ---------------- |
| weeks / day rows / DOM nodes      | 28 / 196 / 3,982 | 52 / 364 / 8,843 |
| first contentful paint            | 968ms            | 1,380ms          |
| hydrated (proxy above)            | 3,560ms          | 6,228ms          |
| long tasks on load                | 12               | 14               |
| long-task time / blocking time    | 1,957 / 1,418ms  | 4,101 / 3,386ms  |
| longest task (median of 3)        | 963ms            | 2,423ms          |
| scroll frames                     | 313              | 659              |
| scroll median / p90               | 16.7 / 22.4ms    | 16.9 / 28.1ms    |
| scroll frames over 32ms           | 19 (6.1%)        | 55 (8.3%)        |
| scroll position moved backwards   | 0                | 0                |
| today's row from the stream's top | 122px            | 122px            |

The spread across runs was small: at 364 rows, hydrated 5.6–6.3s, p90
26.0–28.7ms, over 32ms 53–57 frames. Runs taken while another job loaded the
container read up to 50% slower and were discarded.

**A container is not a phone.** 4× on a desktop CPU stands in for a mid-range
phone's main thread and says nothing about its GPU, its memory or touch
scrolling. #503's _"on a mid-range phone, not only on a desktop browser"_ is not
met by this, and stays for a real device.

### What it says

**Scrolling is not where 364 rows cost.** The median frame is 60fps at both
sizes, the p90 is under 32ms, and the long-frame share moves from 6.1% to 8.3%
for twice the rows. That is better than ADR 0086 §4's 196-row figure (p90
41–49ms, scrolling up), and no write moved the reader: the scroll position never
went backwards and today lands at the same 122px at both sizes.

**The cost is on load, and it is linear in the rows.** Mounting the whole past
up front means hydrating it: the longest task grows from 0.96s to 2.4s, the
blocking time from 1.4s to 3.4s, and the stream answers a tap about 2.7s later
than on the seed season. FCP moves by 0.4s, because the server renders the same
rows too.

### Decision: no virtualiser (confirmed)

ADR 0086 §4's answer stands, now with the number it lacked: **at 364 rows the
stream scrolls at 60fps median with a p90 under 32ms on a 4× CPU, so a
virtualiser has nothing to fix in scrolling**, and §1's reasons against it (it
takes scroll position from `use-timeline-scroll.ts` and rewrites the landing)
still hold.

### Proposed (owner to decide): make the load cost not grow with the past

Status: **Proposed**, not built. The load numbers are the one thing at 364 rows
that a virtualiser would have helped, and it is not the fix this proposes:

- **Server-render and hydrate only the weeks near today** (today's week, the
  weeks a landing can show, and the first chunk ahead), and mount the rest of
  the past after hydration in a `startTransition`, oldest last.
- It is growth above the reader, which ADR 0086 §4 removed. Where the browser
  anchors scrolling, the anchoring absorbs it as it already absorbs a
  `content-visibility` estimate that is off; where it does not (Safari),
  `ReadingHold` makes the one write, as it does for a revalidation.
- The trade: a strip jump to a far past week before the transition lands has
  nothing to land on, so the strip would wait for it.
- What would decide it: the same table on a real mid-range phone. If the
  hydration task there is under the budget the owner sets, nothing is done.

### The strip criterion (proposed, owner to confirm)

#503 asks that the strip not render the whole season at once. ADR 0082 §5 and
ADR 0086 §5 are later owner decisions:

- the strip is fixed;
- it draws every week as two spans;
- it switches to a window only when bars would be narrower than 6px.

At 52 weeks on a 390px phone, every bar is drawn. The measurement does not put
the strip in the cost: scrolling holds, and the load cost follows the stream's
rows. So the criterion is proposed as superseded, for the owner to confirm.

### Deferred hardening

None. The fixture and the script are local scripts with a production guard; the
fixture writes only to the database `DATABASE_URL` names, and the script only
reads a page on `localhost`.
