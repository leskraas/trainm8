// Copying a week onto another week (#415). The two facts worth a real database:
// every copied session gets its **own** Workout row, and editing one week afterwards
// leaves the other exactly as it was.
import { expect, test } from 'vitest'
import { localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { createPlanOutline } from './authoring.server.ts'
import { copyWeek, type CopyWeekResult } from './copy-week.server.ts'

const START_WEEK_KEY = '2030-01-07' // a Monday
const NOW = new Date('2030-01-09T12:00:00Z')
const OSLO = 'Europe/Oslo' // a non-UTC athlete on purpose

const WEEK_1 = '2030-01-07'
const WEEK_2 = '2030-01-14'
const WEEK_3 = '2030-01-21'

type Plan = {
	athleteId: string
	eventId: string
	outlineId: string
}

async function setupPlan({ timezone = OSLO } = {}): Promise<Plan> {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone } },
		},
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})

	const created = await createPlanOutline(
		user.id,
		{
			eventId: event.id,
			startWeekKey: START_WEEK_KEY,
			structure: { phases: [{ name: 'Base', weeks: 4, rhythm: 'none' }] },
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 50 },
				{ discipline: 'strength', currency: 'sets', anchorValue: 12 },
			],
		},
		NOW,
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)

	return { athleteId: user.id, eventId: event.id, outlineId: created.outlineId }
}

/** A planned run session in the athlete's own week, at their own local time. */
async function addRunSession(
	plan: Plan,
	{
		weekKey,
		weekday,
		time = '07:00',
		km = 10,
		title = `${km} km`,
		status = 'scheduled',
		eventId = plan.eventId as string | null,
	}: {
		weekKey: string
		weekday: number
		time?: string
		km?: number
		title?: string
		status?: string
		eventId?: string | null
	},
) {
	const day = new Date(`${weekKey}T00:00:00.000Z`)
	day.setUTCDate(day.getUTCDate() + weekday)
	const dateStr = day.toISOString().slice(0, 10)
	const timezone = await prisma.athleteProfile
		.findUniqueOrThrow({
			where: { userId: plan.athleteId },
			select: { timezone: true },
		})
		.then((profile) => profile.timezone)

	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: plan.athleteId,
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
									distanceM: Math.round(km * 1000),
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true, workoutId: true },
		data: {
			userId: plan.athleteId,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(dateStr, time, timezone),
			status,
			source: 'authored',
			targetEventId: eventId,
		},
	})
}

/** A strength session — sets, an Exercise reference, and no cardio anywhere. */
async function addStrengthSession(
	plan: Plan,
	{ weekKey, weekday }: { weekKey: string; weekday: number },
) {
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: { name: 'Back squat', primaryMuscle: 'quads', isCompound: true },
	})
	const day = new Date(`${weekKey}T00:00:00.000Z`)
	day.setUTCDate(day.getUTCDate() + weekday)
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: plan.athleteId,
			title: 'Squat day',
			discipline: 'strength',
			intent: 'strength-max',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									restBetweenSetsSec: 180,
									sets: {
										create: [
											{ orderIndex: 0, kind: 'reps', reps: 5, pct1RM: 85 },
											{ orderIndex: 1, kind: 'reps', reps: 5, pct1RM: 85 },
										],
									},
								},
							],
						},
					},
				],
			},
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true, workoutId: true },
		data: {
			userId: plan.athleteId,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(day.toISOString().slice(0, 10), '17:30', OSLO),
			status: 'scheduled',
			source: 'authored',
			targetEventId: plan.eventId,
		},
	})
	return { ...session, exerciseId: exercise.id }
}

