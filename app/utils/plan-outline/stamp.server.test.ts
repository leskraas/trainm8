import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { getSeasonForEvent } from '#app/utils/training.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
	setQualitySessionMix,
} from './authoring.server.ts'
import {
	readStampedMixWarnings,
	stampWeekPattern,
	type StampResult,
} from './stamp.server.ts'

const START_WEEK_KEY = '2030-01-07' // a Monday
const NOW = new Date('2030-01-09T12:00:00Z')
const OSLO = 'Europe/Oslo' // UTC+1 in January — a non-UTC athlete on purpose

type Plan = {
	athleteId: string
	eventId: string
	outlineId: string
	runTrackId: string
	liftTrackId: string
	phaseId: string
	patternId: string
}

async function setupPlan({
	timezone = OSLO,
	defaultTrainingTime = '07:00' as string | null,
} = {}): Promise<Plan> {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: { create: { timezone, defaultTrainingTime } },
		},
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-04-07T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})

	const created = await createPlanOutline(
		user.id,
		{
			eventId: event.id,
			startWeekKey: START_WEEK_KEY,
			// `none` so every week is a loading week and the target is flat: this
			// suite is about the stamp, not about the rhythm.
			structure: { phases: [{ name: 'Base', weeks: 4, rhythm: 'none' }] },
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 50 },
				{ discipline: 'strength', currency: 'sets', anchorValue: 12 },
			],
		},
		NOW,
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)

	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: created.outlineId },
		select: {
			id: true,
			phases: { select: { id: true } },
			tracks: { select: { id: true, discipline: true } },
		},
	})

	const added = await addWeekPattern(user.id, {
		outlineId: outline.id,
		name: 'Typical week',
	})
	if (!added.ok) throw new Error(`pattern setup failed: ${added.reason}`)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: outline.id },
		select: { id: true },
	})

	return {
		athleteId: user.id,
		eventId: event.id,
		outlineId: outline.id,
		runTrackId: outline.tracks.find((t) => t.discipline === 'run')!.id,
		liftTrackId: outline.tracks.find((t) => t.discipline === 'strength')!.id,
		phaseId: outline.phases[0]!.id,
		patternId: pattern.id,
	}
}

/** A run Workout that prescribes exactly `km`, so `fixedDayVolume` can price it. */
async function createRunWorkout(
	athleteId: string,
	{ km, title = `${km} km`, intensity = null as string | null } = {} as {
		km: number
		title?: string
		intensity?: string | null
	},
) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: athleteId,
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
									distanceM: Math.round(km * 1000),
									intensity,
								},
							],
						},
					},
				],
			},
		},
	})
	return workout.id
}

async function createStrengthWorkout(athleteId: string) {
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: { name: 'Back squat', primaryMuscle: 'quads', isCompound: true },
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: athleteId,
			title: 'Squat day',
			discipline: 'strength',
			intent: 'strength-max',
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									sets: {
										create: [
											{ orderIndex: 0, kind: 'reps', reps: 5, pct1RM: 85 },
											{ orderIndex: 1, kind: 'reps', reps: 5, pct1RM: 85 },
										],
									},
								},
							],
						},
					},
				],
			},
		},
	})
	return workout.id
}

async function addDay(
	plan: Plan,
	day: Parameters<typeof addWeekPatternDay>[1] extends infer T
		?
				| Omit<Extract<T, { kind: 'fixed' }>, 'patternId'>
				| Omit<Extract<T, { kind: 'share' }>, 'patternId'>
		: never,
) {
	const result = await addWeekPatternDay(plan.athleteId, {
		...day,
		patternId: plan.patternId,
	})
	if (!result.ok) throw new Error(`day setup failed: ${result.reason}`)
}

async function sessionsOf(plan: Plan) {
	return prisma.workoutSession.findMany({
		where: { userId: plan.athleteId },
		orderBy: { scheduledAt: 'asc' },
		select: {
			id: true,
			scheduledAt: true,
			source: true,
			status: true,
			targetEventId: true,
			plannedTssValue: true,
			workoutId: true,
			workout: {
				select: {
					title: true,
					discipline: true,
					blocks: {
						select: {
							steps: { select: { distanceM: true, durationSec: true } },
						},
					},
				},
			},
		},
	})
}

