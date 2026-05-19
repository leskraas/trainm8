# Event as a single entity covering both races and goals

The right side of The Tape is anchored by Events. One `Event` entity covers both
real races and abstract fitness goals, discriminated by
`kind: 'race' | 'time-trial' | 'fitness-goal'`. Events carry an A/B/C priority
(Friel A/B/C-race standard), a required `startDate`, an optional `endDate`
(non-null indicates a multi-day event — stage race or training camp), a
`Discipline[]` array (multiple for triathlon), an optional Event Target as a
discriminated union, and an optional `resultSessionId` pointing to the Workout
Session that executed the event.

## Considered options

- **Separate `Race` and `FitnessGoal` tables**: Rejected — they share the same
  shape (date, priority, discipline, target, status). A discriminator field is
  cleaner than parallel tables and avoids cross-table queries when displaying
  "all anchors on The Tape".
- **One row per leg for multi-discipline events (`EventLeg` child table)**:
  Rejected for v1 — adds a table with no current consumer. Triathlon names +
  preset distance lookup (Sprint / Olympic / Half / Full) cover v1. Additive
  when AI multi-sport plans need leg-level targets.
- **Separate `stage-race` and `training-camp` kinds**: Rejected —
  `endDate != null` cleanly distinguishes multi-day events, and adding kinds for
  every variant invites kind-explosion. A training camp is modeled as
  `kind: 'fitness-goal'` with a date range.
- **Separate `EventResult` row**: Rejected — Workout Session + Recording +
  Session Log + TSS already hold every result number. Event just points to the
  Session via `resultSessionId`.

## Consequences

- A `TrainingPlan` anchors to zero or more Events. A-priority Events drive the
  plan's peak and taper; B-priority becomes a light week; C is folded into the
  normal training week.
- `EventTarget` is a discriminated union:
  - `{ kind: 'time'; seconds }`
  - `{ kind: 'pace'; secPerKm }`
  - `{ kind: 'distance'; meters }`
  - `{ kind: 'placement'; position }`
  - `{ kind: 'finish' }`
  - `{ kind: 'qualitative'; description }`
- Multi-day events store an `endDate`; single-day events have a null `endDate`.
  `endDate != null` is the canonical multi-day check.
- Cancelled, DNF, and unlogged cases are handled by `status` + `resultSessionId`
  nullability:
  - cancelled → `status='cancelled'`, `resultSessionId=null`
  - DNF → `status='completed'`, `resultSessionId=session` (Recording holds the
    partial telemetry; Session Log explains)
  - completed but unlogged → `status='completed'`, `resultSessionId=null`,
    `notes` explains; promotable later
- Events render as markers on The Tape, visually distinct from Workout Session
  tiles. When `resultSessionId` is set, the marker links to that Session for
  planned-vs-actual.
- AI plan generation receives the full Event stack as context; priority drives
  taper sizing and discipline balance.
