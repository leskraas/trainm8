import { XMLParser } from 'fast-xml-parser'
import { type ActivityImportInput } from './activity-import.server.ts'
import { isNum, type RawStream } from './activity-stream.ts'

type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

/** A parsed TCX file: the summary plus its raw telemetry, when present. */
export type ParsedTcxFile = {
	activity: ParsedActivity
	/** Per-sample telemetry adapted to the provider-neutral `RawStream` (ADR
	 * 0036), or `null` when the trackpoints carry no plottable channel. */
	stream: RawStream | null
}

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
	TriggerMethod?: string
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

/** The `TPX` (TrackPointExtension) Garmin activity extension on a trackpoint:
 * per-sample watts and speed, with or without the `ns3:` namespace prefix. */
type TcxTrackpointExtension = {
	'ns3:Watts'?: number
	Watts?: number
	'ns3:Speed'?: number
	Speed?: number
}

type TcxTrackpoint = {
	Time?: string
	AltitudeMeters?: number
	DistanceMeters?: number
	HeartRateBpm?: { Value?: number }
	Extensions?: {
		'ns3:TPX'?: TcxTrackpointExtension
		TPX?: TcxTrackpointExtension
	}
}

/**
 * A TCX lap boundary reduced to a provider-neutral marker (ADR 0036, #328):
 * the elapsed offset the lap starts at, its timer duration, distance, and the
 * device `TriggerMethod` (`Manual` | `Distance` | `Time` | `HeartRate` |
 * `Location`). A refinement edge signal for Structure Detection — laps rescue
 * short/in-zone reps the stream is blind to — never TCX's sole signal.
 */
export type TcxLapMarker = {
	startOffsetSec: number
	durationSec: number
	distanceM: number | null
	trigger: string | null
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
 *
 * The trackpoints also become the per-sample Activity Stream (ADR 0036), so a
 * TCX import is a first-class telemetry source at parity with GPX/FIT — it
 * gains the Telemetry Overlay and stream-derived Normalized Power → Coggan TSS
 * (ADR 0024) as a consequence — and the `<Lap>` boundaries are captured as
 * refinement markers for Structure Detection (#328).
 */
export function parseTcx(content: string): ParsedTcxFile {
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
		distanceM != null && distanceM > 0 ? durationSec / (distanceM / 1000) : null

	const discipline = tcxSportToDiscipline(
		typeof activity['@_Sport'] === 'string' ? activity['@_Sport'] : undefined,
	)

	// Lap markers are a Structure Detection refinement signal (#328), and
	// `other`-sport TCX is never detected (ADR 0015/0036) — so, like the stream,
	// they are not captured for `other`. Keeps the forward path consistent with
	// the backfill, which excludes `other` too.
	const lapMarkers =
		discipline === 'other' ? [] : extractLapMarkers(laps, startedAt)

	return {
		activity: {
			startedAt,
			endedAt,
			durationSec,
			distanceM: distanceM != null ? Math.round(distanceM) : null,
			discipline,
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
			lapsJson: lapMarkers.length > 0 ? JSON.stringify(lapMarkers) : null,
		},
		stream: trackpointsToRawStream(laps, startedAt),
	}
}

/**
 * Adapt the trackpoints (walked across every lap's track) to the
 * provider-neutral `RawStream` (ADR 0036): an elapsed-seconds axis plus
 * whichever of heart rate, power, and pace the device actually wrote —
 * `heartrate` from `HeartRateBpm/Value`, `power` from the `TPX` watts
 * extension, `pace` from the `TPX` speed extension or, failing that, cumulative
 * `DistanceMeters` deltas. A missing reading is a `null` gap (a pause reads as a
 * gap, not an invented value), never interpolated. Returns `null` when no
 * trackpoint carries a timestamp plus at least one real channel reading.
 */
function trackpointsToRawStream(
	laps: TcxLap[],
	startedAt: Date,
): RawStream | null {
	const time: number[] = []
	const heartrate: Array<number | null> = []
	const power: Array<number | null> = []
	const pace: Array<number | null> = []

	let prevDist: number | null = null
	let prevTime: number | null = null

	for (const lap of laps) {
		for (const track of lap.Track ?? []) {
			for (const pt of track.Trackpoint ?? []) {
				if (!pt.Time) continue
				const t = new Date(pt.Time)
				if (isNaN(t.getTime())) continue
				const elapsed = Math.round((t.getTime() - startedAt.getTime()) / 1000)
				time.push(elapsed)

				const hr = asNumber(pt.HeartRateBpm?.Value)
				heartrate.push(hr != null && hr > 0 ? hr : null)

				const tpx = pt.Extensions?.['ns3:TPX'] ?? pt.Extensions?.TPX
				const watts = asNumber(tpx?.['ns3:Watts'] ?? tpx?.Watts)
				power.push(watts != null && watts >= 0 ? watts : null)

				// Pace: prefer the per-sample speed extension; else derive from the
				// cumulative-distance delta since the previous point. A stop (no
				// forward distance in positive time) reads as a `null` gap, never an
				// infinite pace.
				const speed = asNumber(tpx?.['ns3:Speed'] ?? tpx?.Speed)
				const dist = asNumber(pt.DistanceMeters)
				let paceVal: number | null = null
				if (speed != null && speed > 0) {
					paceVal = 1000 / speed
				} else if (dist != null && prevDist != null && prevTime != null) {
					const dDist = dist - prevDist
					const dTime = elapsed - prevTime
					if (dDist > 0 && dTime > 0) paceVal = dTime / (dDist / 1000)
				}
				pace.push(paceVal)
				if (dist != null) {
					prevDist = dist
					prevTime = elapsed
				}
			}
		}
	}

	if (time.length === 0) return null
	const raw: RawStream = { time }
	if (heartrate.some(isNum)) raw.heartrate = heartrate
	if (power.some(isNum)) raw.power = power
	if (pace.some(isNum)) raw.pace = pace
	if (!raw.heartrate && !raw.power && !raw.pace) return null
	return raw
}

/**
 * Capture each `<Lap>` as a provider-neutral boundary marker (ADR 0036, #328).
 * The offset is the lap's own `StartTime` relative to the activity start where
 * present; otherwise it accumulates from the preceding laps' timers so a file
 * with implicit lap starts still yields ordered offsets. Laps with no positive
 * timer are skipped.
 */
function extractLapMarkers(laps: TcxLap[], startedAt: Date): TcxLapMarker[] {
	const markers: TcxLapMarker[] = []
	let runningOffset = 0
	for (const lap of laps) {
		const durationSec = asNumber(lap.TotalTimeSeconds)
		if (durationSec == null || durationSec <= 0) continue

		const lapStartStr = lap['@_StartTime']
		const lapStart = lapStartStr ? new Date(lapStartStr) : null
		const startOffsetSec =
			lapStart && !isNaN(lapStart.getTime())
				? Math.max(
						0,
						Math.round((lapStart.getTime() - startedAt.getTime()) / 1000),
					)
				: runningOffset

		const distanceM = asNumber(lap.DistanceMeters)
		markers.push({
			startOffsetSec,
			durationSec: Math.round(durationSec),
			distanceM: distanceM != null ? Math.round(distanceM) : null,
			trigger: typeof lap.TriggerMethod === 'string' ? lap.TriggerMethod : null,
		})
		runningOffset = startOffsetSec + Math.round(durationSec)
	}
	return markers
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
