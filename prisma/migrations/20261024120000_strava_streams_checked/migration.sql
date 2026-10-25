-- `streamsCheckedAt` (#638): when trainm8 asked Strava for an import's
-- streams and Strava answered with nothing usable (a manual entry, no
-- device). The streams ingest skips an import carrying it, so a deferred sync
-- or backfill that starts over, or a webhook redelivery, spends no read on it
-- again. `NULL` until asked; an import with a stream never needs it.
--
-- **No stored row changes.** A nullable column is added and nothing is
-- written to it.
ALTER TABLE "ActivityImport" ADD COLUMN "streamsCheckedAt" DATETIME;
