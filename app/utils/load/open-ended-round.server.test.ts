import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { ROUND_STEP_UP } from './propose-next-round.ts'
import { runWeekChangeForUser } from './week-change.server.ts'
import {
	acceptRoundWithFactor,
	answerProposal,
} from './week-replan-answers.server.ts'

// Seam 1 for the rounds of an open-ended plan (#505 stories 2–6, ADR 0079
// §2–3, §5): an athlete with a plan that has no Event, the weeks of its round
// as they were trained, and a clock go in; the next round's proposal, what
// silence and an answer do with it, and the weeks laid after it come out.
//
// The plan opens Monday 31 Dec 2029 with one two-week round on 3:1, so its
// last week (7 Jan) closes on Sunday 13 Jan at 20:00 in Oslo, and the next
// round — one block of 3:1, four weeks — opens on 14 Jan.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2029-12-31'
const ROUND_WEEKS = ['2029-12-31', '2030-01-07']
const NEXT_ROUND = '2030-01-14'

const oslo = (day: string, time: string) => {
	const [y, mo, d] = day.split('-').map(Number)
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(y!, mo! - 1, d!, h! - 1, m!))
}

const CLOSE = oslo('2030-01-13', '20:01')
const MORNING = oslo('2030-01-14', '06:01')

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
			startWeekKey: PLAN_START,
			structure: { phases: [{ name: 'Blokk 1', weeks: 2, rhythm: '3:1' }] },
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
		weekday: 2, // Wednesday
		weight: 1,
	})
	if (!day.ok) throw new Error(`day setup failed: ${day.reason}`)
	return { userId: user.id, outlineId: created.outlineId }
}

/**
 * One Wednesday session in each week of the round, planned at 50 TSS; done at
 * `done[i]` TSS, or not done at all (null — still scheduled, so _ikke gjort_).
 */
async function trainTheRound(userId: string, done: Array<number | null>) {
	for (const [index, weekKey] of ROUND_WEEKS.entries()) {
		const [y, mo, d] = weekKey.split('-').map(Number)
		const wednesday = new Date(Date.UTC(y!, mo! - 1, d! + 2, 6, 0))
		await prisma.workoutSession.create({
			data: {
				userId,
				scheduledAt: wednesday,
				status: done[index] == null ? 'scheduled' : 'completed',
				source: 'authored',
				plannedTssValue: 50,
				tssValue: done[index],
			},
		})
	}
}

async function roundProposal(userId: string) {
	const proposals = await prisma.weekReplanProposal.findMany({
		where: { athleteId: userId, kind: 'add-phase' },
		select: {
			id: true,
			payload: true,
			reason: true,
			loadDirection: true,
			targetSessionId: true,
			targetWeekKey: true,
			answer: true,
			appliedAt: true,
		},
	})
	expect(proposals).toHaveLength(1)
	const proposal = proposals[0]!
	return { ...proposal, payload: JSON.parse(proposal.payload) }
}

async function phasesOf(outlineId: string) {
	return prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: {
			name: true,
			weeks: true,
			rhythm: true,
			segments: { select: { boundaryStep: true } },
		},
	})
}

async function laidDays(userId: string, outlineId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, planOutlineId: outlineId },
		orderBy: { scheduledAt: 'asc' },
		select: { scheduledAt: true },
	})
	return sessions.map((s) => s.scheduledAt.toISOString().slice(0, 10))
}

test('a round done to plan proposes the next one with more volume, and silence does not apply it', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, 48])

	await runWeekChangeForUser(userId, CLOSE)
	const proposal = await roundProposal(userId)
	expect(proposal).toMatchObject({
		payload: {
			kind: 'add-phase',
			outlineId,
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			factor: ROUND_STEP_UP,
		},
		loadDirection: 'adds',
		targetSessionId: null,
		targetWeekKey: NEXT_ROUND,
	})
	expect(ROUND_STEP_UP).toBeGreaterThan(1)
	expect(proposal.reason).toMatch(/Blokk 1 gikk etter planen/)
	expect(proposal.reason).toMatch(/legges bare inn hvis du sier ja/)

	const morning = await runWeekChangeForUser(userId, MORNING)

	expect(morning.held).toContain(proposal.id)
	expect(await roundProposal(userId)).toMatchObject({
		answer: 'pending',
		appliedAt: null,
	})
	expect((await phasesOf(outlineId)).map((p) => p.name)).toEqual(['Blokk 1'])
})

