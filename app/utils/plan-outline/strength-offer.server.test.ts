import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getSeasonForOutline } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createOpenEndedPlan,
} from './authoring.server.ts'
import { readStrengthTrackOffer } from './history.server.ts'
import { addProposedStrengthTrack } from './strength-offer.server.ts'

// A strength track proposed from the athlete's own lifting (#505 story 15):
// their last four complete weeks go in, an offer — or none — comes out, and
// accepting it adds the track.

const OSLO = 'Europe/Oslo'
/** Wednesday 9 Jan 2030; the window is the four weeks 10 Dec – 6 Jan. */
const NOW = new Date('2030-01-09T12:00:00Z')

async function athlete() {
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
	const plan = await createOpenEndedPlan(
		user.id,
		{ discipline: 'run', weeklyHours: 4 },
		NOW,
	)
	if (!plan.ok) throw new Error(plan.reason)
	return { userId: user.id, outlineId: plan.outlineId }
}

/** A week pattern of one Wednesday run on the plan's run track. */
async function weekOfRunning(userId: string, outlineId: string) {
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const added = await addWeekPattern(userId, { outlineId, name: 'Uke' })
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const day = await addWeekPatternDay(userId, {
		patternId: pattern.id,
		kind: 'share',
		trackId: track.id,
		weekday: 2,
		weight: 1,
	})
	if (!day.ok) throw new Error(day.reason)
}

/** The plan's sessions in the week of `weekKey`, by Discipline. */
async function disciplinesIn(userId: string, from: string, to: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			status: 'scheduled',
			scheduledAt: { gte: new Date(from), lt: new Date(to) },
		},
		select: { source: true, workout: { select: { discipline: true } } },
	})
	return sessions.map((s) => `${s.workout?.discipline}:${s.source}`).sort()
}

/** A completed strength session of `sets` working sets on `scheduledAt`. */
async function lifted(userId: string, scheduledAt: Date, sets = 3) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Knebøy',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									sets: {
										create: Array.from({ length: sets }, (_, i) => ({
											orderIndex: i,
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
	})
	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status: 'completed',
			workoutId: workout.id,
		},
	})
}

test('an athlete who lifts twice a week is offered a strength track; accepting it gives the plan lifting targets and lifting sessions', async () => {
	const { userId, outlineId } = await athlete()
	await weekOfRunning(userId, outlineId)
	// Monday and Thursday of each of the four weeks: eight sessions, 24 sets.
	for (const monday of [10, 17, 24, 31]) {
		const day = new Date(Date.UTC(2029, 11, monday, 16))
		await lifted(userId, day)
		await lifted(userId, new Date(day.getTime() + 3 * 24 * 60 * 60 * 1000))
	}

	const offer = await readStrengthTrackOffer(userId, NOW)
	expect(offer).toMatchObject({
		sessionsPerWeek: 2,
		anchor: { value: 6, derivation: { currency: 'sets', total: 24 } },
	})

	expect(await addProposedStrengthTrack(userId, outlineId, NOW)).toMatchObject({
		ok: true,
		lifts: 2,
	})
	const track = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId, discipline: 'strength' },
		select: {
			currency: true,
			anchors: { select: { value: true } },
		},
	})
	expect(track).toEqual({ currency: 'sets', anchors: [{ value: 6 }] })

	// Every week from the first unbegun one (14 Jan) has a lifting target: a
	// block over the plan's weeks left, at two sessions a week.
	const season = await getSeasonForOutline(userId, outlineId, NOW)
	const strengthTargets = season!.weeks.map(
		(week) => week.targets.find((t) => t.discipline === 'strength')?.value,
	)
	// The week being lived is a gap: no lifting was planned in it.
	expect(strengthTargets[0]).toBe(0)
	for (const target of strengthTargets.slice(1)) {
		expect(target).toBeGreaterThan(0)
	}
	expect(
		season!.tracks.find((t) => t.discipline === 'strength')?.strengthSegments,
	).toEqual([
		expect.objectContaining({ sessionsPerWeek: 2, goal: 'hypertrophy' }),
	])

	// And the horizon week (14 Jan, the week after the one closed on 6 Jan
	// plus one) is on the calendar: its run and its two lifting sessions, the
	// app's.
	expect(
		await disciplinesIn(userId, '2030-01-13T23:00:00Z', '2030-01-20T23:00:00Z'),
	).toEqual(['run:generated', 'strength:generated', 'strength:generated'])
	// Accepting twice adds nothing twice.
	expect(await addProposedStrengthTrack(userId, outlineId, NOW)).toEqual({
		ok: false,
		reason: 'discipline-already-tracked',
	})
})

