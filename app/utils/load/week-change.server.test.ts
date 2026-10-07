import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { getLatestWeekReplan } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { type ProposalAuthor } from './propose-week-change.ts'
import {
	enqueueWeekChangeJobs,
	runWeekChangeForUser,
	WEEK_CHANGE_JOB_KIND,
} from './week-change.server.ts'

// Seam 1 for Ukeskiftet, the week change (#505, ADR 0080): an athlete and a
// clock go in; the stored Week Replan, its proposals and the sessions on the
// calendar come out, read back from the database.
//
// The athlete lives in Oslo (UTC+1 in January), on purpose: Sunday 20:01 in
// Oslo is 19:01Z, still before 20:00 in UTC, and Monday 06:01 in Oslo is
// 05:01Z, still before 06:00 in UTC — so a clock read in the wrong zone fails
// both the close and the morning.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2029-12-31' // a Monday
/** The week that closes in these tests, and the two after it. */
const CLOSING = '2030-01-07'
const COMING = '2030-01-14'
const HORIZON = '2030-01-21'

/** Oslo wall-clock time, as the UTC instant the server is handed. */
const oslo = (day: string, time: string) => {
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(...ymd(day), h! - 1, m!))
}
const ymd = (day: string): [number, number, number] => {
	const [y, mo, d] = day.split('-').map(Number)
	return [y!, mo! - 1, d!]
}

const LAST_SUNDAY_EVENING = oslo('2030-01-06', '20:01')
const SUNDAY_1959 = oslo('2030-01-13', '19:59')
const SUNDAY_2001 = oslo('2030-01-13', '20:01')
const MONDAY_0559 = oslo('2030-01-14', '05:59')
const MONDAY_0601 = oslo('2030-01-14', '06:01')

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: OSLO, defaultTrainingTime: '07:00' },
			},
		},
	})
}

/**
 * An athlete with a nine-week plan whose pattern lays one Wednesday run — or,
 * `openEnded`, a plan with no Event whose one round runs `roundWeeks` weeks
 * (ADR 0079).
 */
