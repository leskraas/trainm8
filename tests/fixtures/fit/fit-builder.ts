/**
 * Builds spec-conformant FIT activity files for the committed fixtures
 * (`generate-fixtures.ts`). Normal files go through Garmin's official SDK
 * encoder; the compressed-timestamp file is written byte by byte, because no
 * official encoder emits compressed timestamp headers (and the official
 * decoder refuses them, which is what that fixture exists to prove we survive).
 */
import { CrcCalculator, Encoder, Profile, type Mesg } from '@garmin/fitsdk'

// The SDK's .d.ts types enum fields (sport, type, …) as numbers, but its
// runtime encoder/decoder use the Profile enum *strings* ('running',
// 'activity', …) — so message literals are written untyped and cast here.
export function writeMesg(
	encoder: Encoder,
	name: keyof typeof Profile.MesgNum,
	mesg: Record<string, unknown>,
) {
	const num = Profile.MesgNum[name]
	if (num == null) throw new Error(`Unknown mesg num: ${String(name)}`)
	encoder.onMesg(num, mesg as Mesg)
}

export type FileIdSpec = {
	type?: string
	manufacturer?: string | number
	product?: number
	serialNumber?: number
	timeCreated?: Date
}

export type LapSpec = { offsetSec: number; durationSec: number }

export type SessionSpec = {
	sport: string
	subSport?: string
	startTime: Date
	durationSec: number
	/** Wall-clock span when it differs from timer time (a paused run). */
	elapsedSec?: number
	distanceM: number
	hr?: { avg: number; max: number }
	power?: { avg: number; max: number; normalized: number }
	cadenceAvg?: number
	totalAscentM?: number
	maxSpeedMps?: number
	kcal?: number
	laps?: LapSpec[]
	/** SuuntoPlus Guide developer fields on the session (Suunto API docs). */
	suuntoPlus?: { ownerIds: string[]; externalIds: string[] }
}

export type ActivitySpec = {
	/** `null` writes no `file_id` message at all. */
	fileId?: FileIdSpec | null
	creator?: { manufacturer: string; product: number; productName?: string }
	sessions: SessionSpec[]
}

const DEFAULT_FILE_ID = {
	type: 'activity',
	manufacturer: 'garmin',
	product: 0,
	serialNumber: 424242,
} as const

/** Developer data index the Suunto guide fields are described under. */
const SUUNTO_DEV_INDEX = 0

export function encodeActivity(spec: ActivitySpec): Uint8Array {
	const anySuunto = spec.sessions.some((s) => s.suuntoPlus)
	const encoder = new Encoder(
		anySuunto
			? {
					fieldDescriptions: {
						0: suuntoFieldDescription(0, 'suuntoplus_plugin_owner_id'),
						1: suuntoFieldDescription(1, 'suuntoplus_plugin_external_id'),
					},
				}
			: undefined,
	)
	const first = spec.sessions[0]!

	if (spec.fileId !== null) {
		const fileId = { ...DEFAULT_FILE_ID, ...spec.fileId }
		// Field order is the order the encoder writes; kept as the first
		// fixtures were written so regenerating leaves them byte-identical.
		writeMesg(encoder, 'FILE_ID', {
			type: fileId.type,
			manufacturer: fileId.manufacturer,
			product: fileId.product,
			timeCreated: fileId.timeCreated ?? first.startTime,
			serialNumber: fileId.serialNumber,
		})
	}
	if (spec.creator) {
		writeMesg(encoder, 'DEVICE_INFO', {
			timestamp: first.startTime,
			deviceIndex: 'creator',
			...spec.creator,
		})
	}
	if (anySuunto) {
		writeMesg(encoder, 'DEVELOPER_DATA_ID', {
			developerDataIndex: SUUNTO_DEV_INDEX,
			applicationId: Array.from({ length: 16 }, (_, i) => i),
		})
		for (const [num, name] of [
			[0, 'suuntoplus_plugin_owner_id'],
			[1, 'suuntoplus_plugin_external_id'],
		] as const) {
			writeMesg(
				encoder,
				'FIELD_DESCRIPTION',
				suuntoFieldDescription(num, name)
					.fieldDescriptionMesg as unknown as Record<string, unknown>,
			)
		}
	}

	for (const session of spec.sessions) writeSession(encoder, session)

	const last = spec.sessions.at(-1)!
	const end = endOf(last)
	writeMesg(encoder, 'ACTIVITY', {
		timestamp: end,
		totalTimerTime: spec.sessions.reduce((sum, s) => sum + s.durationSec, 0),
		numSessions: spec.sessions.length,
		type: 'manual',
	})
	return encoder.close()
}

