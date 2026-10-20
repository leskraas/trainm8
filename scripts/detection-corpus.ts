import { readFileSync, writeFileSync } from 'node:fs'
import { invariant } from '@epic-web/invariant'
import { parseStoredStream } from '#app/utils/activity-stream.ts'
import {
	fitTemplate,
	parseTitleScheme,
	windowMeans,
} from '#app/utils/structure-detection/eval/label.ts'
import {
	type CorpusActivity,
	type CorpusProfile,
	type DetectionCorpus,
	type DetectionLabel,
	type StructuredLabel,
} from '#app/utils/structure-detection/eval/types.ts'
import { median } from '#app/utils/structure-detection/signal.ts'
import { isDetectionDiscipline } from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'

/**
 * Freeze the detection scoreboard's corpus (map #600, ticket #605) into
 * `tests/fixtures/detection/corpus.json`: kody's real Strava runs as the engine
 * reads them, each with its label from `tests/fixtures/detection/labels.json`.
 * A structured label's scheme comes from the athlete's title and is placed on
 * the stream by template fit. Re-run after editing a label:
 *
 *   npm run detection:corpus
 */

const SOURCE = 'prisma/seed-data/kody-strava-history.json'
const LABELS = 'tests/fixtures/detection/labels.json'
const OUT = 'tests/fixtures/detection/corpus.json'

/** kody's run profile exactly as `prisma/seed.ts` writes it. */
const SEED_RUN: DisciplineProfileForResolver = {
	maxHr: 190,
	lthr: 168,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

type SeedActivity = {
	externalId: string
	startedAt: string
	discipline: string
	rawJson: string
	stream: Parameters<typeof parseStoredStream>[0]
}

type HandLabel =
	/** `scheme` is the athlete's own word for an untitled session, read like a title. */
	| { kind: 'structured'; scheme?: string; note?: string }
	| Exclude<DetectionLabel, StructuredLabel>

const seed = JSON.parse(readFileSync(SOURCE, 'utf8')) as {
	activities: SeedActivity[]
}
const { labels } = JSON.parse(readFileSync(LABELS, 'utf8')) as {
	labels: Record<string, HandLabel>
}

const activities: CorpusActivity[] = []
for (const a of seed.activities) {
	if (!isDetectionDiscipline(a.discipline)) continue
	const stream = parseStoredStream(a.stream)
	if (!stream) continue
	const raw = JSON.parse(a.rawJson) as { name: string; device_name?: string }
	const hand = labels[a.externalId]
	invariant(hand, `No label for ${a.externalId} "${raw.name}"`)
	let label: DetectionLabel
	if (hand.kind === 'structured') {
		const scheme = parseTitleScheme(hand.scheme ?? raw.name)
		invariant(scheme, `Cannot read a scheme from "${hand.scheme ?? raw.name}"`)
		const fit = fitTemplate(stream, scheme)
		invariant(fit, `Cannot place "${raw.name}" on its stream`)
		label = {
			kind: 'structured',
			source: hand.scheme ? 'athlete' : 'title',
			title: hand.scheme ?? raw.name,
			reps: scheme.reps,
			workSec: scheme.workSec,
			recoverySec: fit.recoverySec,
			work: fit.work,
			workValue: round(windowMeans(stream, fit.work)),
			contrast: Math.round(fit.contrast * 100) / 100,
		}
	} else {
		label = hand
	}
	activities.push({
		id: a.externalId,
		source: 'strava',
		device: raw.device_name ?? null,
		discipline: a.discipline,
		title: raw.name,
		startedAt: a.startedAt,
		stream,
		// The Strava snapshot keeps no laps (0 of 53 carry any; findings #604).
		laps: null,
		label,
	})
}

// Thresholds read off the labels: the median work power and pace of the i3
// reps of three minutes or more (10x3, 5x6), the sessions closest to
// threshold. The seed's 240 s/km is a placeholder, not kody's.
const longI3 = activities
	.map((a) => a.label)
	.filter(
		(l): l is StructuredLabel =>
			l.kind === 'structured' && /\bi3\b/.test(l.title) && l.workSec >= 180,
	)
const cp = Math.round(median(longI3.map((l) => l.workValue.power!)))
const pace = Math.round(median(longI3.map((l) => l.workValue.pace!)))
const fromLabels = `median work of ${longI3.map((l) => `"${l.title}"`).join(' and ')}`

const profiles: CorpusProfile[] = [
	{
		name: 'seed',
		provenance:
			'kody run profile as prisma/seed.ts writes it (threshold pace 240 s/km)',
		profile: SEED_RUN,
	},
	{
		name: 'label-pace',
		provenance: `threshold pace ${pace} s/km = ${fromLabels}`,
		profile: { ...SEED_RUN, thresholdPaceSecPerKm: pace },
	},
	{
		name: 'label-power',
		provenance: `critical power ${cp} W = ${fromLabels}`,
		profile: {
			...SEED_RUN,
			thresholdPaceSecPerKm: pace,
			runPowerThresholdW: cp,
		},
	},
	{
		name: 'hr',
		provenance:
			'seed LTHR 168, no pace or power threshold, so the HR rung classifies',
		profile: { ...SEED_RUN, thresholdPaceSecPerKm: null },
	},
]

const corpus: DetectionCorpus = {
	frozenAt: new Date().toISOString().slice(0, 10),
	from: SOURCE,
	profiles,
	activities,
}
writeFileSync(OUT, JSON.stringify(corpus) + '\n')

const count = (k: DetectionLabel['kind']) =>
	activities.filter((a) => a.label.kind === k).length
console.log(
	`Froze ${activities.length} activities (${count('structured')} structured, ${count('unstructured')} unstructured, ${count('unlabelled')} unlabelled) to ${OUT}`,
)
for (const l of activities.map((a) => a.label)) {
	if (l.kind !== 'structured') continue
	console.log(
		`  ${l.title.padEnd(24)} ${l.reps}×${l.workSec}/${l.recoverySec} from ${l.work[0]!.startSec}s, work/recovery power ${l.contrast}`,
	)
}
for (const p of profiles) console.log(`  profile ${p.name}: ${p.provenance}`)

function round<T extends Record<string, number | undefined>>(o: T): T {
	return Object.fromEntries(
		Object.entries(o)
			.filter(([, v]) => v != null)
			.map(([k, v]) => [k, Math.round(v! * 10) / 10]),
	) as T
}
