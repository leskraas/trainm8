import { expect, test } from 'vitest'
import { type ExerciseSessionSummary } from '#app/utils/strength/exercise-history.ts'
import { type StrengthRecord } from '#app/utils/strength/records.ts'
import { type ExerciseHistoryView } from '#app/utils/strength-records.server.ts'
import {
	type ProgramLiftContext,
	NO_KILOS_NOTE,
	buildChartBars,
	buildChartLabel,
	buildExerciseHistoryViewModel,
	buildHistoryPoints,
	buildLiftHeader,
	buildRecordCards,
	buildStallNotes,
	buildVariantTabs,
} from './__exercise-history-presenter.ts'

const TZ = 'UTC'
const NOW = new Date('2026-08-14T12:00:00Z')

function session(
	overrides: Partial<ExerciseSessionSummary> = {},
): ExerciseSessionSummary {
	return {
		sessionId: 'sess-1',
		performedAt: new Date('2026-08-10T17:00:00Z'),
		workingSetCount: 5,
		topSetKg: 100,
		topSetText: '100 kg × 5',
		loadBasis: 'bar',
		comparable: true,
		...overrides,
	}
}

function record(overrides: Partial<StrengthRecord> = {}): StrengthRecord {
	return {
		exerciseId: 'ex-1',
		equipment: 'barbell',
		loadBasis: 'bar',
		kind: 'heaviestLoad',
		reps: null,
		value: 100,
		unit: 'kg',
		sessionId: 'sess-1',
		achievedAt: new Date('2026-08-10T17:00:00Z'),
		previousValue: 97.5,
		delta: 2.5,
		crossExerciseComparable: true,
		unavailableNote: null,
		debut: false,
		estimator: null,
		...overrides,
	}
}

function view(
	overrides: Partial<ExerciseHistoryView> = {},
): ExerciseHistoryView {
	return {
		exercise: { id: 'ex-1', name: 'Back squat', unilateral: false },
		equipment: 'barbell',
		variants: [{ equipment: 'barbell', sessionCount: 3 }],
		sessions: [session()],
		lastTime: session(),
		records: [record()],
		recordsRefused: null,
		estimator: 'epley',
		oneRmUnavailable: null,
		timezone: TZ,
		now: NOW,
		...overrides,
	}
}

test('a beaten record states the kilos it went up by, and the date it was set', () => {
	const [card] = buildRecordCards([record()], TZ)

	expect(card?.headline).toBe('Heaviest ever')
	expect(card?.value).toBe('100 kg')
	expect(card?.gain).toBe('up 2.5 kg')
	expect(card?.achievedLabel).toBe('10 Aug')
})

test('a bodyweight-derived record is headlined as one, so no card can read as a weight on the bar', () => {
	// The defect was a card reading "Heaviest ever: 104 kg — up 74 kg" on a bench
	// press whose heaviest bar was 30 kg. The basis belongs in the words: a caveat
	// under the number does not undo the headline over it.
	const [card] = buildRecordCards(
		[
			record({
				loadBasis: 'bodyweightDerived',
				value: 104,
				previousValue: null,
				delta: null,
				crossExerciseComparable: false,
				unavailableNote:
					'Includes your bodyweight — this progresses against other bodyweight sets only.',
			}),
		],
		TZ,
	)

	expect(card?.headline).toBe('Heaviest bodyweight set')
	expect(card?.value).toBe('104 kg')
	expect(card?.gain).toBe('first time!')
	expect(card?.comparable).toBe(false)
	expect(card?.note).toMatch(/Includes your bodyweight/)
})

test('two records on one lift with different bases get different keys, so neither replaces the other', () => {
	const cards = buildRecordCards(
		[
			record({ loadBasis: 'bar', value: 30 }),
			record({ loadBasis: 'bodyweightDerived', value: 104 }),
		],
		TZ,
	)

	expect(new Set(cards.map((card) => card.key)).size).toBe(2)
})

test('an assisted lift with no record carries the refusal onto the surface, so the empty strip says why', () => {
	const model = buildExerciseHistoryViewModel(
		view({
			records: [],
			recordsRefused:
				'An assisted set takes no record: the number is your bodyweight minus the assistance, so it grows as the work shrinks.',
		}),
	)

	expect(model.records).toEqual([])
	expect(model.recordsRefused).toMatch(/grows as the work shrinks/)
})

