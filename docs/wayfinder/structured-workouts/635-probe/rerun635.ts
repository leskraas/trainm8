// #635: v3* (d) on the scoreboard, frozen bulk laps vs the device originals' laps.
import { readFileSync } from 'node:fs'
import { readFitFile, sessionStream, type DeviceLap } from '#app/utils/structure-detection/eval/fit.ts'
import { isRestIntensity } from '#app/utils/structure-detection/eval/label.ts'
import { readPrediction, scoreActivity } from '#app/utils/structure-detection/eval/score.ts'
import { analyzeV3, V3 } from '../detection/v3-probe.ts'

const [origDir, bulkDir] = process.argv.slice(2)
const corpus = JSON.parse(readFileSync('tests/fixtures/detection/corpus.json', 'utf8'))
const profile = corpus.profiles.find((p: any) => p.name === 'label-power').profile
const ids = ['i163551672', 'i163549698', 'i163549295', 'i164415201']

// The scoreboard's own `lapsFor` (fit-eval.ts), with a switch for the warm-up/cool-down typing.
function typed(laps: DeviceLap[], opts: { wuCd: boolean; step: boolean }) {
	const workout = laps.some((l) => isRestIntensity(l.intensity) && l.endSec - l.startSec >= 5)
	if (!workout) return laps.map((l) => ({ startSec: l.startSec, endSec: l.endSec }))
	return laps.map((l) => ({
		startSec: l.startSec,
		endSec: l.endSec,
		intensity: isRestIntensity(l.intensity) ? 'rest' : opts.wuCd && (l.intensity === 'warmup' || l.intensity === 'cooldown') ? l.intensity : 'active',
		stepIndex: opts.step ? (l.wktStepIndex ?? 0) : 0,
	})) as any
}

for (const id of ids) {
	const a = corpus.fit.find((x: any) => x.id === id)
	const orig = readFitFile(new Uint8Array(readFileSync(`${origDir}/${id}.fit`)))
	const bulk = readFitFile(new Uint8Array(readFileSync(`${bulkDir}/${a.file}`)))
	const os = orig.sessions[0]!, bs = bulk.sessions[0]!
	const stream = sessionStream(bs.raw!)!
	const cases: Array<[string, any]> = [
		['bulk laps (frozen corpus)', typed(a.laps, { wuCd: true, step: true })],
		['original, warm-up/cool-down as active, no step index', typed(os.laps, { wuCd: false, step: false })],
		['original, typed warm-up/cool-down, no step index', typed(os.laps, { wuCd: true, step: false })],
		['original, typed + wkt_step_index', typed(os.laps, { wuCd: true, step: true })],
	]
	console.log(`\n${id} ${a.title}: label reps ${a.label.reps}, work windows ${a.label.work.length}; writer ${orig.writer.manufacturer}/${orig.writer.product}; laps bulk ${a.laps.length} orig ${os.laps.length}; start bulk ${bs.startedAt} orig ${os.startedAt}`)
	for (const [name, laps] of cases) {
		const r = analyzeV3(stream, profile, laps, { ...V3, typedLaps: true })
		const s = scoreActivity(a.label, readPrediction(r.detected, stream))
		const work = r.intervals.filter((i: any) => i.role === 'work')
		console.log(`  ${name}: grade ${r.detected?.grade ?? 'none'}, reps ${s.reps?.predicted}/${s.reps?.truth}, work ${work.map((w: any) => `${w.startSec}-${w.endSec}`).join(' ')}`)
	}
}
