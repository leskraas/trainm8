# A season shape is picked before a plan exists, and fitting it to the Event is the athlete's tap

Map #362 ended at a foundation and the surface was built on it (#399–#429). The
foundation is sound; the **first ten minutes on it are not**. The owner's
report, after using the shipped surface: _making a plan is hard, it is hard to
get an overview — especially on a phone — and it should be plug and play, so
somebody who does not know training well can make a plan._

Nothing in that report is a defect in the model. Every figure the surface shows
is honest, every control is where a decision belongs, and the vocabulary is the
one eight ADRs settled. What it lacks is a **first path through**: the shipped
flow asked an athlete to invent a periodization scheme before it offered them
one, and then handed them true sentences about their season with no next act
attached to any of them.

This ADR records the four decisions that answer that, and one of them qualifies
a rule ADR 0044 set.

## Evidence

Driven at the 390×844 reference viewport (ADR 0028) against seeded data:

- **`/training/plan/new/:eventId` opened with three expert questions.** A
  **Volume Currency**, a weekly volume, and six blank _Phase name / Weeks_ rows.
  An athlete with no history to pre-fill from met an empty unit select, an empty
  number field and six empty rows — and nothing on the screen said what a phase
  is for, how many there should be, or how long.
- **The three shapes were offered only after the plan existed.** `PresetGallery`
  lives on the plan page behind a closed _Start from a shape_ section, so the
  athlete had to author a season by hand to reach the screen that would have
  authored one for them. The gallery's own copy states the problem it was
  already solving one step too late: _"an athlete starting a plan should not
  face a blank season"_ (`presets.ts`).
- **The plan page was 4,284 px tall on a phone.** The open phase card carried
  six independent forms — rename, resize, rhythm, **Volume Ramp**, **Block
  Boundary Step**, **Quality Session Mix** — every one of them correct, and all
  of them before any sentence saying what the block does.
- **Nothing said what was left to do.** A plan with no **Week Pattern** and no
  stamped week looks, on the page, exactly like a finished one.

## Decision

### §1 — A shape is the first thing authoring asks for, and it lands whole

Step two of authoring leads with the three **Periodization Presets**, each drawn
as the load profile it lays down, with _"lay out my own blocks"_ as the fourth
option in the same radio group. Picking one and submitting writes the preset's
phases **and** each endurance segment's **Volume Ramp**, **Block Boundary Step**
and **Quality Session Mix** in one act (`PlanStructureSchema`,
`createPlanOutline`).

Three properties are load-bearing:

- **The shape names a preset; it never posts one.** `PlanStructureSchema` is a
  union of `{ presetKey }` and `{ phases }`, so a season the app never shipped
  is unrepresentable rather than validated against — the rule
  `PresetApplySchema` already held, extended to creation.
- **A shape still carries no size and no horizon** (ADR 0043 §1). The **Plan
  Start Week**, the tracks, their currencies and their **Season Anchors** are
  asked for on the same form and never inferred from the picture.
- **Both paths lay their segments through one function**, so a season authored
  from a shape and one typed by hand cannot come out structurally different.

The hand-authored path is unchanged, including that it opens with every rate
unset: a convention is still never stored as though it had been authored (ADR
0044 §4). What a preset writes, it writes because a preset _chooses_ it.

### §2 — Each shape says where it would land against this Event, before it is picked

A preset is a fixed length and the app stretches nothing (ADR 0044 §3), which
means the difference between the three shapes, for an athlete with twelve weeks
to race day, is a fact the illustration cannot show. Each card carries it —
`18 weeks · runs 9 weeks past your event` — derived live from the start week the
form is currently on, through the same `eventFit` the plan page reads. The
closest-fitting shape is the form's **default**, and no card is labelled
_recommended_: fitting the calendar is not evidence that a shape is the right
season for this athlete.

### §3 — Fitting the plan to the Event is offered, computed in full, and applied only on a tap

