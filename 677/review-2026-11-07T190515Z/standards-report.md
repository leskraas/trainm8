# Standards review: PR #677 (closes #468), head a4c888c

**Verdict:** no hard violations of a documented standard and no critical data-loss bug. One medium risk (the job can be stranded in `running`) and four low judgement calls.

## Guard and human paths
- Nothing touches `.github/`, `.claude/`, `CLAUDE.md`, `fly.toml`, `other/`, `tsconfig.json` or `playwright.config.ts`. No new dependencies.
- **`eslint.config.js` is edited**, a human-edit file, so a human approves it at merge. The change is **stricter**:
  - It adds the user-delete restriction.
  - The `<select>` guard covers exactly what it did before (route `.tsx` including tests, minus admin/_marketing/_seo).
  - `@epic-web/config` sets no `no-restricted-syntax`, so nothing is replaced.

## (a) Documented standards
- **Glossary (`docs/agents/domain.md`, `GLOSSARY.md` Account Erasure):** new code says `keptUnattributed`; "withdrawn" appears only in contrast. Compliant.
- **ADRs (issue §4, AC 11):** renumbered to 0114, no stale `0112` reference left; ADR 0051 §5 and ADR 0105 §3 updated. Compliant.
- There is no other coding standard to apply: no CONTRIBUTING file, and `docs/testing.md` is generic.

## (b) Smells (judgement calls)
1. **Duplicated Code, low.** `orphaned-workout-purge.server.ts:67` `parsePayload` nearly copies `load/swim-pace-backfill.server.ts:293`. The own-row lookup (`:47-48`) repeats `swim-pace-backfill.server.ts:208`. A queue helper would remove both. Verify: `grep -rn "function parsePayload" app`.
2. **Repeated Switches, low.** `account-deletion.server.ts:90` and `:102` each branch on `scope.kind`. One `rulesFor(scope)` would stop a third scope becoming shotgun surgery. Fine at two arms.
3. **Speculative Generality, low.** `eslint.config.js:37` lists the client names `db` and `client`, which nothing uses. The selector at `:45` flags any `const x = prisma.user`, read-only uses included, with a deletion message: a false positive for a future read helper. Verify: lint `const u = prisma.user; u.findMany()` at `app/utils/x.server.ts`.
4. **Brittle fixtures, low.** `eslint-restrictions.test.ts:17-19` pins real files (`app/routes/me.test.tsx`, `settings/profile/index.tsx`). Renaming either breaks the test for an unrelated reason.

## (c) Bugs and risks
1. **Medium: the purge can be stranded in `running` and never retried.**
   - `claimNextJob` commits `running` before the handler runs, and nothing recovers a stale `running` row (`grep -rn "startedAt\|stale" app/utils/jobs` finds only the claim).
   - The purge runs at boot in a transaction of up to 30 s, while `fly.toml` has `kill_timeout = 5`.
   - Scenario: a second deploy or a crash lands mid-purge. SQLite rolls back, but the row stays `running`. `ensureOrphanedWorkoutPurgeEnqueued` (`:34-39`) sees a row and never enqueues another, and the attempts never fire. AC 7's retry fails silently.
   - The queue already had this gap, but this one-shot job relies on retries. Fix: requeue a stale `running` row of this kind at boot, or name it in ADR 0114's owner check, which names only `failed`.
   - Verify: claim the job, skip the handler, then call `ensure…Enqueued()` and `processNextJob`. It returns `idle` and nothing is purged.
2. **Low: the orphan scope's `patternDays` clause cannot fire in production.**
   - Migration `20261107130000_a_plan_holds_its_pattern_workouts` repointed every other athlete's day at a held copy they own, so no day points at an orphan.
   - Such an orphan is therefore erased and the held copy spliced. That is correct.
   - But the `:66` comment no longer says the matching clause is unreachable, and ADR 0114 §1 and the glossary imply a slot can still keep a row.
   - Verify: `SELECT COUNT(*) FROM WeekPatternDay d JOIN Workout w ON w.id=d.workoutId WHERE w.ownerId IS NULL AND w.authorship='athlete'` returns 0.
3. **Low: unbounded id lists.**
   - `notIn [...kept]`, `copiedFromId in [...parentOf.keys()]` and `updateMany in ids` bind one parameter per id.
   - Tens of thousands of orphans could pass SQLite's variable limit or the 30 s timeout. A failure rolls back, but every attempt may fail the same way.
   - Verify: a fixture with about 40k orphans.
4. **Checked and safe:**
   - `authorship` is in every read and in the delete (`:90-94`, `erase`), and the corpus migrations all insert `authorship 'system'`.
   - The `NO ACTION` foreign key `WeekPatternDay.workoutId` is guarded.
   - `keepUnattributed` leaves `updatedAt` unchanged on a re-run.
   - The record commits in the purge transaction and is never overwritten with zeros, and it holds no titles, names or ids (tested).
   - The account-scope splice is equivalent to the old one.
   - Every pin the issue asks for is tested, plus rollback-and-retry.

**Hard violations:** none. **Judgement calls:** (b)1-4, (c)2-3. **Settle before merge or record in ADR 0114:** (c)1.
