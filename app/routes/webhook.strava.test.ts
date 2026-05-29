import { createHmac } from 'node:crypto'
import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { BASE_URL } from '#tests/utils.ts'
import { action, loader } from './webhook.strava.tsx'

const ROUTE_PATH = '/webhook/strava'
const SIGNING_SECRET = process.env.STRAVA_WEBHOOK_SIGNING_SECRET!
const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!

function verificationRequest(params: Record<string, string>) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value)
	}
	return new Request(url.toString(), { method: 'GET' })
}
const ACTION_ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

function sign(rawBody: string) {
	return createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex')
}

function eventRequest(
	event: Record<string, unknown>,
	{ signature }: { signature?: string } = {},
) {
	const rawBody = JSON.stringify(event)
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-strava-signature': signature ?? sign(rawBody),
		},
		body: rawBody,
	})
}

const ACTIVITY_CREATE_EVENT = {
	object_type: 'activity',
	object_id: 1001,
	aspect_type: 'create',
	owner_id: 12345678,
	subscription_id: 1,
	event_time: 1700000000,
}

test('GET subscription verification echoes the challenge when the verify token matches', async () => {
	const response = await loader({
		request: verificationRequest({
			'hub.mode': 'subscribe',
			'hub.verify_token': VERIFY_TOKEN,
			'hub.challenge': 'abc123challenge',
		}),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	await expect(response.json()).resolves.toEqual({
		'hub.challenge': 'abc123challenge',
	})
})

test('GET subscription verification is rejected when the verify token does not match', async () => {
	const response = await loader({
		request: verificationRequest({
			'hub.mode': 'subscribe',
			'hub.verify_token': 'wrong-token',
			'hub.challenge': 'abc123challenge',
		}),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(403)
})

test('an event with a bad signature is rejected with 403 and enqueues nothing', async () => {
	const response = await action({
		request: eventRequest(ACTIVITY_CREATE_EVENT, { signature: 'deadbeef' }),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(403)
	const jobs = await prisma.job.count({ where: { kind: 'strava-webhook' } })
	expect(jobs).toBe(0)
})

test('a validly-signed event is accepted and enqueues a fetch job', async () => {
	const response = await action({
		request: eventRequest(ACTIVITY_CREATE_EVENT),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	const jobs = await prisma.job.findMany({ where: { kind: 'strava-webhook' } })
	expect(jobs).toHaveLength(1)
	const payload = JSON.parse(jobs[0]!.payload) as Record<string, unknown>
	expect(payload).toMatchObject({
		objectType: 'activity',
		objectId: '1001',
		aspectType: 'create',
		ownerId: '12345678',
	})
})
