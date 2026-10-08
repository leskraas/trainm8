import { expect, test } from 'vitest'
import { addDays, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { getActivePlan, getActiveSeason } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { readFirstRunFindings } from './findings.server.ts'
import { type FirstRunAnswers } from './first-run-schema.ts'
import {
	createFirstRunPlan,
	firstRunRefusalOf,
	readFirstRunPlan,
} from './plan.server.ts'

// The first run's plan on the server (#505 S14): the plan it makes honours the
// chosen days and hours — sessions only on those days, each week adding up to
// its target, no week over the hours given — and is the plan it showed.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const START = '2030-01-14' // the first week not yet begun: next Monday

async function createAthlete(birthdate?: Date) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			...(birthdate ? { athleteProfile: { create: { birthdate } } } : {}),
		},
	})
	return user.id
}

/** A completed, recorded run on a day of the history window. */
async function addRun(
	athleteId: string,
	day: string,
	km: number,
	secPerKm: number,
) {
	const startedAt = new Date(`${day}T07:00:00Z`)
	const durationSec = Math.round(km * secPerKm)
	const recording = await prisma.activityImport.create({
		data: {
			athleteId,
			externalProvider: 'intervalsicu',
			externalId: `run-${athleteId}-${day}`,
			startedAt,
			endedAt: new Date(startedAt.getTime() + durationSec * 1000),
			durationSec,
			distanceM: km * 1000,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			scheduledAt: startedAt,
			status: 'completed',
			source: 'recorded',
			recordingId: recording.id,
		},
	})
}

function answers(overrides: Partial<FirstRunAnswers> = {}): FirstRunAnswers {
	return {
		discipline: 'run',
		hours: 4.5,
		// tirsdag, torsdag, lørdag
		days: [1, 3, 5],
		goal: { kind: 'active' },
		family: null,
		...overrides,
	}
}

async function laidSessions(athleteId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId: athleteId },
		orderBy: { scheduledAt: 'asc' },
		select: {
			scheduledAt: true,
			source: true,
			planOutlineId: true,
			workout: {
				select: {
					blocks: { select: { steps: { select: { durationSec: true } } } },
				},
			},
		},
	})
	return sessions.map((session) => {
		const day = session.scheduledAt.toISOString().slice(0, 10)
		return {
			day,
			weekday: weekdayIndex(day),
			source: session.source,
			planOutlineId: session.planOutlineId,
			seconds:
				session.workout?.blocks
					.flatMap((block) => block.steps)
					.reduce((sum, step) => sum + (step.durationSec ?? 0), 0) ?? 0,
		}
	})
}

function inWeek(weekKey: string) {
	return (session: { day: string }) =>
		session.day >= weekKey && session.day <= addDays(weekKey, 6)
}

test('an open-ended first plan lays its first two weeks on the chosen days only, each week adding up to its target', async () => {
	const athleteId = await createAthlete()

	const created = await createFirstRunPlan(athleteId, answers(), NOW)
	expect(created).toMatchObject({ ok: true, eventId: null })
	if (!created.ok) return

	const sessions = await laidSessions(athleteId)
	const plan = await getActivePlan(athleteId, NOW)
	const targets = plan!.tracks[0]!.targets

	// The pattern lies on tirsdag, torsdag and lørdag, and nowhere else.
	expect(new Set(sessions.map((s) => s.weekday))).toEqual(new Set([1, 3, 5]))
	expect(sessions.every((s) => s.source === 'generated')).toBe(true)
	expect(sessions.every((s) => s.planOutlineId === created.outlineId)).toBe(
		true,
	)

	// No week asks for more than the 4,5 t given: the round's climb is kept,
	// so the first week starts lower. Each laid week adds up to its target.
	expect(Math.max(...targets.map((t) => t ?? 0))).toBeLessThanOrEqual(4.5)
	expect(targets[0]).toBe(4)
	for (const [index, weekKey] of [START, addDays(START, 7)].entries()) {
		const week = sessions.filter(inWeek(weekKey))
		expect(week).toHaveLength(3)
		const hours = week.reduce((sum, s) => sum + s.seconds, 0) / 3600
		// To the tenth of an hour the target is read and stamped at.
		expect(hours).toBeCloseTo(targets[index]!, 1)
	}
	expect(created.laid).toBe(6)
	// Nothing lands in the week already under way.
	expect(sessions.every((s) => s.day >= START)).toBe(true)
})

