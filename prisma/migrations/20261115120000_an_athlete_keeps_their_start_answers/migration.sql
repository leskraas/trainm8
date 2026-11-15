-- **An athlete keeps their start answers** (Lab Engine, ADR 0125).
--
-- Getting started is answered one question at a time, in any order, so the
-- answers the plan is made from are stored as they are given rather than
-- carried in a URL. Three nullable columns on the Athlete Profile: the sports
-- the athlete trains (main sport first), the Simple Activities they do, and
-- the hours a week they train now. Null is "never said". No existing row
-- changes and no stored number moves.
ALTER TABLE "AthleteProfile" ADD COLUMN "sports" TEXT;
ALTER TABLE "AthleteProfile" ADD COLUMN "simpleActivities" TEXT;
ALTER TABLE "AthleteProfile" ADD COLUMN "currentWeeklyHours" REAL;
