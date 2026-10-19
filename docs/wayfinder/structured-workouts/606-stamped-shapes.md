# Stamped quality days get a real shape

The analysis asset for *Give the autopilot's quality days a real shape* (#606)
on the map *structured workouts everywhere* (#600). Written 2026-10-19 from the
repo at `4760b8d` (branch `wayfinder/605-detection-scoreboard`). Code
references are to that commit. The numbers come from a throwaway script that
imports the real pure modules (`planned-tss.ts`, `zones/`, `volume-conversion.ts`)
with the seed athletes' Discipline Profiles from `prisma/seed-athlete-levels.ts`.
The seed athletes have no Plan Outline, so the stamp itself could not be run
end to end; the script runs the shape builder and the pricing on the shares a
first-run plan would give them.

Already settled, and not reopened here: map decision 2 (stamped share days store
warm-up + work in the recipe band + cool-down, sized by
`MINUTES_IN_ZONE_PER_SESSION`), and #602's rollout (non-past, unedited generated
days are re-stamped in the reader's release; past days stay as they are).

## 1. What the code fixes before we choose anything

| Fact | Where | What it forces |
|---|---|---|
| A hard day keeps the share it had, so the week sums to its target | `stamp.ts:620-622`, ADR 0091 §1 | The shape fills the share exactly; it never moves volume |
| The Volume Conversion prices the week as `MINUTES_IN_ZONE` per quality session at the band, and every other minute at zone 2 | `volume-conversion.ts:82`, `:144` (`EASY_BUCKET_ZONE = 2`), `:664` | Warm-up, cool-down and run/bike recoveries go in the **zone-2 band**, so the stamped Planned TSS equals the conversion's TSS |
| The minutes convention excludes recoveries | `MINUTES_IN_ZONE_CITATION`, `volume-conversion.ts:94` | Work minutes = reps × rep length; recoveries are extra |
| `bandForZone` returns the first band that declares the zone, else the nearest with `substituted: true` | `volume-conversion.ts:482-504` | One label rule for every recipe |
| Canonical labels collide with recipe labels: Stryd's `Z1` declares zone 2, its `Z2` declares zone 3 | `zones/recipes.ts:319-339` | We store the **recipe's own label**, never a canonical `Z4` |
| The week ledger prices a session only when every step carries the track's unit; a timed rest is skipped in km | `week-pattern.ts:429-460`, `week-volumes.ts:283` | Every step is quantified in the **track's currency** |
| A rest step cannot carry an intensity | `workout-schema.ts:500-515` | Run/bike recoveries are cardio steps at the easy band; swim rests are rest steps |
| `Workout.archetype` is FK-pinned to `CatalogueEntry`, and the endurance catalogue ships in no migration | `schema.prisma:202`, findings §5.7, #618 | The stamp writes no archetype and copies no catalogue row |
| Planned TSS uses power only with `preferCogganTss`, pace only with `preferRTSS`, and both default to `false` | `planned-tss.ts:146-161`, `schema.prisma:1243-1244` | A default bike or pace-recipe runner still gets `null` (see owner choice 1) |
| The Load Recompute Notice records CTL before and after; Planned TSS never enters CTL | `recompute-notice.server.ts:19-28`, ADR 0019 | Filling Planned TSS owes **no notice of its own** |

## 2. Decisions

### 2.1 Where the shapes live: convention code

A pure module, `app/utils/plan-outline/stamped-shape.ts`, holds the rep table
beside `MINUTES_IN_ZONE_PER_SESSION` and cites it the same way. It does not use
catalogue rows, for four reasons:

1. The endurance catalogue does not ship to production (findings §5.7, #618).
2. The corpus rows use mixed anchors: `run-D1` is `hrPct max 90–95`, `run-D2` is
   `rpe 8`, and the frame is `zone('easy')` (`catalogue-corpus.run.ts:500-546`).
   That is not "the athlete's own recipe band" (map decision 2), and `easy`
   resolves in no recipe.
3. Sizing to a share needs parametric reps. `scaleBlocks` (`stamp.server.ts:718`)
   would scale warm-up and reps alike, which is #620's problem, not a fix.
4. The corpus is still the source of the numbers: `run-C2` (5 × 6′ / 60″, 2 km
   frame) and `run-D1` (4 × 4′ / 3′, 10′ frame) are the shapes the table rounds
   to the minutes convention.

The stamp sets no `archetype`. It keeps `intent` (`tempo` / `threshold` /
`vo2max` / `endurance`) and `stampedSessionTitle`, as ADR 0091 §2 has it.

### 2.2 The shape table

Labels are read with `bandForZone(recipe, z)` at stamp time. `E` = the zone-2
label, `W` = the work label.

| Discipline | Zone | Minutes | Work | Recovery | Min reps | Rep floor |
|---|---|---|---|---|---|---|
| run | 3 tempo | 45 | 3 × 15′ W | 3′ E (cardio) | 2 | 10′ |
| run | 4 threshold | 35 | 5 × 7′ W | 90″ E (cardio) | 3 | 5′ |
| run | 5 VO₂ max | 20 | 5 × 4′ W | 3′ E (cardio) | 3 | 3′ |
| bike | 3 | 45 | 3 × 15′ W | 5′ E (cardio) | 2 | 10′ |
| bike | 4 | 35 | 5 × 7′ W | 3′ E (cardio) | 3 | 5′ |
| bike | 5 | 20 | 5 × 4′ W | 4′ E (cardio) | 3 | 3′ |
| swim, CSS set | 3 | 45 | N × 400 m W | 20″ rest | 2 | — |
| swim, CSS set | 4 | 35 | N × 200 m W | 15″ rest | 3 | — |
| swim, CSS set | 5 | 20 | N × 100 m W | 20″ rest | 6 | — |
| swim, no CSS | 3 / 4 / 5 | 45 / 35 / 20 | 3 × 15′ / 5 × 7′ / 10 × 2′ W | 30″ rest | 2 / 3 / 6 | 10′ / 5′ / — |

Flanks, both blocks in E: warm-up 15′ (floor 10′), cool-down 10′ (floor 5′).
Swim with CSS: warm-up 300 m (floor 200 m), cool-down 200 m (floor 100 m).
Blocks are named `warm-up` and `cool-down`, as the corpus names them, so the
reader gives those roles `authored` (602 invariant 10). The main block has no
name.

Swim N is `round(minutes × 60 / (rep m / 100 × band pace))`. At CSS 1:45 that is
6 × 400 m Z3, 10 × 200 m Z4 and 12 × 100 m Z5; at CSS 2:00 it is 5 / 9 / 10.

What a run athlete's work label becomes, per recipe:

| Recipe | Z2 | Z3 | Z4 | Z5 |
|---|---|---|---|---|
| `daniels-pace-5` (default) | E | M | T | I |
| `norwegian-threshold-run` | E | M | sub-T | I |
| `olt-hr-5-run` / `-bike` | I-2 | I-3 | I-4 | I-5 |
| `friel-hr-5-*`, `coggan-power-7`, `css-5` | Z2 | Z3 | Z4 | Z5 |
| `stryd-run-power-5` | Z1 | Z2 | Z3 | Z4 |
| `css-3` | Z2 | Z3 (declares 4, substituted) | Z3 | Z3 (declares 4, substituted) |

### 2.3 The algorithm

`stampedShape({ discipline, currency, zone, share, recipe, paceSource })`, pure:

1. **Easy and long days** (`zone == null`): one step of the share in the
   zone-2 label, as `eased-prescription` does. That is the whole change for
   them.
2. **Quality days, hours track.** Everything is in time.
   - Try the full rep count, then one rep fewer, down to *min reps*. The first
     count whose `reps × rep + (reps − 1) × recovery + 15′` fits the share wins.
   - If none fits, keep *min reps* and shorten the rep a minute at a time down to
     the floor.
   - Then lay the flanks. If they are ≥ 25′, the extra over 15′ + 10′ is split
     evenly, with the odd minute going to the warm-up. Below that, the warm-up
     grows from its 10′ floor first. The cool-down takes the remainder to the
     second, so the session totals the share exactly, as `scaleBlocks` does.
   - If even the floor does not fit, the day is **laid easy**. `layMix` keeps
     the zone off it, so `mixDisagreements` says so softly, as ADR 0091 §1
     already does for a week with too few days.
3. **Quality days, km track.** Every cardio step carries distance, so the week
   ledger still sums. Distances are sized from the Volume Conversion's own pace
   source, `resolvePaceSource` (`volume-conversion.ts:1099`): work at
   `qualitySpeedKmH`, and easy and recovery at `easySpeedKmH`. Run and bike round
   to 100 m, swim to 50 m. Recovery is a cardio jog by distance (run, bike) or a
   timed rest (swim, skipped in km). Fitting works as in step 2, in km. With
   **no pace source**, see owner choice 3.
4. **Swim on an hours track.** Use the CSS distance set when CSS is set, since
   the reader prices it `paced`. Use the time set when it is not.
5. **Where it runs.** Fitting is pure and runs inside `planStamp`, so the preview,
   the first-run step 5 and the write cannot disagree (`stamp.ts` header).
   `planStamp` gains a per-track `{ recipe, paceSource }`. `stampWeekPattern`
   reads the Discipline Profiles once. `bareStructure` (`stamp.server.ts:690`)
   becomes a call to `stampedShape`.
6. **No recipe.** Use `profile.zoneSystem ?? DEFAULT_ZONE_RECIPES[discipline]`
   (`zones/defaults.ts:45`). Every cardio discipline has a default, so this only
   covers a missing profile row. A label stays a label: nothing invents a range.

### 2.4 How targets degrade with missing thresholds

The stamp always stores a `zoneLabel`, never a resolved number (#434: thresholds
are never invented; degrade to zone labels). The reader does the degrading:

| Athlete has | Reader shows | Planned TSS |
|---|---|---|
| Recipe + anchor (e.g. daniels + T-pace) | Band range | Priced, but only where the preferred formula has a channel (owner choice 1) |
| Recipe, no anchor | Label, hatched, `no-threshold`, `fix: training-settings` | `null` |
| HR recipe with only maxHr (Bea) | HR range | Priced via `hrTSS` |

### 2.5 Adoption

The stamp and the migration write a fresh Workout and set `source: generated`.
They never call the editing save path (`workout.server.ts:951`), so `adoptedAt`
stays null and the day stays the machine's to re-lay (ADR 0080, #460).

## 3. TSS impact, measured

Planned TSS of one stamped day. *Today* is `null` for every row (one bare step,
no intensity). *Default prefs* is the stored default
(`preferCogganTss = preferRTSS = false`). *Conversion* is the Volume
Conversion's price for the same minutes (band IF², the rest at zone-2 IF²).

| Athlete (seed) | Share | Zone | Shape laid | Default prefs | Prefer power/pace | Conversion, as laid | Conversion, full minutes |
|---|---|---|---|---|---|---|---|
| Bea run (olt, maxHr only) | 45′ | Z3 | 11′ I-2 + 2×13′ I-3 / 3′ + 5′ | 69 | 69 | n/a | n/a |
| Bea run | 45′ | Z4 | 15′ + 3×7′ I-4 / 90″ + 6′ | 72 | 72 | n/a | n/a |
| Bea run | 45′ | Z5 | 15′ + 4×4′ I-5 / 3′ + 5′ | 71 | 71 | n/a | n/a |
| real run (olt, maxHr+LTHR) | 34′ | Z3 | does not fit, laid easy | — | — | — | 52 |
| real run | 34′ | Z4 | 11′ + 3×5′ I-4 / 90″ + 5′ | 47 | 47 | 47 | 55 |
| real run | 34′ | Z5 | 11′ + 3×4′ I-5 / 3′ + 5′ | 47 | 47 | 47 | 51 |
| real bike (coggan, FTP 250) | 60′ | Z3 | 15′ + 2×15′ Z3 / 5′ + 10′ | **null** | 56 | 56 | 62 |
| real bike | 60′ | Z4 | 15′ + 4×7′ Z4 / 3′ + 8′ | **null** | 68 | 68 | 74 |
| real bike | 60′ | Z5 | 15′ + 5×4′ Z5 / 4′ + 9′ | **null** | 71 | 71 | 71 |
| intermediate run (daniels, T 4:05) | 51′ | Z4 | 13.5′ E + 4×7′ T / 90″ + 5′ | **null** | 71 | 72 | 75 |
| intermediate run | 51′ | Z5 | 14′ E + 5×4′ I / 3′ + 5′ | **null** | 73 | 73 | 73 |
| advanced run (daniels, T 3:16) | 77′ | Z3 | 16′ E + 3×15′ M / 3′ + 10′ | **null** | 98 | 98 | 98 |
| advanced run | 77′ | Z4 | 21′ E + 5×7′ T / 90″ + 15′ | **null** | 104 | 104 | 104 |
| advanced run | 77′ | Z5 | 25′ E + 5×4′ I / 3′ + 20′ | **null** | 101 | 101 | 101 |
| triathlete bike (coggan, FTP 235) | 75′ | Z4 | 17′ + 5×7′ Z4 / 3′ + 11′ | **null** | 85 | 85 | 85 |
| triathlete run (olt) | 75′ | Z4 | 20′ + 5×7′ I-4 / 90″ + 14′ | 105 | 105 | 105 | 105 |
| triathlete swim (css-5, 1:45) | 40′ | Z4 | 13′ + 3×7′ Z4 / 30″ rest + 5′ | 57 | 57 | 58 | 64 |
| real swim (css-5, 2:00) | 45′ | Z5 | 15′ + 10×2′ Z5 / 30″ rest + 5.5′ | 60 | 60 | 66 | 66 |

Swim rows were measured on the time set. The CSS distance set prices the same
minutes, `paced`.

A whole stamped week, easy and long days included (long = 2 × ordinary):

| Week | Ordinary share | Today | Default prefs | Prefer power/pace | Conversion |
|---|---|---|---|---|---|
| Bea, 3 h / 3 days, Klassisk base (Z3) | 45′ | null | 254 | 254 | n/a |
| real run, 4 h / 6 days, Z4 + Z5 | 34′ | null | 299 | 299 | 311 |
| intermediate, 6 h / 6 days, Z4 + Z5 | 51′ | null | **null** | 429 | 432 |
| advanced, 9 h / 6 days, Z4 + Z5 | 77′ | null | **null** | 631 | 631 |
| triathlete bike, 5 h / 3 days, Z4 | 75′ | null | **null** | 246 | 246 |

What the numbers say:

- **Where the share fits the full shape, stamped Planned TSS equals the
  conversion to the TSS point.** Warm-up, cool-down and recoveries in the zone-2
  band are what make that true.
- **Short shares lose convention minutes.** At 34′ the real runner gets 15 of 35
  Z4 minutes and no Z3 at all; the week is −4 % against the conversion. At 51′
  it is −0.7 %. That is the cost of "moves no volume" (owner choice 2).
- **Swim rests are rest**, so Planned TSS runs 1–6 under the conversion. That
  is accepted, since swimmers stand at the wall.
- **5 of the 9 seed track profiles stay `null` under the default preferences**:
  every bike and both daniels runners. Map decision 2's "Planned TSS then prices
  them" holds only for HR recipes and swim (owner choice 1).

## 4. What switches on when Planned TSS appears

These are behaviour changes for the release notes, and none of them is a CTL
change:

- The week's TSS line counts stamped days (`week-volumes.ts:280-290`).
- Week Replan's planned-vs-actual ratio measures those weeks
  (`week-replan.server.ts:212-216`, `:322-332`).
- The open-ended round verdict grades weeks it used to call `unmeasured`
  (`propose-next-round.ts:91-106`). Only newly lived weeks are affected, because
  past days stay `null`.
- `isKeySession` / `keyMissed` see stamped quality days
  (`session-nudge.ts:115`, `propose-week-change.ts:215`).

## 5. Migration: the re-stamp of existing days

It is **a one-shot Job Queue job, not SQL**. It needs recipe resolution in TS.
It follows the `strength-tss-backfill` pattern (`strength-tss-backfill.server.ts:33`):
boot enqueues it once, and the job row is the marker. It ships in the reader's
release (#602).

**Which sessions it re-shapes.** A session must meet all of these:
- `source = 'generated'`, `adoptedAt IS NULL`, `planOutlineId IS NOT NULL`;
- `status = 'scheduled'`, with `scheduledAt` at or after the start of the
  athlete's local today;
- no Recording, no Session Log, no set logs;
- a Workout that is exactly one block, one cardio step, no intensity, with
  `durationSec` xor `distanceM`. That is `bareStructure`'s output, so a shaped
  or fixed day copied from the pattern is never touched.

**What it writes.** It reads the share from the step, the currency from which
field is set, and the zone from `intentToZone(intent)`. It builds the shape with
the athlete's current profile. It writes a new Workout and repoints the session,
keeping its id, date, source and status. It deletes the orphaned bare Workout,
then calls `recomputePlannedTssForSession`. A day that no longer fits is laid
easy, and its intent and title follow (`Rolig økt`).

It is the same function the stamp runs, so a later re-lay (`relayPlanFrom`) gives
the same result.

**Load Recompute Notice.** None is owed by #606. A `null` becoming a value
corrects nothing the athlete read, and Planned TSS never enters CTL. The notice
table is CTL-shaped (§1), so its kind list stays as it is.

## 6. Juster and replan (input to #620, not decided here)

- Today `scaleStepQuantities` (`week-replan.ts:171`) would scale a stamped day's
  warm-up, reps and recoveries alike.
- For a **generated, unadopted** day, the natural transform is to **re-run
  `stampedShape` at the new share**. It drops whole reps first, then reaches the
  flank floors, then the rep floor, then easy. That is the rule #620's question
  proposes, and it already exists for the stamp.
- Zones never move (ADR 0025 §2). Juster's eased prescription stays one zone-2
  step.
- The stamp's flank blocks carry `authored`-provenance roles through their block
  names. #620 should decide whether machine-written names count as `authored`.

## 7. ADR text

**ADR 0091 §1, amended.** Replace "The structure is still one bare step of
duration or distance; no intensity target is invented, so **Planned TSS** for
these sessions stays unavailable, as before" with:

> A bare share day is written as a real session in the athlete's own **Zone
> Recipe**. An easy or long day is one step in the zone-2 band. A quality day is
> a `warm-up` block, the work, and a `cool-down` block, all in zone 2 except the
> work. The work is sized by `MINUTES_IN_ZONE_PER_SESSION` and split by the rep
> table in `stamped-shape.ts`. Every step is quantified in the track's currency,
> so the day still totals its share. The target is the recipe's own label
> (`bandForZone`), never a number, so a missing threshold leaves an honest label
> and never an invented range. A day too short for the zone's minimum is laid
> easy, and the mix check says so. Planned TSS prices the session wherever its
> labels resolve.

**Consequences, added.** Non-past, unadopted generated days are re-shaped once,
in the reader's release (§5). Past days keep their bare step. There is no Load
Recompute Notice, because no CTL moves. Planned TSS now feeds Week Replan, the
round verdict and the key-session nudge for stamped weeks (§4).

**ADR 0065, unchanged in substance.** "A real prescription from the first tap"
now also holds for the autopilot's days. The day stamp's literal `Z2`
(`day-stamp.ts:45`) is #614's to fix.

**ADR 0045, cited.** The shape is the stored form of §2's minutes and §1's
zone-2 easy bucket. No text changes.

## 8. Owner choices

1. **Planned TSS for athletes on the default preferences.** Power and pace bands
   price only with `preferCogganTss` / `preferRTSS`, and both default to off.
   - (a) Keep this posture (ADR 0008): bike and pace-recipe days stay `null`.
   - (b) When the preferred formula has no channel, price a zone-label step by
     its band's IF through the anchor's formula, which is the Volume
     Conversion's own §4 arithmetic, with provenance `convention`.
   - (c) Flip both defaults on.
   - **Recommend (b).** The measured values equal the conversion, and it touches
     no actual TSS. It reaches beyond stamped days, so it belongs in the Planned
     TSS fold of #602.
2. **Shares too short for the zone's minutes.**
   - (a) Cut reps, then the rep length, then lay easy. The week is unchanged.
   - (b) Take minutes from the week's other ordinary share days, never below
     30′ (ADR 0091 §4).
   - **Recommend (a).** It keeps ADR 0091 §1 and the preview simple, and costs
     −0.7 % to −4 % of week TSS on the seed shares.
3. **A km track with no pace source** (an HR-recipe runner with no threshold
   pace, or a bike with no ride history). The Volume Conversion is itself
   unavailable there.
   - (a) Measure a recent-runs speed window, as bikes already do (ADR 0045 §5).
   - (b) Write the work in time and fixed 2 km flanks, as `run-C1` does, and let
     the day read `uten km`.
   - (c) Lay it easy and name the cause.
   - **Recommend (a).** It is measured, not invented, and it gives these athletes
     a distance leg everywhere.

## 9. Fog and new tickets

- **Bug (do now):** `eased-prescription.ts:95` picks the literal `Z2`. On
  `stryd-run-power-5` that label declares zone 3, so Juster "eases" a Stryd
  runner into tempo. Fix: `bandForZone(recipe, 2)`.
- **Reader rule (#602 build):** an easier cardio step inside the main-set block
  should read `recovery` (`convention`). Invariant 10 covers only rest steps.
- **Reader rule (#602 build):** in km totals, a timed rest must not make
  `distance` incomplete (mirror `restsMayOmit`, `week-pattern.ts:445`). The
  `estimated` duration of a distance step must use `resolvePaceSource`, or km
  stamped days won't price.
- **Ordering:** #606 must not ship before the reader. Today's
  `zoneLabelToZone` (`session-profile.ts:77`) reads a Stryd `Z3` as 3 and Daniels'
  `T` as nothing, so the mix check would miscount.
- **Recipe change:** future unadopted stamped days keep the old recipe's labels.
  `T` after a switch to `olt-hr-5-run` reads `label-not-in-recipe`. This needs a
  re-shape on a `zoneSystem` change (new ticket).
- **`css-3` swimmers:** Z3 and Z5 mix entries substitute to a zone-4 band. Once
  the reader zones by recipe, the mix warning fires every week for them. That is
  honest; mention it in the PR.
- **#602's "one Load Recompute Notice":** every change in that release is to a
  planned figure, and the notice records CTL. It may have nothing to report.
  Decide it in the release spec.

## 10. Tests that move

- `stamp.server.test.ts:1046-1094` keeps titles and intents, and adds the shape
  and Planned TSS.
- `stamp.test.ts` covers mix laying, plus the "does not fit → easy" case.
- New `stamped-shape.test.ts` takes the shape table rows, the recipes table and
  the TSS = conversion property on a fitting share.
- The migration job gets its own test, covering the selection rules in §5.
