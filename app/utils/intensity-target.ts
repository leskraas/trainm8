// Resolve an authored Intensity Target into the concrete target an athlete reads
// off the home surface — a pace ("4:05 /km"), power ("235 W"), or heart-rate
// range ("160–166 bpm"). A %-of-threshold target (%FTP, %LTHR/maxHR) is resolved
// against the athlete's Discipline Profile thresholds (ADR 0005); an authored
// zone label resolves through the athlete's zone recipe (ADR 0006) the same way
// (#180). When the required threshold is absent it degrades to the captioned
// Training Zone or an Unavailable Metric, never a fabricated number (the
// Unavailable Metric principle in CONTEXT.md).
//
// This is a pure formatter (unit-tested in isolation): no DB, no clock. The
// Cockpit Today card, Week timeline, and session detail all resolve through here
// so the home surface and the detail agree on a session's headline target.

import { formatPaceClock, formatPaceRange } from './format.ts'
import {
	IntensityTargetSchema,
	type IntensityTarget,
} from './workout-schema.ts'
import { DANIELS_PACE_5, getRecipe } from './zones/index.ts'
import {
	resolveIntensity,
	type DisciplineProfileForResolver,
	type ResolvedIntensity,
} from './zones/resolve.ts'

/** Per-discipline thresholds, keyed by discipline (e.g. `{ run, bike, swim }`). */
export type DisciplineThresholdMap = Partial<
	Record<string, DisciplineProfileForResolver>
>

export type DisplayTarget =
	/** A concrete, resolved target the athlete executes against. */
	| { kind: 'metric'; metric: 'pace' | 'power' | 'hr' | 'rpe'; text: string }
	/**
	 * The Training Zone itself — the honest display for a zone-authored step no
	 * threshold resolves. `caption` spells out a cryptic code in plain words
	 * ("E" → "easy/endurance") so it is never shown as a bare letter (#180).
	 */
	| { kind: 'zone'; text: string; caption?: string }
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
	runPowerThresholdW: null,
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
 * Pace zone bands resolve in the recipe anchor's own unit: seconds per 100 m
 * for a CSS-anchored recipe, seconds per km otherwise — so a swim range is
 * never mislabelled `/km`.
 */
function paceUnitFor(profile: DisciplineProfileForResolver): 'km' | '100m' {
	const recipe = profile.zoneSystem ? getRecipe(profile.zoneSystem) : undefined
	return recipe?.anchor === 'css' ? '100m' : 'km'
}

// Daniels letters (E/M/T/I/R) are the one built-in code set that is cryptic
// with no recipe context; no other recipe reuses them, so they caption safely
// even when the athlete has not configured a zone system.
const DANIELS_LETTER_CAPTIONS: Record<string, string> = Object.fromEntries(
	DANIELS_PACE_5.zones.flatMap((z) =>
		z.description ? [[z.label, z.description] as const] : [],
	),
)

/**
 * The plain-words meaning of a zone code ("E" → "easy/endurance"), from the
 * athlete's own recipe first, then the unambiguous Daniels letters. Null when
 * the label is already a word (nothing to spell out) or genuinely unknown.
 */
function zoneCaption(
	label: string,
	profile: DisciplineProfileForResolver,
): string | null {
	const recipe = profile.zoneSystem ? getRecipe(profile.zoneSystem) : undefined
	const described = recipe?.zones.find((z) => z.label === label)?.description
	return described ?? DANIELS_LETTER_CAPTIONS[label] ?? null
}

/**
 * A resolved bound pair as display text. Zone bands can be genuinely open on
 * one side (Friel Z5 is "LTHR and up", Coggan Z1 "anything below 55% FTP"), so
 * the open side is shown honestly (`168+ bpm`, `≤ 138 W`) rather than invented.
 */
function boundedRange(
	min: number | undefined,
	max: number | undefined,
	unit: string,
	fmt: (value: number) => string = String,
): string {
	if (min != null) {
		return max != null
			? `${fmt(min)}–${fmt(max)} ${unit}`
			: `${fmt(min)}+ ${unit}`
	}
	return `≤ ${fmt(max!)} ${unit}`
}

/**
 * The concrete display text for a resolver result, on whichever metric channel
 * it landed. Null when there is nothing concrete to show — the resolution was
 * unavailable, or the target has no metric mapping (RPE-anchored).
 */
function resolvedRangeText(
	resolved: ResolvedIntensity,
	paceUnit: 'km' | '100m',
): { metric: 'pace' | 'power' | 'hr'; text: string } | null {
	if (resolved.unavailable) return null
	if (resolved.powerMin != null || resolved.powerMax != null) {
		return {
			metric: 'power',
			text: boundedRange(resolved.powerMin, resolved.powerMax, 'W'),
		}
	}
	if (resolved.hrMin != null || resolved.hrMax != null) {
		return {
			metric: 'hr',
			text: boundedRange(resolved.hrMin, resolved.hrMax, 'bpm'),
		}
	}
	if (resolved.paceMin != null || resolved.paceMax != null) {
		return {
			metric: 'pace',
			text: boundedRange(
				resolved.paceMin,
				resolved.paceMax,
				paceUnit === '100m' ? '/100m' : '/km',
				formatPaceClock,
			),
		}
	}
	return null
}

/**
 * A missing-threshold resolution failure, when the athlete can fix it in
 * Training Settings by entering the named threshold. Other failures (no zone
 * system configured, a label the recipe does not define) return null — the
 * honest degradation for those is the captioned Training Zone, and a settings
 * pointer would be a false promise.
 */
