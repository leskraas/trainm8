import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { addDays, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import { type ProposalPayload } from '#app/utils/load/week-replan-proposal.ts'
import { recordProposals } from '#app/utils/load/week-replan-proposals.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './week-change.tsx'

// The Ukeskiftet card's answers (#505 stories 4–6, 45–46, 51, 55; ADR 0080):
// every intent reaches its server function for the athlete's own rows, and
// never for another athlete's. The clock is the real one, because the route
// reads it: the closed week is whichever closed last in UTC, and every session
// is placed a day or more ahead of now, so it is always still ahead.

const ROUTE_PATH = '/resources/week-change'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const CLOSED = lastClosedWeekKey(new Date(), 'UTC')
const COMING = addDays(CLOSED, 7)

async function athlete() {
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
	const replan = await prisma.weekReplan.create({
		data: {
			athleteId: session.userId,
			weekKey: CLOSED,
			outcome: 'proposed',
			reason: 'Forrige uke ble tyngre enn planlagt.',
		},
		select: { id: true },
	})
	return {
		userId: session.userId,
		replanId: replan.id,
		cookie: await getSessionCookieHeader(session),
	}
}

/** A one-hour run, `days` ahead of now; the machine's unless said otherwise. */
async function run(
	userId: string,
	{ days = 2, source = 'generated', title = 'Rolig tur' } = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title,
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
			// On the hour: a move keeps the local time of day to the minute.
			scheduledAt: new Date(
				Math.floor(Date.now() / HOUR_MS) * HOUR_MS + days * DAY_MS,
			),
			status: 'scheduled',
			source,
		},
		select: { id: true, scheduledAt: true },
	})
}

async function propose(
	userId: string,
	replanId: string,
	payload: ProposalPayload,
	targetSessionId: string | null,
) {
	await prisma.$transaction((tx) =>
		recordProposals(
			tx,
			userId,
			[{ payload, targetSessionId, targetWeekKey: COMING, reason: 'Fordi.' }],
			replanId,
		),
	)
	return prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: userId },
		orderBy: { createdAt: 'desc' },
		select: { id: true },
	})
}

function post(entries: Record<string, string>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: {
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams(entries).toString(),
	})
}

type Reply = {
	data: {
		submission: {
			status?: string
			error?: Record<string, string[] | null> | null
		}
		result: { ok: boolean; reason?: string; applied?: boolean } | null
		weekChange: { open: boolean; proposals: Array<{ answer: string }> } | null
	}
	init: { status: number }
}

async function send(entries: Record<string, string>, cookie: string) {
	return (await action({ ...ARGS, request: post(entries, cookie) })) as Reply
}

async function stepSeconds(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: { workout: { select: { blocks: { select: { steps: true } } } } },
	})
	return session.workout!.blocks[0]!.steps[0]!.durationSec
}

async function proposalRow(id: string) {
	return prisma.weekReplanProposal.findUniqueOrThrow({
		where: { id },
		select: { answer: true, appliedAt: true, scope: true, payload: true },
	})
}

test('Ok applies a proposal and hands back the card as it now stands', async () => {
	const { userId, replanId, cookie } = await athlete()
	const session = await run(userId)
	const proposal = await propose(
		userId,
		replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)

	const reply = await send(
		{ intent: 'answer', proposalId: proposal.id, answer: 'accepted' },
		cookie,
	)

	expect(reply.init.status).toBe(200)
	expect(reply.data.result).toEqual({ ok: true, applied: true })
	expect(await stepSeconds(session.id)).toBe(3240)
	// The last answer closes the card, and the reply still carries it.
	expect(reply.data.weekChange).toMatchObject({
		open: false,
		proposals: [{ answer: 'accepted' }],
	})
})

