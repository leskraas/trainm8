# Destination: the app knows you before you ask it for anything

The route out of
[`434-implementation-review.md`](../plan-builder-mobile-ux/434-implementation-review.md),
which found that [#434](https://github.com/leskraas/trainm8/issues/434) built a
correct engine behind a surface that reads like an ADR, and that the app holds
152 cited sessions it can only place as a whole season, for an athlete it knows
nothing about.

Owner's steer, verbatim:

> _"I want the user to make a profile. link it to like intervals, we run an
> analyze on the user and makes a profle out of it, calculate threshold, zones
> and stuff like that. after that, the user can go though past workouts and we
> run anlayzes on the workouts and finds the structure, what kind of workout it
> is and find simular workouts so the user can compare the performance. the user
> should also be able to esaly plan indvidueal workouts from a lib, and the
> workout should fit the user and adapt besed on the metrics/proifle we have
> created. the user should also be able to make lang/big season plan in a easy
> way. like the use can pick form templates/pre build stuff. the user should be
> able to make a full season plan outline, on how the load and suff like that
> should evowlv. the user should later be able to add blocks that fits this
> plan."_

**Vocabulary note.** The owner says _lib_. In this repo that noun is banned in
this neighbourhood (ADR 0051) — the corpus of sessions is **the Catalogue**. The
owner's _"week lib"_ and _"block lib"_ are asking for two things the Catalogue
does not yet contain, and this document names them **Week Pattern** (exists,
plan-scoped, must become corpus-scoped) and **Block Template** (does not exist).

---

## The destination in one sentence

An athlete connects an account, and before they answer a single question the app
can state their thresholds, their zones, what kind of session each of their last
200 workouts was, and how the last four repeats of any of them went — and from
there a season, a block, a week or one session is something they **pick**, not
something they **fill in**.

## The five stages, and where each one actually stands

The owner's flow is five stages. Three of them are mostly built and blocked on
one missing piece each; two are genuinely unbuilt.

### Stage 1 — Connect, analyse, and get a profile

**What exists.** `app/integrations/intervalsicu/` is complete: API-key connect,
backfill, ongoing sync, reconcile sweep, telemetry backfill, laps backfill, a
courtesy pacer. Strava (OAuth + webhook) and FIT/TCX/GPX upload are equally
complete. `ActivityStream` stores an even time grid with `null` marking pauses.
`ActivityImport` carries per-activity power, HR, pace, cadence, elevation and
the provider's raw JSON.

**What is missing.** Everything between the data and the athlete.
`ThresholdEvent.source` reserves `'inferred'` and `'auto'` and **nothing writes
either**. There is no FTP estimator, no LTHR estimator, no threshold-pace
estimator, and no max-HR estimate — ADR 0005 promised Tanaka and
`classify.ts:227` defers to it as _"computed upstream"_, where nothing upstream
computes it. `PerformanceResult` has read code and no writer (#464).

**The decision this stage turns on.** `app/utils/zones/defaults.ts:10` states
the current position: defaulting a **Zone Recipe** fabricates nothing, but
defaulting a **Threshold** _"would be a number about this athlete that nobody
measured, and which stays manual-only for exactly that reason."_

That reasoning is sound and **does not cover this case**. An estimate fitted to
the athlete's own 90 days of maximal efforts is not a number nobody measured; it
is a number **derived from measurements they produced**, which is the same class
as `weeklyCapacityHours` (ADR 0050, derived-then-authored) and the same class as
Normalized Power. The honest requirement is not "refuse", it is:

- the estimate carries its **protocol** and its **construct** — `cp-fit`,
  `ftp20`, `ramp`, `tt60`, `race-equivalence`, `tanaka`; and FTP ≠ CP, which
  `docs/research/zones-and-thresholds.md` measures at 256 ± 50 W vs 249 ± 44 W
  with limits of agreement −19 to +33 W;
- it carries a **confidence grade** from the existing `high | medium | low`
  vocabulary (ADR 0033), scored on coverage, recency, maximality and residual;
- it is **derived once, then authored** — nothing silently re-reads history and
  moves an athlete's zones under them, and a stale estimate is **frozen and
  flagged, never decayed** (the research explicitly declines a decay function);
- a movement in a stored number that changes history gets a **Load Recompute
  Notice**, the mechanism that already exists.

This is `ADR 0005` amended, not defended: the research already rules its
`manual | inferred | auto` axis **the wrong axis** and asks for protocol +
construct instead. Recorded in
[`athlete-profile-from-history.md`](../../research/athlete-profile-from-history.md).

**Why this stage is first.** It is not first because it is the owner's first
sentence. It is first because **every other stage resolves through it.** A
Catalogue row's **Intensity Target** is portable by design and deliberately
unresolved at write time (ADR 0053 §6); it resolves per athlete at read time. No
threshold means every session in a generated season renders as an Unavailable
Metric. Stage 1 is what turns the 152 rows from a list into training.

### Stage 2 — Read the past: structure, archetype, and the same session over time

**What exists.** `app/utils/structure-detection/` (3 869 lines) already does the
hard half: PELT change-point detection on the best available channel, pause
splitting, two hypothesis families, an honesty gate that returns `null` rather
than guess, HR-classified results capped at `medium`, and a re-detection
lifecycle that refuses to overwrite an adopted session. It emits the exact
`WorkoutStructure` shape, so a detection materializes as a real Workout with no
translation.

**What is missing, in order.**

1. **An archetype axis.** Detection says `4 × 8 min at 280 W` and never says
   _threshold session_. `docs/research/workout-taxonomy.md` §8 already carries
   the classifier pseudocode and §9.1 the model change: add `archetype` and stop
   using `intent` for it. `WORKOUT_INTENTS` today is _"the intensity axis
   mislabelled as archetype"_ — six of its fifteen members are verbatim zone
   labels, so a recovery jog, an easy run and a 3 h long run are all
   `intent: 'endurance'`. The Catalogue **already has** the right vocabulary:
   `SESSION_ARCHETYPES`, 16 values, on `CatalogueEntry`. This is one axis
   arriving on `Workout`, not a new one being invented.
2. **A per-interval entity — and the engine already computes it and throws it
   away.** `mine.ts` builds a private `Rep[]` carrying every individual rep's
   start, end, duration and value, plus the stitched pauses, the per-pair
   recoveries and the within-cluster CV. Then `analyze.ts`'s `toStructure` emits
   **one averaged step with `{ repeatCount: k }`** and the reps are gone. So
   `docs/research/interval-detection-and-data-platform.md` Gap 1 ("no
   per-interval entity") is not merely relevant here — it is the reason this
   feature cannot exist. The persisted fingerprint collapses to
   `(k, meanDuration, value)`, which means **a ladder, a pyramid and a flat set
   are indistinguishable after detection**, and there is no mean ± SD and no
   fade slope to compare across occurrences. This is also why `lapsJson` is
   stored and never read.
3. **Similarity.** Today `getLastSimilarSession` matches on exact
   `(discipline, intent)` and compares two numbers. What the owner asked for —
   _"find similar workouts so the user can compare the performance"_ — is a
   different feature. Researched separately in
   [`session-similarity-and-comparison.md`](../../research/session-similarity-and-comparison.md).

**The honesty constraint that shapes it.** Two repeats of "the same session" are
not a controlled experiment: terrain, weather, fatigue and a rep that was 30 s
shorter all move the number. The comparison surface must show **what actually
differed** alongside what improved, or it is a fabrication wearing a chart.

### Stage 3 — Plan one session from the Catalogue, fitted to you

**What exists.** 152 Stock Workouts with four retrieval facets
(`archetype × phase × goalEvent × level`), a `listCatalogue` that accepts all
four as filters, a fork-on-write rule, an immutable Citation, and a
`CatalogueSave` collection axis.

**What is missing.** The surface. `catalogue.tsx` calls `listCatalogue` with
**no filters**, renders 152 cards flat, has no search, no sort, no pagination,
no "add this to my week", and is linked from nowhere but the admin moderation
page (#471). The Week Pattern's picker is a `<select>` over the athlete's own
sessions and cannot see the corpus (#442).

**The three things this stage is.**

1. **A picker, faceted on the axes that already exist.** Discipline, archetype,
   phase, goal event, level, plus "in my list" (`CatalogueSave`, #470). Nothing
   new in the model.
2. **A place action.** Pick a row, pick a day → a `WorkoutSession` on a deep
   copy with `copiedFromId` back at the Stock Workout. That is `copyWorkout`,
   shipped, and the exact path generation already takes (ADR 0053 §7) — never
   through the Conform draft editor, which drops the facets #450 added.
3. **"Fits the user."** The owner's word is _adapt_, and the ADRs say two
   different things about it that must not be confused:
   - **Resolution** — the row's portable anchor (`pacePct`, `%LTHR`, race pace,
     RIR) resolving against _this_ athlete's profile. This is the whole point of
     stage 1 and is unambiguously in scope.
   - **Rescaling** — stretching Daniels' `5 × 1000 m` to `7 × 1000 m` because
     the week wanted more kilometres. ADR 0053 §6 **refuses this**, and is
     right: it edits a cited protocol and keeps the citation. The resolution is
     where "fits you" lives. Where a row genuinely needs a dose ladder, the
     corpus already models it — `progressesTo` / `regressesTo` edges on
     `CatalogueEntry`, and `level` as a floor. **Walking the progression edge is
     the honest form of adaptation; rewriting the reps is not.**

### Stage 4 — A season you pick, not one you author

**What exists.** Nine **Periodization Presets** and a deterministic generator
that turns one into a whole season of retrieved, cited sessions with honest
`unavailable` and `unfilled` slots.

**What is missing.**

1. **Shapes that know what you are training for.** The nine presets are three
   families × three lengths, all four phases, Peak and Taper fixed at two weeks
   in every one. The Catalogue's rows carry eight `goalEvent` values; **no
   preset is scoped to any of them.** A 5 k build and a 100 k ultra build get
   the same shape. Adding event-scoped families is the single highest-yield
   "more out of the box" change on this list, and it is data, not architecture.
2. **The load evolution as the thing you read and edit.** The owner asks for _"a
   full season plan outline, on how the load and stuff like that should
   evolve."_ `__season-chart.tsx` (1 382 lines) already draws it. What it is not
   is **editable at the arc** — the ramp, the boundary step and the mix are six
   independent forms inside a phase card, four levels of containment deep.
   #457's tap-a-value vocabulary is the shipped answer and `plan.tsx` imports
   none of it.
3. **The entrance.** #439 decided the authoring ladder _"stays whole and stops
   being the way in."_ Only the first half shipped. Generation is still reached
   _through_ authoring.

### Stage 5 — Blocks you drop into a season

**Genuinely unbuilt, and the only stage that needs a new entity.**

Today there is nothing reusable between a session and a season:

- a `PlanOutlinePhase` is a name, a week count, a rhythm and a taper flag — it
  carries no volume, no discipline and no emphasis by deliberate decision (ADR
  0041, 0042); those live on the **Training Track segment** measured over it;
- a `WeekPattern` is scoped to one `PlanOutline`, unshareable, uncitable, and
  authored by hand;
- `Plan Template` (#375) was closed `not_planned`, and #434 put it out of scope.

**A Block Template is the missing unit**, and it is _not_ `Plan Template`. It is
season-fragment scale, not season scale: a length in weeks, a rhythm, a
progression rule, a **Quality Session Mix**, and a set of Catalogue archetype
slots — i.e. exactly the tuple `presetSegmentSpecs` already emits per phase,
lifted out of the preset and made a first-class, citable, retrievable row.

Two consequences follow immediately and both are good:

- **A Periodization Preset becomes a sequence of Block Templates.** The nine
  presets stop being nine hand-written literals and become compositions, which
  is what makes event-scoped families (stage 4) cheap instead of nine more
  hand-written literals.
- **A Week Pattern becomes corpus-scoped.** The owner's "week lib" is a
  `WeekPattern` that is a Catalogue member rather than a child of one
  `PlanOutline` — the same four-axis treatment `Workout` got in ADR 0051, which
  means authorship, membership, collection and visibility come for free.

This is where the map should revisit #375's `not_planned`. Not to build season
templates, but because the reason it was closed no longer holds: there is a
corpus now, and a four-axis membership model to hang a second entity type on.

---

## What has to be true about the surface, whatever gets built

The review found the copy problem is not verbosity for its own sake — it is the
honesty discipline discharged as prose at the point of use. Four rules that
separate the two:

1. **The caveat sits on the number; the reasoning waits behind a tap.** This is
   #437's rule (_"provenance is available, not asserted"_), decided for a
   session's citation and never generalized. It generalizes: to a ramp guard, a
   week override, a volume conversion, a threshold estimate.
2. **An absence is never deferred.** Also #437, and it survives untouched. An
   **Unavailable Metric** stays visible. A source can wait behind a tap; an
   absence cannot.
3. **A default states that it is a default, in a phrase and not a paragraph.**
   ADR 0053 §9's `+5 %` ramp is the register: a stated convention, said once.
4. **One entrance.** Not two flows that reach the same plan by different roads.

## Sequencing

The dependency order is not the owner's narration order — stage 1 gates
everything, and two stages are ready now.

**Ready immediately, no dependencies:**

- The Catalogue picker + facets + a nav entry (#471, #470) — the model already
  supports every filter, and this is where "more out of the box" is cheapest.
- Event-scoped preset families — data, not architecture.
- Retire the provenance prototype route (941 dead lines).
- **The exact-repeat case of stage 2**, which needs no similarity model at all:
  `Workout.copiedFrom` (`schema.prisma:227`) already records that two sessions
  came from the same Catalogue row or the same fork, and nothing reads it as an
  identity key. "The last four times you did this session" is a walk of a
  back-pointer that already exists. The fuzzy case needs the per-interval
  entity; the exact case does not.

**One correctness fix that must land before any comparison ships:**

- **An as-of-date threshold resolver.** `ThresholdEvent.effectiveAt` is written
  and never read; every resolution path uses the current `DisciplineProfile`. So
  raising a threshold silently rewrites every past comparison — and stage 1 is
  the feature that starts moving thresholds automatically. Comparing "the same
  session" across a threshold change is wrong by construction until this exists.

**Gated on stage 1 (the profile):**

- Every intensity an athlete reads anywhere.
- The comparison surface in stage 2, which needs a portable intensity axis to
  compare _across_ sessions at all.
- "The workout fits the user" in stage 3.

**Gated on a per-interval entity:**

- Similarity and comparison (stage 2).

**Gated on a Block Template:**

- Stage 5, and the cheap version of stage 4's event-scoped families.

## Decisions that must be recorded before building

Named here so they are not discovered mid-build. None of them is settled by this
document.

- **Does a derived threshold write `DisciplineProfile`, or sit beside it?** ADR
  0005's amend, and the derive-vs-store principle #377 asks to be named.
- **What is the identity of "the same session"?** The Catalogue entry it was
  copied from, the detected structure, or a similarity score. Research first.
- **Does a Block Template supersede or extend `Periodization Preset`?** And does
  #375's `not_planned` get reopened at block scope.
- **Where does the corpus-scoped Week Pattern's four-axis membership live** —
  reuse `CatalogueEntry` polymorphically, or a second entry table.
- **What replaces the manual authoring entrance**, given #439 said the ladder
  survives and nothing may be deleted.

## Research this destination stands on

Already in `docs/research/` and not to be re-derived:

- `zones-and-thresholds.md` §4 — the threshold-estimation recipe, and gap 6
  naming its absence.
- `portable-intensity-anchors.md` — why comparison and prescription both need a
  portable axis; the two-stamp resolution rule.
- `workout-taxonomy.md` §8 — the archetype classifier; §9.1 the `intent`
  conflation.
- `interval-detection-and-data-platform.md` Gap 1 — no per-interval entity.
- `platform-capability-inventory.md` §2 — the activity-list capabilities, of
  which 8 of 11 are Missing.

Written for this destination:

- [`athlete-profile-from-history.md`](../../research/athlete-profile-from-history.md)
  — stage 1.
- [`session-similarity-and-comparison.md`](../../research/session-similarity-and-comparison.md)
  — stage 2.
