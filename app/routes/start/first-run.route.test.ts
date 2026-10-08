import { type AppLoadContext } from 'react-router'
import { describe, expect, test } from 'vitest'
import {
	addDays,
	weekdayIndex,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { MOCK_INTERVALSICU_API_KEY } from '#tests/mocks/intervalsicu.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as findingsAction, loader as findingsLoader } from './funn.tsx'
import { action as connectAction, loader as connectLoader } from './index.tsx'
import { action as planAction, loader as planLoader } from './plan.tsx'
import {
	action as questionsAction,
	loader as questionsLoader,
} from './sporsmal.tsx'
import { action as weeksAction, loader as weeksLoader } from './uker.tsx'

// The first run's five screens through their loaders and actions (#505 S14):
// each step's answer, what it refuses, and where it sends the athlete next.

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
	return response instanceof Response ? response.headers.get('location') : null
}

type Reply = {
	data: {
		result: {
			status: string
			error?: Record<string, string[] | null>
		}
	}
	init: { status: number } | null
}

/** Four complete weeks of recorded runs on Tuesdays and Saturdays. */
async function seedRunningHistory(userId: string) {
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

const ACTIVE = 'discipline=run&hours=4.5&days=1,3,5&goal=active'

test('an athlete who already has a plan is sent to it, from every step', async () => {
	const { userId, cookie } = await setUp()
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })

	for (const run of [
		(): Promise<unknown> => connectLoader({ request: get('/start', cookie), ...ARGS }),
		() => findingsLoader({ request: get('/start/funn', cookie), ...ARGS }),
		() => questionsLoader({ request: get('/start/sporsmal', cookie), ...ARGS }),
		() =>
			planLoader({ request: get(`/start/plan?${ACTIVE}`, cookie), ...ARGS }),
		() =>
			weeksLoader({ request: get(`/start/uker?${ACTIVE}`, cookie), ...ARGS }),
	]) {
		expect(location(await settle(run))).toBe('/training/plan')
	}
})

