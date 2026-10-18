import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	readAutopilotNotice,
	undoAutopilotWeek,
} from './autopilot-notice.server.ts'
import { type ProposalAuthor } from './propose-week-change.ts'
import { runWeekChangeForUser } from './week-change.server.ts'
import { answerProposal } from './week-replan-answers.server.ts'
import { undoProposal } from './week-replan-undo.server.ts'

// The Autopilot through the weekly Week Change (#576, spec #558 Testing
// Decisions, ADR 0100): one athlete and a clock go in; the stored proposals and
// the sessions on the calendar come out, read back from the database — as the
// week change's own tests do.
//
// Oslo on purpose, as there: Sunday 20:01 in Oslo is 19:01Z, before a close in
// UTC would happen, so a clock read in the wrong zone fails the close.

const OSLO = 'Europe/Oslo'

/** Oslo wall-clock time, as the UTC instant the server is handed. */
const oslo = (day: string, time: string) => {
	const [y, mo, d] = day.split('-').map(Number)
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(y!, mo! - 1, d!, h! - 1, m!))
}

const SUNDAY_2001 = oslo('2030-01-13', '20:01')
const MONDAY_0601 = oslo('2030-01-14', '06:01')

async function createAthlete({ autopilot }: { autopilot: boolean }) {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00', autopilot },
			},
		},
	})
}

/** A planned run with one quantified step, so a scale has something to act on. */
async function createRun(
	userId: string,
	scheduledAt: Date,
	{ source = 'generated', title = 'Rolig tur', durationSec = 3600 } = {},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title,
			discipline: 'run',
			intent: 'endurance',
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
									durationSec,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true, workoutId: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status: 'scheduled',
			source,
		},
	})
}

async function durationOf(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			workout: {
				select: {
					blocks: { select: { steps: { select: { durationSec: true } } } },
				},
			},
		},
	})
	return session.workout!.blocks[0]!.steps[0]!.durationSec
}

/** Softens every adjustable session of the coming week by `factor`. */
const scaleEach =
	(factor: number): ProposalAuthor =>
	(facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: facts.adjustableSessions.map((session) => ({
			payload: { kind: 'scale' as const, factor },
			targetSessionId: session.id,
			targetWeekKey: facts.targetWeekKey,
			reason: 'Litt kortere.',
		})),
	})

test('with autopilot on, the close applies the machine’s change at once, with no answer', async () => {
	const user = await createAthlete({ autopilot: true })
	const machine = await createRun(user.id, oslo('2030-01-17', '07:00'))

	const run = await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	expect(run.applied).toHaveLength(1)
	expect(await durationOf(machine.id)).toBe(2880)
	const proposal = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { answer: true, appliedAt: true, beforeImage: true },
	})
	// Nobody answered: an autopilot apply has no answer (ADR 0100
	// Consequences), and it keeps a before-image for _Angre_.
	expect(proposal).toEqual({
		answer: 'pending',
		appliedAt: SUNDAY_2001,
		beforeImage: expect.any(String),
	})
})

test('added load applies within the guards, and a step past them is held', async () => {
	const user = await createAthlete({ autopilot: true })
	const small = await createRun(user.id, oslo('2030-01-16', '07:00'))
	const big = await createRun(user.id, oslo('2030-01-17', '07:00'))
	const author: ProposalAuthor = (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: [
			{ id: small.id, factor: 1.05 },
			{ id: big.id, factor: 1.2 },
		].map(({ id, factor }) => ({
			payload: { kind: 'scale' as const, factor },
			targetSessionId: id,
			targetWeekKey: facts.targetWeekKey,
			reason: 'Litt lengre.',
		})),
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, author)

	// 5 % a round, the presets' step, is within both guards; 20 % is past them.
	expect(await durationOf(small.id)).toBe(3780)
	expect(await durationOf(big.id)).toBe(3600)
	expect(await outcomes(user.id)).toEqual({
		[small.id]: 'applied',
		[big.id]: 'over-guard',
	})
})

