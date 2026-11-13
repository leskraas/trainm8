# A Season Anchor is corrected behind the Sesong preview, and a fresh start is pre-filled with the ramp's level

Status: Accepted · Recorded in ticket #673 (part of #457)

**Amends
[ADR 0084](./0084-sesong-edits-preview-first-and-a-week-target-rise-is-warned-between-loading-weeks.md)
§1** (the Season Anchor leaves the list of edits outside v1 that apply with no
preview; this is the follow-up §1 names) **and §4** (the held vocabulary gains
words for a span). **Follows
[ADR 0040](./0040-volume-continuity-and-authored-overload.md) §2, §3 and §5**
(the ramp freezes at the last loading week; a re-anchor restarts the product
from itself; lived weeks never move) and
[ADR 0044](./0044-plan-outline-is-relational.md) §5 (a Week Volume Override is a
leaf that survives a re-anchor).

## Context

A Season Anchor sets every Week Target after it, yet it could only be changed
under _Avansert_, where it applies at once with no preview. #673 routes it
through _Endre sesongen_ as a fourth kind of Sesong edit, reached from a
_Ukevolum_ row per endurance track in _Plan_'s lead, and keeps the direct
editor.

The design asked for a fresh start to be pre-filled with "the week's target ÷
its role factor", so that an untouched pre-fill leaves the picked week as it is.
A probe of `derivedWeekTargets` (two 3:1 phases, +5 % ramp, +10 % boundary step,
a re-anchor on week 3, an easy week) shows that this keeps the picked week and
lowers **every later week of the run by one ramp step**: week 4 46.3 → 44.1,
week 8 59 → 56.2, and so on to the next anchor. The reason is ADR 0040 §2: an
easy week is cut off the **last** loading week, while the next loading week
climbs one step above it. No single value keeps both an easy week and the weeks
after it, because a re-anchor on an easy week makes that week its own reference.

## Decision

### 1. `season-anchor` is a Sesong edit, previewed and digest-tied

`previewSeasonEdit` takes `{ kind: 'season-anchor', trackId, action }` with
`action` one of `add` (from a week), `set` (a segment's value, the segment named
by its `fromWeekKey`) or `remove` (a segment that is not the earliest). It runs
through the same `finish` as the other kinds: both sides read through
`weekViews`, the rise warnings, the held list, the write, the relay weeks and
the digest. The apply writes inside the digest-tied transaction and lays the
changed weeks again with `relayPlanFrom` and `onlyWeekKeys`.

- **One rule for a segment list.** "Two segments cannot share a week" (an `add`
  on a week that has one is a `set` of it, and the summary says so) and "the
  earliest stays" are drawn out of `authoring.server.ts` into one pure function
  over a track's anchors. The preview and `removeSeasonAnchorSegment` both call
  it, so the two writers cannot disagree about which segment may go.
- **Lived weeks.** An `add` before the first unbegun week is `week-lived`. A
  `set` on a segment in force at a begun week is refused as `segment-lived`, and
  when that segment is still in force at the first unbegun week the refusal
  carries the edit to make instead: an `add` from that week with the typed
  value. The domain builds that offer, so the page only renders it. A `remove`
  that would change a begun week falls to the shared `changes-lived-weeks`.
- **Endurance tracks only.** A strength track and the Simple Activities' `other`
  track are refused (`not-endurance-track`). The `other` track's target is the
  hours its fixed days lay, and it is changed in _Meg_ (ADR 0109); a strength
  track's progression is its own blocks'.
- **Overrides are held, not changed.** A Week Volume Override in the changed
  span keeps its value, so its week does not change and is not laid again. The
  preview lists each one whose rule underneath it moved as held, with its value,
  because a revert would now restore the new number. An edit that moves neither
  a target nor the rule under an override is `no-change`.
- **Every after-value says what it is.** A preview's target carries whether it
  is hand-set (`overridden`), and a changed derived target carries its
  derivation: the anchor in force and its week, the loading weeks stepped per
  segment and their ramp, the boundary steps crossed, and the role with its
  factor. The derivation comes from the walk in `derive.ts` that computes the
  number, and `derivedWeekTarget` is its value, so the explanation cannot drift
  from the arithmetic.

### 2. A fresh start is pre-filled with the ramp's level at the picked week

The pre-fill is what a **loading** week at the picked week would derive to: the
anchor in force, times the ramp over the loading weeks before it, times the
boundary steps crossed, with no role factor and ignoring any override there. On
a loading week that is its target. On an easy or taper week it is one ramp step
above target ÷ role factor, and it is the number the next loading week gets.

So an untouched pre-fill leaves every loading week after the picked week where
it was. Only a picked easy or taper week (and the taper weeks after it in the
same phase) rise, by one ramp step, and the preview shows exactly those. The
helper sentence ("the hard weeks are counted from this number") is literally
true. `derive.ts` computes it with the same walk, as one exported function; the
page never divides by a role factor itself.

### 3. The direct editor stays, as a second writer

The anchor editor under _Avansert_ keeps writing at once, and stays the only
place to add a track's first Season Anchor. The Season Anchor is therefore the
one number with a previewed path and a direct one. ADR 0084 §1's "outside v1"
list loses the Season Anchor's value and its re-anchors; the direct editor is
the expert path, and its line still says it applies without a preview.

### 4. Held words for a span (amends §4)

The held vocabulary gains `phases` (_fasene_), `weeks-before` (_ukene før uke
N_, where N is the edit's own week, carried by the summary), `other-tracks` (_de
andre sporene_) and `hand-set-weeks` (_ukene du har satt selv_). Each is stated
only where the preview shows it to hold, as §4 requires.

## Considered options

- **Pre-fill with target ÷ role factor.** Rejected by the probe: on an easy week
  it lowers every later week of the run by one ramp step, and the preview of an
  untouched pre-fill would list the rest of the season.
- **Pre-fill with the picked week's target.** Rejected by the design critic's
  probe: on an easy week it cuts the following weeks by about 30 %.
- **Offer a fresh start only on loading weeks.** Rejected: the criteria let the
  athlete pick the week, and the first unbegun week is often an easy one.
- **Make a re-anchor on an easy week cut off the previous loading week.** It
  would keep both sides, but it reads lived weeks into a new anchor and changes
  ADR 0040 §5's "a new anchor starts the product from itself".
- **Retire the direct editor.** Out of #673's scope, and the first anchor has no
  other home yet.
- **Let the page work out the derivation and the pre-fill from the rows.**
  Rejected: a second copy of the walk.

## Consequences

- `TargetView` gains `overridden`, so the philosophy switch's previews and
  digests change shape too. A preview open across a deploy goes stale once, and
  is refused as `preview-stale`.
- The direct editor still checks no lived week; that is unchanged here.
