import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	PHILOSOPHY_SWITCH_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	STRENGTH_OFFER_LABELS,
} from '#app/utils/labels.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './plan.tsx'

// _Bytt filosofi_ and the strength offer through the plan page's action
// (#505 stories 12–15): the preview writes nothing, the confirm switches, and
// each refusal is answered in the form.

const ROUTE_PATH = '/training/plan'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

type FormReply = {
	status?: string
	error?: Record<string, string[] | null>
} | null

type Reply = {
	data: {
		philosophy?: {
			result: FormReply
			confirmResult: FormReply
			preview: {
				from: string | null
				to: string
				fromWeekKey: string
				digest: string
				phases: { after: Array<{ name: string; rhythm: string }> }
				weeks: unknown[]
			} | null
		}
		strengthOffer?: { result: FormReply }
	}
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

const outlineOf = (id: string) =>
	prisma.planOutline.findUniqueOrThrow({
		where: { id },
		select: {
			family: true,
			phases: {
				orderBy: { orderIndex: 'asc' },
				select: { name: true, weeks: true, rhythm: true },
			},
		},
	})

/** The action's reply: plain data, or the `data()` wrapper of a refusal. */
function replyOf(value: unknown): Reply {
	return value && typeof value === 'object' && 'init' in value
		? (value as Reply)
		: { data: value as Reply['data'], init: null }
}

test('the preview answers with what would change, and writes nothing', async () => {
	const { outlineId, cookie } = await setUp()
	const before = await outlineOf(outlineId)

	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'preview-philosophy'],
					['outlineId', outlineId],
					['family', 'masters'],
				],
				cookie,
			),
			...ARGS,
		}),
	)

	expect(reply.data.philosophy).toBeDefined()
	expect(reply.data.philosophy?.result?.status).toBe('success')
	expect(reply.data.philosophy?.preview).toMatchObject({
		from: 'classic',
		to: 'masters',
	})
	expect(reply.data.philosophy?.preview?.phases.after.at(-1)?.rhythm).toBe(
		'2:1',
	)
	expect(reply.data.philosophy?.preview?.weeks.length).toBeGreaterThan(0)
	// The rows behind the preview stay on the server.
	expect(reply.data.philosophy?.preview).not.toHaveProperty('rows')
	expect(await outlineOf(outlineId)).toEqual(before)
})

async function previewDigest(outlineId: string, cookie: string) {
	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'preview-philosophy'],
					['outlineId', outlineId],
					['family', 'masters'],
				],
				cookie,
			),
			...ARGS,
		}),
	)
	return reply.data.philosophy!.preview!.digest
}

test('confirming the preview switches the plan, and says so', async () => {
	const { outlineId, cookie } = await setUp()
	const digest = await previewDigest(outlineId, cookie)

	const response = await action({
		request: post(
			[
				['intent', 'switch-philosophy'],
				['outlineId', outlineId],
				['family', 'masters'],
				['digest', digest],
			],
			cookie,
		),
		...ARGS,
	}).catch((thrown: unknown) => thrown)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(ROUTE_PATH)
	const outline = await outlineOf(outlineId)
	expect(outline.family).toBe('masters')
	expect(outline.phases.at(-1)).toMatchObject({ weeks: 3, rhythm: '2:1' })
})

test('no family chosen is refused on the field, and nothing moves', async () => {
	const { outlineId, cookie } = await setUp()
	const before = await outlineOf(outlineId)

	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'preview-philosophy'],
					['outlineId', outlineId],
				],
				cookie,
			),
			...ARGS,
		}),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.philosophy?.result?.error?.family).toEqual([
		PHILOSOPHY_SWITCH_LABELS.pickOne,
	])
	expect(await outlineOf(outlineId)).toEqual(before)
})

test('a confirm that no longer matches its preview is refused under the preview as it stands now', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'switch-philosophy'],
					['outlineId', outlineId],
					['family', 'masters'],
					['digest', 'not-what-was-shown'],
				],
				cookie,
			),
			...ARGS,
		}),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.philosophy?.confirmResult?.error?.['']).toEqual([
		PHILOSOPHY_SWITCH_REFUSAL_LABELS['preview-stale'],
	])
	expect(reply.data.philosophy?.preview?.digest).toBe(
		await previewDigest(outlineId, cookie),
	)
	expect((await outlineOf(outlineId)).family).toBe('classic')
})

test('switching to the philosophy the plan follows is refused in the form', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'preview-philosophy'],
					['outlineId', outlineId],
					['family', 'classic'],
				],
				cookie,
			),
			...ARGS,
		}),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.philosophy?.result?.error?.['']).toEqual([
		PHILOSOPHY_SWITCH_REFUSAL_LABELS['same-family'],
	])
	expect((await outlineOf(outlineId)).family).toBe('classic')
})

test('accepting a strength track with no lifting history is refused, and adds nothing', async () => {
	const { outlineId, cookie } = await setUp()

	const reply = replyOf(
		await action({
			request: post(
				[
					['intent', 'add-strength-track'],
					['outlineId', outlineId],
				],
				cookie,
			),
			...ARGS,
		}),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.strengthOffer?.result?.error?.['']).toEqual([
		STRENGTH_OFFER_LABELS.noHistory,
	])
	expect(
		await prisma.trainingTrack.count({
			where: { outlineId, discipline: 'strength' },
		}),
	).toBe(0)
})

test('accepting the strength offer adds a lifting track with a block, and says so', async () => {
	const { userId, outlineId, cookie } = await setUp()
	// Lifting twice a week over the last four complete weeks.
	const monday = new Date()
	monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 28)
	for (let week = 0; week < 4; week++) {
		for (const offset of [0, 3]) {
			const day = new Date(monday)
			day.setUTCDate(monday.getUTCDate() + week * 7 + offset)
			day.setUTCHours(12)
			const workout = await prisma.workout.create({
				select: { id: true },
				data: {
					title: 'Knebøy',
					discipline: 'strength',
					intent: 'strength',
					ownerId: userId,
					blocks: {
						create: [
							{
								orderIndex: 0,
								steps: {
									create: [
										{
											orderIndex: 0,
											kind: 'strength',
											sets: {
												create: [0, 1, 2].map((i) => ({
													orderIndex: i,
													kind: 'reps',
													reps: 5,
												})),
											},
										},
									],
								},
							},
						],
					},
				},
			})
			await prisma.workoutSession.create({
				data: {
					userId,
					scheduledAt: day,
					status: 'completed',
					workoutId: workout.id,
				},
			})
		}
	}

	const response = await action({
		request: post(
			[
				['intent', 'add-strength-track'],
				['outlineId', outlineId],
			],
			cookie,
		),
		...ARGS,
	}).catch((thrown: unknown) => thrown)

	expect(response).toBeInstanceOf(Response)
	expect((response as Response).headers.get('location')).toBe(ROUTE_PATH)
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId, discipline: 'strength' },
		select: {
			currency: true,
			segments: { select: { kind: true, sessionsPerWeek: true } },
		},
	})
	expect(track).toEqual({
		currency: 'sets',
		segments: [{ kind: 'strength', sessionsPerWeek: 2 }],
	})
})
