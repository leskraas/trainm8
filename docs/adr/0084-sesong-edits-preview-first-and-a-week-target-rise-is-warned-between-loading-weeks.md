# Sesong edits preview first, and a week target's rise is warned between loading weeks

Status: Accepted

**Amends [ADR 0040](./0040-volume-continuity-and-authored-overload.md) §12**
(the guard's subject) — §13's honesty rule stands untouched. **Builds on** the
digest-tied preview of the philosophy switch (#505 S7, ADR 0079), the gated
re-lay of `relayPlanFrom` (#505 S6/S7), and the Norwegian of ADR 0081.

Scope: `app/utils/plan-outline/season-edit.ts` (pure previews),
`season-edit.server.ts` (read and apply), `ramp-guard.ts` (`weekRiseWarnings`),
`derive.ts` (`weekRole` reads a chosen easy week), and the _Endre sesongen_ card
on the plan page (`__season-edits.tsx`). Spec #505, stories 72–77, slice S13.

## Context

The athlete who sets up the season themselves needs four edits in _Sesong_: a
week's target, a phase's length and name, which week of a block is the easy one,
and the philosophy. The plan page already had direct writes for the first two
(#402, #406), and the philosophy switch already showed a preview first. #505
asks for three more things: **every** edit shows a preview before it applies
(story 75), a target that rises more than 10 % week on week is warned on (story
76), and each edit message says which number did **not** move (story 77) — the
athlete trusts the other numbers because the app tells them which held.

Story 76 runs into ADR 0040 §12: the Ramp Guard's subject is what the athlete
**authored** — a ramp, a boundary step — and **never** a week-over-week
difference, because a diff-based guard fires on a recovery week's rebound and on
a taper, both of which are the plan working as designed. But a **Week Volume
Override** is authored too, and it is authored as a week's final number, not a
rate. The Ramp Guard cannot see it: a runner who hand-sets week 43 to 50 km
after a 42 km week has authored a +19 % step that no ramp records.

Story 74 needed a semantics. `PlanOutlinePhase.recoveryWeekIndex` was added in
#505 S5 as "which week of the phase is the easy one", but a phase may hold
several blocks of its rhythm (an 8-week 3:1 phase is two), and one column cannot
say where each block rests.

## Decision

### 1. Every Sesong edit is a pure preview first, then a digest-tied apply

`previewSeasonEdit(rows, edit, firstUnbegunWeekKey)` takes the stored rows and
the edit — `week-target`, `phase` (name and/or length), `easy-week` — and
returns, without writing: the weeks whose phase, role or target change (before
and after, both read through `weekViews`, the derivation every surface reads),
the rise warnings (§3), what held (§4), the exact write, the weeks to lay again,
and a digest of all of it. The apply (`applySeasonEdit`) recomputes the preview
inside its transaction and refuses with `preview-stale` when the confirm's
digest no longer matches — the plan changed, or a week began, since the athlete
looked. After commit the changed weeks are laid again through the gated
`relayPlanFrom` (narrowed to those weeks with `onlyWeekKeys`): only the
machine's untrained sessions go, a week holding the athlete's session is laid
around it, and a rename lays nothing.

**Weeks already begun are history.** An edit on a week before the first unbegun
one (`week-lived`), or one whose arithmetic would change a begun week's role,
target or phase (`changes-lived-weeks`), is refused — the line ADR 0040 §5 draws
for the anchor and the philosophy switch draws for itself. A name is intent, not
a number, so a phase lived in may still be renamed.

**The Sesong edits are the only way these numbers change.** The plan page's
direct writes — `rename-phase`, `resize-phase`, `set-phase-rhythm`,
`set-week-override` and `clear-week-override` — are gone from its action (S13
review). The Blocks and Weeks readings show a phase's rhythm and a week's target
read-only and link to _Endre sesongen_ pre-filled (`?edit=phase&phaseId=…`,
`?edit=week-target&weekKey=…&trackId=…`). The phase edit carries the rhythm and
the taper flag too, and the week-target edit offers _Tilbake til planens mål_
(removing the override) behind the same preview. A preview whose form has
changed since is hidden, so its confirm can only apply what the fields say. The
domain writes `renamePhase`, `resizePhase`, `setPhaseRhythm` and
`set`/`clearWeekVolumeOverride` stay as tested primitives with no route caller;
resize and rhythm keep a chosen easy week honest the same way (§2).

**Still direct, and not routed through this preview:** applying a preset
(`apply-preset`, which shows the shape before its Apply button), fitting to the
Event (`fit-to-event`, which names the edit in full before its button), adding,
moving and removing a phase, a segment's ramp, step, cuts and mix, a Season
Anchor, a lifting block, and the Week Pattern. Those are authoring of the plan's
rules rather than the four Sesong edits #505 v1 names; routing them through a
preview is a follow-up.

### 2. A chosen easy week moves the easy week of its own block, and no other

`recoveryWeekIndex` is a week of the phase, 0-based. Blocks are the rhythm's
period counted from the phase's first week (4 weeks for 3:1, 3 for 2:1). The
block the chosen week falls in recovers **on that week and no other**; every
other block keeps the rhythm's own position (its last week). So a short last
block — a 6-week 3:1 phase ends on two loading weeks — can be given the easy
week the rhythm leaves out, and two easy weeks may sit side by side across a
block edge when the athlete puts them there; the preview shows both. A rhythm
with no easy week, a taper, and an index outside the phase ignore it. One choice
per phase: choosing again moves it, and a choice that would move one out of a
block already lived is refused (§1). A resize that leaves the chosen week
outside the phase clears it, and so does a new rhythm or a taper, which reshape
the blocks the choice was made in.

`weekRole` reads it, so `phaseWeekRoles`, the targets (the climb resumes from
the last loading week, ADR 0040 §2), home's `ActivePlan.weekRoles`, the season
chart and the stamp all agree.

### 3. The week-target rise is warned between loading weeks only (amends §12)

`weekRiseWarnings` reads what the week **targets** come to — a hand-set week
included — and warns where a **loading** week rises more than `WEEK_RISE_WARN`
(+10 %, exactly 10 % is not more) over **the loading week before it**. The
reference skips easy weeks: after a recovery week the loading week is compared
with the last loading week before it, which is the pair ADR 0040 §2 says the
climb resumes from. A taper week is never compared and ends the search. So the
two false positives §12 retired — the rebound out of an easy week and the taper
— stay retired; what §12 forbade was a diff that reads **any** two weeks, and
this reads only the pair that measures overload.

It warns and never blocks, and no write path consults it. The preview shows only
warnings on weeks the edit touches. Its copy names it a rule of thumb (_en
tommelfingerregel, ikke en grense_) and makes no injury claim — §13 holds: the
10 % rule has a failed RCT behind it (Buist et al. 2008). The constant is wider
than `RAMP_GUARD_MAX` (+8 % a loading week) because it reads one step the
athlete typed rather than a rate over a block, and the spec asked in those
words.

### 4. Each message names what held

The preview carries `held`, a list from a fixed vocabulary (`fasen`, `navnet`,
`lengden på fasen`, `de andre ukene`, `ukemålene`, `starten på planen`,
`de andre fasene`), each stated only where the preview shows it to hold — "de
andre ukene" only when every changed week lies inside the edit's own scope (the
week, or the chosen easy week's block). The message is the headline, then the
held sentence: _Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før._
The same sentence is the preview's first line and the toast after the apply.

## Consequences

- The Ramp Guard and the rise warning now coexist: one on authored rates, one on
  authored week targets. A plan with a +10 % ramp shows no rise warning on its
  derived weeks unless an edit touches them; the Ramp Guard already speaks about
  that rate.
- A second easy-week choice in a later block of the same phase is refused while
  the first choice's block is lived. Storing one choice per block would need a
  new column; deferred until an athlete asks.
- `PhaseRow.recoveryWeekIndex` is optional, so every fixture and every query
  that does not select it reads the rhythm's own position — the readers that
  derive roles (`training.server.ts`, `stamp.server.ts`, `philosophy.server.ts`)
  select it.

## Alternatives considered

- **A chosen week sets the offset for every block of the phase.** Spacing would
  stay even, but choosing an easy week in block 2 would also move block 1's,
  rewriting lived weeks mid-phase. Rejected: the athlete chose one week.
- **Warn on every week-over-week rise.** Rejected — that is the diff §12
  retired, and it fires on every rebound out of an easy week.
- **Block the apply on a rise over 10 %.** Rejected: §12's "warns and never
  blocks" stands; no surveyed platform blocks on a ramp figure.