function ok(result: StampResult) {
	if (!result.ok) throw new Error(`stamp refused: ${result.reason}`)
	return result.report
}

test('stamps a pattern across the chosen weeks in one action', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07', '2030-01-14', '2030-01-21'],
			replace: false,
		}),
	)

	expect(report).toMatchObject({ weeks: 3, sessions: 3, replaced: 0 })
	const sessions = await sessionsOf(plan)
	expect(sessions).toHaveLength(3)
})

test('stamped sessions are anchored to the Event and carry the authored source', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const [session] = await sessionsOf(plan)
	expect(session?.source).toBe('authored')
	expect(session?.targetEventId).toBe(plan.eventId)
	expect(session?.status).toBe('scheduled')
})

test('every stamped session gets its own fresh Workout copy', async () => {
	const plan = await setupPlan()
	const workoutId = await createRunWorkout(plan.athleteId, { km: 8 })
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28'],
			replace: false,
		}),
	)

	const sessions = await sessionsOf(plan)
	const workoutIds = sessions.map((session) => session.workoutId)
	expect(workoutIds).toHaveLength(4)
	expect(new Set(workoutIds).size).toBe(4)
	// And none of them is the pattern day's own Workout.
	expect(workoutIds).not.toContain(workoutId)
	// The copy is faithful: the prescription is stamped as authored.
	for (const session of sessions) {
		expect(session.workout?.blocks[0]?.steps[0]?.distanceM).toBe(8000)
	}
})

test('editing one stamped week leaves the same weekday in every other week untouched', async () => {
	const plan = await setupPlan()
	const workoutId = await createRunWorkout(plan.athleteId, { km: 8 })
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId,
	})
	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07', '2030-01-14', '2030-01-21'],
			replace: false,
		}),
	)

	const before = await sessionsOf(plan)
	await prisma.workout.update({
		where: { id: before[1]!.workoutId! },
		data: { title: 'Week 2 only' },
	})
	await prisma.workoutStep.updateMany({
		where: { block: { workoutId: before[1]!.workoutId! } },
		data: { distanceM: 12000 },
	})

	const after = await sessionsOf(plan)
	expect(after.map((session) => session.workout?.title)).toEqual([
		'8 km',
		'Week 2 only',
		'8 km',
	])
	expect(
		after.map((session) => session.workout?.blocks[0]?.steps[0]?.distanceM),
	).toEqual([8000, 12000, 8000])
	// The pattern day's own Workout is untouched by the edit too.
	const source = await prisma.workout.findUniqueOrThrow({
		where: { id: workoutId },
		select: { title: true },
	})
	expect(source.title).toBe('8 km')
})

test('share days take the week left after the fixed sessions are subtracted', async () => {
	const plan = await setupPlan()
	const workoutId = await createRunWorkout(plan.athleteId, { km: 8 })
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId,
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 2,
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 1,
		weight: 1,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const sessions = await sessionsOf(plan)
	// 50 km target − 8 km fixed = 42 km, split 1 : 2 → 14 and 28.
	expect(
		sessions.map((session) => session.workout?.blocks[0]?.steps[0]?.distanceM),
	).toEqual([14000, 8000, 28000])
})

test('fixed sessions over the week are warned about and never shortened', async () => {
	const plan = await setupPlan()
	const workoutId = await createRunWorkout(plan.athleteId, { km: 60 })
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId,
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const sessions = await sessionsOf(plan)
	// The prescription stands at 60 km against a 50 km week — no correction.
	expect(sessions).toHaveLength(1)
	expect(sessions[0]?.workout?.blocks[0]?.steps[0]?.distanceM).toBe(60000)
	expect(report.skipped.map((skip) => skip.reason)).toEqual(['no-volume-left'])
})

