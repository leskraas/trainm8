# Pool swims as sets and lengths

Analysis for the ticket *Read pool swims as sets and lengths* (#623) on the map
*structured workouts everywhere* (#600). Written 2026-10-19. Code references
are to `origin/main` at `ea40a47`. It builds on the Activity Interval model
(`603-activity-interval.md`), the Workout Reading (`602-workout-reading.md`)
and the lap and length research (#604,
`origin/research/lap-and-length-data:docs/wayfinder/structured-workouts/604-lap-and-length-data.md`).

Tags: **[FIT]** Garmin FIT SDK articles, **[SDK]** the installed
`@garmin/fitsdk` 21.208.0 profile, **[GARMIN]** Garmin watch manuals,
**[APPLE]** Apple HealthKit docs, **[FORUM]** forum posts (low trust),
**[REPO]** this repo, **[RUN]** the throwaway fixture in §3.
**Unverified** marks what no primary source here settles.

## In one screen

- A pool swim file is **laps over lengths**. A lap is a set. A length is one
  trip down the pool. Rest is an **idle length**, and the device writes it as
  **its own lap** [FIT].
- trainm8 keeps only the lap edges today. It drops the lengths, the pool length,
  the stroke and which laps were rest (`app/utils/fit-parser.server.ts:245-260`)
  [REPO, RUN].
- **Laps become `device` rows**, one per lap, rest laps included. **Lengths are
  not interval rows.** They are measured detail under the import, in their own
  table.
- **Rest is the idle lap.** Its role is `recovery`, measured by the device. This
  needs the owner (choice A).
- **Swim gets no `engine` layer.** In the pool the device already measured the
  structure exactly. Open water reads device step laps or the whole session.
- **The reading** shows sets like `4 × 100 m · on 1:45 · 1:30 /100 m · Z4 · free`.
  The repeat bracket and the send-off are derived when the reading is made. They
  are not stored.
- **Session pace includes rest today**: 1:53 /100 m in the fixture against a
  swum 1:41 /100 m (§3).

---

## 1. What a pool swim file holds

### 1.1 Messages and fields

| Message | Fields that matter for swim | Source |
|---|---|---|
| `session` (18) | `sub_sport` (`lapSwimming` / `openWater`), `pool_length` (44, m, scale 100), `pool_length_unit` (46, `metric`/`statute`), `num_lengths` (33), `num_active_lengths` (47), `first_lap_index`/`num_laps`, `swim_stroke` (43), `avg_stroke_distance` (42), `total_distance`, `total_timer_time` | [SDK] `profile.js`; required list in [FIT-ENC] |
| `lap` (19) | `start_time`, `total_elapsed_time`, `total_timer_time`, `total_distance`, `first_length_index` (35), `num_lengths` (32), `num_active_lengths` (40), `swim_stroke` (38), `avg_stroke_distance` (37), `stroke_count` (75), `intensity` (23), `lap_trigger` (24), `wkt_step_index` (71), `repetition_num` (61), `sub_sport` (39) | [SDK]; required list in [FIT-ENC] |
| `length` (101) | `message_index`, `start_time`, `total_elapsed_time` (s, scale 1000), `total_timer_time`, **`length_type`** (`idle` 0 / `active` 1, required), `swim_stroke`, `avg_speed` (m/s, scale 1000), `total_strokes`, `avg_swimming_cadence` (strokes/min). Active lengths only for stroke, speed, strokes and cadence. | [SDK] `LengthMesg` `mesgs.d.ts:905`; [FIT-ACT]; [FIT-ENC] |
| `record` (20) | One per length is "best practice": timestamp, distance, speed, cadence. Extra records may carry HR. | [FIT-ENC] |
| `hr` (132) | HRM-Swim / HRM-Tri store-and-forward HR, appended as a **chained FIT** | [FIT-DEC] |
| `workout` (26) / `workout_step` (27) | `pool_length`, `pool_length_unit`; steps with `duration_type` `distance` (`duration_distance`, m), `time`, `open`, `repeat_until_steps_cmplt`, `repetition_time`; `target_type` `swim_stroke` (`target_stroke_type`); `equipment` (`swimFins`, `swimKickboard`, `swimPaddles`, `swimPullBuoy`, `swimSnorkel`) | [SDK]; [FIT-WKT] |

`swim_stroke` values: `freestyle, backstroke, breaststroke, butterfly, drill,
mixed, im, imByRound, rimo` [SDK]. **FIT has no kick stroke.**

### 1.2 What the FIT SDK says, quoted

- "Length messages are also used to track idle periods between active sets.
  Lap messages are used to group sets of active and idle Length messages."
  [FIT-ENC]
- "The length of the pool is a constant and is stored in the Session message.
  It is implied that the distance represented by each Length message is the
  value of the pool_length field in the Session message. The pool length should
  be specified in meters, with the pool_length_unit field providing the
  corresponding units which are either metric for meters or statute for yards."
  Example: `SetPoolLength(22.86f); // 25 yards` [FIT-ENC]
- "For pool swim activities, both of these fields [elapsed and timer time]
  should be set to the same value. Length messages with the Type field set to
  LengthType.Idle are used to record rest time in between active sets."
  [FIT-ENC]
- The example sequence is four active lengths, then a `Lap`, then one idle
  length, then a `Lap` [FIT-ENC]. **So rest is a lap of its own.**
- Drills: "Drill mode is typically implemented using a timer that tracks the
  duration of the drill set and a prompt that allows the user to manually enter
  the distance covered. In drill mode, it is assumed that the person was moving
  at a constant pace. … Drills sets are represented … using Length messages with
  the SwimStroke field set to SwimStroke.Drill." [FIT-ENC]
- The decoding example's CSV shows four 60 s idle lengths inside an 840 s
  session whose timer time is 840 s. **Rest counts in timer time** [FIT-DEC].
- "When creating swim workouts, the target is used to indicate the swim stroke
  for the step." [FIT-WKT]

### 1.3 How the watch makes sets and rest

| | Garmin | Apple Watch (HealthKit) | COROS |
|---|---|---|---|
| Set boundary | "Interval: One or more consecutive lengths. A new interval starts after a rest." [GARMIN] An interval is a FIT lap. | `segment` events group "consecutive laps with the same style of stroke" [APPLE] | Lap/Back button marks a set [COROS support, via search] |
| Length | "Length: One trip down the pool." [GARMIN] | A `lap` event is one pool length [APPLE] | as FIT; **unverified** |
| Rest | Auto rest: "If you rest for more than 15 seconds, the watch automatically creates a rest interval." Manual rest by button. "Swim data is not recorded during a rest interval." [GARMIN] | Rest periods are marked with pause/resume events [APPLE] | Auto rest on no arm movement [COROS]. One forum report says rests are not flagged, so pace was computed over total time [FORUM]. **Unverified.** |
| Drill / kick | Drill logging; distance entered by hand [GARMIN, FIT-ENC] | `HKSwimmingStrokeStyle.kickboard` exists [APPLE] | **unverified** |
| Known oddity | — | Changing the pool length rewrites past swims [Apple discussions] | Length records overlap in time: "the start_time of length n+1 is before the end time … of the previous length" [FORUM] |

**HealthFit** (Apple → FIT) is claimed to export "intervals, swim strokes and
rest periods" (Final Surge blog, 2017, vendor-affiliated). How it encodes them
(idle lengths, or timer pauses) is **unverified**. Kickboard has no FIT stroke,
so its mapping is **unverified** too.

**Cheap way to settle the brand rows:** decode one harvested pool-swim
`ActivityFile` per manufacturer, as #604 §5 proposes for step laps. Check
`lengthMesgs[].lengthType`, idle laps, timer pauses and overlapping lengths.

### 1.4 Sources without lengths

| Source | What a swim carries | Consequence |
|---|---|---|
| intervals.icu activity DTO | `lengths` (integer count) and `pool_length` (number) only; `Interval` has no swim fields (OpenAPI, fetched 2026-10-19) | Use the **harvested original FIT** (`fit-harvest.server.ts`), never the DTO, for swim structure |
| Strava | Lap model has no swim, idle or stroke field (#604 §3); 0/53 seed activities carry laps | Untyped device rows at best; reads as the whole session |
| TCX | `Intensity` Active/Resting only, no lengths (#604 §4) | Untyped device rows |
| Open water (FIT `sub_sport = openWater`) | GPS records; laps are auto-distance, manual or workout steps; no lengths; no pool length | Device step laps, or the whole session |

## 2. What trainm8 keeps today

| Item | Kept? | Where |
|---|---|---|
| `sport: swimming` → `swim` | yes | `fit-parser.server.ts:69-70` |
| `sub_sport` | read only to spot strength | `:73`, `:220-223` |
| `pool_length`, `pool_length_unit`, `num_lengths` | **no** | `sessionActivity`, `:189-236` |
| Laps | edges only `{startSec, endSec}`, rounded to whole seconds; a lone lap is dropped | `:245-260` (rounding `:254-255`) |
| Which lap was rest (`intensity`, idle lengths, zero distance) | **no** | `:245-260` |
| Lengths (`lengthMesgs`) | **decoded and thrown away** | `parseFit` never reads them, `:94-165` |
| Records | HR and pace (sec/km); a 0 m/s idle record reads as a `null` pace | `:269-297` (`:287`) |
| HRM-Swim HR | yes, because the JS decoder merges `hr` into records by default | `node_modules/@garmin/fitsdk/src/decoder.js:142,188-189` |
| Session pace | `durationSec / distance`, where `durationSec` is timer time, so **rest is included** | `:195-209` |
| Structure Detection | never runs for swim | `structure-detection/types.ts:14-37` |
| Swim load | `sTSS` from that session pace | `load/compute.ts:145-155`, `load/formulas.ts:80-95` |

## 3. The fixture: what the parser reads

Throwaway script, not committed:
`/tmp/claude-0/-home-user-trainm8/a206aa0a-77dc-509f-9146-18fd575250f2/scratchpad/pool/pool-swim.ts`.
Run it from `/home/user/trainm8` with `npx tsx <path>`. It writes a Garmin-shaped
file through the official SDK `Encoder`, in the same way as
`tests/fixtures/fit/fit-builder.ts:13-21`. The builder's `LapSpec` has no swim
fields (`:31`), so the script writes the messages itself. It follows the
[FIT-ENC] sequence: one record per length, rest as its own idle lap, and an
embedded workout.

**The swim:** 25 m pool. WU 200 free, rest 30 s, then 4 × (100 free in 1:30 +
15 s rest), 50 drill (kickboard), and a 100 mixed cool-down. That is 750 m in
851 s, with 35 lengths, 5 of them idle, in 12 laps.

| | Raw decode (the file) | `parseFit` (trainm8) |
|---|---|---|
| Pool length | `poolLength 25`, `metric` | — |
| Laps | 12, each with `wktStepIndex`, `repetitionNum`, `intensity`, `firstLengthIndex`/`numLengths`/`numActiveLengths`, `totalDistance`, `swimStroke` (`freestyle`, `drill`, `mixed`) | 12 × `{startSec,endSec}`, with nothing to tell `200–230` (rest) from `230–320` (100 m) |
| Rest | 5 laps with `numActiveLengths 0`, `totalDistance 0`, one idle length each | indistinguishable |
| Lengths | 35 with type, stroke, strokes, speed | — |
| Plan | `workout` + 7 steps: `durationDistance 100`, `targetStrokeType freestyle`, `repeatSteps 4`, `equipment swimKickboard` | — |
| Session pace | 851 s / 750 m | `paceAvgSecPerKm 1134.7` = **1:53.5 /100 m** |
| Pace while swimming | 761 s / 750 m = **1:41.5 /100 m** | not computable |
| Stream | 35 records, one per length | `time`, `heartrate`, `pace` (sec/km) |

The main-set reps come out exactly: 100 m in 90 s plus 15 s rest is a 105 s
cycle, so the set was swum **on 1:45**. That figure is only computable from the
typed laps.

## 4. Decisions: lengths and laps as Activity Intervals

### 4.1 Rows

| Question | Decision | Why |
|---|---|---|
| Laps | **One `device` row per FIT lap**, rest laps included, `origin: 'lap'` | A lap is the device's set. 603 already gives swim device rows from laps. |
| Lengths | **Not `ActivityInterval` rows.** They go in their own measured table, `ActivityLength`, child of `ActivityImport` and cascade-deleted with it | Within a layer, rows are sequential and do not overlap (603 §2). Lengths nest inside laps, so they would break that. Lengths also belong to the import, not to a layer: an athlete regrouping sets (#624) regroups the same lengths. |
| Lap ↔ length link | `firstLengthIndex` + `numLengths` on the device row, as FIT has them | A fact from the file, like `deviceStepIndex` |
| `groupIndex` / `repIndex` | **Null on device rows.** "4 × 100" is derived when the reading is made (§5.2). With a workout, `deviceStepIndex` + `deviceRepetition` carry the repeat, as 603 already says. | Storage holds only authored or measured data. Grouping equal laps is an inference. |
| Lone lap | Keep today's rule (`:259`): drop it, and the reader's whole-session interval stands in | One lap is one continuous swim. Nothing is lost. |

`ActivityLength` (proposed):

```prisma
model ActivityLength {
  activityImportId String
  activityImport   ActivityImport @relation(fields: [activityImportId], references: [id], onDelete: Cascade)
  lengthIndex Int      // FIT length.message_index
  startSec    Float    // session axis, not rounded
  durationSec Float
  kind        String   // 'active' | 'idle'
  stroke      String?  // FIT swim_stroke, active only: freestyle | backstroke | breaststroke | butterfly | drill | mixed | im
  strokes     Int?     // total_strokes; null for drill or when not written, never 0-as-unknown
  cadence     Float?   // avg_swimming_cadence
  @@id([activityImportId, lengthIndex])
}
```

Speed and distance are **not stored** per length. Distance is the pool length.
Speed is pool length ÷ duration, derived. SWOLF is duration + strokes, also
derived.

### 4.2 Columns the device row gains, and the import

| Where | Field | From |
|---|---|---|
| `ActivityImport` | `poolLengthM Float?` | `session.pool_length`, which is always metres (22.86 for 25 yd) [FIT-ENC] |
| `ActivityImport` | `poolLengthUnit String?` (`metric` / `statute`) | `session.pool_length_unit`; used only to label the pool ("25 yd") |
| `ActivityInterval` | `swimStroke String?` | `lap.swim_stroke` |
| `ActivityInterval` | `strokeCount Int?` | `lap.total_strokes` (a.k.a. `stroke_count`) |
| `ActivityInterval` | `firstLengthIndex Int?`, `numLengths Int?`, `numActiveLengths Int?` | lap |
| `ActivityInterval` | `movingSec` (already in 603) | **sum of the active lengths' durations** |
| `ActivityInterval` | `distanceM` (already) | `lap.total_distance`; fall back to `poolLengthM × numActiveLengths` |
| `ActivityInterval` | `avgSpeedMps` (already) | `distanceM / movingSec` (603 §2 rule) |

**Pool or open water** is derived: pool when `poolLengthM` is set or lengths
exist. No new enum is stored.

### 4.3 Distance

- Use the device's `lap.total_distance`. For a drill it is the distance the
  swimmer typed in [FIT-ENC], which `pool_length × lengths` cannot know.
- If `pool_length × num_active_lengths` and `total_distance` differ by more than
  one length, keep the device's figure. The parser test should cover this.
- Store metres. A 25 yd pool is `22.86`. Pace is per 100 m everywhere, because
  CSS is stored per 100 m (`cssSecPer100m`) and `css-5` is a ratio to it
  (`zones/recipes.ts:415-455`). The pool label may say "25 yd". Per-100-yd pace
  is out of scope.

### 4.4 Roles

- **Workout-step laps:** the role comes from `lap.intensity`, as 603 §4 maps it.
  In the fixture, the rest steps are `intensity: rest` → `recovery`.
- **An idle lap without a workout** (`numActiveLengths = 0`, distance 0) **reads
  as `recovery` with provenance `measured`** if the owner agrees (choice A). The
  device measured "not swimming". Detection played no part.
- **An active lap without a workout gets no role.** Whether a 100 m was warm-up
  or work is intent, which the device did not measure. It reads `below-gate`,
  as 602 invariant 12 says.

### 4.5 Detection

- **Pool: no `engine` layer.** Every boundary a detector could find is already a
  measured lap or idle length. `DETECTION_DISCIPLINES` stays `run | bike`
  (`structure-detection/types.ts:23-26`).
- **Open water: no engine in v1.** Swim GPS pace is noisy, the scoreboard has no
  swims (#605), and detection already fails on runs (map §8). Open water reads
  workout-step laps, else the whole session.
- **Read precedence for pool swims** (choice A): for a pool swim, **every device
  lap is read as structure**, not only workout-step laps. Garmin defines a lap
  as a set that ends at a rest [GARMIN], so a pool lap is never an auto-km lap.
  The 603 rule ("untyped device laps are never read as structure") stays for
  every other sport and for open water.

## 5. The reading

### 5.1 Executed Steps

`readRecording` makes one Executed Step per read lap, in time order:

| Field | Pool swim value |
|---|---|
| `kind` | `cardio`; `rest` for an idle lap |
| `role` | from `intensity` (step lap) or idle = `recovery` (`measured`), else `below-gate` |
| `duration` | lap elapsed, `measured` |
| `distanceM` | `distanceM`, `measured` |
| `measured.speed` | `avgSpeedMps` (moving). Shown as `m:ss /100 m` through `formatSwimPace` (`app/utils/format.ts:402-404`). The 10 conversion lives in the reader only (602 invariant 7). |
| `zone` | measured speed vs CSS through the one placement function, **only for `freestyle` or no stroke written**. See choice B for other strokes and drills. |
| stroke | a new optional `measured.stroke` on `MeasuredAverages`: the lap's stroke, or `mixed` |

Summary for a swim:

- `duration` is elapsed, rest included, as today.
- `distance` is the sum of lap distances.
- A **swim pace** is the sum of distance ÷ the sum of `movingSec` over active
  laps. In the fixture that is 1:41.5 /100 m, not today's 1:53.5.

### 5.2 Sets, brackets and send-off (derived, never stored)

- **Bracket:** a run of at least 2 active laps with equal distance and the same
  stroke, separated only by idle laps (or zero-gap), becomes a
  `RepeatBracket { count, level: 'rep' }` with provenance `convention`. With a
  workout, the bracket comes from `deviceStepIndex` + repeat steps instead.
- **Measured send-off:** within a bracket, take the median start-to-start time
  between reps. Show it only when its spread is no more than 5 s. The fixture
  gives 105 s, so "on 1:45".
- **Rest:** an idle lap reads as its own rest step ("15 s rest"). A rep that
  leaves straight away has no idle lap, so its rest is 0 and is not drawn.

Row text, from the fixture with CSS 1:30 /100 m:

| Row | Text |
|---|---|
| WU | `200 m · 3:20 · 1:40 /100 m · Z2 · free` |
| Rest | `30 s rest` |
| Main | `4 × 100 m · on 1:45 · 1:30 /100 m · Z4 · free` (each rep listed under it) |
| Drill | `50 m drill · 1:20` with zone not applicable (choice B) |
| CD | `100 m · 2:01 · mixed` with zone not applicable (choice B) |

In the Profil drawing (#601), width is time, so idle laps draw as rest ink. A
bracket gets `4 ×` in `full` only.

### 5.3 Planned swim steps → recorded laps

This is the input for *Map what was done onto what was planned* (#608). Nothing
here is stored.

- Planned swim steps are **distance-based** with `Z1`–`Z5` CSS bands
  (`catalogue-corpus.swim.ts:66-72`). Blocks carry a **Send-Off** or rest steps,
  never both (GLOSSARY `Send-Off`, lines 640-653).
- **With an embedded FIT workout:** map by `deviceStepIndex` + `deviceRepetition`,
  as for run and bike.
- **Without one:** swim laps are **distance-exact** (pool multiples), so match
  planned work reps to active laps by distance, in order. Idle laps match rest
  steps or send-off residuals. A 100 m planned and a 100 m swum is the strong
  signal run laps never give.
- **Send-off adherence:** compare the measured cycle with the resolved send-off
  (`on CSS + 10 s` → seconds). This is a mapping, never a verdict (map
  decision 4).
- **Not mappable from the plan:** stroke and equipment. The plan cannot store
  them (`catalogue-corpus.swim.ts:29-33`), although FIT steps can
  (`target_stroke_type`, `equipment`) [FIT-WKT]. The recording shows the
  measured stroke anyway.

## 6. Parser changes needed (`app/utils/fit-parser.server.ts`)

1. **Session:** read `subSport`, `poolLength`, `poolLengthUnit`, `numLengths`,
   `numActiveLengths` in `sessionActivity` (`:189-236`), and add
   `poolLengthM`/`poolLengthUnit` to `ActivityImportInput`.
2. **Lengths:** window `messages.lengthMesgs` per session by `startTime`, as laps
   are (`:148-154`). Return `lengths` on `ParsedFitSession` (`:30-39`). Keep
   seconds as floats.
3. **Laps:** widen `Lap` as #604 §1.5 lists, plus `swimStroke`, `totalStrokes`,
   `firstLengthIndex`, `numLengths`, `numActiveLengths`, and `movingSec` computed
   from the active lengths. **Stop rounding** edges to whole seconds
   (`:254-255`). A 25 m length lasts 12–40 s, and rounding moves pace by up to 4 %.
4. **Tolerate overlapping lengths** (COROS [FORUM]): clamp each start to the
   previous end, and never drop a length.
5. **Resolve `firstLengthIndex`** by `messageIndex`, not by array position.
6. **Chained FIT (HRM-Swim):** add a fixture test that `checkIntegrity`
   (`:175`) passes on a chained file. The decoder loops over chained files and
   merges HR (`decoder.js:183-189`). Whether `checkIntegrity` accepts a chained
   file is **unverified**.
7. **Ingest** (`integrations/shared/ingest-fit.server.ts:124-125,263`): write the
   device rows and `ActivityLength` rows where `lapsJson` is written today. The
   zero-I/O backfill (603 Q4) covers swims from kept bytes.
8. **Fixture:** add a `pool-swim.fit` to `generate-fixtures.ts`, with a
   `LengthSpec` in `fit-builder.ts`, modelled on §3 (idle laps, drill, mixed,
   embedded workout), plus a 25 yd variant.

## 7. What is stored and what is derived

| Stored (measured) | Derived when the reading is made |
|---|---|
| `poolLengthM`, `poolLengthUnit` | pool vs open water |
| device rows: edges, distance, `movingSec`, stroke, strokes, length span, `intensity` role, `deviceStepIndex`/`Repetition` | idle lap → `recovery` (choice A); brackets; measured send-off |
| `ActivityLength`: edges, kind, stroke, strokes, cadence | per-length speed, SWOLF, DPS |
| — | pace /100 m, zone vs CSS, swim pace, `StepKey` mapping |

## 8. Owner choices

**A. May pool laps be read as structure, with idle laps as measured
`recovery`?** This amends map decision 3 and 603 §1/§4, which allow roles only
above the ADR 0033 gate or on workout-step laps.

- *Yes (recommended):* the device measured the rest (idle length, 0 m), and a
  Garmin lap is a set by definition. Without this, every pool swim not run as a
  watch workout reads as one whole-session block.
- *No:* swims read structure only when run as a watch workout.

**B. How does a set that isn't freestyle get a zone?** CSS is a front-crawl
threshold (Wakayoshi), and ADR 0008 rules out HR for swim
(`zones/recipes.ts:552-553`).

- *(a) Recommended:* zone only for freestyle (or no stroke written). For
  backstroke, breaststroke, butterfly, IM, mixed and drill (kick included), the
  zone is `unavailable` with a new code (`stroke-not-css`, class
  `not-applicable`), and the pace is still shown.
- *(b)* Read every stroke against CSS. Backstroke then reads two zones easier
  than it was.
- *(c)* Per-stroke CSS offsets: new settings, with no published standard.

**C. Store lengths now, or only lap figures?**

- *Store `ActivityLength` now (recommended):* about one row per 25 m. It is
  needed for snapping athlete edits to length edges (#624), for IM and mixed
  sets, and for a later per-length view (SWOLF).
- *Lap figures only:* compute `movingSec` and the stroke from lengths at parse
  time, and backfill lengths later from the kept bytes at zero I/O. This is
  cheaper now, but #624 must then wait for the backfill.

## 9. Open items and fog

- **Brand behaviour is unverified** for COROS, Apple via HealthFit, Polar and
  Suunto. Settle it by decoding one harvested pool-swim file each (§1.3).
- **Swim summary pace and `sTSS` include rest.** `load/compute.ts:145-155`
  divides timer time, rest included, by distance. Whether sTSS should use moving
  pace is a load question. It is a separate ticket, because it shifts swim load
  and would need a Load Recompute Notice.
- **CSS can now be proposed from history.** GLOSSARY (`:509-510`) declines CSS
  because "a 400/200 pair needs data swim imports do not carry". Typed swim laps
  do carry it (catalogue `swim-A1`). This is a new ticket under ADR 0054.
- **Swim stroke and equipment on planned steps.** The catalogue names this loss
  (`catalogue-corpus.swim.ts:29-33`). FIT steps already have
  `target_stroke_type` and `equipment`, which matters for export (#541 W2).
- **Open water against pool CSS** (`catalogue-corpus.swim.ts:944`): a wetsuit
  swim compared with a pool CSS reads too easy. It needs a reading notice at
  most. Not decided here.
- **FIT send-off encoding:** whether Garmin writes "repeat on" as
  `duration_type = repetition_time` is **unverified**. It matters for W2 export,
  not for reading.
- **Strava zero-distance laps** might mark rest. This is **unverified**, so they
  stay untyped.

## Sources

- [FIT-ENC] Garmin FIT SDK Cookbook, *Encoding Activity Files*, "Encoding Pool
  Swim Activities": https://developer.garmin.com/fit/cookbook/encoding-activity-files/
  (article body `/fit/articles/cookbook/encoding_activity_files.html`).
- [FIT-DEC] *Decoding Activity Files*, "Decoding Pool Swim Activities Files" and
  "HrToRecordMesgBroadcast Plugin":
  https://developer.garmin.com/fit/cookbook/decoding-activity-files/
- [FIT-ACT] *Activity File*: https://developer.garmin.com/fit/file-types/activity/
- [FIT-WKT] *Workout File*: https://developer.garmin.com/fit/file-types/workout/
- [SDK] `@garmin/fitsdk` 21.208.0: `src/profile.js` (messages 18, 19, 26, 27,
  101; types `swimStroke`, `lengthType`, `displayMeasure`, `workoutEquipment`,
  `wktStepDuration`, `wktStepTarget`), `src/types/mesgs.d.ts:905`,
  `src/decoder.js:142,183-189`, `src/utils-hr-mesg.js`.
- [GARMIN] vívoactive 6 manual, *Swim Terminology* / *Auto Rest*:
  https://www8.garmin.com/manuals-apac/webhelp/vivoactive6/EN-SG/GUID-7CC7CBD7-F67F-4F29-9DEF-4311162B99B6-8689.html ;
  https://www8.garmin.com/manuals/webhelp/GUID-607F08F6-33FC-40BF-9727-84E54043D82D/EN-US/GUID-AC68D94C-821E-4567-8705-F433CDEA5525.html
- [APPLE] HealthKit: `HKWorkoutEventType.lap`, `.segment`,
  `HKMetadataKeySwimmingStrokeStyle`, `HKMetadataKeyLapLength`,
  `HKSwimmingStrokeStyle` (incl. `kickboard`):
  https://developer.apple.com/documentation/healthkit/hkworkouteventtype/lap ,
  https://developer.apple.com/documentation/healthkit/hkworkouteventtype/segment ,
  https://developer.apple.com/documentation/healthkit/hkswimmingstrokestyle ;
  pool-length rewrite: https://discussions.apple.com/thread/255744735
- HealthFit export (vendor-affiliated, 2017): https://blog.finalsurge.com/?p=259
- [COROS] support: https://support.coros.com/hc/articles/360040257591 (via search;
  not fetched).
- [FORUM] intervals.icu: https://forum.intervals.icu/t/incorrect-pool-swim-interval-data/7966?page=2 ,
  https://forum.intervals.icu/t/questions-about-swimming-session-data-and-swolf-score-on-intervals-icu/74150
- intervals.icu OpenAPI: https://intervals.icu/api/v1/docs (`Activity.lengths`,
  `Activity.pool_length`).
- [REPO] files cited inline at `ea40a47`.
