-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT NOT NULL,
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkoutBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "workoutId" TEXT NOT NULL,
    CONSTRAINT "WorkoutBlock_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkoutStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "intensity" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "WorkoutStep_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "WorkoutBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    CONSTRAINT "ScheduledSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduledSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");

-- CreateIndex
CREATE INDEX "WorkoutBlock_workoutId_idx" ON "WorkoutBlock"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutStep_blockId_idx" ON "WorkoutStep"("blockId");

-- CreateIndex
CREATE INDEX "ScheduledSession_userId_idx" ON "ScheduledSession"("userId");

-- CreateIndex
CREATE INDEX "ScheduledSession_userId_scheduledAt_idx" ON "ScheduledSession"("userId", "scheduledAt");
