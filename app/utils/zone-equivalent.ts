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
import {
	POWER_REF_LABELS,
	type DisciplineThresholdMap,
} from './intensity-target.ts'
import {
	INTENSITY_DISPLAY_WORDS,
	nbUnavailableReason,
	ZONE_PROVENANCE_LABELS as P,
	zoneLabelWord,
} from './labels.ts'
import { intensityTargetToZone, type TrainingZone } from './session-profile.ts'
import { classifyingRecipe } from './structure-detection/classify.ts'
import { type ClassifyChannel } from './structure-detection/constants.ts'
import { powerPctRef, type IntensityTarget } from './workout-schema.ts'
import {
	formatMmol,
	getRecipe,
	resolvedPaceUnit,
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

/**
 * The **Training Zone** a recipe band is — the band's own declaration first,
 * its position as the fallback (Z6/Z7 clamp to the top).
 *
 * Position alone is the thing ADR 0045 §3 rejected: it misfiles Daniels' `T`,
 * which is threshold and sits third, and it cannot read a recipe with six bands
 * at all — `norwegian-threshold-run` puts `sub-T` and `T` on the same zone 4,
 * which no positional rule can express. Position survives only for the bands
 * that deliberately declare nothing (Daniels' `R`, Stryd's `Z5`), where it is
 * the same answer it always gave.
 */
function bandStep(recipe: ZoneRecipe, index: number): TrainingZone {
	return recipe.zones[index]?.zone ?? clampStep(index + 1)
}

/**
 * The index of the band whose published lactate range covers a reading, or -1.
 * Same rule as the resolver's: match on the authored range's midpoint, ties to
 * the easier band, and no nearest-band fallback — a reading past the last
 * declared band is where the recipe's source stops speaking.
 */
function lactateBand(
	recipe: ZoneRecipe,
	minMmol: number,
	maxMmol: number | undefined,
): number {
	const midpoint = maxMmol != null ? (minMmol + maxMmol) / 2 : minMmol
	return recipe.zones.findIndex(
		(band) =>
			band.lactateMmolMin != null &&
			band.lactateMmolMax != null &&
			midpoint >= band.lactateMmolMin &&
			midpoint <= band.lactateMmolMax,
	)
}

/** The recipe anchor a `powerPct` reference is self-relative to, or null when
 * the app models no such threshold (MAP) and the shortcut cannot apply. */
function powerAnchorFor(target: { ref?: 'ftp' | 'map' | 'cp' }) {
	const ref = powerPctRef(target)
	return ref === 'ftp' ? 'ftp' : ref === 'cp' ? 'runPower' : null
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
	if (contained >= 0) return bandStep(recipe, contained)
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
	return bandStep(recipe, best)
}

function recipeFor(
	profile: DisciplineProfileForResolver | null | undefined,
): ZoneRecipe | undefined {
	return profile?.zoneSystem ? getRecipe(profile.zoneSystem) : undefined
}

const ANCHOR_NAMES = P.anchors

const ANCHOR_CHANNEL_WORDS = P.channels

/** "FTP is not configured" → "FTP mangler i innstillingene" (human words,
 * B5), lower-cased when it is a sentence nobody has worded yet. */
function missingWords(unavailable: string): string {
	const words = nbUnavailableReason(unavailable)
	return words === unavailable ? unavailable.toLowerCase() : words
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
			if (index >= 0) return { step: bandStep(recipe, index), reason: null }
		}
		const heuristic = intensityTargetToZone(target)
		return heuristic != null
			? { step: heuristic, reason: null }
			: unresolvable(P.notAZone(target.label))
	}

	if (!recipe) return unresolvable(P.noZoneSystem)
	if (!profile) return unresolvable(P.noThresholds)

	// A % target whose reference IS the recipe anchor is already the ratio the
	// bands are written in — bucket directly, no threshold needed.
	if (target.kind === 'powerPct' && recipe.anchor === powerAnchorFor(target)) {
		return {
			step: bucketRatio(recipe, mid(target.minPct, target.maxPct) / 100),
			reason: null,
		}
	}
	// A pace percentage is of threshold *speed*, so the ratio the pace-anchored
	// bands are written in is its reciprocal — 98 % T-pace is 1.02 × T pace.
	if (target.kind === 'pacePct' && recipe.anchor === 'thresholdPace') {
		return {
			step: bucketRatio(recipe, 100 / mid(target.minPct, target.maxPct)),
			reason: null,
		}
	}
	// A lactate target's band placement comes from the band the recipe itself
	// declares the reading in — no threshold needed, since the recipe already
	// says which of its own bands that lactate is.
	if (target.kind === 'lactate') {
		const band = lactateBand(recipe, target.minMmol, target.maxMmol)
		if (band >= 0) return { step: bandStep(recipe, band), reason: null }
		return unresolvable(P.noLactate(recipe.name))
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
			P.missingInSettings(ANCHOR_NAMES[recipe.anchor] ?? recipe.anchor),
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
		// A CSS-anchored recipe's bands are ratios to sec/100 m; a pace the
		// resolver hands back per km converts (1 km = 10 × 100 m).
		if (
			recipe.anchor === 'css' &&
			resolvedPaceUnit(target.kind, recipe.anchor) === 'secPerKm'
		) {
			channelValue = channelValue / 10
		}
	}
	if (channelValue == null) {
		return unresolvable(
			P.noMap(ANCHOR_CHANNEL_WORDS[recipe.anchor] ?? recipe.anchor),
		)
	}

	return { step: bucketRatio(recipe, channelValue / anchorValue), reason: null }
}

