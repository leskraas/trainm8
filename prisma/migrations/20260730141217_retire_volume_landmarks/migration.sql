/*
  Volume Landmarks are retired (ADR 0047 §1/§8) and the strength Training Track
  segment authors a Strength Goal and a Strength Frequency instead.

  `fromLandmark` / `toLandmark` go because the taxonomy they encode is one
  vendor's: absent from every position stand and from the PubMed-indexed
  resistance-training literature, self-inconsistent by up to 2× across that
  vendor's own two publications, published in a shape four scalars cannot
  represent, and with MRV — the member segment length depended on — unanchored by
  any meta-analysis (#380). A strength track now progresses by the same machinery
  as endurance: the track's Season Anchor times the segment's `ramp` and
  `boundaryStep`.

  `goal` and `sessionsPerWeek` replace them, both nullable and both strength-only.
  `goal` carries a value CHECK the way `kind`, `rhythm` and `currency` already do;
  `sessionsPerWeek` carries a positivity CHECK the way the mix's does. Neither is
  required at creation: a block may be authored before the athlete has decided
  what it is for.

  The migration is free to run: #367 deleted every existing Outline and nothing
  can author one yet. The `INSERT … SELECT` below is therefore a formality rather
  than a data path.

  Two constraint notes, both about SQLite's table-rebuild semantics.

  First, a rebuild carries no CHECK forward. Prisma's generated migration dropped
  every one of them — `kind`, `zone`, `sessionsPerWeek` and the per-kind
  positioning constraint — because they live only in the migration history and not
  in schema.prisma. They are restored verbatim below and extended, which is what
  `constraints.test.ts` is for.

  Second, "a strength segment carries no Quality Session Mix" cannot be a CHECK:
  the mix is a child table and a CHECK cannot reach across tables. It is enforced
  as a composite foreign key instead — `QualitySessionMixEntry` carries the parent
  kind it requires, pinned to 'endurance' by a CHECK, and points at
  `TrainingTrackSegment (id, kind)`. A trigger would have been the other option
  and is declined for the reason the previous migration gives: it would be
  invisible in schema.prisma and lost to a later rebuild.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QualitySessionMixEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    -- Zones 3–5 only: the quality session is an *intensive* one, which is what
    -- the evidence measures (ADR 0042 §3). Widening this set later leaves stored
    -- mixes valid; narrowing it would not.
    "zone" INTEGER NOT NULL CHECK ("zone" BETWEEN 3 AND 5),
    "sessionsPerWeek" INTEGER NOT NULL CHECK ("sessionsPerWeek" >= 1),
    "segmentId" TEXT NOT NULL,
    -- A mix belongs to an endurance segment; a strength segment authors its
    -- intensity as a Strength Goal (ADR 0047 §3). The kind is stored so the
    -- foreign key below can require it, and pinned so it can only ever be the one
    -- value. ON UPDATE CASCADE plus this CHECK also means a segment cannot be
    -- rewritten to 'strength' out from under a mix it already carries.
    "segmentKind" TEXT NOT NULL DEFAULT 'endurance' CHECK ("segmentKind" = 'endurance'),
    CONSTRAINT "QualitySessionMixEntry_segmentId_segmentKind_fkey" FOREIGN KEY ("segmentId", "segmentKind") REFERENCES "TrainingTrackSegment" ("id", "kind") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QualitySessionMixEntry" ("id", "segmentId", "sessionsPerWeek", "zone") SELECT "id", "segmentId", "sessionsPerWeek", "zone" FROM "QualitySessionMixEntry";
DROP TABLE "QualitySessionMixEntry";
ALTER TABLE "new_QualitySessionMixEntry" RENAME TO "QualitySessionMixEntry";
CREATE UNIQUE INDEX "QualitySessionMixEntry_segmentId_zone_key" ON "QualitySessionMixEntry"("segmentId", "zone");
CREATE TABLE "new_TrainingTrackSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL CHECK ("kind" IN ('endurance', 'strength')),
    "phaseId" TEXT,
    "ramp" REAL,
    "boundaryStep" REAL,
    "recoveryCut" REAL,
    "taperCut" REAL,
    "startWeekKey" TEXT,
    "weeks" INTEGER,
    -- ACSM 2026's three goals, under the field's own term for the middle one
    -- (ADR 0047 §3). The %1RM band and rep range derive from this token and are
    -- never authored beside it, so the two cannot disagree.
    "goal" TEXT CHECK ("goal" IS NULL OR "goal" IN ('hypertrophy', 'maximal-strength', 'power')),
    -- Strength Frequency (ADR 0047 §4). A block with a frequency of zero is a
    -- block with no lifting in it, which is expressed by the segment not existing.
    "sessionsPerWeek" INTEGER CHECK ("sessionsPerWeek" IS NULL OR "sessionsPerWeek" >= 1),
    "deloadCut" REAL,
    "deloadWeeks" INTEGER,
    "trackId" TEXT NOT NULL,
    CONSTRAINT "TrainingTrackSegment_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PlanOutlinePhase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingTrackSegment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TrainingTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- An endurance segment spans exactly one phase (ADR 0042 §8); a strength
    -- segment floats free of them and carries its own dated span (ADR 0047 §6).
    -- Neither kind may borrow the other's fields — positioning as before, and now
    -- the Strength Goal and the Strength Frequency, which an endurance segment has
    -- no more business carrying than a start week.
    -- Every nullable column is tested with IS NOT NULL before it is compared:
    -- `"weeks" >= 1` evaluates to NULL when weeks is NULL, and a CHECK passes on
    -- NULL, so a bare comparison would let the missing value through.
    CONSTRAINT "TrainingTrackSegment_kind_position" CHECK (
        ("kind" = 'endurance' AND "phaseId" IS NOT NULL AND "startWeekKey" IS NULL AND "weeks" IS NULL AND "goal" IS NULL AND "sessionsPerWeek" IS NULL)
        OR ("kind" = 'strength' AND "phaseId" IS NULL AND "startWeekKey" IS NOT NULL AND "weeks" IS NOT NULL AND "weeks" >= 1)
    )
);
INSERT INTO "new_TrainingTrackSegment" ("boundaryStep", "deloadCut", "deloadWeeks", "id", "kind", "phaseId", "ramp", "recoveryCut", "startWeekKey", "taperCut", "trackId", "weeks") SELECT "boundaryStep", "deloadCut", "deloadWeeks", "id", "kind", "phaseId", "ramp", "recoveryCut", "startWeekKey", "taperCut", "trackId", "weeks" FROM "TrainingTrackSegment";
DROP TABLE "TrainingTrackSegment";
ALTER TABLE "new_TrainingTrackSegment" RENAME TO "TrainingTrackSegment";
CREATE INDEX "TrainingTrackSegment_phaseId_idx" ON "TrainingTrackSegment"("phaseId");
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_phaseId_key" ON "TrainingTrackSegment"("trackId", "phaseId");
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_startWeekKey_key" ON "TrainingTrackSegment"("trackId", "startWeekKey");
-- The parent key the mix's composite foreign key resolves against. Leading with
-- `id` means it also serves lookups by id alone, so it costs no reachability.
CREATE UNIQUE INDEX "TrainingTrackSegment_id_kind_key" ON "TrainingTrackSegment"("id", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
