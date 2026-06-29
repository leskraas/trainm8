// Resolve an authored Intensity Target into the concrete target an athlete reads
// off the home surface — a pace ("4:05 /km"), power ("235 W"), or heart-rate
// range ("160–166 bpm"). A %-of-threshold target (%FTP, %LTHR/maxHR) is resolved
// against the athlete's Discipline Profile thresholds (ADR 0005); when the
// required threshold is absent it degrades to an Unavailable Metric, never a
// fabricated number (the Unavailable Metric principle in CONTEXT.md). An
// authored zone label is shown as the Training Zone itself.
//
// This is a pure formatter (unit-tested in isolation): no DB, no clock. The
// Cockpit Today card, Week timeline, and session detail all resolve through here
// so the home surface and the detail agree on a session's headline target.

import { formatPaceRange } from './workout-formatting.ts'
import {
	IntensityTargetSchema,
	type IntensityTarget,
} from './workout-schema.ts'
import {
	resolveIntensity,
	type DisciplineProfileForResolver,
} from './zones/resolve.ts'

/** Per-discipline thresholds, keyed by discipline (e.g. `{ run, bike, swim }`). */
export type DisciplineThresholdMap = Partial<
	Record<string, DisciplineProfileForResolver>
>

export type DisplayTarget =
	/** A concrete, resolved target the athlete executes against. */
	| { kind: 'metric'; metric: 'pace' | 'power' | 'hr' | 'rpe'; text: string }
	/** The Training Zone itself — the honest display for a zone-authored step. */
	| { kind: 'zone'; text: string }
	/** Required threshold absent — surfaced as Unavailable, never fabricated. */
	| { kind: 'unavailable' }

/**
 * A resolved target as a short string for display, or `null` when there's
 * nothing truthful to show — no target authored, or an Unavailable Metric whose
 * threshold is missing. Callers render the string when present and omit it
 * otherwise; never a fabricated value (the Unavailable Metric principle,
 * CONTEXT.md).
 */
export function targetText(
	target: DisplayTarget | null | undefined,
): string | null {
	if (!target || target.kind === 'unavailable') return null
	return target.text
}

const EMPTY_PROFILE: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

function range(min: number, max: number | null | undefined, unit: string) {
	return max != null ? `${min}–${max} ${unit}` : `${min} ${unit}`
}

function capitalize(label: string): string {
	const trimmed = label.trim()
	return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed
}

/**
 * Map an authored Intensity Target + the athlete's Discipline Profile thresholds
 * to the concrete display target. Absolute targets (pace, power W, HR bpm, RPE)
 * resolve without a threshold; %-based targets resolve against FTP / LTHR / max
 * HR and degrade to Unavailable when that threshold is missing.
 */
export function formatIntensityTarget(
	target: IntensityTarget,
	profile: DisciplineProfileForResolver,
): DisplayTarget {
	switch (target.kind) {
		case 'pace':
			return {
				kind: 'metric',
				metric: 'pace',
				text: formatPaceRange(target.minSecPerKm, target.maxSecPerKm),
			}
		case 'power':
			return {
				kind: 'metric',
				metric: 'power',
				text: range(target.minW, target.maxW, 'W'),
			}
		case 'hrBpm':
			return {
				kind: 'metric',
				metric: 'hr',
				text: range(target.min, target.max, 'bpm'),
			}
		case 'rpe':
			return {
				kind: 'metric',
				metric: 'rpe',
				text:
					target.max != null
						? `RPE ${target.min}–${target.max}`
						: `RPE ${target.min}`,
			}
		case 'hrPct': {
			const resolved = resolveIntensity(target, profile)
			if (resolved.unavailable || resolved.hrMin == null) {
				return { kind: 'unavailable' }
			}
			return {
				kind: 'metric',
				metric: 'hr',
				text: range(resolved.hrMin, resolved.hrMax, 'bpm'),
			}
		}
		case 'powerPct': {
			const resolved = resolveIntensity(target, profile)
			if (resolved.unavailable || resolved.powerMin == null) {
				return { kind: 'unavailable' }
			}
			return {
				kind: 'metric',
				metric: 'power',
				text: range(resolved.powerMin, resolved.powerMax, 'W'),
			}
		}
		case 'zoneLabel':
			return { kind: 'zone', text: capitalize(target.label) }
	}
}

/**
 * Parse a stored step intensity into an Intensity Target. New steps store the
 * authored discriminated union as JSON; legacy steps stored a bare zone label
 * string (e.g. "endurance"), which we read as a `zoneLabel`. Absent → null.
 */
export function parseAuthoredIntensity(
	intensity: string | null | undefined,
): IntensityTarget | null {
	if (!intensity) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(intensity))
		if (parsed.success) return parsed.data
	} catch {
		// not JSON — fall through to the legacy plain-string zone label
	}
	const label = intensity.trim()
	return label ? { kind: 'zoneLabel', label } : null
}

type StepForTarget = {
	kind: string
	discipline?: string | null
	intensity?: string | null
	durationSec?: number | null
	orderIndex?: number
}

