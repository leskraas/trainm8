# PR #677 review: Standards and Spec (issue #468)

Ref: `origin/agent/468-purge-orphaned-workouts`, compared with `origin/main...`. There are 4 commits (1fb33d0 docs, ce79138 refactor, 2fa26e2 job, a0db1bf lint) touching 12 files.
Line numbers below refer to files at that ref.

## What I verified

- I ran the three test files from a `git archive` export of the branch in the scratchpad (the clone was not touched): `account-deletion.server.test.ts` (9), `orphaned-workout-purge.server.test.ts` (4) and `eslint-restrictions.test.ts` (3). **All 16 tests pass.**
- `npx eslint app server` against the branch config reports **no problems**. The only `.user.delete` outside test files is `app/utils/account-deletion.server.ts:67`, so the new rule does not break the build.
- `@epic-web/config` sets no `no-restricted-syntax` of its own, so the new `app/**` block shadows nothing from the base config.
- Every Workout `INSERT` in `prisma/migrations` (7 of them) states `'system'`. The only app writers of `ownerId: null` (`catalogue-seed.server.ts:169`, `strength-program-seed.server.ts:429`) also state `authorship: 'system'`. So `{ ownerId: null, authorship: 'athlete' }` does not reach shipped corpus rows.
- The diff touches no guard files (`.github/**`, `.claude/**`, `AGENTS.md`, `CLAUDE.md`, `fly.toml`, `other/**`) and adds no dependencies.

## Standards

The diff follows the documented standards. Each finding below is minor or a nit.

1. **minor: the code still uses "withdrawn" for the kept row, which the glossary now forbids.** `GLOSSARY.md` (new Account Erasure entry) says "_Avoid_: … withdrawn (for the kept row)". `docs/agents/domain.md` says to use the glossary's terms. Yet `AccountErasure.withdrawn` (`app/utils/account-deletion.server.ts:43`, `:148`) and the job's stored payload key `purged.withdrawn` still use it, while the log line says "kept unattributed" (`orphaned-workout-purge.server.ts:60`).
   - *Scenario:* someone reading the audit record `{erased, withdrawn, spliced}` takes the rows as author-withdrawn (Attribution kept), which is exactly the confusion the glossary entry exists to stop.
   - *Fix:* rename the field to `keptUnattributed` (or `kept`). This deviates from the issue's literal `{ erased, withdrawn, spliced }`, so either record the rename in ADR 0112 §2, or keep the name and add a one-line doc comment saying it means "kept unattributed". The spec wording and the glossary disagree here; the owner should pick.
2. **nit: two constants are exported but nothing imports them.** `eslint.config.js:17` and `:27` export `NATIVE_SELECT_RESTRICTION` and `USER_DELETE_RESTRICTION`, but `eslint-restrictions.test.ts` asserts on message substrings instead (possible Speculative Generality).
   - *Fix:* drop `export`, or import them in the test and assert `message === USER_DELETE_RESTRICTION.message`.
3. **nit: the stored job payload is cast, not checked.** `orphaned-workout-purge.server.ts:74` casts the parsed payload to `{ purged?: AccountErasure }`, so a malformed `purged` value would be returned as the record unchecked. The risk is low because only this function writes it.
   - *Fix:* check `typeof purged?.erased === 'number'` before trusting it.
4. **nit: the ADR 0051 text leaves out the fixture exemption.** `docs/adr/0051-the-catalogue-has-four-axes.md:267` says the lint rule exempts "`account-deletion.server.ts` and test files", but the config (`eslint.config.js:46-47`) and ADR 0112 §4 also exempt fixtures.
   - *Fix:* add "and test fixtures".
5. **nit: the route block's ignores now include the fixture paths.** The route block ignores `...USER_DELETE_IGNORES` (`eslint.config.js:69`), so a future `app/routes/**/fixtures/*.tsx` would lose the native-`<select>` guard it had before. No such file exists today.
   - *Fix:* ignore only `**/*.test.{ts,tsx}` there (the third block re-adds route tests), or accept the gap and mention it in the comment.

Smell baseline (judgement calls only): no Duplicated Code, Feature Envy or Shotgun Surgery worth raising. The scope union plus two small `where` builders is the minimum shape the spec asked for.

## Spec (#468)