test("a weight the athlete's plates can make is stated as it was stored, not rounded to one decimal", () => {
	// The runner's plate line on these same rows says "your gym makes 60 kg, not
	// 61.25 kg". A card that answered "61.3 kg" showed two numbers for one stored
	// value, and 1.25 kg pairs are real.
	const [card] = buildRecordCards(
		[record({ value: 61.25, previousValue: 40, delta: 21.25 })],
		TZ,
	)

	expect(card?.value).toBe('61.25 kg')
	expect(card?.value).not.toContain('61.3')
})

test('a delta agrees with the two weights it is derived from', () => {
	const [card] = buildRecordCards(
		[record({ value: 61.25, previousValue: 40, delta: 21.25 })],
		TZ,
	)

	// 61.25 − 40 = 21.25, and the card says all three of those numbers.
	expect(card?.value).toBe('61.25 kg')
	expect(card?.gain).toBe('up 21.25 kg')
})

test('a first entry on a variant reads "first time!" rather than announcing a PR', () => {
	const [card] = buildRecordCards(
		[record({ debut: true, delta: null, previousValue: null })],
		TZ,
	)

	expect(card?.gain).toBe('first time!')
	expect(card?.gain).not.toMatch(/PR/i)
})

test('a second session inside the debut window does not claim a first time above the history that shows otherwise', () => {
	// The defect this closes: on this very page, with a 20 kg × 5 session listed
	// below it, a 22.5 kg set read "first time!".
	const [card] = buildRecordCards(
		[record({ debut: true, value: 22.5, previousValue: 20, delta: 2.5 })],
		TZ,
	)

	expect(card?.gain).toBe('best so far')
	expect(card?.gain).not.toMatch(/first time/i)
})

test('a rep-max record names the rep count it is exactly at', () => {
	const [card] = buildRecordCards(
		[record({ kind: 'repMax', reps: 5, value: 92.5 })],
		TZ,
	)

	expect(card?.headline).toBe('Best 5-rep set')
	expect(card?.value).toBe('92.5 kg')
})

test('an estimated 1RM carries its equation and an observed record carries none', () => {
	const cards = buildRecordCards(
		[
			record({ kind: 'e1RM', value: 116.7, estimator: 'epley' }),
			record({ kind: 'heaviestLoad' }),
		],
		TZ,
	)

	expect(cards[0]?.estimator).toBe('epley')
	expect(cards[1]?.estimator).toBeNull()
})

test('a machine-stack record reads in levels and is never printed as kilos', () => {
	const [card] = buildRecordCards(
		[
			record({
				kind: 'stackLevel',
				unit: 'level',
				value: 7,
				previousValue: 6,
				delta: 1,
				crossExerciseComparable: false,
				unavailableNote: NO_KILOS_NOTE,
			}),
		],
		TZ,
	)

	expect(card?.value).toBe('level 7')
	expect(card?.value).not.toMatch(/kg/)
	expect(card?.gain).toBe('up 1 level')
	expect(card?.comparable).toBe(false)
	expect(card?.note).toBe(NO_KILOS_NOTE)
})

test('the history reads oldest first, so the curve runs left to right', () => {
	const points = buildHistoryPoints(
		[
			session({
				sessionId: 'new',
				performedAt: new Date('2026-08-10T17:00:00Z'),
			}),
			session({
				sessionId: 'old',
				performedAt: new Date('2026-08-03T17:00:00Z'),
			}),
		],
		TZ,
	)

	expect(points.map((point) => point.sessionId)).toEqual(['old', 'new'])
})

test('a session with no honest kilo keeps its place in the history and gets no bar', () => {
	const points = buildHistoryPoints(
		[
			session({
				sessionId: 'stack',
				topSetKg: null,
				topSetText: 'level 7 × 12',
				loadBasis: 'stackLevel',
				comparable: false,
			}),
		],
		TZ,
	)

	expect(points).toHaveLength(1)
	expect(points[0]?.kg).toBeNull()
	// Not a zero-length bar, which would read as "you lifted nothing".
	expect(points[0]?.barFraction).toBeNull()
	expect(points[0]?.text).toBe('level 7 × 12')
})

test('the bar is scaled to the range in view, so 100 kg to 105 kg is not a flat line', () => {
	const points = buildHistoryPoints(
		[
			session({
				sessionId: 'a',
				performedAt: new Date('2026-08-03T17:00:00Z'),
				topSetKg: 100,
			}),
			session({
				sessionId: 'b',
				performedAt: new Date('2026-08-10T17:00:00Z'),
				topSetKg: 105,
			}),
		],
		TZ,
	)

	expect(points[1]?.barFraction).toBe(1)
	expect(points[0]?.barFraction).toBeLessThan(1)
	expect(points[0]?.barFraction).toBeGreaterThan(0)
})