type WorkoutForTarget = {
	blocks: Array<{ repeatCount: number; steps: StepForTarget[] }>
}

/**
 * The single headline target for a whole session — what the Today card, Week
 * timeline stop, and session detail show. A workout can mix zone / pace / HR
 * steps, so we surface the *primary work step*: the cardio step with the most
 * effective work time (`durationSec × block repeatCount`, so interval reps
 * outweigh a long single warm-up), formatted against its own discipline's
 * thresholds. Null when no cardio step carries an intensity target.
 */
export function sessionMetricTarget(
	workout: WorkoutForTarget | null | undefined,
	thresholds: DisciplineThresholdMap = {},
): DisplayTarget | null {
	if (!workout) return null

	type Candidate = {
		target: IntensityTarget
		discipline: string | null
		effDurationSec: number
		order: number
	}
	const candidates: Candidate[] = []
	let order = 0
	for (const block of workout.blocks) {
		const reps = block.repeatCount ?? 1
		for (const step of block.steps) {
			const stepOrder = order++
			if (step.kind !== 'cardio') continue
			const target = parseAuthoredIntensity(step.intensity)
			if (!target) continue
			candidates.push({
				target,
				discipline: step.discipline ?? null,
				effDurationSec: (step.durationSec ?? 0) * reps,
				order: stepOrder,
			})
		}
	}
	if (candidates.length === 0) return null

	// Longest effective effort defines the session; ties resolve to the earlier
	// step so the choice is deterministic.
	candidates.sort(
		(a, b) => b.effDurationSec - a.effDurationSec || a.order - b.order,
	)
	const chosen = candidates[0]!
	const profile =
		(chosen.discipline ? thresholds[chosen.discipline] : undefined) ??
		EMPTY_PROFILE
	return formatIntensityTarget(chosen.target, profile)
}

/**
 * The write-path counterpart to {@link formatIntensityTarget}: turn an authored
 * or generated Intensity Target into the concrete metric target to *persist*, so
 * a generated/authored Workout Session carries a real pace / power / HR that the
 * home and session detail render through the #130 formatter — not just a Training
 * Zone name (a bare `zoneLabel` formats to its name, never a number).
 *
 * A zone-label target is resolved against the athlete's Discipline Profile recipe
 * (ADR 0006) and re-expressed as the per-discipline default metric:
 *   - run  → threshold pace → `pace`     (a pace-anchored recipe)
 *   - bike → %FTP           → `powerPct`  (a power-anchored recipe)
 *   - any  → heart rate     → `hrBpm`     (an HR-anchored recipe — the fallback
 *                                          the PRD calls for when pace/power is
 *                                          unavailable)
 *
 * When no threshold lets the zone resolve — or the metric isn't modelled for the
 * discipline (swim's pace-vs-CSS is per-100m, which neither the IntensityTarget
 * schema nor the formatter express yet) — the original Training Zone label is
 * kept rather than fabricating a number (the Unavailable Metric principle, ADR
 * 0008). An already-metric target is the author's explicit choice and passes
 * through untouched. Pure: no DB, no clock.
 */
export function deriveMetricTarget(
	authored: IntensityTarget,
	discipline: string,
	profile: DisciplineProfileForResolver,
): IntensityTarget {
	if (authored.kind !== 'zoneLabel') return authored

	const resolved = resolveIntensity(authored, profile)
	if (resolved.unavailable) return authored

	// run → threshold pace. Pace is absolute seconds/km (there is no pace-%
	// variant), derived from the athlete's threshold pace × the recipe band.
	if (
		discipline === 'run' &&
		resolved.paceMin != null &&
		profile.thresholdPaceSecPerKm != null
	) {
		return {
			kind: 'pace',
			minSecPerKm: resolved.paceMin,
			...(resolved.paceMax != null ? { maxSecPerKm: resolved.paceMax } : {}),
		}
	}

	// bike → %FTP. The schema has a power-% variant (unlike pace), so we keep the
	// recipe band as a percentage: it resolves against the athlete's FTP for
	// display and still maps to a Workout-Shape zone via `pctToZone`. (Round-trip
	// through the resolved watts lands back on the recipe band % — verified exact
	// for integer FTP — and reuses the audited resolver rather than re-reading the
	// recipe ratios here.)
	if (discipline === 'bike' && resolved.powerMin != null && profile.ftp) {
		const ftp = profile.ftp
		const pct = (watts: number) => Math.round((watts / ftp) * 100)
		return {
			kind: 'powerPct',
			minPct: pct(resolved.powerMin),
			...(resolved.powerMax != null ? { maxPct: pct(resolved.powerMax) } : {}),
		}
	}

	// Heart-rate fallback: an HR-anchored recipe yields an absolute bpm range.
	if (resolved.hrMin != null) {
		return {
			kind: 'hrBpm',
			min: resolved.hrMin,
			...(resolved.hrMax != null ? { max: resolved.hrMax } : {}),
		}
	}

	// Nothing truthful to bake (e.g. swim per-100m pace) → keep the Training Zone.
	return authored
}
