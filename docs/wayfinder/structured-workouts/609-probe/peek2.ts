import { readFileSync } from 'node:fs'
import { buildSegments } from '#app/utils/structure-detection/segments.ts'
import { resolveClassifier } from '#app/utils/structure-detection/classify.ts'
import { mineStructure } from '#app/utils/structure-detection/mine.ts'
import { workoutStepLaps } from '#app/utils/structure-detection/eval/label.ts'
const corpus = JSON.parse(readFileSync('tests/fixtures/detection/corpus.json', 'utf8'))
const p = corpus.profiles.find((x: any) => x.name === 'label-power').profile
for (const a of corpus.activities.filter((x: any) => x.label.kind === 'structured')) {
	const cl = resolveClassifier('run', p, a.stream)!
	const laps = workoutStepLaps(a.stream, a.label.work)
	const seg = buildSegments(a.stream, 'run', cl, laps)!
	const h = mineStructure(seg, cl)!
	console.log(a.title, '|', seg.segments.slice(0, 4).map((s) => `${s.durationSec}s@${Math.round(s.value)}`).join(' '), '|', JSON.stringify(h.blocks.map((b) => [b.repeat, b.steps.map((s) => s.role + Math.round(s.durationSec))])), JSON.stringify(h.scoreParts))
}
