// The **Season Span**: a season's headline, as `55 → 78 km/wk` (ADR 0043, ADR
// 0040 §10).
//
// A span rather than a season total, for three reasons a total cannot answer. A
// total conflates how *big* a plan is with how *long* it is — 12 weeks at 60 km
// and 24 weeks at 30 km total the same. It hides the **Volume Ramp**, which is
// half of what the athlete authored. And it forces a ruling on whether recovery
// and taper weeks count, which no reading of "how much do I train" wants to make.
// The total stays available as a **secondary** figure, never the headline.
//
// Both figures are read from the **authored guideline level** — the **Season
// Anchor** and the segments' ramps, through the ordinary derivation — and never
// summed from materialized **Workout Sessions**, so the headline does not change
// character with how far into the season the athlete is.
//
// **Indices here, dates at the read boundary**, the same as `derive.ts`: this is
// arithmetic over 0-based week indices, and one track at a time in one currency.
// Several tracks means several spans, one per commensurability group, and that
// grouping is `commensurability.ts`'s — a single-track plan needs none of it. What
// this module owes that one is the two halves a span is made of, exported rather
// than kept private: the opening anchor and the **loading-week** series. A group
// adds several tracks' series and reads its peak off the accumulated week, and it
// must do so by *this* module's rule about which weeks load and what the peak is,
// or a group's figure and its members' own spans would be two answers.

import {
	strengthWeekRole,
	strengthWeekTarget,
	totalWeeks,
	weekRole,
	weekTarget,
	type PhaseSpec,
	type TrackSpec,
} from './derive.ts'

/**
 * Which progression walk prices this track's weeks — the same choice `from-rows`
 * makes from the track's **Discipline** (ADR 0043 §1), passed in rather than
 * guessed from the spec's contents, so the span and the targets beside it can
 * never be read by different rules.
 *
 * Both tracks get a span: ADR 0047 §1 makes ADR 0043 §4's `12 → 21 sets/wk` a
 * literal reading rather than a shape borrowed from endurance.
 *
 * Stated at every call and never defaulted. Neither walk is the normal one — a
 * pure lifter's plan is as ordinary as a pure runner's (ADR 0043 §1) — so a
 * default would make one of them the silent case, and a caller that forgot the
 * discriminator would read a strength track by the phase rhythm and be believed.
 */
export type SeasonWalk = 'endurance' | 'strength'

/**
 * A track's season, opening to peak, in the track's own **Volume Currency**. The
 * currency is the caller's — it is on the `TrackSpec` — and is not repeated here,
 * so no span can name a unit its numbers were not derived in.
 */
export type SeasonSpanReading = {
	/** The authored starting volume: the first **Season Anchor** segment's value. */
	anchor: number
	/** The largest **loading**-week target in the season. */
	peak: number
	/** Which week that peak falls in, 0-based from the Plan Start Week. */
	peakWeekIndex: number
}

/**
 * The span, or null where the track has no priced loading week to peak at — no
 * anchor in force, or a season with no phases. Null is an **Unavailable Metric**,
 * never a fabricated span.
 *
 * The peak is taken over **loading weeks only**. A recovery week and a taper week
 * are the plan coming down on purpose, so neither is the season's high-water mark
 * even in the degenerate case where a cut of zero ties one to it. On the strength
 * walk that same rule keeps a **deload week** out of the running, and keeps the
 * `0` of a week outside every segment — "no lifting these weeks" — from standing
 * in for a peak, since a week in a gap has no loading role at all.
 *
 * The anchor is the athlete's **first authored** anchor rather than week one's
 * derived target: a plan that opens on a recovery week has a first target below
 * what the athlete typed, and a mid-season re-anchor is a later segment and never
 * the number the season started from (ADR 0040 §5). A strength season that opens
 * in a gap reads the same way, for the same reason.
 */
