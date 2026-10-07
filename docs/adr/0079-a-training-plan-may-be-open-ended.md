# A Training Plan may be open-ended, and each round of it is an ordinary phase

Status: Accepted

**Amends [ADR 0044](./0044-plan-outline-is-relational.md) §1**, whose table
diagram makes the Plan Outline _"1:1 with Event"_ (line 155): an Outline may
now have no Event. **Confirms [ADR 0009](./0009-event-as-plan-anchor.md)**,
which already says _"A `TrainingPlan` anchors to zero or more Events"_ (line
32) — the schema and the glossary were stricter than the ADR, not the other way
round. Decided in the 2026-10-07 design grill.

## Context

The product has two kinds of athlete. One sets up a season toward a race. The
other — _"bare hold meg aktiv"_ — wants a plan that suits their level and has no
race at all. Today that athlete cannot have a plan: `PlanOutline.eventId` is
required and `@unique` (`prisma/schema.prisma:1271-1272`), and the glossary
defined a **Training Plan** as anchored to a **Target Event**.

## Decision

1. **A Training Plan is either anchored to a Target Event or open-ended** — no
   Event and no end date. It is a real plan, not a plan toward an invented one.
2. **Each round of an open-ended plan is an ordinary Plan Outline phase**, named
   freely ("Blokk 4"). The next phase is appended when the current one ends.
   There is no separate cycle concept, and "Block" stays a workout term.
3. **The next round's volume is a proposal with its reason**, never applied
   silently: more after a round done to plan, the same after a round with missed
   weeks. The athlete accepts or changes it.
4. **Adding an Event later ends the current round early** and lays phases toward
   the Event from there. The plan becomes an ordinary plan toward that Event.
5. **Every Periodization Preset family can drive an open-ended plan**: one round
   is one block of the family's rhythm (three hard weeks and one easy for
   Klassisk 3:1, two and one for Masters 2:1).

## Considered options

- **A far-off "season end" Event, renewed when reached.** Rejected: it is a lie
  in the data, and every surface that reads an Event (countdown, taper, event
  fit) would act on a race that does not exist.
- **A new Cycle concept beside phases.** Rejected: a phase already carries a
  name, a length and the rhythm that says which weeks recover. A second concept
  would duplicate all three.

## Consequences

- `PlanOutline.eventId` becomes optional. Everything that scopes plan sessions
  by `targetEventId` needs an open-ended path — for example `clearPlanWeek`
  (`app/utils/plan-outline/week-sessions.server.ts:84`) and the stamped-session
  anchor ADR 0044 describes (line 80).
- The event-fit parts of [ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md)
  (§2, §3) do not apply to an open-ended plan: there is nothing to fit to.
- Appending rounds and proposing their volume is new behaviour; it lands
  through the same proposal surface as the redesigned **Week Replan**.
