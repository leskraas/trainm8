# A Training Plan may be open-ended, and each round of it is an ordinary phase

Status: Accepted

**Amends [ADR 0044](./0044-plan-outline-is-relational.md) §1**, whose table
diagram makes the Plan Outline _"1:1 with Event"_ (line 155): an Outline may now
have no Event. **Confirms [ADR 0009](./0009-event-as-plan-anchor.md)**, which
already says _"A `TrainingPlan` anchors to zero or more Events"_ (line 32) — the
schema and the glossary were stricter than the ADR, not the other way round.
Decided in the 2026-10-07 design grill.

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
- The event-fit parts of
  [ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md) (§2, §3)
  do not apply to an open-ended plan: there is nothing to fit to.
- Appending rounds and proposing their volume is new behaviour; it lands through
  the same proposal surface as the redesigned **Week Replan**.

## As built (#505 S5)

- **Schema** (migration
  `20261007191933_an_open_ended_plan_owns_itself_and_the_sessions_it_laid`):
  `PlanOutline.athleteId` (backfilled from the Event), `PlanOutline.eventId`
  optional and still unique (SQLite allows many NULLs),
  `WorkoutSession.planOutlineId` (SET NULL on delete; backfilled by joining
  `targetEventId` to `PlanOutline.eventId`), and
  `PlanOutlinePhase.recoveryWeekIndex` for #505 story 74, not yet read by the
  rhythm. No stored number moves.
- **At most one open-ended plan per athlete.** The app holds the rule in
  `createPlanOutline`, inside the creating transaction
  (`open-ended-already-active`); the database does not, since Prisma has no
  partial unique index.
- **Which plan is active** (`active-outline.server.ts`, `findActiveOutline`):
  the nearest upcoming, uncancelled Event carrying a phased Outline, else the
  open-ended Outline. A race is the more specific statement, so while a plan
  toward it runs the open-ended plan **rests**: stamp and copy-week refuse it
  (`plan-resting`), the horizon fill lays the race plan's weeks only, and the
  plan page says it is resting. It is active again once the Event has passed.
  Merging the two is §4's "adding an Event", built later.
- **Scope by plan, not by Event.** Every plan writer (stamp, copy-week, the
  horizon fill through the stamp, the generator, a make-up move) sets
  `planOutlineId`, and `clearPlanWeek`, `readWeekOccupancy`,
  `countWeeksWithSessions` and `countPlanLaidSessions` scope by it with the
  ownership gate kept. The backfill made an event-anchored path unnecessary, so
  none is kept. A plan deleted and re-created for the same Event takes back the
  sessions the deleted one laid (`targetEventId` that Event, `planOutlineId`
  null), so a re-stamp or the fill never lays the week twice. Ownership checks
  read `PlanOutline.athleteId` directly.
- **No Event, nothing invented.** `ActivePlan` and `AuthoredSeason` carry
  nullable event fields and a nullable `fit`. The home kicker has no countdown,
  the end cap names no race, the plan page offers no fit and no event link, and
  `fitPlanToEvent` refuses with `no-event`. The season chart flags no event
  week.
- **The horizon fill** works unchanged: with no end date, "past the plan's end"
  is past its last phase, where the stamp refuses the week. Appending the next
  round is #505 S6.
- **Making one**: _Hold meg aktiv_ on `/training/plan/new` asks for an endurance
  Discipline and hours a week (pre-filled from the last four weeks) and calls
  `createOpenEndedPlan`: this week, one round `Blokk 1` of four weeks at 3:1,
  one track in hours. No `fitness-goal` Event is created for it; the dated-goal
  form stays for an athlete who has a date. The plan page addresses it as
  `?outline=<id>` and shows _blokk n av ∞_, the round counted by phase position.

## As built (#505 S6)

No migration: a round is a phase, its proposal is a `WeekReplanProposal` row.

- **§2–3, the next round.** When the week that closes is the last week of the
  open-ended plan's last phase (or later, while no round is pending or
  appended), the Week Replan's facts carry the round (`readRoundFacts`,
  `open-ended-round.server.ts`) and the author adds one `add-phase` proposal
  (`proposeNextRound`, `propose-next-round.ts`): `Blokk n+1`, `afterPhaseId`,
  weeks and rhythm, and a volume `factor`. Its target is the plan, so
  `targetSessionId` is null and session ownership does not apply.
  - _Done to plan_ is read from the round's own weeks, all of the athlete's
    sessions, Planned against actual TSS summed **independently**
    (`weeklyLoad`): every week has Planned TSS and reaches
    `ADHERENCE_ON_TARGET_AT_OR_ABOVE` (85 %). A missed session counts as nothing
    done rather than dropping out, as it would from a Weekly Plan Adherence.
    Then `factor = ROUND_STEP_UP` (1.05 — the presets' +5 % convention, inside
    the ramp guard's 8 %), load direction `adds`: it waits for a yes.
  - A week under 85 % is a _missed week_; a week with no Planned TSS cannot be
    graded. Either gives `factor = 1`, `keeps-or-reduces`, and silence appends
    it the next morning. The reason says which, in Norwegian.
  - Applying (`appendOpenEndedRound`, `open-ended.server.ts`) appends the phase,
    with one endurance segment per endurance track carrying on the previous
    round's ramp, cuts and mix, and the factor as its **Block Boundary Step**
    (`factor − 1`; continuity at 1). Nothing applies when the plan has gained an
    Event or its last phase is no longer `afterPhaseId`. After commit the weeks
    from the round's start up to the current horizon are laid
    (`fillPlanWeeksToHorizon`, `horizon-fill.server.ts`, the fill the week
    change uses) — the closes before the append found them past the end. The
    current week is laid only on its Monday.
  - **The athlete's factor** (story 6):
    `acceptRoundWithFactor(userId, id, factor, now)` rewrites the stored payload
    and re-derives its load direction before applying; 0.5–1.5
    (`factor-out-of-range`), round proposals only (`factor-not-a-round`). A
    declined round is proposed again at the next close, so a no never silently
    ends the plan.
  - No `MAX_PLAN_WEEKS` check on an appended round: an open-ended plan has no
    end. Edits that check the cap (resize, add phase by hand) will refuse on a
    plan past 104 weeks — left for #505 S13.
- **§4, adding an Event.**
  `attachEventToOutline(userId, outlineId, eventId, now)`: the phase being lived
  is resized to the weeks lived, this one included, and any later phase goes;
  the family's run-up (`familyRunUp` — its standard length after the base block)
  is fitted to the weeks left by `fitRunUp`, which reuses `proposeFit` (the rule
  `fitPlanToEvent` applies, taper untouched) and drops the earliest blocks when
  even that cannot fit; `eventId` is set. After commit each later week the plan
  laid is re-laid through the stamp (`replace`, so `clearPlanWeek` does the
  gated clearing), or only cleared when the athlete adopted one of its plan
  sessions or the week is past the Event. Refusals: `outline-not-found`,
  `event-not-found`, `event-cancelled`, `event-past`, `event-already-planned`,
  `event-too-soon` (the Event is in this week). `addRaceToOpenEndedPlan` makes
  the race first and removes it again if the attach is refused.
- The plan page's open-ended hero offers _Legg til et løp_
  (`__attach-event.tsx`, words in `labels.ts`): the athlete's upcoming Events
  with no plan, or a name and a date; it lands on `?event=`.
- **§5.** `openEndedRound(family)` and `familyForRhythm` in `presets.ts`. An
  Outline records no family, so the round reads it off the last phase's rhythm;
  a phase with rhythm `none` repeats its own length.
