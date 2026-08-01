import { expect, test } from 'vitest'
import { type Discipline } from '../workout-schema.ts'
import {
	accumulatesAcrossDisciplines,
	seasonSpanGroups,
	type SpanTrack,
} from './commensurability.ts'
import { type VolumeCurrency } from './derive.ts'

/**
 * One track's contribution, shaped the way `from-rows.ts` hands it over: the
 * opening anchor, and one entry per plan week that is the week's target where the
 * week **loads** and `null` everywhere else.
 *
 * Ten weeks, the last two of which never load, so a peak can be told apart from
 * the season's end.
 */
function spanTrack(
	discipline: Discipline,
	currency: VolumeCurrency,
	anchor: number,
	loading: Array<number | null> = [anchor, anchor + 10, anchor + 22],
): SpanTrack {
	return {
		discipline,
		currency,
		anchor,
		loadingTargets: [...loading, null, null],
		total: loading.reduce<number>((sum, week) => sum + (week ?? 0), 0),
	}
}

test('a pure runner reads one span in the currency they authored', () => {
	const groups = seasonSpanGroups([spanTrack('run', 'km', 55)])

	expect(groups).toHaveLength(1)
	expect(groups[0]).toMatchObject({
		currency: 'km',
		disciplines: ['run'],
		marker: 'authored',
		span: { anchor: 55, peak: 77, peakWeekIndex: 2 },
	})
})

test('a pure lifter reads one span in sets', () => {
	const groups = seasonSpanGroups([
		spanTrack('strength', 'sets', 12, [12, 16, 21]),
	])

	expect(groups).toHaveLength(1)
	expect(groups[0]).toMatchObject({
		currency: 'sets',
		disciplines: ['strength'],
		marker: 'authored',
		span: { anchor: 12, peak: 21 },
	})
})

test('a runner who lifts reads two spans, neither of them accumulated', () => {
	const groups = seasonSpanGroups([
		spanTrack('run', 'km', 55),
		spanTrack('strength', 'sets', 12, [12, 16, 21]),
	])

	expect(groups.map((group) => group.currency)).toEqual(['km', 'sets'])
	expect(groups.every((group) => group.marker === 'authored')).toBe(true)
	expect(groups.map((group) => group.disciplines)).toEqual([
		['run'],
		['strength'],
	])
})

test('several TSS endurance tracks accumulate into one span, marked derived', () => {
	const groups = seasonSpanGroups([
		spanTrack('swim', 'tss', 100, [100, 120, 140]),
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
		spanTrack('run', 'tss', 100, [100, 110, 130]),
	])

	expect(groups).toHaveLength(1)
	expect(groups[0]).toMatchObject({
		currency: 'tss',
		disciplines: ['swim', 'bike', 'run'],
		marker: 'derived',
		span: { anchor: 320, peak: 450, peakWeekIndex: 2 },
	})
})

test('a triathlete who lifts reads the accumulated TSS beside their own sets', () => {
	const groups = seasonSpanGroups([
		spanTrack('swim', 'tss', 100, [100, 120, 140]),
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
		spanTrack('run', 'tss', 100, [100, 110, 130]),
		spanTrack('strength', 'sets', 12, [12, 16, 21]),
	])

	expect(
		groups.map((group) => [group.currency, group.marker, group.span.peak]),
	).toEqual([
		['tss', 'derived', 450],
		['sets', 'authored', 21],
	])
})

test('the peak is the peak of the accumulated week, not the sum of each track’s own peak', () => {
	// Swim peaks in week 0 and bike in week 2, so summing the two peaks would read
	// 300 for a season whose biggest week is 250.
	const groups = seasonSpanGroups([
		spanTrack('swim', 'tss', 100, [100, 80, 70]),
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
	])

	expect(groups[0]?.span).toMatchObject({ peak: 250, peakWeekIndex: 2 })
})

test('distance never accumulates across disciplines', () => {
	const groups = seasonSpanGroups([
		spanTrack('swim', 'km', 3),
		spanTrack('bike', 'km', 400),
	])

	expect(groups).toHaveLength(2)
	expect(groups.map((group) => group.span.anchor)).toEqual([3, 400])
	expect(groups.every((group) => group.marker === 'authored')).toBe(true)
})

