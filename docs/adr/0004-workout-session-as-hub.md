# Workout Session as narrative hub, Activity Import as inbox

The Workout Session is the unit of attention on The Tape. It optionally carries
three satellites: a Workout (planned structure), a Recording (executed
telemetry), and a Session Log (post-session reflection). Raw telemetry imported
from external providers (Strava, Garmin, manual upload) lands in a separate
Activity Import inbox, deduped by external id, and is linked to a Workout
Session via Promotion (auto-matched on import or chosen by the athlete).

## Considered options

- **Bare Model A (everything is a Workout Session)**: Rejected — most provider
  imports are not intentional training (commutes, casual walks, watch
  auto-logs). Forcing each into a Session with an empty plan is narratively
  wrong and pollutes the Tape.
- **Activity Import as the primary entity**: Rejected — Session Log and RPE
  belong to intentional training, not raw telemetry. Mixing them dilutes the
  Tape's narrative unit.
- **Three separate top-level tables (Plan, Recording, Log) with no envelope**:
  Rejected — they share the same scheduled moment in time; a wrapping entity is
  the natural narrative anchor.

## Consequences

- `WorkoutSession.workoutId` becomes nullable. A Session created from an
  Activity Import has only a Recording.
- `WorkoutSession.recordingId?` is added as a nullable FK to `ActivityImport`.
- The Tape renders Workout Sessions only. Activity Imports that have not been
  promoted contribute to load metrics (TSS) but are never Tape tiles.
- Promotion is the only path from inbox to Tape. Auto-match attempts same local
  day + same Discipline; otherwise the import stays in the inbox until the
  athlete promotes it.
- `ScheduledSession` in code is to be renamed `WorkoutSession` to align with
  this glossary; rename is mechanical and tracked separately.