test('a bodyweight-derived session does not stretch the axis of a curve made of bar kilos', () => {
	// One axis, one basis. A dip-belt session bakes the athlete into 104 kg (ADR
	// 0056 §3), so scaling the curve against it made the belt session the tallest
	// bar on a lift whose heaviest bar was 105 kg — and shrank every real session to
	// make room for a number that is not a bar weight.
	const points = buildHistoryPoints(
		[
			session({
				sessionId: 'bar-1',
				performedAt: new Date('2026-08-03T17:00:00Z'),
				topSetKg: 100,
			}),
			session({
				sessionId: 'belt',
				performedAt: new Date('2026-08-07T17:00:00Z'),
				topSetKg: 104,
				topSetText: 'bodyweight + 30 kg × 5',
				loadBasis: 'bodyweightDerived',
				comparable: false,
			}),
			session({
				sessionId: 'bar-2',
				performedAt: new Date('2026-08-10T17:00:00Z'),
				topSetKg: 105,
			}),
		],
		TZ,
	)

	// The heaviest *bar* session is the full bar, not the heaviest number.
	expect(points[2]?.barFraction).toBe(1)
	expect(points[0]?.barFraction).toBeLessThan(1)
	// The belt session keeps its place and its text, and is drawn as neither a bar
	// nor a zero: it happened, and it is not on this axis.
	expect(points[1]?.text).toBe('bodyweight + 30 kg × 5')
	expect(points[1]?.barFraction).toBeNull()
	expect(points[1]?.comparable).toBe(false)
})

test('a plateau draws full bars rather than dividing by a span of zero', () => {
	const points = buildHistoryPoints(
		[
			session({ sessionId: 'a', topSetKg: 100 }),
			session({
				sessionId: 'b',
				performedAt: new Date('2026-08-12T17:00:00Z'),
				topSetKg: 100,
			}),
		],
		TZ,
	)

	expect(points.map((point) => point.barFraction)).toEqual([1, 1])
})

test('the variant switcher offers "All variants" only when more than one exists', () => {
	const single = buildVariantTabs(
		[{ equipment: 'barbell', sessionCount: 3 }],
		'barbell',
	)
	const both = buildVariantTabs(
		[
			{ equipment: 'barbell', sessionCount: 3 },
			{ equipment: 'dumbbell', sessionCount: 1 },
		],
		'dumbbell',
	)

	expect(single.map((tab) => tab.label)).toEqual(['Barbell'])
	expect(both.map((tab) => tab.label)).toEqual([
		'All variants',
		'Barbell',
		'Dumbbell',
	])
	expect(both.find((tab) => tab.current)?.label).toBe('Dumbbell')
})

test('the kilo-less phrase is said exactly once, on the record that carries it', () => {
	const model = buildExerciseHistoryViewModel(
		view({
			sessions: [
				session({
					topSetKg: null,
					topSetText: 'level 7 × 12',
					loadBasis: 'stackLevel',
					comparable: false,
				}),
			],
			records: [
				record({
					kind: 'stackLevel',
					unit: 'level',
					value: 7,
					crossExerciseComparable: false,
					unavailableNote: NO_KILOS_NOTE,
				}),
			],
		}),
	)

	const said = [model.noKilosNote, ...model.records.map((card) => card.note)]
	expect(said.filter((note) => note === NO_KILOS_NOTE)).toHaveLength(1)
	expect(model.records[0]?.note).toBe(NO_KILOS_NOTE)
})

test('a band-only history still says it progresses against itself, even with no record to hang it on', () => {
	const model = buildExerciseHistoryViewModel(
		view({
			sessions: [
				session({
					topSetKg: null,
					topSetText: 'red band × 15',
					loadBasis: 'unreadable',
					comparable: false,
				}),
			],
			// A band gets no record at all: band colours have no published order, so
			// inventing one would be the same fabrication as inventing kilos.
			records: [],
		}),
	)

	expect(model.noKilosNote).toBe(NO_KILOS_NOTE)
	expect(model.records).toEqual([])
})

test('a mixed history leaves the kilo-less phrase on the record it belongs to', () => {
	const model = buildExerciseHistoryViewModel(
		view({
			sessions: [
				session({ sessionId: 'kg' }),
				session({
					sessionId: 'stack',
					topSetKg: null,
					loadBasis: 'stackLevel',
					comparable: false,
				}),
			],
		}),
	)

	expect(model.noKilosNote).toBeNull()
})

test('the equation is named on the screen only when an estimate was produced', () => {
	const withEstimate = buildExerciseHistoryViewModel(
		view({ records: [record({ kind: 'e1RM', estimator: 'epley' })] }),
	)
	const without = buildExerciseHistoryViewModel(view())

	expect(withEstimate.estimatorNote).toMatch(/epley/)
	expect(without.estimatorNote).toBeNull()
})

