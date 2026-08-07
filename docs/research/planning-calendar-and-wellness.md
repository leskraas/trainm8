# Plan authoring, the calendar surface, and wellness/readiness

Research note. Scope: (1) how structured workouts are represented in open and
first-party file formats and how a human-writable notation could parse to the
same primitives; (2) how a calendar/plan surface is structured and rolled up;
(3) what daily wellness data is worth capturing and what the evidence actually
supports doing with it.

Vendor-neutral throughout: file formats and their owning specs are named (FIT,
TCX, `.zwo`, ERG/MRC) because those are interop targets; training _platforms_
are not.

## TL;DR

- **Every structured-workout format is the same five primitives**: an ordered
  list of steps, a repeat construct, a _duration type_ (time / distance /
  calories / HR-or-power threshold / open), a _target type_ (speed·pace / HR /
  power / cadence / none) as either a **named zone** or a **custom low–high
  range**, and an _intensity role_ (warmup / active / rest / cooldown / recovery
  / interval). FIT's `wkt_step_duration` and `wkt_step_target` enums are the
  most complete published superset; TCX is the same model with fewer members;
  `.zwo` and ERG/MRC are cycling-power specialisations that add **ramps** and
  **free-ride** explicitly.
- **A parseable-but-writable DSL is achievable** because the primitive set is
  small and closed. The hard parts are not grammar but semantics: unit-free
  percentages need an anchor (`%FTP` vs `%LTHR` vs `%maxHR` vs threshold pace),
  ranges must be first-class rather than a point plus fudge, and repeats must
  nest. A concrete PEG grammar and an AST are given below.
- **Planned load before execution** is `IF² × hours × 100` summed per step,
  where `IF` is the _midpoint of the resolved target range_ over the athlete's
  threshold — the same formula the executed session uses, so plan and actual sit
  on one scale. Open/unquantified steps must contribute nothing and _lower a
  confidence flag_ rather than be guessed.
