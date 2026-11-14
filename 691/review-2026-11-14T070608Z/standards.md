# Standards review: PR #691 (closes #472), head 5eaf9b3

Phase `poc`. Judged cold: PR body and factory comments not read.

**Verdict:** no critical or high finding. 2 medium, 11 low. All can be recorded as `Debt:` under the poc bar. Nothing has to go back to `implement`.

## Standards read

- `CLAUDE.md`, `docs/agents/domain.md`, `GLOSSARY.md` (Planned Volume, Week Target, Stock Workout, Placed Hours, Training Track)
- ADR 0053 (§6, §8), ADR 0081, ADR 0112 (derived, never authored), ADR 0116 (Placed Hours), ADR 0119 (new in this PR)
- `docs/design/design-system.md` and `docs/design/ui-conventions.md`
- `.sandcastle/CODING_STANDARDS.md` and `docs/guiding-principles.md`
- `.claude/skills/factory/references/questions.md` ("The bar")

## Skipped because tooling enforces them, or because they predate this PR

- **eslint `import/order` warning**: `plan.generate.$eventId.tsx:98` (`placed-hours.ts` should come before `planned-volume.ts`). This is a warning only and `--fix` repairs it.
- **`prettier --check` fails on `GLOSSARY.md`**: the failing lines are the **Placed Hours** entry (around lines 2930–2937), which comes from main. The PR's own GLOSSARY hunk is formatted.
- **`tsc` errors in the route**: they come from route typegen not being run in the worktree (`./+types/...` is missing). They are not caused by the diff.

## Findings

### 1. ADR 0119 contradicts ADR 0116 without naming it (medium)

- **File:** `docs/adr/0119-a-generated-weeks-planned-volume-is-read-outside-the-seam-as-sesong-will-read-it.md`, lines 1–7, 24–40 and 59–64.
- **Standard:** `docs/agents/domain.md`, "Flag ADR conflicts": *"If your output contradicts an existing ADR, surface it explicitly rather than silently overriding … name the ADR that should be superseded."*
- **The conflict:**
  - ADR 0116 §2 decides that the reading of placed sessions is *"made by the pure generator"*. The corpus carries each Stock Workout's blocks, and the result is *"carried on the payload"*.
  - ADR 0116's Considered options rejects *"Price the placed sessions … after generation, from a second query"*, because *"preview and approval would read the figure in two layers, and the pure generator's tests could not see it."*
  - ADR 0116's Consequences (lines 70–73) says *"#472 shows Planned Volume beside the Week Target from the same per-session reading."*
  - ADR 0119 §1–2 does the opposite. It reads after generation, from a second query (`readStockWorkouts`), outside the seam. Its stated reason, *"a measurement made by the thing being measured is not one"*, argues against ADR 0116 §2 as well. Yet ADR 0119 only names ADR 0053 and never names ADR 0116.
  - The result is that two sibling figures about the same placed sessions follow opposite rules: Placed Hours is on the payload, and Planned Volume is read outside it.
- **How to show it:**
  - `grep -n 0116 docs/adr/0119-*.md` prints nothing.
  - `sed -n 30,40p docs/adr/0116-*.md`
  - `sed -n 59,73p docs/adr/0116-*.md`
- **Fixable without a human?**
  - Naming ADR 0116 and amending its Consequences line: **yes**.
  - Choosing which of the two placements is the rule, and whether to merge the two reads: **no**, a human or architect decides.

### 2. The "already in this week" count copies the week model's rules (medium)

- **File:** `app/utils/plan-generation/planned-volume.ts:102-109`.
- **Smell:** Duplicated Code, with a risk of Divergent Change. It also goes against the intent of ADR 0119 §5: *"The `≠` rule …, the unmeasured counts and the empty-week rule are not copied"*.
- **The code:**
  ```ts
  // The sessions a track's planned figure reads, by the week model's own rule:
  const trackDisciplines = new Set<string>(tracks.map((t) => t.discipline))
  const countsInPlanned = (session: VolumeSession) =>
  	!session.countsInNoTrack &&
  	trackDisciplines.has(session.discipline) &&
  	session.prescribed != null
  ```
