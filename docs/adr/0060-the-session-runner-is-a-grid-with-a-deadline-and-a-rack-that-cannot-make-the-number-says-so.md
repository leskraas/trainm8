# The session runner is a grid with a deadline, and a rack that cannot make the number says so

Status: Accepted

Slice 5 of [`strength-module.md`](../specs/strength-module.md), stage 4 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-tracker-surfaces.md`](../research/strength-tracker-surfaces.md) §3.6,
§3.7, §3.8, §5;
[`strength-program-stronglifts-and-kin.md`](../research/strength-program-stronglifts-and-kin.md)
§2.6, §3.1, §3.2, §3.3.

**Closes two of
[ADR 0056](./0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)'s
stated absences** — the plate calculator, which it recorded as not built for
want of a gym, and `WorkoutSession.status` saying `scheduled` on a fully logged
session. **Confirms ADR 0056 §4** — ADR 0027 governs the prescription and stops
at the log — and **ADR 0056 §5** on the Set Ghost. **Confirms
[ADR 0027](./0027-text-first-workout-authoring.md)** and
**[ADR 0028](./0028-mobile-first-ui-standard.md)**, the latter as necessary and
demonstrably insufficient. **Consumes
[ADR 0059](./0059-a-program-is-outcome-indexed-and-its-progression-rule-lives-on-the-lift.md)**
— finishing a session is what advances a program.

## Context

ADR 0056 shipped an **editing grid**: a surface for a session you already know
how to do. StrongLifts' surface is a **run** — today's workout resolved at the
moment you open it, a generated warm-up ramp, plate math under the weight input,
an outcome-aware rest timer, and a post-session line that says what you lift
next time and why.

That last part is what makes it a product rather than a form. It is also the
surface with the least attention available anywhere in the app: one thumb,
twenty seconds after a heavy set, phone at arm's length. #434's verdict — _"too
much text, the flow and design is too hard to follow"_ — was delivered about a
4,283-line screen with 24 explanatory prose spans, and ADR 0028 was already in
force when that shipped. The standard was necessary and it was not sufficient.

## Decision

### 1. ADR 0027 governs the prescription and stops at the log — restated, because this is where it would break

`5 × 5 @ 100 kg · 3 min rest` reads well on the couch. It is the **worst
possible shape** for writing one number at a time in a gym: every edit is a
popover, the numbers do not align into columns, and the set-by-set diff against
last time is invisible.

> **The Token Sentence renders the prescription. The set grid records the
> performance. They are the same rows in two modes.**

Render-never-parse is untouched: the sentence stays a pure function of
structure, and the grid parses nothing — it posts typed fields to an action.

**Three controls per row** — load, reps, ✓ — with reps in reserve, the other
side of a unilateral set, to-failure and abandoned all behind the row's own
control. Asking for all of it on every set is how a logger becomes a chore.

**One scroll.** Exercises stacked, sets as rows. The screen states are what the
athlete's attention is on, not navigation:

```
pre-session ──open──▶ warm-up ──▶ working sets ⇄ rest ──finish──▶ outcome
     │                                    ▲   │
     └─ cursor resolved, loads resolved   └───┘  (rest never blocks logging)
