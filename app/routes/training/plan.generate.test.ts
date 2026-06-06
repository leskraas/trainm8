import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './plan.generate.tsx'

const ROUTE_PATH = '/training/plan/generate'

async function setupUser() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					// Trainable days so the stub plan's sessions can be scheduled.
					athleteProfile: {
						create: {
							timezone: 'UTC',
							trainableWeekdays: '[1,3,5]',
							defaultTrainingTime: '18:00',
						},
					},
				},
			},
		},
		select: { id: true, userId: true },
	})
	return session
}

function makeRequest(
	params: Record<string, string | string[]>,
	cookieHeader?: string,
) {
	const url = new URL(ROUTE_PATH, BASE_URL)
	for (const [key, value] of Object.entries(params)) {
		if (Array.isArray(value))
			value.forEach((v) => url.searchParams.append(key, v))
		else url.searchParams.set(key, value)
	}
	const headers = new Headers()
	if (cookieHeader) headers.set('cookie', cookieHeader)
	const controller = new AbortController()
	return {
		request: new Request(url.toString(), {
			method: 'GET',
			headers,
			signal: controller.signal,
		}),
		controller,
	}
}

/** Read the SSE stream until `marker` appears, then abort and return the text. */
async function readUntil(
	response: Response,
	marker: string,
	controller: AbortController,
) {
	const reader = response.body!.getReader()
	const decoder = new TextDecoder()
	let text = ''
	for (let i = 0; i < 200; i++) {
		const { value, done } = await reader.read()
		if (value) text += decoder.decode(value, { stream: true })
		if (text.includes(marker) || done) break
	}
	controller.abort()
	reader.cancel().catch(() => {})
	return text
}

test('streams progress and a plan-preview event with the typed preview', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const { request, controller } = makeRequest(
		{
			discipline: ['run', 'bike'],
			experience: 'intermediate',
			goal: 'Run a sub-2:00 half marathon',
			horizonWeeks: '8',
		},
		cookie,
	)

	const response = await loader({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})
	const text = await readUntil(response, '"outline"', controller)

	expect(text).toContain('event: plan-progress')
	expect(text).toContain('event: plan-preview')

	// The preview payload is a single data line of JSON.
	const dataLine = text
		.split('\n')
		.find((line) => line.startsWith('data:') && line.includes('"outline"'))
	expect(dataLine).toBeTruthy()
	const preview = JSON.parse(dataLine!.replace(/^data:\s*/, '')) as {
		outline: { phases: unknown[] }
		sessions: unknown[]
	}
	expect(preview.outline.phases.length).toBeGreaterThan(0)
	expect(preview.sessions.length).toBeGreaterThan(0)
})

test('rejects an invalid request with a plan-error event', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	const { request, controller } = makeRequest(
		// No disciplines selected → invalid.
		{ experience: 'intermediate', goal: 'Get fit', horizonWeeks: '8' },
		cookie,
	)

	const response = await loader({
		request,
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
	})
	const text = await readUntil(response, 'event: plan-error', controller)

	expect(text).toContain('event: plan-error')
})
