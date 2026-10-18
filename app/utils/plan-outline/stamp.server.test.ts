import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { weekdayIndex } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getSeasonForEvent } from '#app/utils/training.server.ts'
import { updateWorkoutSession } from '#app/utils/workout.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	addWeekPattern,
	addWeekPatternDay,
	createPlanOutline,
	deletePlanOutline,
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
	/** Null for an open-ended plan (ADR 0079). */
	eventId: string | null
	outlineId: string
	runTrackId: string
	liftTrackId: string
	phaseId: string
	patternId: string
}

async function setupPlan({
	timezone = OSLO,
	defaultTrainingTime = '07:00' as string | null,
	openEnded = false,
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
	const event = openEnded
		? null
		: await prisma.event.create({
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
			...(event ? { eventId: event.id } : {}),
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
		eventId: event?.id ?? null,
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
			planOutlineId: true,
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

test('stamped sessions are anchored to the Event and carry the generated source', async () => {
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
	// The machine laid it from the pattern, so it is the machine's until the
	// athlete edits it (Session Adoption).
	expect(session?.source).toBe('generated')
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

test("the athlete's own session in a stamped week is kept on a confirmed re-stamp", async () => {
	const plan = await setupPlan()
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	// Written by hand against the Event, on the same week the pattern lays.
	const own = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: plan.athleteId,
			scheduledAt: new Date('2030-01-12T08:00:00Z'),
			status: 'scheduled',
			source: 'authored',
			targetEventId: plan.eventId,
			planOutlineId: plan.outlineId,
		},
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

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)
	expect(report).toMatchObject({ sessions: 1, replaced: 0 })
	const ids = (await sessionsOf(plan)).map((session) => session.id)
	expect(ids).toContain(own.id)
	expect(ids).toHaveLength(2)
})

test('a stamped session the athlete edited becomes theirs and survives a re-stamp', async () => {
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
	const [stamped] = await sessionsOf(plan)

	const edited = await updateWorkoutSession(plan.athleteId, stamped!.id, {
		title: 'Langtur med gjengen',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: stamped!.scheduledAt,
		blocks: [
			{
				repeatCount: 1,
				steps: [{ kind: 'cardio', discipline: 'run', distanceM: 18000 }],
			},
		],
	})
	expect(edited.ok).toBe(true)

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)
	expect(report).toMatchObject({ replaced: 0 })
	const kept = (await sessionsOf(plan)).find(
		(session) => session.id === stamped!.id,
	)
	expect(kept?.workout?.title).toBe('Langtur med gjengen')
})

// ── Rows stamped before #505 ───────────────────────────────────────────────
//
// They were written `authored`, which ownership now reads as the athlete's. The
// data migration hands them back to the machine unless they were edited later.
// These tests run the real migration SQL, because the rule *is* the SQL.

const LEGACY_PLAN_ROWS_MIGRATION =
	'prisma/migrations/20261007182406_legacy_plan_rows_are_the_machines_unless_the_athlete_edited_them/migration.sql'

/** Apply the migration as `migrate deploy` would: comments stripped, split. */
async function applyLegacyPlanRowsMigration() {
	const sql = await readFile(
		path.join(process.cwd(), LEGACY_PLAN_ROWS_MIGRATION),
		{ encoding: 'utf8' },
	)
	const statements = sql
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('--'))
		.join('\n')
		.split(';')
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0)
	for (const statement of statements) {
		await prisma.$executeRawUnsafe(statement)
	}
}

/** Put a stamped session back in its pre-#505 state: `authored`, as written. */
async function makeLegacy(sessionId: string, { editedLater = false } = {}) {
	await prisma.workoutSession.update({
		where: { id: sessionId },
		data: { source: 'authored' },
	})
	if (editedLater) {
		// Raw, because Prisma stamps `updatedAt` itself on every update.
		await prisma.$executeRaw`UPDATE "WorkoutSession" SET "updatedAt" = "createdAt" + ${2 * 86_400_000} WHERE "id" = ${sessionId}`
	}
}

test('re-stamping a week stamped before #505 replaces it rather than doubling it', async () => {
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
	const [legacy] = await sessionsOf(plan)
	await makeLegacy(legacy!.id)

	await applyLegacyPlanRowsMigration()
	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)

	expect(report).toMatchObject({ sessions: 1, replaced: 1 })
	const after = await sessionsOf(plan)
	expect(after).toHaveLength(1)
	expect(after[0]).toMatchObject({ source: 'generated' })
	expect(after[0]?.id).not.toBe(legacy!.id)
})

