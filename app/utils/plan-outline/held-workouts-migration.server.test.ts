import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { type WorkoutAuthoringInput } from '#app/utils/workout-schema.ts'
import {
	createWorkoutSession,
	deleteWorkoutSession,
	updateWorkoutSession,
	workoutCopySelect,
} from '#app/utils/workout.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	createOpenEndedPlan,
	createPlanOutline,
} from './authoring.server.ts'
import { stampWeekPattern } from './stamp.server.ts'

// The migration that gives existing plans their Held Workouts (#665, ADR 0113
// §8), run for real on plans whose days still point at sessions' rows, a Stock
// Workout and a row two plans share: every day ends up on a row its own plan
// holds, and the weeks the plan lays after the deploy are the weeks it laid
// before, across every column `copyWorkout` carries.

const MIGRATION = path.join(
	process.cwd(),
	'prisma/migrations/20261107130000_a_plan_holds_its_pattern_workouts/migration.sql',
)

/** The migration's data step: its statements below the `-- backfill` marker. */
async function runBackfill() {
	const sql = fs.readFileSync(MIGRATION, 'utf8')
	const [, backfill] = sql.split(/^-- backfill$/m)
	if (!backfill) throw new Error('no -- backfill marker in the migration')
	const statements = backfill
		.split(/;\s*$/m)
		.map((statement) =>
			statement
				.split('\n')
				.filter((line) => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(Boolean)
	for (const statement of statements) {
		await prisma.$executeRawUnsafe(statement)
	}
}

const NOW = new Date('2030-01-09T12:00:00Z') // a Wednesday
const WEEK_1 = '2030-01-14'
const WEEK_2 = '2030-01-21'

async function athlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: { timezone: 'Europe/Oslo', defaultTrainingTime: '07:00' },
			},
		},
	})
	return user.id
}

const intervals = (title: string): WorkoutAuthoringInput => ({
	title,
	discipline: 'run',
	intent: 'threshold',
	scheduledAt: new Date('2030-01-08T07:00:00Z'),
	blocks: [
		{
			name: 'Drag',
			repeatCount: 4,
			seriesRepeatCount: 2,
			betweenSeriesRestSec: 180,
			steps: [
				{
					kind: 'cardio',
					discipline: 'run',
					durationSec: 480,
					intensity: { kind: 'zoneLabel' as const, label: 'Z4' },
					notes: 'Jevnt',
				},
				{ kind: 'rest', durationSec: 60 },
			],
		},
	],
})

/** A session of the athlete's own, with the resolved cache filled in. */
async function session(userId: string, title: string) {
	const created = await createWorkoutSession(userId, intervals(title))
	const { workoutId } = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: created.id },
		select: { workoutId: true },
	})
	await prisma.workoutStep.updateMany({
		where: { block: { workoutId: workoutId! }, kind: 'cardio' },
		data: {
			intensityHrMin: 160,
			intensityHrMax: 170,
			intensityPaceMin: 230,
			intensityPaceMax: 240,
			gradePctMin: 2,
			gradePctMax: 4,
		},
	})
	await prisma.workout.update({
		where: { id: workoutId! },
		data: { archetype: 'threshold', description: 'To serier' },
	})
	return { sessionId: created.id, workoutId: workoutId! }
}

/** A strength Stock Workout whose sets state every load column. */
async function stockLift() {
	const exercise = await prisma.exercise.findFirstOrThrow({
		select: { id: true },
	})
	return prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Helkropp A',
			description: 'ACSM',
			discipline: 'strength',
			intent: 'strength',
			authorship: 'system',
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									restBetweenSetsSec: 120,
									sets: {
										create: [0, 1, 2].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'pct1RM', pct: 80 }),
											pct1RM: 80,
											effortCap: JSON.stringify({ kind: 'rir', rir: 2 }),
											tempo: '3-0-1',
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
}

/** A Workout's prescription as the stamp copies it, without its id. */
async function prescription(workoutId: string) {
	const {
		id: _id,
		visibility: _visibility,
		...rest
	} = await prisma.workout.findUniqueOrThrow({
		where: { id: workoutId },
		select: workoutCopySelect,
	})
	return rest
}

