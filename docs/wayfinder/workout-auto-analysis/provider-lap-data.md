# Provider lap/interval data as a supplementary signal for workout-structure detection

Research for wayfinder ticket #328.

## Question

Is the stored Activity Stream (ADR 0020: ≥5s resolution, ≤1000 samples,
power/HR/pace, `null` = pause) sufficient input for interval-edge detection in
a rule-based workout-structure detector, or should we also ingest provider
lap/interval markers?

## Recommendation

**Stream + laps.** The downsampled stream alone is sufficient for the canonical
power-based case (reps ≥ ~1 min on activities ≤ ~2 h) but fails outright or
degrades badly in four real segments of the corpus: HR-only runs (HR lag),
micro-intervals on long activities (grid coarsens to 8–19 s), TCX uploads
(**no stream is ingested at all today**), and pause-vs-gap ambiguity. Lap
markers rescue exactly those cases, and most of the data is either already
stored or free to obtain:

- **Ingest laps from all four sources**, normalized to one provider-neutral
  shape (suggested: `{ startSec, durationSec, trigger, avgPower?, avgHr?,
  distanceM? }`), stored as a nullable `lapsJson` column on `ActivityImport`
  (same JSON-column pattern as `phaseBarsJson` / the `ActivityStream` channels
  — ADR 0020 considered-options rationale applies).
- **Fetched when:** at ingest, alongside the existing per-activity work — FIT
  and TCX laps are parse-only (zero extra I/O); Strava webhook imports already
  hold laps inside `rawJson`; Intervals.icu costs one extra API call per
  activity (`GET /activity/{id}/intervals`), trivial against its 5,000/day
  budget; Strava list-sync/backfill imports cost one extra call per activity
  (`GET /activities/{id}/laps`) against the tightest budget of the four — make
  this call lazy/best-effort or piggyback on the detail fetch.
- **Use laps as hints, not ground truth**: weight by the per-format trigger
  metadata (workout/ERG laps ≈ ground truth; manual laps = strong hint;
  distance/time auto-laps = noise to be filtered by a uniform-distance
  heuristic where the trigger field is absent, e.g. Strava).
- The detector should remain stream-first; laps refine edges and adjudicate the
  ambiguous cases. This keeps the ADR 0008 honesty rule intact: structure is
  asserted only where a real signal (stream and/or laps) supports it.

---

## Per-source findings

### Strava API

- **What exists.** `GET /activities/{id}/laps` returns an array of Lap objects:
  `elapsed_time`, `moving_time`, `start_date`, `start_date_local`, `distance`,
  `start_index` / `end_index` (indices into the raw 1 Hz stream), `average_speed`,
  `average_cadence`, `average_watts`, `device_watts`, `lap_index`, `split`,
  `total_elevation_gain`. The **DetailedActivity** payload from
  `GET /activities/{id}` also embeds a `laps` array directly, alongside
  `splits_metric` / `splits_standard` — no separate call needed when the detail
  endpoint is already being hit. **No lap-trigger field**: Strava does not say
  whether a lap was manual or auto (heuristic needed — see Trustworthiness).
- **Already in rawJson?** Split answer. Webhook-created/updated imports store
  the *DetailedActivity* verbatim (`fetchStravaActivityById` →
  `mapActivityToImportInput`, whose `rawJson: JSON.stringify(activity)` keeps
  every field via `.passthrough()`) — so **laps are already stored** for those
  imports (`app/integrations/strava/webhook.server.ts`,
  `app/integrations/strava/ingest.server.ts:84`). Manual-sync and backfill
  imports come from `GET /athlete/activities` (*SummaryActivity*), which has
  **no laps** — their `rawJson` lacks them.
- **Extra cost.** One `GET /activities/{id}/laps` (or detail refetch) per
  list-synced activity. Strava's documented defaults are **200 requests / 15 min
  and 2,000 / day overall; 100 / 15 min and 1,000 / day for non-upload (read)
  requests**. Note: the repo's limiter constant assumes 600/15 min
  (`app/integrations/strava/rate-limit.ts:59`, citing ADR 0013) — that reflects
  an elevated/older allotment and should be re-verified against the app's actual
  quota before adding a per-activity lap fetch to backfill.

