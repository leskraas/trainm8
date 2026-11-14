# Qualities review: leskraas/trainm8#699 (closes #587), head efb344f

Read cold: the issue body via `conductor.py fetch … --for review` plus `git diff origin/main...HEAD`. I did not read the PR body or the earlier run comments. I judged the diff against every quality in `.claude/skills/factory/references/qualities.md` (Speed, Failure, Access, Security, Insight, Data). There is no `## Budgets` section in `docs/agents/verify/README.md`, so no budget applies. The diff has no Prisma migration.

Paths are relative to the branch root.

## Findings (most severe first)

### 1. Data — HIGH — the edit's lifting days use a session's own Workout (or the Stock Workout itself), not a Held Workout
- `app/utils/first-run/activities-edit.server.ts:698-712`: `workoutId = await readLiftingWorkoutId(tx, userId, now)` goes straight onto the new `kind: 'lifting'` `WeekPatternDay`. `readLiftingWorkoutId` (`start-strength.server.ts:38-60`) returns the `workoutId` of the athlete's most recent **completed strength session**, which is that session's own row. With no such session it returns the Stock Workout's id.
- The schema (`prisma/schema.prisma:1773-1780`) says a lifting day's workout is "Always a **Held Workout** of this day's plan (ADR 0113), never a session's own row". It uses `onDelete: NoAction` so that "a direct delete of a Workout a day still uses fails loudly". Every other writer wraps this call: `authoring.server.ts:2937,2957` use `holdOrThrow(await readLiftingWorkoutId(tx, userId))`, and `plan.server.ts:393` / `lifting-days.server.ts` use `heldWorkouts(...).hold(...)`.
- What breaks: after an edit that keeps or adds strength, `deleteWorkoutSession` (`app/utils/workout.server.ts:455-466`) on that completed lift deletes its Workout, and the delete fails on the FK. The athlete can no longer delete their own past session, and a re-import that replaces a detected session's Workout (`workout.server.ts:1670`) fails the same way. Editing that past session's Workout also changes every future lift the plan lays (ADR 0113 §3).
- How to show it: a DB test. Give the athlete a completed strength session, then `applyActivitiesEdit(userId, { …, strength: 2 })`. Then
  `expect(await prisma.workout.findUnique({ where: { id: liftDay.workoutId } })).toMatchObject({ heldByOutlineId: outlineId })`
  fails. `await deleteWorkoutSession(userId, completedLiftId)` rejects with a foreign-key error (P2003). With no completed lift, the same assertion fails on the Stock Workout's id.

### 2. Data — MEDIUM — the edit's Simple Activity Workouts are not held by the plan
- `app/utils/first-run/activities-edit.server.ts:669-677`: `createSimpleActivityWorkout(tx, userId, {...})` is called without `{ heldByOutlineId: outlineId }`. The start passes it for the same rows (`app/utils/first-run/plan.server.ts:245-255`, "The plan's own, held for its fixed days (ADR 0113)").
- What breaks: every confirm writes a new Workout for each Simple Activity, owned by the athlete and not held. Those rows:
  - pass the `notHeld` filter, so they appear in the athlete's own Workouts list (`community.server.ts:442`) and can be published (`community.server.ts:164` refuses only held rows);
  - are not deleted when the plan is deleted (only held rows cascade);
  - pile up, one more set per edit.
  The fixed pattern day also points at a non-held row, which breaks the same ADR 0113 §3 rule as finding 1.
- How to show it: after `applyActivitiesEdit(userId, SWIM_AND_YOGA, NOW)`, read the boundary pattern's `fixed` day on `other`, then `expect(workout.heldByOutlineId).toBe(outlineId)`. Today it is `null`. Or list the athlete's own Workouts with `notHeld` before and after two confirms: each confirm adds rows.

