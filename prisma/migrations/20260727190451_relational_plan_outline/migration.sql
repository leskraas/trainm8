/*
  The Plan Outline stops being a JSON blob on the Event and becomes relational
  (ADR 0044): manual authoring makes it primary data the athlete edits piece by
  piece, and this repo already models authored nested structure as rows
  (Workout → WorkoutBlock → WorkoutStep) while reserving JSON for value objects.

  Existing outlines are DROPPED, not converted. Every stored outline was Plan
  Generation output — per-phase `weeklyLoadHours` plus a free-text `focus` that
  ADR 0042 removed — and there are no external users, so a conversion would have
  bought nothing over a clean slate. The two lossy parts of any conversion were
  deliberate anyway: `focus` prose maps to no zone honestly, and one hours figure
  covering several Disciplines cannot be attributed to one track per Discipline
  (ADR 0043 §1). Sessions anchored to those Events survive; an Event without an
  Outline is a calendar marker, not a plan (ADR 0018), which the read path
  already handles.

  Value vocabularies are enforced with CHECK constraints, following the
  `AccountConnection.status` precedent. Immutability of `TrainingTrack.currency`
  is NOT a constraint here: SQLite would need a trigger, this repo has none, and
  a trigger would be invisible in schema.prisma and lost to a later table
  rebuild. It is enforced by `currency` being absent from every update input,
  pinned by a test (ADR 0044 §8).
*/
-- CreateTable
CREATE TABLE "PlanOutline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startWeekKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "eventId" TEXT NOT NULL,
    CONSTRAINT "PlanOutline_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanOutlinePhase" (
    "orderIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "rhythm" TEXT NOT NULL DEFAULT '3:1' CHECK ("rhythm" IN ('3:1', '2:1', 'none')),
    "tapers" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL PRIMARY KEY,
    "outlineId" TEXT NOT NULL,
    CONSTRAINT "PlanOutlinePhase_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanOutlinePhase_weeks_positive" CHECK ("weeks" >= 1)
);

-- CreateTable
CREATE TABLE "TrainingTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discipline" TEXT NOT NULL CHECK ("discipline" IN ('run', 'swim', 'bike', 'strength')),
    "currency" TEXT NOT NULL CHECK ("currency" IN ('km', 'hours', 'tss', 'sets')),
    "outlineId" TEXT NOT NULL,
    CONSTRAINT "TrainingTrack_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SeasonAnchorSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromWeekKey" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "SeasonAnchorSegment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrainingTrackSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('endurance', 'strength')),
    "phaseId" TEXT,
    "ramp" REAL,
    "boundaryStep" REAL,
    "recoveryCut" REAL,
    "taperCut" REAL,
    "startWeekKey" TEXT,
    "weeks" INTEGER,
    "fromLandmark" TEXT CHECK ("fromLandmark" IS NULL OR "fromLandmark" IN ('MV', 'MEV', 'MAV', 'MRV')),
    "toLandmark" TEXT CHECK ("toLandmark" IS NULL OR "toLandmark" IN ('MV', 'MEV', 'MAV', 'MRV')),
    "deloadCut" REAL,
    "deloadWeeks" INTEGER,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "TrainingTrackSegment_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PlanOutlinePhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingTrackSegment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- An endurance segment spans exactly one phase (ADR 0042 §8); a strength
    -- segment floats free of them and carries its own dated span (ADR 0041 §4).
    -- Neither kind may borrow the other's positioning fields.
    -- Every nullable column is tested with IS NOT NULL before it is compared:
    -- `"weeks" >= 1` evaluates to NULL when weeks is NULL, and a CHECK passes on
    -- NULL, so a bare comparison would let the missing value through.
    CONSTRAINT "TrainingTrackSegment_kind_position" CHECK (
        ("kind" = 'endurance' AND "phaseId" IS NOT NULL AND "startWeekKey" IS NULL AND "weeks" IS NULL)
        OR ("kind" = 'strength' AND "phaseId" IS NULL AND "startWeekKey" IS NOT NULL AND "weeks" IS NOT NULL AND "weeks" >= 1)
    )
);

