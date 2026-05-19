-- RenameTable
ALTER TABLE "ScheduledSession" RENAME TO "WorkoutSession";

-- DropIndex
DROP INDEX "ScheduledSession_userId_idx";

-- DropIndex
DROP INDEX "ScheduledSession_userId_scheduledAt_idx";

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_idx" ON "WorkoutSession"("userId");

-- CreateIndex
CREATE INDEX "WorkoutSession_userId_scheduledAt_idx" ON "WorkoutSession"("userId", "scheduledAt");
