# The autopilot lays out each week, and every write it makes says what it did and can be undone

Status: Accepted · Owner decisions 1 and 8 of spec #558 (_Levende start_,
2026-10-17) · Recorded in ticket #559; built in #558 S5 (_Juster_) and S6
(Autopilot)

Numbering: 0092–0095, 0097 and 0099 are reserved by the agent-strategy roadmap
([`agent-strategy.md`, "The ADR roadmap"](../research/agent-strategy.md#the-adr-roadmap)),
so _Levende start_'s ADRs begin at 0100.

**Supersedes
[ADR 0080](./0080-week-replan-proposes-and-the-athletes-sessions-need-a-yes.md)
§2–3** for an athlete on **Autopilot**, and its consequence that _"a proposal
that adds load always needs an explicit yes"_. **Amends
[ADR 0079](./0079-a-training-plan-may-be-open-ended.md) §3**: with autopilot on,
an open-ended plan's next round is applied without a yes. **Keeps** ADR 0080 §1
(one Week Replan per closed week, a set of proposals with reasons), §4 (a move's
scope), §5 (a missed session stays on its day as _ikke gjort_) and §6 (only the
author changes when AI writes proposals), and the Week Change's clock and
once-only claims as built. Under _Spør meg først_ ADR 0080 §2–3 and ADR 0079 §3
stand unchanged. **Follows
[ADR 0088](./0088-every-write-on-i-dag-is-undone-from-its-toast-and-from-its-landed-row.md)**
(every write on I dag is undone; an undo refuses rather than tramples).
**Records an exception to Session Adoption** for two _Juster_ intents (§7).

## Context

The owner, who uses the app every day, wants it to do as much as possible for
them. Under ADR 0080 the plan stops moving unless the athlete answers. On Sunday
evening _Ukeskiftet_ proposes changes and waits for _Ok_ / _Nei takk_. Silence
applies only what keeps or reduces load, and only the next morning. So an
athlete who trains well and never opens the card never gets their next step: the
step up after a round done to plan, and an open-ended plan's next round at its
proposed volume, wait for a yes that never comes. The athlete who wants the app
to run the plan has to review it every week.

ADR 0080 rejected "apply everything silently" because the athlete's own sessions
got rewritten without a word. That reason still holds. What it does not need is
a yes for each change: it needs the athlete's sessions left alone, a guard on
how much the app may add, a statement of every change, and a way back.

## Decision

### 1. Autopilot is on for every athlete

**Autopilot** is a per-athlete setting, on by default. A data migration turns it
on for every existing athlete, including those with a plan today. The first
**Autopilot Notice** an existing athlete gets carries one line saying the app
now lays out their weeks and where to switch back (_Spør meg først_ in _Meg_).

### 2. With autopilot on, the Week Change applies its Week Replan

The **Week Change** keeps its clock and its once-only claims. It closes the week
Sunday 20:00 local, writes one **Week Replan** per closed week and moves the
**Planning Horizon**. Only the apply step changes. Every proposal written at the
close whose target is the machine's (a session the athlete has not adopted, or
the plan itself for a next round) is **applied at once**, without a yes. That
includes proposals that add load and the next round of an open-ended plan. The
06:00 silence step has nothing left to do for an autopilot athlete.

The **proposal author** is unchanged. Only the apply rules change, which is what
ADR 0080 §6 anticipated.

### 3. Guards replace the yes

- **A step up is bounded.** At most the presets' 5 % per round
  (`ROUND_STEP_UP`), and never past the ramp guard's 8 % week-on-week rise
  (`RAMP_GUARD_MAX`). Both stay conventions, not injury prevention.
- **A make-up copy is not placed automatically.** It adds load on a day the
  athlete did not choose. The missed session stays _ikke gjort_ on its day (ADR
  0080 §5), and the notice says it was let go.
- **The athlete's own sessions are never changed** (`authored`, or adopted and
  not released: **Session Ownership**). A proposal aimed at one is recorded as
  left alone, and the notice says so (_Lørdagens langtur er din, den står._).

### 4. Every autopilot write keeps a before-image and can be undone

- Each applied proposal keeps the prescription and placement it replaced, so an
  undo restores exactly that, not a second guess.
- Undoing a next round **re-lays it at factor 1** rather than removing it, so an
  open-ended plan never ends by an undo.
