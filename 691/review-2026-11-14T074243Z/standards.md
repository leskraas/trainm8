# Standards review: PR #691 (closes #472), head 76bff60

Phase `poc`. Under that bar, review sends the PR back to `implement` only for a high or critical finding on the happy path, a secret, or a one-way door. Everything below is low, so each item is a `Debt:` line and none is a send-back.

**Verdict: pass.** The diff breaks no documented standard. There are seven low findings: small duplications and defensive code that can never run. All can be fixed without a human decision.

## What I read

`CLAUDE.md`, `docs/agents/domain.md`, `GLOSSARY.md` (the Planned Volume, Placed Hours, Stock Workout and Workout Reading entries), the ADRs (0053 §6/§8, 0081, 0116, 0119 (new)), `docs/design/design-system.md` (Spacing, Type), `docs/design/ui-conventions.md` (§1.4, §4), `docs/guiding-principles.md`, `docs/testing.md`, `docs/agents/factory.md` (phase `poc`), the factory's "The bar" and `.claude/skills/domain-modeling/ADR-FORMAT.md`.

## Standards checked and held

- **Guard files.** CLAUDE.md "Rules for agents": the diff touches none of `.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `fly.toml` or `other/**`.
- **Dependencies and seed data.** There are no new dependencies and no seed changes.
- **Every word in `labels.ts`.** ADR 0081 §2 and ui-conventions §4. `placedAsPublished`, `targetUnavailable`, `weekFiguresLabel` and `alreadyInWeek` live in `app/utils/labels/plan-generate.ts`, and `labels.plan-generate.test.ts` tests them. The route takes `WEEK_FIGURE_LABELS`, `unmeasuredCountLabel` and `DRIFT_MARK_LABEL` from `labels.ts`, so it hand-writes no Norwegian.
- **Glossary vocabulary.** domain.md "Use the glossary's vocabulary". Names and docs use the glossary terms Planned Volume, Week Target, Stock Workout, Training Week and Volume Currency. The GLOSSARY entry for Planned Volume is extended to cover the preview and cites ADR 0119.
- **ADR conflicts flagged.** domain.md "Flag ADR conflicts". ADR 0119 names how it departs from ADR 0116 and says why. ADR 0053 §6 and §8 hold: `readPreviewWeekVolumes` only reads.
- **The `volumeSessionOf` split changes no behaviour.** `discipline`, `reading.discipline` and the `strength` gate on `prescribedSets` used to come from `getSessionDiscipline(session)`. When a session has a workout, that function returns `workout.discipline` (`training.ts:38-43`), so `prescriptionVolumeOf` gives the same answers.
- **Importing from another route's folder.** `routes/training/__season-picture*.ts` already import from `routes/_home/timeline`, so this follows precedent.
- **Spacing and type.** The track figures use `text-footnote`, `tabular-nums` and `font-medium` (design-system "Type"). Gaps are `gap-x-2`, `gap-y-1` and `space-y-1`, which the same file already uses (ui-conventions §1.4).
- **Duplication removed.** `TRACK_INK` (copied twice before) and the `≠` span (copied twice) are now one module, `track-marks.tsx`. The ledger→`VolumeSession` mapping (copied twice) is now `ledgerVolumeSessions`. The training-time read (copied twice) now lives on `GenerationContext`. `placedAt` and `PLACED_STATUS` are shared by the preview and `writeSessions`.

## Findings

### 1. The route joins a figure to its unit by hand, a copy of `formatNbVolumeTotal`
- **Where:** `app/routes/training/plan.generate.$eventId.tsx:939` (used at 949 and 955)
- **Severity:** low
- **Rule:** ADR 0081 §3, ADR 0023 and design-system "Type": numbers are formatted by `format.ts`. The smell is **Duplicated Code**.
  ```tsx
  const withUnit = (figure: string) => `${figure} ${track.unit}`
  ```
- **How to show it:** `format.ts:951-956` already does exactly this (`formatNbVolumeTotal` joins `formatNbVolumeFigure` to `NB_VOLUME_UNITS[currency]` with a U+00A0). The code this hunk replaced called `formatNbVolumeTotal`. `TimelineTrackWeek` extends `TrackWeekVolume`, so `track.target`, `track.planned` and `track.currency` are all available as numbers.
- **Fix:** use `formatNbVolumeTotal(track.target, track.currency)` and `formatNbVolumeTotal(track.planned, track.currency)`, and delete `withUnit`.
- **Needs a human decision?** No.

### 2. The route treats a ready-made label as a yes/no flag and rewrites it from the raw count
- **Where:** `app/routes/training/plan.generate.$eventId.tsx:960-963`
- **Severity:** low
- **Smell:** **Feature Envy** and hidden coupling.
  ```tsx
  const beside =
  	track.plannedUnmeasuredLabel != null
  		? unmeasuredCountLabel(track.plannedUnmeasuredCount, track.currency)
  		: null
  ```
- **How to show it:** `wordTrackWeek` decides whether the count goes beside the sum and words it (`week-words.ts:175-182`, sided: `planlagt +1 uten km`). The route keeps only whether that string exists, then words the count again without the side. If `wordTrackWeek` ever sets the label for another reason, the preview follows without anyone noticing. The design does ask for the unsided words, so the behaviour is right; only the shape is in question.
- **Fix:** have `wordTrackWeek` also return the unsided label, or a boolean such as `plannedUnmeasuredBeside`, and have the route read that.
- **Needs a human decision?** No. It touches the shared `week-words.ts`, which Sesong's tests guard.

### 3. Fallbacks that can never run (`?? '—'` and a nullable `figures`)
- **Where:** `app/routes/training/plan.generate.$eventId.tsx:956`, `:257-259` and `:784`
- **Severity:** low
- **Smell:** **Speculative Generality**.
  ```tsx
  : (track.figureNotes.planned ?? '—')
  …
  return entry ? weekFigures(entry, preview.currentWeekKey) : null
  …
  /** The week's tracks, worded; null only if the read has no such week. */
  figures: WeekFigures | null
  ```
- **How to show it, for the dash:** the planned figure is `null` only when `measured === 0 && unmeasured.length > 0` (`week-volumes.ts:669`). In exactly that case `wordTrackWeek` sets `figureNotes.planned` (`week-words.ts:171-174`). So the `'—'` branch never runs.
- **How to show it, for `figures`:** `previewWeekVolumes` maps `season.weeks` one to one (`planned-volume.ts:95`), so every week has an entry, and the `null` branch never runs either.
- **Fix:** drop the dash fallback, make `figures` non-null, and index the map with `!` or build the weeks together.
- **Needs a human decision?** No.

### 4. `getLedgerWeeks` repeats `getLedgerWeek`
- **Where:** `app/utils/training.server.ts:1691-1703`
- **Severity:** low
- **Smell:** **Duplicated Code**.
  ```ts
  const { start } = weekBoundsFromMondayUTC(fromWeekKey, timezone)
  const { end } = weekBoundsFromMondayUTC(toWeekKey, timezone)
  return prisma.workoutSession.findMany({
  	where: { userId, scheduledAt: { gte: start, lte: end } },
  	orderBy: { scheduledAt: 'asc' },
  	select: ledgerSessionSelect,
  })
  ```
- **How to show it:** `getLedgerWeek` (`:1672-1683`) runs the same query, with the same `where`, `orderBy` and `select`, over a single week. The docstring promises that both read "the select `getLedgerWeek` reads". Today that holds because the code is copied, not because one function calls the other.
- **Fix:** make `getLedgerWeek(u, k, tz)` return `getLedgerWeeks(u, { fromWeekKey: k, toWeekKey: k }, tz)`.
- **Needs a human decision?** No.

### 5. The tests build the same fixtures several times
- **Where:**
  - `app/routes/training/plan.generate.$eventId.route.test.tsx:73` (`volume`)
  - `app/utils/plan-generation/planned-volume.test.ts:19` (`session`), next to the existing builders in `week-volumes.test.ts:61` and `:82` and `week-sum.test.ts:40`
  - `app/utils/plan-generation/generate.server.test.ts:449` (`addOwnRun`) and `:645` (`theirs`)
- **Severity:** low
- **Smell:** **Duplicated Code** in tests.
- **How to show it:** each `VolumeSession` builder spells out the same nine fields with the same defaults. `addOwnRun` and `theirs` write the same nested `prisma.workout.create` for a one-block, one-distance-step run.
- **Fix:** share one `VolumeSession` builder for tests, and fold the second workout create into a helper that takes `ownerId` and `km`.
- **Needs a human decision?** No. It is optional, a debt only.

### 6. A double cast in a test fixture
- **Where:** `app/utils/plan-generation/planned-volume.test.ts:17`
- **Severity:** low
- **Rule:** no written rule; this is judgement.
  ```ts
  } as unknown as GeneratedSeason
  ```
- **How to show it:** the fixture leaves out most of `GeneratedSeason`. If `previewWeekVolumes` starts reading another field, the test still compiles and fails, or passes, for the wrong reason. The route test in the same PR builds a complete `SeasonPreview['season']` with no cast.
- **Fix:** build the fixture with `satisfies Pick<GeneratedSeason, 'startWeekKey' | 'tracks' | 'weeks'>`, and narrow the parameter of `previewWeekVolumes` and `seasonTrackTargets` to that `Pick`.
- **Needs a human decision?** No.

### 7. ADR 0053 is not told that ADR 0119 clarifies its §6
- **Where:** `docs/adr/0053-season-generation-is-deterministic-behind-the-seam.md:3` (the Status line is unchanged)
- **Severity:** low
- **Rule:** repo precedent, not a written rule.
- **How to show it:** ADR 0119's header says "**Clarifies ADR 0053 §6**". When ADR 0093 amended §1, ADR 0053's Status line gained a note ("§1 amended by ADR 0093 §7"). Without the same kind of note, someone reading §6 ("the payload carries both") could still put the planned sum on `GeneratedSeason`, which is the option ADR 0119 rejects.
- **Fix:** add "· §6 clarified by ADR 0119: the planned sum is a reading of the payload, not a field" to ADR 0053's Status line.
- **Needs a human decision?** No. Phase `poc` holds no merge for an ADR edit.

## Notes (not findings)

- **Partial consolidation.** `TRACK_INK` is now shared, but its sibling maps `TRACK_BG` (`day-pane.tsx:47`, `season-pane.tsx:113`, `stream.tsx:654`) and `TRACK_BORDER` (`stream.tsx:660`) are still copies. That duplication was there before this PR, and `track-marks.tsx` is the place to move them to later.
- **`trackId: \`generated-${track.discipline}\``.** At `planned-volume.ts:55`, this is a made-up id that only serves as a key. A comment saying so would help, but it is not worth a finding.
- **Not checked.** CLAUDE.md "UI craft" asks for the `review-animations` table, the `mobile-native` checklist, `break-ui`, and a note in the PR on what still needs a real phone. Those live in the PR body, which this review does not read. The UI is static, so no motion is involved. The conductor or the spec review should confirm the PR body carries them.
