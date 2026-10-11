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

function inDays(days: number): string {
	return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

const ACTIVE = 'discipline=run&hours=4.5&days=1,3,5&goal=active'

test('an athlete who already has a plan is sent to it, from every step', async () => {
	const { userId, cookie } = await setUp()
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })

	for (const run of [
		(): Promise<unknown> =>
			connectLoader({ request: get('/start', cookie), ...ARGS }),
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

		for (const [eventDate, message] of [
			['2026-99-99', /Velg en dato som finnes i kalenderen/],
			[inDays(7 * 110), /Velg en dato innen 104 uker/],
		] as const) {
			const refused = (await questionsAction({
				request: post(
					'/start/sporsmal',
					[
						['discipline', 'run'],
						['goal', 'event'],
						['eventName', 'Lokalløpet'],
						['eventDate', eventDate],
						['hours', '4'],
						['days', '2'],
					],
					cookie,
				),
				...ARGS,
			})) as unknown as Reply
			expect(refused.init?.status).toBe(400)
			expect(refused.data.result.error?.eventDate?.[0]).toMatch(message)
		}
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
			// The 4,5 t are what the athlete trains now (owner decision 15): the
			// round starts there and climbs.
			firstWeek: 'Første uke: 4,5 t – det du trener nå',
			peakWeek: 'Tyngste uke: 5 t',
			rhythm: '3 uker som bygger, så 1 lett',
			hardSessions: 'Harde økter: 1 tempoøkt i uka',
		})
		expect(plan.reason).toMatch(/^Vi valgte Klassisk 3:1 fordi /)
		// One bar a week of the round, the easy fourth lighter.
		expect(plan.curve.map((week) => week.role)).toEqual([
			'loading',
			'loading',
			'loading',
			'recovery',
		])
		expect(plan.curve[2]!.share).toBe(1)

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
		// The switch shows: Polarisert's hard session is intervals, Terskelfokus
		// lays threshold and tempo, Masters climbs two weeks and eases one.
		expect(switched).toMatchObject({
			family: 'polarized',
			familyLabel: 'Polarisert 80/20',
			switched: true,
			hardSessions: 'Harde økter: 1 intervalløkt i uka',
		})
		const threshold = await planLoader({
			request: get(`/start/plan?${ACTIVE}&family=threshold`, cookie),
			...ARGS,
		})
		expect(threshold.hardSessions).toBe(
			'Harde økter: 1 terskeløkt og 1 tempoøkt i uka',
		)
		const masters = await planLoader({
			request: get(`/start/plan?${ACTIVE}&family=masters`, cookie),
			...ARGS,
		})
		expect(masters.rhythm).toBe('2 uker som bygger, så 1 lett')
		expect(masters.curve).toHaveLength(3)
	})

	test('a race plan names its phases in Norwegian, and a tampered date goes back', async () => {
		const { cookie } = await setUp()
		const race = `discipline=run&hours=5&days=1,3,5&goal=event&name=Birken&date=${inDays(7 * 20)}`

		const plan = await planLoader({
			request: get(`/start/plan?${race}&family=classic`, cookie),
			...ARGS,
		})
		expect(plan.phases.map((phase) => phase.split(' · ')[0])).toEqual([
			'Grunntrening',
			'Oppbygging',
			'Spissing',
			'Nedtrapping',
		])

		expect(
			location(
				await settle(() =>
					planLoader({
						request: get(
							`/start/plan?${race.replace(/date=.*/, 'date=2026-99-99')}`,
							cookie,
						),
						...ARGS,
					}),
				),
			),
		).toBe('/start/sporsmal')
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
		// The round opens at the 4,5 t the athlete trains now: one share each,
		// the long Saturday two; Klassisk's tempo session on the Tuesday, as far
		// from the long day as the week allows.
		expect(weeks.weeks[0]!.total).toBe('4,5 t planlagt · målet er 4,5 t')
		expect(weeks.weeks[0]!.sessions.map((s) => s.duration)).toEqual([
			'1 t 6 min',
			'1 t 6 min',
			'2 t 18 min',
		])
		expect(weeks.weeks[0]!.sessions.map((s) => s.title)).toEqual([
			'Tempoøkt · Løping',
			'Rolig økt · Løping',
			'Langtur · Løping',
		])
		expect(weeks.weeks[0]!.sessions.map((s) => s.hard)).toEqual([
			true,
			false,
			false,
		])
		expect(weeks.daysNote).toBeNull()

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
		// What I dag shows is what step 5 showed.
		const titles = await prisma.workoutSession.findMany({
			where: { userId },
			orderBy: { scheduledAt: 'asc' },
			select: { workout: { select: { title: true } } },
		})
		expect(titles.slice(0, 3).map((s) => s.workout?.title)).toEqual(
			weeks.weeks[0]!.sessions.map((s) => s.title),
		)
		expect(
			new Set(
				sessions.map((s) =>
					weekdayIndex(s.scheduledAt.toISOString().slice(0, 10)),
				),
			),
		).toEqual(new Set([1, 3, 5]))
	})

	test('says so where the plan lays on fewer days than were chosen', async () => {
		const { cookie } = await setUp()

		// Seven days keep one to rest.
		const everyDay = await weeksLoader({
			request: get(
				'/start/uker?discipline=run&hours=8&days=0,1,2,3,4,5,6&goal=active',
				cookie,
			),
			...ARGS,
		})
		expect(everyDay.daysNote).toBe(
			'Du valgte 7 dager. Planen bruker 6, så du har minst én hviledag.',
		)
		expect(everyDay.weeks[0]!.sessions).toHaveLength(6)

		// Two hours over four days would be half-hour scraps.
		const fewHours = await weeksLoader({
			request: get(
				'/start/uker?discipline=run&hours=2&days=0,2,4,6&goal=active',
				cookie,
			),
			...ARGS,
		})
		expect(fewHours.daysNote).toMatch(
			/^Du valgte 4 dager\. Planen bruker \d, så ingen økt blir kortere enn en halvtime\.$/,
		)
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
