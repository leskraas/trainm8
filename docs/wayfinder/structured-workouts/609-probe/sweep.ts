import { V2_OPTS, type Opts } from './v3.ts'
import { HEADER, row, runVariant, summarize, T } from './run.ts'

const base: Opts = { ...V2_OPTS, ...T, gate: 'contrast', emit: 'every', trimFlankReps: true, minK: 3, requireFlanks: true, sustained: false }
const grid: Array<[string, Partial<Opts>]> = []
const which = process.argv[2] ?? 'seg'
if (which === 'seg') {
	for (const noiseScale of [false, true])
		for (const pf of noiseScale ? [1, 2, 4, 8, 16] : [0.25, 0.5, 1, 2])
			for (const mw of [1, 3])
				grid.push([`noise=${noiseScale} pf=${pf} mw=${mw}`, { noiseScale, penaltyFactor: pf, medianWindow: mw }])
} else {
	const seg = JSON.parse(process.argv[3]!)
	for (const minK of [2, 3, 4])
		for (const requireFlanks of [false, true])
			for (const sustained of [false, true])
				grid.push([`minK=${minK} flanks=${requireFlanks} sust=${sustained}`, { ...seg, minK, requireFlanks, sustained }])
	for (const repMargin of [0.05, 0.1, 0.2, 0.3])
		grid.push([`repMargin=${repMargin}`, { ...seg, repMargin }])
	for (const flankMargin of [0, 0.04, 0.15, 0.25])
		grid.push([`flankMargin=${flankMargin}`, { ...seg, flankMargin }])
	for (const walkFrac of [0.5, 0.8])
		grid.push([`walkFrac=${walkFrac}`, { ...seg, walkFrac }])
	for (const maxDurCv of [0.15, 0.5])
		grid.push([`maxDurCv=${maxDurCv}`, { ...seg, maxDurCv }])
	grid.push([`speed=false`, { ...seg, speed: false }])
	grid.push([`minSegSec=5`, { ...seg, minSegSec: 5 }])
	grid.push([`minSegSec=20`, { ...seg, minSegSec: 20 }])
	grid.push([`no trim`, { ...seg, trimFlankReps: false }])
}
console.log(HEADER)
for (const [name, o] of grid) {
	const rows = runVariant({ name, profile: 'label-power', laps: 'none', opts: { ...base, ...o } })
	console.log(row(name, summarize(rows)))
}
