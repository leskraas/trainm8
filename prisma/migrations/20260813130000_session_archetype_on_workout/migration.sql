-- Give a Workout the **Session Archetype** axis, and make a Catalogue member's
-- copy of it structurally the same value (ADR 0055; research:
-- docs/research/workout-taxonomy.md §1, §8, §9.1).
--
-- `Workout.intent` is the intensity axis wearing an archetype's name. Six of
-- `WORKOUT_INTENTS`' fifteen members — `recovery`, `endurance`, `tempo`,
-- `threshold`, `vo2max`, `anaerobic` — are verbatim the strings
-- `zoneLabelToZone()` maps onto Training Zone 1–5, four more are Strength Goals
-- that ADR 0047 rehoused, and only `race` and `test` are genuine archetypes. So a
-- 30-minute recovery jog, a 70-minute easy run and a 3-hour long run are all
-- `intent: 'endurance'`, and there is no value at all for *long*, *fartlek*,
-- *brick*, *steady* or *race simulation*. ADR 0042 caught the identical
-- conflation one level up, at phase scope.
--
-- Three notes on what this makes structural and what it deliberately does not.
--
-- **One. The column is authored, and a *reading* is never written to it.** ADR
-- 0042's derived-never-authored rule forbids a second source of truth for
-- something the model already holds; for a session weeks out the model holds
-- nothing to derive from, which is why ADR 0042 §9 authors the Quality Session
-- Mix for exactly that case. What *is* context-dependent — a 100-minute run being
-- `easy` in a 120 km week and `long` in a 50 km one — lives on the derived side,
-- which `app/utils/archetype-classification/` computes at read time and which has
-- no column anywhere. A stored reading would freeze a 28-day window that keeps
-- moving, and every later backfill would have to move it again. Same rule ADR
-- 0035 already holds: store the measured value, derive the label.
--
-- **Two. NULL means nobody stated one.** That reading is unambiguous *because* a
-- reading is never stored here. There is no "unknown" and no "not yet classified"
-- to confuse it with.
--
-- **Three. A Catalogue member's `archetype` cannot drift from its Workout's.** The
-- axis now exists in two places, which without enforcement is the second source
-- of truth this migration exists to remove. `CatalogueEntry` already carries its
-- parent's `authorship` for the Citation rule, pinned by a composite foreign key;
-- this extends that same key to a third column, so `CatalogueEntry.archetype`
-- must equal `Workout.archetype` and `ON UPDATE CASCADE` carries an edit of the
-- parent through. It also makes the corollary structural: a Catalogue member's
-- Workout cannot have a NULL archetype, because no NULL parent value can satisfy
-- a non-null child one. As with the Citation, this repo declines triggers — they
-- are invisible in `schema.prisma` and lost to a later table rebuild — and a
-- rebuild carries no CHECK forward, so every constraint below is restated in
-- full and pinned by `app/utils/catalogue.constraints.test.ts`.
--
-- **Nobody's numbers move.** An archetype is a label; no threshold, TSS, CTL, ATL
-- or TSB is read or written here, so no Load Recompute Notice is owed. One
-- *comparison* does change character: `getLastSimilarSession` stops matching on
-- `intent` and matches on this axis instead, so a session with no archetype now
-- shows the Unavailable state rather than a delta against a session that was
-- never comparable. That is a wrong answer being withdrawn, not a number moving,
-- and the surface says which of the two absences it is.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Workout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discipline" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    -- Session Archetype (CONTEXT.md, ADR 0055): what kind of session this
    -- prescription *is*. Authored; a reading is never stored. NULL means nobody
    -- stated one. The vocabulary is pinned here as well as on `CatalogueEntry`
    -- because a Workout outside the Catalogue reaches no other CHECK.
    "archetype" TEXT CHECK ("archetype" IS NULL OR "archetype" IN (
        'recovery', 'easy', 'long', 'steady', 'tempo', 'threshold', 'sub-threshold',
        'vo2max-long', 'vo2max-short', 'anaerobic', 'neuromuscular', 'fartlek',
        'race-simulation', 'test', 'brick', 'technique'
    )),
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
-- The parent key the entry's three-column relation points at.
CREATE UNIQUE INDEX "Workout_id_authorship_archetype_key" ON "Workout"("id", "authorship", "archetype");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- ---------------------------------------------------------------------------
-- Backfill: only what can be *sourced*. A migration must never invent an
-- archetype it cannot point at, and every row it leaves NULL is a row that
-- honestly has no statement about it.
-- ---------------------------------------------------------------------------

-- 1. A Catalogue member already has an authored archetype on its entry, put there
-- by the source that published the row. Copying it up is not a derivation; it is
-- the same statement, and the three-column foreign key added below requires the
-- two to agree, so this must run before it exists.
UPDATE "Workout" SET "archetype" = (
    SELECT e."archetype" FROM "CatalogueEntry" e WHERE e."workoutId" = "Workout"."id"
)
WHERE "archetype" IS NULL
  AND EXISTS (SELECT 1 FROM "CatalogueEntry" e WHERE e."workoutId" = "Workout"."id");

