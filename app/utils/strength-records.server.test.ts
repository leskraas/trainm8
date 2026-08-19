/**
 * Seam 2 (spec "Testing Decisions"): a real SQLite database, Prisma never
 * mocked, and **only what the pure seam structurally cannot cover**. Every rule
 * about what a record *is* — the qualification gate, the variant scoping, the
 * debut window, the tie-break, the previous best — is already proven over arrays
 * in `strength/records.test.ts` and `strength/exercise-history.test.ts` and is
 * not re-tested here.
 *
 * What is left is what only a database can answer: ownership scoping, reading
 * the baked `effectiveKg` column rather than re-deriving it, and the wiring of
 * the injected 1RM equation.
 */
import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { strengthRecordHeadline } from './strength/records.ts'
import { type LoadValue } from './strength-log.ts'
import {
	getExerciseHistoryView,
	recordsSetBy,
} from './strength-records.server.ts'

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

async function createExercise(
	name: string,
	options: {
		authorship?: string
		createdByAthleteId?: string
		/** The pattern decides whether an equation may be applied to this movement
		 * at all. `squat` by default, so a fixture lift is on a fitted curve; pass
		 * `null` for the unmapped majority of the corpus. */
		movementPattern?: string | null
	} = {},
) {
	return prisma.exercise.create({
		select: { id: true },
		data: {
			name,
			primaryMuscle: 'quads',
			equipment: 'barbell',
			isCompound: true,
			movementPattern:
				options.movementPattern === undefined
					? 'squat'
					: options.movementPattern,
			authorship: options.authorship ?? 'system',
			createdByAthleteId: options.createdByAthleteId ?? null,
		},
	})
}

async function createVariant(exerciseId: string, equipment: string) {
	return prisma.exerciseVariant.create({
		select: { id: true },
		data: {
			exerciseId,
			equipment,
			displayName: `${equipment} lift`,
			loadKind: 'external',
		},
	})
}

/** A strength session with one Step on `exerciseId`, and nothing logged yet. */
async function createSession(
	userId: string,
	exerciseId: string,
	scheduledAt: Date,
) {
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Lift day',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [{ orderIndex: 0, kind: 'strength', exerciseId }],
						},
					},
				],
			},
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: { userId, scheduledAt, workoutId: workout.id },
	})
	return { sessionId: session.id, stepId: workout.blocks[0]!.steps[0]!.id }
}

/** Write a set log straight in, the way `saveLoggedSet` leaves it: the load as
 * JSON, `effectiveKg` **baked**, and the **equipment stamped** — the variant's own
 * word for it where a variant is named, and the movement's otherwise, which is
 * `realizationForStep`'s rule. A fixture that skipped the stamp would be testing a
 * row the writer cannot produce. */
async function logSet(
	where: { sessionId: string; stepId: string; exerciseId: string },
	set: {
		orderIndex: number
		load: LoadValue
		effectiveKg: number | null
		reps: number | null
		/** A timed set states seconds instead of reps — a hold is a set, and it is
		 * not a reading about reps. */
		durationSec?: number | null
		variantId?: string
		role?: string
		outcome?: string
		bodyweightKg?: number | null
		/** What the athlete said about the effort. Unstated by default, which is
		 * how most sets are actually logged. */
		rir?: number | null
		toFailure?: boolean
	},
) {
	const realization = set.variantId
		? await prisma.exerciseVariant.findUniqueOrThrow({
				where: { id: set.variantId },
				select: { equipment: true },
			})
		: await prisma.exercise.findUniqueOrThrow({
				where: { id: where.exerciseId },
				select: { equipment: true },
			})
	return prisma.exerciseSetLog.create({
		select: { id: true },
		data: {
			sessionId: where.sessionId,
			stepId: where.stepId,
			exerciseId: where.exerciseId,
			variantId: set.variantId ?? null,
			equipment: realization.equipment,
			orderIndex: set.orderIndex,
			role: set.role ?? 'working',
			outcome: set.outcome ?? 'completed',
			load: JSON.stringify(set.load),
			effectiveKg: set.effectiveKg,
			bodyweightKg: set.bodyweightKg ?? null,
			reps: set.reps,
			durationSec: set.durationSec ?? null,
			rir: set.rir ?? null,
			toFailure: set.toFailure ?? false,
		},
	})
}