-- CreateTable
CREATE TABLE "QualitySessionMixEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    -- Zones 3–5 only: the quality session is an *intensive* one, which is what
    -- the evidence measures (ADR 0042 §3). Widening this set later leaves stored
    -- mixes valid; narrowing it would not.
    "zone" INTEGER NOT NULL CHECK ("zone" BETWEEN 3 AND 5),
    "sessionsPerWeek" INTEGER NOT NULL CHECK ("sessionsPerWeek" >= 1),
    "segmentId" TEXT NOT NULL,
    CONSTRAINT "QualitySessionMixEntry_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TrainingTrackSegment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekVolumeOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekKey" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "WeekVolumeOverride_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "outlineId" TEXT NOT NULL,
    CONSTRAINT "WeekPattern_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekPatternDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekday" INTEGER NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
    "orderInDay" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('fixed', 'share')),
    "weight" REAL,
    "workoutId" TEXT,
    "patternId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "WeekPatternDay_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_patternId_fkey" FOREIGN KEY ("patternId") REFERENCES "WeekPattern" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WeekPatternDay_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- A fixed day is a Workout stamped as authored; a share day carries a weight.
    CONSTRAINT "WeekPatternDay_kind_fields" CHECK (
        ("kind" = 'fixed' AND "workoutId" IS NOT NULL AND "weight" IS NULL)
        OR ("kind" = 'share' AND "weight" IS NOT NULL AND "weight" > 0)
    )
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "disciplines" TEXT NOT NULL,
    "target" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "athleteId" TEXT NOT NULL,
    "resultSessionId" TEXT,
    CONSTRAINT "Event_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_resultSessionId_fkey" FOREIGN KEY ("resultSessionId") REFERENCES "WorkoutSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Event" ("athleteId", "createdAt", "disciplines", "endDate", "id", "kind", "location", "name", "notes", "priority", "resultSessionId", "startDate", "status", "target", "updatedAt") SELECT "athleteId", "createdAt", "disciplines", "endDate", "id", "kind", "location", "name", "notes", "priority", "resultSessionId", "startDate", "status", "target", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE INDEX "Event_athleteId_idx" ON "Event"("athleteId");
CREATE INDEX "Event_athleteId_startDate_idx" ON "Event"("athleteId", "startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PlanOutline_eventId_key" ON "PlanOutline"("eventId");

-- CreateIndex
CREATE INDEX "PlanOutlinePhase_outlineId_idx" ON "PlanOutlinePhase"("outlineId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanOutlinePhase_outlineId_orderIndex_key" ON "PlanOutlinePhase"("outlineId", "orderIndex");

-- CreateIndex
CREATE INDEX "TrainingTrack_outlineId_idx" ON "TrainingTrack"("outlineId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTrack_outlineId_discipline_key" ON "TrainingTrack"("outlineId", "discipline");

-- CreateIndex
CREATE INDEX "SeasonAnchorSegment_trackId_idx" ON "SeasonAnchorSegment"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonAnchorSegment_trackId_fromWeekKey_key" ON "SeasonAnchorSegment"("trackId", "fromWeekKey");

-- CreateIndex
CREATE INDEX "TrainingTrackSegment_trackId_idx" ON "TrainingTrackSegment"("trackId");

-- CreateIndex
CREATE INDEX "TrainingTrackSegment_phaseId_idx" ON "TrainingTrackSegment"("phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_phaseId_key" ON "TrainingTrackSegment"("trackId", "phaseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_startWeekKey_key" ON "TrainingTrackSegment"("trackId", "startWeekKey");

-- CreateIndex
CREATE INDEX "QualitySessionMixEntry_segmentId_idx" ON "QualitySessionMixEntry"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "QualitySessionMixEntry_segmentId_zone_key" ON "QualitySessionMixEntry"("segmentId", "zone");

-- CreateIndex
CREATE INDEX "WeekVolumeOverride_trackId_idx" ON "WeekVolumeOverride"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekVolumeOverride_trackId_weekKey_key" ON "WeekVolumeOverride"("trackId", "weekKey");

-- CreateIndex
CREATE INDEX "WeekPattern_outlineId_idx" ON "WeekPattern"("outlineId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPattern_outlineId_orderIndex_key" ON "WeekPattern"("outlineId", "orderIndex");

-- CreateIndex
CREATE INDEX "WeekPatternDay_patternId_idx" ON "WeekPatternDay"("patternId");

-- CreateIndex
CREATE INDEX "WeekPatternDay_trackId_idx" ON "WeekPatternDay"("trackId");

-- CreateIndex
CREATE INDEX "WeekPatternDay_workoutId_idx" ON "WeekPatternDay"("workoutId");

-- CreateIndex
CREATE UNIQUE INDEX "WeekPatternDay_patternId_weekday_orderInDay_key" ON "WeekPatternDay"("patternId", "weekday", "orderInDay");
