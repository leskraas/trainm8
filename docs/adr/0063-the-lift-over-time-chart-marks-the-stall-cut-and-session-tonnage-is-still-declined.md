# The lift-over-time chart marks the Stall Cut, and session tonnage is still declined

Status: Accepted

The approved mobile design for the strength section
(`docs/design/strength-program-handoff/`) is high-fidelity and its captures are
the pixel-level contract. Screen `07-lift-over-time.png` lists **three** record
rows. This ADR records the one row that was not built, and the two rules the
chart above it obeys, so a future reader comparing the capture to the shipped
screen finds a decision rather than a defect.

Scope: `app/routes/training/exercises.$exerciseId.tsx` and its presenter (issue
#481, under spec #476).

## Decision

### 1. The handoff's third record row — _Best session tonnage_ — is not built

ADR 0058 §3 declines session tonnage and a logging streak as **declined, not
deferred**: tonnage (`sets × reps × kg`) rewards junk volume, and it is not even
computable across a lift whose sets are a stack level, a band or an assist. That
decision stands unchanged. The design was drawn without it in view; the design
does not supersede it.

Two records ship, and they are the two `deriveStrengthRecords` already produces
honestly: the **rep-max record** and the **estimated 1RM**, the latter naming
both its equation and the set it was read off. The screen's route test asserts
the word _tonnage_ appears nowhere, so the row cannot return by accident.

**This is a deliberate departure from an approved high-fidelity handoff**, and
it is the only one on this screen. It is recorded here rather than in the
handoff, because the handoff is a design artifact and this is an engineering
decision about what the app is allowed to claim.

### 2. The marking is a join on the stored record, never a shape read off the curve

A bar is drawn destructive because the athlete's `ProgramLiftState.stallHistory`
holds an entry whose `sessionId` **is that bar's session** — not because the
curve dipped there. The note strip under the chart
(`Session 8 — Stall Cut, 80 kg → 72.5 kg`) is generated from that same
`ChartBar`, so the coloured bar and the sentence carry one record and cannot
disagree. A stall entry naming a session outside the variant in view marks
nothing, because there is no bar it belongs to.

**Where the lift belongs to no program instance there is no working-weight
header, no marking and no note strip.** The absence is the answer: nothing
decided a weight for this lift, and a `0 kg` header would claim something did.

### 3. The chart is static, and takes `role="img"` without a Chart Inspect

ADR 0029 mounts every **interactive** chart on the **Chart Primitive**, and ADR
0030 gives that primitive three rules. This chart is not interactive — the
design specifies no tap, no tooltip and no motion — so it takes the two rules
that are about honesty and access, and none of the interaction machinery:

- **Rule 1 holds.** A session with no honest kilo draws **no bar** and carries
  an explicit `n/a` at its slot. It is never a zero bar and never a silent gap.
- **Rule 2 holds in its static half.** The bars carry one `role="img"` with a
  name that includes every marked session; the session-by-session list already
  on the page below is the full text equivalent. There is no visually-hidden
  second table, because the visible list is that table.
- **Rule 3 does not apply.** There is nothing to inspect and therefore nothing
  to dismiss. If this chart ever gains per-bar inspection it moves onto the
  Chart Primitive and takes all three rules; adopting the primitive now to draw
  twelve static rectangles would buy the contract's cost without its benefit.

## Consequences

- An athlete who has never started a program sees this screen's records and
  history and **no working weight** — which is correct, and is what the route
  test asserts.
- The estimated 1RM names its source set as _the top set of the session the
  estimate was taken in_, read off the same payload's history. `StrengthRecord`
  does not carry its own source set, so where that session is not in view the
  phrase is **absent rather than guessed**. Giving `StrengthRecord` a real
  `sourceSet` is the honest fix and is left as a gap against
  `app/utils/strength/records.ts`.
- The route reads `ProgramLiftState` directly in its loader rather than through
  `getExerciseHistoryView`. That read belongs beside the rest of the payload; it
  is one query, scoped by `instance: { userId }`, and moving it is a refactor,
  not a behaviour change.
- Nothing was migrated and nothing is stored. Every number on the screen is
  derived on read (ADR 0021), and `stallHistory` was already being written by
  the program engine (ADR 0059).

## Alternatives considered

- **Build the tonnage row to match the capture.** Rejected — it would make the
  app reward junk volume to satisfy a screenshot, and ADR 0058 §3 exists
  precisely to stop that.
- **Derive the Stall Cut from a drop in the bars.** Rejected — it would mark a
  deload, a variant change or a bad day as a Stall Cut, and the marked bar could
  then contradict the sentence under it.
- **Show `0 kg` as the working weight for a lift in no program.** Rejected — see
  §2. The absence is the honest reading.
- **Mount the chart on the Chart Primitive.** Rejected for now — see §3.