/** What the plan laid in the week of `weekKey`, in order. */
async function laidIn(userId: string, outlineId: string, weekKey: string) {
	const from = new Date(`${weekKey}T00:00:00Z`)
	const sessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			planOutlineId: outlineId,
			scheduledAt: {
				gte: from,
				lt: new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000),
			},
		},
		orderBy: [{ scheduledAt: 'asc' }, { workout: { title: 'asc' } }],
		select: { scheduledAt: true, workoutId: true },
	})
	return Promise.all(
		sessions.map(async (laid) => ({
			at: laid.scheduledAt.toISOString(),
			...(await prescription(laid.workoutId!)),
		})),
	)
}

async function stamp(userId: string, patternId: string, weekKey: string) {
	const stamped = await stampWeekPattern(
		userId,
		{ patternId, weekKeys: [weekKey], replace: true },
		NOW,
	)
	if (!stamped.ok) throw new Error(stamped.reason)
}

/** A day written as the app wrote one before ADR 0113: on any Workout. */
function dayOn(data: {
	patternId: string
	trackId: string
	kind: 'fixed' | 'share' | 'lifting'
	weekday: number | null
	orderInDay?: number
	weight?: number
	workoutId: string
}) {
	return prisma.weekPatternDay.create({
		data: {
			orderInDay: 0,
			weight: null,
			...data,
		},
	})
}

/**
 * The athlete's race plan as it stood before the deploy: a fixed Wednesday
 * on a session's Workout, a long Saturday shaped on another session, two
 * lifting slots on a Stock Workout, a Simple Activity's Workout only this
 * plan's days use, and a Friday on a Workout the athlete's other plan's days
 * use too. The other plan is open-ended and lays the same Friday.
 */
async function plansBeforeTheDeploy() {
	const userId = await athlete()
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: userId,
			name: 'Vårhalvmaraton',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const race = await createPlanOutline(
		userId,
		{
			eventId: event.id,
			startWeekKey: '2030-01-07',
			structure: { phases: [{ name: 'Base', weeks: 6, rhythm: 'none' }] },
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 50 },
				{ discipline: 'strength', currency: 'sets', anchorValue: 12 },
				{ discipline: 'other', currency: 'hours', anchorValue: 1 },
			],
		},
		NOW,
	)
	if (!race.ok) throw new Error(race.reason)
	const open = await createOpenEndedPlan(
		userId,
		{ discipline: 'run', weeklyHours: 4 },
		NOW,
	)
	if (!open.ok) throw new Error(open.reason)

	const tracksOf = async (outlineId: string) =>
		Object.fromEntries(
			(
				await prisma.trainingTrack.findMany({
					where: { outlineId },
					select: { id: true, discipline: true },
				})
			).map((track) => [track.discipline, track.id]),
		) as Record<string, string>
	const patternOf = async (outlineId: string) => {
		const added = await addWeekPattern(userId, { outlineId, name: 'Uke' })
		if (!added.ok) throw new Error(added.reason)
		return (
			await prisma.weekPattern.findFirstOrThrow({
				where: { outlineId },
				select: { id: true },
			})
		).id
	}
	const raceTracks = await tracksOf(race.outlineId)
	const openTracks = await tracksOf(open.outlineId)
	const racePattern = await patternOf(race.outlineId)
	const openPattern = await patternOf(open.outlineId)

	const fixed = await session(userId, 'Terskel 2×4×8')
	const shape = await session(userId, 'Langtur')
	const stock = await stockLift()
	const activity = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: 'Klatring',
			discipline: 'other',
			intent: 'endurance',
			activityKind: 'climb',
			effortWord: 'medium',
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [{ orderIndex: 0, kind: 'cardio', durationSec: 3600 }],
						},
					},
				],
			},
		},
	})
	const shared = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title: 'Rolig 45',
			discipline: 'run',
			intent: 'endurance',
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 2700,
								},
							],
						},
					},
				],
			},
		},
	})

	await dayOn({
		patternId: racePattern,
		trackId: raceTracks.run!,
		kind: 'fixed',
		weekday: 2,
		workoutId: fixed.workoutId,
	})
	await dayOn({
		patternId: racePattern,
		trackId: raceTracks.run!,
		kind: 'fixed',
		weekday: 4,
		workoutId: shared.id,
	})
	await dayOn({
		patternId: racePattern,
		trackId: raceTracks.run!,
		kind: 'share',
		weekday: 5,
		weight: 2,
		workoutId: shape.workoutId,
	})
	await dayOn({
		patternId: racePattern,
		trackId: raceTracks.other!,
		kind: 'fixed',
		weekday: 0,
		workoutId: activity.id,
	})
	await dayOn({
		patternId: racePattern,
		trackId: raceTracks.other!,
		kind: 'fixed',
		weekday: 3,
		workoutId: activity.id,
	})
	for (const orderInDay of [0, 1]) {
		await dayOn({
			patternId: racePattern,
			trackId: raceTracks.strength!,
			kind: 'lifting',
			weekday: null,
			orderInDay,
			workoutId: stock.id,
		})
	}
	await dayOn({
		patternId: openPattern,
		trackId: openTracks.run!,
		kind: 'fixed',
		weekday: 4,
		workoutId: shared.id,
	})

	return {
		userId,
		race: { outlineId: race.outlineId, patternId: racePattern },
		open: { outlineId: open.outlineId, patternId: openPattern },
		fixed,
		shape,
		stockId: stock.id,
		activityId: activity.id,
		sharedId: shared.id,
	}
}

