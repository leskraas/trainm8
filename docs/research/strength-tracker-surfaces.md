# The strength tracker: surfaces, interactions, and the model under them

Research note. Scope: what a proper strength workout tracker actually _does_ —
the exercise database it stands on, the set-logging surface where the whole
product lives, the shapes a set model has to express, what "weight" means once
you leave the barbell, the progress surfaces, and the interchange formats. The
owner's brief was "a proper strength workout tracker — all the exercises and the
recording stuff, all the nice features."

Written against primary sources: the FIT profile as shipped in this repo's own
`@garmin/fitsdk` dependency, the source and live APIs of three open-source
trackers (wger, Liftosaur, workout-cool), two open exercise datasets, and
first-party help documentation where a vendor documents its own behaviour.
Closed products are named only where they publish the fact being cited, and
every inference from a screenshot, a review or a community-maintained sample
file is marked inline.

Three sibling notes cover the neighbouring ground and are not duplicated here:
the beginner-barbell program family, the 1RM/autoregulation/volume-landmark
science, and this repo's own model gaps. This note covers the **product surface
and the model directly under it**.

---

## TL;DR

1. **The exercise database is a solved acquisition problem and an unsolved
   modelling problem.** Two open datasets are genuinely usable —
   `free-exercise-db` (873 rows, Unlicense) and wger (850 rows, CC-BY-SA 4.0 per
   row, relational, with aliases and variation groups). Neither carries the two
   fields the logging surface needs: **movement pattern** (hinge/squat/push/
   pull/carry) and **load semantics** (what the number "60" means for this
   equipment). Both must be authored locally, so adoption is a seed, not a
   dependency — and the licences differ enough to make it a product decision.
2. **The most consequential decision is `(exerciseId, equipment)` as the
   progression key.** Liftosaur models an exercise reference as
   `{ id, equipment? }` and keys progression state on the _pair_. FIT takes the
   opposite route, baking equipment into 1 846 flat enum names
   (`inclineDumbbellBenchPress`), which explodes the picker and fragments
   history; a free-text alias table has the opposite failure and merges things
   that progress independently. The pair keeps the list short, keeps dumbbell
   and barbell bench separate, and still lets "Incline DB Press" find the row.
3. **`weightKg: Float` is wrong on at least five equipment classes, and this is
   not a rounding problem.** Assisted machines carry _negative_ added load;
   dumbbells are per-hand; bodyweight movements are `bodyweight ± added`;
   machine stacks are ordinal "levels"; bands have no kilos at all. Liftosaur's
   `IEquipmentData` — `bar`, `multiplier`, `plates[]`, `isFixed`, `isAssisting`,
   `useBodyweightForBar` — is the most complete open answer, and it is a
   **per-athlete equipment profile**, because it also encodes which plates this
   gym owns.
4. **The set-logging surface is a grid with a ghost, and it is not a sentence.**
   Prescribed and performed sit in the same row — wger stores exactly this
   (`repetitions`/`repetitions_target`, `weight`/`weight_target`,
   `rir`/`rir_target`, `rest`/`rest_target`) — because the whole interaction is
   "tap to accept last time, or overtype one number". ADR 0027's
   render-never-parse rule governs the **prescription** and should keep
   governing it; forcing the **log** into a Token Sentence would repeat #434's
   "too much text" in the one place an athlete works one-thumbed between sets.
5. **Supersets need no new concept; drop sets, myo-reps and clusters do.** A
   superset is a container over exercise entries — wger gets it for free
   ("multiple slot entries automatically create supersets"). But a drop set is
   _one set with several load segments_, a myo-rep run is _one activation set
   plus mini-sets sharing a load_, and a cluster is _one set with intra-set
   rest_. All three break a flat `ExerciseSet[]`: they need a sub-set segment
   list and a grouping id, and the repo's `ExerciseSet` has neither.
6. **PR detection has five kinds and only three are honest.** Estimated 1RM,
   per-rep-count set records and heaviest-weight-at-any-reps are readings.
   Session tonnage records and streaks are vanity: tonnage rewards junk volume,
   a streak measures app-opening. ADR 0021's derived-never-authored rule applies
   unchanged — but unlike the pace/power ladder it deferred, strength PRs need
   **no stream tier at all**, because the set row _is_ the measurement.
7. **There is no interchange standard for lifting data.** FIT's `set` message is
   the only cross-vendor format and its `set_type` is `rest | active` only, so
   warm-up, drop-set and failure markers do not survive a round trip. Everything
   else is per-app CSV. An export must be this app's own lossless JSON _plus_ a
   Strong/Hevy-shaped CSV for the migration path everyone actually uses.

---

## Part 1 — The exercise database

### 1.1 How big is a real one

Four measured sizes, all pulled from the source rather than from marketing:

| Corpus               | Rows                       | How counted                                                                            |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `free-exercise-db`   | 873 (repo says "over 800") | JSON files in the repo                                                                 |
| wger public instance | **850** exercises          | `GET /api/v2/exercise/?limit=1` → `count`                                              |
| FIT profile 21.x     | **1 846** exercise names   | sum of the 51 `*ExerciseName` enums in `@garmin/fitsdk/src/profile.js` (counted below) |
| ExerciseDB           | "11 000+" claimed          | project README; not independently counted                                              |

The FIT count is worth dwelling on because it is the only one produced by a
device vendor that must render the name on a watch:

```
# counted against @garmin/fitsdk/src/profile.js in this repo
exerciseCategory: 53 members — benchPress, calfRaise, carry, chop, core, crunch,
  curl, deadlift, flye, hipRaise, hipSwing, hyperextension, lateralRaise,
  legCurl, legRaise, lunge, olympicLift, plank, plyo, pullUp, pushUp, row,
  shoulderPress, shrug, sitUp, squat, totalBody, tricepsExtension, warmUp,
  bandedExercises, battleRope, ladder, sandbag, sled, sledgeHammer, tire, …
nameEnumCount: 51    # one *ExerciseName enum per category
totalNames:    1846
benchPress names: barbellBenchPress, dumbbellBenchPress, inclineBarbellBenchPress,
  inclineDumbbellBenchPress, inclineSmithMachineBenchPress, declineDumbbell-
  BenchPress, closeGripBarbellBenchPress, barbellFloorPress, dumbbellFloorPress, …
```

**Read: 1 846 is what you get when equipment and angle are baked into the
name.** Twelve of the bench-press category's members differ only by (incline |
decline | flat) × (barbell | dumbbell | Smith | floor). The same information as
three columns on ~40 rows is here as ~500 enum members. §2 is about which of
those two shapes to pick, and the answer is not obvious in the direction people
assume.

**Practical read for a v1:** 300–900 curated rows is the working range. Below
~200 an athlete hits "my exercise isn't here" in week one; above ~1 500 without
a movement-pattern filter the picker is unusable on a phone. Both open datasets
land in the range without curation.

### 1.2 What fields an exercise actually needs

Divided by what consumes them, because a field with no consumer is a maintenance
cost:

| Field                                                     | Consumed by                                                        | In `free-exercise-db`? | In wger?                           |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------- | ---------------------------------- |
| `name` (canonical, language-neutral)                      | everything                                                         | yes                    | yes (via translations)             |
| `primaryMuscles[]`                                        | volume-per-muscle, heatmap, "balance" checks                       | yes                    | yes (`muscles`)                    |
| `secondaryMuscles[]`                                      | fractional volume attribution                                      | yes                    | yes (`muscles_secondary`)          |
| `equipment`                                               | **load semantics**, gym filter, progression key                    | yes (single value)     | yes (many-to-many)                 |
| **`movementPattern`** (hinge/squat/push/pull/carry/lunge) | session balance, substitution ("give me another hinge"), generator | **no**                 | **no** (`category` is body-part)   |
| **`unilateral`**                                          | rep counting (per side vs total), load semantics                   | **no**                 | **no**                             |
| **`loadSemantics`** (see §5)                              | every weight input, plate calc, tonnage, PR comparison             | **no**                 | partial (`weight_unit` on the log) |
| `mechanic` (compound / isolation)                         | ordering heuristics, volume weighting                              | yes                    | no                                 |
| `defaultRestSec`                                          | rest timer default per exercise                                    | no                     | via `RestConfig` on the routine    |
| `instructions[]`, `images[]`, `video`                     | the "what is this movement" sheet                                  | yes                    | yes                                |
| `aliases[]`                                               | search recall                                                      | **no**                 | yes (`exercisealias`, 167 rows)    |
| `variationGroupId`                                        | "show me other rows like this"                                     | **no**                 | yes (`variation_group`)            |

