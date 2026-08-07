# The mix-aware conversion decomposes volume into intensity buckets, priced by the athlete's own zone recipe

> **Revisit — Amend.** §3's bands-declare-their-zone fix is exactly right and
> the research argues the same correction one level up — positional folding
> misplaces the threshold band and files sprint work as high-intensity. It needs
> one more declared field: a `Z1 | Z2 | Z3 | none` three-zone bucket per band,
> because the intensity-distribution model's boundaries are the lactate
> thresholds and do not fall on the five-zone edges. See
> [`docs/research/intensity-distribution.md`](../research/intensity-distribution.md).

ADR 0040 §9 retired `TSS_PER_ENDURANCE_HOUR = 60` as a _planning_ conversion and
named no successor. ADR 0043 §8 added a hard requirement — the successor **must
be a function of volume _and_ the Quality Session Mix**, or derived currency
views should not be offered at all — and handed the mechanism here. ADR 0044
left `plannedWeeklyTss` returning **null** for `km` and `sets`, so after #367 a
km-authored **Training Track** reads an **Unavailable Metric** on every
load-derived surface.

This ADR decides the successor. Three consumers were named: derived currency
views (ADR 0043 §8), calendar cost against **Training Availability** (§9), and
**Fitness Projection**. One of the three turns out not to exist yet, and that is
recorded rather than papered over (§8 below).

## Evidence

### The algebra collapses: one stored threshold serves both legs

Every **Load Formula** has the shape `durationHr × IF² × 100`, and for a
pace-anchored discipline `IF = thresholdPace / pace`. Substituting the one into
the other, the duration cancels:

```
TSS for k km at intensity IF
  = (k × TP/3600/IF) × IF² × 100        TP = thresholdPaceSecPerKm
  = k × TP × IF / 36

hours for k km at intensity IF
  = k × TP / (3600 × IF)
```

**TSS per km is linear in IF; hours per km is its reciprocal.** So a single
stored threshold plus one intensity per bucket yields _both_ the load leg and
the calendar-cost leg, with no second assumption. Check: 1 km at threshold with
`TP = 240 s` gives `240/36 = 6.67 TSS`, and one hour at threshold is 100 TSS
over 15 km — `100/15 = 6.67`.

### A single weighted IF is the same algebra with one bucket, and it hides what ADR 0043 §8 requires shown

The obvious cheaper design is a weekly-average IF derived from the mix, applied
as one scalar. It satisfies §8's letter, and it does produce divergence —
`TSS ∝ IF` while `hours ∝ 1/IF`. But substitute a volume-weighted mean and it is
_algebraically identical_ to the bucket decomposition for TSS:

```
buckets:      TSS = Σ_z (v_z · TP · IF_z / 36) = (TP/36) · V · ⟨IF⟩_v
one scalar:   TSS = V · TP · ⟨IF⟩ / 36              ← the same number
```

(The hours differ slightly — buckets take the harmonic mean of IF, one scalar
the arithmetic, so a scalar under-counts hours by a few percent by Jensen's
inequality.) So the choice is not between two mechanisms; it is **how many
buckets**, and one is the degenerate case.

What separates them is honesty, which is the axis ADR 0043 §8 legislates on:

|             | The derivation the athlete is shown                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| **buckets** | "37.5 km easy @ 4:49/km + 17.5 km threshold @ 4:00/km" — **falsifiable**. The athlete can say "no, I jog 5:20". |
| one scalar  | "this week's average IF is 0.79" — **unfalsifiable**. Nobody recognises or can correct that number.             |

And `app/utils/load/fitness-projection.ts:26` states today's assumption in
exactly the second form: _"60 TSS/hour ≈ IF 0.77"_. A mix-fed weekly IF is that
sentence with a new input — an upgrade of the folklore, not a successor to it.

### The zone table this needs already exists, and it belongs to the athlete

`app/utils/session-profile.ts:111`'s `pctToZone` cannot supply an intensity even
in principle: zone 1 is `< 55` and zone 5 is `>= 106`, both unbounded, so
neither has a midpoint. It answers "which zone is this effort in" — a
classification boundary — where the conversion asks "what intensity does a
session in zone z run at", a representative value.

But `app/utils/zones/` already carries the right object (ADR 0006):

```ts
export type ZoneRecipe = {
	id: string
	discipline: CardioDiscipline // per Discipline
	anchor: ZoneAnchor // ftp | runPower | lthr | maxHr | thresholdPace | css
	zones: ZoneBand[] // { label, minRatio, maxRatio? }  ← the ratios
}
```

