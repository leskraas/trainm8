import { expect, test } from 'vitest'
import {
	FINDING_ABSENCE_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	hoursEstimateLabel,
	nbWeekdayList,
} from '#app/utils/labels.ts'
import { type LoggedVolume } from '#app/utils/plan-outline/proposal.ts'
import { FIRST_RUN_PLAN_REFUSALS } from './first-run-schema.ts'
import {
	buildFindings,
	FINDING_ABSENCES,
	startPrefill,
	typicalWeekdays,
	weeklyHoursEstimate,
} from './first-run.ts'

// The start's reading of the history (#505 stories 62–71, #578): what the
// last four weeks say, the hours arithmetic it shows, and the hours and days
// it pre-fills the start with.

function volume(overrides: Partial<LoggedVolume>): LoggedVolume {
	return {
		discipline: 'run',
		sessions: 0,
		weeksTrained: 0,
		km: null,
		hours: null,
		sets: null,
		...overrides,
	}
}

const NONE: LoggedVolume[] = [
	volume({ discipline: 'run' }),
	volume({ discipline: 'bike' }),
	volume({ discipline: 'swim' }),
	volume({ discipline: 'strength' }),
]

function withVolumes(...overrides: LoggedVolume[]): LoggedVolume[] {
	return NONE.map(
		(empty) =>
			overrides.find((v) => v.discipline === empty.discipline) ?? empty,
	)
}

// 43 km a week at 5:35 a km for four weeks: 172 km in 172 × 335 s.
const RUNNER = volume({
	discipline: 'run',
	sessions: 16,
	weeksTrained: 4,
	km: 172,
	hours: (172 * 335) / 3600,
})

test('the hours estimate shows its arithmetic: 43 km/uke à 5:35 ≈ 4 t', () => {
	const estimate = weeklyHoursEstimate(withVolumes(RUNNER))

	expect(estimate).toEqual({
		parts: [
			{
				discipline: 'run',
				kind: 'pace',
				kmPerWeek: 43,
				paceSecPerKm: 335,
				hours: (43 * 335) / 3600,
			},
		],
		hours: 4,
	})
	expect(hoursEstimateLabel(estimate!)).toBe('43 km/uke à 5:35 ≈ 4 t')
})

test('a sport with no distance is reckoned in sessions, and the parts add up', () => {
	const estimate = weeklyHoursEstimate(
		withVolumes(
			RUNNER,
			volume({ discipline: 'bike', sessions: 8, weeksTrained: 4, hours: 10 }),
		),
	)

	// Two rides a week of 1 t 15 min on top of the runner's 4 t.
	expect(estimate?.hours).toBe(6.5)
	expect(hoursEstimateLabel(estimate!)).toBe(
		'43 km/uke à 5:35 + 2 økter/uke à 1 t 15 min ≈ 6,5 t',
	)
})

test('no endurance history gives no estimate rather than a guess', () => {
	expect(weeklyHoursEstimate(NONE)).toBeNull()
	// Lifting has no duration to price.
	expect(
		weeklyHoursEstimate(
			withVolumes(volume({ discipline: 'strength', sessions: 4, sets: 40 })),
		),
	).toBeNull()
})

test('typical days are the weekdays trained in at least two weeks', () => {
	expect(
		typicalWeekdays([
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 3 },
			{ weekKey: '2026-09-21', weekday: 6 },
			{ weekKey: '2026-09-28', weekday: 6 },
			{ weekKey: '2026-09-28', weekday: 6 },
		]),
	).toEqual([1, 6])
	// One-off days only: every day trained, rather than none.
	expect(
		typicalWeekdays([
			{ weekKey: '2026-09-07', weekday: 4 },
			{ weekKey: '2026-09-14', weekday: 2 },
		]),
	).toEqual([2, 4])
	expect(typicalWeekdays([])).toEqual([])
})

test('the history reads the most-trained sport, the volume, the days and the lifting', () => {
	const findings = buildFindings({
		connection: 'ready',
		volumes: withVolumes(
			RUNNER,
			volume({ discipline: 'bike', sessions: 2, weeksTrained: 2, hours: 3 }),
			volume({
				discipline: 'strength',
				sessions: 4,
				weeksTrained: 4,
				sets: 48,
			}),
		),
		weeksTrained: 4,
		sessionDays: [
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
		],
	})

	expect(findings.discipline).toEqual({
		measured: true,
		value: { discipline: 'run', sessions: 16, weeksTrained: 4 },
	})
	expect(findings.volume.measured && findings.volume.value.hours).toBe(5)
	expect(findings.days).toEqual({ measured: true, value: [1] })
	expect(findings.strength).toEqual({
		measured: true,
		value: { sessionsPerWeek: 1 },
	})
	expect(findings.weeksTrained).toBe(4)
})

