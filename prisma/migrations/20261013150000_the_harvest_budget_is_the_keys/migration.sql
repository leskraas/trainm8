-- The FIT harvest's daily budget belongs to the Intervals.icu API key (#547).
--
-- Intervals.icu allows 5,000 requests a day per key, and several athletes may
-- connect with the same key (#544), so the harvest's share is counted per key
-- (by its SHA-256, never the key itself) and shared by every connection that
-- holds it. No backfill: a missing row is a fresh window.

-- CreateTable
CREATE TABLE "IntervalsIcuKeyBudget" (
    "keyHash" TEXT NOT NULL PRIMARY KEY,
    "windowStartedAt" DATETIME NOT NULL,
    "requestsInWindow" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