```

Never a wizard step per exercise and never a modal per set.

### 2. The plate calculator is a bounded knapsack against a Plate Inventory, and no gym means no plate line

ADR 0056 recorded the calculator as not built because _"it needs a per-athlete
plate inventory to be anything but a lie about what the gym owns."_ So the
inventory ships first: bars, a bounded `{ weightKg, count }[]` plate list where
the count is **pairs owned**, and an optional fixed-dumbbell list.

**The maths is trivial and the model is not.** Six properties, each of which is
a different exercise being a different thing:

- **`multiplier`** — plates are consumed `multiplier` at a time; a barbell is 2,
  a single-horn machine is 1. This is also why the smallest achievable increment
  on a bar is `2 × smallestPlate`.
- **Bounded, not greedy.** Greedy descent fails at 140 kg on a gym with two 20s
  a side — it takes both 20s and then has nothing to finish with. The solver is
  a bounded knapsack over **integer-scaled** values, because 2.5 kg plates plus
  a 0.5 kg microplate are exactly what breaks float accumulation. Ties break
  **lighter**, never rounding a lifter up.
- **`isFixed`** — a dumbbell rack is "largest available ≤ target", falling back
  to the lightest, always with a signed gap.
- **`isAssisting`** — the sign belongs to the equipment, never to the number the
  athlete typed. More assist is _less_ work.
- **`useBodyweightForBar`** — a bodyweight movement's "bar" is the athlete, so
  the plate solver becomes an added-load calculator with **no second code
  path**.
- **`round(w) = calculatePlates(w).totalWeight`** — rounding _is_ the solver run
  backwards, which is what makes a percentage-derived load always a loadable
  one.

**A rack that cannot make the number says so.** Seven named refusals, each with
its own sentence, and an `outcome` of `exact | nearest | unavailable`. The line
reads `20 · 20 · 10 · 2.5 · Your gym makes 100 kg, not 102.5 kg.`

**Loadability and progression are independent**, verbatim from the reference
product: _"If your increments are set to 5lb, then the weight will increase by
5lb regardless of your plate setup."_ ADR 0059's engine emits the arithmetic
next weight and does no plate rounding; loadability is a separate module and a
separate line.

**Where the athlete has described no gym there is no plate line at all** — not a
default rack, not an assumed 20 kg bar. The absence, plus one link behind the
exercise name: _"Tell us what your gym has."_ There is no seeded default
inventory, and a corrupt JSON column returns null rather than a guessed rack.

On the phone it is a **passive annotation, not a screen**: under the weight
input, muted, updating as you type.

### 3. Warm-up generation is a plate-aligned ramp, and the published cap is not claimed

Two empty-bar fives, then rungs snapped through the plate solver, generated from
the **heaviest resolved working set** so the ramp serves the session rather than
its first row. A rung the rack cannot distinguish from its neighbour is
**dropped**, never repeated.

Set count scales with the **work weight**, not with the lifter.

The vendor publishes a 45 lb jump cap and **its own worked example violates it
on two of four jumps.** So the implemented mechanism is the plate-aligned ramp
and **the cap is not claimed in copy anywhere** — the constant that counts rungs
carries the warning in place. Reproducing a rule the publisher does not follow
would be asserting something nobody actually does.

Generated rows are written with `role: 'warmup'`, which is the one flag that
keeps them out of every aggregate (ADR 0056 §6, ADR 0058 §7) — and, per ADR
0059, out of the program's success predicate. **Unlike the reference product the
ramp is editable**, a deliberate departure: it is today's prescription, not a
ghost, so its inputs open pre-filled.

### 4. Rest is prescribed data, and the timer is a deadline that never blocks the next set

Rest is the third thing the state machine writes, alongside load and rep target:
**3 minutes after a set that met its target, 5 minutes after one that did not**,
none between warm-up rungs, 3 minutes before the last rung. "Missed" is read off
the typed reps — there is no separate failed flag, per ADR 0056 §6. A prescribed
`restBetweenSetsSec` governs a made set; a missed set takes the longer of the
prescription and 300 s, and the 5:3 ratio is deliberately **not** used as a
coefficient on somebody's authored rest.

The timer is a **wall-clock deadline**, not a decremented counter: the interval
only forces a re-render and the remaining time is recomputed from the clock each
tick. A locked phone is therefore safe, and an overrun renders as `+m:ss` rather
than as zero.

It is a **persistent bar that never blocks logging** — asserted by test: the
next set's control stays enabled while it runs. It auto-starts on set
completion, because a timer you have to start is a timer you forget; it adjusts
±15 s in one tap; and it records the rest **actually taken** in the shipped
`restTakenSec`, so _"your rest is creeping up"_ is knowable at all.

### 5. Every set persists as it is completed, and there is no save button

The athlete already did the work. A lost session is a much worse failure than a
bad import, and the between-sets double-tap is why the save is an upsert on
`(sessionId, stepId, orderIndex)` — ADR 0056 §2, unchanged. The runner writes
through that shipped path and adds nothing to `ExerciseSetLog`.

### 6. Finishing is an explicit act, and it reconciles `status` by direction

ADR 0056 left `WorkoutSession.status` saying `scheduled` on a fully logged
session, deliberately, and named the reconciliation as this slice's job. It is
resolved **by direction rather than by a second source of truth**:

- Finishing is an **explicit athlete act** — a button, an `intent`, never an
  inference — and it writes `status: 'completed'`.
- **Every strength aggregate continues to read logged working sets and never
  `status`.** Verified: the only writer of `status` in strength code is this one
  update.
- **Finishing with no logged working set is refused**, in those words: _"Log a
  working set first — there is nothing to finish yet."_ A warm-up alone is not a
  finished session.

The column is calendar and list state; **the sets are the truth**; neither is
derived from the other, and they cannot disagree about anything that matters.

Finishing is also what runs ADR 0059's fold, and the ordering is deliberate: the
program advance is transactional, and the `status` write follows it.

### 7. A Stall Cut renders as a notice that offers nothing

Per lift: incremented, repeated, stalled — each with its reason in the lift's
own numbers, under the heading _"What you lift next time"_. A stalled lift and a
Stall Response the app could not apply are both marked as notices and rendered
as `role="status"` regions containing **no button, no link and no input** —
asserted by test, alongside an assertion that the word "deload" never appears
(ADR 0056 §8's naming, ADR 0059 §4's vocabulary).

The copy is the Load Recompute Notice shape one level down: one-time, explained,
never an offer.

> **Stall Cut: Back squat 100 kg → 90 kg.** You missed this lift three sessions
> in a row.

…with the program's own provenance note beside it, because per ADR 0059 §7 the
10 % is a convention with no trial behind it and the athlete is entitled to read
that next to a 10 kg drop in their squat.

### 8. No stored number moves

The runner writes only what the athlete typed, through ADR 0056's shipped save
path. The one new table is `PlateInventory`, which ships empty. No existing
column is read and rewritten with a different value. **No Load Recompute Notice
is owed** — except in the sense that §7 _is_ one, for the only number this slice
can move, which is a program's working weight, and it is announced every time.

## Considered options

- **A greedy plate descent, with no inventory.** Rejected — §2, and ADR 0056
  already rejected shipping the calculator at all for this reason. It fails on a
  real gym's most ordinary bar load and does so silently.
- **A default plate inventory, so everyone gets a plate line.** Rejected — §2.
  It is a lie about what the gym owns, dressed as a helpful default, and the
  athlete cannot tell which it is.
- **Claiming the 45 lb warm-up jump cap in copy.** Rejected — §3. Its own
  publisher's example violates it twice.
- **A rest timer as a decremented counter.** Rejected — §4. Backgrounding
  corrupts it, which is precisely the case a gym timer exists for.
- **A modal or blocking overlay during rest.** Rejected — §4. The next set must
  be loggable at any moment, including during rest, including after the timer
  has run out.
- **A "save workout" button.** Rejected — §5.
- **Inferring completion from the sets** (no explicit finish). Rejected — §6.
  The aggregates already read the sets; a second inference on top of them would
  be a derivation that can be wrong about a half-logged session the athlete has
  not left the gym for.
- **A `status: 'completed'` written by the save path.** Rejected, same section.
  It makes every set save a claim about the day.
- **Rendering the outcome as an offer** — _"your squat stalled; reduce by 10
  %?"_. Rejected — §7. The program decided; the app reports. An offer invites
  the athlete to overrule a rule they chose, one session at a time, until the
  program is not the program.
- **A wizard step per exercise.** Rejected — §1. It hides the session's shape
  and makes going back a navigation.

## Consequences

- **`finishStrengthSession` is idempotent.** Pressing "Finish workout" twice —
  or once after a reload — folds the log in once: `ProgramSessionApplication`
  dedupes on `(instanceId, sessionId)` in the database, inside the advancing
  transaction, and the second attempt replays the first fold's stored outcomes
  rather than appending duplicate weight and stall history. The worst-affected
  state was exactly the state ADR 0059 keeps _because it cannot be re-derived_,
  which is why the guard is a unique index and not a status check.
- **The rest timer starts optimistically.** The bar begins on submit, before the
  fetcher resolves, so a save the server rejects still starts a three-minute
  rest.
- **`restTakenSec` is session-wide, not per exercise.** The "last completed"
  moment is a single reference across all lifts, so the first working set of the
  second exercise records the gap since the last set of the first. The number is
  real and its meaning is looser than the column's name suggests.
- **The rest timer still does not survive a closed tab**, unchanged from
  ADR 0056. The copy behind the exercise name says so — _"The rest timer
  survives a locked phone, but not a closed tab."_ — and the honest fix, a
  scheduled local notification, is **not built**. Its absence is stated in code
  and not to the athlete.
- **There is no session-level default rest.** Only the per-exercise
  `WorkoutStep.restBetweenSetsSec` exists; the fallback is the published
  constant.
- **Fixed dumbbells are captured and unreachable.** The gym screen collects a
  rack, the solver implements "largest bell ≤ target" — and the grid's load-kind
  picker omits `perSide` (ADR 0061's open item) and overrides the variant's
  declared kind, so the fixed-bell path can never run on the logging surface.
  The same override lets a single-horn variant be solved as a barbell.
- **"No prose at all" is not strictly met.** Five sentences render inline: the
  two Unavailable Metric phrases (which are the honest ones and should stay),
  the plate-line nearest note, the finished-state line and the empty state.
  Everything else is a phrase. Far below #434's 24 spans, and not zero.
- **The `band` load kind renders a fourth in-row input**, breaking the
  three-controls-per-row rule for that one kind.
- **The route's own loader and action are untested.** The route test stubs both,
  so the request schema, the load coercion, the 400 copy and the
  `finish-session` branch have no direct coverage; the server modules underneath
  them do.
- **Loadability-versus-increment independence is asserted in prose in three
  headers and pinned by no test.** It holds by construction — no code path lets
  the plate solver reach a program increment — which is exactly the kind of
  invariant that holds until somebody adds a convenience.
- **The four unloggable set shapes are still unloggable** — drop sets, myo-reps,
  clusters and rest-pause — and `SET_ROLES` is still three members. ADR 0056
  deferred `segments[]` and this slice did not un-defer it.
- **Supersets, circuits and EMOM still have no container**, so their rest
  belongs to the last set. Unchanged from the prescription side, where the same
  gap exists.
- **The entry point is labelled "Log your sets", not "Start workout".** The
  surface is the run; its door still has the editing grid's name on it.
