import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader as levelLoader } from './niva.tsx'
import { action, loader } from './valg.tsx'

// _Tre måter å trene på_ (#566) through its loader and action: the Start
// Options read from the answers in the URL, and _Velg denne_ making the one
// picked and taking the athlete to Planen er klar.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/start/valg',
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

const BEGINNER = 'level=beginner&hours=3&discipline=run&days=0,2,4'

function choice(family: string): Array<[string, string]> {
	return [
		['level', 'beginner'],
		['hours', '3'],
		['discipline', 'run'],
		['days', '0'],
		['days', '2'],
		['days', '4'],
		['family', family],
	]
}

test('without every answer the ways are not shown, and the athlete is sent to the question left', async () => {
	const { cookie } = await setUp()
	expect(
		location(
			await settle(() =>
				loader({
					request: get('/start/valg?level=beginner&hours=3', cookie),
					...ARGS,
				}),
			),
		),
	).toBe('/start/trening?level=beginner&hours=3')
	expect(
		location(
			await settle(() =>
				loader({ request: get('/start/valg', cookie), ...ARGS }),
			),
		),
	).toBe('/start/niva')
})

test('a beginner sees three real weeks, each led by its plain name, recommended for the level, and when the plan starts', async () => {
	const { cookie } = await setUp()
	const shown = await loader({
		request: get(`/start/valg?${BEGINNER}`, cookie),
		...ARGS,
	})
	expect(shown.title).toBe('Tre måter å trene på')
	expect(shown.notes).toEqual([])
	expect(
		shown.cards.map((card) => [card.name, card.familyName, card.badge]),
	).toEqual([
		['Bygg grunnform først', 'Fagnavn: Stor base', 'Anbefalt for nivået ditt'],
		['Mest rolig, litt veldig hardt', 'Fagnavn: Polarisert 80/20', null],
		['Variert og bygger seg opp', 'Fagnavn: Klassisk 3:1', null],
	])
	expect(shown.startsOn).toMatch(
		/^Planen starter mandag \d{1,2}\. (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\.$/,
	)
	for (const card of shown.cards) {
		expect(card.chooseLabel).toBe(`Velg denne: ${card.name}`)
		expect(card.days.map((day) => day.weekday)).toEqual([
			'mandag',
			'tirsdag',
			'onsdag',
			'torsdag',
			'fredag',
			'lørdag',
			'søndag',
		])
		// tirsdag is fri; the week is three hours, as given.
		expect(card.days[1]!.sessions).toEqual([])
		expect(card.total).toBe('3 t i uka')
		expect(card.sessions).toBe('3 økter')
		expect(card.shortOfHours).toBeNull()
	}
	expect(shown.cards[0]!.days[4]!.sessions[0]).toMatchObject({
		title: 'Langtur · Løping',
		facts: expect.stringMatching(/ · rolig$/),
	})
	expect(shown.cards[0]!.hard).toBe('0 harde')
	expect(shown.cards[0]!.barLabel).toBe('100 % rolig, 0 % middels, 0 % hard')
	expect(shown.cards[1]!.hard).toBe('1 hard')
})

test('going back to a question and changing it recomputes the ways, and says why there are fewer', async () => {
	const { cookie } = await setUp()
	const oneDay = await loader({
		request: get(
			'/start/valg?level=beginner&hours=3&discipline=run&days=4',
			cookie,
		),
		...ARGS,
	})
	expect(oneDay.title).toBe('Én måte å trene på')
	expect(oneDay.cards).toHaveLength(1)
	expect(oneDay.notes).toContain(
		'Med disse svarene la alle måtene nøyaktig samme uke, så du ser bare én.',
	)
	expect(oneDay.back).toBe(
		'/start/okter?level=beginner&hours=3&discipline=run&days=4',
	)
})

// Session Preferences (#571) on the cards.

const RECREATIONAL = 'level=recreational&hours=5&discipline=run&days=0,2,4,5'

test('the ways come in the order the preferences give them, with Passer deg best on the first', async () => {
	const { cookie } = await setUp()
	const shown = await loader({
		request: get(`/start/valg?${RECREATIONAL}&prefs=surprise`, cookie),
		...ARGS,
	})
	expect(shown.cards.map((card) => [card.family, card.badge])).toEqual([
		['classic', 'Passer deg best'],
		['polarized', null],
		['threshold', null],
	])
	expect(decodeURIComponent(shown.back)).toBe(
		`/start/okter?${RECREATIONAL}&prefs=surprise`,
	)
	// A skip: the level's order, and no badge claiming a taste.
	const skipped = await loader({
		request: get(`/start/valg?${RECREATIONAL}`, cookie),
		...ARGS,
	})
	expect(skipped.cards.map((card) => [card.family, card.badge])).toEqual([
		['polarized', null],
		['threshold', null],
		['classic', null],
	])
})

test('Korte økter says plainly that the week falls short of the hours, and with Lange, rolige turer how the two are met', async () => {
	const { cookie } = await setUp()
	const short = await loader({
		request: get(`/start/valg?${RECREATIONAL}&prefs=short`, cookie),
		...ARGS,
	})
	for (const card of short.cards) {
		expect(card.total).toBe('4 t 6 min i uka')
		expect(card.shortOfHours).toBe(
			'Uka blir 4 t 6 min, ikke 5 timer: du valgte korte økter, så ingen økt på en hverdag er over 45 minutter.',
		)
	}
	const both = await loader({
		request: get(`/start/valg?${RECREATIONAL}&prefs=long,short`, cookie),
		...ARGS,
	})
	expect(both.notes).toContain(
		'Du liker både korte økter og lange turer: hverdagsøktene blir høyst 45 minutter, og langturen får bli lang.',
	)
	for (const card of both.cards) {
		expect(card.total).toBe('5 t i uka')
		expect(card.shortOfHours).toBeNull()
	}
})

test('Velg denne keeps the Session Preferences on the Athlete Profile, and a skip as none', async () => {
	const { userId, cookie } = await setUp()
	await settle(() =>
		action({
			request: post(
				'/start/valg',
				[
					...choice('polarized'),
					['preferences', 'short'],
					['preferences', 'long'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { sessionPreferences: true },
	})
	expect(JSON.parse(profile.sessionPreferences!)).toEqual(['long', 'short'])

	const skipper = await setUp()
	await settle(() =>
		action({
			request: post('/start/valg', choice('polarized'), skipper.cookie),
			...ARGS,
		}),
	)
	const skipped = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: skipper.userId },
		select: { sessionPreferences: true },
	})
	expect(skipped.sessionPreferences).toBe('[]')
})

test('Velg denne makes the plan picked, keeps the level, and takes the athlete to Planen er klar', async () => {
	const { userId, cookie } = await setUp()
	const response = await settle(() =>
		action({
			request: post('/start/valg', choice('polarized'), cookie),
			...ARGS,
		}),
	)
	expect(location(response)).toBe('/start/klar')
	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId: userId },
		select: { family: true, eventId: true },
	})
	expect(outline).toEqual({ family: 'polarized', eventId: null })
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { trainingLevel: true },
	})
	expect(profile.trainingLevel).toBe('beginner')
})

