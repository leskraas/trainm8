# Plan Outline phases carry no load; volume lives on parallel Training Tracks

The clean-room prototype for the manual planning surface (#366, variant F) made a
strength block a **Plan Outline phase** like any other, with its volume currency
locked to hours. Adding a 4-week strength block from the Templates sheet produced
a defect that was visible immediately: projected CTL fell **39.8 → 28.5 → 20.5 →
14.7** across the block's four weeks, because the 42-day EWMA was replaying zero
daily TSS.

The arithmetic was correct. The structure was not. The prototype's strength block
*replaces* four weeks of endurance, and no runner stops running for four weeks in
order to lift. Strength runs **concurrently** with endurance. The collapsing curve
was not a bug in the projection — it was the symptom of a phase being asked to be
two things at once: a **time structure** (when, and why) and a **volume carrier**
(how much, in what unit).

#366 accepted the collapse as a deferred cost and handed it to #373. This ADR
resolves it.

## Evidence

Research for #374
([note](../wayfinder/manual-training-planning/374-volume-continuity-and-progressive-overload.md)
§5, [reference](../wayfinder/manual-training-planning/intensity-load-and-volume-reference.md)
§8) established that strength is not a lossy approximation of endurance volume.
It is a different quantity, and no source doses it in time.

- **WHO 2020** doses aerobic activity in **minutes** and muscle-strengthening in
  **days**, stating there is "insufficient evidence to specify a specific
  duration" for the latter. The world's most consulted physical-activity guideline
  dosed endurance in time and *refused* to dose strength in time, on evidentiary
  grounds.
- **ACSM 2026 Position Stand** (overview of 137 systematic reviews, >30,000
  participants) prescribes strength entirely in %1RM, sets, reps and sessions/week
  — **no duration parameter anywhere** — and finds time under tension does not
  consistently affect outcomes.
- The accepted currency is **sets per muscle group per week**, with fractional
  counting for indirect sets. Every strength app surveyed counts sets.
- **TrainingPeaks' only path** for strength is hours × assumed intensity, and its
  own expert users describe the result as invalid.

One shared currency is structurally impossible for three independent reasons:
TSS is an integral of intensity over time while sets/week is a dimensionless
count with no time factor; TSS is a whole-organism scalar while strength volume is
attributed **per muscle group**; and the two express different fatigue constructs,
which is why Issurin separates them into distinct blocks in the first place.

## Decision

### 1. A phase carries no load

A **Plan Outline** phase is **pure periodization structure**: when a stretch of
the season runs, what its intent is, its loading/recovery rhythm, and whether it
tapers. It carries **no volume, no unit, and no discipline**. A phase says *when*
and *why*, never *how much*.

The conflation is what produced the collapse. Once the phase stops being a volume
carrier, a "block that carries no load" is not a special case that needs a flag or
an exemption — **no phase carries load**, so the category dissolves.

### 2. Volume lives on Training Tracks

A **Training Track** is what is measured over the phase timeline. Each track owns
its own volume currency, its own progression rule, and its own segmentation.

_Sharpened by ADR 0043 (#372): this sentence is the reading that holds — the
**track** carries the volume currency, not the track segment as the Consequences
section below says. ADR 0043 also makes a track **one per Discipline**, so the
`endurance` row of the diagram becomes one track per endurance discipline._

```
Plan Outline
├── phases[]        time, intent, rhythm, taper — no load, no unit
└── tracks[]        what is measured over that time
    ├── endurance   km / TSS · Volume Ramp (a rate) · soft advisory guard
    └── strength    sets per week · landmarks + duration · hard named bounds
```

### 3. No track is privileged

Endurance and strength are **peers**. A pure runner authors one track; a pure
lifter authors one track; a hybrid authors two. Neither is the spine and neither
is a side-car hanging off the other.

The rejected alternative was an endurance spine with an optional `strengthTrack`
companion. It reads naturally for the endurance athlete and fails completely for
the lifter: their entire plan lands in the "optional supplement", while the
structure that owns time and periodization stands empty. `CONTEXT.md` defines the
**Self-Coaching Athlete** as "the primary user who plans and reviews their own
training" — with no endurance qualifier — and **Discipline** already includes
`strength`. Privileging endurance in the model would have contradicted both.

### 4. The two tracks progress by different rules

ADR 0040's **Volume Ramp** is an endurance rule and does not transfer.

| | Endurance | Strength |
| --- | --- | --- |
| Progression | a **rate** — % per loading week (**Volume Ramp**) | **two landmarks + a duration**, interpolated |
| Bounds | soft, advisory ramp guard | **hard, named**: MV < MEV < MAV < MRV |
| Segment length | authored | a **consequence** — "as long as it takes to hit systemic MRV" |
| Post-deload resume | near the pre-deload level | back near **MEV**, below the pre-deload peak |
| Boundary | broadly continuous (**Block Boundary Step**, default 0) | **discontinuous by design** |

**A strength track segments independently of the phases.** RP's mesocycle length
is a consequence of reaching MRV, not a choice, so forcing a strength segment to
end where an endurance phase ends imposes an alignment the domain rejects — and a
deload forced onto an endurance boundary is exactly the coupling Issurin separates
blocks to avoid.

**A strength boundary drop is intent and is never flagged.** RP: mesocycle 1
closes at ~21 sets, mesocycle 2 opens at ~16 — a deliberate ~24% drop with a rising
baseline across cycles (12→21, then 16→25, then 21→30). JTS: 75 → 50 barbell reps
(−33%) with intensity up 10 percentage points. A planner that warns on this is
wrong about the domain.

### 5. Gym work is not funded out of an endurance target

The rule that already worked one level down, at the prototype's Week Pattern
level, generalises: **strength work is never funded out of the endurance track's
target.** The endurance sessions split the whole endurance target between them,
and strength time is reported alongside as extra clock hours.

Hours remain a strength track's **calendar cost** — useful for answering "will
this week fit" against **Training Availability** — and are never its dose.

### 6. Fitness Projection falls only as far as the endurance track falls

A lifting-dominant season is a **low-volume endurance track plus a heavy strength
track**, not an absence of endurance. Projected CTL then falls in proportion to
the endurance volume that was **actually** reduced.

This is the honest curve, and both rejected alternatives were dishonest in
opposite directions: a flat or suspended curve claims nothing changed when the
athlete really did cut their running, and the collapse to near-zero claims they
stopped entirely when they did not.

### 7. A pure lifter can author; the V1 load surfaces stay honest

The foundation is modality-neutral from day one — a pure strength athlete fits the
model with no migration later. V1's load-derived surfaces (**Fitness Projection**,
**Plan card**, **Weekly Plan Adherence**, **Week Replan**) still only tell an
honest story for endurance, and for an athlete with no endurance track they show an
**Unavailable Metric** rather than a fabricated number — the same honesty gate the
app applies everywhere else.

Making those surfaces *useful* for a lifter is real product work and is
deliberately not in this decision.

## Consequences

### What this supersedes in ADR 0039 / #366

#366 is **not reopened**. Two of its clauses are superseded and the rest stands:

- **"Strength is locked to hours"** falls away entirely. Strength is not a block,
  so the question is moot.
- **"Volume currency belongs to the block"** survives in substance — currency is
  authored below the plan level, not at it — but the **carrier moves** from the
  phase to the track segment. _Superseded by ADR 0043 (#372): this contradicted §2
  above, which said the **track** owns its currency. ADR 0043 settles it on the
  **track** — a segment authors progression (ramp, boundary step, mix) and never a
  unit, so no two segments of one track can disagree._

Variant F's shape, the two tabs, templates at three levels, and the layered season
chart are untouched.

### Accepted costs

- **Fatigue interaction between the tracks is unmodelled.** 50 km plus three heavy
  lifting sessions is harder than 50 km alone, and CTL/ATL/TSB will not know. For a
  runner this is not a detail: strength is done partly for economy and injury
  resistance, and it costs recovery that lands on the quality sessions. sRPE
  (RPE × minutes) is the only modality-agnostic candidate with any validation base,
  but its resistance-training validity is weak (r 0.25–0.52) — defensible as a
  *displayed* combined-load number and **never** as an input to CTL/TSB.
- **Adherence ignores strength entirely.** ADR 0019 §6 excludes a session missing
  either side from both sums, so a runner who completed every run and skipped all
  three gym sessions reads 100%. Correct arithmetic, wrong product behaviour. If
  strength adherence exists it must be in strength's own currency — sessions
  completed vs planned — never routed through Planned TSS.
- **Two independently segmented timelines** are more to draw and more to store than
  one spine.
- **V1's load-derived surfaces are honest only for endurance.**

### Left open

The strength track's volume **granularity** — a systemic per-track figure versus
per-muscle-group MV/MEV/MAV/MRV as ratcheting athlete attributes — is not decided
here. The per-muscle numbers are also unverified: `rpstrength.com` returns 429 and
`help.rpstrength.com` 403, and the figures currently in the reference file come
from a secondary aggregator that must be re-verified before use as seed data.

### Downstream

- **#367** (stored shape) must hold **two** structures, not one: phases without
  load, and tracks with per-track progression rules.
- **#372**'s premise no longer holds. Hours was the reconciling unit *only* because
  a strength block could express nothing else; with strength out of the block set,
  every remaining block can speak km or TSS, which puts the km headline back on the
  table. _Resolved by ADR 0043: the km headline is taken, as a per-track **Season
  Span** rather than a season total, and hours keeps only its calendar-cost role.
  Nothing reconciles, because a track has one currency._
- **§3's peer argument extends one level further than this ADR applied it.** ADR
  0043 (#372) uses it to reject a single `endurance` track: a track containing swim,
  bike and run privileges a modality class in the same way the rejected
  endurance-spine-plus-strength-side-car did.
- **#376** gains a fixed input from the load side: `strength` leaves the `Focus`
  enum. How modality is then expressed in the vocabulary remains that ticket's.
