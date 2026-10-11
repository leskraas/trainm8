# The writing line reads lifts, and the Token Sentence speaks Norwegian

Status: Accepted · Owner decisions 3 and 8 (round 2, 2026-10-10)

**Amends [ADR 0027](./0027-text-first-workout-authoring.md)** twice: §1 and its
#505 S11 amendment (the reader, which read only runs, rides and swims), and
assumption A3 (the notation's glue words are English). **Follows
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)**:
the words live in `labels.ts`. **Leans on
[ADR 0061](./0061-the-exercise-database-is-a-seed-and-a-movement-pattern-nobody-published-stays-null.md)**
for what an exercise is, and on owner decision 9 for the Norwegian aliases the
exercise database carries.

## Context

The writing line (ADR 0082 S11) reads `10 km rolig` and
`3x10 min terskel p 1 min`, and nothing else. A strength session took a
different road: the Styrke chip opened the English full editor, where a two-lift
session cost twenty-odd interactions and left I dag (round-2 create-session
audit §3, §9). The session composer prototype read `Knebøy 5×5 @ 80 kg` with a
throwaway reader, and that line was the fastest way to write a lift session of
all four variants. The owner accepted making it real (decision 3).

The line also answered in two languages. The athlete typed Norwegian (`p 90 s`,
`terskel`) and the echo under the line, the row and the detail view answered in
ADR 0027 A3's English glue: `(1 min 30 s rest)`, `+ block`, a popover titled
`REPEAT COUNT`, a stored `easy` drawn as `Easy`. The owner chose Norwegian on
display, with stored notation unchanged (decision 8).

## Decision

### 1. The reader reads lifts

`parseWorkoutSentence` (`app/utils/workout-sentence.ts`) reads a lift part as a
name and its sets, in the forms a coach writes them:

