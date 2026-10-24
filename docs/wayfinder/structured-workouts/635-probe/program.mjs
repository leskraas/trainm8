// Run each file's workout_step program as the watch would and line it up with the laps' wkt_step_index.
import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'node:fs'
function run(steps) {
  const out = [], cnt = {}; let pc = 0, guard = 0
  while (pc < steps.length && guard++ < 5000) {
    const s = steps[pc]
    if (s.durationType === 'repeatUntilStepsCmplt') { cnt[pc] = (cnt[pc] ?? 1) + 1; if (cnt[pc] <= s.repeatSteps) { pc = s.durationStep; continue } cnt[pc] = undefined
      // reset inner repeat counters between durationStep and pc
      pc++; continue }
    out.push(pc); pc++
  }
  return out
}
for (const f of process.argv.slice(2)) {
  const { messages: m } = new Decoder(Stream.fromBuffer(fs.readFileSync(f))).read({ convertTypesToStrings: true })
  const steps = m.workoutStepMesgs ?? []; if (!steps.length) continue
  const prog = run(steps)
  const laps = m.lapMesgs.map(l => ({ i: l.wktStepIndex, t: Math.round(l.totalTimerTime), trig: l.lapTrigger }))
  // collapse consecutive laps with the same index (manual laps inside one step)
  const seq = []; for (const l of laps) { const last = seq.at(-1); if (last && last.i === l.i && l.i != null && l.trig !== 'time' && last.trig==='manual' && false) last.n++; else seq.push({ ...l, n: 1 }) }
  const idx = seq.filter(l => l.i != null).map(l => l.i)
  const same = JSON.stringify(idx) === JSON.stringify(prog)
  const noIdx = laps.map((l, k) => l.i == null ? `${k}:${l.t}s:${l.trig}` : null).filter(Boolean)
  const short = laps.map((l, k) => l.i != null && l.t < 10 ? `${k}:i${l.i}:${l.t}s:${l.trig}` : null).filter(Boolean)
  let note = ''
  if (!same) { let k = 0; while (k < idx.length && idx[k] === prog[k]) k++; note = `diverge at ${k}: laps ${idx.slice(k, k+6)} prog ${prog.slice(k, k+6)} (laps ${idx.length}, prog ${prog.length})` }
  console.log(f.split('/').pop().replace('.fit',''), m.workoutMesgs?.[0]?.wktName, same ? 'MATCH' : 'DIFF', note, noIdx.length ? 'noIdx ' + noIdx.join(' ') : '', short.length ? 'short ' + short.join(' ') : '')
}