- **Periodization structure is far better evidenced at the taper than at the
  phase.** The 2-week, ~41–60 % exponential volume-reduction taper with
  intensity held constant is a real meta-analytic finding
  ([Bosquet 2007](https://doi.org/10.1249/mss.0b013e31806010e0)). The 3:1
  loading-to-recovery week cadence and the Base→Build→Peak sequence are
  _coaching convention_, not tested rules
  ([Kiely 2012](https://doi.org/10.1123/ijspp.7.3.242)). A planning app should
  encode the taper as a rule and the phase names as free text — which is what
  trainm8 already does.
- **HRV guidance has real supporting trials but a narrow, specific decision
  rule**: compare the **7-day rolling mean of ln rMSSD** against a _normal
  range_ built from a rolling baseline (mean ± SWC, where SWC = 0.5 × SD);
  inside the range → run the plan; below it → downgrade to low-intensity or
  rest; above it → the plan (or intensity) is permitted. Subjective wellness
  outperformed objective markers in a systematic review
  ([Saw 2016](https://doi.org/10.1136/bjsports-2015-094758)), so the honest
  merge is _two signals shown side by side with an agreement flag_, not one
  composite readiness number.

---

## Part 1 — Structured workout authoring

### 1.1 What the formats actually contain

#### Garmin FIT — `workout` + `workout_step`

FIT is the richest published model and the one to design against, because
anything expressible in TCX or `.zwo` is expressible in FIT. Fields taken from
the Garmin FIT Profile shipped in the official JavaScript SDK
([`src/profile.js`](https://github.com/garmin/fit-javascript-sdk/blob/main/src/profile.js),
generated from `Profile.xlsx` in the
[FIT SDK](https://developer.garmin.com/fit/)).

`workout` message: `wktName`, `sport`, `subSport`, `numValidSteps`,
`poolLength`, `poolLengthUnit`.

`workout_step` message (message-index ordered):

| field                                                                     | notes                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `messageIndex`                                                            | ordering key; repeats target it                                   |
| `wktStepName`                                                             | free label                                                        |
| `durationType`                                                            | enum `wktStepDuration`                                            |
| `durationValue`                                                           | reinterpreted by subfield per duration type                       |
| `targetType`                                                              | enum `wktStepTarget`                                              |
| `targetValue`                                                             | zone number, or `0` = custom                                      |
| `customTargetValueLow` / `customTargetValueHigh`                          | the range                                                         |
| `intensity`                                                               | enum: `active, rest, warmup, cooldown, recovery, interval, other` |
| `notes`, `equipment`                                                      |                                                                   |
| `exerciseCategory`, `exerciseName`, `exerciseWeight`, `weightDisplayUnit` | strength steps                                                    |
| `secondaryTargetType`, `secondaryCustomTargetValueLow/High`               | e.g. power target **plus** a cadence target                       |

`wktStepDuration` enum, verbatim from the profile:

```
0 time            1 distance        2 hrLessThan      3 hrGreaterThan
4 calories        5 open            6 repeatUntilStepsCmplt
7 repeatUntilTime 8 repeatUntilDistance                9 repeatUntilCalories
10 repeatUntilHrLessThan            11 repeatUntilHrGreaterThan
12 repeatUntilPowerLessThan         13 repeatUntilPowerGreaterThan
14 powerLessThan  15 powerGreaterThan                  16 trainingPeaksTss
17 repeatUntilPowerLastLapLessThan  18 repeatUntilMaxPowerLastLapLessThan
19 power3sLessThan 20 power10sLessThan 21 power30sLessThan
22 power3sGreaterThan 23 power10sGreaterThan 24 power30sGreaterThan
25 powerLapLessThan 26 powerLapGreaterThan
27 repeatUntilTrainingPeaksTss      28 repetitionTime  29 reps  31 timeOnly
```

`wktStepTarget` enum, verbatim:

```
0 speed  1 heartRate  2 open  3 cadence  4 power  5 grade  6 resistance
7 power3s  8 power10s  9 power30s  10 powerLap  11 swimStroke
12 speedLap  13 heartRateLap
```

Three design details worth stealing:

1. **Repeats are not a container.** A repeat is _itself a step_ whose
   `durationType` is one of the `repeatUntil*` members and whose `durationStep`
   field holds the `messageIndex` of the step to loop back to, with
   `repeatSteps` (or `repeatTime` / `repeatDistance` / `repeatHr` /
   `repeatPower`) as the exit condition. The profile comment is explicit:
   _"message_index of step to loop back to. Steps are assumed to be in the order
   by message_index. custom_name and intensity members are undefined for this
   duration type."_ This makes the file a flat list with backward jumps —
   compact, but it means nesting is implicit and validation is on the reader. A
   tree (TCX's model) is better for authoring; the flat form is an encoding
   detail.
2. **Percent-vs-absolute is encoded as a numeric offset, not a type tag.** The
   profile's `workoutHr` type declares `100: "bpmOffset"` and `workoutPower`
   declares `1000: "wattsOffset"`. So an HR value < 100 means _percent of max
   HR_, and ≥ 100 means `value − 100` bpm; a power value < 1000 means _percent
   of FTP_, and ≥ 1000 means `value − 1000` watts. This is a clever hack and a
   terrible domain model — it conflates the unit with the magnitude. It is worth
   knowing purely to encode/decode correctly.
3. **A zone target and a custom range are the same field.** `targetValue` is the
   zone number, and `0` is the sentinel for "look at `customTargetValueLow/High`
   instead". The reader must therefore treat _"named zone"_ and _"explicit
   range"_ as two branches of one target — a discriminated union in any sane
   re-modelling.

#### TCX — `Workout_t`

TCX is the same model expressed as a proper XML type hierarchy, which makes it
the clearest statement of the _shape_. From the authoritative
[`TrainingCenterDatabasev2.xsd`](https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd):

```xml
<xsd:complexType name="Workout_t">
  <xsd:sequence>
    <xsd:element name="Name" type="RestrictedToken_t"/>          <!-- max 15 chars -->
    <xsd:element name="Step" type="AbstractStep_t" maxOccurs="unbounded"/>
    <xsd:element name="ScheduledOn" type="xsd:date" minOccurs="0" maxOccurs="unbounded"/>
    <xsd:element name="Notes" type="xsd:string" minOccurs="0"/>
    ...
  </xsd:sequence>
  <xsd:attribute name="Sport" type="Sport_t" use="required"/>
</xsd:complexType>
```

`AbstractStep_t` has exactly two concrete subtypes — `Step_t` and `Repeat_t` —
which is a **true recursive tree**:

```xml
<xsd:complexType name="Repeat_t">        <!-- extends AbstractStep_t -->
  <xsd:element name="Repetitions" type="Repetitions_t"/>   <!-- 2..99 -->
  <xsd:element name="Child" type="AbstractStep_t" maxOccurs="unbounded"/>
</xsd:complexType>

<xsd:complexType name="Step_t">          <!-- extends AbstractStep_t -->
  <xsd:element name="Name" type="RestrictedToken_t" minOccurs="0"/>
  <xsd:element name="Duration" type="Duration_t"/>
  <xsd:element name="Intensity" type="Intensity_t"/>   <!-- Active | Resting -->
  <xsd:element name="Target" type="Target_t"/>
</xsd:complexType>
```

`Duration_t` subtypes: `Time_t` (Seconds), `Distance_t` (Meters),
`HeartRateAbove_t`, `HeartRateBelow_t`, `CaloriesBurned_t`, `UserInitiated_t`
(the "open"/lap-button step).

`Target_t` subtypes: `Speed_t` (a `SpeedZone`), `HeartRate_t` (a
`HeartRateZone`), `Cadence_t` (Low/High doubles), `None_t`.

`Zone_t` subtypes: `PredefinedSpeedZone_t` (1–10), `CustomSpeedZone_t` (`ViewAs`
= `Pace | Speed`, plus `LowInMetersPerSecond` / `HighInMetersPerSecond`),
`PredefinedHeartRateZone_t` (1–5), `CustomHeartRateZone_t` (Low/High as
`HeartRateInBeatsPerMinute_t` **or** `HeartRateAsPercentOfMax_t`).

Note the constraints: `StepId_t` maxInclusive **20** (so a TCX workout is capped
at 20 steps), `Repetitions_t` 2–99, `Name` 1–15 characters. TCX has **no power
target at all** — it predates power meters being mainstream. It is a legacy
export target, not a design model.

The one genuinely good idea TCX has that FIT does not:
`HeartRateAsPercentOfMax_t` is a _distinct type_ from
`HeartRateInBeatsPerMinute_t`. Percent-of-anchor and absolute are different
things and the schema says so.

#### Zwift `.zwo`

No official spec exists; the community reference
([h4l/zwift-workout-file-reference](https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md))
is the de-facto documentation. Block elements:

```xml
<Warmup      Duration="300"  PowerLow="0.5" PowerHigh="0.75" Cadence="85"/>
<SteadyState Duration="600"  Power="0.85"   Cadence="90"/>
<Ramp        Duration="600"  PowerLow="0.5" PowerHigh="0.9"/>
<IntervalsT  OnDuration="60" OffDuration="60" OnPower="1.2" OffPower="0.5" Repeat="5"/>
<FreeRide    Duration="1800" FlatRoad="0" ftptest="1"/>
<MaxEffort   Duration="600"/>
<Cooldown    Duration="300"  PowerLow="0.75" PowerHigh="0.5"/>
<RestDay/>
<textevent   timeoffset="30" message="Great pace! Keep it up!" duration="5"/>
```

`Power` attributes are **FTP ratios** (`0.85` = 85 % FTP), `Duration` is
seconds, `Cadence` is rpm.

Two structural lessons:

- **`Warmup` / `Ramp` / `Cooldown` are the same thing** — a step with a
  _sweeping_ target, `PowerLow` → `PowerHigh`, linear over `Duration`. Ramps are
  absent from TCX and only obliquely present in FIT. Any authoring model that
  wants to express a warm-up sweep needs a target variant for it.
- **`IntervalsT` collapses a 2-step repeat into one element.** This is the
  format's biggest wart: because the repeat is fused to exactly a work/rest
  pair, a 3-element repeat (`hard / float / easy`) is inexpressible without
  unrolling it. This is the mistake to avoid — repeats should wrap an arbitrary
  child list, as TCX's `Repeat_t` does.
- `.zwo` has no distance and no HR/pace targets for cycling; the `pace`
  attribute exists only for the running mode. It is single-discipline by
  construction.

#### ERG / MRC

The simplest useful format and worth understanding as the _degenerate case_: a
time-series of breakpoints with linear interpolation between them.

```
[COURSE HEADER]
VERSION = 2
UNITS = ENGLISH
DESCRIPTION = 2x20 threshold
FILE NAME = 2x20.mrc
MINUTES	PERCENT
[END COURSE HEADER]
[COURSE DATA]
0.00	50
10.00	50
10.00	95
30.00	95
...
[END COURSE DATA]
```

`MINUTES` is decimal (`10.50` = 10 min 30 s), tab-separated from the value
column. `.mrc` uses `PERCENT` (of FTP, resolved at ride time); `.erg` uses
absolute `WATTS`. Repeating a time value produces a step change; differing times
with differing values produce a **linear ramp** — the whole ramp semantics fall
out of interpolation. See the
[TrainerRoad ERG/MRC note](https://support.trainerroad.com/hc/en-us/articles/201944204-Creating-a-Workout-from-an-ERG-or-MRC-File)
and the
[PerfPRO ERG editor docs](https://perfprostudio.com/webhelp/Analyzer/topics/ERGEditor.htm).

**Consequence for design:** a breakpoint series is a lossy _rendering target_,
not a source model — it cannot represent "8 × 400 m", "until you press lap", or
"HR below 140". Keep the structured tree as the source of truth and emit the
breakpoint series for display (which is exactly what a workout-shape strip is).

#### A widely-used vendor JSON structured-workout shape

Publicly documented only through help-centre material and third-party
integrations rather than an open spec, so treat the field names as
_approximately_ right. The recurring shape is:

```jsonc
{
	"primaryLengthMetric": "duration", // or "distance"
	"primaryIntensityMetric": "percentOfFtp", // or percentOfThresholdPace, percentOfMaxHr
	"structure": [
		{
			"type": "step", // or "repetition"
			"length": { "unit": "second", "value": 600 },
			"steps": [
				{
					"name": "Warm up",
					"length": { "unit": "second", "value": 600 },
					"targets": [{ "minValue": 50, "maxValue": 70 }],
					"intensityClass": "warmUp", // warmUp | active | rest | coolDown
					"openDuration": false,
				},
			],
			"begin": 0,
			"end": 600,
		},
	],
}
```

Notable: **`intensityClass`** (the role, mirroring FIT's `intensity` enum),
**`openDuration`** (the "until you say stop" flag as a boolean rather than a
duration type), the **`repetition` wrapper with nested `steps`** (a tree, like
TCX), and `begin`/`end` **absolute offsets** materialised alongside the relative
lengths so a renderer never has to walk the tree.
([Structured Workout Builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder);
[API overview](https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API).)
_Uncertainty: this shape is reconstructed from secondary sources; verify against
the vendor's own API docs before building an exporter._

### 1.2 The shared primitive set

Intersecting all five:

```
Workout
  ├─ metadata: name, sport/discipline, notes
  └─ steps: Node[]

Node = Step | Repeat

Repeat  = { count | until: ExitCondition, children: Node[] }
Step    = { name?, role, quantity, target?, secondaryTarget? }

role     = warmup | active | rest | recovery | interval | cooldown | other
quantity = time(s) | distance(m) | calories | reps | open
           | untilHrAbove/Below | untilPowerAbove/Below
target   = none
         | zone(system, n)                    // named band
         | range(metric, low, high, anchor)   // explicit
         | ramp(metric, from, to, anchor)     // sweeping
metric   = pace | speed | power | heartRate | cadence | rpe | grade | resistance
anchor   = absolute | %ftp | %lthr | %maxhr | %thresholdPace | %css
```

Everything else in the five formats is either an encoding quirk (FIT's bpm/watt
offsets), a display concern (`.zwo` `textevent`), or a single-discipline extra
(`swimStroke`, `poolLength`, `FlatRoad`).

**Ramp and open are the two primitives most often omitted and most often
needed.** A warm-up is almost always a ramp; a "cool down until you feel like
stopping" and an "open 5 k time trial" are both `open`.

### 1.3 Designing a human-writable, parseable notation

Conventions that appear across coaching notation in the wild:

| convention                        | example                              | meaning                          |
| --------------------------------- | ------------------------------------ | -------------------------------- |
| `N x` repeat                      | `4 x 8min`                           | 4 repetitions                    |
| `@` target                        | `@ 105% FTP`                         | target follows                   |
| `w/` or `(...)` recovery          | `4 x 8min @ 300w (4min @ 150w)`      | inline rest child                |
| `–` / `-` range                   | `@ 88–94% FTP`                       | low–high                         |
| unit suffix decides quantity kind | `8min` vs `800m` vs `20kcal`         | duration vs distance vs calories |
| `Z<n>`                            | `Z2`                                 | named zone                       |
| `/km`, `/mi`, `/100m`             | `4:40/km`                            | pace                             |
| nesting via parentheses           | `3 x (5 x 200m @ 5k pace, 200m jog)` | nested repeat                    |

A grammar that covers this, and maps 1:1 onto the AST above:

```peg
Workout     <- Line (NEWLINE Line)*
Line        <- Repeat / Step

Repeat      <- Count WS? ("x" / "×") WS? ( "(" WS? StepList WS? ")" / Step )
Count       <- [1-9][0-9]*
StepList    <- Node (WS? "," WS? Node)*
Node        <- Repeat / Step

Step        <- Quantity (WS Role)? (WS? "@" WS? Target)? (WS? Rest)?
Rest        <- "(" WS? Step WS? ")"

Quantity    <- Time / Distance / Calories / Reps / Open
Time        <- Number ("h" / "min" / "m'" / "s")          # 8min, 1h, 90s
             / Number ":" [0-5][0-9]                      # 8:30 (mm:ss)
Distance    <- Number ("km" / "m" / "mi" / "yd")
Calories    <- Number "kcal"
Reps        <- Number "reps"
Open        <- "open" / "until lap" / "until HR" Compare HR

Role        <- "warmup" / "wu" / "cooldown" / "cd" / "rest"
             / "recovery" / "easy" / "float"

Target      <- Ramp / Range / Point
Ramp        <- Point WS? ("->" / "→") WS? Point
Range       <- Point WS? ("-" / "–") WS? Point
Point       <- Percent / Power / Pace / HeartRate / Zone / Rpe
Percent     <- Number "%" WS? Anchor?                     # 105% FTP
Anchor      <- "FTP" / "LTHR" / "maxHR" / "TP" / "CSS"    # TP = threshold pace
Power       <- Number "w"
Pace        <- Number ":" [0-5][0-9] "/" ("km"/"mi"/"100m")
HeartRate   <- Number "bpm"
Zone        <- ("Z" / "zone") [1-7]
Rpe         <- "RPE" WS? Number
```

Examples and their parses:

```
20min warmup @ 55-70% FTP -> 75% FTP
  Step{ time 1200, role warmup, target Ramp(Range(55,70)%FTP → 75%FTP) }

3 x (8min @ 105% FTP, 4min @ Z1)
  Repeat{ 3, [ Step{time 480, target 105%FTP},
               Step{time 240, target Zone(1)} ] }

10 x 400m @ 4:40/km (200m @ Z1)
  Repeat{ 10, [ Step{dist 400, target Pace(4:40/km),
                     rest Step{dist 200, target Zone(1)} } ] }

open @ RPE 9
  Step{ open, target Rpe(9) }
```

Design rules that fall out of the format survey:

1. **Ranges are the base case, points are sugar.** Store `low`/`high` always; a
   point target is `low == high`. Every format's custom target is a pair.
2. **A percentage without an anchor is undefined.** `105%` must resolve to a
   _named_ anchor per discipline (bike → FTP, run → threshold pace, swim → CSS,
   HR-first → LTHR). If the athlete has no such threshold, the parse should
   still _succeed_ and the resolution should degrade to the zone label rather
   than fabricate numbers.
3. **Repeats wrap an arbitrary list, never a fused pair.** `.zwo`'s `IntervalsT`
   shows the cost of the shortcut.
4. **Rest as an inline `(...)` child is the ergonomic win** — it is how coaches
   write it — but it should desugar to a plain sibling `Step` with `role = rest`
   so the AST has one shape.
5. **Roles are semantic, not cosmetic.** They drive planned-load weighting, the
   shape strip's colouring, and export (`intensity` in FIT, `intensityClass` in
   the JSON shape).
6. **Distinguish "unparseable" from "unresolvable".** A syntax error is the
   author's problem; a missing threshold is the data's problem and must not
   block saving.

**Parse vs render.** Rendering _from_ structure is invalid-by-construction;
parsing _into_ structure needs an error-recovery UX. The two are not exclusive —
the strongest arrangement is a canonical renderer that is the _inverse_ of the
parser (`render(parse(s)) == normalise(s)`), giving a property test and letting
the surface be text-first without the text ever becoming the stored truth.

### 1.4 Estimating planned load before execution

Coggan's definitions
([TrainingPeaks reference article](https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/)):

```
IF  = NP / FTP
TSS = (IF² × duration_hours) × 100
```

so one hour at threshold (`IF = 1.0`) = 100 TSS by definition.

For a _planned_ workout there is no NP, so the estimate is per-step:

```
For each leaf step i (after expanding repeats):
    t_i  = resolved duration in hours
           (distance steps: t_i = distance / resolved_pace)
    IF_i = midpoint(resolved target range) / threshold_for_that_metric
    tss_i = IF_i² × t_i × 100

plannedTSS = Σ tss_i
```

Notes and caveats:

- **Squaring the midpoint is not the midpoint of the squares.** For a wide range
  (`55–75 % FTP`) the midpoint estimate under-reports slightly relative to
  integrating `IF²` across the range. The error is small (for a ±10 % range
  around 0.65 it is under 1 % of the step's TSS) and not worth modelling; for a
  **ramp** the correct closed form is worth using:
  `∫₀¹ (a + (b−a)u)² du = (a² + ab + b²)/3`, i.e. use `sqrt((a² + ab + b²)/3)`
  as the effective IF instead of `(a+b)/2`.
- **The formula must be the same one the executed session uses**, per discipline
  — power `TSS`, running `rTSS` (from Normalized Graded Pace vs threshold pace),
  `hrTSS` (from a HR-to-intensity mapping), swim `sTSS` (CSS). Comparing a plan
  priced in one currency with an execution priced in another is meaningless.
- **Open and unquantified steps contribute zero and taint confidence.** A
  three-state (`full` / `partial` / `unavailable`) confidence flag alongside the
  number is the only honest treatment; a plan week whose total is half guesses
  should not present a crisp integer.
- **Weekly planned load is just the sum over the week's sessions**, and it is
  what makes a plan surface useful: it turns a list of prescriptions into a ramp
  curve you can eyeball against the phase intent.
- **Do not feed planned load into fitness/fatigue.** CTL/ATL/TSB describe what
  the body actually absorbed. A _projection_ of future CTL from planned load is
  a legitimate and separate read-only view, clearly labelled as a projection.
- **A parallel, cheaper estimator worth keeping**: session-RPE load =
  `RPE(1–10) × duration_min`
  ([Foster 1998](https://doi.org/10.1097/00005768-199807000-00023)), which
  extends to modalities with no threshold model (strength, ball sports).
  Foster's derived indices are **monotony** = weekly mean daily load / SD of
  daily load, and **strain** = weekly load × monotony; high load _combined with_
  high monotony was what tracked illness. A calendar surface can compute
  monotony from planned load and warn about a week of seven identical days —
  cheap, and it is a genuinely plan-time signal. _Uncertainty: monotony/strain
  come from a small (n = 25) observational study and have not replicated
  cleanly; treat as a hint, not a gate._

---

## Part 2 — Calendar / plan surface

### 2.1 Periodization models and their week structures

#### Classic / linear (Friel)

Season built **backwards from one A-priority event**. Phases: Prep → Base →
Build → Peak → Race → Transition. Friel's guidance: one A race per season is
optimal, two at most and only if separated by four to five months; Base runs ~12
weeks minimum with 80–90 % of volume in zones 1–2; Build workouts become
progressively race-specific; Peak/taper is ~2 weeks
([Build Period Overview](https://joefrieltraining.com/build-period-overview/);
[Your Next A-Priority Race](https://joefrieltraining.com/your-next-apriority-race/);
[Annual Training Plan guide](https://www.trainingpeaks.com/learn/articles/the-comprehensive-guide-to-creating-an-annual-training-plan/)).

Typical mesocycle: 4 weeks as **3 loading + 1 recovery** ("3:1"), with 2:1
recommended for older or less-recovered athletes. _This cadence is convention. I
found no controlled trial establishing 3:1 as superior to 2:1 or to
autoregulated recovery._ Flag it as such in any UI that defaults to it.

#### Block periodization (Issurin)

Rejects concurrent development in favour of **consecutive, concentrated,
unidirectional mesocycle-blocks** exploiting _residual training effects_:

- **Accumulation** — basic abilities: aerobic capacity, muscular strength, basic
  technique. Longest block.
- **Transmutation** — converts that potential into event-specific ability:
  anaerobic / aerobic-anaerobic work, specialised technique. Most fatiguing,
  hence shortest.
- **Realization** — pre-competition: taper, recovery, race-modelling.

Typical block lengths 2–4 weeks, a stage of three blocks ≈ 4–10 weeks, allowing
multiple peaks per season — the main practical argument over the classic model
for athletes with several targets
([Issurin 2010, _Sports Medicine_](https://doi.org/10.2165/11319770-000000000-00000);
[Issurin 2008 "New Horizons"](https://www.hmmrmedia.com/wp-content/uploads/2015/08/new-horizons-periodization.pdf);
[block-periodization systematic review, _OAJSM_](https://www.dovepress.com/block-periodization-of-endurance-training-a-systematic-review-and-meta-peer-reviewed-fulltext-article-OAJSM)).

**Structural consequence for a data model:** blocks do not have to align to a
concurrently-running phase timeline for another discipline. A strength block and
a running phase should be free to start and end independently — coupling them
re-imposes exactly the concurrency Issurin's model separates.

#### Reverse periodization

Intensity/specificity front-loaded, volume built later. Rationale is
scheduling-driven (winter base indoors, long specific volume close to a summer
event) rather than physiological. _Evidence base is thin; I found no
meta-analysis supporting it over classic ordering._ Treat as a legitimate
athlete choice, not a recommendation.

#### Polarized construction

Not a periodization model but an **intensity distribution** constraint that cuts
across phases: ~75–80 % of _sessions_ below the first ventilatory threshold,
~15–20 % above the second, ~5 % at threshold.
[Stöggl & Sperlich 2014](https://doi.org/10.3389/fphys.2014.00033) randomised 48
trained athletes across polarized / threshold / high-volume / HIIT blocks over 9
weeks; the polarized arm produced the largest gains in VO₂peak (+11.7 %) and
time to exhaustion (+17.4 %).

For a plan surface, this is a **week-level constraint to check, not a phase to
author**: given the week's steps and their resolved zones, compute time-in-zone
and show the distribution against the target split. This is a genuinely useful
authoring aid — it is invisible in a session-by-session view and obvious in a
weekly rollup.

#### The honest caveat on all of it

[Kiely 2012](https://doi.org/10.1123/ijspp.7.3.242) argues that the dominant
periodization paradigms share a cultural inheritance whose formative assumptions
are no longer scientifically defensible, and calls for "sensitive and responsive
training systems that facilitate customized context-specific training-planning
solutions" over prescriptive templates.

**The design read:** encode the things with evidence (the taper; the intensity
distribution; progressive overload with recovery weeks) as _rules the app can
apply and explain_, and leave the phase taxonomy as **free text the athlete
owns**. Do not build an enum of `base | build | peak` — the literature does not
agree on the words (Bompa's "macrocycle" is most coaches' "mesocycle"), and the
name carries intent no derived quantity can.

### 2.2 The taper — the one well-evidenced rule

[Bosquet, Montpetit, Arvisais & Mujika (2007), _Med Sci Sports Exerc_ 39(8):1358–65](https://doi.org/10.1249/mss.0b013e31806010e0),
meta-analysis of taper studies:

- **Duration**: ~2 weeks is optimal.
- **Volume**: reduce by **41–60 %**.
- **Shape**: **exponential, fast-decay** beats linear and beats step.
- **Intensity: unchanged.**
- **Frequency: unchanged** (or reduced no more than ~20 %).

Replicated in a later systematic review and meta-analysis in endurance athletes
([Spilsbury-style pooled analysis, _PLOS ONE_ 2023](https://doi.org/10.1371/journal.pone.0282838)).

Encodable directly:

```
taperWeeks      = 2                              # A-priority
volumeMultiplier(dayIndexFromRaceStart, τ):
    v(t) = v0 * exp(-t / τ)   with τ chosen so that
    mean(v over taper) ≈ 0.5 * v0                # i.e. 50% cut, mid-band
intensity       = unchanged   # keep the same targets, shorten the steps
frequency       = unchanged   # keep the same number of sessions
```

Contrast with the **event-priority convention** (Friel): an **A** event gets the
full taper; a **B** event gets a light week (a few easy days, typically ~3 days
before); a **C** event is folded into the normal training week as a hard session
or a rehearsal. This maps cleanly to a per-event `priority ∈ {A, B, C}` that
drives whether a taper rule fires at all.

### 2.3 Weekly rollups a calendar surface should show

Ordered by how much they earn their pixels:

1. **Planned vs actual duration** and **planned vs actual load** — the primary
   pair. Sum both sides over the calendar week, in the athlete's timezone,
   Monday–Sunday.
2. **Adherence ratio** = `Σ actual / Σ planned`, banded. Sum-then-divide (a big
   session can offset skipped ones) with the per-session bands still visible so
   the underlying pattern is not hidden. Bands should be **asymmetric** —
   overreaching is the riskier failure mode and should flag sooner than
   undertraining.
3. **Ramp rate** — week-over-week change in load, or the change in a 42-day-EWMA
   fitness value across the week. This is the single number that catches "you
   are building too fast" and it only exists at the week level.
4. **Fitness / fatigue / form at week end** (42-day and 7-day exponentially
   weighted load averages and their difference) — and, for future weeks, a
   _projection_ from planned load, clearly labelled as such.
5. **Time-in-zone distribution** for the week vs the intended split — the
   polarized-construction check from §2.1.
6. **Session count and rest days** — trivial but the fastest sanity check on a
   week, and the input to a monotony warning.
7. **Elevation and kcal** — cheap to sum, and elevation genuinely matters for
   plan realism in hilly-terrain training; kcal is mostly a fuelling aid.
8. **Per-day planned-vs-actual** cells with a compliance state:
   `completed as planned | completed modified | over | under | missed | unplanned extra`.
   The "unplanned extra" state matters — the athlete who adds sessions is as
   much a plan-adherence story as the one who skips them.

**Compliance scoring caution.** A single 0–100 % weekly compliance score rewards
the wrong thing: an athlete who correctly skips a session because they are sick
scores badly. Better is a _state per day_ plus an _explanation_ for the week,
with the ratio as one number among several rather than a grade.

### 2.4 Goal events as anchors

Conventions that appear consistently in coaching practice:

- **One event is the plan's anchor**; the plan is laid out relative to it.
- **A/B/C priority** (Friel) determines taper depth, as above.
- **Lay phases forward from a start week rather than counting back from the
  event.** Counting back means adding a phase silently moves the plan's start
  into weeks the athlete already lived. Forward-laying lets the plan end before
  or after the event and shows the mismatch honestly.
- **Non-race goals need the same anchor.** "Get fit by June", "first 10 k" — an
  event entity with a `kind` discriminator covers both, so a plan never has to
  exist without an anchor.
- **The event's own execution is a session**, not a separate result record — the
  recording, the log and the load already live there.

---

## Part 3 — Wellness and readiness

### 3.1 Daily metrics worth capturing

| metric                            | capture                              | why it earns a field                                                                                                                                |
| --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resting HR**                    | bpm, on waking, supine               | Cheap, ubiquitous, but a _noisy_ single-day signal; useful as a 7-day trend and as a corroborator for HRV                                           |
| **HRV (rMSSD)**                   | ms, 1–5 min on waking, fixed posture | The parasympathetic marker with the most training-guidance evidence. Store raw rMSSD; derive `ln(rMSSD)` and `ln(rMSSD)×20`                         |
| **Sleep duration**                | hours                                | Strongest-evidenced lifestyle lever; also the most common confounder for a bad HRV reading                                                          |
| **Sleep quality / score**         | 1–5 subjective, or device score      | Subjective quality carries information the duration does not                                                                                        |
| **Body weight**                   | kg, on waking                        | Trend for energy availability; a >2 % overnight drop is a dehydration flag                                                                          |
| **Fatigue**                       | 1–5                                  | Hooper-index component                                                                                                                              |
| **Muscle soreness**               | 1–5                                  | Hooper-index component; the most training-specific of the four                                                                                      |
| **Stress**                        | 1–5                                  | Hooper-index component; catches non-training load                                                                                                   |
| **Motivation / mood**             | 1–5                                  | Early overreaching marker                                                                                                                           |
| **Steps / non-training activity** | count                                | Explains "why is my fatigue high on a rest day"                                                                                                     |
| **SpO₂**                          | %                                    | Only meaningful at altitude or for illness screening; otherwise noise                                                                               |
| **Respiration rate**              | breaths/min                          | Emerging illness/overload marker; a rise of 2–3 breaths/min over baseline is the commonly cited flag. _Uncertainty: thin athlete-specific evidence_ |
| **Menstrual cycle phase**         | phase or cycle-day                   | Worth capturing for the athlete's own pattern-finding; see caveat below                                                                             |
| **Illness / injury flag**         | boolean + note                       | The single most important override on any recommendation                                                                                            |
| **Alcohol, travel, altitude**     | flags                                | Known HRV confounders; capturing them prevents a false "overtrained" reading                                                                        |

The four subjective scales are the **Hooper index** (fatigue, stress, muscle
soreness, sleep quality), originally validated in swimmers over a 6-month season
([Hooper & Mackinnon 1995, _Sports Medicine_ 20(5):321–7](https://doi.org/10.2165/00007256-199520050-00003);
[Hooper et al. 1995, _MSSE_ 27(1):106–12](https://pubmed.ncbi.nlm.nih.gov/7898325/)).
Original scales were 1–7; 1–5 and 1–10 variants are both in common use. **The
absolute number is meaningless across athletes — only the deviation from that
athlete's own baseline carries signal.**

Why capture subjective scales at all when a watch supplies objective ones?
Because
[Saw, Main & Gastin (2016), _BJSM_ 50:281–91](https://doi.org/10.1136/bjsports-2015-094758)
systematically reviewed 56 studies and found subjective self-report measures
_more sensitive and more consistent_ than commonly used objective measures in
responding to acute and chronic training load. That is the strongest single
argument for a one-tap daily wellness entry existing in the product at all.

**Menstrual cycle caveat.**
[McNulty et al. (2020), _Sports Medicine_ 50:1813–27](https://doi.org/10.1007/s40279-020-01319-3)
meta-analysed 78 studies and found performance _trivially_ reduced in the early
follicular phase relative to all other phases — but with large between-study
variation and 68 % of studies rated low or very low quality. Their own
conclusion is that general guidelines cannot be formed and a **personalised
approach** is required. So: capture the phase, let the athlete see their own
pattern, and do **not** ship a rule that adjusts training by cycle phase.

### 3.2 The ln(rMSSD)×20 normalisation

rMSSD is log-normally distributed and spans roughly 10–200 ms, so raw values are
statistically awkward and visually unintuitive. The standard treatment is:

```
lnRMSSD    = ln(rMSSD_ms)                 # ~2.3 to ~5.3 — normalises the distribution
displayHRV = ln(rMSSD_ms) × 20            # ~46 to ~106 — a friendly 0-100-ish scale
```

The ×20 scaling is the convention popularised by consumer HRV apps and used in
peer-reviewed work by Flatt & Esco, who reported 7-day mean and CV of supine and
standing ultra-short `lnRMSSDx20` across training loads in a collegiate women's
soccer team
([Flatt & Esco 2015, _IJSPP_ 10(8):994–1000](https://doi.org/10.1123/ijspp.2014-0556);
validity of the 60-second ultra-short measure vs the 5-minute standard:
[Flatt & Esco 2013, _J Hum Kinet_ 39:85–92](https://doi.org/10.2478/hukin-2013-0071)).

**The ×20 is cosmetic — do all statistics on `lnRMSSD`, and scale only for
display.** Store raw `rMSSD` so the derivation is always reversible.

**Measurement hygiene that must be enforced or the numbers are garbage:** same
time of day (on waking, before rising), same posture (supine or seated, not
mixed), same duration (60 s or 5 min, consistently), before caffeine, and
recorded with the _same_ device. A comparison across a posture change or a
device change is not a comparison.

### 3.3 HRV-guided training — the evidence

**Kiviniemi et al. (2007), _Eur J Appl Physiol_ 101(6):743–51** —
[doi:10.1007/s00421-007-0552-2](https://doi.org/10.1007/s00421-007-0552-2). 26
moderately fit males randomised to predefined training (n=8), HRV-guided (n=9),
or control (n=9); four weeks, 40-min sessions. Decision rule: increase or no
change in HRV → high-intensity session that day; a significant decrease (**below
a reference value of the 10-day mean − SD**, or a decreasing trend for 2 days) →
low-intensity or rest. The HRV group improved despite doing _fewer_
high-intensity sessions. This is the origin of the whole approach.

**Vesterinen et al. (2016), _Med Sci Sports Exerc_ 48(7):1347–54** —
[doi:10.1249/MSS.0000000000000910](https://doi.org/10.1249/MSS.0000000000000910).
40 recreational runners, 4-week preparation then 8 weeks of HRV-guided vs
predefined training. Used the **smallest worthwhile change (SWC)** derived from
the mean and SD of `lnRMSSD` during familiarisation, applied to a **7-day
rolling window**. HRV-guided group improved 3000 m time significantly more.

**Javaloyes et al. (2019), _IJSPP_ / _JSCR_** — two studies, road cyclists
([IJSPP, doi:10.1123/ijspp.2018-0393](https://doi.org/10.1123/ijspp.2018-0393))
and well-trained cyclists vs **block periodization**
([JSCR, doi:10.1519/JSC.0000000000003337](https://doi.org/10.1519/JSC.0000000000003337)).
Rule: when `lnRMSSD_7day-rolling-avg` fell **outside the SWC band**, that day's
prescription changed from moderate/high intensity to low intensity or rest.
HRV-guided outperformed both traditional and block periodization on peak power
and 5-min/20-min power.

**Plews et al. (2013), _Sports Medicine_ 43(9):773–81** —
[doi:10.1007/s40279-013-0071-8](https://doi.org/10.1007/s40279-013-0071-8). The
methodological paper: single daily values are too noisy; **weekly rolling
averages** are the correct unit of analysis, and the **coefficient of
variation** of `lnRMSSD` carries information the mean does not — in elite
athletes a _rising_ mean with a _rising_ CV can indicate maladaptation, and
saturation effects mean a very high rMSSD is not automatically good.

**Buchheit (2014), _Front Physiol_ 5:73** —
[doi:10.3389/fphys.2014.00073](https://doi.org/10.3389/fphys.2014.00073). Argues
most contradictory HR-monitoring findings are methodological rather than
evidence of the measure failing, and that ~5-min near-daily resting recordings
plus submaximal-exercise HR (30–60 s average) are the most useful practical
tools. Useful framing for combining resting HR with HRV rather than choosing.

**Meta-analysis**: Düking et al. / Granero-Gallegos et al., "Monitoring and
adapting endurance training on the basis of heart rate variability monitored by
wearable technologies: a systematic review with meta-analysis", _J Sci Med
Sport_ 2021 —
[doi:10.1016/j.jsams.2021.04.012](https://doi.org/10.1016/j.jsams.2021.04.012).
Pooled effect favours HRV-guided over predefined training for submaximal and
maximal endurance outcomes, but the trials are small and mostly in recreational
to well-trained (not elite) athletes. _Uncertainty: I could not fetch the full
text (publisher 403); the pooled effect size and study count above are from the
abstract and secondary citations. Verify before quoting a number._

**Honest limits of the evidence base**: sample sizes are 17–40; blinding is
impossible; the comparison arm is a _fixed_ plan, which is a weak control (any
autoregulation might beat it); benefits are clearest for athletes doing a lot of
high-intensity work; and near-daily compliance with a measurement protocol is
itself an intervention.

### 3.4 A concrete decision rule

Baselines. Two windows, both on `lnRMSSD`:

```
ROLL7        = mean(lnRMSSD, last 7 days)                # the signal
BASE_MEAN    = mean(ROLL7 series, last 60 days)          # the reference
BASE_SD      = sd(ROLL7 series, last 60 days)
SWC          = 0.5 * BASE_SD                             # Cohen's small effect
NORMAL_RANGE = [BASE_MEAN - SWC, BASE_MEAN + SWC]
```

Some implementations use `BASE_MEAN ± 1 SD` of the _daily_ values (Kiviniemi
used `10-day mean − SD`) rather than `± 0.5 SD` of the rolling mean. The
`0.5 × SD` SWC on the 7-day roll (Vesterinen, Javaloyes) is the better-supported
choice and is far less trigger-happy, because the rolling mean's SD is much
smaller than the daily SD. _Flag: the constants below are literature-derived
defaults, not tuned; they should be named constants, not inline numbers._

Minimum data before the rule is allowed to speak:

```
require: >= 21 daily readings in the last 30 days     # else "not enough data"
         >= 60 days of history for the baseline       # else use what exists, widen band, say so
```

The rule:

```
if illness_flag or injury_flag:
    -> REST.        reason: "you flagged illness"           # overrides everything

else if ROLL7 < BASE_MEAN - SWC:
    if ROLL7 < BASE_MEAN - 2*SWC  or  (below band for >= 3 consecutive days):
        -> REST.    reason: "HRV well below your normal range for N days"
    else:
        -> EASY.    reason: "HRV below your normal range — keep it aerobic"

else if ROLL7 > BASE_MEAN + SWC:
    if CV7 = sd(lnRMSSD, last 7d)/mean(lnRMSSD, last 7d) is also elevated
       vs its own baseline:
        -> EASY.    reason: "HRV high but unstable — treat as a caution, not a green light"
                    # Plews et al.: parasympathetic saturation / maladaptation
    else:
        -> HARD OK. reason: "HRV above your normal range"

else:                                                  # inside the band
    -> FOLLOW THE PLAN.  reason: "HRV in your normal range"
```

Corroborating signals (do **not** let any of these alone drive a change):

```
restingHR   > BASE_RHR + 5 bpm  (7-day roll)   -> add caution
sleep       < 6 h last night, or 2 nights <7h  -> add caution
hooper      = fatigue + soreness + stress + sleepQuality (each 1-5, 4..20)
              > BASE_HOOPER + 1 SD             -> add caution
bodyMass    down > 2% overnight                -> hydration caution
```

Two independent cautions should be enough to downgrade `HARD OK` →
`FOLLOW THE PLAN`, and `FOLLOW THE PLAN` → `EASY`. Never let cautions _upgrade_.

### 3.5 Merging subjective and objective — and where it breaks

The tempting move is a single 0–100 readiness score. Three reasons not to:

1. **The inputs disagree meaningfully and that disagreement is the
   information.** High HRV plus terrible subjective scores is a specific,
   recognisable state (often illness incubating, or non-training life stress);
   averaging them to "68 % ready" destroys it. Show both, and show an
   _agreement_ indicator.
2. **The weights are unknowable.** There is no published weighting of `lnRMSSD`
   against a soreness score that generalises across athletes. Any composite is
   an invented constant wearing a lab coat. Saw et al. found subjective measures
   _out-perform_ objective ones, which if anything argues the naive "objective
   is the real signal, subjective is colour" weighting is backwards.
3. **A number invites false precision and hides missing data.** A day with no
   HRV reading and no wellness entry must produce "no recommendation", not a
   score computed from whatever happened to exist.

A defensible structure:

```
Readiness = {
  hrvState:        below | normal | above | unavailable,
  subjectiveState: worse | normal | better | unavailable,
  agreement:       agree | disagree | partial,
  recommendation:  REST | EASY | FOLLOW_PLAN | HARD_OK | NO_RECOMMENDATION,
  reasons:         string[],       # plain language, one per contributing signal
  confidence:      full | partial  # partial when a signal is missing
}
```

with the rule that `recommendation` is always accompanied by the reasons that
produced it, and that a disagreement is stated rather than resolved.

**Limits to state out loud in the product:**

- The evidence is for _groups over weeks_, not for any given Tuesday.
- HRV responds to alcohol, illness, poor sleep, heat, altitude, travel and
  psychological stress at least as strongly as to training. It is a _total-load_
  signal, not a training-load signal.
- Parasympathetic saturation means very high rMSSD can accompany
  _maladaptation_, especially in highly trained athletes (Plews et al.).
- Measurement protocol drift (a new watch, a changed wake time, a posture
  change) invalidates the baseline. Baselines should be resettable, and a device
  change should prompt one.
- None of this diagnoses overtraining syndrome, and the app should not imply it
  does.

---

## Implications for trainm8

Read against `CONTEXT.md` and ADRs 0010, 0007, 0016, 0019, 0025, 0027,
0039–0047.

These recommendations are written to the evidence, not to the existing decision
record. Where a shipped ADR is right, it is confirmed and should not be
reopened. Where the evidence says a shipped ADR is wrong, it is named and the
change is stated as a change, not as a "future consideration". A summary table
closes the section.

### What the evidence confirms — do not reopen these

- **Planned TSS (ADR 0019)** is exactly the §1.4 recipe: resolved intensity
  _midpoint_ through the _same_ Load Formula as actual TSS, materialised rather
  than per-render, with a `full | partial | unavailable` confidence and a
  refusal to fabricate. It also correctly excludes planned load from
  CTL/ATL/TSB. Nothing in the research contradicts it.
- **Weekly adherence (ADR 0019 §6)** — Mon–Sun in the athlete timezone,
  sum-then-divide, asymmetric bands with the over-edge nearer 1.0 — matches
  §2.3's recommendations, including the reason for the asymmetry.
- **Free-text phase names + no load on the phase (ADRs 0041, 0042, 0044)** is
  precisely what Kiely's critique implies: the phase taxonomy is contested
  vocabulary, so do not enum it, and do not let it carry quantities.
- **Strength track segments floating free of the endurance phases (ADR 0044)**
  is Issurin's argument stated correctly — a strength deload landing because a
  _running_ phase ended is exactly the coupling block periodization exists to
  avoid.
- **Event Priority A/B/C driving taper depth** is the Friel convention and is
  already in the vocabulary.
- **The Volume Ramp stepping over loading weeks only, with recovery weeks as a
  multiplicative role that never becomes the next base (ADR 0040)** is the right
  encoding of a 3:1/2:1 cadence — and the fact that the _cadence itself_ is
  authored rather than fixed is well-judged, since 3:1 is convention not
  evidence.
- **Week Replan (ADR 0025)** — downward-only, at-most-once, volume-only,
  intensity untouched, gated on both adherence _and_ TSB — is the same
  conservatism the taper literature endorses (cut volume, hold intensity) and
  avoids the compounding trap.

### What should change

1. **Ship the taper as a rule with a documented default: 2 weeks, exponential
   fast-decay, 41–60 % volume reduction, intensity and frequency unchanged,
   fired only for an A-priority event.** B → a light week, C → no change. This
   is the one periodization parameter with meta-analytic support, and shipping
   the "whether it tapers" flag and the "how deep" field without a default
   leaves the best-evidenced rule in the whole of Part 2 unencoded. ADR 0044
   already reserved the "unset means follow the documented convention" slot on
   the track segment; fill it with Bosquet's numbers and cite the paper in the
   ADR so the default is auditable rather than folkloric.
   - _Migration cost, stated plainly:_ Planned TSS is materialised (ADR 0019).
     Applying a taper default to already-authored outlines re-resolves
     `plannedTssValue` on future sessions inside the taper window and will move
     Weekly Adherence for any week already partly trained. That is a one-time
     recompute with a notice, not a reason to leave the default unset.

2. **Build the wellness domain. It is the largest gap in the product, not a
   "nice to have", and nothing in the decision record opposes it** — there is
   simply no ADR. Build it as:
   - a **Daily Wellness** entity, one row per athlete per local date, all fields
     nullable, with raw `rmssdMs` stored and `lnRMSSD` derived;
   - the four Hooper scales as 1–5 typed values (a discriminated set, not
     integers-as-strings), plus sleep hours, weight, and an illness flag;
   - measurement-context fields (posture, duration, device) so a protocol change
     can invalidate a baseline honestly rather than silently;
   - baselines computed, materialised and re-derivable — same pattern as the
     Load Snapshot.
   - The existing **Unavailable Metric** principle (ADR 0008) carries directly
     and is confirmed by the evidence: a missing reading is `null` and produces
     "no recommendation", never a zero. The 30-day/≥21-reading requirement in
     §3.3 makes that refusal a frequent, normal outcome, not an edge case.
   - Wellness stays **out of** the Training Load triad. ADR 0046's rule that no
     single number spans incommensurable currencies applies exactly here: HRV is
     not load and must never be folded into CTL/ATL/TSB as a modifier.

3. **Readiness must stop being TSB alone. ADR 0010 should be superseded on this
   point** — its decision that the daily signal is "one Form number (TSB)
   translated to plain language" is contradicted by the evidence, since
   [Saw 2016](https://doi.org/10.1136/bjsports-2015-094758) found subjective
   wellness markers outperform objective ones, and load-derived form is neither.
   The correct shape is the one §3.5 argues for: **Readiness is a small record
   of per-signal states with an agreement flag and reasons**, not a composite
   scalar — `{ states[], agreement, recommendation, reasons[], confidence }`,
   generalising the `{ label, recommendation, tone }` shape `adherenceBand` and
   `readinessFromTsb` already use. Disagreement between load-form and wellness
   is information and must be shown, not averaged away. ADR 0010's scoping
   rationale (Excel does dense ledgers; a tool's edge is a few trustworthy
   numbers) still holds — a two-or-three-signal readiness record with an
   agreement flag _is_ a few trustworthy numbers.
   - _Migration cost:_ none. Readiness is derived at render time; nothing stored
     moves.

4. **HRV becomes a third, independent gate on Week Replan.** ADR 0025's
   mechanism is confirmed correct — downward-only, at-most-once, volume-only,
   intensity untouched is exactly the taper literature's conservatism — and it
   should be extended, not redesigned: a below-normal-range 7-day ln rMSSD mean
   fires the same restricted replan that `adherence = over AND TSB <= gate`
   fires today, under the same discipline. ADR 0025's existing
   `insufficient-data` outcome already models the honest refusal HRV's data
   requirements will frequently trigger, which is a sign the mechanism was
   designed for this.

5. **Ship the parser. "Render, never parse" (ADR 0027 §1) states the right
   invariant with the wrong scope and should be amended.** The invariant worth
   keeping is that _structure is the only stored truth_ and the sentence is
   always rendered from it — that is confirmed. The blanket "never parse" reads
   as a ban on a text _input_ path, and §1.3 shows that ban is unwarranted: the
   format-derived primitive set is small and closed, and a parser targeting the
   `workout-notation` token model is the renderer's inverse, testable by the
   round-trip property `render(parse(s)) == normalise(s)`. It unlocks
   paste-a-workout and LLM-authored-text-into-structure with the text never
   becoming stored truth. Amend ADR 0027 to say "structure is the stored truth;
   text is an input, never a store", and drop "never parse".

6. **The Step union is missing two primitives every format has — `ramp` and
   `open` — and ADR 0007 should be amended to add them.** The Intensity Target
   union covers zone / pace / power / HR / RPE as points and ranges. A **ramp**
   target (`55 % → 75 % FTP` over the warm-up) is in `.zwo`, ERG/MRC and every
   warm-up ever written, and has a clean planned-TSS treatment
   (`IF_eff = sqrt((a² + ab + b²)/3)`). An **open** duration ("until ready",
   "until lap") exists in FIT (`open`) and TCX (`UserInitiated_t`), and ADR 0019
   already anticipates it ("an open 'warm up until ready' Step"). These are not
   export-path details to confirm later: without them the domain cannot
   represent the most common non-constant block in real training, and a round
   trip through any of the four formats is lossy by construction.
   - _Migration cost:_ additive for existing rows, but any warm-up currently
     authored as a flat mid-range approximation of a ramp will produce a
     different Planned TSS once re-resolved through `IF_eff`. State that as a
     recompute, and do not avoid the primitive to avoid the recompute.

7. **A time-in-zone weekly rollup is missing and is cheap.** The zone resolver
   (ADR 0006) and `expandWorkoutSteps` already exist; summing resolved step
   durations by declared Training Zone across a Mon–Sun week gives the
   polarized-construction check from §2.1 — a genuinely useful authoring aid
   that no per-session view can provide. It also composes with the existing
   Discipline Allocation surface.

8. **FIT/TCX export is a real, bounded interop story.** The primitive mapping is
   direct: Block/Step → `Repeat_t`/`Step_t`, Step Duration → `Time_t`, Step
   Distance → `Distance_t`, Intensity Target → `HeartRate_t`/`Speed_t` with
   custom zones. Two watch-outs: **TCX has no power target and caps at 20
   steps**, so it is lossy for cycling; **FIT encodes percent-vs-absolute as a
   numeric offset** (`+100` bpm, `+1000` W), which must be handled at the
   encoder boundary and never leak into the domain.

9. **Monotony is a free plan-time warning.** Foster's monotony (weekly mean
   daily load / SD of daily load) can be computed from **Planned** TSS at
   authoring time, flagging a week of seven identical days before it is trained.
   Cheap given ADR 0019, and honest to label as a hint given the thin evidence.

### ADRs this research challenges

| ADR                                       | What it decided                                                                  | What the evidence says                                                                                                            | Verdict       |
| ----------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **0010** near-term scope: one Form number | The daily readiness signal is TSB alone, in plain language on the Coach card     | Subjective wellness outperforms objective markers (Saw 2016); readiness must be a multi-signal record with an agreement flag      | **Supersede** |
| **0007** Step as a discriminated union    | Intensity Target is a union of zone / pace / power / HR / RPE, points and ranges | Every published format carries a **ramp** target and an **open** duration; without them the domain cannot express a warm-up       | **Amend**     |
| **0027** text-first authoring             | "Render, never parse"; no grammar or parser ships                                | The invariant that holds is _structure is the only stored truth_; the grammar is tractable and a parser is the renderer's inverse | **Amend**     |
| **0044** Plan Outline is relational       | Track segments carry taper depth; "unset means follow the documented convention" | The convention exists and is meta-analytic: 2 weeks, exponential, 41–60 % volume cut, intensity held, A-events only               | **Amend**     |
| **0025** adaptive week replan             | Downward-only, at-most-once, volume-only, gated on adherence **and** TSB         | The mechanism matches the taper literature exactly; HRV belongs as a third independent gate under the same restrictions           | **Amend**     |
| **0019** Planned TSS and Adherence Band   | Midpoint IF through the same Load Formula, materialised, confidence-flagged      | Exactly the §1.4 recipe, including the asymmetric adherence bands and the exclusion of planned load from CTL/ATL/TSB              | **Confirm**   |
| **0040/0041/0042** phases and volume ramp | Free-text phase names, no load on a phase, ramp steps over loading weeks only    | Kiely's critique implies precisely this: contested vocabulary must not be enumerated or made to carry quantities                  | **Confirm**   |
| **0044** strength track floats free       | Strength segments are not coupled to endurance phase boundaries                  | Issurin's argument stated correctly — a strength deload firing off a running phase is the coupling to avoid                       | **Confirm**   |
| **0046** no cross-currency load number    | No single number spans incommensurable Training Tracks                           | Applies directly to wellness: HRV/RHR/sleep must never fold into CTL/ATL/TSB as a modifier                                        | **Confirm**   |
| **0008** Unavailable Metric               | A missing input yields an honest gap, never a fabricated value                   | HRV's ≥21-readings-in-30-days requirement makes "no recommendation" a routine outcome; the principle is load-bearing here         | **Confirm**   |

---

## References

**Structured-workout formats**

- Garmin. _FIT SDK._ https://developer.garmin.com/fit/ — and the generated FIT
  Profile in the official SDK:
  https://github.com/garmin/fit-javascript-sdk/blob/main/src/profile.js
  (`workout`, `workout_step`, `wktStepDuration`, `wktStepTarget`, `intensity`,
  `workoutHr`, `workoutPower`).
- Garmin. _Encoding FIT Workout Files_ (Cookbook).
  https://developer.garmin.com/fit/cookbook/encoding-workout-files/
- Garmin. _TrainingCenterDatabase v2 XSD._
  https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd (`Workout_t`,
  `AbstractStep_t`, `Repeat_t`, `Step_t`, `Duration_t`, `Target_t`, `Zone_t`).
- h4l. _Zwift workout file tag reference_ (community, no official spec exists).
  https://github.com/h4l/zwift-workout-file-reference/blob/master/zwift_workout_file_tag_reference.md
- TrainerRoad. _Creating a Workout from an ERG or MRC File._
  https://support.trainerroad.com/hc/en-us/articles/201944204-Creating-a-Workout-from-an-ERG-or-MRC-File
- PerfPRO. _ERG Editor / file format._
  https://perfprostudio.com/webhelp/Analyzer/topics/ERGEditor.htm
- _Structured Workout Builder_ and _API_ help pages (vendor JSON shape;
  secondary source, verify before building against it).
  https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder
  · https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API

**Load quantification**

- Coggan, A. _Normalized Power, Intensity Factor and Training Stress Score._
  https://www.trainingpeaks.com/learn/articles/normalized-power-intensity-factor-training-stress/
- Foster, C. (1998). Monitoring training in athletes with reference to
  overtraining syndrome. _Med Sci Sports Exerc_ 30(7):1164–8.
  https://doi.org/10.1097/00005768-199807000-00023
- Impellizzeri, F. M., Rampinini, E., Coutts, A. J., Sassi, A., Marcora, S. M.
  (2004) and the session-RPE validity review: Haddad, M. et al. (2017).
  Session-RPE method for training load monitoring. _Front Neurosci_ 11:612.
  https://doi.org/10.3389/fnins.2017.00612

**Periodization and tapering**

- Bosquet, L., Montpetit, J., Arvisais, D., Mujika, I. (2007). Effects of
  tapering on performance: a meta-analysis. _Med Sci Sports Exerc_
  39(8):1358–65. https://doi.org/10.1249/mss.0b013e31806010e0
- Effects of tapering on performance in endurance athletes: a systematic review
  and meta-analysis. _PLOS ONE_ (2023).
  https://doi.org/10.1371/journal.pone.0282838
- Issurin, V. B. (2010). New horizons for the methodology and physiology of
  training periodization. _Sports Medicine_ 40(3):189–206.
  https://doi.org/10.2165/11319770-000000000-00000
- Block periodization of endurance training — a systematic review and
  meta-analysis. _Open Access J Sports Med._
  https://www.dovepress.com/block-periodization-of-endurance-training-a-systematic-review-and-meta-peer-reviewed-fulltext-article-OAJSM
- Kiely, J. (2012). Periodization paradigms in the 21st century: evidence-led or
  tradition-driven? _IJSPP_ 7(3):242–50. https://doi.org/10.1123/ijspp.7.3.242
- Stöggl, T., Sperlich, B. (2014). Polarized training has greater impact on key
  endurance variables than threshold, high intensity, or high volume training.
  _Front Physiol_ 5:33. https://doi.org/10.3389/fphys.2014.00033
- Friel, J. _Build Period Overview_ · _Your Next A-Priority Race._
  https://joefrieltraining.com/build-period-overview/ ·
  https://joefrieltraining.com/your-next-apriority-race/

**Wellness, HRV and readiness**

- Kiviniemi, A. M., Hautala, A. J., Kinnunen, H., Tulppo, M. P. (2007).
  Endurance training guided individually by daily heart rate variability
  measurements. _Eur J Appl Physiol_ 101(6):743–51.
  https://doi.org/10.1007/s00421-007-0552-2
- Vesterinen, V. et al. (2016). Individual endurance training prescription with
  heart rate variability. _Med Sci Sports Exerc_ 48(7):1347–54.
  https://doi.org/10.1249/MSS.0000000000000910
- Javaloyes, A., Sarabia, J. M., Lamberts, R. P., Moya-Ramon, M. (2019).
  Training prescription guided by heart-rate variability in cycling. _IJSPP_
  14(1):23–32. https://doi.org/10.1123/ijspp.2018-0393
- Javaloyes, A. et al. (2019). Training prescription guided by heart rate
  variability vs. block periodization in well-trained cyclists. _J Strength Cond
  Res._ https://doi.org/10.1519/JSC.0000000000003337
- Plews, D. J., Laursen, P. B., Stanley, J., Kilding, A. E., Buchheit, M.
  (2013). Training adaptation and heart rate variability in elite endurance
  athletes: opening the door to effective monitoring. _Sports Medicine_
  43(9):773–81. https://doi.org/10.1007/s40279-013-0071-8
- Buchheit, M. (2014). Monitoring training status with HR measures: do all roads
  lead to Rome? _Front Physiol_ 5:73. https://doi.org/10.3389/fphys.2014.00073
- Granero-Gallegos, A. et al. (2021). Monitoring and adapting endurance training
  on the basis of heart rate variability monitored by wearable technologies: a
  systematic review with meta-analysis. _J Sci Med Sport._
  https://doi.org/10.1016/j.jsams.2021.04.012
- Flatt, A. A., Esco, M. R. (2013). Validity of the ithlete smartphone
  application for determining ultra-short-term HRV. _J Hum Kinet_ 39:85–92.
  https://doi.org/10.2478/hukin-2013-0071
- Flatt, A. A., Esco, M. R. (2015). Smartphone-derived heart-rate variability
  and training load in a women's soccer team. _IJSPP_ 10(8):994–1000.
  https://doi.org/10.1123/ijspp.2014-0556
- Saw, A. E., Main, L. C., Gastin, P. B. (2016). Monitoring the athlete training
  response: subjective self-reported measures trump commonly used objective
  measures — a systematic review. _Br J Sports Med_ 50:281–91.
  https://doi.org/10.1136/bjsports-2015-094758
- Hooper, S. L., Mackinnon, L. T. (1995). Monitoring overtraining in athletes.
  _Sports Medicine_ 20(5):321–7.
  https://doi.org/10.2165/00007256-199520050-00003
- Hooper, S. L. et al. (1995). Markers for monitoring overtraining and recovery.
  _Med Sci Sports Exerc_ 27(1):106–12. https://pubmed.ncbi.nlm.nih.gov/7898325/
- McNulty, K. L. et al. (2020). The effects of menstrual cycle phase on exercise
  performance in eumenorrheic women: a systematic review and meta-analysis.
  _Sports Medicine_ 50:1813–27. https://doi.org/10.1007/s40279-020-01319-3
