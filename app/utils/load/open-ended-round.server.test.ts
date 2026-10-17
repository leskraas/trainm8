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
// The plan opens Monday 31 Dec 2029 with one three-week round on 3:1. Its
// second-to-last week (7 Jan) closes on Sunday 13 Jan at 20:00 in Oslo, which
// is when the next round is proposed, graded on the two weeks lived; the next
// round — one block of 3:1, four weeks — opens after the last, on 21 Jan.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2029-12-31'
const LIVED_WEEKS = ['2029-12-31', '2030-01-07']
const NEXT_ROUND = '2030-01-21'

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
		weekday: 2, // Wednesday
		weight: 1,
	})
	if (!day.ok) throw new Error(`day setup failed: ${day.reason}`)
	return { userId: user.id, outlineId: created.outlineId }
}

/**
 * One Wednesday session in each week, planned at 50 TSS; done at `done[i]`
 * TSS, or not done at all (null — still scheduled, so _ikke gjort_).
 */
async function trainTheRound(
	userId: string,
	done: Array<number | null>,
	weeks: string[] = LIVED_WEEKS,
) {
	for (const [index, weekKey] of weeks.entries()) {
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
		where: {
			athleteId: userId,
			kind: 'add-phase',
			answer: { not: 'declined' },
		},
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
	expect(proposal.reason).toMatch(/Blokk 1 har gått etter planen/)
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
		'1 av de siste 2 ukene ble ikke gjort som planlagt. Vi foreslår Blokk 2 med like mye trening som Blokk 1, så planen ikke presser deg etter en tung blokk.',
	)

	const morning = await runWeekChangeForUser(userId, MORNING)

	expect(morning.applied).toContain(proposal.id)
	expect(await phasesOf(outlineId)).toEqual([
		{
			name: 'Blokk 1',
			weeks: 3,
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

	// The close finds its horizon week (21 Jan) past the plan's end: the next
	// round is only proposed.
	const close = await runWeekChangeForUser(userId, CLOSE)
	expect(close.horizon).toEqual({ weekKey: '2030-01-21', sessions: 0 })
	expect(await laidDays(userId, outlineId)).toEqual([])

	// Silence appends the round, and every week not yet begun up to the horizon
	// is laid — this one, the round's last, and the new round's first.
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
	// Accepted on Monday: this week (the round's last) and the new round's first
	// are laid at once.
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

test('a round answered after the plan’s end opens on a week not yet begun, and the lived weeks between join the last round', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, 50])
	await runWeekChangeForUser(userId, CLOSE)
	const proposal = await roundProposal(userId)
	// Unanswered: silence holds a round that adds load, and the plan's end
	// (21 Jan) passes while it waits.
	await runWeekChangeForUser(userId, MORNING)
	await runWeekChangeForUser(userId, oslo('2030-01-20', '20:01'))
	await runWeekChangeForUser(userId, oslo('2030-01-27', '20:01'))

	// A yes on Wednesday 30 Jan.
	const accepted = await answerProposal(
		userId,
		proposal.id,
		'accepted',
		undefined,
		oslo('2030-01-30', '12:00'),
	)

	expect(accepted).toEqual({ ok: true, applied: true })
	// Blokk 1 runs on over 21 and 28 Jan; Blokk 2 opens on Monday 4 Feb.
	expect(
		(await phasesOf(outlineId)).map(({ name, weeks }) => ({ name, weeks })),
	).toEqual([
		{ name: 'Blokk 1', weeks: 5 },
		{ name: 'Blokk 2', weeks: 4 },
	])
	// Nothing is laid in a week already begun: only 4 Feb, the horizon.
	expect(await laidDays(userId, outlineId)).toEqual(['2030-02-06'])
})

test('a declined round is asked about again, graded on the weeks lived since', async () => {
	const { userId } = await createOpenEndedAthlete()
	// The first week slipped, the rest went to plan.
	await trainTheRound(
		userId,
		[null, 50, 50, 50],
		['2029-12-31', '2030-01-07', '2030-01-14', '2030-01-21'],
	)
	await runWeekChangeForUser(userId, CLOSE)
	const first = await roundProposal(userId)
	expect(first.payload).toMatchObject({ factor: 1 })
	await answerProposal(
		userId,
		first.id,
		'declined',
		undefined,
		oslo('2030-01-13', '21:00'),
	)

	// The next close asks again; the slipped week is still among the last three.
	await runWeekChangeForUser(userId, oslo('2030-01-20', '20:01'))
	const second = await roundProposal(userId)
	expect(second.payload).toMatchObject({ factor: 1 })
	await answerProposal(
		userId,
		second.id,
		'declined',
		undefined,
		oslo('2030-01-20', '21:00'),
	)

	// A week later the last three weeks went to plan, and the round says so.
	await runWeekChangeForUser(userId, oslo('2030-01-27', '20:01'))
	const third = await roundProposal(userId)
	expect(third.payload).toMatchObject({ factor: ROUND_STEP_UP })
	expect(third.reason).toMatch(/de siste 3 ukene ble gjort som planlagt/)
})

test('an extra session the plan never asked for does not make a missed week done', async () => {
	const { userId } = await createOpenEndedAthlete()
	await trainTheRound(userId, [50, null])
	// A long unplanned ride in the missed week.
	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: new Date('2030-01-12T09:00:00Z'),
			status: 'completed',
			source: 'authored',
			tssValue: 200,
		},
	})

	await runWeekChangeForUser(userId, CLOSE)

	expect((await roundProposal(userId)).payload).toMatchObject({ factor: 1 })
})