async function sessionsIn(plan: Plan, weekKey: string) {
	const start = new Date(`${weekKey}T00:00:00.000Z`)
	start.setUTCDate(start.getUTCDate() - 1)
	const end = new Date(`${weekKey}T00:00:00.000Z`)
	end.setUTCDate(end.getUTCDate() + 8)
	return prisma.workoutSession.findMany({
		where: {
			userId: plan.athleteId,
			scheduledAt: { gte: start, lte: end },
		},
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			source: true,
			targetEventId: true,
			workoutId: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					intent: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									kind: true,
									distanceM: true,
									exerciseId: true,
									restBetweenSetsSec: true,
									sets: {
										orderBy: { orderIndex: 'asc' },
										select: { kind: true, reps: true, pct1RM: true },
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

function ok(result: CopyWeekResult) {
	if (!result.ok) throw new Error(`copy refused: ${result.reason}`)
	return result.report
}

test('a week with sessions is copied onto another week in one action', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 1, km: 8 })
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 5, km: 20 })

	const report = ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_3,
			replace: false,
		}),
	)

	expect(report).toMatchObject({
		sourceWeekInPlan: 1,
		targetWeekInPlan: 3,
		sessions: 2,
		replaced: 0,
		skipped: [],
	})
	expect(await sessionsIn(plan, WEEK_3)).toHaveLength(2)
})

test('every copied session gets its own fresh Workout', async () => {
	const plan = await setupPlan()
	const source = await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	)

	const copied = (await sessionsIn(plan, WEEK_2))[0]!
	expect(copied.workoutId).not.toBe(source.workoutId)
	expect(copied.workoutId).not.toBeNull()
	// The content is the same; only the row is new.
	expect(copied.workout?.blocks[0]!.steps[0]!.distanceM).toBe(10000)
})

test('editing a session in either week leaves the other untouched', async () => {
	const plan = await setupPlan()
	const source = await addRunSession(plan, {
		weekKey: WEEK_1,
		weekday: 2,
		km: 10,
	})

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	)
	const copied = (await sessionsIn(plan, WEEK_2))[0]!

	// Rewrite the copy. The source must not move a metre.
	await prisma.workoutStep.updateMany({
		where: { block: { workoutId: copied.workoutId! } },
		data: { distanceM: 25000 },
	})
	await prisma.workout.update({
		where: { id: copied.workoutId! },
		data: { title: 'Rewritten' },
	})

	const [before] = await sessionsIn(plan, WEEK_1)
	expect(before!.id).toBe(source.id)
	expect(before!.workout?.title).toBe('10 km')
	expect(before!.workout?.blocks[0]!.steps[0]!.distanceM).toBe(10000)

	// And the other direction: editing the source leaves the copy alone.
	await prisma.workoutStep.updateMany({
		where: { block: { workoutId: source.workoutId! } },
		data: { distanceM: 1000 },
	})
	const [after] = await sessionsIn(plan, WEEK_2)
	expect(after!.workout?.blocks[0]!.steps[0]!.distanceM).toBe(25000)
})

test('sessions land on the matching weekdays at the same local times', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 1, time: '06:15' })
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 6, time: '18:45' })

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_3,
			replace: false,
		}),
	)

	const copied = await sessionsIn(plan, WEEK_3)
	expect(copied.map((session) => session.scheduledAt.toISOString())).toEqual([
		localTimeUTC('2030-01-22', '06:15', OSLO).toISOString(),
		localTimeUTC('2030-01-27', '18:45', OSLO).toISOString(),
	])
})

test('a copy across a DST boundary keeps the local time, not the instant', async () => {
	// Oslo springs forward on 2030-03-31. A plan long enough to reach both sides of
	// it, so the copy crosses the boundary for real.
	const plan = await setupPlanFrom('2030-03-18', 4)
	await addRunSession(plan, {
		weekKey: '2030-03-25',
		weekday: 2,
		time: '07:00',
	})

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: '2030-03-25',
			targetWeekKey: '2030-04-01',
			replace: false,
		}),
	)

	const [copied] = await sessionsIn(plan, '2030-04-01')
	// 07:00 Oslo is 06:00Z in March and 05:00Z in April — the athlete's morning is
	// what travelled, and the UTC instant deliberately did not.
	expect(copied!.scheduledAt.toISOString()).toBe('2030-04-03T05:00:00.000Z')
})

test('copied sessions are anchored to the same Event and carry the authored source', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, {
		weekKey: WEEK_1,
		weekday: 3,
		status: 'completed',
	})

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	)

	const [copied] = await sessionsIn(plan, WEEK_2)
	expect(copied).toMatchObject({
		targetEventId: plan.eventId,
		source: 'authored',
		// A copy is a plan, never a record of what the source did.
		status: 'scheduled',
	})
})

