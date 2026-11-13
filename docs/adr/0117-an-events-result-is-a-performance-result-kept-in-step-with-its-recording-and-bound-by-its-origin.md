# An Event's result is a Performance Result kept in step with its Recording, and bound by its origin

Status: Accepted · Ticket #670 (map #464) · Amends
[ADR 0007](./0007-step-as-discriminated-union.md)'s Performance Result amendment
(#464) and its consequence on ADR 0021's gate · Applies
[ADR 0098](./0098-source-terms-bind-per-origin-platform.md) §1 to resolved
targets

## Context

ADR 0007's #464 amendment shipped the typed writer first and named the next one:
a **Performance Result** written from a completed **Event**, `verified` when the
linked **Recording** supplies the time. #670 builds it. Four things the earlier
text did not settle, or settled for the typed writer only, now need an answer:
where the Event's race distance lives, how a derived row stays true while the
Event, its result session and its Recording change under it, what the typed
writer's "one result per distance and day" means once two writers share the
table, and whether a pace resolved from a Garmin or Polar result is a derived
value under ADR 0098.

## Decision

### 1. The Event Distance is its own field, never the Event Target

`Event.distanceM` (exact metres, nullable) says how far the race is. A value
equal to a **Race Anchor** is stored as that anchor's metres
(`RACE_ANCHOR_DISTANCE_M`, so a half marathon is 21 097), anything else as
typed. "Equal" has a 10 m tolerance on what the athlete _types_, because `21,1`
and `42,2` are how athletes write the half and the full, and a typed `10,01`
means the 10 km race: the km field snaps within 10 m of an anchor and stores the
anchor. The _measured_ distance is never snapped — the ±5 % check and the
glossary's exact match still hold, so no pace the athlete never ran lands behind
a `5k pace` target. Only a run-only race or time trial carries one; saving an
Event that is not one clears it. It is not the Event Target's `distance` kind: a
target is a goal ("run 30 km"), the Event Distance is a fact about the course,
and the glossary already keeps goals and results apart.

### 2. An Event's result is a stored row with its provenance, and one function keeps it true

The Event's result is a `PerformanceResult` row like a typed one, so the
resolver, _Løpsresultater_, the export and every later reader read one table. It
carries its provenance:

- `eventId` (unique, `onDelete: Cascade`): at most one result per Event;
- `activityImportId` (`onDelete: Cascade`): the Recording it was read from.

A typed result has both null. Only one function writes or removes an Event's
row: an idempotent **reconcile** for one Event that reads the Event, its result
session and that session's Recording, asks a pure rule whether they make a
result (and if not, why), and makes the row match: create, rewrite or delete. It
recomputes the Planned TSS of `scheduled` sessions (ADR 0019) only when the row
changed. Every path that changes an input calls it: linking, unlinking,
cancelling, editing and deleting an Event; linking, moving or lifting a
Recording; deleting a session. The cascades are a backstop for deletes that
bypass those paths (account deletion), not the mechanism.

The rule, in one pure function the writer and the Event page's "why there is
none" states both read:

- an Event that is a race or time trial, whose disciplines are exactly run, with
  an Event Distance, a result session, and a run Recording with a distance
  within ±5 % of the Event Distance, makes a result;
- its distance is the Event Distance, never the measured one (rung 1 matches to
  the metre, and a GPS track of a 10k reads 10.1–10.3 km); its time is the
  Recording's elapsed time, `endedAt − startedAt`, pauses included, as a race
  clock runs; its day is the result session's day; `source` is `race` or
  `timeTrial` from the kind; `verified` is true;
- **Load Confidence plays no part.** ADR 0021's gate asks whether a Recording's
  _load_ can be trusted, which turns on thresholds and heart rate. A race result
  needs the time and the distance, which the watch measures whatever the load
  model knows. The trust a result needs comes from the Event (the athlete says
  this session was the race) and the ±5 % check (the watch measured that race).

### 3. Two writers share the table; the typed one wins a tie

The typed writer's "one result per distance and day" (ADR 0007, #464) becomes
"one **typed** result per distance and day": its replace and its delete touch
only rows with no `eventId`. An Event's result is removed on the Event, never
from _Løpsresultater_. When a typed result and an Event's result share an anchor
and a day, the resolver uses the typed one: the athlete typing a time for a race
the watch also measured is a correction (the course was long, the watch was
started late). The resolver returns which result it chose for each anchor, not
only the pace, so the Event page's line and _Løpsresultater_'s _I bruk_ read the
same choice the targets resolved against.

### 4. A target resolved from a vendor's result is a derived value (ADR 0098 §1)

An Event's result is the Recording's own data: its binding set is the
Recording's **Origin Platform** plus its aliases' (ADR 0096 §3), read through
`activityImportId`. A `racePace` target resolved against it, and the Planned TSS
computed from that target, are derived values whose binding set includes it. ADR
0098 §1's empty binding set for plan-side values covers what the athlete wrote
or trainm8 placed, not a number resolved from a measured result: a Garmin race
that sets every 10 km-fart session's pace is Garmin data on those sessions.

- On `screen`, the result carries `recordingSource`'s credit wherever it is
  shown, and a resolved target carries `derivedAttributionLines` for the chosen
  result's binding set. A typed result binds nothing and owes nothing.
- On `model`, Planned TSS goes through the gate with that binding set: a
  Garmin-derived Planned TSS carries the Garmin credit, a Polar-derived one is
  `source-terms` without the athlete's Polar opt-in (ADR 0108). Because a done
  session keeps the Planned TSS it was computed with, it keeps what that number
  was computed from: the binding set is stored beside the Planned TSS when it is
  computed, and every reader that sends Planned TSS passes it on (a week total
  unions its sessions').

### 5. What this stores, in the principle's terms (Derived, never authored, ADR 0112)

Two values here are stored and neither is authored, so both are materializations
under ADR 0112 §3:

- **An Event's result row** (§2). Every input it is computed from is still held
  — the Event, its result session and that session's Recording — and the
  reconcile recomputes it from them. Its recompute triggers are the paths §2
  enumerates: every change to the Event, its result session, its Recording
  (including a source refreshing it, a duplicate aliased onto it, and a re-dated
  result session), and the Event Distance.
- **The Planned TSS binding set** (`WorkoutSession.plannedTssOrigins`, §4). It
  is a bake beside `plannedTssValue` (ADR 0019 §2), written by the same
  computation and on the same triggers, because a done session keeps the Planned
  TSS it was computed with and must keep what that number was computed from.

**The explanation owed (§4).** The numbers an Event's result moves are a
`racePace` target's pace and the Planned TSS of sessions still `scheduled`. They
move because the athlete linked the session they raced, or set the Event
Distance — their own act, in the same visit — so ADR 0112 §4's silent-movement
case is not met. The explanation is the line the Event page's result section
reads off the resolver's choice ("Øktene med 10 km-fart regner farten fra denne
tida"), and _Løpsresultater_'s _I bruk_ mark. No notice mechanism is added.

**ADR 0112 §3's open question stays open.** Whether a completed session's
Planned TSS freezes at completion is not decided here. This ADR keeps today's
behaviour — a **Performance Result** recomputes only `scheduled` sessions — and
stores the binding set beside the number so that a done session's credit stays
true for the number it actually holds. A later ADR may still freeze it.

## Considered options

- **Derive Event results on read** (no stored row; the resolver joins completed
  Events to their Recordings, as ADR 0021 derives Personal Records). It cannot
  drift, which is its strength. Rejected: every reader of results (the resolver
  in two places, _Løpsresultater_, the export, Race Equivalence rungs 2–5, the
  next ticket's corrected time) would have to union two sources and repeat the
  tie-break, and Planned TSS still needs a recompute on every one of the same
  changes, so the trigger list does not go away. One reconcile behind one table
  keeps the Event logic in one module.
- **The Event Distance inside the Event Target JSON.** Rejected: it overloads a
  goal with a fact, the confusion the glossary's Event Target and Performance
  Result entries exist to prevent.
- **Store the measured distance.** Rejected: it never matches an anchor, so no
  `racePace` target could resolve from a race.
- **The ADR 0021 Load Confidence gate on Event results.** Rejected (§2): it
  would refuse a measured race for an athlete with no threshold and no heart
  rate, for a reason that has nothing to do with the race.
- **The newest result wins a same-day tie by insert time.** Rejected: whether a
  correction holds would depend on which happened first, the typing or the watch
  sync.
- **No credit on resolved targets** (read ADR 0098 §1's plan-side clause as
  covering them). Rejected (§4): the number is computed from the vendor's data,
  which is what Garmin's and Polar's terms attach the duty to.
- **Compute Planned TSS's binding set on read from today's results.** Rejected:
  wrong for a done session whose result has since gone, and a resolver query in
  every reader.

## Consequences

- Schema: `Event.distanceM`, `PerformanceResult.eventId` and
  `.activityImportId`, and the Planned TSS binding set on `WorkoutSession`; all
  additive and nullable, so no existing row moves.
- An Event, its result session or its Recording changing without the reconcile
  leaves a wrong result the resolver keeps using. A test enumerates the paths in
  §2 and asserts each one reconciles.
- The next ticket (typing or correcting the time on the Event) edits the Event's
  row, which then stops being `verified`; it does not add a third kind of row.
- Swim and bike results, and activity bests, will write rows with their own
  provenance under the same §3 tie-break and §4 binding rule.
