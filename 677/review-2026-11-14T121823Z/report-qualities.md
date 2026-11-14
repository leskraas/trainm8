# Qualities review: leskraas/trainm8#677 (issue #468), head 1b57467

Read-only review of `git diff origin/main...HEAD` against every quality in
`.claude/skills/factory/references/qualities.md` (Speed, Failure, Access,
Security, Insight, Data). Phase `poc`, but this PR deletes production rows at
boot, so Data and Security are held to the `build` bar.

**Verdict: no critical, high or medium finding.** Two low findings, both on how
a one-shot purge can end without running, and both follow the boot-job pattern
main already has. No route needs to go back to implement for these.

## Findings

### Q1. A rollback in the deploy window can use up the purge's attempts, and boot never enqueues it again (low)

- **Quality:** Data / Failure
- **Where:** `app/utils/orphaned-workout-purge.server.ts:57-62` (any row of the
  kind, in any state, blocks an enqueue) together with
  `app/utils/jobs/queue.server.ts` `processNextJob` (a job with no handler
  throws, and claiming it counts an attempt).
- **Scenario:** deploy N boots and enqueues the purge. The first attempt fails
  for a transient reason and the job goes back to `pending` with backoff, or
  the worker has not claimed it yet. Fly's `auto_rollback = true` then brings
  back release N-1. N-1 has no handler for `orphaned-workout-purge`, so each
  claim fails with "No handler registered" and uses an attempt. After 5 attempts
  (about 30 s of backoff) the row is terminally `failed`. When N (or N+1) ships
  again, `failStaleJobs` only re-arms `running` rows and the `findFirst` marker
  sees the `failed` row, so the purge never runs. The orphaned rows the settings
  copy promises to delete stay stored, and the only trace is `lastError` on the
  row.
- **Copied from main?** Yes. Every `ensure*Enqueued` job has this window. It
  counts here because the purge is the one boot job whose silent no-op breaks a
  promise made to users (ADR 0105 retention). The spec's architecture decides
  "any state means boot does not enqueue another", so changing it is a
  decision, not a fix.
- **Verify at HEAD (failing-test idea):** in
  `orphaned-workout-purge.server.test.ts`, enqueue the purge, then call
  `processNextJob({})` 5 times, resetting `runAt` to `new Date(0)` between
  calls. Expect `status: 'failed'` and `lastError` matching `/handler/`. Then
  call `ensureOrphanedWorkoutPurgeEnqueued()` and run `processNextJob(jobHandlers)`.
  The Orphaned Workouts are still there, and no pending row of the kind exists.
- **Options (decision):** (a) record it as `Debt:` under `poc`. (b) Treat a
  `failed` row that never committed a record (`payload.purged` absent) as not a
  marker, so each boot re-arms it once. This is safe because the purge is
  idempotent.

### Q2. A purge that spends its attempts fails without alerting anyone (low)

- **Quality:** Insight
- **Where:** `app/utils/orphaned-workout-purge.server.ts:86-99` (one
  `console.error` per attempt) and `app/utils/jobs/queue.server.ts` `failJob`
  (it logs nothing when a job goes terminal).
- **What:** a deterministic failure, such as an FK the rules did not foresee or
  the 30 s `ERASURE_TRANSACTION_OPTIONS` timeout on a large orphan set, uses all
  5 attempts in under a minute. The job ends `failed`, and nothing runs it
  again. The trail is five stderr lines carrying the job id and the error class,
  plus `lastError` on the row. Nothing reaches Sentry, although the server
  already wires it (`server/index.ts`, `SENTRY_ENABLED`). Someone has to think
  to grep the logs or query `Job` before they learn the purge did not happen.
- **Copied from main?** The queue's silent terminal failure is main's. The PR
  adds the per-attempt line, which is better than main. Under `poc` this is a
  missing trace, so a debt.
- **Verify at HEAD:** read `orphaned-workout-purge.server.ts:94` (console only)
  and `queue.server.ts` `failJob` (no log and no Sentry call on `failed`). The
  existing test "a purge that fails partway erases nothing and is retried"
  shows that a failure leaves only the console line.
- **Fix if wanted:** report the final failed attempt to Sentry, with counts and
  error class only (`attempts >= maxAttempts` is known in the handler through
  the claimed row). Alternatively, record `Debt:`.

## Checked, no finding

