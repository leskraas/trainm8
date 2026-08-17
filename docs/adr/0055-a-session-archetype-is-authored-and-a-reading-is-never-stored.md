# A session's Session Archetype is authored, and a reading of it is never stored

Status: Accepted

Stage 2 of
[`out-of-the-box/destination.md`](../wayfinder/out-of-the-box/destination.md).
Research: [`workout-taxonomy.md`](../research/workout-taxonomy.md) §1, §8, §9.

**Amends [ADR 0042](./0042-intensity-emphasis-is-scoped-by-track.md)** — its
derived-never-authored rule is narrowed to what it was actually written about,
and its own Revisit note asks for exactly this. **Amends
[ADR 0003](./0003-session-first-authoring.md)** — `Workout.intent` was the one
coarse label a session-first app needed, and it is now one axis short. **Extends
[ADR 0051](./0051-the-catalogue-has-four-axes.md) §3** — the authored archetype
it put on a **Catalogue Entry** moves to the parent `Workout`, and §3's
carve-out becomes the general rule rather than an exception. **Confirms
[ADR 0033](./0033-detection-confidence-honesty-bar.md)** and
[ADR 0035](./0035-detected-segment-zone-classification.md) — the reader reuses
the grade vocabulary, the min-of-grades composition and the refuse-rather-than-
guess bar verbatim.

## Context

`WORKOUT_INTENTS` (`app/utils/workout-schema.ts:37`) is **the intensity axis
wearing an archetype's name.** Six of its fifteen members — `recovery`,
`endurance`, `tempo`, `threshold`, `vo2max`, `anaerobic` — are verbatim the
strings `zoneLabelToZone()` (`app/utils/session-profile.ts:76`) maps onto
**Training Zone** 1–5. Four more are **Strength Goals** that ADR 0047 has since
rehoused. `mobility` and `technique` are modality words. By
`workout-taxonomy.md` §1.1's reading, **only `race` and `test` are genuine
archetypes.**

Three concrete consequences:

- a 30-minute recovery jog, a 70-minute easy run and a 3-hour long run are all
  `intent: 'endurance'`;
- there is no value at all for _long_, _fartlek_, _brick_, _steady_ or _race
  simulation_ — five of the sixteen sessions a plan is actually made of;
- `getLastSimilarSession` (`app/utils/training.server.ts`) defined "similar" as
  an exact match on `(discipline, intent)`, so **"vs last time" was comparing a
  three-hour long run against a shakeout** and reading the difference as a
  change in fitness.

ADR 0042 caught the identical conflation one level up, at phase scope, and its
Revisit note says the fix should extend down to the session. The vocabulary
already exists: `SESSION_ARCHETYPES` (`app/utils/catalogue.ts:38`), sixteen
values, shipped on `CatalogueEntry` by #448. **This is one axis arriving on
`Workout`, not a new vocabulary being invented.**

### The tension this ADR exists to resolve

ADR 0042 §5 says emphasis is **derived, never authored**. ADR 0051 §3 carved out
the corpus: a Catalogue Entry may carry an _authored_ archetype because "a
corpus row has no week. It is published _as_ a threshold session by its source."

An athlete's **Workout Session** does have a week, and `workout-taxonomy.md` §1
is explicit that a 100-minute easy run is `easy` in a 120 km week and `long` in
a 50 km one. Same telemetry, different archetype. So is a session's archetype
authored, derived, or both — and if both, which wins?

## Decision

**Both, and they never occupy the same slot, so there is no precedence fight.**
An `archetype` column on `Workout` is **authored**. A **reading** is derived at
read time and **has no column anywhere**. Where both exist, the authored one is
what the session _is_ and the reader is not consulted at all.

### 1. ADR 0042's rule is about a second source of truth, not about authoring

The rule reads as a prohibition on authoring, but §5 gives its actual reason:
"Nobody can label a segment 'VO2max block' that contains no VO2max sessions,
because the word _is_ the content rather than a claim about it." That is a
**no-second-source-of-truth** rule. It bites when the model already holds the
thing the label describes.

ADR 0042 **itself authors** where that does not hold. §9: "ADR 0039 materializes
only the near term, so for a segment months out the mix is the only statement
that exists — it must be authored, not derived." A planned session for next
Tuesday is precisely that case. There is no recording, no telemetry and no
structure adherence; there is nothing to derive _from_. Refusing to author would
leave every planned session unlabelled until it had been done, which makes the
**Quality Session Mix** uncheckable at plan time and the Catalogue's primary
retrieval facet unavailable to the surface that retrieves by it.

So the rule survives, narrowed to what it was written about, and ADR 0051 §3
stops being an exception.

### 2. What is context-dependent lives entirely on the derived side

The `easy`-versus-`long` argument is real, and it cuts against **storing a
reading** rather than against authoring. Role in the week is a function of a
28-day window that keeps moving: a reading frozen into a column would be a
classification of a window that has since changed, and every later recompute
would have to move it again — a **Load Recompute Notice** for a label.

