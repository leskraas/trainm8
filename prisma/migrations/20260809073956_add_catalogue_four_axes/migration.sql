/*
  The **Catalogue**'s four axes (#448, ADR 0051), resolved on #438.

  Authorship, membership, collection and visibility are four orthogonal questions
  about one Workout, and the model that collapsed any two of them was wrong:

    - **Authorship**  `Workout.authorship` + nullable `Workout.ownerId` — who wrote it
    - **Membership**  a `CatalogueEntry` row, 1:1 — is it offered for reuse at all
    - **Collection**  a `CatalogueSave` row, many — is it in *this* athlete's list
    - **Visibility**  `Workout.visibility` — who may read it (unchanged here; #452)

  Three constraint notes, all about what SQLite makes structural and what it does
  not.

  **One.** `Workout.ownerId` moves from `NOT NULL`/`ON DELETE CASCADE` to nullable
  with `ON DELETE SET NULL`, which SQLite cannot do in place — hence the table
  rebuild below. The `INSERT … SELECT` carries every existing column across
  unchanged; `authorship` takes its `'athlete'` default and `copiedFromId` is NULL,
  which is correct for every row that exists today (all of them have an owner and
  none is a fork).

  **Two.** Asserted authorship is what makes `SET NULL` safe. `Exercise` already
  ships the cheap alternative and already has the bug: `createdByAthleteId` goes
  null when an author's account is deleted, and `getExerciseCatalog`
  (`app/utils/workout.server.ts`) then serves that row to everyone as a
  trainm8-authored entry. The inference cannot tell *"nobody wrote this"* from
  *"the author is gone."* So the CHECK below is the **implication** —
  `authorship = 'system'` ⟹ `ownerId IS NULL` — and deliberately not the
  biconditional: an orphaned athlete-authored row must stay expressible and read
  "author gone", never "trainm8 says so".

  **Three.** "A Citation only on a system-authored row" is a cross-table rule and a
  CHECK cannot reach another table. It is enforced the way
  `QualitySessionMixEntry.segmentKind` already enforces its parent's kind: the
  parent's discriminator travels into the child as `CatalogueEntry.workoutAuthorship`,
  a composite foreign key requires it to match `Workout (id, authorship)`, and an
  intra-row CHECK forbids citation columns unless it reads `'system'`. `ON UPDATE
  CASCADE` closes the back door — demoting a cited Workout to `'athlete'` cascades
  into the entry and is then rejected by that CHECK. This repo declines triggers for
  the reason the earlier migrations give: they are invisible in `schema.prisma` and
  lost to a later table rebuild.

  A rebuild carries no CHECK forward, so every constraint here lives in the
  migration history and is pinned by `app/utils/catalogue.constraints.test.ts`.
*/

