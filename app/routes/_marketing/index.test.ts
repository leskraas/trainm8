import { faker } from '@faker-js/faker'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createSessionLog } from '#app/utils/session-log.server.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './index.tsx'

const ROUTE_PATH = '/'
const LOADER_ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
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
	return session
}

async function createWorkoutWithSession(
	userId: string,
	scheduledAt: Date,
	status = 'scheduled',
	discipline = 'run',
	title?: string,
) {
	return prisma.workout.create({
		data: {
			title: title ?? faker.lorem.words(3),
			discipline,
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
									notes: 'warm up',
									discipline: discipline,
									intensity: 'easy',
									orderIndex: 0,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: { userId, scheduledAt, status },
			},
		},
		select: { id: true, sessions: { select: { id: true } } },
	})
}

function makeRequest(cookieHeader?: string) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	return new Request(url.toString(), { method: 'GET', headers })
}

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000)

test('unauthenticated user receives marketing data', async () => {
	const request = makeRequest()
	const response = await loader({ request, ...LOADER_ARGS_BASE })
	const data = response as { isAuthenticated: false }
	expect(data.isAuthenticated).toBe(false)
})

test('authenticated user receives dashboard data with sessions', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(1))
	await createWorkoutWithSession(session.userId, inDays(2))

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		nextSession: { id: string } | null
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.isAuthenticated).toBe(true)
	expect(data.nextSession).not.toBeNull()
	expect(data.upcomingSessions.length).toBeGreaterThanOrEqual(1)
})

test('authenticated user with no sessions gets null nextSession and empty list', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		nextSession: null
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.isAuthenticated).toBe(true)
	expect(data.nextSession).toBeNull()
	expect(data.upcomingSessions).toHaveLength(0)
})

test('dashboard nextSession is the chronologically first session', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(
		session.userId,
		inDays(3),
		'scheduled',
		'run',
		'Later Run',
	)
	const w2 = await createWorkoutWithSession(
		session.userId,
		inDays(1),
		'scheduled',
		'bike',
		'Sooner Ride',
	)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		nextSession: { id: string; workout: { title: string } }
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.nextSession!.id).toBe(w2.sessions[0]!.id)
})

test('upcomingSessions contains all sessions after the first', async () => {
	const session = await setupUser()
	for (let i = 1; i <= 8; i++) {
		await createWorkoutWithSession(session.userId, inDays(i))
	}

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		nextSession: { id: string }
		upcomingSessions: Array<{ id: string }>
	}
	expect(data.nextSession).not.toBeNull()
	// All 7 remaining sessions are returned (no artificial cap)
	expect(data.upcomingSessions).toHaveLength(7)
})

test('dashboard includes recent session logs', async () => {
	const session = await setupUser()
	const workout = await createWorkoutWithSession(
		session.userId,
		inDays(-1),
		'completed',
	)
	await createSessionLog({
		sessionId: workout.sessions[0]!.id,
		content: 'Good session',
		rpe: 6,
	})

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		isAuthenticated: true
		recentLogs: Array<{
			id: string
			content: string
			rpe: number | null
			session: { workout: { title: string } }
		}>
	}
	expect(data.recentLogs).toHaveLength(1)
	expect(data.recentLogs[0]!.content).toBe('Good session')
	expect(data.recentLogs[0]!.rpe).toBe(6)
})

const utcDayKey = (n: number) =>
	new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

async function createLoadSnapshot(
	athleteId: string,
	date: string,
	tsb: number,
) {
	return prisma.loadSnapshot.create({
		data: {
			athleteId,
			date,
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 0,
			atl: 0,
			tsb,
			computedAt: new Date(),
		},
	})
}

test('coach card data: no load history is an untrustworthy cold-start', async () => {
	const session = await setupUser()
	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		current: { ctl: number; atl: number; tsb: number } | null
		tsbTrust: {
			trustworthy: boolean
			daysOfHistory: number
			requiredDays: number
		}
	}
	expect(data.current).toBeNull()
	expect(data.tsbTrust.trustworthy).toBe(false)
	expect(data.tsbTrust.daysOfHistory).toBe(0)
})

test('coach card data: 42+ days of history surfaces a trustworthy TSB', async () => {
	const session = await setupUser()
	await createLoadSnapshot(session.userId, utcDayKey(-50), -3)
	await createLoadSnapshot(session.userId, utcDayKey(0), 7)

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		current: { ctl: number; atl: number; tsb: number } | null
		tsbTrust: { trustworthy: boolean; daysOfHistory: number }
	}
	expect(data.tsbTrust.trustworthy).toBe(true)
	expect(data.tsbTrust.daysOfHistory).toBe(51)
	expect(data.current?.tsb).toBe(7)
})

test('dashboard ledger covers a mix of completed, missed, and planned sessions', async () => {
	const session = await setupUser()
	await createWorkoutWithSession(session.userId, inDays(-3), 'completed')
	await createWorkoutWithSession(session.userId, inDays(-1), 'missed')
	await createWorkoutWithSession(session.userId, inDays(2), 'scheduled')

	const cookieHeader = await getSessionCookieHeader(session)
	const request = makeRequest(cookieHeader)
	const response = await loader({ request, ...LOADER_ARGS_BASE })

	const data = response as {
		ledger: Array<{ scheduledAt: Date; status: string }>
	}
	expect(data.ledger).toHaveLength(3)
	// ordered chronologically (past → future)
	const times = data.ledger.map((s) => new Date(s.scheduledAt).getTime())
	expect(times).toEqual([...times].sort((a, b) => a - b))
	expect(data.ledger.map((s) => deriveLedgerStatus(s))).toEqual([
		'completed',
		'missed',
		'planned',
	])
})