Each acceptance criterion and decision, checked against the code and the tests:

| # | Criterion | Code | Test that exercises it |
|---|-----------|------|------------------------|
| 1 | Pre-existing orphans purged at first deploy, with no operator | `server/index.ts` (+7), `handlers.server.ts`, `orphaned-workout-purge.server.ts` | Purge test "the job erases…" goes end to end through `processNextJob(jobHandlers)` |
| 2 | Orphan held by another athlete's training is kept unattributed and that training still opens | `keepUnattributed` (`account-deletion.server.ts:151-161`); orphan-scope guard `:97-106` | `expectErased`: session and slot still point at the row, private, no Attribution. **Gaps:** a Program day is never a holder in any fixture; see findings S2 and S3 |
| 3 | A fork of an erased fork of a cited Stock Workout keeps its Citation; with no surviving ancestor the pointer is `null` | `spliceLineage` (`:172-208`) | `adopted` resolves its origin to `stock`; `fromRoot` has `copiedFromId: null` |
| 4 | A `CatalogueSave` on an erased orphan disappears | Cascade | Saved list does not contain `fork` |
| 5 | No Stock Workout and no owned row touched; stock and community tiers unchanged | `candidateWhere` (`:88-92`) is used in both the guard and the `deleteMany` (`:144-146`); splice selects children by erased ids (`:178`) | "never reaches the corpus" test (full Workout snapshot); before/after tier comparison |
| 6 | Runs once; a re-run changes nothing | `ensureOrphanedWorkoutPurgeEnqueued` (any state counts) | "boot enqueues … exactly once, ever"; "a second purge changes nothing" (see S4) |
| 7 | One transaction; retried by the queue | `prisma.$transaction` with the record write inside it | Trigger-induced failure: nothing erased, job back to `pending` with `attempts: 1` |
| 8 | Counts only, recorded on the job | Payload written inside the transaction; first record kept on a re-run | Checks titles, display name and ids are absent from the payload and the log; "keeps the first record" test |
| 9 | "Slett kontoen din" behaves as before, from one implementation | `deleteAccount` → `erase(tx, {kind:'account'})`; own slots deleted first, then `user.delete` | The 5 existing tests plus the shared-world test |
| 10 | Lint fails a direct `user.delete`/`deleteMany`, names `deleteAccount`; tests and fixtures exempt | `eslint.config.js:27-47, 57-87` | Utils, server, route, route-test and erasure-file paths. **Fixture exemption untested** (S5) |
| 11 | ADR 0051 §5 and ADR 0105 table updated; SQL count kept | Done | n/a |

**Architecture trap 1 (Stock Workouts never selected by `ownerId: null` alone): satisfied.** All three queries that could reach the corpus are scoped:
- The candidate query (`:127-130`).
- The held-elsewhere query, which ANDs the candidates (`:131`).
- The erase, which ANDs the candidates (`:144-146`).
The splice selects children by `copiedFromId in <erasable ids>` and no longer by `copiedFrom.ownerId`. The test "never reaches the corpus" catches the regression: the world holds ownerless stock rows, including a stock fork, and the test snapshots the whole Workout table.

**Architecture trap 2 (the lint rule must not clobber the native-`<select>` restriction): satisfied.** Three things keep it:
- The route block lists both restrictions (`eslint.config.js:70-76`).
- A third block keeps `<select>` on route test files (`:78-87`).
- `eslint-restrictions.test.ts` asserts that both fire on a route file and that only `<select>` fires on a route test.

The admin, marketing and SEO routes correctly get only the user-delete rule.

The implement-stage decisions are honoured: the first record wins on a re-run, and route tests keep `<select>`. `unpublishWorkout` is not reused.

### Spec findings

- **S1 (minor): the test checks `withdrawn`, not the job's actual audit field.** The job record test (`orphaned-workout-purge.server.test.ts`, "records counts only") asserts the record is `{ purged: {erased, withdrawn, spliced} }`, matching the issue. This is not a defect, only a note for Standards finding 1: if that field is renamed, this assertion and ADR 0112 §2 change with it.
- **S2 (minor): no fixture has a Program day holding an orphan.** Criterion 1 names "session, Week Pattern slot or Program day", and the orphan guard has a `programDays` arm (`account-deletion.server.ts:103`), but no fixture uses one. The arm could be deleted with every test still green.
  - *Scenario:* a refactor drops the `programDays` arm from the orphan scope. A system Program day on an athlete-authored row cannot exist (`StrengthProgramDay` carries `workoutAuthorship`), so the arm may even be dead code; nothing pins either fact.
  - *Fix:* add a held-by-Program-day case. If the composite foreign key makes it unrepresentable, say so in a comment and keep the arm only for parity.