function missingThresholdReason(resolved: ResolvedIntensity): string | null {
	return resolved.unavailable?.endsWith('is not configured')
		? resolved.unavailable
		: null
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
		case 'zoneLabel': {
			// A zone label resolves through the athlete's zone recipe (ADR 0006) to
			// the concrete range the athlete executes against (#180); when no
			// threshold resolves it, the honest display is the captioned Training
			// Zone — never a fabricated range.
			const resolved = resolveIntensity(target, profile)
			const range = resolvedRangeText(resolved, paceUnitFor(profile))
			if (range) {
				return { kind: 'metric', metric: range.metric, text: range.text }
			}
			const caption = zoneCaption(target.label, profile)
			return {
				kind: 'zone',
				text: capitalize(target.label),
				...(caption ? { caption } : {}),
			}
		}
	}
}

/**
 * How one Workout Step's authored Intensity Target reads on a structure line
 * (#180): the authored target spelled out (`label`), the concrete range it
 * resolves to when that adds information (`resolved`), and — when a range
 * exists but the athlete's threshold is missing — which threshold Training
 * Settings needs (`missingThreshold`). Absolute targets are already concrete,
 * so they carry no second `resolved` range.
 */
export type StepTargetDisplay = {
	/** The authored target, captioned: "E — easy/endurance", "95–105% FTP". */
	label: string
	/** The concrete resolved range: "5:10–6:58 /km", "238–263 W". */
	resolved: string | null
	/** The Training-Settings-fixable reason no range resolved, or null. */
	missingThreshold: string | null
}

const pctLabel = (min: number, max: number | undefined, ref: string) =>
	max != null ? `${min}–${max}% ${ref}` : `${min}%+ ${ref}`

/**
 * Describe a step's Intensity Target for a structure line. Pure; degrades per
 * the Unavailable Metric principle (CONTEXT.md): a %-target or zone label whose
 * threshold is absent keeps its honest authored form and names the missing
 * threshold instead of fabricating a range.
 */
export function describeStepTarget(
	target: IntensityTarget,
	profile: DisciplineProfileForResolver = EMPTY_PROFILE,
): StepTargetDisplay {
	const concrete = { resolved: null, missingThreshold: null }
	switch (target.kind) {
		case 'pace':
			return {
				label: formatPaceRange(target.minSecPerKm, target.maxSecPerKm),
				...concrete,
			}
		case 'power':
			return { label: range(target.minW, target.maxW, 'W'), ...concrete }
		case 'hrBpm':
			return { label: range(target.min, target.max, 'bpm'), ...concrete }
		case 'rpe':
			return {
				label:
					target.max != null
						? `RPE ${target.min}–${target.max}`
						: `RPE ${target.min}`,
				...concrete,
			}
		case 'hrPct': {
			const resolved = resolveIntensity(target, profile)
			return {
				label: pctLabel(
					target.minPct,
					target.maxPct,
					target.ref === 'max' ? 'max HR' : 'LTHR',
				),
				resolved: resolvedRangeText(resolved, 'km')?.text ?? null,
				missingThreshold: missingThresholdReason(resolved),
			}
		}
		case 'powerPct': {
			const resolved = resolveIntensity(target, profile)
			return {
				label: pctLabel(target.minPct, target.maxPct, 'FTP'),
				resolved: resolvedRangeText(resolved, 'km')?.text ?? null,
				missingThreshold: missingThresholdReason(resolved),
			}
		}
		case 'zoneLabel': {
			const caption = zoneCaption(target.label, profile)
			const resolved = resolveIntensity(target, profile)
			return {
				label: caption
					? `${capitalize(target.label)} — ${caption}`
					: capitalize(target.label),
				resolved:
					resolvedRangeText(resolved, paceUnitFor(profile))?.text ?? null,
				missingThreshold: missingThresholdReason(resolved),
			}
		}
	}
}

/**
 * Parse a stored step intensity into an Intensity Target. New steps store the
 * authored discriminated union as JSON; legacy steps stored a bare zone label
 * string (e.g. "endurance"), which we read as a `zoneLabel`. Absent → null.
 * JSON that parses but fails the schema (an incomplete editor draft, corrupt
 * data) is also null — a JSON blob is never a zone label.
 */
export function parseAuthoredIntensity(
	intensity: string | null | undefined,
): IntensityTarget | null {
	if (!intensity) return null
	try {
		const parsed = IntensityTargetSchema.safeParse(JSON.parse(intensity))
		return parsed.success ? parsed.data : null
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
 * The distinct missing thresholds keeping this workout's Intensity Targets
 * from resolving to concrete ranges — each one fixable by entering the named
 * threshold in Training Settings (#180). Empty when everything resolves, and
 * also for failures Training Settings cannot fix (no zone system configured, a
 * label the recipe does not define): pointing the athlete at settings for
 * those would be a false promise.
 */
export function unresolvedThresholdReasons(
	workout: WorkoutForTarget | null | undefined,
	thresholds: DisciplineThresholdMap = {},
): string[] {
	if (!workout) return []
	const reasons = new Set<string>()
	for (const block of workout.blocks) {
		for (const step of block.steps) {
			if (step.kind !== 'cardio') continue
			const target = parseAuthoredIntensity(step.intensity)
			if (!target) continue
			const display = describeStepTarget(
				target,
				(step.discipline ? thresholds[step.discipline] : undefined) ??
					EMPTY_PROFILE,
			)
			if (display.missingThreshold) reasons.add(display.missingThreshold)
		}
	}
	return [...reasons]
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
