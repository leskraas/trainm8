-- **The Week Replan proposes, and the athlete can hand a session back.** (#505,
-- ADR 0080.) Two additions, nothing else:
--
-- - `WeekReplanProposal`: one change (keep, move, swap, add or scale) the Week
--   Replan proposes for the week after a closed one, with its reason, load
--   direction, move scope and answer. The `WeekReplan` row stays the
--   at-most-once record per closed week; its outcome gains `proposed`, a plain
--   string value that needs no DDL.
-- - `WorkoutSession.releasedAt`: "lås opp". A released session is the machine's
--   again, so the Week Replan may change it without asking.
--
-- **No stored number moves. No Load Recompute Notice is owed.** Both are new and
-- empty: no existing row is rewritten, no load, TSS, Planned TSS or step quantity
-- changes, and every existing `WeekReplan` row (including its `adjusted`
-- outcome and `appliedScale`) reads exactly as it did. No corpus data ships here.

-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN "releasedAt" DATETIME;

-- CreateTable
CREATE TABLE "WeekReplanProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "loadDirection" TEXT NOT NULL,
    "scope" TEXT,
    "answer" TEXT NOT NULL DEFAULT 'pending',
    "answeredAt" DATETIME,
    "appliedAt" DATETIME,
    "targetWeekKey" TEXT NOT NULL,
    "targetSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "athleteId" TEXT NOT NULL,
    "weekReplanId" TEXT,
    CONSTRAINT "WeekReplanProposal_targetSessionId_fkey" FOREIGN KEY ("targetSessionId") REFERENCES "WorkoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeekReplanProposal_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeekReplanProposal_weekReplanId_fkey" FOREIGN KEY ("weekReplanId") REFERENCES "WeekReplan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WeekReplanProposal_athleteId_answer_idx" ON "WeekReplanProposal"("athleteId", "answer");

-- CreateIndex
CREATE INDEX "WeekReplanProposal_weekReplanId_idx" ON "WeekReplanProposal"("weekReplanId");

-- CreateIndex
CREATE INDEX "WeekReplanProposal_targetSessionId_idx" ON "WeekReplanProposal"("targetSessionId");
