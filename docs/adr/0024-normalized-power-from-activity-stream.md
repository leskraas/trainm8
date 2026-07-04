# True Normalized Power from the Activity Stream for Coggan TSS

Coggan TSS received average power as if it were Normalized Power and labelled
the result `high` confidence — under-costing interval and hilly rides, whose
physiological cost grows with power variability (#174). The **Activity Stream**
(ADR 0020) now stores per-sample power, so the honest input exists.

## Decision

Compute **true Normalized Power** from the stored Activity Stream power channel
and feed it to Coggan TSS. NP is a pure function in the Training Load module
(`app/utils/load/normalized-power.ts`): a 30-second rolling average of the
power stream, each rolling value raised to the fourth power, the mean of those,
and the fourth root of that mean.

- **Fallback chain (amends ADR 0008's bike chain).** With `preferCogganTss` and
  an FTP: a usable power stream → NP-based Coggan at `high` confidence; no
  usable stream but an aggregate `powerAvg` → average-power Coggan at
  **`medium`** confidence; then hrTSS → sRPE → Unavailable Metric as before.
- **Average-power Coggan is retained, not dropped.** Stream ingest is recent
  (#139/#140) and best-effort: manual/file imports may carry no power channel,
  Strava omits streams for manual uploads and device-less activities, and
  fetches can fail. Dropping the fallback would demote real power data to hrTSS
  or sRPE — or to an Unavailable Metric — which is *less* truthful than an
  estimate that is exactly right for steady rides and merely a floor for
  variable ones. The honest-metrics correction is the confidence label: average
  power must never claim the `high` confidence of a true NP.
- **NP on downsampled streams.** The stored stream is bucket-mean downsampled
  (ADR 0020: ≥5s resolution, ≤1000 samples). The rolling window is
  `ceil(30 / resolutionSec)` samples; buckets coarser than 30s are already
  smoothed past the window, so the rolling pass degrades to identity. `null`
  gap samples (pauses) are skipped, never read as zero watts. A stream is
  *usable* only when its real samples fill at least one full 30s window;
  otherwise NP is `null` and the chain falls back. Bucket-mean smoothing makes
  this NP slightly conservative versus a 1 Hz NP — acceptable, and still far
  closer to the truth than average power.
- **Recompute trigger for existing data: a one-shot Job Queue backfill.** Server
  boot enqueues an `np-tss-backfill` job once (the job row itself is the
  "already ran" marker, persisted across restarts; the worker's retry/backoff
  covers transient failures — ADR 0013). The handler finds athletes with
  affected rows — imports whose stream carries power, or rows with `coggan`
  provenance — and pushes each through the existing recompute-from-date path
  (`recomputeLoadFrom`) from their earliest affected date, correcting stored
  per-session TSS and the derived Load Snapshots end-to-end. Chosen over a
  migration-style script (nothing to remember to run, no new mechanism) and
  over an every-boot recompute (wasted work, and a silent rewrite on every
  deploy is not "the smallest honest mechanism").

This supersedes ADR 0020's consequence that "recomputing TSS / Normalized
Power from streams stays out of scope; provider aggregates remain the source
for load math": the power stream is now a load-math input. Aggregates remain
the source everywhere a stream is absent.

## Considered options

- **Use the provider's weighted average power (`powerWeightedAvg`, Strava's
  `weighted_average_watts`) as NP.** Rejected as the primary input — it is
  provider-specific, undefined for file imports, and Strava does not guarantee
  Coggan's exact algorithm. Kept as a possible future middle rung of the
  fallback (between true NP and plain average) if stream coverage proves worse
  than expected.
- **Drop average-power Coggan entirely.** Rejected — see above; production
  stream coverage could not be measured from this worktree (headless
  implementation, dev database), and every known ingest path can legitimately
  produce power aggregates without a stream, so the fallback keeps real data
  contributing at an honest confidence.
- **Recompute NP at ingest and store it on the Activity Import.** Rejected for
  now — TSS is already recomputed on demand through `recomputeLoadFrom`, which
  reads the stream row anyway; a cached NP column is an optimization to revisit
  if per-day recompute cost ever bites.

## Consequences

- `coggan()` carries a `powerBasis: 'normalized' | 'average'` provenance
  (default `'normalized'`); `'average'` yields `confidence: 'medium'`.
- `computeSessionTss` accepts an optional parsed `powerStream`
  (`{ resolutionSec, power }`); `computeDayContributions` selects the stream's
  power channel alongside the aggregates for both sessions and promoted
  imports, so *every* TSS recompute path picks up NP automatically — including
  live sync/webhook/file imports, whose TSS is first computed at
  completion/log time, after their stream has landed.
- Existing rows correct themselves once via the `np-tss-backfill` job: stream-
  backed rides typically gain TSS (NP ≥ average power); stream-less Coggan rows
  keep their number but drop to `medium` confidence. Personal Records' trust
  gate (ADR 0021) accepts `high` and `medium`, so no records are invalidated.
