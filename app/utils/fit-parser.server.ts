import {
	Decoder,
	Stream,
	type LapMesg,
	type RecordMesg,
	type SessionMesg,
} from '@garmin/fitsdk'
import {
	type FitFileId,
	fitFileKey,
} from '#app/integrations/shared/fit-file-key.ts'
import { type ActivityImportInput } from './activity-import.server.ts'
import { isNum, type RawStream } from './activity-stream.ts'
import { expandCompressedTimestamps } from './fit-compressed-timestamps.server.ts'
import { type Lap } from './structure-detection/types.ts'

export type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

/** One SuuntoPlus Guide the watch ran: who owns it, and the id we gave it. */
export type SuuntoPlusGuide = { ownerId: string; externalId: string }

/**
 * One session of a FIT file — a whole activity, or one leg of a multisport
 * file — with its own summary, its own slice of the record stream, and its
 * own laps.
 */
export type ParsedFitSession = {
	activity: ParsedActivity
	/** Per-sample telemetry adapted to the provider-neutral `RawStream`, or
	 * `null` when the session carries no plottable records. */
	stream: RawStream | null
	/** Lap edges in elapsed seconds on the session's own axis (ADR 0033). */
	laps: Lap[]
	/** SuuntoPlus Guides the session ran (Suunto developer fields), if any. */
	suuntoPlusGuides: SuuntoPlusGuide[]
}

/** A decoded FIT activity file. */
export type ParsedFitFile = {
	/** The original file's identity (ADR 0096 §1), or null without one. */
	fitFileKey: string | null
	/** The recording device as display text ("Garmin Forerunner 965"). */
	deviceName: string | null
	/** One entry per sport session, in time order; transitions are dropped. */
	sessions: ParsedFitSession[]
}

/**
 * Maps a FIT `sport` (+ optional `sub_sport`) to a trainm8 Discipline. Private
 * to the FIT parser (ADR 0014: each source owns its own mapping). Anything
 * trainm8 does not model collapses to `'other'` (ADR 0015): import-only, no
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

const COMPRESSED_TIMESTAMP_ERROR = /compressed timestamp/i

/**
 * Decode a binary FIT file into one activity per sport session. Aggregates
 * come from each session message — the device's own summary — so every metric
 * is earned from the recording; channels the device didn't write stay absent
 * (Unavailable Metric), never estimated. Records and laps are split by each
 * session's time range, so a triathlon's run never carries the bike's power.
 * Transition sessions are not activities and are dropped.
 *
 * Also reads what identifies the file (`file_id` → the FIT key), the device
 * that wrote it, and Suunto's guide fields. A file using compressed timestamp
 * headers, which the official decoder refuses, is rewritten into normal
 * headers first (`expandCompressedTimestamps`).
 */
