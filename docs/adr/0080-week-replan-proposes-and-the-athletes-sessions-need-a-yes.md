# Week Replan proposes, and the athlete's own sessions need a yes

Status: Accepted

**Amends [ADR 0025](./0025-adaptive-week-replan.md).** It keeps §1: one
persistent decision for each closed **Training Week**, made at most once. It
replaces §3: the decision is no longer written onto the sessions straight away.
It widens §2: the decision is no longer only a downward volume scale. **Carries
forward [ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md)
§8** for the athlete's own sessions: nothing of theirs is changed without
approval. Decided in the 2026-10-07 design grill; built in #505.

## Context

ADR 0025 rescales next week's sessions in place, without asking. It does that to
every still-scheduled future session, whoever wrote it. That made sense for one
cautious rule: soften the week after an overload. It does not fit what the
redesigned planning loop needs:

- The **Planning Horizon** moves forward one week every time a week closes.
- An open-ended plan's next round is proposed, never applied silently.
- Some changes are not a scale: keep, move, swap, add, scale up or scale down.
- The athlete writes sessions of their own, for example "Langtur med gjengen" on
  a Saturday. These are fixed points for the athlete, not inputs for the app.

Garmin and Runna users complain that the plan changes under them. On the other
hand, the athlete who only wants to stay active will not open a review every
Sunday.

## Decision

1. **When a Training Week closes, the Week Replan is a set of proposals.** Each
   proposal is one change (keep, move, swap, add or scale) with a plain-language
   reason. The set shows as a card on I dag on Sunday evening (UI word:
   _Ukeskiftet_), together with a short review of the week that closed. In the
   same step the horizon moves forward one week. "Keep" is a real proposal with
   a reason, not the absence of one.
2. **The machine's sessions: an unanswered proposal is applied the next
   morning.** This covers sessions the app made that the athlete has not adopted
   (**Session Adoption**).
3. **The athlete's own sessions: only an explicit yes applies a proposal.** This
   covers sessions with `source` `authored` and adopted sessions. The app may
   propose a change to them, and the proposal says that the session is theirs.
   Silence changes nothing.
4. **A move proposal asks for its scope:** _bare denne gangen_ (only this time)
   or _fra nå av_ (from now on). "Never on Tuesdays" is a different statement
   from "not this Tuesday".
5. **A missed session stays on its day as _ikke gjort_.** Nothing moves it
   automatically. The Week Replan may propose what to do about it.
6. **AI later writes the same proposals on the same surface:** a proposal, a
   reason, and accept or change. Only the author of step 1 changes, not the
   rules in steps 2–5.

## Considered options

- **Apply everything silently** (ADR 0025 as built). Rejected: the athlete's own
  sessions get rewritten, and this is the behaviour users complain about in
  other apps.
- **Nothing changes until the athlete answers.** Rejected: it fails the athlete
  who only wants to stay active. Their plan would stop moving the first Sunday
  they do not open the app.

## Consequences

- Who wrote a session and whether it was adopted become the gate for every write
  the Week Replan makes. Three places do not know this today (checked on main at
  043aca1):
  - `getAdjustableSessions` (`app/utils/load/week-replan.server.ts:186–200`)
    filters on athlete, `scheduled`, future and has-a-workout. It ignores both
    `source` and adoption.
  - `clearPlanWeek` (`app/utils/plan-outline/week-sessions.server.ts:84–113`)
    deletes by event, week and `REPLACEABLE_SESSION` (lines 31–35), with no
    `source` check.
  - The home ledger's `ledgerSessionSelect`
    (`app/utils/training.server.ts:1310`) does not select `source`, so the
    timeline cannot show whose a session is.
- `source: 'generated'` does not mean "made by the season generator" alone. The
  strength program writes it too (`app/utils/strength-program.server.ts:1289`).
  The gate in steps 2–3 is about the athlete versus the machine, not about which
  generator wrote the session.
- A proposal needs storage: its kind, target, reason, scope, answer and the time
  it was applied. The `WeekReplan` row stays the at-most-once record per closed
  week, and its outcome becomes the set of proposals.
