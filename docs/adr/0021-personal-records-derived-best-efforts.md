# Personal Records as derived best-efforts gating on Load Confidence

The Cockpit home (ADR 0017, #128) wants a **Proof** zone — evidence that
training is working. The prototype (#128) mocked a Personal Records strip with
fabricated records (a 10K time, a bike FTP, a swim CSS). Those are exactly the
kind of invented numbers the Unavailable Metric principle (ADR 0008) forbids:
two of them are thresholds, not session efforts, and "10K time" needs per-sample
splits we do not ingest. So the question is what records the model can
_truthfully_ derive today, and how.

## Decision

Introduce a **Personal Record**: an athlete's best recorded effort for one
**Benchmark Kind** within a single **Discipline** — derived, never authored.

1. **Derived by a pure function, never authored.** A Personal Record is always
   the output of `detectPersonalRecords` over the athlete's qualifying efforts.
   There is no Personal Record table and no authoring path; the records are a
   _view_ over completed Workout Sessions and promoted Activity Imports, the
   same way the Plan card is a view over Events (ADR 0018). This keeps them
   honest by construction — there is nothing to fake.

2. **Whole-activity benchmark only (`farthest`).** v1 derives records from
   whole-activity summary telemetry, because per-sample streams are not ingested
   (CONTEXT.md "Recording" reserves the Phase Profile slot for that future). The
   one honest, comparable benchmark from a whole-activity summary is the
   **farthest** single-effort distance: `max(distanceM)` per discipline. Average
   pace/power over a whole activity is confounded by distance/duration and is
   _not_ a clean record; FTP/CSS are thresholds, not efforts. `BenchmarkKind` is
   modelled as a union so pace/power/duration benchmarks can join once streams
   land.

3. **Trust gate reuses Load Confidence (ADR 0008).** "No records from
   low-confidence data" — an effort qualifies only when its Load Confidence is
   `high` or `medium`. This drops the `sRPE` hand-logged fallback (`low`) and
   efforts with no resolvable load (`null`), so a Personal Record always traces
   to trustworthy recorded telemetry. A longer-but-untrusted effort can neither
   hold a record nor count as the previous best.

4. **Per-discipline scoping.** Efforts compete only within their own discipline
   (a run never competes with a ride). Strength records no distance, so it
   produces no `farthest` record — honest, not a hole to paper over.

5. **Previous best + delta, or nothing.** The record reports the **previous
   best** — the farthest qualifying effort from _before_ the record was set —
   and the gain over it. Chronology matters: a debut effort that is also the
   farthest has no previous best (both `null`), so it reads as a debut rather
   than claiming a fabricated gain over some _later_, shorter outing. Earlier
   efforts are always strictly shorter (a tie holds the record by the
   earliest-wins rule), so a present delta is always a real gain, never `+0`.

6. **Empty / Unavailable state.** No qualifying efforts ⇒ the Proof Strip shows
   an empty state, never a hardcoded zero (Unavailable Metric, ADR 0008).

## Status

Foundational vertical slice for the Cockpit Proof zone (#134, parent #129).
Extends ADR 0008 (Load Confidence as the trust gate) and ADR 0017 (consolidating
surfaces onto the home). The detection rules live in pure code, unit-tested
independently of the database.

## Consequences

- Two new modules: `personal-records.ts` (pure `detectPersonalRecords` + types)
  and `personal-records.server.ts` (`getPersonalRecords`, querying completed
  recording-backed sessions). No schema change — records are derived on read.
- `getPersonalRecords` runs in the home loader; `buildProofStrip` (presenter)
  formats records into chip view-models (km for run/bike, metres for swim); the
  `ProofStrip` component reproduces the prototype's PRChips treatment over real
  records.
- Reading on every home load is acceptable at hobby scale (one indexed query on
  `userId`); if it ever isn't, records can be materialized like Load Snapshots
  without changing the pure detection contract.
- Because v1's only benchmark is higher-is-better distance, a present delta is
  always a gain. The chip renders it as such; lower-is-better benchmarks (pace,
  time) will add polarity when their Benchmark Kinds land with stream ingest.
