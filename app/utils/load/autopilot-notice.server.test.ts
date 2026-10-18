import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	markAutopilotNoticeSeen,
	readAutopilotHistory,
	readAutopilotNotice,
} from './autopilot-notice.server.ts'
import { type ProposalAuthor } from './propose-week-change.ts'
import { runWeekChangeForUser } from './week-change.server.ts'

// The Autopilot Notice's lifecycle and history (#580, spec #558 stories 87–88,
// ADR 0100 §5): one athlete and a clock go in, through the weekly Week Change;
// what I dag and _Se hele sesongen_ read comes out. Oslo, as the week change's
// own tests, so a clock read in the wrong zone fails.

const OSLO = 'Europe/Oslo'

/** Oslo wall-clock time, as the UTC instant the server is handed. */
const oslo = (day: string, time: string) => {
	const [y, mo, d] = day.split('-').map(Number)
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(y!, mo! - 1, d!, h! - 1, m!))
}

/** The week of 7 January closes; the changes land in the week of the 14th. */
const SUNDAY_2001 = oslo('2030-01-13', '20:01')
const SUNDAY_2200 = oslo('2030-01-13', '22:00')
const MONDAY_0800 = oslo('2030-01-14', '08:00')
const TUESDAY_0800 = oslo('2030-01-15', '08:00')
const CLOSED = '2030-01-07'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: OSLO,
					defaultTrainingTime: '07:00',
					autopilot: true,
				},
			},
		},
	})
}

/** A machine-laid run in the coming week, so the close has a change to make. */
async function createRun(userId: string, scheduledAt: Date, title: string) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title,
			discipline: 'run',
			intent: 'endurance',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 3600,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
			source: 'generated',
		},
	})
}

/** Shortens every adjustable session of the coming week, with a reason. */
const shorten: ProposalAuthor = (facts) => ({
	outcome: 'proposed',
	reason: 'Test author.',
	proposals: facts.adjustableSessions.map((session) => ({
		payload: { kind: 'scale' as const, factor: 0.8 },
		targetSessionId: session.id,
		targetWeekKey: facts.targetWeekKey,
		reason: 'Økta er gjort ca. 20 % kortere.',
	})),
})

/**
 * A plan toward a race from 31 December, `weeks` long, whose pattern lays a
 * Wednesday run — or no pattern at all.
 */
async function givePlan(
	userId: string,
	{ weeks, withPattern = true }: { weeks: number; withPattern?: boolean },
) {
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Vårløpet',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-03-10T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		userId,
		{
			eventId: event.id,
			startWeekKey: '2029-12-31',
			structure: {
				phases: [{ name: 'Base', weeks, rhythm: 'none' as const }],
			},
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	if (!withPattern) return
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: { tracks: { select: { id: true } } },
	})
	const added = await addWeekPattern(userId, {
		outlineId: created.outlineId,
		name: 'Vanlig uke',
	})
	if (!added.ok) throw new Error(`pattern setup failed: ${added.reason}`)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	const day = await addWeekPatternDay(userId, {
		patternId: pattern.id,
		kind: 'share',
		trackId: outline.tracks[0]!.id,
		weekday: 2, // Wednesday
		weight: 1,
	})
	if (!day.ok) throw new Error(`day setup failed: ${day.reason}`)
}

test('the notice stays on I dag while it has not been seen, even after its week begins', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)

	const tuesday = await readAutopilotNotice(user.id, { now: TUESDAY_0800 })

	expect(tuesday).toMatchObject({ closedWeekKey: CLOSED, seen: false })
})

test('the notice stays on I dag once seen, until its week has begun', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)

	expect(await markAutopilotNoticeSeen(user.id, CLOSED, SUNDAY_2001)).toEqual({
		ok: true,
	})

	expect(
		await readAutopilotNotice(user.id, { now: SUNDAY_2200 }),
	).toMatchObject({ closedWeekKey: CLOSED, seen: true })
})