### Intervals.icu API

- **What exists.** Verified against the live OpenAPI spec
  (`https://intervals.icu/api/v1/docs`, the spec behind
  intervals.icu/api-docs.html): `GET /api/v1/activity/{id}/intervals` returns
  `IntervalsDTO { id, analyzed, icu_intervals, icu_groups }`. Each `Interval`
  carries `start_index` / `end_index` (indices into the raw ~1 Hz stream),
  `start_time` / `end_time`, `type` (**enum `WORK` | `RECOVERY`**), `group_id`,
  `label`, plus rich per-interval aggregates (`average_watts`, `max_watts`,
  `intensity`, `training_load`, `zone`, `average_heartrate`, `average_cadence`,
  `average_speed`, `gap`, …). `icu_groups` groups repeated efforts (i.e. it has
  already recognized "4× …" set structure). The same data rides along on
  `GET /api/v1/activity/{id}?intervals=true`. Crucially, **intervals.icu already
  runs its own interval detection** (power-based auto-detection, or lap-based
  per the athlete's per-activity setting), and athletes can hand-edit intervals
  (`icu_intervals_edited`, `lock_intervals` on the Activity schema) — so this is
  the highest-quality external structure signal available to us, effectively a
  reference implementation's output.
- **Already in rawJson?** No. `rawJson` snapshots the *list* payload
  (`app/integrations/intervalsicu/ingest.server.ts:94`), which includes only
  summary fields like `interval_summary` and `icu_lap_count` (useful cheap
  signals: "does this activity have intervals at all?"), not the interval
  bodies.
- **Extra cost.** One API call per activity. Budget: **5,000 requests/day and
  2,500 per rolling 15 min per API key** — the existing courtesy pacer
  (`app/integrations/intervalsicu/pacer.ts`) already handles this; the
  telemetry backfill precedent shows per-activity fetch loops are fine here.

### FIT files (Garmin FIT SDK)

- **What exists.** A FIT Activity file contains session (global mesg #18), lap
  (**#19**) and record (#20) messages. The Lap message carries `timestamp`,
  `start_time`, `total_elapsed_time`, `total_timer_time`, `avg_heart_rate`,
  `avg_power`, distance, and — uniquely among our sources — **`lap_trigger`**:
  `manual(0)`, `time(1)`, `distance(2)`, `position_start(3)`, `position_lap(4)`,
  `position_waypoint(5)`, `position_marked(6)`, `session_end(7)`,
  `fitness_equipment(8)`. Devices executing a structured/ERG workout emit one
  lap per workout step, so those laps are near-ground-truth structure.
- **Already available in the parser?** Yes, unused. The repo decodes with
  `@garmin/fitsdk` (`Decoder(stream).read()` → `messages`), and reads
  `messages.sessionMesgs` and `messages.recordMesgs` only
  (`app/utils/fit-parser.server.ts:64-121`); `messages.lapMesgs` is sitting in
  the same decoded object, **zero extra I/O or dependency** to surface it.
- **Already in rawJson?** **No, and not recoverable.** The binary payload is not
  retained; `rawJson` for FIT is a JSON snapshot of the decoded *summary* only
  ("Raw-file retention is a later slice" —
  `app/utils/activity-file-ingest.server.ts:85-91`). Laps for **existing** FIT
  imports are therefore lost unless the athlete re-uploads. Forward-only.

### TCX uploads

- **What exists.** The TCX schema (`TrainingCenterDatabasev2.xsd`) nests
  everything under `ActivityLap_t`: required `StartTime` attribute,
  `TotalTimeSeconds`, `DistanceMeters`, required **`TriggerMethod`**
  (enum `Manual | Distance | Location | Time | HeartRate`), optional
  `AverageHeartRateBpm` / `MaximumHeartRateBpm`, `Cadence`, power via the `LX`
  extension, and the trackpoints themselves inside `Track` children.
- **Already parsed / in rawJson?** Both, mostly. The parser already walks `Lap`
  elements for aggregates (`app/utils/tcx-parser.server.ts:19-32, 84-133`) —
  it just doesn't read `TriggerMethod` or emit per-lap records. And `rawJson`
  for TCX stores the **entire XML file content verbatim**
  (`activity-file-ingest.server.ts:106-114`), so lap data for existing TCX
  imports is **fully backfillable from the database, no I/O**.
- **The bigger TCX finding:** `parseTcx` returns no stream at all — the ingest
  dispatch hard-codes `stream: null` for TCX
  (`activity-file-ingest.server.ts:106-114`) even though trackpoints (with HR,
  time, position, LX watts) are in the file. **For TCX imports, laps aren't a
  supplementary signal — today they'd be the only structure signal.** (Ticket
  #328 should probably also note "parse TCX trackpoints into a RawStream" as an
  adjacent gap.)

### GPX (for completeness)

GPX has no lap concept (only `<trkseg>` splits, which mark recording gaps, not
athlete intent). Stream-only detection is the only option there.

---

## Stream sufficiency analysis (numbers from the actual code)

Downsampling (`app/utils/activity-stream.ts:64-126`):
`res = max(5, ceil(span / 999))`, bucket-mean per grid point, `null` buckets
preserved as gaps. So:

| Activity span | Stored resolution | Samples |
|---|---|---|
| ≤ 83 min (4,995 s) | 5 s (floor binds) | ≤ 1000 |
| 90 min | 6 s | ~900 |
| 2 h | 8 s | ~900 |
| 3 h | 11 s | ~982 |
| 5 h | 19 s | ~948 |

(The ticket's "60-min ride ≈ 3.6 s" premise is wrong in the flattering
direction: the 5 s **floor** binds until ~83 min, so short activities are never
finer than 5 s; a 3 h ride is 11 s, not 10.8 s, because `ceil`.)

Edge behaviour: bucket-**mean** downsampling smears each edge across exactly one
bucket (the bucket containing the transition averages work + recovery watts),
so a step edge is locatable to within about ±1 sample, i.e. **±5 s typical,
±11–19 s on long rides**.

Per workout archetype:

- **4×4 min Z5 / 3 min recovery (power or pace):** 240 s reps = 48 samples at
  5 s, 22 at 11 s. Edge error 5–11 s ≈ 2–5% of rep duration. **Stream alone is
  comfortably sufficient.**
- **30/30 s micro-intervals (power):** at 5 s resolution a rep is 6 samples with
  1 smeared edge sample per boundary (~17% of the rep is transition) —
  detectable but already noisy. On a 2–3 h ride (8–11 s grid) a 30 s rep is
  ~3 samples with both edges smeared — **detection unreliable**; 15/15s is
  invisible. Laps (ERG/workout-triggered FIT laps, intervals.icu detected
  intervals) rescue this fully.
- **Tempo run, HR-only (no power/pace trust):** HR responds with a 20–40 s
  physiological time constant, so even at perfect resolution the *HR* edge lags
  the *effort* edge by ~30 s and ramps rather than steps. Rule-based
  edge-finding on HR alone systematically mislocates edges and misses reps
  < ~2 min. This is the common case for runners without pace confidence
  (treadmill, GPS-poor). **Laps (manual or workout-triggered) are the only
  precise edge source here.**
- **Pauses vs dropouts:** `null` means *either* a pause *or* a sensor dropout
  (`downsampleStream` treats both as empty buckets). A detector can misread a
  mid-interval power dropout as a recovery. Laps disambiguate (lap boundaries
  don't move for dropouts).
- **TCX imports:** no stream exists at all (see above) — 0% detectable without
  laps or a parser fix.
- One alignment caveat for consumers: provider lap `start_index`/`end_index`
  values index the **raw ~1 Hz stream**, not our downsampled grid — normalize
  laps to elapsed seconds (`startSec`) at ingest, and note that the stored
  `timeSec` axis inherits the provider's time channel semantics (Strava/
  Intervals.icu `time` skips pauses).

**Bottom line:** stream-only is sufficient for the majority archetype
(≥1 min power/pace reps, ≤2 h), insufficient for micro-intervals on long
activities, HR-only workouts, and TCX — which is precisely where a rule-based
detector would otherwise return its least honest answers.

---

## Trustworthiness of athlete laps

| Signal | Trust for structure | How to identify |
|---|---|---|
| Workout/ERG step laps (Garmin structured workout, trainer apps) | Near ground truth — one lap per planned step | FIT `lap_trigger = fitness_equipment` (or a lap sequence with alternating durations); Zwift/TrainerRoad FIT files emit these |
| Manual lap button | Strong hint — athletes lap intervals, but inconsistently (may skip recoveries, mis-press) | FIT `lap_trigger = manual`; TCX `TriggerMethod = Manual` |
| Auto-lap by distance (every km/mi) | **Noise** for structure detection — must be filtered | FIT `lap_trigger = distance`; TCX `TriggerMethod = Distance`; heuristic where no trigger exists: all laps ≈ uniform round distance (1,000 m / 1,609 m) |
| Auto-lap by time / position / HR | Noise | FIT `time` / `position_*`; TCX `Time` / `Location` / `HeartRate` |
| `session_end` final lap | Structural filler, not an interval | FIT `lap_trigger = session_end` |
| Strava laps | Mixed — **no trigger field**; a single whole-activity lap means "no laps pressed"; uniform-distance heuristic needed | Lap count = 1 → ignore; uniform `distance` → auto-lap |
| Intervals.icu `icu_intervals` | Highest trust: platform-detected (power) or lap-derived per athlete setting, athlete-editable, pre-typed `WORK`/`RECOVERY`, pre-grouped (`icu_groups`) | Take as-is; `analyzed` flag on the DTO |

---

## Ingestion cost summary

| Source | Extra API calls | Parse change | Already stored? | Backfill for existing imports |
|---|---|---|---|---|
| FIT upload | 0 | Read `messages.lapMesgs` (same decode) | No (binary not retained) | **Impossible** without re-upload — forward-only |
| TCX upload | 0 | Read `TriggerMethod` + per-lap fields (Lap already parsed) | **Yes** — full XML in `rawJson` | Free: re-parse `rawJson` in a job |
| Strava (webhook path) | 0 | Extract `laps` from DetailedActivity | **Yes** — in `rawJson` | Free: re-parse `rawJson` |
| Strava (sync/backfill path) | 1 per activity (`/activities/{id}/laps`) | New fetch + zod schema | No (SummaryActivity) | Rate-limited: ≤100–200 req/15 min, ≤1,000–2,000/day default — paced job, potentially days for a large history; do lazily |
| Intervals.icu | 1 per activity (`/activity/{id}/intervals`) | New fetch + zod schema | No (list payload only; `interval_summary`/`icu_lap_count` hints are stored) | Comfortable: 5,000/day per key; mirrors the existing telemetry backfill |

- **Schema change:** one nullable JSON column (`ActivityImport.lapsJson`)
  following the established `phaseBarsJson` pattern (`prisma/schema.prisma:441`)
  — no new table, no migration risk. (A separate `ActivityLaps` 1:1 table à la
  `ActivityStream` also fits the house style if the column feels too wide.)
- **Backfill mechanism:** the one-shot boot-enqueued Job Queue pattern is
  proven twice — `np-tss-backfill` (ADR 0024,
  `app/utils/load/np-tss-backfill.server.ts`) and
  `intervalsicu-telemetry-backfill`
  (`app/integrations/intervalsicu/telemetry-backfill.server.ts`): the job row
  itself is the "already ran" marker; per-item failures never abort the run.
  A `laps-backfill` job can heal TCX + Strava-webhook imports **from rawJson
  alone with zero API calls**, and optionally fetch Intervals.icu intervals;
  Strava list-synced history is the only expensive/lossy slice.
- **ADR constraints checked:** ADR 0008/0020 honesty — laps are real recorded
  data, so storing and using them is compatible; absence of laps must degrade
  to "no structure hint", never a fabricated one. ADR 0014 — each provider
  adapts its own lap wire format to the neutral shape inside its integration
  folder. ADR 0015 — skip `'other'`-discipline imports, matching stream ingest.
  ADR 0012 — a JSON column on `ActivityImport` (or a cascade-deleted 1:1 row)
  inherits the existing disconnect/promotion semantics for free.

---

## Sources

Codebase (all paths absolute from repo root `/home/user/trainm8`):

- `app/utils/activity-stream.ts` — downsampling policy (`res = max(5, ceil(span/999))`, bucket-mean, null gaps), serialization
- `app/utils/activity-telemetry.server.ts` — provider-neutral stream persistence
- `app/integrations/strava/ingest.server.ts` — Strava list fetch, `rawJson` snapshot, streams fetch (`time,heartrate,watts,velocity_smooth`)
- `app/integrations/strava/webhook.server.ts` — webhook path stores DetailedActivity as `rawJson`
- `app/integrations/strava/rate-limit.ts` — repo's 600/15 min limiter constant
- `app/integrations/intervalsicu/ingest.server.ts`, `app/integrations/intervalsicu/types.ts` — list/streams endpoints, `rawJson` snapshot, pacer
- `app/integrations/intervalsicu/telemetry-backfill.server.ts` and `app/utils/load/np-tss-backfill.server.ts` (via `app/utils/jobs/handlers.server.ts`) — one-shot backfill job precedent
- `app/utils/fit-parser.server.ts` — `@garmin/fitsdk` decode; `sessionMesgs`/`recordMesgs` read, `lapMesgs` unused
- `app/utils/tcx-parser.server.ts` — Lap parsing (no TriggerMethod, no stream)
- `app/utils/activity-file-ingest.server.ts` — rawJson retention per format; TCX `stream: null`
- `prisma/schema.prisma` — `ActivityImport`, `ActivityStream`, `Job` models
- `docs/adr/0008-tss-triad-with-hr-first.md`, `0013-strava-trigger-model.md`, `0020-activity-stream-downsampled-telemetry.md`, `0024-normalized-power-from-activity-stream.md`; `CONTEXT.md` (Unavailable Metric invariants)

External (primary sources):

- Strava API reference (Laps endpoint, Lap object, DetailedActivity with embedded `laps`): https://developers.strava.com/docs/reference/
- Strava rate limits (200/15 min + 2,000/day overall; 100/15 min + 1,000/day non-upload, defaults): https://developers.strava.com/docs/rate-limits/
- Intervals.icu OpenAPI spec (fetched live 2026-07-15; `GET /api/v1/activity/{id}/intervals` → `IntervalsDTO { icu_intervals, icu_groups }`; `Interval` fields incl. `type: WORK|RECOVERY`, `start_index`/`end_index`, `start_time`; Activity `interval_summary`, `icu_lap_count`, `icu_intervals_edited`, `lock_intervals`): https://intervals.icu/api/v1/docs (spec-url of https://intervals.icu/api-docs.html)
- Intervals.icu API access guide (auth = HTTP basic `API_KEY:<key>`; `?intervals=true`; rate limit 5,000/day, 2,500 per rolling 15 min): https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- Intervals.icu lap/interval-detection behaviour (auto-detection is power-based; lap-based mode; "keep all laps"): https://forum.intervals.icu/t/laps-and-interval-detection-updates/10779
- Garmin FIT SDK — Activity file type (session/lap/record messages): https://developer.garmin.com/fit/file-types/activity/
- FIT `lap_trigger` enum values (per FIT SDK Profile.xlsx, mirrored in Suunto's FIT description and the tormoder/fit generated profile): https://apizone.suunto.com/fit-description , https://pkg.go.dev/github.com/tormoder/fit
- TCX schema (`ActivityLap_t`, `TriggerMethod_t` = Manual | Distance | Location | Time | HeartRate): https://www8.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd
