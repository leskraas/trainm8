import { V2_OPTS, type Opts } from './v3.ts'
import { HEADER, row, runVariant, summarize, T } from './run.ts'

export const BEST: Opts = { ...V2_OPTS, ...T, gate: 'contrast', emit: 'every', trimFlankReps: true, minK: 3, requireFlanks: true, sustained: false, penaltyFactor: 0.5, medianWindow: 1 }
;(globalThis as any).__dbg = true
const o = { ...BEST, ...JSON.parse(process.argv[2] ?? '{}') }
const prof = process.argv[3] ?? 'label-power'
const laps = (process.argv[4] ?? 'none') as any
const rows = runVariant({ name: 'x', profile: prof, laps, opts: o })
console.log(HEADER)
console.log(row(JSON.stringify(process.argv[2] ?? {}), summarize(rows)))
for (const r of rows) {
	const p = r.s.prediction
	if (r.a.label.kind !== 'structured' && !p.structured) continue
	const L = r.a.label as any
	console.log(`    ${r.a.id} ${r.a.title.slice(0, 22).padEnd(22)} ${r.a.label.kind === 'structured' ? `${L.reps}x${L.workSec}/${L.recoverySec}` : r.a.label.kind + ':' + (L.reason ?? '')} → ${p.structured ? `${p.grade} ${p.reps}x${p.work?.durationSec}/${p.recoverySec}` : 'no'} ${r.iv ? `iv ${r.iv.hits}/${r.iv.truth}` : ''} ${JSON.stringify(r.parts ?? {})}`)
}
