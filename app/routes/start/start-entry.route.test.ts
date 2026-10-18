import { type AppLoadContext } from 'react-router'
import { describe, expect, test } from 'vitest'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { MOCK_INTERVALSICU_API_KEY } from '#tests/mocks/intervalsicu.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as oldAddressLoader } from './$.tsx'
import { loader as entryLoader } from './index.tsx'
import { action as connectAction, loader as connectLoader } from './koble.tsx'
import { action as levelAction, loader as levelLoader } from './niva.tsx'

// The start's way in (#578): `/start` is the level screen, the old first
// run's addresses lead there, an athlete's history pre-fills the hours and
// days with where they came from, and connecting intervals.icu is a quiet
// way to that history, never a step.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/start',
}

async function setUp() {
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

function get(path: string, cookie: string) {
	return new Request(new URL(path, BASE_URL).toString(), {
		headers: { cookie },
	})
}

function post(path: string, entries: Array<[string, string]>, cookie: string) {
	return new Request(new URL(path, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(entries).toString(),
	})
}

/** A loader or action's answer, whether it returned it or threw it. */
async function settle<T>(run: () => Promise<T>): Promise<T | Response> {
	try {
		return await run()
	} catch (thrown) {
		if (thrown instanceof Response) return thrown
		throw thrown
	}
}

function location(response: unknown): string | null {
	const raw =
		response instanceof Response ? response.headers.get('location') : null
	return raw == null ? null : decodeURIComponent(raw)
}

type Reply = {
	data: { result: { status: string; error?: Record<string, string[] | null> } }
	init: { status: number } | null
}

/** Four complete weeks of recorded runs on Tuesdays and Saturdays. */
async function seedRunningHistory(
	userId: string,
	originPlatform: string = 'unknown',
) {
	const thisMonday = weekMonday(new Date(), 'UTC')
	for (let week = 1; week <= 4; week++) {
		const monday = addDays(thisMonday, -7 * week)
		for (const offset of [1, 5]) {
			const startedAt = new Date(`${addDays(monday, offset)}T07:00:00Z`)
			const recording = await prisma.activityImport.create({
				data: {
					athleteId: userId,
					externalProvider: 'intervalsicu',
					externalId: `run-${userId}-${week}-${offset}`,
					originPlatform,
					startedAt,
					endedAt: new Date(startedAt.getTime() + 7203 * 1000),
					durationSec: Math.round(21.5 * 335),
					distanceM: 21500,
					discipline: 'run',
					rawJson: '{}',
				},
			})
			await prisma.workoutSession.create({
				data: {
					userId,
					scheduledAt: startedAt,
					status: 'completed',
					source: 'recorded',
					recordingId: recording.id,
				},
			})
		}
	}
}

/** An intervals.icu link whose history is still on its way. */
async function connectImporting(userId: string) {
	await prisma.accountConnection.create({
		data: {
			athleteId: userId,
			provider: 'intervalsicu',
			status: 'active',
			externalAthleteId: 'i-importing',
			accessToken: 'key',
			connectedAt: new Date(),
			backfillCompletedAt: null,
		},
	})
}

describe('the way in', () => {
	test('/start opens the level screen, and an athlete with a plan is sent to I dag', async () => {
		const { userId, cookie } = await setUp()

		expect(
			location(
				await settle(() =>
					entryLoader({ request: get('/start', cookie), ...ARGS }),
				),
			),
		).toBe('/start/niva')

		await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })
		expect(
			location(
				await settle(() =>
					entryLoader({ request: get('/start', cookie), ...ARGS }),
				),
			),
		).toBe('/')
	})

	test.each([
		'/start/funn',
		'/start/sporsmal?discipline=run&hours=4.5&days=1,3,5',
		'/start/plan?discipline=run&hours=4.5&days=1,3,5&goal=active',
		'/start/uker?discipline=run&hours=4.5&days=1,3,5&goal=active&family=classic',
	])(
		'the old first run’s address %s leads to the level screen',
		async (path) => {
			const { cookie } = await setUp()
			const response = await settle(() =>
				oldAddressLoader({
					request: get(path, cookie),
					...ARGS,
					params: { '*': path.slice('/start/'.length).split('?')[0]! },
				}),
			)
			expect(location(response)).toBe('/start/niva')
		},
	)

	test('connecting is offered quietly from the level screen, and setting the season up yourself opens plan authoring', async () => {
		const { cookie } = await setUp()
		const level = await levelLoader({
			request: get('/start/niva', cookie),
			...ARGS,
		})
		expect(level.connectHref).toBe('/start/koble')
		expect(level.selfSetUpHref).toBe('/training/plan/new')
		expect(level.history).toBeNull()
	})
})

