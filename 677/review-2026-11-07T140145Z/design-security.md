# PR #677 (issue #468): design and security review

Reviewed cold against the issue spec and `git diff origin/main...origin/agent/468-purge-orphaned-workouts`.
I did not read the PR body or earlier factory comments. Paths below are on the PR branch.

**Verdict: no Block findings.** The erasure module is deep, the seam is in the right place, and the purge cannot reach Stock Workouts, owned rows or rows another athlete's training points at. The lint rule catches the forms the spec named but not several other forms (finding S1). One audit count is misleading (S2).

**Verification run.** I ran the branch from a `git archive` copy in my scratchpad; the clone was not touched.
- `vitest run` on `account-deletion.server.test.ts`, `orphaned-workout-purge.server.test.ts` and `eslint-restrictions.test.ts`: 16/16 pass.
- A separate ESLint API probe of possible bypass forms (results in S1).

## Skills
- `codebase-design`: loaded.
- `security-review`: not loaded. It reviews pending changes on the current branch, and switching the clone's branch is not allowed here. I did the security review by hand.

## 1. Design (codebase-design)

**Depth: good.** `app/utils/account-deletion.server.ts` has two exports:
- `deleteAccount(userId)` at :57
- `eraseOrphanedWorkouts(tx)` at :78

Everything else is private and runs through one `erase(tx, scope)` at :121:
- the candidate `where` (:85)
- the held-elsewhere guard (:97)
- keeping a row unattributed (:152)
- the capped lineage splice (:172)
- the erase itself

Deletion test: removing the module would bring the guard, withdraw and splice logic back in two callers. Its tests drive both entry points from one fixture set (`createErasureWorld`), which is what the spec asked for.

**Seam: right place.** The `ErasureScope` union (:52) stays private. That keeps the "never `ownerId: null` alone" rule internal: the orphan candidate `where` carries `authorship: 'athlete'` (:88), and the erase reuses it (:145-147). The splice finds children by erased ids, not by the parent's owner (:177-179).

The two entry points differ on purpose:
- `deleteAccount` owns its transaction, because it must delete Week Pattern slots before the erase and delete the user after it.
- `eraseOrphanedWorkouts` takes the caller's `tx`, because the purge must write its record in the same transaction.

So the asymmetry has a reason. It is not an accidental leak.

**Boot registration: consistent with the existing one-time jobs.**
- `server/index.ts:327-332` follows the same `ensure*Enqueued` block shape as its neighbours.
- `handlers.server.ts:208-213` follows the same handler shape.
- `ensureOrphanedWorkoutPurgeEnqueued` (`orphaned-workout-purge.server.ts:33-40`) uses the job row as its marker, like `swim-pace-backfill.server.ts:114-120`.

**Design notes (Nit, non-blocking).**
- **D1 (Nit), `orphaned-workout-purge.server.ts:47-50`.** The job finds its own row by `kind` + `status: 'running'`, because `JobHandler` gets only the payload and not the job id. This copies `swim-pace-backfill.server.ts:208`. It is correct while there is one worker and one job of the kind. If a second job of the kind ever exists, though (for example a hand-enqueued rerun), the record lands on whichever row `findFirst` returns. Fix, outside this PR: pass `{ id }` as a second handler argument in `processNextJob`, so a job can address its own row. That would make the queue interface deeper for every one-time job that keeps a record.
- **D2 (Nit), `account-deletion.server.ts:55`.** `ERASURE_TRANSACTION_OPTIONS` is exported only so the purge can match the timeout. Another option is an `eraseOrphanedWorkouts` that opens the transaction and takes a callback for the payload write. I would leave it as is: that shape is less obvious than a shared constant.

## 2. Security (by hand)

