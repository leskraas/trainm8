/*
  Eight indexes added by the previous migration were redundant: on each of these
  models a composite `@@unique` already *leads* with the same column, and SQLite
  serves a single-column lookup from a composite index's leading column. They
  cost a page in every copied test database and a write on every insert while
  buying no read.

  Left in place: `TrainingTrackSegment_phaseId_idx`, `WeekPatternDay_trackId_idx`
  and `WeekPatternDay_workoutId_idx` — none of those columns leads a unique.
*/
-- DropIndex
DROP INDEX "PlanOutlinePhase_outlineId_idx";

-- DropIndex
DROP INDEX "QualitySessionMixEntry_segmentId_idx";

-- DropIndex
DROP INDEX "SeasonAnchorSegment_trackId_idx";

-- DropIndex
DROP INDEX "TrainingTrack_outlineId_idx";

-- DropIndex
DROP INDEX "TrainingTrackSegment_trackId_idx";

-- DropIndex
DROP INDEX "WeekPattern_outlineId_idx";

-- DropIndex
DROP INDEX "WeekPatternDay_patternId_idx";

-- DropIndex
DROP INDEX "WeekVolumeOverride_trackId_idx";
