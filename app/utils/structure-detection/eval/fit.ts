import { Decoder, Stream } from '@garmin/fitsdk'
import {
	type ActivityStream,
	downsampleStream,
	isNum,
	type RawStream,
} from '../../activity-stream.ts'
import { parseFit } from '../../fit-parser.server.ts'
import { type Lap } from '../types.ts'

/**
 * Read a FIT activity file for the detection scoreboard (#625): the 1 s
 * record stream and every lap with the fields the shipped parser drops
 * (`intensity`, `wkt_step_index`, `lap_trigger`, the lap's own averages), plus
 * the file's `workout` / `workout_step` program when it carries one.
 * Build-time tooling only. Sessions, their time windows and the
 * power / HR / pace channels come from the app's own `parseFit`, so the
 * scoreboard reads the file exactly as FIT ingest does; only what `parseFit`
 * leaves out is decoded here.
 */

/** A lap as the file writes it, on the session's elapsed-seconds axis. */
export type DeviceLap = Lap & {
	/** FIT `intensity`: active, rest, warmup, cooldown, recovery, interval, other. */
	intensity: string | null
	/** FIT `wkt_step_index`: the `workout_step` this lap ran, if any. */
	wktStepIndex: number | null
	/** FIT `lap_trigger`: manual, time, distance, sessionEnd, … */
	lapTrigger: string | null
	repetitionNum: number | null
	distanceM: number | null
	avgPower: number | null
	avgHeartRate: number | null
	avgSpeed: number | null
	avgCadence: number | null
}

/** One `workout_step` message, as written. */
export type DeviceWorkoutStep = {
	messageIndex: number | null
	name: string | null
	intensity: string | null
	durationType: string | null
	durationValue: number | null
	targetType: string | null
	/** For a repeat step: the step it loops back to, and how many times. */
	durationStep: number | null
	repeatSteps: number | null
}

/** What `file_id` says about who wrote the file. */
export type FitWriter = {
	manufacturer: string | number | null
	product: string | number | null
	productName: string | null
	serialNumber: number | null
	timeCreated: string | null
}

export type FitSession = {
	/** trainm8's discipline for the session, as FIT ingest maps it. */
	discipline: string
	/** FIT `sport` / `sub_sport`. */
	sport: string | null
	subSport: string | null
	startedAt: string
	durationSec: number
	/** The records at the rate the file holds them (≈1 s), on the session axis. */
	raw: RawStream | null
	/** Speed (m/s), cadence (rpm/spm) and altitude (m) per record, aligned with `raw.time`. */
	extra: {
		speed?: Array<number | null>
		cadence?: Array<number | null>
		altitude?: Array<number | null>
	}
	laps: DeviceLap[]
	/** Median seconds between records. */
	recordIntervalSec: number | null
}

export type FitFile = {
	writer: FitWriter
	/** The creator in `device_info`, when the file names one. */
	deviceInfo: Array<Record<string, unknown>>
	workout: Record<string, unknown> | null
	workoutSteps: DeviceWorkoutStep[]
	/** Pool swims: `length` messages in the file. */
	lengthCount: number
	sessions: FitSession[]
}

