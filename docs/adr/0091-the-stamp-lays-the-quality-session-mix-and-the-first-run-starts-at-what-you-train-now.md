# The stamp lays the Quality Session Mix, and the first run starts at what you train now

Status: Accepted · Owner decision 15 (round 2, 2026-10-10) and the round-2
first-run audit (PR B) · ADR number 0091 claimed by branch
`claude/r2-firstrun-meg-finish` · **§3 confirmed by
[ADR 0102](./0102-the-first-run-shows-up-to-three-start-options-as-real-weeks-and-stor-base-starts-all-easy.md)**:
the hours are week 1 of every Start Option.

**Amends [ADR 0044](./0044-plan-outline-is-relational.md) §7** (a pattern day
carries no zone — it still does not, but the stamp now gives a bare share day
the week's hard session) and the **First Run** as built for #505 stories 64–68
(the hours were a ceiling). **Narrows
[ADR 0050](./0050-training-availability-carries-a-derived-then-authored-weekly-capacity.md)
§2** for the first run only (what the hours answer is). **Follows
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)**:
the session titles the stamp stores are Norwegian, from `labels.ts`.

## Context

The round-2 first-run audit found three things wrong with the plan the first run
made, and one with every plan's stamp:

1. **"Timer i uka" was pre-filled with what the athlete trains now, then used as
   a ceiling.** The draft stepped the first week down until the family's
   heaviest week fitted under the hours (`cappedAnchor`), so a runner who trains
   4 t got a plan starting at 2,5 t (−37 %). The owner decided the hours are
   what the athlete trains **now**, and the plan starts there (decision 15).
2. **Switching philosophy changed nothing visible.** Every bare share day was
   laid easy, whatever the segment's **Quality Session Mix** said, so Klassisk
   and Polarisert laid identical weeks and "Terskelfokus … to i uka" laid none.
   The mix was authored, previewed and warned about (`readStampedMixWarnings`),
   but never laid.
3. **The preview and I dag disagreed on names.** Step 5 said
   `Rolig økt · Løping`; the stamp stored `deriveWorkoutTitle`'s `54 min` /
   `1 h 48 min` (English `h`).
4. **Small answers made silly weeks**: 0,5 t over four days laid
   `Langtur · 6 min`, and seven chosen days laid seven sessions with no rest
   day.

## Decision

### 1. The stamp lays each week's Quality Session Mix on its bare share days

`planStamp` (`app/utils/plan-outline/stamp.ts`) now takes each week's segment
mix (`StampWeekInput.mixes`, passed by `stampWeekPattern` and by the first-run
draft) and, per endurance track:

- **marks the long day**: the share days that weigh the most, where that is more
  than some other share day weighs (`role: 'long'`). A week of equal days has no
  long day.
- **lays the mix on ordinary bare share days**: never the long day, never a
  fixed day or a shaped day (their Workout says what they are), and never more
  hard days than there are ordinary ones. What a fixed or shaped day already is
  counts against the mix (a fixed threshold session _is_ the week's threshold
  session). Days are picked one at a time as far as the week allows from the
  long day, the fixed quality days and the days already picked, the earlier day
  on a tie; the hardest zone goes on the earliest picked day.
- **moves no volume**: a hard day keeps the share it had, so the week still sums
  to its target. Deterministic, so a re-lay lands where the stamp did.

A pattern day still carries no zone (ADR 0044 §7 stands): the zone is the
segment's, decided per week at stamp time, and stored on the new Workout as its
**intent** (`tempo` / `threshold` / `vo2max` for zones 3 / 4 / 5), which is what
`intentToZone` and the mix-disagreement check read back. The structure is still
one bare step of duration or distance; no intensity target is invented, so
**Planned TSS** for these sessions stays unavailable, as before.

What does not fit (a mix of two hard sessions on a two-day week) is left to
`mixDisagreements` to say softly, as before. The first-run draft cuts its mix to
the pattern's days less the long day before deriving, so what it shows fits.

### 2. A stamped bare session is titled in Norwegian by what it is

New bare sessions are titled `stampedSessionTitle(session)`
(`app/utils/session-title.ts`, words in `STAMPED_SESSION_LABELS`): the kind,
then the sport — `Rolig økt · Løping`, `Langtur · Løping` (`Lang økt` for a
swim), `Tempoøkt` / `Terskeløkt` / `Intervalløkt · Sykling`. The first run's
step 5 calls the same function on the same planner output, so the preview and I
dag say the same words. A **shaped** day keeps the athlete's own title, and a
**fixed** day is copied as authored, as before. `deriveWorkoutTitle` is
unchanged for every other caller.

