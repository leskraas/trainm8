import { z } from 'zod'

/**
 * The Activity Stream (ADR 0020): per-sample telemetry for a Recording, stored
 * downsampled and index-aligned so the Workout Detail View can overlay it on the
 * plan. This module owns the pure shape of that data — the downsampler that
 * bounds raw provider streams at ingest, the JSON (de)serialization for the
 * `ActivityStream` row, and the read-time type the overlay consumes. It is
 * provider-agnostic: ingestion (Strava etc.) adapts its wire streams to
 * `RawStream` and persists the `serializeStream` result.
 */

/** The read-time shape the overlay consumes. Channels are optional; a present
 * channel is index-aligned with `timeSec`, with `null` marking a gap (a pause). */
export type ActivityStream = {
	resolutionSec: number
	timeSec: number[]
	power?: Array<number | null>
	heartrate?: Array<number | null>
	pace?: Array<number | null>
}

/** The optional channels carried alongside the elapsed-time axis. */
const CHANNELS = ['power', 'heartrate', 'pace'] as const
type Channel = (typeof CHANNELS)[number]

/**
 * A raw provider stream: an elapsed-seconds axis plus optional, index-aligned
 * channels. `time` need not be evenly spaced (providers sample irregularly and
 * skip across pauses), and a channel entry may be `null` where the provider had
 * no reading for that sample.
 */
export type RawStream = {
	time: number[]
} & Partial<Record<Channel, Array<number | null>>>

/** A downsampled stream plus the persistence metadata stored on the row. */
export type DownsampledStream = ActivityStream & { sampleCount: number }

/**
 * Downsampling policy (ADR 0020). Strava streams arrive ≈1 Hz; the overlay needs
 * no such fidelity, so we collapse to a coarse grid that is never finer than the
 * floor and never longer than the cap — bounding storage and render cost.
 */
export const STREAM_RESOLUTION_FLOOR_SEC = 5
export const STREAM_MAX_SAMPLES = 1000

/** A real telemetry reading: a finite number, not a `null` gap. */
export function isNum(v: number | null | undefined): v is number {
	return v != null && Number.isFinite(v)
}

/**
 * Reduce a raw provider stream to an evenly-spaced, index-aligned, bounded set of
 * channels. The grid starts at elapsed 0 and steps by `resolutionSec`; each grid
 * point is the mean of the raw samples falling in its bucket. A bucket with no
 * samples — or whose samples are all `null` for a channel — yields `null` for
 * that channel, so genuine gaps (pauses, dropped readings, time skips) survive as
 * breaks rather than being interpolated over.
 *
 * Returns `null` when there is nothing plottable: an empty axis, a zero-length
 * span, or no channel carrying a single real value.
 */
export function downsampleStream(
	raw: RawStream,
	{
		resolutionSec: floor = STREAM_RESOLUTION_FLOOR_SEC,
		maxSamples = STREAM_MAX_SAMPLES,
	}: { resolutionSec?: number; maxSamples?: number } = {},
): DownsampledStream | null {
	const { time } = raw
	const n = time.length
	if (n === 0) return null

	const t0 = time[0]!
	const span = time[n - 1]! - t0
	if (!(span > 0)) return null

	const cap = Math.max(2, Math.floor(maxSamples))
	// res ≥ floor, and coarse enough that floor(span/res)+1 ≤ cap samples.
	const res = Math.max(floor, Math.ceil(span / (cap - 1)))
	const bucketCount = Math.floor(span / res) + 1

	const present = CHANNELS.filter((c) => raw[c] != null)
	if (present.length === 0) return null

	const timeSec = Array.from({ length: bucketCount }, (_, k) => k * res)
	const channels: Partial<Record<Channel, Array<number | null>>> = {}
	let anyData = false

	for (const c of present) {
		const values = raw[c]!
		// Sum + count per bucket — the mean denominator counts only the real
		// (non-null, finite) readings, so a partly-null bucket still averages, and
		// a bucket with no readings stays `null` (a preserved gap).
		const sum = new Float64Array(bucketCount)
		const count = new Int32Array(bucketCount)
		for (let i = 0; i < n; i++) {
			const v = values[i]
			if (!isNum(v)) continue
			const k = Math.min(bucketCount - 1, Math.floor((time[i]! - t0) / res))
			sum[k] = sum[k]! + v
			count[k] = count[k]! + 1
		}

		const out: Array<number | null> = new Array(bucketCount)
		for (let k = 0; k < bucketCount; k++) {
			const cnt = count[k]!
			if (cnt === 0) {
				out[k] = null
			} else {
				out[k] = Math.round(sum[k]! / cnt)
				anyData = true
			}
		}
		channels[c] = out
	}
	if (!anyData) return null

	return {
		resolutionSec: res,
		sampleCount: bucketCount,
		timeSec,
		...channels,
	}
}

/** The persisted columns of an `ActivityStream` row (channels are JSON strings). */
type StoredStreamRow = {
	resolutionSec: number
	timeSec: string
	power: string | null
	heartrate: string | null
	pace: string | null
}

/** Serialize a downsampled stream into the `ActivityStream` row's JSON columns. */
export function serializeStream(
	stream: DownsampledStream,
): Omit<StoredStreamRow, 'resolutionSec'> & { sampleCount: number } {
	const channel = (values?: Array<number | null>) =>
		values ? JSON.stringify(values) : null
	return {
		sampleCount: stream.sampleCount,
		timeSec: JSON.stringify(stream.timeSec),
		power: channel(stream.power),
		heartrate: channel(stream.heartrate),
		pace: channel(stream.pace),
	}
}

const ChannelSchema = z.array(z.union([z.number(), z.null()]))

function parseChannel(json: string | null): Array<number | null> | undefined {
	if (!json) return undefined
	try {
		const parsed = ChannelSchema.safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : undefined
	} catch {
		return undefined
	}
}

/**
 * Parse just the power channel of a stored `ActivityStream` row — the input
 * Normalized Power needs (#174) — or `null` when the row is absent or carries
 * no usable power. Same tolerance as `parseStoredStream`: a corrupt blob
 * degrades to "no power stream" so TSS falls back honestly, never throws.
 */
export function parseStoredPowerChannel(
	row: { resolutionSec: number; power: string | null } | null | undefined,
): { resolutionSec: number; power: Array<number | null> } | null {
	if (!row) return null
	const power = parseChannel(row.power)
	if (!power) return null
	return { resolutionSec: row.resolutionSec, power }
}

/**
 * Parse a stored `ActivityStream` row into the read-time shape the overlay
 * consumes, or `null` when the row is absent or unusable. Tolerant of malformed
 * JSON (a corrupt blob degrades to "no telemetry", never throws) — the overlay
 * then falls back to its honest Unavailable Metric state (ADR 0008).
 */
export function parseStoredStream(
	row: StoredStreamRow | null | undefined,
): ActivityStream | null {
	if (!row) return null
	let timeSec: number[]
	try {
		const parsed = z.array(z.number()).safeParse(JSON.parse(row.timeSec))
		if (!parsed.success || parsed.data.length === 0) return null
		timeSec = parsed.data
	} catch {
		return null
	}
	const power = parseChannel(row.power)
	const heartrate = parseChannel(row.heartrate)
	const pace = parseChannel(row.pace)
	if (!power && !heartrate && !pace) return null
	return {
		resolutionSec: row.resolutionSec,
		timeSec,
		...(power ? { power } : {}),
		...(heartrate ? { heartrate } : {}),
		...(pace ? { pace } : {}),
	}
}
