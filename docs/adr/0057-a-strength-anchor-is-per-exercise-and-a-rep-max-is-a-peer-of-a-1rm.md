# A strength anchor is per-exercise, and a rep max is a peer of a 1RM

Status: Accepted

Slice 2 of [`strength-module.md`](../specs/strength-module.md), stage 2 of
[`out-of-the-box/strength-destination.md`](../wayfinder/out-of-the-box/strength-destination.md).
Research:
[`strength-anchors-and-progression.md`](../research/strength-anchors-and-progression.md)
§2, §3, §5, §9;
[`workouts-strength-and-other.md`](../research/workouts-strength-and-other.md)
§14.6.

**Closes
[ADR 0056](./0056-a-strength-actual-is-logged-in-app-and-a-kilo-is-not-a-kilo.md)'s
stated consequence** that _"`pct1RM` and `repMax` still resolve to nothing"_,
and closes [ADR 0047](./0047-strength-progresses-by-anchor-and-ramp.md)'s
Revisit note on the same defect. **Applies
[ADR 0054](./0054-a-threshold-may-be-proposed-from-the-athletes-own-history.md)
one level down** — its `construct` × `protocol` provenance, its null confidence
on a stated figure, its propose-never-assert rule and its refuse-rather-than-
grade bar are reused verbatim, on a new table rather than on `ThresholdEvent`.
**Answers ADR 0054's own Consequence** that an as-of-date resolver was on the
critical path: this table ships with one, before its first row exists.
**Confirms [ADR 0027](./0027-text-first-workout-authoring.md)** — resolution is
a pure function of structure plus the athlete's own stored numbers, and nothing
is parsed.

## Context

`LoadTarget` ships six members and `setLoadText` resolved **none** of them. A
Catalogue session prescribed `5 × 5 @ 85 % 1RM` reached the logging grid as the
literal string `85 % 1RM`, and the athlete did the arithmetic on their phone
between sets. `@ 8RM` — Rønnestad's protocol, the strength corpus's headline
acquisition — rendered as a bare `4 × 10`, because the module read only the two
legacy columns.

**This could not be fixed with a column.** `DisciplineProfile` is keyed
`@@unique([athleteProfileId, discipline])`, so there is exactly one strength row
per athlete: a squat 1RM and a deadlift 1RM would be **the same row**. Adding
`oneRmKg` there does not model one athlete having five anchors; it models an
athlete having one strength number, which is the claim user story 2 exists to
stop the app making. It is a **cardinality mismatch**, not a missing field, and
that is why the gap survived three ADRs that each noticed it.

The gap also inverts the usual build order. `@ 85 % 1RM` needs a 1RM a novice
does not have; `@ 8RM` is a **complete instruction today**, needs no stored
anchor, and is self-calibrating by definition. So `repMax` is the out-of-the-box
path, and it is the one a cardio-shaped instinct builds last.

## Decision

### 1. `ExerciseThreshold` is a new table, mirroring `ThresholdEvent` and not reusing it

Per athlete, per exercise, per construct, per rep count, effective-dated:

```
construct       oneRm | estimatedOneRm | repMax
valueKg         Float
reps            Int?      -- required on repMax and estimatedOneRm
protocol        tested | epley | brzycki | mayhew | wathen | lombardi
                | lander | adams | rep-max-observed | athlete-stated | provider
confidence      high | medium | low | NULL
effectiveAt     DateTime
sourceSetLogId  String?   -- SET NULL
@@unique([athleteProfileId, exerciseId, construct, reps, effectiveAt])
```

Four CHECKs pin it in the migration, and two of them are the decision:

```sql
CHECK ("construct" NOT IN ('repMax','estimatedOneRm') OR "reps" IS NOT NULL)
CHECK ("protocol" <> 'athlete-stated' OR "confidence" IS NULL)
```

**`reps` is required on an estimate.** Without it a number in the history means
two different things — "70 kg is my 8RM" and "70 kg is my estimated 1RM, read
from 8 reps" are the same three fields otherwise. The rep count is not metadata
here; it is half the referent.

**A figure the athlete stated about themselves is not graded.** ADR 0054's rule,
enforced three times over: by the CHECK, by the write path hard-coding
`confidence: null`, and by the read path nulling it even if a caller hands one
in.

