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
- **Weeks to remove come off the base first, then forward through the season.**
  ~~Off the longest block first, one at a time, ties to the later block.~~
  **Amended by §6** — see below for why the proportional rule was wrong.
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

### §6 — Amendment (#455): nine shapes, and the shortening rule says base first, taper never

Added after this ADR shipped, on the resolution of
[#386](https://github.com/leskraas/trainm8/issues/386): generation is
deterministic, so a **Periodization Preset** is no longer only the first path
through an authoring surface — it is the season shape a generated plan is built
on. That changed what "three shapes" costs. Three fixed lengths — 18, 19 and 21
weeks — is an acceptable answer for an authoring tool, where "here is the shape,
it ends early" is honest and the athlete edits it. It is not an acceptable
answer for a product promising _say which race, get a season_: with eleven weeks
to the Event, none of the three fitted, and the app had nothing to offer but a
true sentence.

**Two changes close that, and neither of them stretches a shape.**

**Nine shapes, not three.** Each of the three families ships at three lengths —
classic 3:1 at 12/18/24, masters 2:1 at 11/19/25, big base at 14/21/27. A family
is the shape (its blocks, rhythm, ramp, boundary step and quality mix); a
variant changes the week counts and nothing else, which is enforced
structurally: the variants of a family are built from one `PhaseShape[]` plus a
list of week counts (`presets.ts`), so two shapes in a family cannot disagree
about anything but length. Every run-in from **ten to twenty-seven weeks is
within two weeks of a shipped shape**, and that band is pinned by a test rather
than asserted here.

Two properties are deliberate. The **Peak and the Taper hold at two weeks in
every one of the nine** — shortening a season shortens the run-up to the Event,
never the sharpening at the end. And the **shortest shape the app ships is a
masters one**, for a structural reason rather than a coaching one: a 2:1 block
still contains a recovery week at three weeks where a 3:1 block needs four, so
the family whose rhythm survives compression is the one that compresses
furthest. A shape whose named rhythm never appeared in it would be a shape lying
about itself.

**The shortening rule, stated.** §3's proportional rule — take from whichever
block is currently longest — is **replaced**:

1. **The taper is never shortened**, in either direction. A compressed taper is
   the single change that reliably costs the athlete the Event, so it is not on
   the table at all. This clause of §3 is unchanged and is the constraint the
   rest is written under.
2. **Base absorbs first.** Every week, added or taken, goes to the first
   non-tapering block before any other block is considered.
3. **Then forward through the season, block by block.** Where the base has
   reached its floor and weeks are still to come off, the next non-tapering
   block gives, then the one after it. The **Peak gives last**. One sentence:
   _the further a block is from the Event, the sooner it gives._
4. **No block is trimmed out of existence**, and a trim that cannot land in full
   is no proposal at all. Unchanged from §3.

**Why the proportional rule was wrong.** It reads fairer and behaves worse: it
reaches the Peak while the base is still long, which produces a _different
season_ rather than a shorter run-up to the same one. And it could not be said
in a sentence — an athlete cannot predict "longest block first, ties to the
later block", so they cannot disagree with it, and a fitting rule nobody can
disagree with is one nobody has agreed to. The new rule is blunt about the base
(it can go to one week before the build gives anything) and that is accepted
rather than patched: the proposal names every block it changes before it is
applied, so an athlete who does not want a one-week base declines.

**Where the rule is written down.** A rule that exists only as the shape of a
loop is not a documented rule. It is stated here, on `proposeFit` in
`fit-proposal.ts`, in `CONTEXT.md` under **Season Fit**, and in the gallery's
own copy on the surface.

**§2 gains a clause and keeps its refusal.** Each shape card now states, before
it is picked, not only where it lands but what fitting it would cost —
`runs 9 weeks past your event · fitting it shortens Base by 7 weeks and Build by 2 weeks`
— through the same `fitRuleSummary` the plan page's offer uses, so the picker
and the offer cannot word one edit two ways. Where no proposal exists the card
says the shape is _too long to fit without dropping a block_ rather than going
quiet. Nine cards is a long scroll at 390 px (ADR 0028), so the shape step now
**orders the shapes by how close each lands to this Event**, computed from the
start week the form opens on so the list cannot rearrange under the athlete's
finger. Ordering is not labelling: no card is marked _recommended_, and §2's
reason for that is unchanged — fitting the calendar is still not evidence that a
shape is the right season for this athlete.

**What does not change.** A preset still carries no size and no horizon (ADR
0043 §1). Phases are still **fixed length** and there is still nowhere in
`presets.ts` to pass a run-in, which is what makes that structural — coverage is
a property of how many shapes ship, never of a shape resizing itself. Fitting is
still the athlete's tap, still recomputed server-side, still stated in full
first. And no preset carries a **strength segment**: deterministic generation
cannot produce a strength track, which is an **Unavailable Metric** to be named
rather than a `sessionsPerWeek` to be invented (#386's resolution).

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
- **§6 grew the gallery from three cards to nine** and gave `fit-proposal.ts` a
  named summariser (`fitRuleSummary`) that both the picker and the plan page's
  offer read, so one edit cannot be worded two ways.
- **Not decided here**: whether a shape should be offered on the plan page in
  the same illustrated form the creation step now uses (the gallery is unchanged
  behind its disclosure), and whether the starter week should propose intensity
  as well as days — it deliberately does not, because which day is a quality
  session is the **Quality Session Mix**'s to say.

## Status

Accepted (follow-up to map #362, on the owner's report after using the shipped
surface).

**Amended by #455** (§6): nine shapes rather than three, and §3's proportional
shortening rule replaced by _base absorbs first, the taper never_. Every other
clause of §3 stands.

**Qualifies** ADR 0044 §3: the plan is still never stretched by the app, and is
now resizable to the Event by the athlete in one tap, with the whole edit stated
first. **Confirms unchanged** ADR 0043 §1 (a shape carries no size), ADR 0044 §4
(no convention stored as a choice), ADR 0044 §7 (a pattern holds no quantity)
and ADR 0028 (the phone is the reference viewport).
