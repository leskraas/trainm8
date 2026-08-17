import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { resolveLoadTarget } from './strength/anchors.ts'
import {
	acceptProposedExerciseOneRm,
	getAnchorContext,
	listExerciseAnchors,
	proposeExerciseOneRm,
	recordStatedAnchor,
} from './strength-anchors.server.ts'

async function createAthlete(weightKg: number | null = 80) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	await prisma.athleteProfile.create({
		data: { userId: user.id, weightKg, timezone: 'UTC' },
	})
	return user
}

/** A squat: `squat` is one of the two patterns the rep↔load equations were
 * actually fitted to, so the estimator is willing to read it at all. */
async function createExercise(name = 'Back squat', movementPattern = 'squat') {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
			isCompound: true,
			movementPattern,
		},
	})
}

/** A session prescribing `5 × 5 @ 85 % 1RM`, with one logged working set. */
async function createLoggedSquat(
	userId: string,
	exerciseId: string,
	options: {
		scheduledAt: Date
		loadKg: number
		reps: number
		toFailure?: boolean
		rir?: number | null
	},
) {
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Squat day',
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
									exerciseId,
									sets: {
										create: [
											{
												orderIndex: 0,
												kind: 'reps',
												reps: 5,
												load: JSON.stringify({ kind: 'pct1RM', minPct: 85 }),
											},
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
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId, scheduledAt: options.scheduledAt, workoutId: workout.id },
	})
	await prisma.exerciseSetLog.create({
		data: {
			sessionId: session.id,
			stepId: workout.blocks[0]!.steps[0]!.id,
			exerciseId,
			orderIndex: 0,
			role: 'working',
			outcome: 'completed',
			load: JSON.stringify({ kind: 'external', kg: options.loadKg }),
			effectiveKg: options.loadKg,
			reps: options.reps,
			rir: options.rir ?? null,
			toFailure: options.toFailure ?? false,
			completedAt: options.scheduledAt,
		},
	})
	return { sessionId: session.id }
}

test('an anchor is reachable only by the athlete who set it', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise()

	await recordStatedAnchor({
		userId: owner.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
	})

	expect(await listExerciseAnchors(owner.id, exercise.id)).toHaveLength(1)
	expect(await listExerciseAnchors(stranger.id, exercise.id)).toEqual([])
	// And a stranger's resolution finds nothing rather than the owner's number.
	const ctx = await getAnchorContext(
		stranger.id,
		exercise.id,
		new Date('2026-08-14T00:00:00Z'),
	)
	expect(resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, ctx).kind).toBe(
		'unavailable',
	)
})

test('a number the athlete typed is stored as theirs and is not graded', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()

	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
	})

	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	expect(anchor?.protocol).toBe('athlete-stated')
	// The app does not grade a figure somebody stated about themselves — and the
	// migration enforces the same implication.
	expect(anchor?.confidence).toBeNull()
})

test('a rep max without its rep count is refused rather than stored as an ambiguous number', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()

	const result = await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'repMax',
		valueKg: 100,
		reps: null,
	})

	expect(result).toEqual({ ok: false, reason: 'invalid' })
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('a new number appends a row and the superseded one stays readable', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()

	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 120,
		reps: null,
		effectiveAt: new Date('2026-03-01T12:00:00Z'),
	})
	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
		effectiveAt: new Date('2026-04-01T12:00:00Z'),
	})

	const anchors = await listExerciseAnchors(athlete.id, exercise.id)
	// Two rows, newest first — nothing was updated in place and nothing was
	// deleted, which is what makes the history answer "why did my percentages
	// move?".
	expect(anchors.map((a) => a.valueKg)).toEqual([140, 120])
})

test("a session in March resolves against March's anchor, not April's re-test", async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 120,
		reps: null,
		effectiveAt: new Date('2026-03-01T12:00:00Z'),
	})
	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: exercise.id,
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
		effectiveAt: new Date('2026-04-01T12:00:00Z'),
	})

	const march = await getAnchorContext(
		athlete.id,
		exercise.id,
		new Date('2026-03-15T00:00:00Z'),
	)
	const april = await getAnchorContext(
		athlete.id,
		exercise.id,
		new Date('2026-04-15T00:00:00Z'),
	)

	const inMarch = resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, march)
	const inApril = resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, april)
	expect(inMarch.kind === 'resolved' && inMarch.kg).toBe(102)
	expect(inApril.kind === 'resolved' && inApril.kg).toBe(119)
})

test("an anchor set for one lift says nothing about another lift's prescription", async () => {
	const athlete = await createAthlete()
	const squat = await createExercise('Back squat')
	const bench = await createExercise('Bench press', 'horizontal-push')
	await recordStatedAnchor({
		userId: athlete.id,
		exerciseId: squat.id,
		construct: 'oneRm',
		valueKg: 140,
		reps: null,
	})

	const ctx = await getAnchorContext(
		athlete.id,
		bench.id,
		new Date('2026-08-14T00:00:00Z'),
	)
	expect(resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, ctx).kind).toBe(
		'unavailable',
	)
})

test('a proposal reads the athlete’s own logged set and writes nothing', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Epley/Welday on 100 kg × 5.
	expect(proposal?.reading.kind).toBe('estimate')
	expect(
		proposal?.reading.kind === 'estimate' && proposal.reading.valueKg,
	).toBe(116.7)
	// A proposal is a proposal: nothing is on file until the athlete accepts.
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('accepting a value the estimator would not produce writes nothing', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const result = await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		// A number nobody derived — flattering, and 25 kg above the reading.
		postedValueKg: 141.7,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result).toEqual({ ok: false, reason: 'stale' })
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('accepting the number the engine produces stores it with the set it was read from', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const result = await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 116.7,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result.ok).toBe(true)
	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	expect(anchor?.construct).toBe('estimatedOneRm')
	expect(anchor?.protocol).toBe('epley')
	// The reps are what make the number re-derivable, and the source set is what
	// makes the derivation showable afterwards.
	expect(anchor?.reps).toBe(5)
	expect(anchor?.sourceSetLogId).not.toBeNull()
})

test('a single taken to failure is stored as a tested maximum, not run through an equation', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 140,
		reps: 1,
		toFailure: true,
	})

	await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 140,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	// Epley would report 144.7 kg from a 140 kg single, fabricating kilos above a
	// number the athlete actually lifted.
	expect(anchor?.valueKg).toBe(140)
	expect(anchor?.construct).toBe('oneRm')
	expect(anchor?.protocol).toBe('tested')
	expect(anchor?.confidence).toBe('high')
})

test('another athlete’s logged sets are never read into a proposal', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(owner.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const proposal = await proposeExerciseOneRm(stranger.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(proposal?.reading.kind).toBe('refusal')
	expect(proposal?.reading.kind === 'refusal' && proposal.reading.refusal).toBe(
		'no-sets-logged',
	)
})
