import * as Sentry from '@sentry/react-router'
import { type AppLoadContext } from 'react-router'
import { expect, test, vi } from 'vitest'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_FAILURE_LABELS } from '#app/utils/labels.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './week-change.tsx'

// When an answer's action throws (ADR 0092 §5's `unknown`), the card stays
// where it is: the athlete reads a Norwegian sentence telling them to look
// before trying again, the card comes back as it now stands, and the error
// reaches Sentry rather than only the server log.

vi.mock('@sentry/react-router', async (original) => ({
	...(await original<typeof Sentry>()),
	captureException: vi.fn(),
}))
vi.mock('#app/utils/load/week-replan-answers.server.ts', () => ({
	answerProposal: vi.fn(),
	acceptRoundWithFactor: vi.fn(),
	easeWeek: vi.fn().mockRejectedValue(new Error('lost mid-write')),
}))

const ROUTE_PATH = '/resources/week-change'

test('a write that throws keeps the card, says so in Norwegian, and reaches Sentry', async () => {
	consoleError.mockImplementation(() => {})
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
	const cookie = await getSessionCookieHeader(session)
	const weekKey = addDays(lastClosedWeekKey(new Date(), 'UTC'), 7)

	const reply = (await action({
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: ROUTE_PATH,
		request: new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
			method: 'POST',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({ intent: 'ease', weekKey }).toString(),
		}),
	})) as {
		data: {
			submission: { error?: Record<string, string[] | null> | null }
			result: unknown
			weekChange: unknown
		}
		init: { status: number }
	}

	expect(reply.init.status).toBe(500)
	expect(reply.data.submission.error?.['']).toEqual([
		ACTION_FAILURE_LABELS.unknown,
	])
	expect(reply.data.result).toBeNull()
	expect(reply.data).toHaveProperty('weekChange')
	expect(vi.mocked(Sentry.captureException)).toHaveBeenCalledOnce()
})
