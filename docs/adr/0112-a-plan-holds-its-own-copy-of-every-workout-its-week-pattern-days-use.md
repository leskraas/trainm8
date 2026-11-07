# A plan holds its own copy of every Workout its Week Pattern days use

Status: Accepted · Resolves #665 (part of #442) · Supersedes ADR 0111 §3–§4 and
its "Open for the owner" · Narrows ADR 0044 §7's `workoutId`

## Context

A **Week Pattern** day held its **Workout** by reference, and the row it
referenced was usually a **Workout Session**'s own (ADR 0003). The pattern and
the session were tied without the athlete knowing: editing the session changed
the pattern and every week stamped from it afterwards, and deleting the session
failed on `WeekPatternDay_kind_fields`, because a fixed or lifting day may not
lose its Workout. Accepting the strength offer and the first run tied the
lifting slots to the athlete's last completed strength session in the same way.
ADR 0111 named the hazard and proposed fork-on-pick for the owner to confirm.

## Decision

1. **A Plan Outline holds its days' Workouts.** Every write that gives a day a
   Workout gives it a **Held Workout**: a private copy (`copyWorkout`, owned by
   the athlete, `authorship = 'athlete'`, `copiedFromId` at the source) marked
   with `Workout.heldByOutlineId`. That is a foreign key to `PlanOutline` with
   `onDelete: Cascade`, so a plan's held rows go with it. The source can be a
   session's Workout or a **Stock Workout**. No session ever points at a held
   row: the stamp copies a day's Workout per session, as it always has.
2. **One copy per pick, and the plan's own days may share it.** The copy belongs
   to the plan, not to the day row. A Simple Activity's days, one write's
   lifting slots, and the same unit across the plan's patterns keep one id. This
   departs from #665's Scope, which asked for a copy per day: `track-days` keys
   a Simple Activity by its `workoutId`, deletes and rewrites its rows and
   undoes by id, so a copy per day row would split one activity into several.
3. **Pattern writes accept only rows this plan holds.** Anything else, such as
   the athlete's own Workout or a Stock Workout, is copied in through the one
   helper or refused. This replaces the owned-or-stock guards in
   `addWeekPatternDay`, `track-days` and `lifting-days`, so a crafted rewrite or
   an undo payload issued before this change cannot tie a day to a session
   again.
4. **Every write to a plan sweeps.** In the same transaction it deletes the
   plan's held rows that no day uses, sparing only the ids its own undo payload
   names. This covers removing a day, a pattern or a track, and rewriting days.
   Deleting the plan, its Event or the account cascades.
5. **The mark is a column and never an inference.** A Workout with days and no
   sessions cannot be told apart from a legitimate row, so `heldByOutlineId` is
   stated. Readers that list the athlete's own Workouts
   (`listOwnPublishableWorkouts`) and the publish flow skip held rows through
   one shared fragment. `getAuthoredWorkouts` reads through `authored` sessions,
   so a held row can never reach the picker.
6. **The CHECK is an implication.** It is
   `heldByOutlineId IS NULL OR authorship = 'athlete'`, and it does not require
   `ownerId`. `ownerId` is `SetNull` on the athlete's deletion (ADR 0051 §2) and
   `heldByOutlineId` cascades through the plan, and SQLite runs those two
   actions in an order tied to table order. A probe showed that
   `ownerId IS NOT NULL` in the CHECK makes a plain `DELETE FROM "User"` fail
   whenever `Workout` comes after `PlanOutline`, which is where Prisma's table
   redefinition puts it. The helper still writes the owner, so `deleteAccount`
   purges held rows with the rest (ADR 0105).
7. **`WeekPatternDay.workoutId` is `onDelete: NoAction`, not `SetNull`.** NO
   ACTION is checked at the end of the statement, so a cascade that removes a
   plan's days and its held rows passes in any order. A direct delete of a
   Workout a day still uses fails loudly instead of leaving the day with a null
   Workout.
8. **Existing plans are migrated in SQL.** For each plan, the migration
   deep-copies (Workout, WorkoutBlock, WorkoutStep, ExerciseSet) each Workout
   its days share with a session, a Stock Workout or another plan, and repoints
   the days. A Workout that only that plan's days use is marked held without a
   copy. An integration test pins that the next stamped week is identical before
   and after, across every column `workoutCopySelect` carries.

## Considered

- **A copy per day row** (the Scope's wording): it breaks the shipped
  delete-and-rewrite and undo in `track-days` (above).
- **Keep the reference and block deleting a session a day uses**: the athlete
  then holds a session they cannot remove, and edits still leak into the plan.
- **Infer held-ness from relations** ("has days, no sessions"): the Catalogue's
  "your sessions" list would show the copies, and an athlete's legitimate unused
  Workout would read as held.
- **A foreign key from the Workout to one day**: one owner per row, and it
  cascades away during delete-and-rewrite.

## Consequences

- ADR 0111 §3 ("ownership is unchanged") and §4 (the Catalogue is not offered
  because the service refuses non-owned rows) are superseded. Offering the saved
  list and stock rows in the picker is now a reader change over this helper
  (slice 2), still gated on `readRetrievableEntry` inside the transaction, as
  ADR 0111's deferred hardening says.
- A Citation still reads through `copiedFrom`: a held copy of a Stock Workout
  points at it. Stamped sessions are copied from the held row without a
  back-pointer, as they were copied from the stock row before.
- `deleteAccount` keeps deleting the athlete's pattern days before their
  Workouts, now because of NO ACTION rather than the CHECK.
