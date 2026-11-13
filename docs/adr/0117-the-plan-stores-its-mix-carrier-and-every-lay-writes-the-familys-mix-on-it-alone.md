# The plan stores its Mix Carrier, and every lay writes the family's mix on it alone

Status: Accepted (agent decision on delegated issue #705, 2026-11-13) ·
**Supersedes in part**
[ADR 0104](./0104-one-day-rule-across-tracks-lifting-laid-per-week-and-pinned-days-per-track.md)
§5: its mechanism ("laying a plan writes each block's mix on every endurance
track alike", stripped later by equality) goes; its decision ("the hard sessions
belong to the track that carries the mix") stands. **Replaces** the per-caller
`SegmentsFor` seam that
[ADR 0109](./0109-editing-the-activities-in-meg-re-lays-the-plan-from-the-first-unbegun-week.md)
(Proposed, #587) adds, and the `withoutMix` option the first run passes today.
Closes the generator follow-up ADR 0104's consequences left open
([ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md)).
**Keeps**
[ADR 0046](./0046-no-load-number-spans-incommensurable-training-tracks.md) and
[ADR 0043](./0043-volume-currency-belongs-to-the-training-track.md) §1: the
carrier is no spine, and nothing compares volumes across currencies.

## Context

A plan with more than one endurance **Training Track** lays the family's
**Quality Session Mix** on one of them, and the plan never wrote down which. Six
writers decided it again: the first run and _Hold meg aktiv_ passed
`withoutMix`; _Bytt treningsform_, adding an **Event** and a preset applied laid
the mix on every endurance track; the next open-ended round copied each track's
previous mix forward; the Sesong starter pattern stripped a second track's mix
when it equalled the carrier's; and the switch preview showed the first
endurance track's mix. So a switch doubled the hard sessions of a first-run
plan, and the starter pattern stripped a mix the athlete wrote by hand when it
happened to equal the laid one (the case ADR 0104 §5 admitted it could not tell
apart). Three pure copies of "which track gets which segment" (`draftRows`,
`rowsAfter`, `layEnduranceSegments`) also disagreed about the Simple Activities'
track, so a preview could differ from the rows written.

## Decision

### 1. The plan stores its Mix Carrier

`PlanOutline.mixCarrierTrackId` names one of the plan's own endurance tracks
(run, bike or swim; never strength, never the Simple Activities' `other` track),
or is null when the plan has none. It is an **authored decision** (Derived,
never authored, ADR 0112 §1.1): written at the act that makes or changes the
plan, by the rule below that this ADR gives the app (ADR 0112 §2), and never
re-derived from the plan's rows. One column on the plan allows at most one
carrier by construction (`@unique`, a one-to-one relation).

The foreign key is `ON DELETE NO ACTION`, as ADR 0113 §7 set a Week Pattern
day's Workout: deleting the carrier's track without first passing the carrier
fails the statement, so a writer that forgets the rule fails loudly rather than
leaving a plan silently without one. A cascade that removes the whole plan (a
deleted plan, a deleted athlete) passes, since the check runs at the end of the
statement. Settled by probe in SQLite 3.53: the direct delete fails with
`FOREIGN KEY constraint failed`, the cascades from the athlete and from the plan
pass.

That the carrier is one of the plan's own endurance tracks is held by the one
module that writes it (§3) and by its tests; a CHECK cannot read another table,
and this repo declines triggers.

### 2. Who carries it, and what moves it

- **Made by the first run or _Hold meg aktiv_:** the main sport, the track the
  start marks to carry the family's mix (the first endurance sport picked).
- **Made in Sesong from a shape, or by a generated season:** the endurance track
  with the largest first **Season Anchor** when every endurance track counts in
  one **Volume Currency**, else the first endurance track the athlete listed.
  This is the order today's starter pattern already picks in once the mixes are
  equal, so a Sesong plan keeps the carrier it gets today. Anchors are compared
  only within one currency (ADR 0046).
- **Moved only by an athlete act:** changing the main sport in _Meg_ (#587);
  removing the carrier's track, which passes it to the next endurance track by
  the creation rule, and that track takes the removed carrier's mix on every
  phase where its own segment has none; adding an endurance track to a plan that
  has no carrier. Removing the last endurance track leaves none. Nothing
  re-picks it on a lay, so re-anchoring a track never moves hard sessions
  between sports.

### 3. One module owns it, and every lay asks it

`app/utils/plan-outline/mix-carrier.ts` holds the pure rule: which tracks may
carry, the creation pick, and the one function that says what an endurance
segment laid on a track for a phase holds (its rates, the Simple Activities'
flat segment on `other`, and the phase's mix on the carrier alone). Its server
half reads and writes the column and passes the carrier on a removal.

Every writer of new phases goes through it: creating a plan, _Bytt
treningsform_, adding an Event, the next open-ended round, a preset applied, the
generator, and #587's activities edit. `layEnduranceSegments` reads the stored
carrier itself instead of taking an option, so no caller can choose differently.
Every reader that showed or guessed a carrier asks it: the switch and
add-an-Event previews, through `OutlineRows.mixCarrierTrackId`, and the starter
pattern, which deals the long day and the hard days to the carrier it is given
and strips nothing. The equal-mix strip goes.

The next open-ended round lays the carrier's previous mix on the carrier and no
mix on the other tracks. It copied each track's own mix forward before, which
would keep a laid mix stored on a second track alive round after round; a round
is a lay of new phases, and §4's repair path depends on it.

The day dealing of ADR 0104 §1 to §4 is unchanged, and so is the stamp's order
and its spreading of a second track's own mix (ADR 0104 §2).

### 4. Existing plans get a carrier and keep every mix

One migration adds the column and records a carrier for every plan with an
endurance track: the track whose mix asks the most hard sessions in any one
block (on a first-run plan, the main sport, the only one with a mix), then the
largest first Season Anchor when the endurance tracks share one currency, then
the first track written. That is today's starter pattern's own pick, so a plan's
weeks read the same before and after the release. It rewrites no mix and no
session: the stored rows cannot tell a laid mix from an authored one, which is
the very misreading this ADR removes, so a laid mix already on a second track
stays until that plan's next lay of new phases. The backfill is the app's
decision at the release (ADR 0112 §2), made once and never re-derived.

### 5. A generated season places quality on the carrier

The deterministic generator picks the carrier from its request's tracks by the
pure creation rule, places the mix's quality sessions on the carrier's days only
and easy sessions on the other endurance tracks, and the plan it writes records
that same carrier. A re-lay of its weeks (#686) then reads the carrier the
generation used.

## Considered options

- **Derive the carrier from track order, or from the largest anchor.** Rejected:
  #587 moves the main sport without reordering tracks, and a carrier read from
  an anchor flips when a track is re-anchored.
- **A flag per track with a partial unique index.** It would hold "one per
  plan", "own track" and "endurance only" in the database. Rejected for now:
  Prisma 6 does not model a partial index, so the next generated migration would
  try to drop it. The column holds one per plan by construction, and the module
  holds the rest.
- **`ON DELETE SET NULL`.** Rejected: a removal that forgot to pass the carrier
  would leave a plan with no hard sessions and no error.
- **Keep `withoutMix` and `SegmentsFor` per caller, documenting the split.**
  Rejected: six call sites choosing again is how the switch came to double the
  hard sessions.
- **Strip an equal mix from second tracks in the migration.** Rejected: it
  repeats ADR 0104 §5's misreading on every existing plan at once.

## Consequences

- `GLOSSARY.md` defines **Mix Carrier**; the **Week Pattern** entry deals the
  long day and the hard days to it.
- A Sesong athlete has no control to choose the carrier. The main sport is
  chosen in the first run and, with #587, in _Meg_.
- A second track's own mix, kept or authored, is still the athlete's and is
  spread by the stamp; only a lay of new phases leaves it off the new phases.
- The week strip's **lead track** (the first track not in sets) is a display
  choice and is not the carrier.
