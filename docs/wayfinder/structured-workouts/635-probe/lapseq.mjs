import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'node:fs'
for (const f of process.argv.slice(2)) {
  const { messages: m } = new Decoder(Stream.fromBuffer(fs.readFileSync(f))).read({ convertTypesToStrings: true })
  console.log('==', f.split('/').pop(), m.fileIdMesgs[0].garminProduct, m.workoutMesgs?.[0]?.wktName)
  for (const s of m.workoutStepMesgs ?? []) console.log('  step', s.messageIndex, s.intensity ?? '', s.durationType, s.durationTime ?? s.durationDistance ?? '', s.durationStep ?? '', s.repeatSteps ?? '')
  console.log('  laps', m.lapMesgs.map(l => `${l.wktStepIndex ?? '-'}/${l.intensity ?? ''}:${Math.round(l.totalTimerTime)}s:${Math.round(l.totalDistance ?? 0)}m:${l.lapTrigger}`).join('  '))
  const ev = (m.eventMesgs ?? []).filter(e => !['hrLowAlert','hrHighAlert','speedHighAlert','speedLowAlert'].includes(e.event)).map(e => `${e.event}/${e.eventType}${e.data!=null?'='+e.data:''}`)
  console.log('  events', ev.join(' '))
}