- **Data: corpus safety.** The orphan scope's candidate `where` is
  `{ ownerId: null, authorship: 'athlete' }` in the read, the held read and the
  `deleteMany` (`account-deletion.server.ts:124, 172-188`). The splice selects
  children by `copiedFromId in <erasable ids>`, not by parent owner (`:211`).
  Every production corpus row is `authorship = 'system'`
  (`20260818120000_*`, `20261017185741_*`). The ADR 0113 held-copy migration
  inserts `'athlete'` rows only with `ownerId = o.athleteId`. The 0051 migration
  copied rows when `ownerId` was still NOT NULL. No migration or seeder mints an
  ownerless athlete Workout.
- **Data: cascades.** Every FK into `Workout` was enumerated in
  `prisma/schema.prisma`: CatalogueEntry and Attribution (system-only or
  intended), CatalogueSave and WorkoutReport (intended, per spec), WorkoutBlock
  (own subtree), WorkoutSession, WeekPatternDay (`NoAction`) and
  StrengthProgramDay. The orphan scope's held-elsewhere guard holds all three of
  the last group, so erasing never cascades into another athlete's training and
  never hits the `NoAction` FK.
- **Data: atomicity and idempotency.** There is one `$transaction` with the
  record write inside it. `keepUnattributed` writes are guarded, so a second run
  leaves `updatedAt` untouched. The first committed record is kept on a re-run.
  The `failJob` guard (`updateMany` with `onlyIf`) cannot set a job that
  completed in between back to pending. Tests cover each of these.
- **Data: `deleteAccount` behaviour.** Moving the own-slot delete before
  `erase` does not change what is kept, because the account scope's
  `patternDays` clause excludes own slots. The splice is equivalent to main's:
  children of erased ids are the same set main reached by
  `copiedFrom.ownerId = userId` and then filtered.
- **Data: stale-run takeover.** `PROCESS_STARTED_AT = performance.timeOrigin`
  comes before `startJobWorker` (`server/index.ts:246`), so a claim by this
  process is never taken as stale. The guard relies on one node running the
  worker, which `other/litefs.yml` sets with a static lease and a single
  machine. Scaling out would need a consul lease anyway, and the comment says
  so.
- **Data: production boot.** No migration in this PR. `prisma migrate deploy`
  is unaffected. Nothing seeds (production-seed-data.md holds).
- **Speed.** Boot adds one `Job` read by kind/status/startedAt. The purge is
  1-2 reads plus one write per surviving ancestor (batched, not per child). I
  probed Prisma 6 on SQLite with 40,000-id `in`/`notIn` lists inside a
  transaction: it succeeded, so a large orphan set does not hit the bind-variable
  limit. The interactive transaction holds the SQLite write lock for its
  duration, the same as `deleteAccount` on main. The real orphan set is small.
- **Security.** No input reaches the purge. The payload and the success log
  carry three counts only. The failure log carries job id and error class only
  (test asserts no title, name or id). Prisma's slow-query log prints SQL with
  placeholders, not params. `lastError` can hold a Prisma message with Workout
  ids. The code says so (`:90-93`), and it sits on the row, not in the payload
  or the log the spec governs.
- **Security: lint guard.** `eslint.config.js` (human-edits) is stricter, not
  looser. The route-file `<select>` guard still covers exactly
  `app/routes/**/*.tsx` minus admin/_marketing/_seo, test files included, through
  the third block. `@epic-web/config` sets no `no-restricted-syntax`, so the new
  `app/**` block shadows nothing.
- **Access.** No UI change.
- **Insight: success path.** A count-only `console.info` after commit and a
  durable record on `Job.payload`. `failStaleJobs` logs each row it fails back.

## Checks run at HEAD

- `VITEST_DB_TAG=qreview npx vitest run app/utils/account-deletion.server.test.ts app/utils/orphaned-workout-purge.server.test.ts app/utils/jobs/queue.server.test.ts app/utils/eslint-restrictions.test.ts`:
  4 files, 40 tests passed. Without `VITEST_DB_TAG` the run collided with a
  parallel run's DB files ("table `main.User` does not exist"). That was the
  environment, not the PR.
- `npx eslint eslint.config.js server/index.ts app/utils/account-deletion.server.ts app/utils/orphaned-workout-purge.server.ts app/utils/jobs/queue.server.ts app/utils/jobs/handlers.server.ts app/utils/orphaned-workout-purge.server.test.ts`:
  clean.
- Prisma bind-limit probe (scratch script against a copy of `tests/prisma/base.db`):
  `findMany`/`deleteMany`/`updateMany` with 40k-id lists in one transaction
  returned `ok`.