const NOW = new Date('2026-08-14T12:00:00Z')

test('another athlete’s logged sets are not in this athlete’s history', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			owner.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const mine = await getExerciseHistoryView(owner.id, exercise.id, { now: NOW })
	const theirs = await getExerciseHistoryView(stranger.id, exercise.id, {
		now: NOW,
	})

	expect(mine?.sessions).toHaveLength(1)
	expect(mine?.records.length).toBeGreaterThan(0)
	// A set log is reachable only by its athlete: the stranger may read the shared
	// exercise, and reads none of somebody else's work.
	expect(theirs?.sessions).toEqual([])
	expect(theirs?.records).toEqual([])
})

test('an exercise another athlete authored is not readable at all', async () => {
	const author = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Hack squat, my way', {
		authorship: 'athlete',
		createdByAthleteId: author.id,
	})

	expect(await getExerciseHistoryView(author.id, exercise.id)).not.toBeNull()
	expect(await getExerciseHistoryView(stranger.id, exercise.id)).toBeNull()
})

test('an exercise the athlete has never logged reads as an empty history, not a missing page', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Front squat')

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view).not.toBeNull()
	expect(view?.sessions).toEqual([])
	expect(view?.lastTime).toBeNull()
	expect(view?.variants).toEqual([])
})

test('history is scoped to the variant, so a lighter dumbbell day is not a regression', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Bench press')
	const barbell = await createVariant(exercise.id, 'barbell')
	const dumbbell = await createVariant(exercise.id, 'dumbbell')
	const barbellDay = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-05T17:00:00Z'),
		)),
	}
	await logSet(barbellDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
		variantId: barbell.id,
	})
	const dumbbellDay = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-12T17:00:00Z'),
		)),
	}
	await logSet(dumbbellDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 60 },
		effectiveKg: 60,
		reps: 5,
		variantId: dumbbell.id,
	})

	const all = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })
	const onBarbell = await getExerciseHistoryView(user.id, exercise.id, {
		equipment: 'barbell',
		now: NOW,
	})

	expect(all?.variants).toEqual([
		{ equipment: 'barbell', sessionCount: 1 },
		{ equipment: 'dumbbell', sessionCount: 1 },
	])
	// The dumbbell day is the athlete's last session on this movement, and the
	// barbell history still tops out at 100 kg.
	expect(onBarbell?.sessions).toHaveLength(1)
	expect(
		onBarbell?.records.find((record) => record.kind === 'heaviestLoad')?.value,
	).toBe(100)
	expect(
		all?.records.filter((record) => record.kind === 'heaviestLoad'),
	).toHaveLength(2)
})

test('a set log with no variant row falls back to the exercise’s own equipment', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.variants).toEqual([{ equipment: 'barbell', sessionCount: 1 }])
})

test('a weighted-dip record reads the kilos baked at log time, so a later bodyweight change never rewrites it', async () => {
	const user = await createAthlete(80)
	const exercise = await createExercise('Weighted dip')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'bodyweightPlus', addedKg: 20 },
		effectiveKg: 100,
		reps: 5,
		bodyweightKg: 80,
	})

	const before = await getExerciseHistoryView(user.id, exercise.id, {
		now: NOW,
	})
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { weightKg: 74 },
	})
	const after = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	const heaviest = (view: typeof before) =>
		view?.records.find((record) => record.kind === 'heaviestLoad')?.value
	expect(heaviest(before)).toBe(100)
	expect(heaviest(after)).toBe(100)
})

test('a set with no honest kilo gets a level record and never an invented kilo', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Lat pulldown')
	const machine = await createVariant(exercise.id, 'machine')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'stackLevel', level: 7 },
		effectiveKg: null,
		reps: 12,
		variantId: machine.id,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.records.map((record) => record.kind)).toEqual(['stackLevel'])
	expect(view?.records[0]?.unit).toBe('level')
	expect(view?.sessions[0]?.topSetKg).toBeNull()
	// Present in its own curve, and absent from every kilo reading.
	expect(view?.sessions).toHaveLength(1)
})

