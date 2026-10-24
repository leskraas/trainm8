/**
 * **Weekly Capacity, enforced on a generated season** (#473, ADR 0105).
 *
 * The generator prices every week from the **Season Anchor** (anchor × ramps ×
 * boundary steps × role factor). This module reads those weeks in hours through
 * the same **Volume Conversion** the plan page's hours fit check reads
 * (`weeklyEnduranceHours`, `hoursFitWarnings`), and where the heaviest week
 * outruns the athlete's **Weekly Capacity** it **lowers the anchor** — every
 * endurance track by one common factor — until no week does. The shape's climb
 * is kept; week 1 starts lower. That is the rule #529 first stated for the first
 * run's draft, applied where capacity is an authored ceiling rather than a
 * figure derived from the plan (ADR 0102 §4 keeps the first run's own rule).
 *
 * It reads the **Week Target** and never the placed sessions: a placed corpus row
 * is never rescaled (ADR 0053 §6), so the placed hours are a different reading
 * (ADR 0105 §3).
 *
 * Four honest outcomes, and none of them is "passing" by default:
 *
 * - `unset` — no capacity authored: unavailable, never passing (ADR 0050).
 * - `unpriced` — some week cannot be read in hours (no anchor, no threshold
 *   pace, no ride history): the check is not run and nothing is lowered.
 * - `fits` / `lowered` — every week at or under capacity, at the precision the
 *   athlete reads (the hours check's own rounding).
 * - `over` — even the smallest anchor cannot fit, because the **Quality Session
 *   Mix**'s own hours outrun the capacity. The anchor stays as given and the
 *   breach is carried for the surface to state. Guards warn and never block
 *   (ADR 0042 §9).
 */
import {
	hoursFitWarnings,
	weeklyEnduranceHours,
	type HoursFitWarning,
} from '../plan-outline/availability-fit.ts'
import {
	CURRENCY_DECIMALS,
	weekTargets,
	type PhaseSpec,
	type SegmentSpec,
	type VolumeCurrency,
} from '../plan-outline/derive.ts'
import { type QualitySessionMixEntry } from '../plan-outline/quality-mix.ts'
import { type ConversionContext } from '../plan-outline/volume-conversion.ts'
import { type Discipline } from '../workout-schema.ts'
import { type GenerationTrack } from './season.ts'

/** What the capacity check did to a generated season. Carries no wording. */
export type CapacityFit =
	| { kind: 'unset' }
	| { kind: 'unpriced'; weeklyCapacityHours: number }
	| { kind: 'fits'; peakHours: number; weeklyCapacityHours: number }
	| {
			kind: 'lowered'
			peakHours: number
			weeklyCapacityHours: number
			/** Each track's anchor before and after, in its own currency. */
			anchors: Array<{
				discipline: GenerationTrack['discipline']
				currency: VolumeCurrency
				from: number
				to: number
			}>
	  }
	| {
			kind: 'over'
			weeklyCapacityHours: number
			/** The spans that outrun it, 0-based, as the plan page's check states them. */
			warnings: HoursFitWarning[]
	  }

export type CapacityInput = {
	phases: PhaseSpec[]
	segments: SegmentSpec[]
	/** The **Quality Session Mix** of each phase, by phase index. */
	mixes: ReadonlyArray<readonly QualitySessionMixEntry[]>
	tracks: readonly GenerationTrack[]
	contexts: Partial<Record<Discipline, ConversionContext>>
	weeklyCapacityHours: number | null
}

/** How many factor steps the search runs over: anchors move in 0.1 % steps. */
const FACTOR_STEPS = 1000

/**
 * Fit a season's anchors to the athlete's **Weekly Capacity**.
 *
 * Returns the tracks to generate from (lowered where needed) and what was done.
 * Pure and deterministic: a binary search over a fixed grid, no clock.
 */
export function fitToCapacity(input: CapacityInput): {
	tracks: GenerationTrack[]
	fit: CapacityFit
} {
	const { weeklyCapacityHours: capacity } = input
	const tracks = input.tracks.map((track) => ({ ...track }))
	if (capacity == null) return { tracks, fit: { kind: 'unset' } }

	const hours = weekHours(input, tracks)
	if (hours.length === 0 || hours.some((h) => h == null)) {
		return { tracks, fit: { kind: 'unpriced', weeklyCapacityHours: capacity } }
	}
	if (hoursFitWarnings(hours, capacity).length === 0) {
		return {
			tracks,
			fit: { kind: 'fits', peakHours: peak(hours), weeklyCapacityHours: capacity },
		}
	}

	// Hours are non-decreasing in every anchor, so the largest common factor that
	// fits is found by bisection on a fixed grid.
	const scaled = (step: number) => scaleAnchors(tracks, step / FACTOR_STEPS)
	const fitsAt = (step: number) => {
		const candidate = scaled(step)
		const reading = weekHours(input, candidate)
		return (
			reading.every((h) => h != null) &&
			hoursFitWarnings(reading, capacity).length === 0
		)
	}
	if (!fitsAt(1)) {
		return {
			tracks,
			fit: {
				kind: 'over',
				weeklyCapacityHours: capacity,
				warnings: hoursFitWarnings(hours, capacity),
			},
		}
	}
	let low = 1
	let high = FACTOR_STEPS
	while (high - low > 1) {
		const mid = Math.floor((low + high) / 2)
		if (fitsAt(mid)) low = mid
		else high = mid
	}
	const lowered = scaled(low)
	return {
		tracks: lowered,
		fit: {
			kind: 'lowered',
			peakHours: peak(weekHours(input, lowered)),
			weeklyCapacityHours: capacity,
			anchors: tracks.map((track, at) => ({
				discipline: track.discipline,
				currency: track.currency,
				from: track.anchorValue!,
				to: lowered[at]!.anchorValue!,
			})),
		},
	}
}

/**
 * Each anchor times `factor`, rounded **down** to its currency's precision and
 * never below one step of it — an anchor is a positive number (`createPlanOutline`).
 */
function scaleAnchors(
	tracks: readonly GenerationTrack[],
	factor: number,
): GenerationTrack[] {
	return tracks.map((track) => {
		if (track.anchorValue == null) return { ...track }
		const unit = 10 ** CURRENCY_DECIMALS[track.currency]
		const floored = Math.floor(track.anchorValue * factor * unit + 1e-9) / unit
		return { ...track, anchorValue: Math.max(1 / unit, floored) }
	})
}

/** Every week's endurance hours, through the plan page's own reading. */
function weekHours(
	input: CapacityInput,
	tracks: readonly GenerationTrack[],
): Array<number | null> {
	return weeklyEnduranceHours({
		phases: input.phases,
		contexts: input.contexts,
		tracks: tracks.map((track) => ({
			discipline: track.discipline,
			currency: track.currency,
			targets: weekTargets(input.phases, {
				currency: track.currency,
				anchors:
					track.anchorValue == null
						? []
						: [{ fromWeekIndex: 0, value: track.anchorValue }],
				segments: input.segments,
				overrides: [],
			}).map((value) => ({ value })),
			segments: input.mixes.map((mix, phaseIndex) => ({ phaseIndex, mix })),
		})),
	})
}

function peak(hours: ReadonlyArray<number | null>): number {
	return Math.max(...hours.map((h) => h ?? 0))
}
