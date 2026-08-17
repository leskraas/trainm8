import { parseAuthoredIntensity } from '../intensity-target.ts'
import {
	intensityTargetToZone,
	pctToZone,
	type TrainingZone,
} from '../session-profile.ts'
import { type DetectionGrade } from '../structure-detection/types.ts'
import { blockRepeatTotal, type IntensityTarget } from '../workout-schema.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { type RepReading, type StructureReading } from './types.ts'

/**
 * The adapter between a **stored Workout** and what the archetype reader reads.
 *
 * Pure, and structurally typed rather than tied to a Prisma payload, so a test
 * can hand it four numbers and the route can hand it a loader row.
 *
 * The one thing worth knowing about it: a persisted structure has **already lost
 * the individual reps**. `analyze.ts`'s `toStructure` emits one averaged step per
 * block with `{ repeatCount: k }`, so a ladder, a pyramid and a flat set are
 * indistinguishable by the time this runs (`interval-detection-and-data-platform.md`
 * Gap 1). That is why `durationCV` comes out `null` here rather than `0`: the
 * reader must not read an average as regularity, and the fartlek branch stays
 * unreachable until a per-interval entity exists.
 */

export type ReadableStep = {
	kind: string
	orderIndex: number
	durationSec: number | null
	/** The **Intensity Target** as stored — JSON, or a legacy bare zone label. */
	intensity: string | null
	/**
	 * The step's own **Discipline** (ADR 0007 puts it here rather than on the
	 * Workout), which is what makes a brick recognisable: "brick workouts emerge
	 * naturally as one Workout with cardio steps in different disciplines". Falls
	 * back to the Workout's for a single-discipline session.
	 */
	discipline?: string | null
}

export type ReadableBlock = {
	orderIndex: number
	repeatCount: number
	seriesRepeatCount?: number | null
	steps: ReadableStep[]
}

export type ReadableWorkout = {
	discipline: string
	blocks: ReadableBlock[]
}

/** What channel the set's intensity was actually expressed in. */
export type ReadChannel = 'power' | 'pace' | 'heartRate'

export type MainSetReading = StructureReading & { channel: ReadChannel }

/**
 * Read a Workout's **main set** — the repeated block — into the geometry the
 * archetype branches need, or `null` when the Workout has no repeated block at
 * all. Null is "nothing structured to read", which sends the reader down its
 * duration-and-intensity path; it is never an empty set.
 *
 * The main set is the block with the most repetitions. Where a block holds a work
 * step and a recovery step, the **hardest** step is the work — read off the zone
 * where a threshold resolves one, and off duration where it does not (a
 * tie-break that cannot change the answer, because an unresolved zone refuses the
 * whole reading downstream anyway).
 */
export function readMainSet(
	workout: ReadableWorkout,
	profile: DisciplineProfileForResolver | undefined,
	grade: DetectionGrade,
): MainSetReading | null {
	const block = mainSetBlock(workout.blocks)
	if (!block) return null

	const cardioSteps = block.steps
		.filter((step) => step.kind === 'cardio')
		.sort((a, b) => a.orderIndex - b.orderIndex)
	if (cardioSteps.length === 0) return null

	const read = cardioSteps.map((step) => ({
		durationSec: step.durationSec ?? 0,
		target: parseAuthoredIntensity(step.intensity),
	}))
	const zoned = read.map((step) => ({
		...step,
		zone: step.target
			? resolveZone(step.target, workout.discipline, profile)
			: null,
	}))

	// The work step: the hardest where zones resolved, else the longest.
	const work = zoned.reduce((hardest, step) =>
		(step.zone ?? 0) > (hardest.zone ?? 0) ||
		((step.zone ?? 0) === (hardest.zone ?? 0) &&
			step.durationSec > hardest.durationSec)
			? step
			: hardest,
	)
	if (work.durationSec <= 0) return null

	const repeats = blockRepeatTotal(block)
	const recoveryPerRep =
		block.steps
			.filter((step) => step !== undefined)
			.reduce((sum, step) => sum + (step.durationSec ?? 0), 0) -
		work.durationSec

	const reps: RepReading[] = Array.from({ length: repeats }, () => ({
		durationSec: work.durationSec,
		zone: work.zone,
	}))

	return {
		reps,
		recoverySec: Math.max(0, recoveryPerRep) * repeats,
		// Averaged away before it was ever stored — see the note at the top.
		durationCV: null,
		grade,
		channel: channelOf(work.target),
	}
}

/**
 * The **canonical** Training Zone a measured target sat in, as a percentage of
 * the athlete's threshold on that channel.
 *
 * Deliberately read against `pctToZone` — the app's own canonical percent→zone
 * table, already what `intensityTargetToZone` uses for `powerPct` and `hrPct` —
 * rather than against the athlete's chosen **Zone Recipe**. §8.2's cut points are
 * calibrated on a five-zone scale, and a recipe may have three bands (`css-3`) or
 * seven (`coggan-power-7`), so reading the recipe's band index would make the same
 * session classify differently for two athletes who only differ in which display
 * table they picked. The recipe decides what the athlete *sees*; the canonical
 * scale decides what the reader *compares*.
 *
 * `null` where no threshold on the target's channel is set — never a population
 * default, which is ADR 0035's rule and the reason detection refuses too.
 */
function resolveZone(
	target: IntensityTarget,
	discipline: string,
	profile: DisciplineProfileForResolver | undefined,
): TrainingZone | null {
	switch (target.kind) {
		case 'power': {
			// A run's power anchor is its critical power (ADR 0038); a ride's is FTP.
			const anchor =
				discipline === 'run'
					? (profile?.runPowerThresholdW ?? profile?.ftp)
					: profile?.ftp
			if (!anchor) return null
			return pctToZone((target.minW / anchor) * 100)
		}
		case 'pace': {
			const anchor =
				discipline === 'swim'
					? profile?.cssSecPer100m
					: profile?.thresholdPaceSecPerKm
			if (!anchor) return null
			// Pace inverts: the percentage is of threshold *speed*, so it divides.
			return pctToZone((anchor / target.minSecPerKm) * 100)
		}
		case 'hrBpm': {
			const anchor = profile?.lthr
			if (!anchor) return null
			return pctToZone((target.min / anchor) * 100)
		}
		default:
			// Zone labels, RPE and the percentage forms need no threshold and are
			// already canonical — one seam for the mapping, not two.
			return intensityTargetToZone(target)
	}
}

/**
 * What the reader classified on, which is what caps the confidence. HR lags and
 * drifts (ADR 0024/0035); a zone label carries no channel of its own, so it takes
 * the direct-signal grade rather than being penalised for a channel it never used.
 */
function channelOf(target: IntensityTarget | null): ReadChannel {
	switch (target?.kind) {
		case 'hrBpm':
		case 'hrPct':
			return 'heartRate'
		case 'pace':
		case 'pacePct':
		case 'racePace':
			return 'pace'
		default:
			return 'power'
	}
}

/** The repeated block, or null when nothing in the Workout repeats. */
function mainSetBlock(blocks: readonly ReadableBlock[]): ReadableBlock | null {
	let best: ReadableBlock | null = null
	let bestRepeats = 1
	for (const block of [...blocks].sort((a, b) => a.orderIndex - b.orderIndex)) {
		const repeats = blockRepeatTotal(block)
		if (repeats > bestRepeats) {
			best = block
			bestRepeats = repeats
		}
	}
	return best
}
