/**
 * A synthetic Garmin-shaped pool swim, built at test time through the official
 * SDK encoder (no real file is ever committed, and this one has no GPS and a
 * made-up serial). It follows the FIT cookbook's pool swim sequence and what
 * decoded Garmin swims hold (`623-pool-swims.md` §3, `635-device-fit-originals.md`
 * §8): a set is a lap of active lengths, rest is its own lap of one idle
 * length, and the records carry heart rate only, as an FR965's do.
 *
 * 25 m pool: WU 200 free, 30 s rest, 4 × (100 free in 1:30 + 15 s rest),
 * 50 drill, 100 mixed. 750 m in 851 s, 761 s of it swimming: 35 lengths, 5 idle,
 * in 12 laps. `oneLap` writes it as a fēnix 5 does: the whole swim one lap,
 * with the idle lengths inside it.
 */
import { Encoder } from '@garmin/fitsdk'
import { writeMesg } from './fit-builder.ts'

export const POOL_SWIM_START = new Date('2026-06-03T06:00:00Z')

const POOL_LENGTH_M = 25

/** A set (active lengths of one stroke) or a rest (one idle length). */
type SetSpec =
	| { lengths: number; durationSec: number; stroke: string }
	| { restSec: number }

const SETS: SetSpec[] = [
	{ lengths: 8, durationSec: 200, stroke: 'freestyle' },
	{ restSec: 30 },
	...Array.from({ length: 4 }, (): SetSpec[] => [
		{ lengths: 4, durationSec: 90, stroke: 'freestyle' },
		{ restSec: 15 },
	]).flat(),
	{ lengths: 2, durationSec: 80, stroke: 'drill' },
	{ lengths: 4, durationSec: 121, stroke: 'mixed' },
]

export function encodePoolSwim({
	oneLap = false,
	start = POOL_SWIM_START,
}: {
	oneLap?: boolean
	/** When the swim starts; a whole second, as FIT stores it. */
	start?: Date
} = {}): Uint8Array {
	const encoder = new Encoder()
	const at = (sec: number) => new Date(start.getTime() + sec * 1000)

	writeMesg(encoder, 'FILE_ID', {
		type: 'activity',
		manufacturer: 'garmin',
		product: 0,
		timeCreated: start,
		serialNumber: 123456789,
	})

	let sec = 0
	let lengthIndex = 0
	let activeLengths = 0
	let lapIndex = 0
	for (const set of SETS) {
		const lapStart = sec
		const firstLengthIndex = lengthIndex
		const isRest = 'restSec' in set
		const lengths = isRest
			? [{ durationSec: set.restSec, active: false }]
			: Array.from({ length: set.lengths }, () => ({
					durationSec: set.durationSec / set.lengths,
					active: true,
				}))
		for (const length of lengths) {
			writeMesg(encoder, 'RECORD', {
				timestamp: at(sec),
				heartRate: length.active ? 148 : 122,
			})
			writeMesg(encoder, 'LENGTH', {
				messageIndex: lengthIndex++,
				timestamp: at(sec + length.durationSec),
				startTime: at(sec),
				totalElapsedTime: length.durationSec,
				totalTimerTime: length.durationSec,
				lengthType: length.active ? 'active' : 'idle',
				...(!isRest
					? {
							swimStroke: set.stroke,
							avgSpeed: POOL_LENGTH_M / length.durationSec,
							totalStrokes: 14,
						}
					: {}),
			})
			if (length.active) activeLengths++
			sec += length.durationSec
		}
		if (oneLap) continue
		writeMesg(encoder, 'LAP', {
			messageIndex: lapIndex++,
			timestamp: at(sec),
			startTime: at(lapStart),
			totalElapsedTime: sec - lapStart,
			totalTimerTime: sec - lapStart,
			totalDistance: isRest ? 0 : set.lengths * POOL_LENGTH_M,
			firstLengthIndex,
			numLengths: lengths.length,
			numActiveLengths: isRest ? 0 : set.lengths,
			lapTrigger: 'manual',
			sport: 'swimming',
			subSport: 'lapSwimming',
			...(isRest ? {} : { swimStroke: set.stroke }),
		})
	}

	if (oneLap) {
		writeMesg(encoder, 'LAP', {
			messageIndex: lapIndex++,
			timestamp: at(sec),
			startTime: start,
			totalElapsedTime: sec,
			totalTimerTime: sec,
			totalDistance: activeLengths * POOL_LENGTH_M,
			firstLengthIndex: 0,
			numLengths: lengthIndex,
			numActiveLengths: activeLengths,
			lapTrigger: 'sessionEnd',
			sport: 'swimming',
			subSport: 'lapSwimming',
			swimStroke: 'mixed',
		})
	}

	writeMesg(encoder, 'SESSION', {
		timestamp: at(sec),
		startTime: start,
		sport: 'swimming',
		subSport: 'lapSwimming',
		totalElapsedTime: sec,
		totalTimerTime: sec,
		totalDistance: activeLengths * POOL_LENGTH_M,
		avgHeartRate: 142,
		maxHeartRate: 158,
		poolLength: POOL_LENGTH_M,
		poolLengthUnit: 'metric',
		// An FR965 counts active lengths only here, a fēnix 5 every length, so
		// the parser must count from `length_type` instead.
		numLengths: oneLap ? lengthIndex : activeLengths,
		numActiveLengths: activeLengths,
		firstLapIndex: 0,
		numLaps: lapIndex,
	})
	writeMesg(encoder, 'ACTIVITY', {
		timestamp: at(sec),
		totalTimerTime: sec,
		numSessions: 1,
		type: 'manual',
	})
	return encoder.close()
}
