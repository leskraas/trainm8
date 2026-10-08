-- **A plan row written before #505 is the machine's, unless the athlete edited
-- it.** (#505, ADR 0080.) A data migration, no DDL.
--
-- Before #505 a stamped **Week Pattern** and a copied week wrote their sessions
-- as `authored`. Ownership now reads `authored` as "the athlete's", so those
-- legacy rows would count as the athlete's: a confirmed re-stamp keeps them and
-- lays the new week beside them, which leaves the week twice over, and the Week
-- Replan's silence would never touch them.
--
-- The rows are recognizable: `authored` **and** anchored to a **Target Event**
-- (`targetEventId`). No athlete-facing surface writes that pair — a session the
-- athlete places on a date carries no Event anchor (`catalogue.server.ts`) — so
-- they are the plan's materializations. Each gets `source = 'generated'`, the
-- value stamp and copy-week write since #505.
--
-- What the athlete did to one since is the one thing that cannot be read back:
-- before #460's `adoptedAt`, an edit left no mark on an `authored` row. So where
-- the row was updated more than a minute after it was created (`updatedAt >
-- createdAt + 1 min`), it is treated as adopted, `adoptedAt = updatedAt`. That
-- errs toward protecting anything the athlete may have touched: a reschedule
-- would read as an edit here, while #459/#460 say it does not adopt. A stamp or
-- copy writes a row in one transaction, well inside the minute. Rows Prisma
-- wrote store their dates as epoch milliseconds, so `+ 60000` is one minute; a
-- row with a text date compares as larger than any number in SQLite, so it
-- reads as edited, which is the protective side again.
--
-- Rows already adopted or released are left alone (`adoptedAt IS NULL`; no
-- legacy `authored` row carries either, since adoption only ever fired on a
-- `generated` or `detected` session).
--
-- **No stored number moves. No Load Recompute Notice is owed.** Only `source`
-- and `adoptedAt` change: no load, TSS, Planned TSS, date or step quantity is
-- rewritten, and the ledger, snapshot and history read exactly as before. No
-- corpus data ships here.

UPDATE "WorkoutSession"
SET
    "adoptedAt" = CASE
        WHEN "updatedAt" > "createdAt" + 60000 THEN "updatedAt"
        ELSE NULL
    END,
    "source" = 'generated'
WHERE "source" = 'authored'
  AND "targetEventId" IS NOT NULL
  AND "adoptedAt" IS NULL
  AND "releasedAt" IS NULL;
