# Orphaned Workouts are erased once by a boot job, and lint keeps `deleteAccount` the one path

Status: Accepted · Resolves #468 · Closes two items of ADR 0051 §5 "Deferred
hardening" and updates ADR 0105's retention table

## Context

**Account Erasure** (ADR 0051 §5, `deleteAccount` since #641) stops new
**Orphaned Workouts**, but every account deleted before #641 left its Workouts
stored, and a `public` one under the name its author published as. ADR 0051's
Deferred hardening suggested a guarded cleanup migration. Nothing stopped a
future `prisma.user.delete` from making new ones.

## Decision

1. **One implementation of the rules, two entry points.** The rules (keep a row
   another athlete's session, Week Pattern slot or Program day points at, and
   make it unattributed; erase the rest; splice surviving forks to the nearest
   surviving ancestor, capped at `MAX_LINEAGE_HOPS`) stay private to
   `app/utils/account-deletion.server.ts`. It exports `deleteAccount(userId)`
   and `eraseOrphanedWorkouts(tx)`, and both run the same internal function over
   an **erasure scope**: an account's own Workouts, or the Orphaned Workouts. An
   Orphaned Workout is selected by `authorship = 'athlete' AND ownerId IS NULL`,
   never by `ownerId IS NULL` alone (ADR 0051 §2): that would erase every
   **Stock Workout**. The rules are not written by threading a nullable `userId`
   through the account queries, because `ownerId: null` there is exactly that.
2. **The purge is a one-time job enqueued at boot**, on the `ensure*Enqueued`
   pattern (any job row of its kind, in any state, means boot does not enqueue
   another). The job runs `eraseOrphanedWorkouts` in one transaction and writes
   the counts it erased, kept and spliced onto its own `Job.payload` (`purged`:
   `{ erased, keptUnattributed, spliced }`) inside that same transaction, and
   logs them. The kept count is named for the glossary's **unattributed** keep,
   not "withdrawn", which is the author's own act and keeps the Attribution. A
   run after one that committed keeps that first record rather than writing
   zeros over it. It never records a title, description, name or Workout id. The
   job queue's attempts are its retries.
3. **Not a migration.** The rules exist once, in tested TypeScript. A SQL copy
   would be a recursive CTE for the splice that nothing typechecks or runs
   against `deleteAccount`'s fixtures, and it would drift from them: ADR 0051
   §9's reason, applied to logic rather than content.
4. **No recurring sweep. Lint pins the one deletion path instead.**
   `no-restricted-syntax` rejects a `.user.delete` / `.user.deleteMany` call in
   `app/` and `server/`, except in `account-deletion.server.ts`, test files and
   test fixtures, and its message names `deleteAccount`. A sweep would quietly
   clean up after the regression lint reports at the line that causes it.
5. **Restrictions share one rule, so they are composed.** ESLint's flat config
   replaces a rule's options per matching block; it does not merge them. Each
   restriction is a named entry in `eslint.config.js`, and a block that covers
   route files lists the native-`<select>` restriction and the user-delete one
   together. A test lints a snippet at a route path and at a non-route path, so
   neither restriction can silently shadow the other.

## Considered options

- **A guarded SQL migration** (ADR 0051's suggestion): no operator either, but a
  second copy of the rules that cannot be tested against the first.
- **A daily orphan sweep**: hides the regression it cleans up after, and sits
  beside a retention sweep ADR 0105 has not built.
- **A test that greps the source for `user.delete`**: reports later than lint,
  and further from the line.
- **A local ESLint plugin rule** instead of `no-restricted-syntax`: no shadowing
  to manage, but a plugin to maintain for one selector. Composing named entries
  plus the pinning test does the same job.

## Consequences

- A row kept because another athlete's training points at it stays an
  unattributed Orphaned Workout. If that training later lets go of it, nothing
  collects it: the job does not run again. No shipped path writes such a pointer
  (ADR 0051 §5).
- Open reports on an erased orphan go with it, as on Account Erasure (#639 H24).
- The read-only SQL count in ADR 0051 §5 stays as the owner's check that the job
  ran: after it, only kept rows remain, all `private`.
- `git grep` stays the backstop for shapes lint does not see, such as a computed
  `prisma['user']`.