test('an estimated 1RM is produced from a set inside the equation’s rep range and refused outside it', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const inRange = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(inRange, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
		// Stated so the rep gate is the only thing under test: an unmarked effort
		// is its own refusal.
		toFailure: true,
	})

	const withEstimate = await getExerciseHistoryView(user.id, exercise.id, {
		now: NOW,
	})

	const e1rm = withEstimate?.records.find((record) => record.kind === 'e1RM')
	expect(e1rm?.estimator).toBe('epley')
	expect(e1rm?.value).toBeCloseTo(116.7, 1)

	const other = await createExercise('Leg extension')
	const highReps = {
		exerciseId: other.id,
		...(await createSession(
			user.id,
			other.id,
			new Date('2026-08-11T17:00:00Z'),
		)),
	}
	await logSet(highReps, {
		orderIndex: 0,
		load: { kind: 'external', kg: 40 },
		effectiveKg: 40,
		reps: 20,
		toFailure: true,
	})

	const refused = await getExerciseHistoryView(user.id, other.id, { now: NOW })

	// A set of twenty is outside every published equation's validated range, so it
	// contributes nothing rather than being graded down.
	expect(refused?.records.map((record) => record.kind)).not.toContain('e1RM')
	expect(refused?.records.map((record) => record.kind)).toContain(
		'heaviestLoad',
	)
	// And the missing row says why it is missing, in the estimator's own words.
	expect(refused?.oneRmUnavailable).toMatch(/above 10 reps/)
	expect(withEstimate?.oneRmUnavailable).toBeNull()
})

test('a set that never said how close to failure it was sets no estimated 1RM, and the strip says why instead of dropping the row', async () => {
	// The defect this closes: the history page reported an estimated 1RM off a set
	// nobody marked, while the propose surface refused the same set. There is no
	// signature of maximality in the numbers, so the refusal is the honest answer
	// and it is now the only answer.
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 20 },
		effectiveKg: 20,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.records.map((record) => record.kind)).not.toContain('e1RM')
	expect(view?.oneRmUnavailable).toBe(
		'None of your sets here says how close to failure it was, and in lifting there is no way to tell from the numbers. Mark a set as taken to failure, or record its reps in reserve.',
	)
	// The observed readings are untouched: 20 kg was lifted whatever the effort was.
	expect(view?.records.map((record) => record.kind)).toContain('heaviestLoad')
})

test('a set taken to failure licenses the estimate, and so does one with reps in reserve', async () => {
	const user = await createAthlete()
	const toFailureLift = await createExercise('Back squat')
	const failureDay = {
		exerciseId: toFailureLift.id,
		...(await createSession(
			user.id,
			toFailureLift.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(failureDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
		toFailure: true,
	})

	const rirLift = await createExercise('Front squat')
	const rirDay = {
		exerciseId: rirLift.id,
		...(await createSession(
			user.id,
			rirLift.id,
			new Date('2026-08-11T17:00:00Z'),
		)),
	}
	await logSet(rirDay, {
		orderIndex: 0,
		load: { kind: 'external', kg: 90 },
		effectiveKg: 90,
		reps: 5,
		rir: 1,
	})

	const failure = await getExerciseHistoryView(user.id, toFailureLift.id, {
		now: NOW,
	})
	const reserve = await getExerciseHistoryView(user.id, rirLift.id, {
		now: NOW,
	})

	expect(failure?.records.map((r) => r.kind)).toContain('e1RM')
	expect(failure?.oneRmUnavailable).toBeNull()
	expect(reserve?.records.map((r) => r.kind)).toContain('e1RM')
	expect(reserve?.oneRmUnavailable).toBeNull()
})

test('a movement with no validated reps-to-load relationship gets no estimated 1RM on either surface, and says so here', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Cable lateral raise', {
		movementPattern: null,
	})
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 12 },
		effectiveKg: 12,
		reps: 8,
		toFailure: true,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.records.map((record) => record.kind)).not.toContain('e1RM')
	expect(view?.oneRmUnavailable).toMatch(
		/no validated reps-to-load relationship/,
	)
})

