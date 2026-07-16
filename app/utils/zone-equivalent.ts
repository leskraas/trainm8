/**
 * Zone-equivalent bucketing (#250, spec §7.1 + §7.4; #247's resolution): the
 * one pure function that places ANY authored Intensity Target on the common
 * five-step intensity scale the editor's chip tint and the strip's segment
 * heights both consume.
 *
 * The model, in order of honesty:
 * - **RPE** maps through the fixed convention table — RPE 1–2 → step 1,
 *   3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5. It is the athlete's own intensity
 *   statement, so it **never degrades to unresolvable**.
 * - **A zone label** maps directly: its band's position in the athlete's own
 *   recipe (recipes with more than five bands — Coggan Z6/Z7 — clamp to the
 *   top step). With no recipe configured, the shared label heuristic still
 *   reads an authored "Z3" as step 3 — the label is itself a zone statement.
 * - **A %-of-threshold target** whose reference IS the recipe's anchor
 *   (%FTP on a power recipe, %LTHR / %maxHR on the matching HR recipe) is a
 *   self-relative ratio and buckets against the recipe bands directly.
 * - **Every other metric target** (pace, watts, bpm, or a % whose reference
 *   differs from the recipe anchor) resolves against the athlete's Discipline
 *   Profile thresholds via the existing zone resolver, and the resolved value
 *   buckets into the recipe band its ratio-to-anchor lands in.
 *
 * Honesty rule: when the required threshold — or the zone system itself — is
 * absent, the result is an explicit unresolvable value carrying a human-words
 * reason, **never a fabricated step** (the Unavailable Metric principle;
 * rejected alternatives: a continuous IF-like scale, Planned-TSS midpoint
 * reuse).
 */
import { formatPaceClock, formatPaceRange } from './format.ts'
import { intensityTargetToZone, type TrainingZone } from './session-profile.ts'
import { type IntensityTarget } from './workout-schema.ts'
import {
	getRecipe,
	resolveIntensity,
	type DisciplineProfileForResolver,
	type ZoneRecipe,
} from './zones/index.ts'

export type ZoneEquivalent =
	| { step: TrainingZone; reason: null }
	| { step: null; reason: string }

/** RPE → intensity step, by the fixed documented convention (spec §7.4). */
export function rpeToStep(min: number): TrainingZone {
	if (min <= 2) return 1
	if (min <= 4) return 2
	if (min <= 6) return 3
	if (min <= 8) return 4
	return 5
}

function clampStep(n: number): TrainingZone {
	if (n <= 1) return 1
	if (n >= 5) return 5
	return n as TrainingZone
}

/** A recipe band's position on the five-step ladder; Z6/Z7 clamp to the top. */
function bandIndexToStep(index: number): TrainingZone {
	return clampStep(index + 1)
}

const mid = (min: number, max: number | null | undefined) =>
	max != null ? (min + max) / 2 : min

/**
 * The recipe band a ratio-to-anchor lands in: containment first, then the
 * nearest band — recipes leave small gaps between band bounds, and a value
 * can sit beyond either end of the ladder.
 */
function bucketRatio(recipe: ZoneRecipe, ratio: number): TrainingZone {
	const contained = recipe.zones.findIndex(
		(band) =>
			ratio >= band.minRatio &&
			(band.maxRatio == null || ratio <= band.maxRatio),
	)
	if (contained >= 0) return bandIndexToStep(contained)
	let best = 0
	let bestDistance = Infinity
	recipe.zones.forEach((band, index) => {
		const distance =
			ratio < band.minRatio
				? band.minRatio - ratio
				: band.maxRatio != null && ratio > band.maxRatio
					? ratio - band.maxRatio
					: 0
		if (distance < bestDistance) {
			bestDistance = distance
			best = index
		}
	})
	return bandIndexToStep(best)
}

function recipeFor(
	profile: DisciplineProfileForResolver | null | undefined,
): ZoneRecipe | undefined {
	return profile?.zoneSystem ? getRecipe(profile.zoneSystem) : undefined
}

const ANCHOR_NAMES: Record<string, string> = {
	ftp: 'FTP',
	runPower: 'run power',
	lthr: 'LTHR',
	maxHr: 'max HR',
	thresholdPace: 'threshold pace',
	css: 'CSS',
}

