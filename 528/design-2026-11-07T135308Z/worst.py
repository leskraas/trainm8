"""Worst-case data for the break-ui pass (#528's criterion 9), written into the ISOLATED copy's
database only (never the repo's): a 40-character exercise name, two 80-character session titles,
a four-digit weekly km anchor. Usage: python3 -I worst.py <data.db> [--undo]"""
import sqlite3, sys, json, os
db = sys.argv[1]; c = sqlite3.connect(db); state = db + '.worst.json'
EX = 'Bulgarsk splittknebøy, manualer og pause'
T80 = 'Styrkesirkel for løpere: knebøy, utfall, markløft og kjernestabilitet før søndag'[:80]
V80 = 'VO₂maks-drag i bakkene: fem ganger tre minutter hardt, med like lang jogg mellom'
SESS = {'cmw6enllf00aw7dqr4rs30irn': T80, 'cmw6enlkj00aq7dqrwme9r98c': V80}
if '--undo' in sys.argv:
    old = json.load(open(state))
    c.execute('update Exercise set name=? where id=?', (old['ex'], 'ex_bb_back_squat'))
    for wid, t in old['titles'].items(): c.execute('update Workout set title=? where id=?', (t, wid))
    c.execute('update SeasonAnchorSegment set value=? where id=?', (old['anchor'], 'cmw6enqsj00pu7dqrecv0211o'))
    c.commit(); os.remove(state); print('undone'); sys.exit()
old = {'ex': c.execute("select name from Exercise where id='ex_bb_back_squat'").fetchone()[0], 'titles': {},
       'anchor': c.execute("select value from SeasonAnchorSegment where id='cmw6enqsj00pu7dqrecv0211o'").fetchone()[0]}
c.execute('update Exercise set name=? where id=?', (EX, 'ex_bb_back_squat'))
for sid, t in SESS.items():
    wid = c.execute('select workoutId from WorkoutSession where id=?', (sid,)).fetchone()[0]
    old['titles'][wid] = c.execute('select title from Workout where id=?', (wid,)).fetchone()[0]
    c.execute('update Workout set title=? where id=?', (t, wid))
c.execute("update SeasonAnchorSegment set value=1055 where id='cmw6enqsj00pu7dqrecv0211o'")
c.commit(); json.dump(old, open(state, 'w')); print(len(EX), repr(EX), len(T80), len(V80))