test('a pre-#505 stamped session edited after it was laid stays the athlete’s', async () => {
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
	const [legacy] = await sessionsOf(plan)
	await makeLegacy(legacy!.id, { editedLater: true })

	await applyLegacyPlanRowsMigration()

	const migrated = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: legacy!.id },
		select: {
			source: true,
			adoptedAt: true,
			updatedAt: true,
			plannedTssValue: true,
		},
	})
	// Generated now, but adopted at its last edit — so nothing re-lays it, and
	// no number on it moved.
	expect(migrated.source).toBe('generated')
	expect(migrated.adoptedAt).toEqual(migrated.updatedAt)
	expect(migrated.plannedTssValue).toBe(legacy!.plannedTssValue)
	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)
	expect(report).toMatchObject({ replaced: 0 })
	expect((await sessionsOf(plan)).map((session) => session.id)).toContain(
		legacy!.id,
	)
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
	const before = await getSeasonForEvent(plan.athleteId, plan.eventId!, NOW)

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28'],
			replace: false,
		}),
	)
	expect(report.weeks).toBe(4)

	const after = await getSeasonForEvent(plan.athleteId, plan.eventId!, NOW)
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

	const warnings = await readStampedMixWarnings(plan.athleteId, plan.outlineId)
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

	expect(await readStampedMixWarnings(plan.athleteId, plan.outlineId)).toEqual(
		[],
	)
})

