import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import { runWeekChangeForUser } from './week-change.server.ts'
import {
	acceptRoundWithFactor,
	answerProposal,
	easeWeek,
} from './week-replan-answers.server.ts'
import { type ProposalDraft } from './week-replan-proposal.ts'
import {
	applyDueProposals,
	recordProposals,
} from './week-replan-proposals.server.ts'
import { undoProposal } from './week-replan-undo.server.ts'

// Seam for undoing an applied Week Replan proposal (#564, spec #558
// "Autopilot"): a proposal applied by Ok or by silence, and a clock, go in; the
// week as it stands after the undo — read back from the database — comes out.
//
// The clock is injected: Sunday 13 Jan 2030 at 21:00 UTC, after the week
// closed. The coming week (Monday 14 Jan) has not begun; on Tuesday it has.

const CLOSED_WEEK = '2030-01-07'
const COMING_WEEK = '2030-01-14'
const NOW = new Date('2030-01-13T21:00:00.000Z')
const TUESDAY_NOON = new Date('2030-01-15T12:00:00.000Z')
const at = (day: string, time = '08:00') => new Date(`${day}T${time}:00.000Z`)

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone: 'UTC' } },
		},
	})
}

/** A quantified bike session; by default the machine's, on Wednesday. */
async function createSession(
	userId: string,
	{
		title = 'Tempo ride',
		durationSec = 3600,
		source = 'generated',
		status = 'scheduled',
		scheduledAt = at('2030-01-16'),
	} = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline: 'bike',
			intent: 'tempo',
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
									discipline: 'bike',
									durationSec,
									intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z3' }),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status,
			source,
		},
		select: { id: true },
	})
	await recomputePlannedTssForSession(userId, session.id)
	return session
}

/** Everything an undo has to put back, for every session of the athlete. */
async function readWeek(userId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId },
		orderBy: { id: 'asc' },
		select: {
			id: true,
			scheduledAt: true,
			status: true,
			source: true,
			adoptedAt: true,
			replanReason: true,
			plannedTssValue: true,
			workout: {
				select: {
					blocks: { select: { steps: { select: { durationSec: true } } } },
				},
			},
		},
	})
	return sessions.map(({ workout, ...session }) => ({
		...session,
		minutes: workout?.blocks.flatMap((b) => b.steps.map((s) => s.durationSec)),
	}))
}

async function propose(
	userId: string,
	draft: Omit<ProposalDraft, 'targetWeekKey' | 'reason'> &
		Partial<Pick<ProposalDraft, 'targetWeekKey' | 'reason'>>,
) {
	await recordProposals(prisma, userId, [
		{ targetWeekKey: COMING_WEEK, reason: 'Fordi.', ...draft },
	])
	const row = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: userId },
		orderBy: { createdAt: 'desc' },
		select: { id: true },
	})
	return row.id
}

async function okAndUndo(userId: string, proposalId: string) {
	expect(
		await answerProposal(userId, proposalId, 'accepted', undefined, NOW),
	).toEqual({ ok: true, applied: true })
	return undoProposal(userId, proposalId, NOW)
}

// ── each kind ───────────────────────────────────────────────────────────────

