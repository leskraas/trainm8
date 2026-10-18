-- The athlete keeps the Session Preferences they gave in the First Run (#571,
-- spec #558, ADR 0102 §1): a JSON array of "long" | "intervals" | "threshold" |
-- "short" | "surprise". "[]" is a skip. No backfill: an athlete from before the
-- question never answered it, and null says so.

-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN "sessionPreferences" TEXT;
