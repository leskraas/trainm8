import json,sys,datetime
d=json.load(open(sys.argv[1]))['messages']
def ts(x): return datetime.datetime.fromisoformat(x.replace('Z','+00:00')).timestamp()
print('file_id',d['fileIdMesgs'][0]); print('creator',d.get('fileCreatorMesgs'))
print('training_file',d.get('trainingFileMesgs'))
s=d['sessionMesgs'][0]; print('session',{k:v for k,v in s.items() if 'osition' not in k and k not in('necLat','necLong','swcLat','swcLong')})
t0=ts(s['startTime'])
print('records with position:',sum(1 for r in d['recordMesgs'] if r.get('positionLat') is not None), 'record keys', sorted(set().union(*[set(r) for r in d['recordMesgs']])))
print('events'); [print(' ',round(ts(e['timestamp'])-t0),{k:v for k,v in e.items() if k!='timestamp'}) for e in d['eventMesgs']]
print('laps')
for i,l in enumerate(d['lapMesgs']):
  print(' ',i,round(ts(l['startTime'])-t0),round(l['totalElapsedTime']),round(l['totalTimerTime']),l.get('totalDistance'),l.get('intensity'),l.get('wktStepIndex'),l.get('lapTrigger'),'len',l.get('firstLengthIndex'),l.get('numLengths'),l.get('numActiveLengths'),l.get('swimStroke'),l.get('subSport'))
print('lengths')
for l in d['lengthMesgs']:
  print(' ',l.get('messageIndex'),round(ts(l['startTime'])-t0),round(l['totalElapsedTime'],1),round(l['totalTimerTime'],1),l.get('lengthType'),l.get('swimStroke'),l.get('totalStrokes'),l.get('avgSwimmingCadence'),l.get('event'),l.get('eventType'), round(l.get('avgSpeed') or 0,2))