const ANCHOR_CHANNEL_WORDS: Record<string, string> = {
	ftp: 'power-based',
	runPower: 'power-based',
	lthr: 'heart-rate-based',
	maxHr: 'heart-rate-based',
	thresholdPace: 'pace-based',
	css: 'pace-based',
}

/** "FTP is not configured" → "FTP missing in settings" (human words, B5). */
function missingWords(unavailable: string): string {
	const missing = /^(.+) is not configured$/.exec(unavailable)
	if (missing) return `${missing[1]} missing in settings`
	if (unavailable.startsWith('No zone system'))
		return 'no zone system chosen in settings'
	return unavailable.toLowerCase()
}

const unresolvable = (reason: string): ZoneEquivalent => ({
	step: null,
	reason,
})

/**
 * Bucket an authored Intensity Target into the athlete's own zone band on the
 * common five-step scale. Pure; degrades honestly (see module doc).
 */
export function zoneEquivalent(
	target: IntensityTarget,
	profile: DisciplineProfileForResolver | null | undefined,
): ZoneEquivalent {
	if (target.kind === 'rpe') {
		return { step: rpeToStep(target.min), reason: null }
	}

	const recipe = recipeFor(profile)

	if (target.kind === 'zoneLabel') {
		if (recipe) {
			const index = recipe.zones.findIndex((z) => z.label === target.label)
			if (index >= 0) return { step: bandIndexToStep(index), reason: null }
		}
		const heuristic = intensityTargetToZone(target)
		return heuristic != null
			? { step: heuristic, reason: null }
			: unresolvable(`"${target.label}" isn't a zone in your zone system`)
	}

	if (!recipe) return unresolvable('no zone system chosen in settings')
	if (!profile) return unresolvable('no thresholds in settings')

	// A % target whose reference IS the recipe anchor is already the ratio the
	// bands are written in — bucket directly, no threshold needed.
	if (target.kind === 'powerPct' && recipe.anchor === 'ftp') {
		return {
			step: bucketRatio(recipe, mid(target.minPct, target.maxPct) / 100),
			reason: null,
		}
	}
	if (
		target.kind === 'hrPct' &&
		recipe.anchor === (target.ref === 'max' ? 'maxHr' : 'lthr')
	) {
		return {
			step: bucketRatio(recipe, mid(target.minPct, target.maxPct) / 100),
			reason: null,
		}
	}

	// Everything else resolves to concrete values first, then buckets the
	// resolved midpoint against the recipe's own anchor threshold.
	const resolved = resolveIntensity(target, profile)
	if (resolved.unavailable) {
		return unresolvable(missingWords(resolved.unavailable))
	}

	const anchorValue =
		recipe.anchor === 'ftp'
			? profile.ftp
			: recipe.anchor === 'runPower'
				? profile.runPowerThresholdW
				: recipe.anchor === 'lthr'
					? profile.lthr
					: recipe.anchor === 'maxHr'
						? profile.maxHr
						: recipe.anchor === 'thresholdPace'
							? profile.thresholdPaceSecPerKm
							: recipe.anchor === 'css'
								? profile.cssSecPer100m
								: null
	if (anchorValue == null) {
		return unresolvable(
			`${ANCHOR_NAMES[recipe.anchor] ?? recipe.anchor} missing in settings`,
		)
	}

	let channelValue: number | null = null
	if (recipe.anchor === 'ftp' || recipe.anchor === 'runPower') {
		if (resolved.powerMin != null || resolved.powerMax != null) {
			channelValue = mid(
				resolved.powerMin ?? resolved.powerMax!,
				resolved.powerMax,
			)
		}
	} else if (recipe.anchor === 'lthr' || recipe.anchor === 'maxHr') {
		if (resolved.hrMin != null || resolved.hrMax != null) {
			channelValue = mid(resolved.hrMin ?? resolved.hrMax!, resolved.hrMax)
		}
	} else if (resolved.paceMin != null || resolved.paceMax != null) {
		channelValue = mid(resolved.paceMin ?? resolved.paceMax!, resolved.paceMax)
		// The `pace` target kind is authored in sec/km; a CSS-anchored recipe's
		// bands are ratios to sec/100m, so convert (1 km = 10 × 100 m).
		if (recipe.anchor === 'css' && target.kind === 'pace') {
			channelValue = channelValue / 10
		}
	}
	if (channelValue == null) {
		return unresolvable(
			`this target doesn't map onto your ${ANCHOR_CHANNEL_WORDS[recipe.anchor]} zones`,
		)
	}

	return { step: bucketRatio(recipe, channelValue / anchorValue), reason: null }
}

