# Zone system recipes live in code, not the database

> **Revisit — Amend.** Recipes-as-immutable-constants is confirmed, but
> `coggan-power-7` has `maxRatio: 0.55` then `minRatio: 0.56` — a 1 %-wide hole
> between every band pair, repeated in `friel-hr-5-*`, `daniels-pace-5` and
> `stryd-run-power-5`, harmless for authoring targets and a bug the moment
> measured samples are bucketed into time-in-zone (`css-5` already enforces
> contiguity). "Existing athletes stay on the old recipe" also cannot be
> honoured: `DisciplineProfile.zoneSystem` carries no effective-dated history,
> so historical zones cannot be reconstructed either way. See
> [`docs/research/zones-and-thresholds.md`](../research/zones-and-thresholds.md).

Built-in zone recipes (`coggan-power-7`, `friel-hr-5-bike`, `friel-hr-5-run`,
`daniels-pace-5`, `css-3`) are typed constants in `app/utils/zones/`, not rows
in the database. The athlete's choice is stored as a recipe id string on
`DisciplineProfile`, with optional per-zone boundary overrides also on
`DisciplineProfile`. Zone resolution is a pure function of recipe id + athlete's
anchor threshold + overrides.

## Considered options

- **Recipes as DB rows**: Rejected — recipes are stable, versioned reference
  data, not athlete-owned. Storing them in code makes them reviewable in PRs,
  type-safe at compile time, and instantly available to the AI prompt builder
  without a DB roundtrip.
- **Recipe ratios per athlete**: Rejected — recipes encode named physiological
  models (Coggan, Friel, Daniels) that should not be silently mutable. Athletes
  who need different boundaries use per-zone overrides on top of a recipe.
- **One global zone system per athlete**: Rejected — Coggan/Friel/Daniels/CSS
  are discipline-specific. A rider may want Coggan power on bike and Friel HR on
  run; a swimmer wants CSS only.

## Consequences

