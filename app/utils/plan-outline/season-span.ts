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
// grouping is not this module's — a single-track plan needs none of it.

import {
	totalWeeks,
	weekRole,
	weekTarget,
	type PhaseSpec,
	type TrackSpec,
} from './derive.ts'

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
 * even in the degenerate case where a cut of zero ties one to it.
 *
 * The anchor is the athlete's **first authored** anchor rather than week one's
 * derived target: a plan that opens on a recovery week has a first target below
 * what the athlete typed, and a mid-season re-anchor is a later segment and never
 * the number the season started from (ADR 0040 §5).
 */
export function seasonSpan(
	phases: PhaseSpec[],
	track: TrackSpec,
): SeasonSpanReading | null {
	const opening = [...track.anchors].sort(
		(a, b) => a.fromWeekIndex - b.fromWeekIndex,
	)[0]
	if (!opening) return null

	let peak: number | null = null
	let peakWeekIndex = 0
	for (let week = 0; week < totalWeeks(phases); week++) {
		if (weekRole(phases, week) !== 'loading') continue
		const target = weekTarget(phases, track, week)
		if (target == null) continue
		if (peak == null || target > peak) {
			peak = target
			peakWeekIndex = week
		}
	}

	return peak == null ? null : { anchor: opening.value, peak, peakWeekIndex }
}

/**
 * Every week of the season summed, in the track's currency — the **secondary**
 * figure beside the span, and never the headline.
 *
 * Null as soon as **one** week cannot be priced: a sum over a gap would read as
 * the whole season's volume while silently describing part of it.
 */
export function seasonTotal(
	phases: PhaseSpec[],
	track: TrackSpec,
): number | null {
	let total = 0
	for (let week = 0; week < totalWeeks(phases); week++) {
		const target = weekTarget(phases, track, week)
		if (target == null) return null
		total += target
	}
	return total
}