test('seen and begun, the notice leaves I dag — never while Angre still stands', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)
	await markAutopilotNoticeSeen(user.id, CLOSED, SUNDAY_2200)

	// Monday, nothing trained yet: the week has not begun (ADR 0100 §4), and
	// the change can still be undone, so the notice stays.
	expect(
		await readAutopilotNotice(user.id, { now: MONDAY_0800 }),
	).toMatchObject({ undoable: 1 })
	expect(await readAutopilotNotice(user.id, { now: TUESDAY_0800 })).toBeNull()
})

test('a session trained on Monday begins the week, and a seen notice leaves the day after it was seen', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)
	const monday = await createRun(user.id, oslo('2030-01-14', '07:00'), 'Morgen')
	await prisma.workoutSession.update({
		where: { id: monday.id },
		data: { status: 'completed' },
	})
	await markAutopilotNoticeSeen(user.id, CLOSED, SUNDAY_2200)

	expect(await readAutopilotNotice(user.id, { now: MONDAY_0800 })).toBeNull()
})

test('first seen on a begun week, it stays that day and leaves the next', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)
	await markAutopilotNoticeSeen(user.id, CLOSED, TUESDAY_0800)
	// A second sighting later never moves the first.
	await markAutopilotNoticeSeen(user.id, CLOSED, oslo('2030-01-16', '08:00'))

	expect(
		await readAutopilotNotice(user.id, { now: oslo('2030-01-15', '21:00') }),
	).toMatchObject({ closedWeekKey: CLOSED })
	expect(
		await readAutopilotNotice(user.id, { now: oslo('2030-01-16', '08:00') }),
	).toBeNull()
})

test('from its Monday the notice says Denne uka, and once begun it no longer offers Gjør uka lettere', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)

	expect(
		await readAutopilotNotice(user.id, { now: SUNDAY_2200 }),
	).toMatchObject({
		heading: 'Neste uke er lagt ut',
		begun: false,
		showEase: true,
	})
	expect(
		await readAutopilotNotice(user.id, { now: MONDAY_0800 }),
	).toMatchObject({
		heading: 'Denne uka er lagt ut',
		begun: false,
		showEase: true,
	})
	expect(
		await readAutopilotNotice(user.id, { now: TUESDAY_0800 }),
	).toMatchObject({
		heading: 'Denne uka er lagt ut',
		begun: true,
		showEase: false,
	})
})

test('another athlete’s notice, or a week with none, is not marked seen', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	await createRun(owner.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(owner.id, SUNDAY_2001, shorten)

	expect(
		await markAutopilotNoticeSeen(stranger.id, CLOSED, SUNDAY_2200),
	).toEqual({ ok: false })
	expect(
		await markAutopilotNoticeSeen(owner.id, '2029-12-31', SUNDAY_2200),
	).toEqual({ ok: false })
	expect(
		await readAutopilotNotice(owner.id, { now: SUNDAY_2200 }),
	).toMatchObject({ seen: false })
})

test('every past notice stays in Se hele sesongen at its week, with its lines and reasons', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)
	await markAutopilotNoticeSeen(user.id, CLOSED, SUNDAY_2200)
	// The next week closes too.
	await createRun(user.id, oslo('2030-01-23', '07:00'), 'Intervaller')
	const nextClose = oslo('2030-01-20', '20:01')
	await runWeekChangeForUser(user.id, nextClose, shorten)

	const later = oslo('2030-01-29', '08:00')
	// Gone from I dag: seen, and its week long begun.
	expect(await readAutopilotNotice(user.id, { now: later })).toBeNull()

	const history = await readAutopilotHistory(user.id, { now: later })
	expect(
		history.map((notice) => ({
			week: notice.comingWeekKey,
			lines: notice.lines.map(({ subject, text }) => ({ subject, text })),
		})),
	).toEqual([
		{
			week: '2030-01-21',
			lines: [
				{
					subject: '«Intervaller» · onsdag',
					text: 'Økta er gjort ca. 20 % kortere.',
				},
			],
		},
		{
			week: '2030-01-14',
			lines: [
				{
					subject: '«Terskel» · onsdag',
					text: 'Økta er gjort ca. 20 % kortere.',
				},
			],
		},
	])
})