describe('hours and days from the history', () => {
	test('the last four weeks pre-fill the hours and days, saying where they came from, with the arithmetic', async () => {
		const { userId, cookie } = await setUp()
		await seedRunningHistory(userId)

		const level = await levelLoader({
			request: get('/start/niva', cookie),
			...ARGS,
		})
		expect(level.history).toMatchObject({
			hours: 4,
			// tirsdag og lørdag
			days: [1, 5],
			importing: false,
			line: 'Fra de siste fire ukene dine: 4 timer i uka, tirsdag og lørdag.',
			arithmetic: '43 km/uke à 5:35 ≈ 4 t',
			credits: [],
		})

		// The level's own hours and days give way to the history's.
		const moved = await settle(() =>
			levelAction({
				request: post('/start/niva', [['level', 'competitive']], cookie),
				...ARGS,
			}),
		)
		expect(location(moved)).toBe(
			'/start/trening?level=competitive&hours=4&days=1,5',
		)

		// What the athlete set themselves wins over the history.
		const own = await settle(() =>
			levelAction({
				request: post(
					'/start/niva',
					[
						['level', 'competitive'],
						['hours', '9'],
						['days', '0'],
						['days', '3'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(own)).toBe(
			'/start/trening?level=competitive&hours=9&days=0,3',
		)
	})

	test("history recorded by a Garmin carries Garmin's derived-data line beside the numbers (ADR 0098)", async () => {
		const { userId, cookie } = await setUp()
		await seedRunningHistory(userId, 'garmin')

		const level = await levelLoader({
			request: get('/start/niva', cookie),
			...ARGS,
		})
		expect(level.history?.credits).toEqual([
			'Insights derived in part from Garmin device-sourced data.',
		])
	})

	test('while the history is still importing the start says so and uses the level’s own hours', async () => {
		const { userId, cookie } = await setUp()
		await connectImporting(userId)

		const level = await levelLoader({
			request: get('/start/niva', cookie),
			...ARGS,
		})
		expect(level.connectHref).toBeNull()
		expect(level.history).toMatchObject({
			hours: null,
			days: null,
			importing: true,
			arithmetic: null,
		})
		expect(level.history?.line).toMatch(/hentes fortsatt fra intervals\.icu/)

		const moved = await settle(() =>
			levelAction({
				request: post('/start/niva', [['level', 'experienced']], cookie),
				...ARGS,
			}),
		)
		expect(location(moved)).toBe('/start/trening?level=experienced&hours=7')
	})
})

describe('connecting intervals.icu from the start', () => {
	test('a good key links the account, starts the history import and goes back to the level screen', async () => {
		const { userId, cookie } = await setUp()

		const response = await settle(() =>
			connectAction({
				request: post(
					'/start/koble',
					[['apiKey', MOCK_INTERVALSICU_API_KEY]],
					cookie,
				),
				...ARGS,
			}),
		)

		expect(location(response)).toBe('/start/niva')
		const link = await prisma.accountConnection.findUnique({
			where: {
				athleteId_provider: { athleteId: userId, provider: 'intervalsicu' },
			},
		})
		expect(link?.status).toBe('active')
		expect(
			await prisma.job.count({ where: { kind: 'intervalsicu-backfill' } }),
		).toBeGreaterThan(0)
		expect(
			await connectLoader({ request: get('/start/koble', cookie), ...ARGS }),
		).toEqual({ connected: true })
	})

	test('a rejected key is said on the field in Norwegian, and nothing is stored', async () => {
		const { userId, cookie } = await setUp()

		const reply = (await connectAction({
			request: post('/start/koble', [['apiKey', 'not-a-key']], cookie),
			...ARGS,
		})) as unknown as Reply

		expect(reply.init?.status).toBe(400)
		expect(reply.data.result.error?.apiKey?.[0]).toMatch(
			/intervals\.icu godtok ikke nøkkelen/,
		)
		expect(
			await prisma.accountConnection.count({ where: { athleteId: userId } }),
		).toBe(0)
	})

	test('an athlete with a plan is sent to I dag', async () => {
		const { userId, cookie } = await setUp()
		await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })
		expect(
			location(
				await settle(() =>
					connectLoader({ request: get('/start/koble', cookie), ...ARGS }),
				),
			),
		).toBe('/')
	})
})
