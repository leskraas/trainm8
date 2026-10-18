import { type AppLoadContext } from 'react-router'
import { describe, expect, test } from 'vitest'
import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { parseTrainableWeekdays } from '#app/utils/athlete-schema.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { draftStart, weekSketch } from '#app/utils/first-run/start-draft.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as levelAction, loader as levelLoader } from './niva.tsx'
import {
	action as preferencesAction,
	loader as preferencesLoader,
} from './okter.tsx'
import {
	action as activitiesAction,
	loader as activitiesLoader,
} from './trening.tsx'
import { action as choiceAction } from './valg.tsx'

// The simple start's questions (#563) through their loaders and actions: the
// level and hours, the main sport and the days, the answers travelling in the
// URL, and the plan made from them laying what Uka di showed.

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

test('an athlete who already has a plan is sent to I dag from both questions', async () => {
	const { userId, cookie } = await setUp()
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })

	for (const run of [
		(): Promise<unknown> =>
			levelLoader({ request: get('/start/niva', cookie), ...ARGS }),
		() =>
			activitiesLoader({
				request: get('/start/trening?level=beginner&hours=3', cookie),
				...ARGS,
			}),
		() =>
			levelAction({
				request: post('/start/niva', [['level', 'beginner']], cookie),
				...ARGS,
			}),
	]) {
		expect(location(await settle(run))).toBe('/')
	}
})

