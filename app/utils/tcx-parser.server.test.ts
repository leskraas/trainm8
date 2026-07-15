import { expect, test } from 'vitest'
import { isNum } from './activity-stream.ts'
import { parseTcx, type TcxLapMarker } from './tcx-parser.server.ts'

// ── the trackpoint → RawStream adapter (ADR 0036) ──────────────────────────
// TCX stops being the format that ingests no stream: the same trackpoints the
// parser already walks for aggregates become the per-sample Activity Stream, at
// parity with GPX/FIT.

/** Wrap trackpoint XML in a minimal single-lap TCX document. */
function tcxDoc(opts: {
	sport?: string
	trackpoints: string
	lapAttrs?: string
	lapExtras?: string
}) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="${opts.sport ?? 'Running'}">
      <Id>2026-06-02T07:00:00Z</Id>
      <Lap StartTime="2026-06-02T07:00:00Z" ${opts.lapAttrs ?? ''}>
        <TotalTimeSeconds>600.0</TotalTimeSeconds>
        <DistanceMeters>2000.0</DistanceMeters>
        ${opts.lapExtras ?? ''}
        <Track>
          ${opts.trackpoints}
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`
}

function trackpoint(opts: {
	time: string
	distance?: number
	hr?: number
	watts?: number
	speed?: number
}) {
	const hr =
		opts.hr != null
			? `<HeartRateBpm><Value>${opts.hr}</Value></HeartRateBpm>`
			: ''
	const dist =
		opts.distance != null
			? `<DistanceMeters>${opts.distance}</DistanceMeters>`
			: ''
	const tpxParts = [
		opts.speed != null ? `<ns3:Speed>${opts.speed}</ns3:Speed>` : '',
		opts.watts != null ? `<ns3:Watts>${opts.watts}</ns3:Watts>` : '',
	].join('')
	const ext = tpxParts
		? `<Extensions><ns3:TPX>${tpxParts}</ns3:TPX></Extensions>`
		: ''
	return `<Trackpoint><Time>${opts.time}</Time>${dist}${hr}${ext}</Trackpoint>`
}

test('a run with HR trackpoints and cumulative distance emits HR + pace channels', () => {
	const { stream } = parseTcx(
		tcxDoc({
			trackpoints: [
				trackpoint({ time: '2026-06-02T07:00:00Z', distance: 0, hr: 130 }),
				trackpoint({ time: '2026-06-02T07:05:00Z', distance: 1000, hr: 150 }),
				trackpoint({ time: '2026-06-02T07:10:00Z', distance: 2000, hr: 160 }),
			].join('\n'),
		}),
	)

	expect(stream).not.toBeNull()
	expect(stream!.time).toEqual([0, 300, 600])
	expect(stream!.heartrate).toEqual([130, 150, 160])
	// TCX carries no per-run power channel here — power stays absent, never zero.
	expect(stream!.power).toBeUndefined()
	// Pace derives from cumulative-distance deltas: 300 s over 1000 m → 300 s/km.
	// The first point has no prior sample, so it is a `null` gap.
	expect(stream!.pace).toEqual([null, 300, 300])
})

test('a ride with per-sample watts and speed emits a power channel and speed-derived pace', () => {
	const { stream } = parseTcx(
		tcxDoc({
			sport: 'Biking',
			trackpoints: [
				trackpoint({ time: '2026-06-02T07:00:00Z', watts: 200, speed: 10 }),
				trackpoint({ time: '2026-06-02T07:05:00Z', watts: 300, speed: 10 }),
			].join('\n'),
		}),
	)

	expect(stream).not.toBeNull()
	expect(stream!.power).toEqual([200, 300])
	// speed 10 m/s → 100 s/km, read from the per-sample extension (not distance).
	expect(stream!.pace).toEqual([100, 100])
	expect(stream!.heartrate).toBeUndefined()
})

test('a missing per-sample reading stays a null gap, never interpolated', () => {
	const { stream } = parseTcx(
		tcxDoc({
			trackpoints: [
				trackpoint({ time: '2026-06-02T07:00:00Z', hr: 140 }),
				// A dropped HR reading in the middle of the recording.
				trackpoint({ time: '2026-06-02T07:05:00Z' }),
				trackpoint({ time: '2026-06-02T07:10:00Z', hr: 150 }),
			].join('\n'),
		}),
	)

	expect(stream!.heartrate).toEqual([140, null, 150])
	expect(stream!.heartrate!.filter(isNum)).toEqual([140, 150])
})

test('a trackpoint-less TCX yields no stream (nothing plottable)', () => {
	const { stream } = parseTcx(
		tcxDoc({
			trackpoints: '',
			lapExtras:
				'<AverageHeartRateBpm><Value>150</Value></AverageHeartRateBpm>',
		}),
	)
	expect(stream).toBeNull()
})

test('trackpoints that carry only a timestamp (no channel) yield no stream', () => {
	const { stream } = parseTcx(
		tcxDoc({
			trackpoints: [
				trackpoint({ time: '2026-06-02T07:00:00Z', distance: 0 }),
				trackpoint({ time: '2026-06-02T07:10:00Z', distance: 0 }),
			].join('\n'),
		}),
	)
	// No HR, no power, and a flat distance → no pace either: nothing to plot.
	expect(stream).toBeNull()
})

// ── lap-boundary markers (#328) ────────────────────────────────────────────

test('lap boundaries are captured as ordered markers with trigger + distance', () => {
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-06-02T07:00:00Z</Id>
      <Lap StartTime="2026-06-02T07:00:00Z">
        <TotalTimeSeconds>600.0</TotalTimeSeconds>
        <DistanceMeters>2000.0</DistanceMeters>
        <TriggerMethod>Distance</TriggerMethod>
      </Lap>
      <Lap StartTime="2026-06-02T07:10:00Z">
        <TotalTimeSeconds>300.0</TotalTimeSeconds>
        <DistanceMeters>1000.0</DistanceMeters>
        <TriggerMethod>Manual</TriggerMethod>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`

	const { activity } = parseTcx(content)
	expect(activity.lapsJson).not.toBeNull()
	const laps = JSON.parse(activity.lapsJson!) as TcxLapMarker[]
	expect(laps).toEqual([
		{
			startOffsetSec: 0,
			durationSec: 600,
			distanceM: 2000,
			trigger: 'Distance',
		},
		{
			startOffsetSec: 600,
			durationSec: 300,
			distanceM: 1000,
			trigger: 'Manual',
		},
	])
})

test('a swim maps to other and captures no lap markers (no detection; ADR 0015/0036)', () => {
	const { activity } = parseTcx(
		tcxDoc({
			sport: 'Other',
			lapExtras: '<TriggerMethod>Manual</TriggerMethod>',
			trackpoints: trackpoint({
				time: '2026-06-02T07:00:00Z',
				hr: 130,
			}),
		}),
	)
	expect(activity.discipline).toBe('other')
	// Lap markers are a detection refinement signal; `other` is never detected,
	// so they are not stored even though the file carries a lap.
	expect(activity.lapsJson).toBeNull()
})
