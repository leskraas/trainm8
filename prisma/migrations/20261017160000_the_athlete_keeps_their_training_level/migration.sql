-- The athlete keeps the Training Level they gave in the First Run (#566,
-- spec #558, ADR 0102 §6): "beginner" | "recreational" | "experienced" |
-- "competitive". No backfill: an athlete from before the simple start never
-- said one, and null says so.

-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN "trainingLevel" TEXT;