- Recipe versioning is explicit: a changed recipe gets a new id
  (`coggan-power-7-v2`). Existing athletes stay on the old recipe until they opt
  to switch — no silent re-resolution of authored history. **Amended below
  (#444, #447): this covers a recipe that is widened or re-scoped. A recipe that
  never matched its named source is a defect and is corrected in place.**
- Custom recipes are not supported in v1; overrides only.
- AI prompts include the athlete's recipe id and zone count so resolution
  failures (Z6 on a 5-zone system) cannot happen.
- When a new threshold appears (FTP added later), the system prompts the athlete
  to switch recipes rather than auto-switching, matching the no-silent-mutation
  principle.
- Anchor metric missing (e.g. `powerPct` with no FTP) resolves to Unavailable
  Metric per glossary.

## Amendment (#444, #447) — a defect is not a preference change

The new-id rule above was written as one rule for every edit to a recipe. It is
two, and they pull opposite ways:

> A recipe that is **widened or re-scoped** takes a new id. A recipe that
> **never matched its named source** is a defect and is corrected in place, with
> a **Load Recompute Notice** where the correction moves a number the athlete
> has already read.

**The precedent for each half is already in the file.** `css-5` ships beside an
unedited `css-3` (`app/utils/zones/recipes.ts`) — a widening, because `css-3` is
too coarse to price zones 3 and 5 apart, and the swimmers on it opted into
something real that still says what it always said. `daniels-pace-5` is the
first case of the other half: its bands were the reciprocals of Daniels'
`%VO₂max` fractions, and pace does not scale as `1/(%VO₂max)`, so the recipe
never encoded the model on its label. There is no model anyone opted into, and
nothing to stay on. That is the whole of the distinction — not the size of the
change, and not whether numbers move.

**Why the original rule could not decide this case.** It promises that "existing
athletes stay on the old recipe until they opt to switch", and there is no way
to switch and no way to have chosen: `DisciplineProfile.zoneSystem` is assigned
nowhere in app code — only in `prisma/seed.ts` — `DisciplineThresholdSchema`
carries no `zoneSystem` field, and `/settings/training` renders no recipe
picker. Shipping `daniels-pace-5-v2` would have fixed the bug for nobody. Worse,
the defect does not reach athletes through their choice at all:
`app/utils/structure-detection/classify.ts` hardcodes `DANIELS_PACE_5` as the
default pace recipe for **every** runner whose own recipe is not
`thresholdPace`-anchored, so repointing that constant at a `-v2` would itself be
a silent in-place behaviour change for every runner — the exact harm the new-id
rule exists to prevent, arriving through the back door. Effective-dating
`zoneSystem` first was considered and rejected: there is one live row per
(athlete, discipline), overwritten in place, so there is no historical row to
date. The full argument is on #444.

### What the correction owes the athlete

A defect corrected in place is **explained, never offered**. Where the athlete's
own data has not changed there is nothing to opt into — the old figure was
simply wrong — so the correction applies itself and says so. That is the **Load
Recompute Notice** (`CONTEXT.md`, ADR 0046 §2), and it is the obligation the
new-id rule was a clumsy proxy for. Two properties carry over unchanged: the
notice is written per correction in real words, never generated from a template,
because a correction the app has no written words for shows nothing at all
rather than a vague "some numbers changed"; and it names the movement in the
same units the surface it explains is showing.

Correcting a recipe's ratios moves stored history, because **an authored zone
label is not resolved at write time** — it is stored verbatim and re-resolved
against the athlete's _current_ Discipline Profile every time it is read. Four
paths carry that movement and **none of them is date-aware**:

1. **Display-time resolution.** `formatIntensityTarget` and `describeStepTarget`
   (`app/utils/intensity-target.ts`) resolve a `zoneLabel` against the current
   profile with no notion of when the session was; the Workout Detail View for a
   completed session goes through both.
2. **The cached `intensity*` columns** on `WorkoutStep`, refilled wholesale by
   `recomputeIntensityRanges` (`app/utils/workout.server.ts`) — its query has no
   date filter and no status filter. These feed the Telemetry Overlay's planned
   bands on completed sessions.
3. **Planned TSS, and therefore past Adherence Bands.**
   `recomputePlannedTssForUser` (`app/utils/load/planned-tss.server.ts`) queries
   every session the athlete owns with no date filter, and resolves fresh rather
   than reading the cache. It is fired on every threshold edit.
4. **Chip tint**, which re-buckets stored concrete values against the current
   recipe (`app/utils/zone-equivalent.ts`).

Not affected: structure-detection output, persisted at detection time (ADR 0035
§6 stores the measured value, not the label), and Volume Conversion, which is
never stored (ADR 0045 §9).

### The notice #447 itself owes, and does not write

**No `LoadRecomputeNotice` row is written for the `daniels-pace-5` correction,
and that is a finding rather than an omission.** Two things have to be true
before one is owed, and neither is:

- **Nobody has read a moved number.** All four paths above enter the recipe only
  through `DisciplineProfile.zoneSystem`, and a null `zoneSystem` short-circuits
  resolution to Unavailable before any band is consulted
  (`app/utils/zones/resolve.ts`). Since nothing but the seed ever writes that
  column, no profile the app has created resolves through `daniels-pace-5` at
  all. The route by which the defect binds every runner — `classify.ts`'s
  detection default — writes its result at detection time and does not
  re-resolve, so past detections are untouched and future ones simply become
  correct.
- **The record cannot describe this movement honestly.** `LoadRecomputeNotice`
  requires a `ctlBefore`/`ctlAfter` pair, because every correction it has
  carried so far moved a **Load Snapshot**. This one does not: Load Snapshots
  are built from actual TSS, which is computed against thresholds and never
  against recipe bands. What moves is prescription — displayed bands, Planned
  TSS, Adherence Bands, chip tint. Writing a row would mean inventing a CTL
  delta, which is a fabricated number and forbidden for the same reason an
  unresolvable target is an Unavailable Metric rather than an estimate.

So the rule stated above is the durable part, and the record has to grow before
it can serve the general case: **a Load Recompute Notice whose movement is a
prescription rather than a Load Snapshot needs the record widened** — its own
movement copy, and a movement pair that is not required to be CTL. That is a
schema change and belongs to the first correction that actually owes one. Naming
it here is the point; the next recipe defect will not have the luxury of an
empty population, and ADR 0006's own Revisit note already names the 1 %-wide
band holes in `coggan-power-7`, `friel-hr-5-*`, `daniels-pace-5` and
`stryd-run-power-5` as the same shape of problem.