function endOf(session: SessionSpec): Date {
	return new Date(
		session.startTime.getTime() +
			(session.elapsedSec ?? session.durationSec) * 1000,
	)
}

function suuntoFieldDescription(fieldDefinitionNumber: number, name: string) {
	return {
		developerDataIdMesg: {
			developerDataIndex: SUUNTO_DEV_INDEX,
			applicationId: Array.from({ length: 16 }, (_, i) => i),
		} as unknown as Mesg,
		fieldDescriptionMesg: {
			developerDataIndex: SUUNTO_DEV_INDEX,
			fieldDefinitionNumber,
			fitBaseTypeId: 7, // string
			fieldName: name,
			nativeMesgNum: Profile.MesgNum.SESSION,
		} as unknown as Mesg,
	}
}

/**
 * A session's records (1 sample a minute, HR stepping easy → hard halfway so
 * phase bars span more than one zone), its laps, then the session message —
 * the device's own summary, which is where the aggregates come from.
 */
function writeSession(encoder: Encoder, spec: SessionSpec) {
	const elapsedSec = spec.elapsedSec ?? spec.durationSec
	const samples = Math.max(2, Math.floor(elapsedSec / 60))
	const speedMps = spec.distanceM / spec.durationSec
	for (let i = 0; i < samples; i++) {
		const record: Record<string, unknown> = {
			timestamp: new Date(
				spec.startTime.getTime() + (i * elapsedSec * 1000) / samples,
			),
			distance: (i * spec.distanceM) / samples,
			speed: speedMps,
		}
		if (spec.hr) {
			record.heartRate = i < samples / 2 ? spec.hr.avg - 12 : spec.hr.avg + 12
		}
		if (spec.power) record.power = spec.power.avg
		writeMesg(encoder, 'RECORD', record)
	}

	for (const lap of spec.laps ?? []) {
		const lapStart = new Date(spec.startTime.getTime() + lap.offsetSec * 1000)
		writeMesg(encoder, 'LAP', {
			timestamp: new Date(lapStart.getTime() + lap.durationSec * 1000),
			startTime: lapStart,
			totalElapsedTime: lap.durationSec,
			totalTimerTime: lap.durationSec,
			sport: spec.sport,
		})
	}

	const session: Record<string, unknown> = {
		timestamp: endOf(spec),
		startTime: spec.startTime,
		sport: spec.sport,
		...(spec.subSport ? { subSport: spec.subSport } : {}),
		totalElapsedTime: elapsedSec,
		totalTimerTime: spec.durationSec,
		totalDistance: spec.distanceM,
		...(spec.hr
			? { avgHeartRate: spec.hr.avg, maxHeartRate: spec.hr.max }
			: {}),
		...(spec.power
			? {
					avgPower: spec.power.avg,
					maxPower: spec.power.max,
					normalizedPower: spec.power.normalized,
				}
			: {}),
		...(spec.cadenceAvg != null ? { avgCadence: spec.cadenceAvg } : {}),
		...(spec.totalAscentM != null ? { totalAscent: spec.totalAscentM } : {}),
		...(spec.maxSpeedMps != null
			? { maxSpeed: spec.maxSpeedMps, enhancedMaxSpeed: spec.maxSpeedMps }
			: {}),
		...(spec.kcal != null ? { totalCalories: spec.kcal } : {}),
		...(spec.suuntoPlus
			? {
					developerFields: {
						0: spec.suuntoPlus.ownerIds.join(','),
						1: spec.suuntoPlus.externalIds.join(','),
					},
				}
			: {}),
	}
	writeMesg(encoder, 'SESSION', session)
}

// ── compressed timestamp headers, byte by byte ──────────────────────────────

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
const FIT_EPOCH_OFFSET_SEC = 631065600

type FieldDef = { num: number; size: number; baseType: number }

const UINT8 = 0x02
const ENUM = 0x00
const UINT16 = 0x84
const UINT32 = 0x86
const UINT32Z = 0x8c

/**
 * A one-session run whose records after the first use **compressed timestamp
 * headers** (FIT protocol: header bit 7 set, local type in bits 5–6, a 5-bit
 * seconds offset in bits 0–4) — the encoding Garmin's own SDKs refuse to
 * decode. One record every 10 s, so the offset rolls over every ~3 records.
 */
