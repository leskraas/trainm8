import { expect, test } from 'vitest'
import { localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getActivePlan } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { createPlanOutline } from './authoring.server.ts'
import { getWeekVolumes, setCountsInNoTrack } from './week-volumes.server.ts'

// The three week numbers read from the database (#505 stories 20–24, 33, 34):
// a run plan in km, a week of sessions, and a clock go in; the Week Target,
// the Planned Volume and the Actual Volume come out, in km.
//
// The plan opens Monday 7 Jan 2030. The week read is its second (14 Jan), and
// the clock is Thursday 17 Jan, so Monday to Wednesday are past.

const OSLO = 'Europe/Oslo'
const PLAN_START = '2030-01-07'
const WEEK = '2030-01-14'
const THURSDAY = new Date('2030-01-17T12:00:00Z')

async function setUp() {
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
			structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		new Date('2030-01-02T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	return user.id
}

async function addRun(
	userId: string,
	{
		date,
		km,
		minutes,
		status = 'scheduled',
		recordedKm,
		discipline = 'run',
	}: {
		date: string
		km?: number
		minutes?: number
		status?: string
		recordedKm?: number
		discipline?: string
	},
) {
	const scheduledAt = localTimeUTC(date, '07:00', OSLO)
	const workout =
		km != null || minutes != null
			? await prisma.workout.create({
					select: { id: true },
					data: {
						ownerId: userId,
						title: 'Tur',
						discipline,
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
												discipline,
												distanceM: km != null ? km * 1000 : null,
												durationSec: minutes != null ? minutes * 60 : null,
											},
										],
									},
								},
							],
						},
					},
				})
			: null
	const recording =
		recordedKm != null
			? await prisma.activityImport.create({
					select: { id: true },
					data: {
						athleteId: userId,
						externalProvider: 'manual',
						externalId: `${date}-${discipline}-${recordedKm}`,
						startedAt: scheduledAt,
						endedAt: scheduledAt,
						durationSec: Math.round(recordedKm * 300),
						distanceM: recordedKm * 1000,
						discipline,
						rawJson: '{}',
					},
				})
			: null
	return prisma.workoutSession.create({
		select: { id: true, updatedAt: true },
		data: {
			userId,
			workoutId: workout?.id ?? null,
			recordingId: recording?.id ?? null,
			scheduledAt,
			status,
			source: 'authored',
		},
	})
}

test('a week reads its target, planned and done in the run track’s km', async () => {
	const userId = await setUp()
	await addRun(userId, {
		date: '2030-01-14',
		km: 10,
		status: 'completed',
		recordedKm: 10.5,
	})
	await addRun(userId, { date: '2030-01-16', km: 8 })
	await addRun(userId, { date: '2030-01-19', km: 16 })
	// A long run with only a duration: counted apart, never as zero km.
	await addRun(userId, { date: '2030-01-20', minutes: 90 })
	// An "other" import counts in nothing.
	await addRun(userId, {
		date: '2030-01-15',
		status: 'completed',
		recordedKm: 6,
		discipline: 'other',
	})

	const plan = await getActivePlan(userId, THURSDAY)
	const { tracks, other } = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: THURSDAY,
	})
	const run = tracks[0]!

	expect(run).toMatchObject({
		discipline: 'run',
		currency: 'km',
		// The plan's own Week Target for its second week.
		target: plan!.tracks[0]!.targets[1],
		planned: 34,
		actual: 10.5,
		plannedUnmeasuredCount: 1,
	})
	expect(run.target).not.toBeNull()
	// Wednesday's 8 km was missed: Monday to Wednesday asked 18, 10.5 was done.
	expect(run.grade).toMatchObject({
		status: 'under',
		gradedThroughKey: '2030-01-16',
		reference: 18,
	})
	expect(other).toMatchObject({
		sessions: 1,
		done: 1,
		byReason: [{ reason: 'other-discipline', count: 1 }],
	})
})

test('writing a session moves the Planned Volume and never the Week Target', async () => {
	const userId = await setUp()
	const before = await getWeekVolumes(userId, { weekKey: WEEK, now: THURSDAY })
	await addRun(userId, { date: '2030-01-19', km: 25 })
	const after = await getWeekVolumes(userId, { weekKey: WEEK, now: THURSDAY })

	expect(after.tracks[0]!.target).toBe(before.tracks[0]!.target)
	expect(before.tracks[0]!.planned).toBe(0)
	expect(after.tracks[0]!.planned).toBe(25)
})

