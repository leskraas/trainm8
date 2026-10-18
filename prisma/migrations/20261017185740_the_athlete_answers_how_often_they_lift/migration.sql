-- The athlete answers how often they lift (#574, spec #558, ADR 0103): the
-- strength sessions a week (1, 2 or 3) they chose in the First Run, pre-set
-- from their lifting history or their Training Level. Their own answer, never
-- invented. No backfill: an athlete who never picked styrke never answered,
-- and null says so. No stored number moves.

-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN "strengthPerWeek" INTEGER;
