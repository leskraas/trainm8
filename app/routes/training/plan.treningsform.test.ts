import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createFirstRunPlan } from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	type SessionPreference,
	type TrainingLevel,
} from '#app/utils/first-run/start-draft.ts'
import { TRENINGSFORM_LABELS } from '#app/utils/labels.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'
import { createSimpleActivitySession } from '#app/utils/simple-activity.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { cardOf } from '../start/__start-option-card.tsx'
import { action, loader } from './plan.tsx'

// _Bytt treningsform_ through the plan page's loader and action (#581): the
// Start Options shown for what the athlete keeps, the philosophy preview
// asked from the lead, and the switch confirmed under it.

const ROUTE_PATH = '/training/plan'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

type Answers = {
	level: TrainingLevel
	hours: number
	days: PatternWeekday[]
	preferences: SessionPreference[]
}

/** An _Erfaren_ runner who likes intervals and picked _Jevnt og kontrollert hardt_. */
const EXPERIENCED: Answers = {
	level: 'experienced',
	hours: 6,
	// mandag, onsdag, fredag, søndag
	days: [0, 2, 4, 6],
	preferences: ['intervals'],
}

async function setUp(answers: Answers = EXPERIENCED) {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	const created = await createFirstRunPlan(session.userId, {
		discipline: 'run',
		hours: answers.hours,
		days: answers.days,
		family: 'threshold',
		level: answers.level,
		preferences: answers.preferences,
	})
	if (!created.ok) throw new Error(created.reason)
	return {
		userId: session.userId,
		outlineId: created.outlineId,
		cookie: await getSessionCookieHeader(session),
	}
}

function get(cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		headers: { cookie },
	})
}

function post(entries: Array<[string, string]>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: {
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: Record<string, unknown> & {
		treningsform?: {
			result: { status?: string } | null
			confirmResult: { status?: string } | null
			preview: { from: string | null; to: string; digest: string } | null
		}
	}
	init: { status: number } | null
}

function replyOf(value: unknown): Reply {
	return value && typeof value === 'object' && 'init' in value
		? (value as Reply)
		: { data: value as Reply['data'], init: null }
}

const familyOf = async (outlineId: string) =>
	(
		await prisma.planOutline.findUniqueOrThrow({
			where: { id: outlineId },
			select: { family: true },
		})
	).family

async function preview(outlineId: string, cookie: string, family: string) {
	return replyOf(
		await action({
			request: post(
				[
					['intent', 'preview-philosophy'],
					['outlineId', outlineId],
					['family', family],
					['surface', 'treningsform'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
}

test('Bytt treningsform shows the start’s own options for the stored level, preferences and days, the current family marked', async () => {
	const { userId, cookie } = await setUp()

	const result = await loader({ request: get(cookie), ...ARGS })

	// The very cards the start shows for these answers, from the week a
	// switch would begin in: ranked by the intervals preference, distinct.
	const from = await readFirstUnbegunWeekKey(userId, new Date(), 'UTC')
	const start = draftStart({
		level: EXPERIENCED.level,
		discipline: 'run',
		hours: EXPERIENCED.hours,
		days: EXPERIENCED.days,
		preferences: EXPERIENCED.preferences,
		startWeekKey: from,
	})!
	const expected = start.options.map((option) =>
		cardOf(option, null, EXPERIENCED.hours, null),
	)
	const view = result.treningsform!
	expect(view.cards.map((card) => card.family)).toEqual([
		'polarized',
		'threshold',
		'classic',
	])
	expect(view.cards.map(({ badge: _badge, ...card }) => card)).toEqual(
		expected.map(({ badge: _badge, ...card }) => card),
	)
	expect(view.current).toBe('threshold')
	// Passer deg best, as on the start's first card.
	expect(view.cards[0]!.badge).toBe('Passer deg best')
	expect(view.notes).toEqual([])
})

test('an athlete who never said a level is shown a mosjonist’s options, and told so', async () => {
	const { userId, cookie } = await setUp()
	await prisma.athleteProfile.update({
		where: { userId },
		data: { trainingLevel: null },
	})

	const result = await loader({ request: get(cookie), ...ARGS })

	expect(result.treningsform!.notes).toContain(TRENINGSFORM_LABELS.levelUnsaid)
	expect(result.treningsform!.cards.map((card) => card.family)).toEqual([
		'polarized',
		'threshold',
		'classic',
	])
})

test('Velg denne answers with the philosophy preview in the lead, and writes nothing', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = await preview(outlineId, cookie, 'polarized')

	expect(reply.data.treningsform?.result?.status).toBe('success')
	expect(reply.data.treningsform?.preview).toMatchObject({
		from: 'threshold',
		to: 'polarized',
	})
	// Answered in the lead, not under Avansert's Bytt filosofi.
	expect(reply.data).not.toHaveProperty('philosophy')
	expect(await familyOf(outlineId)).toBe('threshold')
})

test('a refused preview is answered in the lead', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = await preview(outlineId, cookie, 'threshold')

	expect(reply.init?.status).toBe(400)
	expect(reply.data.treningsform?.preview).toBeNull()
	expect(reply.data).not.toHaveProperty('philosophy')
})

test('the switch lands only from the preview’s confirm, and leaves the athlete’s own sessions as they were', async () => {
	const { userId, outlineId, cookie } = await setUp()
	const from = await readFirstUnbegunWeekKey(userId, new Date(), 'UTC')

	// A session the athlete wrote, and one of the plan's they took over, in
	// the weeks the switch lays again.
	const written = await createSimpleActivitySession(userId, {
		scheduledAt: new Date(`${weekKeyAt(from, 1)}T17:00:00Z`),
		activity: { kind: 'climb', effortWord: 'middels', durationMin: 90 },
	})
	const laid = await prisma.workoutSession.findFirstOrThrow({
		where: {
			userId,
			planOutlineId: outlineId,
			scheduledAt: { gte: new Date(`${weekKeyAt(from, 1)}T00:00:00Z`) },
		},
		orderBy: { scheduledAt: 'asc' },
		select: { id: true },
	})
	await prisma.workoutSession.update({
		where: { id: laid.id },
		data: { adoptedAt: new Date() },
	})
	const sessionOf = (id: string) =>
		prisma.workoutSession.findUnique({
			where: { id },
			select: {
				scheduledAt: true,
				workoutId: true,
				status: true,
				adoptedAt: true,
			},
		})
	const before = {
		written: await sessionOf(written.sessionId),
		adopted: await sessionOf(laid.id),
	}

	// No digest: no switch.
	const unconfirmed = replyOf(
		await action({
			request: post(
				[
					['intent', 'switch-philosophy'],
					['outlineId', outlineId],
					['family', 'polarized'],
					['surface', 'treningsform'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	expect(unconfirmed.init?.status).toBe(400)
	expect(await familyOf(outlineId)).toBe('threshold')

	const digest = (await preview(outlineId, cookie, 'polarized')).data
		.treningsform!.preview!.digest
	const response = await action({
		request: post(
			[
				['intent', 'switch-philosophy'],
				['outlineId', outlineId],
				['family', 'polarized'],
				['digest', digest],
				['surface', 'treningsform'],
			],
			cookie,
		),
		...ARGS,
	}).catch((thrown: unknown) => thrown)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(ROUTE_PATH)
	expect(await familyOf(outlineId)).toBe('polarized')
	expect(await sessionOf(written.sessionId)).toEqual(before.written)
	expect(await sessionOf(laid.id)).toEqual(before.adopted)

	// The lead now marks the family switched to.
	const result = await loader({ request: get(cookie), ...ARGS })
	expect(result.treningsform!.current).toBe('polarized')
})
