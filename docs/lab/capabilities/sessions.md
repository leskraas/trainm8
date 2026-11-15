# Session capabilities

Doing the session, recording it, saying how it felt, changing it when life
happens, and answering the plan when it adapts: jobs **5, 6, 7 and 8** of the
product brief (and the writes behind job 9's "how did it go").

Every type named here is exported from `app/lab/engine/sessions.types.ts`
(client-safe: `import type { … } from '#app/lab/engine/sessions.types.ts'`).
That file is the full contract; this page says what each capability is for, what
it refuses, and what to show.

What to show about a session, its structure, planned against actual and what can
be done with it right now is read with `session`, `today`, `week` and
`sessions`; the plan's proposals with `proposals` (see `reads.md`). The ids
those reads hand out are the ids these capabilities take.

## Calling a capability

On the server, in a loader or action:

```ts
import { runCapability } from '#app/lab/engine/registry.server.ts'

const result = await runCapability(request, 'move_session', {
	sessionId,
	date: '2026-11-19',
})
if (result.ok)
	result.value.changed // SessionSnapshot[]
else result.message // Norwegian, safe to show
```

In the browser (writes revalidate the page's loaders when they succeed):

```ts
import { useCapability } from '#app/lab/engine/client.ts'
import type {
	MoveSessionInput,
	MoveSessionOutput,
	UndoInput,
	UndoOutput,
} from '#app/lab/engine/sessions.types.ts'

const move = useCapability<MoveSessionInput, MoveSessionOutput>('move_session')
const undo = useCapability<UndoInput, UndoOutput>('undo')

const moved = await move.call({ sessionId, date: '2026-11-19' })
if (moved.ok && moved.value.undo) {
	// show "Flyttet til torsdag · Angre", and on tap:
	await undo.call({ token: moved.value.undo })
}
```

Over HTTP: `POST /lab/api/<name>` with a JSON body; reads also answer
`GET /lab/api/<name>?input=<json>`. The answer is `{ ok: true, value }` or
`{ ok: false, code, message }`.

**Every capability** can also fail with `invalid-input` (the input did not match
its type). A signed-out caller is sent to log in. Everything is the signed-in
athlete's own; another athlete's id answers `not-found`.

## Conventions

- **Dates** are `YYYY-MM-DD` and **times** `HH:mm`, in the athlete's timezone.
  "Today" is the athlete's today.
- **Unknown numbers are `null`, never 0.** Beside a null there is a Norwegian
  reason (`minutesUnknownBecause`, `kgUnknownBecause`, `platesUnknownBecause`,
  …): show it instead of a number.
- **Words** in outputs (`message`, `noUndoBecause`, `text`, `reason`,
  `changeNote`) are Norwegian and ready to show. Say what a write did in the
  app's own words, from the structured fields.
- **Sports**: `run | bike | swim | strength | other`.

### What every write answers

- `changed: SessionSnapshot[]` — every session the write touched, as it now
  stands, so the app can update in place without reading again:

  ```ts
  type SessionSnapshot = {
  	id: string
  	date: string // YYYY-MM-DD
  	time: string // HH:mm
  	title: string | null
  	sport: Sport | null
  	state: 'planned' | 'done' | 'missed' | 'skipped'
  	minutes: number | null // planned length
  	minutesUnknownBecause?: string // e.g. strength is counted in sets
  	owner: 'athlete' | 'plan' // 'athlete': the plan never changes it without asking
  	hasRecording: boolean
  	countsTowardPlan: boolean
  	changeNote: string | null // e.g. 'Flyttet fra torsdag.'
  	rpe: number | null // 1–10
  	note: string | null
  }
  ```

  A past session still `planned` is one nobody marked yet.

- `removedSessionIds: string[]` where a write removed sessions.
- `undo: string | null` and `noUndoBecause: string | null` — exactly one is set.
  Pass `undo` to the `undo` capability. When it is null, say `noUndoBecause` (or
  nothing, and do not offer undo).

### Undo

Every token works once, for the athlete it was given to, and only while what it
would put back still stands: once a session it changed has been trained, or
changed again by something else, `undo` fails `cannot-undo` with the reason. A
second undo of the same token succeeds with `undone: false` (nothing changed
now). Tokens do not expire otherwise, so an app may keep the latest one around
(a toast, a history list).

---

## Doing and recording (jobs 5–6)

### `mark_done` (write)

A run, ride or swim is done, by hand, before or instead of a recording. A
recording that comes in later links onto it by itself.

- Input `{ sessionId }`. Output `MarkDoneOutput` (`changed`, undo).
- Allowed on a planned or missed session whose day has begun, at most six days
  back.
- Fails `not-found`, `already-done`, `already-recorded`, `not-open` (it was
  skipped: undo that first), `strength-needs-sets` (use
  `log_strength_as_planned` or the set logger), `not-yet` (its day has not
  begun), `too-long-ago`, `not-markable`.
- Side effect: the training load is recomputed, and the plan may ease the next
  session. When it did, there is no undo (`noUndoBecause` says why).

### `skip_session` (write)

The athlete will not, or did not, do it.

- Input `{ sessionId }`. Output `SkipSessionOutput`: `state` is `missed` on a
  day that has begun (it did not happen) and `skipped` on a day still ahead.
- Fails `not-found`, `not-open` (done, already skipped or missed, or has a
  recording).
- Side effect: the load is recomputed; a skipped key session may make the plan
  ease the next one. Undo puts it back to planned, unless that happened.

### `add_session` (write)

An extra session the athlete did, or wants to do.

- Input `AddSessionInput`: `date`, and one of
  - `sentence` — the athlete's own words: `45 min rolig`, `4x8 min terskel`,
    `3x10 knebøy 60 kg` (with `sport` as a hint when the words do not say);
  - `sport` alone (`run | bike | swim`) — a 45-minute easy session;
  - `copyOf` — another of the athlete's sessions, copied onto `date`.
- Optional: `alreadyDone` (a day that has begun only; not strength — log its
  sets), `note`, `countsTowardPlan: false` (a bike commute).
- Output `AddSessionOutput`: `sessionId`, `changed`, `notDoneBecause` (set when
  `alreadyDone` was asked and could not be), undo (removes it again).
- Fails `not-understood` (the sentence could not be read: let the athlete
  rephrase), `needs-sentence` (strength needs its lifts), `not-found`
  (`copyOf`), `invalid-input` (none of the three given).
- An added session is the athlete's own (`owner: 'athlete'`). It never moves the
  plan's weekly target.

### `delete_session` (write)

- Input `{ sessionId }`. Output
  `{ removedSessionIds, undo: null, noUndoBecause }`. **Cannot be undone:
  confirm first.**
- Fails `not-found`, `has-recording` (unlink the recording first).

### `set_counts_toward_plan` (write)

Whether a session counts toward the plan's weekly volume (a commute may not).
Its training load counts either way.

- Input `{ sessionId, countsTowardPlan }`. Output `changed`, undo.
- Fails `not-found`.

### Recordings: `link_options` (read), `link_recording`, `unlink_recording` (write)

Runs, rides and swims come in from the watch by themselves and link to the
planned session they match. When one did not (it stands as an extra session), or
linked to the wrong one:

- `link_options` — input `{ recordingId }`; output `LinkOptionsOutput`:
  `currentSessionId` (the session it stands on) and `options` (planned sessions
  it could be: same day, same sport, no recording of their own). Fails
  `not-found`.
- `link_recording` — input `{ recordingId, sessionId }`. The planned session
  becomes done with the recording's numbers; the extra session it stood on goes
  (`removedSessionIds`). Fails `not-found`, `not-a-fit`. Undo puts it back as it
  was, when it was a fresh extra; otherwise `noUndoBecause` says to unlink
  instead.
- `unlink_recording` — input `{ recordingId }`. The recording becomes an extra
  session of its own (`extraSessionId`) and the planned session goes back to not
  done (or done, if the athlete had said so by hand). Fails `not-found`,
  `not-linked`. Undo links it back.

`recordingId` is the recording's id as the reads give it
(`session.recording.id`, `recordings`).

---

## Strength (job 6)

Strength is logged in the app, set by set, while training — or in one go
afterwards.

### `strength_session` (read)

The logging view of one strength session: everything a set logger needs.

- Input `{ sessionId }`. Output `StrengthSessionOutput`:
  - `session` (`SessionSnapshot`), `program` (`{ name }` when it belongs to a
    running program), `bodyweightKg`, `hasGymOnFile`;
  - `exercises[]`: `stepId`, `name`, `restSeconds`, `oneSideAtATime`,
    `defaultLoad` (what a tap logs; null with `defaultLoadUnknownBecause` when
    the athlete must type a weight), `noWarmupBecause`, and `sets[]`;
  - each set: `setIndex` (pass it back), `warmup`, `prescribed` (`reps` or
    `seconds`, `load` as written — `kg`, a `reference` such as `75 % av 1RM`,
    `bodyweight` — and `kg`: today's kilos from the athlete's own numbers, or
    null with `kgUnknownBecause` and `kgFix`), `plates` (per side, heaviest
    first; null with `platesUnknownBecause`), `logged` (null until done), and
    `lastTime` (the same set last time; null the first time);
  - `loggedWorkingSets`, `unloggedWorkingSets`.
- Warm-up sets are generated from the day's top weight and the athlete's gym;
  their `setIndex` is in a range of its own.
- Fails `not-found`, `not-strength`.

The `session` read shows the same session for overview; use this one to log.

### `start_strength_session` (write)

Open the session to train it now. A session from a running program takes the
program's current working weights at this moment. Answers the same as
`strength_session`. Fails `not-found`, `not-strength`. Nothing to undo.

### `log_strength_set` (write)

Log one set as it is done, or correct one.

- Input `LogStrengthSetInput`: `sessionId`, `stepId`, `setIndex`; all else is
  optional. Left out, `reps`/`seconds` are what was prescribed and `load` is
  what is logged already, else the prescribed load — so a tap is enough.
  `done: false` logs it as abandoned. `repsInReserve`, `toFailure`.
- `load` (`StrengthLoad`): `{ kind: 'kg', kg }`, `{ kind: 'kg-per-hand', kg }`,
  `{ kind: 'bodyweight' }`, `{ kind: 'bodyweight-plus', kg }`,
  `{ kind: 'assisted', kg }`, `{ kind: 'machine-level', level }`,
  `{ kind: 'band', band }`, `{ kind: 'none' }`.
- Output `LogStrengthSetOutput`: `set` as it now stands, `records` (personal
  records this set just set: heaviest, rep max, estimated 1RM; usually empty),
  undo (removes a new set, or puts an edited one back).
- Fails `not-found`, `not-strength`, `no-count` (a done set needs reps or
  seconds), `needs-load` (no weight is known: ask for one), `load-kind-locked`
  (the set was logged as another kind of load; send `changeLoadKind: true` to
  change it on purpose).
- Logging a set does not finish the session.

### `remove_strength_set` (write)

Input `{ sessionId, stepId, setIndex }`. Output `{ removed }` and undo (puts the
set back). Fails `not-found`.

### `finish_strength_session` (write)

The session is done. A running program moves each lift on from what was logged.

- Input `{ sessionId, unloggedSets?: 'not-done' }`. With working sets still
  unlogged it fails `unlogged-sets` (the message says how many): ask "før dem,
  eller avslutt og regn dem som ikke gjort", and on the second answer call again
  with `unloggedSets: 'not-done'`.
- Output `FinishStrengthSessionOutput`: `changed`, `alreadyFinished` (a second
  finish changes nothing), `programName`, and `lifts[]`: per lift `result`
  (`goes-up | stays | goes-down | lifted-lighter | not-readable | skipped`),
  `nextKg` (the working weight from now on) and `reason` (Norwegian).
- Fails `not-found`, `nothing-logged`, `unlogged-sets`.
- Undo (outside a program only) opens the session again with its sets kept. A
  program has moved on, so there it says why not.

### `log_strength_as_planned` (write)

Log a whole session in one go and finish it: as planned, or with what went
differently.

- Input
  `{ sessionId, sets?: [{ stepId, setIndex, reps }], lifts?: [{ stepId, kg }] }`
  — a set left out is logged as planned; a lift's `kg` applies to all its sets;
  `reps: 0` is a set not done.
- Output `LogStrengthAsPlannedOutput`: `loggedSets`, `alreadyLogged` (a double
  tap), `lifts` (as above), undo (takes those sets back and the session back to
  planned; not for a program session).
- Fails `not-found`, `not-loggable` (not strength, its day has not begun, or too
  long ago), `not-plannable` (a lift has no weight or count to log as planned:
  use the set logger), `unknown-set`, `nothing-done`, `bad-weight`,
  `weight-not-editable`.

### `plates_for` (read)

Input `{ sessionId, stepId, kg }` — for a weight the athlete is typing. Output
`{ plates, platesUnknownBecause?, gymName }`. `plates.perSide` is heaviest first
for one side, `barKg` the bar, `madeKg` what the rack really makes (may differ
from `kg`; `exact` says). Null with a reason when no gym is described, the load
takes no plates, and so on. Fails `not-found`.

---

## Feeling (job 7)

### `rate_session` (write)

How hard it felt: `rpe` 1 (very easy) to 10 (all out); `null` clears it. Input
`{ sessionId, rpe }`. Output `changed`, undo. For a session with no recording
the RPE is what its training load is reckoned from, so the load is recomputed.
Fails `not-found`, `not-yet` (its day has not begun).

### `note_session` (write)

The athlete's note on the session. Input `{ sessionId, note }` (up to 2000
characters; empty clears it). Output `changed`, undo. Fails `not-found`,
`not-yet`.

The RPE and the note are kept apart: setting one never clears the other.

---

## When life happens (job 8)

Nothing here changes the plan's weekly target. Moves keep the session's time of
day and leave a `changeNote` on it.

### `move_session` (write)

- Input `{ sessionId, date? }`.
  - With `date` (today or later): the session moves there. Only that session
    moves; the rest of the week stays as it is. Output says who else is already
    on that day (`sharesDayWith`), any `clashes` with the day rule
    (`{ code, text }`, e.g. `dagen før en hard økt` — a warning, the move is
    done), and `leftItsWeek` (it moved to another week: that week's total drops
    and the new week's grows).
  - Without `date` (today's session only): the plan picks the next free day this
    week that fits, or swaps with the next session when no day is free (then two
    sessions are in `moves`/`changed`).
- Output `MoveSessionOutput`: `moves: [{ sessionId, fromDate, toDate }]`,
  `changed`, the above, undo (puts every moved session back).
- Fails `not-found`, `not-open` (done, skipped, recorded, or with a note or
  logged sets), `past-date`, `same-day`, `not-today` (no date given for another
  day's session), `no-later-day`.

### `swap_sessions` (write)

Input `{ sessionId, otherSessionId }`. Each takes the other's day and keeps its
own time. Output `moves`, `changed`, undo. Fails `not-found`, `not-open`,
`past-date` (either is behind today), `same-day`, `same-session`.

### `shorten_session` (write) — "short on time"

Today's session becomes 30 minutes (20 if it was 30 or less), keeping its
purpose. Input `{ sessionId }`. Output `minutesBefore`, `minutesAfter`,
`changed`, undo. Fails `not-found`, `not-today`, `not-open`, `no-plan`,
`no-time` (it cannot be timed), `already-short`.

### `ease_session` (write) — "too tired today"

Today's session becomes easy and about 60 % as long (never under 20 minutes); a
strength session keeps fewer sets. Same input, output and failures as
`shorten_session`, plus `already-easy`.

### `release_session` (write)

Hand one of the athlete's own sessions (`owner: 'athlete'`) back to the plan, so
the plan may adjust it without asking. Input `{ sessionId }`. Output `released`
(false when it was already the plan's), `changed`, undo (takes it back). Fails
`not-found`. Changing a session's content later makes it the athlete's again.

### Skipping, and the whole week

`skip_session` is above. To make the whole coming week lighter, see `ease_week`
below.

---

## When the plan adapts (job 8)

When a training week closes (Sunday 20:00), the plan compares what was done with
what was planned and writes **proposals** for the coming week: move, make up a
missed session, swap, add, scale, or the next round of an open-ended plan. Read
them with `proposals` (reads). In "ask first" mode each waits for a yes or no;
one that only eases is applied quietly the next morning if nobody answered. In
automatic mode the plan applies them at the close and every change can be undone
until its week begins. Separately, a missed key session makes the plan ease the
next session at once.

Nothing that adds load is ever applied without a yes.

### `answer_proposal` (write)

- Input `{ proposalId, answer: 'yes' | 'no', scope? }` — `scope` only for a
  move: `this-week` (default) or `from-now-on` (the slot moves for good).
- Output `AnswerProposalOutput`: `status`, `applied` (false on a yes that found
  nothing left to change), `changed` (sessions the yes moved, changed or added),
  undo.
- A no changes nothing: no undo. A yes can be undone until the week it lands in
  begins; after that `noUndoBecause` says so.
- Fails `not-found`, `already-answered`, `decided-automatically` (automatic mode
  decided it: use `undo_change`), `invalid-input` (a scope or factor that does
  not apply).

### `accept_all_proposals` (write)

Yes to every proposal still waiting, in one go (a next round at its proposed
level). Input `{}`. Output `accepted` (ids), `failed`
(`{ proposalId, because }`), `changed`, one undo for all of them.

### `accept_round` (write)

Yes to an open-ended plan's next round at the athlete's own level. Input
`{ proposalId, factor }` with `factor` from 0.5 to 1.5 in steps of 0.05 (1 keeps
the volume). Output as `answer_proposal`. Fails as `answer_proposal`, plus
`factor-out-of-range`.

### `ease_week` (write)

Make the coming week 15 % easier: every session still planned in it is scaled
down. Once per week.

- Input `{ week? }` — the Monday of the coming week (default: the week after the
  last closed one; on a Sunday evening that is next week, otherwise this one).
- Output `EaseWeekOutput`: `week`, `sessionsChanged`, `changed`, `volume` per
  sport before and after (`unit`: `km | hours | load | sets`; `load` is
  training-load points; null where nothing planned has a number), undo (until
  the week begins).
- Fails `already-eased`, `not-the-coming-week`, `invalid-input`.

### `undo_change` (write)

Take back one change the plan applied — by a yes, quietly, or automatically — by
its proposal id (`proposals.changesMade` lists the automatic ones). Input
`{ proposalId }`. Output `UndoOutput`. Fails `not-found`, `cannot-undo` (its
week has begun, a session it changed was trained, or the athlete changed one of
them since).

### `undo_all_changes` (write)

Take back every change the plan made by itself at a week's close. Input
`{ closedWeek? }` (that week's Monday; default the last closed week). Output
`UndoAllChangesOutput`: `count`, `kept` (reasons for changes that stand),
`changed`, `removedSessionIds`. Fails `cannot-undo` when none could be.

### `refresh_adaptation` (write)

Let the plan catch up now rather than at its next hourly check: close a finished
week and write its proposals, apply what may apply quietly, and ease the next
session after a missed key one. Safe to call any time; it only does what is due.
Input `{}`. Output `{ newProposals, appliedIds, waiting }`. Then read
`proposals` again.

---

## `undo` (write)

Input `{ token }` (from any write above). Output `UndoOutput`: `undone` (false
when it had been undone already), `changed`, `removedSessionIds`. Fails
`not-found` (not a token for this athlete) and `cannot-undo` (with the reason:
trained since, changed since, week begun).
