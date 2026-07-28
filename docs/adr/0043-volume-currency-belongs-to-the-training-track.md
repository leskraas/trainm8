# Volume Currency belongs to the Training Track, and the season headline is a per-track span

The clean-room prototype for the manual planning surface (#366, variant F) let
every **Plan Outline phase** pick its own volume currency, and reconciled the
season onto **hours** — the headline read `91.5 h` with
`785 km · 4710 TSS across the load-bearing weeks only` as a footnote. #372 asked
what the headline should be once blocks disagree about units.

The question outlived its premise twice. #372's body argued that hours was
forced because "a strength block has no distance and no TSS", and:

- **ADR 0041** removed strength from the block set entirely. A phase carries no
  volume, no unit and no discipline; volume moved onto **Training Tracks**.
  Hours won that argument _solely_ because of strength, and strength is no
  longer a block.
- **ADR 0040** made the **Volume Ramp** and **Block Boundary Step** unit-free
  percentages, withdrawing the body's third reconciliation point (the
  week-over-week ramp) before it was ever decided.

What remained was narrower than the ticket's title: not whether currency is
per-plan or per-phase, but what the _headline_ does over carriers that disagree.
This ADR answers that, and in doing so removes the disagreement.

## Evidence

### The conversion machinery a reconciled headline needs was already retired

The prototype's `fromHours` / `toHours` in
`app/routes/training/__manual-prototype-x-model.ts` rest on two constants:

```ts
export const TSS_PER_ENDURANCE_HOUR = 60
export const KM_PER_HOUR = 10
```

ADR 0040 §9 retired the first as a planning conversion: no primary source was
found, TrainingPeaks' own published flat figure is hours × **50** with 60 being
their _moderate_ value, and weekly-average IF is ~0.83–0.9 for runners versus
~0.6–0.7 for cyclists — **≈69–81 vs ≈36–49 TSS/hour for identical hours**. The
research note is blunt about the magnitude: a base→build intensity shift at
constant hours moves weekly load roughly 30%, while the progression rates the
field plans around are 5%/week, so "a flat conversion injects noise several
times larger than the quantity being controlled — silently, because the hours
line looks perfectly smooth."

Every km↔TSS conversion goes km→hours→TSS through **both** constants. A single
reconciled headline across mixed currencies is therefore built on a conversion
this repo has already declared unfit for planning.

### Currency is a per-sport property in the one tool that ships this

From the #374 platform survey
([note](../wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md)
§ platform table):

- **intervals.icu ATP Builder** — "load / time (3–35 h/wk) / distance, **any
  combination, per sport**". Per _sport_, not per block.
- **Coros** treats Distance / Time / Load as interchangeable **views** of one
  plan.
- **Runna** is distance-only and refuses time outright.
- **TrainingPeaks' ATP offers no distance at all** — only duration, TSS or event
  CTL. The survey's verdict: "a cycling-heritage data model that omits distance
  will not serve runners."

No surveyed tool lets one block speak km while its neighbour speaks TSS.

### intervals.icu's multiple targets are yardsticks, not generators

The precedent is real but does not transfer directly, and the difference is
decisive. In intervals.icu the athlete places workouts and the targets are
progress bars measured against that content — three yardsticks cannot contradict
each other, because the sessions are the truth.

In our model the week's target **is** the plan. ADR 0040 §1 makes per-week
volume derived from anchor plus ramp, and ADR 0042 §9 states that for a segment
months out "the mix is the only statement that exists". Multiple authored
currencies here would be multiple _generators_ with no third party to be
measured against.

### Only the session layer can express every currency natively

| Layer                      | Carries                                                    | Currencies available     |
| -------------------------- | ---------------------------------------------------------- | ------------------------ |
| **Season Anchor**          | one value + one unit                                       | 1 — its own              |
| **Training Track segment** | ramp % (unit-free), boundary step, mix                     | 1 — inherited            |
| derived week target        | one number                                                 | 1 — inherited            |
| **Workout Session**        | distance, duration, **Intensity Target** → **Planned TSS** | all three, independently |

`CONTEXT.md` defines **Planned TSS** as "computed from each Step's resolved
intensity midpoint via the same Load Formula as actual TSS" — a real derivation,
not a flat constant. So #372's conversion problem is an artefact of aggregating
**guidelines**, which are single-currency by construction, not of aggregating
sessions.

### Endurance disciplines are not one modality