test('the plan made is the plan shown: same family, same days, same minutes', async () => {
	const athleteId = await createAthlete()
	const shown = await readFirstRunPlan(
		athleteId,
		answers({ family: 'polarized' }),
		NOW,
	)
	expect(shown.ok).toBe(true)
	if (!shown.ok) return

	const created = await createFirstRunPlan(
		athleteId,
		answers({ family: 'polarized' }),
		NOW,
	)
	if (!created.ok) throw new Error(created.reason)

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: {
			family: true,
			startWeekKey: true,
			phases: { select: { name: true, weeks: true, rhythm: true } },
			patterns: { select: { days: { select: { weekday: true } } } },
		},
	})
	expect(outline.family).toBe('polarized')
	expect(outline.startWeekKey).toBe(START)
	expect(outline.phases).toEqual(
		shown.plan.draft.phases.map(({ name, weeks, rhythm }) => ({
			name,
			weeks,
			rhythm,
		})),
	)
	expect(
		outline.patterns.flatMap((pattern) => pattern.days.map((d) => d.weekday)),
	).toEqual([1, 3, 5])

	const shownMinutes = shown.plan.draft.weeks.flatMap((week) =>
		week.sessions.map((session) => Math.round((session.volume ?? 0) * 60)),
	)
	const laidMinutes = (await laidSessions(athleteId)).map((s) =>
		Math.round(s.seconds / 60),
	)
	expect(laidMinutes).toEqual(shownMinutes)
})

test('the days and hours become the athlete’s availability and weekly capacity', async () => {
	const athleteId = await createAthlete()
	await createFirstRunPlan(athleteId, answers(), NOW)

	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: athleteId },
		select: { trainableWeekdays: true, weeklyCapacityHours: true },
	})
	// Sunday-first on the profile: tirsdag 2, torsdag 4, lørdag 6.
	expect(parseTrainableWeekdays(profile.trainableWeekdays)).toEqual([2, 4, 6])
	expect(profile.weeklyCapacityHours).toBe(4.5)
})

test('a dated goal gets an Event and the family’s season fitted to it, laid on the chosen days', async () => {
	const athleteId = await createAthlete()
	const date = addDays(START, 7 * 15 + 5) // the Saturday of plan week 16

	const created = await createFirstRunPlan(
		athleteId,
		answers({
			goal: { kind: 'event', name: 'Bergen City Marathon', date },
			family: 'threshold',
			days: [0, 2, 4, 6],
			hours: 6,
		}),
		NOW,
	)
	if (!created.ok) throw new Error(created.reason)
	expect(created.eventId).not.toBeNull()

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: {
			family: true,
			event: { select: { name: true, kind: true } },
			phases: { select: { weeks: true } },
		},
	})
	expect(outline.family).toBe('threshold')
	expect(outline.event).toEqual({
		name: 'Bergen City Marathon',
		kind: 'fitness-goal',
	})
	// Sixteen plan weeks, the race week the last of them.
	expect(outline.phases.reduce((sum, phase) => sum + phase.weeks, 0)).toBe(16)

	const sessions = await laidSessions(athleteId)
	expect(new Set(sessions.map((s) => s.weekday))).toEqual(new Set([0, 2, 4, 6]))
	const plan = await getActivePlan(athleteId, NOW)
	const targets = plan!.tracks[0]!.targets
	const firstWeek = sessions.filter(inWeek(START))
	expect(firstWeek.reduce((sum, s) => sum + s.seconds, 0) / 3600).toBeCloseTo(
		targets[0]!,
		1,
	)
	expect(Math.max(...targets.map((t) => t ?? 0))).toBeLessThanOrEqual(6)
})

/** The plan's weeks as Sesong reads them, and both of its fit checks. */
async function readSeason(athleteId: string) {
	const plan = await getActivePlan(athleteId, NOW)
	const season = await getActiveSeason(athleteId, NOW)
	return {
		targets: plan!.tracks[0]!.targets.map((t) => t ?? 0),
		hoursWarnings: season!.hoursWarnings,
		availabilityWarnings: season!.availabilityWarnings,
	}
}

test.each([
	['a race 25 weeks out', 25],
	['a race 51 weeks out', 51],
	['no race', null],
] as const)(
	'a 5 h athlete with %s never gets a week over 5 h, and no fit check fires',
	async (_, weeks) => {
		for (const family of ['classic', 'big-base', 'polarized'] as const) {
			const athleteId = await createAthlete()
			const created = await createFirstRunPlan(
				athleteId,
				answers({
					hours: 5,
					// One day only: every family's hard sessions must fit it too.
					days: [5],
					family,
					goal:
						weeks == null
							? { kind: 'active' }
							: {
									kind: 'event',
									name: 'Målløpet',
									date: addDays(START, 7 * (weeks - 1) + 5),
								},
				}),
				NOW,
			)
			if (!created.ok) throw new Error(created.reason)

			const season = await readSeason(athleteId)
			if (weeks != null) expect(season.targets).toHaveLength(weeks)
			expect(Math.max(...season.targets)).toBeLessThanOrEqual(5)
			// The heaviest week is the hours given, near enough: not a timid plan.
			expect(Math.max(...season.targets)).toBeGreaterThan(4.5)
			expect(season.hoursWarnings).toEqual([])
			expect(season.availabilityWarnings).toEqual([])
		}
	},
)

