# Spec review: PR #677 (closes #468), head 1b57467

Read-only review of `git diff origin/main...HEAD` (merge-base b4b32f5) against issue #468: its 11 acceptance criteria, the Architecture section and the `## Decisions`. Phase `poc`, autonomy `full`. This is a production one-way door (it erases stored rows), so `build`'s bar applies.

## Verdict: PASS (no critical, high or medium findings)

Every acceptance criterion is implemented, and a test or a check shows each one at HEAD. The three findings are low. None changes the route.

## Checks run at HEAD

- `npx vitest run app/utils/account-deletion.server.test.ts app/utils/orphaned-workout-purge.server.test.ts app/utils/eslint-restrictions.test.ts app/utils/jobs/queue.server.test.ts`: **40/40 passed**, three runs in a row. Two earlier runs failed (an FK violation in `createErasureWorld`, and 4 failures in `account-deletion.server.test.ts`). Both ran while 7 other `vitest` processes were using the same worktree, which share the per-pool `tests/prisma/data.<pool>.db` files. With no other run going, the suite passed every time. Read this as interference between runs, not a PR defect. Recheck it if CI shows the same flake.
- `NODE_OPTIONS=--max-old-space-size=6144 npx eslint app server`: **0 errors**, 5 warnings, all pre-existing and unrelated. `npm run lint` (`eslint .`) ran out of heap in this sandbox at the default heap size. That is an environment limit, not the PR.
- Setup I added to the worktree (both gitignored, nothing committed): a `node_modules` symlink to `/home/user/trainm8/node_modules` (same lockfile) and the local env file copied from the repo's example env file, which the test setup needs for `SESSION_SECRET`.

## Criterion by criterion

| AC | Status | Where |
|---|---|---|
| 1 Purged after deploy with no operator; erase unless a session, slot or Program day holds it | Met | `server/index.ts:327-332` enqueues at boot, after `startJobWorker` (l.246). Handler registered at `app/utils/jobs/handlers.server.ts:208`. Candidates `{ ownerId: null, authorship: 'athlete' }` and held-elsewhere OR sessions, patternDays, programDays at `app/utils/account-deletion.server.ts:122-132`. The schema's `authorship` CHECK allows only `system`/`athlete`. Every FK into `Workout` is Cascade or SetNull, except `WeekPatternDay` (NO ACTION), and any slot keeps the row. |
| 2 Kept row withdrawn (private, entry retired, Attribution deleted); training still opens | Met (see S-1) | `keepUnattributed` l.186-197. Test `expectErased` (account-deletion.server.test.ts:403-452). |
| 3 Fork's `copiedFromId` goes to the nearest surviving ancestor, `null` if none | Met | `spliceLineage` l.206-242 selects children by `copiedFromId in erasable ids`, as the architecture asks. Tests at 454-471 pin Citation resolution and the `null` case. |
| 4 A saved erased orphan leaves the saved list cleanly | Met | Cascade on `CatalogueSave`. Test l.474-478. `listCatalogue` filters `retiredAt: null`, so a saved *kept* row drops out too. |
| 5 No Stock Workout or owned row touched; stock and community tiers unchanged | Met | Erase uses the candidate `where` plus `notIn kept` (l.175-177), never `ownerId` alone. Tests l.530-564 compare the tiers before and after and snapshot the whole Workout table. The splice rewrites owned forks' `copiedFromId`, which AC 3 requires. |
| 6 Runs once; a re-run changes nothing | Met | `ensureOrphanedWorkoutPurgeEnqueued` (orphaned-workout-purge.server.ts:52-63): any row of the kind blocks re-enqueueing. Test l.74-110 covers completed and failed rows. Idempotence is pinned with `updatedAt` (account-deletion.server.test.ts:566-577). Boot re-runs a `running` row left by a stopped process, as decided ("When boot takes a running purge for stranded"). |
| 7 One transaction; retried through attempts | Met | One `$transaction` holds both the erase and the payload write (l.76-85). Test l.189-233 uses a trigger to fail the last write and asserts nothing was erased and the job is `pending` with `attempts: 1`. Default `maxAttempts` is 5. |
| 8 Counts in result or log; no title, description or author name | Met (see S-2) | `purged: { erased, keptUnattributed, spliced }` is written on its own row inside the transaction, then logged. Tests l.112-143 and l.226-232 assert none of the title, name or id strings appear. The `keptUnattributed` name follows a Decision. |
| 9 "Slett kontoen din" unchanged; one implementation | Met | `deleteAccount` and `eraseOrphanedWorkouts` both call `erase()` over `ErasureScope`. Compared with main's `deleteAccount`: the own-slot delete now runs earlier (no effect, because the account held-guard already excludes own slots); `withdraw` only updates rows that are not already private (same result); children are selected by the erased ids, not `copiedFrom.ownerId` (same set). Test l.518-528 shows the same outcome. |
| 10 `user.delete`/`deleteMany` outside erasure fails lint and names `deleteAccount`; `*.test.ts(x)` and `tests/` exempt; fixtures in `app/` linted | Met | `eslint.config.js:24-68,80-108`. `eslint-restrictions.test.ts` lints at utils, server, route, route-test, test and `tests/` paths. The route block lists both restrictions, and route tests keep `<select>`. `app/utils/load/elevate-fixtures.ts` has no ignore, so it is linted. |
| 11 ADR 0051 §5 and ADR 0105 table updated; SQL count kept | Met | `docs/adr/0051-…:263-283`, `docs/adr/0105-…:109,112`, new `docs/adr/0121-…`. The ADR was renumbered from 0114 to 0121 because main took the earlier numbers, which the Architecture's §4 allows. References are consistent; the remaining `ADR 0114 §6` lines refer to main's Better Auth ADR, which is correct. |