test('hours accumulate across the endurance tracks and a strength track never joins them', () => {
	const groups = seasonSpanGroups([
		spanTrack('bike', 'hours', 6, [6, 7, 8]),
		spanTrack('run', 'hours', 4, [4, 5, 6]),
		spanTrack('strength', 'sets', 12, [12, 16, 21]),
	])

	expect(groups).toHaveLength(2)
	expect(groups[0]).toMatchObject({
		currency: 'hours',
		disciplines: ['bike', 'run'],
		marker: 'derived',
		span: { anchor: 10, peak: 14 },
	})
	expect(groups[1]?.disciplines).toEqual(['strength'])
})

test('tracks authored in different currencies stand alone', () => {
	const groups = seasonSpanGroups([
		spanTrack('run', 'km', 55),
		spanTrack('bike', 'tss', 300, [300, 340, 380]),
	])

	expect(groups.map((group) => [group.currency, group.marker])).toEqual([
		['km', 'authored'],
		['tss', 'authored'],
	])
})

test('removing a track re-groups the headline', () => {
	const swim = spanTrack('swim', 'tss', 100, [100, 120, 140])
	const bike = spanTrack('bike', 'tss', 120, [120, 150, 180])

	const both = seasonSpanGroups([swim, bike])
	expect(both).toHaveLength(1)
	expect(both[0]?.marker).toBe('derived')

	const alone = seasonSpanGroups([bike])
	expect(alone).toHaveLength(1)
	expect(alone[0]).toMatchObject({
		marker: 'authored',
		disciplines: ['bike'],
		span: { anchor: 120, peak: 180 },
	})
})

test('a group’s total is the members’ totals summed, and null as soon as one is', () => {
	const priced = seasonSpanGroups([
		spanTrack('swim', 'tss', 100, [100, 120, 140]),
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
	])
	expect(priced[0]?.total).toBe(360 + 450)

	const unpriced = seasonSpanGroups([
		{ ...spanTrack('swim', 'tss', 100, [100, 120, 140]), total: null },
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
	])
	expect(unpriced[0]?.total).toBeNull()
})

test('a track with no anchor in force contributes nothing, and never a partial sum claiming its name', () => {
	const groups = seasonSpanGroups([
		{
			...spanTrack('swim', 'tss', 100),
			anchor: null,
			loadingTargets: [null, null, null, null, null],
		},
		spanTrack('bike', 'tss', 120, [120, 150, 180]),
	])

	expect(groups).toHaveLength(1)
	// Named as the bike's own figure, so the number never claims to cover a track
	// it could not price.
	expect(groups[0]).toMatchObject({
		disciplines: ['bike'],
		marker: 'authored',
		span: { anchor: 120, peak: 180 },
	})
})

test('a plan with nothing to price yields no group rather than an Unavailable headline', () => {
	expect(
		seasonSpanGroups([
			{
				...spanTrack('run', 'km', 55),
				anchor: null,
				loadingTargets: [null, null, null, null, null],
			},
		]),
	).toEqual([])
})

test('an accumulated week needs every member priced, so a track joining late never lowers the peak', () => {
	// Bike is priced from week 0; run's anchor only takes effect at week 2. Weeks
	// 0–1 are bike-only and are not the group's weeks.
	const groups = seasonSpanGroups([
		spanTrack('bike', 'tss', 200, [200, 210, 220]),
		{
			...spanTrack('run', 'tss', 100),
			loadingTargets: [null, null, 100, null, null],
		},
	])

	expect(groups[0]?.span).toMatchObject({ peak: 320, peakWeekIndex: 2 })
})

test('which currencies accumulate across Disciplines is one stated rule', () => {
	expect(accumulatesAcrossDisciplines('tss')).toBe(true)
	expect(accumulatesAcrossDisciplines('hours')).toBe(true)
	expect(accumulatesAcrossDisciplines('km')).toBe(false)
	expect(accumulatesAcrossDisciplines('sets')).toBe(false)
})

test('every group carries a key of its own, so a headline can list them', () => {
	const groups = seasonSpanGroups([
		spanTrack('swim', 'km', 3),
		spanTrack('bike', 'km', 400),
		spanTrack('run', 'tss', 300, [300, 340, 380]),
		spanTrack('strength', 'sets', 12, [12, 16, 21]),
	])

	expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length)
})
