import { V2_OPTS, type Opts } from './v3.ts'
import { flips, HEADER, row, runVariant, summarize, T, type Variant } from './run.ts'

const SEG: Partial<Opts> = { ...T, penaltyFactor: 0.5, medianWindow: 1 }
const GATE: Partial<Opts> = { gate: 'contrast', minK: 3, requireFlanks: true, sustained: false }
export const V3: Opts = { ...V2_OPTS, ...SEG, ...GATE, emit: 'every' }

const alone: Variant[] = [
	{ name: 'v2 shipped', profile: 'label-power', laps: 'none', opts: 'shipped' },
	{ name: '(a) typed laps only', profile: 'label-power', laps: 'typed', opts: { ...V2_OPTS, typedLaps: true } },
	{ name: '(b) contrast gate only', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, ...GATE } },
	{ name: '(c) every rep only', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, emit: 'every', trimFlankReps: true } },
	{ name: '(d) segmentation only', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, ...SEG } },
	{ name: '(b+c)', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, ...GATE, emit: 'every' } },
	{ name: '(b+d), v2 emission', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, ...SEG, ...GATE, emit: 'v2' } },
	{ name: '(c+d), v2 gate', profile: 'label-power', laps: 'none', opts: { ...V2_OPTS, ...SEG, emit: 'every' } },
	{ name: '(b+c+d)', profile: 'label-power', laps: 'none', opts: V3 },
	{ name: '(b+c+d) + snap', profile: 'label-power', laps: 'none', opts: { ...V3, snap: true } },
	{ name: '(b+c+d) pace edges, not speed', profile: 'label-power', laps: 'none', opts: { ...V3, speed: false } },
	{ name: '(a+b+c+d) = v3', profile: 'label-power', laps: 'typed', opts: { ...V3, typedLaps: true } },
]
const across: Variant[] = [
	{ name: 'v3, seed profile', profile: 'seed', laps: 'none', opts: V3 },
	{ name: 'v3, label pace', profile: 'label-pace', laps: 'none', opts: V3 },
	{ name: 'v3, label power', profile: 'label-power', laps: 'none', opts: V3 },
	{ name: 'v3, HR rung', profile: 'hr', laps: 'none', opts: V3 },
	{ name: 'v3, no power meter (label pace)', profile: 'label-pace', laps: 'none', opts: V3, dropPower: true },
	{ name: 'v3, stream at 10 s', profile: 'label-power', laps: 'none', opts: V3, res: 10 },
	{ name: 'v3, stream at 15 s', profile: 'label-power', laps: 'none', opts: V3, res: 15 },
	{ name: 'v3, untyped step laps*', profile: 'label-power', laps: 'untyped', opts: V3 },
	{ name: 'v3, typed step laps*', profile: 'label-power', laps: 'typed', opts: { ...V3, typedLaps: true } },
	{ name: 'v3, typed step laps ±3 s*', profile: 'label-power', laps: 'typed-jitter', opts: { ...V3, typedLaps: true } },
	{ name: 'v3, typed step laps*, seed', profile: 'seed', laps: 'typed', opts: { ...V3, typedLaps: true } },
	{ name: 'v3, 1 km auto-laps used as edges*', profile: 'label-power', laps: 'auto-1km', opts: V3 },
]
const which = process.argv[2] ?? 'alone'
console.log(HEADER)
for (const v of which === 'alone' ? alone : across) {
	const rows = runVariant(v)
	console.log(row(v.name, summarize(rows), v.opts === 'shipped' || process.argv.includes('--flips') ? flips(v) : ''))
}
