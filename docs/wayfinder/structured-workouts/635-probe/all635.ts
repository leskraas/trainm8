// #635: v3* (d) over the FIT half's 97 structured sessions, frozen bulk laps vs device-original laps.
import { readFileSync } from 'node:fs'
import { readFitFile, sessionStream, type DeviceLap } from '#app/utils/structure-detection/eval/fit.ts'
import { isRestIntensity } from '#app/utils/structure-detection/eval/label.ts'
import { readPrediction, scoreActivity } from '#app/utils/structure-detection/eval/score.ts'
import { analyzeV3, V3 } from '../detection/v3-probe.ts'
const [origDir, bulkDir] = process.argv.slice(2)
const corpus = JSON.parse(readFileSync('tests/fixtures/detection/corpus.json', 'utf8'))
const profile = corpus.profiles.find((p: any) => p.name === 'label-power').profile
type O = { wuCd: boolean; step: boolean; minActive?: number; fromProgram?: boolean }
function lapsFor(laps0: DeviceLap[], o: O, steps: any[] = []) {
	if (laps0.length < 2) return undefined
	const laps = o.fromProgram ? laps0.map((l) => ({ ...l, intensity: l.intensity ?? steps.find((s) => s.messageIndex === l.wktStepIndex)?.intensity ?? null })) : laps0
	const workout = laps.some((l) => isRestIntensity(l.intensity) && l.endSec - l.startSec >= 5)
	if (!workout) return laps.map((l) => ({ startSec: l.startSec, endSec: l.endSec }))
	const ls = o.minActive ? laps.filter((l) => isRestIntensity(l.intensity) || l.endSec - l.startSec >= o.minActive!) : laps
	return ls.map((l) => ({
		startSec: l.startSec, endSec: l.endSec,
		intensity: isRestIntensity(l.intensity) ? 'rest' : o.wuCd && (l.intensity === 'warmup' || l.intensity === 'cooldown') ? l.intensity : 'active',
		stepIndex: o.step ? (l.wktStepIndex ?? 0) : 0,
	})) as any
}
const variants: Array<[string, 'bulk' | 'orig', O]> = [
	['bulk laps (today\'s (d))', 'bulk', { wuCd: true, step: true }],
	['original, warm-up/cool-down read as active', 'orig', { wuCd: false, step: false }],
	['original, typed warm-up/cool-down', 'orig', { wuCd: true, step: false }],
	['original, typed + wkt_step_index', 'orig', { wuCd: true, step: true }],
	['original, typed + step index, active laps < 5 s dropped', 'orig', { wuCd: true, step: true, minActive: 5 }],
	['original, role from lap, else from its workout_step', 'orig', { wuCd: true, step: true, fromProgram: true }],
	['  … and active laps < 5 s dropped', 'orig', { wuCd: true, step: true, fromProgram: true, minActive: 5 }],
]
const exact = variants.map(() => 0), claimedHigh = variants.map(() => 0), absErr = variants.map(() => 0)
const writers: Record<string, number> = {}, intens: Record<string, number> = {}, idxLaps = { with: 0, without: 0 }, rows: string[] = []
let n = 0, workoutFiles = 0, wkSteps = 0
for (const a of corpus.fit) {
	if (a.label.kind !== 'structured' || a.label.source === 'title') continue
	const id = a.id.split('#')[0], si = Number(a.id.split('#')[1] ?? 0)
	const bulk = readFitFile(new Uint8Array(readFileSync(`${bulkDir}/${a.file}`))).sessions[si]!
	let orig
	try { orig = readFitFile(new Uint8Array(readFileSync(`${origDir}/${id}.fit`))) } catch (e) { rows.push(`${a.id} decode error ${e}`); continue }
	n++
	const w = `${orig.writer.manufacturer}/${orig.writer.product}`; writers[w] = (writers[w] ?? 0) + 1
	wkSteps += orig.workoutSteps.length
	const os = orig.sessions[si]!
	if (os.laps.some((l) => l.wktStepIndex != null)) workoutFiles++
	for (const l of os.laps) { intens[l.intensity ?? 'null'] = (intens[l.intensity ?? 'null'] ?? 0) + 1; l.wktStepIndex != null ? idxLaps.with++ : idxLaps.without++ }
	const stream = sessionStream(bulk.raw!)!
	const cells: string[] = []
	variants.forEach(([, src, o], k) => {
		const laps = lapsFor(src === 'bulk' ? a.laps : os.laps, o, orig.workoutSteps)
		const r = analyzeV3(stream, profile, laps, { ...V3, typedLaps: true })
		const sc = scoreActivity(a.label, readPrediction(r.detected, stream))
		const ok = sc.reps?.predicted === sc.reps?.truth
		exact[k] += +ok; absErr[k] += Math.abs((sc.reps?.predicted ?? 0) - (sc.reps?.truth ?? 0))
		if (r.detected?.confidence === 'high') claimedHigh[k]++
		cells.push(`${sc.reps?.predicted}${r.detected?.confidence === "high" ? "" : "~"}`)
	})
	rows.push(`${a.id} | ${a.title} | ${w} | wks${orig.workoutSteps.length} | ${[...new Set(os.laps.map((l) => l.intensity))].join(",")} | ${a.label.reps} | ${cells.join(' | ')}`)
}
console.log({ n, writers, workoutFiles, workoutStepMessages: wkSteps, lapIntensity: intens, idxLaps })
variants.forEach(([name], k) => console.log(`| ${name} | ${exact[k]}/${n} | ${(absErr[k] / n).toFixed(1)} | ${claimedHigh[k]}/${n} |`))
console.log(rows.join('\n'))