test('the athlete’s own sessions are left alone, and the proposal says so', async () => {
	const user = await createAthlete({ autopilot: true })
	const machine = await createRun(user.id, oslo('2030-01-17', '07:00'))
	const theirs = await createRun(user.id, oslo('2030-01-19', '07:00'), {
		source: 'authored',
		title: 'Langtur',
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	expect(await durationOf(machine.id)).toBe(2880)
	expect(await durationOf(theirs.id)).toBe(3600)
	expect(await outcomes(user.id)).toEqual({
		[machine.id]: 'applied',
		[theirs.id]: 'left-alone',
	})
})

test('a make-up is not placed: the missed session stays ikke gjort on its day', async () => {
	const user = await createAthlete({ autopilot: true })
	const missed = await createRun(user.id, oslo('2030-01-09', '07:00'))
	const author: ProposalAuthor = (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: [
			{
				payload: {
					kind: 'move' as const,
					fromDate: '2030-01-09',
					toDate: '2030-01-16',
					makeUp: true,
				},
				targetSessionId: missed.id,
				targetWeekKey: facts.targetWeekKey,
				reason: 'Ta den igjen.',
			},
		],
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, author)

	const sessions = await prisma.workoutSession.findMany({
		where: { userId: user.id },
		select: { id: true, scheduledAt: true, status: true },
	})
	expect(sessions).toEqual([
		{
			id: missed.id,
			scheduledAt: oslo('2030-01-09', '07:00'),
			status: 'scheduled',
		},
	])
	expect(await outcomes(user.id)).toEqual({ [missed.id]: 'not-placed' })
})

test('the 06:00 silence step does nothing for a week closed under autopilot', async () => {
	const user = await createAthlete({ autopilot: true })
	await createRun(user.id, oslo('2030-01-19', '07:00'), { source: 'authored' })
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))
	const before = await prisma.weekReplanProposal.findMany({
		where: { athleteId: user.id },
	})

	const morning = await runWeekChangeForUser(user.id, MONDAY_0601)

	expect(morning).toMatchObject({ applied: [], held: [] })
	expect(
		await prisma.weekReplanProposal.findMany({ where: { athleteId: user.id } }),
	).toEqual(before)
	const replan = await prisma.weekReplan.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { silencedAt: true },
	})
	expect(replan.silencedAt).toBeNull()
})

test('Spør meg først keeps today’s behaviour: nothing at the close, silence from 06:00', async () => {
	const user = await createAthlete({ autopilot: false })
	const machine = await createRun(user.id, oslo('2030-01-17', '07:00'))
	const theirs = await createRun(user.id, oslo('2030-01-19', '07:00'), {
		source: 'authored',
	})

	const close = await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	expect(close).toMatchObject({ applied: [], held: [] })
	expect(await durationOf(machine.id)).toBe(3600)
	expect(await outcomes(user.id)).toEqual({
		[machine.id]: null,
		[theirs.id]: null,
	})

	const morning = await runWeekChangeForUser(user.id, MONDAY_0601)

	expect(morning.applied).toHaveLength(1)
	expect(await durationOf(machine.id)).toBe(2880)
	expect(await durationOf(theirs.id)).toBe(3600)
	// The athlete's own still waits for their answer.
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: user.id, answer: 'pending', appliedAt: null },
		}),
	).toBe(1)
})

test('switching autopilot on after a close never applies the open proposals', async () => {
	const user = await createAthlete({ autopilot: false })
	const theirs = await createRun(user.id, oslo('2030-01-19', '07:00'), {
		source: 'authored',
	})
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { autopilot: true },
	})
	await runWeekChangeForUser(user.id, oslo('2030-01-13', '21:00'))
	await runWeekChangeForUser(user.id, MONDAY_0601)

	// Still the Spør meg først week it closed as: open, answerable, untouched.
	expect(await durationOf(theirs.id)).toBe(3600)
	expect(await outcomes(user.id)).toEqual({ [theirs.id]: null })
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: user.id, answer: 'pending', appliedAt: null },
		}),
	).toBe(1)
})

test('a second run of an autopilot close writes nothing', async () => {
	const user = await createAthlete({ autopilot: true })
	await createRun(user.id, oslo('2030-01-17', '07:00'))
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))
	const after = await prisma.weekReplanProposal.findMany({
		where: { athleteId: user.id },
	})

	const again = await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	expect(again).toMatchObject({ replanned: false, applied: [], held: [] })
	expect(
		await prisma.weekReplanProposal.findMany({ where: { athleteId: user.id } }),
	).toEqual(after)
})

test('Angre restores exactly, and is refused once the week has begun', async () => {
	const user = await createAthlete({ autopilot: true })
	const first = await createRun(user.id, oslo('2030-01-16', '07:00'))
	const second = await createRun(user.id, oslo('2030-01-17', '07:00'))
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))
	const [one, two] = await prisma.weekReplanProposal.findMany({
		where: { athleteId: user.id },
		orderBy: { createdAt: 'asc' },
		select: { id: true },
	})

	expect(
		await undoProposal(user.id, one!.id, oslo('2030-01-13', '21:00')),
	).toEqual({ ok: true, undone: true })
	expect(await durationOf(first.id)).toBe(3600)
	expect(await durationOf(second.id)).toBe(2880)

	// Tuesday: the week the change landed in has begun.
	expect(
		await undoProposal(user.id, two!.id, oslo('2030-01-15', '08:00')),
	).toEqual({ ok: false, reason: 'week-begun' })
	expect(await durationOf(second.id)).toBe(2880)
})

test('a proposal the autopilot looked at cannot be answered on the card', async () => {
	const user = await createAthlete({ autopilot: true })
	await createRun(user.id, oslo('2030-01-19', '07:00'), { source: 'authored' })
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))
	const proposal = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { id: true },
	})

	expect(
		await answerProposal(
			user.id,
			proposal.id,
			'accepted',
			undefined,
			SUNDAY_2001,
		),
	).toEqual({ ok: false, reason: 'autopilot' })
})

