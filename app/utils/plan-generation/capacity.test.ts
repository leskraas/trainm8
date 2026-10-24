import { describe, expect, test } from 'vitest'
import {
	CATALOGUE_CORPUS,
	stockEntryId,
	stockWorkoutId,
} from '../catalogue-corpus.all.ts'
import { hoursFitWarnings } from '../plan-outline/availability-fit.ts'
import { PRESET_KEYS } from '../plan-outline/presets.ts'
import { type ConversionContext } from '../plan-outline/volume-conversion.ts'
import { generateDeterministicSeason } from './deterministic.ts'
import { type RetrievableEntry } from './retrieval.ts'
import { type GeneratedSeason, type SeasonRequest } from './season.ts'

// #473: the athlete's Weekly Capacity is enforced on the generated season's Week
// Targets — the Season Anchor is lowered until no week outruns it — and where it
// cannot be (unset, unpriced, or the hard sessions alone outrun it) the payload
// says so rather than passing.

const CORPUS: RetrievableEntry[] = CATALOGUE_CORPUS.map((session) => ({
	entryId: stockEntryId(session.key),
	workoutId: stockWorkoutId(session.key),
	title: session.title,
	description: session.description,
	discipline: session.discipline,
	authorship: 'system',
	archetype: session.archetype,
	level: session.level,
	phases: session.phases,
	goalEvents: session.goalEvents,
	citationAuthor: session.citation?.author ?? null,
	citationWork: session.citation?.work ?? null,
	citationYear: session.citation?.year ?? null,
	citationLocator: session.citation?.locator ?? null,
}))

/** A runner with a 5:00/km threshold: enough to read km weeks in hours. */
const RUNNER: ConversionContext = {
	recipe: null,
	profile: {
		lthr: null,
		maxHr: null,
		thresholdPaceSecPerKm: 300,
		cssSecPer100m: null,
	},
}

function request(overrides: Partial<SeasonRequest> = {}): SeasonRequest {
	return {
		presetKey: 'classic-linear',
		startWeekKey: '2026-01-05',
		eventWeekKey: '2026-05-11',
		tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 6 }],
		strengthDisciplines: [],
		trainableWeekdays: null,
		goalEvent: '10k',
		intent: 'deliberately-building',
		weeklyCapacityHours: 6,
		conversionContexts: { run: RUNNER },
		...overrides,
	}
}

/** Every week's summed Week Target, for hours tracks. */
function hoursTargets(season: GeneratedSeason): number[] {
	return season.weeks.map((week) =>
		week.targets.reduce((sum, target) => sum + (target.value ?? 0), 0),
	)
}

describe.each(PRESET_KEYS)('preset %s', (presetKey) => {
	// Property: over a spread of anchors and capacities, in both currencies, no
	// week of the generated season outruns the capacity once it is priced.
	test.each([
		{ currency: 'hours' as const, anchor: 4, capacity: 5 },
		{ currency: 'hours' as const, anchor: 9, capacity: 6 },
		{ currency: 'hours' as const, anchor: 15, capacity: 3.5 },
		{ currency: 'km' as const, anchor: 40, capacity: 5 },
		{ currency: 'km' as const, anchor: 90, capacity: 7 },
	])(
		'no week outruns a $capacity h capacity from a $anchor $currency anchor',
		({ currency, anchor, capacity }) => {
			const season = generateDeterministicSeason(
				request({
					presetKey,
					tracks: [{ discipline: 'run', currency, anchorValue: anchor }],
					weeklyCapacityHours: capacity,
				}),
				CORPUS,
			)
			const fit = season.capacity
			if (fit.kind === 'over') {
				// Only when the mix's own hard sessions outrun it — and then said.
				expect(currency).toBe('km')
				expect(fit.warnings.length).toBeGreaterThan(0)
				expect(season.tracks[0]!.anchorValue).toBe(anchor)
				return
			}
			expect(['fits', 'lowered']).toContain(fit.kind)
			if (currency === 'hours') {
				expect(hoursFitWarnings(hoursTargets(season), capacity)).toEqual([])
			}
			if (fit.kind === 'lowered') {
				expect(fit.peakHours).toBeLessThanOrEqual(capacity + 0.05)
				expect(season.tracks[0]!.anchorValue).toBeLessThan(anchor)
				expect(season.tracks[0]!.anchorValue).toBeGreaterThan(0)
			} else {
				expect(season.tracks[0]!.anchorValue).toBe(anchor)
			}
		},
	)

	test('lowering keeps the shape: every week falls by the same factor', () => {
		const free = generateDeterministicSeason(
			request({ presetKey, weeklyCapacityHours: null }),
			CORPUS,
		)
		const capped = generateDeterministicSeason(
			request({ presetKey, weeklyCapacityHours: 4 }),
			CORPUS,
		)
		expect(capped.capacity.kind).toBe('lowered')
		const ratio = capped.tracks[0]!.anchorValue! / 6
		const before = hoursTargets(free)
		hoursTargets(capped).forEach((value, at) => {
			expect(value).toBeCloseTo(before[at]! * ratio, 6)
		})
	})
})

