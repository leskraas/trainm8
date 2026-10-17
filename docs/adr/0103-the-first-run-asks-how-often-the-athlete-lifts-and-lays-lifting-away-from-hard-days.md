# The first run asks how often the athlete lifts, and lays lifting away from hard days

Status: Accepted · Owner decision 6 of spec #558 (_Levende start_, 2026-10-17) ·
Built in #574 (S8)

**Amends
[ADR 0053](./0053-season-generation-is-deterministic-behind-the-seam.md)** and
the glossary's **Periodization Preset** note, which said a strength frequency
comes only from the athlete's history. It now comes from history **or from the
athlete's own answer**, and is still never invented. **Extends
[ADR 0102](./0102-the-first-run-shows-up-to-three-start-options-as-real-weeks-and-stor-base-starts-all-easy.md)
§6**: the level table's _Strength default_ is a pre-set for a question, not a
frequency the plan uses unasked.

## Context

ADR 0053 rejected inventing a strength `sessionsPerWeek` from availability, and
the only way to a strength track was Sesong's offer from lifting history. A new
athlete who lifts but has no history in trainm8 could not get lifting in their
plan from the start. The simple start shows real weeks (ADR 0102), so lifting
has to be in those weeks, honestly.

## Decision

1. **Asked, not guessed.** Picking _styrke_ asks one tap: _1_, _2_ or _3_
   strength sessions a week. It is pre-set from the lifting history through the
   strength offer's own reading, with a line saying so, or else by the
   **Training Level**. The tapped number is stored on the **Athlete Profile** as
   the athlete's answer and changed in _Meg_. Changing it there changes the
   answer, not a plan already made.
2. **Lifting days away from hard days.** Every Start Option lays that many fixed
   lifting days on the athlete's days: of every way to pick them, the fewest on
   a day with a hard or middling session, then on the day before one, then on
   the long day, then the furthest apart. One lift a day at most, so fewer days
   than lifts lifts once on each, and the card says so.
3. **The session lifted.** A lifting day copies the athlete's most recent
   strength session, or else the Catalogue's full-body **Stock Workout**
   (`strength-S1`, _Anatomical adaptation, full body A_), shipped to production
   in a migration for this. The plan gets a `sets` strength track anchored on
   that session's sets per lifting day, and a strength block over the round on
   the general goal, as the strength offer writes them.
4. **Lifts, not minutes.** A lifting day shows the session and its lifts. It is
   not counted in the hours: week 1 still equals the hours (ADR 0102 §4), and
   the card says _+n styrkeøkt(er)_ beside them.
5. **The session cap is the week's.** A level's session cap counts lifting
   sessions too, so a _Nybegynner_ who lifts once gets three endurance sessions,
   and endurance always keeps one.

## Considered options

- **Use the level's default without asking.** Rejected: that is the invented
  frequency ADR 0053 refused, with a table in place of availability.
- **Count strength in the hours with an estimated duration.** Rejected: ADR 0046
  §3 keeps a strength session's calendar cost an **Unavailable Metric**, and an
  estimate would put minutes on the card nothing measured.
- **Lift on the hard days ("hard days hard").** A real coaching choice, but it
  stacks fatigue on the sessions the family's mix depends on, and the owner
  asked for lifting away from them.
