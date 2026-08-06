# Every Activity Import auto-saves; there is no Activity Inbox

Until now an imported activity landed in an **Activity Inbox** (`/imports`) and
waited for the athlete to press **Promote** — except when it arrived via the
**Backfill Window**, which already auto-matched-or-created a session, and except
when auto-match found exactly one same-day planned session, which linked it
silently. So the inbox was not "where imports live"; it was the leftovers pile
from a matching rule, and the same activity would or would not need handling
depending on which pipe it came down.

That pile is a chore with no product value. The athlete already decided to
record the activity — they did the workout, and their provider already has it.
Asking them to confirm it a second time is the TrainingPeaks-style bookkeeping
this product exists to avoid (GOAL.md, pillar 1), and it directly contradicts
the stance ADR 0032 already took for **Structure Detection**: run it, apply it,
let the athlete correct it — no candidate inbox, no confirmation step.

## Decision

**Every Activity Import auto-saves the moment it lands.** One function,
`autoSaveImport`, is the single answer to "what happens to a new activity", and
every ingest path — manual sync, Strava webhook, Backfill Window, file upload,
PWA share target — funnels through it:

1. Match it onto a same-day, same-discipline planned **Workout Session** when
   exactly one fits (the existing auto-match rule, unchanged), else
2. stand up a recording-only session of its own.

Consequences of that single rule:

- **The Activity Inbox is deleted** — the `/imports` route, the Inbox chip and
  its pending count in the wordmark row, and the standalone Promote page. There
  is nothing left for them to list: an unpromoted import can no longer exist.
- **`'other'`-discipline imports auto-save too.** ADR 0015 keeps them
  import-only — no planned session ever matches one — but they get their own
  recording-only session rather than being invisible. This is what the Backfill
  Window already did.
- **Manual upload lands the athlete on the session**, not on a list. The
  Integration Hub (`/settings/integrations`) is the entry point for uploading
  and for every source-connection concern, which is where ADR 0026 already put
  connection management.
- **The Live Imports Stream** (the per-athlete SSE channel, #75) now refreshes
  the home surface. It existed so the inbox revalidated when an import landed;
  an import now becomes a session on The Tape, so that is what must refresh.
- **The correction path moves onto the Workout Detail View.** Auto-match is a
  guess, so the session that owns a Recording offers "wrong session?": move the
  Recording to another planned session from the same day, or lift it off the
  plan onto a session of its own. Neither can strand an import — with no inbox,
  an unpromoted import would be invisible, so no path is allowed to create one.

### What replaces "promoted" in the source-side rules

ADR 0012 keyed disconnect and source-side `update` / `delete` on _promoted vs.
not_: an inbox item was fair game to refresh or delete, a promoted **Recording**
was frozen training history. Auto-save promotes on arrival, so that line would
now freeze every import the instant it appeared, and a Strava rename would never
reach us again.

The same intent is redrawn one step later, as the **auto-save mirror**: an
import whose only trace is the recording-only session auto-save stood up for it
— still structureless (no **Workout** materialized or authored onto it) and
carrying no **Session Log**. A mirror still tracks its source; anything the
athlete or the engine has built on is history.

- Source-side `update` refreshes a mirror in place (re-snapshot, re-stream,
  re-detect, per ADR 0032); anything else is immutable, as before.
- Source-side `delete` removes a mirror **and the recording-only session that
  exists only to carry it**; anything else survives, as before.
- Disconnect (ADR 0012) now deletes nothing, because "non-promoted imports for
  this provider" is the empty set. This is the right outcome and needs no code
  change: everything the athlete can see is training history, which is exactly
  what ADR 0012 set out to preserve.

## Considered options

- **Keep the inbox as a read-only "recently imported" list**: Rejected — a list
  with nothing to do on it is a surface to maintain, a nav slot to spend, and a
  place for the athlete to wonder what is expected of them. The Tape already
  shows what landed.
- **Auto-save, but only for imports that match a plan**: Rejected — this is
  today's behaviour with the pile renamed. The unmatched activity is precisely
  the one the athlete has no way to see.
- **Ask at ingest ("save this?") via a notification**: Rejected — same
  confirmation chore, moved somewhere with less context.
- **Delete the import outright when the athlete removes its session**: Rejected
  for now. The import row survives as an inert tombstone (it feeds no load —
  Load Snapshots read promoted imports only), and keeping the
  `(provider, externalId)` row is what stops the next sync from re-importing an
  activity the athlete just deleted.

## Consequences

- Auto-match's failure mode changes character. It used to fail _safe_ into a
  visible queue; it now fails into a recording-only session sitting next to the
  planned one it should have matched. The "wrong session?" control on the
  Workout Detail View is the mitigation, and it is why that control is not
  optional.
- A junk or duplicate activity from a provider now becomes a session
  immediately. Deleting the session is the athlete's remedy, and a source-side
  delete propagates as long as the session is still an untouched mirror.
- An activity deleted at the source _after_ the athlete has built on it stays in
  trainm8 forever. That is ADR 0012's existing stance on training history, now
  reached sooner.
- ADR 0032's "there is no candidate inbox" and this ADR's "there is no import
  inbox" are the same principle applied at two layers: the engine acts, and the
  athlete edits the result.
