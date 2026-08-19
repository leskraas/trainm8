# Seed Data in Production

How athlete-independent corpus data reaches production in this repo. This is the
house convention; it follows upstream Epic Stack's
[`docs/database.md`](https://github.com/epicweb-dev/epic-stack/blob/main/docs/database.md).

## What production actually does at boot

- `other/litefs.yml:34` runs `npx prisma migrate deploy` with
  `if-candidate: true` — the primary node applies migrations on every deploy.
  **Schema arrives on a normal deploy and needs no operator action.**
- The `exec` list ends at `npm start`. **Nothing seeds in production.**
- **Never run `npx prisma db seed` against production.** `prisma/seed.ts` mints
  the demo user `kody`, is not idempotent, and fails on a second run with
  `Unique constraint failed on the fields: (username)`. It is for local
  development and demo data only.

So corpus data — `authorship: 'system'` content no athlete owns — ships **inside
a migration**, as `INSERT` statements. The consequence, and the reason to prefer
it: a normal deploy is sufficient, permanently. No `fly ssh`, no one-off
command, no extra `litefs.yml` step, and the data is versioned with the schema
so a rollback takes it along.

## The procedure

1. Keep the seeder as the source of truth (e.g.
   `app/utils/exercise-seed.server.ts`,
   `app/utils/strength-program-seed.server.ts`). Nobody hand-writes corpus rows.
2. Build a **fresh temporary** database in `/tmp`:
   `DATABASE_URL=file:/tmp/seed.db npx prisma migrate deploy`.
3. Run the seeder against it, and nothing else.
4. Dump it with the `sqlite3` CLI and copy the `INSERT`s for exactly the tables
   the seeder writes into a new `prisma/migrations/<ts>_<name>/migration.sql`.
5. Apply the new migration to another throwaway database **twice** and count
   rows both times. Identical counts, no failures.
6. Delete the throwaway databases and scratch scripts. `/tmp`, never the repo.

## The traps

1. **Never dump from `prisma/data.db`.** The dev database holds the demo user,
   their sessions, imports and athlete-authored rows. Build the dump from a
   fresh throwaway database. This is the single biggest risk in the procedure.
2. **Never ship an athlete-authored row.** `seedExercises` deliberately skips
   `authorship: 'athlete'`. Filter to `authorship: 'system'` explicitly in the
   dump selects — don't trust a fresh database to have none.
3. **Assume partial prior state.** Production may already carry some rows from
   earlier migrations. Use `INSERT OR IGNORE`, not `ON CONFLICT (id)`: only
   `OR IGNORE` survives every unique index, and it never clobbers a live row.
   Where an already-present row must gain a facet, add a bounded, explicitly
   guarded `UPDATE`. Foreign key violations still fail loudly, as they should.
4. **Escaping.** Names and instructions contain apostrophes, and some columns
   hold JSON blobs. One unescaped quote breaks a boot-time deploy — which is why
   step 5 exists.
5. **State plainly in the migration header whether any stored number moves**,
   and if one does, that a Load Recompute Notice may be owed. See the headers of
   `prisma/migrations/20260814120000_*` and `20260817140000_*`.
6. **Stamp timestamps at a fixed epoch**, not at dump time, so the file is
   deterministic and reviewable.

## The worked example

`prisma/migrations/20260818120000_ship_the_exercise_corpus_and_the_three_programs/`
is this procedure, done. Read its header before writing your own — it is the
template.

It carries 1,656 `INSERT OR IGNORE` rows across `Exercise`, `ExerciseVariant`,
`ExerciseAlias`, `Workout`, `WorkoutBlock`, `WorkoutStep`, `ExerciseSet`,
`StrengthProgram`, `StrengthProgramDay` and `StrengthProgramLiftRule` — the
exact table list read off the two seeders. Its header states that **no stored
number moves**, names the 38 pre-existing exercises that get a facet-only
`UPDATE` guarded on `authorship = 'system'`, explains why no `CatalogueEntry`
row is published, and records that it was applied twice to an empty database
with identical counts.

## Escape hatches — inspection and emergencies, not routine seeding

Production is the Fly app `trainm8-085d`.

- SQLite shell: `fly ssh console -C database-cli --app trainm8-085d`
- Prisma Studio, two terminals:
  `fly ssh console -C "npx prisma studio" --app trainm8-085d` and
  `fly proxy 5556:5555 --app trainm8-085d`, then open `http://localhost:5556`.

Neither is a way to seed. Data that belongs in production belongs in a
migration.