The three bolded gaps — **movement pattern, unilateral, load semantics** — are
absent from _every_ open dataset surveyed, and all three are load-bearing. They
have to be authored locally over whichever corpus is adopted, which means the
adoption is a **seed**, not a dependency: the rows land in this repo's own table
and get three columns the source never had.

Movement pattern is partially recoverable from FIT's `exerciseCategory`
(`deadlift`, `squat`, `lunge`, `carry`, `row`, `pullUp`, `pushUp`,
`shoulderPress` map onto hinge/squat/lunge/carry/pull/push almost cleanly),
which makes the FIT category enum useful as a **classification vocabulary** even
if its 1 846 names are rejected as an exercise list.

### 1.3 The open datasets, evaluated

| Dataset                                      | Size      | Licence                                              | Shape                                                                                           | Usable?                                                                                                                                                                      |
| -------------------------------------------- | --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`yuhonas/free-exercise-db`**               | 873       | **Unlicense** (public domain)                        | flat JSON per exercise + images                                                                 | **Yes — the default choice.** No attribution burden, no share-alike, trivially seedable.                                                                                     |
| **wger** (`wger-project/wger`)               | 850       | **CC-BY-SA 4.0 per exercise**, code AGPL-3.0         | relational: exercise → translations → aliases, muscles, equipment                               | **Yes, with conditions.** Best structure of any of them; share-alike reaches the derived corpus.                                                                             |
| **ExerciseDB** (`ExerciseDB/exercisedb-api`) | "11 000+" | code AGPL-3.0; **data terms not stated in the repo** | REST API, `bodyParts`/`equipments`/`targetMuscles`/`secondaryMuscles`/`instructions` + media    | **No, not for a seed.** The README says the playground endpoints are "not recommended for production integration"; the data licence is not stated where the code licence is. |
| **workout-cool** (`Snouzy/workout-cool`)     | n/a       | code MIT; exercise data imported by the operator     | **EAV**: `ExerciseAttribute(exercise, attributeName, attributeValue)` over five attribute names | Schema worth reading, corpus not distributed with it.                                                                                                                        |

Two notes that matter more than the sizes:

- **`free-exercise-db`'s enums are usable as-is.** From its published
  `schema.json`: `force ∈ {static, pull, push, null}`,
  `level ∈ {beginner, intermediate, expert}`,
  `mechanic ∈ {isolation, compound, null}`,
  `equipment ∈ {medicine ball, dumbbell, body only, bands, kettlebells, foam roll, cable, machine, barbell, exercise ball, e-z curl bar, other, null}`,
  `category ∈ {powerlifting, strength, stretching, cardio, olympic weightlifting, strongman, plyometrics}`,
  and 17 muscle values. Its provenance is a restructuring of Ollie Jennings'
  `exercises.json`; the repo notes ~25 duplicate images.
- **wger separates the anatomical muscle from the screen muscle**, and that
  distinction is worth stealing whatever corpus you seed from. `GET /muscle/`
  returns 15 rows, each with a Latin `name` ("Biceps femoris"), a display
  `name_en` ("Hamstrings") which is sometimes **empty**, and an `is_front`
  boolean plus front/back SVG overlays — exactly what a heatmap needs and what a
  flat 17-value muscle enum cannot give. The empty `name_en` on Brachialis,
  Serratus, Soleus, Trapezius and Obliquus is wger admitting its display
  vocabulary is smaller than its anatomy: athletes do not think in 15 muscles.

**Licence read.** CC-BY-SA 4.0 is a share-alike on the _data_, and wger attaches
it per row (`license`, `license_author`, `author_history`), so a seeded corpus
carries attribution row by row and derived corpora inherit the share-alike; the
Unlicense carries neither. If the Catalogue is ever published or exported
wholesale that difference is the whole decision; if the seed stays internal,
both work. **Recommendation: seed from `free-exercise-db`, mine wger's
_structure_ (translations / aliases / variation groups / muscle split) rather
than its rows, and use FIT's `exerciseCategory` as the movement-pattern
vocabulary.**

---

## 2. Exercise variants and aliases

The problem stated precisely: "Bench Press", "Barbell Bench Press", "Incline DB
Press" and "Incline Dumbbell Bench Press" are four strings, three movements, two
progression histories and one thing an athlete is trying to find in under two
seconds while standing at a rack.

Four options, all observed in production code:

**Option A — flat rows, equipment in the name.** One row per (movement ×
equipment × angle). What FIT does (1 846 names), what Hevy's user-facing names
do ("Bench Press (Barbell)", "Pull Up (Assisted)" — observed in its CSV export,
see §7).

- ✅ Dead simple. Progression history is trivially separated. Renders as one
  string anywhere, which the Token Sentence likes.
- ❌ The picker explodes. "Show me my chest movements" needs a substring match.
  Adding a new equipment type means N new rows. No structural statement that
  barbell and dumbbell bench are the same movement, so "what else could I do
  here" is unanswerable.

**Option B — canonical exercise + equipment discriminator.** Liftosaur:

```ts
// astashov/liftosaur, src/types.ts
export interface IExerciseType {
	id: IExerciseId // the movement: "benchPress"
	equipment?: IEquipment // "barbell" | "dumbbell" | "smith" | …
}
```

Every reference to an exercise anywhere in that app — program set, history
entry, graph, per-exercise state, plate calculation — carries the pair. The
equipment profile that decides the plate maths is looked up by
`Equipment_getEquipmentDataForExerciseType(settings, exerciseType)`, i.e. **the
load semantics hang off the pair, not the movement**.

- ✅ Short list (one row per movement). Progression histories stay separate
  because the key is the pair. "Same movement, different implement" is
  structurally visible, so substitution works. Load semantics attach where they
  belong.
- ❌ Two-field key everywhere; every FK, every uniqueness constraint, every
  chart series. Angle (incline/decline) is a third axis it does not model, so
  incline bench is still a separate `id`.

**Option C — variation groups.** wger: exercises are peers linked by a
`variation_group`, with no canonical parent. `GET /exerciseinfo/` returns
`variation_group: <id> | null`.

- ✅ Symmetric, no arbitrary "which one is the real bench press" decision, and a
  group can span axes (equipment _and_ angle _and_ grip).
- ❌ Says nothing about _how_ two rows differ, so it can only power "related
  exercises", never "same movement, swap the implement". Groups drift: nothing
  stops a group growing until it means nothing.

**Option D — attributes/EAV.** workout-cool:
`ExerciseAttribute(exerciseId, attributeNameId, attributeValueId)` over
`ExerciseAttributeNameEnum = {TYPE, PRIMARY_MUSCLE, SECONDARY_MUSCLE, EQUIPMENT, MECHANICS_TYPE}`
and a single ~90-member `ExerciseAttributeValueEnum` holding exercise types,
muscles _and_ equipment in one flat enum. New attribute axes cost no migration;
in exchange there is no type safety across axes — nothing prevents
`PRIMARY_MUSCLE = BARBELL` — and every query is a join per attribute. It is the
EAV trade the sibling data-platform note catalogued, taken without the
mitigations.