### 3. Failure — MEDIUM — the athlete is told "done" when the re-lay after commit failed
- `app/utils/first-run/activities-edit.server.ts:444-489`: after the transaction commits, the boundary-week stamp and `relayPlanFrom` run in a `try` whose `catch` only logs. The function still returns `ok: true`. `app/routes/settings/__activities-edit.server.ts:347-353` then answers `done`: "Aktivitetene er endret. Planen er lagt på nytt fra …".
- When the stamp is refused, the boundary week is cleared (`:459-475`), so the week the preview showed is not laid. Nothing tells the athlete, and nothing retries. Made = shown fails silently. The same pattern is in `philosophy.server.ts`, but this edit rewrites the tracks, the pattern and the overrides, so the gap between the stored rows and the laid sessions is wider.
- How to show it: mock `relayPlanFrom`, or `stampWeekPattern`, to throw or return `{ ok: false }`, and call `activitiesAction(userId, confirmForm)`. It returns `{ kind: 'done' }`, and the boundary week has no laid sessions.

### 4. Insight — LOW/MEDIUM — the post-commit failure logs don't say for whom, and never reach Sentry
- `activities-edit.server.ts:462-465` and `:484-487` call `console.error('[activities] …', reason|error)` with no `userId` or `outlineId`. The error is caught, so `entry.server.tsx`'s `Sentry.captureException` never sees it. Other server paths report caught errors (`app/actions/run.server.ts:84`).
- How to show it: force the relay to throw (as in finding 3) and read the server log. The line names neither the athlete nor the plan, and no Sentry event is sent.

### 5. Failure — LOW — a thrown confirm takes the whole page to the root error boundary; the write transaction has no timeout set
- `app/routes/settings/level.tsx:91-95` / `__activities-edit.server.ts:344` don't catch errors from `applyActivitiesEdit`, and `level.tsx` exports no `ErrorBoundary`. A Prisma error therefore replaces Meg with the root `GeneralErrorBoundary`. Possible errors include an FK error (see finding 1), SQLite `SQLITE_BUSY` when a deferred transaction upgrades to a write after a concurrent write, or P2028.
- The transaction at `activities-edit.server.ts:431-439` uses Prisma's default 5 s interactive timeout. It runs the full compute (outline with every relation, sessions with blocks, steps and sets) plus dozens of sequential `create`s (`:513-713`), on SQLite with `connection_limit=1`. No option is passed (compare `ERASURE_TRANSACTION_OPTIONS`).
- How to show it: make the transaction throw, for example by stubbing `tx.weekPatternDay.create` to reject, then post `confirm-activities`. The fetcher's error renders the root boundary instead of a line beside the editor.

### 6. Data — LOW — the plan's old held rows are not swept when its pattern days are replaced
- `activities-edit.server.ts:661` deletes every day of the first pattern, but the write never calls `heldWorkouts(tx, …).sweep()`. The plan's previous held Simple Activity and lifting copies stay with no day using them. ADR 0113 §4 asks that "every write that can leave a held row unused ends with `sweep`", and `authoring.server.ts:954,3041,3133,3204` and `lifting-days.server.ts:573` all do. These rows are hidden (held) and cascade with the plan, so nothing user-visible breaks, but they pile up.
- How to show it: count `workout` rows with `heldByOutlineId = outlineId` that no `weekPatternDay` references, before and after `applyActivitiesEdit`. The count grows.

### 7. Speed — LOW — every _Vis ny uke_ (which writes nothing) re-runs the page's loaders, and the edit reads twice
- The preview is a fetcher POST, so React Router revalidates the route's loaders afterwards. `level.tsx`'s loader (`:71-86`) then runs `getActiveSeason` → `readFirstUnbegunWeekKey` → `readPlanStartAnswers` again, in series, on every preview. That is two data requests per press where one would do.
- Inside one request, `readFirstUnbegunWeekKey` runs in `readEditContext` (`activities-edit.server.ts:136`) and again in `computeActivitiesEdit` (`:330`). A stale confirm computes the whole edit three times: once for the context, once in the transaction, and once in `readActivitiesEdit` (`__activities-edit.server.ts:356`).
- `writeActivitiesEdit` writes row by row: phases, anchors, segments, and one `weekPatternDay.create` per day and per lift (`:571-712`). The rows without a nested `mix` could go in one `createMany`. The counts are small, so this is not a gate.
- How to show it: open DevTools on `/settings/level`, press _Vis ny uke_ and count requests (the action POST plus the revalidation `.data` GET). A `shouldRevalidate` that skips `intent=preview-activities` brings it to one.