test('a warm-up is not a record and an abandoned set is dropped, even when it is the heaviest row in the table', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 60 },
		effectiveKg: 60,
		reps: 5,
		role: 'warmup',
	})
	await logSet(where, {
		orderIndex: 1,
		load: { kind: 'external', kg: 140 },
		effectiveKg: 140,
		reps: 1,
		outcome: 'abandoned',
	})
	await logSet(where, {
		orderIndex: 2,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(
		view?.records.find((record) => record.kind === 'heaviestLoad')?.value,
	).toBe(100)
	expect(view?.sessions[0]?.workingSetCount).toBe(1)
})

test('a row whose stored load cannot be parsed is left out rather than read as a zero', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await prisma.exerciseSetLog.create({
		data: {
			sessionId: where.sessionId,
			stepId: where.stepId,
			exerciseId: exercise.id,
			orderIndex: 0,
			load: 'not json',
			effectiveKg: 100,
			reps: 5,
		},
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.sessions).toEqual([])
	expect(view?.records).toEqual([])
})

test('a session is history by the day it was scheduled, so back-filling last week does not make it today', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const lastWeek = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-04T17:00:00Z'),
		)),
	}
	await logSet(lastWeek, {
		orderIndex: 0,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
	})
	const thisWeek = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-12T17:00:00Z'),
		)),
	}
	await logSet(thisWeek, {
		orderIndex: 0,
		load: { kind: 'external', kg: 102.5 },
		effectiveKg: 102.5,
		reps: 5,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.lastTime?.sessionId).toBe(thisWeek.sessionId)
	expect(view?.sessions.map((session) => session.topSetKg)).toEqual([
		102.5, 100,
	])
})

// ——— One payload, one answer ——————————————————————————————————————————————

test('the banner and the history strip read one derivation, so they cannot disagree', async () => {
	// The ship blocker, from one loader payload: a Pull-up logged at 11:00 into a
	// session dated 23:30 tonight. `recordsSetBy` had no cutoff at all, so the
	// banner said "Heaviest bodyweight set: 109 kg — first time!" while the same
	// payload's `sessions` was empty and the page read "First time on this lift".
	const eleven = new Date('2026-08-14T11:00:00Z')
	const midnight = new Date('2026-08-15T00:00:00Z')
	const user = await createAthlete(74)
	const exercise = await createExercise('Pull-up', { movementPattern: null })
	const tonight = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-14T23:30:00Z'),
		)),
	}
	const set = await logSet(tonight, {
		orderIndex: 0,
		load: { kind: 'bodyweightPlus', addedKg: 35 },
		effectiveKg: 109,
		reps: 6,
		bodyweightKg: 74,
	})

	const banner = await recordsSetBy(user.id, set.id, { now: eleven })
	const view = await getExerciseHistoryView(user.id, exercise.id, {
		now: eleven,
	})

	// One answer at 11:00: the session has not happened, so no surface reads a
	// record out of it, and nothing beside it claims it either.
	expect(view?.sessions).toEqual([])
	expect(view?.lastTime).toBeNull()
	expect(view?.records).toEqual([])
	expect(view?.variants).toEqual([])
	expect(banner).toEqual([])

	// And one answer after the session's own instant. They agree because both read
	// the same derivation at the same cutoff, not because each was patched: the
	// record is not lost, only not yet.
	const later = await recordsSetBy(user.id, set.id, { now: midnight })
	const page = await getExerciseHistoryView(user.id, exercise.id, {
		now: midnight,
	})
	expect(page?.sessions).toHaveLength(1)
	expect(later.find((r) => r.kind === 'heaviestLoad')?.value).toBe(109)
	expect(page?.records.find((r) => r.kind === 'heaviestLoad')?.value).toBe(109)
	expect(later.map(strengthRecordHeadline)).toContain('Heaviest bodyweight set')
})

