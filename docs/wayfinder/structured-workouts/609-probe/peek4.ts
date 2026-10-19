import { analyzeV3 } from './v3.ts'
import { corpus, profile } from './run.ts'
import { BEST } from './one.ts'
const id = process.argv[2]!
const a = corpus.activities.find((x) => x.id === id)!
;(globalThis as any).__dbg = true
const r = analyzeV3(a.stream, profile('label-power'), undefined, { ...BEST, ...JSON.parse(process.argv[3] ?? '{}') })
console.log('truth', JSON.stringify((a.label as any).work?.map((w: any) => w.startSec)))
console.log(JSON.stringify(r.parts), r.intervals.filter((i) => i.role === 'work').map((i) => `${i.startSec}-${i.endSec}`).join(' '))
console.log(((globalThis as any).__segs ?? []).map((s: any) => `${s.startSec}+${s.dur}:${Math.round(s.h)}`).join(' '))
