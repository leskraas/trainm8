import sqlite3
c=sqlite3.connect('/tmp/trainm8-verify/db/data.db')
K='cmw6qm0ry000f7d43ffraxcof'  # kody
S='stock_run-A1'
def w(id,title,vis='private',owner=None,fork=None):
    c.execute("insert into Workout(id,title,discipline,intent,authorship,visibility,updatedAt,ownerId,copiedFromId) values(?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?)",(id,title,'run','easy','athlete',vis,owner,fork))
w('orph-free','ORPH free (erase)','public')
c.execute("insert into Attribution(id,workoutId,workoutAuthorship,displayName,updatedAt) values('attr-free','orph-free','athlete','Gone Person',CURRENT_TIMESTAMP)")
w('orph-held','ORPH held by kody session','public')
c.execute("insert into Attribution(id,workoutId,workoutAuthorship,displayName,updatedAt) values('attr-held','orph-held','athlete','Gone Person',CURRENT_TIMESTAMP)")
c.execute("insert into CatalogueEntry(id,workoutId,workoutAuthorship,archetype,updatedAt) values('entry-held','orph-held','athlete','easy',CURRENT_TIMESTAMP)")
c.execute("insert into WorkoutSession(id,scheduledAt,userId,workoutId,updatedAt) values('sess-held',datetime('now','+1 day'),?,?,CURRENT_TIMESTAMP)",(K,'orph-held'))
w('orph-mid','ORPH mid fork',fork=S)           # orphan fork of cited stock
w('kody-fork','Kody fork of orph-mid',owner=K,fork='orph-mid')
w('orph-solo','ORPH solo parent')               # no surviving ancestor
w('kody-fork2','Kody fork of orph-solo',owner=K,fork='orph-solo')
w('orph-saved','ORPH saved by kody','public')
c.execute("insert into CatalogueSave(id,workoutId,ownerId) values('save1','orph-saved',?)",(K,))
w('owned-pub','Kody owned public',vis='public',owner=K)
c.commit()