test('a lift whose sets cannot be read says so, rather than saying it has no sets', async () => {
	// A Push-up logged as a 45-second hold. The runner row for it reads "Last time
	// bodyweight × 45 s", so nothing on this lift may answer "No sets logged for
	// this lift yet": the work happened. A hold takes no record — every honest
	// reading here is a reading about reps — and an unreadable presence is a
	// different statement from an absence.
	const user = await createAthlete(74)
	const exercise = await createExercise('Push-up', { movementPattern: null })
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-10T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'bodyweight' },
		effectiveKg: 74,
		reps: null,
		durationSec: 45,
		bodyweightKg: 74,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	// The session is history and says what it was; there is simply no record in it.
	expect(view?.sessions).toHaveLength(1)
	expect(view?.sessions[0]?.topSetText).toBe('bodyweight × 45 s')
	expect(view?.records).toEqual([])

	// The reason names the sets rather than denying them.
	expect(view?.oneRmUnavailable).not.toMatch(/no sets logged/i)
	expect(view?.oneRmUnavailable).toMatch(/cannot be read as a 1RM/i)
})

test('a lift with nothing on it at all still states the absence once, and not as a reason', async () => {
	// The mirror case, so the two sentences cannot be swapped: nothing logged is an
	// absence, the empty strip already says it, and no refusal is printed beside it.
	const user = await createAthlete()
	const exercise = await createExercise('Front squat')

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })

	expect(view?.sessions).toEqual([])
	expect(view?.records).toEqual([])
	expect(view?.oneRmUnavailable).toBeNull()
})

// ——— The PR banner's reading ——————————————————————————————————————————————
//
// `recordsSetBy` answers *"did this set just take a record?"*, which the pure
// layer cannot: telling one row from another is a database question. What a
// record *is* stays proven over arrays in `strength/records.test.ts`.

/** Three prior sessions of work, so the fourth is past the debut window and a
 * best reads as "PR!" rather than "first time!". */
async function priorSessions(
	userId: string,
	exerciseId: string,
	kilos: number[],
) {
	let day = 1
	for (const kg of kilos) {
		const where = {
			exerciseId,
			...(await createSession(
				userId,
				exerciseId,
				new Date(`2026-08-0${day++}T17:00:00Z`),
			)),
		}
		await logSet(where, {
			orderIndex: 0,
			load: { kind: 'external', kg },
			effectiveKg: kg,
			reps: 5,
		})
	}
}

/** A fresh session on the same lift, a week after the history above. */
async function todaysSession(userId: string, exerciseId: string) {
	return {
		exerciseId,
		...(await createSession(
			userId,
			exerciseId,
			new Date('2026-08-13T17:00:00Z'),
		)),
	}
}

test('the set that beats the athlete’s best comes back as the records it took', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
		// The athlete said how hard it was, which is what licenses the estimate
		// below — the banner is held to the propose surface's standard.
		toFailure: true,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	const heaviest = records.find((r) => r.kind === 'heaviestLoad')
	expect(heaviest).toMatchObject({
		value: 120,
		unit: 'kg',
		previousValue: 110,
		delta: 10,
		debut: false,
		sessionId: today.sessionId,
	})
	// The best triple/five is the least model-dependent record there is, and the
	// estimate names the equation standing between the bar and the number.
	expect(records.find((r) => r.kind === 'repMax')?.reps).toBe(5)
	expect(records.find((r) => r.kind === 'e1RM')?.estimator).toBeTruthy()
	// Declined, not deferred (ADR 0058 §3).
	expect(records.map((r) => r.kind)).not.toContain('tonnage')
	expect(records.map((r) => r.kind)).not.toContain('streak')
})

test('a warm-up and an abandoned set never take a record, however heavy they are', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const warmup = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 200 },
		effectiveKg: 200,
		reps: 5,
		role: 'warmup',
	})
	const abandoned = await logSet(today, {
		orderIndex: 1,
		load: { kind: 'external', kg: 200 },
		effectiveKg: 200,
		reps: 5,
		outcome: 'abandoned',
	})

	expect(await recordsSetBy(user.id, warmup.id, { now: NOW })).toEqual([])
	expect(await recordsSetBy(user.id, abandoned.id, { now: NOW })).toEqual([])
})

