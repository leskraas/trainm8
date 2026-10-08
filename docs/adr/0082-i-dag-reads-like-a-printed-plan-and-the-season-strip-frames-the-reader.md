# I dag reads like a printed plan, and the season strip frames the reader

Status: Accepted

**Amends
[ADR 0065](./0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md)**
§1 and §8,
**[ADR 0075](./0075-the-past-band-stops-at-the-week-boundary-and-never-speaks-for-a-day-the-query-did-not-fetch.md)**
§1's scope, **supersedes
[ADR 0077](./0077-the-timeline-animates-four-things-and-reduced-motion-is-gentler-never-zero.md)**
§4 and
**[ADR 0078](./0078-the-stream-keeps-its-own-windowing-and-the-cost-at-full-span-was-never-the-rows.md)**
§4. **Builds on** the three week numbers of #505 S8 (`week-volumes.ts`), the
Planning Horizon of ADR 0080, and ADR 0081's Norwegian for the #505 surfaces.

Scope: `app/routes/_home/timeline/` — the presenter's week model, the stream,
the strip and the large-screen pane — plus two resource routes,
`resources/session-annet.tsx` and `resources/home-season.tsx`. Spec #505,
stories 16–19, 21–23, 25–31, 33 and 60, slice S9.

## Context

Home was built as a bi-directional stream of days (ADR 0065) whose weeks said
one thing: a TSS tally. #505 asks the same surface to read like a **printed
training plan** — a week header that says which week it is, what kind of week it
is and where it stands against its target per sport; history out of the way; the
far season visible as a shape rather than as empty rows; and a strip of the
whole season that says where the reader is in it.

Three things on the shipped surface stood in the way. Every day forward was a
44px cell, so a week with three sessions was half blank prompts. Every past week
was as tall as a current one, so reading back meant scrolling through history
the athlete had already lived. And the strip was a row of 124px cells scrolled
sideways, three to a phone, so it could show the season's shape to nobody: a
build, a recovery dip and a taper are a pattern across twenty weeks, and three
cells at a time is not a pattern.

## Decision

### 1. A week header reads its week, its kind and its numbers

`TimelineWeek` grows from a TSS tally to what a printed plan prints:

- **A relative name** — `Forrige uke`, `Denne uka`, `Neste uke`, otherwise
  `Uke 41` (the ISO week number, as a Norwegian calendar prints it).
- **Its kind** — the phase by its own name and its role in the phase's rhythm,
  `Oppbygging · hard uke`, read through the same `weekRole` the plan page reads
  (`ActivePlan.weekRoles`), so the two surfaces cannot disagree about which week
  rests. A week before the plan says `før planen`.
- **Per Training Track, the three numbers side by side** —
  `Løping · mål 46 · planlagt 44 · gjort 35 km` — with the verdict (`under`,
  `i rute`, `over`) only once a day of the week is past, the `≠` mark when
  planned is more than 10 % off target — **and only in a week that holds a
  session**: a week nobody has written into is not "off" its target, it is
  unwritten, and the collapsed line already says so — and what has no number
  said beside the sum (`+1 uten km`), never folded into it. A track whose
  target, planned and done are all zero or absent is **left out**, by the same
  rule the strip's lifting dot is drawn by (`trackHasFigures`): a line of zeros
  is noise, not a reading. Annet sits apart and counts in nothing. A week with
  no track to read it in carries its sessions and load instead
  (`2 av 5 gjort · 48 av 312 TSS`).

The numbers are S8's (`buildWeekVolumes`); the presenter only puts the words on
them. A figure a week cannot state is a dash, never a `0` — and a week wholly
ahead states no "done" at all.

### 2. A closed week folds to one line above today

Every week before this one is **folded**: one line,
`Forrige uke 28. sep – 4. okt · 35 av 46 km · under`, read in the lead track
(the first track not counted in sets) or, with no track, in sessions and load.
The line's reference is the target, or the planned figure when the target is
zero or absent — never `35 av 0 km` — and with neither it states what was done
(`12 km gjort`). The line is a real disclosure, the way ADR 0075 §5 made the
past band one: it opens the week below itself and stays, carrying
`aria-expanded` and the way back. Opening it holds the reading position with the
past band's own arithmetic (`bandScrollTop`, ADR 0075 §6) and tells the stream's
compensation the insertion is paid for (`HELD_ATTR`) — set **before** the render
the toggle causes, since the open weeks are the stream's own state and its
compensation runs inside that render. Set after, it credited the opened run to
the week the reader was last parked in and threw the stream down by the run's
height, bringing the hero half back open over an empty box.

A jump into a folded week from the strip **opens it**: the jump asked to see the
week, not its one line. Which weeks are open is therefore the frame's state, not
each week's, so a strip tap can open one on the way.