### 2. `repMax` is a peer of `oneRm`, never a derivative

`@ 8RM` could be resolved by converting a stored 1RM down. It is not, and this
is the load-bearing call of the slice.

The conversion is a **round trip through a ±10 % transform, twice** — the same
population equations §2.3 reports at ±9–11 % SD, applied once to get from an
observed 8RM to a 1RM and once to come back. Two applications of a lossy
transform to reproduce a number the athlete **already measured directly** is a
fabrication with a measurement's face on it.

So `resolveAnchor` matches the rep count **exactly**, with no nearest-rep
fallback and no `pct1RM` fallback:

> `@ 8RM` with only a 5RM on file is `no-anchor`, and that is the correct
> answer.

The refusal carries what would fix it — _"Record the heaviest load you can lift
for exactly 8 reps. It is not converted from another rep count."_ — because a
refusal that does not say what would fix it is a shrug.

### 3. The as-of-date resolver ships before the first row does

Anchors are **append-only**: an edit writes a new row with a later
`effectiveAt`, nothing is updated in place, nothing is deleted. There are
exactly two Prisma calls against the table in the whole repo — a `findMany` and
a `create` — and a unique violation surfaces as
`{ ok: false, reason: 'duplicate' }` rather than overwriting.

That is only worth anything if reads are dated, and ADR 0054 logged
`ThresholdEvent.effectiveAt` as **written and never read** precisely because
they were not. So `resolveAnchor(anchors, construct, reps, asOfISO)` returns the
latest anchor effective **on or before** the date, and the callers pass a real
date: the log grid resolves each prescription as of `session.scheduledAt`, not
as of today. A session logged in March reads against March's anchor even after
an April re-test — which is the entire reason for append-only, and the thing
that makes the strength history the interesting object rather than a single
mutable number.

### 4. `resolveLoadTarget` is one choke point that is allowed to refuse

One pure function, six branches, and a stated refusal is a first-class return:

| Member                 | Resolution                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| `absolute`             | passthrough, and it appends nothing — `100 kg · 100 kg` is noise   |
| `pct1RM`               | needs `oneRm` **or** `estimatedOneRm`; bands resolve to `kg–kg`    |
| `repMax`               | needs a `repMax` at exactly those reps — §2                        |
| `bodyweight ± addedKg` | needs `AthleteProfile.weightKg`, else `no-bodyweight` with the fix |
| `pctBodyweight`        | same                                                               |
| `velocity`             | `not-resolvable`, **permanently** — authorable, never app-computed |

The basis phrase is the ADR 0054 shape: one phrase, in place — _"119 kg · 85 %
of your 140 kg tested squat"_ — with the argument behind a tap.

`setLoadText` stays the single choke point for prescription load text and gains
an **optional** context. With no context it renders the authored form and the
Catalogue's portable row is untouched (ADR 0053 §6: a Catalogue Intensity Target
is never resolved at write time). With context it appends the resolution. An
unavailable resolution renders the authored form plus the stated absence, and
**never a fabricated kilo**.

### 5. Estimation is proposed, graded on two terms, and gated by a refusal

ADR 0054's shape, unchanged: the loader has **no transaction and no create**,
one POST per accepted reading writes anything at all, and **acceptance re-runs
the estimation server-side**. The comparison against the posted value is an
equality and not a tolerance, because _"a tolerance here would be a window in
which a posted number the engine never produced is stored"_, and what is written
is the **re-derived** value. An athlete cannot accept a number the app never
produced.

- **Epley is the default** (`RepWt × (1 + reps/30)`): near-unbiased at ≤ 10 reps
  (+0.5 ± 10.2 %) and what every other app uses, which matters to an athlete
  comparing figures. Brzycki, Lander, Adams, Mayhew, Wathen and Lombardi are
  implemented beside it. **Berger, Reynolds and O'Conner are omitted by name** —
  Berger is systematically −17 % and precise enough to look stable.
- **A hard gate at reps ≤ 10**, quoted from Mayhew 2008: over 2–30 reps
  Brzycki's mean error is **+26.7 ± 101.7 %**; restricted to ≤ 10 reps it is
  **−2.0 ± 10.5 %**. Above the gate the answer is `reps-out-of-range` — a
  **refusal, not a `low` grade**, on ADR 0054's stated rule that a grade
  communicates uncertainty _within_ a valid fit.
