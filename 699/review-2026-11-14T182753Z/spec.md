# Spec review: leskraas/trainm8#699 (closes #587), head efb344f

Reviewed cold against issue #587 (body, acceptance criteria, Scope, Design,
Architecture, ## Decisions), ADR 0109 (Accepted) and the GLOSSARY entries the
diff touches (Retired track, Season Anchor, Pinned day, Week Volume Override,
Strength Frequency). Diff: `git diff origin/main...HEAD` (44 files, 37 commits).

Verdict: **every acceptance criterion is implemented, and the tests the spec
names are present.** I found no critical or high issues. What is left is one
medium edge in the strength pre-fill and a handful of low items.

Tests run locally (worktree, `npx vitest --run`): the pure suites pass
(activities-edit.test.ts, stamp.test.ts, from-rows.test.ts,
season-anchors.test.ts, philosophy.test.ts, start-draft.test.ts: 133 tests).
I could not run the DB suites (activities-edit.server.test.ts,
level.route.test.ts) here because the Prisma client generated in the shared
node_modules is out of date (`prisma.generationRecord` is undefined). I did not
regenerate it, because that would change the main checkout. CI on efb344f
shows Vitest 2/3 and 3/3, Lint & TypeScript, and Playwright passing; Vitest 1/3
was still running when I checked.

## Criterion-by-criterion

| # | Criterion (short) | Status | Where |
|---|---|---|---|
| 1 | Editable plan: start's chips, Simple Activities, Styrke + Strength Frequency, pre-filled, no retired track | Implemented. See (c1) for a pre-fill edge | `app/routes/settings/__activities-edit.tsx:150-192`, `__activities-edit.server.ts:110-127`, `plan-start-options.server.ts:131-133` |
| 2 | Event / km-TSS / lifting-only → read-only with why + Plan link; no plan → no editor | Implemented (also a 4th reason, see b3) | `__activities-edit.server.ts:85-109`, `__activities-edit.tsx:48-77` |
| 3 | Vis ny uke: writes nothing; boundary Monday; kept sessions on actual days marked Din; start's notes; start's session cap | Implemented | `activities-edit.server.ts:406-414`, `activities-edit.ts:620-680, 780-805`, `__start-option-card.tsx` (KeptBadge), `__activities-edit.server.ts:175-193` |
| 4 | Kept count (+ on removed sport), Pinned days, cleared overrides, later Season Anchors (not the boundary one); nothing when empty | Implemented | `activities-edit.ts:563-595`, `__activities-edit.server.ts:215-238`, `__activities-edit.tsx:267-280` |
| 5 | Same / none → writes nothing, says so beside editor | Implemented (role=status under the button) | `activities-edit.ts:111-126`, `__activities-edit.tsx:206-212` |
| 6 | made = shown; family and hours kept; no family → top option, named | Implemented | `activities-edit.server.ts:344-349, 442-482, 715-721`; `labels/first-run.ts` `familyNone` |
| 7 | Nothing before the boundary changes | Implemented (cutPhasesAt, overrides/anchors `>= boundary`, strength deload tail kept) | `activities-edit.ts:304-309, 369-385, 437-446, 478-480` |
| 8 | Authored/adopted stay, also on a removed sport; only app-laid replaced | Implemented (gated `clearPlanWeek` via stamp and `relayPlanFrom`) | `activities-edit.server.ts:442-488` |
| 9 | Removed sport / all Simple Activities: lays nothing, leaves Meg's list; take up again; added sport adds nothing to lived weeks | Implemented (retire at 0, reuse by Discipline, add with 0 from plan start) | `activities-edit.ts:323-358, 500-533`, `plan-start-options.ts` (retired skipped, `activitiesRetired`) |
| 10 | Add strength: lifts at the frequency, away from hard days; remove: no lifts, Strength Frequency cleared | Implemented. See (c2) for an edge | `activities-edit.ts:343-393`, `activities-edit.server.ts:698-713, 725-730` |
| 11 | Boundary week changed → Bekreft writes nothing, shows new preview + one line | Implemented (digest covers laid week, kept id/weekday/Discipline, overrides, anchors with value) | `activities-edit.ts:831-857`, `activities-edit.server.ts:431-439`, `__activities-edit.server.ts:355-366`, `__activities-edit.tsx:129-140, 289-299` |
| 12 | 390 × 844: no h-scroll, keyboard + visible focus, ≥ 44 px, every word in labels.ts | Implemented; the e2e checks scroll, 44 px on 3 controls and focus moves. Keyboard operation is not exercised (b/low test gap) | `tests/e2e/meg-activities-edit.test.ts`, `labels/first-run.ts` `ACTIVITIES_EDIT_LABELS` |