test('a missing estimated 1RM says why it is missing, and says nothing when there is one', () => {
	// One set may not be estimated from on one screen and refused on another, so
	// the sentence here is the estimator's own — and it is only shown where the row
	// it explains is actually absent.
	const refused = buildExerciseHistoryViewModel(
		view({
			records: [record()],
			oneRmUnavailable:
				'None of your sets here says how close to failure it was.',
		}),
	)
	const estimated = buildExerciseHistoryViewModel(
		view({
			records: [record({ kind: 'e1RM', estimator: 'epley' })],
			oneRmUnavailable:
				'None of your sets here says how close to failure it was.',
		}),
	)

	expect(refused.oneRmUnavailable).toMatch(/how close to failure/)
	expect(estimated.oneRmUnavailable).toBeNull()
})

test('a lift with no logged work is empty rather than a chart of nothing', () => {
	const model = buildExerciseHistoryViewModel(
		view({ sessions: [], lastTime: null, records: [], variants: [] }),
	)

	expect(model.empty).toBe(true)
	expect(model.points).toEqual([])
	expect(model.lastTime).toBe('First time on this lift')
	expect(model.variantTabs).toEqual([])
})

test('the screen says when the lift was last done, and what the top set was', () => {
	const model = buildExerciseHistoryViewModel(view())

	expect(model.lastTime).toBe('Last time: 3 days ago')
	expect(model.lastTimeText).toBe('100 kg × 5')
})

test('the session list reads newest first, the way a log is read', () => {
	const model = buildExerciseHistoryViewModel(
		view({
			sessions: [
				session({
					sessionId: 'new',
					performedAt: new Date('2026-08-10T17:00:00Z'),
				}),
				session({
					sessionId: 'old',
					performedAt: new Date('2026-08-03T17:00:00Z'),
				}),
			],
		}),
	)

	expect(model.sessions.map((point) => point.sessionId)).toEqual(['new', 'old'])
})

test('neither a tonnage total nor a streak reaches the view model', () => {
	const model = buildExerciseHistoryViewModel(view())

	// Declined, not deferred (ADR 0056): tonnage rewards junk volume and a streak
	// measures app-opening, so there is no key here for either.
	const keys = Object.keys(model).join(' ').toLowerCase()
	expect(keys).not.toMatch(/tonnage|streak/)
})

// ———————————————————————————————————————————————————————————————————————————
// The chart, the Stall Cut marking and the working-weight header (#481)
// ———————————————————————————————————————————————————————————————————————————

function program(
	overrides: Partial<ProgramLiftContext> = {},
): ProgramLiftContext {
	return { workingWeightKg: 82.5, stallCuts: [], ...overrides }
}

function history(count: number): ExerciseSessionSummary[] {
	return Array.from({ length: count }, (_, index) =>
		session({
			sessionId: `sess-${index + 1}`,
			performedAt: new Date(Date.UTC(2026, 6, index + 1, 17)),
			topSetKg: 80 + index,
			topSetText: `${80 + index} kg × 5`,
		}),
	)
}

test('the chart numbers sessions from the first one, oldest first, and marks only the latest bar as latest', () => {
	const bars = buildChartBars(buildHistoryPoints(history(4), TZ), null)

	expect(bars.map((bar) => bar.ordinal)).toEqual([1, 2, 3, 4])
	expect(bars.map((bar) => bar.latest)).toEqual([false, false, false, true])
})

test('every third session carries a tick label and the rest carry none', () => {
	const bars = buildChartBars(buildHistoryPoints(history(10), TZ), null)

	expect(bars.map((bar) => bar.tickLabel)).toEqual([
		'S1',
		null,
		null,
		'S4',
		null,
		null,
		'S7',
		null,
		null,
		'S10',
	])
})

test('the chart draws the presenter bar fractions it already produced, and no bar at all where a session has no kilo', () => {
	const sessions = [
		session({ sessionId: 'a', performedAt: new Date('2026-07-01T17:00:00Z') }),
		session({
			sessionId: 'b',
			performedAt: new Date('2026-07-03T17:00:00Z'),
			topSetKg: null,
			topSetText: 'level 7 × 12',
			loadBasis: 'stackLevel',
			comparable: false,
		}),
	]
	const points = buildHistoryPoints(sessions, TZ)
	const bars = buildChartBars(points, null)

	expect(bars.map((bar) => bar.heightFraction)).toEqual(
		points.map((point) => point.barFraction),
	)
	expect(bars[1]?.heightFraction).toBeNull()
})