### 3. A plan week past the Planning Horizon collapses, and keeps the athlete's own sessions

The season now runs to the **plan's last week**, written or not, so its shape is
all there. A week is **collapsed** when all of these hold: there is a plan, the
week is past the Planning Horizon (`horizonWeekKey(lastClosedWeekKey)`), it sits
inside a phase, and **nothing machine-owned is in it**. It reads as one line —
`Uke 41 · Oppbygging · mål 58 km · fylles søndag kveld i uke 39` — and draws
only the days that hold a session, which can only be the athlete's own: their
fixed points far ahead are never hidden.

The last clause of that line is the week change's own rule, stated as the moment
it happens: the Sunday 20:00 close of a week fills the week after next
(`horizonWeekKey`), so week 41 fills on the Sunday evening that ends week 39. An
earlier wording, `fylles når uke 39 er ferdig`, read as "once week 39's training
is done" — a condition on the athlete, which the fill is not. The Planning
Horizon entry in `GLOSSARY.md` carries the arithmetic. A plan with no Week
Pattern has nothing to fill from and says `ingen økter lagt inn ennå` instead —
a promise the app would not keep is not printed.

A week the plan has **already laid** (a legacy full laydown, a stamp of many
weeks) is written, whatever the horizon says, so it stays open. Collapsing it
would hide sessions the line claims are still to come.

### 4. Free days ahead fold into short rows

**Amends ADR 0065 §1.** A run of two or more empty days **ahead** of today is
one short row — `3 ledige dager` — that opens into its cells, the same
disclosure the past band is behind today. The days stay in the model, so the
band has something to open into and the strip and stream still agree about which
days exist. **Today never folds**: it is the landing, so it is the one empty day
that is always a row, and it is what splits a past run from a free one. A single
free day is a day.

ADR 0065 §1's grid survives in the model — every date forward is still a day the
athlete can write into — and costs one tap more on the screen. That is the trade
#505 story 30 asks for: a printed plan's week is its sessions, and three blank
prompts in it read as a list of chores. `ledige` and not `rest`: the app still
does not name a day it knows nothing about (ADR 0065 §4). The past band's words
move to Norwegian with it, from `labels.ts` (ADR 0081).

ADR 0075 §1's rule — a run stops at the week boundary — holds for both kinds.

### 5. The strip is fixed, shows the whole season, and frames the reader

**Amends ADR 0065 §8; supersedes ADR 0078 §4.** The strip is one bar per
Training Week, all of them on screen at once, with a **frame** over the weeks
the stream is showing. It no longer scrolls: there is nothing cut off at an
edge, so §8's "a cell sliced in half says _this keeps going_" has nothing left
to say, and the two horizontal instruments stay distinct because only the
**Hero** moves sideways now.

- A bar's height is the lead track's `stripValue` — `max(target, planned)`, so a
  week planned past its target stands taller than the target — over the season's
  largest, **exactly**: never floored (ADR 0066 §3). What was done fills it from
  the foot. A week with no figure draws no bar and its button's name says
  `ingen tall`. With no plan the strip reads load, as before.
- The rhythm is a tone: a hard week darker than an easy one, so the season's 3:1
  is a visible pattern before a word is read. Today's week carries a mark under
  its bar; a week that asks for lifting carries a dot (variant C's
  strength-as-dots, so km and sets never share an axis — ADR 0043).
- Every week is a real button with the week's numbers in its name; tapping one
  jumps the stream there (`goToWeek`). The weeks are one **toolbar** and one tab
  stop — a roving `tabindex`, with the arrow keys, `Home` and `End` to move
  along it — so the season is a single stop in the tab order, not fifty, and the
  strip itself is no longer a focusable region wrapping its buttons.
- A finger is read off its **x over the whole row's height**, not off the bar
  under it: a bar is a few pixels wide on a phone and a short one is a few
  pixels tall, so the hit target is the week's column. Holding and dragging
  scrubs the stream through the season (pointer capture, `touch-action: none` on
  the row only, so the page still scrolls everywhere else).
- The frame is the first and last week whose headers are on screen
  (`weeksInView`), measured on the same scroll pass as the active week and set
  only when an edge moves to another week. It is positioned by index, never by a
  pixel reading of a scroll position.

`content-visibility` on the cells (ADR 0078 §4) is gone with the scrolling: a
fixed strip draws every bar every time, and a bar is two spans. The strip no
longer centres anything, so `centreScrollLeft` and its timer ladder are deleted.

### 6. The "I dag" pill lives in the strip and changes look

**Supersedes ADR 0077 §4.** The way back to today is the **I dag pill** at the
strip's corner: always there, quiet while today's row is on screen, filled with
its arrow (`↑ I dag`, `↓ I dag`) once the reader has scrolled today away (idea
I). Its accessible name is a verb with the direction in words — `Gå til i dag`,
`Gå opp til i dag`, `Gå ned til i dag` — so it never collides with the hero's
`I dag` pane dot and a screen reader hears the arrow a sighted reader sees. It
replaced the pill that floated over the stream's bottom edge and arrived and
left on an animation; a control that never comes or goes needs no entrance, and
it changes look **instantly**, because a look that eases in lags the scroll it
reports.

So the timeline's CSS motion is now the accordions (the draft, a band's run, a
folded week's days: height + opacity, 200ms) and the press (a row, a cell, a
band, a fold: `scale(0.97)`, 160ms) — ADR 0077's ingredients and curve, on one
more element of each kind, and the pill's two transitions gone. The audit in
`tests/e2e/home-timeline.test.ts` enumerates exactly that list.

### 7. On a large screen the season sits beside the list

From `lg` up the list is a 480px column and the season pane fills the rest: the
plan page's **season chart** (`SeasonChart`, on the Chart Primitive) and a table
of the plan's weeks — week, kind, the lead track's three numbers, the verdict —
whose rows jump the list and whose weeks in view are highlighted. The chart's
inputs come from `resources/home-season.tsx`, fetched only when the pane mounts,
and the pane mounts only at `lg` (`useLargeScreen`, false on the server), so a
phone neither renders nor fetches it. The plan page and the pane read the same
inputs through `season-chart.server.ts`. The full spreadsheet season (variant N)
is not this.

The pane is **memoised**, and so are the chart and the table under it: the list
beside it re-renders on every scroll frame that moves the frame, and the chart
must not re-render with it (ADR 0078's rule — memoisation is load-bearing). Its
callbacks are stable (`jumpToWeek` reads the open weeks through a ref rather
than depending on them). It fetches **once**: a failed read answers
`{ season: null, failed: true }` rather than throwing, and the pane shows a
quiet line (`Sesongkurven kunne ikke lastes nå.`) instead of retrying in a loop.

### 8. A done session can be counted in Annet from its row

S8 left `setCountsInNoTrack` without a surface. A done session in a sport the
plan has a track for carries a quiet `Tell i Annet` under its row, and one the
athlete put in Annet carries an `Annet` chip and `Tell i sporet`. It posts to
`resources/session-annet.tsx`, signed-in and owner-scoped (another athlete's id
answers 404 and moves nothing). A sibling of the row's link, never inside it — a
control inside a link is two targets under one thumb. A planned session is not
offered it: the bike ride to work is a thing that happened.

### 9. The home surface speaks Norwegian, dates included

**Completes ADR 0081 for `I dag`.** Every word on the home surface — the rows,
the hero and its panes, the empty cells, the start and end caps, the plan-start
line, the day stamp, the create menu, the recompute notice — comes from
`labels.ts` and is Norwegian: `IKKE GJORT`, `Ingenting registrert`,
`Legg inn en økt`, `60 TSS planlagt`, `Se økta`, `Sesongplan`, the Form reading
(`Form -13, sliten — …`). Dates are Norwegian too, from the `formatNb*` family
in `format.ts` and the month and weekday maps in `labels.ts`: `ons` / `7`,
`ons 7. okt`, and the week's span in the compact form a printed calendar uses —
`5.–11. okt`, `28. sep – 4. okt` — which also keeps the header on one line at
390px. No figure in a week header is below 12px; the extras are 11px.

What stays English is named, not hidden: the season chart's own words inside the
large-screen pane (it is the plan page's component, ADR 0081 §4), the Token
Sentence's accessible descriptions (`45 min duration`, the shared editor's), and
an imported activity's own title.

### 10. Today lands below its week's header, measured

The landing offset was a constant (`LANDING_OFFSET = 96`) from when a week
header was one line. With a header of up to three track lines that parked
today's row **under** the sticky header. The landing is now the measured height
of today's week header plus `LANDING_GAP` (12px) (`landingOffsetFor`), measured
on every landing, settle and return to today; the constant survives only as the
fallback before anything is laid out. The e2e landing test asserts today's row
top clears the header's bottom, so a taller header cannot regress it silently.

Where there is less than a hero's height of stream above the landing — a short
history — the fold's travel upward shortens to the room there is (`heroFold`),
so the top of the stream is a full fold rather than a half-folded, already-faded
hero: a blank box nobody could scroll away.

## As built (#505 S11): the writing line

Stories 35–41. Where it lives, and why there:

- **In the tapped empty day's draft.** The draft already held the day, the
  Discipline chips and the stamp; it now also holds a 16px text input
  (`Skriv økta`) under the chips. Empty, the draft offers what it always did —
  `Legg til 45 min Z2`. Once the line says something, the button becomes
  `Legg til «10 km rolig»` and is enabled only when every word was understood.
  After the write the row opens as its Token Sentence with Angre / Mer / Ferdig,
  exactly as a stamp does (ADR 0065 §5, ADR 0076). Strength still takes **Mer**
  to the full route: a sentence cannot name a lift yet.
- **Behind "+ Ny" → "Skriv en økt"** for every day the list does not offer as
  empty: a day that already has a session, a day in a collapsed week past the
  Planning Horizon (§3), months out. A panel under I dag's header row with a
  date field, the same chips and the same line. It closes when the write lands;
  the toast says what happened. The days it offers are the loader's window (±182
  days, `TIMELINE_HORIZON_DAYS` now lives beside `TIMELINE_TRAILING_DAYS` in the
  presenter), so whatever is written can be read back and undone on this surface
  — the Planning Horizon limits what the app lays, never what the athlete
  writes.

What the line shows while the athlete types (`writing-line.tsx`):

1. **What was understood** — the `ScoreStanza` rendered by
   `deriveWorkoutNotation` from the structure the reader produced
   (`sentenceNotationInput`), with the athlete's thresholds resolving zone
   facets, plus `Til sammen 10 km` / `Til sammen 33 min`. Never the typed text
   echoed back.
2. **The week sum** — `Løping denne uka: 40 → 46 km, målet står på 52`. The pure
   `weekSumPreview(weekVolumes, workout, track)` (`plan-outline/ week-sum.ts`)
   prices the session with the week model's own `fixedDayVolume`, so the "after"
   is the number the header shows once saved. A session with no number in the
   track's unit says `40 km, +1 uten km`; a TSS track says the TSS is priced on
   save; a sport the plan has no track for says it counts in Annet; no plan says
   there is no target. The week is read once per day from `resources/week-sum`
   (`getWeekVolumes`), which answers a failure as data so the list never falls
   to its error boundary over a preview.
3. **Suggestions** for each word the reader did not know: the nearest known
   words (one edit for a short word, two for a longer one, nearest tier only),
   and for a bare number `10 km` / `10 min`. Tapping one replaces exactly that
   word.

The save posts `intent=write-session` to home's own action, which **reads the
sentence again** (`parseWorkoutSentence`) and refuses with 400 a sentence it is
unsure of; `writeSessionOnDay` writes it through the stamp's day resolution and
`createWorkoutSession` — an `authored` session whose title is the sentence. The
stamp, the write and the undo now each answer with a toast built from the week
read on both sides of the write (`weekSumChangeLine`):
`Løping denne uka: 40 → 46 km. Ukemålet står på 52.` Nothing on the path reads
or writes the Plan Outline, and a route test asserts the stored targets are
unchanged.

The reader is the free-text parser ADR 0027 §1 left room for; see that ADR's
amendment. Not built: edits to a token in an open row do not toast (they save
through the full route's edit action, shared with the detail view), and
free-text commands (`syk til onsdag`) are a later step.

## Consequences

- **The season is longer.** It runs to the plan's last week, so the End Cap is
  reached later, and its unwritten-weeks count is now counted from the last week
  anything is written in rather than from the season's last Monday.
- **The far weeks are cheap.** A collapsed week is one line plus the athlete's
  own sessions, and a folded week is one line until opened, so the stream's
  height behind and ahead of the reader is smaller than ADR 0078 measured.
  `WeekBlock` stays memoised; its new props are a boolean and a stable toggle.
- **One tap more to write into a free day.** The run opens first. The empty cell
  inside it is the same control it was.
- **The pill is no longer at the thumb's edge.** It sits at the top with the
  strip, where navigation lives. Its `--shadow-pill` now lifts it only while it
  points somewhere.
- **The plan page's chart words stay English** in the large-screen pane: that
  surface is not redesigned yet (ADR 0081 §4). Everything else on the home
  surface is Norwegian (§9).
- **`ActivePlan` carries two new readings**: `weekRoles` and `fillsWeeks`
  (whether a Week Pattern with days exists).

## Alternatives considered

- **Keep the scrolling strip and add a frame to it.** Rejected: a frame over
  three visible cells says nothing three highlighted cells did not, and the
  season's shape still could not be seen.
- **Collapse every week past the horizon, laid or not.** Rejected — §3. A week
  the machine already laid would read "fylles når…" over sessions that exist.
- **Fold free days forward only inside collapsed weeks.** Rejected: the concrete
  weeks are the ones the athlete reads every day, and they are where half-blank
  weeks cost the most.
- **Keep the floating pill as well as the strip pill.** Rejected: two controls
  for one act on one screen.
- **Mount the season chart on every home load and hide it below `lg`.**
  Rejected: a phone would pay the season read and the conversion contexts on
  every visit for a pane it never draws, and the hidden subtree would still
  declare its transitions to the motion audit.