ADR 0041 §3 rejected an endurance spine with a strength side-car because
"endurance and strength are **peers**. Neither is the spine and neither is a
side-car hanging off the other." A single `endurance` track containing swim,
bike and run is the same privileging one level down: 3 km of swimming plus 400
km of cycling plus 60 km of running is not 463 km of anything.

## Decision

### 1. Volume Currency belongs to the Training Track, and a track is per Discipline

**Volume Currency** is the unit a **Training Track** authors its volume in. It
is a property of the **track**, not of the segment and not of the plan. A track
covers one **Discipline**, so a triathlete who also lifts authors four tracks —
swim, bike, run, strength — over **one** shared phase timeline.

```
Plan Outline
├── phases[]     Base ── Build ── Peak ── Taper     one shared timeline
└── tracks[]     one per Discipline, each with one Volume Currency
    ├── swim      km        ┐
    ├── bike      km        │ segments author ramp %, boundary step,
    ├── run       km        │ Quality Session Mix — never a unit
    └── strength  sets/week ┘
```

This **resolves an inconsistency** in ADR 0041, which said both "each **track**
owns its own volume currency" (§2) and "the carrier moves from the phase to the
**track segment**" (Consequences). `CONTEXT.md` picked up both readings in
different entries. The track wins.

Because a track has exactly one currency, **segments cannot disagree** — and
conversion inside a track becomes impossible rather than merely discouraged.
This is the same move ADR 0040 made with the volume cliff: the defect becomes
unrepresentable instead of guarded against.

Rejected: per-segment currency. Its authoring case — "a VO2max block thinks in
TSS" — was made redundant by ADR 0042, which lets a segment say
`{ zone 4: 2, zone 5: 1 }` directly. Keeping it would have forced a conversion
at every disagreeing boundary, through the constants above.

Multiple **Plan Outlines**, one per sport, were also rejected: an athlete peaks
for one event in all their disciplines at once, so the phase structure is
shared, and ADR 0039 §3 holds that a plan is a view with no `Plan` entity to
fork.

### 2. Currency is proposed from the Season Anchor pre-fill, then locked

ADR 0042 removed `focus` from the phase, so `defaultCurrencyFor(focus)` has lost
its input. Nothing replaces it as a _rule about the phase_, because the choice
already belongs to an existing authoring moment: ADR 0040 §6 pre-fills the
**Season Anchor**'s first value "from actuals … with the derivation shown", and
stating that value already requires choosing a unit. Anchor value and Volume
Currency are one act.

What it proposes is the **least-derived unit that can express the athlete's
history**:

| History                  | Proposes                    | Why                                                  |
| ------------------------ | --------------------------- | ---------------------------------------------------- |
| one endurance discipline | **distance**, hours offered | measured directly, and the number the athlete quotes |
| no endurance history     | nothing — the athlete picks | honest beats guessing                                |
| strength                 | **sets/week**, not a choice | ADR 0041                                             |