- Scaling up is now allowed, as a proposal: for example the next round of an
  open-ended plan after a round done to plan. **A proposal that adds load always
  needs an explicit yes**, even on the machine's own sessions; silence applies
  only proposals that keep or reduce load. Too little training cannot hurt the
  athlete who is not watching; too much can (owner's call, 2026-10-07).

## As built (#505)

- **Storage.** `WeekReplanProposal` holds one proposal: `kind` and a JSON
  `payload` validated by one discriminated union
  (`app/utils/load/week-replan-proposal.ts`), the `reason` (the only prose),
  `loadDirection`, a move's `scope`, the `answer`, `answeredAt` and `appliedAt`.
  The load direction is read off the payload when the proposal is written, never
  authored. `scope`, `answer` and `loadDirection` are read back through zod
  enums, never cast, and silence holds a proposal when either the stored
  direction or the payload's says it adds load. A week-wide `scale` says so in
  its payload (`scope: 'week'`): the target column is cleared when its session
  is deleted, so a missing target never means "the whole week", and a
  session-targeted proposal whose session is gone applies nothing.
  `WeekReplan.outcome` gains `proposed`; a week that holds stores `no-change` or
  `insufficient-data` with one explicit `keep`. A `proposed` row's reason is a
  Norwegian sentence saying what is proposed (nothing has applied when it is
  written); a holding row keeps ADR 0025's English sentence for now. The Hero's
  outcome name for `proposed` is _Endringer foreslått_ (ADR 0081).
- **The author** is `proposeWeekChange` behind the `ProposalAuthor` type
  (`app/utils/load/propose-week-change.ts`). Its week-level judgment is ADR
  0025's (band, TSB gate, 30 % floor): soften gives one `scale` per adjustable
  session of the coming week, the athlete's own included and saying so. Each
  missed session gets one proposal: after a week over plan it is let go;
  otherwise the key missed session (most Planned TSS) is offered as a make-up
  `move` to the first free day ahead, and the rest are let go (`keep`). A
  make-up places a copy and leaves the missed session on its day; it adds load,
  and it takes no _fra nå av_ — a copy has no slot to move onward, so that
  answer is refused. No v1 rule proposes a swap; one that does must say in its
  reason when either session is the athlete's, since silence then leaves it.
- **Silence** (`applyDueProposals`) re-reads ownership at apply time, and also
  leaves alone a session that changed after the proposal was written (for
  example eased by the Session Nudge), so two machine softenings never compound.
  A session's own release is not such a change: a session whose last write was
  its release (`releasedAt` at or after `updatedAt`, within a second) still
  holds the prescription the proposal was written for, and the athlete has just
  said the app may adjust it, so silence may apply to it — when the release
  comes before the morning's silence runs; after it, the proposal waits for the
  athlete's answer like any other it held. A swap applies on silence only when
  both sessions are the machine's at that moment. It never applies a move _fra
  nå av_.
- **Two modules.** `week-replan-proposals.server.ts` stores proposals and is the
  apply engine (silence included); `week-replan-answers.server.ts` holds the
  athlete's taps (Ok / Nei takk, "Gjør uka lettere −15 %", "lås opp"), which
  apply through the same engine.
- **_Fra nå av_** moves the machine's later, still-planned sessions of the same
  slot (same weekday, same workout title and discipline) by the same number of
  days the target moved — Sunday → the Monday after is one day on, into the next
  week, for each of them (#505 S10 review; it used to be the weekday difference
  within each session's own week, which turned that move into six days back).
  The Week Pattern is not edited: weeks laid afterwards come back on the old
  weekday. Editing the pattern is later work.
- **Session Release** ("lås opp") is `WorkoutSession.releasedAt`. Rewriting the
  prescription of a released session clears it again.
- **"Gjør uka lettere −15 %"** (`easeWeek`) is the athlete's own yes: an
  accepted week-wide `scale` at 0.85 over every still-planned session left in
  the week, once per week.
- **The Session Nudge** skips the athlete's own session rather than proposing:
  it has no answer surface, and the Coach card already says what it advises.
- **The week change** (`app/utils/load/week-change.server.ts`,
  `runWeekChangeForUser`) is the one step that closes a week, moves the Planning
  Horizon and lets silence answer. It runs from an hourly sweep (job kind
  `week-change`, `startWeekChangeSchedule`, which queues a job only for an
  athlete with something due) and from every load recompute, which used to call
  the replan directly. A failure inside the recompute is logged and contained,
  so it never fails the session log or import that ran it. Both read the same
  clock (`app/utils/load/week-change.ts`):
  - the week **closes Sunday 20:00** in the Athlete Timezone. From then on the
    closing week is "the most recently closed week" (`lastClosedWeekKey`), so
    the replan's `weekKey` is the week still on the calendar on Sunday evening
    and last week's Monday the rest of the time. ADR 0025's
    `weekMonday(now) − 7` is gone, from the replan and from the home reader
    alike;
  - **silence applies from the first 06:00 local after the Week Replan was
    written** (its `createdAt` is the run's `now`): Monday morning for a Sunday
    close, the next morning for a run that came late. `applyDueProposals` takes
    only those decisions' proposals, and only for the closed week and the one
    before it. It runs **once per decision** (`WeekReplan.silencedAt`, claimed
    before it runs): what silence held stays pending for the athlete, and the
    sweep never queues that athlete again for it;
  - **the horizon fill** happens once per closed week
    (`WeekReplan.horizonFilledAt`, claimed before it runs and released if the
    fill throws, so the next run retries it until the next close): the week
    after next (closed week + 14 days) gets the active plan's first Week Pattern
    through `stampWeekPattern`, as `generated` sessions. It lays nothing in a
    week the plan already laid — machine sessions there, or plan sessions the
    athlete has since adopted — keeps the athlete's own sessions in the week,
    and fills nothing with no plan, no pattern or a week past the plan. It does
    not yet avoid a day the athlete already filled. The sweep also covers an
    athlete with a plan and no session yet, whose weeks only the fill lays.
  - Both once-only columns came with migration
    `20261007190320_the_week_change_runs_each_step_once`.

## As built (#505 S10): the Ukeskiftet card

- **Where.** A card on I dag, under today's row, so the landing (which parks
  today under its week header) does not scroll past it. Because a tall hero can
  still leave it below the fold on a phone, a line at the top of I dag says
  _Ukeskiftet: n forslag venter_ while any proposal can be answered, and its _Se
  forslagene_ brings the first open question's Ok on screen. The card shows from
  the close until every proposal is answered or applied (or can no longer be):
  `readWeekChange` (`app/utils/load/week-change-card.server.ts`) reads the
  latest closed week's Week Replan with its proposals and their sessions; home
  asks only for an open card (`onlyOpen`), so on the days between it costs one
  indexed lookup and ships nothing.
- **The week that went** is not read again: the closed week is already in home's
  ledger and season model (`week-volumes.ts`, graded through Sunday once closed
  — the same model `getWeekVolumes` builds), so the card reads its track lines,
  its missed sessions and its recording-only _ekstra_ sessions off that week.
- **The view model** is `buildWeekChangeCard`
  (`app/routes/_home/timeline/week-change.ts`): each proposal is answerable
  (pending, unapplied), silenced (pending, applied by the morning — _Gjort i
  morges_), answered, or **too late** (pending, but the session it would change
  has passed or gone, or the day it would use is behind today:
  `proposalTooLate`, `app/utils/load/week-change-card.ts`; the card says _For
  sent_ instead of offering an Ok, and such a proposal does not hold the card
  open). Each has a headline saying what it proposes, its reason verbatim, _din
  økt_ when it is aimed at the athlete's own session, a scope choice only on a
  move that is not a make-up, and the round's factor on an `add-phase`, with the
  last round's peak week in the lead track's unit before → after that factor
  (_Toppuka: 4 → 4,4 t_), which follows the select. What an answer did is read
  back from the stored answer, scope and `appliedAt`, so a reload says the same
  thing; every line about a session says the Week Target stands. The heading
  names the week: _Forslag for neste uke_, or _Forslag for denne uka_ once it
  has begun. Numbers on the card take a decimal comma (`formatNbVolumeFigure`).
- **Answers** post to `routes/resources/week-change.tsx` (intents `answer`,
  `accept-round`, `ease`), each control a conform form on one zod union
  (`app/utils/load/week-change-schema.ts`) whose branches require what each
  answer needs; the route replies with the submission, so a malformed post (400)
  or a refusal — another athlete's proposal (404), anything else (409), in the
  athlete's words — shows as that form's error. Each reply also carries the card
  as it now stands, so after the last answer — when home no longer ships the
  card — the athlete still reads what it did, then closes it. The round's factor
  is the shared select in five-percent steps within
  `ROUND_FACTOR_MIN`–`ROUND_FACTOR_MAX`.
- **"Gjør uka lettere −15 %"** eases only the coming week (closed week + 7);
  `easeWeek` refuses any other week (`not-the-coming-week`), and checks "once
  per week" inside its transaction. The week's planned volume before and after
  is kept on the accepted scale's payload (`volumes`), so the card says it in km
  or hours after a reload and in the settled state as well as on the tap (hours
  without a plan: the minutes are always there, the Planned TSS not).
- **"Lås opp"** sits under the athlete's own planned rows, beside the closed
  lock, with one sentence saying the app may adjust the session again; it posts
  to its own route (`routes/resources/session-release.tsx`). The row's lock
  opening is the confirmation.
- **A plain move from the author.** The rule set gained a third rule
  (`propose-week-change.ts`): a slot of the machine's missed two closed weeks
  running (same workout title and discipline, same weekday, _ikke gjort_ both
  times) gets a `move` of its coming session to a free day that the make-up did
  not take, with _bare denne gangen_ / _fra nå av_ offered. It keeps the load.