test('a lifting block that runs to the plan’s end keeps going in the new round; one that ended stays ended', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	const track = await prisma.trainingTrack.create({
		data: { outlineId, discipline: 'strength', currency: 'sets' },
		select: { id: true },
	})
	const block = (startWeekKey: string, weeks: number) =>
		prisma.trainingTrackSegment.create({
			data: {
				kind: 'strength',
				trackId: track.id,
				startWeekKey,
				weeks,
				goal: 'hypertrophy',
				sessionsPerWeek: 2,
			},
			select: { id: true },
		})
	// One block from the round's second week to its last (14 Jan) …
	const running = await block('2030-01-07', 2)
	// … and an earlier one that stopped after its first week.
	const stopped = await block(PLAN_START, 1)
	await trainTheRound(userId, [50, null])

	await runWeekChangeForUser(userId, CLOSE)
	await runWeekChangeForUser(userId, MORNING)

	// The round is appended (Blokk 2, four weeks from 21 Jan), and the block
	// that reached the old end now reaches the new one: 2 + 4 weeks.
	expect((await phasesOf(outlineId)).map((p) => [p.name, p.weeks])).toEqual([
		['Blokk 1', 3],
		['Blokk 2', 4],
	])
	const weeksOf = async (id: string) =>
		await prisma.trainingTrackSegment.findUniqueOrThrow({
			where: { id },
			select: { weeks: true, startWeekKey: true },
		})
	expect(await weeksOf(running.id)).toEqual({
		startWeekKey: '2030-01-07',
		weeks: 6,
	})
	expect(await weeksOf(stopped.id)).toEqual({
		startWeekKey: PLAN_START,
		weeks: 1,
	})
})

test('an open-ended plan stops proposing rounds at two years of weeks (MAX_PLAN_WEEKS)', async () => {
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
	// 101 weeks, ending on 21 Jan 2030: the close on 13 Jan is its
	// second-to-last week, when a round would be proposed. One more block of
	// 3:1 would make it 105 weeks.
	const start = '2028-02-14'
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: start,
			structure: {
				phases: [
					{ name: 'Blokk 1', weeks: 52, rhythm: '3:1' },
					{ name: 'Blokk 2', weeks: 49, rhythm: '3:1' },
				],
			},
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 4 }],
		},
		new Date('2028-02-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	await trainTheRound(user.id, [50, 50])

	await runWeekChangeForUser(user.id, CLOSE)
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: user.id, kind: 'add-phase' },
		}),
	).toBe(0)
	expect(
		(await phasesOf(created.outlineId)).map((p) => [p.name, p.weeks]),
	).toEqual([
		['Blokk 1', 52],
		['Blokk 2', 49],
	])
})

// ADR 0102 §3: Stor base now opens all easy, but a track already written from
// it keeps the mix it was stored with — the next round carries that on, until
// the athlete re-applies a philosophy.
test('a Stor base plan written before its base became all easy keeps its stored mix in the next round', async () => {
	const { userId, outlineId } = await createOpenEndedAthlete()
	await prisma.planOutline.update({
		where: { id: outlineId },
		data: { family: 'big-base' },
	})
	const base = await prisma.trainingTrackSegment.findFirstOrThrow({
		where: { track: { outlineId }, kind: 'endurance' },
		select: { id: true },
	})
	await prisma.trainingTrackSegment.update({
		where: { id: base.id },
		data: { mix: { create: [{ zone: 3, sessionsPerWeek: 1 }] } },
	})
	await trainTheRound(userId, [50, null])

	await runWeekChangeForUser(userId, CLOSE)
	await runWeekChangeForUser(userId, MORNING)

	const rounds = await prisma.planOutlinePhase.findMany({
		where: { outlineId },
		orderBy: { orderIndex: 'asc' },
		select: {
			name: true,
			segments: {
				select: { mix: { select: { zone: true, sessionsPerWeek: true } } },
			},
		},
	})
	expect(rounds).toEqual([
		{ name: 'Blokk 1', segments: [{ mix: [{ zone: 3, sessionsPerWeek: 1 }] }] },
		{ name: 'Blokk 2', segments: [{ mix: [{ zone: 3, sessionsPerWeek: 1 }] }] },
	])
})
