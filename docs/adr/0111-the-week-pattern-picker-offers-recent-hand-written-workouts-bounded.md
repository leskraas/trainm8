# The Week Pattern picker offers recent hand-written Workouts, bounded

Status: Accepted (interim) · Resolves #442 · Amends ADR 0037's factual claim

## Context

`getAuthoredWorkouts` returned every `Workout` the athlete owns. Since ADR 0003
gives every session a private 1:1 Workout, that was every session ever planned,
including every stamped week, so the fixed-day picker in Avansert grew without
bound. ADR 0037's claim that `workout.findMany` does not exist is stale: it did,
here, and this change narrows it.

## Decision

1. **What the picker offers: recent use, the athlete's own, bounded.** The
   Workouts behind the athlete's `authored` sessions (hand-written, or placed
   from the Catalogue), newest session first, one per title within a discipline,
   at most 12 per discipline. `generated`, `recorded` and `detected` sessions
   are the machine's copies, not choices, and are left out.
2. **Discipline matching is server-side as well as client-side.** The loader
   asks only for the disciplines the plan's tracks hold; the form still filters
   to the chosen track, and `addWeekPatternDay` still refuses a mismatch.
3. **Ownership is unchanged.** The picker offers nothing `addWeekPatternDay`
   would refuse: it stays owner-scoped.
4. **The Catalogue and the saved list are not offered yet.** A stock or saved
   community Workout is not the athlete's, and the service refuses it. Offering
   it needs fork-on-pick (below), which is the next step, not this one.

## Considered

- **Read the saved list (`CatalogueSave`)**: the right long-term answer (ADR
  0051 §1, "it is in my list"), but every row in it is someone else's Workout,
  so it needs the service change below first.
- **Search**: more UI for a list that is now at most 12 per discipline.

## Open for the owner

- **Proposed, owner to confirm:** fork-on-pick. When a pattern day picks a
  Workout, the day gets its own private copy (`copyWorkout`, `copiedFromId` to a
  Catalogue source). That lets the picker offer the saved list and stock rows,
  and it closes a live hazard found here: a pattern day that points at a
  session's own Workout loses it (`onDelete: SetNull`) when that session is
  deleted or a week is re-laid, and changes when that session is edited.

## Deferred hardening

- A fixed or share pattern day references a session's own Workout by id, so the
  referenced row's lifetime and contents are controlled by the session, not the
  pattern (see above). Not a cross-athlete hole: both rows are owner-scoped.
- When fork-on-pick lands, it must gate a non-owned pick on
  `readRetrievableEntry` (visible, not reported, not retired) inside the same
  transaction, and a community row taken down later will survive in pattern
  copies, as it already does in placed sessions.
