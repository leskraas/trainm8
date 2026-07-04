import { Decoder, Stream } from '@garmin/fitsdk'
import { type ActivityImportInput } from './activity-import.server.ts'

type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

/**
 * Maps a FIT `sport` (+ optional `sub_sport`) to a trainm8 Discipline. Private
 * to the FIT parser (ADR 0014: each source owns its own mapping). Anything
 * trainm8 does not model collapses to `'other'` (ADR 0015): inbox-only, no
 * auto-match, no Training Load contribution.
 *
 * FIT sport/sub_sport reference: the FIT SDK Profile
 * (https://developer.garmin.com/fit/protocol/).
 */
function fitSportToDiscipline(
	sport: string | undefined,
	subSport: string | undefined,
): string {
	switch (sport) {
		case 'running':
			return 'run'
		case 'cycling':
			return 'bike'
		case 'swimming':
			return 'swim'
		case 'training':
		case 'fitnessEquipment':
			return subSport === 'strengthTraining' ? 'strength' : 'other'
		default:
			return 'other'
	}
}

/**
 * Decode a binary FIT file's record stream and reduce it to the same
 * provider-neutral activity shape `parseGpx` returns. Aggregates come from the
 * file's session message — the device's own summary — so every metric is
 * earned from the recording; channels the device didn't write stay absent
 * (Unavailable Metric), never estimated.
 */
export function parseFit(bytes: Uint8Array): ParsedActivity {
	const stream = Stream.fromByteArray([...bytes])
	if (!Decoder.isFIT(stream)) {
		throw new Error('Not a valid FIT file')
	}
	const decoder = new Decoder(stream)
	if (!decoder.checkIntegrity()) {
		throw new Error('FIT file is corrupt (failed integrity check)')
	}

	const { messages } = decoder.read()
	const session = messages.sessionMesgs?.[0]
	if (!session) {
		throw new Error('FIT file contains no activity session')
	}

	const startedAt = toDate(session.startTime)
	if (!startedAt) {
		throw new Error('FIT session has no start time')
	}

	// Timer time excludes pauses (matches Strava's moving_time choice);
	// elapsed time spans wall-clock start → end.
	const timerSec = asNumber(session.totalTimerTime)
	const elapsedSec = asNumber(session.totalElapsedTime) ?? timerSec
	if (timerSec == null && elapsedSec == null) {
		throw new Error('FIT session has no duration')
	}
	const durationSec = Math.round(timerSec ?? elapsedSec!)
	const endedAt = new Date(
		startedAt.getTime() + Math.round(elapsedSec ?? durationSec) * 1000,
	)

	const distanceM = asNumber(session.totalDistance)
	const paceAvgSecPerKm =
		distanceM != null && distanceM > 0 && durationSec > 0
			? durationSec / (distanceM / 1000)
			: null

	// FIT total_work is joules; Strava's kilojoules field is kJ. Calories are
	// not work — never derived from total_calories.
	const totalWorkJ = asNumber(session.totalWork)

	return {
		startedAt,
		endedAt,
		durationSec,
		distanceM,
		discipline: fitSportToDiscipline(
			asString(session.sport),
			asString(session.subSport),
		),
		hrAvg: asNumber(session.avgHeartRate),
		hrMax: asNumber(session.maxHeartRate),
		powerAvg: asNumber(session.avgPower),
		powerMax: asNumber(session.maxPower),
		powerWeightedAvg: asNumber(session.normalizedPower),
		cadenceAvg: asNumber(session.avgCadence),
		paceAvgSecPerKm,
		speedMaxMps:
			asNumber(session.enhancedMaxSpeed) ?? asNumber(session.maxSpeed),
		elevationGainM: asNumber(session.totalAscent),
		kilojoules: totalWorkJ != null ? totalWorkJ / 1000 : null,
	}
}

function toDate(value: unknown): Date | null {
	if (value instanceof Date) return value
	if (typeof value === 'string') {
		const d = new Date(value)
		return isNaN(d.getTime()) ? null : d
	}
	return null
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}
