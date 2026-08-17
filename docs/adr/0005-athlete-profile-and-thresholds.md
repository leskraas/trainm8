# Athlete profile split into AthleteProfile, DisciplineProfile, ThresholdEvent

> **Amended by
> [ADR 0054](./0054-a-threshold-may-be-proposed-from-the-athletes-own-history.md)**
> on the two counts this note raised. `ThresholdEvent` now carries
> **`construct`** and **`protocol`** alongside `source`, and the **Tanaka**
> fallback §44 promises — deferred to as _"computed upstream"_ by
> `structure-detection/classify.ts:227`, where nothing upstream computed it — is
> built. `birthdate` finally has a consumer.
>
> **Still open:** `effectiveAt` is written and never read. Zone resolution uses
> the current `DisciplineProfile`, so raising an FTP retroactively reclassifies
> training history — and ADR 0054 makes that latent defect **live**, because
> thresholds now move for reasons other than a hand edit. An as-of-date resolver
> is on the critical path for anything comparing a session against its own past.
> `DisciplineProfile.zoneSystem` has no history at all, so even a correct
> temporal join cannot reconstruct which recipe was in force. See
> [`docs/research/zones-and-thresholds.md`](../research/zones-and-thresholds.md).

The athlete's training-context data lives in three tables, not one.
`AthleteProfile` (1:1 with User) carries cross-discipline data — timezone,
preferred units, week start, birthdate, weight, sex (optional).
`DisciplineProfile` (N per athlete × Discipline) carries current
discipline-specific thresholds — FTP for bike, LTHR, threshold pace for run, CSS
for swim — plus the chosen zone system and optional per-zone overrides, plus an
`enabled` flag. `ThresholdEvent` (append-only) records every threshold change
with `source` ('manual' | 'inferred' | 'auto') and `effectiveAt` timestamp.

## Considered options

- **Single Profile table with JSON for per-discipline data**: Rejected — typed
  columns enable indexed queries (e.g. "athletes with FTP"), better validation,
  and a clearer migration history.
- **One table per threshold (FtpEvent, LthrEvent, etc.)**: Rejected — five
  near-identical tables for the same shape (athlete, value, effective date,
  source) is redundant. A single `ThresholdEvent` table with a `kind` column
  scales linearly with new threshold types.
- **Current-only state, no history**: Rejected — threshold history is needed for
  fitness-trend visualization, AI plan context, and retro-resolution of authored
  Intensity Targets.

## Consequences

- `ThresholdEvent` feeds AI prompts ("FTP went from 250 to 265 on 2026-04-12")
  and the Tape's fitness-trend overlay.
- `DisciplineProfile.enabled` hides disciplines an athlete does not train —
  bike-only riders never see swim or run noise.
- Missing thresholds degrade gracefully via Unavailable Metric; the system never
  rejects authoring because a threshold is absent.
- Sex is optional, defaults to "prefer not to say"; no feature gates on it. Max
  HR uses the Tanaka formula (208 − 0.7×age) as compute-time fallback and is
  never materialized into the database.
- Weight is a single current value in v1; a `WeightEvent` history table is a
  later additive change if trend tracking becomes needed.
