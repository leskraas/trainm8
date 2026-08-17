import { type CardioDiscipline } from '../workout-schema.ts'
import { capConfidence, gradeEstimate, scoreEstimate } from './confidence.ts'
import {
	ANALYSIS_WINDOW_DAYS,
	CP_FIT_BAND_SEC,
	MEAN_MAXIMAL_DURATIONS_SEC,
	MIN_HR_ACTIVITIES,
	OBSERVED_HR_PERCENTILE,
	PLAUSIBLE_MAX_HR,
	TANAKA_AGE_RANGE,
	TANAKA_CONFIDENCE,
	TANAKA_INTERCEPT,
	TANAKA_SLOPE,
} from './constants.ts'
import { fitCriticalPower } from './cp-fit.ts'
import {
	type CurveContribution,
	meanMaximalCurve,
	mergeCurves,
	type SampledChannel,
} from './mean-maximal.ts'
import {
	EMPTY_BASIS,
	type EstimateBasis,
	type ThresholdConstruct,
	type ThresholdEstimate,
	type ThresholdProtocol,
} from './types.ts'

/**
 * **Profile Analysis**, the pure half: an athlete's imported history in, a set
 * of **Threshold Estimates** out.
 *
 * Deterministic in the same sense the season generator is (ADR 0053 §2): it
 * **reads no clock** — `now` is an argument — has no random source, mutates
 * nothing, and cannot query. The server half assembles the input; this decides.
 *
 * Every rung either produces a number with its provenance or **states why it
 * could not**. Nothing degrades to a plausible-looking default, and nothing is
 * silently omitted, which is the same rule the generator holds for an
 * `unfilled` slot and detection holds when it returns `null`.
 */

/** One activity, reduced to what any rung might read. */
export type AnalysisActivity = {
	id: string
	discipline: CardioDiscipline
	occurredAt: Date
	/** The provider's per-activity HR maximum — a summary, never downsampled. */
	hrMax: number | null
	/** Power as stored, or `null`. Watts for a ride; running power for a run. */
	power: SampledChannel | null
	/**
	 * Speed in m/s as stored, or `null`. Derived from the `pace` channel by the
	 * caller, because a mean-*maximal* of `sec/km` would be the athlete's
	 * slowest: the model needs the quantity that increases with performance.
	 */
	speedMps: SampledChannel | null
}

export type AnalysisInput = {
	/** Injected, never read — the module is pure (ADR 0053 §2's rule). */
	now: Date
	birthdate: Date | null
	/** Already narrowed to the analysis window by the caller. */
	activities: readonly AnalysisActivity[]
}

const DAY_MS = 86_400_000

/** Every estimate this module knows how to attempt, in surface order. */
export function estimateProfile(input: AnalysisInput): ThresholdEstimate[] {
	const byDiscipline = new Map<CardioDiscipline, AnalysisActivity[]>()
	for (const activity of input.activities) {
		const bucket = byDiscipline.get(activity.discipline) ?? []
		bucket.push(activity)
		byDiscipline.set(activity.discipline, bucket)
	}

	const out: ThresholdEstimate[] = []
	for (const discipline of ['run', 'bike', 'swim'] as const) {
		const activities = byDiscipline.get(discipline) ?? []
		out.push(estimateMaxHr(discipline, activities, input))
		if (discipline === 'bike') {
			out.push(estimatePowerThreshold(discipline, activities, input, 'cp'))
		}
		if (discipline === 'run') {
			out.push(
				estimatePowerThreshold(discipline, activities, input, 'runPower'),
			)
			out.push(estimateCriticalSpeed(activities, input))
		}
		if (discipline === 'swim') {
			// CSS needs a 400 m / 200 m pair. Swim imports carry no stream and no
			// laps worth the name, so this is a data gap and not a modelling one —
			// stated rather than approximated from a whole-swim average pace, which
			// would be a steady effort wearing a test's clothes.
			out.push({
				kind: 'refusal',
				discipline,
				construct: 'css',
				protocol: 'race-equivalence',
				refusal: 'unbuilt',
				basis: windowBasis(activities, input, 0),
			})
		}
	}
	return out
}

/**
 * Max HR: the athlete's **observed** maximum where the history supports one,
 * otherwise **Tanaka**'s age regression, otherwise a stated refusal.
 *
 * A ladder rather than two competing estimates, on `resolveClassifier`'s
 * precedent: what the surface needs is one answer plus the protocol that
 * produced it, not two numbers to reconcile.
 */