- **S3 (minor): the "entry retired" check also passes if the entry is deleted.** `expectErased` checks `catalogueEntry.count({ workoutId in held, retiredAt: null }) === 0` (`account-deletion.server.test.ts:381`).
  - *Scenario:* a regression that deletes the Catalogue Entry instead of retiring it still passes, against criterion 2 ("its Catalogue Entry retired") and the retention guard "A Catalogue Entry is retired, not deleted".
  - *Fix:* assert that `heldBySession`'s entry exists with `retiredAt` not null.
- **S4 (nit): a second run does change the kept rows' `updatedAt`.** `keepUnattributed` runs `workout.updateMany({ visibility: 'private' })` (`:154`) on every run, and Prisma bumps `@updatedAt` on `updateMany`. The idempotency snapshot (`snapshotWorkouts`, `:443`) leaves out `updatedAt`, so the test passes while a column moves. A re-run then reports `withdrawn: 2` (`:514`) for rows it did not newly keep.
  - *Fix:* filter the update to rows that are not already private, so the re-run is a true no-op, or accept it and add `updatedAt` to the snapshot exclusions knowingly.
- **S5 (minor): the fixture exemption is untested.** Criterion 10 says "Test files and test fixtures are exempt". `eslint-restrictions.test.ts` covers a test file and the erasure file, but no fixture path (for example `app/utils/load/elevate-fixtures.ts`, which matches `**/*-fixtures.ts`).
  - *Fix:* add one assertion that `restrictions(USER_DELETE, 'app/utils/load/elevate-fixtures.ts')` returns `[]`.
- **S6 (minor, forward-looking): the purge's record and its run-once marker live on a Job row that ADR 0105 plans to delete.** Both sit on the Job row, but ADR 0105's table (`docs/adr/0105-…md:107`) proposes deleting job rows 30 days after they finish.
  - *Scenario:* once that retention sweep is built:
    - (a) The `{erased, withdrawn, spliced}` audit disappears. The issue's decision rejected log-only storage precisely because logs expire.
    - (b) `ensureOrphanedWorkoutPurgeEnqueued` sees no row and enqueues the purge again on the next boot, which contradicts criterion 6 ("a later boot does not run it again"). The re-run itself is harmless, since erasure is idempotent.
  - This is shared with every `ensure*Enqueued` one-shot (swim-pace backfill and others), so it is not this PR's bug alone.
  - *Fix:* add one line to ADR 0112's Consequences, or to ADR 0105's Job-rows row: one-shot marker and audit rows are exempt from the job retention, or the sweep must keep them.
- **S7 (nit): the splice could rewrite a Stock Workout's lineage.** `spliceLineage` updates any child whose `copiedFromId` is an erased orphan, including an `authorship='system'` row. No shipped path forks an athlete row into a Stock Workout, so this is unreachable today, and criterion 5 ("touches no Stock Workout") holds for real data.
  - *Fix (optional):* add `authorship: 'athlete'` to the children `where`, or note why it is unreachable.

No blockers or majors. I saw no scope creep: the out-of-scope items (sweep, H24 tombstone, custom Exercises, Tigris) are untouched.

## Summary

Standards has 5 findings (1 minor, 4 nits); the worst is the "withdrawn" field name against the glossary's "_Avoid_: withdrawn". Spec has 7 findings (5 minor, 2 nits); the worst is S6, where the job's audit and run-once marker sit on a row ADR 0105 plans to delete, and the S3 and S5 test gaps come next. Both architecture traps are satisfied and pinned by tests.

## Skills

`bredvid-code-review` loaded. It points at `/home/user/skills/skills/code-review/SKILL.md`, which I followed. That skill asks for parallel sub-agents for the two axes; no sub-agent tool was available in this run, so I reviewed both axes myself one after the other and kept them in separate sections, not merged or reranked.
