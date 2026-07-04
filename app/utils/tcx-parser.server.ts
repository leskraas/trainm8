import { XMLParser } from 'fast-xml-parser'
import { type ActivityImportInput } from './activity-import.server.ts'

type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

const PARSER = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	isArray: (name) => ['Activity', 'Lap', 'Track', 'Trackpoint'].includes(name),
})

/**
 * A TCX `<Lap>`: the device's own per-lap summary. Aggregates are earned from
 * these — never re-derived when the device wrote them.
 */
type TcxLap = {
	'@_StartTime'?: string
	TotalTimeSeconds?: number
	DistanceMeters?: number
	MaximumSpeed?: number
	Cadence?: number
	AverageHeartRateBpm?: { Value?: number }
	MaximumHeartRateBpm?: { Value?: number }
	Track?: Array<{ Trackpoint?: TcxTrackpoint[] }>
	Extensions?: {
		'ns3:LX'?: TcxLapExtension
		LX?: TcxLapExtension
	}
}

type TcxLapExtension = {
	'ns3:AvgWatts'?: number
	AvgWatts?: number
	'ns3:MaxWatts'?: number
	MaxWatts?: number
}

type TcxTrackpoint = {
	Time?: string
	AltitudeMeters?: number
}

/**
 * Maps the TCX `Activity/@Sport` attribute (schema-restricted to `Running` |
 * `Biking` | `Other`) to a trainm8 Discipline. Private to the TCX parser
 * (ADR 0014: each source owns its own mapping). `Other` — which is also where
 * TCX puts swims — collapses to `'other'` (ADR 0015): inbox-only, no
 * auto-match, no Training Load contribution. The athlete can correct a swim
 * via the single-file Discipline override.
 */
function tcxSportToDiscipline(sport: string | undefined): string {
	switch (sport) {
		case 'Running':
			return 'run'
		case 'Biking':
			return 'bike'
		default:
			return 'other'
	}
}

/**
 * Parse a TCX (Garmin Training Center) document and reduce it to the same
 * provider-neutral activity shape `parseGpx` / `parseFit` return. Aggregates
 * come from the file's `<Lap>` summaries — time-weighted across laps where a
 * lap-level average exists; channels the device didn't write stay absent
 * (Unavailable Metric), never estimated. Elevation gain is the one derived
 * value: TCX has no lap-level ascent, so it is summed from trackpoint
 * altitude deltas when present.
 */
export function parseTcx(content: string): ParsedActivity {
	const doc = PARSER.parse(content)
	const activities = doc?.TrainingCenterDatabase?.Activities?.Activity as
		| Array<Record<string, unknown>>
		| undefined
	const activity = activities?.[0]
	if (!activity) {
		throw new Error('Not a valid TCX file (no activity found)')
	}

	const laps = (activity.Lap ?? []) as TcxLap[]
	const startedAtStr = laps[0]?.['@_StartTime']
	const startedAt = startedAtStr ? new Date(startedAtStr) : null
	if (!startedAt || isNaN(startedAt.getTime())) {
		throw new Error('TCX activity has no start time')
	}

	const durationSec = Math.round(
		sum(laps, (lap) => asNumber(lap.TotalTimeSeconds)),
	)
	if (durationSec <= 0) {
		throw new Error('TCX activity has no duration')
	}
	const distanceM = sum(laps, (lap) => asNumber(lap.DistanceMeters))

	// End of the last lap (its own start + its own timer), not startedAt +
	// total: gaps between laps (paused recordings) belong to no lap.
	const lastLap = laps[laps.length - 1]!
	const lastLapStart = lastLap['@_StartTime']
		? new Date(lastLap['@_StartTime'])
		: startedAt
	const endedAt = new Date(
		(isNaN(lastLapStart.getTime()) ? startedAt : lastLapStart).getTime() +
			Math.round(asNumber(lastLap.TotalTimeSeconds) ?? 0) * 1000,
	)

	const paceAvgSecPerKm =
		distanceM != null && distanceM > 0
			? durationSec / (distanceM / 1000)
			: null

	return {
		startedAt,
		endedAt,
		durationSec,
		distanceM: distanceM != null ? Math.round(distanceM) : null,
		discipline: tcxSportToDiscipline(
			typeof activity['@_Sport'] === 'string' ? activity['@_Sport'] : undefined,
		),
		hrAvg: timeWeightedAvg(laps, (lap) =>
			asNumber(lap.AverageHeartRateBpm?.Value),
		),
		hrMax: max(laps, (lap) => asNumber(lap.MaximumHeartRateBpm?.Value)),
		powerAvg: timeWeightedAvg(laps, (lap) => lapAvgWatts(lap)),
		powerMax: max(laps, (lap) => lapMaxWatts(lap)),
		cadenceAvg: timeWeightedAvg(laps, (lap) => asNumber(lap.Cadence)),
		paceAvgSecPerKm,
		speedMaxMps: max(laps, (lap) => asNumber(lap.MaximumSpeed)),
		elevationGainM: elevationGain(laps),
	}
}

function lapAvgWatts(lap: TcxLap): number | null {
	const lx = lap.Extensions?.['ns3:LX'] ?? lap.Extensions?.LX
	return asNumber(lx?.['ns3:AvgWatts'] ?? lx?.AvgWatts)
}

function lapMaxWatts(lap: TcxLap): number | null {
	const lx = lap.Extensions?.['ns3:LX'] ?? lap.Extensions?.LX
	return asNumber(lx?.['ns3:MaxWatts'] ?? lx?.MaxWatts)
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sum(laps: TcxLap[], pick: (lap: TcxLap) => number | null): number {
	return laps.reduce((total, lap) => total + (pick(lap) ?? 0), 0)
}

function max(
	laps: TcxLap[],
	pick: (lap: TcxLap) => number | null,
): number | null {
	const values = laps.map(pick).filter((v): v is number => v != null)
	return values.length > 0 ? Math.max(...values) : null
}

/**
 * Average a lap-level metric across laps, weighted by each lap's timer time.
 * Laps missing the metric are excluded (a metric present for only part of the
 * activity is averaged over that part, not diluted by zeros).
 */
function timeWeightedAvg(
	laps: TcxLap[],
	pick: (lap: TcxLap) => number | null,
): number | null {
	let weightedTotal = 0
	let weight = 0
	for (const lap of laps) {
		const value = pick(lap)
		const lapSec = asNumber(lap.TotalTimeSeconds)
		if (value == null || lapSec == null || lapSec <= 0) continue
		weightedTotal += value * lapSec
		weight += lapSec
	}
	return weight > 0 ? Math.round(weightedTotal / weight) : null
}

function elevationGain(laps: TcxLap[]): number | null {
	const altitudes: number[] = []
	for (const lap of laps) {
		for (const track of lap.Track ?? []) {
			for (const pt of track.Trackpoint ?? []) {
				const alt = asNumber(pt.AltitudeMeters)
				if (alt != null) altitudes.push(alt)
			}
		}
	}
	if (altitudes.length < 2) return null
	let gain = 0
	for (let i = 1; i < altitudes.length; i++) {
		const delta = altitudes[i]! - altitudes[i - 1]!
		if (delta > 0) gain += delta
	}
	return Math.round(gain)
}
