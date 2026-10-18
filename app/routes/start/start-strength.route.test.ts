import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import {
	action as strengthSettingsAction,
	loader as strengthSettingsLoader,
} from '../settings/training/styrke.tsx'
import {
	action as preferencesAction,
	loader as preferencesLoader,
} from './okter.tsx'
import { loader as activitiesLoader } from './trening.tsx'
import { action, loader } from './valg.tsx'

// Strength in the start (#574) through the routes: the tap pre-set by level,
// the cards counting lifting beside the hours, _Velg denne_ keeping the tap as
// the athlete's answer, and Meg changing it.

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

const ANSWERS = 'level=experienced&hours=7&discipline=run&days=0,1,3,4,6'

test('the tap is offered pre-set by the level, with the full-body session to lift', async () => {
	const { cookie } = await setUp()
	const data = await activitiesLoader({
		...ARGS,
		request: get(`/start/trening?${ANSWERS}`, cookie),
	})
	expect(data.strength).toMatchObject({
		preset: 2,
		fromHistory: null,
		picked: null,
		session: { title: 'Anatomical adaptation, full body A' },
	})
	const again = await activitiesLoader({
		...ARGS,
		request: get(`/start/trening?${ANSWERS}&strength=3`, cookie),
	})
	expect(again.strength?.picked).toBe(3)
})

test('the tap rides through Hva slags økter liker du? to the Start Options', async () => {
	const { cookie } = await setUp()
	const shown = await preferencesLoader({
		...ARGS,
		request: get(`/start/okter?${ANSWERS}&strength=2`, cookie),
	})
	expect(shown.strength?.perWeek).toBe(2)
	const response = await preferencesAction({
		...ARGS,
		request: post(
			'/start/okter',
			[
				['level', 'experienced'],
				['hours', '7'],
				['discipline', 'run'],
				...['0', '1', '3', '4', '6'].map((day): [string, string] => [
					'days',
					day,
				]),
				['strength', '2'],
				['preferences', 'long'],
			],
			cookie,
		),
	}).catch((thrown: unknown) => thrown)
	expect(response).toBeInstanceOf(Response)
	const location = (response as Response).headers.get('location') ?? ''
	expect(location).toMatch(/^\/start\/valg\?/)
	expect(new URLSearchParams(location.split('?')[1]).get('strength')).toBe('2')
})

test('each card counts its lifting beside the hours, shows its lifts, and says the frequency is the athlete’s', async () => {
	const { cookie } = await setUp()
	const data = await loader({
		...ARGS,
		request: get(`/start/valg?${ANSWERS}&strength=2`, cookie),
	})
	expect(data.answers.strength).toBe(2)
	for (const card of data.cards) {
		expect(card.strength).toBe('+2 styrkeøkter')
		expect(card.strengthNotes).toEqual([
			'Styrke 2 ganger i uka, som du valgte.',
		])
		const lifting = card.days.flatMap((day) => day.lifting)
		expect(lifting).toHaveLength(2)
		expect(lifting[0]!.lifts).toContain('Planke')
		// The hours are the endurance hours.
		expect(card.total).toBe('7 t i uka')
	}
	const without = await loader({
		...ARGS,
		request: get(`/start/valg?${ANSWERS}`, cookie),
	})
	for (const card of without.cards) {
		expect(card.strength).toBeNull()
		expect(card.days.flatMap((day) => day.lifting)).toEqual([])
	}
})

test('only a Nybegynner is told the lifts count in the session cap; above it they come on top', async () => {
	const { cookie } = await setUp()
	const beginner = await loader({
		...ARGS,
		request: get(
			'/start/valg?level=beginner&hours=4&discipline=run&days=0,1,2,3,4,5&strength=1',
			cookie,
		),
	})
	expect(beginner.notes).toContain(
		'Som nybegynner får du høyst 4 økter i uka, styrke medregnet, så utholdenheten får 3.',
	)
	const experienced = await loader({
		...ARGS,
		request: get(`/start/valg?${ANSWERS}&strength=3`, cookie),
	})
	expect(experienced.notes.join(' ')).not.toMatch(/styrke/i)
})

test('Velg denne with styrke makes the lifting and keeps the tap; Meg changes it', async () => {
	const { userId, cookie } = await setUp()
	const response = await action({
		...ARGS,
		request: post(
			'/start/valg',
			[
				['level', 'experienced'],
				['hours', '7'],
				['discipline', 'run'],
				...[0, 1, 3, 4, 6].map((day): [string, string] => [
					'days',
					String(day),
				]),
				['strength', '2'],
				['family', 'polarized'],
			],
			cookie,
		),
	})
	expect(response).toBeInstanceOf(Response)
	expect(
		await prisma.trainingTrack.count({
			where: { outline: { athleteId: userId }, discipline: 'strength' },
		}),
	).toBe(1)

	const meg = await strengthSettingsLoader({
		...ARGS,
		request: get('/settings/training/styrke', cookie),
	})
	expect(meg.strengthPerWeek).toBe(2)

	const saved = await strengthSettingsAction({
		...ARGS,
		request: post('/settings/training/styrke', [['strength', '3']], cookie),
	})
	expect(saved).toEqual({ ok: true, error: null })
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBe(3)

	const refused = await strengthSettingsAction({
		...ARGS,
		request: post('/settings/training/styrke', [['strength', '7']], cookie),
	})
	expect(refused).toMatchObject({ init: { status: 400 } })
})