export function readFitFile(bytes: Uint8Array): FitFile {
	const parsed = parseFit(bytes)
	const decoder = new Decoder(Stream.fromByteArray([...bytes]))
	const { messages: m } = decoder.read()
	const fileId = (m.fileIdMesgs?.[0] ?? {}) as Record<string, unknown>
	const sessionMesgs = (m.sessionMesgs ?? [])
		.map((s) => s as unknown as Record<string, unknown>)
		.filter((s) => s.sport !== 'transition')
		.sort((a, b) => time(a.startTime)! - time(b.startTime)!)
	const records = (m.recordMesgs ?? []) as unknown as Array<
		Record<string, unknown>
	>
	const lapMesgs = (m.lapMesgs ?? []) as unknown as Array<
		Record<string, unknown>
	>

	const sessions = parsed.sessions.map((s, i): FitSession => {
		const mesg = sessionMesgs[i] ?? {}
		const start = s.activity.startedAt.getTime()
		const end = s.activity.endedAt.getTime()
		const inWindow = (t: number | null) => t != null && t >= start && t <= end
		const rel = (t: number) => Math.round((t - start) / 1000)

		const byTime = new Map<number, Record<string, unknown>>()
		for (const r of records) {
			const t = time(r.timestamp)
			if (inWindow(t)) byTime.set(rel(t!), r)
		}
		const extra: FitSession['extra'] = {}
		if (s.stream) {
			const at = (k: string) =>
				s.stream!.time.map((t) => num(byTime.get(t)?.[k]))
			const speed = s.stream.time.map(
				(t) => num(byTime.get(t)?.enhancedSpeed) ?? num(byTime.get(t)?.speed),
			)
			const cadence = at('cadence')
			const altitude = s.stream.time.map(
				(t) =>
					num(byTime.get(t)?.enhancedAltitude) ?? num(byTime.get(t)?.altitude),
			)
			if (speed.some(isNum)) extra.speed = speed
			if (cadence.some(isNum)) extra.cadence = cadence
			if (altitude.some(isNum)) extra.altitude = altitude
		}

		const laps = lapMesgs
			.filter((l) => inWindow(time(l.startTime)))
			.map((l): DeviceLap | null => {
				const span = num(l.totalElapsedTime) ?? num(l.totalTimerTime)
				if (span == null) return null
				const startSec = rel(time(l.startTime)!)
				return {
					startSec,
					endSec: startSec + Math.round(span),
					intensity: str(l.intensity),
					wktStepIndex: num(l.wktStepIndex),
					lapTrigger: str(l.lapTrigger),
					repetitionNum: num(l.repetitionNum),
					distanceM: num(l.totalDistance),
					avgPower: num(l.avgPower),
					avgHeartRate: num(l.avgHeartRate),
					avgSpeed: num(l.enhancedAvgSpeed) ?? num(l.avgSpeed),
					avgCadence: num(l.avgCadence),
				}
			})
			.filter((l): l is DeviceLap => l != null && l.endSec > l.startSec)
			.sort((a, b) => a.startSec - b.startSec)

		const gaps = s.stream
			? s.stream.time.slice(1).map((t, k) => t - s.stream!.time[k]!)
			: []
		return {
			discipline: s.activity.discipline,
			sport: str(mesg.sport),
			subSport: str(mesg.subSport),
			startedAt: s.activity.startedAt.toISOString(),
			durationSec: s.activity.durationSec,
			raw: s.stream,
			extra,
			laps,
			recordIntervalSec: gaps.length
				? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!
				: null,
		}
	})

	const workoutSteps = (
		(m.workoutStepMesgs ?? []) as unknown as Array<Record<string, unknown>>
	).map((w) => ({
		messageIndex: num(w.messageIndex),
		name: str(w.wktStepName),
		intensity: str(w.intensity),
		durationType: str(w.durationType),
		durationValue: num(w.durationValue) ?? num(w.durationTime),
		targetType: str(w.targetType),
		durationStep: num(w.durationStep),
		repeatSteps: num(w.repeatSteps),
	}))

	return {
		writer: {
			manufacturer: (fileId.manufacturer as string | number) ?? null,
			product:
				(fileId.garminProduct as string | number) ??
				(fileId.product as number) ??
				null,
			productName: str(fileId.productName),
			serialNumber: num(fileId.serialNumber),
			timeCreated: fileId.timeCreated
				? new Date(time(fileId.timeCreated)!).toISOString()
				: null,
		},
		deviceInfo: (m.deviceInfoMesgs ?? []) as unknown as Array<
			Record<string, unknown>
		>,
		workout:
			((m.workoutMesgs?.[0] ?? null) as Record<string, unknown> | null) ?? null,
		workoutSteps,
		lengthCount: m.lengthMesgs?.length ?? 0,
		sessions,
	}
}

/** Gaps up to this long in a 1 s grid are sensor or smart-recording gaps, not pauses. */
const FILL_GAP_SEC = 3

/**
 * The records on an even 1 s grid, the finest the scoreboard reads. Each
 * second is the mean of the records in it. A gap of up to `FILL_GAP_SEC` (a
 * record skipped by smart recording, a dropped reading) carries the last
 * value forward; a longer gap stays `null`, a pause, as at every resolution.
 */
export function oneSecondStream(raw: RawStream): ActivityStream | null {
	const s = downsampleStream(raw, {
		resolutionSec: 1,
		maxSamples: Number.MAX_SAFE_INTEGER,
	})
	if (!s) return null
	const fill = (xs?: Array<number | null>) => {
		if (!xs) return undefined
		const out = [...xs]
		let i = 0
		while (i < out.length) {
			if (out[i] != null) {
				i++
				continue
			}
			let j = i
			while (j < out.length && out[j] == null) j++
			if (i > 0 && j < out.length && j - i <= FILL_GAP_SEC) {
				for (let k = i; k < j; k++) out[k] = out[i - 1]!
			}
			i = j
		}
		return out
	}
	const { sampleCount: _, ...stream } = s
	return {
		...stream,
		...(stream.power ? { power: fill(stream.power) } : {}),
		...(stream.heartrate ? { heartrate: fill(stream.heartrate) } : {}),
		...(stream.pace ? { pace: fill(stream.pace) } : {}),
	}
}

function time(v: unknown): number | null {
	if (v instanceof Date) return v.getTime()
	if (typeof v === 'string') {
		const t = new Date(v).getTime()
		return Number.isNaN(t) ? null : t
	}
	return null
}

function num(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function str(v: unknown): string | null {
	return typeof v === 'string' ? v : v == null ? null : String(v)
}
