import { XMLParser } from 'fast-xml-parser'
import { type ActivityImportInput } from './activity-import.server.ts'
import { isNum, type RawStream } from './activity-stream.ts'

type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

/** A parsed activity file: the summary plus its raw telemetry, when present. */
type ParsedActivityFile = {
	activity: ParsedActivity
	stream: RawStream | null
}

const PARSER = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	isArray: (name) => ['trkpt', 'trk', 'trkseg', 'rte', 'rtept'].includes(name),
})

export function parseGpx(content: string): ParsedActivityFile {
	const doc = PARSER.parse(content)
	const gpx = doc.gpx

	if (!gpx) throw new Error('Not a valid GPX file')

	const tracks: unknown[] = gpx.trk ?? []
	const points: GpxPoint[] = []

	for (const trk of tracks) {
		const track = trk as { trkseg?: unknown[] }
		for (const seg of track.trkseg ?? []) {
			const segment = seg as { trkpt?: unknown[] }
			for (const pt of segment.trkpt ?? []) {
				points.push(pt as GpxPoint)
			}
		}
	}

	if (points.length === 0) {
		throw new Error('GPX file contains no track points')
	}

	const firstPoint = points[0]!
	const lastPoint = points[points.length - 1]!
	const startedAt = parseTime(firstPoint)
	const endedAt = parseTime(lastPoint)
	const durationSec = Math.round(
		(endedAt.getTime() - startedAt.getTime()) / 1000,
	)
	const distanceM = calculateDistance(points)
	const hrAvg = calculateHrAvg(points)

	const trackType = getTrackType(gpx)
	const discipline = detectDiscipline(trackType, distanceM, durationSec)

	return {
		activity: {
			startedAt,
			endedAt,
			durationSec,
			distanceM: distanceM > 0 ? distanceM : undefined,
			discipline,
			hrAvg: hrAvg ?? undefined,
		},
		stream: pointsToRawStream(points, startedAt),
	}
}

/**
 * Adapt the track points to the provider-neutral `RawStream` (#168): an
 * elapsed-seconds axis plus the heart-rate extension where present. GPX carries
 * no recorded speed or power channel, so those stay absent — pace is never
 * estimated from coordinates. Returns `null` when no point carries both a
 * timestamp and an HR reading.
 */
function pointsToRawStream(
	points: GpxPoint[],
	startedAt: Date,
): RawStream | null {
	const time: number[] = []
	const heartrate: Array<number | null> = []

	for (const pt of points) {
		if (!pt.time) continue
		const t = new Date(pt.time)
		if (isNaN(t.getTime())) continue
		time.push(Math.round((t.getTime() - startedAt.getTime()) / 1000))
		const hr =
			pt.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:hr'] ??
			pt.extensions?.['ns3:TrackPointExtension']?.['ns3:hr']
		heartrate.push(hr != null && hr > 0 ? hr : null)
	}
	if (time.length === 0 || !heartrate.some(isNum)) return null

	return { time, heartrate }
}

type GpxPoint = {
	'@_lat': string
	'@_lon': string
	ele?: number
	time?: string
	extensions?: {
		'gpxtpx:TrackPointExtension'?: {
			'gpxtpx:hr'?: number
		}
		'ns3:TrackPointExtension'?: {
			'ns3:hr'?: number
		}
	}
}

function parseTime(point: GpxPoint): Date {
	if (!point.time) return new Date()
	return new Date(point.time)
}

function degreesToRadians(deg: number): number {
	return (deg * Math.PI) / 180
}

function haversineMeters(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371000
	const dLat = degreesToRadians(lat2 - lat1)
	const dLon = degreesToRadians(lon2 - lon1)
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(degreesToRadians(lat1)) *
			Math.cos(degreesToRadians(lat2)) *
			Math.sin(dLon / 2) ** 2
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function calculateDistance(points: GpxPoint[]): number {
	let total = 0
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!
		const b = points[i]!
		const lat1 = parseFloat(a['@_lat'])
		const lon1 = parseFloat(a['@_lon'])
		const lat2 = parseFloat(b['@_lat'])
		const lon2 = parseFloat(b['@_lon'])
		if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
			total += haversineMeters(lat1, lon1, lat2, lon2)
		}
	}
	return Math.round(total)
}

function calculateHrAvg(points: GpxPoint[]): number | null {
	const hrValues: number[] = []
	for (const pt of points) {
		const hr =
			pt.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:hr'] ??
			pt.extensions?.['ns3:TrackPointExtension']?.['ns3:hr']
		if (hr != null && hr > 0) hrValues.push(hr)
	}
	if (hrValues.length === 0) return null
	return Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
}

function getTrackType(gpx: Record<string, unknown>): string {
	const trk = (gpx.trk as unknown[])?.[0] as Record<string, unknown> | undefined
	return (trk?.type as string) ?? ''
}

function detectDiscipline(
	trackType: string,
	distanceM: number,
	durationSec: number,
): string {
	const t = trackType.toLowerCase()
	if (t.includes('run') || t.includes('jogging')) return 'run'
	if (t.includes('cycl') || t.includes('bike') || t.includes('ride'))
		return 'bike'
	if (t.includes('swim')) return 'swim'

	// Heuristic: pace-based guess when no type tag
	if (durationSec > 0 && distanceM > 0) {
		const paceSecPerKm = durationSec / (distanceM / 1000)
		if (paceSecPerKm < 120) return 'bike' // < 2 min/km → cycling
		if (paceSecPerKm < 1000) return 'run' // < ~17 min/km → running
	}

	return 'run' // default
}