test('sessions land on the right local day and time in the Athlete Timezone', async () => {
	const plan = await setupPlan({ timezone: OSLO, defaultTrainingTime: '07:00' })
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 2, // Wednesday, Monday-first (ADR 0019)
		weight: 1,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const [session] = await sessionsOf(plan)
	// Wednesday 9 January 2030, 07:00 in Oslo (UTC+1) = 06:00 UTC.
	expect(session?.scheduledAt.toISOString()).toBe('2030-01-09T06:00:00.000Z')
})

test('an athlete with no default training time gets the documented convention', async () => {
	const plan = await setupPlan({
		timezone: 'UTC',
		defaultTrainingTime: null,
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 0,
		weight: 1,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const [session] = await sessionsOf(plan)
	expect(session?.scheduledAt.toISOString()).toBe('2030-01-07T07:00:00.000Z')
})

test('re-stamping a filled week states what it would replace and writes nothing', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)
	const first = await sessionsOf(plan)

	const again = await stampWeekPattern(plan.athleteId, {
		patternId: plan.patternId,
		weekKeys: ['2030-01-07', '2030-01-14'],
		replace: false,
	})

	expect(again).toEqual({
		ok: false,
		reason: 'weeks-already-filled',
		conflicts: [
			{
				weekKey: '2030-01-07',
				weekInPlan: 1,
				replacing: 1,
				keeping: 0,
			},
		],
	})
	// Nothing was written — not even for the empty second week.
	expect(await sessionsOf(plan)).toEqual(first)
})

test('a confirmed re-stamp replaces the week and says how much it replaced', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)
	const [before] = await sessionsOf(plan)

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)

	expect(report).toMatchObject({ weeks: 1, sessions: 1, replaced: 1 })
	const after = await sessionsOf(plan)
	expect(after).toHaveLength(1)
	expect(after[0]?.id).not.toBe(before?.id)
	// The replaced session's Workout went with it rather than being orphaned.
	expect(
		await prisma.workout.findUnique({ where: { id: before!.workoutId! } }),
	).toBeNull()
})

test('a trained session is kept, never replaced, whatever is confirmed', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)
	const [trained] = await sessionsOf(plan)
	await prisma.workoutSession.update({
		where: { id: trained!.id },
		data: { status: 'completed' },
	})

	const conflict = await stampWeekPattern(plan.athleteId, {
		patternId: plan.patternId,
		weekKeys: ['2030-01-07'],
		replace: false,
	})
	expect(conflict).toMatchObject({
		reason: 'weeks-already-filled',
		conflicts: [{ replacing: 0, keeping: 1 }],
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)
	const after = await sessionsOf(plan)
	expect(after.map((session) => session.id)).toContain(trained!.id)
	expect(after).toHaveLength(2)
})

test('a double submit of the same confirmed stamp leaves the same sessions, not twice as many', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	const input = {
		patternId: plan.patternId,
		weekKeys: ['2030-01-07', '2030-01-14'],
		replace: true,
	}

	ok(await stampWeekPattern(plan.athleteId, input))
	ok(await stampWeekPattern(plan.athleteId, input))

	const sessions = await sessionsOf(plan)
	expect(sessions).toHaveLength(2)
	// And no Workout was orphaned by the second pass.
	expect(
		await prisma.workout.count({ where: { ownerId: plan.athleteId } }),
	).toBe(2)
})

test('a strength day stamps a strength session that carries no TSS', async () => {
	const plan = await setupPlan()
	const workoutId = await createStrengthWorkout(plan.athleteId)
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.liftTrackId,
		weekday: 0,
		workoutId,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const [session] = await sessionsOf(plan)
	expect(session?.workout?.discipline).toBe('strength')
	// Null, never a zero: a strength session has no resolvable cardio intensity,
	// so its Planned TSS is an Unavailable Metric (ADR 0008).
	expect(session?.plannedTssValue).toBeNull()
	// The sets came across with the copy.
	const sets = await prisma.exerciseSet.count({
		where: { step: { block: { workoutId: session!.workoutId! } } },
	})
	expect(sets).toBe(2)
})

