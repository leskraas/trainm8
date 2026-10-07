# Week Replan proposes, and the athlete's own sessions need a yes

Status: Proposed (design grill, 2026-10-07; not built)

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