test('a session the program cut on is marked from the stored stall history, joined on session', () => {
	const bars = buildChartBars(
		buildHistoryPoints(history(4), TZ),
		program({
			stallCuts: [
				{ sessionId: 'sess-3', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		}),
	)

	expect(bars[2]?.stallCut).toEqual({ fromKg: 80, toKg: 72.5 })
	expect(bars.filter((bar) => bar.stallCut != null)).toHaveLength(1)
})

test('the note strip is generated from the marked bar, so the sentence and the bar cannot disagree', () => {
	const bars = buildChartBars(
		buildHistoryPoints(history(9), TZ),
		program({
			stallCuts: [
				{ sessionId: 'sess-8', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		}),
	)

	expect(buildStallNotes(bars)).toEqual([
		'Session 8 — Stall Cut, 80 kg → 72.5 kg',
	])
})

test('a lift belonging to no program instance is marked nowhere and gets no note strip', () => {
	const bars = buildChartBars(buildHistoryPoints(history(4), TZ), null)

	expect(bars.every((bar) => bar.stallCut == null)).toBe(true)
	expect(buildStallNotes(bars)).toEqual([])
})

test('a stall cut recorded against a session outside this variant marks nothing rather than the wrong bar', () => {
	const bars = buildChartBars(
		buildHistoryPoints(history(3), TZ),
		program({
			stallCuts: [
				{ sessionId: 'sess-99', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		}),
	)

	expect(bars.every((bar) => bar.stallCut == null)).toBe(true)
})

test('the working weight is the header, with the estimated 1RM and the set it came from beside it', () => {
	const header = buildLiftHeader(
		view({
			sessions: [session({ sessionId: 'sess-1', topSetText: '82.5 kg × 5' })],
			records: [
				record({
					kind: 'e1RM',
					value: 96,
					sessionId: 'sess-1',
					estimator: 'epley',
					oneRmProtocol: 'epley',
				}),
			],
		}),
		program({ workingWeightKg: 82.5 }),
	)

	expect(header?.workingWeight).toBe('82.5 kg')
	expect(header?.estOneRm).toBe('96 kg')
	expect(header?.estOneRmSource).toBe('from 82.5 kg × 5')
})

test('a lift in no program has no working-weight header at all, rather than a zero', () => {
	expect(buildLiftHeader(view(), null)).toBeNull()
})

test('a working weight with no estimated 1RM still renders, and claims no estimate', () => {
	const header = buildLiftHeader(view(), program())

	expect(header?.workingWeight).toBe('82.5 kg')
	expect(header?.estOneRm).toBeNull()
	expect(header?.estOneRmSource).toBeNull()
})

test('the estimated 1RM names the set it came from on its record row, and an observed record names none', () => {
	const cards = buildRecordCards(
		[
			record({ kind: 'repMax', reps: 5, value: 82.5 }),
			record({
				kind: 'e1RM',
				value: 96,
				sessionId: 'sess-1',
				estimator: 'epley',
				oneRmProtocol: 'epley',
			}),
		],
		TZ,
		[session({ sessionId: 'sess-1', topSetText: '82.5 kg × 5' })],
	)

	expect(cards[0]?.source).toBeNull()
	expect(cards[1]?.source).toBe('from 82.5 kg × 5')
})

test('the view model carries the chart, the notes and the header, and still no tonnage', () => {
	const model = buildExerciseHistoryViewModel(
		view({ sessions: history(9) }),
		program({
			stallCuts: [
				{ sessionId: 'sess-8', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		}),
	)

	expect(model.chart).toHaveLength(9)
	expect(model.stallNotes).toEqual(['Session 8 — Stall Cut, 80 kg → 72.5 kg'])
	expect(model.header?.workingWeight).toBe('82.5 kg')
	expect(JSON.stringify(model)).not.toMatch(/tonnage/i)
})

test('the chart names itself, and names every bar it marked, for a reader who cannot see it', () => {
	const bars = buildChartBars(
		buildHistoryPoints(history(9), TZ),
		program({
			stallCuts: [
				{ sessionId: 'sess-8', fromKg: 80, toKg: 72.5, response: 'stallCut' },
			],
		}),
	)

	expect(buildChartLabel('Back squat', bars)).toBe(
		'Back squat over 9 sessions, oldest first. Latest: Session 9, 9 Jul: 88 kg × 5. Session 8 — Stall Cut, 80 kg → 72.5 kg.',
	)
	expect(buildChartLabel('Back squat', [])).toBeNull()
})