test('undoing a scale applied by silence puts the session back exactly, and a second undo writes nothing', async () => {
	const user = await createAthlete()
	const session = await createSession(user.id)
	const before = await readWeek(user.id)
	const proposalId = await propose(user.id, {
		payload: { kind: 'scale', factor: 0.8 },
		targetSessionId: session.id,
	})

	const silence = await applyDueProposals(user.id, NOW)
	expect(silence.applied).toEqual([proposalId])
	expect((await readWeek(user.id))[0]).toMatchObject({
		minutes: [2880],
		replanReason: 'Fordi.',
	})

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: false,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

test('undoing "Gjør uka lettere" puts every eased session of the week back', async () => {
	const user = await createAthlete()
	await createSession(user.id, { scheduledAt: at('2030-01-15') })
	await createSession(user.id, { source: 'authored', durationSec: 5400 })
	const before = await readWeek(user.id)

	const eased = await easeWeek(user.id, COMING_WEEK, NOW)
	if (!eased.ok) throw new Error(eased.reason)
	expect(eased.sessionsChanged).toBe(2)

	expect(await undoProposal(user.id, eased.proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

test('undoing a move "fra nå av" puts the session and every later one of its slot back on their days', async () => {
	const user = await createAthlete()
	const target = await createSession(user.id, {
		scheduledAt: at('2030-01-16'),
	})
	await createSession(user.id, { scheduledAt: at('2030-01-23') })
	await createSession(user.id, { scheduledAt: at('2030-01-30') })
	const before = await readWeek(user.id)
	const proposalId = await propose(user.id, {
		payload: {
			kind: 'move',
			fromDate: '2030-01-16',
			toDate: '2030-01-17',
			makeUp: false,
		},
		targetSessionId: target.id,
	})

	await answerProposal(user.id, proposalId, 'accepted', 'from-now-on', NOW)
	const moved = await readWeek(user.id)
	expect(moved.map((s) => s.scheduledAt.toISOString().slice(0, 10))).toEqual(
		before.map((s) => {
			const day = new Date(s.scheduledAt)
			day.setUTCDate(day.getUTCDate() + 1)
			return day.toISOString().slice(0, 10)
		}),
	)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

test('undoing a swap puts both sessions back on their own days', async () => {
	const user = await createAthlete()
	const wednesday = await createSession(user.id)
	const saturday = await createSession(user.id, {
		title: 'Long ride',
		durationSec: 7200,
		scheduledAt: at('2030-01-19', '09:30'),
	})
	const before = await readWeek(user.id)
	const proposalId = await propose(user.id, {
		payload: { kind: 'swap', otherSessionId: saturday.id },
		targetSessionId: wednesday.id,
	})

	expect(await okAndUndo(user.id, proposalId)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

test('undoing an add removes the session it placed, and its workout', async () => {
	const user = await createAthlete()
	const source = await prisma.workout.create({
		data: {
			title: 'Rolig tur',
			discipline: 'bike',
			intent: 'endurance',
			ownerId: user.id,
		},
		select: { id: true },
	})
	const workoutsBefore = await prisma.workout.count({
		where: { ownerId: user.id },
	})
	const proposalId = await propose(user.id, {
		payload: {
			kind: 'add',
			workoutId: source.id,
			date: '2030-01-18',
			time: '07:00',
		},
		targetSessionId: null,
	})

	await answerProposal(user.id, proposalId, 'accepted', undefined, NOW)
	expect(await readWeek(user.id)).toHaveLength(1)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual([])
	expect(await prisma.workout.count({ where: { ownerId: user.id } })).toBe(
		workoutsBefore,
	)
})

test('undoing a make-up removes the copy and leaves the missed session on its day', async () => {
	const user = await createAthlete()
	const missed = await createSession(user.id, {
		scheduledAt: at('2030-01-09'),
	})
	const before = await readWeek(user.id)
	const proposalId = await propose(user.id, {
		payload: {
			kind: 'move',
			fromDate: '2030-01-09',
			toDate: '2030-01-17',
			makeUp: true,
		},
		targetSessionId: missed.id,
	})

	await answerProposal(user.id, proposalId, 'accepted', undefined, NOW)
	expect(await readWeek(user.id)).toHaveLength(2)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

test('undoing a keep is a no-op that succeeds', async () => {
	const user = await createAthlete()
	await createSession(user.id)
	const before = await readWeek(user.id)
	const proposalId = await propose(user.id, {
		payload: { kind: 'keep' },
		targetSessionId: null,
	})
	await applyDueProposals(user.id, NOW)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: true,
		undone: true,
	})
	expect(await readWeek(user.id)).toEqual(before)
})

// ── refusals ───────────────────────────────────────────────────────────────

test('an undo is refused once the week it changed has begun, and changes nothing', async () => {
	const user = await createAthlete()
	const session = await createSession(user.id, {
		scheduledAt: at('2030-01-17'),
	})
	const proposalId = await propose(user.id, {
		payload: { kind: 'scale', factor: 0.8 },
		targetSessionId: session.id,
	})
	await applyDueProposals(user.id, NOW)
	const applied = await readWeek(user.id)

	expect(await undoProposal(user.id, proposalId, TUESDAY_NOON)).toEqual({
		ok: false,
		reason: 'week-begun',
	})
	expect(await readWeek(user.id)).toEqual(applied)
})

test('an undo is refused once a session it changed has been trained', async () => {
	const user = await createAthlete()
	const session = await createSession(user.id)
	const proposalId = await propose(user.id, {
		payload: { kind: 'scale', factor: 0.8 },
		targetSessionId: session.id,
	})
	await applyDueProposals(user.id, NOW)
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { status: 'completed' },
	})
	const trained = await readWeek(user.id)

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: false,
		reason: 'session-trained',
	})
	expect(await readWeek(user.id)).toEqual(trained)
	// Refused, not undone: asking again is refused again.
	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: false,
		reason: 'session-trained',
	})
})

test('an undo is refused when the athlete took a changed session over since', async () => {
	const user = await createAthlete()
	const session = await createSession(user.id)
	const proposalId = await propose(user.id, {
		payload: { kind: 'scale', factor: 0.8 },
		targetSessionId: session.id,
	})
	await applyDueProposals(user.id, NOW)
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { adoptedAt: NOW },
	})

	expect(await undoProposal(user.id, proposalId, NOW)).toEqual({
		ok: false,
		reason: 'session-taken-over',
	})
})

test('only an applied proposal can be undone, and only the athlete’s own', async () => {
	const user = await createAthlete()
	const other = await createAthlete()
	const session = await createSession(user.id)
	const pending = await propose(user.id, {
		payload: { kind: 'scale', factor: 1.2 },
		targetSessionId: session.id,
	})

	expect(await undoProposal(user.id, pending, NOW)).toEqual({
		ok: false,
		reason: 'not-applied',
	})
	expect(await undoProposal(other.id, pending, NOW)).toEqual({
		ok: false,
		reason: 'not-found',
	})
})

// ── a next round ────────────────────────────────────────────────────────────
//
// An open-ended plan in Oslo, as in `open-ended-round.server.test.ts`: one
// three-week round from 31 Dec 2029, the next proposed at the close on Sunday
// 13 Jan and opening on 21 Jan.

const OSLO = 'Europe/Oslo'
const oslo = (day: string, time: string) => {
	const [y, mo, d] = day.split('-').map(Number)
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(y!, mo! - 1, d!, h! - 1, m!))
}
const ROUND_CLOSE = oslo('2030-01-13', '20:01')
const MONDAY_MORNING = oslo('2030-01-14', '08:00')
const NEXT_ROUND = '2030-01-21'

async function createOpenEndedAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00' },
			},
		},
	})
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: '2029-12-31',
			structure: { phases: [{ name: 'Blokk 1', weeks: 3, rhythm: '3:1' }] },
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 4 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: { tracks: { select: { id: true } } },
	})
	const added = await addWeekPattern(user.id, {
		outlineId: created.outlineId,
		name: 'Typisk uke',
	})
	if (!added.ok) throw new Error(`pattern setup failed: ${added.reason}`)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	const day = await addWeekPatternDay(user.id, {
		patternId: pattern.id,
		kind: 'share',
		trackId: outline.tracks[0]!.id,
		weekday: 2,
		weight: 1,
	})
	if (!day.ok) throw new Error(`day setup failed: ${day.reason}`)
	// Both lived weeks done to plan, so the next round is proposed with more.
	for (const weekKey of ['2029-12-31', CLOSED_WEEK]) {
		const [y, mo, d] = weekKey.split('-').map(Number)
		await prisma.workoutSession.create({
			data: {
				userId: user.id,
				scheduledAt: new Date(Date.UTC(y!, mo! - 1, d! + 2, 6, 0)),
				status: 'completed',
				source: 'authored',
				plannedTssValue: 50,
				tssValue: 50,
			},
		})
	}
	await runWeekChangeForUser(user.id, ROUND_CLOSE)
	const round = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id, kind: 'add-phase' },
		select: { id: true },
	})
	return { userId: user.id, outlineId: created.outlineId, roundId: round.id }
}