/** A run Workout of the athlete's that prescribes intervals (VO₂ max). */
async function intervals(userId: string) {
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Intervaller',
			discipline: 'run',
			intent: 'vo2max',
			ownerId: userId,
		},
	})
}

/** The weekday (0 = Monday) each strength session in the range lands on. */
async function liftingWeekdays(userId: string, from: string, to: string) {
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			status: 'scheduled',
			scheduledAt: { gte: new Date(from), lt: new Date(to) },
			workout: { discipline: 'strength' },
		},
		select: { scheduledAt: true },
	})
	const monday = new Date(from).getTime()
	return sessions
		.map((s) => Math.floor((s.scheduledAt.getTime() - monday) / 86_400_000))
		.sort((a, b) => a - b)
}

test('accepting the offer adds lifting slots, laid away from the intervals rather than on the first days of the week', async () => {
	const { userId, outlineId } = await athlete()
	// Every day is a training day, so the front of the week is free to lift on.
	await prisma.athleteProfile.update({
		where: { userId },
		data: { trainableWeekdays: JSON.stringify([0, 1, 2, 3, 4, 5, 6]) },
	})
	await weekOfRunning(userId, outlineId)
	// Intervals every Tuesday: a hard day, and Monday the day before it.
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId },
		select: { id: true },
	})
	const run = await prisma.trainingTrack.findFirstOrThrow({
		where: { outlineId, discipline: 'run' },
		select: { id: true },
	})
	const tuesday = await addWeekPatternDay(userId, {
		patternId: pattern.id,
		kind: 'fixed',
		trackId: run.id,
		weekday: 1,
		workoutId: (await intervals(userId)).id,
	})
	if (!tuesday.ok) throw new Error(tuesday.reason)
	for (const monday of [10, 17, 24, 31]) {
		const day = new Date(Date.UTC(2029, 11, monday, 16))
		await lifted(userId, day)
		await lifted(userId, new Date(day.getTime() + 3 * 24 * 60 * 60 * 1000))
	}

	expect(await addProposedStrengthTrack(userId, outlineId, NOW)).toMatchObject({
		ok: true,
		lifts: 2,
	})

	// Two lifting slots on no weekday: the stamp picks each week's days.
	const slots = await prisma.weekPatternDay.findMany({
		where: { patternId: pattern.id, track: { discipline: 'strength' } },
		select: { kind: true, weekday: true, workoutId: true },
	})
	expect(slots).toEqual([
		expect.objectContaining({ kind: 'lifting', weekday: null }),
		expect.objectContaining({ kind: 'lifting', weekday: null }),
	])
	expect(slots.every((slot) => slot.workoutId != null)).toBe(true)

	// The week of 14 Jan (Monday 00:00 Oslo) lifts twice, on neither the
	// interval day nor the day before it.
	const days = await liftingWeekdays(
		userId,
		'2030-01-13T23:00:00Z',
		'2030-01-20T23:00:00Z',
	)
	expect(days).toHaveLength(2)
	expect(days).not.toContain(0)
	expect(days).not.toContain(1)
})

test('with no lifting in the window nothing is offered, and nothing can be accepted', async () => {
	const { userId, outlineId } = await athlete()
	// Lifting long before the window says nothing about the athlete now.
	await lifted(userId, new Date('2029-10-01T16:00:00Z'))

	expect(await readStrengthTrackOffer(userId, NOW)).toBeNull()
	expect(await addProposedStrengthTrack(userId, outlineId, NOW)).toEqual({
		ok: false,
		reason: 'no-strength-history',
	})
	expect(
		await prisma.trainingTrack.count({
			where: { outlineId, discipline: 'strength' },
		}),
	).toBe(0)
})
