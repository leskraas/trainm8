import { invariant } from '@epic-web/invariant'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action, loader } from './strength-log.tsx'

// The quick strength log from a row on I dag (#505 stories 83–84): the tap
// reaches `logStrengthSession`, and only for the athlete's own session.

const ROUTE_PATH = '/resources/strength-log'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

/** An athlete with this morning's gym day: two squats at 80 kg. */
async function athlete() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { weightKg: 80, timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	const squat = await prisma.exercise.create({
		data: {
			name: 'Back Squat',
			primaryMuscle: 'quads',
			equipment: 'barbell',
			isCompound: true,
		},
		select: { id: true },
	})
	const workout = await prisma.workout.create({
		data: {
			title: 'Styrke A',
			discipline: 'strength',
			intent: 'strength',
			ownerId: session.userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: squat.id,
									sets: {
										create: [0, 1].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'absolute', kg: 80 }),
										})),
									},
								},
							],
						},
					},
				],
			},
		},
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
	})
	const today = new Date()
	today.setUTCHours(0, 30, 0, 0)
	const own = await prisma.workoutSession.create({
		data: {
			userId: session.userId,
			workoutId: workout.id,
			scheduledAt: today,
			source: 'authored',
		},
		select: { id: true },
	})
	const step = workout.blocks[0]?.steps[0]
	invariant(step, 'the gym day has its squat')
	return {
		sessionId: own.id,
		stepId: step.id,
		cookie: await getSessionCookieHeader(session),
	}
}

function post(entries: Record<string, string>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: {
		result: { ok: boolean; alreadyLogged?: boolean; reason?: string } | null
		submission: { status?: string; error?: Record<string, string[]> }
	}
	init: { status: number; headers?: HeadersInit } | null
}

async function setReps(sessionId: string) {
	return (
		await prisma.exerciseSetLog.findMany({
			where: { sessionId },
			orderBy: { orderIndex: 'asc' },
			select: { reps: true },
		})
	).map((set) => set.reps)
}

test('Som planlagt logs the session, says so in a toast, and a second tap writes nothing', async () => {
	const { sessionId, cookie } = await athlete()

	const reply = (await action({
		...ARGS,
		request: post({ intent: 'as-planned', sessionId }, cookie),
	})) as Reply
	expect(reply.data.result).toMatchObject({ ok: true, alreadyLogged: false })
	expect(new Headers(reply.init?.headers).get('set-cookie')).toContain(
		'en_toast',
	)
	expect(await setReps(sessionId)).toEqual([5, 5])

	const again = (await action({
		...ARGS,
		request: post({ intent: 'as-planned', sessionId }, cookie),
	})) as Reply
	expect(again.data.result).toMatchObject({ ok: true, alreadyLogged: true })
	expect(await setReps(sessionId)).toEqual([5, 5])
})

test('Endre posts each set’s count; an empty one was not done', async () => {
	const { sessionId, stepId, cookie } = await athlete()

	const reply = (await action({
		...ARGS,
		request: post(
			{
				intent: 'edited',
				sessionId,
				'sets[0].stepId': stepId,
				'sets[0].orderIndex': '0',
				'sets[0].count': '4',
				'sets[1].stepId': stepId,
				'sets[1].orderIndex': '1',
				'sets[1].count': '',
			},
			cookie,
		),
	})) as Reply
	expect(reply.data.result).toMatchObject({ ok: true })
	expect(await setReps(sessionId)).toEqual([4])
})

test('the plan reads pre-filled for the athlete, and as nothing for anyone else', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const url = new URL(
		`${ROUTE_PATH}?sessionId=${owner.sessionId}`,
		BASE_URL,
	).toString()

	const own = await loader({
		...ARGS,
		request: new Request(url, { headers: { cookie: owner.cookie } }),
	})
	expect(own.quickLog?.lifts[0]).toMatchObject({
		name: 'Back Squat',
		scheme: '2×5',
		loadLabel: '80 kg',
	})
	const theirs = await loader({
		...ARGS,
		request: new Request(url, { headers: { cookie: stranger.cookie } }),
	})
	expect(theirs.quickLog).toBeNull()
})

test('another athlete’s session is not found, and nothing is logged', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const reply = (await action({
		...ARGS,
		request: post(
			{ intent: 'as-planned', sessionId: owner.sessionId },
			stranger.cookie,
		),
	})) as Reply
	expect(reply.init?.status).toBe(404)
	expect(reply.data.submission.error?.['']).toEqual([
		'Fant ikke økta. Den kan være slettet.',
	])
	expect(await setReps(owner.sessionId)).toEqual([])
})

test('a malformed post is refused as the form’s error', async () => {
	const { sessionId, cookie } = await athlete()
	const reply = (await action({
		...ARGS,
		request: post({ intent: 'edited', sessionId }, cookie),
	})) as Reply
	expect(reply.init?.status).toBe(400)
	expect(reply.data.submission.status).toBe('error')
	expect(await setReps(sessionId)).toEqual([])
})