Athlete-selected (`DisciplineProfile.zoneSystem`), overridable per zone
(`zoneOverrides`), versioned by new id, and per **Discipline** — which is the
property ADR 0043's per-Discipline requirement needs. A recipe's band ratio _is_
an intensity factor, read against the anchor the matching Load Formula divides
by.

### The per-Discipline spread falls out of the recipes, rather than being assumed

ADR 0043's evidence is that weekly-average IF is ~0.83–0.9 for runners versus
~0.6–0.7 for cyclists, i.e. **≈69–81 vs ≈36–49 TSS/hour for identical hours**. A
single shared intensity table cannot express that: `IF_z² × 100` would be the
same number for both. Reading each athlete's own recipe reproduces it with no
new constant at all:

| Athlete                              | Recipe                        | Empty mix  | `{ z4: 2 }` | Survey range |
| ------------------------------------ | ----------------------------- | ---------- | ----------- | ------------ |
| cyclist, 10 h/wk                     | `coggan-power-7` (Z2 → 0.655) | 42.9 TSS/h | 49.1        | 36–49        |
| runner, 5 h/wk, maxHr 195 / LTHR 172 | `olt-hr-5-run` (I-2 → 0.77)   | 76.2 TSS/h | 83.7        | 69–81        |

Both land in their surveyed range, with the hardest weeks slightly above the top
— expected, since the surveyed figure is a season-long weekly _average_
including recovery weeks.

### Positional band mapping misplaces Daniels' threshold, and string matching cannot work at all

`zone-equivalent.ts` maps a band to our five-step ladder by its **position**
(`bandIndexToStep`), documented for "the editor's chip tint and the strip's
segment heights". For load arithmetic it fails on two of the six shipped
recipes:

```
olt-hr-5-*      I-1  I-2  I-3  I-4  I-5      → 1 2 3 4 5      ✓
coggan-power-7  Z1 … Z7                      → 1 2 3 4 5 5 5  ✓
friel-hr-5-*    rec  aer  tempo sub-T over-T → 1 2 3 4 5      ✓
daniels-pace-5  E    M    T     I     R      → 1 2 3 4 5      ✗  T is threshold, third
css-3           Z1   Z2   Z3                 → 1 2 3          ✗  no 4, no 5
```

A Daniels athlete authoring `{ z4: 2 }` — threshold sessions — would be priced
at band `I` (VO₂ max): **97 vs 114 TSS/hour, +31 %**. And `daniels-pace-5` is
the natural choice for a runner while `css-3` is the _only_ swim recipe.

Matching on `ZoneBand.description` is not a cheaper route to the same answer,
because the strings are not there: `'active recovery'`, `'VO₂ max'` (a
subscript, not a `2`), `'sub-threshold'`, `'aerobic endurance'`,
`'marathon pace'` all miss every case in `zoneLabelToZone`. Olympiatoppen
settles it: its bands are named for how hard a zone _feels_ — _veldig lett,
behagelig anstrengende, anstrengende_ — carrying no physiological word to match
on at all.

### An easy-pace ratio is stable across ability for run and swim, and cannot be for bike

Daniels' published pace table, reduced to a speed ratio (T pace ÷ E pace):

| VDOT | E    | T    | ratio |
| ---- | ---- | ---- | ----- |
| 40   | 6:29 | 5:21 | 0.825 |
| 45   | 5:59 | 4:58 | 0.830 |
| 50   | 5:35 | 4:39 | 0.833 |
| 60   | 4:57 | 4:09 | 0.838 |

**0.825–0.838 across the whole range.** Swimming's easy zone is stated
additively — CSS + 6 s per 100 m — which over CSS 1:15–1:50 gives
**0.926–0.948**, and confirms the ratio is per-Discipline on the numbers rather
than only by ADR 0043's argument.

Cycling has no such ratio. Speed at a given intensity depends on aerodynamics,
mass, terrain, wind and whether the athlete is in a group — which is _why_
`KM_PER_HOUR = 10` was folklore, a sharper account than ADR 0043 §10 gives. This
yields the rule that settles where a constant is legitimate: **exactly where the
ratio is stable between athletes.**

### Deriving the ratio continuously from actuals has the wrong sign

`ActivityImport` stores `paceAvgSecPerKm`, `distanceM` and `durationSec` per
import, so the athlete's own easy pace is available, and for cycling it is the
only available source. But driving the conversion off it continuously is
perverse: intensity comes from the recipe (fixed) while hours come from the
pace, so