test('reps with a timed rest count their km; the rest adds none', async () => {
	const userId = await setUp()
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: '6x1 km p 1 min',
			discipline: 'run',
			intent: 'threshold',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 6,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									distanceM: 1000,
								},
								{ orderIndex: 1, kind: 'rest', durationSec: 60 },
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
			workoutId: workout.id,
			scheduledAt: localTimeUTC('2030-01-18', '07:00', OSLO),
			status: 'scheduled',
			source: 'authored',
		},
	})
	const { tracks } = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: THURSDAY,
	})
	expect(tracks[0]).toMatchObject({ planned: 6, plannedUnmeasuredCount: 0 })
})

test('a Monday grades nothing yet', async () => {
	const userId = await setUp()
	await addRun(userId, { date: '2030-01-14', km: 10 })
	const { tracks } = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: new Date('2030-01-14T05:00:00Z'),
	})
	expect(tracks[0]!.grade).toMatchObject({
		status: 'not-yet',
		gradedThroughKey: null,
	})
})

test('on Sunday evening the closed week is graded through Sunday', async () => {
	const userId = await setUp()
	await addRun(userId, {
		date: '2030-01-14',
		km: 10,
		status: 'completed',
		recordedKm: 10,
	})
	await addRun(userId, {
		date: '2030-01-20',
		km: 20,
		status: 'completed',
		recordedKm: 20,
	})
	// Sunday 20 Jan: 19:30 is before the close, 20:30 after (Oslo, UTC+1).
	const before = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: new Date('2030-01-20T18:30:00Z'),
	})
	expect(before.tracks[0]!.grade.gradedThroughKey).toBe('2030-01-19')

	const after = await getWeekVolumes(userId, {
		weekKey: WEEK,
		now: new Date('2030-01-20T19:30:00Z'),
	})
	expect(after.tracks[0]!.grade).toMatchObject({
		gradedThroughKey: '2030-01-20',
		reference: 30,
		actual: 30,
		status: 'on',
	})
})

test('the athlete can put a session in Annet and take it back; it moves no track', async () => {
	const userId = await setUp()
	await addRun(userId, {
		date: '2030-01-14',
		km: 10,
		status: 'completed',
		recordedKm: 10,
	})
	const commute = await addRun(userId, {
		date: '2030-01-15',
		km: 6,
		status: 'completed',
		recordedKm: 6,
	})

	expect(await setCountsInNoTrack(userId, commute.id, true)).toEqual({
		ok: true,
	})
	const inAnnet = await getWeekVolumes(userId, { weekKey: WEEK, now: THURSDAY })
	expect(inAnnet.tracks[0]).toMatchObject({ planned: 10, actual: 10 })
	expect(inAnnet.other).toMatchObject({
		sessions: 1,
		byReason: [{ reason: 'athlete-choice', count: 1 }],
	})
	// Choosing a track is not an edit: the Week Replan's stale guard reads
	// `updatedAt`, and its TSS still feeds load untouched.
	const row = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: commute.id },
		select: { updatedAt: true, adoptedAt: true, countsInNoTrack: true },
	})
	expect(row).toEqual({
		updatedAt: commute.updatedAt,
		adoptedAt: null,
		countsInNoTrack: true,
	})

	await setCountsInNoTrack(userId, commute.id, false)
	const back = await getWeekVolumes(userId, { weekKey: WEEK, now: THURSDAY })
	expect(back.tracks[0]).toMatchObject({ planned: 16, actual: 16 })
	expect(back.other).toBeNull()
})

test('another athlete’s session cannot be put in Annet', async () => {
	const owner = await setUp()
	const stranger = await setUp()
	const session = await addRun(owner, { date: '2030-01-15', km: 6 })
	expect(await setCountsInNoTrack(stranger, session.id, true)).toEqual({
		ok: false,
		reason: 'session-not-found',
	})
	const row = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { countsInNoTrack: true },
	})
	expect(row.countsInNoTrack).toBe(false)
})