// ——— Chip content (§7.2) ————————————————————————————————————————————————

/**
 * The authored value in its own compact form — the tinted chip's content:
 * `Z3`, `235 W`, `4:40/km`, `162 bpm`, `RPE 7`, `95% FTP`. The athlete's
 * authored intent stays the authority in the text; the tint carries the
 * zone-equivalent.
 */
export function intensityChipText(target: IntensityTarget): string {
	switch (target.kind) {
		case 'zoneLabel': {
			const trimmed = target.label.trim()
			return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed
		}
		case 'rpe':
			return target.max != null
				? `RPE ${target.min}–${target.max}`
				: `RPE ${target.min}`
		case 'pace':
			return formatPaceRange(target.minSecPerKm, target.maxSecPerKm).replace(
				' /km',
				'/km',
			)
		case 'power':
			return target.maxW != null
				? `${target.minW}–${target.maxW} W`
				: `${target.minW} W`
		case 'powerPct':
			return target.maxPct != null
				? `${target.minPct}–${target.maxPct}% FTP`
				: `${target.minPct}% FTP`
		case 'hrBpm':
			return target.max != null
				? `${target.min}–${target.max} bpm`
				: `${target.min} bpm`
		case 'hrPct': {
			const ref = target.ref === 'max' ? 'max HR' : 'LTHR'
			return target.maxPct != null
				? `${target.minPct}–${target.maxPct}% ${ref}`
				: `${target.minPct}% ${ref}`
		}
	}
}

// ——— Provenance (§7.3, B5) ——————————————————————————————————————————————

/**
 * The one human-words provenance line for the intensity popover: where the
 * zone placement (or its absence) comes from — never a `zoneLabel` enum, a
 * recipe id, or a dev note.
 */
export function zoneEquivalentProvenance(
	target: IntensityTarget,
	equivalent: ZoneEquivalent,
	resolvedRange?: string | null,
): string {
	if (equivalent.step == null) {
		return `can't be placed in a zone — ${equivalent.reason}`
	}
	if (target.kind === 'rpe') {
		return `${intensityChipText(target)} ≈ zone ${equivalent.step} effort`
	}
	if (target.kind === 'zoneLabel') {
		return resolvedRange
			? `${intensityChipText(target)} resolves to ${resolvedRange} from your profile`
			: `zone ${equivalent.step} for you`
	}
	return resolvedRange
		? `≈ zone ${equivalent.step} for you — ${resolvedRange} from your profile`
		: `≈ zone ${equivalent.step} for you`
}

/**
 * The concrete range a target resolves to, as compact display text, or null
 * when nothing truthful resolves — feeds the provenance line above.
 */
export function resolvedRangeText(
	target: IntensityTarget,
	profile: DisciplineProfileForResolver | null | undefined,
): string | null {
	if (!profile) return null
	const resolved = resolveIntensity(target, profile)
	if (resolved.unavailable) return null
	if (resolved.powerMin != null) {
		return resolved.powerMax != null
			? `${resolved.powerMin}–${resolved.powerMax} W`
			: `${resolved.powerMin}+ W`
	}
	if (resolved.hrMin != null) {
		return resolved.hrMax != null
			? `${resolved.hrMin}–${resolved.hrMax} bpm`
			: `${resolved.hrMin}+ bpm`
	}
	if (resolved.paceMin != null) {
		const unit = recipeFor(profile)?.anchor === 'css' ? '/100m' : '/km'
		return resolved.paceMax != null
			? `${formatPaceClock(resolved.paceMin)}–${formatPaceClock(resolved.paceMax)} ${unit}`
			: `${formatPaceClock(resolved.paceMin)}+ ${unit}`
	}
	return null
}