**This qualifies ADR 0044 §3.** That rule stops the _app_ from resizing a shape
to fill a run-in, and it stands: nothing here resizes anything on its own, at
read time, or as a side effect of applying a preset. What it does not cover is
an athlete who has read _"your plan runs 9 weeks past your event"_ and does not
know which block to shorten. For them the surface computes the edit, **names
every block it would change**, and applies it when they tap (`proposeFit`,
`fitPlanToEvent`).

What lands is ordinary resizes they could have typed. The rules of the proposal:

- **A tapering phase is never touched.** Its length is the one part of a shape
  that is about the Event rather than about accumulation.
- **Weeks to add all go to the first non-tapering block** — a longer run-in is
  more base; a longer Peak is a different plan.
- **Weeks to remove come off the longest block first**, one at a time, ties to
  the later block, so the base stays at least as long as the build it feeds.
- **No block is trimmed out of existence**, and a trim that cannot land in full
  is **no proposal at all** rather than a partial one. Removing a block is a
  decision, so it stays the athlete's.
- **It is recomputed server-side** from the stored rows, never posted, so a
  stale proposal cannot land an edit the athlete was not shown.

### §4 — The surface says what is left to do, and offers a week to start from

Two readings, both derived from the plan rather than from a stored flag, so an
athlete who does the thing by hand sees the step close:

- **A "what's next" reading** above the two tabs, naming only what is
  outstanding — a block that does not climb, a missing **Week Pattern**, a
  season with no week on the calendar — each linked to the reading that performs
  it. It disappears entirely once nothing is outstanding.
- **A starter Week Pattern**, offered in the pattern section's empty state and
  built from the athlete's own **Training Availability** plus the plan's tracks
  (`proposeStarterPattern`). Every day is a `share`, so it holds no volume (ADR
  0044 §7); one long day and the rest even; lifting days beside the endurance
  week rather than instead of it. Where availability was never set it falls back
  to a four-day week and the copy **says so** rather than implying it read
  anything. An athlete who says they train on no days is taken at their word and
  gets no pattern.

`addWeekPattern` still opens an **empty** pattern, and its reason still holds —
"a pattern with a default week in it would be a shape nobody authored". A
starter week is not that: it is a proposal the athlete asked for by name,
described before they tap, and editable through every ordinary path afterwards.

### §5 — A block says what it does before it shows a control that changes it

The open phase card leads with one sentence derived from its own segments — _"It
climbs +5% a loading week, with 1 quality session a week — 1× tempo"_ — and its
six forms are grouped behind two lines: **how this block progresses** and
**rename, resize or move**. Nothing is removed and no copy is cut; opened, each
half is exactly the surface that shipped. A ramp of `null` is said out loud
("does not climb"), because that is the fact an athlete is least likely to
notice and most likely not to have meant.

## Consequences

- **Plan creation writes more than it did.** `createPlanOutline` now lays
  endurance segments through `layEnduranceSegments` on both paths, and
  `PlanOutlineCreateSchema` takes `structure` instead of `phases`. Callers are
  updated; the union makes "both" and "neither" compile errors.
- **`fitPlanToEvent` is the first service operation that resizes several phases
  at once.** Its refusals are split — `already-fits` and `cannot-fit` are
  different sentences — because the surface renders no control in either state
  and a posted intent deserves the specific answer.
- **The plan page is ~2,900 px at 390 px**, down from ~4,284, with a card added.
- **`CONTEXT.md`** gains the **Season Fit** operation and notes on the
  **Periodization Preset** landing at creation and the starter **Week Pattern**.
- **Not decided here**: whether a shape should be offered on the plan page in
  the same illustrated form the creation step now uses (the gallery is unchanged
  behind its disclosure), and whether the starter week should propose intensity
  as well as days — it deliberately does not, because which day is a quality
  session is the **Quality Session Mix**'s to say.

## Status

Accepted (follow-up to map #362, on the owner's report after using the shipped
surface).

**Qualifies** ADR 0044 §3: the plan is still never stretched by the app, and is
now resizable to the Event by the athlete in one tap, with the whole edit stated
first. **Confirms unchanged** ADR 0043 §1 (a shape carries no size), ADR 0044 §4
(no convention stored as a choice), ADR 0044 §7 (a pattern holds no quantity)
and ADR 0028 (the phone is the reference viewport).
