# Workout Step as a discriminated union of cardio, strength, and rest

> **Revisit — Amend.** `IntensityTarget` is missing `pacePct` and a race-pace
> kind (~⅓ of the running library — all of Canova, the whole Norwegian
> sub-threshold family — is unauthorable without them), `powerPct` silently
> means % FTP where the interval literature anchors on MAP and the
> critical-power literature on CP, one repeat level cannot express
> `3 × (13 × 30/15)`, and `rest` carrying only `durationSec` cannot express
> jog-back, a target HR or a swim send-off. `ExerciseSet` never got the union
> treatment the step got: `weightKg XOR pct1RM` plus
> `kind: reps | timed | amrap` collapses load, effort cap and termination into
> two axes, which is why Rønnestad's `10RM → 4RM` is unauthorable. See
> [`docs/research/portable-intensity-anchors.md`](../research/portable-intensity-anchors.md).

> **Confirmed by research.** The `kind: 'cardio' | 'strength' | 'rest'` axis and
> the brick-emerges-naturally claim are confirmed independently by the running,
> cycling, swimming and strength libraries; the strength mismatch is one level
> down, in `ExerciseSet`, not in the step shape. See
> [`docs/research/workouts-strength-and-other.md`](../research/workouts-strength-and-other.md).

`WorkoutStep` is a discriminated union over
`kind: 'cardio' | 'strength' | 'rest'`. Each kind has its own required and
forbidden fields. Discipline lives only on cardio steps; Workout itself has no
discipline field. Brick workouts (e.g. bike → run) emerge naturally as one
Workout with cardio steps in different disciplines. Strength steps own an
`Exercise` FK and a 1:N `ExerciseSet` child relation. Intensity Target is stored
on the step as a discriminated union (authored form) plus cached numeric ranges
(resolved form) for queryable comparison against Recording telemetry.

## Considered options

- **Polymorphic single shape (every field nullable, conditional logic in
  code)**: Rejected — type safety collapses, validation drowns in conditionals,
  and AI generation has no structured schema to follow.
- **Separate tables per kind (CardioStep, StrengthStep, RestStep)**: Rejected —
  Prisma Pattern 4 (single table + kind discriminator + nullable per-kind
  columns) gives the same correctness with simpler joins and ordering across
  kinds within a Block.
- **Discipline on Workout (one discipline per workout)**: Rejected — brick
  workouts and strength-and-conditioning sessions need to mix disciplines within
  one Workout. Putting Discipline on cardio steps lets multi-modal workouts
  emerge naturally.
- **Free-text intensity ("zone 2", "RPE 7")**: Rejected — AI generation,
  Recording comparison, and load math all need structured numbers.

## Consequences

- `WorkoutStep` table has a `kind` discriminator column, nullable per-kind
  columns (`discipline`, `exerciseId`, `durationSec`, `distanceM`, etc.), JSON
  for the authored Intensity Target, and flat columns for the resolved range
  (`intensityHrMin/Max`, `intensityPowerMin/Max`, `intensityPaceMin/Max`).
- Resolved ranges are recomputed by a background job when athlete thresholds
  change.
- `ExerciseSet` is a 1:N child with its own discriminator
  (`reps | timed | amrap`) and `weightKg` XOR `pct1RM`.
- `Exercise` is a catalog FK. ~50–100 seed entries ship in migration; athletes
  may add private custom Exercises via `createdByAthleteId`. AI is bound to the
  catalog visible to that athlete and never invents Exercise names in prose.
- App-layer invariants enforced by Zod:
  - `cardio` → discipline required, exerciseId null, sets empty
  - `strength` → exerciseId required, sets non-empty, step intensity null
    (intensity lives on each ExerciseSet)
  - `rest` → only `durationSec` and `notes` may be set
- Migration: existing free-text `description` is demoted to `notes`; strength
  rows receive a placeholder Exercise + "needs structure" flag; intensity
  strings become `{ kind: 'zoneLabel', label }`.