// Round 2 (#505 story 68): the stamp lays the segment's mix on the bare
// share days and names each new session for what it is, in Norwegian — not
// "12 km" or "1 h 48 min". Only sessions laid from now on: a title already
// stored is the athlete's data and is not rewritten.
test('bare share days are laid as their kind of session — the mix hard, the heavy one long — and titled in Norwegian', async () => {
	const plan = await setupPlan()
	for (const [weekday, weight] of [
		[1, 1],
		[3, 1],
		[6, 2],
	] as const) {
		await addDay(plan, {
			kind: 'share',
			trackId: plan.runTrackId,
			weekday,
			weight,
		})
	}
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

	const laid = await prisma.workoutSession.findMany({
		where: { userId: plan.athleteId },
		orderBy: { scheduledAt: 'asc' },
		select: { workout: { select: { title: true, intent: true } } },
	})
	// Thursday is the ordinary day furthest from Sunday's long run (Tuesday is
	// two days after it, on the week's wheel), so it carries the hard session.
	expect(laid.map((session) => session.workout)).toEqual([
		{ title: 'Rolig økt · Løping', intent: 'endurance' },
		{ title: 'Terskeløkt · Løping', intent: 'threshold' },
		{ title: 'Langtur · Løping', intent: 'endurance' },
	])
	// The week now holds what its mix asks for, so nothing is warned about.
	expect(await readStampedMixWarnings(plan.athleteId, plan.outlineId)).toEqual(
		[],
	)
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

describe('an open-ended plan (ADR 0079)', () => {
	test('stamps sessions anchored to the plan, with no Event', async () => {
		const plan = await setupPlan({ openEnded: true })
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
		expect(session).toMatchObject({
			source: 'generated',
			targetEventId: null,
			planOutlineId: plan.outlineId,
		})
	})

	test('a re-stamp clears only this plan’s machine sessions in the week', async () => {
		const plan = await setupPlan({ openEnded: true })
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
		const [laid] = await sessionsOf(plan)
		// Two sessions in the same week that are not this plan's machine sessions:
		// one no plan laid (no Event, no outline — the loose session an open-ended
		// path must not mistake for its own), and one the athlete wrote.
		const loose = await prisma.workoutSession.create({
			select: { id: true },
			data: {
				userId: plan.athleteId,
				scheduledAt: new Date('2030-01-10T08:00:00Z'),
				status: 'scheduled',
				source: 'generated',
			},
		})
		const own = await prisma.workoutSession.create({
			select: { id: true },
			data: {
				userId: plan.athleteId,
				scheduledAt: new Date('2030-01-11T08:00:00Z'),
				status: 'scheduled',
				source: 'authored',
				planOutlineId: plan.outlineId,
			},
		})

		const conflict = await stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace: false,
		})
		expect(conflict).toMatchObject({
			reason: 'weeks-already-filled',
			conflicts: [{ replacing: 1, keeping: 1 }],
		})

		const report = ok(
			await stampWeekPattern(plan.athleteId, {
				patternId: plan.patternId,
				weekKeys: ['2030-01-07'],
				replace: true,
			}),
		)

		expect(report).toMatchObject({ sessions: 1, replaced: 1 })
		const ids = (await sessionsOf(plan)).map((session) => session.id)
		expect(ids).not.toContain(laid!.id)
		expect(ids).toEqual(expect.arrayContaining([loose.id, own.id]))
	})

	test('another athlete’s open-ended plan cannot be stamped', async () => {
		const plan = await setupPlan({ openEnded: true })
		const other = await setupPlan({ openEnded: true })
		await addDay(plan, {
			kind: 'share',
			trackId: plan.runTrackId,
			weekday: 5,
			weight: 1,
		})

		expect(
			await stampWeekPattern(other.athleteId, {
				patternId: plan.patternId,
				weekKeys: ['2030-01-07'],
				replace: false,
			}),
		).toEqual({ ok: false, reason: 'pattern-gone' })
	})
})

test('a plan deleted and re-created for its Event re-stamps a week without doubling it', async () => {
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
	expect(
		await deletePlanOutline(plan.athleteId, { outlineId: plan.outlineId }),
	).toEqual({ ok: true })

	// The same Event planned again: the new plan takes back the old one's sessions.
	const again = await createPlanOutline(
		plan.athleteId,
		{
			eventId: plan.eventId!,
			startWeekKey: START_WEEK_KEY,
			structure: { phases: [{ name: 'Base', weeks: 4, rhythm: 'none' }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 50 }],
		},
		NOW,
	)
	if (!again.ok) throw new Error(again.reason)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: again.outlineId },
		select: { tracks: { select: { id: true } } },
	})
	const added = await addWeekPattern(plan.athleteId, {
		outlineId: again.outlineId,
		name: 'Typical week',
	})
	if (!added.ok) throw new Error(added.reason)
	const pattern = await prisma.weekPattern.findFirstOrThrow({
		where: { outlineId: again.outlineId },
		select: { id: true },
	})
	await addWeekPatternDay(plan.athleteId, {
		patternId: pattern.id,
		kind: 'share',
		trackId: outline.tracks[0]!.id,
		weekday: 5,
		weight: 1,
	})

	const report = ok(
		await stampWeekPattern(plan.athleteId, {
			patternId: pattern.id,
			weekKeys: ['2030-01-07'],
			replace: true,
		}),
	)

	expect(report).toMatchObject({ sessions: 1, replaced: 1 })
	const sessions = await sessionsOf(plan)
	expect(sessions).toHaveLength(1)
	expect(sessions[0]?.planOutlineId).toBe(again.outlineId)
})