test('a week closed under Spør meg først has no place in the history', async () => {
	const user = await createAthlete()
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { autopilot: false },
	})
	await createRun(user.id, oslo('2030-01-16', '07:00'), 'Terskel')
	await runWeekChangeForUser(user.id, SUNDAY_2001, shorten)

	expect(await readAutopilotHistory(user.id, { now: SUNDAY_2200 })).toEqual([])
})

test('a week past the plan’s end is said in the notice, with why', async () => {
	const user = await createAthlete()
	// Two weeks from 31 December: the horizon week of the 21st is past its end.
	await givePlan(user.id, { weeks: 2 })

	await runWeekChangeForUser(user.id, SUNDAY_2001)

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2200 })
	expect(notice?.unlaidLine).toBe(
		'Uka fra mandag 21. januar ble ikke lagt ut: den ligger etter slutten av planen.',
	)
	// And it stays said in the history.
	const [past] = await readAutopilotHistory(user.id, { now: SUNDAY_2200 })
	expect(past?.unlaidLine).toBe(notice?.unlaidLine)
})

test('a plan with no week pattern is said in the notice', async () => {
	const user = await createAthlete()
	await givePlan(user.id, { weeks: 9, withPattern: false })

	await runWeekChangeForUser(user.id, SUNDAY_2001)

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2200 })
	expect(notice?.unlaidLine).toBe(
		'Uka fra mandag 21. januar ble ikke lagt ut: planen har ikke noe ukemønster å legge den etter.',
	)
})

test('a week that was laid says nothing about laying', async () => {
	const user = await createAthlete()
	await givePlan(user.id, { weeks: 9 })

	const run = await runWeekChangeForUser(user.id, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: '2030-01-21', sessions: 1 })
	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2200 })
	expect(notice).not.toBeNull()
	expect(notice!.unlaidLine).toBeNull()
})

test('a fill that fails is said in the notice, and a retry that lays the week takes it back', async () => {
	const user = await createAthlete()
	await givePlan(user.id, { weeks: 9 })
	const failing = async () => {
		throw new Error('the stamp fell over')
	}

	await expect(
		runWeekChangeForUser(user.id, SUNDAY_2001, undefined, {
			layWeek: failing,
		}),
	).rejects.toThrow('the stamp fell over')

	// The apply step still ran, so the notice is there to say it.
	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2200 })
	expect(notice?.unlaidLine).toBe(
		'Uka fra mandag 21. januar ble ikke lagt ut fordi noe gikk galt. Appen prøver igjen snart.',
	)

	const retry = await runWeekChangeForUser(user.id, SUNDAY_2200)

	expect(retry.horizon).toEqual({ weekKey: '2030-01-21', sessions: 1 })
	expect(
		(await readAutopilotNotice(user.id, { now: SUNDAY_2200 }))?.unlaidLine,
	).toBeNull()
})

test('an open-ended plan’s next round lays the week the fill found past its end, so nothing is said', async () => {
	const user = await createAthlete()
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: '2029-12-31',
			structure: {
				phases: [{ name: 'Blokk 1', weeks: 2, rhythm: 'none' as const }],
			},
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: { tracks: { select: { id: true } } },
	})
	await addWeekPattern(user.id, { outlineId: created.outlineId, name: 'Uke' })
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	await addWeekPatternDay(user.id, {
		patternId: pattern.id,
		kind: 'share',
		trackId: outline.tracks[0]!.id,
		weekday: 2,
		weight: 1,
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001)

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2200 })
	expect(notice).not.toBeNull()
	expect(notice!.unlaidLine).toBeNull()
	expect(
		await prisma.workoutSession.count({
			where: {
				userId: user.id,
				scheduledAt: {
					gte: oslo('2030-01-21', '00:00'),
					lt: oslo('2030-01-28', '00:00'),
				},
			},
		}),
	).toBe(1)
})