### 8. Data/concurrency — LOW — the digest doesn't cover the Training Level or the answers the week is laid from
- `activities-edit.ts:831-859`: the digest covers the boundary, the family, the choice, the splice, the laid week and the kept sessions. It does not cover `answers.level`, the hours or the days. The Training Level form sits on the same page, so the athlete can preview, change the level, and press _Bekreft_. The Nybegynner cap note was shown under the old level, and the pattern is drawn from the new one. Any time those differ in a way the boundary week's `laid` tuple doesn't show (for example days taken by a kept session), the confirm goes through as not stale.
- How to show it: a DB test. Preview at `recreational`, set `athleteProfile.trainingLevel = 'beginner'`, then `applyActivitiesEdit(…, { digest })`. Assert `preview-stale`, or compare the stored `weekPatternDay`s with `preview.start.options[0].draft.stampInput.days`.

### 9. Access — LOW — focus is lost on a refusal, and the stale line is announced twice
- When a confirm comes back `refused` (`outline-not-found`, `not-editable`, `nothing-to-lay`, or `same` after a change elsewhere), the preview unmounts (`__activities-edit.tsx:112-116,215`). _Bekreft_ held focus, so focus drops to `<body>`. While a submission runs, both buttons are `disabled={busy}` (`:202,351`), so a refusal to _Vis ny uke_ (same/none/lifting-only) can also leave focus on `body` in browsers that apply the focus fixup. The `role=status` line is announced, but a keyboard user starts again from the top of the page.
- The stale line is `role="alert"` and is also focused (`:289-298`), so screen readers can read it twice.
- The preview `<section tabIndex={-1}>` takes focus with `outline-none` and no focus style (`:283-286`). It is not a tab stop, so this is a note, not a Block.
- How to show it: in a keyboard-only walk, preview a change, make the plan not editable in another tab (attach an Event), then press _Bekreft_ with Enter and check `document.activeElement`. It is `body`.

### 10. Tests — LOW — the Quality measures in the criteria aren't measured
- `tests/e2e/meg-activities-edit.test.ts` checks scroll width and the height of three controls. It does no keyboard-only walk and no visible-focus check, although criterion 12 asks that every control is "operable by keyboard with a visible focus". The repo has no axe. No test checks the held-workout rule (findings 1, 2 and 6). The server tests' fixture has no completed strength session, so the session's-own-row path in finding 1 never runs.
- How to show it: `grep -n "keyboard\|Tab\|focus" tests/e2e/meg-activities-edit.test.ts` finds only two `toBeFocused` checks after clicks. `grep -n heldByOutlineId app/utils/first-run/activities-edit*.test.ts` finds nothing.

## Checked, no finding
- **Security:** both intents go through `requireUserId` (`level.tsx:89`), and every read and write is scoped to that user.
  - `planOutline.findFirst({ id, athleteId: userId })` (`activities-edit.server.ts:324-327`); session reads are scoped by `userId`; the phase delete is scoped by `outlineId`; the strength segment delete by `track: { outlineId }`; the resize and cut updates use ids read from the user's own outline inside the same transaction.
  - The client posts only enum-checked sports, activities and strength values plus a digest. The digest is only compared, never trusted: the server recomputes everything.
  - A confirm without a digest is refused (`__activities-edit.server.ts:328-330`).
  - Nothing secret reaches the client. The labels render as React text, with no `dangerouslySetInnerHTML`.
- **Concurrency:** the preview and the apply share one computation, and the apply recomputes inside its transaction and compares digests. Two tabs confirming: the second goes stale because the tracks changed. Bekreft is disabled while busy.
- **Lived weeks:** the writes are `>= boundary` (overrides, anchors), and the phase in force is cut, not rewritten. The DB tests cover this.
- **Access (otherwise):** the chips are a `ToggleGroup` with `aria-pressed` inside a `fieldset` with an sr-only legend. The _Din_ badge reads "din økt". The note is a persistent `role=status`. Focus goes to the preview, the stale line and the done line as the design asks. The e2e shows 44 px controls and no horizontal scroll at 390 px.
- **Data (migrations):** the diff has none.
