import { expect, test } from 'vitest'
import { addDays, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { createFirstRunPlan } from './plan.server.ts'
import { draftStart } from './start-draft.ts'
import { readStartStrength } from './start-strength.server.ts'

// Strength in the start, made (#574, ADR 0103): what is made is what the card
// showed — the lifting days on the days shown, each the session shown, the
// endurance week unchanged — and the tap is kept as the athlete's answer.

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const START = '2030-01-14' // the first week not yet begun: next Monday

async function createAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	return user.id
}

const answers = {
	discipline: 'run' as const,
	hours: 5,
	// mandag, onsdag, fredag, lørdag
	days: [0, 2, 4, 5] as Array<0 | 1 | 2 | 3 | 4 | 5 | 6>,
	goal: { kind: 'active' as const },
	level: 'recreational' as const,
	family: 'polarized' as const,
	strength: 2,
}

async function weekOne(athleteId: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId: athleteId,
			scheduledAt: { gte: new Date(START), lt: new Date(addDays(START, 7)) },
		},
		orderBy: { scheduledAt: 'asc' },
		select: {
			scheduledAt: true,
			status: true,
			markedDoneAt: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					blocks: { select: { steps: { select: { durationSec: true } } } },
				},
			},
		},
	})
	return sessions.map((session) => ({
		weekday: weekdayIndex(session.scheduledAt.toISOString().slice(0, 10)),
		...session,
	}))
}

test('with no lifting of their own, the lifting days copy the full-body Stock Workout the card named', async () => {
	const athleteId = await createAthlete()
	const reading = await readStartStrength(athleteId, NOW)
	expect(reading).toMatchObject({
		workoutId: 'stock_strength-S1',
		fromHistory: null,
	})
	expect(reading!.session.lifts.length).toBeGreaterThan(0)

	const start = draftStart({
		level: 'recreational',
		discipline: 'run',
		hours: 5,
		days: answers.days,
		startWeekKey: START,
		strength: { perWeek: 2, session: reading!.session },
	})!
	const option = start.options.find((shown) => shown.family === 'polarized')!
	expect(option.strengthDays).toHaveLength(2)

	const created = await createFirstRunPlan(athleteId, answers, NOW)
	expect(created).toMatchObject({ ok: true })

	const week = await weekOne(athleteId)
	const lifts = week.filter((s) => s.workout?.discipline === 'strength')
	const endurance = week.filter((s) => s.workout?.discipline !== 'strength')
	// The lifting days are the card's, each the session it named.
	expect(lifts.map((s) => s.weekday)).toEqual(option.strengthDays)
	for (const lift of lifts) {
		expect(lift.workout!.title).toBe(reading!.session.title)
	}
	// The endurance week is the card's, minute for minute: lifting is not in
	// the hours.
	expect(
		endurance.map((s) => [
			s.weekday,
			Math.round(
				s
					.workout!.blocks.flatMap((block) => block.steps)
					.reduce((sum, step) => sum + (step.durationSec ?? 0), 0) / 60,
			),
		]),
	).toEqual(
		option.week.days.flatMap((day) =>
			day.sessions.map((session) => [day.weekday, session.minutes]),
		),
	)
	// Making a plan marks nothing.
	expect(
		week.every((s) => s.status === 'scheduled' && s.markedDoneAt == null),
	).toBe(true)

	// A strength track at the frequency laid, and the tap kept as theirs.
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outline: { athleteId }, discipline: 'strength' },
		select: {
			currency: true,
			segments: { select: { kind: true, sessionsPerWeek: true } },
		},
	})
	expect(track).toEqual({
		currency: 'sets',
		segments: [{ kind: 'strength', sessionsPerWeek: 2 }],
	})
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: athleteId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBe(2)
})

test('without styrke there is no strength track and no answer is stored', async () => {
	const athleteId = await createAthlete()
	const { strength: _, ...withoutStrength } = answers
	const created = await createFirstRunPlan(athleteId, withoutStrength, NOW)
	expect(created).toMatchObject({ ok: true })
	expect(
		await prisma.trainingTrack.count({
			where: { outline: { athleteId }, discipline: 'strength' },
		}),
	).toBe(0)
	const profile = await prisma.athleteProfile.findUniqueOrThrow({
		where: { userId: athleteId },
		select: { strengthPerWeek: true },
	})
	expect(profile.strengthPerWeek).toBeNull()
})

test('an athlete who lifts copies their own most recent strength session', async () => {
	const athleteId = await createAthlete()
	const own = await prisma.workout.create({
		data: {
			title: 'Min styrkeøkt',
			discipline: 'strength',
			intent: 'strength-max',
			ownerId: athleteId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									kind: 'strength',
									orderIndex: 0,
									exerciseId: 'ex_bb_back_squat',
									sets: {
										create: [0, 1, 2, 3, 4].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
										})),
									},
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	await prisma.workoutSession.create({
		data: {
			userId: athleteId,
			workoutId: own.id,
			scheduledAt: new Date('2030-01-07T17:00:00Z'),
			status: 'completed',
			source: 'authored',
		},
	})
	const reading = await readStartStrength(athleteId, NOW)
	expect(reading).toMatchObject({
		workoutId: own.id,
		setsPerSession: 5,
		session: { title: 'Min styrkeøkt', lifts: ['Knebøy 5×5'] },
	})

	const created = await createFirstRunPlan(
		athleteId,
		{ ...answers, strength: 1 },
		NOW,
	)
	expect(created).toMatchObject({ ok: true })
	const lifts = (await weekOne(athleteId)).filter(
		(s) => s.workout?.discipline === 'strength',
	)
	expect(lifts.map((s) => s.workout!.title)).toEqual(['Min styrkeøkt'])
})
