# One day rule across tracks, lifting laid per week, and Pinned days per track

Status: Accepted · Spec #588 (_Dagplassering_) · Recorded in #589, built across
#589–#598

**Supersedes in part**:

- [ADR 0091](./0091-the-stamp-lays-the-quality-session-mix-and-the-first-run-starts-at-what-you-train-now.md)
  §1, where the days a track's mix is spread away from are that track's own (its
  long day and its fixed quality days). They are now every track's, as §2 says.
  Candidate days, determinism, the tie rule and "hardest zone on the earliest
  picked day" stand.
- [ADR 0103](./0103-the-first-run-asks-how-often-the-athlete-lifts-and-lays-lifting-away-from-hard-days.md)
  §2, where every week's lifting days are fixed from the start, picked against
  week 1. **The ordering stands**; it is now applied to each week (§3).
- [ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md) §4's
  starter Week Pattern as built (`proposeStarterPattern`): every endurance track
  on every available day, every track's long day on the last one, and lifting
  from the front of the week. The starter pattern deals days instead (§5).

**[ADR 0046](./0046-no-load-number-spans-incommensurable-training-tracks.md)
stands.** Nothing here adds a load, fatigue or hours figure across tracks. The
day rule reads what kind of day a day is, never how much.

## Context

An athlete with more than one **Training Track**, or a track and a **Simple
Activity**, got weeks whose days did not fit together. The stamp spread each
track's **Quality Session Mix** away from that track's own days only, so another
track's intervals, a `hard` _Langrenn_ day or a lifting day could land on the
interval day or the day before it. The first run laid lifting away from hard
days (ADR 0103), while the Sesong strength offer and the starter pattern laid it
on the earliest days. Lifting picked against week 1 stayed put when a later
phase moved the hard days. The fit check counted sessions and never read days,
and _Bytt dag_ and Week Replan moved a session to the first free day whatever
that day held. Five places answered "does this day fit" five ways.

## Decision

### 1. One cross-track day rule

One pure module (`app/utils/plan-outline/day-rule.ts`) reads a week's laid
sessions across every track and Simple Activity, on the Week Pattern's
Monday-first days, as a wheel where Sunday is the day before Monday. It says
what each day is and whether placing a session on a day clashes, and why.

- A **Hard day** is a day with any session whose **Effort Word** is not _rolig_:
  the stamp's quality zones and a Simple Activity's `middels` or `hard`, as the
  first run already read it.
- A **Long day** is the day a track lays its long session. It is a role, not an
  effort.
- A **Lifting day** carries a strength session.

A clash has one of seven reasons, a closed set every caller words:

| Reason                    | What it means                                                       |
| ------------------------- | ------------------------------------------------------------------- |
| `lifting-on-hard-day`     | lifting on a Hard day                                               |
| `lifting-before-hard-day` | lifting the day before a Hard day                                   |
| `lifting-on-long-day`     | lifting on the Long day                                             |
| `hard-days-in-a-row`      | two Hard days in a row                                              |
| `two-hard-sessions`       | two sessions that are not _rolig_ on one day                        |
| `two-long-sessions`       | two long sessions, two Long days, on one day                        |
| `easy-before-hard-day`    | a _rolig_ session moved to the day before a Hard day (placing only) |