export function seasonSpan(
	phases: PhaseSpec[],
	track: TrackSpec,
	walk: SeasonWalk,
): SeasonSpanReading | null {
	const anchor = openingAnchor(track)
	if (anchor == null) return null
	return spanFromLoadingTargets(anchor, loadingWeekTargets(phases, track, walk))
}

/**
 * The season's opening number: the **first authored** **Season Anchor** segment's
 * value, or null where the track has none in force.
 *
 * Exported for the commensurability grouping, which adds several tracks' opening
 * numbers, and which must take them from the same place a single track's span does
 * — a re-anchor is a later dated segment and is never what the season started from
 * (ADR 0040 §5).
 */
export function openingAnchor(track: TrackSpec): number | null {
	const opening = [...track.anchors].sort(
		(a, b) => a.fromWeekIndex - b.fromWeekIndex,
	)[0]
	return opening ? opening.value : null
}

/**
 * One entry per plan week, earliest first: the week's target where the week
 * **loads**, and `null` on every week that does not — a recovery, taper or deload
 * week, a gap between lifting blocks, or a week no anchor prices.
 *
 * The two `null` meanings are collapsed **on purpose**, because the peak treats
 * them identically: a week the plan deliberately brings down and a week it cannot
 * price are both weeks the season's high-water mark does not sit on. A caller that
 * needs to tell them apart is asking a different question and wants
 * `from-rows.ts`'s per-week reading, which keeps them distinct.
 */
export function loadingWeekTargets(
	phases: PhaseSpec[],
	track: TrackSpec,
	walk: SeasonWalk,
): Array<number | null> {
	return Array.from({ length: totalWeeks(phases) }, (_, week) =>
		isLoadingWeek(phases, track, week, walk)
			? targetOf(phases, track, week, walk)
			: null,
	)
}

/**
 * A span from an opening number and a loading-week series — the one definition of
 * "the peak is the largest loading week", shared by a track's own span and by an
 * accumulated group's (ADR 0043 §5).
 *
 * Null where the series prices no loading week at all, which is the season having
 * no high-water mark to name rather than a fabricated one.
 */
export function spanFromLoadingTargets(
	anchor: number,
	loadingTargets: ReadonlyArray<number | null>,
): SeasonSpanReading | null {
	let peak: number | null = null
	let peakWeekIndex = 0
	loadingTargets.forEach((target, week) => {
		if (target == null) return
		if (peak == null || target > peak) {
			peak = target
			peakWeekIndex = week
		}
	})
	return peak == null ? null : { anchor, peak, peakWeekIndex }
}

/** Whether the week loads, by the walk's own week roles (ADR 0047 §6). */
function isLoadingWeek(
	phases: PhaseSpec[],
	track: TrackSpec,
	week: number,
	walk: SeasonWalk,
): boolean {
	return walk === 'strength'
		? strengthWeekRole(track, week) === 'loading'
		: weekRole(phases, week) === 'loading'
}

/** The week's target, by the walk that prices this track. */
function targetOf(
	phases: PhaseSpec[],
	track: TrackSpec,
	week: number,
	walk: SeasonWalk,
): number | null {
	return walk === 'strength'
		? strengthWeekTarget(phases, track, week)
		: weekTarget(phases, track, week)
}

/**
 * Every week of the season summed, in the track's currency — the **secondary**
 * figure beside the span, and never the headline.
 *
 * Null as soon as **one** week cannot be priced: a sum over a gap would read as
 * the whole season's volume while silently describing part of it. A strength
 * week between two segments is not such a gap — it is priced at `0`, which is
 * what the athlete authored — so it lowers the total without voiding it.
 */
export function seasonTotal(
	phases: PhaseSpec[],
	track: TrackSpec,
	walk: SeasonWalk,
): number | null {
	let total = 0
	for (let week = 0; week < totalWeeks(phases); week++) {
		const target = targetOf(phases, track, week, walk)
		if (target == null) return null
		total += target
	}
	return total
}