- **Why it matters:**
  - This restates three rules that already live in `week-volumes.ts`:
    - `annetReason` and `counted` (around lines 544–560)
    - the filter by track discipline (line 569)
    - `plannedSessions = sessions.filter((s) => s.prescribed != null)` (line 655)
  - It leaves out the rule for `other` / Simple Activity.
  - It gives the same result today only because a generated season never has an `other` track.
  - If `annetReason` changes, the card's *"Planlagt teller også med N økter"* line will disagree with the `planlagt` figure above it, and nothing will notice.
- **How to show it:** a unit test that gives `previewWeekVolumes` a season with a track whose discipline is `other`, and an existing Simple Activity on `other`. Compare `existingSessions` with what `buildWeekVolumes` counts for that track. Or make one change to `annetReason` and watch the count fail to follow.
- **Fix:** export the predicate, for example `countsOnTrack(session, trackDisciplines)`, from `week-volumes.ts` and use it in both places. Alternatively, take the count from the model's own per-track `sessions.planned`. Fixable without a human: **yes**.

### 3. `mondayOf` duplicates `mondayOfDay` (low)

- **File:** `app/utils/plan-generation/planned-volume.ts:68-71`.
- **Smell:** Duplicated Code.
- **Standards:**
  - `.sandcastle/CODING_STANDARDS.md`, Architecture: *"Before adding a new abstraction, check whether an existing one already fits"*.
  - `docs/guiding-principles.md`: *"Only one way"*.
- **The code:**
  ```ts
  function mondayOf(dayKey: string): string {
  	return addDays(dayKey, -weekdayIndex(dayKey))
  }
  ```
  This is the same as `mondayOfDay` in `app/utils/athlete-calendar.ts:216-219`.
- **How to show it:** `grep -n "addDays(dateStr, -weekdayIndex" app/utils/athlete-calendar.ts`
- **Fix:** import `mondayOfDay`. Fixable without a human: **yes**.

### 4. The route re-derives the unmeasured "beside" rule (low)

- **File:** `app/routes/training/plan.generate.$eventId.tsx:954-957`.
- **Standard:** ADR 0119 §5, which says the unmeasured counts are not copied into the route. The spec's Architecture §5 says the same.
- **The code:**
  ```ts
  const beside =
  	track.figures.planned != null && track.plannedUnmeasuredCount > 0
  		? unmeasuredCountLabel(track.plannedUnmeasuredCount, track.currency)
  		: null
  ```
  This repeats `wordTrackWeek`'s `beside()` rule (`sum != null && count > 0`, in `app/routes/_home/timeline/week-words.ts`). `wordTrackWeek` already turns that rule into `track.plannedUnmeasuredLabel`.
- **Fix:** gate on `track.plannedUnmeasuredLabel != null` and keep the unsided `unmeasuredCountLabel` wording the design asks for. Fixable without a human: **yes**.

### 5. A third `TRACK_INK` map and a fourth drift-mark span (low)

- **File:** `app/routes/training/plan.generate.$eventId.tsx:888-893` and `:960-969`.
- **Smell:** Duplicated Code. Related standard: `.sandcastle/CODING_STANDARDS.md`, *"Compose, don't fork"*.
- **The copies:**
  - `TRACK_INK` already exists in `app/routes/_home/timeline/stream.tsx:675-681` and `app/routes/_home/timeline/season-pane.tsx:119-125`.
  - The span `<span role="img" aria-label={driftLabel} title={driftLabel} className="text-status-under font-bold">{DRIFT_MARK}</span>` already exists in `stream.tsx` (around lines 609 and 800) and `season-pane.tsx:491`.
  - If a token is renamed, all copies must change together (Shotgun Surgery).
- **How to show it:** `grep -rn "text-track-run-ink\|{DRIFT_MARK}" app --include=*.tsx`
- **Fix:** export `TRACK_INK` and a `DriftMark` component from one shared module, which the route already imports from `_home/timeline`. Fixable without a human: **yes**.

### 6. The preview builds a `VolumeSession` by hand, and copies get_season's mapping of existing sessions (low)