-- 2. A session **placed from the Catalogue** or **adopted from a generated week**
-- is a deep copy whose `copiedFromId` chain reaches a corpus row (ADR 0051 §5,
-- #460), and that row was published *as* a threshold session. So the archetype is
-- inherited rather than guessed. The walk stops at the first ancestor that is a
-- Catalogue member and is capped at `MAX_LINEAGE_HOPS` (16, `workout.server.ts`)
-- — the same cap the runtime walk uses, and the same guard against a cycle
-- SQLite's CHECK cannot forbid.
WITH RECURSIVE "lineage"("root", "node", "depth") AS (
    SELECT w."id", w."copiedFromId", 1
      FROM "Workout" w
     WHERE w."archetype" IS NULL AND w."copiedFromId" IS NOT NULL
    UNION ALL
    SELECT l."root", p."copiedFromId", l."depth" + 1
      FROM "lineage" l
      JOIN "Workout" p ON p."id" = l."node"
     WHERE l."depth" < 16
       -- Stop at the first Catalogue member: the *nearest* published ancestor is
       -- the one this copy came from, and a further hop would attribute it to a
       -- row it was never a copy of.
       AND NOT EXISTS (SELECT 1 FROM "CatalogueEntry" e WHERE e."workoutId" = l."node")
)
UPDATE "Workout" SET "archetype" = (
    SELECT e."archetype"
      FROM "lineage" l
      JOIN "CatalogueEntry" e ON e."workoutId" = l."node"
     WHERE l."root" = "Workout"."id"
     ORDER BY l."depth" ASC
     LIMIT 1
)
WHERE "archetype" IS NULL
  AND EXISTS (
      SELECT 1 FROM "lineage" l
        JOIN "CatalogueEntry" e ON e."workoutId" = l."node"
       WHERE l."root" = "Workout"."id"
  );

-- 3. The one honest identity map out of `intent`. `workout-taxonomy.md` §1.1
-- reads the fifteen intents and finds that "only `race` and `test` are genuine
-- archetypes" — and `race` has no counterpart here, because `race-simulation` is
-- a *rehearsal* of a race and not a race. So `test` transfers and nothing else
-- does. Mapping `endurance` to `easy` would be precisely the fabrication this
-- migration exists to end: the athlete picked a zone word, and it cannot say
-- whether they meant a recovery jog, an easy run or a three-hour long run.
-- `anaerobic` and `neuromuscular` are refused for the same reason even though the
-- strings match — both are adaptation words on the intensity axis, and
-- `zoneLabelToZone()` maps `anaerobic` straight to Zone 5.
UPDATE "Workout" SET "archetype" = 'test'
WHERE "archetype" IS NULL AND "intent" = 'test';

-- ---------------------------------------------------------------------------
-- Now the entry's copy can be pinned to the parent's.
-- ---------------------------------------------------------------------------

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CatalogueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workoutId" TEXT NOT NULL,
    -- The parent's authorship, carried here so the citation rule below can be an
    -- intra-row CHECK. Pinned to the parent by the composite foreign key.
    "workoutAuthorship" TEXT NOT NULL DEFAULT 'athlete' CHECK ("workoutAuthorship" IN ('system', 'athlete')),
    -- Session Archetype (CONTEXT.md): the corpus's primary retrieval filter, and
    -- since ADR 0055 also the parent's own column. The foreign key below is what
    -- makes the two one value rather than two statements.
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
    -- Three columns, not two: the parent's authorship *and* its archetype travel
    -- into the child, so neither can disagree with the row it belongs to.
    CONSTRAINT "CatalogueEntry_workoutId_workoutAuthorship_archetype_fkey" FOREIGN KEY ("workoutId", "workoutAuthorship", "archetype") REFERENCES "Workout" ("id", "authorship", "archetype") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CatalogueEntry_progressesToId_fkey" FOREIGN KEY ("progressesToId") REFERENCES "CatalogueEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CatalogueEntry_regressesToId_fkey" FOREIGN KEY ("regressesToId") REFERENCES "CatalogueEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CatalogueEntry" ("archetype", "citationAuthor", "citationLocator", "citationWork", "citationYear", "createdAt", "id", "level", "progressesToId", "regressesToId", "retiredAt", "updatedAt", "workoutAuthorship", "workoutId") SELECT "archetype", "citationAuthor", "citationLocator", "citationWork", "citationYear", "createdAt", "id", "level", "progressesToId", "regressesToId", "retiredAt", "updatedAt", "workoutAuthorship", "workoutId" FROM "CatalogueEntry";
DROP TABLE "CatalogueEntry";
ALTER TABLE "new_CatalogueEntry" RENAME TO "CatalogueEntry";
CREATE UNIQUE INDEX "CatalogueEntry_workoutId_key" ON "CatalogueEntry"("workoutId");
CREATE INDEX "CatalogueEntry_archetype_idx" ON "CatalogueEntry"("archetype");
CREATE INDEX "CatalogueEntry_progressesToId_idx" ON "CatalogueEntry"("progressesToId");
CREATE INDEX "CatalogueEntry_regressesToId_idx" ON "CatalogueEntry"("regressesToId");
CREATE UNIQUE INDEX "CatalogueEntry_workoutId_workoutAuthorship_key" ON "CatalogueEntry"("workoutId", "workoutAuthorship");
-- Prisma reads the three-column relation as one-to-one only with the whole key
-- unique on the defining side.
CREATE UNIQUE INDEX "CatalogueEntry_workoutId_workoutAuthorship_archetype_key" ON "CatalogueEntry"("workoutId", "workoutAuthorship", "archetype");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
