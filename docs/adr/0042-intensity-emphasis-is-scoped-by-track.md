# Intensity emphasis is scoped by Training Track, and the block label is derived

The clean-room prototype for the manual planning surface (#366) gave a **Plan
Outline phase** a `Focus` enum:

```ts
type Focus =
	| 'endurance'
	| 'threshold'
	| 'vo2max'
	| 'speed'
	| 'strength'
	| 'recovery'
```

ADR 0041 removed `strength` from it — a phase carries no discipline, and volume
moved onto **Training Tracks**. This ADR decides what becomes of the rest.

## Evidence

### The enum was the app's own zone table, used at the wrong scope

`app/utils/session-profile.ts` already maps zone labels onto the canonical
`TrainingZone` 1–5:

| Zone label in code               | Resolves to |
| -------------------------------- | ----------- |
| `recovery`, `easy`               | 1           |
| `zone2`, **`endurance`**         | 2           |
| `moderate`, `tempo`              | 3           |
| **`threshold`**                  | 4           |
| **`vo2max`**, `anaerobic`, `max` | 5           |

Four of the six `Focus` members are already zone synonyms in this repo. `Focus`
was never a phase vocabulary — it was the step-level zone vocabulary lifted to
the phase, with `strength` bolted on. That is why it mixed two axes: it was
never one axis to begin with.

The prototype also authored a phase `name` _and_ a `focus` independently, and
the seeded season templates made them near-synonyms —
`{ name: 'Base', focus: 'endurance' }`, `{ name: 'Build', focus: 'threshold' }`,
`{ name: 'Peak', focus: 'vo2max' }`. The surface rendered both: the heading read
**Base**, the line under it read **Endurance · speaks km**.

### The label could not honestly carry a dose

Research for #374
([note](../wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md)
§4) established that a focus label says nothing about how much: "VO2max block"
does not distinguish 2 quality sessions from 5, and Tønnessen, Hisdal &
Rønnestad 2020 showed that number is decisive — 2 vs 4 interval sessions at
**matched volume and matched zone-3 time** (136 min in both arms) produced
opposite outcomes. ADR 0040 moved the dose onto a separate **Quality Session
Count**, leaving the label a smaller job than it was performing.

### Strength has its own intensity axis, equally well sourced

[Reference](../wayfinder/manual-training-planning/intensity-load-and-volume-reference.md)
§8: Prilepin's chart, derived from the training logs of >1,000 elite Soviet
weightlifters, prescribes by **%1RM band** — 70–80% → 3–6 reps/set, 80–90% →
2–4, 86–90% → 1–2, ≥91% → 1–3. ACSM 2026 separates strength (≥80% 1RM, 2–3
sets), hypertrophy (≥10 sets/wk) and power (≤24 repetitions·sets). JTS shifts a
block boundary by "75 → 50 barbell reps" with **intensity up 10 percentage
points** — an authored emphasis change, already cited in ADR 0041 as a volume
drop.

## Decision

### 1. A phase carries no emphasis

The `Focus` field leaves the phase entirely. A **Plan Outline phase** remains
what ADR 0041 left it: span, intent, loading/recovery rhythm, taper. The phase
name is now the only word it carries.

### 2. Emphasis is scoped by Training Track

There is no shared emphasis vocabulary. Each track has its own, and a track that
does not exist contributes no words:

```
Plan Outline
├── phases[]      Base ── Build ── Peak ── Taper    no emphasis, no modality
└── tracks[]
    ├── endurance   emphasis vocabulary: TrainingZone 1–5
    └── strength    emphasis vocabulary: %1RM bands (Prilepin), TBD
```

This is what makes the model read honestly for the **pure strength athlete** ADR
0041 made a first-class user. They do not meet an empty zone field; they meet
their own vocabulary. A pure runner never meets a %1RM band.

The block does not _separate_ emphasis from modality. It carries neither —
emphasis is scoped **by** modality, because it lives on the track.

### 3. The endurance track segment authors a Quality Session Mix

A multiset of `TrainingZone → sessions per week`:

```
segment "Build"
└── Quality Session Mix  { zone 4: 2, zone 5: 1 }
```

The model already expressed zone-per-session one level down — the prototype's
`PatternDay` carries `zone: 1 | 2 | 3 | 4 | 5 | null`. A segment field that
could say only _one_ zone would be poorer than the level beneath it.

**Zones 3–5 only.** `CONTEXT.md` already defines the quality session as an
_intensive_ one, and that is what the evidence measures: Tønnessen 2020
randomised interval sessions, and Seiler's "two to three of 10 to 14" counts ThT
and HIT bouts. Admitting zone 1–2 sessions would change what the number means
without anything changing in the training.

Noted tension, deliberately accepted: **Jack Daniels' "Q" is broader than
ours.** In the 2Q marathon programme one of the two quality workouts is often
the long run — a key session that is not a hard one. Under this decision the
long run is volume, carried by the **Volume Ramp**, and Daniels' 2Q is our
`{ zone 4: 1 }` plus a long run on the volume axis. This is chosen because it is
the reversible direction: widening an allowed set later leaves stored mixes
valid, narrowing it later does not.

### 4. Quality Session Count becomes derived

It is the sum of the mix. **This partially supersedes ADR 0040 §7**, which said
"a block authors a second number: its count of quality sessions per week." The
substance stands unchanged — session count is the decisive axis, Tønnessen 2020
is untouched — but the number is no longer authored, and its carrier moves from
the phase to the endurance track segment. Same form of supersede ADR 0041
applied to #366's "volume currency belongs to the block".

This is **not** a reopening of ADR 0040 §8, which rejected an authored _time_
distribution (`targetDistribution: [80,5,15]`). A count of sessions per zone is
Seiler's **session-goal approach**, which is the method Sylta, Tønnessen &
Seiler showed to be the correct unit — the same training measured time-in-zone
gave 96.1/2.9/1.1 and by session goal 86.6/11.1/2.4. Distribution stays derived;
what is authored is a session count, now resolved by kind.

### 5. The emphasis label is derived, never authored

There is no emphasis field. The label is the mix's dominant zone, and the season
chart reads **"Build · 2× threshold + 1× VO2max"** — kind _and_ dose, which is
precisely what §4 showed the old label only pretended to carry.

Nobody can label a segment "VO2max block" that contains no VO2max sessions,
because the word _is_ the content rather than a claim about it.

### 6. An empty mix is a positive statement, so `recovery` dissolves

`{ }` means "no quality sessions in this segment". The prototype's
transition-week template needed no special word — all three of its properties
were already expressible:

| Prototype           | Expressed as                            |
| ------------------- | --------------------------------------- |
| `focus: 'recovery'` | `Quality Session Mix { }`               |
| `rhythm: 'none'`    | rhythm `none` (ADR 0040)                |
| `baseHours: 3`      | **Block Boundary Step** −55% (ADR 0040) |

`endurance` dissolves the same way: a base segment is `{ zone 3: 1 }` or `{ }`,
not a differently-labelled block. The Base/Build difference becomes quantitative
— mix and ramp — which is what the evidence describes: Tønnessen 2014 found the
distribution shifts because low-intensity volume is _withdrawn_, with HIT time
roughly constant in absolute terms.

### 7. Neuromuscular work is not a position on the intensity axis

`speed` is dropped rather than mapped. Zones 1–5 order work by **metabolic**
strain, and strides, hill sprints and 10–20 s accelerations are high
_mechanical_ intensity at low metabolic strain — by Seiler's own session-goal
method, a run with strides on the end is a zone 1 run. The prototype had already
revealed the problem by colouring `speed` as `var(--zone-3)`, slower than
threshold, because no correct zone existed to pick.

Forcing it into zone 5 would have broken three things: **Quality Session Count**
would count strides days, so the number would stop measuring what Tønnessen
measured; `session-profile.ts` would resolve the label to zone 5 and mislead
every downstream load surface; and the 80/20 zone table (reference §4) stops
at >105% LTHR / >115% threshold pace, with no row for sprint work.

The same boundary appears from the pace side. A pace-duration curve — raised
separately as #383 — bottoms out around 1000 m, because the critical-speed model
degrades below roughly two minutes where the limiter stops being metabolic. Two
independent models stop in the same place.

Neuromuscular work is authored where the app already models intensity per step:
an **Intensity Target** on a step inside a session. A "speed block" in practice
is a few weeks where easy runs carry strides — a **Week Pattern**, which is
level 3 of #366's template hierarchy.

### 8. Endurance segments align to phase boundaries 1:1

An endurance track segment spans exactly one phase. ADR 0041 gave the
**strength** track independent segmentation for a specific domain reason — an RP
mesocycle "lasts as long as it takes to hit systemic MRV", so its length is a
_consequence_. Endurance segment length is **authored**, and what it is authored
against is the phase structure. ADR 0040 named the field **Block Boundary Step**
for exactly this boundary.

This is a **sharpening** of ADR 0041, not a plain reading of it: that ADR says
each track owns "its own segmentation". The asymmetry it actually draws is about
what determines length, not about alignment — but the sharpening is deliberate
and is recorded here rather than assumed.

Free-floating endurance segments were rejected because a phase could then be
crossed by two emphases, leaving no single word for the season chart to show,
and because the phase — already stripped of volume, unit and discipline — would
also lose alignment with where its volume rules change.

### 9. A detailed week that disagrees with the mix warns and never blocks

The mix is authored **intent**; the concrete sessions are the **detail**, picked
later. ADR 0039 materializes only the near term, so for a segment months out the
mix is the only statement that exists — it must be authored, not derived.

When a detailed week does disagree, the app says so softly and neither blocks
nor corrects. Same shape as ADR 0040's ramp guard: a signal on authored numbers,
stated as convention. Deliberately swapping a VO2max session for an easy run in
a tired week is a valid plan, not an error.

The **label always reads the mix**, never the sessions. Sourcing it from
sessions where they exist and from the mix elsewhere would make a segment's name
change character depending on how far into the season it sits.

This is not **Weekly Plan Adherence**, which compares actual against planned
TSS. Both sides here are plan.

### 10. The strength track's emphasis vocabulary is not decided here

The principle is: its own vocabulary, sourced from %1RM bands, never zones. The
words are left to a follow-on ticket, because the strength axes are not
independent the way the endurance axes are. ACSM 2026's hypertrophy / strength /
power are positions on a **volume–intensity trade-off**, and ADR 0041 already
authors the volume side via **Volume Landmarks** — so whether a segment authors
a %1RM band _beside_ the landmarks, or authors a goal _from which_ landmarks are
derived, is a real modelling decision with two defensible answers.

> **Closed by [ADR 0047](0047-strength-progresses-by-anchor-and-ramp.md) §3
> (#384), taking this section's second answer.** A strength segment authors a
> **Strength Goal** — `hypertrophy | maximal-strength | power` — and the `%1RM`
> band and rep range derive from it. The framing above is right that the axes
> trade off, but the deciding argument turned out to be narrower and independent
> of the trade-off: a band is a _strictly worse discriminator_ than the goal,
> because ACSM's strength prescription is ≥80% 1RM and hypertrophy occurs at
> 80%+ too, so what separates the goals is the **volume**, not the band. The
> half of the sentence about landmarks is void — ADR 0047 §8 retires them — and
> the goal derives the intensity side **only**, never sets per week, which stays
> the anchor's and the ramp's.
>
> Two notes on how this sits with the rest of this ADR. **§5's derive-the-label
> rule is not broken**: it exists to stop a segment being named for work it does
> not contain, and a goal the band derives _from_ cannot lie about the content,
> so the mechanism inverts while the principle holds. And **§3's exclusion of
> `speed` inverts rather than extending**: neuromuscular work has no position on
> the _metabolic_ zone axis, but the strength axis is `%1RM` — mechanical — so
> `power` has a native position on it (ACSM's 30–70%).

## Consequences

### Relationship to ADR 0039

**Not contradicted, and not superseded.** `CONTEXT.md` describes a Plan Outline
as "a sequence of phases (e.g. base / build / peak / taper)", and nothing here
takes a word from the phase that ADR 0039 put there. `Focus` came from the
prototype and _shadowed_ the canonical vocabulary by standing a competing one
beside it. Removing it leaves one word on the phase where there were two.

Two inputs are handed to #371, which owns preset phase names:

1. The phase name is now the **only** word the phase carries — #371 answers for
   a far emptier object than when it was written.
2. Base and Build are no longer distinguished by _kind_ but by mix and ramp,
   which invites the question of whether the phase name is now decorative — the
   same critique §4 made of the old focus label. This ADR's position is that it
   is not, because a name carries _intent_ and no derived quantity can, but #371
   owns it.

### Accepted costs

- **The mix can be authored and then contradicted.** A soft warning is one more
  advisory signal, and enough of them stop being read.
- **Daniels' 2Q cannot be stated in his terms** (§3), and `CONTEXT.md` must mark
  our narrower sense of "quality session".
- **A segment label simplifies its content.** `{ zone 4: 2, zone 5: 1 }` shown
  as "threshold" is a simplification, which is a milder version of the
  overstatement §4 criticised. Mitigated by showing the mix in full where there
  is room.
- **Two authored structures per segment where there was one field.**

### Downstream

- **#367** (stored shape) must hold a multiset per endurance segment, not an
  enum on the phase, and must not store the derived count or label.
- **#371** receives the two inputs above.
- **#383** (pace-duration curve) inherits the finding that neuromuscular work
  has no position on the intensity axis from either the zone side or the pace
  side.
- The prototype's `spd-2` and `rec-1` block templates have no successor at block
  level; both belong at **Week Pattern** level.
