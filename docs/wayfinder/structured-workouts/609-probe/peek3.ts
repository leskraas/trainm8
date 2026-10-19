import { analyzeV3 } from './v3.ts'
import { corpus, profile, T } from './run.ts'
const id = process.argv[2]!
const pf = Number(process.argv[3] ?? 2)
const a = corpus.activities.find((x) => x.id === id)!
const o = { ...T, gate: 'contrast' as const, emit: 'every' as const, trimFlankReps: true, penaltyFactor: pf }
// expose segments by monkey: rerun tuned segmentation via a debug flag
;(globalThis as any).__dbg = true
const r = analyzeV3(a.stream, profile('label-power'), undefined, o)
console.log(JSON.stringify(r.parts), r.intervals.filter((i) => i.role === 'work').length)
console.log(((globalThis as any).__segs ?? []).map((s: any) => `${s.startSec}+${s.dur}:${Math.round(s.h)}`).join(' '))