test('a session is copied as authored, never scaled to the target week', async () => {
	// Week 1 and week 4 of a ramped plan derive different targets; the copy carries
	// the authored prescription regardless (ADR 0040 §1).
	const plan = await setupPlan()
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId: plan.outlineId, discipline: 'run' },
		select: { id: true, segments: { select: { id: true } } },
	})
	await prisma.trainingTrackSegment.update({
		where: { id: track.segments[0]!.id },
		data: { ramp: 0.1 },
	})
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 5, km: 20 })

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: '2030-01-28',
			replace: false,
		}),
	)

	const [copied] = await sessionsIn(plan, '2030-01-28')
	expect(copied!.workout?.blocks[0]!.steps[0]!.distanceM).toBe(20000)
	expect(copied!.workout?.title).toBe('20 km')
})

test('a strength session copies like any other, sets and exercise included', async () => {
	const plan = await setupPlan()
	const source = await addStrengthSession(plan, { weekKey: WEEK_1, weekday: 3 })

	ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	)

	const [copied] = await sessionsIn(plan, WEEK_2)
	expect(copied!.workoutId).not.toBe(source.workoutId)
	const step = copied!.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('strength')
	expect(step.restBetweenSetsSec).toBe(180)
	// The Exercise is a catalog entry: shared by reference, never duplicated.
	expect(step.exerciseId).toBe(source.exerciseId)
	expect(step.sets).toEqual([
		{ kind: 'reps', reps: 5, pct1RM: 85 },
		{ kind: 'reps', reps: 5, pct1RM: 85 },
	])
})

test('copying onto a week that already has sessions asks first and writes nothing', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })
	await addRunSession(plan, { weekKey: WEEK_2, weekday: 4, km: 5 })

	const asked = await copyWeek(plan.athleteId, {
		outlineId: plan.outlineId,
		sourceWeekKey: WEEK_1,
		targetWeekKey: WEEK_2,
		replace: false,
	})

	expect(asked).toEqual({
		ok: false,
		reason: 'target-week-filled',
		conflict: {
			weekKey: WEEK_2,
			weekInPlan: 2,
			replacing: 1,
			keeping: 0,
		},
	})
	// Untouched: the week still holds its own session and nothing was copied.
	const week2 = await sessionsIn(plan, WEEK_2)
	expect(week2).toHaveLength(1)
	expect(week2[0]!.workout?.title).toBe('5 km')
})

test('a confirmed copy replaces the target week’s scheduled sessions', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2, km: 12 })
	const doomed = await addRunSession(plan, {
		weekKey: WEEK_2,
		weekday: 4,
		km: 5,
	})

	const report = ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: true,
		}),
	)

	expect(report).toMatchObject({ sessions: 1, replaced: 1 })
	const week2 = await sessionsIn(plan, WEEK_2)
	expect(week2).toHaveLength(1)
	expect(week2[0]!.id).not.toBe(doomed.id)
	expect(week2[0]!.workout?.title).toBe('12 km')
	// The replaced session's Workout went with it rather than being orphaned.
	expect(await prisma.workout.count({ where: { id: doomed.workoutId! } })).toBe(
		0,
	)
})

test('a trained session in the target week is kept, whatever the athlete confirms', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2, km: 12 })
	const trained = await addRunSession(plan, {
		weekKey: WEEK_2,
		weekday: 4,
		km: 5,
		status: 'completed',
	})

	const asked = await copyWeek(plan.athleteId, {
		outlineId: plan.outlineId,
		sourceWeekKey: WEEK_1,
		targetWeekKey: WEEK_2,
		replace: false,
	})
	expect(asked).toMatchObject({
		reason: 'target-week-filled',
		conflict: { replacing: 0, keeping: 1 },
	})

	const report = ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: true,
		}),
	)
	expect(report).toMatchObject({ sessions: 1, replaced: 0 })
	const ids = (await sessionsIn(plan, WEEK_2)).map((session) => session.id)
	expect(ids).toContain(trained.id)
	expect(ids).toHaveLength(2)
})

test('copying an empty week is refused with a reason, not silently done', async () => {
	const plan = await setupPlan()

	expect(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'source-week-empty' })
	expect(await sessionsIn(plan, WEEK_2)).toHaveLength(0)
})

