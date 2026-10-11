# Watch data in trainm8: today's integrations, the FIT path, and leaving Intervals.icu

The repo side of getting training data straight from athletes' watches: what
trainm8 ingests today and how, how far the existing FIT pipeline carries a
direct vendor integration, how one activity keeps one identity across providers,
how to leave Intervals.icu without losing a Recording, and how planned workouts
reach the watch.

> **Research note · 2026-10-11.** Written from **primary sources**: this
> repository at commit `33c10f5` (every repo claim is a `file:line` there), the
> Intervals.icu OpenAPI document and its developer's own forum posts (read
> through Discourse's JSON), and Garmin's FIT SDK as installed (`@garmin/fitsdk`
> 21.208.0). A verification pass the same day re-read the cited lines and
> re-fetched the Intervals.icu sources behind 25 load-bearing claims: 21 held, 4
> were corrected in place (§9), and 2 cannot be checked without a live key. It
> also found three defects the inputs had missed: §6.5, and the ADR 0014 and ADR
> 0026 contradictions in §6.4. Not legal advice.
>
> **Sibling documents.** [`watch-data-sources.md`](watch-data-sources.md) is the
> vendor landscape: Garmin, Suunto, Polar, COROS, Wahoo, aggregators and the
> phone, with each one's AI and MCP terms.
> [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) holds the Strava gate
> (§6.1) that provenance must now feed. [`agent-native.md`](agent-native.md),
> [`agent-layer-trainm8-surface.md`](agent-layer-trainm8-surface.md) and
> [`agent-layer-building-blocks.md`](agent-layer-building-blocks.md) cover the
> agent layer.

**How citations read.** Paths are from the repo root, except that bare route
modules sit under `app/routes/`. A bare `:N` points into the file named last.
`[KEY]` is a web source in the table at the end. _(inference)_ marks this note's
reasoning.

---

## TL;DR

1. **Two provider folders plus file upload.** Intervals.icu (personal API key,
   polling only) is the one source the hub offers. Strava is fully wired (OAuth,
   webhook, four job kinds) but hidden from new athletes
   (`settings/integrations.tsx:132-143`). Upload takes FIT, TCX and GPX, zipped
   or not. A new provider costs about 1,500–2,000 source lines today.
2. **The bridge's Garmin supply may stop.** On 2026-10-09 the Intervals.icu
   developer wrote that it is "likely that we will have to block access to
   Garmin data via the API soon" [ICU-752]. Intervals.icu is trainm8's only
   Garmin source.
3. **A FIT-first path exists but stops short.** `parseFit` feeds the same
   pipeline every provider uses, but it hard-codes `externalProvider: 'manual'`,
   reads only the first session, ignores laps, vendor fields and `file_id`, and
   discards the bytes (`app/utils/activity-file-ingest.server.ts:89-96,182-193`,
   `app/utils/fit-parser.server.ts:65`).
4. **No cross-provider identity.** The key is `(externalProvider, externalId)`
   (`prisma/schema.prisma:1668`), so a direct Garmin or Suunto source beside
   Intervals.icu duplicates every overlapping session, and auto-save turns each
   duplicate into a session (ADR 0049). Use the FIT `file_id` as the canonical
   key, a fuzzy match as fallback, and an alias table rather than a second row.
5. **Leaving Intervals.icu loses nothing already promoted.** Disconnect deletes
   only unpromoted imports, and under auto-save there are none
   (`app/utils/account-connection.server.ts:148-174`). Harvest the original FIT
   per activity (`GET /activity/{id}/file`) while Garmin is still served.
6. **Workout export: FIT now, vendor APIs later.** trainm8 exports nothing
   today. The installed SDK ships a FIT `Encoder`; Intervals.icu's calendar
   accepts FIT workouts and pushes about a week ahead to Garmin, Suunto, COROS
   and Wahoo [ICU-UPWO][ICU-PUSH]. Each vendor API needs its own serializer.
7. **Findings that apply today:** no Garmin attribution anywhere, though
   Intervals.icu's terms require it (verified); Strava stubs from Intervals.icu
   probably become 0-second "other" sessions (inferred from forum posts); Strava
   wired but hidden (verified); stale ADR text (verified); and a dedupe key that
   ignores the athlete (verified).

## 1. The integrations today

### 1.1 Inventory