test('Nei takk changes nothing and records the answer', async () => {
	const { userId, replanId, cookie } = await athlete()
	const session = await run(userId)
	const proposal = await propose(
		userId,
		replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)

	const reply = await send(
		{ intent: 'answer', proposalId: proposal.id, answer: 'declined' },
		cookie,
	)

	expect(reply.data.result).toEqual({ ok: true, applied: false })
	expect(await stepSeconds(session.id)).toBe(3600)
	expect(await proposalRow(proposal.id)).toMatchObject({
		answer: 'declined',
		appliedAt: null,
	})
})

test('a move answered "fra nå av" moves the later sessions of its slot too', async () => {
	const { userId, replanId, cookie } = await athlete()
	const session = await run(userId, { days: 2, title: 'Terskel' })
	const later = await run(userId, { days: 9, title: 'Terskel' })
	const fromDate = session.scheduledAt.toISOString().slice(0, 10)
	// "Fra nå av" moves a slot within its own week: a day later, or a day
	// earlier from a Sunday.
	const moveBy = weekdayIndex(fromDate) === 6 ? -1 : 1
	const proposal = await propose(
		userId,
		replanId,
		{
			kind: 'move',
			fromDate,
			toDate: addDays(fromDate, moveBy),
			makeUp: false,
		},
		session.id,
	)

	const reply = await send(
		{
			intent: 'answer',
			proposalId: proposal.id,
			answer: 'accepted',
			scope: 'from-now-on',
		},
		cookie,
	)

	expect(reply.data.result).toEqual({ ok: true, applied: true })
	expect((await proposalRow(proposal.id)).scope).toBe('from-now-on')
	const moved = await prisma.workoutSession.findMany({
		where: { id: { in: [session.id, later.id] } },
		select: { id: true, scheduledAt: true },
	})
	for (const row of moved) {
		const was = row.id === session.id ? session : later
		expect(row.scheduledAt.getTime() - was.scheduledAt.getTime()).toBe(
			moveBy * DAY_MS,
		)
	}
})

test('a scope on anything but a move is refused, and nothing is written', async () => {
	const { userId, replanId, cookie } = await athlete()
	const session = await run(userId)
	const proposal = await propose(
		userId,
		replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)

	const reply = await send(
		{
			intent: 'answer',
			proposalId: proposal.id,
			answer: 'accepted',
			scope: 'from-now-on',
		},
		cookie,
	)

	expect(reply.init.status).toBe(409)
	expect(reply.data.result).toEqual({ ok: false, reason: 'scope-not-a-move' })
	expect(await stepSeconds(session.id)).toBe(3600)
})

test('Ok on the next round takes the factor the athlete chose', async () => {
	const { userId, replanId, cookie } = await athlete()
	const proposal = await propose(
		userId,
		replanId,
		{
			kind: 'add-phase',
			outlineId: 'no-such-outline',
			afterPhaseId: 'no-such-phase',
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			factor: 1.05,
		},
		null,
	)

	const reply = await send(
		{ intent: 'accept-round', proposalId: proposal.id, factor: '1' },
		cookie,
	)

	expect(reply.data.result?.ok).toBe(true)
	const row = await proposalRow(proposal.id)
	expect(row.answer).toBe('accepted')
	expect(JSON.parse(row.payload)).toMatchObject({ factor: 1 })
})

test('a round factor outside the allowed range never reaches the plan', async () => {
	const { userId, replanId, cookie } = await athlete()
	const proposal = await propose(
		userId,
		replanId,
		{
			kind: 'add-phase',
			outlineId: 'o',
			afterPhaseId: 'p',
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			factor: 1.05,
		},
		null,
	)
	const reply = await send(
		{ intent: 'accept-round', proposalId: proposal.id, factor: '3' },
		cookie,
	)
	// Refused by the shared schema, as the form's error: nothing is answered.
	expect(reply.init.status).toBe(400)
	expect(reply.data.result).toBeNull()
	expect(reply.data.submission).toMatchObject({
		status: 'error',
		error: { factor: ['factor-out-of-range'] },
	})
	expect((await proposalRow(proposal.id)).answer).toBe('pending')
})

