# Spec review: PR #677 (closes #468), head a4c888c

**Verdict:** All 11 acceptance criteria are implemented. Nothing critical, high or medium was found. There are four low findings. Tests were read but not run, because the worktree has no `node_modules`.

## (a) Missing or partial

**Low: `eslint.config.js:66-70`, `docs/adr/0114-…md:48` (AC10, "Test files and test fixtures are exempt"; Architecture §3, "Its ignores: … and the fixture paths")**
The ignores list only `account-deletion.server.ts` and `**/*.test.{ts,tsx}`. They rely on "test fixtures live in `tests/`", and ADR 0114 states the same thing. That claim is false: `app/utils/load/elevate-fixtures.ts` is a fixture inside `app/`, and the rule covers it. It deletes no users today, but a future fixture beside it that tears down a user would fail lint, against AC10. ADR 0114 records the wrong fact.

**Low: test depth for AC2 ("still opens with its Workout") and AC3 ("the fork still opens")**
The tests check the pointers (`workoutId`, `copiedFromId`) and `resolveCatalogueOrigin`, but no test loads a session, slot or fork through its loader. This is a coverage gap, not a bug.

## (b) Scope creep

**Low: `eslint.config.js:40-56` (AC10, "calls `user.delete` or `user.deleteMany` on a Prisma client")**
The rule goes further than AC10. It matches `.user.delete` on *any* object (`cache.user.delete(k)`). It bans taking the delegate even for reads (`const u = prisma.user`, `const { user } = db`). It flags any string matching `DELETE FROM User`. ADR 0114 §4 records this on purpose and nothing in the repo trips it today, but it can flag code that has nothing to do with Prisma.

The third ESLint block (route `*.test.tsx` keep the `<select>` guard) and the `keptUnattributed` rename are both covered by `## Decisions`, so neither is creep.

## (c) Implemented but questionable

**Low: `app/utils/orphaned-workout-purge.server.ts:47-51` (AC8, "records how many Workouts it erased, withdrew and spliced in the job's result or log")**
The job finds its own row with `findFirst({ kind, status: 'running' })`, because `JobHandler` receives only the payload. If no row matches (called outside the queue), it skips the record silently. If two boots race (`ensure…Enqueued` checks, then inserts), one run can write to the other's row. The log line still satisfies AC8 ("result *or* log"), but the Decision "record on its own row" is quietly missed. Same pattern as swim-pace and needs a multi-machine boot, so the impact is small.

**Note, not a defect.** AC5 says "touches no … Workout that has an owner", but AC3 requires splicing owned forks (`adopted.copiedFromId` is rewritten). AC3 is the more specific rule and the build follows it.

**Built as decided: published and reported orphans are erased.** This contradicts the original guards ("In the Catalogue → never", "anybody's list → never"), but `## Decisions` ("What happens to orphans that already exist") and ADR 0051 §5 decided it.

## Criterion → test

| AC | Covered by |
|---|---|
| 1 boot purge, no operator | `orphaned-workout-purge.server.test.ts:74` (enqueue), `:99` (handler runs). The `server/index.ts` call itself is untested. |
| 2 kept rows unattributed, training intact | `account-deletion.server.test.ts:526` (via `expectErased`; Program-day guard and "retired, not deleted" pinned), `:131`, `:231` |
| 3 lineage splice / null | `account-deletion.server.test.ts:526` (`adopted`→stock Citation, `fromRoot`→null) |
| 4 saved list | `account-deletion.server.test.ts:526` (`listCatalogue({ savedBy })`). Data layer only, no route. |
| 5 corpus and owned rows untouched, tiers equal | `account-deletion.server.test.ts:548` (full snapshot), `:526` (stock/community tiers before = after) |
| 6 runs once, idempotent | `orphaned-workout-purge.server.test.ts:74`, `:132`; `account-deletion.server.test.ts:562` (snapshot incl. `updatedAt`) |
| 7 one transaction, retried | `orphaned-workout-purge.server.test.ts:172` |
| 8 counts only, no PII | `orphaned-workout-purge.server.test.ts:99` (no title, name or id in payload or log), `:152` |
| 9 deleteAccount unchanged, one implementation | `account-deletion.server.test.ts:514`, plus existing `:68`, `:131`, `:205`, `:231`. A single private `erase()` serves both scopes. |
| 10 lint | `eslint-restrictions.test.ts:56`, `:97`, `:104`, `:113`. No test lints a fixture path. |
| 11 ADRs | None (docs). ADR 0051 §5 and ADR 0105 §3 both point to ADR 0114; the SQL count is kept as the owner's check. Renumbered 0112→0114 because main took 0112/0113; the issue body still links 0112. |