/** The detection channel each measured target kind is classified on. */
const MEASURED_CHANNEL: Partial<
	Record<IntensityTarget['kind'], ClassifyChannel>
> = { power: 'power', pace: 'pace', hrBpm: 'heartrate' }

/**
 * The one reading of an authored target as a Training Zone against the
 * athlete's thresholds, for I dag's Effort Word and a detected session's
 * intent alike (#638), so the two cannot disagree. Null when nothing zones it.
 *
 * A target that names its zone (a zone label, RPE, a percentage) reads as the
 * Workout Shape reads it. A measured target (watts, pace, bpm) on a run or ride is zoned on the recipe
 * Structure Detection classifies that channel against (`classifyingRecipe`),
 * not blindly on the athlete's own: a Daniels runner with a critical-power
 * threshold is classified on Stryd power bands, and the pace recipe cannot
 * place watts at all (#617).
 */
export function readTargetZone(
	target: IntensityTarget,
	discipline: string,
	thresholds: DisciplineThresholdMap,
): TrainingZone | null {
	const named = intensityTargetToZone(target)
	if (named != null) return named
	const profile = thresholds[discipline]
	const channel = MEASURED_CHANNEL[target.kind]
	const recipe =
		profile &&
		channel &&
		(discipline === 'run' || discipline === 'bike') &&
		classifyingRecipe(discipline, profile, channel)
	return zoneEquivalent(
		target,
		recipe ? { ...profile, zoneSystem: recipe.id } : profile,
	).step
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
		// The stored word in Norwegian (`threshold` → `Terskel`), as the
		// notation's own chip reads it; a code (`Z3`) passes through.
		case 'zoneLabel':
			return zoneLabelWord(target.label)
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
		case 'powerPct': {
			const ref = POWER_REF_LABELS[powerPctRef(target)]
			return target.maxPct != null
				? `${target.minPct}–${target.maxPct}% ${ref}`
				: `${target.minPct}% ${ref}`
		}
		case 'pacePct':
			return target.maxPct != null
				? `${target.minPct}–${target.maxPct}% ${INTENSITY_DISPLAY_WORDS.thresholdPace}`
				: `${target.minPct}% ${INTENSITY_DISPLAY_WORDS.thresholdPace}`
		// The chip carries the *authored* value, so a lactate step's chip is the
		// mmol figure — the derived pace lives in the facet beside it, never here.
		case 'lactate':
			return formatMmol(target.minMmol, target.maxMmol)
		case 'racePace': {
			if (target.minPct == null) {
				return (
					INTENSITY_DISPLAY_WORDS.racePace[target.event] ??
					`${target.event} pace`
				)
			}
			const name = INTENSITY_DISPLAY_WORDS.race[target.event] ?? target.event
			return target.maxPct != null
				? `${target.minPct}–${target.maxPct}% ${name}`
				: `${target.minPct}% ${name}`
		}
		case 'hrBpm':
			return target.max != null
				? `${target.min}–${target.max} bpm`
				: `${target.min} bpm`
		case 'hrPct': {
			const ref =
				INTENSITY_DISPLAY_WORDS.hrRef[target.ref === 'max' ? 'max' : 'lthr']
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
	if (equivalent.step == null) return P.cantPlace(equivalent.reason)
	if (target.kind === 'rpe') {
		return P.rpe(intensityChipText(target), equivalent.step)
	}
	if (target.kind === 'zoneLabel') {
		return resolvedRange
			? P.zoneResolves(intensityChipText(target), resolvedRange)
			: P.zoneForYou(equivalent.step)
	}
	return P.approx(equivalent.step, resolvedRange)
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
		const unit =
			resolvedPaceUnit(target.kind, recipeFor(profile)?.anchor) === 'secPer100m'
				? '/100m'
				: '/km'
		return resolved.paceMax != null
			? `${formatPaceClock(resolved.paceMin)}–${formatPaceClock(resolved.paceMax)} ${unit}`
			: `${formatPaceClock(resolved.paceMin)}+ ${unit}`
	}
	return null
}
