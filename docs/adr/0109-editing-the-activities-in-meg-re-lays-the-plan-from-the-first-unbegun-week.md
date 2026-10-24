# Editing the activities in _Meg_ re-lays the plan from the first unbegun week

Status: Proposed · Issue #587 (follow-up to #558 / #571, owner decision
2026-10-18) · Decisions delegated to the implementer; the calls marked
**Proposed, owner to confirm** are the owner's · Design only: the code is not
built yet (see "State" at the end)

**Follows**
[ADR 0102](./0102-the-first-run-shows-up-to-three-start-options-as-real-weeks-and-stor-base-starts-all-easy.md)
(Start Options, "made = shown"),
[ADR 0103](./0103-the-first-run-asks-how-often-the-athlete-lifts-and-lays-lifting-away-from-hard-days.md)
§5 (the _Nybegynner_ cap counts lifts),
[ADR 0104](./0104-one-day-rule-across-tracks-lifting-laid-per-week-and-pinned-days-per-track.md)
(the day rule, Pinned days) and
[ADR 0100](./0100-the-autopilot-lays-out-each-week-and-every-write-it-makes-says-what-it-did-and-can-be-undone.md)
§3 (the athlete's own sessions are never changed). **Copies** _Bytt
treningsform_'s preview-then-confirm flow (ADR 0101 §2, #581, ADR 0079 as built
in #505 S7).

## Context

_Meg_ shows the activities read-only (`app/routes/settings/level.tsx`): they are
the plan's Training Tracks, and nothing changes a plan's tracks and days after
it is made. #587 asks that editing the sports, the Simple Activities and
strength in _Meg_ re-lays the plan's tracks and days from next week, shows the
new week before the athlete confirms, and uses the start's option engine with
its one session cap and its "made = shown" guarantee.

## Decision

### 1. One engine: the start's draft, for the plan's own family

The new activities are handed to `draftStart` as the start's answers, read back
off the plan exactly as _Bytt treningsform_ reads them (`planStartAnswers`: the
stored level and preferences, the athlete's days, the hours of the plan's next
ordinary week) with only the sports, Simple Activities and strength frequency
replaced. So the session cap is the start's: one total, where lifts count only
for a _Nybegynner_ (ADR 0103 §5).

The option laid is the one for the family the plan already follows: editing
activities is not a switch of method. `draftStart`'s per-family laying is drawn
out into a function that lays one named family without ranking or merging, so a
family that merged into a higher-ranked card, or one the start does not offer
(_Masters 2:1_), is still laid as itself. A plan whose family reads as none
takes the top option, and the preview says the plan follows it from then.

### 2. From the first week not yet begun, and a fresh round there

The edit begins on the first week not yet begun (`readFirstUnbegunWeekKey`, ADR
0079), as _Bytt treningsform_ does. On a Monday with nothing trained that is
this week; otherwise next week. The preview names the Monday.

From that week the plan restarts its round as the philosophy switch does
(`previewPhilosophySwitch`'s phase cut, drawn out and shared): the phase being
lived is cut to the weeks lived and one round of the family opens at the
boundary, its mix cut to the new days (`mixWithinDays`). Every track is
re-anchored at the boundary on the draft's hours, which ADR 0040 §5 makes the
new base, and every Week Volume Override from the boundary on is cleared (§3).
That is what makes the week laid equal to the week shown: from the boundary the
stored rows are the draft's rows.

### 3. Tracks: re-anchored, added, or retired — never deleted

A track is found by its Discipline, since a plan holds one track per Discipline
(`@@unique([outlineId, discipline])`, ADR 0043 §1). A Discipline the edit keeps
or adds that already has a track, retired or not, takes that track; a new track
is made only when there is none.

- A sport or the `other` track kept, or a retired one taken up again: a new
  anchor at the boundary (anchors after it go), a segment on the new round with
  the family's mix on the main sport and none on the others, and its Pinned days
  cleared, since the draft deals the days. A retired track taken up again keeps
  its lived anchors and segments, the 0 it was retired at among them, and is
  re-anchored like any kept track.
- A sport added that never had a track: a new track, anchored at 0 from the
  plan's first week and on its hours from the boundary, so lived weeks still add
  up as they did.
- A sport or every Simple Activity removed: the track is **retired**, anchored
  at 0 from the boundary with no pattern day. It is not deleted: deleting would
  rewrite the targets of weeks already lived (ADR 0040 §5). Readers of "the
  plan's activities" (Meg, `planStartAnswers`) skip a track whose anchor in
  force at the boundary is 0.
- Week Volume Overrides from the boundary on are **cleared**, on every track. An
  override sits above the walk and wins over it
  (`app/utils/plan-outline/from-rows.ts`, `trackTargets`), so one left in place
  would change the hours the draft laid, or hold a retired track above 0.
  Reconciling them with the new activities is not as simple: an hour count typed
  for one sport mix has no meaning in another. The preview names each cleared
  week, by track and Monday. Overrides before the boundary stay as they are.
- Strength: its dated blocks are cut at the boundary; when the edit lifts, a new
  block opens there at the lifts laid (keeping the goal of the block it cuts,
  else the general goal), with that many lifting slots on the session
  `readLiftingWorkoutId` names. Removing _styrke_ clears the athlete's Strength
  Frequency answer: they said they no longer lift.

### 4. Days: the draft's pattern, written as drawn

The first Week Pattern's days are replaced by the draft's own: its share days
(`draft.pattern`), the Simple Activities' fixed days (each a new Simple Activity
Workout) and the lifting slots. The horizon fill and the re-lay stamp the first
pattern with days, so this is the pattern the weeks are laid from.

### 5. Preview, digest, confirm

The first week is not the draft's standalone week whenever the athlete keeps a
session in it: the stamp lays around kept sessions (§6), which can move a hard
session and the lifting days, or take the place of a planned lift. So the
preview and the apply share one computation of the boundary week. It builds the
proposed rows in memory (phases, anchors, pattern days, lifting slots), reads
the week's kept sessions as the stamp does (`readHeldSessions`, and the plan's
own sessions the gated clear would keep), and lays the week through the stamp's
own `planStamp` and slot filling. The slot filling, now inline in
`stampWeekPattern`'s write loop (`filledSlots`, `keptLiftElsewhere`), is drawn
out into a pure step both callers use. With nothing kept, the result is the
draft's week.

