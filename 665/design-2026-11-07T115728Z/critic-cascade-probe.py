# Critic probe for #665: does a held copy cascading off PlanOutline trip
# WeekPatternDay_kind_fields (via the day's ON DELETE SET NULL) when the plan
# or the account is deleted? Builds the real schema from prisma/migrations.
import sqlite3, glob, os, sys
root = sys.argv[1]
db = sqlite3.connect(':memory:')
for d in sorted(glob.glob(os.path.join(root, 'prisma/migrations/*/migration.sql'))):
    db.executescript(open(d).read())
MODE = sys.argv[2] if len(sys.argv) > 2 else 'alter'
if MODE == 'alter':
    db.execute('ALTER TABLE "Workout" ADD COLUMN "heldByOutlineId" TEXT REFERENCES "PlanOutline"("id") ON DELETE CASCADE ON UPDATE CASCADE')
else:
    # What `prisma migrate dev` emits for a new FK column on SQLite: redefine the table.
    sql = db.execute("SELECT sql FROM sqlite_master WHERE name='Workout'").fetchone()[0]
    idx = [r[0] for r in db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='Workout' AND type='index' AND sql IS NOT NULL")]
    j = sql.find('    CONSTRAINT "')
    sql = sql[:j] + '    "heldByOutlineId" TEXT,\n' + sql[j:]
    i = sql.rfind(')')
    sql = sql[:i] + ',\n    CONSTRAINT "Workout_heldByOutlineId_fkey" FOREIGN KEY ("heldByOutlineId") REFERENCES "PlanOutline" ("id") ON DELETE CASCADE ON UPDATE CASCADE' + sql[i:]
    sql = sql.replace('CREATE TABLE "Workout"', 'CREATE TABLE "new_Workout"', 1)
    db.executescript('PRAGMA foreign_keys=OFF;' + sql + ';' + 'INSERT INTO "new_Workout" SELECT *, NULL FROM "Workout"; DROP TABLE "Workout"; ALTER TABLE "new_Workout" RENAME TO "Workout";' + ';'.join(idx) + ';')
DAYFK = (sys.argv[3] if len(sys.argv) > 3 else 'SET NULL').replace('_', ' ')
if DAYFK != 'SET NULL':
    d = db.execute("SELECT sql FROM sqlite_master WHERE name='WeekPatternDay'").fetchone()[0]
    idx = [r[0] for r in db.execute("SELECT sql FROM sqlite_master WHERE tbl_name='WeekPatternDay' AND type='index' AND sql IS NOT NULL")]
    d = d.replace('REFERENCES "Workout" ("id") ON DELETE SET NULL', 'REFERENCES "Workout" ("id") ON DELETE ' + DAYFK).replace('CREATE TABLE "WeekPatternDay"', 'CREATE TABLE "new_WeekPatternDay"', 1)
    db.executescript('PRAGMA foreign_keys=OFF;' + d + '; INSERT INTO "new_WeekPatternDay" SELECT * FROM "WeekPatternDay"; DROP TABLE "WeekPatternDay"; ALTER TABLE "new_WeekPatternDay" RENAME TO "WeekPatternDay";' + ';'.join(idx) + ';')
db.execute('PRAGMA foreign_keys=ON')
print('mode', MODE, 'day FK', DAYFK)
def cols(t): return [r[1] for r in db.execute(f'PRAGMA table_info("{t}")')]
def notnull(t): return [(r[1], r[2], r[4]) for r in db.execute(f'PRAGMA table_info("{t}")') if r[3] and r[4] is None and not r[5]]
print('User required:', notnull('User')); print('PlanOutline required:', notnull('PlanOutline')); print('TrainingTrack required:', notnull('TrainingTrack'))

def seed(n):
    u, o, t, p = f'u{n}', f'o{n}', f't{n}', f'p{n}'
    db.execute('INSERT INTO "User"(id,email,username,updatedAt) VALUES (?,?,?,datetime())', (u, u+'@x', u))
    db.execute('INSERT INTO "PlanOutline"(id,startWeekKey,updatedAt,athleteId) VALUES (?,?,datetime(),?)', (o, '2026-11-02', u))
    db.execute('INSERT INTO "TrainingTrack"(id,discipline,currency,outlineId) VALUES (?,?,?,?)', (t, 'run', 'km', o))
    db.execute('INSERT INTO "WeekPattern"(id,name,orderIndex,outlineId) VALUES (?,?,0,?)', (p, 'Typisk uke', o))
    w = f'w{n}'
    db.execute('INSERT INTO "Workout"(id,title,discipline,intent,ownerId,updatedAt,heldByOutlineId) VALUES (?,?,?,?,?,datetime(),?)', (w, 'Terskel', 'run', 'threshold', u, o))
    db.execute('INSERT INTO "WeekPatternDay"(id,weekday,kind,workoutId,patternId,trackId) VALUES (?,1,\'fixed\',?,?,?)', (f'd{n}', w, p, t))
    db.commit()
    return u, o

def attempt(label, sql, arg):
    try:
        db.execute(sql, (arg,)); db.commit(); print(label, '-> OK')
    except Exception as e:
        db.rollback(); print(label, '->', type(e).__name__, e)

u, o = seed(1); attempt('DELETE PlanOutline (plan with a held fixed-day copy)', 'DELETE FROM "PlanOutline" WHERE id=?', o)
u, o = seed(2); attempt('DELETE User (account deletion cascade)', 'DELETE FROM "User" WHERE id=?', u)

# A held copy deleted directly while a day still holds it (a sweep bug, or a future path).
u, o = seed(3); attempt('DELETE the held Workout a fixed day still holds', 'DELETE FROM "Workout" WHERE id=?', 'w3')