async function createAthleteWithPlan({
	withPattern = true,
	openEnded = false,
	roundWeeks = 4,
} = {}) {
	const user = await createAthlete()
	const event = openEnded
		? null
		: await prisma.event.create({
				select: { id: true },
				data: {
					athleteId: user.id,
					name: 'Spring 10k',
					kind: 'race',
					priority: 'A',
					startDate: new Date('2030-03-10T09:00:00Z'),
					disciplines: JSON.stringify(['run']),
				},
			})
	const created = await createPlanOutline(
		user.id,
		{
			...(event ? { eventId: event.id } : {}),
			startWeekKey: PLAN_START,
			structure: {
				phases: [
					event
						? { name: 'Base', weeks: 9, rhythm: 'none' as const }
						: { name: 'Blokk 1', weeks: roundWeeks, rhythm: 'none' as const },
				],
			},
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 30 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	if (withPattern) {
		const outline = await prisma.planOutline.findUniqueOrThrow({
			where: { id: created.outlineId },
			select: { tracks: { select: { id: true } } },
		})
		const added = await addWeekPattern(user.id, {
			outlineId: created.outlineId,
			name: 'Typical week',
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
	}
	return {
		userId: user.id,
		// Typed as an Event's id for the anchored suites; null when open-ended.
		eventId: event?.id as string,
		outlineId: created.outlineId,
	}
}

/** A planned run with one quantified step, so a scale has something to act on. */
async function createRun(
	userId: string,
	scheduledAt: Date,
	{
		source = 'generated',
		targetEventId = null as string | null,
		durationSec = 3600,
	} = {},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: 'Rolig tur',
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
			targetEventId,
			// Laid by that Event's plan, which is what the fill scopes by (ADR 0079).
			planOutlineId: targetEventId
				? ((
						await prisma.planOutline.findUnique({
							where: { eventId: targetEventId },
							select: { id: true },
						})
					)?.id ?? null)
				: null,
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

async function snapshot(userId: string) {
	const [replans, proposals, sessions] = await Promise.all([
		prisma.weekReplan.findMany({
			where: { athleteId: userId },
			select: { weekKey: true, outcome: true },
			orderBy: { weekKey: 'asc' },
		}),
		prisma.weekReplanProposal.findMany({
			where: { athleteId: userId },
			select: { id: true, answer: true, appliedAt: true },
			orderBy: { id: 'asc' },
		}),
		prisma.workoutSession.findMany({
			where: { userId },
			select: { id: true, scheduledAt: true, source: true },
			orderBy: { id: 'asc' },
		}),
	])
	return { replans, proposals, sessions }
}

test('the week closes at 20:00 on Sunday in the athlete’s own zone, not a minute before', async () => {
	const { userId } = await createAthleteWithPlan()
	// Last Sunday's close and Monday's silence already ran, as the hourly job
	// would have.
	await runWeekChangeForUser(userId, LAST_SUNDAY_EVENING)
	await runWeekChangeForUser(userId, oslo(CLOSING, '06:01'))
	const before = await snapshot(userId)

	const early = await runWeekChangeForUser(userId, SUNDAY_1959)

	expect(early).toMatchObject({ replanned: false, horizon: null, applied: [] })
	expect(await snapshot(userId)).toEqual(before)

	const closing = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(closing).toMatchObject({ closedWeekKey: CLOSING, replanned: true })
	const replan = await prisma.weekReplan.findUniqueOrThrow({
		where: { athleteId_weekKey: { athleteId: userId, weekKey: CLOSING } },
		select: { proposals: { select: { targetWeekKey: true, answer: true } } },
	})
	// At least the week-level keep: "keep" is a real proposal.
	expect(replan.proposals.length).toBeGreaterThan(0)
	expect(replan.proposals).toEqual(
		replan.proposals.map(() => ({ targetWeekKey: COMING, answer: 'pending' })),
	)
})

test('home reads the week that just closed from Sunday evening on', async () => {
	const { userId } = await createAthleteWithPlan()
	await runWeekChangeForUser(userId, LAST_SUNDAY_EVENING)
	await runWeekChangeForUser(userId, SUNDAY_2001)
	await prisma.weekReplan.updateMany({
		where: { athleteId: userId, weekKey: PLAN_START },
		data: { reason: 'last week' },
	})
	await prisma.weekReplan.updateMany({
		where: { athleteId: userId, weekKey: CLOSING },
		data: { reason: 'this week' },
	})

	expect(await getLatestWeekReplan(userId, SUNDAY_1959)).toMatchObject({
		reason: 'last week',
	})
	expect(await getLatestWeekReplan(userId, SUNDAY_2001)).toMatchObject({
		reason: 'this week',
	})
	expect(await getLatestWeekReplan(userId, MONDAY_0601)).toMatchObject({
		reason: 'this week',
	})
})

test('a second run of the same week change writes nothing', async () => {
	const { userId } = await createAthleteWithPlan()
	await runWeekChangeForUser(userId, SUNDAY_2001)
	const after = await snapshot(userId)

	const again = await runWeekChangeForUser(userId, SUNDAY_2001)
	const later = await runWeekChangeForUser(userId, oslo('2030-01-13', '23:30'))

	expect(again).toMatchObject({ replanned: false, horizon: null })
	expect(later).toMatchObject({ replanned: false, horizon: null })
	expect(await snapshot(userId)).toEqual(after)
})

test('from Monday 06:00 silence applies the machine’s softenings, never added load or the athlete’s own', async () => {
	const user = await createAthlete()
	const machine = await createRun(user.id, oslo('2030-01-17', '07:00'))
	const theirs = await createRun(user.id, oslo('2030-01-18', '07:00'), {
		source: 'authored',
	})
	const extra = await createRun(user.id, oslo('2030-01-03', '07:00'))
	// An author that proposes one of each: a softening on the machine's session,
	// a softening on the athlete's, and an extra session — which adds load.
	const author: ProposalAuthor = (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: [
			...facts.adjustableSessions.map((session) => ({
				payload: { kind: 'scale' as const, factor: 0.8 },
				targetSessionId: session.id,
				targetWeekKey: facts.targetWeekKey,
				reason: 'Litt kortere.',
			})),
			{
				payload: {
					kind: 'add' as const,
					workoutId: extra.workoutId!,
					date: '2030-01-19',
					time: '09:00',
				},
				targetSessionId: null,
				targetWeekKey: facts.targetWeekKey,
				reason: 'En økt til.',
			},
		],
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, author)
	expect(
		await prisma.weekReplanProposal.count({ where: { athleteId: user.id } }),
	).toBe(3)
	// Sunday evening is the athlete's time to answer: nothing applied yet, and
	// still nothing a minute before six on Monday.
	expect(await runWeekChangeForUser(user.id, MONDAY_0559)).toMatchObject({
		applied: [],
	})
	expect(await durationOf(machine.id)).toBe(3600)

	const morning = await runWeekChangeForUser(user.id, MONDAY_0601)

	expect(morning.applied).toHaveLength(1)
	expect(morning.held).toHaveLength(2)
	expect(await durationOf(machine.id)).toBe(2880)
	expect(await durationOf(theirs.id)).toBe(3600)
	expect(
		await prisma.workoutSession.count({
			where: { userId: user.id, scheduledAt: oslo('2030-01-19', '09:00') },
		}),
	).toBe(0)
	// What silence would not take stays answerable.
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: user.id, answer: 'pending', appliedAt: null },
		}),
	).toBe(2)
})

test('the close fills the horizon week with the machine’s sessions and leaves the athlete’s there alone', async () => {
	const { userId, eventId } = await createAthleteWithPlan()
	const theirs = await createRun(userId, oslo('2030-01-25', '18:00'), {
		source: 'authored',
		targetEventId: eventId,
	})

	const run = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: HORIZON, sessions: 1 })
	const inHorizon = await prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: {
				gte: oslo(HORIZON, '00:00'),
				lt: oslo('2030-01-28', '00:00'),
			},
		},
		select: { id: true, source: true, scheduledAt: true, targetEventId: true },
		orderBy: { scheduledAt: 'asc' },
	})
	expect(inHorizon).toEqual([
		{
			id: expect.any(String),
			source: 'generated',
			// The pattern's Wednesday, at the athlete's own training time.
			scheduledAt: oslo('2030-01-23', '07:00'),
			targetEventId: eventId,
		},
		expect.objectContaining({ id: theirs.id, source: 'authored' }),
	])
})