- An undo is idempotent. It is refused once the week it changed has begun (a
  week is begun once its Monday is past or a session in it is trained, ADR 0079
  as built in #505 S7) or a session it changed has been trained, with a sentence
  saying so. That is ADR 0088's rule: refuse rather than trample.

### 5. The Autopilot Notice says what changed

The **Autopilot Notice** (_Neste uke er lagt ut_) replaces the **Week Change
Card**'s questions with statements of what was done. Each line carries its
stored Norwegian reason and _Angre_; the notice carries _Angre alt_. It sits on
I dag above the week until it has been seen and the week has begun. The full
history stays findable behind _Se hele sesongen_. A week the autopilot could not
lay (no pattern, past the plan's end, an error) says so in the notice and never
shows as an empty week. _Gjør uka lettere −15 %_ stays available for the coming
week.

### 6. _Spør meg først_ keeps today's behaviour

The switch in _Meg_ (_Spør meg først_) brings back propose-and-answer exactly as
built for ADR 0080: the Week Change Card, silence from 06:00 for what keeps or
reduces load, a yes for added load and for the next round (ADR 0079 §3).
Switching autopilot back on applies from the **next** close. It never applies
proposals that are already open.

### 7. _For sliten i dag_ and _Lite tid_ do not adopt the machine's session

**Session Adoption** fires on a save that changes the prescription. Two
**Juster** intents change it on purpose, at the athlete's request:

- _For sliten i dag_ (an endurance session becomes easy, at 60 % of its duration
  with a 20-minute floor; a strength session or **Simple Activity** keeps its
  kind and becomes _rolig_ and shorter) and _Lite tid_ (30 minutes, or 20 if it
  was 30 or less; the intent is kept). On the **machine's** session they **do
  not adopt**. They are a machine write at the athlete's request, like the
  Session Nudge's ease, and the session stays the machine's. On the athlete's
  own session they change it, and it stays the athlete's.
- _Bytt dag_ is a reschedule, which does not adopt under the existing rule. It
  is not an exception.
- _Bytt økt_ puts a session the athlete picked from _Bibliotek_ in place of
  today's. That is the athlete's choice of session, so it **adopts** under the
  normal rule. It is not part of the exception.

Every _Juster_ write leaves a **Replan Note**, never moves the **Week Target**,
and touches only today's session (and, for a _Bytt dag_ swap, the one session it
swaps with). Its undo restores the before-image, is idempotent, and is refused
once the session is trained.

## Considered options

- **Keep ADR 0080 as the default and make autopilot an opt-in.** Rejected by the
  owner: the athlete who most needs the plan to move is the one who will not
  find a switch, and the app is meant to do the coaching.
- **Keep the 06:00 silence step and only drop its load gate.** Rejected: under
  autopilot nothing waits for an answer, so a night of open proposals would only
  show the athlete a week that is about to change under them. The notice states
  what was done; it never asks.
- **Place make-up copies automatically.** Rejected: a copy adds load on a day
  the athlete never chose, and nobody is asked. Letting the session go is the
  conservative reading, and the athlete can still add one by hand.
- **Let _For sliten i dag_ and _Lite tid_ adopt, as the rule says.** Rejected:
  an adopted session is a fixed point every later machine write steps around, so
  one tired day would freeze that session for good against the autopilot and the
  re-lays. The athlete asked for a lighter day, not to take the session over.
- **Undo a next round by removing it.** Rejected: an open-ended plan would end,
  and the next close would propose the same round again.

## Consequences

- [ADR 0080](./0080-week-replan-proposes-and-the-athletes-sessions-need-a-yes.md)
  §2–3 is marked superseded for autopilot athletes, and
  [ADR 0079](./0079-a-training-plan-may-be-open-ended.md) §3 amended.
- New storage, built in S6: the per-athlete setting and its migration (on for
  everyone), a before-image on each applied **Week Replan Proposal**, and what
  the notice has been seen. The proposal's existing `answer`, `answeredAt` and
  `appliedAt` keep their meaning; an autopilot apply has no answer.
- The **Week Change Card** stays, for _Spør meg først_ athletes, and as the
  history behind _Se hele sesongen_.
- The once-per-week _Gjør uka lettere −15 %_ is still the athlete's own accepted
  scale (ADR 0080 as built), unchanged.
- **Not decided here: assistant-authored proposals.** The agent-strategy roadmap
  reserves ADR 0093 (_"an agent is a proposal author, never the athlete's
  yes"_), which would have silence never apply an assistant's proposal. Under
  autopilot, applying is no longer a yes from silence. Whether the autopilot may
  apply a proposal an assistant wrote is for ADR 0093 to say when it is written;
  until then the only author is the deterministic rule set.