- **Four refusals, closed and ordered** so a later gate never masks an earlier
  one: `no-sets-logged`, `reps-out-of-range`, `effort-unknown`,
  `exercise-unmapped`. Four different sentences, because _"we did not look"_ and
  _"we looked and there is nothing"_ are different statements.
- **The band is the equation's own population SD**, quoted per estimator (Epley
  10.2 %, Adams 9.1 %, Wathen 10.6 %, …) and floored at the 1RM test's own
  retest CV of **4.2 %** (Grgic 2020, 32 studies, n = 1595). Never the point
  estimate alone, and never a decorative ±2 %. The mean bias per equation is
  recorded beside it and **never corrected for**.
- **Confidence grades on recency and reps only.** ADR 0054 grades on four terms;
  two of them do not exist here. **Maximality in strength is not a weak signal,
  it is an absent one** — a set of 8 at RIR 4 and a set of 8 at RIR 0 are
  byte-identical in anything an app can collect. Effort is therefore a **gate**
  (`NEAR_FAILURE_MAX_RIR = 2` or `toFailure`, else `effort-unknown`) rather than
  a term.
- **A stale anchor freezes and is flagged, never decayed.** Bosquet's decay
  curve is real and measures **cessation**; a stale anchor belongs to an athlete
  who is **training and untested**, where the sign of the error is ambiguous — a
  novice adding load weekly is stale _low_ — and 1×/week maintains strength, so
  a decay function would penalise exactly the behaviour that preserves the
  quantity. Past 56 days the grade drops to `low` and `valueKg` is never
  touched.

### 6. The training max is not a construct here

`trainingMaxKg` and `workingFraction` live on `ProgramLiftState` (ADR 0059), not
on this table, and that separation is deliberate.

A 1RM computed for a chart is a **display artefact** and may be recomputed
freely. A training max is **authored state whose whole cycle is wrong if it is
wrong**. Sharing a field would let a chart's recompute move a program's loads,
and would put the training max into the record machinery ADR 0021 carves out.
The fraction is stored separately and visibly for the reason
`strength-anchors-and-progression.md` §5 states plainly: **the training max has
no evidence base**, a silent multiplier makes every displayed `%1RM` a lie about
what is on the bar, and folding the fraction into the anchor destroys the
anchor.

### 7. No stored number moves

`ExerciseThreshold` ships **empty**. There is no backfill, no `UPDATE` and no
`DELETE` in the migration; the only inserts are SQLite table-rebuild copies that
select their columns verbatim, plus the new `ExerciseVariant` rows of ADR 0061.
No threshold, TSS, CTL, ATL, TSB, `effectiveKg` or `bodyweightKg` is touched.
**No Load Recompute Notice is owed.**

## Considered options

- **A column on `DisciplineProfile`.** Rejected — Context. Its
  `@@unique([athleteProfileId, discipline])` makes a squat 1RM and a deadlift
  1RM the same row. It is not a missing field; it is the wrong cardinality.
- **Reusing `ThresholdEvent` with a nullable `exerciseId`.** Rejected. It is
  keyed and read as a per-discipline object, its `construct` vocabulary is
  endurance, and a nullable discriminator on the hottest provenance table in the
  app would make every existing read ask a question it does not currently have
  to.
- **Deriving `repMax` from a stored 1RM.** Rejected — §2. Two applications of a
  ±10 % transform to reproduce a number the athlete measured directly.
- **Converting an observed 8RM up to a 1RM so `pct1RM` resolves for everyone.**
  Rejected, same reason, in the other direction. `estimatedOneRm` exists for
  athletes who **accepted** that conversion knowingly, with its formula and its
  band on screen.
- **Grading an out-of-range estimate `low` rather than refusing.** Rejected —
  ADR 0054's rule. ±100 % wearing a confidence badge.
- **Berger's equation.** Rejected by name. Systematically −17 % and precise
  enough to look stable.
- **A decay function on a stale anchor.** Rejected — §5. The one published curve
  measures cessation, and the sign of the error for a training-but-untested
  athlete is unknown.