function estimateMaxHr(
	discipline: CardioDiscipline,
	activities: readonly AnalysisActivity[],
	input: AnalysisInput,
): ThresholdEstimate {
	const observed = activities
		.filter(
			(activity): activity is AnalysisActivity & { hrMax: number } =>
				activity.hrMax != null &&
				Number.isFinite(activity.hrMax) &&
				activity.hrMax >= PLAUSIBLE_MAX_HR[0] &&
				activity.hrMax <= PLAUSIBLE_MAX_HR[1],
		)
		.sort((a, b) => a.hrMax - b.hrMax)

	if (observed.length >= MIN_HR_ACTIVITIES) {
		// A **percentile of per-activity maxima**, not the single global maximum:
		// strap dropouts and cross-talk produce isolated spikes that
		// `ActivityImport.hrMax` inherits verbatim, and one bad sample in three
		// years would otherwise set the whole zone ladder.
		const index = Math.max(
			0,
			Math.ceil(OBSERVED_HR_PERCENTILE * observed.length) - 1,
		)
		const picked = observed[index]!
		const latest = observed.reduce<Date>(
			(newest, activity) =>
				activity.occurredAt > newest ? activity.occurredAt : newest,
			observed[0]!.occurredAt,
		)
		const basis: EstimateBasis = {
			...windowBasis(activities, input, observed.length),
			latestISO: latest.toISOString(),
		}
		const score = scoreEstimate({
			coverage: 1,
			recencyDays: daysBetween(latest, input.now),
			contributingActivities: observed.length,
			rSquared: null,
		})
		return {
			kind: 'estimate',
			discipline,
			construct: 'maxHr',
			protocol: 'observed',
			value: Math.round(picked.hrMax),
			confidence: gradeEstimate(score),
			basis,
			companion: null,
		}
	}

	const age = ageAt(input.birthdate, input.now)
	if (age == null) {
		return {
			kind: 'refusal',
			discipline,
			construct: 'maxHr',
			protocol: observed.length > 0 ? 'observed' : 'tanaka',
			refusal: input.birthdate == null ? 'no-birthdate' : 'no-data',
			basis: windowBasis(activities, input, observed.length),
		}
	}

	return {
		kind: 'estimate',
		discipline,
		construct: 'maxHr',
		protocol: 'tanaka',
		value: Math.round(TANAKA_INTERCEPT - TANAKA_SLOPE * age),
		// Pinned, not scored. A population regression says nothing about this
		// athlete, so no amount of history can raise it — the same shape as
		// ADR 0033's HR ceiling on a detection.
		confidence: capConfidence('low', TANAKA_CONFIDENCE),
		basis: windowBasis(activities, input, 0),
		companion: null,
	}
}

/**
 * A power-anchored threshold from the mean-maximal curve.
 *
 * `construct` is `cp` for a ride and `runPower` for a run: the same fit over the
 * same model, but the two are different quantities against different band
 * ladders (ADR 0038 separates the `runPower` anchor from `ftp` for exactly this
 * reason), so they are never merged into one estimate.
 */
function estimatePowerThreshold(
	discipline: CardioDiscipline,
	activities: readonly AnalysisActivity[],
	input: AnalysisInput,
	construct: Extract<ThresholdConstruct, 'cp' | 'runPower'>,
): ThresholdEstimate {
	const contributions: CurveContribution[] = []
	for (const activity of activities) {
		if (!activity.power) continue
		contributions.push({
			activityId: activity.id,
			occurredAt: activity.occurredAt,
			points: meanMaximalCurve(activity.power, MEAN_MAXIMAL_DURATIONS_SEC),
		})
	}
	return fitToEstimate({
		discipline,
		construct,
		contributions,
		activities,
		input,
		toValue: (fitted) => Math.round(fitted),
		companion: (wPrime) => ({
			label: 'W′',
			value: Math.round(wPrime),
		}),
	})
}

/**
 * **Critical speed** from the pace channel, expressed back as seconds per km.
 *
 * The same linear model in a different currency: `v(t) = CS + D′/t`. It is a
 * genuine anchor and it is **not a race result** — the fastest 20 minutes inside
 * a training run is a different quantity from a 10 k personal best, and the two
 * must never be labelled as each other. Nor is CS a threshold pace: it sits
 * above it, the same way CP sits above FTP.
 */
function estimateCriticalSpeed(
	activities: readonly AnalysisActivity[],
	input: AnalysisInput,
): ThresholdEstimate {
	const contributions: CurveContribution[] = []
	for (const activity of activities) {
		if (!activity.speedMps) continue
		contributions.push({
			activityId: activity.id,
			occurredAt: activity.occurredAt,
			points: meanMaximalCurve(activity.speedMps, MEAN_MAXIMAL_DURATIONS_SEC),
		})
	}
	return fitToEstimate({
		discipline: 'run',
		construct: 'criticalSpeed',
		contributions,
		activities,
		input,
		// m/s back to sec/km, the unit `thresholdPaceSecPerKm` stores.
		toValue: (fitted) => Math.round(1000 / fitted),
		companion: (dPrime) => ({ label: 'D′', value: Math.round(dPrime) }),
		// The plausibility band is on the *fitted* quantity (m/s), so the shared
		// watt bounds in `fitCriticalPower` do not apply. Scale into the band the
		// fit checks, then scale back — 1 m/s ≈ 100 W on that scale, which keeps a
		// 2.0–7.0 m/s runner inside the 50–600 window and rejects the rest.
		scale: 100,
	})
}

