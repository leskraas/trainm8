import { V2_OPTS } from './v3.ts'
import { flips, HEADER, row, runVariant, summarize, T, type Variant } from './run.ts'

const B = { ...V2_OPTS, gate: 'contrast' as const }
const C = { ...V2_OPTS, emit: 'every' as const, trimFlankReps: true }
const BC = { ...B, emit: 'every' as const, trimFlankReps: true }
const D = { ...T }
const BCD = { ...BC, ...T, gate: 'contrast' as const, emit: 'every' as const, trimFlankReps: true }
const variants: Variant[] = [
	{ name: 'v2 shipped (label power)', profile: 'label-power', laps: 'none', opts: 'shipped' },
	{ name: 'v2 shipped (seed)', profile: 'seed', laps: 'none', opts: 'shipped' },
	{ name: 'prototype = v2 (sanity)', profile: 'label-power', laps: 'none', opts: V2_OPTS },
	{ name: '(a) typed laps', profile: 'label-power', laps: 'typed', opts: { ...V2_OPTS, typedLaps: true } },
	{ name: '(a) typed laps ±3 s jitter', profile: 'label-power', laps: 'typed-jitter', opts: { ...V2_OPTS, typedLaps: true } },
	{ name: '(a) typed laps, seed profile', profile: 'seed', laps: 'typed', opts: { ...V2_OPTS, typedLaps: true } },
	{ name: '(b) contrast gate', profile: 'label-power', laps: 'none', opts: B },
	{ name: '(b) contrast gate, seed', profile: 'seed', laps: 'none', opts: B },
	{ name: '(b) no sustained', profile: 'label-power', laps: 'none', opts: { ...B, sustained: false } },
	{ name: '(c) every rep (v2 gate)', profile: 'label-power', laps: 'none', opts: C },
	{ name: '(c) every rep, untyped step laps', profile: 'label-power', laps: 'untyped', opts: C },
	{ name: 'v2, untyped step laps', profile: 'label-power', laps: 'untyped', opts: V2_OPTS },
	{ name: '(d) tuned segmentation (v2 miner)', profile: 'label-power', laps: 'none', opts: D },
	{ name: '(b+c)', profile: 'label-power', laps: 'none', opts: BC },
	{ name: '(b+c+d)', profile: 'label-power', laps: 'none', opts: BCD },
	{ name: '(b+c+d), seed', profile: 'seed', laps: 'none', opts: BCD },
	{ name: '(b+c+d), HR rung', profile: 'hr', laps: 'none', opts: BCD },
	{ name: '(b+c+d) + snap', profile: 'label-power', laps: 'none', opts: { ...BCD, snap: true } },
	{ name: '(b+c+d), untyped step laps', profile: 'label-power', laps: 'untyped', opts: BCD },
	{ name: '(b+c+d), 1 km auto-laps as edges', profile: 'label-power', laps: 'auto-1km', opts: BCD },
	{ name: '(a+b+c+d)', profile: 'label-power', laps: 'typed', opts: { ...BCD, typedLaps: true } },
]
const only = process.argv[2]
console.log(HEADER)
for (const v of variants) {
	if (only && !v.name.includes(only)) continue
	const rows = runVariant(v)
	const f = process.argv.includes('--flips') ? flips(v) : ''
	console.log(row(v.name, summarize(rows), f))
	if (process.argv.includes('--verbose')) {
		for (const r of rows) {
			const p = r.s.prediction
			if (r.a.label.kind !== 'structured' && !p.structured) continue
			const L = r.a.label as any
			console.log(`    ${r.a.id} ${r.a.title.slice(0, 22).padEnd(22)} ${r.a.label.kind === 'structured' ? `${L.reps}x${L.workSec}/${L.recoverySec}` : r.a.label.kind} → ${p.structured ? `${p.grade} ${p.reps}x${p.work?.durationSec}/${p.recoverySec}` : 'no'} ${r.iv ? `iv ${r.iv.hits}/${r.iv.truth}` : ''} ${JSON.stringify(r.parts ?? {})}`)
		}
	}
}
