# Activity Stream: store downsampled, index-aligned per-sample telemetry

The Workout Detail View overlays a Recording's moment-to-moment effort against
the plan (PRD #135): power and heart rate over time, the planned **Intensity
Target** bands across the axis, paused stretches shown as gaps, and the planned
**Workout Shape** aligned beneath. The **Activity Import** stores only
_aggregate_ metrics today (avg/max power, HR, **TSS**) — there is no per-sample
telemetry to draw. Providers expose it: Strava returns activity _streams_ (≈1 Hz
arrays of `time`, `heartrate`, `watts`, …). We need somewhere to put it, in a
shape the overlay can render and the database can afford.

Per ADR 0008 the chart renders only from real telemetry or shows an
**Unavailable Metric** state — never a curve synthesized from aggregates.

## Decision

Introduce an **Activity Stream**: the per-sample telemetry for one **Activity
Import**, stored **downsampled and index-aligned**, **1:1** with its import and
cascade-deleted with it.

- **Storage format.** Channels are evenly-spaced, mutually index-aligned numeric
  arrays: an elapsed-seconds `timeSec` axis plus optional `power`, `heartrate`,
  and `pace`, persisted as JSON strings on the `ActivityStream` row alongside a
  recorded `resolutionSec` and `sampleCount`. A `null` entry marks a gap (a
  pause), so the chart breaks the line rather than interpolating through it. The
  read-time shape the UI consumes:

  ```ts
  type ActivityStream = {
  	resolutionSec: number
  	timeSec: number[] // elapsed seconds, evenly spaced
  	power?: Array<number | null> // watts, null across gaps
  	heartrate?: Array<number | null>
  	pace?: Array<number | null> // sec/km
  }
  ```

- **Downsampling policy.** Raw provider streams are downsampled at write time by
  one pure util (`downsampleStream`) before persistence: each channel is
  bucketed onto a fixed grid that is never finer than a `5s` resolution floor
  and never longer than a `~1000` sample cap (the coarser of the two wins). Each
  grid point is the mean of the raw samples in its bucket; a bucket with no real
  readings is `null`. The overlay does not need 1 Hz fidelity, so this is a
  deliberate fidelity-vs-storage trade-off that bounds both the row size and the
  render cost, regardless of how long the activity was.

- **One stream per import; many imports have none.** Manual uploads, older
  activities, and providers/activities without streams simply carry no Activity
  Stream; the overlay then shows the honest Unavailable Metric state.

- **Honesty (ADR 0008).** A corrupt or partial stream degrades to "no telemetry"
  rather than throwing or inventing data. The overlay draws the _plan_ (target
  bands, Workout Shape) by planned time and the _actual_ lines by recorded time;
  it never asserts a per-step verdict from automatic telemetry-to-step alignment
  (out of scope per PRD #135).

## Considered options

- **Store raw 1 Hz streams verbatim.** Rejected — an hour's ride is ~3,600
  samples per channel and a long ride many times that; multiplied across an
  athlete's history and several channels this bloats the database and slows both
  the query and the render, for fidelity the overlay cannot even display.
- **Downsample lazily at read time from a stored raw blob.** Rejected — still
  pays the storage cost of the raw blob, and moves CPU onto every page view
  instead of paying it once at ingest.
- **Derive a curve from the aggregates we already have.** Rejected outright by
  ADR 0008: a fabricated line is worse than an honest "telemetry not available".
- **One wide table column per sample / a separate Sample row per reading.**
  Rejected — SQLite has no array type and a row-per-sample table reintroduces
  the unbounded-size problem with far more overhead. JSON channel arrays (the
  same pattern as `phaseBarsJson` / `rawJson`) are the simplest bounded fit.

## Consequences

- New `ActivityStream` model: `resolutionSec`, `sampleCount`, `timeSec`, and the
  optional `power` / `heartrate` / `pace` JSON columns, with a unique
  `activityImportId` and `onDelete: Cascade`. ADR 0012 still holds: disconnect
  removes only non-promoted Activity Imports (cascading their streams); a
  promoted **Recording**'s stream rides along with it and survives.
- `downsampleStream` is pure and provider-agnostic — ingestion (Strava first,
  #139/#140) adapts its wire streams to a `RawStream` and persists
  `serializeStream(downsampleStream(raw))`. This ADR and #138 establish the
  model, the util, the read model, and the overlay; ingestion lights up the live
  and backfill paths.
- The session-detail read model (`getSessionByIdForUser` / `SessionDetail`)
  returns the Recording's **parsed** stream when present, `null` otherwise, so
  the route never touches stored JSON.
- Recomputing TSS / Normalized Power from streams stays out of scope; provider
  aggregates remain the source for load math. _Superseded by ADR 0024 (#174):
  the power channel now feeds true Normalized Power for Coggan TSS; aggregates
  remain the source wherever a stream is absent._