```
hard month → fatigued → easy pace slips → MORE hours per km → HIGHER projected TSS
```

A runner at TP 4:00 planning 55 km with `{ z4: 2 }` reads 357 TSS at 5:00/km
easy and **374** at 5:20/km. The plan did not change; a fatigue signal reads as
more planned load, and the whole forward curve moves without an edit. Actuals
may **pre-fill**, never **drive** — which is precisely what ADR 0040 §6 does
with the **Season Anchor**.

### Training Availability stores days, not capacity

```prisma
// prisma/schema.prisma:335 — Training Availability (PRD #103)
trainableWeekdays   String?  // JSON array of weekday numbers
defaultTrainingTime String?  // "HH:MM"
```

Trainable weekdays and a clock time. There is no hours capacity, per day or per
week. So ADR 0043 §9's question — "does this week fit against **Training
Availability**" — has **no counterparty to compare hours against**. The
comparison that does exist needs no conversion at all: **Quality Session Count**
against the count of trainable weekdays.

### Nothing can author a Plan Outline yet

`planOutline.create` appears exactly once in the repo, in `prisma/seed.ts`. #367
deleted `plan.new.tsx` and `plan.generate.tsx` and nothing replaced them, and
the seeder chose its currency deliberately:

```ts
// prisma/seed.ts:950
// one run track authored in hours — the currency the Fitness Projection can
// replay without a conversion that does not exist yet (#385).
currency: 'hours',
```

So the km gap is a hole in the model's completeness, not a live defect: no
athlete can create a km-authored track, and #367 worked around the gap rather
than shipping into it.

## Decision

### 1. The conversion decomposes a week's volume into intensity buckets

One easy bucket plus one bucket per **Training Zone** in the **Quality Session
Mix**. Each bucket carries a volume and an intensity; the discipline's stored
threshold moves each bucket between distance, time and TSS by the algebra above.
The week's three readings are projections of **one** decomposition, so they can
never disagree with each other.

Rejected: a mix-derived weekly average IF. Not because it is a different
mechanism — it is this one with a single bucket — but because its derivation is
a number no athlete can check, which is the defect §9 and §10 exist to remove.

### 2. The quality bucket is sized in minutes-in-zone per session, not as a share

The mix gives a _count_ of sessions, never their volume. That volume is a
documented convention in code, per zone, in the ADR 0006 tradition:

```
zone 3 (moderate/tempo)   45 min in zone per session
zone 4 (threshold)        35 min
zone 5 (VO₂ max)          20 min
```

Sourced as convention and to be worded as one (ADR 0040 §13): TrainingPeaks puts
a threshold workout's total at **30–60 minutes** excluding recoveries, with
repetitions of 4–12 min; VO₂ max work at **2–5 minute** efforts; Seiler's 4×8 is
32 min; Tønnessen 2020's 68 min/session is an elite outlier. It is not
physiology and the copy must not imply it is.

**Absolute minutes, not a fraction of the week.** A fractional rule makes the
conversion homogeneous of degree 1 in volume, so TSS/km becomes independent of
volume and the TSS curve is the volume curve scaled _within_ a segment — ADR
0043 §8's decorative duplicate, one level down. With absolute minutes the
quality volume stands still while the ramp fills the easy bucket, so TSS is
**affine** in volume and the two curves differ in slope everywhere, not only at
segment boundaries.

Sensitivity: doubling the assumption from 20 to 45 min/session moves a 55 km
`{ z4: 2 }` week's TSS by **±10 %**. The constant it replaces has _zero_
sensitivity to the mix while being wrong by ~38 % in level.

**If the mix alone exceeds the week's volume** — 20 km/wk with
`{ z4: 2, z5: 1 }` — the easy bucket floors at zero and the app **warns softly
and never corrects**, the shape of ADR 0040 §12, ADR 0042 §9 and ADR 0044 §7.

### 3. Each recipe band declares its Training Zone, and its representative ratio is the bounded midpoint

`ZoneBand` gains `zone?: TrainingZone`, declared per recipe rather than
inferred. Position is superseded for load — it is kept for the chip tint, which
is what it was documented for — and string matching is rejected outright.

