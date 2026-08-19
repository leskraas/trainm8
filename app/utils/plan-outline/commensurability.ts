// **One figure per commensurability group, not per track** — the rule that lets
// the **Season Span** headline adapt to a plan's contents without ever inventing
// an exchange rate (ADR 0043 §5).
//
// A pure runner reads `55 → 78 km/wk`; a runner who lifts reads that beside
// `12 → 21 sets/wk`; a triathlete's three endurance tracks read as one
// `320 → 450 TSS/wk`. Four simultaneous spans is not a headline, and a single
// reconciled number across incommensurable currencies is a fabricated exchange
// rate — so the grouping is the whole answer, and it is stated here once rather
// than settled again on every surface that shows a span.
//
// **Grouping is over the currencies the tracks were authored in, and nothing is
// converted.** That is what makes ADR 0043 §5's closing promise hold: the headline
// "asks each track for *its own* currency, so no track is ever asked a question it
// cannot answer", and therefore never needs an **Unavailable Metric**. A derived
// currency *view* is a different reading, allowed by ADR 0043 §8 and explicitly
// "never as the **Season Span**" — so `convertWeeklyVolume` has no business here,
// and its gates cannot leak into the headline.
//
// What accumulating means, therefore, is **addition inside one currency across
// several Disciplines** — never a conversion — and only two currencies license it:
//
// - **TSS**, because the scale is *defined* as one hour at threshold in every
//   endurance discipline, so the numbers are already on one axis (ADR 0043 §6).
//   That an hour of threshold swimming *costs* what an hour on the bike costs is a
//   modelling assumption inherited from TrainingPeaks, not a measured fact — stated
//   at the ADR and repeated here so nobody reads the sum as more than it is.
// - **hours**, across the **endurance** tracks only, as **calendar cost** and never
//   as a dose (ADR 0046 §3 correcting ADR 0043 §6). A strength track cannot join:
//   it authors `sets`, and `sets → hours` has no second multiplicand — which is the
//   `hours-calendar-cost` **Unavailable Metric** of `unavailable-readings.ts`, a
//   *cross-track* reading and not this headline.
//
// Distance never accumulates: 3 km of swimming plus 400 km of cycling is not 403 km
// of anything, so two km tracks are two groups. `sets` never accumulates either —
// it is a systemic weekly count for one Discipline (ADR 0047 §2), and no load number
// spans a strength and an endurance track in any direction (ADR 0046 §1).
//
// **Indices in, indices out**, like `season-span.ts` and `derive.ts`: this module
// sees week positions and never a date, and it carries no wording — the surface
// words the `derived` marker and names the Disciplines a figure covers (ADR 0023).

import { isCardioDiscipline, type Discipline } from '../workout-schema.ts'
import { type VolumeCurrency } from './derive.ts'
import {
	spanFromLoadingTargets,
	type SeasonSpanReading,
} from './season-span.ts'
import { type ReadingMarker } from './volume-conversion.ts'

/**
 * The **Volume Currencies** whose numbers may be added across Disciplines.
 *
 * A vocabulary rather than a condition written into the grouping walk, in the shape
 * `derive.ts` holds `VOLUME_CURRENCIES` and `quality-mix.ts` holds `QUALITY_ZONES`:
 * the list *is* the decision, and a currency added later has one place to declare
 * itself.
 */
export const ACCUMULATING_CURRENCIES = ['tss', 'hours'] as const

export type AccumulatingCurrency = (typeof ACCUMULATING_CURRENCIES)[number]

/**
 * Whether a currency's numbers mean the same thing in every Discipline, so several
 * tracks' figures may be added.
 *
 * The Discipline is checked separately by {@link seasonSpanGroups}: `hours` is
 * commensurable across the *endurance* tracks and a strength track has no hours to
 * offer, so a true answer here is a statement about the currency alone.
 */
export function accumulatesAcrossDisciplines(
	currency: VolumeCurrency,
): currency is AccumulatingCurrency {
	return (ACCUMULATING_CURRENCIES as readonly VolumeCurrency[]).includes(
		currency,
	)
}

/**
 * One Training Track as the grouping reads it — everything a span needs and nothing
 * else, so this module can be exercised without a database or a phase timeline.
 *
 * `from-rows.ts`'s `ResolvedTrack` satisfies it structurally, and deliberately: the
 * anchor, the loading weeks and the total there are all produced by the **same
 * walk** that produced the track's own `span`, so a group's figure and the track's
 * own can never come from two different readings of one season.
 */
export type SpanTrack = {
	discipline: Discipline
	/** The track's authored **Volume Currency**, never a converted one. */
	currency: VolumeCurrency
	/**
	 * The first authored **Season Anchor**'s value — the season's opening number —
	 * or `null` where no anchor is in force at all.
	 */
	anchor: number | null
	/**
	 * One entry per plan week, earliest first: the week's target where the week
	 * **loads** for this track, and `null` everywhere else — a recovery, taper or
	 * deload week, a gap between lifting blocks, or a week no anchor prices.
	 *
	 * Loading weeks only, because a recovery week is the plan coming down on
	 * purpose and is never the season's high-water mark. The rule is
	 * `season-span.ts`'s and is applied before this module sees the week, so a
	 * group cannot peak on a week a single track would not.
	 */
	loadingTargets: Array<number | null>
	/**
	 * Every week summed in this track's currency — the **secondary** figure beside
	 * the span. `null` as soon as one week cannot be priced (see `seasonTotal`).
	 */
	total: number | null
}

