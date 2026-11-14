# Spec review: PR #691 against issue #472 (head 19e79f4, phase poc)

**Verdict:** all 12 criteria are built and tested. Nothing is missing or wrong in behaviour. Two findings come from main moving on since the branch point, and two are small scope additions.

## (a) Missing or partial criteria

None. Each criterion has a test:
- C1, C3–C9, C11: `plan.generate.$eventId.route.test.tsx` and `tests/e2e/plan-generate.test.ts` (run row `mål … · planlagt …`).
- C2: `generate.server.test.ts:536`. It previews, approves unchanged and compares planned, unmeasured count and drift per week with `getWeekVolumes`, including a week that holds a session the athlete already had. Both readings go through `prescriptionVolumeOf`.
- C10: `generate.server.test.ts:601` compares each copy's blocks with its Stock Workout's, field by field.
- C12: the 390 px no-overflow gate is in `tests/e2e/plan-generate.test.ts:128`. Stacking below 300 px uses `@max-[300px]:grid-cols-1` with subgrid rows. VoiceOver and Larger Text still need a real phone, as the Design says.

## (b) Behaviour not asked for

1. **low** `app/utils/plan-generation/write-sessions.server.ts:58,66`: `readStockWorkouts` now reads only rows with `authorship: 'system'` and warns about any id it drops. This changes **approval and the ADR 0120 re-lay**, not just the preview. No criterion asks for it. The nearest is C11: "Nothing the browser sends back is trusted", but these ids come from the generator, not the browser. It is a reasonable hardening and has a test (`generate.server.test.ts:642`), but it should be named in the PR or split out. To show it: `npx vitest run app/utils/plan-generation/generate.server.test.ts -t "not a Stock Workout"`.
2. **low** `docs/agents/verify/features/season-plan.md:12`: the PR moves the Week Pattern sentence back into place, which is unrelated to #472. Main has already made the same fix (`origin/main` lines 11–14), so this hunk now conflicts. Drop it and take main's version.

## (c) Built, but wrong against main

3. **medium: the ADR number collides.** The PR adds `docs/adr/0121-a-generated-weeks-planned-volume-…md`, but main already has `0121-orphaned-workouts-…` (#677), plus 0122 and 0123. `GLOSSARY.md:2938` ("number (ADR 0121)"), the ADR 0053 status line and about 10 code comments all cite 0121, and main's GLOSSARY:1054 cites 0121 for Orphaned Workouts. After a merge, "ADR 0121" names two decisions. Fix: renumber to 0124 and update every reference. To show it: after merging main, `ls docs/adr | cut -c1-4 | sort | uniq -d` must print nothing, and `git grep -n "ADR 0121"` must show only orphan-purge references.
4. **medium: the branch no longer merges cleanly.** `git merge-tree --write-tree origin/main origin/agent/472-…` reports conflicts in `app/routes/training/plan.generate.$eventId.tsx` and in the verify doc. #720 (ADR 0123) gave `WeekCard` an `openRow` prop and replaced `SessionRow` with `PlanPreviewRow`. This PR gives `WeekCard` a `figures` prop (`:383`, `:405`, `:775`). The conflict is mechanical: `WeekCard` keeps both props. **The approach is still right.** ADR 0123 covers a session row's provenance, and its Decisions say #475 "does not touch the week's numbers". The figures sit in the card header, so nothing in #720 duplicates them. ADR 0120 (re-lay through `readStockWorkouts`) is already merged into the branch and composes with it. ADR 0122 (Season Anchor edits behind the Sesong preview) has no Planned Volume reading of its own. To show it: merge main, then run `npm run typecheck` and the route, generate.server and e2e plan-generate tests.

## Checked and holding
§6 and §8 hold: nothing is rescaled, and the preview writes nothing. `SeasonGenerator` is untouched. The figures are worded by `wordTrackWeek`, not a copy of its rules. No fake `LedgerSession` is built. `volumeSessionOf` delegates to `prescriptionVolumeOf`, and no existing `week-volumes` test changed.