test('a round with missed weeks proposes the same volume, says why, and silence appends it', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, null])

	await runWeekChangeForUser(userId, CLOSE)
	const proposal = await roundProposal(userId)
	expect(proposal).toMatchObject({
		payload: { kind: 'add-phase', name: 'Blokk 2', factor: 1 },
		loadDirection: 'keeps-or-reduces',
	})
	expect(proposal.reason).toBe(
		'I Blokk 1 ble 1 av 2 uker ikke gjort som planlagt. Vi foreslår Blokk 2 med like mye trening som Blokk 1, så planen ikke presser deg etter en tung blokk.',
	)

	const morning = await runWeekChangeForUser(userId, MORNING)

	expect(morning.applied).toContain(proposal.id)
	expect(await phasesOf(outlineId)).toEqual([
		{
			name: 'Blokk 1',
			weeks: 2,
			rhythm: '3:1',
			segments: [{ boundaryStep: null }],
		},
		// Continuity: the same volume, no step at the boundary.
		{
			name: 'Blokk 2',
			weeks: 4,
			rhythm: '3:1',
			segments: [{ boundaryStep: null }],
		},
	])
	// Asked once: the next close finds the round already appended.
	await runWeekChangeForUser(userId, oslo('2030-01-20', '20:01'))
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: userId, kind: 'add-phase' },
		}),
	).toBe(1)
})

test('an appended round lets the horizon fill carry on laying weeks', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [null, null])

	// The close finds its horizon week (21 Jan) past the plan's end.
	const close = await runWeekChangeForUser(userId, CLOSE)
	expect(close.horizon).toEqual({ weekKey: '2030-01-21', sessions: 0 })
	expect(await laidDays(userId, outlineId)).toEqual([])

	// Silence appends the round, and the weeks up to the horizon are laid.
	await runWeekChangeForUser(userId, MORNING)
	expect(await laidDays(userId, outlineId)).toEqual([
		'2030-01-16',
		'2030-01-23',
	])

	// And the next close fills its own horizon week inside the new round.
	const next = await runWeekChangeForUser(userId, oslo('2030-01-20', '20:01'))
	expect(next.horizon).toEqual({ weekKey: '2030-01-28', sessions: 1 })
	expect(await laidDays(userId, outlineId)).toEqual([
		'2030-01-16',
		'2030-01-23',
		'2030-01-30',
	])
})

test('the athlete can accept the next round at a volume they choose', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, 50])
	await runWeekChangeForUser(userId, CLOSE)
	const proposal = await roundProposal(userId)

	expect(await acceptRoundWithFactor(userId, proposal.id, 2, MORNING)).toEqual({
		ok: false,
		reason: 'factor-out-of-range',
	})

	const accepted = await acceptRoundWithFactor(
		userId,
		proposal.id,
		1.02,
		oslo('2030-01-14', '08:00'),
	)

	expect(accepted).toEqual({ ok: true, applied: true })
	expect(await roundProposal(userId)).toMatchObject({
		answer: 'accepted',
		payload: { factor: 1.02 },
		loadDirection: 'adds',
	})
	expect((await phasesOf(outlineId))[1]).toEqual({
		name: 'Blokk 2',
		weeks: 4,
		rhythm: '3:1',
		segments: [{ boundaryStep: 0.02 }],
	})
	// Accepted on Monday: this week and next are laid at once.
	expect(await laidDays(userId, outlineId)).toEqual([
		'2030-01-16',
		'2030-01-23',
	])
})

test('a round brought down to the same volume is recorded as keeping the load', async () => {
	const { userId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, 50])
	await runWeekChangeForUser(userId, CLOSE)
	const proposal = await roundProposal(userId)

	await acceptRoundWithFactor(userId, proposal.id, 1, MORNING)

	expect(await roundProposal(userId)).toMatchObject({
		answer: 'accepted',
		payload: { factor: 1 },
		loadDirection: 'keeps-or-reduces',
	})
})

test('a factor is only for a round, and Nei takk appends nothing', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, 50])
	await runWeekChangeForUser(userId, CLOSE)
	const keep = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: userId, kind: 'keep' },
		select: { id: true },
	})
	expect(await acceptRoundWithFactor(userId, keep.id, 1.1, MORNING)).toEqual({
		ok: false,
		reason: 'factor-not-a-round',
	})

	const proposal = await roundProposal(userId)
	await answerProposal(userId, proposal.id, 'declined', undefined, MORNING)

	expect((await phasesOf(outlineId)).map((p) => p.name)).toEqual(['Blokk 1'])
})
