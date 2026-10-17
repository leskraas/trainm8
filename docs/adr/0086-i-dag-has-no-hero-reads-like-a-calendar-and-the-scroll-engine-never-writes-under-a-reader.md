# I dag has no hero, reads like a calendar, and the scroll engine never writes under a reader

Status: Accepted · **§1 reversed for I dag's default view by
[ADR 0101](./0101-three-tabs-and-a-calm-i-dag-that-shows-today-and-this-week.md)**:
a today card returns on top. This ADR still governs the full view behind _Se
hele sesongen_.

**Supersedes**
[ADR 0065](0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md)
§3 (runs of empty days collapse into a band) and §8 (the hero),
[ADR 0075](0075-the-past-band-stops-at-the-week-boundary-and-never-speaks-for-a-day-the-query-did-not-fetch.md)
§1, §4–§6 (the band itself),
[ADR 0078](0078-the-stream-keeps-its-own-windowing-and-the-cost-at-full-span-was-never-the-rows.md)
§2–§3 (append-only growth above the reader and its compensation), and
[ADR 0082](0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)
§2–§4 (folded closed weeks, collapsed weeks past the horizon, folded free days)
and §6's placement of the pill. **Overrides** #505 stories 30–31. **Amends** ADR
0077 §2–3 (what the timeline animates). **Builds on**
[ADR 0085](0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
(tokens, components, motion scale). Spec #505; owner decisions of 2026-10-10.
Everything those ADRs say that is not listed here stands — in particular ADR
0065 §1, §4–§7, ADR 0075 §2–§3 (no row for a day the query did not fetch; the
Start Cap states the reach) and ADR 0082 §1, §5, §7–§11.

## Context

The wave-2 measurements on the production build at 390×844 (#505 P1–P8, D1)
found the home screen fighting its reader: the hero, the Ukeskiftet bar and the
"+ Ny" row left a 214px list with one day row in it; the landing re-applied
itself for 1.3s and yanked a reader who had scrolled at 400ms back from 819 to
519; scrolling up mounted one folded week per frame and wrote `scrollTop` 17
times in 25 steps to pay for it, cancelling a phone's fling; at 4× CPU the
scroll-up frame was 38ms median, 61ms p90; and the first paint showed the top of
the season before jumping to today on hydration.

The owner's decisions of 2026-10-10, newest first:

1. **Remove the hero.** Follow Arket variant P: a thin top line, the season
   strip, then the list. Form and Rekorder move to Meg; the hero's "Uka" pane
   was already the week header.
2. **Calendar-like, no collapsing.** Past weeks render in full, muted, with
   their numbers and verdict and all seven days. One row per day, every day: a
   free day is its own row (`fri`, with a "+"). Weeks past the horizon render as
   full weeks with empty day rows under a clear horizon divider. Nothing folds
   and nothing opens on a tap.
3. **Density.** At 390×844 the landing shows the top bar, the strip, the current
   week's header and at least six whole day rows.
4. **Feel.** No snap-back, no `scrollTop` written under a scrolling reader,
   landed on today before the first paint, instant jumps, and smooth enough at
   4× CPU — or say so before adding a virtualiser.

## Decision

### 1. No hero; a pinned top bar, the strip, the list

The top bar is one line, pinned, on the page's own tone with a soft shadow over
the list (no heavy rule): the plan and its goal
(`Klassisk 3:1 · ⚑ Halvmaraton om 12 uker`, `Blokk 3 av ∞`, or `Ingen plan`
linking to Sesong) — the plan's name gives way first on a phone, then the race's
name, never the countdown — then the Ukeskiftet badge, a compact "+ Ny", and the
I dag pill, outlined while today is in view and filled once it is not. The pill
moves from the strip (ADR 0082 §6) to this line; it still changes look instantly
and never moves.

**The Ukeskiftet notice takes no row.** While a proposal waits it is a badge
(`● 1 forslag`, named `Ukeskiftet: 1 forslag venter. Gå til forslagene`) that
jumps to the card after this week's days. A row of its own was a permanent 44px
of a phone for something answered once a week.

The strip sits under the line (§5). The list gets the rest.

Today's row carries what the hero carried: the session's action (`Se økta`,
`Logg økta`) beside _Gjort_ — only on today's own session, never on a later one
(#493) — and the coach's one line (Form and what to do, or the Session Nudge's
reason) under it. `buildTodayRow` replaces `buildTimelineHero`; the hero's
component, panes, pager, labels, the Proof Strip and the loader fields only it
read (`snapshots`, `weeklyAdherence`, `personalRecords`, `weekReplan`,
`strengthCount`) are deleted. `current` and `tsbTrust` stay for the coach line.

### 2. Every week whole, every day a row

A week's shape is one of three (`WeekShape`), and every shape is drawn whole —
the header and all seven days:

- **`past`** — before this week. Muted: the week's name and dates in muted ink,
  the dates in the gutter muted, the sentences a step lighter. Its header keeps
  its numbers and verdict.
- **`open`** — this week, and every week the Planning Horizon has reached or the
  plan has laid.
- **`beyond`** — not laid, and past the Planning Horizon (or far: past the
  plan's end and half a year, ADR 0082 "as built"). Its header states its phase
  and target and, in its sentence, when it is filled
  (`fylles søndag kveld i uke 41`) or that it will not be
  (`ingen økter lagt inn ennå`, `langt fram · bare øktene du skriver selv`). Its
  days are empty rows with a "+"; the athlete's own sessions there show on their
  days (story 28). A dashed divider —
  `Horisont · herfra bare mål, ingen økter ennå` — stands once, above the first
  such week.

There are no bands, no folds and no collapsed weeks on I dag any more: the past
band, the free-day band, the folded-week accordion, `foldLabel`, `shownDayKeys`,
`foldedTrackLine`/`collapsedWeekLine` and their labels are deleted (nothing else
read them; the Ukeskiftet review reads `TrackLine`, which stays). A day before
the query's reach is still not built (ADR 0075 §2): a `fri` row is as much a
claim as a band was.

A **free day** reads `fri` in quiet italics with a "+" at the right; the whole
row is the control at the 44px floor. A past free day is quieter still — its "+"
muted — and still writes, since writing into the past is allowed (ADR 0065 §6).
Today with nothing on it says `Ingenting i dag`.

### 3. The week header and the day row, after variant P

**Header:** one line naming the week —
`Uke 38 · 14.–20. sep · Grunntrening · rolig uke`, the relative name where it
applies — with a left edge in the phase's colour; one line per Training Track:
the track's name in its colour, `done / target unit` (or `mål 52 km` before
anything is done; a target of 0 states only what was done, never `12 / 0 km`),
the planned figure, the `≠` mark and the verdict as a word — beside a **Meter**
with done filled, planned as a dashed outline (the target itself dashed where
nothing is laid yet) and the target as a tick; then one muted sentence from the
existing week words. Only that much is sticky. The wave-1 notes follow in the
flow: figure notes in a figure's place, `+n uten km` with its side named, pace
and easy share, the zone split on an hours track, Annet.

**Day row:** a 42px gutter with the weekday in small capitals over the date
(today's circled); per session a thin rule in the track's colour (named for a
screen reader, so the colour is not the only label), a small ownership glyph (✎
the athlete's, ◌ the plan's), the whole session sentence — wrapped, never cut,
broken anywhere if it must be — and its own volume right-aligned in tabular
figures with a decimal comma (`6,1 km`, `55 min`, `13 sett`), with a dot in the
verdict's colour once done. Rows are separated by hairlines; no row is a card.
The glyph opens a **Popover** with the row's details said once: whose session it
is and what that means, load and comparison, the shape bars, and the quieter
actions — _Lås opp_, _Tell i Annet_, _Angre kobling_ / _Koble igjen_ — plus
`Åpne økta`. What asks for an answer stays on the row: the import's question,
_Gjort_, the quick strength log, and on today `Se økta`. A Popover rather than a
Drawer on phones: it is 288px wide, anchored and origin-aware, and holds a few
lines and two buttons; a sheet for that would hide the row it is about.

### 4. The scroll engine never writes under a reader

- **Landing before first paint.** The server renders a script right after the
  list that parks it (`landingScript`, the same arithmetic as `landingTop`): the
  top of today's week when the week fits up to today's row, else today under the
  sticky header. Hydration measures the same spot and writes nothing.
- **Late layout until the first input, never after.** A `ResizeObserver` on the
  list's content re-lands until the reader's first `pointerdown`, `wheel`,
  `touchstart`, `keydown` or `click`, anywhere on the page. No timers.
- **The past is mounted up front**, every week and day of it; weeks ahead are
  appended in chunks below the reader, which moves nothing they can see. Nothing
  grows above the reader, so nothing is compensated.
- **Where the reader is** comes from `IntersectionObserver`s (the weeks on
  screen for the strip's frame, a one-pixel reading line for the active week,
  today's row for the pill, a sentinel for the weeks ahead), and state is set
  only when a value changes.
- **Jumps are instant writes** made because the reader tapped (strip, pill,
  badge).
- **`overscroll-behavior: contain`** on the list.
- **Cost.** Each week block is `content-visibility: auto` with
  `contain-intrinsic-size: auto <estimate>`, the estimate built from what the
  week holds (`weekHeightEstimate`, constants measured at 390px: within ~±25px
  on the seed season). Only where the browser anchors scrolling
  (`@supports (overflow-anchor: auto)`): there, a week laid out above the reader
  taller or shorter than its estimate is absorbed by the browser, not seen, and
  the browser's anchoring also replaces `ReadingHold` for a revalidation that
  adds height above the reader. Where the browser does not anchor (Safari), the
  weeks are not `content-visibility` and `ReadingHold` makes that one write.
  `WeekBlock` and `DayRow` are memoised and carry no effects.

No virtualiser is added (ADR 0078 §1 stands). Measured on the built app, kody
seed (28 weeks, 196 day rows), 390×844, 4× CPU, scrolling up 40px a frame:
median 17–18ms, p90 41–49ms, against 38/61ms before; no app `scrollTop` writes
during the scroll (17 per 25 steps before). Turning `content-visibility` off on
this season measured median ~19ms, p90 ~44ms: on a season this short it buys
nothing and costs a little at p90 (a week is laid out just as it comes into
reach); it is kept for the long season (up to ~900 rows when a session is
written two years out), where laying out every row is what it saves. The p90 is
not smooth at 4×; recorded here, not chased with a virtualiser.

### 5. The strip, and a long season (S10)

One column per week tinted by `phase-*` at low opacity (a neutral tone outside a
plan's phases), a bar at `max(target, planned)` with done filled darker, dashed
outline bars for weeks past the horizon, a dashed horizon line, a flag on the
race week, a frame over the weeks in view, a today mark, and a row of phase
names under the columns, each with a coloured top border. Scrub, the
roving-tabindex toolbar and every week's accessible name stay.

**When bars would be narrower than 6px** the strip shows a **window** centred on
the reader, wide enough for 6px bars, with an edge button at each end counting
the weeks beyond and jumping there (44px hit areas). The window follows the
frame as the list scrolls and holds still under a scrubbing finger. Chosen over
a horizontally scrolling strip because a strip that scrolls is a second axis
competing with the list (ADR 0082 §5), and over 3px bars because nobody can hit
or read a week off a hairline.

### 6. Motion

Nothing moves with the list's scroll or on the strip (tens of times a day:
Emil's frequency table). The press is the system's `pressable`; the glyph's
popover enters origin-aware on `motion-popup`; the draft's reflow is the one
height animation left (the band's and the folded week's are gone with them).
Reduced motion keeps the fades and drops the scale. Hover is gated app-wide. The
e2e motion audit's list is updated to exactly that.

### 7. Wave-1 behaviour, recorded

Three behaviours shipped in wave 1 (#505 S3, S2, S5) without an ADR:

- **A closed week is graded against its target once every done session has a
  number.** Until then it is graded against the planned sessions it has numbers
  for, and the header says so rather than pairing the target with a verdict read
  against something else.
- **"+ Ny" writes can be undone from the toast.** A sentence written from the
  creation menu may land anywhere — far ahead, past the weeks mounted — so its
  way back is the toast's _Angre_, with the week's sum (ADR 0082 S11).
- **Writes have no last day.** The writing line writes any distance ahead (story
  40); only the window's first day bounds it. `maxDayKey` is gone from
  `WritingPanel`.

## Alternatives considered

- **Keep folding past weeks and free days, render less.** Cheaper, and what ADR
  0082 decided; overruled by the owner: a calendar is read at a glance, and a
  fold is a tap between the reader and the week.
- **A virtualiser for ~900 rows.** Rejected for now for ADR 0078's reasons —
  sticky headers, anchoring and the landing all assume real nodes — and because
  `content-visibility` gives most of the saving without owning scroll position.
  Revisit if the long season measures badly on a real phone.
- **A Drawer for the session details on phones.** Rejected: the details are a
  few lines, and a sheet covers the row they are about (§3).
- **A permanent Ukeskiftet row.** Rejected for the badge (§1).

## Consequences

- Height above the reader is now the browser's to hold where it can
  (`overflow-anchor`), and `ReadingHold`'s where it cannot.
- A season's row count is no longer bounded by folding; `content-visibility` and
  the memoised blocks are what keep it cheap, and the height estimate has to be
  kept roughly true when a row's layout changes (`WEEK_HEIGHTS`).
- The large-screen season pane is still the older English `SeasonChart` (#505
  D4); this ADR does not change it.
- Digit grouping for large volume figures is done in the polish pass below.

## Amended in the polish pass (same PR)

- **Top line (§1):** the race's name is never cut. It wraps inside the
  line's 44px and grows the bar only for a name longer than two lines. The
  countdown is one unbreakable unit. Under 360px the badge shows the count
  alone (`● 1`), and its name still says the whole sentence. From `lg` up,
  the plan and goal are left to the season pane's plan card (ADR 0087).
- **Strip (§5):** a phase is named whole or not at all, never abbreviated.
  Today's phase (or the reader's, when today is outside the window) is always
  named. Its name may run past a narrow band, and a neighbouring name it
  covers gives way.
- **Header (§3):** it keeps the title, one line per track and the summary.
  In the flow, at most one quiet line per track stays in view: the `+n uten
  km` counts with their side, and a part-logged strength week. The ungraded
  reason, pace, easy share, zone split with `hensikt, ikke en måling`, and
  Annet sit behind the summary line in a popover, and stay in place as
  screen-reader text. A track's name is set in ink. The Meter carries the
  hue, because the run, bike and swim hues are under 4.5:1 as caption text
  on a light card.
- **Load line:** `X av Y TSS` is used only when every session with done load
  also had a Planned TSS. Otherwise the line names each side, as in `gjort
  176 · planlagt 85 TSS`.
- **Figures:** `formatNbVolumeFigure` groups thousands with a no-break space
  (`1 270,3`).
- Kilos still use a decimal point (`82.5 × 5,5,5,4`), because commas separate
  the rep counts. This is an open owner decision.
