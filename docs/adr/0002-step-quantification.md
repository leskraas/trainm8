# Step Duration XOR Step Distance

Each WorkoutStep may carry an optional Step Quantity: either a Step Duration
(in seconds) or a Step Distance (in meters), but never both. Both fields are
optional — an unquantified step is valid ("warm up until ready").

## Considered options

- **Single polymorphic field with a unit column**: Rejected — adds complexity
  for two well-known dimensions that behave differently (time is additive for
  shape width; distance is not directly comparable without pace).
- **Both fields allowed simultaneously**: Rejected — semantics are ambiguous
  ("run 5 km in 20 min" conflates quantity with target). If a future slice
  needs pace targets, that is a separate field.
- **Required quantity on every step**: Rejected — many real workouts contain
  open-ended steps ("strides on flat ground", "warm up until ready").

## Consequences

- `WorkoutStep.durationSec Int?` and `WorkoutStep.distanceM Int?` in the
  Prisma schema.
- The Zod authoring schema enforces the XOR rule: a step with both fields set
  is rejected at validation time.
- Workout Shape width uses Step Duration when present; unquantified steps
  contribute zero width.
- The detail view formats duration as friendly time ("10 min", "1 h 5 min")
  and distance with units ("400 m", "1.5 km").
