import { readFileSync } from 'node:fs'
import { analyze } from '#app/utils/structure-detection/analyze.ts'
import {
	isDetectionDiscipline,
	type DetectionDiscipline,
} from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'

/**
 * Ad-hoc calibration harness (not a test): run the pure `analyze` engine over the
 * seeded Strava corpus (`prisma/seed-data/kody-strava-history.json`, 50 real runs
 * with power+pace+HR) and print each activity's detection outcome. Used to
 * baseline detection and guard against over-detection regressions while tuning
 * the engine — steady/easy runs must stay `null`. Run: `tsx scripts/detection-calibration.ts`.
 */

const RUN_PROFILE: DisciplineProfileForResolver = {
	maxHr: 190,
	lthr: 168,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

const BIKE_PROFILE: DisciplineProfileForResolver = {
	maxHr: 188,
	lthr: 165,
	ftp: 250,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

type StoredStream = {
	resolutionSec: number
	timeSec: string
	power: string | null
	heartrate: string | null
	pace: string | null
}

type CorpusActivity = {
	externalId: string
	discipline: string
	durationSec: number
	distanceM: number | null
	stream?: StoredStream
}

/** Corpus streams are stored in the DB shape: channels are JSON-encoded strings. */
function parseStream(s: StoredStream) {
	const arr = (j: string | null): Array<number | null> | undefined =>
		j == null ? undefined : (JSON.parse(j) as Array<number | null>)
	const power = arr(s.power)
	const heartrate = arr(s.heartrate)
	const pace = arr(s.pace)
	return {
		resolutionSec: s.resolutionSec,
		timeSec: JSON.parse(s.timeSec) as number[],
		...(power ? { power } : {}),
		...(heartrate ? { heartrate } : {}),
		...(pace ? { pace } : {}),
	}
}

const corpus = JSON.parse(
	readFileSync('prisma/seed-data/kody-strava-history.json', 'utf8'),
) as { activities: CorpusActivity[] }

// Keep short reps legible (a 45 s work must not print as "1m"): sub-minute as
// seconds, otherwise m:ss.
const fmtDur = (s: number) => {
	const r = Math.round(s)
	if (r < 60) return `${r}s`
	return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`
}

let detected = 0
let nullCount = 0
const rows: string[] = []

for (const a of corpus.activities) {
	if (!isDetectionDiscipline(a.discipline)) continue
	const discipline = a.discipline as DetectionDiscipline
	if (!a.stream) {
		rows.push(`${a.externalId}\t${discipline}\tNO-STREAM`)
		continue
	}
	const profile = discipline === 'bike' ? BIKE_PROFILE : RUN_PROFILE
	const result = analyze({
		stream: parseStream(a.stream),
		discipline,
		profile,
		laps: undefined,
	})
	if (!result) {
		nullCount++
		rows.push(`${a.externalId}\t${discipline}\t${fmtDur(a.durationSec)}\tnull`)
		continue
	}
	detected++
	const blocks = result.structure.blocks
	const shape = blocks
		.map(
			(b) =>
				`${b.repeatCount}x[${b.steps.map((s) => fmtDur(('durationSec' in s ? s.durationSec : 0) ?? 0)).join('+')}]`,
		)
		.join(' → ')
	rows.push(
		`${a.externalId}\t${discipline}\t${fmtDur(a.durationSec)}\t${result.confidence}\t${shape}`,
	)
}

console.log(rows.join('\n'))
console.log(
	`\nSUMMARY: detected=${detected} null=${nullCount} total=${detected + nullCount}`,
)