| Source                    | Code                                                                                                                  | Auth                                                                                                                                               | How activities arrive                                                                                                                    | UI today                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Strava                    | `app/integrations/strava/` (11 source files); `integrations.strava.{connect,callback,sync}.tsx`, `webhook.strava.tsx` | OAuth2, `activity:read_all` (`app/integrations/strava/types.ts:13`); ~6 h tokens, rotating refresh (`client.server.ts:12-16`)                      | Webhook → job (`webhook.strava.tsx:42-62`), manual sync, daily sweep, backfill (ADR 0013)                                                | Never offered; a card appears only for an existing connection (`settings/integrations.tsx:132-134,173-175`) |
| Intervals.icu             | `app/integrations/intervalsicu/` (12 source files); `integrations.intervalsicu.{connect,sync}.tsx`                    | Personal key over HTTP Basic, user `API_KEY` (`app/integrations/intervalsicu/client.server.ts:39-41`); checked on connect (`connect.server.ts:27`) | **Polling only:** backfill on connect (`link.server.ts:53-56`), "Sync now" (`sync.server.ts:39`), daily sweep (`reconcile.server.ts:33`) | The one source offered (`settings/integrations.tsx:139-147`)                                                |
| File upload, share target | `app/utils/activity-file-ingest.server.ts`; `imports.upload.tsx`, `imports.share-target.tsx:14-22`                    | None; `externalProvider: 'manual'`                                                                                                                 | Manual: `.fit`, `.fit.gz`, `.tcx`, `.gpx`, `.zip`, `.gz`, nested zips (`activity-file-ingest.server.ts:243-256`)                         | Live (`app/integrations/directory.ts:48-57`)                                                                |
| Garmin, Suunto            | Directory entries only (`app/integrations/directory.ts:67-84`)                                                        | n/a                                                                                                                                                | n/a                                                                                                                                      | Grey "coming soon" cards; copy says Intervals.icu already has the data (`app/utils/labels.ts:4942-4953`)    |
| Polar                     | Only in the `Provider` union (`app/utils/account-connection.server.ts:46`)                                            | n/a                                                                                                                                                | n/a                                                                                                                                      | Not shown                                                                                                   |

### 1.2 The shared seam (ADR 0014: no interface, one output shape)

- **One output shape:** `ActivityImportInputSchema`
  (`app/utils/activity-import.server.ts:80-101`). `externalProvider` is
  `z.enum(['manual','strava','intervalsicu','garmin'])` (`:81`); Suunto, Polar,
  COROS and Wahoo are missing, and the `Provider` union has `polar` but not
  `suunto` (`app/utils/account-connection.server.ts:46`).
- **One insert choke point:** `createActivityImport`
  (`activity-import.server.ts:132-152`) publishes to the live stream.
- **One landing:** `autoSaveImport` (`:429-461`) links to the one planned
  session that fits, else stands up a recording-only session; `other` imports
  are saved too (ADR 0049).
- **One telemetry path:** `enrichImportTelemetry`
  (`app/utils/activity-telemetry.server.ts:181`) and `persistActivityLaps`
  (`:88`) over a provider-neutral `RawStream`
  (`app/utils/activity-stream.ts:33`), downsampled to a 5 s floor and 1,000
  samples (`:45-46`).
- **Shared plumbing:** the SQLite job registry
  (`app/utils/jobs/handlers.server.ts:61`); the sweep, a `switch` on provider
  with a 48 h overlap (`app/integrations/reconcile-sweep.server.ts:21,33-42`);
  the Backfill Window of 50 sessions, 42-day floor and 365-day cap
  (`app/integrations/backfill-window.ts:22,30,36`); the fan-out "Sync now"
  (`integrations.sync.tsx:25-40`).
- **The load model is provider-agnostic.** No non-test file in `app/utils/load/`
  names a provider; TSS comes from import metrics and streams
  (`app/utils/load/compute.ts:65`). Each mapper fills `powerWeightedAvg` from
  its own field: Strava `weighted_average_watts`
  (`app/integrations/strava/ingest.server.ts:79`), Intervals.icu
  `icu_weighted_avg_watts` (`intervalsicu/ingest.server.ts:91-94`), FIT
  `normalizedPower` (`app/utils/fit-parser.server.ts:110`).
- **Source-side rules:** a mirror follows its source; a Recording the athlete
  built on is frozen (`isAutoSaveMirror`, `activity-import.server.ts:167-185`).

### 1.3 What is stored

- `ActivityImport` (`prisma/schema.prisma:1622-1670`): summary metrics,
  `lapsJson` (`:1644`), `rawJson` "full provider payload, verbatim" (`:1645`),
  the TSS triad (`:1656-1658`) and `promotedSessionId` (`:1646`). There is no
  column for the origin platform or the device.
- Intervals.icu keeps the whole list body, because its schema is
  `.passthrough()` (`app/integrations/intervalsicu/types.ts:100-121`,
  `ingest.server.ts:102-105`). `source`, `device_name` and `external_id` (all in
  the OpenAPI `Activity` schema [ICU-OAS]) are therefore already stored inside
  `rawJson`. Its load numbers are deliberately not imported (`:53-60`).
- FIT uploads keep only the decoded summary: "Raw-file retention is a later
  slice." (`activity-file-ingest.server.ts:89-96`). GPX and TCX keep the full
  XML (`:107,123`).
- `ActivityStream` and `WorkoutDetection` are 1:1 with an import and cascade
  with it (`prisma/schema.prisma:1683-1695,1704-1724`). A Recording is
  `WorkoutSession.recordingId` (`:1076-1077`).
- `AccountConnection` (`:1892-1917`): one per athlete and provider (`:1915`);
  the key sits in plain text in `accessToken` (`:1896`); `lastSyncedAt` is the
  watermark (`:1901`).

### 1.4 What a new provider costs

