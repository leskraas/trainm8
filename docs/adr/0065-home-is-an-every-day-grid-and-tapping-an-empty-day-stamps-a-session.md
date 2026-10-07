# Home is an every-day grid, and tapping an empty day stamps a session into it

Status: Accepted. §3's worked example (`4–12 · 9 days`) is amended by
[ADR 0075](0075-the-past-band-stops-at-the-week-boundary-and-never-speaks-for-a-day-the-query-did-not-fetch.md)
(#500): a run of empty days stops at the week boundary, so seven days is the
longest band there is. The rule itself, and both of §3's reasons for it, stand.
The **open question this ADR states and does not settle** — virtualisation, and
who owns scroll position — is settled by
[ADR 0078](0078-the-stream-keeps-its-own-windowing-and-the-cost-at-full-span-was-never-the-rows.md)
(#503): the stream keeps its own windowing and no virtualiser is adopted,
because the measurement found the cost at full span was re-render fan-out rather
than row count. See the closed question below.

**Confirms [ADR 0027](./0027-text-first-workout-authoring.md)** — the cell
authors by _stamping structure_ and rendering the Token Sentence from it, so
render-never-parse survives being moved onto a 44px row. **Confirms
[ADR 0028](./0028-mobile-first-ui-standard.md)** — the empty row _is_ the 44px
control, and every ticket under this decision is verified at 390×844. **Confirms
`GOAL.md`'s no-in-app-recorder non-goal** — authoring on a past day writes a
prescription, never an actual; executed cardio still arrives by **Activity
Import** ([ADR 0049](./0049-every-import-auto-saves-there-is-no-inbox.md)).
**Scoped by [ADR 0039](./0039-manual-planning-authors-the-plan-outline.md) and
[ADR 0044](./0044-plan-outline-is-relational.md)** — the **Plan Outline** is
still the only periodization structure and the grid does not author one.

Scope: the home timeline (`app/routes/_home/timeline/`). Issue #494, ahead of
#495 (day-keyed presenter), #497 (every day forward is a row), #500 (the past
band) and #501 (stamping a Token Sentence). #503 was the open fork this ADR
stated and did not settle; ADR 0078 settles it. Design canvas: the artboards
"The grid", "Typing in the cell", "Behind today", "The rules" and "Motion"
(linked from #494).

## Context

The home rebuild shipped in `cd0928b` with no issue, no spec and no ADR. Its
code cites a design handoff three times — `timeline/row-content.ts:29` ("three
things the handoff asks for are deliberately not emitted"),
`cockpit/cockpit.tsx:251` ("the handoff's bottom tab bar is scaffolding"),
`index.dashboard.test.tsx:8` ("the handoff replaces the whole composition") —
and **no such document was ever committed**. Three deliberate deviations are on
the record and every one of them can be checked against nothing. This is the
record the next rebuild gets, written **before** the code.

What shipped is a stream whose **row is a session**. `presenter.ts:236` reads
`todayRowId: todayRow?.id ?? null`, and `presenter.test.ts:209` pins the
consequence as a fact of life: _"a rest day today leaves no anchor row — the
caller must cope"_. It does not cope. With no session on today the stream lands
on the top of the previous week, `COLLAPSE_THRESHOLD` measures from zero instead
of from the landing position — which `anchoring.ts` documents as exactly the
wrong test on a bi-directional stream — and the back-to-today pill has no row to
be above or below, so it never renders. A rest day is not an edge case in an
endurance plan; it is one or two days a week.

Underneath that is a bigger absence. A day with no session is **not addressable
at all**: there is nothing on home to tap, and the only way to put a workout on
a Thursday is the plan surface. The athlete this product is for — the
Self-Coaching Athlete — frequently never opens that surface and simply adds
sessions as the week happens (A1). A spreadsheet's virtue is that **the grid
exists before the content does**: the cell is there, empty, waiting to be typed
into. The current timeline has the opposite property — content summons the row.

## Decision

### 1. The stream renders every day, and a day owns zero or more sessions

> **The row is a day. A day owns zero or more sessions.**

From today forward, every date between today and the forward horizon is its own
row, with or without a session on it. The presenter's week model becomes a list
of days rather than a list of sessions (#495), and that reshaping lands **before
anything is visible** — days with no sessions emit nothing at first, so the
rendered output is byte-identical and the change is provable by the tests that
already exist.

This is also the whole answer to _"two sessions on one day"_. A morning run and
an evening lift are two sessions belonging to one day, grouped under one date
gutter, rather than two unrelated rows that happen to share a date. It is
answered **structurally, not by a special case**, which is the only kind of
answer that survives the next feature.

### 2. The stream stays a record; the plan surface still owns seasons

The grid is a **shortcut into authoring, not a replacement for planning**. What
a cell writes is a **Workout Session**. What it never writes is a **Plan
Outline** row — no phase, no track, no volume, no rhythm.

The boundary is at the Outline, not at the session, and that is what keeps this
decision from quietly re-opening ADR 0039. A season is a periodized structure
with phases and tracks measured over them; a surface that authors one day at a
time structurally cannot say anything about the shape of a block, and a surface
that _implied_ it could would be the worst of both. So: the plan surface plans;
the grid puts a workout on a Thursday.

### 3. Behind today, runs of empty days collapse into one band

Forward, every day is a row. **Behind today, a run of consecutive empty days
renders as one band** — `4–12 · 9 days · nothing logged` — that expands to
individual rows on tap. _Amended by ADR 0075 (#500): a run stops at the week
boundary, because a week block is the unit the stream mounts and windows, so the
example's nine days are two bands under two week headers. A band also never
covers a date older than the query's own reach._

Two reasons, and the second is the load-bearing one:

- Nine blank rows say the same thing as one band, less well, and the band states
  the fact the blanks only imply. Scrolling back through a season should pass
  **weeks, not empty days**.
- **It keeps stream height behind the reader stable.** The scroll module's
  growth compensation credits inserted height against a marked week's _own_
  offset (`anchoring.ts`, and the rebuild's own commit message on why it is not
  measured against `scrollHeight`). A run of days that could expand _above_ the
  reader is precisely the input that walks them away from where they were
  reading.

### 4. `Rest day` is written only where the plan prescribes recovery; every other empty day carries no label

An empty day is not one thing. Where the **Plan Outline** prescribes recovery,
the row says **Rest day** and says that the plan asks for nothing. Everywhere
else the row is a **blank cell with no label at all**.

> **The app does not name a day it knows nothing about.**

Two sources are available, tempting, and both wrong:

- **`PlanOutlinePhase.rhythm`** is `3:1` / `2:1` / `none` — _recovery weeks_, at
  week granularity. A recovery week is a week with lighter sessions in it, not a
  week of rest days. Deriving a day label from it would be inventing a
  prescription the phase never made.
- **`AthleteProfile.trainableWeekdays`** is **Training Availability** — the days
  the athlete _can_ train. A day they cannot train is not a day the plan asked
  them to recover. Labelling Tuesday "Rest day" because they are at work is the
  app asserting a training decision on the athlete's behalf.

This is the Unavailable Metric principle applied to a _word_ rather than to a
number, and it has a cost stated in the consequences: today nothing in the model
prescribes recovery per day, so the label ships with no producer.

### 5. Tapping an empty day stamps a one-step block, and the sentence is rendered from it

Tapping an empty cell **stamps a minimal one-step block** for the prefilled
discipline and **renders it as a Token Sentence in the row** — `45 min · Z2` —
where every value is a token the athlete taps and types over, through the
editing instrument that already exists.

**Nothing is parsed.** ADR 0027 §1 decides render-never-parse and rejects
free-text with live parsing by name; this surface does not weaken that rule, it
inherits it. The sentence is a pure rendering of `Workout → Block → Step`, the
tokens mutate structure, and the sentence re-renders. A cell is invalid by
construction only if the structure is, and the structure is stamped by the app.

**Why a stamp and not a typed title.** A typed title makes a session with no
shape: no profile bars, no expanded steps, no planned load, nothing for
adherence to compare an import against. It would introduce a class of session
that exists on the calendar and is invisible to every derived number in the app.
A stamped one-step block is a **real prescription from the first tap** — a
shape, a duration, an intensity — and the athlete edits values rather than
supplying structure.

**The discipline is derived, visible, and one tap to change.** The chip is
prefilled from the athlete's **most-trained discipline**, read from their own
history, and shown _before_ commit — it is what the stamped block is stamped
_for_. An athlete with no history is **asked**, never assigned one, because a
default that is a guess dressed as a derivation is the failure mode this repo
keeps naming.

### 6. A past day takes the same gesture, and authoring is not recording

The gesture on a past day is identical, and what it writes is identical: a
**Workout Session**, which is a prescription that happens to carry a date in the
past. It is not an actual, it is not telemetry, and it claims nothing about what
the athlete did.

The non-goal check, stated explicitly because it is the obvious place to trip:
`GOAL.md`'s **no in-app activity recorder** forbids trainm8 capturing executed
**cardio** data — distance, duration, heart rate, power, a GPS trace. Executed
cardio arrives by **Activity Import** and attaches through **Auto-Save** (ADR
0049), and that path is untouched by this decision. What would violate the
non-goal is a field on this row for _what I actually did_; no such field exists
here and none is added. The strength exception is unchanged and unaffected: sets
are logged in-app because no provider exports them, on the runner, not here.

### 7. The floor is a control, not a height

Empty rows sit at the **44px control floor** — ADR 0028's second pillar, the
real `h-11` control rather than a hit-area extension — and an empty row is a
**real button**, not a clickable `div`. Session rows keep the height their
content earns; a row that says two things is taller than a row that says
nothing, and forcing them to match would either crush the session or inflate the
blank.

The grid therefore reads from the **date gutter every row aligns to**, not from
uniform row height. That gutter is the alignment contract, and it is what makes
a column of ragged-height rows read as a grid at all.

### 8. The hero never moves in time; the strip and the stream always do

Home has **two horizontal axes on one screen**, and they are different
instruments:

- **The hero pages.** It is anchored on today, permanently, and swipes sideways
  through facets of _now_ — the session, Form, this week, records. One
  full-width pane per swipe, mandatory snap, dots. It moves nothing else.
- **The strip scrolls.** Cells are cut off at **both** edges, proximity snap, no
  indicator, and moving it moves the stream.

A pane that fills the width says _"one of several"_; a cell sliced in half says
_"this keeps going"_. That difference is what keeps two swipeable regions from
reading as one confused axis, and it is why both are allowed to swipe at all.
Both take `touch-action: pan-x`, so a diagonal drag reaches the stream instead
of being eaten sideways.

## Alternatives considered

- **A free-text row — type a workout, parse it.** Rejected. ADR 0027 §1 already
  rejected parsing for the full-screen editor, where there was room for error
  correction; a 44px row under one thumb is a strictly worse place to invite
  invalid intermediate states. The token model stays the target a future parser
  would aim at, and no grammar ships here either.
- **A typed title, committed as a session with no structure.** Rejected — §5. It
  is the cheapest thing to build and it manufactures sessions that no derived
  number can read.
- **Render every day behind today as well.** Rejected — §3. It buries the season
  in blanks and hands the growth compensation an input that moves the reader.
- **Label every empty day `Rest day`.** Rejected — §4. It is the app inventing a
  fact about the athlete's training, on the majority of rows.
- **Derive `Rest day` from `trainableWeekdays`, or from a recovery week's
  rhythm.** Rejected — §4. Availability is not prescription, and a recovery week
  is not a week of rest days.
- **Patch the anchor instead: fall back to the nearest session, or to the week
  header, when today has no row.** Rejected — it keeps `todayRowId` nullable and
  leaves three behaviours (landing, collapse threshold, pill) each carrying its
  own fallback for a state §1 makes unreachable. Dissolving beats patching; see
  the consequences.
- **Keep rows session-keyed and splice synthetic empty rows in at render time.**
  Rejected. It gives the surface two models of a day — one that owns sessions
  and one that stands in for their absence — and the second one has nowhere to
  put the second session on a Tuesday.
- **A month calendar grid.** Rejected. A day here carries two lines and a chip;
  a month cell carries a dot. It also forfeits the single continuous reading
  axis that makes the stream a stream.
- **Leave authoring to the plan surface.** Rejected — that is the status quo,
  and A1 is the reason this ticket exists.
- **Adopt a virtualiser now.** Not rejected — **deferred to #503, unmeasured**,
  and stated as an open question rather than left to be discovered mid-slice.

## Consequences

- **Rule §1 dissolves the rest-day anchor bug rather than patching it.** If
  every day forward renders, `todayRowId` is never null: the landing, the
  collapse threshold and the back-to-today pill work on a rest day for free,
  with no fallback and no special case anywhere. `presenter.test.ts:209` — _"a
  rest day today leaves no anchor row — the caller must cope"_ — is **deleted,
  not rewritten**, and the assertion that replaces it is that the anchor exists
  on a day with nothing on it.
- **The stream grows from roughly 40–120 rows to as many as 364**, about 8,000px
  of empty days ahead of the reader alone. This is the open fork below, and
  #500's band is what keeps the number from being worse behind the reader.
  _Measured (ADR 0078, #503): the 364 is never reached. #500's bands hold a full
  52-week season to **243 day rows** and 24,473px, and what actually cost the
  frame rate at that span was thirty full re-renders per fling, not the rows._
- **`Rest day` ships with no producer.** Nothing in the model prescribes
  recovery per day: `PlanOutlinePhase.rhythm` is week-granular and
  `trainableWeekdays` is availability. Until the Outline can say _"this day is
  recovery"_, §4's first branch is unreachable and **every empty day is blank**.
  That is the honest state, and it is deliberately not faked from the two
  sources §4 names. Whoever gives the Outline a per-day recovery statement
  activates this rule without touching the timeline.
- **Every empty row is now a write target, and a mistap commits a database
  row.** A mistyped cell in a spreadsheet is one keystroke back; here it is a
  **Workout Session** on a date. Recovery from within the timeline — undo or
  delete without leaving the surface — is **owed by #501** and is not optional
  polish; a grid that is easy to write into and hard to correct is worse than
  the plan surface it shortcuts.
- **A session authored from a cell is indistinguishable from one authored on the
  full route** — deliberately, since it is the same structure through the same
  path. The cost is that nothing records _which_ surface authored a session, so
  whether the grid actually displaces the plan surface is not measurable from
  the data.
- **The authoring route must accept a date and stop hardcoding a discipline.**
  §5's gesture cannot be built on a path that decides both for itself; that
  change is #501's and it reaches beyond the timeline directory.
- **The token popover is a 324px instrument arriving in a 44px row.** It has to
  open _below_ the cell without covering the next day — the first place the
  editor's existing instrument does not simply drop in.
- **Home moves closer to The Tape's premise without adopting it.** A continuous
  past↔future axis of days is what `GLOSSARY.md` describes The Tape as; it stays
  a `GOAL.md` **Horizon** item and this ADR does not promote it. `GLOSSARY.md`'s
  **Dashboard** entry still describes the three-tab composition that `cd0928b`
  deleted; correcting the glossary and `GOAL.md` for the surface that actually
  shipped is **#492's** job, and this ADR adds only the vocabulary it decides
  itself.
- **The strip and the stream must agree about which days are empty.** They are
  derived from one week list precisely so they cannot disagree (`presenter.ts`),
  and every day dot in the strip now has a row it must match.

## Open questions

- **~~Virtualisation, and who owns scroll position (#503 — a human call).~~**
  **Closed by
  [ADR 0078](0078-the-stream-keeps-its-own-windowing-and-the-cost-at-full-span-was-never-the-rows.md).**
  The question as posed here was: at ~364 rows the standard answer is a
  virtualiser, but a virtualiser owns scroll position and so does
  `use-timeline-scroll.ts`, so whichever wins, the other gets rewritten. The
  measurement dissolved the fork rather than picking a side, because neither
  premise survived it. The row count never reaches 364 — #500's bands hold a
  52-week season to 243 day rows — and the cost at that span was **script, not
  rows**: one fling re-rendered every mounted week thirty times over, because
  the active week is set on scroll and nothing below it was memoised. Two `memo`
  calls restored a 60fps median at full span on a 6×-throttled CPU without
  touching the scroll module, so the module keeps scroll position and no
  dependency is added. **The suspicion recorded here — that the answer was to
  make the rows cheap and add no dependency — was right, for a reason it did not
  guess.** The week strip, which belonged to the same decision, keeps every cell
  and skips rendering the ones nobody is looking at.
- **Undo.** §5 makes writing trivial; #501 owes the way back. Whether that is a
  local undo on the row, a delete on the token sentence, or both, is undecided.
- **The empty account.** With a grid, home may simply _be_ the empty state,
  which would settle the four competing "nothing here" messages a new athlete
  currently meets. Attractive, and out of scope here.
- **Two sessions on one day is answered by the model and not by the metaphor.**
  A cell holds one thing; a day holds a morning run and an evening lift. §1
  fixes the data shape; what the row _looks_ like with two sessions under one
  gutter is #495's to draw.

## Assumptions (headless grill — no operator available)

- **A1 — "a large share of athletes never open the plan surface" is asserted,
  not measured.** No analytics back it. If it is wrong, nothing in this decision
  becomes unsafe: the grid is still a shortcut and the plan surface still owns
  seasons (§2). What would change is the priority of #501 relative to the rest
  of the map.
- **A2 — the most-trained discipline is derivable from the athlete's own session
  history** with no new stored field. If it turns out not to be, §5's fallback
  is the one already stated: ask, never assign.