/** The shared tail of every curve-fitted rung. */
function fitToEstimate({
	discipline,
	construct,
	contributions,
	activities,
	input,
	toValue,
	companion,
	scale = 1,
}: {
	discipline: CardioDiscipline
	construct: ThresholdConstruct
	contributions: CurveContribution[]
	activities: readonly AnalysisActivity[]
	input: AnalysisInput
	toValue: (fitted: number) => number
	companion: (companionRaw: number) => { label: string; value: number }
	scale?: number
}): ThresholdEstimate {
	const protocol: ThresholdProtocol = 'cp-fit'
	const basisFor = (extra: Partial<EstimateBasis> = {}): EstimateBasis => ({
		...windowBasis(activities, input, contributions.length),
		...extra,
	})

	if (contributions.length === 0) {
		return {
			kind: 'refusal',
			discipline,
			construct,
			protocol,
			refusal: 'no-data',
			basis: basisFor(),
		}
	}

	const scaled = contributions.map((contribution) => ({
		...contribution,
		points: contribution.points.map((point) => ({
			...point,
			value: point.value == null ? null : point.value * scale,
		})),
	}))
	const curve = mergeCurves(scaled, MEAN_MAXIMAL_DURATIONS_SEC)
	const durationsRefusedSec = curve
		.filter((point) => point.value == null)
		.map((point) => point.durationSec)

	const fit = fitCriticalPower(curve)
	if (fit.kind === 'refusal') {
		return {
			kind: 'refusal',
			discipline,
			construct,
			protocol,
			// A band with nothing in it because every window was too coarse reads as
			// a *resolution* refusal, not a missing-efforts one: the athlete did the
			// efforts, the storage cannot see them (ADR 0020).
			refusal:
				fit.refusal === 'insufficient-efforts' &&
				everyBandPointRefusedForResolution(curve)
					? 'resolution'
					: fit.refusal,
			basis: basisFor({
				durationsUsedSec: fit.durationsUsedSec,
				durationsRefusedSec,
			}),
		}
	}

	const score = scoreEstimate({
		coverage: fit.durationsUsedSec.length / countInBand(),
		recencyDays: fit.latest ? daysBetween(fit.latest, input.now) : Infinity,
		contributingActivities: fit.contributingActivityIds.length,
		rSquared: fit.rSquared,
	})

	return {
		kind: 'estimate',
		discipline,
		construct,
		protocol,
		value: toValue(fit.cpW / scale),
		confidence: gradeEstimate(score),
		basis: basisFor({
			contributingCount: fit.contributingActivityIds.length,
			latestISO: fit.latest?.toISOString() ?? null,
			durationsUsedSec: fit.durationsUsedSec,
			durationsRefusedSec,
			rSquared: fit.rSquared,
		}),
		companion: companion(fit.wPrimeJ / scale),
	}
}

/** How many sampled durations fall inside the model's valid band. */
function countInBand(): number {
	const [minSec, maxSec] = CP_FIT_BAND_SEC
	return MEAN_MAXIMAL_DURATIONS_SEC.filter(
		(duration) => duration >= minSec && duration <= maxSec,
	).length
}

function everyBandPointRefusedForResolution(
	curve: readonly {
		durationSec: number
		value: number | null
		refusal: unknown
	}[],
): boolean {
	const [minSec, maxSec] = CP_FIT_BAND_SEC
	const inBand = curve.filter(
		(point) => point.durationSec >= minSec && point.durationSec <= maxSec,
	)
	return (
		inBand.length > 0 &&
		inBand.every(
			(point) => point.value == null && point.refusal === 'resolution',
		)
	)
}

function windowBasis(
	activities: readonly AnalysisActivity[],
	input: AnalysisInput,
	contributingCount: number,
): EstimateBasis {
	const from = new Date(input.now.getTime() - ANALYSIS_WINDOW_DAYS * DAY_MS)
	return {
		...EMPTY_BASIS,
		activityCount: activities.length,
		contributingCount,
		fromISO: from.toISOString(),
		toISO: input.now.toISOString(),
	}
}

function daysBetween(from: Date, to: Date): number {
	return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS)
}

/** Whole years at `now`, or `null` where there is no usable birthdate. */
export function ageAt(birthdate: Date | null, now: Date): number | null {
	if (!birthdate || Number.isNaN(birthdate.getTime())) return null
	let age = now.getUTCFullYear() - birthdate.getUTCFullYear()
	const monthDelta = now.getUTCMonth() - birthdate.getUTCMonth()
	if (
		monthDelta < 0 ||
		(monthDelta === 0 && now.getUTCDate() < birthdate.getUTCDate())
	) {
		age -= 1
	}
	const [minAge, maxAge] = TANAKA_AGE_RANGE
	return age >= minAge && age <= maxAge ? age : null
}