The preview writes nothing. It shows that week with the start's card week
(`StartOptionWeekView`), the kept sessions on their actual days and marked as
the athlete's, the start's notes (_Fikk ikke plass_, short of the hours, lifting
capped), the Monday it begins, how many of the athlete's own or adopted sessions
from then on stay where they are, which Pinned days are handed back to the app,
and which hand-set weeks are cleared (§3). The confirm posts the preview's
digest, which covers the laid week, the kept sessions it was laid around (id,
day, Discipline) and the cleared overrides; the apply recomputes inside its
transaction and refuses with `preview-stale` when it differs, as
`switchPhilosophy` does. A session added, moved or adopted in the boundary week
after the preview therefore makes it stale. After commit the weeks from the
boundary are re-laid through `relayPlanFrom`, whose clearing is the gated
`clearPlanWeek`.

### 6. The ownership gate

Lived weeks are never touched: no session before the boundary is re-laid, and no
phase, anchor, block or Week Volume Override before it changes. From the
boundary only `REPLACEABLE_SESSION`s go. An `authored` or adopted session stays
on its day and the stamp lays around it (ADR 0104 §2). That is more than leaving
out what it covers: a kept hard session moves the plan's hard session and the
lifts off its neighbours, and a kept lift fills a lifting slot whatever day it
is on, so no second lift is laid. The week laid is the one §5 computed and
showed, kept sessions included.

## Open for the owner (Proposed, owner to confirm)

1. **A removed track's adopted sessions stay** on their days, as the athlete's,
   and the preview counts them. The alternative, removing them with the track,
   would break ADR 0100 §3.
2. **The preview is a server round trip** (_Vis ny uke_), as _Bytt
   treningsform_'s is, not a live _Uka di_ as the start's question screens are.
3. **The round restarts at the boundary.** The hours carry over (they are read
   from the plan's next ordinary week), but the rhythm's position restarts at a
   loading week 1. The alternative, keeping the phases and only re-anchoring,
   would lay a recovery week where the preview showed a loading one.
4. **Pinned days are handed back.** Editing the activities re-deals every
   track's days, so pinned endurance, Simple Activity and strength days go back
   to _La appen velge_, and the preview says so by name.
5. **Plans toward an Event stay read-only** in _Meg_ in this version: their
   run-up is fitted to the race, so the start's open-ended first week is not the
   week that would be laid. They keep _Plan_ → _Avansert_.
6. **Hand-set weeks from the boundary on are cleared**, and the preview names
   each one. _Bytt treningsform_ keeps them; here they would override the new
   activities' hours, and a hand-set week on a removed sport would keep it
   alive. The alternative, keeping them and warning, would lay a week that is
   not the one shown.
7. **Hours and days are not edited here.** The hours stay the plan's; adding a
   sport shares them out. The days stay the athlete's Training Availability.

## Deferred hardening

- **The confirm trusts the session cookie alone.** Like every Meg form it has no
  re-authentication. It rewrites the future of the plan, which a stolen session
  could already do through _Bytt treningsform_; nothing new is exposed, but a
  rewrite this broad is a candidate for the step-up check #639 tracks.
- **Orphaned Simple Activity Workouts.** Replacing the pattern's fixed days
  leaves the old Simple Activity Workouts in place when nothing else references
  them. They are the athlete's own rows and leak nothing, but they are not
  cleaned up.

## Considered options

- **Delete a removed track.** Rejected: it rewrites lived weeks' targets.
- **Pick the top-ranked option.** Rejected: editing activities would silently
  switch the way the athlete trains.
- **Write the pattern through `createStarterWeekPatternInTx`.** Rejected: it
  reads every track, a retired one too, by its first anchor, and strips mixes
  across lived phases; the draft's own pattern is the one shown.

## State

Only this record is written (#587, 2026-10-24). The build follows it: the pure
per-family lay and edit reading (`app/utils/first-run/activities-edit.ts`), the
server read, preview and apply (`activities-edit.server.ts`) with a "made =
shown" test against the database that keeps an adopted lift and an authored hard
session in the boundary week, the slot filling drawn out of `stamp.server.ts`,
the Meg editor in `level.tsx` with its words in `labels.ts`, and an e2e at 390
× 844.