|                                       | Source lines | Tests | Routes (+ tests) |
| ------------------------------------- | -----------: | ----: | ---------------: |
| Intervals.icu (API key, polling)      |        1,512 | 1,898 |      121 (+ 339) |
| Strava (OAuth, webhook, rate limiter) |        2,027 | 2,421 |      256 (+ 596) |

A direct Garmin or Suunto integration has Strava's shape (OAuth plus push), so
expect about 2,000 source lines and 2,500 test lines, less whatever a shared FIT
path absorbs. Outside its folder a provider also touches the enum and union
above, the sweep `switch`, the sync fan-out, the job registry, the hub loader
and cards (`settings/integrations.tsx:51-90`), the labels
(`app/utils/labels.ts:4930-4954`), env secrets (`app/utils/env.server.ts:34-49`)
and a webhook route. ADR 0014's rule of three moves repeated orchestration to
`app/integrations/shared/` with the third provider
(`docs/adr/0014-integrations-per-folder-no-interface.md:64-68`).

## 2. The FIT-first pipeline and its gaps

**What exists.** `ingestActivityFile` runs parse → `createActivityImport` →
`autoSaveImport` → `enrichImportTelemetry`, the same pipeline as the API
providers (`activity-file-ingest.server.ts:161-216`). `parseFit`
(`@garmin/fitsdk` ^21.208.0, `package.json:54`) decodes with an integrity check,
takes the summary from the first session and turns record messages into HR,
power and pace (`app/utils/fit-parser.server.ts:54-160`). Every vendor in the
sibling doc serves one FIT per activity.

**The adapter it allows** _(inference)_: a vendor folder reduced to OAuth and
token life, a trigger (webhook or poll) that yields
`(vendorActivityId, fitUrl)`, and one call into a shared
`ingestFit(athleteId, bytes, { externalProvider, externalId })`. The device's
own session summary becomes the single source of every metric, which suits
"never fabricate a metric".

| Gap                         | Today                                                                                                                                                                    | Fix                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider and activity id    | Hard-coded `'manual'` and a content hash (`activity-file-ingest.server.ts:182-193`); the enum lacks every new vendor (`activity-import.server.ts:81`)                    | Take `{ externalProvider, externalId }` as options; widen the enum and union                                                                                                                                     |
| Laps                        | No `lapMesgs` read; Intervals.icu and Strava fill `lapsJson`, FIT does not                                                                                               | Map FIT laps to `Lap { startSec, endSec }` (`app/utils/structure-detection/types.ts:53`) and persist them before detection is enqueued, as `persistActivityLaps` requires (`activity-telemetry.server.ts:84-88`) |
| Multi-session (multisport)  | The summary comes from `sessionMesgs[0]` (`fit-parser.server.ts:65`) but the stream from every record in the file (`:121`), so a triathlon's summary and stream disagree | One import per session, or a parent with legs; records split by session time range                                                                                                                               |
| Vendor and developer fields | Nothing beyond `session` and `record`: no `file_id`, no device info, no Suunto `suuntoplus_plugin_owner_id` / `suuntoplus_plugin_external_id` [SU8]                      | Read `file_id` (the canonical key, §3), the device product (for "Garmin [device model]"), and the Suunto guide arrays (plan→actual, §5)                                                                          |
| Raw bytes                   | Discarded (`activity-file-ingest.server.ts:89-96`)                                                                                                                       | Keep the original file, as TCX keeps its XML, so laps and channels added later can be re-derived                                                                                                                 |
| Channels                    | HR, power, pace only (`fit-parser.server.ts:139-157`); `ActivityStream` has no cadence, altitude or distance (`prisma/schema.prisma:1683-1695`)                          | Add channels when a consumer needs them                                                                                                                                                                          |
| Compressed timestamps       | The JS SDK throws "compressed timestamp messages are not currently supported" (`node_modules/@garmin/fitsdk/src/decoder.js:413-414`)                                     | A fixture and a fallback decoder (`docs/research/interval-detection-and-data-platform.md:595-603`)                                                                                                               |
| Vendor filtering            | Garmin's API FIT drops workout steps, by design [ICU-FIT]                                                                                                                | Do not rely on Garmin's FIT for plan→actual; use trainm8's own identifiers (§5)                                                                                                                                  |

Not FIT-common: HealthKit and Health Connect deliver records, not files, so a
native companion needs its own mapper (sibling doc §4).

## 3. Cross-provider identity and dedupe

**Today.** One run gets an unrelated key per source: `intervalsicu:i55751783`, a
future `garmin:<id>`, `manual:<hash>`. Nothing links them. The hub warns only
about Strava with Intervals.icu (`settings/integrations.tsx:82-88`); upload and
Intervals.icu can already duplicate each other unguarded. ADR 0049 accepts that
"A junk or duplicate activity from a provider now becomes a session immediately"
(`docs/adr/0049-every-import-auto-saves-there-is-no-inbox.md:139-141`).

**Proposal** _(inference)_:

