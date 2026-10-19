# Every Activity Import auto-saves; there is no Activity Inbox

> **Amended by [#603](https://github.com/leskraas/trainm8/issues/603) (map
> #600): intervals and the mirror.** An import's device and engine **Activity
> Intervals** are telemetry, like its stream, so they don't end the **Auto-Save
> Mirror**: a source-side `update` still re-snapshots, re-streams, re-reads laps
> and re-detects. An **athlete** layer does end it, because an interval edit is
> the athlete building on the import, and a source-side change must not rebuild
> what they corrected. Separately, re-parsing trainm8's own kept copy of the
> original file (FIT `ActivityFile`, TCX `rawJson`) to write device intervals is
> not a source-side change, so it may reach promoted recordings too (ADR 0012's
> freeze is against the source rewriting history). Fetching again from a
> provider's API stays a mirror-only refresh. See
> [the decided model](https://github.com/leskraas/trainm8/blob/research/structured-workouts/docs/wayfinder/structured-workouts/603-activity-interval.md) §7.

> **Confirmed by
> [ADR 0096](./0096-every-import-records-its-origin-platform-and-one-activity-is-one-row.md)
> (#545).** Every import still auto-saves, and still no path creates an
> unpromoted import. With several sources live, identity is resolved before
> `createActivityImport` writes anything: a duplicate (same FIT key, or the
> fuzzy start-and-duration match) is stored as an **Import Alias** of the
> existing import, never as a second row, so auto-save never sees it. "A junk or
> duplicate activity becomes a session immediately" (Consequences) now holds
> only for a duplicate the rule misses.

> **Amended (#505 S15): the correction path also lives on I dag, and the app
> asks when it is unsure.** The rule above stands — match onto the one planned
> session that fits, else stand up a recording-only session — and every ingest
> path still funnels through `autoSaveImport` (the intervals.icu sync and sweep
> included; their comments claiming otherwise were stale). Four things change:
>
> 1. **A link completes the session.** Linking a Recording onto a planned
>    session never set its status, so a matched session in the past read as
>    _ikke gjort_ and was left out of the week's Actual Volume, while Training
>    Load counted its import. Linking now sets `completed` and keeps the status
>    it replaced (`statusBeforeLink`). Undoing a link restores that status —
>    done regardless if the athlete marked it _Gjort_ by hand, lifted sets on
>    it, or adopted it as an ekstra — and clears the session's TSS, which was
>    the Recording's and would otherwise count twice. A data migration completes
>    the `scheduled` sessions already holding a Recording (missed and skipped
>    keep what the athlete said); their TSS stays null until a load recompute
>    covers their day.
> 2. **Unsure is a verdict, not a pile.** One rule, `fitsImport`
>    (`app/utils/import-fit.ts`), says which planned sessions an import could
>    be: auto-save links when exactly one fits, flags `unsure` when several do,
>    I dag offers exactly those as answers, and a link answer naming any other
>    session is refused. The ekstra row asks **"hva var dette?"** — one of those
>    sessions, _en ekstra økt_, or Annet — while one still fits, never twice
>    (any answer is stored as `linkAnsweredAt`), and only for imports from the
>    last 14 days (`IMPORT_QUESTION_DAYS`), so history from before this change
>    is not asked about all at once. There is still no inbox — the question sits
>    on the row of a session that already counts.
> 3. **_Angre kobling_ / _Koble igjen_ on the row.** Every planned session
>    holding an import offers to lift it off, and the ekstra session that made
>    offers to put it back on the session it came from
>    (`unlinkedFromSessionId`). The Workout Detail View's "detach" is the same
>    call (`undoImportLink`), so there is one path.
> 4. **_Gjort_ by hand.** A session marked done with no Recording says its
>    numbers come from the import when a source is connected, and _uten tall_
>    when none is. An import that lands later links onto it as onto any planned
>    session.
>
> See `app/utils/import-link.server.ts` (the answers),
> `app/routes/_home/timeline/import-link.ts` (what each row says) and the
> GLOSSARY's **Auto-Save**, **Ekstra** and **Gjort (by hand)**.

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
