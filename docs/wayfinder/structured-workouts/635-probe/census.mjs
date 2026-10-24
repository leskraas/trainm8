import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'node:fs'
const rows = []
for (const f of process.argv.slice(2)) {
  const { messages: m } = new Decoder(Stream.fromBuffer(fs.readFileSync(f))).read({ convertTypesToStrings: true })
  const fid = m.fileIdMesgs[0], laps = m.lapMesgs ?? []
  rows.push([f.split('/').pop().replace('.fit',''), fid.manufacturer, fid.garminProduct ?? fid.product, m.fileCreatorMesgs?.[0]?.softwareVersion, fid.timeCreated?.toISOString?.().slice(0,10) ?? fid.timeCreated, (m.workoutMesgs??[]).length, (m.workoutStepMesgs??[]).length, laps.filter(l=>l.wktStepIndex!=null).length+'/'+laps.length, [...new Set(laps.map(l=>l.intensity??'-'))].join(','), laps.some(l=>l.repetitionNum!=null)?'rep':'', (m.trainingFileMesgs??[]).length?'tf':'', (m.splitSummaryMesgs??[]).length?'split':''].join('\t'))
}
console.log(rows.sort((a,b)=>a.split('\t')[4]<b.split('\t')[4]?-1:1).join('\n'))