test('an open-ended plan resting behind a race plan refuses a stamp (ADR 0079)', async () => {
	const plan = await setupPlan({ openEnded: true })
	await addDay(plan, {
		kind: 'share',
		trackId: plan.runTrackId,
		weekday: 5,
		weight: 1,
	})
	const event = await prisma.event.create({
		select: { id: true },
		data: {
			athleteId: plan.athleteId,
			name: 'Spring 10k',
			kind: 'race',
			priority: 'A',
			startDate: new Date('2030-03-10T09:00:00Z'),
			disciplines: JSON.stringify(['run']),
		},
	})
	const race = await createPlanOutline(
		plan.athleteId,
		{
			eventId: event.id,
			startWeekKey: START_WEEK_KEY,
			structure: { phases: [{ name: 'Base', weeks: 8 }] },
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		NOW,
	)
	if (!race.ok) throw new Error(race.reason)

	const stamp = {
		patternId: plan.patternId,
		weekKeys: ['2030-01-07'],
		replace: true,
	}
	expect(await stampWeekPattern(plan.athleteId, stamp, NOW)).toEqual({
		ok: false,
		reason: 'plan-resting',
	})
	expect(await sessionsOf(plan)).toHaveLength(0)
	// Once the race has passed, the open-ended plan is active and lays weeks again.
	expect(
		(
			await stampWeekPattern(
				plan.athleteId,
				stamp,
				new Date('2030-03-11T12:00:00Z'),
			)
		).ok,
	).toBe(true)
})

// ── Lifting laid per week (#591, ADR 0104 §3–§4) ───────────────────────────
//
// A `lifting` row is a slot the stamp places each week away from the hard
// days; a stored `fixed` strength day is a Pinned day and never moves.
describe('lifting laid per week', () => {
	/**
	 * The run on Monday, Wednesday and Friday, long on Sunday, with one
	 * threshold session a week — which the stamp lays on Wednesday — and the
	 * athlete free every day of the week.
	 */
	async function setupRunWeek() {
		const plan = await setupPlan()
		await prisma.athleteProfile.update({
			where: { userId: plan.athleteId },
			data: { trainableWeekdays: JSON.stringify([0, 1, 2, 3, 4, 5, 6]) },
		})
		for (const [weekday, weight] of [
			[0, 1],
			[2, 1],
			[4, 1],
			[6, 2],
		] as const) {
			await addDay(plan, {
				kind: 'share',
				trackId: plan.runTrackId,
				weekday,
				weight,
			})
		}
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
		return plan
	}

	async function addLiftingSlots(plan: Plan, workoutId: string, count: number) {
		for (let orderInDay = 0; orderInDay < count; orderInDay++) {
			await prisma.weekPatternDay.create({
				data: {
					patternId: plan.patternId,
					weekday: null,
					orderInDay,
					kind: 'lifting',
					trackId: plan.liftTrackId,
					workoutId,
				},
			})
		}
	}

	/** Each session of the plan as `weekday:discipline`, in the week's order. */
	async function laid(plan: Plan) {
		return (await sessionsOf(plan)).map(
			(session) =>
				`${weekdayIndex(session.scheduledAt.toISOString().slice(0, 10))}:${session.workout?.discipline}`,
		)
	}

	async function liftingDays(plan: Plan) {
		return (await laid(plan))
			.filter((slot) => slot.endsWith(':strength'))
			.map((slot) => Number(slot.split(':')[0]))
	}

	const stampWeek = (plan: Plan, replace: boolean) =>
		stampWeekPattern(plan.athleteId, {
			patternId: plan.patternId,
			weekKeys: ['2030-01-07'],
			replace,
		})

	test('lifting slots are laid off the hard day and the day before it, after the run', async () => {
		const plan = await setupRunWeek()
		await addLiftingSlots(plan, await createStrengthWorkout(plan.athleteId), 2)
		ok(await stampWeek(plan, false))
		// Wednesday is hard and Sunday long: Monday and Thursday.
		expect(await liftingDays(plan)).toEqual([0, 3])
		// Monday's lift is written after Monday's run.
		const monday = (await laid(plan)).filter((slot) => slot.startsWith('0:'))
		expect(monday).toEqual(['0:run', '0:strength'])
	})

	test('a hard session the athlete scheduled by hand is stepped around, and kept', async () => {
		const plan = await setupRunWeek()
		await addLiftingSlots(plan, await createStrengthWorkout(plan.athleteId), 2)
		// Intervals on Thursday, put in by hand before the stamp.
		const intervals = await prisma.workout.create({
			select: { id: true },
			data: {
				ownerId: plan.athleteId,
				title: 'Intervaller',
				discipline: 'run',
				intent: 'vo2max',
				effortWord: 'hard',
			},
		})
		const own = await prisma.workoutSession.create({
			select: { id: true },
			data: {
				userId: plan.athleteId,
				workoutId: intervals.id,
				scheduledAt: new Date('2030-01-10T16:00:00Z'),
				status: 'scheduled',
				source: 'authored',
			},
		})
		ok(await stampWeek(plan, false))
		// The threshold run steps off Thursday's neighbours onto Monday, and
		// the lifts off both hard days and the days before them: Tuesday and
		// Friday, not the Monday and Thursday the week alone would take.
		expect(await liftingDays(plan)).toEqual([1, 4])
		expect(await prisma.workoutSession.count({ where: { id: own.id } })).toBe(1)
	})

	test('a re-lay is stable: the same week comes out again', async () => {
		const plan = await setupRunWeek()
		await addLiftingSlots(plan, await createStrengthWorkout(plan.athleteId), 2)
		ok(await stampWeek(plan, false))
		const first = await laid(plan)
		ok(await stampWeek(plan, true))
		expect(await laid(plan)).toEqual(first)
	})

	test('a lift the athlete kept fills its slot on a re-lay, wherever it is', async () => {
		const plan = await setupRunWeek()
		await addLiftingSlots(plan, await createStrengthWorkout(plan.athleteId), 1)
		ok(await stampWeek(plan, false))
		const [lift] = (await sessionsOf(plan)).filter(
			(session) => session.workout?.discipline === 'strength',
		)
		// The athlete lifted on Saturday instead and marked it done: it was
		// trained, and is kept.
		await prisma.workoutSession.update({
			where: { id: lift!.id },
			data: {
				status: 'completed',
				scheduledAt: new Date('2030-01-12T06:00:00Z'),
			},
		})
		ok(
			await stampWeekPattern(
				plan.athleteId,
				{ patternId: plan.patternId, weekKeys: ['2030-01-07'], replace: true },
				NOW,
				{ aroundKeptSessions: true },
			),
		)
		// The week's one lift is Saturday's; Monday gets no second one.
		expect(await liftingDays(plan)).toEqual([5])
	})

	test('an existing plan’s fixed strength days survive a re-lay unchanged', async () => {
		const plan = await setupRunWeek()
		const workoutId = await createStrengthWorkout(plan.athleteId)
		// Lifting on Tuesday and Thursday, as a plan from before #591 stored it:
		// Tuesday is the day before the hard Wednesday, which the per-week rule
		// would never pick. A Pinned day stays where the athlete has it.
		for (const weekday of [1, 3] as const) {
			await addDay(plan, {
				kind: 'fixed',
				trackId: plan.liftTrackId,
				weekday,
				workoutId,
			})
		}
		const rows = () =>
			prisma.weekPatternDay.findMany({
				where: { trackId: plan.liftTrackId },
				orderBy: { id: 'asc' },
				select: {
					id: true,
					kind: true,
					weekday: true,
					orderInDay: true,
					workoutId: true,
				},
			})
		const stored = await rows()

		ok(await stampWeek(plan, false))
		expect(await liftingDays(plan)).toEqual([1, 3])
		ok(await stampWeek(plan, true))
		expect(await liftingDays(plan)).toEqual([1, 3])
		expect(await rows()).toEqual(stored)
		expect(stored.every((row) => row.kind === 'fixed')).toBe(true)
	})
})