test('each intent requires what its answer needs: an Ok without an answer is refused', async () => {
	const { userId, replanId, cookie } = await athlete()
	const session = await run(userId)
	const proposal = await propose(
		userId,
		replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)
	const noAnswer = await send(
		{ intent: 'answer', proposalId: proposal.id },
		cookie,
	)
	expect(noAnswer.init.status).toBe(400)
	expect(noAnswer.data.submission.error).toHaveProperty('answer')
	const noFactor = await send(
		{ intent: 'accept-round', proposalId: proposal.id },
		cookie,
	)
	expect(noFactor.init.status).toBe(400)
	expect(noFactor.data.submission.error).toHaveProperty('factor')
	expect(await stepSeconds(session.id)).toBe(3600)
})

test('"Gjør uka lettere" eases the coming week once, with before and after', async () => {
	const { userId, cookie } = await athlete()
	// A session in the coming week that is still ahead: its Sunday evening.
	const session = await run(userId, { days: 0 })
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { scheduledAt: new Date(`${addDays(COMING, 6)}T22:00:00.000Z`) },
	})

	const first = (await action({
		...ARGS,
		request: post({ intent: 'ease', weekKey: COMING }, cookie),
	})) as {
		data: {
			result: {
				ok: true
				before: { durationMin: number }
				after: { durationMin: number }
			}
		}
	}
	expect(first.data.result).toMatchObject({
		ok: true,
		before: { durationMin: 60 },
		after: { durationMin: 51 },
	})
	expect(await stepSeconds(session.id)).toBe(3060)

	const again = await send({ intent: 'ease', weekKey: COMING }, cookie)
	expect(again.init.status).toBe(409)
	expect(again.data.result).toEqual({ ok: false, reason: 'already-eased' })
	// The refusal comes back as the form's error, in the athlete's words.
	expect(again.data.submission.error).toEqual({
		'': ['Uka er allerede gjort lettere.'],
	})
	expect(await stepSeconds(session.id)).toBe(3060)
})

test('"Gjør uka lettere" refuses any week but the coming one', async () => {
	const { userId, cookie } = await athlete()
	const session = await run(userId, { days: 0 })
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { scheduledAt: new Date(`${addDays(COMING, 13)}T22:00:00.000Z`) },
	})
	for (const weekKey of [CLOSED, addDays(COMING, 7)]) {
		const reply = await send({ intent: 'ease', weekKey }, cookie)
		expect(reply.init.status).toBe(409)
		expect(reply.data.result).toEqual({
			ok: false,
			reason: 'not-the-coming-week',
		})
	}
	expect(await stepSeconds(session.id)).toBe(3600)
})

test('another athlete’s proposal is not found, and nothing moves', async () => {
	const owner = await athlete()
	const stranger = await athlete()
	const session = await run(owner.userId, { source: 'authored' })
	const proposal = await propose(
		owner.userId,
		owner.replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)

	const answer = await send(
		{ intent: 'answer', proposalId: proposal.id, answer: 'accepted' },
		stranger.cookie,
	)
	expect(answer.init.status).toBe(404)
	const round = await send(
		{ intent: 'accept-round', proposalId: proposal.id, factor: '1' },
		stranger.cookie,
	)
	expect(round.init.status).toBe(404)

	expect(await proposalRow(proposal.id)).toMatchObject({
		answer: 'pending',
		appliedAt: null,
	})
	expect(await stepSeconds(session.id)).toBe(3600)
})

test('a request with no signed-in athlete, or no intent, is turned away', async () => {
	const { userId, replanId } = await athlete()
	const session = await run(userId)
	const proposal = await propose(
		userId,
		replanId,
		{ kind: 'scale', factor: 0.9 },
		session.id,
	)
	await expect(
		action({
			...ARGS,
			request: post(
				{ intent: 'answer', proposalId: proposal.id, answer: 'accepted' },
				'',
			),
		}),
	).rejects.toBeInstanceOf(Response)
	expect((await proposalRow(proposal.id)).answer).toBe('pending')
})
