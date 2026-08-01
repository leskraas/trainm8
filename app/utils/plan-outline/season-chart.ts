// The **layered season chart**'s model: the plan's weeks reduced to what one
// chart draws, layer by layer, on **one time axis** (#413, variant F).
//
// The chart is the planning surface's primary object rather than a figure beside
// a table, and the rule that shapes it is ADR 0043 §7: **one axis is one track in
// one currency**. So this module answers exactly one question per call — "what
// does *this* track look like read in *this* currency, week by week" — and
// everything else it returns rides the **time** axis only: phase boundaries, week
// roles, another track's segment boundaries, **Quality Session Mix** marks,
// re-anchor points, the **Target Event**. Nothing here normalises a second track
// onto the value axis, because every choice of scaling would be a claim about the
// exchange rate between kilometres and sets — the fabricated conversion ADR 0041
// forbade, smuggled in as a pixel decision.
//
// Four things worth knowing before reading on:
//
// - **A currency is a reading, not a re-authoring.** ADR 0043 §8 lets the athlete
//   read a track in a currency it was not authored in, provided the reading is
//   marked derived and its derivation is shown. So the axis carries a currency
//   *and* a marker, and the derivation travels with every week rather than being
//   re-derived by whatever draws it.
// - **`null` is a reason, never a zero.** Every reading is either a value with a
//   marker or an {@link NoContributionReason} — the same vocabulary the projected
//   curve declines with, so `NO_CONTRIBUTION_LABELS` already words all of it and
//   the chart and the cockpit cannot word the same gap two ways.
// - **The `form` layer exists in order to refuse.** It is a member of
//   {@link SEASON_CHART_LAYERS} and it never produces a mark. A plan replays as a
//   flat weekly average, so ATL — and therefore TSB — is not a quantity the plan
//   contains; the layer says that in the athlete's own words rather than drawing a
//   curve the plan cannot support. Modelling the refusal as a layer rather than
//   omitting it is the point: an athlete who looks for Form finds the answer.
// - **Fitness is a second axis, so it is a second chart.** ADR 0043 §7's "more
//   views means more axes" is the whole reason the projected CTL curve is returned
//   separately from the volume weeks instead of being folded into them.
//
// Pure, and index-based like the rest of `plan-outline/` — week keys enter only to
// be turned into indices. Wording is the surface's (ADR 0023); this carries codes.

import { CTL_DAYS } from '../load/ewma.ts'
import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import { type PhaseSpec, type VolumeCurrency, type WeekRole } from './derive.ts'
import { type WeekTargetReading } from './from-rows.ts'
import {
	plannedWeeklyLoad,
	type NoContributionReason,
	type PlannedLoadBasis,
	type PlannedLoadContexts,
} from './planned-load.ts'
import {
	emphasisTerms,
	qualitySessionCount,
	type EmphasisTerm,
	type QualitySessionMixEntry,
} from './quality-mix.ts'
import {
	convertWeeklyVolume,
	derivationChain,
	type Derivation,
	type DerivationStep,
	type QualityOverflowWarning,
	type ReadingMarker,
	type VolumeBucket,
} from './volume-conversion.ts'
import { weekIndexOf } from './week-keys.ts'

// ---------------------------------------------------------------------------
// The layer vocabulary
// ---------------------------------------------------------------------------

/**
 * The layers the chart offers, in the order they are presented.
 *
 * An `as const` tuple rather than a bare union so the toggles render in a
 * declared order and a seventh layer is one edit, and because `form` has to be a
 * *member* — it is offered and it declines, which is a feature of this surface
 * and not an omission from it.
 *
 * `volume` owns the value axis; `fitness` owns a second one, on its own chart.
 * `rhythm`, `ramp` and `emphasis` ride the time axis and add no scale.
 */
export const SEASON_CHART_LAYERS = [
	'volume',
	'fitness',
	'rhythm',
	'ramp',
	'emphasis',
	'form',
] as const
export type SeasonChartLayer = (typeof SEASON_CHART_LAYERS)[number]

/**
 * Which layers a chart opens with.
 *
 * Volume alone: the athlete "reads one thing at a time on a shape they already
 * recognise", and every other layer is an addition they ask for. `fitness` in
 * particular stays off by default because it mounts a second chart with a second
 * inspect panel, which is a second thing to read at 390 px (ADR 0028).
 */
