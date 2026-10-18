-- The Autopilot Notice is seen, leaves I dag, and is kept (#580, spec #558,
-- ADR 0100 §5).
--
-- `WeekReplan.autopilotSeenAt` records when the athlete first saw a week's
-- notice on I dag: it leaves once seen on an earlier day and the week it laid
-- has begun. `WeekReplan.horizonUnlaid` records why the close could not lay
-- the horizon week, so the notice can say so. No backfill: both read as unset
-- for a week closed before this.
--
-- Plain ADD COLUMNs, not a table rebuild, so columns other migrations add to
-- the same table are kept.

-- AlterTable
ALTER TABLE "WeekReplan" ADD COLUMN "autopilotSeenAt" DATETIME;
ALTER TABLE "WeekReplan" ADD COLUMN "horizonUnlaid" TEXT;