/** The plan's phases and the minutes it laid in each week of the new round. */
async function readRound(userId: string, outlineId: string) {
	const [phases, sessions] = await Promise.all([
		prisma.planOutlinePhase.findMany({
			where: { outlineId },
			orderBy: { orderIndex: 'asc' },
			select: {
				name: true,
				weeks: true,
				segments: { select: { boundaryStep: true } },
			},
		}),
		prisma.workoutSession.findMany({
			where: {
				userId,
				planOutlineId: outlineId,
				scheduledAt: { gte: oslo(NEXT_ROUND, '00:00') },
			},
			orderBy: { scheduledAt: 'asc' },
			select: {
				scheduledAt: true,
				workout: {
					select: {
						blocks: { select: { steps: { select: { durationSec: true } } } },
					},
				},
			},
		}),
	])
	return {
		phases,
		laid: sessions.map((s) => ({
			day: s.scheduledAt.toISOString().slice(0, 10),
			minutes: s.workout?.blocks.flatMap((b) =>
				b.steps.map((step) => step.durationSec),
			),
		})),
	}
}

test('undoing a next round keeps the round and re-lays it at factor 1', async () => {
	const raised = await createOpenEndedAthlete()
	const level = await createOpenEndedAthlete()
	await acceptRoundWithFactor(
		raised.userId,
		raised.roundId,
		1.1,
		MONDAY_MORNING,
	)
	await acceptRoundWithFactor(level.userId, level.roundId, 1, MONDAY_MORNING)
	const atFactor1 = await readRound(level.userId, level.outlineId)
	expect(atFactor1.laid.length).toBeGreaterThan(0)
	expect(await readRound(raised.userId, raised.outlineId)).not.toEqual(
		atFactor1,
	)

	expect(
		await undoProposal(raised.userId, raised.roundId, MONDAY_MORNING),
	).toEqual({ ok: true, undone: true })

	// The plan does not end: the round is still there, laid as a round at the
	// same volume as the one before.
	expect(await readRound(raised.userId, raised.outlineId)).toEqual(atFactor1)
	expect(atFactor1.phases.map((p) => p.name)).toEqual(['Blokk 1', 'Blokk 2'])
})

test('a next round cannot be undone once the week it opens on has begun', async () => {
	const { userId, outlineId, roundId } = await createOpenEndedAthlete()
	await acceptRoundWithFactor(userId, roundId, 1.1, MONDAY_MORNING)
	const applied = await readRound(userId, outlineId)

	expect(
		await undoProposal(userId, roundId, oslo('2030-01-22', '12:00')),
	).toEqual({ ok: false, reason: 'week-begun' })
	expect(await readRound(userId, outlineId)).toEqual(applied)
})