/** Each day of a pattern: its kind, weekday, Workout and how it is held. */
async function daysOf(patternId: string) {
	return prisma.weekPatternDay.findMany({
		where: { patternId },
		orderBy: [{ weekday: 'asc' }, { orderInDay: 'asc' }],
		select: {
			kind: true,
			weekday: true,
			workoutId: true,
			workout: {
				select: {
					title: true,
					ownerId: true,
					authorship: true,
					visibility: true,
					copiedFromId: true,
					heldByOutlineId: true,
				},
			},
		},
	})
}

test('the migration gives every day a row its own plan holds, copying only what something else uses', async () => {
	const before = await plansBeforeTheDeploy()
	const { userId, race, open } = before
	const titlesBefore = (await daysOf(race.patternId)).map(
		(day) => day.workout?.title,
	)
	const sources = [
		before.fixed.workoutId,
		before.shape.workoutId,
		before.stockId,
		before.sharedId,
	]
	const sourcePrescriptions = await Promise.all(sources.map(prescription))

	await runBackfill()

	const raceDays = await daysOf(race.patternId)
	expect(raceDays.map((day) => day.workout?.title)).toEqual(titlesBefore)
	for (const day of [...raceDays, ...(await daysOf(open.patternId))]) {
		expect(day.workout?.heldByOutlineId).not.toBeNull()
	}
	// Copied, each once for the plan, with an id the test can predict.
	const copyOf = (sourceId: string, outlineId: string) =>
		`${sourceId}.${outlineId}`
	// The lifting slots (no weekday) first, then Monday to Saturday.
	expect(raceDays.map((day) => day.workoutId)).toEqual([
		copyOf(before.stockId, race.outlineId),
		copyOf(before.stockId, race.outlineId),
		before.activityId,
		copyOf(before.fixed.workoutId, race.outlineId),
		before.activityId,
		copyOf(before.sharedId, race.outlineId),
		copyOf(before.shape.workoutId, race.outlineId),
	])
	expect((await daysOf(open.patternId)).map((day) => day.workoutId)).toEqual([
		copyOf(before.sharedId, open.outlineId),
	])
	for (const [index, sourceId] of sources.entries()) {
		const copyId = copyOf(sourceId, race.outlineId)
		expect(
			await prisma.workout.findUniqueOrThrow({
				where: { id: copyId },
				select: {
					ownerId: true,
					authorship: true,
					visibility: true,
					copiedFromId: true,
					heldByOutlineId: true,
				},
			}),
		).toEqual({
			ownerId: userId,
			authorship: 'athlete',
			visibility: 'private',
			copiedFromId: sourceId,
			heldByOutlineId: race.outlineId,
		})
		// Every column `workoutCopySelect` carries, blocks, steps and sets too.
		expect(await prescription(copyId)).toEqual(sourcePrescriptions[index])
	}
	// The Simple Activity's row only this plan used is marked, not copied.
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: before.activityId },
			select: { heldByOutlineId: true, copiedFromId: true },
		}),
	).toEqual({ heldByOutlineId: race.outlineId, copiedFromId: null })
	// The sources are untouched: the sessions' rows, the stock row, the shared row.
	expect(
		await prisma.workout.count({
			where: { id: { in: sources }, heldByOutlineId: null },
		}),
	).toBe(4)
})

