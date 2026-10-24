import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'node:fs'
const st = { files: 0, workoutFiles: 0, laps: 0, idxLaps: 0, repNum: 0, shortManual: 0, shortManualFiles: new Set(), sameIdxRuns: 0, sameIdxTriggers: {}, postNoIdx: 0, postNoIdxFiles: 0, postIdxLast: 0, firstRestLappedThrough: 0, trailingNoIdx: {}, gps: 0, lapIntensityNull: 0, triggers: {} }
for (const f of process.argv.slice(2)) {
  const { messages: m } = new Decoder(Stream.fromBuffer(fs.readFileSync(f))).read({ convertTypesToStrings: true })
  st.files++; if ((m.recordMesgs ?? []).some(r => r.positionLat != null)) st.gps++
  const laps = m.lapMesgs ?? []; const isW = laps.some(l => l.wktStepIndex != null); if (!isW) continue
  st.workoutFiles++
  for (let k = 0; k < laps.length; k++) { const l = laps[k]; st.laps++; if (l.wktStepIndex != null) st.idxLaps++; if (l.repetitionNum != null) st.repNum++; if (l.intensity == null) st.lapIntensityNull++
    st.triggers[l.lapTrigger] = (st.triggers[l.lapTrigger] ?? 0) + 1
    if (l.wktStepIndex != null && l.totalTimerTime < 5 && l.lapTrigger === 'manual') { st.shortManual++; st.shortManualFiles.add(f) }
    const p = laps[k-1]; if (p && p.wktStepIndex != null && p.wktStepIndex === l.wktStepIndex) { st.sameIdxRuns++; st.sameIdxTriggers[p.lapTrigger] = (st.sameIdxTriggers[p.lapTrigger] ?? 0) + 1 }
  }
  const lastIdx = laps.findLastIndex(l => l.wktStepIndex != null)
  if (lastIdx < laps.length - 1) { st.postNoIdxFiles++; st.postNoIdx += laps.length - 1 - lastIdx; const t = laps.slice(lastIdx+1).map(l=>l.intensity ?? 'null').join(','); st.trailingNoIdx[t] = (st.trailingNoIdx[t] ?? 0) + 1 }
}
st.shortManualFiles = st.shortManualFiles.size
console.log(JSON.stringify(st, null, 1))
