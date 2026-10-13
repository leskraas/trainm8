# Every import records its origin platform, and one activity is one row

Status: Accepted · Ticket #545 (map #541) · Backed by
[`watch-data-trainm8-ingest.md` §3, §6.4, §6.5](../research/watch-data-trainm8-ingest.md#3-cross-provider-identity-and-dedupe)
and
[`watch-data-sources.md` §6](../research/watch-data-sources.md#6-ai-and-mcp-terms-per-source)

**Amends [ADR 0012](./0012-disconnect-preserves-recordings.md)** (what a
source-side `delete` and a disconnect touch once an import can have aliases) and
**[ADR 0014](./0014-integrations-per-folder-no-interface.md)** (identity is the
first shared module in `app/integrations/shared/`). **Confirms
[ADR 0049](./0049-every-import-auto-saves-there-is-no-inbox.md)**: there is
still no path that creates an unpromoted import. **Supersedes the dedupe
consequence of [ADR 0026](./0026-integration-hub-and-key-based-providers.md)**
("cross-provider dedup stays athlete-driven"). The terms that hang off the
origin platform are [ADR 0098](./0098-source-terms-bind-per-origin-platform.md).

## Context

An `ActivityImport` knows its **transport** (`externalProvider`: `manual`,
`strava`, `intervalsicu`, `garmin`) and nothing about where the activity was
recorded. Three needs now ask for the origin:

1. **Garmin attribution.** Intervals.icu's API terms §1.1 pass Garmin's brand
   guidelines down to us, and the Recording card shows "Intervals.icu" where
   "Garmin [device model]" belongs. That binds today.
2. **The model-facing gate.** Whether a number may reach an assistant depends on
   the platform the data came from, not the pipe it came down (ADR 0098).
   Leaving Intervals.icu must not change what an old Garmin run is allowed to
   do, and old rows keep `externalProvider = 'intervalsicu'` forever.
3. **Dedupe.** One run already gets an unrelated key per source
   (`intervalsicu:i55751783`, `manual:<hash>`, a future `polar:<id>`). ADR 0049
   turns every duplicate into a session at once and counts its TSS twice. With
   the bridge, direct vendors and FIT upload all live at the same time, "the
   athlete deletes the duplicate" stops being a remedy and becomes a chore.

And the key itself is wrong: `@@unique([externalProvider, externalId])` and the
upload hash ignore the athlete, so two athletes uploading the same group-ride
file collide, and two athletes on one Intervals.icu key would cross-link.

## Decision

### 1. Provenance on every import

`ActivityImport` gains three columns, filled by every ingest path:

- **`originPlatform`** — the **Origin Platform**: the platform the activity was
  recorded into or first synced to, which is the platform whose terms govern the
  data (ADR 0098). A lowercase string, not a Prisma enum (ADR 0014: the schema
  does not enumerate providers): `garmin`, `polar`, `suunto`, `coros`, `wahoo`,
  `strava`, `zwift`, `apple-health`, `health-connect`, `intervalsicu` (an
  activity native to Intervals.icu, such as one entered there by hand), `upload`
  (a file the athlete gave trainm8 directly), or `unknown`. Not null; `unknown`
  is the default and the honest answer when a source does not say.
- **`deviceName`** — the recording device as the source names it (Intervals.icu
  `device_name`; from a FIT file, the `file_id`/`device_info` manufacturer and
  product). Nullable. It is display text for "Garmin [device model]", never a
  key and never what the gate reads.
- **`fitFileKey`** — the canonical identity of the original FIT activity file,
  when one exists:
  `fit:<manufacturer>:<product|->:<serial_number|->:<time_created>` from the
  `file_id` message, with `time_created` as Unix seconds UTC and `-` for a
  missing optional field. Null when there is no original FIT, when
  `file_id.type` is not `activity`, or when `manufacturer` or `time_created` is
  missing. One function in `app/integrations/shared/` computes it, so every path
  writes the same string for the same file. The FIT spec promises no uniqueness,
  so the key is treated as strong, not certain.

How each path sets `originPlatform`:

| Path               | `originPlatform`                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intervals.icu      | From the activity's `source`: a vendor value maps to that vendor (`GARMIN_CONNECT` → `garmin`, likewise Polar, Suunto, COROS, Wahoo, Zwift, Strava); Intervals.icu's own values (upload, manual) → `intervalsicu`; anything unmapped → `unknown`. Then the override below. |
| Strava             | `strava`                                                                                                                                                                                                                                                                   |
| A direct vendor    | That vendor (`polar`, `coros`, `suunto`, `garmin`, …)                                                                                                                                                                                                                      |
| File upload, share | `upload`, whatever device wrote the file. The athlete's own file is not vendor API data (`watch-data-sources.md` §6).                                                                                                                                                      |
| A phone store      | `apple-health` or `health-connect`, even for a Garmin run that reached the store, because the store's rules then govern it                                                                                                                                                 |

**The Garmin override on the bridge:** an Intervals.icu activity whose
`deviceName` contains `garmin` (ignoring case) is `garmin` whatever its `source`
says. This is the test Intervals.icu's developer gave for its §1.1 attribution
duty. It over-attributes a Garmin file the athlete uploaded to Intervals.icu by
hand; over-attributing is harmless, under-attributing is a terms breach.

Existing rows are backfilled by a data migration in SQL, with no API calls:
`strava` → `strava`, `manual` → `upload`, `garmin` → `garmin`, and
`intervalsicu` rows read `source` and `device_name` from the stored `rawJson`
(its schema is `.passthrough()`, so both are already there). `fitFileKey` stays
null for history until the original FITs are harvested (#547).

### 2. The athlete is part of every key

The transport key becomes `@@unique([athleteId, externalProvider, externalId])`,
and the upload content hash covers `athleteId` as well as start, duration and
distance. Two athletes can hold the same file; one athlete cannot hold one
activity twice. (#544 builds this.)

### 3. One activity is one row; a second source becomes an alias

A new table, `ActivityImportAlias`, records every other source that delivered an
activity trainm8 already holds:

| Column             | Meaning                                                    |
| ------------------ | ---------------------------------------------------------- |
| `id`               | cuid                                                       |
| `activityImportId` | The import this source duplicates; cascade-deleted with it |
| `athleteId`        | The owner (denormalised so lookups never join)             |
| `externalProvider` | The newcomer's transport                                   |
| `externalId`       | The newcomer's id at that transport                        |
| `originPlatform`   | The newcomer's Origin Platform, by the same rules as §1    |
| `deviceName`       | The newcomer's device, nullable                            |
| `fitFileKey`       | The newcomer's FIT key, nullable                           |
| `matchedBy`        | `fit-file-key` or `fuzzy`: which rule in §4 made the match |
| `createdAt`        | When the duplicate arrived                                 |

`@@unique([athleteId, externalProvider, externalId])`,
`@@index([activityImportId])`, `@@index([athleteId, fitFileKey])`. A transport
key lives in exactly one of the two tables for an athlete, never both.

An alias is not an import. It has no session, no stream, no TSS and no metrics:
it exists so the next sync knows it already has the activity, so the gate knows
every platform the data touched, and so the athlete can see "also from Polar".

### 4. The dedupe rule, in order

Before any insert, the candidate is resolved against the athlete's imports and
aliases. The first rule that matches decides:

1. **Same transport key.** An `ActivityImport` or an alias with the candidate's
   `(athleteId, externalProvider, externalId)` exists → it is the same activity
   re-fetched. No new row, no new alias; a source-side update follows ADR 0049's
   mirror rule.
2. **Same FIT key.** The candidate has a `fitFileKey`, and an import or alias of
   this athlete has the same one → match, `matchedBy = 'fit-file-key'`.
3. **Fuzzy.** An import of this athlete with
   - the same **discipline family** — the trainm8 `discipline` after each
     source's own discipline map; `other` matches only `other`;
   - `|startedAt − candidate.startedAt| ≤ 120 s`; and
   - `|durationSec − candidate.durationSec| ≤ 0.05 × max(durationSec, candidate.durationSec)`,
     with both durations above zero → match, `matchedBy = 'fuzzy'`. Several
     candidates: the smallest start difference wins, then the oldest
     `createdAt`. Two different `fitFileKey`s do not block a fuzzy match: a
     watch and a bike computer recording the same ride are one ride for load.
4. **No match** → a new `ActivityImport`, then auto-save as ADR 0049 says.

Durations are compared with tolerance because sources disagree: Intervals.icu
reports `moving_time`, FIT reports timer time. The rule errs towards a miss. A
missed duplicate is a visible extra session the athlete can delete (today's
state); a false match would hide a real activity behind an alias.

### 5. Where it runs

The check runs at the one insert choke point, before `createActivityImport`
writes anything: a shared `app/integrations/shared/` entry every ingest path
calls (sync, webhook, backfill, reconciliation, file upload, share target,
harvest). It returns either `created` (the new import's id) or `duplicate` (the
existing import's id and `matchedBy`). Auto-save, telemetry enrichment and the
Live Imports Stream run only on `created`, so ADR 0049 never sees a duplicate.

### 6. What a match may change on the existing import

- If the existing import is still an **Auto-Save Mirror** (`isAutoSaveMirror`)
  and the newcomer carries an original FIT while the existing import does not,
  the existing row may be refreshed from the newcomer: its metrics, stream,
  laps, `deviceName` and `fitFileKey` take the newcomer's. Its
  `externalProvider`, `externalId` and `originPlatform` never change: a row's
  identity is fixed, and the gate reads the aliases anyway.
- A Recording the athlete has built on is never touched (ADR 0012 as amended by
  ADR 0049). The alias is still recorded.
- A Recording is never re-pointed at a newcomer's import, because that orphans
  its 1:1 stream and detection.

### 7. Source-side events and disconnect with aliases

- A source-side `delete` or `update` for a key held as an **alias** removes or
  ignores the alias only. The import stays: another source still vouches for it.
- A source-side `delete` for the import's own key, while the import has aliases,
  keeps the import; with no aliases, ADR 0049's mirror rule applies.
- Disconnect deletes unpromoted imports by `(athleteId, externalProvider)`, as
  the code does today (ADR 0012, amended), and keeps that provider's aliases, so
  reconnecting does not re-import duplicates.

### 8. The hub warns about any two sources

The Integration Hub's notice generalises from "Strava and Intervals.icu" to "two
or more active sources": dedupe is strong, not certain, and the athlete should
know why a duplicate might still slip through.

## Considered options

- **Keep the transport as the only provenance.** Rejected: attribution and the
  gate would follow the pipe, so a Garmin run's rules would change the day the
  bridge closes, and old rows would lie.
- **Store a second, hidden import row for each duplicate.** Rejected: ADR 0049
  forbids an import with no session ("no path is allowed to create one"), and a
  hidden row is exactly that.
- **Delete the duplicate and keep no trace.** Rejected: the next sync would
  re-import it, and the gate would lose the second platform's terms.
- **Exact content hash across sources.** Rejected: sources disagree on duration
  (moving time versus timer time) and on start rounding, so it would match
  almost nothing.
- **Leave dedupe to the athlete (ADR 0026).** Rejected once a second watch
  source exists: every duplicate is a session and double TSS until someone
  notices.
- **A Prisma enum for `originPlatform`.** Rejected: ADR 0014 keeps providers out
  of the schema's enumerations, and SQLite would store a string anyway.

## Consequences

- `originPlatform` is what ADR 0098's attribution and gate read; `deviceName`
  only fills in "Garmin [device model]".
- The set of platforms that bind an import is its own `originPlatform` plus
  every alias's (ADR 0098). An upload that duplicates a Strava import is still
  Strava data.
- Identity is the first module in `app/integrations/shared/`, ahead of ADR
  0014's rule of three, because every source needs it from its first row.
- The first backfill of a direct source after the bridge starts at the bridge's
  watermark and lets this rule absorb the overlap.
- A duplicate the rule misses still becomes a session (ADR 0049 accepts that); a
  wrong fuzzy match needs a way back. Splitting an alias back into its own
  import is not built; it is the first thing to add if a false match is ever
  reported.
