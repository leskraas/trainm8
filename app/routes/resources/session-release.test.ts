import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './session-release.tsx'

// _Lås opp_ from a row on I dag (#505 story 55): the tap reaches
// `releaseSession`, and only for the athlete's own session.

const ROUTE_PATH = '/resources/session-release'
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
	const own = await prisma.workoutSession.create({
		data: {
			userId: session.userId,
			scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
			status: 'scheduled',
			source: 'authored',
		},
		select: { id: true },
	})
	return { ownId: own.id, cookie: await getSessionCookieHeader(session) }
}

function post(entries: Record<string, string>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: { result: { ok: boolean } | null; submission: { status?: string } }
	init: { status: number }
}

async function releasedAt(id: string) {
	return (
		await prisma.workoutSession.findUniqueOrThrow({
			where: { id },
			select: { releasedAt: true },
		})
	).releasedAt
}

test('the athlete hands their own session back to the app', async () => {
	const { ownId, cookie } = await athlete()
	const reply = (await action({
		...ARGS,
		request: post({ sessionId: ownId }, cookie),
	})) as Reply
	expect(reply.data.result).toEqual({ ok: true, released: true })
	expect(await releasedAt(ownId)).not.toBeNull()
})

test('another athlete’s session is not found, and stays theirs', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const reply = (await action({
		...ARGS,
		request: post({ sessionId: owner.ownId }, stranger.cookie),
	})) as Reply
	expect(reply.init.status).toBe(404)
	expect(await releasedAt(owner.ownId)).toBeNull()
})

test('a post without a session is refused as the form’s error', async () => {
	const { ownId, cookie } = await athlete()
	const reply = (await action({ ...ARGS, request: post({}, cookie) })) as Reply
	expect(reply.init.status).toBe(400)
	expect(reply.data.submission.status).toBe('error')
	expect(await releasedAt(ownId)).toBeNull()
})