test('every ikke målt carries its reason (story 71)', () => {
	const skipped = buildFindings({
		connection: 'none',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(skipped.discipline).toEqual({
		measured: false,
		reason: 'not-connected',
	})
	expect(skipped.volume).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.days).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.strength).toEqual({ measured: false, reason: 'not-connected' })
	expect(skipped.weeksTrained).toBeNull()

	const importing = buildFindings({
		connection: 'importing',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(importing.volume).toEqual({ measured: false, reason: 'importing' })

	const quiet = buildFindings({
		connection: 'ready',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(quiet.days).toEqual({ measured: false, reason: 'no-sessions' })

	// Sessions with no recorded duration: the sport reads, the hours do not.
	const noClock = buildFindings({
		connection: 'ready',
		volumes: withVolumes(volume({ discipline: 'swim', sessions: 3 })),
		weeksTrained: 2,
		sessionDays: [{ weekKey: '2026-09-07', weekday: 2 }],
	})
	expect(noClock.discipline.measured).toBe(true)
	expect(noClock.volume).toEqual({ measured: false, reason: 'no-duration' })
})

test('the start is pre-filled with the history’s hours and days, held to its range, or nothing where none read', () => {
	const findings = buildFindings({
		connection: 'ready',
		volumes: withVolumes(RUNNER),
		weeksTrained: 4,
		sessionDays: [
			{ weekKey: '2026-09-07', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 1 },
			{ weekKey: '2026-09-14', weekday: 5 },
			{ weekKey: '2026-09-21', weekday: 5 },
		],
	})
	expect(startPrefill(findings)).toEqual({ hours: 4, days: [1, 5] })

	// Half an hour a week is under the start's hour; 30 is over its 20.
	const hoursOf = (hours: number) =>
		startPrefill(
			buildFindings({
				connection: 'ready',
				volumes: withVolumes(
					volume({
						discipline: 'bike',
						sessions: 4,
						weeksTrained: 4,
						hours: hours * 4,
					}),
				),
				weeksTrained: 4,
				sessionDays: [],
			}),
		).hours
	expect(hoursOf(0.5)).toBe(1)
	expect(hoursOf(30)).toBe(20)

	// Nothing to read: no hours and no days, so the level's stand.
	const none = buildFindings({
		connection: 'none',
		volumes: NONE,
		weeksTrained: 0,
		sessionDays: [],
	})
	expect(startPrefill(none)).toEqual({ hours: null, days: null })
})

test('every ikke målt and every refusal has its own words (story 71)', () => {
	for (const reason of FINDING_ABSENCES) {
		expect(FINDING_ABSENCE_LABELS[reason]).toMatch(/^Ikke målt/)
	}
	for (const reason of FIRST_RUN_PLAN_REFUSALS) {
		expect(FIRST_RUN_REFUSAL_LABELS[reason]).toBeTruthy()
	}
	expect(nbWeekdayList([1, 3, 5])).toBe('tirsdag, torsdag og lørdag')
	expect(nbWeekdayList([6])).toBe('søndag')
})

test('lifting with no endurance beside it says so, never "no sessions"', () => {
	const lifter = buildFindings({
		connection: 'ready',
		volumes: withVolumes(
			volume({
				discipline: 'strength',
				sessions: 8,
				weeksTrained: 4,
				sets: 96,
			}),
		),
		weeksTrained: 4,
		sessionDays: [
			{ weekKey: '2026-09-07', weekday: 0 },
			{ weekKey: '2026-09-14', weekday: 0 },
		],
	})
	expect(lifter.discipline).toEqual({
		measured: false,
		reason: 'only-strength',
	})
	expect(lifter.volume).toEqual({ measured: false, reason: 'only-strength' })
	expect(lifter.strength).toEqual({
		measured: true,
		value: { sessionsPerWeek: 2 },
	})
	expect(lifter.days).toEqual({ measured: true, value: [0] })
	expect(FINDING_ABSENCE_LABELS['only-strength']).toMatch(/styrkeøkter/)
})