-- CreateTable
CREATE TABLE "CatalogueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    -- The parent's authorship, carried here so the citation rule below can be an
    -- intra-row CHECK. Pinned to the parent by the composite foreign key.
    "workoutAuthorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("workoutAuthorship" IN ('system', 'athlete')),
    -- Session Archetype (CONTEXT.md): the corpus's primary retrieval filter.
    "archetype" TEXT NOT NULL CHECK ("archetype" IN (
        'recovery', 'easy', 'long', 'steady', 'tempo', 'threshold', 'sub-threshold',
        'vo2max-long', 'vo2max-short', 'anaerobic', 'neuromuscular', 'fartlek',
        'race-simulation', 'test', 'brick', 'technique'
    )),
    -- The level floor. NULL is a positive statement — not level-scoped.
    "level" TEXT CHECK ("level" IS NULL OR "level" IN ('beginner', 'intermediate', 'advanced')),
    "citationAuthor" TEXT,
    "citationWork" TEXT,
    "citationYear" INTEGER,
    "citationLocator" TEXT,
    "progressesToId" TEXT,
    "regressesToId" TEXT,
    "retiredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    -- A **Citation** is the published authority a Stock Workout comes from, and it
    -- is structurally unavailable to an athlete-authored row. A nullable citation
    -- an athlete may fill puts "Daniels 2013" on a session Daniels never wrote, in
    -- the same slot as real authority; a community row carries an **Attribution**
    -- and an explicit non-vouch instead (#452).
    CONSTRAINT "CatalogueEntry_citation_is_system_only" CHECK (
        "workoutAuthorship" = 'system'
        OR (
            "citationAuthor" IS NULL AND "citationWork" IS NULL
            AND "citationYear" IS NULL AND "citationLocator" IS NULL
        )
    ),
    -- Who and what travel together: a year or a DOI with no work named is not a
    -- citation, it is a fragment wearing one's clothes.
    CONSTRAINT "CatalogueEntry_citation_whole" CHECK (
        ("citationAuthor" IS NULL) = ("citationWork" IS NULL)
        AND ("citationYear" IS NULL OR "citationWork" IS NOT NULL)
        AND ("citationLocator" IS NULL OR "citationWork" IS NOT NULL)
    ),
    -- A progression edge points somewhere else.
    CONSTRAINT "CatalogueEntry_progression_not_self" CHECK (
        ("progressesToId" IS NULL OR "progressesToId" <> "id")
        AND ("regressesToId" IS NULL OR "regressesToId" <> "id")
    ),
    CONSTRAINT "CatalogueEntry_workoutId_workoutAuthorship_fkey" FOREIGN KEY ("workoutId", "workoutAuthorship") REFERENCES "Workout" ("id", "authorship") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogueEntry_progressesToId_fkey" FOREIGN KEY ("progressesToId") REFERENCES "CatalogueEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CatalogueEntry_regressesToId_fkey" FOREIGN KEY ("regressesToId") REFERENCES "CatalogueEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogueEntryPhase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    -- No rows means "not phase-scoped", which is a positive statement and not
    -- "unknown" — the same reading `QualitySessionMixEntry` already documents.
    "phase" TEXT NOT NULL CHECK ("phase" IN ('base', 'build', 'peak', 'taper', 'race-week')),
    CONSTRAINT "CatalogueEntryPhase_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogueEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogueEntryGoalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    -- The six RACE_ANCHORS plus the two the trail/ultra rows need. The Discipline
    -- comes from the Workout, so this names the distance only. An enumerated set,
    -- never a free distance — the same rule the race anchors already carry.
    "goalEvent" TEXT NOT NULL CHECK ("goalEvent" IN ('1500m', '3k', '5k', '10k', 'hm', 'marathon', 'trail', 'ultra')),
    CONSTRAINT "CatalogueEntryGoalEvent_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogueEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CatalogueSave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogueSave_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogueSave_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
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
    "visibility" TEXT NOT NULL DEFAULT 'private',
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
INSERT INTO "new_Workout" ("createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility") SELECT "createdAt", "description", "discipline", "id", "intent", "ownerId", "title", "updatedAt", "visibility" FROM "Workout";
DROP TABLE "Workout";
ALTER TABLE "new_Workout" RENAME TO "Workout";
CREATE INDEX "Workout_ownerId_idx" ON "Workout"("ownerId");
CREATE INDEX "Workout_copiedFromId_idx" ON "Workout"("copiedFromId");
CREATE UNIQUE INDEX "Workout_id_authorship_key" ON "Workout"("id", "authorship");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueEntry_workoutId_key" ON "CatalogueEntry"("workoutId");

-- CreateIndex
CREATE INDEX "CatalogueEntry_archetype_idx" ON "CatalogueEntry"("archetype");

-- CreateIndex
CREATE INDEX "CatalogueEntry_progressesToId_idx" ON "CatalogueEntry"("progressesToId");

-- CreateIndex
CREATE INDEX "CatalogueEntry_regressesToId_idx" ON "CatalogueEntry"("regressesToId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueEntry_workoutId_workoutAuthorship_key" ON "CatalogueEntry"("workoutId", "workoutAuthorship");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueEntryPhase_entryId_phase_key" ON "CatalogueEntryPhase"("entryId", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueEntryGoalEvent_entryId_goalEvent_key" ON "CatalogueEntryGoalEvent"("entryId", "goalEvent");

-- CreateIndex
CREATE INDEX "CatalogueSave_ownerId_idx" ON "CatalogueSave"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueSave_workoutId_ownerId_key" ON "CatalogueSave"("workoutId", "ownerId");
