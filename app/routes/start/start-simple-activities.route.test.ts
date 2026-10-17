import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action as preferencesAction } from './okter.tsx'
import {
	action as activitiesAction,
	loader as activitiesLoader,
} from './trening.tsx'
import { action, loader } from './valg.tsx'

// Simple Activities in the start (#572) through the loaders and actions: the
// activities travel in the URL in the order picked, the cards say what did
// not fit, and an athlete with no endurance sport is told they get one simple
// week, and gets it.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/start/valg',
}

type Reply = {
	data: { result: { error?: Record<string, string[] | null> } }
	init: { status: number } | null
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

test('the activities picked travel on to the ways to train, in the order picked, with or without a sport', async () => {
	const { cookie } = await setUp()
	const withSport = await settle(() =>
		activitiesAction({
			request: post(
				'/start/trening',
				[
					['level', 'recreational'],
					['hours', '5'],
					['discipline', 'run'],
					['activities', 'yoga-mobility'],
					['activities', 'climb'],
					['days', '0'],
					['days', '2'],
					['days', '4'],
					['days', '5'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	expect(location(withSport)).toBe(
		'/start/okter?level=recreational&hours=5&discipline=run&activities=yoga-mobility,climb&days=0,2,4,5',
	)

	const alone = await settle(() =>
		activitiesAction({
			request: post(
				'/start/trening',
				[
					['level', 'recreational'],
					['hours', '3'],
					['discipline', ''],
					['activities', 'hike'],
					['days', '5'],
					['days', '6'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	expect(location(alone)).toBe(
		'/start/okter?level=recreational&hours=3&activities=hike&days=5,6',
	)
	// _Hva slags økter liker du?_ (#571) carries them on to the cards.
	const onward = await settle(() =>
		preferencesAction({
			request: post(
				'/start/okter',
				[
					['level', 'recreational'],
					['hours', '3'],
					['activities', 'hike'],
					['days', '5'],
					['days', '6'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	expect(location(onward)).toBe(
		'/start/valg?level=recreational&hours=3&activities=hike&days=5,6',
	)

	// Back again, the sport stays unpicked and the activities are kept.
	const back = await activitiesLoader({
		request: get(
			'/start/trening?level=recreational&hours=3&activities=hike&days=5,6',
			cookie,
		),
		...ARGS,
	})
	expect(back).toMatchObject({ discipline: null, activities: ['hike'] })
})

test('neither a sport nor an activity is refused in Norwegian', async () => {
	const { cookie } = await setUp()
	const reply = (await activitiesAction({
		request: post(
			'/start/trening',
			[
				['level', 'recreational'],
				['hours', '5'],
				['days', '0'],
			],
			cookie,
		),
		...ARGS,
	})) as unknown as Reply
	expect(reply.init?.status).toBe(400)
	expect(reply.data.result.error?.discipline?.[0]).toBe(
		'Velg en idrett eller en aktivitet',
	)
})

test('each card shows the Simple Activities on their days with their effort, and names what did not fit with what makes room', async () => {
	const { cookie } = await setUp()
	const shown = await loader({
		request: get(
			'/start/valg?level=beginner&hours=3&discipline=run&activities=climb,yoga-mobility&days=0,2,4',
			cookie,
		),
		...ARGS,
	})
	expect(shown.cards.length).toBeGreaterThan(1)
	for (const card of shown.cards) {
		const climb = card.days
			.flatMap((day) => day.sessions)
			.filter((session) => session.title === 'Klatring')
		expect(climb).toEqual([
			expect.objectContaining({
				discipline: 'other',
				effort: 'moderate',
				facts: '1 t 30 min · middels',
			}),
		])
		expect(card.total).toBe('3 t i uka')
		expect(card.notFitted).toBe(
			'Fikk ikke plass denne uka: yoga og bevegelighet. Velg en dag til, så kommer den med.',
		)
	}
})

test('with no endurance sport the athlete is told plainly, sees one way, and Velg denne makes it', async () => {
	const { userId, cookie } = await setUp()
	const shown = await loader({
		request: get(
			'/start/valg?level=recreational&hours=3&activities=hike,yoga-mobility&days=1,3,5',
			cookie,
		),
		...ARGS,
	})
	expect(shown.title).toBe('Én måte å trene på')
	expect(shown.cards).toHaveLength(1)
	expect(shown.notes).toContain(
		'Uten en utholdenhetsidrett blir det én enkel uke med øktene spredt ut, ikke flere å velge mellom.',
	)
	expect(shown.cards[0]!.total).toBe('3 t i uka')

	const response = await settle(() =>
		action({
			request: post(
				'/start/valg',
				[
					['level', 'recreational'],
					['hours', '3'],
					['activities', 'hike'],
					['activities', 'yoga-mobility'],
					['days', '1'],
					['days', '3'],
					['days', '5'],
					['family', shown.cards[0]!.family],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	expect(location(response)).toBe('/start/klar')
	const tracks = await prisma.trainingTrack.findMany({
		where: { outline: { athleteId: userId } },
		select: { discipline: true, currency: true },
	})
	expect(tracks).toEqual([{ discipline: 'other', currency: 'hours' }])
})
