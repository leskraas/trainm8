# A working set is one tap, and an off-program weight can no longer be logged

Status: Accepted

**Supersedes
[ADR 0060](./0060-the-session-runner-is-a-grid-with-a-deadline-and-a-rack-that-cannot-make-the-number-says-so.md)
§1** — the three-controls-per-row set grid — and **confirms ADR 0060 §§2–8**
unchanged: the plate line, the plate-aligned warm-up ramp, rest as a deadline
that never blocks the next set, every set persisting as it is completed,
finishing as an explicit act, the Stall Cut notice that offers nothing, and no
stored number moving. **Confirms
[ADR 0028](./0028-mobile-first-ui-standard.md)** and
**[ADR 0008](./0008-tss-triad-with-hr-first.md)**'s Unavailable Metric.
**Confirms render-never-parse
([ADR 0027](./0027-text-first-workout-authoring.md))**: the circles post typed
fields and parse nothing.

Scope: `app/routes/training/sessions.$sessionId_.log.tsx` and
`app/routes/training/__runner-presenter.ts` (issue #480, under spec #476). The
approved mobile design (`docs/design/strength-program-handoff/`, screens
`03-runner-empty.png` and `04-runner-logging-rest.png`) is the pixel-level
contract for the surface this decision describes.

## Context

ADR 0060 §1 prescribed **three controls per set row** — load, reps, ✓ — and
called that shape the run rather than the couch. It was the right shape for the
wrong hand. On the surface with the least attention available anywhere in the
app — one thumb, phone at arm's length, twenty seconds after a heavy set — a
made set of five at the weight the program had already decided cost a keyboard,
a numeric field and a confirm, three times over, five times per lift.

The load input was also asking a question the program had already answered. ADR
0059 makes the working weight a stored, outcome-indexed number the program
resolves before the athlete opens the session; the row then invited them to type
something else beside it, once per set, which is exactly how a program stops
being the program (ADR 0060 §7's argument about offers, one level down).

## Decision

### 1. The set row and its load input are deleted; a working set is one circle

> **A working set is one control, and the control is a tap.**

Per lift: the name, one sub-line — `5×5 · 82.5 kg` — and a row of equal-width
circles, one per prescribed working set, 60 px tall because they are pressed
with a shaking hand. Untouched, a circle shows its target reps.

- **First tap logs the full target** and the circle renders as made.
- **Each further tap counts the reps down** — target → target−1 → … → 0 — and
  anything below target renders **destructive with the count achieved**, because
  a set under its target is one the program will read as a miss and the athlete
  is entitled to see that without arithmetic.
- **A tap past zero clears the set.**

Each circle carries `Log set 3 of Squat`, and `Logged set 3 of Squat` once
logged; `2 of 5 logged` states what is left without counting circles. The only
motion is the 120 ms colour transition and the 80 ms press to `scale(.94)`.

**Every tap is a write**, through ADR 0056 §2's shipped upsert on
`(sessionId, stepId, orderIndex)`. Nothing is added to `ExerciseSetLog`; a clear
goes through the shipped clear path. There is no save button, and the caption
says why: _"Every set was saved as you tapped it. This only marks the day."_

**All of it is presenter logic.** Circle state, the accessible label, the tap
cycle (`nextSetReps`), the counter, the sub-line and the weight a tap posts
(`buildWorkingLoad`) are pure functions in `__runner-presenter.ts`, unit tested
there; the component computes no programme logic and restates no sentence.

### 2. The cost: there is no longer any way to log a working set at a weight other than the one the program resolved

This is the price of §1 and it is stated rather than mitigated. The weight a tap
posts is the weight the prescription resolved, in the load's **own** semantics —
the kilos on the belt for a weighted dip, the kilos of help on an assist stack.
An athlete who took 80 kg because 82.5 kg was not on the rack, or who worked up
past the prescription, **cannot record that on this screen at all.** They can
record the reps they achieved and nothing about the load.

What that costs, concretely:

- A missed weight and a missed rep count are now the same event to the log: the
  reps say `4`, and the 2.5 kg the athlete came down is invisible.
- The program's fold (ADR 0059) reads a success predicate over the logged
  working sets, so a session run at the wrong weight advances or holds the lift
  as though it had been run at the right one.
- The stored `LoadValue` is a claim about the day that no athlete typed. It is
  the prescription's number, and it is written as though observed.

**No off-program weight escape hatch ships with this ticket**, and none is
faked: there is no long-press, no hidden field, no "advanced" row behind the
card. The honest fix is a load editor reachable from a circle that already has a
set logged against it — one control, one lift, not one per set — and it is **not
built**. Until it is, the runner is a surface for running the program as
written, and an athlete who deviated has no way to say so.

### 3. Where the prescription does not resolve there are no circles, and the absence is stated once

A `LoadValue` that resolves to no number — an `85 % 1RM` with no anchor on file,
a stack level, a band, a per-hand lift — yields `{ kind: 'absent' }` from
`buildWorkingLoad`, and then: the circles are **disabled**, never a zero and
never a number nobody has, and the absence takes the weight's place in the
sub-line (`1×5 · no 1RM on file for this lift`).

**The absence is stated once and its fix once.** The sub-line carries the
sentence; the line under the circles carries only the way out of it (_"Record a
1RM for this lift."_). Saying the same sentence twice, three lines apart, on
this screen is #434's defect in miniature — it was written that way and is
corrected here.

### 4. What the deletion did not take with it

ADR 0060 §§2–8 are load-bearing and unchanged. In particular the **plate line
survives the loss of the input it annotated**: it is solved against the weight
the program resolved rather than against something typed, it is still absent
where the athlete has described no gym, and a rack that cannot make the number
still says so. #484 restyles it; it must not stop working in the meantime.

## Consequences

- **The load an aggregate reads on a strength set is now, on this surface,
  always the prescription's.** Every strength record, estimated 1RM and
  lift-over-time bar derived from a session logged through the runner inherits
  §2's assumption. Nothing is derivable that tells a reader which sets were
  observed loads and which were prescribed ones.
- **A tap is optimistic and a refusal is local.** The circle answers before the
  round trip; a save the server refuses puts the previous value back and prints
  the refusal in the card, where the thumb already is. A rest timer already
  started on that tap is not rewound.
- **`repsLeft`, `rir`, `toFailure`, `abandoned` and `loadLabel` are unreachable
  from the runner.** The action still accepts all of them and the columns still
  exist; the circles post none of them. ADR 0060 §1 kept them "in reserve,
  behind the row's own control", and the row is gone. `restTakenSec` is the one
  survivor and it is not asked for either: the circle measures it from the last
  completed set, as ADR 0060 §4 already had it.
- **An AMRAP or a moved target is stepped down from the target, not from
  itself** (`nextSetReps` clamps), so the cycle cannot strand an athlete tapping
  their way down from 20. A set logged before this ADR at 12 reps against a
  target of 5 therefore reads as `12` and its next tap posts `4`.
- **A timed hold logs in full and its next tap clears it.** Decrementing a
  45-second plank one second at a time is thirty taps, so `countsDown` is false
  for the duration quantity.
- **Two of the seven `LOAD_KINDS` the action accepts can no longer be posted
  from this screen** (`stackLevel`, `band`), and `perSide` remains absent for
  ADR 0061's reason. A machine or band lift is an absence here, quoted in the
  program's own words.
- **Four seams are left open by name**, each with its behaviour already shipped
  in an interim shape that must not regress: the rest bar (#482, pinned and
  restyled), the warm-up chips (#483, whose ramp already writes
  `role: 'warmup'`), the help panel and plate line (#484, currently a popover
  behind the lift's name), and the outcome panel (#485, whose sentences come
  from the presenter's outcome builder and are never restated in the component).
- **The runner's own loader and action remain untested**, unchanged from ADR
  0060's consequence: the route test stubs both, and the server modules
  underneath them carry the coverage.

## Alternatives considered

- **Keep ADR 0060 §1's row and add the circles beside it.** Rejected. Two ways
  to log the same set is two sources of truth on the surface with the least
  attention, and the row's presence would make the tap the shortcut rather than
  the way.
- **A long-press on a circle opens a load field.** Rejected for this ticket, not
  declined. A hidden gesture on the one control an athlete uses mid-set is a
  gesture they will trigger by accident with a sweaty thumb, and a load editor
  is worth a visible affordance (§2).
- **Round the prescription to what the gym can make, and log that.** Rejected.
  ADR 0060 §2 keeps loadability and progression independent; folding the plate
  solver's answer into the posted number would make the program's stored weight
  drift by whatever rack the athlete stood in front of.
- **Infer the off-program weight from the reps.** Rejected. There is no
  inference from "four reps" to "he came down 2.5 kg", and inventing one would
  write a number nobody observed into the column §2 is already uneasy about.
- **A per-set kg stepper (`−2.5 / +2.5`) under each circle.** Rejected. It is
  the load input again at two taps' remove, it doubles the card's height, and it
  puts a control the athlete uses once per session in the path of the one they
  use twenty-five times.
- **Say nothing about the missing off-program weight.** Rejected. It is the one
  thing this design takes away, and an ADR that states a grid without stating
  its cost is a decision record that cannot be reviewed.
