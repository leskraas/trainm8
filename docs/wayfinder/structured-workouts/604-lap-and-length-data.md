# What lap and length data each source really gives us

Research for wayfinder ticket #604 (map #600, _Structured workouts everywhere_).
Written 2026-10-19 against `origin/main` at `b0e81ba`. This note supersedes the
FIT section of `docs/wayfinder/workout-auto-analysis/provider-lap-data.md`
(#328), which said FIT laps were forward-only. Since #547/#556, FIT laps are
read at ingest and the original bytes are kept.

Each claim is tagged with where it comes from:

- **[SDK]**: the installed `@garmin/fitsdk` 21.208.0
  (`node_modules/@garmin/fitsdk/src/types/mesgs.d.ts`, `profile.js`), which is
  generated from the FIT Profile.
- **[FITDOC]**: the Garmin FIT SDK articles.
- **[ICU]**: the live intervals.icu OpenAPI spec
  (`https://intervals.icu/api/v1/docs`, fetched 2026-10-19).
- **[STRAVA]**: Strava's swagger model
  (`https://developers.strava.com/swagger/lap.json`).
- **[TCX]**: `TrainingCenterDatabasev2.xsd`.
- **[REPO]**: `file:line` in this repo.
- **[SEED]**: counted from `prisma/seed-data/*.json`.

**Unverified** marks anything that no primary source here settles.

## Answer in one screen

| Source                                                  | Lap edges                                                       | Step identity                                                     | Lap role                                                                                                                               | Per-lap aggregates                                                                                                                                                                                 | Swim lengths                                                                                                                                                           | Backfill for history                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIT** (upload, intervals.icu harvest, direct vendors) | yes, `start_time` + `total_elapsed_time`                        | **`wkt_step_index`** → `workout_step` messages in the same file   | **`intensity`** (active/rest/warmup/cooldown/recovery/interval/other) and **`lap_trigger`** (incl. `fitness_equipment`, `session_end`) | avg/max HR, `avg_power`, **`normalized_power`**, distance, speed, cadence, `total_work`                                                                                                            | **`length` messages** (`length_type` idle/active, stroke, strokes, speed), plus `num_lengths`/`first_length_index` on the lap and `pool_length` on the session/workout | **Yes, where `ActivityFile` bytes exist**: every intervals.icu import (FIT harvest) and every FIT ingested since 2026-10-13. Not for FIT uploads before that. |
| **intervals.icu** `/activity/{id}/intervals`            | yes, `start_time`/`end_time` in elapsed seconds                 | no step index; `label` and `group_id` only                        | **`type` WORK \| RECOVERY**                                                                                                            | ~80 aggregates per interval (`average_watts`, `weighted_average_watts`, `average_heartrate`, `average_speed`, `gap`, `zone`, `training_load`, …) and the same per `icu_groups` entry, plus `count` | none in this DTO (Activity has `lengths`, `pool_length`)                                                                                                               | Yes (one call per activity, 5,000/day per key); already done by `intervalsicu-laps-backfill`, but only edges are kept                                         |
| **Strava** `/activities/{id}/laps`                      | yes, `start_index`/`end_index` or `start_date` + `elapsed_time` | none                                                              | **none (no trigger, no intensity)**                                                                                                    | documented: distance, elapsed/moving time, avg/max speed, avg cadence, elevation gain, `pace_zone`                                                                                                 | none                                                                                                                                                                   | Yes but expensive (1 read call per activity on the Strava budget); already done for unpromoted run/bike by `strava-laps-backfill`                             |
| **TCX**                                                 | yes, `Lap@StartTime` + `TotalTimeSeconds`                       | none                                                              | `TriggerMethod` (Manual/Distance/Location/Time/HeartRate) and `Intensity` (**Active/Resting only**)                                    | avg/max HR, cadence, distance, max speed; watts only via the LX extension                                                                                                                          | none                                                                                                                                                                   | Yes, free: full XML is in `rawJson`                                                                                                                           |
| **COROS / Polar FIT**                                   | yes (any FIT has laps)                                          | **Unverified** whether they write `wkt_step_index`/`workout_step` | **Unverified**                                                                                                                         | as FIT                                                                                                                                                                                             | as FIT                                                                                                                                                                 | as FIT                                                                                                                                                        |

Three facts change the plan:

1. **Device laps for intervals.icu imports are already in the database**, as FIT
   bytes in `ActivityFile`. Today we use intervals.icu's own intervals as the
   edges and leave the device laps unread.
2. **Only FIT says which planned step a lap was.** It does this with
   `wkt_step_index` plus the embedded `workout_step` list. intervals.icu says
   WORK or RECOVERY. Strava says nothing, and TCX says only Active or Resting.
3. **The TCX lap shape is stored in a form the detector cannot parse.** Those
   laps are silently dropped today (details below).

---

## 1. FIT

### 1.1 Lap message (global #19, `messages.lapMesgs`) [SDK]

| Field (num)                                                                                                                                                                                      | SDK name / type                                                                                                                                       | Notes                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 2 `start_time`, 7 `total_elapsed_time` (s, /1000), 8 `total_timer_time`                                                                                                                          | `startTime`, `totalElapsedTime`, `totalTimerTime`                                                                                                     | Required on every summary message [FITDOC]                                                                      |
| 23 `intensity`                                                                                                                                                                                   | `Intensity`: `active(0) rest(1) warmup(2) cooldown(3) recovery(4) interval(5) other(6)`                                                               | The same enum as `workout_step.intensity`                                                                       |
| 24 `lap_trigger`                                                                                                                                                                                 | `LapTrigger`: `manual(0) time(1) distance(2) positionStart(3) positionLap(4) positionWaypoint(5) positionMarked(6) sessionEnd(7) fitnessEquipment(8)` | There is **no "workout step" trigger value**. A step lap is recognised by `wkt_step_index`, not by the trigger. |
| 71 `wkt_step_index`                                                                                                                                                                              | `wktStepIndex: MessageIndex`                                                                                                                          | Index into the file's `workout_step` list                                                                       |
| 61 `repetition_num`                                                                                                                                                                              | `repetitionNum: Uint16`                                                                                                                               | Present in the profile; whether watches fill it for repeat reps is **unverified**                               |
| 15/16 HR, 19 `avg_power`, 20 `max_power`, **33 `normalized_power`**, 41 `total_work` (J), 9 `total_distance` (m, /100), 110 `enhanced_avg_speed`, 17 `avg_cadence`, 99 `time_in_power_zone[]`, … |                                                                                                                                                       | Per-lap aggregates come straight from the device                                                                |
| **32 `num_lengths`, 35 `first_length_index`, 40 `num_active_lengths`, 38 `swim_stroke`, 37 `avg_stroke_distance`**                                                                               |                                                                                                                                                       | Swim: a lap groups a contiguous run of `length` messages                                                        |

From the FIT docs [FITDOC, Activity File page]:

> "Lap messages should be sequential and non-overlapping, and the sum of the
> total elapsed time and distance values for all Lap messages should equal the
> total elapsed time and distance for the corresponding Session message."

> "When performing a workout during an activity, the device will typically
> include a Lap message for each workout step completed, and the Lap message's
> Workout Step Index field will contain the index in to the list of Workout Step
> messages associated with the lap."

### 1.2 `workout` (#26) and `workout_step` (#27) inside activity files [SDK, FITDOC]

> "An Activity file may contain Workout and Workout Step messages describing the
> structured training associated with the activity. An Activity file should
> contain a maximum of one Workout message."

- `workout`: `wkt_name`, `sport`/`sub_sport`, `num_valid_steps`, **`pool_length`
  (14, m /100)** and `pool_length_unit`, `wkt_description`.
- `workout_step`: `message_index` (0-based, unique, `[0, num_valid_steps-1]`),
  `wkt_step_name`, `duration_type`/`duration_value`,
  `target_type`/`target_value`, `custom_target_value_low/high`, **`intensity`**,
  `notes`, `secondary_target_type`, and so on. A repeat step has
  `duration_type = repeat_until_steps_cmplt`, `duration_step` (the index it
  loops back to) and `repeat_steps` (the count) [FITDOC Workout File].
- The SDK also defines `workout_session` (#158) for multisport workouts.

The consequence is that a Garmin FIT of an executed structured workout carries
**both the plan and the per-step actuals**. A lap's `wkt_step_index` names the
step, the step names its target, and repeats make the same index recur. That
recurrence is inferred from the repeat semantics plus the seed lap counts in §6.
It is **unverified on a real file in-repo**, because the fixtures in
`tests/fixtures/fit/*` are synthetic and have no
`workout`/`workout_step`/`length` messages, and no lap carries `lap_trigger`,
`intensity` or `wkt_step_index` (checked by decoding them).

### 1.3 `length` messages (#101, `messages.lengthMesgs`) [SDK, FITDOC]

- Fields: `start_time`, `total_elapsed_time`, `total_timer_time`,
  `total_strokes`, `avg_speed` (m/s, /1000), `swim_stroke`
  (freestyle/backstroke/breaststroke/butterfly/drill/mixed/im/…),
  `avg_swimming_cadence`, **`length_type`: `idle(0)` | `active(1)`** (required
  [FITDOC]).
- **Pool length is not on the length message.** From the cookbook: "The length
  of the pool is a constant and is stored in the Session message. It is implied
  that the distance represented by each Length message is the value of the
  pool_length field in the Session message." Session fields are `pool_length`
  (44, m /100) and `pool_length_unit` (46, metric/statute), plus `num_lengths`
  and `num_active_lengths`. The workout message carries its own `pool_length`
  too.
- "Length messages are also used to track idle periods between active sets. Lap
  messages are used to group sets of active and idle Length messages" [FITDOC,
  Encoding Pool Swim Activities]. So a pool swim's structure is the **laps
  (sets) over lengths (reps)**, with idle lengths as rest. This needs no stream.

### 1.4 What `app/utils/fit-parser.server.ts` reads today [REPO]

- `parseFit` decodes everything (`messages` includes `lapMesgs`, `lengthMesgs`,
  `workoutMesgs`, `workoutStepMesgs` whenever the file has them). It reads
  `sessionMesgs`, `recordMesgs`, `lapMesgs`, `fileIdMesgs`, `deviceInfoMesgs`
  and `fieldDescriptionMesgs` (`fit-parser.server.ts:94-170`).
- Laps are reduced to `{ startSec, endSec }` (`lapsOnSessionAxis`, `:245-260`).
  **`lap_trigger`, `intensity`, `wkt_step_index`, every per-lap aggregate and
  all swim fields are discarded.** A lone lap is dropped.
- Laps are windowed per session by `start_time`, so multisport works
  (`:148-154`).
- Swims map to `swim` (`:69`), but no lengths are read, and Structure Detection
  runs only for run and bike (`structure-detection/types.ts:20-25`).
- The decoder's default `convertTypesToStrings` yields string enums
  (`'fitnessEquipment'`, `'warmup'`, `'idle'`), which is what the existing code
  expects (`asString(session.sport)`).

### 1.5 Exactly what the FIT parser would need to read

Per session, windowed by `start_time` as laps are today:

1. **Laps** (`lapMesgs`): `startTime`, `totalElapsedTime`, `totalTimerTime`,
   `lapTrigger`, `intensity`, `wktStepIndex`, `repetitionNum`, `messageIndex`,
   `avgHeartRate`, `maxHeartRate`, `avgPower`, `maxPower`, `normalizedPower`,
   `totalWork`, `totalDistance`, `enhancedAvgSpeed ?? avgSpeed`, `avgCadence`
   (and `avgRunningCadence`), `totalAscent`. For swims also `numLengths`,
   `firstLengthIndex`, `numActiveLengths`, `swimStroke`, `totalStrokes`,
   `avgStrokeDistance`. Keep the lone-lap rule, but **keep a lone lap when it
   carries a `wktStepIndex`** (a one-step workout).
2. **Workout** (`workoutMesgs[0]`): `wktName`, `sport`, `subSport`,
   `numValidSteps`, `poolLength`, `poolLengthUnit`, `wktDescription`.
3. **Workout steps** (`workoutStepMesgs`), keyed by `messageIndex`:
   `wktStepName`, `durationType`, `durationValue` (or the expanded subfields
   `durationTime`/`durationDistance`/…, plus `durationStep` and `repeatSteps`
   for repeats), `targetType`, `targetValue` (or the subfields
   `targetPowerZone`/`targetHrZone`/`targetSpeedZone`),
   `customTargetValueLow/High` (or the subfields `customTargetPowerLow/High`,
   `customTargetSpeedLow/High`, `customTargetHeartRateLow/High`),
   `secondaryTargetType`/`secondaryTargetValue`, `intensity`, `notes`,
   `equipment`. Note the FIT power/HR offset encoding:
   `WorkoutPower`/`WorkoutHr` values above 1000/100 are absolute and values
   below are percentages. This is per the FIT Profile and **unverified** in this
   note.
4. **Lengths** (`lengthMesgs`, swim sessions only): `startTime`,
   `totalElapsedTime`, `totalTimerTime`, `lengthType`, `swimStroke`,
   `totalStrokes`, `avgSpeed`, `avgSwimmingCadence`, `messageIndex` (to resolve
   `firstLengthIndex`).
5. **Session** additions: `poolLength`, `poolLengthUnit`, `numLengths`,
   `numActiveLengths`, `firstLapIndex`, `numLaps`.
6. Optional: `splitMesgs` (#312, `split_type` intervalActive/intervalRest/…;
   newer Garmin devices), and `eventMesgs` with `event = workout_step` for step
   changes that did not close a lap. Both are **unverified** against real files.

Then `ParsedFitSession.laps` must widen from `Lap { startSec, endSec }` to a
typed lap (trigger, role, step index, aggregates), and the detector's
`LapArraySchema` (`structure-detection/detect-job.server.ts:57-59`) must accept
it.

### 1.6 Do the kept `ActivityFile` bytes cover history? [REPO]

- `ActivityFile { activityImportId @unique, format 'fit', fetchedVia, bytes }`
  (`prisma/schema.prisma:1792-1802`) arrived in migration
  `20261013140000_one_activity_is_one_row`.
- **Written by** `ingestFit` → `keepOriginalFile` for every new FIT leg:
  uploads, direct vendors, any `ingestFit` caller
  (`app/integrations/shared/ingest-fit.server.ts:123,193-208`). It is also
  written by the **intervals.icu FIT harvest**, which fetches the **original**
  file (`GET /activity/{id}/file`, not `/fit-file`, which is a re-generated file
  whose laps are intervals.icu's intervals) for every intervals.icu import with
  `fitHarvestedAt: null`, Garmin-origin first, at up to 2,000 requests per key
  per day (`app/integrations/intervalsicu/fit-harvest.server.ts:17-61,218-243`).
- **Covered:** all intervals.icu imports that have an original file (once the
  harvest has run), and every FIT ingested since 2026-10-13. A lap backfill is a
  **zero-I/O job**: re-run `parseFit(bytes)` and write the typed laps.
  `refreshMirrorFromOriginalFit` already shows how a duplicate FIT refreshes
  `lapsJson` (`ingest-fit.server.ts:263`).
- **Not covered:**
  - FIT uploads before 2026-10-13, where only the summary is in `rawJson`. Those
    athletes would have to re-upload.
  - Strava imports, because the Strava API has no original-file endpoint (not in
    the API reference).
  - Manual intervals.icu entries, which return 404 and are marked as asked.
  - Strava-stub activities on intervals.icu, which are already filtered
    (`intervalsicu/ingest.server.ts:66-76`).
- **Frozen Recordings:** both existing lap heals touch only **unpromoted**
  imports (`strava/laps-backfill.server.ts:66-76`,
  `intervalsicu/laps-backfill.server.ts:60-66`; ADR 0012/0032). A typed-lap
  backfill for promoted recordings needs an explicit decision.

## 2. intervals.icu [ICU, REPO]

- `GET /api/v1/activity/{id}/intervals` returns
  `IntervalsDTO { id, analyzed, icu_intervals: Interval[], icu_groups: IntervalGroup[] }`.
  `PUT` on the same path, `/intervals/{intervalId}`, `/split-interval` and
  `/delete-intervals` exist too (athletes edit intervals).
- **`Interval`:**
  - Position: `id`, `start_index`, `end_index`, `start_time`, `end_time`
    (elapsed seconds on the stream axis).
  - Labels: **`type` enum `WORK | RECOVERY`**, `group_id`, `label`,
    `segment_effort_ids`.
  - Aggregates: `distance`, `moving_time`, `elapsed_time`,
    `average_watts`/`min_watts`/`max_watts`, **`weighted_average_watts`**,
    `intensity`, `training_load`, `joules`, `joules_above_ftp`, `decoupling`,
    `zone`/`zone_min_watts`/`zone_max_watts`,
    `average_speed`/`min_speed`/`max_speed`, `gap`,
    `average_heartrate`/`min_heartrate`/`max_heartrate`, `average_cadence`,
    `average_stride`, `total_elevation_gain`, `average_gradient`, W′bal
    start/end, running dynamics, SmO₂, lactate, and weather.
- **`IntervalGroup`:** the same aggregates, plus `id` (string) and **`count`**
  (reps in the group). This is intervals.icu's "N×" recognition.
- **There is no step index, no lap trigger, and no per-interval provenance
  field.** The DTO cannot say whether an interval came from a device lap or from
  intervals.icu's detection. The Activity carries `icu_lap_count`,
  `interval_summary`, `icu_intervals_edited`, `lock_intervals`,
  `workout_shift_secs`, `paired_event_id`, `lengths` and `pool_length`.
- **Where intervals come from** (intervals.icu forum, developer David, Apr 2022,
  `https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779`):
  - "Lap data is now used for power based intervals for structured workouts done
    on Garmin devices". Labelling uses "workout_step messages … and laps [that]
    include wkt_step_index".
  - An account setting can force laps over auto-detection.
  - A lone lap is ignored ("ignore laps if there is only one and use auto
    detection").
  - "All laps are kept when detecting intervals from lap data", with a
    per-activity untick under Actions → Analyse.
  - Lap data "does not work with activities from Strava".
  - So for Garmin structured workouts the intervals are the device step laps,
    re-typed WORK/RECOVERY. Otherwise they come from intervals.icu's own
    detection. How WORK/RECOVERY is assigned is **not documented** (it was asked
    on the forum and not answered).
- **What trainm8 keeps** [REPO]: `IntervalsIcuIntervalSchema`
  (`app/integrations/intervalsicu/types.ts:167-175`) models `start_time`,
  `end_time`, `start_index`, `end_index` and `type`, and passes everything else
  through. Then `intervalsIcuIntervalsToMarkers`
  (`intervalsicu/ingest.server.ts:355-366`) keeps only `{ startSec, endSec }`.
  **`type`, `group_id`, `label`, `icu_groups` and every aggregate are dropped
  before `lapsJson`.** The import's `rawJson` is the list payload, so
  `interval_summary` and `icu_lap_count` are kept.

## 3. Strava [STRAVA, REPO]

- `Lap` (swagger `lap.json`): `id`, `activity`, `athlete`, `average_cadence`,
  `average_speed`, `distance`, `elapsed_time`, `start_index`, `end_index` (into
  the activity stream), **`lap_index`** (position in the activity), `max_speed`,
  `moving_time`, `name`, `pace_zone`, **`split`** (integer, undocumented
  meaning), `start_date`, `start_date_local`, `total_elevation_gain`.
- **No trigger, no intensity, no step reference.** A Strava lap cannot say
  manual, auto-km or workout step. `average_watts`, `average_heartrate` and
  `device_watts` show up in real payloads but are **not in the documented
  model** (unverified).
- `splits_metric`/`splits_standard` on a DetailedActivity are Strava-computed
  per-km/mile splits, **not device laps**. Never treat them as structure.
- `elapsed_time` against `moving_time` per lap: elapsed includes pauses, and the
  stored stream axis follows Strava's `time`. trainm8 maps by
  `start_index`/`end_index` → `time[]`, falling back to `start_date` minus the
  activity start (`strava/ingest.server.ts:347-390`).
- **Privacy zones (unverified):** Strava's Map Visibility support article says
  only that the settings "are not shared to other services". Neither the API
  reference nor the changelog says whether hidden start/end trimming changes
  `distance`, `start_index` or streams returned to the owner. Treat lap
  distances near the start and end as possibly altered until tested on a real
  account with a hidden-start setting.
- **Kept:** `StravaLapSchema` (`strava/types.ts:112-124`) →
  `{ startSec, endSec }` only. Webhook imports also hold the DetailedActivity in
  `rawJson`, which has the laps. List-sync and backfill imports don't
  (SummaryActivity, `resource_state: 2`).

## 4. TCX [TCX, REPO]

- `ActivityLap_t`: `@StartTime`, `TotalTimeSeconds`, `DistanceMeters`,
  `MaximumSpeed?`, `Calories`, `AverageHeartRateBpm?`, `MaximumHeartRateBpm?`,
  **`Intensity` (required; `Intensity_t` = `Active | Resting`)**, `Cadence?`,
  **`TriggerMethod` (required;
  `Manual | Distance | Location | Time | HeartRate`)**, `Track*`, `Notes?`.
  Watts and averages come from the ActivityExtension `LX` (`AvgWatts`,
  `MaxWatts`, `AvgSpeed`, `AvgRunCadence`). There is no step reference and no
  workout block in an activity TCX.
- **Bug found:** `parseTcx` writes `lapsJson` as
  `TcxLapMarker { startOffsetSec, durationSec, distanceM, trigger }`
  (`app/utils/tcx-parser.server.ts:78-83,166-186,269-296`). The detector parses
  `lapsJson` with `z.array(z.object({ startSec, endSec }))`
  (`structure-detection/detect-job.server.ts:57-74`), so **every TCX lap fails
  the parse and is silently ignored** (it degrades to "no laps").
  `tcx-stream-backfill.server.ts:106-122` writes the same shape. `Intensity` is
  not read at all. TCX history is fully re-parseable because
  `rawJson = { fileName, fileContent }`
  (`activity-file-ingest.server.ts:137,153`).

## 5. COROS and Polar (unverified)

- Both export FIT, so the Lap/Length/Workout messages above apply if they write
  them. Nothing in-repo or in their public developer docs found here says
  whether a COROS or Polar watch running a structured workout writes **one lap
  per step**, **`wkt_step_index`**, or embedded **`workout_step`** messages.
- Indirect evidence:
  - intervals.icu's lap-labelling announcement names **Garmin** devices only.
  - COROS forum threads discuss pushing workouts to COROS, not the shape of the
    activity file.
  - Polar's own export lacks structured targets beyond zones (third-party
    guides, low trust).
  - Our only non-Garmin fixture (`tests/fixtures/fit/suunto-guide-run.fit`) is
    synthetic and has no laps.
- **How to settle it cheaply:** decode one real harvested `ActivityFile` per
  manufacturer. The harvest already stores them, and
  `deviceName`/`fileIdMesgs.manufacturer` identify the brand. Check
  `lapMesgs[].wktStepIndex`, `intensity`, `lapTrigger` and the presence of
  `workoutStepMesgs`/`lengthMesgs`. Until then, the reader must treat a lap
  without `wktStepIndex` as untyped.

## 6. History: how many imports have usable laps [SEED, REPO]

**`intervals-real-history.json`** (repo owner, 100 activities, 12-month window,
all `source: GARMIN_CONNECT`, `file_type: fit`, FR965):

| `icu_lap_count` | Activities         | Reading                                                                                                                                                                                                                                                                                 |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–1             | 44 (3 × 0, 41 × 1) | No structure from laps (the lone lap is ignored, as intervals.icu does)                                                                                                                                                                                                                 |
| 2–7             | 21                 | Mostly "Basis" runs: a timed first lap (`30m1s`, `32m1s`, `40m1s`) plus the rest, i.e. a **2-step Garmin workout**. Some are manual laps.                                                                                                                                               |
| ≥ 8             | 35                 | All 15 structured-named sessions are here. Lap counts match **warm-up + N work + N rest + cool-down** exactly: 10×3 min → 22, 5×6 min → 12, 4×8 min → 10, 3×15 min → 8, 30×45/15 → 62. So these are step laps. 3 Nordic ski sessions look like 1 km auto-laps (15/14.8 km, 27/25.5 km). |

- **56/100 have more than one lap**: 45 of 81 runs, 7 of 11 trail runs, 1 of 1
  ride, 3 of 3 Nordic ski. 97/100 have a non-empty `interval_summary`, and it
  does not always agree with the laps. For example, "20x45/15" with 53 laps
  gives intervals.icu's summary "25x 45s", so its detection over-counts here.
- Every one of these 100 is a Garmin FIT with an original file, so **the harvest
  makes all 56 lap-carrying activities backfillable with typed FIT laps**.

**`kody-strava-history.json`** (53 Strava activities, FR965, 50 runs):

- **0/53 carry laps.** They are SummaryActivity (`resource_state: 2`) snapshots
  with no `laps` key, and `workout_type` is 0/null.
- Laps for these need one `/activities/{id}/laps` call each, and they come back
  untyped.

**Code paths (production):**

| Path                                              | Lap data written to `lapsJson` today                               | Typed?                              |
| ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| FIT via `ingestFit` (upload, harvest-era)         | device laps → `{startSec,endSec}`                                  | no (trigger/intensity/step dropped) |
| intervals.icu sync + `intervalsicu-laps-backfill` | **intervals.icu intervals**, not device laps → `{startSec,endSec}` | no (WORK/RECOVERY dropped)          |
| Strava webhook/sync + `strava-laps-backfill`      | Strava laps → `{startSec,endSec}`                                  | not available from source           |
| TCX upload / `tcx-stream-backfill`                | `{startOffsetSec,…,trigger}`                                       | **unparseable by the detector**     |
| GPX                                               | none (no lap concept)                                              | —                                   |

## 7. What this means for the Activity Interval model (inputs, not decisions)

- A provider-neutral interval needs at least these fields. Every field except
  the edges is optional, because only FIT fills the full set.
  - `startSec`, `endSec`.
  - `source` (`device-lap` | `provider-interval` | `detected`).
  - `trigger` (FIT `lap_trigger` / TCX `TriggerMethod`).
  - `role` (FIT `intensity` / ICU `type` / TCX `Intensity`).
  - `stepIndex` (FIT `wkt_step_index`).
  - `groupId` (ICU `group_id`).
  - Aggregates (`avgPower`, `normalizedPower`, `avgHr`, `distanceM`,
    `avgSpeed`).
  - For swims, `lengths[]`.
- For intervals.icu imports with harvested bytes, **prefer the FIT laps** over
  `icu_intervals`, because they are richer and are the device's own. Keep
  intervals.icu's WORK/RECOVERY and groups as a second opinion.
- Swim structure should come from FIT laps and lengths alone, with no stream
  detection.

## Sources

- Garmin FIT SDK, Activity File:
  https://developer.garmin.com/fit/file-types/activity/ (article body at
  `/fit/articles/file-types/activity.html`).
- Garmin FIT SDK, Encoding Activity Files, "Encoding Pool Swim Activities":
  https://developer.garmin.com/fit/cookbook/encoding-activity-files/
- Garmin FIT SDK, Workout File:
  https://developer.garmin.com/fit/file-types/workout/
- `@garmin/fitsdk` 21.208.0: `src/types/mesgs.d.ts` (`LapMesg` :733,
  `LengthMesg` :905, `WorkoutMesg` :1792, `WorkoutStepMesg` :1816),
  `src/types/types.d.ts` (`Intensity` :779, `LapTrigger` :804, `SwimStroke`
  :1898, `LengthType` :1959), `src/profile.js` (field numbers and scales above).
- intervals.icu OpenAPI: https://intervals.icu/api/v1/docs (`IntervalsDTO`,
  `Interval`, `IntervalGroup`, Activity). Forum:
  https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779
- Strava Lap model: https://developers.strava.com/swagger/lap.json ; reference
  https://developers.strava.com/docs/reference/ ; Map Visibility
  https://support.strava.com/hc/en-us/articles/115000173384-Edit-Map-Visibility
- TCX schema: https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
  (`ActivityLap_t` :326, `TriggerMethod_t` :352, `Intensity_t` :521)
- Repo: files cited inline. Prior notes:
  `docs/wayfinder/workout-auto-analysis/provider-lap-data.md`, and
  `docs/wayfinder/structured-workouts/findings.md` §8 on branch
  `research/structured-workouts`.