Architecture extractions §7 (layStartFamily, cutPhasesAt + SegmentsFor,
stampWeekInput/fillKeptSlots/readKeptSlots(db)/readHeldSessions(db),
draftFirstRunPlan.stampInput, readPlanStartAnswers, trackRetiredAt) are all
present. The retirement refusal is in `editAnchorList`
(`season-anchors.ts:85, 100-103`) and in `setSeasonAnchorValue`
(`authoring.server.ts:1054-1057`), and `seasonAnchorChoices` skips retired
tracks (`season-edit.ts:610-612`). The refusal words are in labels. Each of
these matches the Decisions entry "Where the retirement refusal lives after
main's ADR 0122".

Required tests (Architecture → Tests) are present: the pure splice, retired
track and fillKeptSlots tests; the DB made = shown test with an adopted lift
and an authored hard session; DB tests for preview-stale after a move, lived
weeks' targets, and Bytt treningsform not laying a removed sport; and the e2e
at 390 × 844.

## (a) Missing or partial

None found against the 12 criteria and the Design list.

- **low (test gap): keyboard operability is not exercised.** Criterion 12:
  "every control is reachable and operable by keyboard with a visible focus".
  The e2e (`tests/e2e/meg-activities-edit.test.ts:66-108`) only clicks. The
  controls are native buttons or Radix toggles, so they work in practice, but
  no test tabs through chips, Bytt, StrengthField, Vis ny uke and Bekreft.
  44 px is checked only on swim, Vis ny uke and Bekreft, not on the Bytt line
  or the StrengthField taps. To show it: add
  `await page.keyboard.press('Tab')` steps, plus `boundingBox()` checks on the
  Bytt line and the StrengthField.

## (b) Not asked for (scope creep)