ADR 0035 already settled this shape one level down: **store the measured value,
derive the label.** The archetype is the next layer up and follows it.

### 3. A reading is never stored — which is where this deviates from the research

`workout-taxonomy.md` §9.1 proposes the axis "on `Workout` (authored or
generated) and, derived, on a `WorkoutDetection`." **The second half is
declined.** A `WorkoutDetection` is computed from one activity and has no week,
so a column there would freeze the easy/long call at detection time and would
force the pure detection module to take a window it has no business reading.

The cost is that a reading cannot be queried or filtered. That is accepted,
because the queryable axis is the authored one and **adoption is the bridge**:
when an athlete adopts a detected session (ADR 0033, #460) is the honest moment
for a reading to become a statement. That is derived-then-authored, the rule ADR
0050 set for **Weekly Capacity** and stage 1 sets for a **Threshold Estimate**.
Writing it at adoption is **not built here** and is named as the next slice.

### 4. Inheritance is a copy at copy time, not a read through `copiedFrom`

Most sessions get their archetype without anyone classifying anything. A session
**placed from the Catalogue** and a session **adopted from a generated week**
both deep-copy a Stock Workout whose archetype its source published, so
`copyWorkout` carries the column across.

Copied rather than read through the back-pointer, and the **Citation is the
deliberate opposite** — read through `copiedFrom` precisely so it cannot drift.
Three reasons the archetype goes the other way:

- `copiedFromId` is `SetNull`, so a read-through would evaporate the moment the
  source row was deleted, while an athlete's own session must keep its answer;
- lineage is a chain, so a read-through is an unbounded walk on every read;
- an archetype **should** drift. A fork the athlete has rewritten into a
  different session is theirs, and it owes its own answer. A citation must never
  drift, because it names a person who wrote something.

### 5. One value in two places, made structural rather than documented

The axis now exists on `Workout.archetype` and on `CatalogueEntry.archetype`.
Left independent that is the second source of truth this ADR exists to remove,
so it is not left independent.

`CatalogueEntry` already carries its parent's `authorship` for the Citation
rule, pinned by a composite foreign key (ADR 0051 §4). **That key is extended to
a third column**: `(workoutId, workoutAuthorship, archetype)` references
`Workout (id, authorship, archetype)`, with `ON UPDATE CASCADE`. Three
properties follow, and all three are verified in the migration:

- an entry **cannot** disagree with its Workout — the foreign key rejects it;
- editing the Workout's archetype **cascades** into the entry;
- a Catalogue member's Workout **cannot** have a null archetype, because no null
  parent value satisfies a non-null child one. A corpus row is published _as_
  something, and now provably.

The entry keeps the column rather than folding into the parent because it is
what `listCatalogue`'s primary filter and `CatalogueEntry_archetype_idx` read.
Folding it away is a larger change across 45 files and is not needed to make the
model honest.

**Considered and rejected:** one writer per column by convention. It would have
been cheaper — there are only two writers, the seeder and the publish flow — but
ADR 0051 §4 is explicit that this repo makes such rules structural, and "nothing
enforces that these two columns agree" is a defect however few writers there
are.

### 6. `getLastSimilarSession` matches on the new axis, and a null finds nothing

"Similar" becomes `(discipline, archetype)`. A session with no archetype has
**no comparison key**, and the lookup returns null rather than falling back to
the broken axis.

The surface consequence is deliberate and is an honesty gain, not a regression:
"vs last time" now shows an Unavailable state for sessions it used to show a
delta for. It also **distinguishes two absences the old copy conflated** — "no
earlier session of this kind yet" claimed a lookup had happened, where a session
with no archetype never had a key to look up by.

This is **not** similarity matching. Two sessions sharing an archetype are
comparable in kind, not the same session; that needs a per-interval entity and
is out of scope (`session-similarity-and-comparison.md`).

### 7. The reader refuses two calls by design

`app/utils/archetype-classification/` implements §8.2 as a pure module. Two
places where it deliberately departs from the pseudocode, both to refuse rather
than guess:

**`easy` versus `long` without a window.** §8.2 orders `isLong` before `easy`
and `isLong` returns false when the median is unknown — which quietly answers
`easy` for a three-hour run. The refusal is made narrow by the absolute floor:
nothing under 90 minutes is long for anybody, so only a session **above** the
floor needs the window, and above it with no window the reader returns
`no-week-context`.

**`tempo` versus `steady`, always.** §8.3 returns a merged `TEMPO_STEADY` class
because the two are not separable from telemetry — the difference is the coach's
intent about where LT1 and LT2 sit. The shipped sixteen-value vocabulary has no
merged member, and adding one would be the same mistake §9.3 refused for
`sweet spot`. So the reader returns `tempo-or-steady` and names why. Picking one
would be "a coin flip wearing a label" in §8.3's own words.

### 8. Two branches are absent rather than present and unreachable

`race-simulation` needs the goal event's target pace and **no such field
exists** on `Event`; `technique` has no telemetric signature at all. Both are
omitted from the reader rather than written as branches nothing can satisfy — a
branch reading a field nothing writes is dead code wearing a capability. Both
arrive **authored** only, which is correct for a dress rehearsal and a drill
session.

`fartlek`'s structured branch **is** present and currently cannot fire, and that
distinction matters: it is correct and waiting on data, not speculative. A
persisted detection collapses its set to one averaged step with
`{ repeatCount: k }`, so the rep-length irregularity that _defines_ fartlek is
gone before anything can read it (`interval-detection-and-data-platform.md` Gap
1). The adapter therefore reports `durationCV: null` rather than `0`, so absence
never reads as regularity.

### 9. The reader reads the canonical zone scale, not the athlete's recipe

Rep intensity resolves through `pctToZone` — the app's own canonical
percent-of-threshold table, already what `intensityTargetToZone` uses for
`powerPct` and `hrPct` — rather than through the athlete's **Zone Recipe** band
index. §8.2's cut points are calibrated on a five-zone scale, and a recipe may
have three bands (`css-3`) or seven (`coggan-power-7`), so reading the band
index would make the same session classify differently for two athletes who
differ only in which display table they picked. **The recipe decides what the
athlete sees; the canonical scale decides what the reader compares.**

Where no threshold on the rep's channel is set, the zone is null and the reading
refuses — never a population default (ADR 0035).

### 10. `Workout.intent` stays authored, for now

`workout-taxonomy.md` §9.1 says one of the two fields must stop being authored,
and offers two routes. Neither is taken here: `intent` is authored on every
authoring surface in the app, and retiring or deriving it is its own slice. What
this ADR does is stop the _broken_ axis being used for the _archetype_ question
— `getLastSimilarSession` moves, and the session's metadata line shows the
archetype where there is one.

**Named as debt, not left unsaid:** two overlapping axes are live at once, and
`intent` is still the one authoring writes. The next slice retires it for
cardio.

## Consequences

### The surface

One word in the session detail metadata line, in the slot that held `intent` —
replaced rather than joined, because a fourth token overflows 390px and because
two words for one axis is the defect. Three states, following the copy rules the
#434 review set:

- **stated** — flat text, no badge, nothing to tap. The athlete said it, so
  there is no derivation to disclose.
- **read** — the word, plus a `read · <confidence>` badge in the same language
  the `detected · <confidence>` badge already speaks. The caveat sits on the
  word; the reasons wait behind a tap (#437's rule, generalized).
- **refused** — `No archetype`, **visible**, with the reason behind the tap. An
  absence is never deferred.

Inline in a text line, so it takes ADR 0028's `after:` hit-area extension to
reach 44px rather than making the line 44px tall — the exception the standard
names for inline links and glyph controls.

### The backfill, and what it refuses to invent

Nobody's numbers move: an archetype is a label, and no threshold, TSS, CTL, ATL
or TSB is read or written. No Load Recompute Notice is owed. 152 of 172 Workouts
were sourced truthfully and 20 stayed null:

- **151** Catalogue members, from their own entry's authored archetype;
- **1** through a `copiedFromId` walk to the nearest Catalogue ancestor, capped
  at `MAX_LINEAGE_HOPS`;
- **`intent = 'test'` → `test`**, the one honest identity map. §1.1's own
  sentence is the authority: of the fifteen intents, only `race` and `test` are
  genuine archetypes, and `race` has no counterpart because `race-simulation` is
  a _rehearsal_ of a race rather than a race.

Everything else stays null. `endurance` → `easy` would be exactly the
fabrication this ADR ends, because the athlete picked a zone word and it cannot
say whether they meant a recovery jog, an easy run or a three-hour long run.
`anaerobic` and `neuromuscular` are refused even though the strings match, both
being adaptation words on the intensity axis — `zoneLabelToZone()` maps
`anaerobic` straight to Zone 5.

### Accepted costs

- **No planned-versus-actual archetype disagreement.** An authored archetype
  short-circuits the reader, so the app never says "you planned a threshold
  session and did an easy one." Judging execution against prescription is
  **Structure Adherence**, which exists and is the right home.
- **A reading is recomputed on every read**, including one aggregate for the
  28-day median. Cheap, and the alternative is a stored lie.
- **Modifiers exist only in a reading.** The authored column is one value, so
  "long run with embedded marathon pace" is authored `long` and its modifier is
  currently only expressible where the reader produces it.
- **Two live archetype columns**, structurally consistent but not yet one.
- **Two overlapping axes** until `intent` is retired (§10).

### Downstream

- **The next slice** is `intent`'s retirement for cardio, and writing a reading
  as a statement at adoption (§3).
- **Archetype-keyed Quality Session Mix** (`workout-taxonomy.md` §7.3, ADR
  0042's Revisit note) is now expressible and is not done here.
- **The Catalogue picker** (stage 3) filters on an axis a session can now also
  carry, so "more sessions like this one" becomes a query rather than a feature.
- **`CatalogueEntry.archetype`** can be folded into the parent once
  `listCatalogue`'s filter moves (§5).
