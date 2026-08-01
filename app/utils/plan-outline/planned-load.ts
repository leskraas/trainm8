// The **Fitness Projection**'s input: a Plan Outline's weeks read as TSS through
// the mix-aware **Volume Conversion** (ADR 0045), accumulated across the plan's
// endurance **Training Tracks**.
//
// This module is the successor ADR 0045 §12 held back until something could
// author a Plan Outline. The flat `TSS_PER_PLANNED_HOUR = 60` it replaces was
// wrong twice over: wrong in *level* — a periodized endurance week priced off a
// real recipe lands nearer 44 TSS/h easy — and, worse, **blind to the mix**, so a
// base block and a VO₂ max block at the same hours projected the identical curve.
// ADR 0043 §8 calls that a decorative duplicate of the volume curve and refuses
// it. Reading the same decomposition every other planned figure reads also means
// the projection cannot disagree with the week the athlete is looking at.
//
// Four properties this module exists to hold:
//
// - **The gate stays closed rather than guessed.** A track whose TSS reading is
//   an Unavailable Metric contributes `null`, and one `null` makes the whole week
//   `null` — a partial sum over some disciplines would read as the athlete's whole
//   week. The projection then declines rather than drawing a curve (ADR 0008).
// - **A strength track contributes nothing, and says so.** `strength-ctl`
//   (ADR 0047 §5): pricing a lifting session as hours × an assumed intensity is
//   the conversion ADR 0041 rejected, so lifting reaches neither the daily total
//   nor the CTL curve. It is *excluded with a reason*, never silently dropped, and
//   it does not gate the endurance tracks beside it.
// - **The mix is read per week, from the phase that holds it.** An endurance
//   segment is 1:1 with a phase (ADR 0042 §8), so week 7's load is priced by the
//   Build block's mix and week 2's by Base's — which is what makes the projected
//   curve respond to *how hard* the plan is and not only how much of it there is.
//   A recovery week or a taper week cuts the volume, the quality bucket holds its
//   absolute minutes (ADR 0045 §2), and the curve dips by less than the volume
//   does — which is the physiologically honest shape, not an artefact.
// - **One derivation statement for the whole curve.** The conversion produces a
//   full chain per week per track; a projection is one line joined onto a measured
//   CTL curve, and per-point provenance on 90 daily points is noise. So the basis
//   is unioned across the weeks: which tracks fed it, in which currency, which
//   conventions were stacked, which Load Formula priced the intensities, and which
//   recipe bands stood in for a zone the recipe does not declare (ADR 0045 §3, §10).
//   Wording is the surface's (ADR 0023); this carries codes.
//
// Pure. The per-discipline recipe, thresholds and ride window are read by
// `volume-conversion.server.ts` and passed in.

import { type TssResult } from '../load/formulas.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import {
	phaseIndexForWeek,
	totalWeeks,
	type PhaseSpec,
	type VolumeCurrency,
} from './derive.ts'
import {
	type SegmentReading,
	type WeekTargetReading,
} from './from-rows.ts'
import { type QualitySessionMixEntry } from './quality-mix.ts'
import {
	convertWeeklyVolume,
	CONVENTION_IDS,
	derivationChain,
	type ConventionId,
	type ConversionContext,
	type ConversionProfile,
	type Derivation,
	type DerivationStep,
	type ReadingMarker,
	type UnavailableReason,
	type ZoneSubstitution,
} from './volume-conversion.ts'

/**
 * The conversion inputs that belong to a **Discipline** rather than to a week —
 * the athlete's recipe, their stored thresholds and, for a cyclist, their ride
 * window. Resolved once per plan and reused for every week, because none of the
 * three varies week to week.
 *
 * A Discipline with no entry is *not* an error: the athlete simply has no
 * **Discipline Profile** for it, which closes the intensity gate with
 * `no-zone-recipe` and is a truthful answer rather than a missing one.
 */
export type PlannedLoadContexts = Partial<Record<Discipline, ConversionContext>>

