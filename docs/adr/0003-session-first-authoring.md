# Session-first authoring in v1

The athlete creates Workout Sessions directly through a single form. Each
Workout Session owns a private Workout row 1:1. There is no reusable template
library or "save as template" in this slice.

## Considered options

- **Template-first authoring**: Build a Workout Template library, then
  schedule instances from templates. Rejected for v1 — the athlete needs to
  plan sessions immediately, and the template abstraction adds UI and schema
  complexity that is not yet needed. Templates are planned for a later slice.
- **Shared Workout rows**: Multiple Workout Sessions reference the same
  Workout. Rejected — editing one session's structure would affect all linked
  sessions. Private 1:1 avoids that coupling and simplifies the mutation
  model (replace the entire Block/Step subtree).
- **Inline structure on ScheduledSession**: Store blocks and steps directly
  on the session without a Workout model. Rejected — the Workout model
  already exists with the correct structure, and we want to reuse it when
  templates land.

## Consequences

- `createWorkoutSession` transactionally creates a Workout + ScheduledSession
  in a single call. The Workout is never shared.
- The server module and Zod schema support multi-Block from day one, even
  though the v1 UI only exposes a single anonymous Block. Subsequent slices
  unlock multi-Block and Block repetition in the UI.
- Past-dated Workout Sessions are allowed so the athlete can back-fill.
- No template library, no "save as template", no recurrence in this slice.
