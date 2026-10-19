# Plan Mapping: what was done, mapped onto what was planned

The asset for the ticket *Map what was done onto what was planned* (#608) on
the map *structured workouts everywhere* (#600). The agent answered what the
code and the data could answer, and left three choices to the owner (§9). Code
references are to `origin/main` at `ea40a47` unless a branch is named. The
prototype was throwaway TypeScript in the agent's scratch area, run with `tsx`
against the repo's own `analyze()` and the #605 corpus. It is not in the repo.

## In one paragraph

`readRecording` pairs the intervals of **one** layer with the plan's Executed
Steps. It never moves an edge, never adds or removes an interval, and never sets
a role. When the watch ran a structured workout, the pairing is exact: each lap's
`wkt_step_index` and how many times that index has already occurred give a
position in the file's own step program, and the program is lined up with our
plan once. Every other case uses one aligner: a monotone, gap-tolerant DP over
the two sequences, with merge and split moves. The output says, per planned
step, *executed*, *merged*, *missed*, *not found* or *not on the watch*, and
lists the intervals that were *unplanned*. A planned step reads *missed* only
when the watch's own program shows it was skipped. Everywhere else a gap reads
*not found*, because a layer that cannot see a rep is not evidence that it was
skipped. It costs ≤ 10 ms for 82 planned steps, so no cache is needed. Placing
the plan on the raw stream is **not** part of the mapping (§6).

## 1. Where it sits

The mapping is part of the reader. It is pure, computed every time it is read,
and never stored (map #600 Settled 1; #603 Q1, `603-activity-interval.md:138`).

The #602 signature (`602-workout-reading.md:17`) needs one change. It takes
`intervals`, but the reader also needs three more things:
- the import's summary, to build the whole-session interval (#603 Q2);
- every layer, to choose one;
- the FIT file's workout program (§3).

```ts
type ReadableRecording = {
  layers: { athlete: ActivityIntervalInput[]; engine: ActivityIntervalInput[]; device: ActivityIntervalInput[] }
  summary: ImportSummary              // for the whole-session interval
  deviceWorkout: DeviceWorkout | null // the FIT file's workout + workout_step list (§3)
}
readRecording(recording: ReadableRecording, thresholds, plan?: WorkoutReading): WorkoutReading
```

`plan` is the plan's own `WorkoutReading`. Its `steps[i].key` is the `StepKey`.
The mapping reads `steps` already expanded (reps × series, synthetic rests),
with role, duration, distance and duration source. The plan is not expanded a
second time.

The output replaces `ExecutedStep.planned: number | null`
(`602-workout-reading.md:84`). A merged interval covers several planned steps,
and a split step covers several intervals, so one number is not enough:

```ts
type PlannedLink = { planIndices: number[]; part: 'whole' | 'piece' | 'span' }
// on each recording ExecutedStep:  planned: PlannedLink | null

type PlanMatch =
  | { status: 'executed'; steps: number[]; via: 'device-workout' | 'aligned' | 'athlete-pin' }
  | { status: 'merged'; step: number }          // inside one interval that spans whole reps
  | { status: 'missed'; evidence: 'device-workout' }
  | { status: 'not-found' }                     // the layer cannot say
  | { status: 'not-on-device' }                 // the watch ran a workout without this step

type PlanMapping = {
  layer: 'athlete' | 'device' | 'engine' | 'whole'
  source: 'device-workout' | 'aligned' | 'none'
  pairing: 'paired' | 'unknown' | 'unpaired'
  byPlanStep: PlanMatch[]   // index = plan.steps index
  unplanned: number[]       // recording step indices with no planned step
}
// on WorkoutReading: mapping: PlanMapping | null   (null when no plan was passed)
```

List views that only need `summary` do not pass `plan`, so they pay nothing.

## 2. Which layer is mapped

Exactly one layer is mapped. The alignment never reaches below the chosen layer,
because mixing edges from two layers would draw a structure that nobody
recorded.

**The order needs one change from #603** (`603-activity-interval.md:30`):
athlete → **device workout-step laps** → engine → whole session. When workout-step
laps exist, they are the watch running the plan. They give exact edges and
full-rate figures. The engine can only reproduce them or lose information. The
scoreboard shows that it loses information: with perfect step laps fed in,
engine v2 gets reps exact in 1/9 (#605). Mapped through the prototype, the engine
layer built from perfect laps gives these executed work reps:

| Session | engine layer, perfect laps in | device step laps |
|---|---|---|
| i3 15x45/15 | 10/15 (5 merged) | 15/15 |
| i3 20x45/15 | 16/20 | 20/20 |
| i3 25x45/15 | 9/25 (16 merged) | 25/25 |
| i3 10x3 min | 8/10 (rep 1 inside the warm-up) | 10/10 |

The engine still runs plan-blind and is still stored. Structure Adherence and
materialization still read it. Only the reading prefers the laps. This is the
owner's call in §9 Q2, because the #603 order was accepted.

## 3. Exact: the watch ran a structured workout

**What a FIT file says** (`@garmin/fitsdk` profile; #604 §1.5):
- `lap.wkt_step_index` (field 71) is a `message_index` into the
  `workout_step` messages in the same file.
- A repeat is its own step, `duration_type = repeat_until_steps_cmplt`, with
  `duration_step` = the index to loop back to and `repeat_steps` = the count.
  Repeats nest, so `3 × (13 × 30/15)` uses one inner and one outer repeat step.
- Each rep's lap reuses the same index. `lap.repetition_num` (field 61) counts
  within one repeat step, so it cannot tell series 2 rep 1 from series 1 rep 1.

**The algorithm**
1. **Run the program.** Simulate it the way the watch does: a program counter,
   and one counter per repeat step that resets when the repeat finishes. This
   gives every position in order as `(index, occurrence)`, so the 39 work reps of
   `3 × 13` are index 1, occurrences 0…38.
2. **Line the program up with the plan once.** Use the aligner from §4 with
   merges off and splits on. A workout authored elsewhere still lines up: a
   warm-up written as `10′ + 5′ strides` splits over our one warm-up step. The
   step quantities (time, distance, open) and `intensity` (warmup / active / rest
   / recovery / cooldown) are the features.
3. **Key each lap.** Count earlier laps with the same index to get its
   occurrence, then go from `(index, occurrence)` to the program position and on
   to the plan step. Occurrence counting is the rule. `repetition_num` is only
   a check.
4. **Classify the rest:**
   - a program position with no lap is **missed**, because the watch had the
     step and recorded no lap for it;
   - a plan step the program never had is **not on the watch**;
   - a lap with no index, before or after the workout, is **unplanned**;
   - a program position with no plan step (the watch ran 25 reps, the plan says
     20) is **unplanned**.

A rep lapped through after 8 s is **executed**, as an 8 s interval. The reading
shows 8 s and never calls it missed. The athlete can see what happened.

**This needs the file's step list to be stored.** #603 keeps `deviceStepIndex`
on each lap row, but not the program it points into. Without the program, a rep
the watch skipped can't be told from a rep that was never on the watch. Then the
case falls back to §4 and reads *not found* instead of *missed*. The program is
a measured fact about the file: what the watch was told to run. So it is allowed
in storage (Settled 1). Proposal: a nullable `ActivityImport.deviceWorkoutJson`,
written at FIT ingest and by #603's zero-I/O backfill from `ActivityFile`
bytes. This amends the #603 model (ADR 0032 as amended in #622).

## 4. Everything else: one aligner

Inputs: the plan steps `P[0..m)` and the chosen layer's intervals `I[0..n)`.
`D[i][j]` is the cheapest way to account for the first `i` steps and the first
`j` intervals.

| Move | Meaning | Cost |
|---|---|---|
| match | `I[j]` executed `P[i]` | role + quantity |
| skip step | `P[i]` has no interval | 2.0 |
| extra | `I[j]` has no planned step | 2.0 |
| merge | `I[j]` covers whole reps `P[i-k..i)` of one block, k ≥ 2 reps | 0.75 + role + quantity of the sum |
| split | `P[i]` covered by `I[j-k..j)`, every piece in its role | 0.75·(k−1) + roles + quantity of the sum |
| pin | the athlete said "`I[j]` is `P[i]`" (#624) | forced |

- **Role.** A known role (athlete row, engine row above the gate, FIT
  `intensity`) costs 0 when equal, 0.5 when near (warm-up vs recovery), and 3 for
  work vs rest. With no role, intervals.icu `providerType` is a soft hint
  (1.5 against). With neither, the layer's own intensities are split by
  2-means, and only when the two means are ≥ 8 % apart.
- **Quantity.**
  - Distance against distance: `2·|ln(done/planned)|`.
  - Otherwise duration against the step's duration (authored, paced or
    estimated): the same formula, capped at 4.
  - An open step costs 0: lap button, `toHr`, `act`
    (`workout-schema.ts:406-407,476,486`), or an unknown duration with only a
    `nominalSec`.
- **Ties go to the gaps.** Gaps are tried first, so when costs are equal the
  extra or missing reps land at the end. The watch runs steps in order, and an
  athlete who stops early stops at the end.
- **Clock-free.** The aligner reads sequences, not timestamps. A recording
  started four minutes early just adds one unplanned interval at the front. No
  offset is searched.
- **Cost.** O(m·n·(span + 8)). Measured warm: 82 steps × 82 intervals takes
  9 ms, and × 300 intervals takes 32 ms. Every real case is ≤ 62 intervals.
  **No cache.**

**Pairing.** Call a planned work step *seen* when it is executed or missed. Then:
- **paired**: at least half the planned work steps are seen;
- **unknown**: the layer says nothing per rep. Either it is the whole-session
  interval, or most work steps are only merged;
- **unpaired**: the layer has structure, and it is not this plan.

Unpaired turns every status into *not found*, except *not on the watch*. A
mapping can be no more honest than its layer: an engine false claim can still
pair (one of 140 runs in the negative control below).

## 5. Cases (prototype output)

Plans come from the title: an open warm-up, `N × (work, recovery)` and an open
cool-down. "D" cases are FIT step laps with a program, shaped from the real
intervals.icu summaries in `prisma/seed-data/intervals-real-history.json`. "I"
cases are intervals.icu-style laps with no index.

| # | Case | Expected | Got |
|---|---|---|---|
| D1 | `Oslo - i3 10x3min`: 22 laps, run as planned | all exact | 22/22 executed via device-workout |
| D2 | `Oslo - i5 5x4min`: 10 laps, 4 × 4′01″, then the cool-down | rep 5 + rest 5 missed | 4 executed, 1 work + 1 rest **missed**, cool-down executed |
| D3 | rep 3 lapped through after 8 s | executed, 8 s | executed, interval 8 s |
| D4 | `Oslo - i3 20x45/15` done as 25 × 45 s (watch had 25, plan 20) | 20 executed, extras unplanned | 20/20 executed, 10 laps unplanned (the 5th extra rest folds into the cool-down) |
| D5 | workout authored elsewhere: WU as 10′ + 5′, 6 × 1000 m distance steps | exact | 14/14 executed; WU split over two laps |
| D6 | `3 × (13 × 30/15)` + 6′ between series, nested FIT repeat | 78 + 2 series rests | 82/82 executed; the watch's 3rd series rest folds into the cool-down |
| T1 | recording started 4 min before the workout | first lap unplanned | 22/22 executed, 1 unplanned |
| X1 | plan 5 × 6′, the watch ran 20 × 45/15 | unpaired, nothing charged | **unpaired**; reps not on the watch, 34 laps unplanned, nothing missed |
| I1 | `Oslo - i4 30x45(15p)`: 62 laps, only 28 typed WORK | 30/30 by duration | 30/30 executed; `providerType` overruled by duration |
| I2 | plan 5 × 4′, 6 WORK done | 1 extra | 5 executed, the 6th rep unplanned |
| I3 | 6 × 1 km at 3:32–4:07, 90″ rests | by distance | 6/6 executed |
| W1 | no laps, below the gate, vs 5 × 6′ | unknown | **unknown**, every step not found, nothing missed |
| W2 | whole session vs one steady 60′ step | executed | executed (58′ vs 60′) |
| A1 | athlete keeps reps 2–3 as one 10′ interval | merged | reps 2–3 **merged** into one interval; the rest executed |
| A2 | athlete layer: 4 reps for 5 planned, then a pin "interval 1 is rep 2" | rep 5 not found → after the pin, rep 1 not found | as expected; the other reps re-flow around the pin |

**The corpus** (9 structured runs; `tests/fixtures/detection/corpus.json`):

| Layer | Work reps executed |
|---|---|
| Laps from the labels, no index, no type (figures only) | 9/9 sessions exact; only the trailing rest, which the labels lack, is not found |
| Engine v2, label-power, stream only | 45/15 sessions **unknown** (all reps merged into one block); 10x3: 8/10; 5x6: 5/5 |
| Engine v2, seed profile | no detection → whole session → **unknown** |
| Negative control: 35 unstructured × 4 plans | 139/140 unknown; 1 paired, on an engine false claim (`3 × 340/25`) |

## 6. Plan-guided alignment stays out of the mapping

Findings §8 item 4 proposes placing the plan on the stream: an offset by
cross-correlation, then segmental DP over PELT ∪ laps ∪ pauses. **Decided: not
part of #608.** Three reasons, from the code and the data:

1. **It needs the stream, and the reader has none.** `readRecording` is pure
   over intervals. Placing edges from the stream is detection. It belongs in
   the engine (#609), and its output would be an engine row. That is the plan
   as a prior, which ADR 0034 §1 forbids (`0034…md:24-34`).
2. **It finds the plan whether or not it was run.** The corpus's own rigid
   placer (`fitTemplate`, `eval/label.ts:59`) was run on every run, with each
   plan:
   - by its contrast score, it places a `5 × 6′` on **6 of 28** unstructured
     runs and `15 × 45/15` on 2 of 35, at the contrast the real sessions have
     (≥ 1.33);
   - on the `20x45/15` session it "finds" `5 × 6′` at a contrast of 18.8, by
     dropping the recoveries onto stops.

   A rep-wise test (each rep ≥ 8 % above both flanking recoveries, with no
   stopped sample) separates better: right plans score 0.6–1.0, and unstructured
   runs score at most 0.53. That is a thin margin, on 9 positives from one
   athlete.
3. **The labels are circular.** The corpus's work windows were placed by that
   same square-wave fit (`tests/fixtures/detection/README.md`). A plan-guided
   aligner scored on them grades itself. Held-out truth needs real step laps
   (#625).

**How this squares with ADR 0034 §1.** The mapping uses the plan only to *pair*
intervals whose edges were drawn without it. It moves no edge. It feeds no
Detection Confidence, no materialization and no Structure Adherence. That is
the same category as `structureAdherence(detected, planned)`, which ADR 0034
already allows. So §1 stands for detection, and gains one clarifying sentence.
Whether a plan-placed engine variant is ever allowed is owner choice Q1.

## 7. What the athlete sees

- **Each planned step pairs with its executed numbers**, under the #601 dashed
  outline drawn over the interval it maps to.
- **Missed** is an empty dashed frame, and the row says "4 av 5 drag". This
  appears only with device-workout evidence.
- **Not found** is also a dashed frame, but quiet and with no count. The row
  says, for example, "Dragene ble ikke funnet i opptaket".
- **Merged** draws one bar under the bracket of the reps it covers, with
  block-level numbers. There are no per-rep numbers.
- **Unplanned** intervals draw with no outline. "+5 drag utover planen" is a
  count, not a verdict.
- **The source** shows only when the pairing isn't exact: "Koblet etter
  varighet", "Fant ikke dragene".
- **Unpaired:** see owner choice Q3.

## 8. ADR and doc amendments

| Where | Change |
|---|---|
| ADR 0034 §1 (`:24`) | Add: *"Mapping a recording's intervals onto the plan's steps is not detection. It pairs intervals whose edges were drawn without the plan, moves no edge, and feeds no Detection Confidence, materialization or Structure Adherence."* Plan-placed edges stay refused (Q1). |
| ADR 0034 §2 (`:43`, `:59`) | "Whole-session, never per-step" becomes "the verdict is whole-session; the per-step **mapping** is allowed, as executed numbers with no pass/fail". The asymmetry moves into evidence: a missing step may be stated as *missed* only on the watch's own program. On any other layer it reads *not found*, never charged to the athlete (ADR 0008). |
| ADR 0020 (`:74`) | "never asserts a per-step verdict from automatic telemetry-to-step alignment" becomes "may map intervals to steps (ADR 0034); never a per-step verdict". |
| ADR 0032 as amended in #622, and `603-activity-interval.md` §1 | Read order: athlete → device workout-step laps → engine → whole (Q2). Add `ActivityImport.deviceWorkoutJson` (§3). |
| `602-workout-reading.md` | `readRecording(recording: ReadableRecording, …)`; `planned: PlannedLink \| null`; `WorkoutReading.mapping`. |
| `GLOSSARY.md` | New term **Plan Mapping**: *the pairing of a Recording's intervals with the plan's Executed Steps, made when the reading is made. Each planned step reads executed, merged, missed, not found, or not on the watch. Missed only when the watch's own workout shows the step was skipped. Never a verdict. Avoid: compliance, step adherence, alignment score.* |

## 9. For the owner

**Q1. Recordings without laps (Strava: 0/53 seed activities carry laps).** Until
engine v3, their reps read *unknown*.
- (a) Accept that. ADR 0034 §1 stands as it is.
- (b) Let #609 measure a plan-placed engine variant against #625's held-out real
  step laps. Adopt it only if it makes 0 pairings on the 35 unstructured runs,
  and label its intervals as placed from the plan.
- (c) Put plan-guided placement in the reader now.

*Recommend (b).* (c) is refused by §6.

**Q2. The read order.** Should device workout-step laps outrank the engine?
- (a) Yes, amend #603.
- (b) No, and require engine v3 to copy step laps verbatim.

*Recommend (a).* It is right for every engine version, and costs nothing.

**Q3. A session that doesn't read as its plan** (pairing `unpaired`).
- (a) Show the recording's Profil alone, with the plan as its own row
  ("Planlagt"). The sentence is "Økta på klokka var en annen enn planen" only
  with device evidence; otherwise there is no sentence. Offer the existing
  relink: *it was this session* / *en ekstra økt*.
- (b) Pair best-effort anyway.
- (c) Show nothing.

*Recommend (a).*

## 10. Left open

- **Decode one real structured-workout FIT** (#625 / #604's open item). Does an
  FR965 emit one lap per executed step, reuse the index per rep, and write
  `repetition_num`? What does it write on *skip step*, and on ending early? §3
  rests on the FIT profile, not on a decoded file. COROS and Polar are unknown.
- **Swim send-off rests** (`slot: 'sendOffRest'`): whether a watch writes a rest
  lap for the residual. That belongs to #623.
- **Structure Adherence could read the mapping** instead of comparing
  archetypes (`structure-adherence.ts:246-253`). That would be a later ticket.
- **The athlete-layer handover is #624's** (see the handback).
