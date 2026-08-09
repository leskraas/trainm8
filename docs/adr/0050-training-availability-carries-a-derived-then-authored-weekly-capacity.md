# Training Availability carries a weekly capacity, derived once and then authored

Status: Accepted

Resolves [#396](https://github.com/leskraas/trainm8/issues/396), which
[ADR 0045 §8](./0045-mix-aware-conversion-decomposes-volume-into-intensity-buckets.md)
and
[ADR 0046 §3](./0046-no-load-number-spans-incommensurable-training-tracks.md)
both deferred deliberately rather than settling by side effect.

## Context

**Training Availability** stored `trainableWeekdays` and `defaultTrainingTime` —
days and a clock time, and nothing about how much time those days hold. That
left the question "does this week fit?" with no counterparty, and two ADRs
refused to fabricate one rather than answer it dishonestly:

- **ADR 0045 §8** derived a week's hours truthfully and then had nothing to
  compare them against, so it declared the fit check **undelivered**:
  _"Declaring this undelivered is preferred to fabricating a comparison."_
- **ADR 0046 §3** stopped cross-track hours at the endurance tracks, noting that
  even a complete total would have had nothing to measure against.
- **ADR 0047 §5** scoped rather than closed the strength half: _"if #396 lands a
  capacity, hours becomes a one-step question"_, and ADR 0043 §6's hours row
  could be restored on a stated athlete-relative source.

Three sections of three ADRs therefore converge on one missing field. What kept
it missing was **ADR 0043 §10**, which killed `KM_PER_HOUR = 10` and took the
posture that no new **Athlete Profile** value should replace it. ADR 0046 §3
already wrote this decision's brief: that posture _"was argued about conversion
constants, not about capacity, so revisiting it is legitimate; doing it inside a
ticket about strength hours would be doing it by accident."_

Two facts shaped the answer rather than the question.

**The app can already compute it.** `readAnchorContext`
(`plan-outline/history.server.ts`) returns average weekly hours per
**Discipline** over four complete Training Weeks, carrying an `AnchorDerivation`
with `source`, `windowWeeks`, `weeksTrained` and `total` — the provenance shape
ADR 0045 §10 asks for, already shipping in the **Volume Currency** proposal. A
derived figure is one call away.

**A target is not a constraint.** The `#374` platform survey records
TrainingPeaks and intervals.icu taking "weekly hours" as a **goal the plan is
sized to** — which is this app's **Season Anchor** in `hours` currency, and
already exists. Neither stores availability _as_ a capacity. The two collapse
for a single endurance track already measured in hours; a capacity earns its
keep where the track's **Volume Currency** is km, TSS or sets, and across
several tracks, where the plan's cost in hours is derived rather than authored.

## Decision

**Training Availability grows a weekly capacity in hours. It is pre-filled from
the athlete's own history with the derivation shown, then authored — and never
re-read.**

### 1. Per week, not per trainable day

A capacity divided evenly across trainable days would assert that availability
is uniform, which is exactly what a long Saturday is not. The figure is hours
per Training Week; how it distributes across the week is what the **Week
Pattern** already says.

### 2. Derived once, authored thereafter

The value is proposed from `readAnchorContext`'s recent weekly hours with the
derivation visible, in the same act and the same idiom as the first **Season
Anchor** segment. Once authored it is a stored athlete statement: nothing
re-reads history, so a plan never shifts because activities arrived in the
background (ADR 0040 §6).

Deriving _and leaving it derived_ was rejected on a case nothing in the repo had
yet named: **history says what the athlete did, capacity says what they could.**
An athlete returning from injury derives low, and a live-recomputing capacity
would warn them against the build they are deliberately starting. The override
is not a convenience — it is the only way the field can carry a statement
history cannot make.

Asking outright, with no pre-fill, was rejected because the app usually knows a
good answer and [#434](https://github.com/leskraas/trainm8/issues/434) is
spending its budget on asking the athlete less, not more. A new account with no
history falls back to asking, and says that it is asking because it has nothing
to read.

### 3. Strength stays out of the hours comparison

Unchanged from ADR 0046 §3 as narrowed by ADR 0047 §5: a strength track has
sessions per week but no non-sparse per-session duration, so it contributes no
hours. The capacity is compared against endurance hours only, and a plan
carrying strength still reads its cross-track hours total as an **Unavailable
Metric** until a duration source exists.

### 4. ADR 0043 §10 is narrowed, not overturned

Its subject was conversion constants — a single scalar standing in for a
relationship between two numbers. A capacity is not a constant and not a
conversion: it is an athlete statement about themselves, of the same kind as a
threshold or a **Season Anchor**. The posture holds everywhere it was aimed.

### 5. The days-against-days check survives alongside

**Quality Session Count** against trainable weekdays needs no conversion and
answers a different question — _can I fit the hard days_ rather than _can I fit
the hours_. It is not superseded, and it remains the only fit check available to
a plan whose hours are Unavailable.

## Consequences

Three places assert the opposite today in the strongest available terms, and all
three ship with this change rather than after it:

- `CONTEXT.md`'s **Training Availability** entry, whose _Avoid_ list currently
  names "weekly capacity (it stores no such thing)".
- The invariant comment in `plan-outline/availability-fit.ts`, which states the
  check _"can never become an hours one, however honestly a week's hours are
  derived."_
- The paragraph an athlete reads in `plan.tsx`'s `AvailabilityFitNotice`: _"That
  is days against days — the only comparison your training availability can
  make, since it records which weekdays you train and no capacity at all."_

ADR 0045 §8's fit check becomes deliverable. ADR 0047 §5's strength-hours route
stays scoped as it left it — this lands only the half #396 owned.

The empty state gains a third case. `trainableWeekdays` already distinguishes
`null` (never set) from `"[]"` (explicitly none); capacity needs the same
discipline, and a plan whose capacity is unset must read the fit check as
unavailable rather than as passing.

**What would change our mind:** if the fit check, once built, fires mostly on
plans the athlete then trains anyway, the capacity is measuring the wrong thing
and should be retired rather than tuned. A warning nobody acts on is a warning
that has already failed.

## What was built (#446)

The decision above shipped unchanged. Five things it did not specify were
settled in the building, and are recorded here so the file stays accurate to the
code.

**The column is `AthleteProfile.weeklyCapacityHours`,** a nullable `Float`
beside `trainableWeekdays` and `defaultTrainingTime` (migration
`20260808162757_add_weekly_capacity`). Validation is
`AthleteProfileUpdateSchema.weeklyCapacityHours`, which takes
`defaultTrainingTime`'s tri-state shape: an emptied box clears to `null`, an
omitted field leaves the stored value alone, and `null` is never set. Zero is
**refused** rather than stored: unlike `trainableWeekdays`, whose `"[]"` is the
athlete saying "no days", a capacity of zero hours is not a statement anyone
makes about a week they train in.

**The pre-fill sums the endurance Disciplines, and its `weeksTrained` is a
union.** `readAnchorContext` gained an `endurance` window beside its
per-Discipline `volumes`, because a capacity is a statement about the athlete's
_week_ — a triathlete has one week to fit three Disciplines into — and the union
cannot be recovered from the per-Discipline counts: an athlete who ran on Monday
and swam on Thursday trained one week, and adding two counts would say two.
`weeklyCapacityFor` turns that window into a proposal or into `null`, and `null`
means the surface asks outright and says why.

**The history read is skipped once the field is authored.** "Never re-read" is
implemented literally: the settings loader reads the window only while the
column is `null`. An athlete who has answered is never shown a fresh reading of
their history beside their own number, which is the live re-derivation ADR 0040
§6 refuses — and the ordinary settings load costs no history scan.

**A warning spans on contiguity and carries its worst week.** The days check
breaks a span whenever the counts change, because session counts are small
integers that repeat across a block. Hours move every week the ramp moves them,
so the same rule would emit one line per week — twenty lines for a twenty-week
plan that never fits. So a run of over-capacity weeks is one warning carrying
`peakHours`, named as the largest figure in the run and worded as "up to",
because claiming it of every week in the span would be a number nothing derived.

**The notice never reports that the hours fit.** An empty hours reading has
three causes — no capacity authored, no week the **Volume Conversion** can price
in hours, or a plan that genuinely fits — and the surface can tell only the
first apart. So it says nothing about hours it did not check, except where the
capacity is simply missing, where it says so and links to the field. That is a
statement about the _setting_, not a verdict on the plan.

### A fourth place asserted the opposite

Beside the three named above, `unavailable-readings.ts` gave
`hours-calendar-cost` two reasons and one of them was this ADR's premise: _"the
**consumer does not exist**: Training Availability stores trainable weekdays and
a clock time and no capacity at all."_ That half is retired — the consumer
exists and the check is built. The reading stays Unavailable on the surviving
half, the missing per-session duration, which is now the only thing absent where
it used to be one of two (ADR 0047 §5). The athlete-facing label in `labels.ts`
never made the retired claim and is unchanged.

### ADR 0043 §10, narrowed in its own file

§4's narrowing is now recorded on
[ADR 0043](./0043-volume-currency-belongs-to-the-training-track.md) as an
Amendment, so a reader arriving at §10 first meets the boundary rather than the
unqualified heading. The posture holds in full for conversion constants; a
capacity buys no conversion.