### What the purge can reach: verified safe
- **Stock Workouts.** The candidate `where` is `{ ownerId: null, authorship: 'athlete' }` (:88), and the erase repeats it (:146). Every Stock row is `authorship: 'system'`:
  - `catalogue-seed.server.ts:168`
  - `strength-program-seed.server.ts:428`
  - the migration INSERTs in `20260818120000_.../migration.sql:1727-1732`
  - the four-axes migration's comment says all rows that existed before it had an owner.

  So no Stock or system row is a candidate. CatalogueEntry progression links are written only stock-to-stock (`catalogue-seed.server.ts:265-276`), so cascades from erased entries cannot null a stock link.
- **Owned rows.** The `ownerId: null` predicate excludes them. This is covered by the "never reaches the corpus or a Workout somebody owns" test.
- **Rows other athletes' training points at.**
  - Every FK that cascades into a session or a Program day is guarded: `WorkoutSession.workout` (Cascade) and `StrengthProgramDay.workout` (Cascade) are held by `heldElsewhereWhere` (:97-105).
  - `WeekPatternDay.workout` (SetNull) is guarded the same way.
  - Forks are deep copies and are spliced, not deleted.
  - `CatalogueSave` / `WorkoutReport` / `Attribution` / `CatalogueEntry` on erased rows cascade away, which the spec intends.
- **Transactional.** Erase, unattributed keep, splice and the payload write all happen in one `prisma.$transaction` (`orphaned-workout-purge.server.ts:43-59`). A failure rolls everything back and `failJob` retries it (the trigger test at `.test.ts:152` checks this). If a request commits a write between the guard read and the delete, SQLite's single writer turns the lost upgrade into SQLITE_BUSY, which means a rollback and a retry, not a half-applied purge.
- **Request trigger.** None. Only boot enqueues the kind, and no route enqueues a job kind it got from input (I grepped `enqueueJob({ kind: <variable>` and `kind: formData|params|...` under `app/routes`).
- **Logging.** The payload and the log hold only three integers (:56, :60-62). The test asserts that no title, description or name appears.

### S1 (Medium): the lint rule stops only the literal `x.user.delete(...)` form
`eslint.config.js:27-33`, selector `callee.property.name=/^(delete|deleteMany)$/` on `callee.object.property.name='user'`.

I probed it through the ESLint API with the branch's config, on `app/utils/db.server.ts` and `app/routes/settings/profile/index.tsx`:

| Form | Flagged? |
|---|---|
| `prisma.user.delete(...)` | yes |
| `prisma?.user?.delete(...)` | yes |
| `prisma['user'].delete(...)` | **no** |
| `prisma.user['delete'](...)` | **no** |
| `const u = prisma.user; u.delete(...)` | **no** |
| `const { user } = prisma; user.deleteMany(...)` | **no** |
| `prisma.user.delete.bind(prisma.user)` | **no** |
| `prisma.$executeRaw\`DELETE FROM "User" ...\`` | **no** |
| `prisma.$executeRawUnsafe('DELETE FROM "User" ...')` | **no** |

**Failing scenario.** A future admin "remove spam account" action writes `await prisma.$executeRaw\`DELETE FROM "User" WHERE id = ${id}\``, or destructures `const { user } = tx`. Lint passes. `Workout.ownerId` SetNulls, and new Orphaned Workouts appear. No sweep exists to catch them; this PR relies on lint for that by design.

AC 10's literal wording ("calls user.delete or user.deleteMany on a Prisma client") is met for the forms named in the spec's probe. The guarantee the ADR claims ("lint pins the one deletion path") is broader than what the rule enforces.

**Fix**, any of these, cheapest first:
1. Add a computed-member variant: `callee.property.value=/^(delete|deleteMany)$/` and/or `callee.object.property.value='user'`.
2. Add a raw-SQL restriction:
   - `TaggedTemplateExpression[tag.property.name=/^\$(executeRaw|queryRaw)$/] TemplateElement[value.raw=/DELETE\s+FROM\s+"?User"?(\s|$)/i]`
   - a `Literal[value=/DELETE\s+FROM\s+"?User"?(\s|$)/i]` selector for the `*Unsafe` forms.