test('a set that only equals the best takes nothing, because the first to reach the number keeps it', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 110 },
		effectiveKg: 110,
		reps: 5,
	})

	expect(await recordsSetBy(user.id, set.id, { now: NOW })).toEqual([])
})

test('a second identical set in the same session does not take the record its twin already took', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const first = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})
	const second = await logSet(today, {
		orderIndex: 1,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	expect(
		(await recordsSetBy(user.id, first.id, { now: NOW })).length,
	).toBeGreaterThan(0)
	expect(await recordsSetBy(user.id, second.id, { now: NOW })).toEqual([])
})

test('asking twice about the same set gives the same answer and writes nothing', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	const once = await recordsSetBy(user.id, set.id, { now: NOW })
	const twice = await recordsSetBy(user.id, set.id, { now: NOW })

	expect(twice).toEqual(once)
	// A record is derived, never stored: there is no second row to double up.
	expect(await prisma.exerciseSetLog.count({ where: { id: set.id } })).toBe(1)
})

test('a first entry on a lift reads as a debut rather than a personal record', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	expect(records.length).toBeGreaterThan(0)
	expect(records.every((r) => r.debut)).toBe(true)
})

test('the banner announces no estimated 1RM off a set that never said how close to failure it was', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	// The heaviest set is still the heaviest set: what the athlete lifted is
	// observed, and only the *model* needs the effort to be stated.
	expect(records.map((r) => r.kind)).toContain('heaviestLoad')
	expect(records.map((r) => r.kind)).not.toContain('e1RM')
})

test('a machine stack progresses against itself, in levels, and says it cannot be compared', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Lat pulldown')
	let day = 1
	for (const level of [4, 5, 6]) {
		const where = {
			exerciseId: exercise.id,
			...(await createSession(
				user.id,
				exercise.id,
				new Date(`2026-08-0${day++}T17:00:00Z`),
			)),
		}
		await logSet(where, {
			orderIndex: 0,
			load: { kind: 'stackLevel', level },
			// No honest kilo exists for a stack level (ADR 0056 §3).
			effectiveKg: null,
			reps: 10,
		})
	}
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'stackLevel', level: 7 },
		effectiveKg: null,
		reps: 10,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	expect(records.map((r) => r.kind)).toEqual(['stackLevel'])
	expect(records[0]).toMatchObject({
		value: 7,
		unit: 'level',
		previousValue: 6,
		crossExerciseComparable: false,
	})
	expect(records[0]?.unavailableNote).toMatch(/progresses against itself/)
})

test('a bodyweight-derived record reads the kilo baked at log time, so a bodyweight change cannot rewrite it', async () => {
	const user = await createAthlete(82)
	const exercise = await createExercise('Weighted dip')
	let day = 1
	for (const kg of [98, 100, 102]) {
		const where = {
			exerciseId: exercise.id,
			...(await createSession(
				user.id,
				exercise.id,
				new Date(`2026-08-0${day++}T17:00:00Z`),
			)),
		}
		await logSet(where, {
			orderIndex: 0,
			load: { kind: 'bodyweightPlus', addedKg: kg - 82 },
			effectiveKg: kg,
			reps: 6,
			bodyweightKg: 82,
		})
	}
	// The athlete drops 6 kg, and today's dip with the same added load is a
	// lighter total. Re-deriving from today's bodyweight would have moved the old
	// records down and made this one a "record"; reading the baked column does not.
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { weightKg: 76 },
	})
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'bodyweightPlus', addedKg: 20 },
		effectiveKg: 96,
		reps: 6,
		bodyweightKg: 76,
	})

	expect(await recordsSetBy(user.id, set.id, { now: NOW })).toEqual([])
})

