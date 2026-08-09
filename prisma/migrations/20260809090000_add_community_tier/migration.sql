/*
  The **community tier** (#452, ADR 0052) — `public` visibility, the **Attribution**
  a **Shared Workout** carries instead of a **Citation**, and the moderation gate
  the publish flow may not merge without.

  ADR 0037 landed `visibility` as inert groundwork and its own Revisit note set the
  gate: *"it shipped inert and is inert still, so `public` should not be added
  before a publish flow and a moderation gate consume it."* ADR 0051 §7 deferred the
  `Attribution` table on the same argument — a table with nothing able to write it
  would be ADR 0037 repeated verbatim. Both are discharged here, in one migration,
  because everything that consumes them lands with them.

  Three constraint notes.

  **One — the visibility vocabulary gets a CHECK.** It was an unconstrained string
  while it had exactly one value and nothing read it. A second value with a read
  path behind it is where `'publik'` becomes a row no query can reach and no
  moderator can find, so the vocabulary is pinned the way `authorship` already is.
  SQLite cannot add a CHECK in place, hence the table rebuild — which carries no
  constraint forward, so every CHECK `Workout` already had is restated below and
  pinned by `app/utils/catalogue.constraints.test.ts` and
  `app/utils/community.constraints.test.ts`.

  **Two — an Attribution is structurally impossible on a Stock Workout.** This is
  the mirror of the citation rule and it is built the same way, because the
  asymmetry is the whole point: community content can never look cited, and a
  trainm8-shipped session can never look like somebody's post. A CHECK cannot reach
  another table and this repo declines triggers, so the parent's discriminator
  travels into the child as `Attribution.workoutAuthorship`, a composite foreign key
  requires it to match `Workout (id, authorship)`, and an intra-row CHECK forbids
  `'system'`. `ON UPDATE CASCADE` closes the back door in both directions:
  promoting a published Workout to `'system'` cascades into the Attribution and is
  then rejected.

  **Three — a takedown is whole or absent**, and so is a report's resolution. A
  takedown date with no reason is a row the author cannot be told anything about,
  and a resolved report with no resolution is a queue entry that has silently
  stopped meaning anything.
*/

-- RedefineTables
-- `Workout.visibility` gains its vocabulary CHECK. Every other constraint and
-- index on this table is restated verbatim from
-- `20260809073956_add_catalogue_four_axes` — a rebuild carries none of them.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    -- Asserted, never inferred from `ownerId IS NULL`.
    "authorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("authorship" IN ('system', 'athlete')),
    -- Who may read it. `public` is reachable from #452 onward and only through
    -- the publish flow, which owes an Attribution for every row it writes here.
    "visibility" TEXT NOT NULL DEFAULT 'private' CHECK ("visibility" IN ('private', 'public')),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ownerId" TEXT,
    "copiedFromId" TEXT,
    -- The implication, not the biconditional: trainm8 never claims an athlete's
    -- session, and an orphaned athlete-authored row stays expressible.
    CONSTRAINT "Workout_system_has_no_owner" CHECK ("authorship" <> 'system' OR "ownerId" IS NULL),
    -- A fork is a copy of something else.
    CONSTRAINT "Workout_lineage_not_self" CHECK ("copiedFromId" IS NULL OR "copiedFromId" <> "id"),
    CONSTRAINT "Workout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workout_copiedFromId_fkey" FOREIGN KEY ("copiedFromId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Workout" ("authorship", "copiedFromId", "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility") SELECT "authorship", "copiedFromId", "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
CREATE INDEX "Workout_copiedFromId_idx" ON "Workout"("copiedFromId");
CREATE UNIQUE INDEX "Workout_id_authorship_key" ON "Workout"("id", "authorship");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "Attribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    -- The parent's authorship, carried here so the rule below can be an intra-row
    -- CHECK. Pinned to the parent by the composite foreign key.
    "workoutAuthorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("workoutAuthorship" IN ('system', 'athlete')),
    -- The publishing athlete's public identity, snapshotted at publish. A join
    -- would render an orphaned row as nobody, and what an athlete publishes under
    -- is their choice rather than a column somewhere else.
    "displayName" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenDownAt" DATETIME,
    "takedownReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    -- The mirror of `CatalogueEntry_citation_is_system_only`. An **Attribution** is
    -- what a Shared Workout displays *instead of* a Citation, so a trainm8-shipped
    -- session may not carry one — the asymmetry has to hold from both sides or it
    -- is a convention rather than a guarantee.
    CONSTRAINT "Attribution_is_athlete_only" CHECK ("workoutAuthorship" = 'athlete'),
    -- Whole or absent: an author told their session was removed and not told why
    -- has been told nothing.
    CONSTRAINT "Attribution_takedown_whole" CHECK (("takenDownAt" IS NULL) = ("takedownReason" IS NULL)),
    CONSTRAINT "Attribution_workoutId_workoutAuthorship_fkey" FOREIGN KEY ("workoutId", "workoutAuthorship") REFERENCES "Workout" ("id", "authorship") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkoutReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    -- SET NULL, never CASCADE: the report is a record about the content. A queue
    -- that empties itself when a reporter deletes their account is a takedown path
    -- an author can wait out.
    "reporterId" TEXT,
    -- See `REPORT_REASONS` in `app/utils/community.ts`.
    "reason" TEXT NOT NULL CHECK ("reason" IN ('unsafe', 'miscited', 'spam', 'abusive', 'other')),
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolution" TEXT CHECK ("resolution" IS NULL OR "resolution" IN ('taken-down', 'dismissed')),
    "resolvedById" TEXT,
    -- Whole or absent: a resolved report says how it was resolved, or it is still
    -- open. Anything between is a queue entry that has stopped meaning anything.
    CONSTRAINT "WorkoutReport_resolution_whole" CHECK (("resolvedAt" IS NULL) = ("resolution" IS NULL)),
    CONSTRAINT "WorkoutReport_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkoutReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkoutReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Attribution_workoutId_key" ON "Attribution"("workoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Attribution_workoutId_workoutAuthorship_key" ON "Attribution"("workoutId", "workoutAuthorship");

-- CreateIndex
CREATE INDEX "WorkoutReport_workoutId_idx" ON "WorkoutReport"("workoutId");

-- CreateIndex
CREATE INDEX "WorkoutReport_reporterId_idx" ON "WorkoutReport"("reporterId");

-- CreateIndex
CREATE INDEX "WorkoutReport_resolvedAt_idx" ON "WorkoutReport"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutReport_workoutId_reporterId_key" ON "WorkoutReport"("workoutId", "reporterId");