export function parseFit(bytes: Uint8Array): ParsedFitFile {
	let messages = decodeFit(bytes)
	if ('compressed' in messages) {
		messages = decodeFit(expandCompressedTimestamps(bytes))
		if ('compressed' in messages) {
			throw new Error('FIT file could not be decoded')
		}
	}

	const sessionMesgs = [...(messages.sessionMesgs ?? [])]
		.filter((s) => asString(s.sport) !== 'transition')
		.map((mesg) => ({ mesg, startedAt: toDate(mesg.startTime) }))
	if (sessionMesgs.length === 0) {
		throw new Error('FIT file contains no activity session')
	}
	for (const s of sessionMesgs) {
		if (!s.startedAt) throw new Error('FIT session has no start time')
	}
	const ordered = sessionMesgs
		.map((s) => ({ mesg: s.mesg, startedAt: s.startedAt! }))
		.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

	// Every session — transitions included — bounds the one before it, so a
	// leg's stream stops where the next part of the race starts.
	const allStarts = (messages.sessionMesgs ?? [])
		.map((s) => toDate(s.startTime))
		.filter((d): d is Date => d != null)
		.map((d) => d.getTime())

	const guideNames = developerFieldNames(
		messages.fieldDescriptionMesgs as unknown as
			| Array<Record<string, unknown>>
			| undefined,
	)

	const sessions = ordered.map(({ mesg, startedAt }) => {
		const activity = sessionActivity(mesg, startedAt)
		const endMs = activity.endedAt.getTime()
		const nextStartMs = allStarts
			.filter((t) => t > startedAt.getTime())
			.reduce((min, t) => Math.min(min, t), Infinity)
		const inWindow = (t: Date) =>
			t.getTime() >= startedAt.getTime() &&
			t.getTime() <= endMs &&
			t.getTime() < nextStartMs
		return {
			activity,
			stream: recordsToRawStream(
				messages.recordMesgs?.filter((r) => {
					const t = toDate(r.timestamp)
					return t != null && inWindow(t)
				}),
				startedAt,
			),
			laps: lapsOnSessionAxis(
				messages.lapMesgs?.filter((l) => {
					const t = toDate(l.startTime)
					return t != null && inWindow(t)
				}),
				startedAt,
			),
			suuntoPlusGuides: suuntoPlusGuides(mesg, guideNames),
		}
	})

	const fileId = messages.fileIdMesgs?.[0] as FitFileId | undefined
	return {
		fitFileKey: fitFileKey(fileId),
		deviceName: fitDeviceName(messages),
		sessions,
	}
}

type DecodedMessages = ReturnType<Decoder['read']>['messages']

function decodeFit(bytes: Uint8Array): DecodedMessages | { compressed: true } {
	const stream = Stream.fromByteArray([...bytes])
	if (!Decoder.isFIT(stream)) {
		throw new Error('Not a valid FIT file')
	}
	const decoder = new Decoder(stream)
	if (!decoder.checkIntegrity()) {
		throw new Error('FIT file is corrupt (failed integrity check)')
	}
	const { messages, errors } = decoder.read()
	if (
		errors.some(
			(e) => e instanceof Error && COMPRESSED_TIMESTAMP_ERROR.test(e.message),
		)
	) {
		return { compressed: true }
	}
	return messages
}

