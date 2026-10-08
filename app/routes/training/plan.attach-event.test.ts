import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ATTACH_EVENT_LABELS } from '#app/utils/labels.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './plan.tsx'

// _Legg til et løp_ through the plan page's action (#505 stories 7–8): what a
// refusal answers with, and that a refused race never stays on the calendar.

const ROUTE_PATH = '/training/plan'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

type Reply = {
	data: {
		intent: string
		result: {
			status: string
			error?: Record<string, string[] | null>
			initialValue?: Record<string, unknown>
		}
	}
	init: { status: number }
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
	const plan = await createOpenEndedPlan(session.userId, {
		discipline: 'run',
		weeklyHours: 4,
	})
	if (!plan.ok) throw new Error(plan.reason)
	return {
		userId: session.userId,
		outlineId: plan.outlineId,
		cookie: await getSessionCookieHeader(session),
	}
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

const inWeeks = (weeks: number) =>
	new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10)

test('a refused race is answered in the form, with what was typed, and leaves no race behind', async () => {
	const { userId, outlineId, cookie } = await setUp()

	const reply = (await action({
		request: post(
			[
				['intent', 'attach-event'],
				['outlineId', outlineId],
				['name', 'Gammelt løp'],
				['startDate', '2020-05-01'],
			],
			cookie,
		),
		...ARGS,
	})) as Reply

	expect(reply.init.status).toBe(400)
	expect(reply.data.intent).toBe('attach-event')
	expect(reply.data.result.error?.['']).toEqual([
		'Det løpet har allerede vært.',
	])
	expect(reply.data.result.initialValue).toMatchObject({
		name: 'Gammelt løp',
		startDate: '2020-05-01',
	})
	expect(await prisma.event.count({ where: { athleteId: userId } })).toBe(0)
	expect(
		(await prisma.planOutline.findUniqueOrThrow({ where: { id: outlineId } }))
			.eventId,
	).toBeNull()
})

test('choosing an Event and naming a race at once is refused on the field', async () => {
	const { userId, outlineId, cookie } = await setUp()

	const reply = (await action({
		request: post(
			[
				['intent', 'attach-event'],
				['outlineId', outlineId],
				['eventId', 'some-event'],
				['name', 'Vårmilen'],
				['startDate', inWeeks(10)],
			],
			cookie,
		),
		...ARGS,
	})) as Reply

	expect(reply.init.status).toBe(400)
	expect(reply.data.result.error?.eventId).toEqual([
		ATTACH_EVENT_LABELS.notBoth,
	])
	expect(await prisma.event.count({ where: { athleteId: userId } })).toBe(0)
})

test('neither an Event nor a race is refused with what to do', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = (await action({
		request: post(
			[
				['intent', 'attach-event'],
				['outlineId', outlineId],
			],
			cookie,
		),
		...ARGS,
	})) as Reply

	expect(reply.data.result.error?.['']).toEqual([ATTACH_EVENT_LABELS.pickOne])
})

test('a race named on the spot is made, and the plan runs toward it', async () => {
	const { userId, outlineId, cookie } = await setUp()

	const response = await action({
		request: post(
			[
				['intent', 'attach-event'],
				['outlineId', outlineId],
				['name', 'Vårmilen'],
				['startDate', inWeeks(10)],
			],
			cookie,
		),
		...ARGS,
	}).catch((thrown: unknown) => thrown)

	expect(response).toBeInstanceOf(Response)
	const event = await prisma.event.findFirstOrThrow({
		where: { athleteId: userId },
		select: { id: true, name: true, kind: true, disciplines: true },
	})
	expect(event).toMatchObject({
		name: 'Vårmilen',
		kind: 'race',
		disciplines: '["run"]',
	})
	expect((response as Response).headers.get('location')).toBe(
		`/training/plan?event=${event.id}`,
	)
	expect(
		(await prisma.planOutline.findUniqueOrThrow({ where: { id: outlineId } }))
			.eventId,
	).toBe(event.id)
})