test('an open-ended plan’s next round is appended at the close, with no yes', async () => {
	const user = await createAthlete({ autopilot: true })
	// One two-week round from 31 Dec: it ends with the week that closes.
	const created = await createPlanOutline(
		user.id,
		{
			startWeekKey: '2029-12-31',
			structure: {
				phases: [{ name: 'Blokk 1', weeks: 2, rhythm: 'none' as const }],
			},
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)

	await runWeekChangeForUser(user.id, SUNDAY_2001)

	const round = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id, kind: 'add-phase' },
		select: { autopilotOutcome: true, appliedAt: true, reason: true },
	})
	expect(round).toEqual({
		autopilotOutcome: 'applied',
		appliedAt: SUNDAY_2001,
		reason: expect.stringContaining('er lagt inn'),
	})
	expect(
		await prisma.planOutlinePhase.count({
			where: { outlineId: created.outlineId },
		}),
	).toBe(2)
})

test('the notice states each change with its reason and Angre, and says what stood', async () => {
	const user = await createAthlete({ autopilot: true })
	await createRun(user.id, oslo('2030-01-16', '07:00'), { title: 'Terskel' })
	await createRun(user.id, oslo('2030-01-19', '07:00'), {
		source: 'authored',
		title: 'Langtur',
	})
	const missed = await createRun(user.id, oslo('2030-01-09', '07:00'), {
		title: 'Intervaller',
	})
	const author: ProposalAuthor = (facts) => ({
		...scaleEach(0.8)(facts),
		proposals: [
			...scaleEach(0.8)(facts).proposals.map((p) => ({
				...p,
				reason: 'Økta er gjort ca. 20 % kortere.',
			})),
			{
				payload: {
					kind: 'move' as const,
					fromDate: '2030-01-09',
					toDate: '2030-01-17',
					makeUp: true,
				},
				targetSessionId: missed.id,
				targetWeekKey: facts.targetWeekKey,
				reason: '«Intervaller» ble ikke gjort onsdag. Vi lar den gå.',
			},
		],
	})
	await runWeekChangeForUser(user.id, SUNDAY_2001, author)

	const notice = await readAutopilotNotice(user.id, {
		now: oslo('2030-01-13', '21:00'),
	})

	expect(notice).toMatchObject({
		closedWeekKey: '2030-01-07',
		comingWeekKey: '2030-01-14',
		undoable: 1,
		closedLine: null,
	})
	expect(
		notice!.lines.map(({ kind, subject, text, undo }) => ({
			kind,
			subject,
			text,
			undo,
		})),
	).toEqual([
		{
			kind: 'changed',
			subject: '«Terskel» · onsdag',
			text: 'Økta er gjort ca. 20 % kortere.',
			undo: 'offered',
		},
		{
			kind: 'left-alone',
			subject: null,
			text: 'Lørdagens «Langtur» er din, den står.',
			undo: null,
		},
		{
			kind: 'let-go',
			subject: null,
			text: '«Intervaller» ble ikke gjort onsdag. Vi lar den gå.',
			undo: null,
		},
	])

	// Tuesday: the week has begun, so the way back is closed, and said once.
	const later = await readAutopilotNotice(user.id, {
		now: oslo('2030-01-15', '08:00'),
	})
	expect(later).toMatchObject({ undoable: 0, closedLine: expect.any(String) })
	expect(later!.lines[0]).toMatchObject({ undo: 'closed' })
})

test('Angre alt puts the whole week back, and a second one does nothing', async () => {
	const user = await createAthlete({ autopilot: true })
	const first = await createRun(user.id, oslo('2030-01-16', '07:00'))
	const second = await createRun(user.id, oslo('2030-01-17', '07:00'))
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))
	const at = oslo('2030-01-13', '21:00')

	expect(await undoAutopilotWeek(user.id, '2030-01-07', at)).toEqual({
		ok: true,
		undone: 2,
		refused: [],
	})
	expect(await durationOf(first.id)).toBe(3600)
	expect(await durationOf(second.id)).toBe(3600)
	expect(await undoAutopilotWeek(user.id, '2030-01-07', at)).toEqual({
		ok: true,
		undone: 0,
		refused: [],
	})
	const notice = await readAutopilotNotice(user.id, { now: at })
	expect(notice!.lines.map((line) => line.undo)).toEqual(['undone', 'undone'])
})

test('a week closed under Spør meg først has no notice', async () => {
	const user = await createAthlete({ autopilot: false })
	await createRun(user.id, oslo('2030-01-16', '07:00'))
	await runWeekChangeForUser(user.id, SUNDAY_2001, scaleEach(0.8))

	expect(
		await readAutopilotNotice(user.id, { now: oslo('2030-01-13', '21:00') }),
	).toBeNull()
})

/** Each proposal's autopilot outcome, by the session it is aimed at. */
async function outcomes(userId: string) {
	const rows = await prisma.weekReplanProposal.findMany({
		where: { athleteId: userId, targetSessionId: { not: null } },
		select: { targetSessionId: true, autopilotOutcome: true },
	})
	return Object.fromEntries(
		rows.map((row) => [row.targetSessionId, row.autopilotOutcome]),
	)
}
