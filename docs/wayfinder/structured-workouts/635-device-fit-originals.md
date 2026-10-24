# 635 — What a device-original FIT file writes for a structured workout

Analysis for [#635](https://github.com/leskraas/trainm8/issues/635) on map
#600. Written 2026-10-24. The files were fetched by this session with
`GET https://intervals.icu/api/v1/activity/{id}/file`, the endpoint the
production harvest uses, and decoded with the installed `@garmin/fitsdk`
21.208.0. They live in the private `leskraas/trainm8-private` under
`detection/fit/originals/`. Nothing from them is copied here: no coordinates,
no stream. Code references are to `main` at `a052d9a`. It answers the device
questions #604, #608 §3/§10, #609 §2.1 and #623 left open, and re-runs the
#625 scoreboard's v3* (d) row on device laps.

Tags: **[FILE]** a decoded original (named by its Intervals.icu id),
**[SDK]** the `@garmin/fitsdk` 21.208.0 profile (`profile.js`, line numbers),
**[RUN]** the throwaway probe in `635-probe/`, **[WEB-GARMIN]** Garmin's
developer and user forums, **[WEB-ICU]** the Intervals.icu forum (both are
forums, so lower trust; links in §10). **Unverified** marks what the
files here don't settle.

## Answer

- **All originals are Garmin's own files.** 99 fetched, 0 refused, 0 written
  by Intervals.icu: every `file_id.manufacturer` is `garmin` (FR965 53, fēnix 5
  44, fēnix 3 HR 2) [FILE]. The four named sessions are FR965 files.
- **`wkt_step_index` is reused for every rep, and across series.** A repeat
  is its own step and never gets a lap. `repetition_num` is never written
  (0 of 2,040 workout laps) [FILE].
- **A skipped step still writes a lap**, of about 1 s, with
  `lap_trigger = manual`. There is no skip event. `i163551672` (planned 5×4)
  ends with a 6 s recovery and a 1 s fifth rep, both manual, then the
  cool-down [FILE].
- **A trailing rest the watch skips writes nothing.** Two FR965 programs carry
  an undocumented field 18 = 1 on the repeat step. In those two the last
  rest of each repeat has no lap. The profile has no field 18 [SDK, FILE].
- **`workout_step` messages are in the file only for older activities.**
  FR965 activities up to 2024-08-07 had them in 24 of 24 workout files; from
  2025-08-08 on they appear in 0 of 19. All four named sessions are 0. fēnix 5
  from firmware 10.00 had them in 33 of 33 [FILE].
  - **The likely cause is Garmin, not the watch.** Since August 2025 Garmin
    sends third-party apps the workout steps in the FIT file only for workouts
    that app made itself. Intervals.icu's admin relayed this from Garmin
    [WEB-ICU].
  - All 97 files reached Intervals.icu on the same day (2026-07-07), so the
    delivery date doesn't explain the split; the activity's date does.
  - So `deviceWorkoutJson` (#608 §3) can be filled from these files for
    history, but **not for anything the owner records today** (§4).
- **FR965 types its laps; fēnix 5 doesn't.** On FR965 warm-up and cool-down
  are `warmup` / `cooldown`. On fēnix 5 and fēnix 3 every lap has no
  `intensity`, and the role is only in the step the lap points to [FILE].
- **Typed laps fix the rep count.** v3* (d) gets **13/97** exact rep counts
  on today's bulk laps. On the originals it gets **63/97** with typed warm-up
  and cool-down, and **77/97** when the role also comes from the lap's
  `workout_step` and laps under 5 s are dropped. Mean |Δreps| falls from 2.9
  to 0.4, with 93/97 at `high` both ways [RUN].
- **Pool: rest is an idle length, and a lap of its own only when the watch
  made one.** On the FR965 every set and every rest is its own manual lap. A
  rest lap has 0 m and one `idle` length. On the fēnix 5 the whole swim is one
  lap, with 12 idle lengths inside it. Neither swim carries GPS or a workout
  [FILE].

## 1. The files

| Id | Session | Device, firmware | `workout_step` | Laps (indexed) | Lap `intensity` |
|---|---|---|---|---|---|
| `i163551672` | 2026-01-18 "i5 5x4min" (planned 5×4, done 4) | FR965 27.09 | 0 | 11 (11) | warmup, active, recovery, cooldown |
| `i163549698` | 2026-04-07 "i3 10x3min" | FR965 27.09 | 0 | 22 (22) | warmup, recovery, active, cooldown |
| `i163549295` | 2026-04-20 "i3 20x45/15" | FR965 27.09 | 0 | 54 (54) | warmup, recovery, active, cooldown |
| `i164415201` | 2026-07-10 "i4 4x8 min" | FR965 28.05 | 0 | 10 (10) | warmup, rest, active, cooldown |
| `i163607797` | 2023-08-23 pool swim, 20 m | FR965 16.12 | 0 | 26 (0) | none |
| `i163604998` | 2023-03-08 pool swim, 25 m | fēnix 5 25.00 | 0 | 1 (0) | none |

- **Writer.** For example, `i163551672` has `file_id`
  `{manufacturer: garmin, garminProduct: fr965, type: activity}` and a
  `time_created` of the activity's own start. The bulk export's
  `development` / `Intervals.icu` / export date is not there [FILE].
- **The workout is referenced, not embedded.** All four run files carry a
  `training_file` message (global 72 [SDK 11803]) with
  `{type: workout, manufacturer: garmin, garminProduct: connect}` and that
  workout file's own serial and creation time. One of them, `i164415201`, was
  created in 2023 [FILE]. The step program is in that separate Garmin Connect
  workout file, which the activity endpoint doesn't return.
- **Pool swims in the history.** 723 activities hold 2 `Swim` (both pool) and
  1 `OpenWaterSwim`. Both pool swims were fetched.
- **The other 93.** To measure §5 on device laps, the originals of the other
  93 lap-labelled structured sessions of the #625 FIT half were fetched too.
  They are in the same private folder, with a table of device, firmware and
  step counts in its README.
- **Messages beyond the profile.** The FR965 files also hold global messages
  104, 113, 140, 141, 147, 233, 288, 325–327, 394 and 499. The profile names
  none of them [SDK `mesgNum` 23418–23545]. Global 26 (`workout`) and 27
  (`workout_step`) were counted straight from the record headers, so no
  decoder filter hides them (`rawmsgs.mjs`) [RUN].

## 2. Step index, repeats and series

### 2.1 What a lap carries

On every FR965 workout lap these are written:
- `intensity` (lap field 23 [SDK 7622]);
- `lap_trigger` (24 [SDK 7637]);
- `wkt_step_index` (71, type `message_index` [SDK 8162]).

`repetition_num` (61 [SDK 8102]) is never written: 0 of the 2,040 laps in the
81 workout files [FILE].

`i163551672`, planned 5×4 min with 2 min recoveries, as the watch wrote it:

| Lap | Start | Timer | `intensity` | `wkt_step_index` | `lap_trigger` |
|---|---|---|---|---|---|
| 0 | 0 s | 376 s | warmup | 0 | manual |
| 1 | 376 s | 240 s | active | 1 | time |
| 2 | 616 s | 121 s | recovery | 2 | manual |
| 3, 5, 7 | … | 240 s | active | 1 | time |
| 4, 6 | … | 121 s, 128 s | recovery | 2 | manual |
| 8 | 1706 s | **6 s** | recovery | 2 | **manual** |
| 9 | 1712 s | **1 s** | active | 1 | **manual** |
| 10 | 1713 s | 1352 s | cooldown | 4 | sessionEnd |

- **Each rep reuses the index.** Index 3, the repeat step, has no lap.
- **The recoveries end on the lap key here** (`manual`). The program's
  recovery step was open, or the athlete cut it short; the file doesn't say
  which.

### 2.2 Series and nested repeats

`i163605045` (fēnix 5, "i4 3x3m+2x1m+4x4") carries its program [FILE]:

```
0 warmup open · 1 recovery 180 s · 2 active 180 s · 3 recovery 60 s · 4 active 90 s
5 repeat → 3 ×2 · 6 recovery 60 s · 7 active 45 s · 8 repeat → 6 ×4 · 9 repeat → 1 ×3
10 cooldown open
```

Its laps' indices, in order:

```
0 1 2 (3 4)(3 4) (6 7)(6 7)(6 7)(6 7) | 1 2 (3 4)(3 4) (6 7)×4 | 1 2 (3 4)(3 4) (6 7)×4 10
```

- **Repeats nest.** `durationStep` is the step to loop back to and
  `repeatSteps` is the count (`repeat_until_steps_cmplt` = 6
  [SDK 24279]).
- **Series 2 rep 1 has the same index as series 1 rep 1.** Only the order
  tells them apart. This confirms the occurrence counting in #608 §3 step 3,
  and that `repetition_num` can't be the key: it isn't even written.

### 2.3 What the program simulator must model

`program.mjs` runs each file's `workout_step` program and lines it up with
the laps [RUN]. Of the 57 files with a program, 46 match exactly. The other
11 differ for the first three reasons below. The fourth comes from a file with
no program. Each one is a rule the #608 §3 simulator needs:

1. **Several laps can share one step.** There are 94 such pairs: 44 where an
   auto-lap (`lap_trigger = distance`, 1 km) splits a warm-up or a rep, and 50
   manual. In `i163604846` rep 1 is a 284 s lap and a 76 s lap, both index 2.
   *Rule:* consecutive laps with the same index are one step execution, unless
   the step is the last one (rule 4).
2. **Skip last recovery.** In `i163605884` ("Anaerob", 7×(60 s / 180 s)) and
   `i163606405` ("Sprint", 2×(3×(15 s / 180 s)) + 300 s), the last rest of
   each repeat has no lap.
   - Both repeat steps carry field **18 = 1**.
   - `i163613757` (10×400 m) carries field 18 = 0 and writes its last
     recovery.
   - fēnix 5 repeats don't carry field 18 and always write the last rest.
   - The profile's `workout_step` defines fields 0–13 and 19–22, but not 18
     [SDK 17670–18447]. So **field 18 reads as "skip last recovery"**, the
     Garmin Connect option of that name. Three files show it.
   - A FIT SDK forum post reports the same field from a workout exported with
     the option on: "field definition 18 set as a U8 to 1". Garmin never
     answered it, so it is still not in the profile [WEB-GARMIN].
   - Garmin Connect users report two more things [WEB-GARMIN]:
     - the checkbox shows only when a repeat ends on a Rest or Recover step;
     - it is on by default after Recover and off after Rest, and "on older
       watches, the last rest/recovery is never skipped".

     That fits the fēnix 5 here, which always writes the last rest.
   - *Rule:* with field 18 = 1, the trailing rest steps of a repeat's last
     pass are not program positions. They are never missed.
3. **Laps after the program.** After the last step, what the watch writes
   depends on the device:
   - FR965 2026 keeps the last step's index and `cooldown` (`i163549295`: 13
     laps on index 4).
   - FR965 2023 writes `cooldown` with no index (3 files).
   - fēnix 5 writes neither (3 files, 27 laps in all).
   - *Rule:* a lap after the program's end is unplanned, whatever its index.
4. **Unrolled programs.** `i163553436` (FR965 24.12, "3 x 10 minutter")
   indexes its reps 1, 3, 5 and its rests 2, 4. It is a program written
   without a repeat step. *Rule:* a set can't be "laps that share an index"
   (see §6).

## 3. Skipped steps and an early end

- **Skipping writes a lap of about 1 s.** In the files there are 43 indexed
  laps under 5 s, all `manual`, in 9 files. They come in two forms [FILE]:
  - **Lapping through a step.** Example: the 3 s rest that opens
    `i163549698` and `i164415201`, whose programs put the rest before the
    rep.
  - **Lapping through what is left of the program to reach the cool-down.**
    `i163604757` (fēnix 5, 15×45/15) runs 11 reps, then laps of 4 s and seven
    of 1 s, alternating index 1 and 2, then the cool-down. `i163551672` does
    the same for its fifth rep.
- **No message marks a skip.** The only events are:
  - `timer` start and stop;
  - HR and speed alerts;
  - unnamed markers 38, 39, 48, 49 and 50 [SDK 24174–24221].

  The profile has `event = workout_step` (4 [SDK 24177]), but no file writes
  it [FILE]. Garmin's `split` messages (312) are written per step execution:
  `i163551672` has 5 `intervalActive` splits, the last one 0.7 s
  [SDK 28103, FILE].
- **So a Garmin skip reads as *executed, about 1 s*, never as *missed*.** A
  program position with no lap happens only through skip-last-recovery
  (§2.3). #608 §3's rule "a rep lapped through after 8 s is executed" holds.
  Below about 5 s the lap is a skip artefact. The reading may show it as
  *skipped*, but it must not count as a rep (§5).
- **Early end.** No workout file ends mid-program without lapping through:
  all 81 reach their last step, or lap through to it [RUN]. A rep cut short
  is a short manual lap with the rep's index. `i163611343` ("10x3,5min"): the
  10th rep is 47 s, `manual`, then the cool-down. Every session ends on a
  `sessionEnd` lap. **Unverified:** a session stopped and saved mid-rep.

## 4. Warm-up, cool-down and the workout program

- **FR965 types its laps.** It writes `warmup` and `cooldown` (and
  `rest`/`recovery`/`active`/`interval`), the step's intensity, on every lap
  of its 43 workout files (1,244 laps). Which word a rest gets depends on how the workout was authored:
  `i164415201`, from 2023, writes `rest`, the 2026 workouts `recovery` [FILE].
  The bulk export writes them all `active`, which is why v3 counted the
  warm-up and cool-down as reps (#625).
- **fēnix 5 and fēnix 3 write no lap `intensity`**: none on the 796 laps of the 38 fēnix 5 workout files, nor on the fēnix 3 laps [FILE]. On a
  fēnix 5 from 10.00 the role is there, but only through the program:
  `workout_step[wkt_step_index].intensity`.
- **The program in the activity file:**

  | Device | Activities | Firmware | Workout files | With `workout` + `workout_step` |
  |---|---|---|---|---|
  | FR965 | 2023-05-27 – 2024-08-07 | 4.19 – 19.18 | 24 | 24 |
  | FR965 | 2025-08-08 – 2026-08-12 | 24.12 – 28.05 | 19 | **0** |
  | fēnix 5 | 2018-06 – 2018-08 | 8.00 – 9.20 | 5 | 0 |
  | fēnix 5 | 2018-08 – 2023-04 | 10.00 – 25.00 | 33 | 33 |

  The owner has no FR965 workout between 2024-08-07 and 2025-08-08. So these
  files can't tell a firmware change from a change on Garmin's side. The
  sources point at Garmin [WEB-ICU]:
  - **The change.** From 15 August 2025, Intervals.icu users reported that
    activities synced from Garmin Connect had lost their workout details. The
    admin found that "the one automatically sent to Intervals.icu from
    Garmin Connect does not include the workout step messages". He then
    relayed Garmin's explanation: "There was a change where 3rd party app will
    receive workout details in the FIT file only if the 3rd party generated
    workouts" (9 September 2025).
  - **The workaround.** A file exported by hand from Garmin Connect ("Export
    Original") still has the steps, and imported by hand it pairs again.
    Intervals.icu's own "Original FIT" download doesn't help: it is the
    stripped file, as here.
  - **Not settled.** One user ran a workout built in Intervals.icu and still
    got no steps. So whether the app that made a workout really gets it back
    is unconfirmed.

  When it is there, it is complete: `wkt_name`, `num_valid_steps`, and steps
  with `duration_type` (`open`, `time`, `distance`,
  `repeat_until_steps_cmplt`), duration, `target_type` (`heart_rate`, `open`,
  …), custom HR band and `intensity` [FILE, SDK 17416, 17670].
- **What this means for `deviceWorkoutJson` (#608 §3):**
  - It can be filled at ingest and by the zero-I/O backfill for the older
    files.
  - It stays empty for every workout the owner records today, through
    Intervals.icu or any other third party. For those the program has to come
    from elsewhere:
    - the plan trainm8 pushed, when it pushed it (#541 W2). If Garmin keeps
      its word, a workout trainm8 made would come back with its steps when
      trainm8 reads Garmin directly (#541 FIT-first). That is unconfirmed;
    - the Garmin workout the `training_file` serial names (no API here);
    - or the laps themselves. This is what Intervals.icu falls back to: its
      "Use paired workout steps for laps" option (December 2024) lays the
      planned workout's steps over the recording, with a manual time offset
      [WEB-ICU].
  - Without the program, a missed position can't be seen. But a Garmin skip
    writes a lap anyway (§3), so almost nothing is lost. What is lost is the
    skip-last-recovery rule, which then reads as one rep's rest fewer, never a
    rep fewer.

## 5. The scoreboard, re-run on device laps

`all635.ts` scores v3* (d) on the 97 lap-labelled structured sessions of the
#625 FIT half [RUN]:
- profile `label-power`;
- the production grid stream from the bulk file, which is the same on both
  sides;
- the same labels and scorer (`eval/score.ts`);
- only the laps change.

| Laps fed to v3* (d) | Reps exact | Mean \|Δreps\| | At `high` |
|---|---|---|---|
| Bulk export (today's (d) row) | 13/97 | 2.9 | 93/97 |
| Originals, warm-up/cool-down read as `active` | 24/97 | 2.2 | 80/97 |
| **Originals, typed warm-up/cool-down** | **63/97** | 1.1 | 80/97 |
| Originals, typed, with `wkt_step_index` | 62/97 | 1.1 | 80/97 |
| Originals, typed, active laps < 5 s dropped | 63/97 | 1.1 | 80/97 |
| **Originals, role from the lap, else from its `workout_step`** | 75/97 | **0.4** | **93/97** |
| … and active laps < 5 s dropped | **77/97** | **0.4** | 93/97 |

- **The four named sessions.** On bulk laps v3* gets 0 of 4 exact: 6/4, 12/10,
  33/20 and 6/4. With typed laps it gets 4 of 4 once the 1 s skip lap of
  `i163551672` is dropped (5/4 without that step).
- **Typed warm-up and cool-down fix most of it.** On the 51 FR965 sessions,
  exact rep counts go from 6 on bulk laps to 44 on typed originals.
- **The fēnix 5 files need the program.** Their laps carry no role, so on
  originals v3 falls back to its stream gate. That is the drop to 80/97 at
  `high`. Reading the role through `wkt_step_index` restores it, and takes
  the 44 fēnix 5 sessions from 6 (bulk) through 18 to 32 exact.
- **The step index as v3 uses it costs one session.** §2.1 of `609-detection-v3.md`
  starts a new set at every change of index. That splits the unrolled
  `i163553436` into three sets of one, so it gets 1/3. Roles alone get 3/3.
- **The 20 that are still not exact.** None is a typed-lap failure:
  - **10 have no program or role in the file.** These are hand laps or
    fēnix 3/5 laps without steps, and the originals change nothing there.
  - **10 disagree with a label built from the bulk laps:**
    - the watch ran more reps than the label counts: `i163603847` 8 vs 7,
      `i163604168` 8 vs 7, `i163604779` 10 vs 9, `i163606405` 6 vs 5;
    - the last rep was cut short: `i163611343` 10 vs 9, its 10th rep is 47 s;
    - an auto-lap split a rep: `i163604846`;
    - an unrolled program: `i163553436`;
    - hand laps after the program: `i163604687`;
    - open steps ended by hand: `i163603904`;
    - `i163611517`, typed but without index.

  Re-labelling from the originals is a corpus change (§7).

## 6. What changes on the map

| Decision | What the files say | Change |
|---|---|---|
| #608 §3 *program run, occurrence counting* | Index reused per rep and series; `repetition_num` never written (§2) | Stands. Add rules 1–4 of §2.3, chiefly skip-last-recovery (field 18) and same-index lap runs. |
| #608 §3 *missed vs executed* | A Garmin skip writes a ~1 s manual lap; no lap only through skip-last-recovery (§3) | "Missed" is rare on Garmin. A < 5 s manual step lap reads as *skipped*, not as an executed rep. |
| #608 §3 *`deviceWorkoutJson` from the file* | In the file for FR965 activities up to 2024-08 and fēnix 5 ≥ 10.00; absent for every activity since 2025-08, most likely because Garmin strips third-party steps (§4) | Keep it nullable. It is empty for today's recordings via Intervals.icu. The pushed plan (or the laps) must stand in. |
| #609 §2.1 *trust typed step laps* | FR965 types warm-up/cool-down; fēnix types nothing but points to its steps (§4) | Role = lap `intensity`, else `workout_step[wkt_step_index].intensity`. Drop step laps under 5 s. Group sets by role pattern, not by "same index". Measured 13 → 77/97 exact (§5). |
| #609 §2.1 *depends on the FIT parser* | `fit-parser.server.ts:239-255` still keeps `{startSec, endSec}` | Unchanged dependency. The parser must also keep `workout_step`. The eval reader (`eval/fit.ts`) already does. |
| #623 *rest is its own lap* | FR965: yes, a 0 m lap with one idle length. fēnix 5: one lap for the whole swim, rest as idle lengths inside it (§8) | Rest is the **idle length**. A rest lap exists only when the watch made one. Read idle lengths, not idle laps. |
| #603 read order (athlete → engine → device step laps) and ADR 0032 as amended | Nothing in the files touches it | Stands. |

## 7. Glossary and ADRs

- **No glossary entry changes.**
  - **Activity Interval** still reads right. Its "device's workout-step laps"
    are what the files hold.
  - **Plan Mapping** and **Skipped Step** are not glossary terms yet. They
    live in `608-plan-mapping.md`. They get their entries when #608's build
    lands, and §3 here should be their definition then: *skipped* = a
    program step with a lap under about 5 s, ended by hand.
- **No ADR changes.**
  - **ADR 0032**, as amended by #603, decides the layers, not how a device
    lap is read.
  - **ADR 0034** and **ADR 0049** don't touch lap content.
  - `deviceWorkoutJson` is a #608 proposal, not an ADR.

## 8. Pool swims (#623)

| | `i163607797` (FR965, 20 m) | `i163604998` (fēnix 5, 25 m) |
|---|---|---|
| `session` | `sub_sport = lapSwimming`, `pool_length = 20`, `pool_length_unit = metric`, `num_lengths = 17`, `num_active_lengths = 17`, 340 m | `lapSwimming`, `pool_length = 25`, `metric`, `num_lengths = 45`, `num_active_lengths = 33`, 825 m |
| Laps | 26, all `manual`: 13 sets (1–2 active lengths) and 13 rests (0 m, 0 active lengths) | **1**, `swim_stroke = mixed`, all 45 lengths |
| Lengths | 31: 17 `active` (freestyle, strokes, cadence, speed) and 14 `idle` (no stroke, speed 0) | 45: 33 `active` (25 freestyle, 8 breaststroke) and 12 `idle` |
| Rest | one idle length = one rest lap, 19–142 s | 12 idle lengths of 30–119 s inside the single lap |
| Timer | one stop and start mid-swim (12 s); the idle laps on either side are two laps | no pause; timer 2545 s against elapsed 2597 s |
| Records | `heart_rate` only, about 1 s apart (no distance or speed) | distance, speed and cadence, no HR |
| `intensity`, `wkt_step_index` | none on any lap | none |
| GPS, workout | none, none | none, none |

- **`num_lengths` disagrees between the two.** On the FR965 `session.num_lengths`
  counts active lengths only (17 of 31 length messages). On the fēnix 5 it
  counts all of them (45). Count lengths from `length_type`, never from
  `num_lengths` [FILE, SDK 25289].
- **Swim pace has to come from lengths on the FR965.** Its records carry no
  distance, so the stream can't place sets.
- **Unverified:**
  - a pool swim run as a workout (the send-off rest question in #623);
  - drill mode;
  - any non-Garmin brand. The owner's history has none.

## 9. Left open

- **Re-label the FIT half from the originals and switch the scoreboard to
  them.** The 97 are already stored privately. `lapsFor` in
  `scripts/detection/fit-eval.ts` would take the role from the step, and the
  < 5 s drop. That is a corpus change, with a new freeze, so it belongs to the
  v3 build ticket, not to this one.
- **Field 18**: three files here and one forum report agree, but Garmin hasn't
  documented it. Read it as "skip last recovery". If it is absent, assume
  off.
- **COROS, Polar, Wahoo and Apple via HealthFit** stay unverified (#604 §5).
  The owner has only Garmin, and no first-party documentation says what their
  FIT exports write (§10). The rule that settles it is cheap: a file without
  `wkt_step_index` takes the untyped-lap path of #609 §2.1, whatever the
  brand.
- **A program for files since 2025-08.** Matching the `training_file` serial to
  a workout trainm8 pushed is the cheap route, if push lands (#608).

## 10. What others do (web, 2026-10-24)

- **Intervals.icu**:
  - **Laps to steps.** It labels a lap by its step only when the file carries
    `workout_step` messages and the lap's `wkt_step_index`. That works from
    Garmin Connect, a manual FIT upload or Dropbox, never from Strava.
  - **Skips.** It doesn't infer a skip. A rep abandoned after 2 of 5 minutes
    still reads as planned after a reprocess. Its admin points at the reason:
    the Garmin lap key both marks a lap and advances a step, so the file
    can't tell the two apart.
  - **Without steps.** Its fallback is "Use paired workout steps for laps"
    (December 2024): the planned steps laid over the recording, with a time
    offset the athlete sets by hand.
  - **What trainm8 does better.** The Plan Mapping (#608) aligns without that
    manual offset, and with the rules in §2.3.
- **Garmin's API filter (from August 2025).** A third party receives the
  workout steps in the FIT file only for workouts it created. "Export
  Original" from Garmin Connect keeps them (§4).
- **TrainingPeaks.**
  - Per-interval figures come straight from the file's laps. Intervals.icu
    recomputes them from the samples.
  - Plan compliance is whole-session only: green within ±20 % of planned
    duration, distance or TSS, red when not done.
  - No per-interval verdict was found. That matches #632's whole-session
    Structure Adherence.
- **COROS, Polar, Suunto, Wahoo.**
  - COROS's app shows a done workout as warm-up, rep, rest and cool-down laps,
    but its docs don't say whether the FIT export writes `wkt_step_index` or
    `intensity`.
  - Polar Flow exports FIT, and its phases have no documented FIT encoding.
  - Nothing found for Suunto or Wahoo.

  So the brand rows in #604 §5 stay unverified, and the fallback in §9
  covers them.

Sources:
- [Field definition for skipping last repeat on workout](https://forums.garmin.com/developer/fit-sdk/f/discussion/424362/field-definition-for-skipping-last-repeat-on-workout/1986142) (FIT SDK forum)
- [Running workouts: remove last recovery in run repeat](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/424634/running-workouts-remove-last-recovery-in-run-repeat/1984949) and [Skip last recovery issue in repeat blocks, Garmin Swim 2](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/415083/skip-last-recovery-issue-in-repeat-blocks-garmin-swim-2/1946645)
- [Request: steps-level breakdown for running activities](https://forums.garmin.com/developer/fit-sdk/f/discussion/427166/request-steps-level-breakdown-for-running-activities-start-end-time-per-segment/1994461) (FIT SDK forum: `wkt_step_index` ↔ `workout_step.message_index`)
- [No workout details on Garmin activity since August 15](https://forum.intervals.icu/t/no-workout-details-on-garmin-activity-since-august-15/111170) and [Garmin workout lap syncing](https://forum.intervals.icu/t/garmin-workout-lap-syncing/110392) (Intervals.icu forum, Aug–Sep 2025)
- [Intervals from workout (Use Paired Workout For Laps)](https://forum.intervals.icu/t/intervals-from-workout/82696/5), [Laps and interval detection updates](https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779), [Lap button usage](https://forum.intervals.icu/t/lap-button-usage/121072)
- [TrainingPeaks compliance colours](https://help.trainingpeaks.com/hc/en-us/articles/204861204), and [intervals.icu vs TrainingPeaks lap averages](https://forum.intervals.icu/t/solved-different-average-power-values-in-laps-between-interval-icu-and-trainingpeaks-for-40-20-intervals-ans-tp-uses-lap-data-directly/114116)
- [COROS activity summary](https://support.coros.com/hc/en-us/articles/15284799576980-Activities-Page-Activity-Summary), [Polar Flow for Coach](https://support.polar.com/en/polar-flow-for-coach)
