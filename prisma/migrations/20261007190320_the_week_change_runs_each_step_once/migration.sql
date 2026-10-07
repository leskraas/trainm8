-- **The week change runs each of its steps once.** (#505, ADR 0080.) Two
-- nullable columns on `WeekReplan`, nothing else:
--
-- - `horizonFilledAt`: when the close filled the Planning Horizon week. A fill
--   that failed leaves it null, so the next run retries it; once set, the week
--   is never laid again, even after the athlete clears it.
-- - `silencedAt`: when the morning's silence ran over this decision's
--   proposals. Set once, so a proposal silence held stays pending for the
--   athlete instead of being looked at (and queued for) every hour.
--
-- Existing rows read both as null: the most recent closed week then gets its
-- horizon filled and its silence run once, which is what a row written by the
-- old recompute trigger would have had.
--
-- **No stored number moves. No Load Recompute Notice is owed.** No existing
-- value is rewritten and no corpus data ships here.

-- AlterTable
ALTER TABLE "WeekReplan" ADD COLUMN "horizonFilledAt" DATETIME;
ALTER TABLE "WeekReplan" ADD COLUMN "silencedAt" DATETIME;