test('barbell and dumbbell bench never share a record, so a lighter dumbbell set is its own history', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Bench press')
	const barbell = await createVariant(exercise.id, 'barbell')
	const dumbbell = await createVariant(exercise.id, 'dumbbell')
	let day = 1
	for (const kg of [100, 105, 110]) {
		const where = {
			exerciseId: exercise.id,
			...(await createSession(
				user.id,
				exercise.id,
				new Date(`2026-08-0${day++}T17:00:00Z`),
			)),
		}
		await logSet(where, {
			orderIndex: 0,
			load: { kind: 'external', kg },
			effectiveKg: kg,
			reps: 5,
			variantId: barbell.id,
		})
	}
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'perSide', kg: 30, sides: 2 },
		effectiveKg: 60,
		reps: 5,
		variantId: dumbbell.id,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	// 60 kg is nowhere near the barbell best and is still a dumbbell record,
	// because the two are separate histories keyed `(exerciseId, equipment)`.
	expect(records.every((r) => r.equipment === 'dumbbell')).toBe(true)
	expect(records.find((r) => r.kind === 'heaviestLoad')?.value).toBe(60)
})

test('a dip-belt bench never takes the barbell bench press record, however heavy the kilo baked beside it', async () => {
	// The observed defect, end to end. The athlete's bench history is a 20 → 30 kg
	// bar; one row logged `{ bodyweightPlus, addedKg: 30 }` against a 74 kg
	// bodyweight baked `effectiveKg` 104, and the banner announced "Heaviest ever:
	// 104 kg — up 74 kg". Nothing about that sentence was true of the bar.
	const user = await createAthlete(74)
	const exercise = await createExercise('Bench press')
	await priorSessions(user.id, exercise.id, [20, 25, 30])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'bodyweightPlus', addedKg: 30 },
		effectiveKg: 104,
		reps: 5,
		bodyweightKg: 74,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	// Every reading it took is a bodyweight-derived one, it beat nothing, and no
	// gain is claimed over the 30 kg bar.
	expect(records.every((r) => r.loadBasis === 'bodyweightDerived')).toBe(true)
	expect(records.every((r) => r.previousValue === null)).toBe(true)
	expect(records.every((r) => r.delta === null)).toBe(true)
	expect(records.every((r) => r.crossExerciseComparable === false)).toBe(true)
	expect(records.map(strengthRecordHeadline)).not.toContain('Heaviest ever')
	// And the bar's own records are untouched by it: 30 kg is still the heaviest
	// weight this athlete has put on a bench.
	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })
	const bar = view?.records.filter((r) => r.loadBasis === 'bar') ?? []
	expect(bar.find((r) => r.kind === 'heaviestLoad')?.value).toBe(30)
	expect(view?.records.map((r) => r.value)).toContain(104)
})

test('an assisted set takes no record, and the strip says why rather than going quiet', async () => {
	// `{ assisted, assistKg: 10 }` against a 74 kg athlete bakes 64 kg, and the
	// page said "Best 2-rep set: 64 kg — first time!" with nothing on the bar. The
	// kilo is stored and read as baked; what it cannot be is a maximum.
	const user = await createAthlete(74)
	const exercise = await createExercise('Assisted pull-up')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-05T17:00:00Z'),
		)),
	}
	const set = await logSet(where, {
		orderIndex: 0,
		load: { kind: 'assisted', assistKg: 10 },
		effectiveKg: 64,
		reps: 2,
		bodyweightKg: 74,
	})

	expect(await recordsSetBy(user.id, set.id, { now: NOW })).toEqual([])

	const view = await getExerciseHistoryView(user.id, exercise.id, { now: NOW })
	expect(view?.records).toEqual([])
	// The session is still history — the set happened — and the absence of a record
	// is a sentence rather than an empty box.
	expect(view?.sessions).toHaveLength(1)
	expect(view?.recordsRefused).toMatch(/grows as the work shrinks/)
})

test('a legacy row with no variant still reads the exercise’s own equipment', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	await priorSessions(user.id, exercise.id, [100, 105, 110])
	const today = await todaysSession(user.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	const records = await recordsSetBy(user.id, set.id, { now: NOW })

	// `createExercise` states `barbell` and writes no variant — the shape of every
	// row logged before ADR 0061's key started being written.
	expect(records.every((r) => r.equipment === 'barbell')).toBe(true)
})

