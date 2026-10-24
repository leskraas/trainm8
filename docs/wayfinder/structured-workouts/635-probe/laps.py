import json,sys
d=json.load(open(sys.argv[1]))['messages']
print('file_id',{k:v for k,v in d['fileIdMesgs'][0].items()})
print('file_creator',d.get('fileCreatorMesgs'))
print('training_file',d.get('trainingFileMesgs'))
print('workout',d.get('workoutMesgs'),'workout_step',len(d.get('workoutStepMesgs',[])))
s=d['sessionMesgs'][0]
print('session',{k:s.get(k) for k in ['sport','subSport','numLaps','firstLapIndex','totalElapsedTime','totalTimerTime','trigger','event','poolLength','poolLengthUnit','numActiveLengths','totalCycles']})
dev=d.get('deviceInfoMesgs',[])[0]; print('device0',{k:dev.get(k) for k in ['manufacturer','garminProduct','product','softwareVersion','deviceIndex']})
t0=d['lapMesgs'][0]['startTime']
import datetime
def ts(x): return datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()
keys=set()
for l in d['lapMesgs']: keys|=set(l)
print('lap keys',sorted(keys))
for i,l in enumerate(d['lapMesgs']):
  print(i, round(ts(l['startTime'])-ts(t0)), round(l.get('totalElapsedTime',0)), round(l.get('totalTimerTime',0)), round(l.get('totalDistance') or 0), l.get('intensity'), l.get('wktStepIndex'), l.get('lapTrigger'), l.get('event'), l.get('eventType'), l.get('avgPower'), l.get('avgSpeed') and round(l['avgSpeed'],2), l.get('numLengths'), l.get('firstLengthIndex'), l.get('numActiveLengths'), l.get('swimStroke'))