**Aliases are an orthogonal, cheap, separate mechanism.** wger's `exercisealias`
is 167 rows over 850 exercises and — the detail that matters — attaches to a
**translation**, not to the exercise: an alias is language-scoped ("French Press
Dumbbells" is an alias of the German-authored row's English translation). An
alias table is search-only. It must never be a second identity: the moment an
alias can be logged against, you have two histories for one movement.

**Recommendation for this repo.** Option B for identity + Option C for
discovery + aliases for recall:

```ts
type MovementPattern =
	| 'squat'
	| 'hinge'
	| 'lunge'
	| 'horizontalPush'
	| 'verticalPush'
	| 'horizontalPull'
	| 'verticalPull'
	| 'carry'
	| 'rotation'
	| 'isolation'

type Exercise = {
	id: string
	name: string // canonical, equipment-free: "Bench Press"
	movementPattern: MovementPattern
	primaryMuscles: MuscleId[]
	secondaryMuscles: MuscleId[]
	unilateral: boolean
	variationGroupId: string | null // discovery only, never identity
	// no `equipment` here — see ExerciseVariant
}

// The thing progression, history and charts are keyed on.
type ExerciseVariant = {
	id: string
	exerciseId: string
	equipment: EquipmentId // 'barbell' | 'dumbbell' | 'cable' | …
	angle: 'flat' | 'incline' | 'decline' | null
	load: LoadSemantics // §5 — the reason this entity exists at all
	displayName: string // rendered: "Incline Bench Press (Dumbbell)"
}

type ExerciseAlias = {
	exerciseId: string
	variantId: string | null // an alias may name the variant, not the movement
	text: string // "Incline DB Press"
	locale: string
}
```

The rule that keeps this honest: **history rows reference `variantId`, never
`exerciseId`.** Aggregating up to the movement is then a choice a chart makes;
merging down is impossible if you got it wrong, and dumbbell and barbell bench
genuinely progress independently.

---

## Part 2 — The logging surface

## 3. The set-logging surface

This is the product. Everything else is scaffolding around a person tapping a
phone with one thumb, twenty seconds after a heavy set, with their heart rate at
150 and their glasses fogged. Every design call in this section resolves in
favour of fewer taps and less reading.

### 3.1 The row: prescribed and performed in the same object

The two production models that got this right store the target and the actual
_side by side_, not in separate tables:

```ts
// astashov/liftosaur, src/types.ts — ISet (abridged)
interface ISet {
	index: number
	reps?: number //  prescribed
	weight?: IWeight //  prescribed (rounded to equipment)
	originalWeight?: IWeight | IPercentage // before rounding — kept!
	minReps?: number //  a rep RANGE: 8–12
	rpe?: number //  prescribed
	isAmrap?: boolean
	timer?: number //  rest after this set
	label?: string //  "top set", "back-off"
	isUnilateral?: boolean
	askWeight?: boolean //  the weight is not knowable until you're there
	isCompleted?: boolean
	completedReps?: number //  performed
	completedRepsLeft?: number //  performed, other side
	completedWeight?: IWeight //  performed
	completedRpe?: number //  performed
	completedSetTimer?: number //  the rest actually taken
	timestamp?: number
}
```

wger reaches the same shape from the other end — its `WorkoutLog` row carries
`repetitions` / `repetitions_target`, `weight` / `weight_target`, `rir` /
`rir_target`, `rest` / `rest_target`, plus `repetitions_unit` and `weight_unit`
FKs and the `iteration` the log belongs to.

Three consequences worth stating outright:

1. **A log row is not a copy of a prescription row; it is the same row, filled
   in.** That is what makes the ghost (§3.2), the diff ("you beat the target by
   two reps") and one-tap completion cheap. A separate `ExerciseSetLog` table
   keyed back to `ExerciseSet` gets the same information but pays a join on the
   hottest surface in the app, and has to answer "what if the athlete added a
   sixth set" with a nullable FK anyway.
2. **`originalWeight` beside `weight` is the honesty field.** The program said
   70 % of 102.5 kg = 71.75 kg; the bar can make 72.5 kg. Storing only the
   rounded number loses the intent and makes the next percentage compound the
   rounding error. This is the same distinction as this repo's authored-vs-
   resolved intensity (ADR 0007), one level down.
3. **`completedRepsLeft` is not a nicety.** A unilateral set that got 10 left
   and 8 right is _one set_ with two rep counts, and collapsing it to "9" is
   fabricated. Liftosaur is the only surveyed model that stores it.

### 3.2 The ghost — previous-session values

The interaction: each row shows, in a lighter weight, what you did on this
exercise last time (`100 kg × 8`), and tapping it fills the row. Getting it
right is entirely about **which "last time"**:

- Not the last calendar session — the last session **containing this
  `variantId`**. Otherwise a push/pull/legs split shows the wrong ghost two days
  in three.
- Matched **positionally within the exercise** (set 3's ghost is last time's set
  3), not by nearest weight. Positional matching is what makes a ramp
  (60/80/100) show the right ghost per row.
- When the set count changed, extra rows show the last row's ghost rather than
  nothing — an empty ghost on set 5 of 5 reads as "new territory" when it only
  means "you did four last time".
- The ghost must be **visibly not an input**. The failure mode observed in
  reviews of several apps is athletes logging the ghost by accident and never
  noticing; the fix is that the ghost is text, and the input is empty, and
  filling it is an explicit tap.

**"Same as last time" is the single highest-value control on the screen** and it
should exist at three scopes: per set (tap the ghost), per exercise (one tap
fills every set), and — with more care — per session. The per-exercise one is
the one that gets used.

### 3.3 Warm-up vs working sets

Every surveyed model marks this, and they disagree on how much else the marker
carries:

| Source    | Set-role vocabulary                                                |
| --------- | ------------------------------------------------------------------ |
| wger      | `normal, warmup, dropset, myo, partial, forced, tut, iso, jump`    |
| Hevy      | `normal, warmup, dropset, failure` (documented in its API and CSV) |
| FIT       | `set_type ∈ {rest, active}` — **only two**                         |
| Liftosaur | no set role; warm-ups are a separate list with their own timer     |

Two things follow. First, **warm-up is not one flag among many** — it changes
what the set _means_ to every downstream number: warm-ups must be excluded from
tonnage, from PR detection, and from "sets per muscle group per week", and
included in session duration. Second, wger's list conflates two axes: `warmup`
and `dropset` are roles, but `partial`, `tut`, `iso` and `jump` are execution
qualities that can co-occur with a role. Nine flat values is one enum too few.

Recommended split — a role (exactly one) plus modifiers (zero or more):

```ts
type SetRole = 'warmup' | 'working' | 'backoff' | 'dropSegment' | 'myoMini'
type SetModifier = 'partials' | 'isoHold' | 'paused' | 'toFailure' | 'assisted'
```

### 3.4 The failed-set marker

"Failed" means at least three different things and a single flag lies about all
of them:

- **Missed the target** — prescribed 5, got 3. Fully expressed by
  `completedReps < reps`; needs no flag at all, and a flag here is redundant
  state that can disagree with the numbers.
- **Went to momentary failure deliberately** — an AMRAP or a to-failure set that
  succeeded. This is `SetModifier.toFailure`, and it is a _plan_, not a miss.
- **Abandoned** — racked it, form broke, tweaked something. Not a rep count at
  all.

Hevy's `failure` set type is the second sense. Program-state machines (deloads
after N failures) care about the first. Keep them separate: derive "missed" from
the numbers, store "to failure" as a modifier, and give abandonment its own
value so it can be excluded from every aggregate.

### 3.5 Per-set RPE / RIR

The physiology sibling covers what RPE means; the surface facts:

- **It must be optional per set and rarely asked.** Liftosaur gates it with
  `logRpe?: boolean` per set — the program decides which sets ask. Asking on
  every set of every session is how a logger becomes a chore.
- **The prescribed and reported values are different fields** (`rpe` vs
  `completedRpe`), for the same reason as reps.
- **RIR and RPE are one stored quantity or two, and mixing is a bug.** wger
  stores RiR with a documented cap of 9.5 and rounds to the nearest 0.5 before
  serialization. Half-point granularity is the practical resolution; a
  free-decimal field invites 7.3.
- On a phone: a horizontal chip row (`6 · 7 · 8 · 9 · 10`) beats a stepper beats
  a slider. One tap, no precision required, thumb-reachable.

### 3.6 The rest timer

The behaviours that separate a good timer from a bad one, in order of how much
they matter:

1. **Auto-start on set completion.** A timer you have to start is a timer you
   forget. Every serious tracker does this; it is the reason the "complete set"
   tap is one tap and not two.
2. **Per-exercise durations with a session default.** Liftosaur's defaults are a
   `timers.workout` (180 s in its own program-content builder) and a separate
   `timers.warmup`; per-set override via `ISet.timer`. wger models rest as a
   first-class progression axis — `RestConfig` and `MaxRestConfig` alongside
   weight/reps/RiR — which is more than most athletes need but is the right
   shape: rest is prescribed data, not a UI preference.
3. **It must survive backgrounding, screen lock and a pocket.** That means a
   scheduled local notification at the deadline plus a wall-clock-derived
   remaining time on resume — never a `setInterval` a suspended JS context stops
   running. **Flagged: an engineering claim about mobile browser behaviour, not
   something the surveyed apps document.**
4. **Overflow, not truncation.** Liftosaur's `isOverflowSetTimer` and
   `completedSetTimer` record the rest _actually taken_ — more honest than the
   prescription, and the only way "your rest is creeping up" is ever knowable.
5. Adjust by ±15/30 s with one tap; audible/haptic at zero; the timer never
   blocks logging the next set.

### 3.7 The plate calculator

The maths is trivial and the model is not. Liftosaur's `Weight_calculatePlates`
is the most complete open implementation:

```ts
// astashov/liftosaur, src/models/weight.ts (abridged, real field names)
const equipmentData = Equipment_getEquipmentDataForExerciseType(
	settings,
	exerciseType,
)
if (equipmentData.isFixed) {
	// dumbbells / fixed-weight machines: pick the largest available ≤ target
	const weight =
		fixed.find((w) => Weight_lte(w, absAllWeight)) ?? fixed[fixed.length - 1]
	return { plates: [], totalWeight: Weight_roundTo005(weight) }
}
const barWeight =
	equipmentData.useBodyweightForBar && settings.currentBodyweight
		? settings.currentBodyweight
		: equipmentData.bar[units]
const multiplier = equipmentData.multiplier || 1 // 2 for a barbell: plates come in pairs
const isAssisting = equipmentData.isAssisting || false // assisted machines SUBTRACT
const weight = Weight_roundTo000005(Weight_subtract(absAllWeight, barWeight))
const plates = calculatePlatesInternalFast(
	weight,
	availablePlates,
	multiplier,
	isAssisting,
)
```

Five details in there that a naive implementation gets wrong:

- **`multiplier`** — plates are consumed `multiplier` at a time and
  `maxUnits = floor(p.num / multiplier)`. A barbell is `multiplier: 2`; a
  loadable machine with one plate horn is `multiplier: 1`. This is also why the
  smallest achievable increment is `2 × smallestPlate` on a bar and
  `1 × smallestPlate` on a horn.
- **Bounded inventory, not greedy.** `plates: { weight, num }[]` says how many
  of each plate this gym has. Greedy descent fails the moment inventory runs out
  (140 kg with only two 20s per side), so the search is a bounded knapsack with
  pruning, over integer-scaled values (`Math.round(v * precision)`) — 2.5 kg
  plates and a 0.5 kg microplate are exactly what breaks float accumulation.
- **`isFixed`** — a dumbbell rack is not a plate problem; it is "largest
  available ≤ target", falling back to the smallest, which is an honest failure
  rather than an unloadable number.
- **`isAssisting`** — the assisted pull-up/dip machine, where more "weight" is
  _less_ work. The sign is a property of the equipment, not of the number.
- **`useBodyweightForBar`** — for a bodyweight-loaded movement the "bar" is the
  athlete's current bodyweight, so the plate calculator becomes an added-load
  calculator without a second code path.

`Weight_round` is then defined as `calculatePlates(...).totalWeight` — i.e.
**rounding is not a display concern, it is the plate solver run backwards.**
That is the right factoring, and it means a percentage-derived load is always a
loadable load.

On a phone the calculator should be a **passive annotation, not a screen**:
under the weight input, `20 · 20 · 10 · 2.5` per side, in muted text, updating
as you type. Nobody wants to open a calculator; everybody wants to know what to
grab without doing arithmetic while breathing hard.

### 3.8 What makes this good or bad on a phone

Consolidated, because the #434 review's finding — "too much text, the flow and
design is too hard to follow" — is exactly the failure mode this surface
invites:

| Good                                                                | Bad                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| One tap completes a set at the ghost values                         | A modal per set                                             |
| Numeric inputs open a numeric keypad and select-on-focus            | A generic text field the athlete has to clear first         |
| The complete-set target is ≥44 pt and near the bottom of the screen | Anything requiring a reach to the top bar mid-session       |
| Rest timer is a persistent bar, always visible, never blocking      | A full-screen timer you have to dismiss to log the next set |
| Explanations live behind the exercise name, one tap away            | A paragraph next to the control (this is the #434 defect)   |
| The screen survives lock/background/rotation with no state loss     | Anything that loses a half-logged session                   |
| Everything on one scroll: exercises stacked, sets as rows           | A wizard step per exercise                                  |

**The Token Sentence question.** ADR 0027 makes the _prescription_ a rendered
sentence, and that decision is right and should stand: a prescription is read
before the session, on the couch, and reads well as
`5 × 5 @ 100 kg · 3 min rest`. The **log** is a different mode of the same data:
it is written during the session, one number at a time, and a sentence is the
worst possible shape for it — every edit is a popover, the numbers do not align
into columns, and a set-by-set diff against the ghost is invisible. The honest
reconciliation, and the recommendation:

> **The Token Sentence renders the prescription. The set grid records the
> performance. They are the same rows, in two modes, and the sentence is what a
> completed session collapses back to for the ledger.**

That keeps render-never-parse intact (the sentence is still a pure function of
structure), keeps ADR 0027 §4's "read view and edit view are the same rendering"
true for the prescription, and refuses to make an athlete tap a popover per
number between sets.

---

## 4. The shapes a set model must express

Each shape below, with what it structurally requires. The recurring finding: a
flat `ExerciseSet[]` covers about half of them, and the other half need either a
**grouping id** or a **sub-set segment list**.

| Shape                  | What it is                                                                                   | Structural requirement                                                                                      | Flat `ExerciseSet[]`?               |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Straight sets**      | `4 × 8 @ 60 kg`                                                                              | nothing                                                                                                     | ✅                                  |
| **Ramp / pyramid**     | `60×8, 80×5, 100×3`                                                                          | per-set load — sets are not uniform                                                                         | ✅ (already required today)         |
| **Superset**           | A1 bench + A2 row, alternating, rest after the pair                                          | a **container over exercises**, plus rest-belongs-to-the-group                                              | ❌ — needs a group above the set    |
| **Circuit**            | 5 exercises, one round, N rounds                                                             | the same container + a **round count** (an outer repeat)                                                    | ❌                                  |
| **Drop set**           | 100×8 → 80×6 → 60×5, no rest between drops                                                   | **one set with an ordered list of load segments**; the whole thing is one entry in the set count            | ❌ — needs sub-set segments         |
| **Myo-reps**           | one activation set to near-failure, then N mini-sets of 3–5 at the same load with ~20 s rest | one activation set + **a run of mini-sets bound to it**, sharing a load; mini-sets are not independent sets | ❌                                  |
| **Cluster set**        | 3 × 1 @ 90 % with 20 s intra-set rest, counted as one set                                    | **intra-set rest** as a first-class field, plus a cluster size                                              | ❌                                  |
| **AMRAP**              | as many reps as possible                                                                     | a **termination rule** rather than a rep target; `reps` becomes an outcome, and a `minReps` floor is common | ⚠️ needs `kind`                     |
| **EMOM**               | every minute on the minute, N minutes                                                        | a **time-boxed container** whose rest is `interval − work`, i.e. rest is derived, not stated                | ❌                                  |
| **Timed hold**         | plank 3 × 45 s                                                                               | duration as the quantity instead of reps                                                                    | ⚠️ needs `kind: 'timed'`            |
| **Loaded carry**       | farmer's walk 4 × 40 m @ 2 × 32 kg                                                           | **distance AND load simultaneously**, plus per-hand load                                                    | ❌ — and it breaks the ADR 0002 XOR |
| **Rest-pause**         | one set, rest 15 s, continue to failure, repeat ×2                                           | same as clusters (intra-set rest) with an AMRAP termination per segment                                     | ❌                                  |
| **Contrast / complex** | heavy squat then jump squat, paired                                                          | the superset container, no new concept                                                                      | ❌ (container only)                 |

The minimal model that covers all of it — two additions to what a flat list
already gives, not thirteen special cases:

```ts
// (1) A grouping above the set, which is ALSO how supersets/circuits/EMOM work.
type SetGroup = {
	id: string
	kind:
		| { kind: 'straight' }
		| { kind: 'superset' } //  alternate between member exercises
		| { kind: 'circuit'; rounds: number }
		| { kind: 'emom'; intervalSec: number; rounds: number }
	restAfterSec: number | null // rest belongs to the GROUP, not the last set
	members: string[] // exerciseVariantIds, in execution order
}

// (2) A set is one entry in the set count and may have several load segments.
type LoggedSet = {
	id: string
	groupId: string
	variantId: string
	orderIndex: number
	role: SetRole
	modifiers: SetModifier[]
	termination:
		| { kind: 'reps'; target: number; minTarget?: number } // 8, or 8–12
		| { kind: 'timed'; targetSec: number }
		| { kind: 'amrap'; floor?: number }
		| { kind: 'toRir'; rir: number }
		| { kind: 'velocityLoss'; pct: number }
	// The list is length 1 for a normal set. Length N for a drop set, a
	// myo-rep run, a cluster, or rest-pause. THIS is the field that turns
	// four "advanced technique" features into one shape.
	segments: Array<{
		load: LoadValue // §5
		reps: number | null
		repsLeft: number | null // unilateral, other side
		durationSec: number | null
		distanceM: number | null // carries
		intraRestSec: number | null // 0 for a drop, ~20 s for a cluster
		rpe: number | null
	}>
	completedAt: Date | null
	restTakenSec: number | null
}
```

**The one claim to defend here:** collapsing drop sets, myo-reps, clusters and
rest-pause into `segments[]` is not over-abstraction — the four differ only in
`intraRestSec` and whether the load descends. Modelling them as four `kind`s
means four renderers, four aggregation rules and four ways to get tonnage wrong.
Modelling them as segments means one renderer and one aggregation rule
(`tonnage = Σ segments`), and the _name_ of the technique becomes a label, which
is what it is.

**Rendering these as a Token Sentence** (the ADR 0027 constraint) survives, and
this is worth checking explicitly because it is the test the model has to pass:

```
5 × 5 @ 100 kg · 3 min rest
100 kg × 8 → 80 kg × 6 → 60 kg × 5            (a drop set: → is the segment join)
3 × 1 @ 90 % 1RM · 20 s intra-set rest         (a cluster)
A1 bench 3 × 8 · A2 row 3 × 10 · 90 s rest     (a superset: · joins members)
EMOM 10 min: 3 clean @ 70 kg                   (the group states the interval)
4 × 40 m @ 2 × 32 kg                           (a carry: distance AND load)
```

All six are pure renderings of the structure above; none needs a parser; each
value in them is a token. The one that does _not_ render cleanly is a myo-rep
run, which needs an explicit convention (`12 @ 60 kg + 4 × 4 myo-reps`) rather
than falling out of the segment list — flagged as an open question, not a
blocker.

---

## 5. What "weight" means across equipment

A single `weightKg: Float` is silently wrong in five distinct ways. This is the
section with the highest ratio of consequence to effort, because every one of
these errors is invisible until it corrupts a PR, a tonnage total or a plate
calculation.

| Equipment                      | What the athlete types | What it means                     | What tonnage should use | Trap                                                                              |
| ------------------------------ | ---------------------- | --------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| Barbell                        | `100`                  | total incl. bar                   | 100                     | Is the bar included? Every app says yes; the plate calc must subtract it.         |
| Dumbbell (pair)                | `32`                   | **per hand**                      | 64                      | A "32 kg dumbbell press" outranks a "60 kg barbell press" in a naive PR list.     |
| Dumbbell (single, e.g. goblet) | `32`                   | total                             | 32                      | Same equipment, different multiplier, decided by the _exercise_.                  |
| Kettlebell (double)            | `24`                   | per hand                          | 48                      | as above                                                                          |
| Bodyweight only                | —                      | bodyweight at the time            | bodyweight × reps       | Requires a bodyweight history; using today's weight rewrites last year's tonnage. |
| Bodyweight + added             | `+20`                  | bodyweight **plus** 20            | (bw + 20) × reps        | Storing `20` alone makes a weighted pull-up look lighter than a curl.             |
| **Assisted** (pull-up machine) | `21`                   | bodyweight **minus** 21           | (bw − 21) × reps        | The sign is inverted. More number = less work = _lower_ PR.                       |
| Machine stack                  | `level 7`              | an **ordinal**, not a mass        | not comparable          | Stack plates are not standardised; "7" on one machine ≠ "7" on another.           |
| Cable (per-side pulley)        | `20`                   | may be halved by the pulley ratio | ambiguous               | Machine-dependent; the honest answer is "as marked", not a kg claim.              |
| Band                           | `red`                  | a non-linear force curve          | **not computable**      | Any kg conversion is fabricated.                                                  |

The shape that survives all ten rows:

```ts
type LoadValue =
	| { kind: 'external'; kg: number } //  barbell total, machine in real kg
	| { kind: 'perSide'; kg: number; sides: 2 } //  dumbbells, kettlebells
	| { kind: 'bodyweight' } //  no external load
	| { kind: 'bodyweightPlus'; addedKg: number } //  weighted dip/pull-up
	| { kind: 'assisted'; assistKg: number } //  effective = bw − assist
	| { kind: 'stackLevel'; level: number; label?: string } // ORDINAL
	| { kind: 'band'; bandId: string } //  named, never converted
	| { kind: 'unloaded' } //  a timed hold, a jump

// Attached to the VARIANT (§2), so the input widget, the plate calculator and
// every aggregate know what the number means before the athlete types it.
type LoadSemantics = {
	kind: LoadValue['kind']
	barKg: number | null //  20 for an Olympic bar, 15 for a women's bar
	perSideMultiplier: 1 | 2
	inventoryProfileId: string | null // which plates/dumbbells this gym has
}
```

Rules that fall out, and each is a bug avoided:

- **`effectiveKg` is a derived function, never a stored column**, and it is
  `null` for `stackLevel` and `band`. The Unavailable Metric principle
  (ADR 0008) applies exactly: a machine level has no honest kilo, and inventing
  one to make the tonnage chart continuous is precisely the fabrication the repo
  forbids. A stack-level exercise still has a **within-exercise** progression
  (level 6 → 7 is real), so its strength curve is drawable; only cross-exercise
  comparison and tonnage are unavailable.
- **Bodyweight-derived loads need the bodyweight _at the time_.** Storing the
  computed effective load at log time, alongside the authored `LoadValue`, is
  the only way a two-year-old weighted-dip PR stays true after a 6 kg bodyweight
  change. This is a resolve-and-bake, exactly like this repo's resolved
  intensity ranges.
- **wger's answer is a `weight_unit` FK** whose live values are
  `{Body Weight, Kilometers Per Hour, Miles Per Hour, Plates, kg, lb}`, paired
  with a `repetition_unit` of
  `{Kilometers, Meters, Miles, Max Reps, Repetitions, Until Failure, Minutes, Seconds}`
  — the same ground covered with two lookup tables instead of a union, at the
  cost of every consumer switching on a foreign key with no exhaustiveness
  check. Prior art; the union is the better shape in TypeScript.
- **Assisted load is where every export format breaks.** Hevy's CSV sample
  carries `Pull Up (Assisted), weight_kg 21` — a positive number that means −21
  kg of load. _(Inferred from a community-published sample export, not from
  Hevy's documentation; the sign convention is not documented anywhere I could
  find.)_ Any importer must special-case assisted variants or it will import
  weighted pull-ups.

---

## 6. Progress surfaces

The honest/vanity split matters here more than in endurance, because strength
numbers are so easy to make go up.

| Surface                                    | What it reads                            | Verdict                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-exercise strength curve**            | top-set load over time, per `variantId`  | **Honest.** The core surface. Must be per variant (§2), and must exclude warm-ups.                                                                                |
| **Estimated-1RM trend**                    | best e1RM per session, from the best set | **Honest with a named formula.** The estimate is a model, and the model must be named on the axis, not hidden. Formula choice is the physiology sibling's ground. |
| **Rep-max records per rep count**          | heaviest weight at exactly N reps        | **Honest and underrated.** "Set records" in Hevy's vocabulary; the least model-dependent record there is.                                                         |
| **Heaviest weight ever, any reps**         | max load                                 | **Honest**, and the one athletes actually care about.                                                                                                             |
| **Tonnage / volume load per exercise**     | `Σ reps × effectiveKg`                   | **Honest as a dose reading, dishonest as an achievement.** It goes up when you do more junk. Never a PR.                                                          |
| **Volume per muscle group per week**       | sets or tonnage attributed to muscles    | **Semi-honest — declare the attribution rule.** See below.                                                                                                        |
| **Hard sets per muscle per week**          | count of working sets                    | **The most defensible dose metric**, and the one the strength literature actually uses. Cheap: no load maths.                                                     |
| **Session tonnage record**                 | "most weight lifted in a session"        | **Vanity.** Maximised by longer sessions and lighter sets.                                                                                                        |
| **Streaks**                                | consecutive weeks/days trained           | **Vanity.** Measures app-opening. Actively harmful if it discourages a deload.                                                                                    |
| **Muscle-group heatmap**                   | coloured body diagram                    | **Vanity dressed as analysis** unless the attribution rule is stated — see below.                                                                                 |
| **Estimated 1RM leaderboard across lifts** | comparing bench to squat to curl         | **Vanity.** Cross-exercise comparison of absolute load says nothing.                                                                                              |

**The muscle-attribution rule is the load-bearing detail.** Liftosaur's answer
is an explicit, user-visible constant —
`settings.planner.synergistMultiplier = 0.5`, a synergist muscle scoring half a
primary, with per-exercise overrides. That number is a **convention, not a
measurement**, and a heatmap with an undeclared attribution rule is a coloured
picture that looks like evidence.

**PR detection.** Hevy documents four kinds — best 1RM, best set volume, best
session volume, set records at each rep count — and fires a live banner when a
completed set beats one. Two design notes: the check runs **on set completion**,
not at session end (the banner is the reason the feature exists), and against
the **variant's** history, so a first-ever dumbbell bench does not trigger four
PRs on day one. That last case needs a rule: on a variant with fewer than ~3
prior sessions it is a first entry, not a record, and "first time!" is both
truer and nicer than "PR!".

The whole strength PR set is derivable from set rows alone — **no stream, no
resolution tier, no analysis blob**. That is a materially different situation
from ADR 0021's deferred pace/power benchmarks, and it means strength PRs can
ship on the same day the log does.

---

## 7. Import, export and interoperability

**There is no standard.** The finding, stated plainly, because it changes the
plan: unlike endurance — where FIT/TCX/GPX are real, versioned, schema-backed
formats — lifting data has one device-level format and a handful of per-app
CSVs.

### 7.1 FIT is the only cross-vendor format, and it is lossy

From the profile shipped in this repo's `@garmin/fitsdk` (message 225):

| Field                   | Type                                     | Note                                                                 |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `duration` (0)          | uint32, **scale 1000**, seconds          | milliseconds on the wire                                             |
| `repetitions` (3)       | uint16                                   | —                                                                    |
| `weight` (4)            | uint16, **scale 16**, kg                 | 1/16 kg resolution; no sign, so **assisted load is unrepresentable** |
| `setType` (5)           | enum                                     | **`{0: rest, 1: active}` — that is the whole vocabulary**            |
| `startTime` (6)         | dateTime                                 | —                                                                    |
| `category` (7)          | **array** of `exerciseCategory`          | array, because a movement can be in several categories               |
| `categorySubtype` (8)   | **array** of uint16                      | indexes into the category's `*ExerciseName` enum                     |
| `weightDisplayUnit` (9) | `fitBaseUnit` `{other, kilogram, pound}` | display only                                                         |
| `messageIndex` (10)     | messageIndex                             | ordering                                                             |
| `wktStepIndex` (11)     | messageIndex                             | links the set back to the prescribed workout step                    |

Corroborating facts from the same profile, all verified locally:

- `exercise_title` (message **264**) carries
  `exerciseCategory, exerciseName, wktStepName` — the escape hatch for a
  **custom exercise name** that is not in the 1 846-member enum.
- The **workout** side (message 27, `workout_step`) carries `exerciseCategory`,
  `exerciseName`, `exerciseWeight`, `weightDisplayUnit`, and its `durationType`
  enum includes **`reps` (29)** and **`repetitionTime` (28)** — so a prescribed
  rep target is expressible.
- `lap.repetition_num` exists; `session` carries `workoutRpe` and `workoutFeel`
  but **no total-repetitions field**.
- `workoutEquipment` is a swim-only enum (`swimFins`, `swimKickboard`, …) —
  there is **no strength equipment field**, which is why FIT bakes equipment
  into the exercise name.
- `subSport` has `strengthTraining` (20), `flexibilityTraining` (19),
  `cardioTraining` (26), `hiit` (70).

**What survives a FIT round trip:** exercise identity (if it is in the enum, or
via `exercise_title`), reps, load in kg, per-set duration, ordering, and the
link to a prescribed step. **What does not:** warm-up vs working, drop segments,
RPE/RIR per set, unilateral split, assisted (negative) load, band and
stack-level loads, superset grouping, and rest actually taken (only
`setType: rest` sets, which is a coarser thing).

### 7.2 The CSVs everyone actually migrates with

| Source     | Columns (as published / observed)                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Strong** | `Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE`                                              |
| **Hevy**   | `title, start_time, end_time, description, exercise_title, superset_id, exercise_notes, set_index, set_type, weight_kg, reps, distance_km, duration_seconds, rpe` |
| **wger**   | no CSV; the REST API is the export surface (`/api/v2/workoutlog/`), which is strictly richer                                                                      |

Observations, with sourcing marked:

- Both CSVs are **one row per set**, denormalised with the session repeated on
  every row: the right shape for an importer, a terrible one for a source of
  truth.
- Strong's format is verified against a community-published real export
  (`AlexandrosKyriakakis/StrongAppAnalytics/Data/strong.csv`), whose rows carry
  `Distance` and `Seconds` as `0` when unused — **`0` is ambiguous with a real
  zero**, the same trap TCX has with `DistanceMeters`.
- Hevy's columns carry `superset_id` and `set_type`, so it exports strictly more
  structure than Strong. _(Corroborated across several independent third-party
  importers and a published sample; I could not retrieve Hevy's own OpenAPI
  document — `api.hevyapp.com/docs` serves a Swagger UI whose
  `swagger-initializer.js` still points at the Swagger petstore demo spec.)_
- Neither CSV carries: exercise identity beyond a display string, equipment,
  bodyweight at the time, rest taken, per-set notes, or drop-set structure. **An
  import from either is a lossy import, and the app should say so** rather than
  silently producing a history that looks complete.

### 7.3 The platform health stores are not an interchange path

- **Apple HealthKit** has `HKWorkoutActivityType.functionalStrengthTraining` and
  `.traditionalStrengthTraining`, and records duration, energy and heart rate —
  but no reps, sets or load, so third-party trackers keep the lifting data in
  their own store. _(Widely reported in developer and review sources; the
  activity-type constants are documented, the absence is inferred.)_
- **Health Connect** on Android exposes an `ExerciseSegment` with a segment type
  and a repetition count, which is closer — but whether any load field exists is
  **unverified**: the reference pages I fetched returned a package index rather
  than the class.

### 7.4 What an export must carry

```ts
type StrengthExport = {
	schemaVersion: string
	athlete: { bodyweightHistory: Array<{ date: string; kg: number }> } // §5
	equipmentProfiles: EquipmentProfile[] // bars, plates, dumbbell racks
	exercises: Array<Exercise & { variants: ExerciseVariant[] }> // incl. custom
	sessions: Array<{
		id: string
		startedAt: string
		endedAt: string | null
		groups: SetGroup[] // supersets/circuits survive
		sets: LoggedSet[] // segments, role and modifiers survive
	}>
}
```

Plus a **Strong-shaped CSV** as a second artifact, because that is the format
the rest of the world reads, and its lossiness is acceptable for a lossy
destination. The rule: the JSON is the archival export, the CSV is the
interoperability export, and the UI names which is which instead of offering
"Export" once.

---

## Implications for trainm8

The repo has a real strength model already — `WorkoutStep.kind = 'strength'`
with an `Exercise` FK and `ExerciseSet[]` children (ADR 0007), and `ExerciseSet`
has already been given a `LoadTarget` union, an `EffortCap` and a termination
`kind`. That is the **prescription** half, and it is in better shape than most
of what this note surveyed. What follows is about the half that does not exist.

**1. There is no performed side.** `ExerciseSet` states what should happen.
Nothing records what did. Every surface in §3 and §6 — the ghost, one-tap
completion, PR detection, tonnage, the strength curve — is downstream of a set
row that has both. The recommendation is the wger/Liftosaur shape: **target and
actual in one row**, not a separate log table, with the row created from the
prescription at session start and filled in during it.

**2. `Exercise` is under-specified for the picker and for load.** It carries a
single `primaryMuscle` string and a nullable `equipment` string; missing are
secondary muscles, movement pattern, unilateral, aliases, variation grouping,
and — most consequentially — anything that says what a weight number _means_.
The `ExerciseVariant` split of §2 unlocks §5, §3.7 and honest per-variant
history in one move.

**3. `ExerciseSet` has no grouping and no segments.** Supersets are claimed to
work today via `WorkoutBlock.repeatCount`, and for prescription they do. Drop
sets, myo-reps, clusters and rest-pause do not, and neither does per-group rest.
The `segments[]` addition in §4 is small and covers four techniques at once.

**4. ADR 0002's XOR is a strength problem, not just a cardio one.** A loaded
carry is `4 × 40 m @ 2 × 32 kg` — a distance _and_ a load, simultaneously. The
XOR governs `WorkoutStep` and a carry lives on `ExerciseSet`, so today this is a
gap rather than a contradiction; but if set-level quantities are ever modelled
by analogy with step-level ones, the XOR must not be copied down.

**5. The one-thumb constraint should be written down.** ADR 0028 makes the UI
mobile-first; the #434 review shows that mobile-first did not prevent a screen
of 4 283 lines carrying 24 explanatory prose spans. A logging surface needs a
stronger rule: **no prose on it at all**, every explanation one tap behind a
name, and a hard budget on controls per row.

### ADRs this research challenges

| ADR                                         | What it decided                                                                                     | What the evidence says                                                                                                                                                                                                                                      | Verdict                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **0027** text-first authoring               | The Token Sentence is the authoring surface; render, never parse; read view = edit view             | Right for the **prescription**, wrong if extended to the **log**. Logging is a grid of ghosted rows operated one-thumbed between sets; a popover per number is the #434 failure repeated. Scope the ADR to prescription and name the log as a second mode.  | **Amend**                       |
| **0007** step as discriminated union        | `ExerciseSet` gets a `LoadTarget` union, an `EffortCap` and a termination union                     | Confirmed and already the right axis — but `LoadTarget` needs `assisted` (negative), `perSide` and `stackLevel`/`band` arms, and the set needs `segments[]` plus a group id. The performed side is missing entirely.                                        | **Amend**                       |
| **0002** step quantification (the XOR)      | A step carries at most one Step Quantity                                                            | Correct at step level. A **loaded carry** needs distance and load together at **set** level, so the XOR must not be inherited downward.                                                                                                                     | **Confirm** (with a scope note) |
| **0021** Personal Records as derived        | PRs are derived, never authored; pace/power benchmarks deferred until streams have resolution       | The derived-never-authored rule is exactly right and applies unchanged. But strength PRs need **no stream tier**: the set row is the measurement. The `BenchmarkKind` union should grow strength arms (`e1RM`, `repMax(n)`, `heaviestLoad`) now, not later. | **Amend**                       |
| **0047** strength progresses by anchor+ramp | Strength uses a Season Anchor + Volume Ramp; Volume Landmarks retired; `pct1RM` resolves to nothing | Confirmed, and the missing 1RM it flags is now locatable: an e1RM is derivable **per variant** from logged sets, which is where a per-exercise 1RM can actually live (the ADR notes `DisciplineProfile`'s key structurally cannot hold it).                 | **Amend**                       |
| **0049** every import auto-saves, no inbox  | Ingest applies immediately; the athlete corrects afterwards                                         | Confirmed, and it generalises: a live strength session must **persist every set as it is completed**, never on a "save workout" button. The same argument (the athlete already did the work) plus a much worse failure mode (a lost session).               | **Confirm**                     |
| **0051** the Catalogue has four axes        | A cited corpus of workouts, four orthogonal axes, authorship asserted                               | The **Exercise corpus is a second corpus with the same needs** — provenance, licence, authored-vs-seeded — and `Exercise.createdByAthleteId` is the only axis it has today. Seeding from a CC-BY-SA source makes per-row licence a real column.             | **Amend**                       |
| **0023** shared display formatting          | One module owns unit, precision and formatting                                                      | It cannot format a strength load without equipment context: `32` renders as `2 × 32 kg`, `+20 kg`, `−21 kg assist` or `level 7` depending on `LoadSemantics`. The formatter needs the variant, not just the number.                                         | **Amend**                       |
| **0008** the Unavailable Metric             | Never fabricate; degrade to an honest gap                                                           | The governing principle for §5 and §6: band and stack-level loads have **no** honest kilo, and a heatmap's synergist multiplier is a declared convention, not a measurement.                                                                                | **Confirm**                     |
| **0028** mobile-first UI standard           | Mobile-first is the standard                                                                        | Necessary and demonstrably not sufficient (#434). The logging surface needs an explicit no-prose, thumb-reach, one-tap-per-set rule.                                                                                                                        | **Amend**                       |

---

## Claims this document declines to launder

- **"11 000+ exercises."** A count is not a corpus. The two datasets that
  actually carry usable structured fields hold 850–873 rows, and FIT's 1 846 are
  mostly the Cartesian product of ~40 movements with equipment and angle. A
  bigger list makes the picker worse unless the extra rows carry extra fields.
- **A muscle-group heatmap as an analytical surface.** It is a coloured body
  with an undeclared attribution constant behind it (Liftosaur's is a
  user-visible 0.5). Shipping it is fine; shipping it as evidence of anything is
  not.
- **"Total weight lifted" as an achievement.** It is a dose reading. It rises
  with junk volume and with longer sessions, and it falls in a well-run peaking
  block. Never a PR, never a headline number.
- **A kilogram value for a resistance band.** Band force is non-linear in
  extension and unstandardised across manufacturers. Any conversion is invented.
- **A single "strength score" across exercises.** Same shape as the composite
  fitness score the repo already declined, with less evidence: absolute loads
  across different movements are not commensurable, and the normalisations that
  claim to make them so are population tables, not measurements of this athlete.
- **"Your 1RM went up."** An estimated 1RM went up. The estimate is a model
  applied to a set that was not a 1RM, and the axis must say so.
- **Cross-app import fidelity.** Importing a Strong CSV does not give you the
  athlete's history; it gives you exercise-name strings, weights whose equipment
  semantics are gone, and no warm-up/working distinction. Say what was lost.
- **That a device-logged strength session is comparable to an app-logged one.**
  A watch's rep counter is an estimator; FIT gives it the same `repetitions`
  field as a hand-entered count with no confidence marker.

---

## Uncertainty and limitations

- **Hevy's API schema is not machine-retrievable.** `api.hevyapp.com/docs`
  serves a stock Swagger UI whose initializer still references the Swagger
  petstore spec, so every Hevy field name in §7 comes from its published help
  articles plus community-maintained clients and sample exports, corroborated
  across several independent sources but not from a first-party schema document.
- **Strong's CSV header** is taken from a real export committed to a third-party
  analytics repo and from Strong's own help centre article; column _order_ and
  the meaning of `0` in `Distance`/`Seconds` are inferred from the data, not
  documented.
- **The assisted-load sign convention** (positive number = assistance) is
  inferred from one sample row (`Pull Up (Assisted), 21`) and is not documented
  by any vendor I could find. An importer must verify it against a real file
  before trusting it.
- **Health Connect's strength support is unverified.** The Android reference
  pages returned a package index rather than the `ExerciseSegment` class
  reference; the claim that it carries repetitions but no load is _not_
  established here.
- **HealthKit's absence of reps/load** is corroborated across developer and
  review sources but I did not locate a first-party Apple statement enumerating
  it; the activity-type constants are documented, the absence is inferred.
- **Rest-timer background behaviour** (§3.6, item 3) is an engineering claim
  about mobile browsers and OS scheduling, not a documented property of any
  surveyed app. It should be validated on device before being designed around.
- **Exercise counts move.** wger's 850 is a live count from the public instance
  on the date of writing, and its `exerciseinfo` endpoint reported 863 — the two
  endpoints do not agree, which is itself a warning about treating any of these
  numbers as stable.
- **No physiology is asserted here**, and no claim is made about closed
  products' internal models. Rep-max formulas, autoregulation and progression
  rules are the siblings' ground; where this note mentions e1RM or RIR it is
  describing a field, not endorsing a method.

---

## References

### Exercise datasets

- `yuhonas/free-exercise-db` (873 exercises, Unlicense; `schema.json` carries
  the full enums) — <https://github.com/yuhonas/free-exercise-db> ·
  <https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/schema.json>
- wger exercise database (850 exercises, per-row CC-BY-SA 4.0) — live API:
  <https://wger.de/api/v2/exerciseinfo/> · <https://wger.de/api/v2/muscle/> ·
  <https://wger.de/api/v2/equipment/> · <https://wger.de/api/v2/exercisealias/>
  · <https://wger.de/api/v2/setting-weightunit/> ·
  <https://wger.de/api/v2/setting-repetitionunit/>
- `ExerciseDB/exercisedb-api` (AGPL-3.0 code; data terms unstated) —
  <https://github.com/ExerciseDB/exercisedb-api>
- Ollie Jennings' `exercises.json` — the upstream of `free-exercise-db`

### Open-source trackers (source read, not just docs)

- **wger** — <https://github.com/wger-project/wger> (AGPL-3.0)
  - `wger/manager/models/log.py` — `WorkoutLog` with
    `repetitions`/`repetitions_target`, `weight`/`weight_target`,
    `rir`/`rir_target`, `rest`/`rest_target`, `repetitions_unit`, `weight_unit`,
    `iteration`
  - `wger/manager/models/slot_entry.py` — `ExerciseType` =
    `normal, warmup, dropset, myo, partial, forced, tut, iso, jump`;
    `PROGRESSION_FIELDS`; `repetition_rounding` / `weight_rounding`
  - `wger/manager/models/abstract_config.py` — `OperationChoices` (`+ − r`),
    `StepChoices` (`na abs percent`), `repeat`, `requirements` JSON
  - Routine API docs (slots ⇒ supersets, iterations, `need_logs_to_advance`,
    `fit_in_week`, computed `/structure/`, `/date-sequence-gym/`, `/stats/`) —
    <https://wger.readthedocs.io/en/latest/api/routines.html>
- **Liftosaur** — <https://github.com/astashov/liftosaur> (AGPL-3.0)
  - `src/types.ts` — `ISet` (prescribed/completed pairs, `isUnilateral` +
    `completedRepsLeft`, `isAmrap`, `minReps`, `logRpe`, `timer`,
    `isOverflowSetTimer`, `askWeight`, `label`);
    `IExerciseType = { id, equipment }`; `ICustomExercise`; `IEquipmentData`
    (`bar`, `multiplier`, `plates[{weight,num}]`, `fixed`, `isFixed`,
    `useBodyweightForBar`, `isAssisting`, `similarTo`)
  - `src/models/weight.ts` — `Weight_calculatePlates`,
    `calculatePlatesInternalFast` (integer-scaled bounded search),
    `Weight_round` defined via the plate solver, `Weight_increment`/`_decrement`
    from the smallest plate × multiplier
  - `src/models/muscle.ts`, `src/models/settings.ts` —
    `planner.synergistMultiplier = 0.5`, `timers.workout = 180`
  - Liftoscript docs — <https://www.liftosaur.com/docs/>
- **workout-cool** — <https://github.com/Snouzy/workout-cool> (MIT)
  - `prisma/schema.prisma` — the EAV exercise model (`ExerciseAttributeNameEnum`
    = `TYPE, PRIMARY_MUSCLE, SECONDARY_MUSCLE, EQUIPMENT, MECHANICS_TYPE`) and
    `WorkoutSet` with parallel `types[]/valuesInt[]/valuesSec[]/units[]` arrays
- **LiftLog** — <https://github.com/LiamMorrow/LiftLog> (AGPL-3.0), surveyed,
  not quoted

### Formats & APIs

- FIT profile as vendored in this repo — `@garmin/fitsdk/src/profile.js`:
  message **225** `set` (`duration` scale 1000, `repetitions`, `weight` scale 16
  kg, `setType {rest, active}`, `category[]`, `categorySubtype[]`,
  `weightDisplayUnit`, `wktStepIndex`); message **264** `exercise_title`;
  message **27** `workout_step` (`exerciseCategory`, `exerciseName`,
  `exerciseWeight`, `durationType` incl. `reps`/`repetitionTime`); `intensity`
  enum; 53-member `exerciseCategory`; 51 `*ExerciseName` enums totalling 1 846
  names
- FIT Protocol —
  <https://developer.garmin.com/fit/articles/fit-protocol/fit_protocol.html>
- FIT SDK forum, encoding strength-training activity files (sets without
  `record` messages; `activity.timestamp` + `session.total_elapsed_time`
  required) —
  <https://forums.garmin.com/developer/fit-sdk/f/discussion/270009/examples-for-encoding-strength-training-activity-files>
- Strava upload docs, on set-message support for weight-training activities —
  <https://developers.strava.com/docs/uploads/>
- Hevy help centre — set types
  (<https://help.hevyapp.com/hc/en-us/articles/34896293707927-Set-Types-in-Hevy-Explained-Drop-Sets-Warm-Up-Sets-and-More>),
  PRs and set records
  (<https://help.hevyapp.com/hc/en-us/articles/35649367857175-Personal-Records-PRs-and-Set-Records-Explained-How-They-Work-in-the-Hevy-App>,
  <https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records>),
  live PR (<https://www.hevyapp.com/features/live-pr/>), 1RM
  (<https://help.hevyapp.com/hc/en-us/articles/36954464726167-1RM-Explained-How-One-Rep-Max-is-Calculated-and-Use-It-Safely>)
- Hevy API surface (Swagger UI shell only; schema not served) —
  <https://api.hevyapp.com/docs/>
- Strong export — help centre
  (<https://help.strongapp.io/article/235-export-workout-data>) and a real
  export committed third-party
  (<https://github.com/AlexandrosKyriakakis/StrongAppAnalytics/blob/main/Data/strong.csv>)
- Hevy CSV sample, third-party —
  <https://github.com/matanabudy/workout-data-sync/blob/main/examples/hevy_export_sample.csv>
- `HKWorkoutActivityType.functionalStrengthTraining` —
  <https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype/functionalstrengthtraining>

### Negative results worth recording

- **No interchange standard for lifting data exists.** FIT's `set` message is
  the only cross-vendor format, and its `set_type` enum has two members.
- **No open exercise dataset carries movement pattern, unilateral, or load
  semantics.** All three must be authored locally over whatever is seeded.
- **No vendor documents the assisted-load sign convention**, despite every major
  tracker shipping assisted variants.
- **Hevy publishes a Swagger UI that does not serve its own spec** — the
  machine-readable schema referenced everywhere secondhand is not retrievable at
  the documented URL.
