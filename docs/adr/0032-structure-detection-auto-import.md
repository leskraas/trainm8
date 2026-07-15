# Structure Detection auto-imports a single structure, with no candidate inbox

Map #326 (Workout auto-analysis) was chartered assuming an athlete-facing
review step: detection would produce a _ranked list of candidate structures_
with confidence scores, auto-accept the top one above a threshold, and
otherwise surface up to ~3 candidates for the athlete to confirm. Resolving the
domain-model ticket (#329) redrew that: we want detection to behave like the
existing auto-promotion — run silently on import and just apply its result —
not to introduce a new inbox/confirmation surface.

## Decision

A **Structure Detection** is a derived artifact of a run or bike **Activity
Import**, and:

- **Lives in its own 1:1 model** (`WorkoutDetection`), keyed to the import and
  cascade-deleted with it — a sibling of `ActivityStream`, not a column on the
  hot `ActivityImport` row. It rides with a promoted **Recording** on
  disconnect, exactly like the stream (ADR 0012).
- **Stores a single structure, not ranked candidates.** The engine may rank
  hypotheses internally, but only the winning structure is persisted. "Candidate
  Structure" is therefore an engine-internal term, not a domain entity, and
  there is no stored list to surface.
- **Reuses the workout structure vocabulary.** The stored structure is the
  **Workout → Block → Step** shape (`Block` → `WorkoutStep` → `IntensityTarget`)
  extracted from `WorkoutAuthoringSchema` into a shared `WorkoutStructureSchema`
  — minus the authoring envelope (`title`, `intent`, `scheduledAt`), which would
  otherwise force a _guessed_ intent and a synthetic schedule. An accepted
  structure therefore materializes into a real **Workout** with no translation.
  Whether a detected step's intensity is stored as a concrete metric band or a
  resolved zone label is deferred to #333; #329 fixes only that it is expressed
  as an `IntensityTarget`.
- **Auto-imports, honesty-gated (ADR 0008).** When a detection clears its
  **Detection Confidence** honesty bar, its structure is auto-materialized onto
  the recording-only session's **Workout** (**Session Source** `recorded`) — no
  confirmation, no picker. Below the bar the recording stays **structureless**
  (an **Unavailable Metric**, "no structure detected"), never a fabricated
  guess. The athlete's correction path is editing the materialized **Workout**
  like any other.
- **Reuses the Load Confidence vocabulary.** Detection Confidence is
  `high | medium | low`, or _absent_ when nothing clears the bar — the same
  honesty vocabulary the rest of the app speaks, not a bespoke 0–1 scale. The
  precise inputs and the threshold are #331's call.

### Lifecycle

- **Computed** on the **Job Queue** (a new `kind`) right after the stream is
  persisted at import; run + bike only; only when a real signal exists (a stream
  and/or laps). Existing imports are reached by a later backfill job.
- **Frozen on promotion.** A promoted **Recording** is immutable to source-side
  changes, so its detection never silently re-runs. On a provider `update` to a
  still-unpromoted import, the stream re-snapshots and the detection is
  re-computed.
- **Cascade-deleted** with the import on discard and on provider `delete` of a
  non-promoted import; survives (with the Recording) when a promoted import is
  deleted at source. Unlinking a Recording from its session keeps the detection
  — it describes the import's telemetry, independent of promotion.
- A detection carries provenance (engine version + computed-at) so a future
  re-detection trigger (threshold move, engine bump) can tell stale from current
  — but the trigger rules themselves are left to a later ticket.

## Alternatives considered

- **Ranked candidates + a confirmation inbox** (the original charter): rejected.
  It adds a whole surface and interaction model to review something the engine
  is already confident about; the honest failure mode (attach nothing) is
  simpler and less intrusive than asking the athlete to adjudicate guesses.
- **A JSON column on `ActivityImport`** (the `phaseBarsJson` precedent):
  rejected. The payload is a full workout structure plus confidence and
  provenance — heavier than phase bars, and it would load on every import query.
- **Always attach the best structure regardless of confidence**: rejected as
  dishonest (ADR 0008). Auto-import is not always-fabricate; below the bar we
  attach nothing.

## Consequences

- CONTEXT.md gains **Structure Detection** and **Detection Confidence** terms,
  two relationship lines, and a flagged-ambiguity note retiring "candidate
  structure" as a domain term.
- Map #326's Destination is redrawn (no candidate inbox); #331 shrinks from
  "threshold + ranking + ≤3 alternatives + provenance" to "the honesty bar for a
  single auto-import + provenance".
- Implementation (the `WorkoutDetection` model + migration, the extracted
  `WorkoutStructureSchema`, the engine, and the job `kind`) is left to build
  time; this ADR fixes the model, not the code.
