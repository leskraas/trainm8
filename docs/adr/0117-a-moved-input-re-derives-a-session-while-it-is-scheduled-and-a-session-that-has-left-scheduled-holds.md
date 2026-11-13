# A moved input re-derives a session while it is scheduled, and a session that has left scheduled holds

Status: Accepted (agent decision on delegated issue #707, 2026-11-13) · Closes
ADR 0112 §3's open sentence · Replaces ADR 0019 §2's trigger list · Narrows ADR
0007's "resolved ranges are recomputed … when athlete thresholds change"

## Context

Two values derived from a **Workout Session**'s prescription are materialized on
it: **Planned TSS** (`plannedTssValue`, ADR 0019 §2) and the cached resolved
intensity ranges on its steps (the `intensity*` columns, ADR 0007). Each input
that moves them chose on its own which sessions to re-derive. A threshold
change, a **Zone Recipe** change and an accepted **Threshold Estimate** (one
path, `setDisciplineThresholds`) re-resolved the ranges on every cardio step the
athlete has and recomputed Planned TSS on every session, done ones included. A
typed **Performance Result** recomputed only `scheduled` sessions. So what
"planned" meant for a closed week depended on which input had moved, and once a
done session's Planned TSS was overwritten, the value it was planned with was
gone. ADR 0112 §3 recorded the split and left it open.

The glossary's **Target Resolution** and
`docs/research/portable-intensity-anchors.md` §5.1 already answer the question
for the target itself: a scheduled session re-resolves, a completed one freezes
at completion, because re-resolving history "rewrites past adherence".

## Decision

1. **A session re-derives while its Session Status is `scheduled`, and holds
   once it leaves.** Every input that moves a prescription's numbers (a
   **Threshold**, a Zone Recipe, an accepted Threshold Estimate, a Performance
   Result written or deleted, and any later one such as an imported result or a
   provider threshold sync) re-derives Planned TSS _and_ the cached ranges on
   the athlete's `scheduled` sessions, past-dated ones that read _ikke gjort_
   included. A session that is `completed`, `skipped` or `missed` keeps both as
   they stood when it left `scheduled`. The test is the stored status, never the
   **Session Ledger**'s derived reading: a past `scheduled` session reads
   _missed_ on I dag and still re-derives.

2. **The freeze is tied to the act, not to a date.** Leaving `scheduled` (a
   _Gjort_, a linked or auto-linked **Recording**, a finished strength run, an
   assistant's _Gjort_ on the athlete's say-so, a skip, a session marked missed)
   is what holds it. A session that returns to `scheduled` (_Angre_ on _Gjort_,
   _Angre kobling_, an _Angre_ on a quick log) is re-derived from the current
   inputs at once, by the write that returned it.

3. **One exception: the athlete's own prescription edit.** When the athlete (or
   an **Assistant** on their say-so, ADR 0093 §5) changes the steps of a session
   that has left `scheduled` (a duration, a distance, an intensity, a repeat
   count), that session's Planned TSS is recomputed from the edited prescription
   against the current inputs, and no other session's. A save that changes no
   step (a title, a date) recomputes nothing. A writer that is not the athlete's
   edit (laying, re-laying or copying a week, a **Week Replan**, a Session
   Nudge, a **Juster**, a catalogue or day stamp) re-derives only a `scheduled`
   session and leaves a held one alone.

4. **One module decides it.** `app/utils/load/rederive.server.ts` is the only
   place that chooses which sessions a moved input re-derives, and every trigger
   calls it: one entry point for a moved input (re-derive all of the athlete's
   `scheduled` sessions, both values) and one for a single session (re-derive it
   if `scheduled`, or if the caller says it is the athlete's prescription edit).
   A moved input re-derives every `scheduled` session, not only those that read
   the input, because a session that does not read it re-derives to the value it
   already has, and a dependency filter is one more rule a new input (a race
   pace read from threshold pace, #675) could break. Its write is guarded on the
   status (written only where the session is still `scheduled`), so a session
   that leaves `scheduled` while a re-derive is running is never written.

5. **What a held value is (Derived, never authored, ADR 0112).** While
   `scheduled`, both values are materialized (§3 of ADR 0112) and the triggers
   above are their full trigger list. Once held, the value is a bake made at the
   act of leaving `scheduled` (ADR 0112 §1.3), and ADR 0112 asks that the inputs
   it used be stored beside it. They are not yet: the anchor snapshot belongs to
   the **Target Resolution** record, which is not built. Until it is, a held
   value is auditable through what the app still holds: the prescription itself,
   the dated threshold history (`ThresholdEvent`) and the dated Performance
   Results; only a Zone Recipe switch between completion and today cannot be
   read back, because the recipe has no history.

6. **No notice.** A threshold, a recipe, an accepted estimate and a typed result
   are the athlete's own inputs, so a re-derived `scheduled` session owes no
   **Load Recompute Notice** (ADR 0112 §4). A correction the athlete did not
   make (#463) hooks into the module in §4.

## Considered options

- **Keep re-deriving done sessions.** Rejected: it rewrites past adherence, and
  the overwritten value cannot be recovered. Holding is also the reversible
  direction: re-deriving held sessions later is one call on the module, while
  re-deriving now destroys what holding would have kept.
- **Freeze only `completed`.** Rejected: skipped and missed sessions would keep
  moving, and a closed week's planned figure would mix two thresholds.
- **Freeze by date.** Rejected: no act freezes it, and a past session marked
  _Gjort_ later would carry a prescription older than the day it was done.
- **A status filter in each trigger.** Rejected: it is what produced the split.
  Every new trigger (#670, #674, #675) would choose its scope again.
- **Store the inputs beside a held value now** (a snapshot column written on
  every re-derive). Deferred to the Target Resolution record: the snapshot is
  that record's anchor snapshot, and two snapshots of one act would drift.
- **Resolve history against the inputs in force at the time.** Out of scope:
  research `zones-and-thresholds.md` gap 1, which changes ADR 0005, ADR 0008 and
  the **Load Snapshot**.

## Consequences

- Actual TSS is unchanged: a threshold change still re-resolves a done session's
  recorded TSS from the earliest session (ADR 0008), so a done session's
  **Adherence Band** can still move on its actual side.
- A done session's displayed targets (the **Workout Detail View**, the telemetry
  overlay, chip tint) still resolve at view time; freezing them is the Target
  Resolution record's job.
- No migration. Nothing is backfilled: a done session keeps whatever Planned TSS
  it has when this ships, including one an earlier threshold change rewrote.
- `GLOSSARY.md`'s **Planned TSS** entry and the "four paths" sentence under
  **Intensity Target** say which sessions re-derive. ADR 0112 §3, ADR 0019 §2
  and ADR 0007's consequence point here.