3. Restrict `MemberExpression[property.name='user'][object.name=/^(prisma|tx)$/]` outside a call. This is noisier.
4. At minimum, add a sentence to ADR 0112 §4 saying aliases, computed access and raw SQL are not caught, and add these cases to `eslint-restrictions.test.ts` as known gaps.

### S2 (Low): `withdrawn` counts rows that were already unattributed, and a rerun rewrites them
`account-deletion.server.ts:141, 148, 152-163`.

Rows that `deleteAccount` kept after #641 are themselves `ownerId: null, authorship: 'athlete'`, so the orphan scope picks them up again. `keepUnattributed` then re-runs `workout.updateMany({ visibility: 'private' })`. That bumps `updatedAt` (`@updatedAt`, schema `Workout.updatedAt`), and the row is counted in `withdrawn` again.

The branch's own test pins this: `account-deletion.server.test.ts:514` expects `{ erased: 0, withdrawn: 2, spliced: 0 }` on a second run. Its `snapshotWorkouts` (:443-455) leaves out `updatedAt`, so "changes nothing" holds only for the fields it compares.

**Failing scenario.** The first production purge logs "kept unattributed N" after some post-#641 deletions. An operator reads N as orphans the purge withdrew now, but some or all were already private and without an Attribution. The audit overstates what the purge did, and AC 6 ("running it again changes nothing") is not true for `updatedAt`.

**Fix.** In `keepUnattributed`, filter to rows that still need it:
- `workout.updateMany({ where: { id: { in: ids }, visibility: { not: 'private' } } })`
- the existing `retiredAt: null` guard on entries
- `withdrawn` as the number of rows actually changed (Workouts made private, or Attributions deleted), not `kept.size`.

Add `updatedAt` to the second-run snapshot. If changing the meaning of `withdrawn` would break `deleteAccount` callers, rename it in the purge's payload instead (for example `keptUnattributed` versus `newlyUnattributed`).

### S3 (Low): the lint ignore globs are broader than the test fixtures they mean
`eslint.config.js:46-47`, `'**/fixtures/**'` and `'**/*-fixtures.ts'`.

Any production module whose name ends in `-fixtures.ts`, or that sits in a `fixtures/` folder, escapes the rule. `app/utils/load/elevate-fixtures.ts` already matches this glob as a non-test file; it does not delete users today.

**Failing scenario.** A dev-only seeding helper `app/utils/demo-fixtures.ts` that resets demo accounts with `prisma.user.deleteMany` ships to production unflagged.

**Fix.** Narrow the globs to the real fixture locations (for example `tests/**` is already outside `app/`/`server/`). Or require `*.fixtures.test.ts` / a `__fixtures__/` folder.

### S4 (Low / operational): if the purge dead-letters, nothing reports it
`orphaned-workout-purge.server.ts:33-40` and the queue's `maxAttempts` of 5.

The marker is "any job of this kind, in any state". If the single 30 s transaction times out on all five attempts (a large orphan set, or SQLite write contention at boot), the job ends `failed`, no later boot enqueues it, and the orphans stay stored. The only trace is `Job.lastError`.

This follows the spec, which says the read-only SQL count stays as the owner's check. But no alert or log line says the purge never completed.

**Fix.** Either of:
- `console.error` with the count of remaining orphans when the job dead-letters (counts only);
- a note in ADR 0112 that the owner checks `Job` where `kind = 'orphaned-workout-purge'` has `status = 'completed'` together with the SQL count.

### Not findings
- Nested-relation deletes (`data: { user: { delete: true } }`) are not reachable: every relation to `User` that points from a child is required, and Prisma allows a nested `delete` only on optional to-one relations.
- `server/**/*.ts` matches every file under `server/`, because there are no `.js` files there.