test('a plan that already fits keeps the athlete’s anchor', () => {
	const season = generateDeterministicSeason(
		request({ weeklyCapacityHours: 168 }),
		CORPUS,
	)
	expect(season.capacity.kind).toBe('fits')
	expect(season.tracks[0]!.anchorValue).toBe(6)
})

test('the lowered anchor is on the currency’s precision, and a tenth more would not fit', () => {
	const season = generateDeterministicSeason(request(), CORPUS)
	expect(season.capacity.kind).toBe('lowered')
	const anchor = season.tracks[0]!.anchorValue!
	expect(Math.round(anchor * 10) / 10).toBe(anchor)
	const above = Math.round((anchor + 0.1) * 10) / 10
	const tried = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: above }],
			weeklyCapacityHours: null,
		}),
		CORPUS,
	)
	expect(hoursFitWarnings(hoursTargets(tried), 6).length).toBeGreaterThan(0)
})

test('no capacity is unset, never passing, and nothing is lowered', () => {
	const season = generateDeterministicSeason(
		request({
			weeklyCapacityHours: null,
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 30 }],
		}),
		CORPUS,
	)
	expect(season.capacity).toEqual({ kind: 'unset' })
	expect(season.tracks[0]!.anchorValue).toBe(30)
})

test('a km track with no threshold pace is unpriced: the check says it did not run', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 80 }],
			conversionContexts: {},
		}),
		CORPUS,
	)
	expect(season.capacity).toEqual({ kind: 'unpriced', weeklyCapacityHours: 6 })
	expect(season.tracks[0]!.anchorValue).toBe(80)
})

test('a track with no anchor is unpriced', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: null }],
		}),
		CORPUS,
	)
	expect(season.capacity.kind).toBe('unpriced')
})

test('when the hard sessions alone outrun the capacity, the anchor stands and the breach is carried', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
			weeklyCapacityHours: 0.5,
		}),
		CORPUS,
	)
	expect(season.capacity.kind).toBe('over')
	expect(season.tracks[0]!.anchorValue).toBe(40)
})

test('two tracks are lowered by one common factor', () => {
	const season = generateDeterministicSeason(
		request({
			tracks: [
				{ discipline: 'run', currency: 'hours', anchorValue: 5 },
				{ discipline: 'bike', currency: 'hours', anchorValue: 5 },
			],
			weeklyCapacityHours: 8,
		}),
		CORPUS,
	)
	expect(season.capacity.kind).toBe('lowered')
	const [run, bike] = season.tracks
	expect(run!.anchorValue).toBe(bike!.anchorValue)
	expect(hoursFitWarnings(hoursTargets(season), 8)).toEqual([])
})
