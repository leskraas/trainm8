# TCX gains an Activity Stream from its trackpoints, at full parity

Map #326 (Workout auto-analysis) runs a **stream-first** structure detector
(ADR 0032/0033, #327/#330): edges come from the **Activity Stream** (power for
bike, median-filtered pace for run), refined by provider laps. The provider-lap
research (#328) surfaced a gap (#334): **TCX is the only import format that
ingests no stream at all.** `parseArtifact` hard-codes `stream: null` for TCX
(`app/utils/activity-file-ingest.server.ts`) even though TCX trackpoints carry
`Time`, `HeartRateBpm`, `Cadence`, position, altitude, cumulative
`DistanceMeters`, and `LX` watts/speed — the same telemetry GPX and FIT already
adapt into a `RawStream`. So a TCX import is **0% detectable** by a stream-first
engine, and also carries no **Telemetry Overlay** and no stream-derived
Normalized Power (ADR 0024) — purely because a parser returns `null`, not
because the signal is absent.

The question (#334): parse TCX trackpoints into an Activity Stream, rely on TCX
`<Lap>` markers alone as the structure signal, or rule TCX detection out of V1 —
and, if we parse a stream, how far the ripple beyond detection should reach.

## Decision

**Parse TCX trackpoints into an Activity Stream, exactly as GPX and FIT do, and
treat that stream at full parity with every other stream source.**

- **Adapt trackpoints to `RawStream`.** `parseTcx` emits a `RawStream`
  (`{ time, heartrate?, power?, pace? }`) built from the `Track/Trackpoint`
  children it already walks: `heartrate` from `HeartRateBpm/Value`, `power` from
  the `LX` watts extension, `pace` from `LX` speed or cumulative
  `DistanceMeters` deltas. It rides through the existing provider-neutral
  enrichment (`enrichImportTelemetry` → `serializeStream(downsampleStream(raw))`,
  ADR 0020) — the same path GPX/FIT take. `null` trackpoints/pauses stay gaps.
  No stream-detection code is TCX-aware; TCX simply stops being the format that
  produces no signal.

- **Full parity for the ripple.** Because a TCX stream flows through the shared
  enrichment, TCX imports gain the **Telemetry Overlay** and stream-derived
  Normalized Power → Coggan TSS (ADR 0024) as a consequence, the same treatment
  GPX/FIT streams already get. This is deliberate: TCX is a first-class stream
  source, not a detection-only special case, so it should not have a second-class
  load/overlay story.

- **Backfill from `rawJson`, zero I/O.** TCX `rawJson` stores the **entire XML
  verbatim** (`activity-file-ingest.server.ts`), so existing TCX imports are
  fully healable by re-parsing stored bytes — no re-upload, no network. A one-shot
  boot-enqueued backfill job (the `np-tss-backfill` / `intervalsicu-telemetry-
  backfill` precedent, ADR 0024) re-parses each TCX import's `rawJson` into a
  stream and recomputes NP/TSS. Forward path handles new imports; the backfill
  heals history.

- **Laps stay a refinement, not a replacement.** TCX laps (with `TriggerMethod`)
  remain the same supplementary edge signal #328 defined for every format — they
  refine stream-first edges and rescue short/in-zone reps the stream is blind to.
  They are not TCX's *only* signal, and the lap-ingestion plumbing (#328) is a
  separate slice from this stream parser.

- **Discipline boundary unchanged.** ADR 0015 still holds — `Other`-sport TCX
  (including swims) collapses to `'other'`: no auto-match, no load, no detection.
  Only run/bike TCX gains a detectable stream, matching the map's V1 boundary.

## Considered options

- **Laps-only signal for TCX (leave `stream: null`).** Rejected: it forks the
  detector into a TCX-specific lap-only path divergent from the stream-first
  engine every other format feeds, throws away the per-trackpoint HR/power/pace
  actually in the file, and still leaves TCX without an overlay or stream-NP.
  Laps help *all* formats (#328); making them TCX's sole signal is a strictly
  worse, more complex outcome than parsing the stream that is already there.

- **Rule TCX detection out of V1.** Rejected: it concedes a whole ingest source
  to permanent no-detection (and no overlay, no stream-NP) when the fix is a
  near-mechanical parser change already implemented for GPX and FIT, with a
  free rawJson backfill. The honest "no structure" degradation (ADR 0008) is for
  activities with no signal — not for activities whose signal we decline to read.

- **Detection-first, defer the NP/TSS + overlay recompute.** Rejected as the
  plan: it accepts a lasting split where new TCX imports carry stream-NP and an
  overlay but historical ones don't, for no real saving — the same rawJson
  backfill that heals detection input heals NP/TSS in one pass. Parity is the
  cheaper end state.

## Consequences

- **Build owes** (handoff, not decided here): a `Trackpoint → RawStream` adapter
  in `parseTcx` (or a sibling in the ingest dispatch), the ingest dispatch
  passing that stream through `enrichImportTelemetry` instead of `null`, and a
  one-shot `tcx-stream-backfill` job that re-parses `rawJson` and recomputes
  NP/TSS for existing TCX imports.
- **Detection reach:** run/bike TCX imports become stream-first-detectable with
  no engine change — they enter the ADR 0032/0033 pipeline like any other stream
  import, honesty gate and all.
- **Load reach:** ADR 0024 stream-NP now applies to TCX; provider aggregates
  remain the fallback wherever the trackpoint power channel is absent.
- **Overlay reach:** the Telemetry Overlay now renders for TCX imports with a
  stream; imports whose trackpoints carry no plottable channel still show the
  honest Unavailable Metric state.
- **CONTEXT.md:** the **Activity Stream** term's "many imports have none"
  parenthetical is corrected — stream presence tracks recorded telemetry, not
  upload-vs-provider (GPX/FIT/TCX uploads with telemetry all carry one).
- No new domain term and no new **Session Source**; this is an ingest-parity
  decision, orthogonal to the detection model (#329) and the confidence gate
  (#331/#333).