test('a horizon week the plan already laid is not laid twice', async () => {
	const { userId, eventId } = await createAthleteWithPlan()
	const laid = await createRun(userId, oslo('2030-01-23', '07:00'), {
		targetEventId: eventId,
	})

	const run = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: HORIZON, sessions: 0 })
	const generated = await prisma.workoutSession.findMany({
		where: { userId, source: 'generated' },
		select: { id: true },
	})
	expect(generated).toEqual([{ id: laid.id }])
})

test('the close fills the horizon week of an open-ended plan, anchored to the plan', async () => {
	// One four-week round from 31 Dec: the horizon week (21 Jan) is its fourth.
	const { userId, outlineId } = await createAthleteWithPlan({ openEnded: true })

	const run = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: HORIZON, sessions: 1 })
	expect(
		await prisma.workoutSession.findMany({
			where: { userId },
			select: {
				source: true,
				scheduledAt: true,
				targetEventId: true,
				planOutlineId: true,
			},
		}),
	).toEqual([
		{
			source: 'generated',
			scheduledAt: oslo('2030-01-23', '07:00'),
			targetEventId: null,
			planOutlineId: outlineId,
		},
	])
	// And it is not laid twice: the close runs once, and a laid week stays laid.
	await runWeekChangeForUser(userId, oslo('2030-01-13', '21:00'))
	expect(await prisma.workoutSession.count({ where: { userId } })).toBe(1)
})

test('an open-ended plan has no end date, so past its last round the close fills nothing', async () => {
	// A three-week round from 31 Dec ends on 20 Jan, before the horizon week. The
	// next round is appended by its own proposal (#505 S6), never by the fill.
	const { userId } = await createAthleteWithPlan({
		openEnded: true,
		roundWeeks: 3,
	})

	const run = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: HORIZON, sessions: 0 })
	expect(await prisma.workoutSession.count({ where: { userId } })).toBe(0)
})

test('the sweep queues an athlete whose only plan is open-ended', async () => {
	const { userId } = await createAthleteWithPlan({ openEnded: true })

	await enqueueWeekChangeJobs(SUNDAY_2001)

	const jobs = await prisma.job.findMany({
		where: { kind: WEEK_CHANGE_JOB_KIND },
		select: { payload: true },
	})
	expect(jobs.map((job) => JSON.parse(job.payload))).toEqual([
		{ athleteId: userId },
	])
})

test('with no plan, or a plan with no pattern, the close fills nothing', async () => {
	const athlete = await createAthlete()
	await createRun(athlete.id, oslo('2030-01-09', '07:00'), {
		source: 'authored',
	})
	const patternless = await createAthleteWithPlan({ withPattern: false })

	for (const userId of [athlete.id, patternless.userId]) {
		const run = await runWeekChangeForUser(userId, SUNDAY_2001)
		expect(run).toMatchObject({
			replanned: true,
			horizon: { weekKey: HORIZON, sessions: 0 },
		})
		expect(
			await prisma.workoutSession.count({
				where: { userId, source: 'generated' },
			}),
		).toBe(0)
	}
})

