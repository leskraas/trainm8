# 624 — Editing a recording's intervals

The resolution asset for *Decide how the athlete edits a recording's
intervals* (#624) on the map *structured workouts everywhere* (#600). It builds
on `603-activity-interval.md`, `608-plan-mapping.md`, `623-pool-swims.md`,
`609-detection-v3.md` and `findings.md` §1–5 and §9, all on
`origin/research/structured-workouts`. Code references are to `origin/main` at
`ed64839`. Where `603`/`608` are cited, they mean those files on the research
branch.

## Answer

- **The athlete layer is the only correction path for a recording.** The
  correction path in ADR 0032 and ADR 0033 is "edit the materialized Workout".
  The UI cannot reach it today. A recording-only session is created
  `completed` (`app/utils/activity-import.server.ts:437,444`), and the
  prescription is editable only when `status === 'scheduled'`
  (`app/routes/training/sessions.$sessionId.tsx:270,1355`). This ticket
  replaces that path with interval edits, and does not add a second one.
- **v1 ships these edits:** split, merge with a neighbour, move a boundary,
  set the role, pin "this was rep N", mark "I skipped this step", and revert to
  detected. **Not shipped:** add by dragging (on a layer that covers the whole
  session, an add is two splits, and a touch drag on the chart already scrubs,
  `__workout-detail-telemetry.tsx:478`), delete (it is a merge, because the
  athlete never writes gaps), and a free-text rename (there is no column for it
  and nothing would read it). Re-grouping into N× is an owner choice.
- **On a phone, you select an interval from the list and edit it in a
  Drawer.** At 390 px a 60-minute session gives about 0.1 px per second, so a
  44 px target spans about 7 minutes. That is why the list rows are the
  targets, not the drawing. Splits and boundary moves happen on a zoomed strip
  inside the Drawer, with snapping and ±1-sample steppers. Every write saves at
  once and can be undone from the toast, as in ADR 0088.
- **"I skipped rep 5" is a Skipped Step.** It is a row on the session, keyed by
  the planned step's StepKey, and it never belongs to an interval. The aligner
  treats it as a forced gap, the mirror image of a pin. It reads `missed` with
  `evidence: 'athlete'`. It does not create an athlete layer, so marking a skip
  does not freeze the reading against later re-detection.
- **The detected Workout is left alone**, in both directions. An interval edit
  does not adopt it, re-materialize it or fork it. Editing a Workout never
  writes intervals. For a recording-only session, every reader that says what
  happened reads the recording, never the detected Workout. The `recorded` ⇄
  `detected` compare-and-swap and its guards stay exactly as they are
  (`workout.server.ts:1501-1660`).
- **Figures after an edit:**
  - A row whose edges are still a device or provider lap keeps that lap's
    figures.
  - A merge of lap rows is composed exactly from the laps.
  - Any other row is computed from the stream (`statsSource: 'stream'`),
    snapped to the stream's grid. The row has no max values, and NP only when
    the row is ≥ 10 min.
  - An edge that leaves a lap drops `lapIndex`, `deviceStepIndex` and
    `deviceRepetition`, so the row falls back to the aligner (#608).
- **Re-detection under an edit leaves the reading unchanged.** The engine
  layer and the detected Workout keep following the engine. The session page
  then shows one quiet line beside the revert control. There is no
  notification and no notice on I dag.
- **ADR 0033 is amended** (draft below). For a Recording, "editing adopts"
  becomes "editing writes the athlete layer". Session Adoption stays the rule
  for prescriptions. Each athlete layer next to its engine layer is a labelled
  correction.

## 1. Affordances, and how they work on a phone

### 1.1 What the code already decides

| Fact | Where | Consequence |
|---|---|---|
| Within a layer, rows are sequential and do not overlap. Gaps are allowed only where the source left one. | `603` §2 | An "add" inside a layer that covers the session is two splits. A "delete" either leaves a hole or merges. |
| A touch drag across the telemetry chart is the Chart Inspect scrub | `__workout-detail-telemetry.tsx:353-357,465-478`; ADR 0029, ADR 0030 §3 | "Drag on the chart to add" would collide with scrubbing. The scrub cursor is a ready-made split point. |
| The stream is bucket means on a ≥ 5 s grid, ≤ 1000 samples: 5 s for a 1 h run, about 19 s for a 5 h ride | ADR 0020:4,60-62; `prisma/schema.prisma:1826-1838` | A stream edge cannot be finer than one sample. A max over the stream is a max of means. |
| `ActivityInterval` has `role` and group columns, but no name column | `603` §2 | A free-text rename needs a new column, and no reader would use it. |
| Pool edits snap to `ActivityLength` edges | #623 | Swim edges never fall inside a length. |
| Profil sizes are full 56 px, row 24 px and mini 12 px | `findings.md` §9 | Only the list rows reach the 44 px tap height. |
| Writes are undone from a toast (Sonner) and sheets are Base UI Drawers | ADR 0088, ADR 0085 | Interval writes follow the same undo model. |

### 1.2 Decisions

| Affordance | Ships? | Semantics |
|---|---|---|
| **Split** | v1 | Splits the selected interval at a time on its zoomed strip. That time defaults to the Chart Inspect position when the athlete arrives from a scrub. Both pieces keep the role. A piece shorter than 2 stream samples (or 1 length in a pool) is refused: "for kort til å måles". |
| **Merge** | v1 | Merges with the previous or next interval. The new row's role is the longer piece's role, and the athlete can change it. This is also how a "delete" is done. |
| **Move a boundary** | v1 (see owner choice 1) | Moves the shared edge of two neighbours. It is snapped (§1.3), and it can never cross or empty a neighbour. |
| **Set role** | v1 | `warm-up`, `work`, `recovery`, `cool-down` or `steady` (GLOSSARY **Step Role**). It is stored on the athlete row with provenance `authored`. Allowed below the ADR 0033 gate too, because it is the athlete's word, not an inference (`603` §4). |
| **Pin "this was rep N"** | v1, only when the session has a genuine prescription | Writes a StepKey to the athlete row (#608 A2). It is never offered against a `detected` Workout (§3.3). |
| **Skipped Step** | v1, same condition | See §2. |
| **Revert to detected** | v1 | Deletes the athlete layer (`603` §1). The label names what the reading falls back to: detected, the watch's laps, or the whole session. |
| Add by dragging | no | It is two splits, and dragging conflicts with the scrub. A desktop range-select can come later, as a shortcut for two splits. |
| Delete | no | It is a merge. If the athlete created gaps, "not found" would gain a third meaning, and the Profil (width = time) would have to draw a hole for something that was not a pause. |
| Free-text rename | no | There is no column and no reader. Setting the role is the rename. |
| Re-group into an N× set | owner choice 2 | — |

### 1.3 Snapping, in priority order

1. A device lap edge of any trigger, auto-km included, because it is measured
   exactly. For a pool swim, an `ActivityLength` edge (#623).
2. An engine edge, when the athlete is editing a copy of the engine layer.
3. Otherwise, the stream sample grid (`resolutionSec`).

When the dragged edge comes within one sample of a candidate, it snaps to it.
A snapped lap edge restores the lap's identity and figures (§4).

### 1.4 The phone (390×844)

- **Where.** On the session page there is a Profil `full` with the interval
  list below it. Each list row is ≥ 44 px tall: the row Profil plus duration,
  pace or power, and HR. The list is how the athlete selects an interval,
  because the drawing cannot be tapped at the widths a 15 s recovery gets.
  Tapping the drawing selects the nearest row and scrolls it into view.
- **The Drawer.** A Base UI Drawer (ADR 0085), one interval at a time, holds:
  - the interval's figures and where they came from;
  - a role segmented control;
  - **Del** (split);
  - **Slå sammen med forrige / neste** (merge);
  - **Flytt start / slutt** (move a boundary);
  - **Dette var …** (a plan-step picker, only when the session has a plan).
- **The zoomed strip.**
  - It shows the selected interval plus 30 s of each neighbour, never less
    than 60 s wide. A 15 s piece is then at least about 80 px wide.
  - The handle owns the horizontal axis only (`touch-action: pan-y` on the
    strip, `mobile-native` §9), so a vertical drag still dismisses the
    Drawer. The handle uses pointer capture and ignores a second finger
    (`emil-design-eng`, gestures).
  - Steppers move the edge ±1 sample. Snapping shows as the handle settling
    on a tick.
  - With reduced motion, the settle is instant.
- **Saving.** Each operation is one server write that autosaves, like the
  token editor (`sessions.$sessionId.tsx:571-579`). A Sonner toast offers
  **Angre**. The undo token carries the athlete layer as it was before the
  write: either the rows, or "no layer", which deletes it.
- **Provenance.** Once an athlete layer exists, the section label reads
  "Justert av deg" instead of the detected badge, and the re-detect footer
  (`sessions.$sessionId.tsx:1013-1015,1297`) becomes the revert control (§5).
- **Still needs a real phone:**
  - the horizontal handle drag inside a vertically dismissable Drawer;
  - snap feel at 5 s versus 19 s grids;
  - list scroll-into-view after tapping the drawing;
  - the 41-bar worst case from #601.

## 2. "I skipped rep 5"

**Decision.** This is a **Skipped Step**: the athlete's word that a planned
step was not done. It is stored on the **session** (the hub that joins plan
and actual, ADR 0004), keyed by the step's StepKey:

```prisma
model SkippedStep {
  id         String   @id @default(cuid())
  sessionId  String
  session    WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  stepId     String
  step       WorkoutStep    @relation(fields: [stepId], references: [id], onDelete: Cascade)
  rep        Int      // 0-based, within the step's block
  series     Int      @default(0)
  slot       String   // StepKey slot ('step' | 'seriesRest' | 'sendOffRest')
  createdAt  DateTime @default(now())
  @@unique([sessionId, stepId, rep, series, slot])
}
```

**Why here and not on an interval or the import:**

1. **No interval exists to carry it.** A zero-length interval would be a
   stored fiction, which map decision 1 rules out.
2. **It must not create an athlete layer.** A full copy of the visible layer
   (`603` §1) would freeze the reading against every later detection
   improvement, all for a statement that moves no edge. Pins can live on
   athlete rows because a pin is about an interval. A skip is about the plan.
3. **It is the athlete speaking about a planned step.** That is the shape of
   `ExerciseSetLog`, the strength execution layer (keyed by session and step,
   `findings.md` §4). A relink takes the recording elsewhere. The skip should
   stay with the plan it describes, which keying it to the session does.

**What it does:**

- **Aligner.** In #608's DP, a skipped StepKey is a *forced skip-step move*,
  the mirror of the forced pin. The other reps re-flow around it, as in case
  A2. Pins and skips together are the athlete's only levers on the mapping.
- **Status.** It reads `{ status: 'missed', evidence: 'athlete' }`, which
  widens #608's `evidence: 'device-workout'`. The athlete's word outranks the
  device, as the read order already does (athlete → device). If a lap exists
  for that position, the lap reads *unplanned*.
- **It is not a verdict and not load.** Planned TSS is unchanged (the plan is
  unchanged), and actual TSS comes from the import. ADR 0034 §2 refuses to
  charge a missing rep to the athlete on the *detector's* evidence. Here the
  athlete is saying it themselves.
- **Dangling.**
  - Removing the step deletes the skip (FK cascade).
  - If a plan edit removes the rep (6× → 4×), the reader drops the skip at
    read time with the same notice #608 gives a dangling pin.
  - The fork on first adoption must repoint skips, and pins too, exactly as
    `repointLoggedSetsToFork` does for set logs (`workout.server.ts:1259-1275`,
    called at `:1392`). Otherwise every first edit of a generated session
    would orphan them.
- **UI.** On a planned step's row in the mapping (any status but `executed`
  via `device-workout`), the action is "Dette draget ble ikke gjort". Undo it
  from the toast, or by tapping the row again.

## 3. The detected Workout

### 3.1 An interval edit leaves it alone

| Option | What the code says |
|---|---|
| **Adopt** (stamp `adoptedAt`, fork) | Adoption means the athlete took over a **prescription**, and it fires only when blocks, discipline or intent change (`workout.server.ts:1356-1362`; GLOSSARY **Session Adoption**). An interval edit changes none of these. Adoption would also turn on Structure Adherence (`sessions.$sessionId.tsx:1588-1592`), which would show an engine-versus-athlete "diverged" chip on a session with no plan: a grade for the detector presented as a grade for the training. It would also end re-detection of the Workout for good. **Rejected.** |
| **Re-materialize** (fold the athlete layer into the Workout) | `replaceDetectedStructure` is the engine restating its own output, guarded to unadopted `detected` sessions (`workout.server.ts:1558-1623`). Writing the athlete's edges into it would make the "detected · (confidence)" badge (`sessions.$sessionId.tsx:978-988`) describe structure the engine never found. That breaks the honesty labelling ADR 0033 keeps `detected` for. **Rejected.** |
| **Leave alone** | The Workout stays the engine's fold. #609 says v3 writes `structureJson` as a fold of the engine rows, so the Workout matches the engine layer and `WorkoutDetection` by construction. The athlete layer sits on the import. **Chosen.** |

**Consequences that follow from "leave alone":**

- **The engine keeps full ownership of its own artifacts.** The detect job
  still re-materializes or retracts the detected Workout
  (`detect-job.server.ts:167-206,236-266`) whether or not an athlete layer
  exists. No new guard is needed. Each engine version therefore pairs with the
  athlete layer as a current labelled correction. #609 §6.2's "athlete-layer
  intervals: never touched" means the athlete rows, not the session's Workout.
- **Edits survive a relink.**
  - The athlete layer sits on the import, so it moves with the recording when
    "hva var dette?" links it onto a planned session.
  - The ekstra shell the link deletes holds only the engine's Workout
    (`import-link.server.ts:63-70`), so nothing the athlete drew is lost.
  - Edits made to a Workout would have been lost with the shell, or would
    have made it non-bare and blocked the undo.
- **Readers.** For a session with source `recorded` or `detected` (not
  adopted), every reader of *what happened* reads `readRecording`, never the
  detected Workout. Today one reader breaks this rule: `readSessionArchetype`
  reads `input.workout` (`archetype-classification/read-session.ts:79-81`). It
  moves with the #602 rollout (`readMainSet` → `work.mainSet`). Planned TSS is
  unaffected (`load/planned-tss.server.ts:247`).
- **Mirror.** Already settled. The detected Workout ends the Auto-Save Mirror
  (`activity-import.server.ts:224-243`), and so does an athlete layer (`603`
  Q3).
- **Retraction under an edit.** When v3 retracts (`detected` → `recorded`,
  `workout.server.ts:1625-1660`), the engine layer goes with the detection.
  The athlete layer stays, and the revert target becomes the device step laps
  or the whole session.

### 3.2 The reverse: editing the Workout never touches intervals

- **Editing a Workout is editing a prescription.** It cannot write measured
  edges, because a plan step is not an executed interval (GLOSSARY **Activity
  Interval**: "Interval names the executed thing; Step names the planned
  thing").
- **For a recording-only session the path is closed outright.**
  - The UI already never offers it (§Answer).
  - The server action has no status guard (`sessions.$sessionId.tsx:579-641`
    calls `updateWorkoutSession` for any session). A crafted POST can still
    adopt a `detected` Workout.
  - **Decision:** refuse `saveWorkout` on sessions with source `recorded` or
    `detected` (a ticket below).
- **Historic adopted `detected` sessions keep working as they are.** Their
  count in production is unknown (fog).

### 3.3 A detected Workout is never the plan for the mapping

`readRecording(…, plan?)` gets `plan` only from a genuine prescription: source
`authored` or `generated`, or a historic adopted session. That is the same
gate as `resolveStructureAdherence` (`sessions.$sessionId.tsx:1588-1592`).
Mapping a recording onto a Workout materialized from that same recording is
the self-comparison ADR 0034 §3 refuses. So on a recording-only session there
are no pins and no skips.

## 4. Figures after an edit

Each case keeps `603` §3, made exact for edits:

| Row after the edit | Figures | `statsSource` | Device keys |
|---|---|---|---|
| Copied unchanged from a lap row | the lap's own | `device` / `provider` | kept (`lapIndex`, `deviceStepIndex`, `deviceRepetition`) |
| Merge of rows that each are a lap | **composed exactly**: distance and moving time summed; avg HR, power and cadence time-weighted by moving time; max = max; speed = Σ distance ÷ Σ moving (`603` §2 rule); NP = null unless the stream rule applies (≥ 10 min) | `device` / `provider` | `lapIndex` and the device keys dropped (it is no longer one lap) |
| Split, moved edge, or merge involving a stream row | from the stream over `[startSec, endSec]` on the grid: means only; **max fields null** (a max of bucket means is not a max, ADR 0020:60-62); distance by integrating speed (1000 ÷ pace) when the pace channel exists, else null, never 0; NP only ≥ 10 min | `stream` | dropped, so the row falls back to the aligner (#608) |
| An edge snapped back onto a lap edge, both edges matching one lap | the lap's own again | `device` / `provider` | restored |
| Pool (#623) | from lap and length facts: distance = pool length × active lengths in range; moving = Σ active length durations | `device` | kept only when the edges are a lap |

**When the device layer arrives after an edit** (the zero-I/O backfill writes
typed laps), the backfill recomputes the *figures* of athlete rows by the
table above. It never changes their edges, roles, pins or skips. The figures
are measured data, not the athlete's word. Load and week volumes do not move,
because they come from the import summary, so there is no Load Recompute
Notice.

## 5. Re-detection changes underneath

- **The reading does not change.** The athlete layer is read first and
  re-detection never writes it (`603` §1; ADR 0032 as amended).
- **How the page knows the engine moved.** Athlete rows copied from engine
  rows keep that row's `engineVersion` (this widens `603` §2's "engine rows
  only"). The engine has moved since the edit when the copied rows'
  `engineVersion` differs from `WorkoutDetection.engineVersion`, or when the
  detection is gone.
- **What the athlete sees.** One quiet line at the revert control, which
  replaces the re-detect footer when an athlete layer exists:
  - "Gjenkjenningen er oppdatert etter at du justerte" when the engine moved;
  - "… finner ikke lenger drag" after a retraction.
  - **Tilbake til gjenkjent** previews the engine layer as a ghost row Profil
    before it deletes the athlete layer.
- **No notification or I dag notice,** because the v3 backfill reaches all
  history (#609 §6.2). A notice per edited session would arrive in bulk, about
  sessions the athlete is not looking at.
- **No automatic merge or drop,** not even when the engine now agrees with
  the athlete. The athlete layer is their statement (#460: the athlete's edits
  are sacred). Dropping it would also quietly turn the Auto-Save Mirror back
  on for the few below-gate sessions where it still applies.

## ADR 0033 amendment (draft text)

> **Amended by [#624](https://github.com/leskraas/trainm8/issues/624) (map
> #600): a Recording is corrected through its Activity Intervals, not through
> its Workout.** The honesty gate, the grade, the signal-trust cap and the
> availability rules stand (as recalibrated by #609). Under **Provenance
> marking**, "Editing adopts" now applies only to a prescription. For a
> Recording, the correction path is the **athlete layer** of its **Activity
> Intervals** (ADR 0032 as amended by #603), in four ways:
>
> 1. **The athlete corrects the recording, not the Workout.** Split, merge,
>    move a boundary, set a role, pin "this was rep N" and revert to detected
>    all write the athlete layer, a full copy made at the first edit. An
>    interval edit never adopts, forks or re-materializes the session's
>    `detected` Workout, and editing a Workout never writes intervals. A
>    recording-only session's Workout is not editable at all. Its status was
>    `completed`, so the UI never offered it, and the server now refuses it
>    too.
> 2. **The `detected` Workout stays the engine's.** It is materialized,
>    replaced and retracted only by the detect job, through the `recorded` ⇄
>    `detected` compare-and-swap. That job is guarded to unadopted sessions as
>    before, and it does not look at the athlete layer. Every reader that says
>    what *happened* in a recording-only session reads the recording's
>    intervals, never this Workout. It is never the plan a recording is mapped
>    against.
> 3. **The base + overlay this ADR's Revisit asked for now exists at the right
>    grain.** The detection and its engine layer are the immutable,
>    engine-owned base. The athlete layer is the athlete's overlay. Re-detection
>    rewrites the base and never the overlay. "Revert to detected" deletes the
>    overlay. Each pair of an engine layer and an athlete layer is a labelled
>    correction, which is the calibration corpus this ADR wanted.
> 4. **Provenance follows the reading.** While an athlete layer exists, the
>    "detected · (confidence)" badge and the re-detect control give way to
>    "edited by you" and a revert control. The session's **Session Source**
>    keeps its origin value, as #460 requires.
>
> **Session Adoption is unchanged for prescriptions** (authored, generated, and
> a Workout the athlete wrote). It no longer occurs for a `detected` session
> through any supported path. Historic adopted `detected` sessions keep their
> fork and their Structure Adherence.

ADR 0032:65-66 ("The athlete's correction path is editing the materialized
**Workout** like any other") gets one line: *Superseded by #624: the correction
path is the athlete layer of the Recording's Activity Intervals; see ADR
0033.*

## Glossary terms

- **Skipped Step**: The athlete's word that a planned step, on one rep of one
  series, was not done. It is stored on the session against the step, never on
  an interval. The mapping reads it as *missed* on the athlete's evidence, and
  it is never charged as a verdict. *Avoid:* missed rep (that is the watch's
  evidence too), deleted interval.
- **Interval Pin**: The athlete's word that one of their intervals *was* a
  given planned step. It is stored on the athlete-layer row as a StepKey, and
  the mapping keeps it while the other reps re-flow. It is dropped with a
  notice when the plan no longer has that step. *Avoid:* link, match,
  assignment.
- **Revert to detected**: Deleting the athlete layer, so the recording reads
  as the engine, the watch's step laps or the whole session say. *Avoid:*
  reset, undo (undo is the toast's single step).
- **Correction of Activity Interval** (existing term, `GLOSSARY.md:2159-2169`):
  add "The athlete corrects a Recording only here, never through its Workout
  (#624)." Its read order still says athlete → detection → device step laps.
  That is stale against #608 Q2 and is fixed when #608 lands.

## Owner choices

> **Taken on the evidence (2026-10-20), reopenable:** 1 → (b), 2 → (a), 3 → (a). The owner asked the agent to decide what it could; each pick rests on a mechanical argument (tap precision at 390 px, no figure or mapping changes, the existing ADR 0088 Drawer pattern), not on taste.

**1. How much of the boundary editing ships in v1?**
- (a) Split, merge, role, pin, skip and revert, with boundary moves later.
- (b) (a) plus moving a boundary on the zoomed strip with snapping and
  steppers.
- (c) (b) plus a desktop range-select add.

*Recommend (b).* On a phone the split point is only as precise as the place
you tap. Without a move, a split that lands 10 s off can only be fixed by
merging and splitting again. Snapping makes the move cheap to build, because
every candidate edge is already stored. (c) adds nothing that two splits
don't already do.

**2. Re-grouping into N× sets.**
- (a) Not in v1. Athlete rows store no groups. The reading derives brackets by
  convention: consecutive work intervals joined by recoveries form a set, and
  a recovery longer than 2× the set's median recovery ends the set (the same
  kind of rule #623 §5.2 uses in the pool). With a plan, the mapping gives the
  plan's brackets.
- (b) A "Nytt sett herfra" toggle per work interval, stored as `groupIndex`
  on athlete rows.
- (c) Full re-group with nesting (series).

*Recommend (a).* Grouping changes no figure and no mapping. For planned
sessions it already comes from the plan. On a recording-only session it is a
label. (b) is cheap to add later if a real recording shows the convention
splitting a set wrongly.

**3. Where you start editing on a phone.**
- (a) No mode. Tap a list row to open its Drawer.
- (b) A "Juster intervaller" button that opens a full-screen editor, with the
  drawing large and every interval editable at once.

*Recommend (a).* It is the composer and Drawer pattern I dag already uses
(ADR 0088). It needs no mode to enter or leave. And one interval at a time is
what the 44 px rule allows at 390 px anyway. (b) suits heavy re-segmenting
(long sessions with many reps) better. It can come later as a desktop-first
view.

## Fog / new tickets

**Ready to ticket**

1. **Schema for edits.** Add `pinnedStepKey` on athlete rows; keep
   `engineVersion` on athlete rows copied from engine rows; add the
   `SkippedStep` table. Repoint pins and skips in `repointLoggedSetsToFork`'s
   transaction (`workout.server.ts:1259-1275,1392`). This amends `603` §2.
2. **Refuse `saveWorkout` on recording-only sessions.** Today it is guarded
   by the UI only (`sessions.$sessionId.tsx:270,579-641`). Add a test that a
   POST against a `detected` session does not adopt it.
3. **The archetype reader reads the recording for recording-only sessions**
   (`read-session.ts:79-81`). It belongs to the #602 rollout.
4. **`PlanMatch` evidence widens to `'device-workout' | 'athlete'`,** and the
   aligner takes forced skips (amends #608 §1 and §4).
5. **The provenance swap on the session page.** Swap the badge for "Justert
   av deg" and the re-detect footer for revert, with the engine-moved line
   (`sessions.$sessionId.tsx:922,978-988,1013-1015`).

**Fog**

6. **Structure Adherence when an athlete layer exists** on a matched planned
   session. It still compares the plan-blind detection, so it can say "not
   verifiable" while the mapping shows every rep. #608 §10 already left
   "Structure Adherence reads the mapping" open. This makes it sharper. It
   needs a decision before the athlete layer ships on planned sessions.
7. **How many adopted `detected` sessions exist in production?** Query
   `source = 'detected' AND adoptedAt IS NOT NULL`. If any exist, decide
   whether to convert their fork into an athlete layer or leave them.
8. **Cropping a recording** (the watch was left running after the session).
   This is not an interval edit: it changes the summary, TSS and volumes, and
   it would need a Load Recompute Notice. It is a separate ticket if wanted.
9. **The stream grid limits edits on long sessions** (about 19 s on a 5 h
   ride, ADR 0020:4). Short recoveries there cannot be split. The answer
   follows #610 (full-resolution stream).
10. **Using athlete corrections as scoreboard labels.** The pairs are
    production data. Moving them into the in-repo corpus (#605) is a privacy
    and consent question for the owner, not a code question.