test('nothing limits how many weeks are stamped, and the guideline figures do not move', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	const before = await getSeasonForEvent(plan.athleteId, plan.eventId, NOW)

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28'],
			replace: false,
		}),
	)
	expect(report.weeks).toBe(4)

	const after = await getSeasonForEvent(plan.athleteId, plan.eventId, NOW)
	expect(after?.tracks.map((track) => track.span)).toEqual(
		before?.tracks.map((track) => track.span),
	)
	expect(after?.weeks).toEqual(before?.weeks)
})

test('a week outside this plan is refused rather than snapped to the nearest one', async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})

	expect(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2029-12-31'],
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'week-outside-plan' })
	expect(await sessionsOf(plan)).toEqual([])
})

test('another athlete’s pattern reads as gone', async () => {
	const mine = await setupPlan()
	const theirs = await setupPlan()

	expect(
		await stampWeekPattern(mine.athleteId, {
			patternId: theirs.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'pattern-gone' })
})

test('a share day carrying a shape stamps a scaled copy of it', async () => {
	const plan = await setupPlan()
	const shapeId = await createRunWorkout(plan.athleteId, {
		km: 10,
		title: 'Easy long run',
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
		workoutId: shapeId,
	})

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const [session] = await sessionsOf(plan)
	// The whole 50 km week goes to the one share day, scaled off a 10 km shape.
	expect(session?.workout?.blocks[0]?.steps[0]?.distanceM).toBe(50000)
	expect(session?.workout?.title).toBe('Easy long run')
	expect(session?.workoutId).not.toBe(shapeId)
})

test('a stamped week disagreeing with the Quality Session Mix warns softly', async () => {
	const plan = await setupPlan()
	const quality = await createRunWorkout(plan.athleteId, {
		km: 8,
		title: '5 × 1000 m',
		intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
	})
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId: quality,
	})
	// The segment asks for one zone-4 session and one zone-5 session a week.
	const mixed = await setQualitySessionMix(plan.athleteId, {
		segmentId: (
			await prisma.trainingTrackSegment.findFirstOrThrow({
				where: { trackId: plan.runTrackId, kind: 'endurance' },
				select: { id: true },
			})
		).id,
		entries: [
			{ zone: 4, sessionsPerWeek: 1 },
			{ zone: 5, sessionsPerWeek: 1 },
		],
	})
	if (!mixed.ok) throw new Error(`mix setup failed: ${mixed.reason}`)

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	const warnings = await readStampedMixWarnings(plan.athleteId, plan.eventId)
	expect(warnings).toEqual([
		{
			weekKey: '2030-01-07',
			weekInPlan: 1,
			trackId: plan.runTrackId,
			discipline: 'run',
			disagreements: [{ zone: 5, authored: 1, stamped: 0 }],
		},
	])
	// Soft: nothing was corrected and the session stands as authored.
	const [session] = await sessionsOf(plan)
	expect(session?.workout?.title).toBe('5 × 1000 m')
})

test('a week that matches its mix says nothing at all', async () => {
	const plan = await setupPlan()
	const quality = await createRunWorkout(plan.athleteId, {
		km: 8,
		title: '5 × 1000 m',
		intensity: JSON.stringify({ kind: 'zoneLabel', label: 'Z4' }),
	})
	await addDay(plan, {
		kind: 'fixed',
		trackId: plan.runTrackId,
		weekday: 2,
		workoutId: quality,
	})
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	const mixed = await setQualitySessionMix(plan.athleteId, {
		segmentId: (
			await prisma.trainingTrackSegment.findFirstOrThrow({
				where: { trackId: plan.runTrackId, kind: 'endurance' },
				select: { id: true },
			})
		).id,
		entries: [{ zone: 4, sessionsPerWeek: 1 }],
	})
	if (!mixed.ok) throw new Error(`mix setup failed: ${mixed.reason}`)

	ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	)

	expect(await readStampedMixWarnings(plan.athleteId, plan.eventId)).toEqual([])
})

test('a pattern with no days has nothing to stamp', async () => {
	const plan = await setupPlan()

	expect(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		}),
	).toEqual({ ok: false, reason: 'pattern-empty' })
})