describe('Hvor er du nå? and the hours', () => {
	test('the level moves on with its own hours where none were changed, or with the hours given', async () => {
		const { cookie } = await setUp()

		const byLevel = await settle(() =>
			levelAction({
				request: post('/start/niva', [['level', 'experienced']], cookie),
				...ARGS,
			}),
		)
		expect(location(byLevel)).toBe('/start/trening?level=experienced&hours=7')

		const given = await settle(() =>
			levelAction({
				request: post(
					'/start/niva',
					[
						['level', 'beginner'],
						['hours', '4.5'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(given)).toBe('/start/trening?level=beginner&hours=4.5')
	})

	test('hours outside 1–20, or off the half hour, and a missing level are refused in Norwegian', async () => {
		const { cookie } = await setUp()

		for (const [hours, message] of [
			['0.1', 'Minst 1 time i uka'],
			['0.5', 'Minst 1 time i uka'],
			['20.5', 'Høyst 20 timer i uka'],
			['4.3', 'Timene går i halve timer'],
		] as const) {
			const reply = (await levelAction({
				request: post(
					'/start/niva',
					[
						['level', 'recreational'],
						['hours', hours],
					],
					cookie,
				),
				...ARGS,
			})) as unknown as Reply
			expect(reply.init?.status).toBe(400)
			expect(reply.data.result.error?.hours?.[0]).toBe(message)
		}

		const noLevel = (await levelAction({
			request: post('/start/niva', [['hours', '5']], cookie),
			...ARGS,
		})) as unknown as Reply
		expect(noLevel.data.result.error?.level?.[0]).toBe('Velg hvor du er nå')
	})

	test('going back brings every answer, and a malformed one is dropped rather than trusted', async () => {
		const { cookie } = await setUp()

		const back = await levelLoader({
			request: get(
				'/start/niva?level=competitive&hours=11.5&discipline=bike&days=0,2,4',
				cookie,
			),
			...ARGS,
		})
		expect(back.answers).toEqual({
			level: 'competitive',
			hours: 11.5,
			discipline: 'bike',
			days: [0, 2, 4],
		})
		// The Plan Start Week the sketch lays from: a Monday.
		expect(weekdayIndex(back.startWeekKey)).toBe(0)

		const tampered = await levelLoader({
			request: get('/start/niva?level=pro&hours=0.1&days=9', cookie),
			...ARGS,
		})
		expect(tampered.answers).toEqual({})

		// The answers the next screen already holds ride along.
		const carried = await settle(() =>
			levelAction({
				request: post(
					'/start/niva',
					[
						['level', 'competitive'],
						['hours', '12'],
						['discipline', 'bike'],
						['days', '0'],
						['days', '2'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(carried)).toBe(
			'/start/trening?level=competitive&hours=12&discipline=bike&days=0,2',
		)
	})
})

describe('Hva liker du å trene? and the days', () => {
	test('needs the level and hours first, and pre-fills the days from the level', async () => {
		const { cookie } = await setUp()

		expect(
			location(
				await settle(() =>
					activitiesLoader({
						request: get('/start/trening?level=beginner', cookie),
						...ARGS,
					}),
				),
			),
		).toBe('/start/niva?level=beginner')

		const prefilled = await activitiesLoader({
			request: get('/start/trening?level=recreational&hours=5', cookie),
			...ARGS,
		})
		expect(prefilled).toMatchObject({
			level: 'recreational',
			hours: 5,
			discipline: 'run',
			days: [0, 2, 4, 5],
		})

		const given = await activitiesLoader({
			request: get(
				'/start/trening?level=recreational&hours=5&discipline=swim&days=1,6',
				cookie,
			),
			...ARGS,
		})
		expect(given).toMatchObject({ discipline: 'swim', days: [1, 6] })
	})

	test('the answers move on to the Session Preferences, and no day is refused', async () => {
		const { cookie } = await setUp()

		const response = await settle(() =>
			activitiesAction({
				request: post(
					'/start/trening',
					[
						['level', 'beginner'],
						['hours', '3'],
						['discipline', 'run'],
						['days', '0'],
						['days', '2'],
						['days', '4'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(response)).toBe(
			'/start/okter?level=beginner&hours=3&discipline=run&days=0,2,4',
		)

		const noDays = (await activitiesAction({
			request: post(
				'/start/trening',
				[
					['level', 'beginner'],
					['hours', '3'],
					['discipline', 'run'],
				],
				cookie,
			),
			...ARGS,
		})) as unknown as Reply
		expect(noDays.init?.status).toBe(400)
		expect(noDays.data.result.error?.days?.[0]).toBe('Velg minst én dag')
	})

	test('several sports move on with the main sport first, and come back the same', async () => {
		const { cookie } = await setUp()

		const response = await settle(() =>
			activitiesAction({
				request: post(
					'/start/trening',
					[
						['level', 'experienced'],
						['hours', '7'],
						['discipline', 'bike'],
						['sports', 'run'],
						['sports', 'bike'],
						['sports', 'swim'],
						['days', '0'],
						['days', '3'],
						['days', '6'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		const next = location(response)
		expect(next).toBe(
			'/start/okter?level=experienced&hours=7&discipline=bike&sports=bike,run,swim&days=0,3,6',
		)

		const back = await activitiesLoader({
			request: get(next!.replace('/start/valg', '/start/trening'), cookie),
			...ARGS,
		})
		expect(back).toMatchObject({
			discipline: 'bike',
			otherSports: ['run', 'swim'],
		})

		// The level screen carries them both ways too.
		const level = await settle(() =>
			levelAction({
				request: post(
					'/start/niva',
					[
						['level', 'experienced'],
						['hours', '7'],
						['discipline', 'bike'],
						['sports', 'bike'],
						['sports', 'swim'],
						['days', '0'],
						['days', '3'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(level)).toBe(
			'/start/trening?level=experienced&hours=7&discipline=bike&sports=bike,swim&days=0,3',
		)
	})

	test('no sport picked is refused in Norwegian', async () => {
		const { cookie } = await setUp()
		const none = (await activitiesAction({
			request: post(
				'/start/trening',
				[
					['level', 'beginner'],
					['hours', '3'],
					['days', '0'],
				],
				cookie,
			),
			...ARGS,
		})) as unknown as Reply
		expect(none.init?.status).toBe(400)
		expect(none.data.result.error?.discipline?.[0]).toBe(
			// A Simple Activity alone is enough too (#572).
			'Velg en idrett eller en aktivitet',
		)
	})
})

describe('Hva slags økter liker du?', () => {
	const ANSWERS = 'level=recreational&hours=5&discipline=run&days=0,2,4,5'
	const FIELDS: Array<[string, string]> = [
		['level', 'recreational'],
		['hours', '5'],
		['discipline', 'run'],
		['days', '0'],
		['days', '2'],
		['days', '4'],
		['days', '5'],
	]

	test('is asked once the sport and days are, and comes back with the preferences given', async () => {
		const { cookie } = await setUp()
		expect(
			location(
				await settle(() =>
					preferencesLoader({
						request: get('/start/okter?level=recreational&hours=5', cookie),
						...ARGS,
					}),
				),
			),
		).toBe('/start/trening?level=recreational&hours=5')
		const back = await preferencesLoader({
			request: get(`/start/okter?${ANSWERS}&prefs=short,nonsense`, cookie),
			...ARGS,
		})
		// A tampered list is no answer at all.
		expect(back.preferences).toEqual([])
		const given = await preferencesLoader({
			request: get(`/start/okter?${ANSWERS}&prefs=surprise,long`, cookie),
			...ARGS,
		})
		expect(given.preferences).toEqual(['long', 'surprise'])
	})

	test('the preferences picked travel on to the ways, and Hopp over goes on with none', async () => {
		const { cookie } = await setUp()
		const picked = await settle(() =>
			preferencesAction({
				request: post(
					'/start/okter',
					[...FIELDS, ['preferences', 'short'], ['preferences', 'intervals']],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(picked)).toBe(
			`/start/valg?${ANSWERS}&prefs=intervals,short`,
		)
		const skipped = await settle(() =>
			preferencesAction({
				request: post('/start/okter', FIELDS, cookie),
				...ARGS,
			}),
		)
		expect(location(skipped)).toBe(`/start/valg?${ANSWERS}`)
		// Several sports (#573) ride through unchanged.
		const sports = await settle(() =>
			preferencesAction({
				request: post(
					'/start/okter',
					[...FIELDS, ['sports', 'run'], ['sports', 'bike']],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(sports)).toBe(
			'/start/valg?level=recreational&hours=5&discipline=run&sports=run,bike&days=0,2,4,5',
		)
	})

	test('a preference that does not exist is refused, and the athlete stays', async () => {
		const { cookie } = await setUp()
		const refused = (await preferencesAction({
			request: post(
				'/start/okter',
				[...FIELDS, ['preferences', 'everything']],
				cookie,
			),
			...ARGS,
		})) as unknown as Reply
		expect(refused.init?.status).toBe(400)
	})
})

describe('the plan made from the answers', () => {
	test('a Nybegynner’s seven days lay four sessions, the ones Uka di showed, and keep all seven as availability', async () => {
		const { userId, cookie } = await setUp()
		const days = [0, 1, 2, 3, 4, 5, 6] as const

		const { startWeekKey } = await activitiesLoader({
			request: get('/start/trening?level=beginner&hours=4', cookie),
			...ARGS,
		})
		const sketch = weekSketch(
			draftStart({
				level: 'beginner',
				discipline: 'run',
				hours: 4,
				days: [...days],
				startWeekKey,
			}),
		)
		expect(sketch.sessionCount).toBe(4)

		const created = await settle(() =>
			choiceAction({
				request: post(
					'/start/valg',
					[
						['level', 'beginner'],
						['hours', '4'],
						['discipline', 'run'],
						...days.map((day): [string, string] => ['days', String(day)]),
						['family', 'big-base'],
					],
					cookie,
				),
				...ARGS,
			}),
		)
		expect(location(created)).toBe('/start/klar')
		const sessions = await prisma.workoutSession.findMany({
			where: { userId },
			orderBy: { scheduledAt: 'asc' },
			select: { status: true, scheduledAt: true },
		})
		// Two weeks of four, nothing before the Plan Start Week, and nothing
		// marked done or ikke gjort by making the plan.
		expect(sessions).toHaveLength(8)
		expect(
			sessions.every(
				(session) =>
					session.scheduledAt.toISOString().slice(0, 10) >= startWeekKey,
			),
		).toBe(true)
		expect(new Set(sessions.map((session) => session.status))).toEqual(
			new Set(['scheduled']),
		)
		// On the days Uka di showed them.
		expect(
			new Set(
				sessions.map((session) =>
					weekdayIndex(session.scheduledAt.toISOString().slice(0, 10)),
				),
			),
		).toEqual(
			new Set(
				sketch.days.flatMap((day, weekday) =>
					day.sessions.length > 0 ? [weekday] : [],
				),
			),
		)
		const profile = await prisma.athleteProfile.findUniqueOrThrow({
			where: { userId },
			select: { trainableWeekdays: true },
		})
		expect(new Set(parseTrainableWeekdays(profile.trainableWeekdays))).toEqual(
			new Set([0, 1, 2, 3, 4, 5, 6]),
		)
	})
})