export function encodeCompressedTimestampRun({
	startTime,
	durationSec,
	distanceM,
	hr,
	serialNumber,
}: {
	startTime: Date
	durationSec: number
	distanceM: number
	hr: { avg: number; max: number }
	serialNumber: number
}): Uint8Array {
	const body: number[] = []
	const fitTime = (date: Date) =>
		Math.floor(date.getTime() / 1000) - FIT_EPOCH_OFFSET_SEC

	const define = (local: number, globalNum: number, fields: FieldDef[]) => {
		body.push(0x40 | local, 0, 0)
		pushLE(body, globalNum, 2)
		body.push(fields.length)
		for (const f of fields) body.push(f.num, f.size, f.baseType)
	}
	const data = (header: number, values: Array<[number, number]>) => {
		body.push(header)
		for (const [value, size] of values) pushLE(body, value, size)
	}

	const start = fitTime(startTime)
	// file_id (local 0)
	define(0, Profile.MesgNum.FILE_ID!, [
		{ num: 0, size: 1, baseType: ENUM },
		{ num: 1, size: 2, baseType: UINT16 },
		{ num: 2, size: 2, baseType: UINT16 },
		{ num: 3, size: 4, baseType: UINT32Z },
		{ num: 4, size: 4, baseType: UINT32 },
	])
	data(0x00, [
		[4, 1], // activity
		[294, 2], // coros
		[841, 2],
		[serialNumber, 4],
		[start, 4],
	])

	const speedMm = Math.round((distanceM / durationSec) * 1000) // m/s × 1000
	// record with an explicit timestamp (local 1): sets the running timestamp
	define(1, Profile.MesgNum.RECORD!, [
		{ num: 253, size: 4, baseType: UINT32 },
		{ num: 3, size: 1, baseType: UINT8 },
		{ num: 6, size: 2, baseType: UINT16 },
	])
	data(0x01, [
		[start, 4],
		[hr.avg - 10, 1],
		[speedMm, 2],
	])
	// record without a timestamp field (local 2): every later sample rides on a
	// compressed header carrying the low 5 bits of its timestamp
	define(2, Profile.MesgNum.RECORD!, [
		{ num: 3, size: 1, baseType: UINT8 },
		{ num: 6, size: 2, baseType: UINT16 },
	])
	for (let t = 10; t <= durationSec; t += 10) {
		const ts = start + t
		const heartRate = t < durationSec / 2 ? hr.avg - 10 : hr.avg + 10
		data(0x80 | (2 << 5) | (ts & 0x1f), [
			[heartRate, 1],
			[speedMm, 2],
		])
	}

	// session (local 3), with a normal header and its own timestamp
	define(3, Profile.MesgNum.SESSION!, [
		{ num: 253, size: 4, baseType: UINT32 },
		{ num: 2, size: 4, baseType: UINT32 },
		{ num: 5, size: 1, baseType: ENUM },
		{ num: 7, size: 4, baseType: UINT32 },
		{ num: 8, size: 4, baseType: UINT32 },
		{ num: 9, size: 4, baseType: UINT32 },
		{ num: 16, size: 1, baseType: UINT8 },
		{ num: 17, size: 1, baseType: UINT8 },
	])
	data(0x03, [
		[start + durationSec, 4],
		[start, 4],
		[1, 1], // running
		[durationSec * 1000, 4],
		[durationSec * 1000, 4],
		[Math.round(distanceM * 100), 4],
		[hr.avg, 1],
		[hr.max, 1],
	])

	return frameFit(body)
}

function pushLE(out: number[], value: number, size: number) {
	for (let i = 0; i < size; i++) out.push((value >>> (8 * i)) & 0xff)
}

const crc = (
	CrcCalculator as unknown as {
		calculateCRC: (buf: Uint8Array, start: number, end: number) => number
	}
).calculateCRC

/** Wrap a record body in a 14-byte FIT header and the trailing file CRC. */
function frameFit(body: number[]): Uint8Array {
	const header: number[] = [14, 0x20]
	pushLE(header, 2132, 2)
	pushLE(header, body.length, 4)
	header.push(...[...'.FIT'].map((c) => c.charCodeAt(0)))
	pushLE(header, crc(Uint8Array.from(header), 0, 12), 2)
	const file = Uint8Array.from([...header, ...body, 0, 0])
	const fileCrc = crc(file, 0, header.length + body.length)
	file[file.length - 2] = fileCrc & 0xff
	file[file.length - 1] = fileCrc >>> 8
	return file
}