function sessionActivity(
	session: SessionMesg,
	startedAt: Date,
): ParsedActivity {
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

/**
 * FIT laps as `Lap { startSec, endSec }` on the session's elapsed-seconds
 * axis — the axis the Activity Stream inherits — using each lap's wall-clock
 * span. A lone lap covering the whole session says nothing about structure
 * (the device's auto "one lap" summary) and is dropped, as the API providers'
 * single whole-activity lap is.
 */
function lapsOnSessionAxis(
	lapMesgs: LapMesg[] | undefined,
	startedAt: Date,
): Lap[] {
	const laps: Lap[] = []
	for (const lap of lapMesgs ?? []) {
		const start = toDate(lap.startTime)
		const span = asNumber(lap.totalElapsedTime) ?? asNumber(lap.totalTimerTime)
		if (!start || span == null) continue
		const startSec = Math.round((start.getTime() - startedAt.getTime()) / 1000)
		const endSec = startSec + Math.round(span)
		if (endSec > startSec) laps.push({ startSec, endSec })
	}
	laps.sort((a, b) => a.startSec - b.startSec)
	return laps.length > 1 ? laps : []
}

/**
 * Adapt the FIT record messages to the provider-neutral `RawStream`: an
 * elapsed-seconds axis plus whichever of heart rate, power, and pace the device
 * actually wrote. Speed converts per sample to pace in sec/km — a stop reads as
 * a `null` gap, not an infinite pace. Returns `null` when no record carries a
 * timestamp plus at least one real channel reading.
 */
function recordsToRawStream(
	records: RecordMesg[] | undefined,
	startedAt: Date,
): RawStream | null {
	if (!records?.length) return null

	const time: number[] = []
	const heartrate: Array<number | null> = []
	const power: Array<number | null> = []
	const pace: Array<number | null> = []

	for (const record of records) {
		const timestamp = toDate(record.timestamp)
		if (!timestamp) continue
		time.push(Math.round((timestamp.getTime() - startedAt.getTime()) / 1000))
		heartrate.push(asNumber(record.heartRate))
		power.push(asNumber(record.power))
		const speedMps = asNumber(record.enhancedSpeed) ?? asNumber(record.speed)
		pace.push(speedMps != null && speedMps > 0 ? 1000 / speedMps : null)
	}
	if (time.length === 0) return null

	const raw: RawStream = { time }
	if (heartrate.some(isNum)) raw.heartrate = heartrate
	if (power.some(isNum)) raw.power = power
	if (pace.some(isNum)) raw.pace = pace
	if (!raw.heartrate && !raw.power && !raw.pace) return null
	return raw
}

/** How a FIT manufacturer is written in a device name. */
const MANUFACTURER_LABELS: Record<string, string> = {
	garmin: 'Garmin',
	suunto: 'Suunto',
	coros: 'COROS',
	polar: 'Polar',
	wahooFitness: 'Wahoo',
	zwift: 'Zwift',
	apple: 'Apple',
	stryd: 'Stryd',
	hammerhead: 'Hammerhead',
}

/**
 * The device that wrote the file, as display text: the creator's
 * manufacturer and product name ("Garmin Forerunner 965"). Falls back to the
 * SDK's product code when the file names no product, and to null when even
 * the manufacturer is unknown. Never a key (ADR 0096 §1).
 */
function fitDeviceName(messages: DecodedMessages): string | null {
	const fileId = messages.fileIdMesgs?.[0] as
		| Record<string, unknown>
		| undefined
	const creator = (
		messages.deviceInfoMesgs as Array<Record<string, unknown>> | undefined
	)?.find((d) => d.deviceIndex === 'creator' || d.deviceIndex === 0)

	const manufacturer = asString(creator?.manufacturer ?? fileId?.manufacturer)
	const product =
		asString(creator?.productName) ??
		asString(fileId?.productName) ??
		asString(creator?.garminProduct) ??
		asString(fileId?.garminProduct)
	if (!manufacturer) return product?.trim() || null

	const label =
		MANUFACTURER_LABELS[manufacturer] ??
		manufacturer.charAt(0).toUpperCase() + manufacturer.slice(1)
	if (!product?.trim()) return label
	const name = product.trim()
	return name.toLowerCase().startsWith(label.toLowerCase())
		? name
		: `${label} ${name}`
}

/** Developer field key → field name, from the file's field descriptions. */
function developerFieldNames(
	descriptions: Array<Record<string, unknown>> | undefined,
): Map<string, string> {
	const names = new Map<string, string>()
	for (const d of descriptions ?? []) {
		const name = asString(d.fieldName)
		if (name != null && d.key != null) names.set(String(d.key), name)
	}
	return names
}

/**
 * SuuntoPlus Guides on a session: Suunto writes the guide's owner (the API
 * client id) to `suuntoplus_plugin_owner_id` and the id that client gave the
 * guide to `suuntoplus_plugin_external_id`, index-aligned (Suunto API docs,
 * `watch-data-sources.md` [SU8]). Read as written, so a later plan → actual
 * link can find its own guide by owner. Not yet checked against a file from a
 * real Suunto watch.
 */
function suuntoPlusGuides(
	session: SessionMesg,
	names: Map<string, string>,
): SuuntoPlusGuide[] {
	const developerFields = (session as { developerFields?: object })
		.developerFields as Record<string, unknown> | undefined
	if (!developerFields) return []
	let owners: string[] = []
	let externals: string[] = []
	for (const [key, value] of Object.entries(developerFields)) {
		const name = names.get(key)
		if (name === 'suuntoplus_plugin_owner_id') owners = stringList(value)
		if (name === 'suuntoplus_plugin_external_id') externals = stringList(value)
	}
	return owners
		.map((ownerId, i) => ({ ownerId, externalId: externals[i] ?? '' }))
		.filter((g) => g.ownerId !== '' && g.externalId !== '')
}

function stringList(value: unknown): string[] {
	const items = Array.isArray(value) ? value : [value]
	return items.filter((v): v is string => typeof v === 'string')
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