1. **Provenance on every import:** `originPlatform` (for example
   `GARMIN_CONNECT`), `deviceName` and `fitFileKey`. Intervals.icu rows backfill
   from `rawJson` with no API calls (§1.3). One change feeds three needs: Garmin
   attribution (§6.1), the MCP terms gate, which the MCP note now keys on the
   origin platform
   ([`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric)),
   and dedupe.
2. **Canonical key when a FIT exists:** `file_id` with `manufacturer`,
   `serial_number` and `time_created`. `type`, `manufacturer` and `time created`
   are required; `serial number` is optional [FIT-FILEID]. The spec promises no
   uniqueness, so treat it as strong, not certain.
3. **Fuzzy fallback:** same athlete, same discipline family, start within about
   ±120 s, duration within about ±5%. An exact hash fails across sources:
   Intervals.icu uses `moving_time`
   (`app/integrations/intervalsicu/ingest.server.ts:70`) and FIT timer time
   (`fit-parser.server.ts:75-82`).
4. **An alias, not a second row.** ADR 0049 forbids an unpromoted import ("no
   path is allowed to create one",
   `docs/adr/0049-every-import-auto-saves-there-is-no-inbox.md:89-90`), so a
   hidden duplicate row is not an option. On a match, record the newcomer's
   `(provider, externalId)` as an alias of the existing import, which also stops
   the next sync re-importing it. If the existing import is still an auto-save
   mirror, it may be refreshed from the richer source
   (`updateActivityImportSnapshot`, `activity-import.server.ts:193-214`); a
   Recording the athlete built on stays frozen (ADR 0012, ADR 0049).
5. **Check before `createActivityImport`** (`:132`), so auto-save never sees the
   duplicate. Generalise the hub notice to "two or more active sources".

## 4. Migrating off Intervals.icu without losing Recordings

**Is Intervals.icu a sensible long-term layer?**

| For                                                                                                                                                                                       | Against                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One API over 14 `source` values [ICU-OAS]; free to athletes ("Free $0 forever"; Supporter "$4 /month"); it "Connects With Your Favorite Platforms ...and 250+ more" [ICU-SITE]            | **Its Garmin supply is at risk now** [ICU-752]; Strava is already excluded [ICU-API]                                                                                                                             |
| Pushes planned workouts to Garmin, Suunto, COROS and Wahoo [ICU-PUSH]; building those direct means several partner programs                                                               | Second-hand data: Garmin already filters the FIT it serves [ICU-FIT]                                                                                                                                             |
| Permissive terms with no AI clause [ICU-TERMS]; webhooks, FIT download and calendar upsert for OAuth apps [ICU-COOK]; scopes such as `ACTIVITY` and `CALENDAR`, READ or WRITE [ICU-OAUTH] | A small team (the developer alone until 2025-04; three people by 2026-01) [ICU-SITE]; terms change on 30 days' notice, under South African law [ICU-TERMS]; OAuth apps stay "Pending" until approved [ICU-OAUTH] |
| Generous limits: 5,000 requests a day per key [ICU-API]; no official MCP yet, but community ones such as IcuSync [ICU-MCP]                                                                | Every athlete needs an extra account; personal keys mean polling and up to a day's latency (ADR 0026 §3)                                                                                                         |

**Verdict** _(inference)_: a good workout-push layer and an acceptable activity
bridge for Suunto, COROS, Wahoo and Polar; as of this week an unreliable Garmin
bridge. Treat it as replaceable, and key history to a provider-neutral identity
(§3), so losing it costs a folder, not the history.

- **What survives.** Disconnect deletes only unpromoted imports
  (`app/utils/account-connection.server.ts:148-174`), and auto-save leaves none.
  Streams, detections and TSS hang off the import, and Load Snapshots are not
  recomputed. **The history survives as it is.**
- **Never re-point a Recording** at the new provider's import: that orphans the
  1:1 stream and detection and breaks ADR 0012/0049 immutability. Re-derive in
  place only for mirrors. Old rows keep `externalProvider = 'intervalsicu'`, so
  attribution and the MCP gate must read `originPlatform`, not the transport.
- **Harvest while Garmin is served.** `GET /activity/{id}/file` returns the
  "original activity file" [ICU-OAS], one request per activity within the 5,000
  a day a key allows [ICU-API]. That yields the `file_id` keys for bridge-era
  history and the raw bytes §2 wants. The bulk
  `POST /athlete/{id}/download-fit-files` returns "Intervals.icu generated
  activity fit files", not originals [ICU-OAS].
- **First backfill of the direct source:** floor it at the bridge's watermark
  (`AccountConnection.lastSyncedAt`, `prisma/schema.prisma:1901`) and run the
  dedupe over the overlap instead of re-importing. trainm8 never reaches past
  365 days (`app/integrations/backfill-window.ts:36`); older history comes
  through the ZIP upload.
- **If the Garmin block returns stubs,** every Garmin activity would arrive as a
  0-second "other" session until the filter in §6.2 lands. Whether blocked
  activities come back as stubs or vanish is unknown [ICU-752].
- **Order** _(inference)_: provenance and the stub filter first; harvest second;
  the direct source third; disconnect the bridge last, or keep it for workout
  push (§5).

## 5. Workout export: FIT workout files now, then vendor APIs

**Today: nothing.** No route or util encodes a FIT workout, writes `.zwo`, or
writes calendar events; the Intervals.icu sync "never reads" calendar events
(`app/integrations/intervalsicu/sync.server.ts:23-25`). ADR 0014 left
"capability matrices for push-to-device" out of scope
(`docs/adr/0014-integrations-per-folder-no-interface.md:80-83`).

**What trainm8 would export.** Targets are a union of ten kinds: `zoneLabel`,
`rpe`, `hrBpm`, `hrPct`, `power`, `powerPct`, `pace`, `pacePct`, `lactate` and
`racePace` (`app/utils/workout-schema.ts:98-191`); blocks repeat on two levels,
`seriesRepeatCount` over `repeatCount` (`:559-578`); steps can be strength steps
(`:552-556`).

**Now: a FIT workout file.** The installed SDK ships an `Encoder`
(`node_modules/@garmin/fitsdk/src/encoder.js:23`) and the `workoutStep` profile
(`profile.js:17672`): durations by time, distance, HR, power or reps; HR, power,
speed or cadence targets as zones or custom ranges; repeat steps. The
percentages and `racePace` resolve to absolute targets against the athlete's
anchors at export, and are stamped; `rpe`, `zoneLabel` and `lactate` have no
watch equivalent and become open steps with notes _(inference)_. The groundwork
is in `docs/research/planning-calendar-and-wellness.md:59-66,195-227`. Two uses:

1. **Through the Intervals.icu calendar.** `POST /athlete/{id}/events/bulk`
   accepts "zwo, mrc, erg and fit files" as `file_contents_base64`, or native
   workout text [ICU-OAS][ICU-UPWO]. Athletes who tick "Upload planned workouts"
   get about the next week pushed to Garmin, Suunto, COROS and Wahoo [ICU-PUSH].
   Events carry `push_errors` to surface failures [ICU-OAS]. Caveat:
   `upsert=true` matches `external_id` only for events "created by the same
   OAuth application" [ICU-OAS]; with a personal key, use `upsertOnUid` or store
   event ids (unverified). Whether Garmin's new terms stop this push is
   unanswered (#757) [ICU-752].
2. **As a download** the athlete copies to the device. Side-loading was not
   verified.

**Later: vendor APIs**, each with its own serializer (sibling doc §2):

| Target                      | Write API                                                   | Constraint that shapes the serializer                                                | Plan→actual link                                     |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Garmin                      | Training API, `WORKOUT_IMPORT` [TRN]                        | Step schema is portal-only; §4.5 consent, §4.6 licence to Garmin [AGR]               | None: Garmin's API FIT drops workout steps [ICU-FIT] |
| Suunto                      | SuuntoPlus Guides [SU8]                                     | "nested repeats are not allowed": flatten `seriesRepeatCount`; up to 1000 steps      | `externalId` comes back in the recorded FIT          |
| COROS                       | MCP tools `createSingleWorkout`, `createTrainingPlan` [CO6] | Run, trail and bike only; plans 4–16 weeks; dates ≤ 90 days; deletes only in the app | Not stated                                           |
| Wahoo                       | Plans API [WA2][WA3]                                        | Shown only 0–6 days ahead; bike-centric targets                                      | `plan_id` on the workout                             |
| Apple Watch, Health Connect | WorkoutKit, planned exercise (native) [AP4][GO4]            | Needs the companion app                                                              | Planned-session link in `ExerciseSessionRecord`      |
| Several at once             | Terra Planned Workouts, $0.05 a push [TR-PWC]               | Garmin still needs your own keys                                                     | Terra's ids                                          |

Recording the vendor workout id and the Suunto `externalId` per session lets
plan→actual matching use identifiers, not the same-day heuristic in
`findPlanCandidates` (`app/utils/activity-import.server.ts:272`).

## 6. Findings that apply today

### 6.1 The Garmin attribution gap (verified)

- Intervals.icu API Terms §1.1: "if your application displays information
  derived from Garmin-sourced data, you must display attribution to Garmin in
  the form and manner required by Garmin's brand guidelines" [ICU-TERMS]. The
  guidelines require "Garmin [device model]" on summary views and attribution on
  analytics and AI output [BRAND] (sibling doc §1.4). Intervals.icu's developer:
  use the "device_name" field, which "will contain (ignoring case) 'garmin'"
  [ICU-TERMS, reply 6].
- `grep -rni 'garmin\|device_name' app/routes app/components` finds only tests.
  No app code reads `device_name`. The Recording card shows the transport,
  "Intervals.icu", where the attribution belongs
  (`app/routes/training/sessions.$sessionId.tsx:1899-1910`).
- Fix: provenance columns (§3), "Garmin [device]" beside the Recording title and
  on charts and Coach output built from Garmin data, and the derived-data line
  wherever load numbers draw on it.

### 6.2 Strava stubs become sessions (inferred from forum posts)

- Forum users show the Intervals.icu list endpoint returning Strava-sourced
  activities as
  `{"id", "icu_athlete_id", "start_date_local", "source": "STRAVA", "_note": "STRAVA activities are not available via the API"}`
  [ICU-STUB]; the developer confirms the API "cannot supply Strava activities"
  [ICU-NOSTRAVA]. Not tested against trainm8 with a live key.
- The code path is verified. The schema requires only `id`
  (`app/integrations/intervalsicu/types.ts:100-121`); a missing `type` maps to
  `other` (`ingest.server.ts:64`), a missing duration to `0` (`:70`), and the
  start comes from `start_date_local` without an offset (`:67-69`). Nothing
  filters `source` or `_note` (no match in `app/` or the tests), and every row
  is auto-saved (`:161-166`). Each stub becomes a 0-second "other" session.
  `other` adds no load, so the harm is clutter and a misleading history.
- Fix: skip rows with `source === 'STRAVA'`, a `_note`, or no
  `moving_time`/`elapsed_time` in `mapActivityToImportInput` (`:61-107`), with a
  fixture. It matters twice over if the Garmin block also returns stubs.

### 6.3 Strava is still wired but hidden (verified)

- Routes are auto-registered (`app/routes.ts:4-18`); the webhook and Strava job
  kinds are registered (`app/utils/jobs/handlers.server.ts:62-88,148`); the sync
  fan-out still includes Strava (`integrations.sync.tsx:30-34`); the directory
  still lists it as `live` (`app/integrations/directory.ts:40-47`).
- The hub filters it out (`settings/integrations.tsx:143`); a connection made
  before #505 keeps its card (`:132-134`). The connect route still answers a
  POST when `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` are set
  (`integrations.strava.connect.tsx:12-25`, `app/utils/env.server.ts:37-39`).
- Strava's §6.2 seven-day cache already binds the stored `rawJson`, and
  disconnect does not purge promoted Strava rows
  ([`mcp-server-for-trainm8.md` §6.1](mcp-server-for-trainm8.md#61-the-strava-gate-a-new-reason-for-an-unavailable-metric),
  "Out of scope but urgent"). Decide: unset the Strava secrets in production and
  delete the code, or keep it deliberately and fix the cache.

### 6.4 Stale ADR text (verified)

- **ADR 0026** rejects Intervals.icu OAuth for a "100-requests/user/day cap …
  and no webhooks benefit"
  (`docs/adr/0026-integration-hub-and-key-based-providers.md:96-101`). The guide
  now pools OAuth at "100/user per day up to 500 users … with a minimum of 5000
  … not applied per-user", says "Apps intended to be used by more than one
  person should use OAuth", and webhooks are configured only on an OAuth app
  [ICU-API][ICU-COOK]. Its premise that Intervals.icu "already mirrors their
  data" (`:102-106`) is at risk [ICU-752]. Garmin's flow is OAuth 2.0 PKCE, not
  "OAuth 1.0a→2.0 hybrid" (`:93`). And "Intervals.icu itself syncs from Strava"
  (`:123-124`) no longer yields a second real copy, only stubs (§6.2).
- **ADR 0012** cascades on `accountConnectionId`
  (`docs/adr/0012-disconnect-preserves-recordings.md:47-51`); no such column
  exists, and disconnect deletes by `externalProvider`
  (`account-connection.server.ts:168-174`). Harmless while there is one
  connection per provider (`prisma/schema.prisma:1915`).
- **ADR 0013** requires verifying `X-Strava-Signature`
  (`docs/adr/0013-strava-trigger-model.md:52-54`); the code says "Strava does
  NOT sign webhook payloads" (`app/utils/env.server.ts:40`,
  `webhook.strava.tsx:37-40`).
- **ADR 0014** names `fetch-activity.server.ts`
  (`docs/adr/0014-integrations-per-folder-no-interface.md:25`); both providers
  use `ingest.server.ts`, `sync.server.ts` and `backfill.server.ts`. It also
  promises "no central switch statement that grows with each provider"
  (`:69-73`), yet the sweep `switch`, the sync fan-out and the job registry each
  grow per provider (§1.2).

### 6.5 The dedupe key ignores the athlete (verified; impact inferred)

The unique key is `(externalProvider, externalId)` with no `athleteId`
(`prisma/schema.prisma:1668`), and the upload hash covers only start, duration
and distance (`activity-file-ingest.server.ts:140-151`). Two athletes uploading
the same file (a coach and an athlete, or a shared group-ride file) collide: the
second is told "duplicate" (`:194-197`). The Intervals.icu backfill's
`ensureImport` resolves a collision by `(provider, externalId)` alone
(`app/integrations/intervalsicu/backfill.server.ts:185-206`), so two trainm8
athletes sharing one Intervals.icu key would cross-link. Add `athleteId` to the
key and the hash.

## 7. Phased plan

| Phase                   | Work                                                                                                                                                                                                                                                                                              | Depends on                          | Size _(inference)_         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------- |
| **0. Now**              | Strava stub filter and fixture (§6.2); `athleteId` in the dedupe key (§6.5); provenance columns backfilled from `rawJson`; Garmin attribution on the Recording card and derived views (§6.1); hub copy that stops promising Garmin through Intervals.icu; decide Strava's fate (§6.3); ADRs below | Nothing external                    | Days                       |
| **1. FIT-first ingest** | Provider and id as options; laps; one import per session; `file_id`, device and Suunto fields; keep raw bytes; the alias table and fuzzy match (§2, §3); harvest original FITs from Intervals.icu (§4)                                                                                            | Phase 0 provenance                  | 1–2 weeks                  |
| **2. Workout export**   | Canonical export model; FIT workout encoder; push to the Intervals.icu calendar with push errors shown; consider an Intervals.icu OAuth app for `CALENDAR:WRITE`, webhooks and upsert [ICU-OAUTH] (§5)                                                                                            | Intervals.icu app approval if OAuth | 1–2 weeks                  |
| **3. Direct providers** | Polar, then COROS developer MCP, then Suunto (sibling doc §7); extract `app/integrations/shared/` with the third; a webhook route per push provider                                                                                                                                               | Vendor answers (sibling §8)         | ~1 week each after phase 1 |
| **4. Gated**            | Garmin (on approval; Activity and Training only; MCP only after written §5.2(o) approval); Wahoo after legal review; a HealthKit and Health Connect companion                                                                                                                                     | Garmin, Wahoo, store review         | Weeks each                 |

## 8. Open questions

- Whether the Garmin block hits personal API keys, whether blocked activities
  return as stubs, and when [ICU-752].
- What `external_id` holds for Garmin-sourced Intervals.icu activities; the
  OpenAPI schema does not say [ICU-OAS].
- Whether `upsert` or `upsertOnUid` works on calendar events written with a
  personal key.
- Whether Intervals.icu's official MCP, "at the spec stage" (2026-09-09), will
  pass Garmin data at all [ICU-MCP].

## 9. Corrections made during verification

| Claim as drafted                                                                                      | As corrected                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bulk-pull original FITs with `POST /athlete/{id}/download-fit-files`                                  | That endpoint returns "Intervals.icu generated activity fit files"; originals come one at a time from `GET /activity/{id}/file` [ICU-OAS]         |
| The cheapest push is `events/bulk?upsert=true` keyed on `external_id`                                 | Upsert matches events "created by the same OAuth application"; with trainm8's personal keys use `upsertOnUid` or stored ids, unverified [ICU-OAS] |
| `IntensityTarget` has seven kinds (`hrBpm`, `hrPct`, `power`, `powerPct`, `pace`, `rpe`, `zoneLabel`) | Ten: `pacePct`, `lactate` and `racePace` too (`app/utils/workout-schema.ts:98-191`); three have no watch equivalent                               |
| The public site says "250+ third-party apps have integrated"                                          | It says "Connects With Your Favorite Platforms ...and 250+ more" [ICU-SITE]                                                                       |

## ADRs this research challenges

| ADR                                                          | What it decided                                                                                                          | What the repo and sources show                                                                                                                                                                        | Verdict                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **0012** Disconnect preserves Recordings                     | Disconnect and source deletes remove only unpromoted imports; cascade on `accountConnectionId`                           | The rule holds and is what makes leaving Intervals.icu safe (§4). The column does not exist; deletion is by `externalProvider` (§6.4). Wahoo's revocation clause collides with it (sibling doc)       | **Amend**: fix the mechanism text; add a per-vendor retention rule                                                   |
| **0013** Strava trigger model                                | Webhook + sync + daily sweep; verify `X-Strava-Signature`                                                                | The three layers generalise. The signature requirement contradicts the code, which records that Strava does not sign                                                                                  | **Amend**: correct the signature consequence                                                                         |
| **0014** Per-provider folders, no interface                  | `ActivityImportInput` is the only shared shape; a fixed file layout; "no central switch statement"; dedup "out of scope" | The layout names a file nobody uses; three registries grow per provider; dedup and push-to-device are now needed. FIT-first ingest is the shared piece the rule of three anticipated                  | **Amend**: update the layout, admit the registries, extract `ingestFit` and identity into `app/integrations/shared/` |
| **0026** Integration Hub and key-based providers             | Personal keys over OAuth (cap, no webhooks); Intervals.icu "already mirrors" Garmin and Suunto; athlete-driven dedup     | The OAuth reasons are out of date and the guide asks multi-user apps to use OAuth; the Garmin mirror is at risk; Strava copies are stubs; athlete-driven dedup does not survive a second watch source | **Supersede** the OAuth rejection and the dedup consequence (new ADRs below); keep the hub and directory             |
| **0049** Every import auto-saves                             | No inbox; duplicates and junk become sessions at once; no path may create an unpromoted import                           | Right for one source; with several it makes every duplicate a session. A hidden duplicate row would break its own rule                                                                                | **Confirm**, with dedupe running before `createActivityImport` and duplicates stored as aliases, not rows            |
| **New 0096** Activity provenance and cross-provider identity | —                                                                                                                        | Origin platform, device and FIT key on every import; `athleteId` in the key; an alias table; fuzzy fallback                                                                                           | **Propose**                                                                                                          |
| **New 0097** Workout export                                  | —                                                                                                                        | One canonical export model, a serializer per target, FIT first via the Intervals.icu calendar, vendor ids recorded for plan→actual                                                                    | **Propose**                                                                                                          |
| **New 0098** Source terms per origin platform                | —                                                                                                                        | Attribution and the MCP gate key on `originPlatform`, extending the Strava gate to Garmin (approval), Polar (consent) and the phone stores (consent)                                                  | **Propose**, beside the MCP note's proposed 0092–0095                                                                |

## Sources

All read 2026-10-11. Forum posts by "david" are the Intervals.icu developer's
own, so they count as first-party.

| Key                                          | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ICU-TERMS]                                  | Intervals.icu API Terms (v5, effective 2025-10-23; replies 4 and 6 by david): https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087                                                                                                                                                                                                                                                                                                                                                                                               |
| [ICU-API]                                    | "API access to Intervals.icu" (rev. 15, 2026-10-09): https://forum.intervals.icu/t/api-access-to-intervals-icu/609                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [ICU-752]                                    | #752 (2026-10-09 09:05Z) https://forum.intervals.icu/t/api-access-to-intervals-icu/609/752 ; #759 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/759 (question citing "5.1(o)" at #755) ; #762 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/762 ; #788 https://forum.intervals.icu/t/api-access-to-intervals-icu/609/788 ; wording comparison, not first-party: https://forum.intervals.icu/t/api-access-to-intervals-icu/609/780 , /785 ; reactions: https://forum.intervals.icu/t/api-access-to-intervals-icu/609/807 |
| [ICU-OAS]                                    | OpenAPI 3.0.1: https://intervals.icu/api/v1/docs (UI https://intervals.icu/api-docs.html)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [ICU-COOK] [ICU-OAUTH]                       | Integration Cookbook (v18, 2026-06-05): https://forum.intervals.icu/t/intervals-icu-integration-cookbook/80090 ; OAuth support (v8, 2026-08-28): https://forum.intervals.icu/t/intervals-icu-oauth-support/2759                                                                                                                                                                                                                                                                                                                                         |
| [ICU-UPWO]                                   | "Uploading planned workouts to Intervals.icu" (2024-03-29, edited 2024-12-04): https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624                                                                                                                                                                                                                                                                                                                                                                                          |
| [ICU-PUSH]                                   | Garmin (2020-08-19) https://forum.intervals.icu/t/1521 ; Suunto (2022-03-29) https://forum.intervals.icu/t/9560 ; COROS (2023-04-25) https://forum.intervals.icu/t/37006 ; Wahoo (2024-05-02) https://forum.intervals.icu/t/65949 ; Garmin outage, "planned workouts are not being pushed" (2026-03-19) https://forum.intervals.icu/t/125057                                                                                                                                                                                                            |
| [ICU-MCP]                                    | Official MCP "at the spec stage" (2026-09-09): https://forum.intervals.icu/t/126164/12 ; community MCP IcuSync: https://forum.intervals.icu/t/126632                                                                                                                                                                                                                                                                                                                                                                                                    |
| [ICU-FIT]                                    | Garmin filters API FIT files (2026-03-12, 03-15): https://forum.intervals.icu/t/124287/7                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| [ICU-STUB] [ICU-NOSTRAVA]                    | Community posts with the stub JSON (2024-12-14): https://forum.intervals.icu/t/api-access-to-intervals-icu/609/498 , https://forum.intervals.icu/t/79940/252 ; david, "cannot supply Strava activities via the API" (2025-10-17): https://forum.intervals.icu/t/113828/5                                                                                                                                                                                                                                                                                |
| [ICU-SITE]                                   | Public site, "Free $0 forever", "...and 250+ more" platforms: https://www.intervals.icu/ ; team size: news 2025-04-29 https://forum.intervals.icu/t/99720 , 2026-01-08 https://forum.intervals.icu/t/119193                                                                                                                                                                                                                                                                                                                                             |
| [FIT-FILEID]                                 | Garmin FIT "File Types", File Id message: https://developer.garmin.com/fit/articles/file-types/file_types.html                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| [AGR] [BRAND] [TRN]                          | Garmin agreement, brand guidelines and Training API: see [`watch-data-sources.md`](watch-data-sources.md) Sources (https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf ; https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf ; https://developer.garmin.com/gc-developer-program/training-api/)                                                                                                                                                            |
| [SU8] [CO6] [WA2] [WA3] [AP4] [GO4] [TR-PWC] | Vendor write APIs: see [`watch-data-sources.md`](watch-data-sources.md) Sources                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Repo                                         | Commit `33c10f5`: files cited inline; ADRs 0012, 0013, 0014, 0026, 0049; GOAL.md; [`mcp-server-for-trainm8.md`](mcp-server-for-trainm8.md) §6.1; [`planning-calendar-and-wellness.md`](planning-calendar-and-wellness.md); [`interval-detection-and-data-platform.md`](interval-detection-and-data-platform.md)                                                                                                                                                                                                                                         |