export const DEFAULT_SEASON_CHART_LAYERS: readonly SeasonChartLayer[] = [
	'volume',
]

// ---------------------------------------------------------------------------
// Inputs — a structural subset of the authored season, in index space
// ---------------------------------------------------------------------------

/** A phase, reduced to what the time axis needs: its name and how long it runs. */
export type ChartPhase = PhaseSpec & { name: string }

/** One endurance segment's authored progression, as the ramp and emphasis layers read it. */
export type ChartSegment = {
	phaseIndex: number
	/** `null` is the athlete choosing the documented convention (ADR 0044 §4). */
	ramp: number | null
	mix: QualitySessionMixEntry[]
}

/** One dated lifting block, reduced to the boundary it puts on the time axis. */
export type ChartStrengthSegment = {
	segmentId: string
	/** 1-based, or `null` for a block the plan no longer covers (ADR 0047 §6). */
	startWeekInPlan: number | null
	weeks: number
	ramp: number | null
}

/** One Training Track as the chart reads it — its own currency, and never another's. */
export type ChartTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** Dated **Season Anchors**; every one after the plan's first week is a re-anchor. */
	anchors: ReadonlyArray<{ fromWeekKey: string; value: number }>
	segments: readonly ChartSegment[]
	strengthSegments: readonly ChartStrengthSegment[]
}

/** One Training Week, with each track's reading of it. */
export type ChartWeek = {
	weekKey: string
	weekInPlan: number
	phaseIndex: number
	role: WeekRole
	targets: ReadonlyArray<WeekTargetReading & { trackId: string }>
}

