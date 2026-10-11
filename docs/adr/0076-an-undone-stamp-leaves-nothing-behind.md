# An undone stamp leaves nothing behind, and the way back rides the open row

> **Amended by
> [ADR 0088](./0088-every-write-on-i-dag-is-undone-from-its-toast-and-from-its-landed-row.md)
> (round 2, owner decision 2):** the composer no longer opens the row in place,
> so every write on I dag is undone from a toast _and_ from its landed row, both
> for ten seconds. §1 and the rejected toast below are superseded; §2 and §3
> stand.

Status: Accepted

**Settles the `Undo` open question of
[ADR 0065](./0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md)**,
which named the recovery as _owed by #501_ and left the form of it undecided:
_"whether that is a local undo on the row, a delete on the token sentence, or
both, is undecided."_ **Confirms
[ADR 0012](./0012-disconnect-preserves-recordings.md)** — nothing recorded is
touched here; a stamp has no actual to preserve. **Confirms
[ADR 0028](./0028-mobile-first-ui-standard.md)** — the way back is a control on
the row, at 390×844, not a toast the athlete has to catch.

Scope: the home timeline's Day Stamp (`app/utils/day-stamp.server.ts`,
`app/routes/_home/timeline/day-stamp-cell.tsx`). Issue #501.

## Context

ADR 0065 §5 made every empty row a write target, and its own consequences said
what that costs: _"a mistyped cell in a spreadsheet is one keystroke back; here
it is a **Workout Session** on a date."_ Home now has 182 forward rows and each
of them commits a database row on one tap. A grid that is easy to write into and
hard to correct is worse than the plan surface it shortcuts, which is why the
ADR called the recovery _not optional polish_.

Three things it does not get to be. It cannot be **the Workout Detail View's
delete**, because reaching that means leaving the timeline — the surface the
whole gesture exists to keep the athlete on. It cannot be a **toast with an Undo
in it**, because a toast is a deadline: miss it and the only way back is the one
that leaves. And it cannot be **soft**, because a stamped session that is only
_mostly_ gone still carries a Planned TSS, and Planned TSS is summed into Weekly
Plan Adherence and compared against by every import that lands on that day.

## Decision

### 1. The way back is a control on the open row, for as long as the row is open

The stamped session opens as an editable **Token Sentence** in its own row, and
that open row carries **`Undo`** beside `More` and `Done`. It is not a timed
offer and not a second surface: it is present exactly while the athlete is
looking at the thing it undoes.

That is a bound, and it is stated rather than hidden: once the athlete dismisses
the open row, the session is an ordinary session and is corrected the way every
other session is — on the Workout Detail View. **A mistap is always still
open**, because a mistap is a tap the athlete has not looked away from yet, so
the case the recovery exists for is the case that is always covered.

### 2. `Undo` is a real delete, not a status

It calls the same owner-scoped `deleteWorkoutSession` the Workout Detail View
calls: the session row goes, its Workout goes, and the orphaned lineage goes
with it. Afterwards the day is an **empty cell again** — not a cancelled
session, not a hidden one, and nothing in any derived number.

A soft state would have to be excluded from Planned TSS, from Weekly Plan
Adherence, from the strip's day dots, from Auto-Save's matching and from the
Session Ledger, in five places written by five different tickets. The stamp is
seconds old and carries nothing the athlete authored, so there is nothing worth
the cost of keeping.

### 3. Undoing is idempotent and says nothing when there is nothing to say

A session that is already gone — a double tap, a stale row, another device —
deletes nothing and reports success. The athlete asked for the day to be empty;
it is empty. Answering that with an error would be the app arguing about how it
got there.

## Alternatives considered

- **A toast with `Undo` in it.** Rejected — a toast is a deadline, and the
  athlete who needs the undo most is the one who tapped without looking. It also
  puts the control somewhere other than the thing it acts on, which on a 390px
  screen is a second place to look for a mistake made in the first.
- **A soft-deleted / `cancelled` session.** Rejected — §2. It buys a longer undo
  window and pays for it with a new session state that five derived numbers must
  each learn to ignore.
- **Leave it to the Workout Detail View's existing delete.** Rejected — that is
  the status quo ADR 0065 called insufficient by name. The correction must not
  cost the surface the gesture was for.
- **A confirm before stamping.** Rejected — it would make the ordinary path
  (tap, get a session) pay for the rare one. The draft already shows the
  discipline **before** it commits (ADR 0065 §5), which is the confirmation step
  that earns its place; a second one would be a dialog in front of a shortcut.
- **Both an undo and a delete on the sentence.** Not taken, and not for long:
  they would be the same button twice. `Undo` is the word because the thing
  being taken back is a tap, not a session the athlete built.

## Consequences

- **The undo window is the open row, not a clock.** Documented above as a bound
  rather than left to be discovered. Whoever wants a longer one is choosing §2's
  soft state and inherits its five exclusions.
- **An undone stamp is unrecoverable.** Deliberate: there is nothing in it that
  the next tap does not reproduce in full, because it was never anything the
  athlete typed.
- **`Undo` is the only destructive control on the home timeline.** It is a
  bordered outline button that reddens on hover rather than a filled destructive
  one — the row it sits on is an editing state, not a confirmation dialog.