describe('step 1: connect intervals.icu', () => {
	test('a good key links the account, starts the history import and moves on', async () => {
		const { userId, cookie } = await setUp()

		const response = await settle(() =>
			connectAction({
				request: post(
					'/start',
					[['apiKey', MOCK_INTERVALSICU_API_KEY]],
					cookie,
				),
				...ARGS,
			}),
		)

		expect(location(response)).toBe('/start/funn')
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
			await connectLoader({ request: get('/start', cookie), ...ARGS }),
		).toEqual({ connected: true })
	})

	test('a rejected key is said on the field in Norwegian, and nothing is stored', async () => {
		const { userId, cookie } = await setUp()

		const reply = (await connectAction({
			request: post('/start', [['apiKey', 'not-a-key']], cookie),
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
})

describe('step 2: Dette fant vi', () => {
	test('reads the history, and says why where it reads nothing', async () => {
		const { userId, cookie } = await setUp()

		const empty = await findingsLoader({
			request: get('/start/funn', cookie),
			...ARGS,
		})
		expect(empty.rows.map((row) => row.absence)).toEqual(
			Array(4).fill(
				'Ikke målt · intervals.icu er ikke koblet til, og du har ikke logget økter her',
			),
		)

		await seedRunningHistory(userId)
		const found = await findingsLoader({
			request: get('/start/funn', cookie),
			...ARGS,
		})
		expect(
			Object.fromEntries(found.rows.map((row) => [row.key, row.value])),
		).toEqual({
			discipline: 'Løping · 8 økter på 4 uker',
			volume: '43 km/uke à 5:35 ≈ 4 t',
			days: 'tirsdag og lørdag',
			strength: 'Ingen styrkeøkter',
		})
	})

	test('Noe er feil carries the correction to the questions', async () => {
		const { cookie } = await setUp()

		const response = await settle(() =>
			findingsAction({
				request: post(
					'/start/funn',
					[
						['discipline', 'bike'],
						['hours', '6'],
						['days', '0'],
						['days', '2'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(response)).toBe(
			'/start/sporsmal?discipline=bike&hours=6&days=0%2C2',
		)

		const reply = (await findingsAction({
			request: post('/start/funn', [['discipline', 'bike']], cookie),
			...ARGS,
		})) as unknown as Reply
		expect(reply.init?.status).toBe(400)
		expect(reply.data.result.error?.days?.[0]).toBe('Velg minst én dag')
	})
})

describe('step 3: three questions', () => {
	test('pre-filled from the history, the hours with their arithmetic', async () => {
		const { userId, cookie } = await setUp()
		await seedRunningHistory(userId)

		const prefilled = await questionsLoader({
			request: get('/start/sporsmal', cookie),
			...ARGS,
		})
		expect(prefilled).toMatchObject({
			discipline: 'run',
			hours: 4,
			hoursNote: 'Fra historikken: 43 km/uke à 5:35 ≈ 4 t',
			days: [1, 5],
			daysNote: 'Dagene du pleier å trene.',
			goal: { kind: 'active' },
		})

		const corrected = await questionsLoader({
			request: get('/start/sporsmal?discipline=bike&hours=6&days=0,2', cookie),
			...ARGS,
		})
		expect(corrected).toMatchObject({
			discipline: 'bike',
			hours: 6,
			hoursNote: null,
			days: [0, 2],
		})
	})

	test('the answers move on to the plan, and a race too close is refused on its date', async () => {
		const { cookie } = await setUp()

		const response = await settle(() =>
			questionsAction({
				request: post(
					'/start/sporsmal',
					[
						['discipline', 'run'],
						['goal', 'active'],
						['hours', '4.5'],
						['days', '1'],
						['days', '3'],
						['days', '5'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(response)).toBe(
			`/start/plan?${ACTIVE.replaceAll(',', '%2C')}`,
		)

		const tooSoon = (await questionsAction({
			request: post(
				'/start/sporsmal',
				[
					['discipline', 'run'],
					['goal', 'event'],
					['eventName', 'Lokalløpet'],
					['eventDate', new Date().toISOString().slice(0, 10)],
					['hours', '4'],
					['days', '2'],
				],
				cookie,
			),
			...ARGS,
		})) as unknown as Reply
		expect(tooSoon.init?.status).toBe(400)
		expect(tooSoon.data.result.error?.eventDate?.[0]).toMatch(
			/Velg en dato etter neste uke/,
		)
	})
})

describe('step 4: the plan, and why', () => {
	test('says which philosophy and why, and switches to another', async () => {
		const { cookie } = await setUp()

		const plan = await planLoader({
			request: get(`/start/plan?${ACTIVE}`, cookie),
			...ARGS,
		})
		expect(plan).toMatchObject({
			family: 'classic',
			switched: false,
			firstWeek: 'Første uke: 4,5 t',
		})
		expect(plan.reason).toMatch(/^Vi valgte Klassisk 3:1 fordi /)

		const response = await settle(() =>
			planAction({
				request: post(
					`/start/plan?${ACTIVE}`,
					[['family', 'polarized']],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(response)).toBe(
			`/start/plan?${ACTIVE.replaceAll(',', '%2C')}&family=polarized`,
		)
		const switched = await planLoader({
			request: get(`/start/plan?${ACTIVE}&family=polarized`, cookie),
			...ARGS,
		})
		expect(switched).toMatchObject({
			family: 'polarized',
			familyLabel: 'Polarisert 80/20',
			switched: true,
		})
	})

	test('without answers it goes back to the questions', async () => {
		const { cookie } = await setUp()
		expect(
			location(
				await settle(() =>
					planLoader({ request: get('/start/plan', cookie), ...ARGS }),
				),
			),
		).toBe('/start/sporsmal')
	})
})

describe('step 5: the first two weeks, and the way out', () => {
	test('shows the two weeks on the chosen days, then makes the plan and lands on I dag', async () => {
		const { userId, cookie } = await setUp()

		const weeks = await weeksLoader({
			request: get(`/start/uker?${ACTIVE}`, cookie),
			...ARGS,
		})
		expect(weeks.weeks).toHaveLength(2)
		for (const week of weeks.weeks) {
			expect(week.sessions.map((s) => s.day.split(' ')[0])).toEqual([
				'tirsdag',
				'torsdag',
				'lørdag',
			])
		}
		expect(weeks.weeks[0]!.total).toBe('4,5 t planlagt · målet er 4,5 t')
		// One share each, the long Saturday two, at the tenth of an hour a share
		// is priced in: 1,1 + 1,1 + 2,3 = 4,5 t.
		expect(weeks.weeks[0]!.sessions.map((s) => s.duration)).toEqual([
			'1 t 6 min',
			'1 t 6 min',
			'2 t 18 min',
		])

		const response = await settle(() =>
			weeksAction({
				request: post(`/start/uker?${ACTIVE}`, [['intent', 'create']], cookie),
				...ARGS,
			}),
		)
		expect(location(response)).toBe('/')
		const sessions = await prisma.workoutSession.findMany({
			where: { userId },
			select: { scheduledAt: true },
		})
		expect(sessions).toHaveLength(6)
		expect(
			new Set(
				sessions.map((s) =>
					weekdayIndex(s.scheduledAt.toISOString().slice(0, 10)),
				),
			),
		).toEqual(new Set([1, 3, 5]))
	})

	test('Jeg vil heller sette opp sesongen selv makes the same plan and opens it in Sesong', async () => {
		const { userId, cookie } = await setUp()

		const response = await settle(() =>
			weeksAction({
				request: post(
					`/start/uker?${ACTIVE}&family=masters`,
					[['intent', 'self']],
					cookie,
				),
				...ARGS,
			}),
		)
		const outline = await prisma.planOutline.findFirstOrThrow({
			where: { athleteId: userId },
			select: { id: true, family: true },
		})
		expect(location(response)).toBe(`/training/plan?outline=${outline.id}`)
		expect(outline.family).toBe('masters')
	})
})