`easy-before-hard-day` (spec #588 story 28, added by #595) is a **placing**
reason: every laid week has easy days before its hard ones by design, so the
week's own clash list (the fit check) never names it. Only placing a session, as
_Bytt dag_ and Week Replan do, asks it, so a move keeps the day before the key
session free.

The stamp, the lifting-day search, the availability fit check, _Bytt dag_ and
Week Replan all ask this one module, so they cannot drift apart again.

### 2. The stamp lays each track's mix around every other track

When `planStamp` lays a track's Quality Session Mix, the days it spreads away
from include every other track's hard sessions, long days and lifting days that
week, every Simple Activity that is not _rolig_, and every session already in
the week that the stamp does not write: one the athlete scheduled by hand, or
one another plan laid (spec #588 story 34). The stamp lays around those and
never moves them. No day carries two long days. The rest of ADR 0091 §1 stands.

The tracks are laid in one order each week: a track on its Pinned days first
(§4), then the track whose mix asks the most hard sessions that week, then the
rest in track order. So the week's hard mix gets the room, and a lighter mix
steps around it whichever order the tracks were made in.

### 3. Lifting is laid per week

The strength track's lifting is laid by the stamp for each week, after that
week's endurance mix, with ADR 0103 §2's ordering: the fewest lifts on a Hard
day (`middels` counts), then on the day before one, then on the Long day, then
the lifts furthest apart, then the earliest. A phase that moves the hard days
moves lifting with them. The rule is deterministic, so a re-lay lands where the
stamp did. **Strength Frequency** says how many lifts a week.

The days a lift may go on are the athlete's **Training Availability**. Where
they never stated it, a lift goes on the pattern's own days, and where those are
fewer than the lifts, the starter pattern's default four-day week
(`DEFAULT_TRAINING_WEEKDAYS`: Tuesday, Thursday, Saturday, Sunday) lends the
rest (#592). This invents days the athlete never named, so it is the fallback
only: it keeps the number of lifts the athlete asked for rather than silently
dropping one, and stating availability replaces it. The session lifted, its
place after the day's endurance session and the _Nybegynner_ cap (ADR 0103
§3–§5) stand.

### 4. Pinned days per track

A track may carry **Pinned days**: weekdays the athlete chose for it, Monday
first, always a subset of **Training Availability**. None (_La appen velge_) is
the default and means the day rule lays the track.

- A track with Pinned days trains only on them, and the other tracks are laid
  around them.
- Pinned days stay where the athlete put them even when they clash. The fit
  check says so and names the athlete's choice as the cause. It never moves
  them.
- A choice holds in every Week Pattern that holds the track, not only the one
  the weeks are laid from, so a week stamped from any of them keeps it.
- On the strength track, the number of Pinned days is the Strength Frequency:
  the profile's answer and every strength block of the track (story 20).
- Removing a day from Training Availability drops it from every track that
  pinned it, and says so.
- **A Simple Activity's days are always Pinned days.** It has no _La appen
  velge_: it carries no mix and no volume of its own for a rule to deal, so its
  chooser is the weekday chips alone (narrowing #598's "the same control as for
  strength"). When removing an availability day would leave an Activity with no
  day at all, it keeps that day and Meg names it, since only the athlete can
  name its new day; the chooser then names the day that is no longer a training
  day (narrowing #588's "always a subset").
- **Fixed strength days already stored**, from the first run or the strength
  offer, are read as Pinned days and are not moved. _La appen velge_ hands them
  back to the per-week rule. Nothing is migrated.

### 5. One strength rule everywhere, and a starter pattern that deals days

The first run, _Bytt treningsform_, the Sesong strength offer and the starter
pattern lay lifting by §3. "From the front of the week" is retired. The starter
pattern deals endurance days as the first run deals sports: at most one
endurance session a day, the track carrying the family's mix (or else the
largest share) gets the long day and its hard days, and each track's long day is
on its own day.

The hard sessions belong to the track that carries the mix. Where more than one
endurance track carries one, as a Sesong run and bike plan laid from a family
does, the starter pattern keeps the mix on the track asking the most hard
sessions (then the largest share, then the first) and strips the laid mix from
the others, which keep their days and climb and train easy. The first run
already lays a second sport without a mix (#558); this makes the Sesong starter
agree.

It strips only the mix the plan laid, never one the athlete authored. Nothing
stores who wrote a mix, so the starter reads it off the mix itself: laying a
plan writes each block's mix on every endurance track alike, so a second track's
block whose mix equals the carrier's on the same block is the laid one and goes.
A block whose mix differs, or where the carrier has none, is the athlete's own,
authored before the starter week was built, and stays. An athlete who authors
exactly the carrier's mix on a second track cannot be told from the laid one;
that is the one case the guard strips. The stamp's spreading (§2) places the
athlete's own mixes on a second track, kept here or authored afterwards.

### 6. The fit check reads days, and warns only

The availability fit check adds the day rule's clashes, naming the weekday and
whether a Pinned day caused it. It warns and never blocks, and shows no number
that combines tracks (ADR 0046).

## Considered options

- **A cross-track load or fatigue score per day** to place sessions by.
  Rejected: that is the incommensurable figure ADR 0046 refuses. A day's kind is
  enough to say "lifting the day before intervals".
- **"Hard days hard"**, lifting on the interval days. Still rejected, as in
  ADR 0103. It may come back later as an athlete option.
- **Keep lifting fixed from week 1** and only warn later. Rejected: build and
  peak weeks would put hard runs on or right after lifting, and the warning
  would fire on a plan the app laid itself.
- **Migrate stored fixed strength days to the per-week rule.** Rejected: it
  would move athletes' gym days overnight. They read as pinned until the athlete
  hands them back.

## Consequences

- The first run's week 1 lifting days do not change: the first run already used
  this ordering, now read from the shared module.
- The season generator's own quality placement (ADR 0053) does not lay strength
  and is not aligned here. That is a follow-up.
- Weekdays: Training Availability is Sunday-first (ADR 0005) and the Week
  Pattern, Pinned days and the day rule are Monday-first. They convert only at
  the profile edge.
