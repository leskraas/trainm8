# What the code does today with a generated season (probe by reading, checkout at 7211421)

## 1. A generated plan has no Week Pattern

`approveSeason` (`app/utils/plan-generation/generate.server.ts:500-568`) calls
`createPlanOutline` with `structure: { presetKey }` and then `writeSessions`. Neither
writes a `WeekPattern`: `createStarterWeekPattern` is only called from the
open-ended start (`authoring.server.ts:723`). The generator's days come from
`proposeStarterPattern` inside `generateDeterministicSeason`
(`deterministic.ts:275`) and are not stored.

## 2. Any re-lay of a generated plan's week empties it

`relayFutureWeeks` (`app/utils/plan-outline/open-ended.server.ts:663-721`) re-lays
every week from `fromWeekKey` that holds a non-`authored` session of the plan.
It looks for the plan's first Week Pattern with days; when there is none:

```ts
const restamped = pattern ? await stampWeekPattern(...) : null
if (!restamped?.ok) {
  await prisma.$transaction((tx) => clearPlanWeek(tx, userId, outlineId, weekKey, timezone))
}
```

`clearPlanWeek` deletes the plan's `REPLACEABLE_SESSION`s (machine-owned,
scheduled, no recording, no log). So on a generated plan, every caller of
`relayPlanFrom` deletes the generated sessions of the weeks it touches and lays
nothing: the Sesong edits (`season-edit.server.ts:151`, with `onlyWeekKeys`),
the Season Anchor edit in flight in #673 (same path), the strength offer
(`strength-offer.server.ts:184`), the week-replan undo, and the day edits that
go through `relayPlanFromFirstUnbegunWeek`.

The placed sessions do not depend on the week's target at all
(`generateDeterministicSeason` retrieves by discipline, archetype, catalogue
phase, goal event, level floor and a week+day rotation; ADR 0053 §6 forbids
rescaling). So a target-only edit, such as one Week Volume Override, deletes
sessions the generator would have placed identically.

## 3. Deleting the plan and generating again lays every week twice

`deletePlanOutline` deletes the Outline; `WorkoutSession.planOutlineId` is
`onDelete: SetNull` (`prisma/schema.prisma:1104`), so the generated sessions stay
on the calendar. A new plan for the same Event reclaims them
(`writePlanOutline`, `authoring.server.ts:516-529`). `approveSeason` then calls
`writeSessions`, which creates every session of the new season without clearing
anything: each future week holds the old season's sessions and the new one's.

## 4. Generating onto an Event that has a plan is refused

`createPlanOutline` refuses `event-already-planned` (one Outline per Event,
`PlanOutline.eventId @unique`), and the generate route's loader redirects to
`/training/plan?event=...` (`plan.generate.$eventId.tsx:166`). So the only
"regeneration" an athlete can reach is delete-then-generate, which is case 3.

## 5. What the plan does not record

Nothing on `PlanOutline` says it was made by Plan Generation, nor the intent
(level floor) or shape it was made with; `generationId`, `generatedByModel`
and `generatedAt` were dropped by #460. The intent is not derivable from the
stored rows.
