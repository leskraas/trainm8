# Review of what #434 actually shipped, against what the owner asked for

Supporting document for [#434](https://github.com/leskraas/trainm8/issues/434),
written **after** the map closed (`f95e04e`, 24 of 25 sub-issues done). The map
document [`434-map.md`](./434-map.md) holds the route that was charted; this
holds the audit of what came out the other end, and the owner's verdict on it.

Owner's report, verbatim:

> _"I dont like end result. its to much text and the flow and design is to hard
> to follow. I want a lot more stuff out of the box."_

That report is about the **surface**, and this document's central finding is
that the surface is the only thing the map did not build. Everything underneath
it landed, and landed well.

---

## 1. What shipped, and it is more than the complaint suggests

| Thing                                        | Where                                                                        | State                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A cited corpus of **152 Stock Workouts**     | `app/utils/catalogue-corpus.{run,bike,swim,strength}.ts` (49 / 41 / 36 / 25) | Seeded, deterministic ids `stock_<key>`                              |
| Four retrieval facets on every row           | `CatalogueEntry` + `CatalogueEntryPhase` + `CatalogueEntryGoalEvent`         | 16 archetypes × 5 phases × 8 goal events × 3 levels                  |
| **Deterministic season generation**          | `app/utils/plan-generation/` (6 files, ~1 700 lines)                         | Pure: no clock, no random, no query. Approval re-runs it server-side |
| Provenance with four honest readings         | `plan-generation/provenance.ts`                                              | 101 `corpus` · 47 `convention` · 4 `hand-written`                    |
| The community tier, whole                    | ADR 0052 — publish, Attribution, non-vouch, report-and-takedown              | Shipped with its moderation gate, not ahead of it                    |
| Per-discipline **Zone Recipe** defaults      | `app/utils/zones/defaults.ts`                                                | run → `daniels-pace-5`, bike → `coggan-power-7`, swim → `css-5`      |
| Adoption split from origin                   | `WorkoutSession.adoptedAt` (#460)                                            | Fixed a live bug that destroyed re-detection                         |
| Nine **Periodization Presets**               | `app/utils/plan-outline/presets.ts`                                          | 3 families × 3 lengths                                               |
| A 15 500-line primary-source research corpus | `docs/research/` (13 documents)                                              | The thing every one of the above is cited from                       |

**This is a good engine.** ADR 0053's determinism argument is right, the
provenance asymmetry is right, the refusal to rescale a cited protocol is right,
and the `unavailable` / `unfilled` honesty is right. None of the analysis below
argues for undoing any of it.

## 2. The complaint, made concrete

### 2.1 "Too much text" — it is measurable, and it is the ADRs rendered as body copy

`plan.tsx` is **4 283 lines** with **24** `text-muted-foreground` prose spans, a
`detail` sentence on every one of its **eight** `Disclosure`s, and a full
explanatory paragraph inside each of four warning notices. Representative, all
verbatim from the shipped screen:

> `plan.tsx:4083` — _"Open a week to hand-set it. What you type is that week's
> final target — no recovery or taper cut on top — and it changes that week
> only: the rest of your season still follows your anchor and your ramps. Leave
> the box **blank** to hand the week back to the rule. **0** is a week without
> training, which is a plan and not a gap."_

> `plan.tsx:2679` — _"The convention is ±X % — per loading week for a ramp, and
> in one go for a step at an opening. Bigger than that is unusual rather than
> unsafe: no volume rule has been shown to prevent injury, so this is a note and
> not a limit. Your numbers are saved exactly as you authored them."_

> `plan.generate.$eventId.tsx:246` — _"The one thing your training history
> cannot tell us. It sets how far up the Catalogue's dose ladder we retrieve — a
> stated convention, not a judgement about you."_

Each sentence is **true**, **earned**, and traceable to a decision. That is
exactly the problem. The house rule that every derived figure keeps its
`authored | derived` marker and that a guard is never behind progressive
disclosure has been discharged by **printing the reasoning next to the
control**. The result reads like an ADR with form fields in it.

`plan.generate.$eventId.tsx` — the newest surface, 560 lines — asks **three**
questions and spends roughly ten paragraphs justifying them. Its "What this
season does not include" block opens with a 60-word paragraph explaining why
there is no strength track, above the season the athlete came to read.

The strongest single piece of evidence that the copy has outgrown its
maintenance: `plan.tsx:3111` says _"Three built-in periodization shapes"_ while
`presets.ts` ships **nine**. The prose has drifted from the code it describes.

### 2.2 "The flow is hard to follow" — there are two entrances and they do not know about each other

```
/training/plan/new            → pick or create the Event
/training/plan/new/:eventId   → 993 lines: shape + tracks + currencies + anchors + start week
/training/plan                → 4 283 lines: the plan, two tabs, eight disclosures, 31 action intents
/training/plan/generate/:eventId → 560 lines: the season that builds itself
```

The generation route — the entire thesis of the map, _"the plan builds itself,
you edit by exception"_ — is **reached from the shape step of the manual
authoring flow**. To get to the thing that replaces authoring, you walk into
authoring first. ADR 0053's own Consequences section concedes this: the surface
is _"the first fragment of the review surface"_ and _"is **not** the review
surface #437 and #439 describe."_

#439 decided the authoring ladder _"stays whole and stops being the way in."_
The first half shipped. The second half did not: nothing demoted it, so the app
still has two ways in and the manual one is the default.

### 2.3 Nesting

On the Blocks tab: **tab → `<ol>` phase → PhaseCard → Disclosure → form →
fieldset → field.** Four levels of containment before an input. `plan.tsx`'s
action is a single `switch` over **31 intents**. `__week-pattern-editor.tsx`
renders **48** input elements; `__phase-editor.tsx` renders **29**.

## 3. "I want a lot more stuff out of the box" — the four places it is stuck

This is the load-bearing part of the review. In every case the _substance_
exists and only the _reach_ is missing.

### 3.1 The Catalogue has 152 rows, four facets, and no way to use any of it

`listCatalogue` (`app/utils/catalogue.server.ts:68`) **accepts** `discipline`,
`archetype`, `phase` and `goalEvent`. `catalogue.tsx:69` calls it as
`listCatalogue({ viewerId: userId })` — no filters — and renders a flat,
unpaginated, unsorted list of all 152 cards.

- **No search box. No facet UI. No sort. No pagination.**
- **No "put this in my week" action** — the card's only control is _Report this
  session_ on a community row.
- **Not in the navigation.** The only link into it from the whole app is from
  `app/routes/admin/moderation.tsx:209`
  ([#471](https://github.com/leskraas/trainm8/issues/471)).
- The Week Pattern's workout picker is a plain `<select>` over
  `getAuthoredWorkouts(userId)` — **the athlete's own sessions only**. The 152
  cited rows are unreachable from it
  ([#442](https://github.com/leskraas/trainm8/issues/442) is the adjacent
  defect).

`plan.tsx:474` states the situation in its own comment: _"this app has no
Workout library: a Workout is authored inline with a session."_ That comment is
now **half-false** — the corpus exists; the picker does not.

The one consumer of the corpus other than the read-only list is generation. So
the corpus can place a whole season and cannot place **one session**.

### 3.2 Nothing derives a profile, so a new athlete's retrieved sessions resolve to nothing

This is the deepest finding, and it explains why the app can feel empty while
holding 152 sessions.

- `ThresholdEvent.source` reserves `'manual' | 'inferred' | 'auto'`. Only
  `'manual'` is ever written (`app/utils/athlete.server.ts:178`). **No code path
  writes the other two.**
- **No FTP estimator**, no CP/W′ fit, no mean-maximal-power curve.
- **No LTHR estimator**, no HR-drift method.
- **No threshold-pace estimator** — no Riegel, no VDOT fit, no critical speed.
- **No max-HR estimate.** ADR 0005:44 promises Tanaka (208 − 0.7 × age) and
  `structure-detection/classify.ts:227` defers to _"a Tanaka age-estimate
  computed upstream"_. **Nothing upstream computes it.** `birthdate` is stored,
  editable, and read by nothing but its own form.
- `PerformanceResult` has **read code only** — no route, no service, no seed
  writes it ([#464](https://github.com/leskraas/trainm8/issues/464)). So Race
  Equivalence _"resolves rung 1 or nothing"_, and rung 1 resolves to nothing.
- The only history → profile derivation in the app is `weeklyCapacityHours` (ADR
  0050), and it is training hours, not physiology.

The consequence chains straight into the complaint. A retrieved Catalogue row
carries a portable **Intensity Target** and is deliberately never resolved at
write time (ADR 0053 §6). It resolves per athlete at read time — against a
threshold that **only exists if the athlete typed it in**. A new athlete who
connects Intervals.icu, imports three years of data and generates a season gets
a correct, cited, honest plan in which every intensity reads as an **Unavailable
Metric** or a bare zone label.

The integrations are not the gap. `app/integrations/intervalsicu/` is
**complete** — API-key connect, backfill, sync, reconcile, telemetry backfill,
laps backfill, a courtesy pacer — as is Strava (OAuth + webhook) and file upload
(FIT/TCX/GPX). The data arrives. Nothing reads it to say anything about the
athlete.

`docs/research/zones-and-thresholds.md` already contains the recipe (§4: MMP
curve → 90-day rolling window → 2-parameter fit over 2–20 min → confidence grade
from coverage, recency, maximality and residual) and already names the gap: gap
6, _"No automatic threshold estimation at all. The `source: 'auto'` enum value
exists with nothing producing it."_ It also names the correct provenance fix —
ADR 0005's `manual | inferred | auto` is **the wrong axis**; record the
**protocol** and the **construct**.

### 3.3 Analysing a past workout stops at "what shape was it"

`app/utils/structure-detection/` is a genuinely good 3 869-line engine: PELT
change-point detection, two hypothesis families, an honesty gate that returns
`null` rather than guessing, HR-classified results capped at `medium`
confidence, and a re-detection lifecycle that refuses to overwrite an adopted
session. It emits the exact `WorkoutStructure` shape, so a detection
materializes into a real Workout with no translation.

What it does **not** do:

- **No archetype.** Detection says `4 × 8 min at 280 W`; it never says
  _"threshold session"_. `docs/research/workout-taxonomy.md` §8 already holds
  the classifier pseudocode, and §9.2 names the conflation it fixes:
  `WORKOUT_INTENTS` is _"the intensity axis mislabelled as archetype"_ — six of
  its fifteen members are verbatim zone-label strings, so a recovery jog, an
  easy run and a 3 h long run are all `intent: 'endurance'`.
- **No similarity.** The only "similar" in the app is `getLastSimilarSession`
  (`app/utils/training.server.ts:1696`), where similar means an **exact match on
  `(discipline, intent)`** — and `intent` is the broken axis above. It compares
  exactly two numbers, `tss` and `durationSec`
  (`app/utils/session-comparison.ts:45`).
- **No per-interval entity**, which
  `docs/research/interval-detection-and-data-platform.md` already flags as Gap
  1: `WorkoutDetection.structureJson` is a _prescription_ shape with nowhere to
  put avg HR, distance, cadence or mean ± SD across a set, which is why
  `lapsJson` stays stored and unread.
- **No performance curve.** `BenchmarkKind = 'farthest'` — one kind
  (`personal-records.ts:15`). No mean-maximal curve, no best-effort splits.

So an athlete can import a decade of training and cannot ask _"how did this
session go compared with the last four times I did it?"_ — the question the
owner named directly.

### 3.4 Season templates are three shapes wearing nine names, and there is no unit between "session" and "season"

The nine presets are `classic-linear`, `masters-2-1` and `big-base` at short /
medium / long. All nine are the same four phases (Base → Build → Peak → Taper).
Peak and Taper are 2 weeks in **all nine**. `MASTERS_SHAPE` is derived from
`CLASSIC_SHAPE` by swapping the 3:1 rhythm for 2:1.

There is nothing keyed to what the athlete is actually training for. The
Catalogue carries eight `goalEvent` values (1500 m, 3 k, 5 k, 10 k, HM,
marathon, trail, ultra) on its rows; **no preset is scoped to any of them.** A 5
k season and a 100 k ultra season get the same shape.

And there is no reusable unit **between** a session and a season:

- **`WeekPattern` is per-`PlanOutline`.** It cannot be reused across plans,
  cannot be shared, has no citation, and is authored by hand day by day.
- **A block is not a template.** A `PlanOutlinePhase` is a name, a week count, a
  rhythm and a taper flag. There is no such thing as "an 8-week threshold block
  for a half-marathon build" you can drop into an existing season — which is
  precisely the owner's _"the user should later be able to add blocks that fit
  this plan."_

`Plan Template` (#375) was closed `not_planned` and #434 put it out of scope. On
this evidence that call should be revisited — see the destination document.

## 4. Diagnosis in one paragraph

**#434 built the engine and did not build the product.** Every ticket on the map
was a decision or a mechanism, and every one of them landed correctly; the two
things left explicitly as fog — _"the shape of the review surface"_ and
_"editing by exception, gesture by gesture"_ — are the two things that are the
product. Meanwhile the honesty discipline that makes the engine trustworthy has
been discharged **in prose at the point of use**, which is why an athlete meets
a wall of true sentences instead of a plan. And the corpus that would make the
app feel full out of the box is reachable by exactly one caller (generation) on
exactly one route (`/training/plan/generate/:eventId`) that is itself reached
through the authoring flow it replaces.

The reason the app feels empty is not that it lacks content. It has 152 cited
sessions, 10 zone recipes, 9 season shapes, a change-point detector and three
working integrations. It feels empty because **nothing knows anything about the
athlete**, so nothing it retrieves can be resolved into a number they can train
at.

## 5. Where the honesty rule is doing the wrong job

Worth stating separately, because the fix must not break it.

The building principle — _"every metric is earned from real data or shown as an
**Unavailable Metric** — never fabricated"_ — is correct and is the product's
wedge. What has happened is that **honesty about a number has been implemented
as an essay next to the number**. Those are separable:

- An **Unavailable Metric** must remain visible and must never be backfilled.
  That is a rendering rule and costs one line.
- A **derivation** must remain reachable. #437 already decided the shape for
  this and it is not body copy: _"provenance is available, not asserted"_ — rows
  carry no provenance ink and tap into a drawer.

#437's rule was applied to the provenance of a _session_. It was never applied
to the provenance of a _guard_, a _ramp_, a _week override_ or a _conversion_,
and those are where the wall of text is. The same rule generalizes: **the caveat
sits on the number; the reasoning waits behind a tap.**

## 6. Open issues that are already enablers for the rebuild

Read from the current open list. These are not new work — they are filed and
waiting, and several are on the critical path.

| Issue                                                                                                           | Why it matters here                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [#475](https://github.com/leskraas/trainm8/issues/475)                                                          | Build the review surface — #437's design from prototype to a real screen. **The** ticket for §2.2.                  |
| [#471](https://github.com/leskraas/trainm8/issues/471)                                                          | Nothing links to `/training/catalogue`. The cheapest half of §3.1.                                                  |
| [#470](https://github.com/leskraas/trainm8/issues/470)                                                          | `CatalogueSave` has no surface — the fourth axis is unreachable.                                                    |
| [#442](https://github.com/leskraas/trainm8/issues/442)                                                          | The Week Pattern picker offers every session ever planned. Fixing it _properly_ means pointing it at the Catalogue. |
| [#464](https://github.com/leskraas/trainm8/issues/464)                                                          | A writer for `PerformanceResult`. Blocks every `racePace` row and rung 1 of Race Equivalence.                       |
| [#465](https://github.com/leskraas/trainm8/issues/465)                                                          | Race Equivalence rungs 2–5 — the curve that turns one result into every distance.                                   |
| [#383](https://github.com/leskraas/trainm8/issues/383)                                                          | Pace–duration curve instead of a single threshold. The owner's own earlier proposal, and the right shape for §3.2.  |
| [#457](https://github.com/leskraas/trainm8/issues/457)                                                          | Port the nine review controls to the tap-a-value vocabulary. Directly attacks §2.1 and §2.3.                        |
| [#467](https://github.com/leskraas/trainm8/issues/467)                                                          | Coexistence and regeneration — what a mixed manual/generated Outline means.                                         |
| [#472](https://github.com/leskraas/trainm8/issues/472) / [#473](https://github.com/leskraas/trainm8/issues/473) | The two numbers a generated week shows that nothing reconciles; weekly capacity carried but never checked.          |
| [#474](https://github.com/leskraas/trainm8/issues/474)                                                          | The Catalogue's provenance slot renders nothing for an uncited Stock Workout.                                       |
| [#466](https://github.com/leskraas/trainm8/issues/466)                                                          | Token Sentence: grade, cadence and the outer series repeat are undrawn — corpus rows that cannot be read.           |
| [#462](https://github.com/leskraas/trainm8/issues/462)                                                          | Hydration mismatch on `/training/plan`. Small, but it is on the screen under discussion.                            |
| [#395](https://github.com/leskraas/trainm8/issues/395)                                                          | Discipline Allocation's share denominator.                                                                          |
| [#377](https://github.com/leskraas/trainm8/issues/377)                                                          | Name the derive-vs-store principle as its own ADR — §3.2 is going to lean on it hard.                               |
| [#362](https://github.com/leskraas/trainm8/issues/362)                                                          | The manual planning map, still open. Its foundation is what everything above stands on.                             |

Not an enabler, and should be closed out rather than carried: the provenance
prototype (`plan_.provenance-prototype.tsx` + `__provenance-week.tsx` +
`__provenance-prototype-data.ts`, **941 lines**) is still a live route whose own
comment says to delete it once absorbed. `plan.generate.$eventId.tsx` absorbed
it.

## 7. Defects found while reviewing

Not filed — recorded here for whoever picks up the tickets.

1. **`plan.tsx:3111` says "Three built-in periodization shapes"; `presets.ts`
   ships nine.** Copy drift.
2. **`schema.prisma:1207`'s comment on `WorkoutDetection` still reads "Inert
   groundwork: no engine, job, or write path populates this yet."** The engine,
   the job, the backfill and the write path all exist. A stale comment on a
   model is the same class of lie the map spent a ticket fixing on
   `CONTEXT.md`'s Workout Template entry.
3. **`AthleteProfile.birthdate` is dead data.** Stored, validated, editable,
   read by nothing. ADR 0005 promised it a consumer.
4. **`ThresholdEvent.effectiveAt` is written but never read** — already recorded
   in `docs/research/zones-and-thresholds.md`, repeated here because §3.2's fix
   must not make it worse.
