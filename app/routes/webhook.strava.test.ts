import { type AppLoadContext } from 'react-router'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { BASE_URL } from '#tests/utils.ts'
import { action, loader } from './webhook.strava.tsx'

const ROUTE_PATH = '/webhook/strava'
const VERIFY_TOKEN = 'test-verify-token'

// The webhook integration is gated on the verify token. It's optional in a
// developer's .env, so the test owns it rather than depending on the ambient
// environment (this also makes the suite deterministic regardless of .env).
const originalVerifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
beforeAll(() => {
	process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN
})
afterAll(() => {
	if (originalVerifyToken === undefined) {
		delete process.env.STRAVA_WEBHOOK_VERIFY_TOKEN
	} else {
		process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = originalVerifyToken
	}
})

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

function eventRequest(body: string | Record<string, unknown>) {
	const rawBody = typeof body === 'string' ? body : JSON.stringify(body)
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
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

// Restore any per-test env overrides so the shared process env stays clean.
afterEach(() => {
	delete process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID
})

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

test('an unparseable body is acknowledged with 200 and enqueues nothing', async () => {
	const response = await action({
		request: eventRequest('this is not json'),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	const jobs = await prisma.job.count({ where: { kind: 'strava-webhook' } })
	expect(jobs).toBe(0)
})

test('a schema-invalid body is acknowledged with 200 and enqueues nothing', async () => {
	const response = await action({
		request: eventRequest({ not: 'a strava event' }),
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	const jobs = await prisma.job.count({ where: { kind: 'strava-webhook' } })
	expect(jobs).toBe(0)
})

test('a valid event is accepted and enqueues a fetch job', async () => {
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

test('an event for a different subscription id is ignored when one is configured', async () => {
	process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '999'

	const response = await action({
		request: eventRequest(ACTIVITY_CREATE_EVENT), // subscription_id: 1
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	const jobs = await prisma.job.count({ where: { kind: 'strava-webhook' } })
	expect(jobs).toBe(0)
})

test('an event matching the configured subscription id is accepted', async () => {
	process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = '1'

	const response = await action({
		request: eventRequest(ACTIVITY_CREATE_EVENT), // subscription_id: 1
		...ACTION_ARGS_BASE,
	})

	expect(response.status).toBe(200)
	const jobs = await prisma.job.count({ where: { kind: 'strava-webhook' } })
	expect(jobs).toBe(1)
})
