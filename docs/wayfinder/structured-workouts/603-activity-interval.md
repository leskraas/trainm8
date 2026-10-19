# The Activity Interval: the decided model

The resolution asset for the ticket *Decide the Activity Interval model* (#603)
on the map *structured workouts everywhere* (#600). It was decided with the
owner on 2026-10-19; the owner asked the agent to answer what the code can
answer, and put four choices to them (Q1–Q4 below, all accepted). Code
references are to `4c49609`.

## In one paragraph

An **Activity Interval** is one stretch of a recording with what was measured
over it, and with who drew its edges. Intervals live in one table,
`ActivityInterval`, many per `ActivityImport`, cascade-deleted with it. Each row
belongs to one of three **layers**: `device` (the laps the watch or provider
recorded), `engine` (what Structure Detection found) and `athlete` (the
athlete's edits). The reading uses the highest layer that has rows. Nothing
about the plan is stored on an interval; the mapping to planned steps is
computed when the reading is made. A recording with no rows in any layer still
reads as one whole-session interval, built by the reader from the import's own
summary.

## 1. Layers, and which one the reading uses

| Layer | Edges drawn by | Written by | Rewritten when |
|---|---|---|---|
| `device` | the watch or provider | ingest: every lap from FIT, intervals.icu, Strava, TCX | the import is re-read: a mirror refresh (ADR 0049), or the zero-I/O backfill (§7) |
| `engine` | Structure Detection | the detect job, in the same transaction as the `WorkoutDetection` upsert or delete | every detection run (engine bump, threshold fix, lap backfill, redetect) |
| `athlete` | the athlete | the first interval edit, as a **full copy** of the layer the athlete was looking at | only by the athlete. "Revert to detected" deletes the layer |

**Read precedence:** `athlete` → `engine` → the `device` rows that are
workout-step laps (`lapTrigger = 'workout-step'`) → the whole-session interval.
Untyped device laps (auto-km, manual, time) are kept as measured facts and fed
to the engine, but are never read as the session's structure on their own.

This is the base + overlay of `interval-detection-and-data-platform.md` §1.5 in
the form ADR 0033/#460 already uses for Workouts (ADR 0051 §5): never edit what
the machine wrote; keep it and put the athlete's version beside it.
Re-detection never touches an athlete layer, and every athlete layer next to
its engine layer is a labelled correction for calibrating the detector.

**`ActivityImport.lapsJson` retires.** Laps become `device` rows and the engine
reads them. That removes the TCX shape bug (#612 fixes it today; the new model
cannot have it) and the list of lap fields dropped at ingest (#604 §1.4, §2, §3).

## 2. Columns

```prisma
model ActivityInterval {
  id               String   @id @default(cuid())
  activityImportId String
  activityImport   ActivityImport @relation(fields: [activityImportId], references: [id], onDelete: Cascade)

  layer      String   // 'device' | 'engine' | 'athlete'
  orderIndex Int      // within the layer
  startSec   Float    // on the stream's time axis
  endSec     Float
  movingSec  Float?

  // Where the edges came from
  origin           String   // 'lap' | 'detected' | 'athlete'
  lapTrigger       String?  // 'workout-step' | 'manual' | 'time' | 'distance' | 'position' | 'session-end' | 'equipment'
  lapIndex         Int?     // position in the source's lap list
  deviceStepIndex  Int?     // FIT lap.wkt_step_index: a fact about the file, not a link to our plan
  deviceRepetition Int?     // FIT lap.repetition_num, when the watch fills it
  providerType     String?  // intervals.icu 'WORK' | 'RECOVERY', kept as raw input
  engineVersion    String?  // engine rows only

  // What it was for, when someone may say so (§4)
  role String?             // 'warm-up' | 'work' | 'recovery' | 'cool-down' | 'steady'

  // Repeat groups (engine and athlete rows)
  groupIndex  Int?
  repIndex    Int?
  seriesIndex Int?

  // Measured over [startSec, endSec]; null = not measured, never zero
  distanceM   Float?
  avgHr       Float?
  maxHr       Float?
  avgPowerW   Float?
  maxPowerW   Float?
  npW         Float?
  avgSpeedMps Float?
  avgCadence  Float?
  ascentM     Float?
  statsSource String   // 'device' | 'provider' | 'stream'

  @@unique([activityImportId, layer, orderIndex])
  @@index([activityImportId])
}
```

- **Speed is stored, not pace.** It is distance ÷ moving time when both are
  known, else the stream's mean *speed*, never a mean of sec/km. The reader
  converts it to pace in one place (#602 invariant 7), so swim's per-100 m
  can't be read as per km.
- **No zone is stored.** It is display-derived through the current recipe
  (ADR 0035), by the reader's one placement function (#602 invariant 5).
- **No planned link is stored** (Q1, §5).
- Within a layer the rows are sequential and non-overlapping, as FIT requires of
  laps. Gaps (a pause the source didn't lap) are allowed.

## 3. Where the stats come from

1. **The interval's edges are a device or provider lap** → that lap's own
   figures (`statsSource: 'device'` for FIT/TCX/Strava laps, `'provider'` for
   intervals.icu intervals). FIT and intervals.icu compute them at full rate,
   which no stored stream can match. An engine row whose edges equal a lap
   copies that lap's figures.
2. **Otherwise** → computed from the best stream the job has
   (`statsSource: 'stream'`). Today that is the stored ≥5 s stream. Whether a
   finer analysis stream exists is *Do short reps need a full-resolution
   stream?* (#610), and nothing in this model changes either way.
3. Gaps in the device figures are filled from the stream field by field, and
   `statsSource` names where the edges' figures came from.
4. **Normalised Power** is stored from a device, or computed only for intervals
   of at least 10 minutes (the 30 s window must be ≤5 % of the interval;
   research §1.4). Shorter intervals keep the device's figure or none.

## 4. Roles and the gates

- **Below the ADR 0033 gate** there are no engine rows. The reading is the
  device's workout-step laps if any, else the whole-session interval, and its
  roles are `below-gate` (#602 invariant 12).
- **A role is set only** on engine rows that cleared the gate, on FIT
  workout-step laps (from `lap.intensity`: `warmup` → warm-up, `cooldown` →
  cool-down, `active`/`interval` → work, `rest`/`recovery` → recovery, `other` →
  none), and on athlete rows.
- **intervals.icu WORK/RECOVERY and TCX Active/Resting are never a role.** The
  first can come from a Garmin step lap or from intervals.icu's own detection,
  and the DTO can't tell which (#604 §2). It stays as `providerType` for the
  engine to weigh (#609).
- **`other`** gets device rows (FIT writes laps for any sport) and no engine
  rows. Its zones read `not-applicable`.
- **Swim** gets device rows from FIT laps today. Lengths and their structure are
  the ticket *Read pool swims as sets and lengths*.

## 5. The plan is mapped when the reading is made (Q1)

The map's first charting decision is that storage holds only what was authored
or measured. A FIT `wkt_step_index` indexes the file's own `workout_step` list,
not our `WorkoutStep` ids, so turning it into a `StepKey` is already an
inference. A stored `plannedStepId` would also dangle after every plan edit or
`copyWorkout`, and then read as unplanned. So:

- the interval stores the device's facts: `deviceStepIndex`, `deviceRepetition`;
- `readRecording(intervals, thresholds, plan?)` computes each interval's
  `StepKey` from them and the plan. *Map what was done onto what was planned*
  (#608) decides how, no longer whether it is stored;
- an athlete saying "this was rep 4" may later be stored as an athlete-layer
  override. That is the editing ticket's call.

`ExerciseSetLog`'s `stepId` (SET NULL) link is therefore **not** copied: a set
log is authored against a step by the athlete; an interval is not. Strength
stays in `ExerciseSetLog`.

## 6. The whole-session interval lives in the reader (Q2)

`ActivityImport` already holds the whole session, measured: duration, distance,
HR, power, NP, cadence, ascent, pace. A stored whole-session row would copy
those, and the two copies could drift when a source update refreshes one. So
`readRecording`, given no rows in any layer, builds the one role-less interval
from the import's summary. The guarantee that every recording reads as at least
one interval holds for every recording, `other` without a stream included.

## 7. Lifecycle

- **Ingest** writes the device layer. A refresh of an Auto-Save Mirror rewrites
  it (ADR 0049).
- **The detect job** replaces the engine layer in the transaction that upserts or
  deletes `WorkoutDetection`. The detection backfill's stale-`engineVersion`
  rule therefore reaches intervals with no new job.
- **Device and engine rows don't end the Auto-Save Mirror.** They are telemetry,
  like the stream. **Athlete rows do (Q3):** an interval edit is the athlete
  building on the import, so `isAutoSaveMirror` (`activity-import.server.ts:224`)
  also requires no athlete layer, and a source-side update no longer rebuilds it.
- **Zero-I/O device backfill, promoted recordings included (Q4).** Re-parsing
  our own copy of the original file (FIT `ActivityFile.bytes`, TCX
  `rawJson.fileContent`) writes typed device rows for any recording, promoted or
  not. ADR 0012's freeze protects history from the *source* changing it, and a
  re-read of the same file changes nothing at the source. Fetching again from the
  Strava or intervals.icu API stays a mirror-only refresh, as today. This answers
  the fog item about backfilling promoted recordings' typed laps.
- **Rides with the Recording on disconnect** and survives source-side delete of a
  promoted import (ADR 0012), like the stream and the detection.

## 8. What stays and what goes

| Today | Becomes |
|---|---|
| `ActivityImport.lapsJson` | **Retires**: device rows |
| `WorkoutDetection` (confidence, engine version, computed-at) | **Stays**: the detection header |
| `WorkoutDetection.structureJson` | **Stays** as the plan-blind summary Structure Adherence and materialization read; once detection v3 emits every rep (#609) it is written as a fold of the engine rows |
| `materializeDetectedStructure`, `replace…`, `dematerialize…` and the `recorded` ⇄ `detected` CAS | **Stay** (charting decision 3) |
| `ActivityImport.phaseBarsJson` | **Stays**: it is the done time per HR zone that week volumes read (`week-volumes.ts:331`), not structure |

## 9. Source terms (ADR 0098)

Nothing is stored per row. An interval's binding set is its import's: the
`originPlatform` plus each alias's. Athlete rows keep that binding set, because
their figures are still measured from the vendor's data.

## 10. ADR text

- **ADR 0032**, amended: Structure Detection gains a sibling entity, the
  Activity Interval, in three layers; the engine writes the engine layer beside
  the detection; `lapsJson` retires into the device layer.
- **ADR 0049**, amended: device and engine intervals don't end the Auto-Save
  Mirror; an athlete layer does.
- **ADR 0012** is read, not amended: a re-read of a kept original file is not a
  source-side change (§7).

## Handed on

- **Map what was done onto what was planned (#608):** the mapping is computed
  when the reading is made, from `deviceStepIndex`/`deviceRepetition`,
  `providerType`, edges and figures. Nothing about the plan is stored.
- **Decide what detection v3 changes (#609):** the engine reads device rows,
  not `lapsJson`, and writes the engine layer; `providerType` is input.
- **Do short reps need a full-resolution stream? (#610):** only `statsSource:
  'stream'` rows depend on its answer.
- **New: Read pool swims as sets and lengths.** Laps over lengths, idle lengths as
  rest, in the layers above.
- **New: How the athlete edits intervals.** Merge, split, add, rename, the
  "this was rep 4" override, and whether an interval edit touches the detected
  Workout.
