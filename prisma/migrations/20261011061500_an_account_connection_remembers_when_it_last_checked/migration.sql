-- "Sist synkronisert" on the integrations page (round-2 audit, PR C).
--
-- `AccountConnection.lastCheckedAt` — when the app last asked the provider for
-- new activities and got an answer: Sync now, the daily reconciliation sweep,
-- the end of the backfill. The page showed `lastSyncedAt`, which is the newest
-- activity's *start time* (the sync watermark, deliberately not wall-clock:
-- see `intervalsicu/sync.server.ts`), so right after a Sync now that found
-- nothing it named a day long past. Null on every existing row: no check has
-- been recorded yet, and the page then says nothing rather than guess.
ALTER TABLE "AccountConnection" ADD COLUMN "lastCheckedAt" DATETIME;
