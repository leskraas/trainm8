import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './session-annet.tsx'

// _Tell i Annet_ / _Tell i sporet_ from a row on I dag (#505 story 33): the
// tap reaches `setCountsInNoTrack`, and only for the athlete's own session.

const ROUTE_PATH = '/resources/session-annet'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function athlete() {
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
	const ride = await prisma.workoutSession.create({
		data: {
			userId: session.userId,
			scheduledAt: new Date(),
			status: 'completed',
			source: 'recorded',
		},
		select: { id: true },
	})
	return {
		userId: session.userId,
		rideId: ride.id,
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

async function countsInNoTrack(id: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id },
			select: { countsInNoTrack: true },
		})
	).countsInNoTrack
}

test('the athlete moves their own session into Annet, and back', async () => {
	const { rideId, cookie } = await athlete()

	const into = (await action({
		...ARGS,
		request: post(
			[
				['sessionId', rideId],
				['countsInNoTrack', 'true'],
			],
			cookie,
		),
	})) as { data: { ok: boolean } }
	expect(into.data.ok).toBe(true)
	expect(await countsInNoTrack(rideId)).toBe(true)

	await action({
		...ARGS,
		request: post(
			[
				['sessionId', rideId],
				['countsInNoTrack', 'false'],
			],
			cookie,
		),
	})
	expect(await countsInNoTrack(rideId)).toBe(false)
})

test('another athlete’s session is not found, and does not move', async () => {
	const owner = await athlete()
	const stranger = await athlete()

	const reply = (await action({
		...ARGS,
		request: post(
			[
				['sessionId', owner.rideId],
				['countsInNoTrack', 'true'],
			],
			stranger.cookie,
		),
	})) as { data: { ok: boolean }; init: { status: number } }
	expect(reply.init.status).toBe(404)
	expect(await countsInNoTrack(owner.rideId)).toBe(false)
})

test('a request with no signed-in athlete is turned away', async () => {
	const { rideId } = await athlete()
	await expect(
		action({
			...ARGS,
			request: post(
				[
					['sessionId', rideId],
					['countsInNoTrack', 'true'],
				],
				'',
			),
		}),
	).rejects.toBeInstanceOf(Response)
	expect(await countsInNoTrack(rideId)).toBe(false)
})

test('a malformed request is refused before anything is written', async () => {
	const { rideId, cookie } = await athlete()
	await expect(
		action({
			...ARGS,
			request: post(
				[
					['sessionId', rideId],
					['countsInNoTrack', 'maybe'],
				],
				cookie,
			),
		}),
	).rejects.toMatchObject({ status: 400 })
	expect(await countsInNoTrack(rideId)).toBe(false)
})