## Findings

### S-1: AC 2 "still opens with its Workout" is pinned for the session only (low, test coverage)
- **Criterion**: AC 2, "That athlete's session, slot or Program day is still there and still opens with its Workout."
- **Where**: `app/utils/account-deletion.server.test.ts:438-452`. The session is opened through `getSessionByIdForUser`. The slot and the Program day are only checked to still hold `workoutId`; nothing loads them through their read paths.
- **Why low**: the code is right: kept rows are only made private, and no owner-scoped filter is added. ADR 0113 makes the slot case unreachable in production (the comment at `account-deletion.server.ts:112-116`). A Program day loads its Workout through the composite FK.
- **Verify**: add a test that opens the kept Program day's Workout through the strength-program read path (`app/utils/strength-program.server.ts`) after `eraseOrphanedWorkouts`. Under `poc` this is a `Debt:` line.

### S-2: The Architecture's "no … Workout id goes in the payload or the log" is not fully met on the failure path (low)
- **Criterion**: Architecture §2, "No title, description, display name or Workout id goes in the payload or the log". AC 8 itself only forbids title, description and author name, and it is met.
- **Where**: `app/utils/orphaned-workout-purge.server.ts:86-99`. The purge's own failure line logs only the class and code. But `failJob` stores `error.message` in `Job.lastError` (`queue.server.ts:209`), and `db.server.ts:17` (`{ level: 'error', emit: 'stdout' }`) prints Prisma's error, which for a validation error can include the `id in/notIn` arguments. ADR 0121's Consequences state this openly.
- **Verify**: `app/utils/orphaned-workout-purge.server.test.ts:217-221` asserts `lastError` contains `tx.job.update`, the Prisma invocation text. Feed the transaction a validation error and inspect `lastError`.
- **Decision needed**: whether the Architecture line binds `lastError` and Prisma's stdout. A one-line spec clarification or a redaction in `failJob` would settle it. Ids are not personal text, so this does not touch AC 8.

### S-3: Scope beyond the letter of the ACs, all covered by a recorded Decision (low, informational)
- The lint rule also rejects non-call member reads, delegate capture (`const u = tx.user`, `const { user } = prisma`) and raw `DELETE FROM "User"` (`eslint.config.js:37-58`). That goes beyond AC 10's "calls … on a Prisma client". Decision "Keep the deleteAccount lint selector wider than AC 10" covers it, and it makes a guard stricter, which `review.md` step 3 says needs nothing.
- `queue.server.ts` changes: `JobHandler` gains a `job` argument, `failJob` gains a guard, and there is a new exported `failStaleJobs`. Decisions cover these (the record on its own row; "When boot takes a running purge for stranded"). Two unrelated handler tests changed only for the new signature (`intervalsicu/backfill.server.test.ts`, `credential-backfill.server.test.ts`).
- **Verify**: `git diff origin/main...HEAD --stat`. No change appears that no AC or Decision asks for.

## Outside this axis (for the Standards and qualities reviews)
- `failStaleJobs` returns `stale.length`, but its doc says "Returns how many it failed". Rows the guard skips are still counted (`app/utils/jobs/queue.server.ts:239-276`).
