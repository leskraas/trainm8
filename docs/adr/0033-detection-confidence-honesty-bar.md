# Detection Confidence: a honesty gate that auto-imports, graded for display

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

1. **Honesty gate (binary).** Did detection find *genuine* structure? The gate
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

2. **Grade (high | medium | low), for display.** Every detection that clears
   the gate is materialized, and graded from the prototype's score components
   (regularity, intensity tightness, alternation, coverage, k-factor,
   recovery-sanity). The grade is an **honesty label on the materialized
   Workout**, never a second gate.

**The bar is the gate.** Everything that clears the gate auto-imports, `low`
included. The only "attach nothing" outcome is **absent** — the gate failed, so
the recording stays structureless (an **Unavailable Metric**, "no structure
detected"). This matches the rest of the app: low-confidence *real* data is kept
and labelled (hrTSS, average-power Coggan at `medium`), while *fabrication* is
refused. A `low` here is real, messy structure (e.g. only 2 reps, k=2, loose
intensity tightness) — and since there is no inbox, attaching it labelled `low`
so the athlete can see and edit it respects them more than hiding it.

The internal 0–1 score is **not stored** — only the grade label, or *absent*
(ADR 0032: "not a bespoke 0–1 scale"). Exact numeric cut points for the gate and
the grade boundaries are **build-time calibration** (tunable facts against the
seeded corpus), not domain decisions.

### Availability rules

- **Missing Discipline Profile thresholds → absent.** The band-separation gate
  needs resolvable training zones. Without the classifying-discipline threshold
  the gate cannot run, so detection records *absent* — the same honest
  degradation Intensity Targets make, never a guessed structure.
- **Signal-trust caps the grade.** `confidence = min(pattern-quality grade,
  signal-trust ceiling)`. HR-classified intensity (no power/pace channel to
  classify by) caps at **`medium`**, never `high` — HR lag and cardiac drift
  make the zone label shaky, exactly the ADR 0024 reasoning that caps
  average-power Coggan below true-NP Coggan. Provider laps are an **enabler**
  (they rescue short-rep sessions the stream is blind to from *absent*), not a
  ceiling: a clean stream-only detection can still be `high` (the #330 prototype
  scored a stream-only 10×3′ at 0.95). The exact channel→cap table is finalized
  in #333 (zone classification); this ADR fixes the ceiling rule.

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
  *protective* purpose adoption serves for generation (surviving regeneration)
  is dormant here — a detection is frozen on promotion and recording-only
  sessions are promoted at creation, so there is nothing to re-materialize — but
  the honesty-labelling and consistency purpose stands, and an adopted structure
  is the natural stronger candidate for the future save-as-template flow.
- **Template-library visibility is a separate axis.** Keeping an auto-imported
  Workout out of the athlete's template library until promoted is a Workout-level
  *visibility* concern, orthogonal to the source value and left to the
  save-as-template work — not an either/or with `detected`.

## Alternatives considered

- **Bar at `medium` (low does not auto-import).** Mirrors the Personal Records
  trust gate (ADR 0021 excludes `low`). Rejected: without an inbox a stored
  `low` would be invisible and functionally identical to *absent*, so the level
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
  established. (The Workout still gains a *visibility* field later, for a
  different purpose.)

## Consequences

- CONTEXT.md's **Detection Confidence** definition is completed (the deferred
  "#331 decides" clause resolved), the honesty gate and grade are described, and
  **Session Source** gains the `detected` value with its adopt-on-edit rule; a
  relationship line records that a `detected` session adopts to `authored` on
  edit.
- `WorkoutSession.source` will carry a fourth value `detected`; the auto-import
  path (ADR 0032) sets it, and the session-edit path flips it to `authored`.
- The engine (build time) owes: a band-separation gate returning
  present/absent, a grader emitting high/medium/low behind a signal-trust
  `min()` cap, and an *absent* result when thresholds are missing. The numeric
  gate/grade cut points are calibrated against the seeded corpus, not fixed
  here.
- #333 (zone classification) inherits the channel→cap table (which channel
  classifies intensity per discipline, and therefore when the HR `medium` cap
  applies) and the HR-lag handling; this ADR fixes only the ceiling rule.
- The save-as-template work owns the Workout-level template-library visibility
  field; this ADR notes it is orthogonal to the `detected` source value.
