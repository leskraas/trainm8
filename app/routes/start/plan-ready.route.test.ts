import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	guardedRoundFactor,
	ROUND_STEP_UP,
} from '#app/utils/load/propose-next-round.ts'
import { PLAN_READY_LABELS } from '#app/utils/labels.ts'
import { appendOpenEndedRound } from '#app/utils/plan-outline/open-ended.server.ts'
import { getSeasonForOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './klar.tsx'
import { action as choose } from './valg.tsx'

// _Planen er klar_ (#570) through its loader, after _Velg denne_ made the
// plan: the plain name, the day it begins, the 12-week curve of hours (the
// round as laid, then the two rounds the autopilot would append if every week
// were done to plan), the Sunday sentence and _Under panseret_.

const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: '/start/klar',
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

/** A beginner's three hours of running on Monday, Wednesday and Friday. */
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

async function pick(family: string, cookie: string) {
	return settle(() =>
		choose({
			request: post('/start/valg', choice(family), cookie),
			...ARGS,
			unstable_pattern: '/start/valg',
		}),
	)
}

/** Each week's hours across the plan's tracks, as Sesong reads them. */
async function seasonHours(userId: string, outlineId: string) {
	const season = await getSeasonForOutline(userId, outlineId)
	return season!.weeks.map((week) =>
		week.targets.reduce((sum, target) => sum + (target.value ?? 0), 0),
	)
}

test('Velg denne takes the athlete to Planen er klar: the plain name, the family small and the day the plan begins', async () => {
	const { cookie } = await setUp()
	expect(location(await pick('big-base', cookie))).toBe('/start/klar')

	const ready = await loader({ request: get('/start/klar', cookie), ...ARGS })
	expect(ready.overline).toBe('Planen er klar')
	expect(ready.name).toBe('Bygg grunnform først')
	expect(ready.familyName).toBe('Fagnavn: Stor base')
	expect(ready.startsOn).toMatch(
		/^Planen starter mandag \d{1,2}\. (januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember)\.$/,
	)
	expect(ready.toToday).toBe('/')
})

test('the curve is 12 weeks of hours: the round as laid from the hours given, and two rounds dashed, as the autopilot would append them if every week were done to plan', async () => {
	const { userId, cookie } = await setUp()
	await pick('classic', cookie)
	const ready = await loader({ request: get('/start/klar', cookie), ...ARGS })
	const outline = await prisma.planOutline.findFirstOrThrow({
		where: { athleteId: userId },
		select: { id: true, startWeekKey: true },
	})

	const drawn = ready.curve.points.map((point) => point.target)
	expect(drawn).toHaveLength(12)
	// Week 1 is the hours given (ADR 0091 §3); the round as laid is the plan's
	// own derivation, week for week.
	expect(drawn[0]).toBe(3)
	expect(drawn.slice(0, 4)).toEqual(await seasonHours(userId, outline.id))
	expect(ready.curve.projectedFrom).toBe(4)
	expect(ready.curve.points[0]!.key).toBe(outline.startWeekKey)

	// What the autopilot would append for two rounds done to plan: +5 % each,
	// capped so the round's ramp × the step stays inside the 8 % guard. Append
	// them for real at that factor, and the season reads what was drawn dashed.
	const segments = await prisma.trainingTrackSegment.findMany({
		where: {
			phase: { outlineId: outline.id },
			kind: 'endurance',
			track: { discipline: { not: 'other' } },
		},
		select: { ramp: true },
	})
	const ramps = segments.flatMap((segment) =>
		segment.ramp == null ? [] : [segment.ramp],
	)
	const ramp = ramps.length > 0 ? Math.max(...ramps) : null
	const factor = guardedRoundFactor(ROUND_STEP_UP, ramp)
	// A beginner's 5 % ramp leaves room for 2.85 %, not 5 %.
	expect(factor).toBeLessThan(ROUND_STEP_UP)
	expect((1 + (ramp ?? 0)) * factor).toBeLessThanOrEqual(1.08 + 1e-9)
	for (const round of [2, 3]) {
		const phases = await prisma.planOutlinePhase.findMany({
			where: { outlineId: outline.id },
			orderBy: { orderIndex: 'desc' },
			select: { id: true },
		})
		await prisma.$transaction((tx) =>
			appendOpenEndedRound(
				tx,
				userId,
				{
					kind: 'add-phase',
					outlineId: outline.id,
					afterPhaseId: phases[0]!.id,
					name: `Blokk ${round}`,
					weeks: 4,
					rhythm: '3:1',
					factor,
				},
				{ now: new Date(), timezone: 'UTC' },
			),
		)
	}
	expect(drawn).toEqual(await seasonHours(userId, outline.id))
	// The next round opens higher than the first did.
	expect(drawn[4]!).toBeGreaterThan(drawn[0]!)
	expect(ready.curve.note).toBe(
		PLAN_READY_LABELS.note(Math.round((factor - 1) * 100)),
	)
})

test('Planen er klar says how the plan moves each Sunday, and where to ask the app to check first', async () => {
	const { cookie } = await setUp()
	await pick('polarized', cookie)
	const ready = await loader({ request: get('/start/klar', cookie), ...ARGS })
	expect(ready.sunday).toBe(
		'Hver søndag kveld legger appen ut neste uke, ut fra det du faktisk trente. Du får beskjed om hva den gjorde, og kan angre. Vil du heller at den spør deg først, velger du Spør meg først i Meg.',
	)
})

test('Under panseret reads what was made: the family, open-ended, the rhythm, the track with its starting volume, the Week Pattern and the level', async () => {
	const { cookie } = await setUp()
	await pick('big-base', cookie)
	const { hood } = await loader({
		request: get('/start/klar', cookie),
		...ARGS,
	})
	expect(hood.title).toBe('Under panseret')
	expect(hood.facts).toEqual([
		{ term: 'Filosofi', details: ['Stor base'] },
		{
			term: 'Lengde',
			details: ['Åpen, uten løp og uten sluttdato. Den går blokk for blokk.'],
		},
		{ term: 'Rytme', details: ['3 uker som bygger, så 1 lett'] },
		{ term: 'Spor', details: ['Løping, starter på 3\u00a0t/uke'] },
		{ term: 'Nivå', details: ['Nybegynner'] },
	])
	expect(
		hood.pattern.map((day) => [day.weekday, day.sessions.length > 0]),
	).toEqual([
		['mandag', true],
		['tirsdag', false],
		['onsdag', true],
		['torsdag', false],
		['fredag', true],
		['lørdag', false],
		['søndag', false],
	])
	expect(hood.pattern[0]!.sessions[0]).toMatch(/^Løping · /)
	// The weeks as written: the round laid, its fourth week easy.
	expect(hood.weeks.map((week) => week.easy)).toEqual([
		false,
		false,
		false,
		true,
	])
	expect(hood.weeks[0]!.hours).toBe('3\u00a0t')
})

test('Under panseret also says the strength sessions a week and the Session Preferences the athlete gave', async () => {
	const { cookie } = await setUp()
	await settle(() =>
		choose({
			request: post(
				'/start/valg',
				[
					...choice('big-base'),
					['strength', '2'],
					['preferences', 'long'],
					['preferences', 'short'],
				],
				cookie,
			),
			...ARGS,
			unstable_pattern: '/start/valg',
		}),
	)
	const { hood } = await loader({
		request: get('/start/klar', cookie),
		...ARGS,
	})
	expect(hood.facts.slice(-2)).toEqual([
		{ term: 'Styrke', details: ['2 styrkeøkter i uka'] },
		{
			term: 'Økter du liker',
			details: ['Lange, rolige turer', 'Korte økter'],
		},
	])
})

test('reloading Planen er klar after the plan exists still shows it and never makes a second plan; with no plan it is the start', async () => {
	const { userId, cookie } = await setUp()
	expect(
		location(
			await settle(() =>
				loader({ request: get('/start/klar', cookie), ...ARGS }),
			),
		),
	).toBe('/start/niva')

	await pick('polarized', cookie)
	const first = await loader({ request: get('/start/klar', cookie), ...ARGS })
	const again = await loader({ request: get('/start/klar', cookie), ...ARGS })
	expect(again).toEqual(first)
	// A second Velg denne (a double tap, the back button) makes nothing more.
	await pick('polarized', cookie)
	expect(await prisma.planOutline.count({ where: { athleteId: userId } })).toBe(
		1,
	)
})