export type SeasonChartInput = {
	startWeekKey: string
	phases: readonly ChartPhase[]
	tracks: readonly ChartTrack[]
	weeks: readonly ChartWeek[]
	/** 0-based week the **Target Event** falls in, or `null` when it falls outside. */
	eventWeekIndex: number | null
	/** Which track owns the value axis. An unknown id yields no model. */
	trackId: string
	/** Which currency that axis reads — the track's own, or a derived view. */
	currency: VolumeCurrency
	contexts: PlannedLoadContexts
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/**
 * One week's value on the axis: a number with its marker, or an **Unavailable
 * Metric** with the reason that closed it.
 *
 * The reason vocabulary is `planned-load.ts`'s rather than a second one of this
 * module's own — the projected curve and the chart decline for exactly the same
 * set of causes, and one vocabulary means `NO_CONTRIBUTION_LABELS` words both.
 */
export type SeasonChartReading =
	| { available: true; value: number; marker: ReadingMarker }
	| { available: false; reason: NoContributionReason }

/** A **Season Anchor** taking effect on a week — a re-anchor when it is not week 1. */
export type SeasonChartAnchor = {
	discipline: Discipline
	currency: VolumeCurrency
	value: number
	/** False only for the anchor the plan opens on, which re-anchors nothing. */
	reAnchor: boolean
}

/** One endurance track's **Quality Session Mix** for a week, as the emphasis marks read it. */
export type SeasonChartEmphasis = {
	discipline: Discipline
	terms: EmphasisTerm[]
	qualitySessions: number
}

export type SeasonChartWeek = {
	/** 1-based — what the athlete counts in, everywhere on this surface. */
	weekInPlan: number
	weekKey: string
	phaseIndex: number
	phaseName: string
	/** The **rhythm** layer: loading, recovery or taper (ADR 0044 §4). */
	role: WeekRole
	/** The **volume** layer: the axis track's week, read in the axis currency. */
	volume: SeasonChartReading
	/** Hand-set by a **Week Volume Override**, and so not on the ramp (ADR 0044 §5). */
	overridden: boolean
	/**
	 * The **ramp** layer: the change from the previous week as a fraction of it —
	 * what the plan *does*, recovery cuts and hand-set weeks included.
	 *
	 * `null` on the first week, on either week reading Unavailable, and where the
	 * previous week is zero — a step out of nothing is not a percentage, and
	 * dividing by zero to get one would be the fabricated number the whole surface
	 * refuses.
	 */
	step: number | null
	/**
	 * The **Volume Ramp** the segment holding this week authors, beside the step it
	 * produced. `null` is the athlete choosing the documented convention and must
	 * read as that rather than as the convention's number (ADR 0044 §4).
	 */
	authoredRamp: number | null
	/** The **emphasis** layer: every endurance track's mix for this week. */
	emphasis: SeasonChartEmphasis[]
	/**
	 * The priced decomposition behind a derived reading — five buckets with their
	 * sources, which is what the inspect panel exists to make readable (ADR 0045
	 * §10). `[]` where nothing could be priced, which is a statement and not a gap.
	 */
	buckets: VolumeBucket[]
	/** The chain every non-authored number names its source in. `null` for `sets`. */
	derivation: Derivation | null
	/** The mix alone outrunning the week's volume — warns softly, corrects nothing. */
	overflow: QualityOverflowWarning[]
	/** Time axis: this week opens a phase. */
	phaseStart: boolean
	/** Time axis: dated lifting blocks opening this week (ADR 0047 §6). */
	segmentStarts: Array<{ discipline: Discipline; segmentId: string }>
	/** Time axis: **Season Anchors** taking effect this week, any track. */
	anchors: SeasonChartAnchor[]
	/** Time axis: the **Target Event** falls in this week. */
	eventWeek: boolean
}

/** What the value axis is — one track, one currency, and whether that is a view. */
export type SeasonChartAxis = {
	trackId: string
	discipline: Discipline
	/** The currency the track authors, which no view changes (ADR 0043 §2). */
	authoredCurrency: VolumeCurrency
	/** The currency the axis is being read in. */
	currency: VolumeCurrency
	/** True when the two differ — the reading is a derived view (ADR 0043 §8). */
	derived: boolean
}

export type SeasonChartModel = {
	axis: SeasonChartAxis
	weeks: SeasonChartWeek[]
	/** The largest available reading, for the value-axis domain. `0` when none is. */
	peak: number
}

// ---------------------------------------------------------------------------
// The currencies a track may be read in
// ---------------------------------------------------------------------------

const ENDURANCE_READINGS: readonly VolumeCurrency[] = ['km', 'hours', 'tss']

/**
 * Which currencies this track's axis can read, its own **first**.
 *
 * Derived views are offered for the three endurance currencies because ADR 0045
 * made the conversion mix-aware, which is the hard condition ADR 0043 §8 attached
 * to offering them at all: with a scalar constant a TSS chart is the km chart with
 * new numbers on the axis, and the athlete would be switching units to learn
 * nothing. `sets` is offered nothing — a lifting track converts in no direction
 * (ADR 0041), so the switch is absent rather than present and refusing.
 *
 * Offering a currency is not promising it: a run track with no stored threshold
 * pace still lists `km`, and every week of that reading then states
 * `no-threshold-pace`. The gate is per reading and per week (ADR 0045 §6), so a
 * list that hid the closed ones would hide the reason too.
 */
export function readableCurrencies(authored: VolumeCurrency): VolumeCurrency[] {
	if (authored === 'sets') return ['sets']
	return [authored, ...ENDURANCE_READINGS.filter((c) => c !== authored)]
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * Reduce the authored season to one chart: one track, one currency, every week.
 *
 * Returns `null` for a `trackId` this plan does not carry — a chart with no axis
 * is not a chart, and inventing one from the first track would silently show the
 * athlete a different track from the one they asked for.
 */
export function seasonChartModel(
	input: SeasonChartInput,
): SeasonChartModel | null {
	const track = input.tracks.find((t) => t.trackId === input.trackId)
	if (!track) return null

	const axis: SeasonChartAxis = {
		trackId: track.trackId,
		discipline: track.discipline,
		authoredCurrency: track.currency,
		currency: input.currency,
		derived: input.currency !== track.currency,
	}

	const context = input.contexts[track.discipline]
	const anchorsByWeek = anchorMarks(input)
	const blockStartsByWeek = blockStartMarks(input)
	const phaseStarts = phaseStartIndices(input.phases)

	const weeks: SeasonChartWeek[] = input.weeks.map((week, index) => {
		const target = week.targets.find((t) => t.trackId === track.trackId) ?? null
		const conversion =
			target?.value != null && track.currency !== 'sets'
				? convertWeeklyVolume({
						recipe: context?.recipe ?? null,
						profile: context?.profile ?? EMPTY_PROFILE,
						rideWindow: context?.rideWindow ?? null,
						discipline: track.discipline,
						currency: track.currency,
						volume: target.value,
						mix: mixForWeek(track, week.phaseIndex),
					})
				: null

		return {
			weekInPlan: week.weekInPlan,
			weekKey: week.weekKey,
			phaseIndex: week.phaseIndex,
			phaseName: input.phases[week.phaseIndex]?.name ?? '',
			role: week.role,
			volume: readingFor(target, track.currency, input.currency, conversion),
			overridden: target?.overridden ?? false,
			step: null,
			authoredRamp: authoredRampFor(track, week, index),
			emphasis: emphasisFor(input, week.phaseIndex),
			buckets: conversion?.buckets ?? [],
			derivation: conversion?.derivation ?? null,
			overflow: conversion?.warnings ?? [],
			phaseStart: phaseStarts.has(index),
			segmentStarts: blockStartsByWeek.get(index) ?? [],
			anchors: anchorsByWeek.get(index) ?? [],
			eventWeek: input.eventWeekIndex === index,
		}
	})

	// A second pass, because a step is a relation between two weeks and not a
	// property of one: computing it inside the map would read a neighbour that is
	// still being built.
	for (let i = 1; i < weeks.length; i++) {
		weeks[i]!.step = stepBetween(weeks[i - 1]!.volume, weeks[i]!.volume)
	}

	const peak = weeks.reduce(
		(top, week) =>
			week.volume.available ? Math.max(top, week.volume.value) : top,
		0,
	)

	return { axis, weeks, peak }
}

const EMPTY_PROFILE = {
	lthr: null,
	maxHr: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
}

/**
 * The week's reading in the axis currency.
 *
 * The authored currency short-circuits the conversion rather than reading it back
 * out of one: `sets` produces no decomposition at all, and a track read in its own
 * currency is quoting the athlete rather than deriving anything, which is what the
 * `authored` marker means.
 */
function readingFor(
	target: WeekTargetReading | null,
	authored: VolumeCurrency,
	shown: VolumeCurrency,
	conversion: ReturnType<typeof convertWeeklyVolume> | null,
): SeasonChartReading {
	// No anchor in force is the only way a week carries no number at all, since
	// ADR 0047 §1 has both walks price their weeks off an anchor and a ramp.
	if (target?.value == null)
		return { available: false, reason: 'no-season-anchor' }
	if (shown === authored) {
		return { available: true, value: target.value, marker: 'authored' }
	}
	if (shown === 'sets' || authored === 'sets') {
		return { available: false, reason: 'sets-has-no-reading' }
	}
	const reading = conversion?.[shown]
	if (!reading) return { available: false, reason: 'no-season-anchor' }
	return reading.available
		? { available: true, value: reading.value, marker: reading.marker }
		: { available: false, reason: reading.reason }
}

/** The change from one week to the next, as a fraction of the week it left. */
function stepBetween(
	previous: SeasonChartReading,
	current: SeasonChartReading,
): number | null {
	if (!previous.available || !current.available) return null
	if (previous.value === 0) return null
	return (current.value - previous.value) / previous.value
}

/** The **Quality Session Mix** governing a week on one track (ADR 0042 §8, 1:1 with the phase). */
function mixForWeek(
	track: ChartTrack,
	phaseIndex: number,
): QualitySessionMixEntry[] {
	return track.segments.find((s) => s.phaseIndex === phaseIndex)?.mix ?? []
}

/** Every endurance track's emphasis for a week — the marks ADR 0043 §7 puts on the time axis. */
function emphasisFor(
	input: SeasonChartInput,
	phaseIndex: number,
): SeasonChartEmphasis[] {
	return input.tracks
		.filter((track) => isCardioDiscipline(track.discipline))
		.map((track) => {
			const mix = mixForWeek(track, phaseIndex)
			return {
				discipline: track.discipline,
				terms: emphasisTerms(mix),
				qualitySessions: qualitySessionCount(mix),
			}
		})
		.filter((reading) => reading.qualitySessions > 0)
}

/**
 * The rate the athlete authored for the week — the endurance segment on its phase,
 * or the dated block holding it on a strength track.
 */
function authoredRampFor(
	track: ChartTrack,
	week: ChartWeek,
	weekIndex: number,
): number | null {
	const block = track.strengthSegments.find(
		(segment) =>
			segment.startWeekInPlan != null &&
			weekIndex >= segment.startWeekInPlan - 1 &&
			weekIndex < segment.startWeekInPlan - 1 + segment.weeks,
	)
	if (block) return block.ramp
	return (
		track.segments.find((s) => s.phaseIndex === week.phaseIndex)?.ramp ?? null
	)
}

/** The 0-based week each phase opens on. */
function phaseStartIndices(phases: readonly ChartPhase[]): Set<number> {
	const starts = new Set<number>()
	let cursor = 0
	for (const phase of phases) {
		starts.add(cursor)
		cursor += phase.weeks
	}
	return starts
}

/** Dated **Season Anchors** by the week they take effect on, across every track. */
function anchorMarks(
	input: SeasonChartInput,
): Map<number, SeasonChartAnchor[]> {
	const marks = new Map<number, SeasonChartAnchor[]>()
	for (const track of input.tracks) {
		for (const anchor of track.anchors) {
			const index = weekIndexOf(input.startWeekKey, anchor.fromWeekKey)
			if (index < 0 || index >= input.weeks.length) continue
			const list = marks.get(index) ?? []
			list.push({
				discipline: track.discipline,
				currency: track.currency,
				value: anchor.value,
				// The plan's opening anchor re-anchors nothing; it is where the season
				// starts. Everything later is the athlete moving the plan under a week
				// already lived (ADR 0040 §5).
				reAnchor: index > 0,
			})
			marks.set(index, list)
		}
	}
	return marks
}

/** Dated lifting blocks by the week they open on — another track's boundary on the time axis. */
function blockStartMarks(
	input: SeasonChartInput,
): Map<number, Array<{ discipline: Discipline; segmentId: string }>> {
	const marks = new Map<
		number,
		Array<{ discipline: Discipline; segmentId: string }>
	>()
	for (const track of input.tracks) {
		for (const segment of track.strengthSegments) {
			if (segment.startWeekInPlan == null) continue
			const index = segment.startWeekInPlan - 1
			if (index < 0 || index >= input.weeks.length) continue
			const list = marks.get(index) ?? []
			list.push({ discipline: track.discipline, segmentId: segment.segmentId })
			marks.set(index, list)
		}
	}
	return marks
}

// ---------------------------------------------------------------------------
// The fitness layer — a second axis, and so a second chart (ADR 0043 §7)
// ---------------------------------------------------------------------------

/**
 * Why the projected fitness curve is withheld. Codes, never prose: the surface
 * words them, so the honesty rules stay where the athlete reads them (ADR 0023).
 */
export type FitnessLayerGap =
	/** No measured **Load Snapshot** to start the replay from. */
	| { kind: 'no-anchor' }
	/** The CTL baseline is still climbing from a cold start (ADR 0008). */
	| { kind: 'building-baseline'; daysOfHistory: number; requiredDays: number }
	/**
	 * Some week's load could not be priced, so part of the curve would be a guess.
	 * Carries the plan's own basis, which names *which* track and what is missing
	 * from it — the reason is the point of an Unavailable Metric.
	 */
	| { kind: 'unpriced'; basis: PlannedLoadBasis }

export type FitnessLayer =
	| {
			status: 'projected'
			/** End-of-week projected CTL, one per plan week, earliest first. */
			ctl: number[]
			/** The one derivation statement the whole curve carries (ADR 0045 §10). */
			basis: PlannedLoadBasis
	  }
	| { status: 'unavailable'; gap: FitnessLayerGap }

/** The measured fitness the plan is replayed forward from. */
export type FitnessAnchor = {
	ctl: number
	/** Whether the CTL baseline has enough history to be trusted (ADR 0008). */
	trustworthy: boolean
	daysOfHistory: number
	requiredDays: number
}

/**
 * The plan's own fitness arc: its weekly load replayed through the **same CTL
 * EWMA** the measured curve uses, from the fitness the athlete carried into the
 * plan's first week.
 *
 * **From the plan's start, not from today.** The cockpit's **Fitness Projection**
 * answers "where does today lead", which is why it anchors on the most recent
 * snapshot; a plan chart answers "what shape does this plan make", and a curve
 * that began mid-season would leave the weeks before today blank on a picture
 * whose whole subject is the season. Both replays are the same arithmetic on the
 * same constant, so the two cannot disagree about the shape — only about where
 * they start.
 *
 * Weekly rather than daily: the plan carries one number per week, so a daily
 * series would be seven copies of the same statement, and the chart's marks are
 * weeks. The seven daily EWMA steps are still taken — sampling the curve at week
 * ends is not the same as stepping it weekly.
 */
export function seasonFitnessLayer(input: {
	phases: readonly PhaseSpec[]
	tracks: ReadonlyArray<{
		discipline: Discipline
		currency: VolumeCurrency
		/** Only the mix is read here — the ramp is the volume layer's business. */
		segments: ReadonlyArray<Pick<ChartSegment, 'phaseIndex' | 'mix'>>
		targets: ReadonlyArray<Pick<WeekTargetReading, 'value'>>
	}>
	contexts: PlannedLoadContexts
	anchor: FitnessAnchor | null
}): FitnessLayer {
	const { anchor } = input
	if (!anchor) return { status: 'unavailable', gap: { kind: 'no-anchor' } }
	if (!anchor.trustworthy) {
		return {
			status: 'unavailable',
			gap: {
				kind: 'building-baseline',
				daysOfHistory: anchor.daysOfHistory,
				requiredDays: anchor.requiredDays,
			},
		}
	}

	const load = plannedWeeklyLoad({
		phases: [...input.phases],
		tracks: input.tracks.map((track) => ({
			discipline: track.discipline,
			currency: track.currency,
			segments: [...track.segments],
			targets: track.targets,
		})),
		contexts: input.contexts,
	})

	// One unknown week would force a guess for part of the curve, so the whole
	// layer declines rather than drawing the half it can — the same posture
	// `projectFitnessToRace` takes, for the same reason (ADR 0008).
	if (
		load.weeklyTss.length === 0 ||
		load.weeklyTss.some((tss) => tss == null)
	) {
		return {
			status: 'unavailable',
			gap: { kind: 'unpriced', basis: load.basis },
		}
	}

	return {
		status: 'projected',
		ctl: projectWeeklyFitness(load.weeklyTss as number[], anchor.ctl),
		basis: load.basis,
	}
}

/**
 * End-of-week projected CTL, replaying a weekly load as a **flat daily average**
 * through the CTL EWMA.
 *
 * The flatness is the honest limit of the input and the whole reason the **Form**
 * layer refuses: a week's load spread evenly over seven days carries no
 * information about when the hard days fall, which is precisely what ATL — and so
 * TSB — is a reading of. CTL survives the flattening because its 42-day window
 * averages the distribution away anyway; ATL's 7-day window does not.
 */
export function projectWeeklyFitness(
	weeklyTss: readonly number[],
	anchorCtl: number,
): number[] {
	let ctl = anchorCtl
	return weeklyTss.map((weekTss) => {
		const daily = weekTss / 7
		for (let day = 0; day < 7; day++) ctl += (daily - ctl) / CTL_DAYS
		return ctl
	})
}

// ---------------------------------------------------------------------------
// The inspect panel's derivation rows (ADR 0030, ADR 0045 §10)
// ---------------------------------------------------------------------------

/**
 * The step ids the chain a reading stands on is walked back from, per currency.
 *
 * An authored reading's chain is the authored step alone — which is what "an
 * `authored` marker with no empty panel" looks like (ADR 0045 §9).
 */
const READING_ROOT: Record<VolumeCurrency, string> = {
	km: 'total-km',
	hours: 'total-hours',
	tss: 'total-tss',
	// `sets` names no total because it produces no decomposition at all (ADR 0041).
	sets: 'authored',
}

/**
 * The steps **this** reading rests on, in the order the panel shows them: the
 * authored number first, then everything derived from it, ending at the total.
 *
 * A week's derivation names every number the decomposition produced, including
 * the legs the shown currency never touched — an hours reading does not stand on
 * the easy-pace ratio, and listing it would overstate the chain, which is the
 * opposite of what ADR 0045 §10 asks for. So the panel reads the sub-chain
 * reachable from the total it is about, exactly as the projected curve's basis
 * does.
 */
export function readingChain(
	derivation: Derivation,
	reading: SeasonChartReading,
	currency: VolumeCurrency,
): DerivationStep[] {
	if (!reading.available) return []
	const root =
		reading.marker === 'authored' ? 'authored' : READING_ROOT[currency]
	return derivationChain(derivation, root)
}
