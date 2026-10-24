/**
 * #442: the Week Pattern picker is bounded. It offers the athlete's recently
 * hand-written Workouts, one per title, capped per discipline, for the plan's
 * disciplines only — never every session they ever planned.
 */
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import {
	PICKER_PER_DISCIPLINE,
	getAuthoredWorkouts,
	pickRecentWorkouts,
} from './training.server.ts'

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

let clock = Date.UTC(2030, 0, 1)

async function session(
	userId: string,
	title: string,
	discipline: string,
	source = 'authored',
) {
	clock += 60_000
	const workout = await prisma.workout.create({
		select: { id: true },
		data: { title, discipline, intent: 'endurance', ownerId: userId },
	})
	await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(clock),
			createdAt: new Date(clock),
			source,
		},
	})
	return workout.id
}

test('a long history offers at most the cap per discipline, newest first, one per title', async () => {
	const { id } = await createAthlete()
	for (let index = 0; index < PICKER_PER_DISCIPLINE + 8; index++) {
		await session(id, `Run ${index}`, 'run')
	}
	// The same title written again is one choice, and the newest copy is offered.
	const newest = await session(id, 'Run 3', 'run')

	const offered = await getAuthoredWorkouts(id, ['run'])

	expect(offered).toHaveLength(PICKER_PER_DISCIPLINE)
	expect(offered[0]).toEqual({ id: newest, title: 'Run 3', discipline: 'run' })
	expect(new Set(offered.map((workout) => workout.title)).size).toBe(
		offered.length,
	)
})

test('stamped and recorded sessions, other disciplines and other athletes are not offered', async () => {
	const { id } = await createAthlete()
	const { id: stranger } = await createAthlete()
	const mine = await session(id, 'Terskel', 'run')
	await session(id, 'Rolig økt · Løping', 'run', 'generated')
	await session(id, 'Morning ride', 'bike')
	await session(id, 'Import', 'run', 'recorded')
	await session(stranger, 'Not yours', 'run')

	expect(await getAuthoredWorkouts(id, ['run'])).toEqual([
		{ id: mine, title: 'Terskel', discipline: 'run' },
	])
	expect(await getAuthoredWorkouts(id, [])).toEqual([])
})

test('the pure policy caps each discipline separately', () => {
	const rows = ['run', 'bike', 'run', 'bike', 'run'].map((discipline, i) => ({
		id: `w${i}`,
		title: `T${i}`,
		discipline,
	}))
	expect(pickRecentWorkouts(rows, 1).map((row) => row.id)).toEqual([
		'w0',
		'w1',
	])
	// Titles are compared case- and space-insensitively within a discipline only.
	expect(
		pickRecentWorkouts([
			{ id: 'a', title: 'Langtur', discipline: 'run' },
			{ id: 'b', title: ' langtur ', discipline: 'run' },
			{ id: 'c', title: 'Langtur', discipline: 'bike' },
		]).map((row) => row.id),
	).toEqual(['a', 'c'])
})