const NO_PROFILE: ConversionProfile = {
	lthr: null,
	maxHr: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

const NO_CONTEXT: ConversionContext = { recipe: null, profile: NO_PROFILE }

/**
 * Why a **Training Track** puts nothing into the projected curve.
 *
 * The conversion's own eight reasons plus one this layer can see and it cannot:
 * a track whose every week is an Unavailable Metric before any conversion is
 * attempted, which by construction means **no Season Anchor is in force** — since
 * ADR 0047 §1 both walks price their weeks, there is no other way for a track to
 * carry no number at all (`unavailable-readings.ts`).
 */
export type NoContributionReason = UnavailableReason | 'no-season-anchor'

/** One Training Track's part in the curve: what it fed, or why it fed nothing. */
export type TrackLoadBasis = {
	discipline: Discipline
	currency: VolumeCurrency
} & (
	| { contributes: true; marker: ReadingMarker }
	| { contributes: false; reason: NoContributionReason }
)

/**
 * The one derivation statement the whole curve carries — unioned across its
 * weeks, never per point.
 *
 * Empty lists are positive statements: no conventions means every contributing
 * track authored TSS directly, and no substitutions means every zone the mixes
 * asked for was declared by the athlete's own recipes.
 */
export type PlannedLoadBasis = {
	/** Every track the Outline carries, contributing or not, in stored order. */
	tracks: TrackLoadBasis[]
	/** Stacked conventions, in {@link CONVENTION_IDS} order so the list is stable. */
	conventions: ConventionId[]
	/** Which Load Formula(e) the intensity factors were read through (ADR 0045 §4). */
	formulae: Array<TssResult['formula']>
	/** Zones a recipe does not declare, and the bands that stood in (ADR 0045 §3). */
	substitutions: ZoneSubstitution[]
}

export type PlannedWeeklyLoad = {
	/**
	 * Per plan week, earliest first: the week's projectable TSS, or `null` where
	 * any endurance track cannot express it. `[]` when the Outline carries no
	 * endurance track at all — a pure lifter's plan is a real plan with no curve.
	 */
	weeklyTss: Array<number | null>
	basis: PlannedLoadBasis
}

/**
 * Read a Plan Outline's weeks as one projectable TSS series.
 *
 * Accumulated across **every endurance** track, since a plan carries one track
 * per Discipline (ADR 0043 §1) and TSS is commensurable across them by
 * construction (ADR 0046 §1). Nothing here rounds: `roundToCurrency` is the
 * display layer's posture (ADR 0045 §8), and the projection consumes floats.
 */
export function plannedWeeklyLoad(input: {
	phases: PhaseSpec[]
	/**
	 * The four fields of a **Training Track** this reads, and no more — a
	 * `ResolvedTrack` satisfies it, and so does a surface that already holds the
	 * season in the shape the *read boundary* hands it over (`/training/plan`,
	 * #413) without rebuilding a span, a total and a set of ramp warnings it is
	 * never going to look at.
	 */
	tracks: ReadonlyArray<{
		discipline: Discipline
		currency: VolumeCurrency
		targets: ReadonlyArray<Pick<WeekTargetReading, 'value'>>
		segments: ReadonlyArray<Pick<SegmentReading, 'phaseIndex' | 'mix'>>
	}>
	contexts: PlannedLoadContexts
}): PlannedWeeklyLoad {
	const { phases, tracks, contexts } = input
	const weeks = totalWeeks(phases)

	const trackBases: TrackLoadBasis[] = []
	const series: Array<Array<number | null>> = []
	const collector = newCollector()

	for (const track of tracks) {
		const identity = { discipline: track.discipline, currency: track.currency }

		// Gated on the Discipline before any conversion is attempted, so the reason
		// the athlete reads is `strength-ctl`'s and not a currency accident: a
		// strength track happens to author `sets`, but it would contribute nothing to
		// a CTL curve whatever it authored (ADR 0047 §5).
		if (!isCardioDiscipline(track.discipline)) {
			trackBases.push({
				...identity,
				contributes: false,
				reason: 'not-an-endurance-discipline',
			})
			continue
		}

		const context = contexts[track.discipline] ?? NO_CONTEXT
		const weekly: Array<number | null> = []
		let marker: ReadingMarker | null = null
		let blocked: UnavailableReason | null = null

		for (let week = 0; week < weeks; week++) {
			const volume = track.targets[week]?.value ?? null
			if (volume == null) {
				weekly.push(null)
				continue
			}
			const conversion = convertWeeklyVolume({
				...context,
				discipline: track.discipline,
				currency: track.currency,
				volume,
				mix: mixForWeek(phases, track, week),
			})
			const reading = conversion.tss
			if (!reading.available) {
				// First reason wins: the gate is a property of the athlete's profile and
				// the track's currency, so every week closes it the same way, and a
				// second copy of the same code would add nothing.
				blocked ??= reading.reason
				weekly.push(null)
				continue
			}
			marker ??= reading.marker
			weekly.push(reading.value)
			collector.take(conversion.derivation, reading.marker)
		}

		series.push(weekly)
		trackBases.push(
			blocked != null
				? { ...identity, contributes: false, reason: blocked }
				: marker != null
					? { ...identity, contributes: true, marker }
					: { ...identity, contributes: false, reason: 'no-season-anchor' },
		)
	}

	return {
		weeklyTss: series.length === 0 ? [] : accumulate(series, weeks),
		basis: { tracks: trackBases, ...collector.basis() },
	}
}

/**
 * The **Quality Session Mix** governing one week: the mix of the endurance
 * segment on the phase that holds it.
 *
 * `[]` where the phase has no segment yet — the same positive statement a stored
 * segment with no mix rows makes (ADR 0042 §6), and the right one here: a phase
 * nobody has authored a progression for has no quality sessions to price.
 */
function mixForWeek(
	phases: PhaseSpec[],
	track: { segments: ReadonlyArray<Pick<SegmentReading, 'phaseIndex' | 'mix'>> },
	week: number,
): QualitySessionMixEntry[] {
	const phaseIndex = phaseIndexForWeek(phases, week)
	if (phaseIndex == null) return []
	return (
		track.segments.find((segment) => segment.phaseIndex === phaseIndex)?.mix ??
		[]
	)
}

/**
 * Sum the tracks week by week. One `null` sinks the week: a total over some of
 * the athlete's disciplines would be read as their whole week, which is the
 * partial-sum defect ADR 0046 §2 names.
 */
function accumulate(
	series: Array<Array<number | null>>,
	weeks: number,
): Array<number | null> {
	return Array.from({ length: weeks }, (_, week) => {
		let total = 0
		for (const track of series) {
			const tss = track[week]
			if (tss == null) return null
			total += tss
		}
		return total
	})
}

/** Unions the per-week derivations into the one statement the curve carries. */
function newCollector() {
	const conventions = new Set<ConventionId>()
	const formulae: Array<TssResult['formula']> = []
	const substitutions: ZoneSubstitution[] = []

	return {
		take(derivation: Derivation, marker: ReadingMarker) {
			for (const step of tssChain(derivation, marker)) {
				if (step.source.kind === 'convention') {
					conventions.add(step.source.convention)
				}
			}
			// An authored TSS week stands on nothing else: no recipe was read, so
			// naming a formula or a substitution would credit the reading with
			// provenance it does not have.
			if (marker === 'authored') return
			if (derivation.formula && !formulae.includes(derivation.formula)) {
				formulae.push(derivation.formula)
			}
			for (const substitution of derivation.substitutions) {
				const known = substitutions.some(
					(seen) =>
						seen.requested === substitution.requested &&
						seen.recipeId === substitution.recipeId &&
						seen.band === substitution.band,
				)
				if (!known) substitutions.push(substitution)
			}
		},
		basis() {
			return {
				conventions: CONVENTION_IDS.filter((id) => conventions.has(id)),
				formulae,
				substitutions,
			}
		},
	}
}

/**
 * The steps the **TSS** reading actually stands on.
 *
 * The walk itself is `volume-conversion.ts`'s, shared with the chart's inspect
 * panel (#413): a second copy of it would be a second answer to "what does this
 * number rest on", waiting to disagree with the one the athlete taps. All that is
 * left here is naming the root — the authored step for a TSS-authored track, the
 * total otherwise.
 */
function tssChain(
	derivation: Derivation,
	marker: ReadingMarker,
): DerivationStep[] {
	return derivationChain(
		derivation,
		marker === 'authored' ? 'authored' : 'total-tss',
	)
}