test('the hourly sweep queues one job per athlete with a week change due, and only one', async () => {
	const due = await createAthlete()
	await createRun(due.id, oslo('2030-01-09', '07:00'))
	const done = await createAthlete()
	await createRun(done.id, oslo('2030-01-09', '07:00'))
	await runWeekChangeForUser(done.id, SUNDAY_2001)
	// No sessions at all: no week to judge.
	await createAthlete()

	const first = await enqueueWeekChangeJobs(SUNDAY_2001)
	const second = await enqueueWeekChangeJobs(SUNDAY_2001)

	expect(first.enqueued).toBe(1)
	expect(second.enqueued).toBe(0)
	const jobs = await prisma.job.findMany({
		where: { kind: WEEK_CHANGE_JOB_KIND },
		select: { payload: true },
	})
	expect(jobs.map((job) => JSON.parse(job.payload))).toEqual([
		{ athleteId: due.id },
	])
})

test('a proposal silence held is never queued again: the sweep stops once the morning has run', async () => {
	const user = await createAthlete()
	await createRun(user.id, oslo('2030-01-18', '07:00'), { source: 'authored' })
	// A softening on the athlete's own session: silence holds it for their yes.
	const author: ProposalAuthor = (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: facts.adjustableSessions.map((session) => ({
			payload: { kind: 'scale' as const, factor: 0.8 },
			targetSessionId: session.id,
			targetWeekKey: facts.targetWeekKey,
			reason: 'Litt kortere.',
		})),
	})
	await runWeekChangeForUser(user.id, SUNDAY_2001, author)
	expect((await enqueueWeekChangeJobs(SUNDAY_2001)).enqueued).toBe(0)

	// Monday morning: silence is due once…
	expect((await enqueueWeekChangeJobs(MONDAY_0601)).enqueued).toBe(1)
	await prisma.job.updateMany({
		where: { kind: WEEK_CHANGE_JOB_KIND },
		data: { status: 'completed' },
	})
	const morning = await runWeekChangeForUser(user.id, MONDAY_0601, author)
	expect(morning.held).toHaveLength(1)

	// …and never again, however long the proposal waits for an answer.
	for (const time of ['07:01', '12:01', '23:01']) {
		expect((await enqueueWeekChangeJobs(oslo(COMING, time))).enqueued).toBe(0)
		expect(
			await runWeekChangeForUser(user.id, oslo(COMING, time), author),
		).toMatchObject({ applied: [], held: [] })
	}
	expect(
		await prisma.weekReplanProposal.count({
			where: { athleteId: user.id, answer: 'pending', appliedAt: null },
		}),
	).toBe(1)
})

test('a horizon fill that did not finish is retried by the next run, and then never again', async () => {
	const { userId } = await createAthleteWithPlan()
	await runWeekChangeForUser(userId, SUNDAY_2001)
	// As a fill that failed after the close leaves it: the week empty, unclaimed.
	await prisma.workoutSession.deleteMany({
		where: { userId, source: 'generated' },
	})
	await prisma.weekReplan.update({
		where: { athleteId_weekKey: { athleteId: userId, weekKey: CLOSING } },
		data: { horizonFilledAt: null },
	})
	expect((await enqueueWeekChangeJobs(SUNDAY_2001)).enqueued).toBe(1)

	const retry = await runWeekChangeForUser(userId, oslo('2030-01-13', '21:01'))
	expect(retry).toMatchObject({
		replanned: false,
		horizon: { weekKey: HORIZON, sessions: 1 },
	})

	// The athlete clears the week again: it stays cleared.
	await prisma.workoutSession.deleteMany({
		where: { userId, source: 'generated' },
	})
	const later = await runWeekChangeForUser(userId, oslo('2030-01-13', '22:01'))
	expect(later.horizon).toBeNull()
	expect(
		await prisma.workoutSession.count({
			where: { userId, source: 'generated' },
		}),
	).toBe(0)
})

test('a horizon week whose plan sessions the athlete adopted is not laid a second time', async () => {
	const { userId, eventId } = await createAthleteWithPlan()
	const adopted = await createRun(userId, oslo('2030-01-23', '07:00'), {
		targetEventId: eventId,
	})
	await prisma.workoutSession.update({
		where: { id: adopted.id },
		data: { adoptedAt: new Date('2030-01-10T12:00:00Z') },
	})

	const run = await runWeekChangeForUser(userId, SUNDAY_2001)

	expect(run.horizon).toEqual({ weekKey: HORIZON, sessions: 0 })
	expect(
		await prisma.workoutSession.findMany({
			where: { userId, targetEventId: eventId },
			select: { id: true },
		}),
	).toEqual([{ id: adopted.id }])
})