/**
 * One figure of the headline: a span, the currency it is in, and which Disciplines
 * it covers.
 *
 * `disciplines` is the honesty half of the reading and is never decoration. A group
 * states exactly the tracks its numbers came from, so an accumulated figure over
 * two of a triathlete's three tracks reads as those two rather than as "your
 * endurance" — the same posture as an **Unavailable Metric**'s stated reason.
 */
export type SeasonSpanGroup = {
	/** Stable identity for a list — the currency, or the currency and Discipline. */
	key: string
	currency: VolumeCurrency
	/** The Disciplines this figure covers, in the order the tracks were given. */
	disciplines: Discipline[]
	/**
	 * `authored` where the figure is one track's own numbers, `derived` where it is
	 * several tracks' added together (ADR 0043 §5's deliberate narrow exception).
	 *
	 * Binary and never a grade, the marker of ADR 0045 §9 — reused rather than
	 * redefined, because a second two-valued marker beside the conversion's would
	 * invite a surface to word them differently for the same claim.
	 */
	marker: ReadingMarker
	/** `anchor → peak loading week`, in this group's currency. */
	span: SeasonSpanReading
	/** The group's season total, or `null` where one member's cannot be priced. */
	total: number | null
}

/**
 * The headline, as one span per commensurability group, in the order the groups
 * first appear among the tracks.
 *
 * A track the season cannot price — no **Season Anchor** in force, or no priced
 * loading week — contributes nothing and is left out of its group's `disciplines`,
 * rather than voiding a figure its neighbours can state. That is why the group is
 * *named* by the Disciplines it covers: an accumulated TSS figure over two tracks
 * of three says so, and never reads as the athlete's whole endurance week.
 *
 * A group with no member left to price yields no entry at all. That is an absent
 * headline, not an **Unavailable Metric** — there is no reading to decline, because
 * nothing was authored to read — and it is the only way the returned list is ever
 * shorter than the plan's group count.
 */
export function seasonSpanGroups(
	tracks: readonly SpanTrack[],
): SeasonSpanGroup[] {
	const groups = new Map<string, SpanTrack[]>()
	for (const track of tracks) {
		// A track with no opening anchor and no priced loading week has no span of its
		// own, so it has nothing to contribute to a shared one either. Dropped before
		// grouping rather than inside it, so it cannot name a group it does not
		// appear in.
		if (track.anchor == null) continue
		if (!track.loadingTargets.some((target) => target != null)) continue
		const key = groupKeyOf(track)
		const members = groups.get(key)
		if (members) members.push(track)
		else groups.set(key, [track])
	}

	return [...groups].flatMap(([key, members]) => {
		const group = accumulate(key, members)
		return group ? [group] : []
	})
}

/**
 * Which group a track joins.
 *
 * The currency alone where its numbers add across Disciplines, so every such track
 * lands in one group; the currency **and** the Discipline otherwise, so the track
 * stands alone — two km tracks are two groups because 3 km of swimming and 400 km
 * of cycling are not 403 km of anything.
 *
 * A non-endurance track always stands alone whatever its currency says, which is
 * the `hours` correction of ADR 0046 §3 made structural: there is no arrangement of
 * stored rows that puts a strength track inside a shared hours figure.
 */
function groupKeyOf(track: SpanTrack): string {
	return isCardioDiscipline(track.discipline) &&
		accumulatesAcrossDisciplines(track.currency)
		? track.currency
		: `${track.currency}:${track.discipline}`
}

/**
 * One group's figure: its members' anchors added, and the peak of the **accumulated
 * week** rather than the sum of each member's own peak.
 *
 * Those two differ whenever the members peak in different weeks, and the difference
 * is not a rounding one — summing peaks would report a week the season never
 * contains. The peak is a claim about *a week*, so it is read off the week.
 *
 * A week counts only where **every** member prices it. A week where one track has
 * not yet been anchored is that track's silence, not a lower week: including it
 * would make the group's series climb as tracks come online and put the peak
 * wherever the last one started.
 */
function accumulate(key: string, members: SpanTrack[]): SeasonSpanGroup | null {
	const weeks = Math.max(...members.map((m) => m.loadingTargets.length))
	const accumulated = Array.from({ length: weeks }, (_, week) => {
		let sum = 0
		for (const member of members) {
			const target = member.loadingTargets[week]
			if (target == null) return null
			sum += target
		}
		return sum
	})

	const anchor = members.reduce((sum, member) => sum + (member.anchor ?? 0), 0)
	const span = spanFromLoadingTargets(anchor, accumulated)
	if (!span) return null

	return {
		key,
		currency: members[0]!.currency,
		disciplines: members.map((member) => member.discipline),
		// One member is that track's own authored numbers read back; several is an
		// addition nobody typed, and ADR 0043 §5 requires the derived status marked.
		marker: members.length > 1 ? 'derived' : 'authored',
		span,
		// `null` wins: a total missing one member's weeks would read as the group's
		// season while describing part of it, the same rule `seasonTotal` applies
		// within a single track.
		total: members.some((member) => member.total == null)
			? null
			: members.reduce((sum, member) => sum + (member.total ?? 0), 0),
	}
}