**A track's Volume Currency is fixed for the life of the track.** Changing it
would rewrite every week already lived, not only future ones — the failure ADR
0040 §5 introduced dated anchor segments to prevent ("the chart would draw a
past that did not happen"). The three escapes are all worse: convert the history
through the retired constants; or let a new anchor segment carry a new unit,
which puts the disagreement back. Changing currency is re-authoring, not an
edit.

What makes the lock liveable is §8: the athlete can _view_ the season in any
currency without changing what is authored.

### 3. The headline reads the guideline layer, never the sessions

The season headline is computed from the **Season Anchor** and the tracks' ramps
— never summed from materialized **Workout Sessions**, even where they exist.

This is ADR 0042 §5's argument applied to a number instead of a label. That
section sources the emphasis label from the mix rather than the sessions because
doing otherwise "would make a segment's name change character depending on how
far into the season it sits". A headline that read sessions near the event and
guidelines beyond it has exactly that defect, and sessions cover only the
materialized near term.

The athlete's principle that concrete sessions are the plan's final truth stands
untouched — ADR 0042 §9 already has the app warn softly and never correct. Its
scope is the _plan_, not the _season summary_.

### 4. The headline is a span, not a total

```
PLAN A — 16 weeks                   PLAN B — 28 weeks
anchor 55 km · ramp 3.5%            anchor 55 km · ramp 3.5%
peak 78 km/wk                       peak 78 km/wk
─────────────────────               ─────────────────────
TOTAL:  1 050 km                    TOTAL:  1 870 km   ← +78%
SPAN:   55 → 78 km/wk               SPAN:   55 → 78 km/wk   ← identical
```

The headline is `anchor → peak loading week`, per week, in the group's currency:
`55 → 78 km/wk`, `12 → 21 sets/wk`. A season total remains available as a
secondary figure, where Friel's and TrainingPeaks' annual-hours tradition puts
it.

Three reasons the span wins:

- **A total conflates how big with how long.** Two plans with identical weekly
  training differ by 78% in total.
- **The span exposes the two authored numbers.** After ADR 0040 the anchor and
  the ramp _are_ the plan; a total hides the ramp completely, while a span is
  the ramp.
- **The footnote disappears.** The prototype needed "across the load-bearing
  weeks only" because summing a season forces a ruling on whether recovery and
  taper weeks count. Two weekly figures never face that question.

For a strength track the span is `12 → 21 sets/wk`, which is exactly how the
literature in ADR 0041 §4 reports a mesocycle ("mesocycle 1 closes at ~21 sets,
mesocycle 2 opens at ~16"). Same form, different currency, no conversion.

### 5. One number per commensurability group, not per track

Tracks whose currencies are commensurable contribute one accumulated number;
tracks whose currencies are not stand alone.

| Athlete             | Headline                               |
| ------------------- | -------------------------------------- |
| pure runner         | `55 → 78 km/wk`                        |
| pure lifter         | `12 → 21 sets/wk`                      |
| runner + lifter     | `55 → 78 km/wk` · `12 → 21 sets/wk`    |
| triathlete + lifter | `320 → 450 TSS/wk` · `12 → 21 sets/wk` |

So the headline **adapts to the plan's contents**, which is the ticket's fourth
bullet, and it adapts by a stated rule rather than a special case. For a
multi-discipline athlete the accumulated figure is derived, which is a
deliberate narrow exception to §3 — the alternative is a triathlete headline of
four simultaneous spans, which is not a headline. The derived status is marked.

**The headline never needs an Unavailable Metric.** It asks each track for _its
own_ currency, so no track is ever asked a question it cannot answer. ADR 0041
§7's honesty gate continues to apply unchanged to the **load-derived** surfaces
— **Fitness Projection**, **Plan card**, **Weekly Plan Adherence** — which need
TSS and, for a pure lifter, do not get it.

### 6. What may accumulate across tracks

| Accumulation                              | Across                            | Means                         | Allowed                                                                                                      |
| ----------------------------------------- | --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **TSS**                                   | endurance tracks                  | training load                 | **yes** — the TSS scale is _defined_ as 1 hour at threshold = 100, identically in every endurance discipline |
| **hours**                                 | **all** tracks, strength included | **calendar cost**, never dose | **yes** — ADR 0041 §5 already says this of strength                                                          |
| km                                        | tracks carrying distance          | —                             | **no** — 3 km swimming + 400 km cycling is not 403 km                                                        |
| a single combined load including strength | all tracks                        | —                             | **no**, and it is **#378's** question, not this one                                                          |

_The **hours** row is corrected by ADR 0046 §3 (#391) to **the endurance tracks
only**. It was written on ADR 0041 §5's authority, before ADR 0045 established
what a conversion into hours requires: a strength segment authors two **Volume
Landmarks** plus a duration — no sessions per week, no duration per session — so
there is nothing to multiply, and `sets → hours` is the conversion ADR 0041
forbids. A cross-track hours total is therefore an **Unavailable Metric** as soon
as a plan has a strength track. Less is lost than it appears: per ADR 0045 §8 the
fit check this total was to feed has no counterparty for the endurance tracks
either, since **Training Availability** stores trainable weekdays and a clock
time and never a capacity. A capacity field would serve both halves and needs §10
revisited deliberately — raised as its own issue. If **#384** lands a
sessions-per-week axis for a strength segment, this row is restored to its
original wording for free._

_ADR 0046 §1 also settles the row below it: no combined figure spans an endurance
and a strength track, on the **planned** side by ADR 0045 §6/§7 and §7 below, and
on the **actual** side by superseding ADR 0008's strength-`sRPE` clause._

Two honesty caveats travel with this. TSS is commensurable **by construction**,
but that an hour of threshold work in the water _costs_ what an hour on the bike
costs is a modelling assumption inherited from TrainingPeaks, not a measured
fact. And an hours total answers "does this week fit against **Training
Availability**", never "how hard is this week".

### 7. One axis is one track in one currency

A chart's value axis is owned by exactly one track reading exactly one currency.
More views means more axes — the athlete may show several charts at once (km
beside TSS, or one track beside another) and filter which are visible — but
never a shared or normalised axis. `CONTEXT.md` already gives **Chart
Primitive** ownership of "the scale and ticks", one scale per instance.

Other tracks and structures may layer onto the **time** axis only: phase
boundaries, week roles (loading / recovery / taper), the other tracks' segment
boundaries, **Quality Session Mix** as per-week marks, re-anchor points, the
**Target Event**.

Rejected: normalising a second track onto the same value axis. Every choice of
scaling is a claim about the exchange rate between km and sets, which is the
fabricated conversion ADR 0041 forbade, smuggled in as a pixel decision.

### 8. A derived currency view is allowed, and must be mix-aware

The athlete may read a track in a currency it was not authored in — km authored,
TSS displayed — provided it is marked derived with its derivation shown, the
same treatment **Quality Session Count** and **Intensity Emphasis** already get.
A derived reading is never the headline and never the authored truth.

This carries a hard requirement for whatever replaces the retired flat 60
TSS/hour: **it must be a function of volume _and_ the Quality Session Mix.**
With a scalar constant, a TSS chart is the km chart with new numbers on the axis
— the same shape, no additional information, a decorative duplicate. The insight
the athlete wants from km-beside-TSS is precisely the _divergence_ between the
two curves, which exists only when intensity enters the derivation:

```
FLAT 60 TSS/h                      MIX-AWARE f(km, mix)

km  ────╮  ╭─╮  ╭╮                 km  ────╮  ╭─╮  ╭╮
        ╰──╯   ╲╱ ╲                        ╰──╯   ╲╱ ╲
TSS ────╮  ╭─╮  ╭╮                 TSS ────╮   ╭──────╮
        ╰──╯   ╲╱ ╲                        ╰───╯       ╲
   ↑ identical shape                  ↑ km flat while TSS rises =
     no new information                 intensity rising
```

If the successor is not mix-aware, derived currency views should not be offered
at all. The mechanism itself is **not decided here** (see Downstream).

### 9. Hours keeps one role, and loses the other

Hours is no longer a **reconciliation** unit, because nothing needs reconciling.
It remains two things: a legitimate **Volume Currency** for a track whose
athlete thinks in time, and — for every track including strength — the
**calendar cost** that answers whether a week fits against **Training
Availability**. ADR 0041 §5 said this of strength; it now holds symmetrically.

This removes one of the three sites ADR 0040 §10 listed for hours. "A boundary
between blocks with different units" cannot occur, because a track has one
currency.

### 10. No new Athlete Profile value; `KM_PER_HOUR` dies without a successor

The prototype's `KM_PER_HOUR = 10` is removed and **nothing stored replaces
it**. The one remaining km↔hours need is calendar cost, and a single stored pace
has the same defect there that a flat TSS/hour has: ADR 0040 records that "km
and hours diverge exactly when the quality-session count changes", so the error
is largest in the blocks doing the most work.

| Model                                                      | km → hours                              | New stored field?                 |
| ---------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| flat `KM_PER_HOUR`                                         | one pace for all running                | yes                               |
| existing `thresholdPaceSecPerKm` + **Quality Session Mix** | easy km at easy pace, quality km faster | **no — the field already exists** |
| a full pace-duration curve                                 | correct across the range                | **#383**                          |

The middle row uses data the app already stores, and is the same move as ADR
0040 §9: a function of two numbers rather than one scalar assumption. **#383 is
not absorbed and is not a blocker** — a pace-duration curve would improve the
conversion, but the conversion is honest without it.

## Consequences

### What this sharpens and supersedes

- **ADR 0041's inconsistency is resolved** in favour of §2's reading: the track,
  not the track segment, carries **Volume Currency**. The Consequences section's
  "the carrier moves from the phase to the track segment" is superseded.
- **A Training Track is per Discipline.** ADR 0041 modelled `endurance` and
  `strength` as the two tracks; a single endurance track privileges one modality
  class in exactly the way that ADR's §3 rejected. This is a **sharpening**,
  recorded deliberately rather than read into it — the same form ADR 0042 §8
  used.
- **ADR 0040 §5 is amended**: an anchor segment does not carry its own unit. The
  unit is the track's, and a re-anchor changes value only. This is a
  simplification — a re-anchor that also changed unit would need a conversion to
  be comparable with what it replaced.
- **ADR 0040 §10 loses one of its three conversion sites**, as above.
- **#366's "volume currency belongs to the block"** keeps its substance for the
  second time: currency is authored below the plan level. Its carrier, having
  moved from the phase to the track segment in ADR 0041, now settles on the
  track.

### Accepted costs

- **A runner cannot author Base in km and Peak in TSS.** ADR 0042's **Quality
  Session Mix** is the replacement expression, and **Block Boundary Step**
  carries the volume drop. If an athlete genuinely wants both units as
  _authored_ numbers rather than one authored and one derived, this decision
  refuses them.
- **Volume Currency is immutable per track.** Changing it means authoring a new
  track. Mitigated by derived views (§8), never removed.
- **The accumulated headline is derived**, a narrow exception to §3, and it
  inherits the mix-aware mechanism's accuracy along with its absence today.
- **More tracks to draw and store.** ADR 0041 accepted "two independently
  segmented timelines"; a triathlete who lifts has four. The phase timeline is
  still one.
- **Cross-modality TSS equivalence is assumed, not measured** (§6).

### Downstream

- **A new ticket owns the mix-aware conversion**:
  `f(volume, Quality Session Mix)` → TSS and → hours. Its consumers are derived
  currency views (§8), calendar cost against **Training Availability** (§9), and
  **Fitness Projection**, whose `≈60 TSS per endurance hour` in `CONTEXT.md` is
  the retired constant — still shipped as `TSS_PER_PLANNED_HOUR = 60` in
  `app/utils/load/fitness-projection.ts`, with a test pinning the value, so the
  blast radius is production code and not only the glossary. The hard
  requirement is §8's: mix-aware, or the derived views are not offered.

  _Decided in ADR 0045 (#385), which satisfies §8 and reports back on two things
  this section assumed. **§9's calendar-cost consumer is only half-served**:
  **Training Availability** stores trainable weekdays and a clock time, never a
  capacity, so a week's hours can be derived but have nothing to be compared
  against — the fit check is declared undelivered rather than fabricated. And
  **§6 has a hole**: hours are said to accumulate across all tracks including
  strength, but a strength track authors **sets** and `sets → hours` is the
  conversion ADR 0041 forbids, so a cross-track hours total is unrealizable as
  soon as a plan has a strength track. §10's "no new **Athlete Profile** field"
  holds, and its reason gains a general form — a constant is legitimate exactly
  where the ratio is stable between athletes._

- **#367** (stored shape) stores **Volume Currency on the track**, one track per
  **Discipline**, and no unit on an anchor segment or a track segment. It stores
  neither the span nor any accumulated figure — both are derived.
- **#378** (a combined load number across tracks) keeps its question intact. §6
  rules on what may accumulate _within_ commensurable currencies and explicitly
  does not rule on a single load number spanning endurance and strength.
  _Answered by ADR 0046 (#378): **no such number exists**, planned or actual. The
  planned side is closed by ADR 0045 §6/§7 and by §7 above; the actual side is
  closed by superseding ADR 0008's strength-`sRPE` clause, so strength leaves
  CTL/ATL/TSB and keeps only its display-only home in `tssByDiscipline`. The ramp
  guard is unchanged (ADR 0040 §12, ADR 0041 §4)._
- **#383** (pace-duration curve) is neither absorbed nor a blocker (§10).
- **#381** (a strength track's volume granularity) holds the one known pressure
  point on §1's "one track per Discipline". That ticket asks whether a _maximal
  strength_ track uses Prilepin's lifts-in-an-intensity-band rather than
  hypertrophy sets — which would be two currencies inside the single `strength`
  **Discipline**, and this ADR's rule has no exception for that. §1 rejected a
  single `endurance` track because swim, bike and run are separate Disciplines
  with incommensurable distances; two currencies inside _one_ Discipline is a
  different shape and is deliberately left to #381, which may need either a
  stated exception or a finding that the difference belongs on the emphasis axis
  (#384) instead. Whichever way it lands, currency stays a property of the track
  and never of a segment: a per-muscle "sets per muscle group per week" is
  **one** Volume Currency whose value is a vector, not several currencies.
- **Fitness Projection** replays _all_ endurance tracks, not one. `CONTEXT.md`'s
  singular "the active **Plan Outline**'s **endurance Training Track**" is
  updated.
- The prototype's `defaultCurrencyFor`, `currencyLocked`, `phaseCurrency`,
  `Plan.currency`, `Plan.alsoTrack` and `KM_PER_HOUR` have no successors in this
  shape. `Currency` survives as **Volume Currency** on the track.

## Status

Accepted for the manual planning foundation (#372, parent map #362). Sharpens
ADR 0041 and amends ADR 0040 §5 and §10. Constrains #367 and the conversion
ticket it names above.