| Recipe                     | Declaration                                   |
| -------------------------- | --------------------------------------------- |
| `coggan-power-7`           | Z1→1, Z2→2, Z3→3, Z4→4, Z5→5, Z6→5, Z7→5      |
| `friel-hr-5-bike` / `-run` | 1, 2, 3, 4, 5                                 |
| `olt-hr-5-run` / `-bike`   | I-1→1 … I-5→5                                 |
| `daniels-pace-5`           | E→2, M→3, **T→4**, I→5, R→**none**            |
| `stryd-run-power-5`        | Z1→2, Z2→3, Z3→4, Z4→5, Z5→**none**           |
| `css-3`                    | Z1→1, Z2→2, Z3→**4** (CSS _is_ the threshold) |
| `css-5` (#392)             | Z1→1, Z2→2, Z3→3, Z4→4, Z5→5                  |

Absence is a **positive statement**, of two kinds. Daniels' `R` and Stryd's `Z5`
are neuromuscular — high mechanical intensity at low metabolic strain, which ADR
0042 §7 deliberately kept off the zone axis — so they are not positions on this
ladder. `css-3` declares no 3 and no 5 because three bands cannot express five
zones. **A consumer asking for an undeclared zone substitutes the nearest
declared band and names the substitution** in the shown derivation ("zone 5 read
as `css-3` Z3 _CSS and faster_"); it never silently clamps.

**The representative ratio of a band is its midpoint where the band is bounded
on both sides, and otherwise the edge nearest threshold.** One rule covering
both ends: `coggan` Z2 `0.56–0.75` → 0.655; `olt` I-2 `0.72–0.82` → 0.77;
`stryd` Z1 `0–0.8` → **0.8** rather than a meaningless 0.4; `friel` Z5 `≥1.0` →
**1.0**, the floor, so zone 5 is priced conservatively. The conservative top
costs a week ~2.5 % at one zone-5 session, and conservative is the right
direction for a planning figure.

### 4. Intensity comes from the athlete's own recipe, because the projection joins a measured curve

The cost model is the recipe on the athlete's **Discipline Profile**, converted
to an intensity factor by the anchor:

| Anchor                  | Formula        | ratio → IF                                              |
| ----------------------- | -------------- | ------------------------------------------------------- |
| `ftp`, `runPower`       | `coggan`       | direct                                                  |
| `lthr`                  | `hrTSS`        | direct                                                  |
| `maxHr` (Olympiatoppen) | `hrTSS`        | **× maxHr / LTHR**, both stored                         |
| `thresholdPace`, `css`  | `rTSS`, `sTSS` | **reciprocal** — those recipes store the slow end first |

The reason is not configurability. **Fitness Projection extends the _measured_
CTL curve.** If planned TSS used a different intensity model than the athlete's
actual TSS, a week that went exactly as planned would read as a systematic
mismatch, and the curve would step at today for no training reason. The two
halves must be commensurable, so the conversion must pass through the same Load
Formula and the same anchor the athlete's own sessions resolve through. A table
hardcoded in this ADR would break that for every athlete not on whichever scale
it encoded.

This is also what makes an athlete's choice of scale a real choice rather than a
display preference, and it is why **Olympiatoppen's scale ships as
`olt-hr-5-run` / `olt-hr-5-bike`** with this ADR (§12). Swim is deliberately not
offered an HR variant: ADR 0008 rejected HR for swim, and CSS is the standard
there.

### 5. The distance leg needs a pace source; the easy ratio is a constant only where it is stable

Quality _hours_ follow from §2 without any pace. Only distance needs one, and it
needs exactly two numbers:

```
quality volume  =  quality hours × threshold pace       ← no new constant
easy volume     =  week's volume − quality volume
easy hours      =  easy volume ÷ (r_easy × threshold speed)
```

**Quality volume is priced at threshold pace, uniformly.** Zones 3–5 all sit
within ±10 % of threshold, on ~27 % of the week, so the error on the week's
total is **1.8 %** — cheap enough to buy away a whole quality-pace table.

`r_easy` follows the stability rule from the Evidence:

| Discipline | `r_easy`                           | Source                                                  |
| ---------- | ---------------------------------- | ------------------------------------------------------- |
| run        | **0.83**                           | Daniels' published pace table, stable across VDOT 40–60 |
| swim       | **0.93**                           | CSS + 6 s/100 m, stable across CSS 1:15–1:50            |
| bike       | **from the athlete's own history** | no stable ratio exists; nothing else can serve it       |

The bike window is the **four weeks before the authored Plan Start Week** —
total distance over total duration for that discipline, no attempt to isolate
the easy rides, since ~80 % of volume is easy anyway and the small fast bias can
be stated. Anchoring the window to `startWeekKey` (ADR 0044 §3, authored and
fixed) makes `r_easy` a pure function of plan and history: no stored field, no
drift as later activities land, no perverse sign, and it re-derives naturally on
a re-anchor. An empty window falls back to the constants.

_Corrected by #408: **an empty bike window closes the distance gate** instead.
"Falls back to the constants" cannot be honoured — the constants are `run` and
`swim`, and the table one row above says why a cycling one cannot exist — so
§6's `anything touching distance, bike | ride history in the window` is the
operative rule and this sentence was the wrong half. Nothing else in §5 moves._

_Also sharpened by #408: for cycling the ride window supplies a **speed**, not a
ratio, because there is no cycling threshold speed for a ratio to be taken
against — a bike recipe anchors on `ftp` or `lthr`, and no stored field relates
watts or beats to km/h. So both buckets are priced at the window's speed, i.e.
`r_easy = 1` against it, and **a cyclist's distance reading is
mix-insensitive**: their km and hours curves share a shape. Splitting the
buckets would mean inventing the ratio the Evidence says does not exist.
`hours ↔ TSS` stays fully mix-aware for a cyclist, which is what ADR 0043 §8
legislates on; only the distance leg degenerates, and only because distance
carries no intensity information for a cyclist._

**`r_easy` is not read from the recipe**, even where the recipe is
pace-anchored. The easy band is too wide to have a representative midpoint:
`daniels-pace-5`'s `E` spans `1.29–1.74`, whose midpoint prices a 4:39/km
threshold runner's easy running at **7:03/km** where Daniels' own table says
5:35/km.

### 6. The honesty gate sits on the distance leg, not on the track

| Reading                               | Needs                                     |
| ------------------------------------- | ----------------------------------------- |
| hours ↔ TSS, any endurance discipline | **nothing beyond the recipe and the mix** |
| anything touching distance, run       | `thresholdPaceSecPerKm`                   |
| anything touching distance, swim      | `cssSecPer100m`                           |
| anything touching distance, bike      | ride history in the window                |
| anything involving `sets`             | never available (ADR 0041)                |

So a run track with no `thresholdPaceSecPerKm` **keeps `hours → TSS` and loses
only the distance leg**. The gate is per reading, not per track, and it is one
rule in both directions.

### 7. The conversion is symmetric over the three endurance currencies

Each direction is one equation in one unknown, because quality hours are known
from the mix regardless of the authored currency:

|                    | → km        | → hours     | → TSS       |
| ------------------ | ----------- | ----------- | ----------- |
| **km** authored    | _authored_  | pace source | pace source |
| **hours** authored | pace source | _authored_  | **always**  |
| **TSS** authored   | pace source | **always**  | _authored_  |
| **sets**           | ✗           | ✗           | ✗           |

Worked, in the least obvious direction — an OLT runner authoring 400 TSS/wk with
`{ z4: 2 }` and TP 4:00/km:

```
quality hours = 2 × 35 min                  = 1.17 h
quality TSS   = 1.17 h × 103.0 (I-4)        =  120 TSS
easy TSS      = 400 − 120                   =  280 TSS
easy hours    = 280 ÷ 76.2 (I-2)            = 3.67 h      total 4.84 h
quality km    = 1.17 h × 15 km/h            = 17.5 km
easy km       = 3.67 h × 12.45 km/h         = 45.7 km     total 63.2 km
```

The implied easy pace is 4:49/km; Daniels' table gives 4:48 for a 4:00
threshold.

Symmetry is chosen because ADR 0043 §8 is directional-neutral, because refusing
a direction means _adding_ a rule to a decomposition that already produces all
three, and because §6's gate covers every cell uniformly. That `TSS → km` stacks
two conventions where `hours → km` stacks one is an accuracy statement, not an
availability one — and §10 shows the stack rather than hiding it by refusal.

**Symmetry applies to views, never to the Season Span.** The headline still
reads the guideline layer in the track's own currency and is never derived (ADR
0043 §3, §5). This section does not reopen that.

### 8. One function with two outputs — and the Training Availability fit check is not delivered

Calendar cost is the hours output of the same decomposition, not a second
function. Two functions would be two sets of conventions to keep in step, and
the first divergence between them would be invisible.

No separate rounding posture for calendar cost either: a figure deliberately
pessimistic on one surface and central on another makes one week read as two
different weeks.

**What this ADR delivers to ADR 0043 §9's consumer is the hours _figure_, not
the _fit check_.** Training Availability stores days and a clock time; there is
nothing to compare hours against. A real check needs either a capacity field —
which ADR 0043 §10 closes here — or the days-against-days comparison (**Quality
Session Count** ≤ trainable weekdays), which needs no conversion. Declaring this
undelivered is preferred to fabricating a comparison.

Rejected refinement: per-discipline overhead (an hour in the pool costing 1.5 h
of calendar). Real, but a new constant per discipline with no source, and not
what §9 asked.

### 9. A derived reading carries no Load Confidence

The app has three trust vocabularies and this reading belongs to none: **Load
Confidence** (`high | medium | low`) names which Load Formula produced an
_actual_ and **gates** things (a `low` effort is disqualified from **Personal
Record**); **Planned TSS**'s `full | partial` says how much of a _prescription_
resolved; **Detection Confidence** borrows the first.

A derived weekly reading carries a **chain**, not a level — nothing for
TSS-authored, one convention from hours, two plus a threshold from km, plus any
band substitution. It gates nothing, being display-only. Borrowing Load
Confidence's words would imply a gate that does not exist and would invite
someone to build one on a number that cannot bear it, and it would collide on
the Session Ledger, where actual TSS already shows those three words.

What the reading carries instead:

1. a binary **`authored | derived`** marker, never a grade;
2. the derivation itself (§10);
3. an **Unavailable Metric** when §6's gate closes.

Compute it truthfully or say you cannot, plus provenance — the app's existing
honesty form, with no middle grade.

**A derived weekly reading is not Planned TSS.** Planned TSS is per session,
from Steps, stored, with `full | partial`. This is per week, from guidelines,
never stored. `CONTEXT.md` says so explicitly so the two do not merge on first
reading.

### 10. The derivation is structured data, and every non-authored number names its source

The conversion returns the derivation alongside the numbers, as a value object —
never a preformatted string, since ADR 0023 owns display formatting and a string
can be neither inspected nor made accessible. This is ADR 0008's provenance
pattern: `TssResult` already returns `{ formula, confidence }` beside the number
rather than a sentence about it.

The invariant, which is testable: **every number in the chain that is not
authored names its source.**

```
55 km authored
├─ quality hours  2 × 35 min    convention · TrainingPeaks, 30–60 min at LT
├─ quality km     17.5 km       @ threshold 4:00/km · stored thresholdPaceSecPerKm
├─ easy km        37.5 km       = 55 − 17.5
├─ easy pace      4:49/km       r_easy 0.83 · convention · Daniels' VDOT table
├─ IF easy        0.873         olt-hr-5-run I-2 "fairly easy" · 77 % HFmax × maxHr/LTHR
└─ IF quality     1.015         olt-hr-5-run I-4 "hard"
   ⇒ 4.18 h · 350 TSS · derived
```

The `derived` marker is always visible; the derivation is one interaction away
through **Chart Inspect** (ADR 0030), which already reveals a mark's values in a
panel below the chart and already inspects an **Unavailable Metric** to an
honest reason. Five buckets with sources do not fit inline on a phone (ADR
0028), and ADR 0030 already rejected floating tooltips. **Fitness Projection**
carries one derivation statement for the whole curve, since a curve cannot
annotate every point. A TSS-authored track has no derivation and shows an
`authored` marker with no empty panel.

Sources are named as **convention**, never as measurement — ADR 0040 §13's
requirement, for its reason: when a convention moves later, nobody should think
the body moved.

### 11. The conversion never reads the Week Pattern

ADR 0044 §6 stores a **Week Pattern** per plan, and its `share` weights are the
easy-vs-quality _volume_ split the mix does not give. It is still not readable
here, for three independent reasons, the first of which is decisive:

1. **No week binding exists.** `WeekPattern` carries `name` and `orderIndex` and
   nothing that says which weeks it governs; stamping leaves standalone sessions
   "with no live link back". "Which pattern governs week 34?" is unanswerable
   from stored data, not merely awkward.
2. **A pattern day carries no zone**, deliberately (ADR 0044 §7) — the zone is
   resolved from the session itself. Extracting the split would mean reading the
   referenced `Workout`, i.e. dropping to the session layer, which ADR 0043 §3
   forbids for a guideline-level figure. A `share` day's `workoutId` is
   optional, so a pattern of pure shares carries no intensity information at
   all.
3. **It would change character mid-season.** Patterns exist for some plans and
   weeks and not others, so the same curve would be computed two ways — exactly
   the defect ADR 0042 §5 and ADR 0043 §3 reject.

### 12. What lands as code now, and what waits for the surface

Landing with this ADR: **`zone` on `ZoneBand`** declared across all recipes
(§3), and the **`olt-hr-5-run` / `olt-hr-5-bike`** recipes. Both are groundwork
the conversion requires, and both are independently live today — a recipe is
read by zone resolution, **Intensity Target** previews and the chip tint, with
no planning surface involved.

**`TSS_PER_PLANNED_HOUR = 60` stays, with the test pinning it, and
`plannedWeeklyTss` is unchanged.** The map holds implementation out of scope,
and #367's exception was argued from _destructiveness_ — "dropping the JSON
column and deleting generation are destructive without their replacement".
Replacing this conversion is not destructive; nothing is lost by 60 standing.
Against that, the conversion would ship a derivation no surface displays, and
untested honesty is worse than none. The trigger is explicit: **the code lands
with the manual planning surface, in the same release, and not before.**

_Trigger discharged by #411, in this release._ `TSS_PER_PLANNED_HOUR`,
`plannedWeeklyTss` and the test pinning the value are deleted, and
`plan-outline/planned-load.ts` reads a Plan Outline's weeks through this
decomposition — per week, with the mix of the phase that holds the week (§8's
1:1 in ADR 0042). Two findings worth recording, because neither was obvious from
here:

1. **Hours stopped being the currency that always projects.** Under the flat
   constant, `hours → TSS` needed nothing at all. Under §4 it needs an
   intensity, and an intensity needs the athlete's own recipe — so an athlete
   with no **Discipline Profile** for the track's Discipline now reads an
   Unavailable Metric where they used to read a number. That is the correct
   trade (a number nobody could check, for an honest gap), and it is the reason
   a demo seed or a fixture has to give the athlete thresholds before a curve
   appears.
2. **The curve's derivation is the union of its weeks', not the union of the
   chains.** A week's chain names the distance leg even when the reading was
   `hours → TSS`, which never touches a pace source, so the projection's basis
   walks back from the TSS step alone. Naming the easy-pace ratio under an
   hours-authored curve would overstate what the projection rests on — the
   opposite of what §10 asks for.

## Consequences

### What this sharpens and supersedes

- **ADR 0040 §9 gets its successor.** The retired constant is replaced by a
  function of volume _and_ the **Quality Session Mix**, satisfying ADR 0043 §8's
  hard requirement, so derived currency views may be offered.
- **ADR 0043 §10 is sharpened, not amended.** "No new Athlete Profile field"
  holds: the inputs are the existing per-discipline thresholds, the existing
  zone recipe, and the mix. The ADR's reason for `KM_PER_HOUR`'s death gains a
  general form — a constant is legitimate exactly where the ratio is stable
  between athletes, which running and swimming satisfy and cycling cannot.
- **ADR 0043 §9's calendar-cost consumer is only half-served**, and this is
  recorded rather than hidden: the hours figure exists, the fit check has no
  counterparty (§8).
- **ADR 0043 §6 has a hole this exposes.** Hours are said to accumulate "across
  **all** tracks, strength included" as calendar cost, but a strength track
  authors **sets**, and `sets → hours` is the conversion ADR 0041 forbids. A
  cross-track hours total is therefore unrealizable as soon as a plan has a
  strength track. Not filled here; raised as its own issue. _Filled by ADR 0046
  §3 (#391): ADR 0043 §6's **hours** row is corrected to the endurance tracks
  only, and a cross-track hours total is an **Unavailable Metric** once a plan
  has a strength track. Reversible for free if #384 lands a sessions-per-week
  axis. The capacity field §8 also needs is raised separately rather than
  settled there._
- **`zone-equivalent.ts`'s positional ladder is superseded for load** and
  retained for the chip tint and strip heights, which is what it was documented
  for.
- **ADR 0042 §7 gains a second application.** Dropping `speed` from the emphasis
  vocabulary now also means a neuromuscular band declares no zone.
- **ADR 0008's swim reasoning is honoured**: no HR recipe is offered for swim.

### Accepted costs

- **Two documented conventions replace one.** Minutes-in-zone per session and
  `r_easy` are both conventions, where `60` was one. Their combined worst-case
  error is ~10–15 %, against a constant that was ~38 % wrong in level and _zero
  per cent_ sensitive to the variable being controlled. Both new conventions
  also sit on axes the literature actually measures, where `60` had no primary
  source at all (ADR 0040 §9).
- **How much the curves diverge depends on the athlete's recipe.** Across the
  same three weeks at constant volume, `coggan-power-7` spreads TSS by **+21 %**
  while `olt-hr-5-run` spreads it by **+6 %** — because `hrTSS`'s `(hr/LTHR)²`
  prices easy aerobic work highly, so trading easy volume for quality moves
  less. The conversion is mix-aware in every case, but a power- or pace-anchored
  recipe yields a more _informative_ derived TSS view than an HR-anchored one.
  That is a property of the app's Load Formulae, not of this conversion.
- **`daniels-pace-5`'s ratios make this conversion inaccurate for a Daniels
  athlete.** Its bands look about one step slow against Daniels' published paces
  — his E, M and I land in the repo's M, T and R bands respectively — so the
  easy bucket is under-priced (E's midpoint 0.660 against a published 0.833).
  §3's declaration is semantically correct; the _ratios_ are the defect, raised
  as its own issue. `olt-hr-5-*`, `friel-hr-5-*` and `coggan-power-7` all have
  narrow aerobic bands and behave correctly.
- **`css-3` cannot express zones 3 or 5.** A swimmer's `{ z5: 1 }` is priced at
  the `CSS and faster` band with the substitution named. A five-zone swim recipe
  is well sourced and is raised separately.

  _Resolved by #392: `css-5` ships alongside `css-3`, five bands declaring all
  five zones, read off the 80/20 `Swim (%CV)` scale this repo already cites and
  inverted to pace ratios. `css-3` is unedited and stays the swim fallback per
  ADR 0006, so this consequence still holds for every swimmer who has not chosen
  `css-5` — but a swimmer who wants zones 3 and 5 priced apart rather than
  substituted now has a recipe that does it. `css-5` is also positionally
  aligned (band i declares zone i+1), making it the one swim recipe where §3's
  declaration and the chip tint's position agree._

- **A cyclist's derived distance depends on their history**, so two athletes
  with identical plans read different figures. Correct, but it makes such a plan
  less shareable — a note for **Plan Template** (#375).
- **ADR 0043 §2 proposes distance for a single-endurance-discipline athlete**,
  which for a cyclist points straight at a track whose distance leg needs
  history to be convertible at all. Worth revisiting when the authoring surface
  is built.
- **The retired constant will have outlived four ADRs.** 0040 retired it, 0043
  constrained its successor, 0044 recorded it as untouched, and this one
  succeeds it — and the code still says 60. That is a smell, mitigated only by
  the explicit trigger in §12.

### Downstream

- **The manual planning surface** replaces `plannedWeeklyTss` with this
  decomposition, in the same release, and drops `TSS_PER_PLANNED_HOUR` with its
  test (§12). _Done in #411; see the note under §12._
- **#383** (pace-duration curve) is neither absorbed nor a blocker, as ADR 0043
  §10 held. It would replace §5's single `r_easy` and §5's "quality volume at
  threshold pace" with a position on a curve, improving both without changing
  the shape of this decision.
- **#378** (a combined load number across tracks) is untouched. §6 here rules
  only on what a single endurance track can be read as. _Resolved by ADR 0046,
  which leans on §6/§7 here for the planned side and supersedes ADR 0008's
  strength-`sRPE` clause for the actual side._
- **#375** receives the shareability note above.
- **Fitness Projection**'s per-week `null` stays all-or-nothing: the
  accumulation returns `null` for a week as soon as any endurance track cannot
  express it, since a partial sum over some disciplines would read as the
  athlete's whole week. This ADR shrinks how often that fires; it does not
  change the rule. _#411 kept the rule and moved the code: `accumulateWeeklyTss`
  in `training.server.ts` became `plannedWeeklyLoad` in
  `plan-outline/planned-load.ts`, which also states **why** a track fed nothing
  instead of silently dropping it._
- Three issues are raised rather than folded in: `daniels-pace-5`'s ratios, the
  strength calendar-cost hole in ADR 0043 §6, and a five-zone swim recipe.

## Status

Accepted for the manual planning foundation (#385, parent map #362). Supplies
the successor ADR 0040 §9 left unnamed and satisfies ADR 0043 §8's hard
requirement; sharpens ADR 0043 §10 and records a gap in ADR 0043 §6; supersedes
`zone-equivalent.ts`'s positional band mapping for load only. Landed as an ADR
plus the zone-recipe groundwork it depends on; the conversion itself lands with
the authoring surface.
