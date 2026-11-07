// Probe: does deleting a User trip a CHECK on Workout that requires a held row
// (heldByOutlineId NOT NULL) to keep ownerId NOT NULL, given that
// Workout.ownerId is ON DELETE SET NULL and Workout.heldByOutlineId is
// ON DELETE CASCADE through PlanOutline -> User? Tries both table orders,
// since SQLite runs FK actions in an order tied to the schema.
import { DatabaseSync } from 'node:sqlite'
const tables = {
  User: `CREATE TABLE "User" (id TEXT PRIMARY KEY)`,
  PlanOutline: `CREATE TABLE "PlanOutline" (id TEXT PRIMARY KEY, athleteId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE)`,
  Workout: (check) => `CREATE TABLE "Workout" (id TEXT PRIMARY KEY, authorship TEXT NOT NULL DEFAULT 'athlete',
    ownerId TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    heldByOutlineId TEXT REFERENCES "PlanOutline"(id) ON DELETE CASCADE,
    CONSTRAINT held CHECK (${check}))`,
  WeekPattern: `CREATE TABLE "WeekPattern" (id TEXT PRIMARY KEY, outlineId TEXT NOT NULL REFERENCES "PlanOutline"(id) ON DELETE CASCADE)`,
  WeekPatternDay: `CREATE TABLE "WeekPatternDay" (id TEXT PRIMARY KEY, kind TEXT NOT NULL,
    patternId TEXT NOT NULL REFERENCES "WeekPattern"(id) ON DELETE CASCADE,
    workoutId TEXT REFERENCES "Workout"(id) ON DELETE NO ACTION,
    CONSTRAINT kind_fields CHECK (kind = 'share' OR workoutId IS NOT NULL))`,
}
const checks = {
  'held => athlete AND owner not null': `"heldByOutlineId" IS NULL OR ("authorship" = 'athlete' AND "ownerId" IS NOT NULL)`,
  'held => athlete (implication only)': `"heldByOutlineId" IS NULL OR "authorship" = 'athlete'`,
}
const orders = [
  ['User', 'PlanOutline', 'Workout', 'WeekPattern', 'WeekPatternDay'],
  ['User', 'Workout', 'PlanOutline', 'WeekPattern', 'WeekPatternDay'],
  ['User', 'PlanOutline', 'WeekPattern', 'WeekPatternDay', 'Workout'],
]
for (const [name, check] of Object.entries(checks)) {
  for (const order of orders) {
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    for (const t of order) db.exec(t === 'Workout' ? tables.Workout(check) : tables[t])
    db.exec(`INSERT INTO "User" VALUES ('u');
      INSERT INTO "PlanOutline" VALUES ('o','u');
      INSERT INTO "Workout" (id, ownerId, heldByOutlineId) VALUES ('w','u','o');
      INSERT INTO "WeekPattern" VALUES ('p','o');
      INSERT INTO "WeekPatternDay" VALUES ('d','fixed','p','w');`)
    let result
    try {
      db.exec(`DELETE FROM "User" WHERE id = 'u'`)
      const left = db.prepare('SELECT COUNT(*) n FROM "Workout"').get().n
      result = `ok (Workout rows left: ${left})`
    } catch (e) { result = `FAILS: ${e.message}` }
    console.log(`${name} | order ${order.join(',')} | delete user: ${result}`)
  }
}