| Typed                                                       | Read                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Knebøy 5×5 @ 80 kg`, `Knebøy 5x5 80kg`, `3 sett à 8`       | sets × reps, at a load                                                     |
| `82,5 kg` / `82.5 kg`                                       | a decimal kilo either way                                                  |
| `Knebøy 82,5 kg × 5 · 5 · 5 · 4`, `5/5/5/4 @ 80 kg`         | one set per rep count (the owner's display form reads back)                |
| `5 @ 80 kg / 3 @ 90 kg`, `Knebøy 3×5 @ 80 kg + 2×3 @ 90 kg` | sets at different loads; a part with no name carries on the lift before it |
| `@ 80 %`, `@ kroppsvekt`, no load at all                    | `pct1RM`, `bodyweight`, or no load                                         |
| `Planke 3×45 s`                                             | timed sets                                                                 |
| `p 3 min`, `3 min pause`                                    | rest between sets                                                          |
| `Benkpress 5×5 @ 60 kg · Roing 3×8`                         | lifts joined by `·`, `,`, `+` or `→`                                       |

`·` is the one join that also means something inside a lift: between two rep
counts it separates sets, and it joins two parts otherwise. Which one is decided
by the tokens on both sides of it, never by a guess.

**The structure is the strength editor's.** A lift session is
`discipline: 'strength'`, one block of `repeatCount: 1`, one strength step per
lift in the order typed, each set
`{ kind, orderIndex, reps | durationSec, load? }` with the **Load Target** union
— exactly what `buildBlocksInput` produces for the same lifts, and a test holds
the two equal. The intent is read from the reps the way a run's is read from its
hardest zone: the fewest reps decide (≤ 5 `strength-max`, ≤ 12
`strength-hypertrophy`, else `strength-endurance`; timed sets alone are
endurance).

**A lift names its own sport,** as `sykkel` does: `Knebøy 5×5` is a strength
session under any chip. A sentence that mixes a lift and a run is two sessions
and is refused (`two-disciplines`).

**Names resolve against the exercise database.** The reader takes the athlete's
catalogue (`readSentenceExercises`: trainm8's rows and the athlete's own, by
`getExerciseCatalog`'s rule) as `exercises: SentenceExercise[]`, each with the
**Exercise Aliases** that name its movement (`OHP`, `squat`; the Norwegian names
of decision 9 land in the same table). An alias that names one variant
(`DB bench`) is left out, since a strength step names an exercise and not a
variant — the table stays "read by search and by nothing else" (its schema note
in `schema.prisma`). Matching ignores case, spaces and punctuation (`Pull-ups`
is `Pull-up`), and a trailing plural `s`. The reader also carries its own short
list of the lift words Norwegian athletes type most (`knebøy`, `benk`,
`markløft`, `roing`…), each onto a database name — content per A3 as amended,
beside `rolig` and `terskel`; a word whose lift the database does not hold names
nothing. Nothing nearer than an exact name is ever saved.

**An unknown lift is a suggestion, never a silent drop.** A name the database
does not hold is reported where it stands (`unknown-exercise`,
`Finner ikke øvelsen «Knebøj»`) with up to three of the nearest names it does
hold: names it begins, names containing it, names a few edits away, a known name
inside a long one. Tapping one swaps it in. One unknown lift holds the whole
sentence back, as an unknown word does in a run. The guarantee of the S11
amendment stands unchanged: every token is read by a rule or the sentence
produces no structure. New reasons it gives: `no-sets` (a name with no sets),
`no-exercise` (sets with no name), `dangling-load` (`@` or `kg` with no number),
`two-loads`, and the existing bounds (`out-of-range`: more than 20 sets of a
lift or 20 lifts, 100 reps, 500 kg, 200 %).

**The client waits for the database.** The line fetches the catalogue once per
page from `resources/sentence-exercises` (not home's loader: most visits write
nothing). Until it arrives a lift reads as neither known nor unknown
(`exercisesNeeded`), so the line never flashes a correct lift as a typo. The
server never takes the client's list: the action reads the sentence again
against its own copy.

The API stays backwards compatible: `exercises` is optional, `discipline` widens
from a cardio sport to any discipline, and `ParsedSentence` gains `lifts`,
`exerciseNames` and `exercisesNeeded`.
`sentenceNotationInput(structure, { exerciseNames })` renders the lifts in the
echo by their database names.

### 2. The Token Sentence's words are Norwegian on display

Every word the notation draws comes from `labels.ts` (`TOKEN_SENTENCE_WORDS`,
`REST_ACT_WORDS`, `TOKEN_EDITOR_TITLES`, `zoneLabelWord`): `pause` for `rest`,
`200 m rolig` for `200 m recovery`, `til puls < 120 bpm`, `jogg tilbake`,
`på 1:40` for a send-off, `kroppsvekt`, `ingen 1RM registrert`, `+ blokk`, a
popover titled `ganger` rather than `REPEAT COUNT`. A stored zone label is drawn
in Norwegian where it is an English word (`easy` → _Rolig_, `threshold` →
_Terskel_); a zone code (`Z2`, `I4`) and a Norwegian word pass through as
stored.

**Nothing stored changes.** A rest is a `RestSpec`, a zone is its stored label,
a session's title is what the athlete typed, and the writing line's grammar
still reads `p`, `pause` and `hvile`. The words are display, which is why one
switch in `workout-notation.ts` reaches every surface the sentence is drawn on:
the echo under the line, the row, and the Workout Detail View and its editor.

**Numbers do not change here.** Durations keep the house `1 h 30 min` and kilos
keep `formatKg`'s `82.5` (ADR 0023 §1, ADR 0081 §3): the round-2 kilo decision
(`82,5 kg × 5 · 5 · 5 · 4`) belongs to the display formatters (`formatNbKg`) and
lands with them. The reader accepts both spellings, so the echo and the
athlete's own `82,5` read back the same.

## Considered options

- **A strength reader of its own beside the run reader** (the prototype's
  regex). Rejected: it skipped what it could not read, so `Knebøy 5×5 tungt`
  saved a squat and dropped a word — the silent drop S11 rules out. One
  tokenizer and one guarantee for both.
- **Match a lift to the nearest name and save it.** Rejected: a near name is a
  guess, and `Benk` → Bench Press is right while `Front` → Front Squat or Front
  Raise is not. The nearest names are offered; only an exact one is saved.
- **Ship the whole catalogue in home's loader.** Rejected: eight hundred names
  on every visit to I dag for a line most visits never open.
- **Translate the notation in each component.** Rejected: five renderers would
  each keep a copy of `pause`, and the stanza already parses its rest token's
  word back out to ink it. One source in `labels.ts` (ADR 0081 §2).

## Consequences

- A lift session can be written on I dag in one line, under any chip; the Styrke
  chip shows a lift example in the empty line and keeps the full editor one tap
  away, and its old note (_mer enn linja har plass til_) is gone.
- The writing line's limit stays 200 characters, which holds about ten short
  lifts. A longer session goes through the composer's full view.
- The Norwegian aliases of decision 9 reach the reader as soon as they are rows
  in `ExerciseAlias`, with no change here. Until then the reader's own lift
  words carry the common Norwegian names; where the two agree nothing changes,
  and the reader's list can shrink to what the table does not hold.
- The editor's stepper and token accessible names (`Increase repeat count`,
  `1 min rest, step 2 of 2…`) follow the token text where they read it and stay
  English where they are the editor's own words; the editor's translation lands
  with the Workout Detail View's.