- **File:** `app/utils/plan-generation/generate.server.ts:556-580`.
- **Smells:** Feature Envy and Shotgun Surgery.
- **Building by hand:**
  ```ts
  ...prescriptionVolumeOf(workout, { thresholds }),
  dayKey: addDays(session.weekKey, session.weekday),
  status: deriveLedgerStatus({ status: 'scheduled', scheduledAt }, now, timezone),
  recorded: null, doneZones: [], countsInNoTrack: false,
  ```
  - How the ledger half of a `VolumeSession` is put together now lives in two modules: `volumeSessionOf` in `week-volumes.ts`, and here.
  - The `'scheduled'` literal also repeats what `writeSessions` writes.
- **Copying the mapping:**
  - The `existing.map(session => volumeSessionOf(session, { dayKey: localDate(...), status: deriveLedgerStatus(session, now, timezone), thresholds }))` block is a verbatim copy of `app/actions/get-season.server.ts:108-115`.
  - That file also reads its own range of ledger rows, which the new `getLedgerWeeks` could serve.
- **Fix:**
  - Add a `placedVolumeSession(workout, { dayKey, status, thresholds })` next to `volumeSessionOf`.
  - Add a helper that maps ledger rows to `VolumeSession`s, shared with get_season.
- **Severity:** low, because TypeScript flags a missing required field. Fixable without a human: **yes**.

### 7. Duplicate reads in `previewSeason` (low)

- **File:** `app/utils/plan-generation/generate.server.ts:541-552`, plus `:756-779` against `:201-235` and `:331` against `:693`.
- **Standard:** `.sandcastle/CODING_STANDARDS.md`, Performance: *"Loaders should select only the columns/relations they actually need."*
- **The duplicates:**
  - **Stock Workout blocks are now read twice per preview.**
    - First by `readGenerationCorpus`, which reads blocks for Placed Hours (ADR 0116).
    - Then by `readStockWorkouts`, which reads the full `workoutCopySelect` plus ids: title, description, sets and so on. The preview's figure needs none of those extra columns.
  - **The athlete profile is read twice.**
    - `readContext` selects `trainableWeekdays` and `weeklyCapacityHours` (line 331).
    - `defaultTrainingTime` reads the same row again for `defaultTrainingTime` (line 693).
- **Fixable without a human?**
  - The profile read: **yes**, add `defaultTrainingTime: true` to `readContext`'s select.
  - The block read: tied to finding 1, so a human decides.

### 8. A generic that adds nothing, and fields declared twice (low)

- **Files:** `app/utils/session-profile.ts:330` and `app/utils/plan-outline/week-volumes.ts:274-280`.
- **Smell:** Speculative Generality.
- **The generic:** in `deriveSessionProfile<W extends ShapeWorkout>(workout: W | null)`, `W` is used only as its own constraint. `workout: ShapeWorkout | null` says exactly the same.
- **The fields:** `PrescriptionWorkout = ShapeWorkout & SimpleActivityWorkout & { discipline: string; intent: string | null; blocks: … }` declares `discipline` and `intent` again, although the intersected types already carry them.
- **Fix:** drop the type parameter and the repeated fields. Fixable without a human: **yes**.

### 9. Long positional parameter list and a repeated parameter pair (low)

- **File:** `app/utils/plan-generation/generate.server.ts:491-497` and `:533-539`.
- **Smells:** Data Clumps and Long Parameter List.
- **Details:**
  - The call is `readPreviewWeekVolumes(athleteId, season, context.timezone, context.thresholds, now)`. Two of the five arguments are taken out of `context` just to be passed on.
  - The pair `(trainingTime, timezone)` travels together through `placedAt` and `writeSessions`. That pairing predates this PR in `writeSessions`.
- **Fix:** pass `context`, or one options object. Fixable without a human: **yes**.

### 10. Spacing off the ladder, with no reason given (low)

- **File:** `app/routes/training/plan.generate.$eventId.tsx:911` and `:914`.
- **Standards:**
  - `docs/design/ui-conventions.md` §1.4: *"Off-ladder spacing needs a stated reason."* Its "Known violations" section adds: *"follow the standard for the new code; don't clone the violation."*
  - `docs/design/design-system.md`, Spacing: *"Tailwind's 4px grid, one value per role."*
