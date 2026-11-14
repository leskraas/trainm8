# Standards review: leskraas/trainm8#677 (closes #468)

Head `1b57467`, diff `git diff origin/main...HEAD` (merge-base `b4b32f5`). Phase `poc`, autonomy `full`.
Verdict: PASS with debts. 0 critical/high, 1 medium, 5 low, 4 low smells.

## Findings

1. **MEDIUM, hard: the user-delete guard uses the pattern ADR 0119 rules out, and ADR 0121 doesn't flag the conflict.**
   - `eslint.config.js:40-110`: three `no-restricted-syntax` blocks (`USER_DELETE_FILES`, a route block listing both restrictions, a route-test block built with `glob.replace`). Rationale: `docs/adr/0121-…-one-path.md:69-71`.
   - ADR 0119 §2: sharing the rule "would need one block per overlap… a missed block silently drops a guard", naming the user-delete guard's scope. ADR 0119 Consequences line 66: "A future guard with its own scope gets its own rule name in the same way." Its Considered options reject composed `no-restricted-syntax` entries. `domain.md` "Flag ADR conflicts".
   - The user-delete guard has its own scope and already needs an extra block per overlap (the route-test block exists only to keep `<select>`). ADR 0121 rejects a local rule as "a plugin to maintain for one selector", but the `trainm8` plugin already exists (`eslint-rules/luma-steps.js`) and the restriction is four selectors. ADR 0121 never cites 0119.
   - Verify: `grep -n "future guard" docs/adr/0119-*.md`; `grep -n "0119\|one selector" docs/adr/0121-*.md` (only line 70); `sed -n 80,110p eslint.config.js`.
   - Fix: move the guard to a `trainm8/user-delete` local rule (new file merges freely; `eslint.config.js` still needs a human), or amend ADR 0121 to supersede ADR 0119's consequence. Under `poc` it can be a `Debt:` line.

2. **LOW, hard:** `failStaleJobs` (`app/utils/jobs/queue.server.ts:238`) says "Returns how many it failed" but `:274` returns `stale.length`, counting rows the guarded `failJob` left alone (returned `null`). The only caller ignores it. Verify: complete the row between `findMany` and `failJob`; it returns 1. Fix: count non-null, or return void.

3. **LOW, judgement:** two ways for a handler to find its job row. `JobContext` doc (`queue.server.ts:137-141`) says a handler never has to find its row by kind and status; `app/utils/load/swim-pace-backfill.server.ts:200-203` still does `findFirst({ kind, status: 'running' })`. Standard: `docs/guiding-principles.md` "Only one way".

4. **LOW, judgement:** the generic queue contract changed (`JobHandler(payload, job)` at `queue.server.ts:144-151`; `failStaleJobs` running→pending/failed transition at `:233-275`; `failJob` `onlyIf` at `:198-205`) and ADR 0013 ("status moves pending → running → completed | failed"; "an opaque JSON payload carries its arguments") doesn't record it. Fix: note in ADR 0013 or name it in ADR 0121's Decision.

5. **LOW, hard but trivial:** bare "orphan" in `docs/adr/0121-…:65` ("A daily orphan sweep"); GLOSSARY Orphaned Workout: "_Avoid_: bare 'orphan'".

6. **LOW, judgement:** `GLOSSARY.md:1047-1056` Account Erasure is six sentences and defines what it does; `GLOSSARY-FORMAT.md` says one or two sentences, define what it IS. Local practice often runs long.

## Baseline smells (judgement, low)
- Speculative Generality: `runOrphanedWorkoutPurge` returns `AccountErasure` (`orphaned-workout-purge.server.ts:72-105`), discarded by its only caller (`handlers.server.ts:208-212`); `failStaleJobs`'s return unused.
- Mysterious Name: `scopeQueries` (`account-deletion.server.ts:118`) returns where-filters; `rows` (`:156`) — suggest `scopeFilters`, `candidateRows`.
- Duplicated Code: `app/utils/eslint-restrictions.test.ts:11-51` repeats `luma-steps-lint.test.ts`'s ESLint setup.
- Shotgun Surgery (minor): `JobHandler` signature forced dummy `{ id: 'job' }` args in `app/integrations/intervalsicu/backfill.server.test.ts:108`, `app/utils/credential-backfill.server.test.ts:115`.

## Checked, no finding
- Native-`<select>` guard not loosened (only tightened); `eslint.config.js` is in `human-edits`, so leskraas approves before merge.
- ADR references resolve; glossary terms used; only Account Erasure deletes a `User` outside tests (`account-deletion.server.ts:87`); no new deps, guard-path edits or seed data; ADR 0121 follows ADR-FORMAT and numbering.

## Rules this review wanted and could not find
- How a one-time boot job recovers a row stranded in `running`: only the purge gets `failStaleJobs`; ten other `ensure*Enqueued` jobs in `server/index.ts` can strand the same way.
- A log-prefix convention (`[jobs]`, `[orphaned-workout-purge]`, `swim pace backfill:` mixed).
