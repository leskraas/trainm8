import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	getActivePlan,
	getSessionLedger,
	getUpcomingSessions,
} from './training.server.ts'

async function createUserWithPassword() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

async function createWorkoutForUser(userId: string) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '10 min easy',
									discipline: 'run',
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
		},
	})
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

test('returns sessions scheduled in the future', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(2),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(1)
	expect(sessions[0]?.workout?.id).toBe(workout.id)
})

test('excludes sessions in the past', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(1),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(0)
})

test('excludes sessions belonging to another user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	const workout = await createWorkoutForUser(userA.id)
	await prisma.workoutSession.create({
		data: {
			userId: userA.id,
			workoutId: workout.id,
			scheduledAt: inDays(3),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(userB.id)
	expect(sessions).toHaveLength(0)
})

test('returns sessions ordered soonest-first', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(5),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(1),
				status: 'scheduled',
			},
		],
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions[0]!.scheduledAt.getTime()).toBeLessThan(
		sessions[1]!.scheduledAt.getTime(),
	)
})

test('includes sessions at exactly 14 days from now', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(14),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(1)
})

test('excludes sessions beyond the 14-day horizon', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: inDays(15),
			status: 'scheduled',
		},
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(0)
})

test('includes sessions of all statuses in the upcoming window', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(1),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(2),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(3),
				status: 'skipped',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(4),
				status: 'missed',
			},
		],
	})
	const sessions = await getUpcomingSessions(user.id)
	expect(sessions).toHaveLength(4)
	expect(sessions.map((s) => s.status)).toEqual([
		'scheduled',
		'completed',
		'skipped',
		'missed',
	])
})

test('getSessionLedger returns past and future sessions ordered by date', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(2),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(3),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(1),
				status: 'missed',
			},
		],
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger.map((s) => s.status)).toEqual([
		'completed',
		'missed',
		'scheduled',
	])
})

test('getSessionLedger is bounded by the trailing window and planned horizon', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	await prisma.workoutSession.createMany({
		data: [
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(60),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: daysAgo(10),
				status: 'completed',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(5),
				status: 'scheduled',
			},
			{
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: inDays(20),
				status: 'scheduled',
			},
		],
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger).toHaveLength(2)
})

test('getSessionLedger excludes sessions belonging to another user', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	const workout = await createWorkoutForUser(userA.id)
	await prisma.workoutSession.create({
		data: {
			userId: userA.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(2),
			status: 'completed',
		},
	})
	const ledger = await getSessionLedger(userB.id)
	expect(ledger).toHaveLength(0)
})

async function createEventForUser(
	userId: string,
	data: {
		startDate: Date
		planOutline?: string | null
		status?: string
		name?: string
	},
) {
	return prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: data.name ?? faker.lorem.words(2),
			kind: 'race',
			priority: 'A',
			startDate: data.startDate,
			disciplines: '["run"]',
			status: data.status ?? 'planned',
			planOutline: data.planOutline ?? null,
		},
	})
}

const OUTLINE = JSON.stringify({
	phases: [
		{ name: 'Base', weeks: 4 },
		{ name: 'Build', weeks: 4 },
	],
})

test('getActivePlan returns the upcoming Target Event carrying a Plan Outline', async () => {
	const user = await createUserWithPassword()
	const event = await createEventForUser(user.id, {
		startDate: inDays(30),
		planOutline: OUTLINE,
		name: 'Spring Half',
	})
	const plan = await getActivePlan(user.id)
	expect(plan?.eventId).toBe(event.id)
	expect(plan?.eventName).toBe('Spring Half')
	// The arc-only OUTLINE omits the weekly-load pattern ⇒ null, not a guess.
	expect(plan?.phases).toEqual([
		{ name: 'Base', weeks: 4, weeklyLoadHours: null },
		{ name: 'Build', weeks: 4, weeklyLoadHours: null },
	])
})

test('getActivePlan carries each phase’s weekly-load pattern when the Outline has one', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		planOutline: JSON.stringify({
			phases: [
				{ name: 'Base', weeks: 4, focus: 'Aerobic base', weeklyLoadHours: 6 },
				{ name: 'Build', weeks: 4, focus: 'Threshold', weeklyLoadHours: 9 },
			],
		}),
	})
	const plan = await getActivePlan(user.id)
	expect(plan?.phases).toEqual([
		{ name: 'Base', weeks: 4, weeklyLoadHours: 6 },
		{ name: 'Build', weeks: 4, weeklyLoadHours: 9 },
	])
})

test('getActivePlan is null when an upcoming Event has no Plan Outline (marker, not plan)', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		planOutline: null,
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

test('getActivePlan is null when the only outlined Target Event is in the past', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: daysAgo(10),
		planOutline: OUTLINE,
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

test('getActivePlan is null for another user’s outlined Target Event', async () => {
	const userA = await createUserWithPassword()
	const userB = await createUserWithPassword()
	await createEventForUser(userA.id, {
		startDate: inDays(30),
		planOutline: OUTLINE,
	})
	expect(await getActivePlan(userB.id)).toBeNull()
})

test('getActivePlan picks the nearest outlined Target Event, skipping outline-less markers', async () => {
	const user = await createUserWithPassword()
	// A nearer Event without an Outline is a marker, not a plan — it must not win.
	await createEventForUser(user.id, {
		startDate: inDays(7),
		planOutline: null,
		name: 'Parkrun (marker)',
	})
	const nearestPlan = await createEventForUser(user.id, {
		startDate: inDays(40),
		planOutline: OUTLINE,
		name: 'Goal Race',
	})
	await createEventForUser(user.id, {
		startDate: inDays(90),
		planOutline: OUTLINE,
		name: 'Later Race',
	})
	const plan = await getActivePlan(user.id)
	expect(plan?.eventId).toBe(nearestPlan.id)
	expect(plan?.eventName).toBe('Goal Race')
})

test('getActivePlan is null when the outlined Target Event is cancelled', async () => {
	const user = await createUserWithPassword()
	await createEventForUser(user.id, {
		startDate: inDays(30),
		planOutline: OUTLINE,
		status: 'cancelled',
	})
	expect(await getActivePlan(user.id)).toBeNull()
})

test('getSessionLedger carries load and RPE for completed sessions', async () => {
	const user = await createUserWithPassword()
	const workout = await createWorkoutForUser(user.id)
	const completed = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: daysAgo(1),
			status: 'completed',
			tssValue: 72,
		},
		select: { id: true },
	})
	await prisma.sessionLog.create({
		data: { sessionId: completed.id, content: 'solid', rpe: 8 },
	})
	const ledger = await getSessionLedger(user.id)
	expect(ledger).toHaveLength(1)
	expect(ledger[0]?.tssValue).toBe(72)
	expect(ledger[0]?.sessionLog?.rpe).toBe(8)
})
