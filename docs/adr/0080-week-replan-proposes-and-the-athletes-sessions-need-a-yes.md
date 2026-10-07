# Week Replan proposes, and the athlete's own sessions need a yes

Status: Accepted (design grill, 2026-10-07; built in #505)

**Amends [ADR 0025](./0025-adaptive-week-replan.md).** It keeps §1: one
persistent decision for each closed **Training Week**, made at most once. It
replaces §3: the decision is no longer written onto the sessions straight away.
It widens §2: the decision is no longer only a downward volume scale. **Carries
forward [ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md)
§8** for the athlete's own sessions: nothing of theirs is changed without
approval.

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
  authored. `WeekReplan.outcome` gains `proposed`; a week that holds stores
  `no-change` or `insufficient-data` with one explicit `keep`.
- **The author** is `proposeWeekChange` behind the `ProposalAuthor` type
  (`app/utils/load/propose-week-change.ts`). Its week-level judgment is ADR
  0025's (band, TSB gate, 30 % floor): soften gives one `scale` per adjustable
  session of the coming week, the athlete's own included and saying so. Each
  missed session gets one proposal: after a week over plan it is let go;
  otherwise the key missed session (most Planned TSS) is offered as a make-up
  `move` to the first free day ahead, and the rest are let go (`keep`). A
  make-up places a copy and leaves the missed session on its day; it adds load.
- **Silence** (`applyDueProposals`) re-reads ownership at apply time, and also
  leaves alone a session that changed after the proposal was written (for
  example eased by the Session Nudge), so two machine softenings never compound.
  It never applies a move _fra nå av_.
- **_Fra nå av_** moves the machine's later, still-planned sessions of the same
  slot (same weekday, same workout title and discipline) to the new weekday
  within their own week. The Week Pattern is not edited: weeks laid afterwards
  come back on the old weekday. Editing the pattern is later work.
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
  the replan directly. Both read the same clock
  (`app/utils/load/week-change.ts`):
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
    before it;
  - **the horizon fill** happens only in the run that wrote the Week Replan, so
    once per closed week: the week after next (closed week + 14 days) gets the
    active plan's first Week Pattern through `stampWeekPattern`, as `generated`
    sessions. It lays nothing where the plan's machine sessions already are (an
    athlete who stamped many weeks ahead), keeps the athlete's own sessions in
    the week, and fills nothing with no plan, no pattern or a week past the
    plan. It does not yet avoid a day the athlete already filled, and a fill
    that fails after the Week Replan was written is not retried.
