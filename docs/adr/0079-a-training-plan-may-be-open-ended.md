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

- **§2–3, the next round.** At the close of the open-ended plan's
  **second-to-last** week, the Week Replan's facts carry the round
  (`readRoundFacts`, `open-ended-round.server.ts`) and the author adds one
  `add-phase` proposal (`proposeNextRound`, `propose-next-round.ts`):
  `Blokk n+1`, `afterPhaseId`, weeks and rhythm, and a volume `factor`. A week
  early so the answer — the morning's silence included — lands before the
  horizon reaches the new round, and its first week is laid like any other. Its
  target is the plan: `targetSessionId` is null and session ownership does not
  apply.
  - **Graded on the weeks lived**, from the **planned** sessions in them only
    (Planned TSS, and the actual TSS of those sessions): an extra session the
    plan never asked for does not make a missed week done. _Done to plan_ is
    every graded week with planned sessions reaching
    `ADHERENCE_ON_TARGET_AT_OR_ABOVE` (85 %), a planned session not done
    counting as nothing done. Then `factor = ROUND_STEP_UP` (1.05 — the presets'
    +5 % convention, inside the ramp guard's 8 %), load direction `adds`: it
    waits for a yes. A week under 85 % (missed), a week with no planned session
    (not measurable) or no lived week of the round yet (too early) gives
    `factor = 1`, `keeps-or-reduces`, and silence appends it. The reasons are
    worded in `labels.ts` (`nextRoundReason`).
  - **Asked again, never stale.** Each later close proposes again while no round
    is pending or appended — so a no never silently ends the plan — and grades
    the most recent lived weeks, at most a round's length and never before the
    round opened.
  - **Never in the past** (`appendOpenEndedRound`, `open-ended.server.ts`). The
    round opens where the plan ends while that week has not begun; when the
    answer comes after that, on the first week not yet begun
    (`firstUnbegunWeekKey`: today on a Monday, as the morning's silence is, else
    next Monday). The lived weeks in between extend the last round, so the plan
    stays contiguous. Nothing applies when the plan has gained an Event or its
    last phase is no longer `afterPhaseId`.
  - The appended phase gets one endurance segment per endurance track carrying
    on the previous round's ramp, cuts and mix, with the factor as its **Block
    Boundary Step** (`factor − 1`; continuity at 1). After commit every week not
    yet begun up to the horizon that the plan has not laid is laid
    (`fillPlanWeeksToHorizon`, `horizon-fill.server.ts`).
  - **The athlete's factor** (story 6):
    `acceptRoundWithFactor(userId, id, factor, now)` rewrites the stored payload
    and re-derives its load direction before applying; 0.5–1.5
    (`factor-out-of-range`), round proposals only (`factor-not-a-round`).
  - No `MAX_PLAN_WEEKS` check on an appended round: an open-ended plan has no
    end. Edits that check the cap (resize, add phase by hand) will refuse on a
    plan past 104 weeks — left for #505 S13.
- **§4, adding an Event.**
  `attachEventToOutline(userId, outlineId, eventId, now)`: in one transaction
  the phase being lived is resized to the weeks lived, this one included, and
  any later phase goes; the family's run-up (`familyRunUp` — its standard length
  after the base block) is fitted to the weeks left by `fitRunUp`, which reuses
  `proposeFit` (the rule `fitPlanToEvent` applies, taper untouched) and drops
  the earliest blocks when even that cannot fit; `eventId` is set; a next round
  still pending is closed as declined. Refusals: `outline-not-found`,
  `event-not-found`, `event-cancelled`, `event-past`, `event-already-planned`,
  `event-too-soon` (the Event is in this week). `addRaceToOpenEndedPlan` creates
  the race in the same transaction, so a refusal or a throw leaves no race
  behind.
  - After commit, each later week the plan laid is laid again through the stamp
    (`replace`, so `clearPlanWeek` does the gated clearing), or only cleared
    when the athlete adopted one of its plan sessions or the week is past the
    Event; then the never-laid weeks up to the horizon are filled.
    **Contained**: the plan already runs toward its Event, so a failure here is
    logged, not turned into a refusal. Each week is written in its own
    transaction (old sessions or new, never half), and the week change keeps
    laying the horizon from the next close on; a week in between left at its old
    sessions or unlaid is the athlete's to stamp. The same holds for the fill
    after an appended round.
- The plan page's open-ended hero offers _Legg til et løp_
  (`__attach-event.tsx`, conform on `AttachEventFormSchema` — one schema for
  client and action, reusing `EventFormSchema`'s name and date, with "an Event
  or a new race, not both" as a refinement; words in `labels.ts`). It lands on
  `?event=`.
- **§5.** `openEndedRound(family)` in `presets.ts`, for every family. An Outline
  records no family, so a plan is read by its last phase's rhythm
  (`familyForRhythm`): 3:1 reads as Klassisk — big base's round is the same four
  weeks, and its run-up is then Klassisk's — and 2:1 as Masters; a phase with
  rhythm `none` repeats its own length.

## As built (#505 S7)

One migration, `20261007212213_a_plan_records_the_philosophy_it_follows`: a
nullable `PlanOutline.family` and nothing else, no backfill.

- **§5, every family.** Two families join Klassisk, Masters and big base, at
  Klassisk's three lengths: **polarized 80/20** (zone 5 only, one session a week
  in the base and two after, no threshold or tempo) and **threshold focus**
  (zones 3–4, two sessions a week, no zone 5). Both are Klassisk's blocks and
  rhythm, so the **Quality Session Mix** is the whole difference — fifteen
  presets in all. `openEndedRound(family)` now returns the family's opening
  block whole: weeks and rhythm as before, plus its ramp and mix, which is what
  tells a polarized round from a threshold one.
