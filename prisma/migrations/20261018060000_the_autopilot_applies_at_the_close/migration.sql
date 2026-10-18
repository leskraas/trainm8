-- The autopilot applies the Week Replan at the close (#576, spec #558, ADR
-- 0100).
--
-- `AthleteProfile.autopilot` is the per-athlete setting. It is off for
-- everyone here (_Spør meg først_, today's behaviour); turning it on for every
-- athlete is #583's data migration, never seed data.
--
-- `WeekReplan.autopilot` records the mode a week closed under, and
-- `autopilotAppliedAt` claims its once-only apply step.
-- `WeekReplanProposal.autopilotOutcome` is what the autopilot did with each
-- proposal. No backfill: every week closed before this closed under _Spør meg
-- først_.
--
-- Plain ADD COLUMNs, not table rebuilds, so columns that other migrations add
-- to the same tables are kept.

-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN "autopilot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WeekReplan" ADD COLUMN "autopilot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WeekReplan" ADD COLUMN "autopilotAppliedAt" DATETIME;

-- AlterTable
ALTER TABLE "WeekReplanProposal" ADD COLUMN "autopilotOutcome" TEXT;
