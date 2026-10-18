/**
 * _Bytt økt_'s picker (#579): Bibliotek read as a list to pick today's
 * session from — the Catalogue, the programs' days and the exercises.
 */
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './session-swap.tsx'

const ROUTE_PATH = '/resources/session-swap'

async function signedIn() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

async function pick(cookie: string, search: Record<string, string>) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	for (const [key, value] of Object.entries(search)) {
		url.searchParams.set(key, value)
	}
	return loader({
		request: new Request(url.toString(), { headers: { cookie } }),
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})
}

const unique = () => Math.random().toString(36).slice(2, 10)

async function stock(title: string, discipline = 'run') {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline,
			intent: 'endurance',
			archetype: 'easy',
			authorship: 'system',
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: {
							orderIndex: 0,
							kind: 'cardio',
							discipline,
							durationSec: 40 * 60,
						},
					},
				},
			},
		},
		select: { id: true },
	})
	await prisma.catalogueEntry.create({
		data: {
			workoutId: workout.id,
			workoutAuthorship: 'system',
			archetype: 'easy',
		},
	})
	return workout.id
}

test('the Catalogue answers a search with the sessions it matches, each with its minutes', async () => {
	const { cookie } = await signedIn()
	const word = `Fjordtur${unique()}`
	const id = await stock(`${word} rolig`)

	const reply = await pick(cookie, { from: 'catalogue', q: word })

	expect(reply.from).toBe('catalogue')
	expect(reply.rows).toEqual([
		expect.objectContaining({
			id,
			title: `${word} rolig`,
			figures: expect.arrayContaining(['40 min']),
		}),
	])
	expect(reply.total).toBe(1)
})

test('the Catalogue lists today’s sport first', async () => {
	const { cookie } = await signedIn()
	const word = `Sportfirst${unique()}`
	const run = await stock(`${word} A løp`, 'run')
	const ride = await stock(`${word} B sykkel`, 'bike')

	const reply = await pick(cookie, {
		from: 'catalogue',
		q: word,
		discipline: 'bike',
	})

	expect(reply.rows.map((row) => row.id)).toEqual([ride, run])
})

test('the programs are listed day by day, and a search finds a program by name', async () => {
	const { cookie } = await signedIn()
	const name = `Program${unique()}`
	const workout = await prisma.workout.create({
		data: {
			title: `${name} · Workout A`,
			discipline: 'strength',
			intent: 'strength-max',
			authorship: 'system',
		},
		select: { id: true },
	})
	const program = await prisma.strengthProgram.create({
		data: {
			id: `prog_${unique()}`,
			key: unique(),
			variantId: 'basic',
			name,
			cursorKind: 'alternatingDays',
			initialCursor: JSON.stringify({
				kind: 'alternatingDays',
				nextDayId: 'A',
			}),
			days: { create: { dayId: 'A', orderIndex: 0, workoutId: workout.id } },
		},
		select: { days: { select: { id: true } } },
	})

	const reply = await pick(cookie, { from: 'program', q: name.toLowerCase() })

	expect(reply.rows).toEqual([
		expect.objectContaining({
			id: program.days[0]!.id,
			title: `${name} · Workout A`,
		}),
	])
})

test('the exercises answer a search from the bank, and an empty search lists the athlete’s own lifts', async () => {
	const { userId, cookie } = await signedIn()
	const name = `Kassehopp${unique()}`
	const lift = await prisma.exercise.create({
		data: { name, primaryMuscle: 'quads', authorship: 'system' },
		select: { id: true },
	})

	const found = await pick(cookie, { from: 'exercise', q: name })
	expect(found.rows).toEqual([
		expect.objectContaining({ id: lift.id, title: name }),
	])

	expect((await pick(cookie, { from: 'exercise' })).rows).toEqual([])
	await prisma.workout.create({
		data: {
			title: name,
			discipline: 'strength',
			intent: 'strength-max',
			ownerId: userId,
			blocks: {
				create: {
					orderIndex: 0,
					repeatCount: 1,
					steps: {
						create: { orderIndex: 0, kind: 'strength', exerciseId: lift.id },
					},
				},
			},
			sessions: {
				create: {
					userId,
					scheduledAt: new Date('2030-01-01T17:00:00Z'),
					status: 'completed',
					source: 'authored',
				},
			},
		},
	})
	expect((await pick(cookie, { from: 'exercise' })).rows).toEqual([
		expect.objectContaining({ id: lift.id, title: name }),
	])
})
