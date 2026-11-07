# A generated plan keeps a Generation Record, and its weeks are laid again by the generator

Status: Accepted · Recorded on ticket #686 (part of #467) · **Amends
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md) §1**
(the seam gains a second function) **and its consequence "Coexistence and
regeneration remain unbuilt"**, and **amends
[ADR 0016](./0016-ai-plan-generation.md) §6** as #460 left it (what a re-lay
replaces, and where the batch lives). Follows
[ADR 0112](./0112-derived-never-authored-a-value-is-computed-unless-it-was-decided-observed-or-frozen-at-an-act.md)
§1 (what is stored),
[ADR 0080](./0080-week-replan-proposes-and-the-athletes-sessions-need-a-yes.md)
(ownership gates every machine write) and
[ADR 0109](./0109-editing-the-activities-in-meg-re-lays-the-plan-from-the-first-unbegun-week.md)
§7 as settled on #587 (the kept-slot rule is drawn out of the stamp once).

## Context

Every edit that changes how a plan's weeks are laid ends in `relayPlanFrom`: the
Sesong edits, the Season Anchor edit (#673), the strength offer, the week-replan
undo, the day choices, adding an Event, a philosophy switch. It re-lays a week
by stamping the plan's first **Week Pattern** with days, and a plan with none
has the week's machine sessions cleared and nothing laid.

A plan made by **Plan Generation** has no Week Pattern: `approveSeason` writes
the **Plan Outline** and the placed sessions, and the days it used
(`proposeStarterPattern` over the athlete's **Training Availability** then) are
thrown away. Nothing on the plan says it was generated, nor with which shape or
intent. So any of those edits empties every week it touches, including a **Week
Volume Override** that cannot change which session the generator places (ADR
0053 §6: placement never reads the week's number). The probe on #467's spec
records the paths.

## Decision

### 1. A **Generation Record** on the plan, written at approval

A 1:1 row beside the Plan Outline (`GenerationRecord`, `outlineId` unique,
cascading with the plan) with the **generator id**, the **Periodization Preset**
key it was approved with, the **intent**, and one row per Discipline and weekday
it placed on (`GenerationRecordDay`: Discipline, Monday-first weekday, `long` or
`ordinary`; unique per record, Discipline and weekday). `approveSeason` writes
it in the same transaction as the placed sessions, so a plan never holds a
generated season without its record.

Its existence is what "made by Plan Generation" means; nothing else on the plan
says so. All three values are ADR 0112 §1 storage: the shape and the intent are
the athlete's decisions at a dated act, and the days are a bake at that act
whose input (Training Availability) moves on afterwards. That is why a re-lay
reads the stored days and never the availability as it is now.

The record says nothing the rows already hold. The phases, rhythms, easy weeks,
tapers and **Quality Session Mix** a re-lay places from are the stored Plan
Outline's, so an edited plan is laid as it now stands; the goal event is read
off the Event, which the app still holds.

### 2. The seam places weeks as well as seasons

`SeasonGenerator` gains a second function, `placeWeeks(request, corpus)`: from
the plan's phases (as `PhaseSpec`s with `tapers`), each track's mix per phase,
the stored days, the goal event, the level floor and the week indices asked for,
it returns those weeks' placed sessions and unfilled slots. It is pure on the
same terms as `generate` (ADR 0053 §2).

`generate` is `placeWeeks` over the preset's phases and every week of the
season; the deterministic implementation builds one from the other, so there is
one placement rule (catalogue phase from the block's position, quality only in
loading weeks, race-week sessions in the last week, the week-and-day rotation).
A test pins that re-laying an unedited week of an approved plan places what
approval placed.

A re-lay goes through the seam with the implementation the record's generator id
names, never by importing the deterministic module, so a plan a later
implementation made is laid again by that implementation.

### 3. One rule picks how a plan's week is laid

A plan's week is laid from its first Week Pattern with days when it has one;
else from its Generation Record when it has one; else it has nothing to lay.
Both readers of that rule, the re-lay (`relayFutureWeeks`) and the horizon fill
(`layPlanWeek`), read it from one place. The pattern wins, so once the athlete
gives a generated plan days of their own, its weeks are laid as every plan's
are.

For a generated plan the re-lay covers the plan's weeks from the first one asked
for to its end (narrowed by `onlyWeekKeys` when the caller passes them),
including a week that holds none of its sessions yet, and clears the machine's
untrained sessions in a week past a shortened plan's end. Approval lays the
whole season, and so does a re-lay; the **Planning Horizon** limits only the
pattern path.

### 4. A re-lay keeps a placed session its week still asks for

In each week, a re-lay of a generated plan:

1. keeps every session outside `REPLACEABLE_SESSION`: the athlete's (authored,
   or adopted and not released) and any trained, skipped, missed or logged one.
   A kept session the plan laid fills its weekday's slot for its Discipline, by
   the same rule and the same function the stamp uses (`fillKeptSlots`, drawn
   out of `stamp.server.ts` as ADR 0109 §7 on #587 names it; whichever lands
   first draws it out). A session the athlete wrote (`authored`) stays where it
   is and fills no slot, as with every stamp;
2. keeps a replaceable session the plan laid when its **Stock Workout**
   (`copiedFromId`) still meets the criteria of an unfilled slot of the same
   Discipline in that week (`matchesCriteria`: archetypes, catalogue phase, goal
   event, level floor), preferring the slot on its own weekday. A kept one stays
   on the day it is on;
3. removes every other replaceable session the plan laid in that week, and
   places the generator's session in each slot still unfilled, through the same
   writer approval uses.

So an edit that changes only targets writes nothing, and a phase edit replaces
exactly the sessions whose slots changed. A slot the corpus has nothing for is
left empty, as at approval.

### 5. Plans generated before this record existed

A data migration writes a Generation Record for every Plan Outline that runs
toward an Event, has no Week Pattern day, and holds a `generated` session whose
Workout was copied from a `system` Workout with a Catalogue Entry: generator id
`deterministic-v1` (the only one there has been), and **no** preset key and
**no** intent, because neither was recorded. A null intent is read as the
default (`deliberately-building`) wherever the level floor is needed; it is not
written as if the athlete had chosen it.

Its days are not in the migration: they are weekdays in the athlete's timezone,
which SQLite cannot compute. The first re-lay of such a plan reads them off the
plan's own laid sessions in the athlete's timezone (per Discipline, the weekday
set most of its weeks hold, the long day the one its long-archetype sessions sat
on, else the last) and writes them to the record in the same transaction. From
then on the record is read like any other.

## Considered options

- **Write the generator's days as a Week Pattern.** Rejected: the stamp would
  then lay the weeks as share days scaled to the week's volume, which is not
  what the generator places, and the athlete's first Week Pattern edit would no
  longer be the moment the plan becomes theirs to lay.
- **Store the days in each track's Pinned days.** Rejected: Pinned days are the
  athlete's choice and always a subset of Training Availability; the generator's
  days are neither.
- **Columns on `PlanOutline` with the days as JSON.** Rejected: four nullable
  columns that must be all set or all unset, an invariant the database cannot
  state, on the table every plan reads.
- **Call the deterministic placement directly from the re-lay.** Rejected: it
  ties every generated plan to one implementation behind a seam whose point is
  that the implementation can change (ADR 0053 §1).
- **Clear and place every changed week again.** Rejected: a target-only edit
  would replace every session with a fresh copy, and a session the corpus would
  now choose differently (a row added since approval moves the rotation) would
  change under an edit that should not touch it.
- **Keep a session only when its exact Stock Workout is the one the generator
  would place now.** Rejected for the same corpus-growth reason.
- **Re-read the days from the athlete's Training Availability.** Rejected:
  contradicts what the athlete approved, and a changed availability would move
  sessions on an edit about something else.
- **Derive a legacy plan's days in SQL from UTC timestamps, or in a one-off
  script.** Rejected: UTC weekdays are wrong for athletes far from UTC, and
  production takes no operator step (`docs/agents/production-seed-data.md`).

## Consequences

- **ADR 0053's "Coexistence and regeneration remain unbuilt" is half built.**
  Laying a generated plan's weeks again, with the athlete's sessions in them, is
  this record. The athlete rebuilding the season is the next ticket of #467, and
  it reads the Generation Record for what it was approved with.
- **ADR 0016 §6's "batch key"** is the Generation Record, per plan. Sessions
  reach it through `planOutlineId`; no column is added to `WorkoutSession`. What
  a re-lay may replace is `REPLACEABLE_SESSION`, which is `adoptedAt IS NULL`
  (as amended by #460) narrowed to untrained, unlogged sessions.
- A track added to a generated plan after approval has no stored days, so the
  generated path places nothing for it; the strength track the offer adds is
  laid only once the plan has a Week Pattern. Editing a generated plan's days is
  out of #686's scope.
- `previewSeason` and the approval still regenerate the whole season (ADR 0053
  §2, §8); `placeWeeks` changes nothing they show.
