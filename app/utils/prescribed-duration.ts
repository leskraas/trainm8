/**
 * **How long a prescription takes** — the one duration reading every surface
 * shares (#615): the session row, I dag, the detail view, the Week Pattern's
 * fixed days, Juster, and a generated week's **Placed Hours** (ADR 0113).
 *
 * Its own module, beside nothing else, because the pure season generator reads
 * it too (ADR 0053 §2) and must not import a file that holds UI palettes.
 *
 * Pure: the blocks and the athlete's thresholds are passed in, nothing is
 * queried.
 */
import {
	type DisciplineThresholdMap,
	parseAuthoredIntensity,
} from './intensity-target.ts'
import { stepDistanceDurationSec } from './shape-strip.ts'
import {
	blockRepeatTotal,
	type SendOff,
	SendOffSchema,
} from './workout-schema.ts'

/** A block as stored: every column the reading needs, JSON columns as text. */
export type DurationBlock = {
	repeatCount: number
	seriesRepeatCount?: number | null
	betweenSeriesRestSec?: number | null
	/**
	 * The stored **Send-Off** JSON, or null. Required, so every reader selects
	 * it: a send-off set's length is known before it starts (ADR 0113 §4), and
	 * a reader that left it out would time the set without its rest.
	 */
	sendOff: string | null
	steps: ReadonlyArray<{
		/** `rest` and `strength` as stored; absent reads as cardio. */
		kind?: string
		discipline?: string | null
		/** Stored Intensity Target JSON, the pace a distance step is timed by. */
		intensity?: string | null
		durationSec: number | null
		distanceM?: number | null
	}>
}

type DurationStep = DurationBlock['steps'][number]

/**
 * What a duration reading times a distance step by, passed explicitly so every
 * surface that says how long a session takes times it the same way (#615).
 */
export type DurationReading = {
	/** The athlete's thresholds: a zone word's pace, else the threshold pace. */
	thresholds: DisciplineThresholdMap
	/** The Workout's Discipline, for a step that names none of its own. */
	discipline?: string | null
}

/** One pass of a step: its time, else its distance at its pace, else null. */
export function stepDurationSec(
	step: DurationStep,
	{ thresholds, discipline: workoutDiscipline }: DurationReading,
): number | null {
	if (step.durationSec != null) return step.durationSec
	if (step.kind === 'strength') return null
	const discipline = step.discipline ?? workoutDiscipline ?? null
	return stepDistanceDurationSec(
		{
			discipline,
			distanceM: step.distanceM,
			intensity: parseAuthoredIntensity(step.intensity),
		},
		discipline ? thresholds[discipline] : undefined,
	)
}

export type PrescribedDuration = {
	seconds: number
	/** Every step was timed. False when one was not and `seconds` falls short. */
	complete: boolean
	/**
	 * Some distance step, or an anchored send-off, was timed through a pace, so
	 * `seconds` is a translation and reads with `≈` (`approxLabel`), as a
	 * Lactate Anchor's zone does.
	 */
	estimated: boolean
}

/**
 * **How long a prescription takes**, the one reading every total shares
 * (#615). A distance step is timed through the pace its intensity resolves to,
 * else the discipline's threshold pace, as the Workout Shape strip does; a
 * step with no Discipline of its own is timed as the Workout's. A repeated
 * block's steps count once per rep of every series, and the rests between
 * series count once between each pair. An untimed strength step, and any step
 * with neither a time nor a pace to give it one, leaves the total incomplete.
 *
 * Under a **Send-Off** each rep takes the larger of its work and its cycle
 * (ADR 0113 §4): the swimmer leaves on the clock, so the rest is whatever the
 * cycle leaves over. An absolute cycle is its interval; an anchored one is CSS
 * plus the allowance per 100 m of the rep's distance, read through a pace. An
 * anchored cycle with no CSS to read leaves the total incomplete.
 *
 * Null when nothing could be timed at all.
 */
export function prescribedDuration(
	blocks: readonly DurationBlock[],
	reading: DurationReading,
): PrescribedDuration | null {
	let seconds = 0
	let timed = 0
	let complete = true
	let estimated = false

	for (const block of blocks) {
		let repSec = 0
		for (const step of block.steps) {
			const stepSec = stepDurationSec(step, reading)
			if (stepSec == null) {
				complete = false
				continue
			}
			timed++
			if (step.durationSec == null) estimated = true
			repSec += stepSec
		}

		const sendOff = parseSendOff(block.sendOff)
		if (sendOff != null) {
			const cycle = sendOffCycleSec(sendOff, block, reading)
			if (cycle == null) {
				complete = false
			} else if (cycle.seconds > repSec) {
				repSec = cycle.seconds
				timed++
				if (cycle.estimated) estimated = true
			}
		}

		seconds += repSec * blockRepeatTotal(block)
		const series = Math.max(1, block.seriesRepeatCount ?? 1)
		seconds += (block.betweenSeriesRestSec ?? 0) * (series - 1)
	}

	return timed > 0 ? { seconds, complete, estimated } : null
}

/**
 * One rep's cycle under a Send-Off, or null where it cannot be read: an
 * anchored cycle with no CSS, or a rep with no distance to anchor it to.
 */
function sendOffCycleSec(
	sendOff: SendOff,
	block: DurationBlock,
	{ thresholds, discipline: workoutDiscipline }: DurationReading,
): { seconds: number; estimated: boolean } | null {
	if (sendOff.kind === 'absolute') {
		return { seconds: sendOff.intervalSec, estimated: false }
	}
	const distanceM = block.steps.reduce(
		(total, step) => total + (step.distanceM ?? 0),
		0,
	)
	const discipline =
		block.steps.find((step) => step.discipline != null)?.discipline ??
		workoutDiscipline ??
		null
	const css = discipline ? thresholds[discipline]?.cssSecPer100m : null
	if (css == null || distanceM <= 0) return null
	const perHundred = css + sendOff.allowanceSecPer100m
	if (perHundred <= 0) return null
	return { seconds: (perHundred * distanceM) / 100, estimated: true }
}

/** The stored Send-Off, or null for none and for a value this schema cannot read. */
function parseSendOff(json: string | null): SendOff | null {
	if (!json) return null
	try {
		const parsed = SendOffSchema.safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

export type PlannedMinutes = {
	minutes: number
	/** Timed through a pace somewhere: reads `≈ 57 min`. */
	estimated: boolean
}

/**
 * {@link prescribedDuration} in whole minutes, or null unless every step was
 * timed: a total that leaves a step out is not the session's, so it is not
 * shown as if it were (the Week Pattern's rule, `fixedDayVolume`).
 */
export function plannedMinutes(
	blocks: readonly DurationBlock[],
	reading: DurationReading,
): PlannedMinutes | null {
	const duration = prescribedDuration(blocks, reading)
	return duration?.complete
		? {
				minutes: Math.round(duration.seconds / 60),
				estimated: duration.estimated,
			}
		: null
}

/** {@link plannedMinutes}'s minutes alone, for a reader that states no `≈`. */
export function sumBlockDurationMin(
	blocks: readonly DurationBlock[],
	reading: DurationReading,
): number | null {
	return plannedMinutes(blocks, reading)?.minutes ?? null
}
