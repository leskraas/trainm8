# Detection Confidence: a honesty gate that auto-imports, graded for display

> **Amended by [#460](https://github.com/leskraas/trainm8/issues/460)**, which
> builds [#458](https://github.com/leskraas/trainm8/issues/458)'s decision and
> closes the live defect [#459](https://github.com/leskraas/trainm8/issues/459).
> **Adoption is a separate axis from origin, for both the `detected` and the
> `generated` arm.** Everything this ADR decides about the honesty gate, the
> grade, the signal-trust cap and the availability rules is untouched; what
> changes is the "Editing adopts `detected` → `authored`" clause under
> **Provenance marking**, in three ways.
>
> 1. **`source` is no longer rewritten.** It was carrying two questions — _where
>    did this come from_ and _has the athlete taken it over_ — and the only way
>    to answer the second was to destroy the answer to the first.
>    `WorkoutSession.adoptedAt` answers it now, and `source` keeps its origin
>    value for the life of the session. The badge, the "Detected" label and the
>    re-detect control retire on `adoptedAt`, which is what this ADR's prose
>    always described; only the mechanism was wrong.
> 2. **Adoption fires on an actual change to the prescription**, not on any
>    save. This ADR says _"editing the materialized structure"_ adopts, and the
>    code was broader than the decision: with no comparison of input against
>    current state anywhere in the update path, a reschedule, a rename or a save
>    with nothing changed all adopted. Rescheduling a detected session from
>    Sunday to Saturday therefore destroyed re-detection permanently (#459). The
>    gate is now the blocks, the **Discipline** and the Workout intent; a title
>    and a **Scheduled At (UTC)** are outside it.
> 3. **Re-detection survives adoption as a concept, not as a permission.**
>    Eligibility is `source = 'detected' AND adoptedAt IS NULL` — expressible
>    for the first time. An adopted session is still excluded from re-detection,
>    and now for the right reason: the athlete's prescription must not be
>    rebuilt, rather than the origin having been erased.
>
> **And the pre-edit blocks are preserved rather than deleted.** The update path
> used to `deleteMany` every block and recreate them, so the machine's structure
> was gone from the database rather than superseded. The first adopting save now
> **forks**: the athlete's edit is written into a new Workout that back-points
> at the machine's row through `Workout.copiedFromId`, and the machine's row is
> left exactly as it was found (ADR 0051 §5 — one field, one rule, across both
> tickets: never edit the machine-written or corpus-written artifact in place).
> That preserved row is what makes a `90 min → 75 min` diff possible, and it
> diffs with the same code that renders a workout.
>
> **Correction to the Revisit note below, while amending it:** adoption does
> **not** destroy the engine's output. `WorkoutDetection` survives adoption and
> `detect-job.server.ts` preserves it deliberately — _"its plan-blind provenance
> feeds Structure Adherence"_. What adoption destroyed was **re-detection
> eligibility** and **the pre-edit blocks**, and #460 fixes both. The research
> note's **base + overlay** shape is honoured in the form the repo can actually
> hold: the detection row is the immutable engine-owned base, and the athlete's
> fork is the user-owned structure that references what it came from.
>
> One consequence worth stating because it is a live behaviour change:
> **Structure Adherence now reaches an adopted `detected` session on purpose**
> (its gate inverts — see ADR 0034), while **Planned TSS still does not**. That
> asymmetry was previously produced by accident, in both directions, by the
> flip.
>
> **Revisit — Amend.** The `high | medium | low`-or-nothing vocabulary is
> confirmed by four documents and reused verbatim by three proposed features, so
> it should not be forked. The amendment is the correction path: editing the
> materialized Workout flips `detected → authored` wholesale, which destroys the
> engine's output, blocks re-detection and discards the best available
> calibration corpus — a base structure plus a user-owned overlay keeps both.
> See
> [`docs/research/interval-detection-and-data-platform.md`](../research/interval-detection-and-data-platform.md).

Map #326 (Workout auto-analysis) stores a single **Structure Detection** per
run/bike **Activity Import** and auto-imports it — no candidate inbox, no
confirmation (ADR 0032). What was left open (#331): what **Detection
Confidence** measures, where the auto-import bar sits, and how an auto-imported
structure is marked so it stays distinguishable from athlete-authored and
Plan-Generated structure. Ranking, deduplication, and any "margin over
runner-up" threshold are already dropped — there is no runner-up in the stored
model.

## Decision

### The honesty bar is a gate, not a confidence threshold

Detection Confidence is a **two-layer** concept:

1. **Honesty gate (binary).** Did detection find _genuine_ structure? The gate
   is anchored on **band-separation** — a work segment counts only if its
   intensity sits **≥ 1 training zone above** the activity's easy/baseline band.
   GPS/pace wobble on an easy run stays inside one zone; a real effort crosses a
   zone boundary. This is the ADR 0008 honesty line for the whole feature: it is
   what refuses the ~40 easy runs that otherwise produced convincing phantom
   `N × … @ E` sets in the #330 prototype. The gate also requires a
   recovery-sanity guard (recoveries must not be longer/harder than the works
   they separate) and a minimum-coverage floor (the structured portion must
   explain a meaningful share of moving time). A **single sustained elevated
   block** (warm-up → 20′ threshold → cool-down) clears the gate — repeated reps
   are **not** required. Pure steady / formless activity fails the gate.

2. **Grade (high | medium | low), for display.** Every detection that clears the
   gate is materialized, and graded from the prototype's score components
   (regularity, intensity tightness, alternation, coverage, k-factor,
   recovery-sanity). The grade is an **honesty label on the materialized
   Workout**, never a second gate.

**The bar is the gate.** Everything that clears the gate auto-imports, `low`
included. The only "attach nothing" outcome is **absent** — the gate failed, so
the recording stays structureless (an **Unavailable Metric**, "no structure
detected"). This matches the rest of the app: low-confidence _real_ data is kept
and labelled (hrTSS, average-power Coggan at `medium`), while _fabrication_ is
refused. A `low` here is real, messy structure (e.g. only 2 reps, k=2, loose
intensity tightness) — and since there is no inbox, attaching it labelled `low`
so the athlete can see and edit it respects them more than hiding it.

The internal 0–1 score is **not stored** — only the grade label, or _absent_
(ADR 0032: "not a bespoke 0–1 scale"). Exact numeric cut points for the gate and
the grade boundaries are **build-time calibration** (tunable facts against the
seeded corpus), not domain decisions.

### Availability rules

- **Missing Discipline Profile thresholds → absent.** The band-separation gate
  needs resolvable training zones. Without the classifying-discipline threshold
  the gate cannot run, so detection records _absent_ — the same honest
  degradation Intensity Targets make, never a guessed structure.
- **Signal-trust caps the grade.**
  `confidence = min(pattern-quality grade, signal-trust ceiling)`. HR-classified
  intensity (no power/pace channel to classify by) caps at **`medium`**, never
  `high` — HR lag and cardiac drift make the zone label shaky, exactly the ADR
  0024 reasoning that caps average-power Coggan below true-NP Coggan. Provider
  laps are an **enabler** (they rescue short-rep sessions the stream is blind to
  from _absent_), not a ceiling: a clean stream-only detection can still be
  `high` (the #330 prototype scored a stream-only 10×3′ at 0.95). The exact
  channel→cap table is finalized in #333 (zone classification); this ADR fixes
  the ceiling rule.

### Provenance marking

- **New Session Source `detected`.** `WorkoutSession.source` gains a fourth
  value alongside `authored | generated | recorded`. `recorded` stays for a
  recording-only session with no structure; `detected` marks a recording-only
  session whose **Workout** was auto-materialized from a **Structure
  Detection**. This parallels how Plan Generation marks a **Generated Session**
  at the session level — one consistent mechanism for all machine-produced
  structure. Detection provenance (engine version, computed-at) already lives on
  the `WorkoutDetection` row and is reachable via the recording, so — unlike
  generation, which denormalized `generationId` / model / timestamp onto the
  session — nothing extra is copied onto the session.
- **Editing adopts `detected` → `authored`,** exactly like a Generated Session.
  Once the athlete edits the materialized structure it is no longer a machine
  guess, so the "detected · (confidence)" badge flips to "authored". The
  _protective_ purpose adoption serves for generation (surviving regeneration)
  is dormant here — a detection is frozen on promotion and recording-only
  sessions are promoted at creation, so there is nothing to re-materialize — but
  the honesty-labelling and consistency purpose stands, and an adopted structure
  is the natural stronger candidate for the future save-as-template flow.
  - **Amended by #460.** The rule stands; the mechanism does not. Editing the
    materialized structure adopts, and the badge retires — but the session keeps
    `detected` as its origin and records the takeover in `adoptedAt`, and only a
    real change to the prescription counts as editing it. The "dormant
    protective purpose" reasoning is also overtaken: #357 shipped re-detection,
    so there _is_ something to re-materialize, and adoption is what protects the
    athlete's corrections from it.
- **Template-library visibility is a separate axis.** Keeping an auto-imported
  Workout out of the athlete's template library until promoted is a
  Workout-level _visibility_ concern, orthogonal to the source value and left to
  the save-as-template work — not an either/or with `detected`.
  - Settled by ADR 0051: visibility is one of **four** orthogonal axes, the
    library is the **Catalogue**, and membership is a `CatalogueEntry` row.

## Alternatives considered

- **Bar at `medium` (low does not auto-import).** Mirrors the Personal Records
  trust gate (ADR 0021 excludes `low`). Rejected: without an inbox a stored
  `low` would be invisible and functionally identical to _absent_, so the level
  would earn nothing; and materializing a real-but-messy structure the athlete
  can edit is more useful and no less honest than hiding it, once the gate has
  already rejected fabrication.
- **Single graded scale with a low cut = absent (no separate gate).** Rejected:
  it conflates the ADR 0008 honesty question ("is this real?") with the quality
  question ("how clean?"). The prototype showed band-separation, not a score
  cut, is what cleanly refuses phantom easy-run structure.
- **Storing the raw 0–1 score.** Rejected by ADR 0032 (no bespoke scale); the
  grade label is the ubiquitous-language currency.
- **No signal-trust cap (pattern quality alone).** Rejected: it would let a
  clean HR-classified interval set claim `high`, diverging from the ADR 0024
  principle that a weaker input cannot claim the confidence of a direct one.
- **Marking provenance with a flag on the Workout instead of a Session Source
  value.** Rejected as the primary marking: it splits machine-provenance across
  two mechanisms and diverges from the session-level pattern generation
  established. (The Workout still gains a _visibility_ field later, for a
  different purpose.)

## Consequences

- CONTEXT.md's **Detection Confidence** definition is completed (the deferred
  "#331 decides" clause resolved), the honesty gate and grade are described, and
  **Session Source** gains the `detected` value with its adopt-on-edit rule; a
  relationship line records that a `detected` session adopts to `authored` on
  edit. (Both rewritten by #460: `CONTEXT.md` now carries **Session Adoption**
  as its own term, and **Session Source** as origin only.)
- `WorkoutSession.source` will carry a fourth value `detected`; the auto-import
  path (ADR 0032) sets it, and the session-edit path flips it to `authored`.
  - **Superseded by #460:** the session-edit path stamps `adoptedAt` and flips
    nothing. The only remaining write to `source` is the engine's own `recorded`
    ⇄ `detected` pair as a detection materializes onto a recording-only session
    or is retracted from it — the same engine restating what it found about its
    own recording, guarded to unadopted sessions. The athlete never moves the
    column.
- The engine (build time) owes: a band-separation gate returning present/absent,
  a grader emitting high/medium/low behind a signal-trust `min()` cap, and an
  _absent_ result when thresholds are missing. The numeric gate/grade cut points
  are calibrated against the seeded corpus, not fixed here.
- #333 (zone classification) inherits the channel→cap table (which channel
  classifies intensity per discipline, and therefore when the HR `medium` cap
  applies) and the HR-lag handling; this ADR fixes only the ceiling rule.
- The save-as-template work owns the Workout-level template-library visibility
  field; this ADR notes it is orthogonal to the `detected` source value.