test('after the migration the weeks laid are the weeks laid before, and the sessions are the athlete’s again', async () => {
	const before = await plansBeforeTheDeploy()
	const { userId, race } = before
	await stamp(userId, race.patternId, WEEK_1)
	const laidBefore = await laidIn(userId, race.outlineId, WEEK_1)
	// The fixed days, the shaped long run, the Simple Activities and the lifts.
	expect(new Set(laidBefore.map((laid) => laid.discipline))).toEqual(
		new Set(['run', 'strength', 'other']),
	)
	expect(laidBefore.map((laid) => laid.title)).toEqual(
		expect.arrayContaining([
			'Terskel 2×4×8',
			'Rolig 45',
			'Helkropp A',
			'Klatring',
		]),
	)

	await runBackfill()

	await stamp(userId, race.patternId, WEEK_1)
	expect(await laidIn(userId, race.outlineId, WEEK_1)).toEqual(laidBefore)

	// Deleting and editing the sessions the days were picked from now succeeds
	// and leaves the plan's weeks as they were.
	expect(
		await deleteWorkoutSession(userId, before.fixed.sessionId),
	).not.toBeNull()
	const edited = await updateWorkoutSession(
		userId,
		before.shape.sessionId,
		intervals('Noe helt annet'),
	)
	expect(edited.ok).toBe(true)
	await stamp(userId, race.patternId, WEEK_2)
	const weekTwo = await laidIn(userId, race.outlineId, WEEK_2)
	const shift = (at: string) =>
		new Date(new Date(at).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
	expect(weekTwo.map((laid) => ({ ...laid, at: shift(laid.at) }))).toEqual(
		laidBefore,
	)
})

test('the migration leaves a plan that already holds its rows as it is', async () => {
	const before = await plansBeforeTheDeploy()
	await runBackfill()
	const once = await daysOf(before.race.patternId)
	const workouts = await prisma.workout.count()
	await runBackfill()
	expect(await daysOf(before.race.patternId)).toEqual(once)
	expect(await prisma.workout.count()).toBe(workouts)
})

test('the migration copies a reported row rather than holding it, so its report outlives the plan', async () => {
	const before = await plansBeforeTheDeploy()
	// The Simple Activity's row was once public and reported, and is private
	// again: only the race plan's days use it.
	const reporter = await athlete()
	await prisma.workoutReport.create({
		data: {
			workoutId: before.activityId,
			reporterId: reporter,
			reason: 'spam',
		},
	})

	await runBackfill()

	const copyId = `${before.activityId}.${before.race.outlineId}`
	const days = await daysOf(before.race.patternId)
	expect(
		days
			.filter((day) => day.workout?.title === 'Klatring')
			.map((day) => day.workoutId),
	).toEqual([copyId, copyId])
	expect(
		await prisma.workout.findUniqueOrThrow({
			where: { id: before.activityId },
			select: { heldByOutlineId: true },
		}),
	).toEqual({ heldByOutlineId: null })
	await prisma.planOutline.delete({ where: { id: before.race.outlineId } })
	expect(
		await prisma.workoutReport.count({
			where: { workoutId: before.activityId },
		}),
	).toBe(1)
})