test('several sports: the cards lay every sport, carry them to Velg denne, and the plan made has a track for each', async () => {
	const { userId, cookie } = await setUp()
	const shown = await loader({
		request: get(
			'/start/valg?level=experienced&hours=7&discipline=bike&sports=run,bike&days=0,1,3,4,6',
			cookie,
		),
		...ARGS,
	})
	expect(shown.answers).toMatchObject({
		discipline: 'bike',
		otherSports: ['run'],
	})
	expect(decodeURIComponent(shown.back)).toBe(
		'/start/okter?level=experienced&hours=7&discipline=bike&sports=bike,run&days=0,1,3,4,6',
	)
	const laid = new Set(
		shown.cards[0]!.days.flatMap((day) =>
			day.sessions.map((session) => session.discipline),
		),
	)
	expect(laid).toEqual(new Set(['bike', 'run']))

	const response = await settle(() =>
		action({
			request: post(
				'/start/valg',
				[
					['level', 'experienced'],
					['hours', '7'],
					['discipline', 'bike'],
					['sports', 'bike'],
					['sports', 'run'],
					...[0, 1, 3, 4, 6].map((day): [string, string] => [
						'days',
						String(day),
					]),
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
		select: { discipline: true },
		orderBy: { discipline: 'asc' },
	})
	expect(tracks.map((track) => track.discipline)).toEqual(['bike', 'run'])
})

test('a sport there is no day for is said above the cards', async () => {
	const { cookie } = await setUp()
	const shown = await loader({
		request: get(
			'/start/valg?level=recreational&hours=3&discipline=swim&sports=swim,run,bike&days=2,5',
			cookie,
		),
		...ARGS,
	})
	expect(shown.notes).toContain(
		'Uka har plass til 2 økter, så sykling fikk ikke egne dager. Velg flere dager, mer tid eller færre idretter.',
	)
})

test('a way not shown for these answers is refused in Norwegian, and nothing is made', async () => {
	const { userId, cookie } = await setUp()
	const reply = (await action({
		request: post('/start/valg', choice('masters'), cookie),
		...ARGS,
	})) as unknown as {
		data: { result: { error?: Record<string, string[] | null> } }
		init: { status: number } | null
	}
	expect(reply.init?.status).toBe(409)
	expect(reply.data.result.error?.['']?.[0]).toBe(
		'Den måten å trene på finnes ikke for disse svarene. Velg en av dem som vises.',
	)
	expect(await prisma.planOutline.count({ where: { athleteId: userId } })).toBe(
		0,
	)
})

test('an athlete who already has a plan is sent to I dag from the start', async () => {
	const { userId, cookie } = await setUp()
	await createOpenEndedPlan(userId, { discipline: 'run', weeklyHours: 3 })
	for (const run of [
		(): Promise<unknown> =>
			loader({ request: get(`/start/valg?${BEGINNER}`, cookie), ...ARGS }),
		() =>
			action({
				request: post('/start/valg', choice('polarized'), cookie),
				...ARGS,
			}),
		() => levelLoader({ request: get('/start/niva', cookie), ...ARGS }),
	]) {
		expect(location(await settle(run))).toBe('/')
	}
	expect(await prisma.planOutline.count({ where: { athleteId: userId } })).toBe(
		1,
	)
})