1. **low: `closePendingRounds` declines a pending "next round" proposal
   silently.** `app/utils/first-run/activities-edit.server.ts:731-732`. Neither
   the criteria nor ADR 0109 asks for it. The preview does not say it (the
   Decision "What the preview says beyond the week" reads "everything it
   changes is said before Bekreft"), and the digest does not cover it. It
   copies the philosophy switch and is defensible, since the round restarts
   (ADR 0109 §2). Either name it in the preview or record it in ADR 0109.
2. **low: the main sport for every `readPlanStartAnswers` caller is now "the
   track with the most hard sessions in the boundary phase".**
   `plan-start-options.server.ts:189-204` (the sort passed to
   `planStartAnswers`). This also changes _Bytt treningsform_'s answers.
   Architecture §7.5 says "existing callers behave the same". Plans the start
   made should be unchanged, but a hand-authored plan's main sport can now
   differ from its written order. The change is needed so that Meg's pre-fill
   reflects a main sport swapped by an earlier edit. I note it, but do not ask
   for it to be undone.
3. **low: a fourth read-only reason, `no-days`, with its own sentence.**
   `__activities-edit.server.ts:103-107`, `labels/first-run.ts`
   `readOnly.noDays`. Criterion 2 names three reasons (Event, km/TSS, lifting
   only). This is a sensible fallback for a plan with no trainable days, but
   no criterion or Decision covers it.
4. **low: unrelated GLOSSARY reflow.** The **Plan Generation** paragraph is
   re-wrapped with no change in content (`GLOSSARY.md:2409-2411`). It is noise
   in a domain-doc diff.
5. **low: the digest covers sessions in later weeks too.**
   `activities-edit.ts:856` (`keptFromBoundary` in the digest). A session
   added in, say, week +3 after the preview makes Bekreft `preview-stale`.
   The stale line then says "Uka endret seg etter at du så den" ("The week
   changed after you saw it"), although the boundary week did not change.
   Criterion 11 only names the boundary week and "the plan changed
   elsewhere". This is conservative, not unsafe, but the words can mislead.

## (c) Implemented, but the implementation looks wrong

1. **medium: the strength pre-fill can show Styrke off while the plan lifts,
   and the next edit then retires strength.**
   Spec: criterion 1, "pre-filled with the plan's current activities"; Design,
   "the start's chips … pressed with the plan's current activities".
   `app/utils/first-run/plan-start-options.server.ts:244-251`: `perWeek` is
   `strengthChoice(profile.strengthPerWeek ?? block?.sessionsPerWeek ?? null)`,
   which is null whenever the athlete never answered a Strength Frequency and
   the strength track's block lifts outside 1/2/3 (for example 4×), or the
   track has no dated block. The track is live, but Meg pre-fills Styrke
   unpressed (`__activities-edit.server.ts:113`). Any other edit (for example
   adding Svømming) then sends `choice.strength = null`, so
   `spliceActivitiesEdit` retires the strength track
   (`activities-edit.ts:346, 356-357`) and the apply writes
   `strengthPerWeek: null` (`activities-edit.server.ts:725-730`). The athlete
   loses their lifts without ever pressing Styrke off, and the preview has no
   line saying strength is removed. This only affects hand-authored or older
   hours plans (the start always stores the answer). To show it: a DB test
   with a plan that has a strength track whose block has `sessionsPerWeek: 4`
   and `athleteProfile.strengthPerWeek = null`, then
   `readPlanStartAnswers(...).lifting.perWeek` returns null, and
   `applyActivitiesEdit` with `{sports: [...current, 'swim'], strength: null}`
   leaves the strength track anchored at 0 from the boundary.
   A fix could pre-fill Styrke on with the nearest choice (clamped to 1-3)
   whenever a live strength track exists, or name a retired strength track in
   the preview.

2. **low: strength is retired without being offered when there is no lifting
   session to copy.**
   Spec: criterion 10, "removing it lays no lifts from the boundary and
   clears the athlete's Strength Frequency"; the Decision "Removing strength
   … clears the athlete's Strength Frequency answer". When
   `readStartStrength` returns null (no recent lifting workout and no stock
   `strength-S1`), `reading.lifting` is null and the editor hides Styrke
   (`__activities-edit.tsx:161, 173`). Any edit then retires a live strength
   track anyway (`activities-edit.ts:346, 356-357`, because `strength` is
   null when `reading.lifting` is null, `activities-edit.server.ts:378-384`)
   but keeps the Strength Frequency (`activities-edit.server.ts:725`). So the
   track goes without being removed, and the answer stays. This should be
   rare in production, where the stock strength workout ships in a
   migration. Safer would be to leave the strength track untouched when
   Styrke was not offered.

3. **low: skipped or missed plan sessions in the boundary week show as
   _Din_ and add to "av dine".**
   Spec: criterion 3, "the athlete's kept sessions on their actual days
   marked as theirs". `readKeptSessions`
   (`activities-edit.server.ts:231-241`) includes
   `{ planOutlineId, ...KEPT_PLAN_SESSION }` with no status filter, so a
   skipped or missed machine session counts as kept. It gets the Din badge,
   and its minutes go into `keptMinutes` and the split total
   ("… + 45 min av dine"). `readKeptAhead` filters to scheduled/completed
   (commit 541d180), so the badge and the count disagree. Made = shown still
   holds (the stamp keeps the slot too), so this is about the words only. The
   case is reachable when the boundary is this week, for example a session
   marked skipped on the Monday. Sessions laid by another plan
   (`planOutlineId: { not: outlineId }`) are also badged Din, while the
   `yoursNote` says Din means "lagt inn selv eller hentet fra Bibliotek"
   (entered yourself or taken from the Library), which they are not.

4. **low: an answered strength the Nybegynner cap lays no lifts for is
   stored but not shown again.**
   Spec: criterion 10, "Adding strength lays lifts from the boundary at the
   chosen frequency". When `option.strengthDays` is empty (capped), no
   strength track is made (`activities-edit.ts:346`), yet
   `strengthPerWeek = choice.strength` is written
   (`activities-edit.server.ts:728`). On the next load, Meg pre-fills Styrke
   off (no live strength track, `plan-start-options.server.ts:247`), so the
   stored answer and Meg disagree. The preview's capped note does say it, so
   this is minor.

## Notes (not findings)

- `applyActivitiesEdit` accepts an omitted digest
  (`activities-edit.server.ts:421-436`), but the only route caller refuses a
  confirm with no digest (`__activities-edit.server.ts:328-330`, with a test).
  That is fine as built.
- Retired tracks only get retirement anchors (0); a Week Volume Override set
  later in the Sesong edit could still give a retired track hours with no
  days. The spec does not ask for that refusal (only anchors), so this is not
  flagged.
