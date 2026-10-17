# The first run shows up to three Start Options as real weeks, and _Stor base_ starts all easy

Status: Accepted · Owner decisions 3, 4, 5 and 9 of spec #558 (_Levende start_,
2026-10-17) · Recorded in ticket #559; built in #558 S2–S3

**Amends [ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md)**:
_Stor base_'s first block has an empty **Quality Session Mix**. This changes the
preset itself, not only the first run. **Confirms
[ADR 0091](./0091-the-stamp-lays-the-quality-session-mix-and-the-first-run-starts-at-what-you-train-now.md)
§3**: the hours given are week 1, and the plan climbs from there. **Confirms
[ADR 0079](./0079-a-training-plan-may-be-open-ended.md)** as built in #505 S14:
the plan starts on the first week not yet begun. **Replaces** that S14 record's
_"the philosophy is proposed with one reason"_ (`chooseFamily`) in the first
run: the athlete picks a way to train from real weeks instead.

## Context

The first run asks a coach's questions. It proposes one of five philosophies
with a reason, and the athlete must know what _Klassisk 3:1_ or _Terskelfokus_
means to switch it. They never see two real weeks side by side, so they cannot
pick a way of training by what it would feel like.

Showing real weeks exposes a fault in the presets. _Stor base_'s first block
asks for one tempo session a week, as _Klassisk 3:1_'s does, on the same 3:1
rhythm and ramp. For the first week the two families lay the same week, so a
beginner offered both would be shown two identical cards.

## Decision

### 1. Up to three Start Options, each one family's real first week

A **Start Option** is one **Periodization Preset** family's first week, laid for
the athlete's answers by the real engine: the family's open-ended round (rhythm,
ramp, Quality Session Mix), the starter **Week Pattern** on the chosen days, and
the stamp (ADR 0091 §1). It is a reading, never stored. The UI calls the set
_tre måter å trene på_; each card leads with a plain name, shows the family's
name small, and its button says _Velg denne_. They are not called _forslag_:
that word belongs to the **Week Replan Proposal**.

- **Which families**: _Polarisert 80/20_, _Terskelfokus_ and _Klassisk 3:1_. For
  a _Nybegynner_, _Stor base_ replaces _Terskelfokus_. _Masters 2:1_ is not
  offered in the start; it stays reachable from _Plan_ → _Avansert_. The age
  rule that picked Masters, and the rest of `chooseFamily`'s one reason, are
  retired from the start.
- **Ranked by Session Preference.** A family scores for the preferences it suits
  (_korte harde intervaller_ → Polarisert; _jevnt hardt_ → Terskelfokus; _lange
  rolige_ → Polarisert or Stor base; _overrask meg_ → Klassisk; _korte økter_ →
  Terskelfokus), sorted stably. _Passer deg best_ is shown only when the top
  score is above zero. Otherwise a beginner's _Stor base_ card may say _Anbefalt
  for nivået ditt_, and any other athlete sees no badge. A badge always has a
  reason. Preferences order the options and shape session lengths within the
  family's rules; they never change a family's mix.
- **The Week Sketch is the top option's first week.** The live week on the
  question screens (_Uka di_) comes from the same draft. It is not a second
  generator.

### 2. Never two identical weeks

Two options are identical when their first weeks match day for day: the same
weekday, activity, effort and minutes. Identical options are **merged**, keeping
the higher-ranked one, and only the distinct ones are shown, with a sentence
saying some ways were identical for these answers. Few days still merge real
presets: two days cut every mix to one hard session, and one day leaves none, so
all three can merge into one.

### 3. _Stor base_'s first block is all easy

_Stor base_'s first block, and so its open-ended round, has an **empty Quality
Session Mix**: no hard sessions. Its later blocks are unchanged. This is a
change to the preset, so it applies to every plan made from _Stor base_ after
it, anchored to an Event or open-ended. **Training Tracks** already written keep
their stored mix until the athlete re-applies a philosophy. It is the one change
to the presets' shapes; nothing else in them moves.

### 4. The hours are week 1

Week 1 of every option adds up to the hours given, across every track counted in
hours. Where it cannot, the option says so in one plain sentence with the reason
(sessions capped by a preference, too few days, a session that would be too
short). The family climbs from there (ADR 0091 §3), and the hours are never a
ceiling. The **Weekly Capacity** stored is still the plan's heaviest week.

### 5. The plan starts on the first week not yet begun, and nothing is marked

The **Plan Start Week** is the first week not yet begun, as the first run
computes it today. On a Wednesday the plan opens next Monday, and the start says
so (_Planen starter mandag 19. oktober_). Nothing is laid on the days before it.
**Making a plan never marks a session done or _ikke gjort_.** The prototypes
that pre-marked past sessions as done were wrong.

### 6. The **Training Level** sets the defaults

The level is the athlete's description of themselves, never a measured quantity.
It sets defaults the athlete can change, and history replaces the hours and days
when the findings reader has them. These are conventions, named as constants,
not research findings:

| Level         | Hours | Days                         | Session cap | Strength default |
| ------------- | ----- | ---------------------------- | ----------- | ---------------- |
| _Nybegynner_  | 3     | man, ons, fre                | 4           | 1                |
| _Mosjonist_   | 5     | man, ons, fre, lør           | 6           | 1                |
| _Erfaren_     | 7     | man, tir, tor, fre, søn      | 6           | 2                |
| _Konkurranse_ | 10    | man, tir, ons, tor, lør, søn | 6           | 2                |

Hours run 1–20 in half-hour steps. The level adds a session cap and per-kind
shortest and longest sessions to the first run's existing cuts (ADR 0091 §4).

## Considered options

- **Keep _Stor base_ as it is, and rely on merging alone.** Rejected by the
  owner: a beginner would usually see two cards where three were promised, and
  the family meant for a first season would vanish into _Klassisk 3:1_.
- **Always show three cards, even when two lay the same week.** Rejected: it is
  not a real choice, and an athlete who notices stops trusting the others.
- **Keep one proposed philosophy with a reason, and a switch.** Rejected: an
  athlete cannot judge a philosophy by its name. They can judge a week.
- **Offer _Masters 2:1_ by age.** Rejected for the start: age is not one of the
  questions, and Masters is still one tap away on _Plan_.

## Consequences

- [ADR 0048](./0048-a-season-shape-is-picked-before-a-plan-exists.md) carries a
  note pointing here, and `GLOSSARY.md`'s **Periodization Preset** says _Stor
  base_ starts all easy.
- Every new _Stor base_ plan, from the first run or from _Plan_ → _Avansert_,
  lays no hard session in its first block. ADR 0091 §1's stamp has nothing to
  lay on its share days there.
- The **First Run** becomes three question screens, the Start Options and
  _Planen er klar_. The connect screen and _Dette fant vi_ give way to a quiet
  connect link on the first screen; the findings reader is reused without its
  screen, its arithmetic behind a disclosure.
- _Bytt treningsform_ on _Plan_ shows the Start Options again (ADR 0101 §2).
