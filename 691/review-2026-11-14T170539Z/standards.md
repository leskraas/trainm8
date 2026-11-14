# Standards review: PR #691 (head 19e79f4), issue #472, phase `poc`

Sources: CLAUDE.md, docs/agents/domain.md, GLOSSARY.md, ADR 0053/0116/0121(PR), docs/design/ui-conventions.md, docs/design/design-system.md, factory qualities.md/questions.md. No guard file, dependency or `--no-verify` issue in the diff.

## Hard violations

1. **ADR number collides with main (high, merge blocker).** `docs/adr/0121-a-generated-weeks-planned-volume-...md` vs main's `0121-orphaned-workouts-...md` (main runs to 0123). Renumbering (to 0124) is Shotgun Surgery: "ADR 0121" is cited in GLOSSARY.md:2938, ADR 0053 status line, planned-volume.ts:2/40, generate.server.ts (SeasonPreview.weekVolumes doc, readPreviewWeekVolumes), week-volumes.ts:276/302/333, write-sessions.server.ts:48, labels/plan-generate.ts:149, the route. Branch also conflicts with main in `app/routes/training/plan.generate.$eventId.tsx` and `docs/agents/verify/features/season-plan.md` (confirmed with `git merge-tree`).

No other documented rule is broken: new Norwegian copy lives in `PLAN_GENERATE_LABELS` with a test (ui-conventions §4); type steps are Luma (`text-footnote`); track names use `track-*-ink`, not hues (design-system, Mobile baseline); `tabular-nums` on figures; spacing `gap-x-2`.

## Judgement calls (smells)

2. **Duplicated Code: the drift tolerance (medium).** labels/plan-generate.ts:139 hard-codes `mer enn 10 % unna målet`, while the rule is `DRIFT_TOLERANCE = 0.1` (week-volumes.ts:74). If the constant changes, the sentence is wrong and nothing fails. labels.ts must stay a runtime leaf (ui-conventions §4), so make it `placedAsPublished(percent)` and pass `DRIFT_TOLERANCE * 100` from the route.

3. **Duplicated Code: a placed session's day (medium).** generate.server.ts:536-539:
   `const scheduledAt = placedAt(session, trainingTime, timezone)` … `dayKey: addDays(session.weekKey, session.weekday)`.
   `placedAt` already encodes the day. Sesong derives `dayKey` as `localDate(scheduledAt, timezone)` (`ledgerVolumeSessions`, week-volumes.ts:380). The preview = Sesong pin rests on these staying in step, so use `localDate(scheduledAt, timezone)`. The route test copies the rule a third time (`addDays(placedSession.weekKey, placedSession.weekday)`).

4. **Feature Envy / misplaced module (low).** New shared UI `app/routes/_home/timeline/track-marks.tsx` is imported by a training route (route.tsx:60/64, also `week-words.ts`). There is precedent (`__season-picture*`), but a component built for three surfaces belongs in `app/components`.

5. **Duplicated Code: the athlete's training time (low).** readContext now reads `defaultTrainingTime` inline (generate.server.ts readContext select + `trainingTimeOf`), while `defaultTrainingTime()` (write-sessions.server.ts:34) stays for relay.server.ts:202. That gives two readers of one field.

6. **Re-wording a presenter's output (low).** route.tsx:960-961 gates on `track.plannedUnmeasuredLabel` and then words it again through `unmeasuredCountLabel(...)`. The presenter already worded it, so the route only keeps the wording rule and drops the result. Better: an unsided field from `wordTrackWeek`.

7. **Speculative Generality (low).** session-profile.ts:330 `deriveSessionProfile<W extends ShapeWorkout>(workout: W | null)` uses `W` only as a constraint. `ShapeWorkout | null` would do.

8. **Mysterious Name / Primitive Obsession (low).** planned-volume.ts:55 makes up `trackId: \`generated-${discipline}\``. write-sessions.server.ts:93 types `PLACED_STATUS = 'scheduled'` as a bare string. `TRACK_INK: Record<string, string>` (track-marks.tsx:10) is keyed by `string`, not `Discipline` (it was moved, not new).

9. **Test duplication (low).** The `volume()` fixture in the route test and `session()` in planned-volume.test.ts build the same `VolumeSession`. planned-volume.test.ts casts the season with `as unknown as GeneratedSeason`.

10. **Off-ladder spacing (low).** route.tsx:907 `gap-y-1` and `space-y-1` have no reason stated (ui-conventions §1.4). There is precedent at :806.

## Positive

`prescriptionVolumeOf`/`ledgerVolumeSessions` remove two copies of the ledger mapping. `readStockWorkouts` now reads `authorship: 'system'` only and logs dropped ids (Security, Insight).

## Bar (`poc`)

Only #1 blocks the merge, and it is a process item, not code. #2 and #3 should be fixed, since they protect the preview = Sesong promise. The rest are `Debt:` lines.
