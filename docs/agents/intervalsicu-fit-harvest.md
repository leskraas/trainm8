# The Intervals.icu FIT harvest (#547)

While Intervals.icu still serves Garmin activities, trainm8 fetches the
**original file** of every bridge-era activity it imported through Intervals.icu
and keeps two things on the import: the bytes (`ActivityFile`,
`source = 'intervalsicu-harvest'`) and the FIT key (`ActivityImport.fitFileKey`,
ADR 0096 §1). Nothing else on the import changes: no metric, stream, Recording
or identity. Code: `app/integrations/intervalsicu/fit-harvest.server.ts`.

Why now: Intervals.icu's developer wrote on 2026-10-09 that Garmin access will
likely be blocked "soon" (`docs/research/watch-data-trainm8-ingest.md` §4). The
FIT key is what lets a later direct source, or an upload of the same file, land
as an Import Alias rather than a second session.

## How it is triggered in production

**Deploying the branch that contains it starts the harvest. No command is
needed.**

1. On deploy, `other/litefs.yml` runs `prisma migrate deploy`, which applies
   `20261013140000_one_activity_is_one_row`. This migration changes no existing
   row: it adds `fitHarvestedAt`, the alias table and the file table.
2. On boot, `server/index.ts` calls `ensureIntervalsIcuFitHarvestEnqueued()`.
   This enqueues one `intervalsicu-fit-harvest-dispatch` job. The job row is the
   "already ran" marker, so later boots enqueue nothing (as for the other
   one-shot backfills).
3. The in-process worker runs the dispatch, which enqueues one
   `intervalsicu-fit-harvest` job per **active** Intervals.icu connection.
4. Each harvest job fetches up to 100 originals (`GET /activity/{id}/file`, one
   request each, paced at 4 a second), then enqueues its own continuation. It
   spends at most **2,000 requests per API key in any 24 hours**, counted in
   `IntervalsIcuKeyBudget` (keyed by the key's SHA-256) and shared by every
   athlete who connected with that key. Intervals.icu allows 5,000 a day per
   key, so this leaves room for the daily sync. When the budget is spent, the
   continuation waits until the key's 24-hour window turns.
5. The daily reconciliation sweep then dispatches again, so activities synced
   after the first harvest are harvested too. A connection with a harvest
   already pending or running gets no second.

Order: Garmin-origin activities first, because Garmin is the supply at risk,
then newest first. trainm8 holds at most about a year of Intervals.icu history
(`app/integrations/backfill-window.ts`), so one athlete usually finishes on the
first day.

## Checking progress

Read-only queries. They change nothing:

```sh
fly ssh console -C database-cli --app trainm8-085d
```

```sql
-- Jobs: dispatch ran once; one harvest per athlete pending/running/completed.
SELECT kind, status, attempts, runAt, lastError, payload
FROM Job WHERE kind LIKE 'intervalsicu-fit-harvest%' ORDER BY createdAt DESC LIMIT 20;

-- Per key: the harvest's spend in the current window.
SELECT keyHash, windowStartedAt, requestsInWindow FROM IntervalsIcuKeyBudget;

-- Per athlete: asked / with a kept FIT / with a FIT key / still to ask.
SELECT athleteId,
  SUM(fitHarvestedAt IS NOT NULL) AS asked,
  SUM(id IN (SELECT activityImportId FROM ActivityFile)) AS files,
  SUM(fitFileKey IS NOT NULL) AS keyed,
  SUM(fitHarvestedAt IS NULL) AS pending
FROM ActivityImport WHERE externalProvider = 'intervalsicu' GROUP BY athleteId;

-- Two imports of one athlete that turn out to hold the same FIT (history
-- that predates dedupe). The harvest does not merge them; see below.
SELECT athleteId, fitFileKey, COUNT(*) FROM ActivityImport
WHERE fitFileKey IS NOT NULL GROUP BY athleteId, fitFileKey HAVING COUNT(*) > 1;
```

## Running it again, or stopping it

- **For one athlete, now** (e.g. after they reconnect): the next daily sweep
  does it. Waiting is fine.
- **Re-run the whole dispatch:** delete the marker and redeploy or restart:
  `DELETE FROM Job WHERE kind = 'intervalsicu-fit-harvest-dispatch';`. This is
  safe: already-asked imports are skipped (`fitHarvestedAt`), so no request is
  repeated.
- **Stop it:** mark pending harvest jobs failed:
  `UPDATE Job SET status = 'failed', lastError = 'stopped by owner' WHERE kind = 'intervalsicu-fit-harvest' AND status = 'pending';`.
  The next daily sweep will dispatch again unless the code is changed or
  reverted.
- **Retry an activity** that was asked but should be asked again:
  `UPDATE ActivityImport SET fitHarvestedAt = NULL WHERE id = '…';`.

## What each answer does

| Intervals.icu answers                          | The harvest                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| A FIT file (gzipped or not)                    | Keeps the bytes and the FIT key, marks the import asked                          |
| A FIT the parser cannot read yet               | Keeps the bytes without a key, marks it asked, logs the parse error              |
| A GPX/TCX original, or an empty 200            | Marks it asked, keeps nothing                                                    |
| 404 (a manual entry, no file)                  | Marks it asked                                                                   |
| 401 / 403, and `athlete/0` still answers       | The activity is unavailable, not the key: marks it asked, keeps nothing, goes on |
| 401 / 403, and `athlete/0` rejects the key too | Flips the connection to `revoked` (ADR 0026) and stops for that athlete          |
| 429, 5xx, a network failure                    | Stops this run, leaves the activity unmarked, and resumes an hour later          |

## Not verified against the live API

The harvest was tested only against MSW mocks (`fit-harvest.server.test.ts`).
These assumptions need checking on the first production run: the job rows and
the `lastError` column will show it if one is wrong.

- `GET /activity/{id}/file` returns the original bytes, possibly gzipped, and
  404s for an activity with no file. This is per Intervals.icu's OpenAPI
  description ("Download original activity file"), not a live capture.
- What a Garmin activity Intervals.icu has already blocked answers: 404, 403 or
  something else. A 401/403 is checked against `athlete/0` before the connection
  is revoked, so a per-activity block marks only that activity. Watch for
  `revoked` connections after the first run anyway.
- The daily rate limit is per key, as the API docs say. 2,000 a day per key is a
  deliberate under-use.

## Duplicates the harvest reveals

An athlete may already hold two imports of one activity from before dedupe: an
upload plus an Intervals.icu sync. Once both carry the same FIT key, the query
above shows them. The harvest does **not** merge them. ADR 0096 defines what
happens to a newcomer, not to two existing rows, and a Recording is never
re-pointed (ADR 0096 §6). Merging is the owner's call. The athlete can delete
the duplicate session today.