- **The values:** `space-y-0.5` (2 px) and `gap-x-2.5 gap-y-0.5` (10 px and 2 px). `stream.tsx` has similar values, but that is precedent, not a reason.
- **How to show it:** `grep -n "gap-x-2.5\|space-y-0.5" 'app/routes/training/plan.generate.$eventId.tsx'`
- **Fix:** use `gap-x-2` and `gap-1`, or say the reason in the component's comment. Fixable without a human: **yes**. It is a design-token choice, but the ladder already decides it.

### 11. The test fixture re-implements `addDays` (low)

- **File:** `app/routes/training/plan.generate.$eventId.route.test.tsx:131-137`.
- **Smell:** Duplicated Code.
- **The code:**
  ```ts
  new Date(Date.parse(`${placedSession.weekKey}T00:00:00Z`) + placedSession.weekday * 86_400_000).toISOString().slice(0, 10)
  ```
  This is `addDays(placedSession.weekKey, placedSession.weekday)` from `#app/utils/athlete-calendar.ts`, which is the call the server path uses.
- **Fix:** import `addDays`. Fixable without a human: **yes**.

### 12. ADR 0119 §2 names the wrong select (low)

- **File:** `docs/adr/0119-…md:34-37`.
- **Problem:** the ADR says the read *"uses `workoutCopySelect`, the select `writeSessions` reads"*. The code reads `stockWorkoutSelect`, which is `workoutCopySelect` plus block and step ids (`generate.server.ts:766-779`), and `writeSessions` now uses that too. The ADR text does not match the code.
- **Fix:** name `stockWorkoutSelect` and say why the ids are added. Fixable without a human: **yes**.

### 13. Reflowing the verify doc buried a stray fragment (low, predates this PR)

- **File:** `docs/agents/verify/features/season-plan.md:13-19`.
- **What happened:** the fragment *"holding the season editors (ADR 0101 §2). Its Week Pattern editor: …"* was a leftover from a merge on main. Prettier's reflow in this PR moved it into the middle of the Guard Notices bullet: *"None renders inside _Avansert_. holding the season editors (ADR 0101 §2). Its Week Pattern editor…"*. The PR did not cause the fragment, but it touched the hunk and left it there.
- **How to show it:** `git show origin/main:docs/agents/verify/features/season-plan.md | sed -n 10,19p`
- **Fix:** move the Week Pattern sentence into the first bullet and delete the duplicate. Fixable without a human: **yes**.

## Not checkable from here

CLAUDE.md requires every UI change to come with these before it is done:

- the `review-animations` table and its verdict
- the `mobile-native` checklist
- a `break-ui` worst-case run
- a note in the PR on what still needs a real phone

These are shown in the PR body, which this review was told not to read. The conductor should check them there.

## Standards the diff follows

- Every new athlete-facing word is in `labels.ts` (`PLAN_GENERATE_LABELS.placedAsPublished`, `weekFiguresLabel`, `alreadyInWeek`), in Norwegian, with no-break spaces (ADR 0081; ui-conventions §4).
- Glossary terms are used as defined. The Planned Volume entry is extended and cites ADR 0119.
- The figures are worded by Sesong's own `wordTrackWeek`, not a copy, apart from finding 4.
- Nothing is rescaled. A test pins that a copy's blocks equal its Stock Workout's, field by field (ADR 0053 §6).
- `getLedgerWeeks` is scoped by `userId`, and reads come before any write (CODING_STANDARDS, Database and Security).
- The track list uses `subgrid`, not `display: contents`. `≠` is `role="img"` with `DRIFT_MARK_LABEL`. Colour comes from `-ink` tokens. Figures use `tabular-nums` and `text-footnote` (design-system Type).
- No new dependency. No guard file is touched. The route imports through `#app/*`. Class lists use `cn()`. There is no `any` outside the existing test stub.
- The e2e test uses role-based locators (`getByRole('list', { name })`).