test('another athlete cannot ask what a set of yours achieved', async () => {
	const owner = await createAthlete()
	const stranger = await createAthlete()
	const exercise = await createExercise('Back squat')
	const today = await todaysSession(owner.id, exercise.id)
	const set = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 120 },
		effectiveKg: 120,
		reps: 5,
	})

	expect(await recordsSetBy(stranger.id, set.id, { now: NOW })).toEqual([])
})

test('a single is the measurement, not an estimate off itself', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-13T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 61.25 },
		effectiveKg: 61.25,
		reps: 1,
		toFailure: true,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Epley over a single reported 63.29 kg beside a 61.25 kg lift — 2.04 kg
	// invented from the number it sat next to. A one-rep set is a **tested**
	// maximum, so the reading is the load lifted and no equation touches it, which
	// is `one-rm.ts`'s rule and now this surface's too.
	const single = view?.records.find((r) => r.kind === 'repMax' && r.reps === 1)
	const estimated = view?.records.find((r) => r.kind === 'e1RM')
	expect(single?.value).toBe(61.25)
	expect(estimated?.value).toBe(61.25)
	// Nothing above the lift, on any record, so no percentage can be priced off a
	// kilo the athlete never touched.
	for (const record of view?.records ?? []) {
		if (record.unit === 'kg') expect(record.value).toBeLessThanOrEqual(61.25)
	}
})

test('a heavier multi-rep set still outranks a light single, so passing the single through hides nothing', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	const where = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-13T17:00:00Z'),
		)),
	}
	await logSet(where, {
		orderIndex: 0,
		load: { kind: 'external', kg: 60 },
		effectiveKg: 60,
		reps: 1,
		toFailure: true,
	})
	await logSet(where, {
		orderIndex: 1,
		load: { kind: 'external', kg: 100 },
		effectiveKg: 100,
		reps: 5,
		toFailure: true,
	})

	const view = await getExerciseHistoryView(user.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Epley on 100 × 5 = 116.67 kg, which is the best estimate the history
	// supports; the single is read as itself and simply loses.
	expect(view?.records.find((r) => r.kind === 'e1RM')?.value).toBeCloseTo(
		116.666_666,
		4,
	)
})

test('a record the athlete did not set is not announced', async () => {
	const user = await createAthlete()
	const exercise = await createExercise('Back squat')
	// Two histories on one lift: the bar's, whose best is 82.5 kg × 5, and a
	// bodyweight-derived one whose kilo is the athlete plus what is hung off them.
	const past = {
		exerciseId: exercise.id,
		...(await createSession(
			user.id,
			exercise.id,
			new Date('2026-08-01T17:00:00Z'),
		)),
	}
	await logSet(past, {
		orderIndex: 0,
		load: { kind: 'external', kg: 82.5 },
		effectiveKg: 82.5,
		reps: 5,
	})
	await logSet(past, {
		orderIndex: 1,
		load: { kind: 'bodyweightPlus', addedKg: 3 },
		effectiveKg: 77,
		reps: 5,
	})

	const today = await todaysSession(user.id, exercise.id)
	const single = await logSet(today, {
		orderIndex: 0,
		load: { kind: 'external', kg: 61.25 },
		effectiveKg: 61.25,
		reps: 1,
	})

	const records = await recordsSetBy(user.id, single.id, { now: NOW })

	// The bar's 82.5 kg did not move, so nothing announces it. It used to: the
	// bodyweight-derived 77 kg overwrote it in the before-map, whose key had
	// dropped `loadBasis`, and the unchanged 82.5 kg then looked new — "Heaviest
	// ever: 82.5 kg — up 2.5 kg" on a 61.25 kg lift.
	expect(records.map((r) => r.value)).not.toContain(82.5)
	// Every record announced is one **this** set took.
	for (const record of records) {
		expect(record.sessionId).toBe(today.sessionId)
	}
	// And the record it really did take — a first single on the bar — is still
	// announced, which is the mirror failure of the same missing key.
	expect(
		records.find((r) => r.kind === 'repMax' && r.reps === 1),
	).toMatchObject({ value: 61.25, loadBasis: 'bar' })
})