test('two submits of a race plan at once make one plan and one Event', async () => {
	const athleteId = await createAthlete()
	const race = answers({
		goal: {
			kind: 'event',
			name: 'Dobbeltklikk',
			date: addDays(START, 7 * 11 + 5),
		},
	})

	const results = await Promise.all([
		createFirstRunPlan(athleteId, race, NOW),
		createFirstRunPlan(athleteId, race, NOW),
	])

	expect(results.filter((result) => result.ok)).toHaveLength(1)
	expect(results.find((result) => !result.ok)).toEqual({
		ok: false,
		reason: 'plan-already-active',
	})
	expect(await prisma.planOutline.count({ where: { athleteId } })).toBe(1)
	expect(await prisma.event.count({ where: { athleteId } })).toBe(1)
})

test('a race plan that fails to write leaves no Event behind', async () => {
	const athleteId = await createAthlete()

	// Zero hours anchors the track at nothing, which the plan's schema refuses
	// inside the transaction that made the Event.
	await expect(
		createFirstRunPlan(
			athleteId,
			answers({
				hours: 0,
				goal: { kind: 'event', name: 'Ingenting', date: addDays(START, 40) },
			}),
			NOW,
		),
	).rejects.toThrow()
	expect(await prisma.event.count({ where: { athleteId } })).toBe(0)
	expect(await prisma.planOutline.count({ where: { athleteId } })).toBe(0)
})

test('a race past the longest plan is refused as too far, and nothing is made', async () => {
	const athleteId = await createAthlete()

	expect(
		await createFirstRunPlan(
			athleteId,
			answers({
				goal: {
					kind: 'event',
					name: 'Langt unna',
					date: addDays(START, 7 * 104 + 1),
				},
			}),
			NOW,
		),
	).toEqual({ ok: false, reason: 'event-too-far' })
	expect(await prisma.event.count({ where: { athleteId } })).toBe(0)
})

test('each refusal of the plan write is said as what it is', () => {
	expect(firstRunRefusalOf('open-ended-already-active')).toBe(
		'plan-already-active',
	)
	expect(firstRunRefusalOf('event-past')).toBe('event-too-soon')
	for (const reason of [
		'event-not-found',
		'event-cancelled',
		'event-already-planned',
	] as const) {
		expect(firstRunRefusalOf(reason)).toBe('goal-unavailable')
	}
})

test('a race this week or next is refused, and nothing is made', async () => {
	const athleteId = await createAthlete()

	expect(
		await createFirstRunPlan(
			athleteId,
			answers({
				goal: { kind: 'event', name: 'Too soon', date: addDays(START, 2) },
			}),
			NOW,
		),
	).toEqual({ ok: false, reason: 'event-too-soon' })
	expect(await prisma.event.count({ where: { athleteId } })).toBe(0)
	expect(await prisma.planOutline.count({ where: { athleteId } })).toBe(0)
})

test('an athlete who already has a plan gets no second one', async () => {
	const athleteId = await createAthlete()
	await createOpenEndedPlan(
		athleteId,
		{ discipline: 'run', weeklyHours: 3 },
		NOW,
	)

	expect(await createFirstRunPlan(athleteId, answers(), NOW)).toEqual({
		ok: false,
		reason: 'plan-already-active',
	})
	expect(await prisma.planOutline.count({ where: { athleteId } })).toBe(1)
})

test('Dette fant vi reads the last four weeks: the sport, the arithmetic and the days', async () => {
	const athleteId = await createAthlete()
	// Four weeks of 43 km at 5:35, on Tuesdays and Saturdays.
	for (const monday of [
		'2029-12-10',
		'2029-12-17',
		'2029-12-24',
		'2029-12-31',
	]) {
		await addRun(athleteId, addDays(monday, 1), 21.5, 335)
		await addRun(athleteId, addDays(monday, 5), 21.5, 335)
	}
	// This week's run is outside the window.
	await addRun(athleteId, '2030-01-08', 10, 335)

	const { findings, connection } = await readFirstRunFindings(athleteId, NOW)
	expect(connection).toBe('none')
	expect(findings.discipline).toEqual({
		measured: true,
		value: { discipline: 'run', sessions: 8, weeksTrained: 4 },
	})
	expect(findings.volume).toEqual({
		measured: true,
		value: {
			parts: [expect.objectContaining({ kmPerWeek: 43, paceSecPerKm: 335 })],
			hours: 4,
		},
	})
	expect(findings.days).toEqual({ measured: true, value: [1, 5] })
	expect(findings.weeksTrained).toBe(4)
})

test('the proposal reads the athlete: over fifty, a 2:1 rhythm, with the reason', async () => {
	const athleteId = await createAthlete(new Date('1975-03-01T00:00:00Z'))
	for (const monday of [
		'2029-12-10',
		'2029-12-17',
		'2029-12-24',
		'2029-12-31',
	]) {
		await addRun(athleteId, addDays(monday, 1), 10, 330)
	}

	const read = await readFirstRunPlan(athleteId, answers(), NOW)
	if (!read.ok) throw new Error(read.reason)
	expect(read.plan.proposed).toEqual({
		family: 'masters',
		reason: { code: 'older-athlete', age: 54 },
	})
	expect(read.plan.family).toBe('masters')
	// Masters' round is three weeks, two that build and one easy.
	expect(read.plan.draft.phases.map((phase) => phase.weeks)).toEqual([3])
})