### 3. The first run's hours are where the plan starts, not a ceiling

`draftFirstRunPlan` anchors the track's **Season Anchor** on the hours given;
the family climbs from there (`cappedAnchor` is gone). Step 3 says so under the
field ("Det du trener nå. Planen starter der og bygger seg opp."), step 4 says
`Første uke: 4,5 t – det du trener nå` and the heaviest week.

Because the plan now asks for more than the hours given, the **Weekly Capacity**
the first run stores is the **plan's heaviest week**, rounded up to the tenth
the currency is written in (and never below the hours given), so the hours fit
check (ADR 0050 §5) does not fire on the plan just made. This narrows ADR 0050
§2 for the first run only: the hours question there answers "what do you train
now", and capacity is read off the plan the athlete accepted. Meg's profile
still authors capacity directly, and nothing re-reads it later.

### 4. The first run lays no session under half an hour, and keeps a rest day

`patternDaysFor` cuts the chosen days to what the hours can fill with no session
under 30 minutes (`MIN_SESSION_HOURS`, the long day weighing double) and to six
(`MAX_SESSION_DAYS`): seven chosen days lose the one whose going leaves the rest
most evenly spaced (Monday, after Sunday's long day). The long day always stays.
The starter **Week Pattern** is laid on those days; the athlete's **Training
Availability** keeps every day they chose. Step 5 says when and why the plan
uses fewer days than were chosen.

## Consequences

### Existing plans, when a week is laid or re-laid

Nothing already stored changes: no migration, no re-title, no re-intent. What
changes is every **new** write of the stamp, for every plan, not only plans made
by the first run:

- **The horizon fill** (`fillPlanWeek`: each week's close, an open-ended plan's
  next round, a plan gaining an Event) lays its next week with that week's hard
  sessions on the ordinary bare share days, Norwegian titles, and a quality
  intent on the hard days. A plan whose segments author a mix — every shipped
  preset does, in every phase but the taper (Klassisk's Grunntrening asks for
  one tempo session a week) — will see its next laid week carry one or two hard
  sessions where its earlier weeks had none. A plan whose pattern has one share
  day, or only a long day and fixed days, gets none.
- **A re-stamp in Sesong** (the explicit second submit that replaces a week's
  scheduled, untrained sessions) re-lays those sessions the same way. Sessions
  that were trained (completed, logged, backed by a Recording) are never
  replaced, as before.
- **"Kopier uke"** copies sessions as they are and is unaffected.
- **Week volume is unchanged**: hard days keep their share. **Planned TSS** is
  unchanged (still unavailable on a bare step). **What does change on screen**:
  the session's profile bar and zone word come from the intent, so a hard day
  reads as its zone for its whole duration (a 66-minute `Tempoøkt` draws as 66
  minutes of zone 3) — the honest reading of a session that names an effort but
  no structure, until the athlete writes one.
- **`readStampedMixWarnings`** fires less: a laid week now holds the mix it was
  asked for, except where the week has too few ordinary days.
- **Weekly Capacity** of existing athletes is untouched; only a new first-run
  plan writes it (§3).

### Stored English titles that are not migrated

Sessions stamped before this decision keep the title they were given, by choice:
the athlete may have renamed them, and a title is the athlete's to edit. They
are display-only English the I dag row already shows beside its own Norwegian
figures:

| Source                                                | Stored shape (examples)                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| bare share on an `hours` track (`deriveWorkoutTitle`) | `54 min`, `1 h 48 min`, `1 h`                                               |
| bare share on a `km` track                            | `10 km`, `8.2 km`, `800 m`                                                  |
| a structure with no quantity (discipline fallback)    | `Run`, `Bike`, `Swim`                                                       |
| a shaped or fixed day (copied as authored)            | the athlete's own words, e.g. `Steady Aerobic Hour` — not ours to translate |

The shared dev database held 29 `generated` sessions: 15 with the duration
shape, 14 with authored titles. A display-time mapping (as cross-cutting polish
did for Week Replan notes) remains possible later; it is an owner decision.

### Tests

`stamp.test.ts` (mix laying, long day, fixed days counting),
`stamp.server.test.ts` (titles and intents written), `draft.test.ts` and
`plan.server.test.ts` (start at the hours, capacity = heaviest week, ≥ 30 min,
rest day), and `start/first-run.route.test.ts` (what steps 4–5 show is what is
stored).
