-- **Idempotence for the program advance, on a column that means only that.**
-- Adds `ProgramSessionApplication` — one row per (program run, session) that has
-- been folded in — and backfills the rows for the folds that already happened.
--
-- **No stored number moves.** Nothing here touches a load, a rep, an effective
-- kilo, a training max, a working weight, a Stall Count or any weight or stall
-- history. Every athlete's numbers read exactly the same afterwards. The only
-- effect is that a *second* Finish on a session can no longer advance a program
-- a second time, and that where the first fold's answer is on file it is
-- returned verbatim instead of being restated.
--
-- ## What was wrong
--
-- `recordProgramSession` guarded the double fold with a conditional `UPDATE` on
-- `WorkoutSession.status` — atomic, and inside the advancing transaction, but
-- resting on **shared state**. `status` is calendar and list state that other
-- surfaces own; anything that ever set a completed session back to `scheduled`
-- would re-open the fold, and the same log would advance the program twice,
-- duplicating the weight and stall history. That history is the one piece of
-- state no set log can re-derive, and it is the honest answer to *"why did my
-- squat drop 10 kg?"*.
--
-- The second fault was quieter: the first fold's *result* was stored nowhere, so
-- a second Finish rebuilt the outcomes from `weightHistory` and `stallHistory`.
-- The numbers and the verdicts came out right, but the sentences were restated
-- and the timestamp was the reading's rather than the original's.
--
-- Both are the same table. The unique index is the guard, and `outcomes` is the
-- first answer kept.
--
-- ## Why `appliedAt` and `outcomes` are nullable
--
-- A run that was already advanced before this migration has no stored answer and
-- no recorded time for it. The backfill below reconstructs *which* sessions were
-- folded in — from the `sessionId`s in each lift's `weightHistory`, which is
-- exactly the set of sessions the engine wrote — so the guard covers history
-- from the first minute. It cannot reconstruct when, or what was said, and it
-- does not pretend to: both columns stay NULL and the app restates those rows
-- the way it always did. The CHECK below states that the two are NULL together,
-- so "legacy row" is one condition and not two.
--
-- A `sessionId` whose `WorkoutSession` has since been deleted is skipped: the
-- foreign key is the point of the table, and a row pointing at nothing would buy
-- no guard.

CREATE TABLE "ProgramSessionApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    -- When the fold happened. NULL on a backfilled row only — see above.
    "appliedAt" DATETIME,
    -- JSON `LiftOutcome[]`, the first fold's answer verbatim. NULL on a
    -- backfilled row only.
    "outcomes" TEXT,
    -- One condition, not two: a legacy row is the row with neither, and a row
    -- written by the app carries both.
    CONSTRAINT "ProgramSessionApplication_legacy_row_has_neither" CHECK (("appliedAt" IS NULL) = ("outcomes" IS NULL)),
    CONSTRAINT "ProgramSessionApplication_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "ProgramInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgramSessionApplication_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- **The guard itself.** Not an optimisation: the second insert fails here, in the
-- database, inside the transaction that advances the run.
CREATE UNIQUE INDEX "ProgramSessionApplication_instanceId_sessionId_key" ON "ProgramSessionApplication"("instanceId", "sessionId");
CREATE INDEX "ProgramSessionApplication_sessionId_idx" ON "ProgramSessionApplication"("sessionId");

-- The backfill: every session already named in a lift's weight history was
-- folded into that lift's run, and `DISTINCT` collapses the one row per lift
-- into the one row per run this table keeps.
INSERT INTO "ProgramSessionApplication" ("id", "instanceId", "sessionId", "appliedAt", "outcomes")
SELECT DISTINCT
       'psa_backfilled_' || "ProgramLiftState"."instanceId" || '_' || json_extract("entry"."value", '$.sessionId'),
       "ProgramLiftState"."instanceId",
       json_extract("entry"."value", '$.sessionId'),
       NULL,
       NULL
  FROM "ProgramLiftState", json_each("ProgramLiftState"."weightHistory") AS "entry"
 WHERE json_extract("entry"."value", '$.sessionId') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM "WorkoutSession"
        WHERE "WorkoutSession"."id" = json_extract("entry"."value", '$.sessionId')
   );
