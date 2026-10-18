import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { AUTOPILOT_UNDO_REFUSAL_LABELS } from '#app/utils/labels.ts'
import { type ProposalAuthor } from '#app/utils/load/propose-week-change.ts'
import { runWeekChangeForUser } from '#app/utils/load/week-change.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './autopilot.tsx'

// The Autopilot's posts (#576, ADR 0100): the switch in Meg, and _Angre_ /
// _Angre alt_ on the Autopilot Notice — each reaching its server function for
// the athlete's own rows only. The route reads the clock, so Date is faked:
// Sunday evening after the close, then Tuesday, once the week has begun.

const ROUTE_PATH = '/resources/autopilot'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}
const CLOSE = new Date('2030-01-13T20:01:00Z')
const SUNDAY_EVENING = new Date('2030-01-13T21:00:00Z')
const TUESDAY = new Date('2030-01-15T08:00:00Z')

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(SUNDAY_EVENING)
})
afterEach(() => {
	vi.useRealTimers()
})

async function athlete({ autopilot = true } = {}) {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC', autopilot } },
				},
			},
		},
		select: { id: true, userId: true },
	})
	return {
		userId: session.userId,
		cookie: await getSessionCookieHeader(session),
	}
}

async function run(userId: string, scheduledAt: Date) {
	const workout = await prisma.workout.create({
		data: {
			title: 'Rolig tur',
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 3600,
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	return prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
			source: 'generated',
		},
		select: { id: true },
	})
}

const soften: ProposalAuthor = (facts) => ({
	outcome: 'proposed',
	reason: 'Test author.',
	proposals: facts.adjustableSessions.map((session) => ({
		payload: { kind: 'scale' as const, factor: 0.8 },
		targetSessionId: session.id,
		targetWeekKey: facts.targetWeekKey,
		reason: 'Økta er gjort ca. 20 % kortere.',
	})),
})

async function post(cookie: string, fields: Record<string, string>) {
	const response = await action({
		...ARGS,
		request: new Request(`${BASE_URL}${ROUTE_PATH}`, {
			method: 'POST',
			headers: { cookie },
			body: new URLSearchParams(fields),
		}),
	})
	const { init, data } = response as unknown as {
		init: { status?: number } | null
		data: { ok: boolean; toast: string | null }
	}
	return { status: init?.status ?? 200, ...data }
}

async function duration(sessionId: string) {
	const step = await prisma.workoutStep.findFirstOrThrow({
		where: { block: { workout: { sessions: { some: { id: sessionId } } } } },
		select: { durationSec: true },
	})
	return step.durationSec
}

test('the switch in Meg turns autopilot on and back to Spør meg først', async () => {
	const { userId, cookie } = await athlete({ autopilot: false })

	expect(
		await post(cookie, { intent: 'mode', mode: 'autopilot' }),
	).toMatchObject({ status: 200, ok: true })
	expect(
		await prisma.athleteProfile.findUniqueOrThrow({
			where: { userId },
			select: { autopilot: true },
		}),
	).toEqual({ autopilot: true })

	await post(cookie, { intent: 'mode', mode: 'ask' })
	expect(
		await prisma.athleteProfile.findUniqueOrThrow({
			where: { userId },
			select: { autopilot: true },
		}),
	).toEqual({ autopilot: false })
})

test('Angre on one line puts that session back, and says so', async () => {
	const { userId, cookie } = await athlete()
	const session = await run(userId, new Date('2030-01-16T07:00:00Z'))
	await runWeekChangeForUser(userId, CLOSE, soften)
	const proposal = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: userId },
		select: { id: true },
	})

	const reply = await post(cookie, { intent: 'undo', proposalId: proposal.id })

	expect(reply).toMatchObject({
		status: 200,
		ok: true,
		toast: expect.any(String),
	})
	expect(await duration(session.id)).toBe(3600)
})

test('Angre alt is refused once the week has begun, with the sentence why', async () => {
	const { userId, cookie } = await athlete()
	const session = await run(userId, new Date('2030-01-17T07:00:00Z'))
	await runWeekChangeForUser(userId, CLOSE, soften)
	vi.setSystemTime(TUESDAY)

	const reply = await post(cookie, {
		intent: 'undo-week',
		weekKey: '2030-01-07',
	})

	expect(reply).toMatchObject({
		status: 409,
		ok: false,
		toast: AUTOPILOT_UNDO_REFUSAL_LABELS['week-begun'],
	})
	expect(await duration(session.id)).toBe(2880)
})

test('another athlete’s change answers 404 and stays', async () => {
	const owner = await athlete()
	const session = await run(owner.userId, new Date('2030-01-16T07:00:00Z'))
	await runWeekChangeForUser(owner.userId, CLOSE, soften)
	const proposal = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: owner.userId },
		select: { id: true },
	})
	const intruder = await athlete()

	const reply = await post(intruder.cookie, {
		intent: 'undo',
		proposalId: proposal.id,
	})

	expect(reply).toMatchObject({ status: 404, ok: false })
	expect(await duration(session.id)).toBe(2880)
})