- **A `1RM` field serving both the chart and the training max.** Rejected — §6.
- **Routing the write through the Conform-backed authoring schema.** Rejected on
  ADR 0056's precedent: its round trip silently drops `load`, which is the field
  these features exist to resolve. The anchors surfaces use the set log's idiom
  — `intent`-dispatched, local zod over `Object.fromEntries`.

## Consequences

- **The Token Sentence still does not resolve on the session screen.**
  `deriveWorkoutNotation` calls `formatSetsSummary` with **no context**, so the
  resolution reaches the per-lift settings page and the log grid and **not** the
  session detail sentence. The slice's own demo — _"a Catalogue session
  prescribed `5 × 5 @ 85 % 1RM` renders resolved kilos"_ — is met on two
  surfaces out of three, and this is the largest remaining gap in the slice. The
  choke point already takes the context; the caller does not pass it.
- **The no-context render is not byte-identical to before**, in two places, both
  more truthful. A banded `pct1RM` now renders `70–80 % 1RM` where the legacy
  projection kept only `minPct` and rendered `70 % 1RM`; and where `load` and
  the legacy `weightKg`/`pct1RM` pair disagree, **`load` now wins**. Both are
  asserted by test. No kilo is fabricated in either.
- **Estimator selection is not built.** Six alternatives to Epley are
  implemented, schema-accepted and server-supported, and the propose loader
  never passes one, so the picker is never rendered. The spec's _"Mayhew,
  Wathen, Lombardi are selectable"_ is true of the code and false of the screen.
- **`rep-max-observed` and `provider` are dead vocabulary.** Nothing writes
  either. A hand-entered rep max stores as `athlete-stated`, which means the
  `high` confidence grade the design reserved for _"an observed `repMax` ≤ 5
  reps within ~8 weeks"_ is **unreachable in the shipped build**, and `high` for
  a formula output was already structurally impossible by design. In practice
  every graded anchor today is `medium` or `low`.
- **`exercise-unmapped` is narrower than the design implies.** Estimation is
  gated to the `squat` and `horizontal-push` movement patterns, on LeSuer 1997
  and Nuzzo 2024 — so a deadlift, a press, a row and every isolation lift refuse
  outright. That is a defensible refusal and a product-visible narrowing, and it
  compounds with ADR 0061's finding that 701 of 745 corpus rows carry **no**
  movement pattern at all.
- **There is no entry point from settings.** The per-lift anchors surface is
  reachable only from the exercise history page; `/settings/training` links to
  analyze, history and gym and not to lifts, and there is no lifts index. User
  story 1's path exists and is half-hidden.
- **`estimatedOneRm` cannot be hand-entered**, deliberately: an athlete may type
  a `oneRm` or a `repMax`, and an estimate only ever arrives by accepting one
  the app produced. This is stricter than the spec and is the right way round.
- **The protocol vocabulary is a superset of the spec's schema block** —
  `lombardi`, `lander` and `adams` were authorised by the spec's prose and
  missing from its Prisma snippet. The shipped CHECK is the reconciliation.
- **A tested single is written with `reps: 1` on an `oneRm` row**, against this
  ADR's own schema block, which says `reps` is null on a tested 1RM. It is
  harmless for resolution — `resolveAnchor` ignores `reps` when asked with
  `null` — but it makes the unique key behave differently for that one row, and
  it is a documented invariant the code contradicts.
- **The estimation surface shipped as its own route**
  (`lifts.$exerciseId_.propose`) rather than as a second noun on the shipped
  `/settings/training/analyze` screen, which is what the spec described. Analyze
  is untouched, so two propose surfaces now exist with the same shape and no
  shared component.
- **The two slices disagree about when a set happened.** The estimator reads
  `ExerciseSetLog.completedAt`; ADR 0058's history path reads
  `WorkoutSession.scheduledAt`. For a back-filled session those are different
  days — which is precisely the case an as-of resolver exists to get right.
- **A bodyweight prescription whose assistance meets or exceeds bodyweight
  returns `not-resolvable`**, a fifth outcome the spec's signature did not have.
  It renders as _"not a load"_, which is the honest reading of a movement that
  is fully unweighted.