test('a week holding only structureless sessions is refused, not copied as blanks', async () => {
	const plan = await setupPlan()
	await prisma.workoutSession.create({
		data: {
			userId: plan.athleteId,
			scheduledAt: localTimeUTC('2030-01-09', '07:00', OSLO),
			status: 'completed',
			source: 'recorded',
			targetEventId: plan.eventId,
		},
	})

	expect(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'nothing-to-copy' })
})

test('a structureless session beside a real one is reported, not faked', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })
	const bare = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: plan.athleteId,
			scheduledAt: localTimeUTC('2030-01-11', '07:00', OSLO),
			status: 'completed',
			source: 'recorded',
			targetEventId: plan.eventId,
		},
	})

	const report = ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: false,
		}),
	)
	expect(report.sessions).toBe(1)
	expect(report.skipped).toEqual([
		{ sessionId: bare.id, reason: 'no-prescription' },
	])
})

test('a session outside this plan is neither copied nor overwritten', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2, km: 12 })
	// Same weeks, no Event: the athlete's own session, none of the plan's business.
	const loose = await addRunSession(plan, {
		weekKey: WEEK_1,
		weekday: 3,
		km: 3,
		eventId: null,
	})
	const looseTarget = await addRunSession(plan, {
		weekKey: WEEK_2,
		weekday: 3,
		km: 3,
		eventId: null,
	})

	const report = ok(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: true,
		}),
	)

	expect(report).toMatchObject({ sessions: 1, replaced: 0 })
	expect(
		await prisma.workoutSession.count({
			where: { id: { in: [loose.id, looseTarget.id] } },
		}),
	).toBe(2)
})

test('copying a week onto itself is refused rather than run', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })

	expect(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_1,
			replace: true,
		}),
	).toEqual({ ok: false, reason: 'same-week' })
	expect(await sessionsIn(plan, WEEK_1)).toHaveLength(1)
})

test('a week outside the plan is refused rather than snapped to the nearest one', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })

	expect(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			// Week 6 of a four-week plan.
			targetWeekKey: '2030-02-11',
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'week-outside-plan' })

	expect(
		await copyWeek(plan.athleteId, {
			outlineId: plan.outlineId,
			sourceWeekKey: WEEK_1,
			// A Wednesday, not a week key. `weekIndexOf` would round it to week 2.
			targetWeekKey: '2030-01-16',
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'week-outside-plan' })
})

test('another athlete’s plan reads as gone and writes nothing', async () => {
	const mine = await setupPlan()
	const theirs = await setupPlan()
	await addRunSession(theirs, { weekKey: WEEK_1, weekday: 2 })

	expect(
		await copyWeek(mine.athleteId, {
			outlineId: theirs.outlineId,
			sourceWeekKey: WEEK_1,
			targetWeekKey: WEEK_2,
			replace: true,
		}),
	).toEqual({ ok: false, reason: 'plan-gone' })
	expect(await sessionsIn(theirs, WEEK_2)).toHaveLength(0)
})

test('a copy is idempotent under a confirmed re-submit', async () => {
	const plan = await setupPlan()
	await addRunSession(plan, { weekKey: WEEK_1, weekday: 2 })

	const input = {
		outlineId: plan.outlineId,
		sourceWeekKey: WEEK_1,
		targetWeekKey: WEEK_2,
		replace: true,
	}
	ok(await copyWeek(plan.athleteId, input))
	ok(await copyWeek(plan.athleteId, input))

	expect(await sessionsIn(plan, WEEK_2)).toHaveLength(1)
})

/** A plan starting on `startWeekKey`, for the tests that need a particular date. */
async function setupPlanFrom(
	startWeekKey: string,
	weeks: number,
): Promise<Plan> {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone: OSLO } },
		},
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-06-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const created = await createPlanOutline(
		user.id,
		{
			eventId: event.id,
			startWeekKey,
			structure: { phases: [{ name: 'Base', weeks, rhythm: 'none' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 50 }],
		},
		new Date(`${startWeekKey}T12:00:00Z`),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	return { athleteId: user.id, eventId: event.id, outlineId: created.outlineId }
}
