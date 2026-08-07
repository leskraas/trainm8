# Session-first authoring in v1

> **Revisit — Amend.** The 1:1 decision is correct and unaffected, but the
> template library deferred in the same breath is now the binding constraint: an
> archetype vocabulary with no catalogue to filter is a dropdown, not a feature.
> The running library reaches that independently (`workouts-running.md` §13.1)
> and wants the seeded rows as templates precisely so a rebuilt generation
> becomes retrieval-and-substitute over a cited corpus rather than free
> invention. This ADR's own text anticipated it — _"we want to reuse it when
> templates land"_. One claim has also narrowed: "the Workout is never shared"
> is a policy, not a model constraint. `Workout.sessions` is one-to-many, and
> ADR 0044 §6's `WeekPatternDay.workoutId` already makes a Workout a referenced
> _shape_ that stamping deep-copies per session — reference-and-copy, which is
> the template relationship arriving without the template. See
> [`docs/research/workout-taxonomy.md`](../research/workout-taxonomy.md).

The athlete creates Workout Sessions directly through a single form. Each
Workout Session owns a private Workout row 1:1. There is no reusable template
library or "save as template" in this slice.

## Considered options

- **Template-first authoring**: Build a Workout Template library, then schedule
  instances from templates. Rejected for v1 — the athlete needs to plan sessions
  immediately, and the template abstraction adds UI and schema complexity that
  is not yet needed. Templates are planned for a later slice.
- **Shared Workout rows**: Multiple Workout Sessions reference the same Workout.
  Rejected — editing one session's structure would affect all linked sessions.
  Private 1:1 avoids that coupling and simplifies the mutation model (replace
  the entire Block/Step subtree).
- **Inline structure on WorkoutSession**: Store blocks and steps directly on the
  session without a Workout model. Rejected — the Workout model already exists
  with the correct structure, and we want to reuse it when templates land.

## Consequences

- `createWorkoutSession` transactionally creates a Workout + WorkoutSession in a
  single call. The Workout is never shared.
- The server module and Zod schema support multi-Block from day one, even though
  the v1 UI only exposes a single anonymous Block. Subsequent slices unlock
  multi-Block and Block repetition in the UI.
- Past-dated Workout Sessions are allowed so the athlete can back-fill.
- No template library, no "save as template", no recurrence in this slice.