- **The Outline records its family.** S6 read a plan's family off its rhythm,
  which cannot tell Klassisk from big base, polarized or threshold focus — all
  3:1. `family` is written by a shape (`createPlanOutline`, `applyPreset`, via
  `familyOfPreset`), by Hold meg aktiv (`classic`) and by a switch; a plan typed
  by hand records none. Every reader goes through
  `outlineFamily(stored, rhythm)`: the stored family, else `familyForRhythm` —
  so a pre-S7 row reads as it did. The next round's shape (`nextRoundShape`) and
  the run-up an Event attach lays (`familyRunUp`, now for every family) read it.
  This is the one piece of provenance ADR 0044 §2 left unbuilt "until something
  needs it": the philosophy is shown and switched, so it is now needed; the
  shape's numbers are still copied in and stay editable.
- **Switching philosophy** (stories 12–14).
  `previewPhilosophySwitch(outline, family, today, timezone)` (`philosophy.ts`,
  pure) works from the **first week not yet begun** (`firstUnbegunWeekKey`):
  phases wholly behind it stay, the one it falls in is cut to its lived weeks
  (or extended to it, past the plan's end), and the rest go. An open-ended plan
  then gets one round of the new family (`Blokk n`); a plan toward an Event gets
  the new family's season fitted by `fitRunUp` to the weeks left so it ends on
  the Event's week — its whole season while the plan is still in its opening
  block, its run-up after the base otherwise. The result is the diff the preview
  shows (phases before and after, and every week's role and targets on both
  sides, both read through `resolvedTracks`) plus the edit itself. Refusals:
  `same-family`, `event-too-soon`, `no-phases`, and from the apply
  `outline-not-found` and `preview-stale`.
  - **A week is begun** once its Monday is past or a session in it is completed
    (`readFirstUnbegunWeekKey`, `week-begun.server.ts`, over the pure
    `firstUnbegunWeekKey`). So the current week counts as lived unless it is a
    Monday nothing has been trained on, and the switch starts the week after —
    as an appended round, the horizon fill and an attach do (all read the same
    helper).
  - **The confirm is tied to the preview.** The preview carries a `digest` (an
    FNV-1a fingerprint of what it shows and of the edit); the confirm posts it,
    and `switchPhilosophy(…, { digest })` refuses with `preview-stale` when the
    switch recomputed now has another — the plan was edited, or a week began.
    The page then shows the fresh preview with the refusal under its confirm.
  - `switchPhilosophy(userId, outlineId, family, now)` (`philosophy.server.ts`)
    recomputes the preview inside its transaction and applies that edit — new
    phases get the family's ramp, step and mix on every endurance track;
    strength segments float free and stay — sets `family`, and closes a pending
    next round. After commit, `relayPlanFrom` (shared with the attach) lays
    every later week the plan laid again through the stamp's gated clearing,
    then fills the unlaid weeks up to the horizon; contained and logged like the
    attach. Lived weeks, the athlete's own sessions and adopted ones stay
    (`philosophy.server.test.ts`).
  - **A week holding an athlete's session is laid around it** (S7 review;
    `relayFutureWeeks` for the attach, the switch and the strength offer alike).
    The stamp runs with `aroundKeptSessions`: after the gated clearing, each
    plan session it kept (adopted, or trained) fills its slot — its weekday and
    Discipline — and that pattern day is not laid again; every other day is laid
    at the new targets. Chosen over leaving the old machine sessions in such a
    week, which would keep it at the old plan's numbers beside the new plan.
    Before, such a week had its machine sessions cleared and nothing laid, and
    fell below its target. A session the athlete wrote themselves (`authored`)
    fills no slot: it is extra to the plan's week, as it is to every stamp. The
    preview shows week **targets**, not sessions, and says so: its note reads
    that weeks with the athlete's own sessions are laid around them.
  - The plan page's _Filosofi_ card names the philosophy and what it is in plain
    words (`PHILOSOPHY_LABELS`, `PHILOSOPHY_DESCRIPTIONS`), and _Bytt filosofi_
    posts `preview-philosophy` (conform on `PhilosophySwitchFormSchema`), shows
    the _Forhåndsvisning_, and only its confirm — a conform form of its own,
    with its own errors — posts `switch-philosophy`.
  - **Radios with descriptions, a deliberate exception to ADR 0028 §2** ("one
    select for every enum field"): the family is picked from radios, each with
    its plain description beside it (story 10, "a method I believe in"), since a
    `SelectField` trigger can show a name but not the sentence the choice is
    made on. Each radio has its own id (`${field.id}-${family}`) and is
    described by its sentence.
- **A strength track from history** (story 15). `proposeStrengthTrack`
  (`proposal.ts`) offers one when the last four complete weeks average at least
  one lifting session a week with sets logged; `readStrengthTrackOffer` reads it
  (`history.server.ts`). The plan page shows the offer for a plan with no
  strength track (a conform form with its own errors); `add-strength-track` →
  `addProposedStrengthTrack` (`strength-offer.server.ts`) re-reads the offer
  and, in one transaction, adds a `sets` track anchored on its weekly average,
  **a strength block** from the first unbegun week to the plan's end at the
  offer's Strength Frequency (goal `hypertrophy`, the general one, rates left to
  the convention), and **lifting days** in the plan's first week pattern — as
  many as the frequency, from the front of the athlete's available week (the
  starter pattern's rule), each a fixed day on their most recent strength
  session. After commit `relayPlanFrom` lays the weeks again and fills the
  horizon, so the lifting sessions are on the calendar through the ordinary
  stamp. No history, no offer; the threshold is at least one session a week on
  average (as many sessions as the window has weeks). An open-ended plan's block
  ends with the plan's current last round; appended rounds do not extend it yet
  (as S6 noted for strength segments).
