import { coggan, hrTSS, rTSS, sTSS } from './formulas.ts'

/**
 * Planned TSS (ADR 0019): the training stress a Workout Session *prescribes*,
 * computed from each Step's resolved intensity midpoint run through the **same**
 * Load Formula the session uses for actual TSS (Coggan / rTSS / hrTSS / sTSS per
 * ADR 0008). It exists solely to compare against actual TSS as an Adherence Band
 * and must NEVER enter CTL/ATL/TSB — only actual, recorded load is fitness.
 *
 * Pure: callers supply the workout's steps (with their cached resolved ranges)
 * and the athlete's discipline profiles. Honesty over guessing — a Step with
 * neither a quantity nor a resolved intensity contributes nothing; a Step that
 * prescribes something we can't quantify drops the session's confidence to
 * `partial`; a session where nothing resolves is `null` (unavailable), never a
 * fabricated value.
 */

export type PlannedTssStep = {
	kind: string // 'cardio' | 'strength' | 'rest'
	discipline: string | null
	/** Authored IntensityTarget JSON — present means the step prescribes an effort. */
	intensity: string | null
	durationSec: number | null
	distanceM: number | null
	// Resolved intensity ranges (cached by the resolver; null when unresolvable).
	intensityHrMin: number | null
	intensityHrMax: number | null
	intensityPowerMin: number | null
	intensityPowerMax: number | null
	intensityPaceMin: number | null
	intensityPaceMax: number | null
}

export type PlannedTssBlock = {
	repeatCount: number
	steps: PlannedTssStep[]
}

export type PlannedTssWorkout = {
	discipline: string
	blocks: PlannedTssBlock[]
}

type PlannedDisciplineProfile = {
	discipline: string
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	preferCogganTss: boolean
	preferRTSS: boolean
}

export type PlannedTssProfile = {
	disciplineProfiles: PlannedDisciplineProfile[]
}

export type PlannedTssConfidence = 'full' | 'partial'

export type PlannedTssResult = {
	tss: number
	/** `full` when every prescribed step resolved; `partial` when some didn't. */
	confidence: PlannedTssConfidence
}

/** Midpoint of a resolved range; the single endpoint when only one is set. */
function midpoint(min: number | null, max: number | null): number | null {
	if (min != null && max != null) return (min + max) / 2
	return min ?? max ?? null
}

type StepOutcome =
	| { kind: 'open' } // contributes nothing, no confidence penalty
	| { kind: 'contributing'; tss: number }
	| { kind: 'unresolved' } // prescribed an effort we can't quantify → partial

function stepOutcome(
	step: PlannedTssStep,
	workoutDiscipline: string,
	dp: PlannedDisciplineProfile | undefined,
): StepOutcome {
	const hrMid = midpoint(step.intensityHrMin, step.intensityHrMax)
	const powerMid = midpoint(step.intensityPowerMin, step.intensityPowerMax)
	const paceMid = midpoint(step.intensityPaceMin, step.intensityPaceMax)

	const hasQuantity = step.durationSec != null || step.distanceM != null
	const hasResolvedIntensity =
		hrMid != null || powerMid != null || paceMid != null

	// An open step ("warm up until ready"): no quantity and no resolved
	// intensity. Non-cardio steps (strength/rest) carry no resolvable cardio
	// intensity either, so they read as open and never penalise confidence.
	if (step.kind !== 'cardio' || (!hasQuantity && !hasResolvedIntensity)) {
		return { kind: 'open' }
	}

	if (!dp) return { kind: 'unresolved' }

	const discipline = step.discipline ?? workoutDiscipline

	// Pace used both as the formula's intensity and (for distance-only steps) to
	// derive the missing duration. Run/threshold pace is sec/km; swim/CSS pace is
	// sec/100m — mirroring the actual-TSS formula inputs.
	const durationSec = resolveDurationSec(step, discipline, paceMid)
	if (durationSec == null) return { kind: 'unresolved' }

	const tss = stepTss({ discipline, durationSec, hrMid, powerMid, paceMid, dp })
	return tss == null ? { kind: 'unresolved' } : { kind: 'contributing', tss }
}

function resolveDurationSec(
	step: PlannedTssStep,
	discipline: string,
	paceMid: number | null,
): number | null {
	if (step.durationSec != null) return step.durationSec
	if (step.distanceM == null || paceMid == null) return null
	// Distance-only: derive duration from the resolved pace.
	if (discipline === 'swim') return (step.distanceM / 100) * paceMid // sec/100m
	return (step.distanceM / 1000) * paceMid // sec/km (run)
}

function stepTss(opts: {
	discipline: string
	durationSec: number
	hrMid: number | null
	powerMid: number | null
	paceMid: number | null
	dp: PlannedDisciplineProfile
}): number | null {
	const { discipline, durationSec, hrMid, powerMid, paceMid, dp } = opts

	const tryHr = (): number | null => {
		if (hrMid == null) return null
		if (dp.lthr == null && dp.maxHr == null) return null
		return hrTSS({
			durationSec,
			hrAvg: hrMid,
			lthr: dp.lthr ?? undefined,
			maxHr: dp.maxHr ?? undefined,
		}).tss
	}

	if (discipline === 'bike') {
		if (dp.preferCogganTss && dp.ftp != null && powerMid != null) {
			return coggan({ durationSec, np: powerMid, ftp: dp.ftp }).tss
		}
		return tryHr()
	}

	if (discipline === 'run') {
		if (dp.preferRTSS && dp.thresholdPaceSecPerKm != null && paceMid != null) {
			return rTSS({
				durationSec,
				paceAvgSecPerKm: paceMid,
				thresholdPaceSecPerKm: dp.thresholdPaceSecPerKm,
			}).tss
		}
		return tryHr()
	}

	if (discipline === 'swim') {
		if (dp.cssSecPer100m != null && paceMid != null) {
			return sTSS({
				durationSec,
				paceAvgSecPer100m: paceMid,
				cssSecPer100m: dp.cssSecPer100m,
			}).tss
		}
		return null
	}

	// strength / other: no resolvable planned intensity (actual uses sRPE, which
	// has no planned equivalent).
	return null
}

export function computePlannedTss(
	workout: PlannedTssWorkout,
	profile: PlannedTssProfile,
): PlannedTssResult | null {
	let total = 0
	let contributing = 0
	let unresolved = 0

	for (const block of workout.blocks) {
		let blockTss = 0
		for (const step of block.steps) {
			const dp = profile.disciplineProfiles.find(
				(p) => p.discipline === (step.discipline ?? workout.discipline),
			)
			const outcome = stepOutcome(step, workout.discipline, dp)
			if (outcome.kind === 'contributing') {
				blockTss += outcome.tss
				contributing++
			} else if (outcome.kind === 'unresolved') {
				unresolved++
			}
		}
		total += blockTss * block.repeatCount
	}

	if (contributing === 0) return null
	return { tss: total, confidence: unresolved > 0 ? 'partial' : 'full' }
}
