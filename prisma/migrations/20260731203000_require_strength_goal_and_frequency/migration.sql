/*
  A strength Training Track segment must carry a Strength Goal and a Strength
  Frequency. The per-kind CHECK asserted this nowhere; the code assumed it.

  `20260730141217_retire_volume_landmarks` added `goal` and `sessionsPerWeek` as
  strength-only columns and forbade an *endurance* row from carrying either, but
  left them unconstrained on a strength row. That made a strength segment with a
  null goal or a null frequency representable — and both readings of such a row
  disagree about it: `strengthSegmentReadings` drops it, so it never reaches the
  editor and can be neither fixed nor removed, while `strengthFitSegments` keeps
  counting it in the days-against-days check. The comment in the first of those
  claimed the CHECK made the state unreachable. This migration makes that true.

  ADR 0047 §3/§4 make the two what a strength segment *authors* — the counterpart
  to the endurance segment's Quality Session Mix — and neither has a documented
  convention to fall back to, so neither is a null the derivation could read as
  "follow the convention" the way the four cut columns are. A block the athlete
  has not decided the purpose or the frequency of is a block they have not
  authored yet, which is what `StrengthSegmentAddSchema` already requires of every
  write path: the schema and the database now say the same thing.

  The columns stay **nullable**, because an endurance row requires them null and
  the same two columns carry both kinds. Requiredness is per-kind and so it is the
  per-kind CHECK's to state, exactly as `startWeekKey` and `weeks` already are.

  The migration is free to run. Nothing but the demo seed authors a strength
  segment yet and both of its blocks carry a goal and a frequency, so the
  `INSERT … SELECT` below moves no row that the new CHECK would refuse.

  Two constraint notes carried over from that migration, both still load-bearing.

  First, a SQLite table rebuild carries **no CHECK forward** — they live only in
  the migration history and not in schema.prisma. Every one of them is restored
  verbatim below, along with all four indexes, and `constraints.test.ts` is what
  keeps a later rebuild from silently dropping one.

  Second, every nullable column is tested with IS NOT NULL before it is compared:
  a CHECK passes on NULL, so a bare comparison lets the missing value through.
  That is why the two new clauses are IS NOT NULL and not a comparison — the value
  vocabulary on `goal` and the `>= 1` on `sessionsPerWeek` stay column CHECKs,
  which is where they belong, since they hold for a NULL-permitted column too.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    -- Neither kind may borrow the other's *positioning*, and neither may borrow
    -- the other's authored second axis: the Strength Goal and the Strength
    -- Frequency, which an endurance segment has no more business carrying than a
    -- start week.
    -- What this migration adds is the other half of that: a strength segment must
    -- *carry* both. They are what it authors (ADR 0047 §3/§4), the counterpart to
    -- the endurance segment's Quality Session Mix, and neither has a convention to
    -- fall back to — so a null in either is an unauthored block rather than a
    -- deferred choice, and two readings of one such row already disagreed about it.
    -- The four cut columns are still deliberately left out of this. `recoveryCut`
    -- and `taperCut` read only on endurance and `deloadCut`/`deloadWeeks` only on
    -- strength, but that stays documentation — tightening it is a constraint of its
    -- own, and it would want the derivation reading them first.
    -- Every nullable column is tested with IS NOT NULL before it is compared:
    -- `"weeks" >= 1` evaluates to NULL when weeks is NULL, and a CHECK passes on
    -- NULL, so a bare comparison would let the missing value through.
    CONSTRAINT "TrainingTrackSegment_kind_position" CHECK (
        ("kind" = 'endurance' AND "phaseId" IS NOT NULL AND "startWeekKey" IS NULL AND "weeks" IS NULL AND "goal" IS NULL AND "sessionsPerWeek" IS NULL)
        OR ("kind" = 'strength' AND "phaseId" IS NULL AND "startWeekKey" IS NOT NULL AND "weeks" IS NOT NULL AND "weeks" >= 1 AND "goal" IS NOT NULL AND "sessionsPerWeek" IS NOT NULL)
    )
);
INSERT INTO "new_TrainingTrackSegment" ("boundaryStep", "deloadCut", "deloadWeeks", "goal", "id", "kind", "phaseId", "ramp", "recoveryCut", "sessionsPerWeek", "startWeekKey", "taperCut", "trackId", "weeks") SELECT "boundaryStep", "deloadCut", "deloadWeeks", "goal", "id", "kind", "phaseId", "ramp", "recoveryCut", "sessionsPerWeek", "startWeekKey", "taperCut", "trackId", "weeks" FROM "TrainingTrackSegment";
DROP TABLE "TrainingTrackSegment";
ALTER TABLE "new_TrainingTrackSegment" RENAME TO "TrainingTrackSegment";
CREATE INDEX "TrainingTrackSegment_phaseId_idx" ON "TrainingTrackSegment"("phaseId");
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_phaseId_key" ON "TrainingTrackSegment"("trackId", "phaseId");
CREATE UNIQUE INDEX "TrainingTrackSegment_trackId_startWeekKey_key" ON "TrainingTrackSegment"("trackId", "startWeekKey");
-- The parent key the mix's composite foreign key resolves against. `id` is already
-- the primary key, so this is a real second index bought for that one consumer —
-- the price of making the rule structural rather than a convention.
CREATE UNIQUE INDEX "TrainingTrackSegment_id_kind_key" ON "TrainingTrackSegment"("id", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
