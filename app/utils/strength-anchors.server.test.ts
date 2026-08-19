import { expect, test } from 'vitest'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { prisma } from './db.server.ts'
import { repLoadBasisText } from './strength/anchors.constants.ts'
import { resolveLoadTarget } from './strength/anchors.ts'
import { oneRmRefusalText } from './strength/one-rm.ts'
import {
	acceptProposedExerciseOneRm,
	getAnchorContext,
	listExerciseAnchors,
	proposeExerciseOneRm,
	recordStatedAnchor,
} from './strength-anchors.server.ts'
import { formatKg } from './strength-log.ts'

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

/** A squat: `squat` is one of the patterns the rep↔load equations were actually
 * fitted to, so the estimator reads it on the strongest basis it has. */
async function createExercise(
	name = 'Back squat',
	movementPattern: string | null = 'squat',
) {
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
		/** The `LoadValue` the set was logged under. A weight on the bar unless a
		 * test says otherwise — the one kind a 1RM can be read from. */
		load?: unknown
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
			load: JSON.stringify(
				options.load ?? { kind: 'external', kg: options.loadKg },
			),
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
		proposal?.reading.kind === 'estimate' && formatKg(proposal.reading.valueKg),
	).toBe('116.67')
	// A proposal is a proposal: nothing is on file until the athlete accepts.
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('an anchor is never read from a set whose stored kilo does not follow from its load', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	// **The row the propose screen believed.** A hand-written `30 kg` load with
	// `effectiveKg: 300` standing beside it — the kilo is not the one the load
	// explains, and the two cannot both be true. It printed *"Set used: 300 kg × 3"*
	// and the accept path then wrote a 330 kg anchor, because the kind said
	// `external` and nothing had asked whether the number followed from it.
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 300,
		reps: 3,
		toFailure: true,
		load: { kind: 'external', kg: 30 },
	})

	const refused = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Nothing qualifies, so the surface says so — and neither the kilo that was
	// stored nor the 1RM it would have produced is quoted anywhere in the payload.
	expect(refused?.reading.kind).toBe('refusal')
	expect(JSON.stringify(refused?.reading)).not.toContain('300')
	expect(JSON.stringify(refused?.reading)).not.toContain('330')

	// And the honest set beside it is read exactly as it always was: the
	// contradicted row is dropped, not the athlete's history.
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-08T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})
	const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})
	expect(
		proposal?.reading.kind === 'estimate' && formatKg(proposal.reading.valueKg),
	).toBe('116.67')
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
		postedValueKg: 116.67,
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

// ── Which lifts may be estimated at all ──────────────────────────────────────
// The published equations were fitted to a handful of lifts, so the answer per
// movement pattern is either an estimate on a stated basis or a refusal with a
// stated reason — never a silent borrowing of the bench press's curve.

/** The five lifts a StrongLifts athlete actually runs, with the movement
 * pattern each one carries in the corpus. */
const STRONGLIFTS = [
	{ name: 'Back squat', pattern: 'squat' },
	{ name: 'Bench press', pattern: 'horizontal-push' },
	{ name: 'Overhead press', pattern: 'vertical-push' },
	{ name: 'Deadlift', pattern: 'hinge' },
	{ name: 'Barbell row', pattern: 'horizontal-pull' },
] as const

test('each of the five barbell lifts either estimates or refuses with a stated reason', async () => {
	for (const lift of STRONGLIFTS) {
		const athlete = await createAthlete()
		const exercise = await createExercise(lift.name, lift.pattern)
		await createLoggedSquat(athlete.id, exercise.id, {
			scheduledAt: new Date('2026-08-01T17:00:00Z'),
			loadKg: 100,
			reps: 5,
			toFailure: true,
		})

		const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
			now: new Date('2026-08-14T00:00:00Z'),
		})

		// Every one of them is answered. Before this, three of the five refused
		// outright, which left `@ 85 % 1RM` unresolvable for most of the program.
		expect(proposal?.reading.kind).toBe('estimate')
		expect(
			proposal?.reading.kind === 'estimate' &&
				formatKg(proposal.reading.valueKg),
		).toBe('116.67')
	}
})

test('an estimate on a lift no equation was fitted to is graded down and names the weaker basis', async () => {
	const athlete = await createAthlete()
	const press = await createExercise('Overhead press', 'vertical-push')
	const squat = await createExercise('Back squat', 'squat')
	for (const exercise of [press, squat]) {
		await createLoggedSquat(athlete.id, exercise.id, {
			scheduledAt: new Date('2026-08-01T17:00:00Z'),
			loadKg: 100,
			reps: 5,
			toFailure: true,
		})
	}

	const pressProposal = await proposeExerciseOneRm(athlete.id, press.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})
	const squatProposal = await proposeExerciseOneRm(athlete.id, squat.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Same set, same equation, one grade apart: the overhead press borrows a
	// curve that was fitted to the bench press and the squat, and the borrowing
	// costs a grade and is said out loud.
	expect(pressProposal?.repLoadBasis).toBe('transferred')
	expect(repLoadBasisText('transferred')).toMatch(
		/no equation was ever fitted/i,
	)
	expect(
		pressProposal?.reading.kind === 'estimate' &&
			pressProposal.reading.confidence,
	).toBe('low')
	expect(squatProposal?.repLoadBasis).toBe('fitted')
	expect(
		squatProposal?.reading.kind === 'estimate' &&
			squatProposal.reading.confidence,
	).toBe('medium')
})

test('a deadlift estimate states the direction the equations are known to be wrong in', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise('Deadlift', 'hinge')
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// LeSuer 1997 tested these equations on the deadlift and every one of them
	// underestimated it. That is a measured bias, so it is reported rather than
	// corrected for, and it is not a reason to withhold the number.
	expect(proposal?.repLoadBasis).toBe('measured-biased')
	expect(repLoadBasisText('measured-biased')).toMatch(/reads low/i)
	expect(
		proposal?.reading.kind === 'estimate' && proposal.reading.confidence,
	).toBe('low')
})

test('a movement with no reps-to-load evidence still refuses rather than borrowing a curve', async () => {
	const athlete = await createAthlete()
	const curl = await createExercise('Barbell curl', 'isolation')
	// ADR 0061: 701 of 745 corpus rows carry no movement pattern at all.
	const unknown = await createExercise('Some lift', null)
	for (const exercise of [curl, unknown]) {
		await createLoggedSquat(athlete.id, exercise.id, {
			scheduledAt: new Date('2026-08-01T17:00:00Z'),
			loadKg: 40,
			reps: 5,
			toFailure: true,
		})
	}

	for (const exercise of [curl, unknown]) {
		const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
			now: new Date('2026-08-14T00:00:00Z'),
		})
		// Single-joint work is measurably on another curve and nobody has drawn
		// it, and an exercise with no movement pattern is not known to be on any
		// curve at all. There is nothing to grade down to.
		expect(proposal?.repLoadBasis).toBe('unmapped')
		expect(
			proposal?.reading.kind === 'refusal' && proposal.reading.refusal,
		).toBe('exercise-unmapped')
	}
})

test('the grade an estimate was shown with is the grade that gets stored', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise('Barbell row', 'horizontal-pull')
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 116.67,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	expect(anchor?.confidence).toBe('low')
})

// ── The equation is a posted field ───────────────────────────────────────────
// Seven equations are selectable, which makes the protocol attacker-controlled.
// The server re-runs *the equation that was posted* and stores what it produced.

test('accepting a value another equation produced is refused and writes nothing', async () => {
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
		// Mayhew's own reading of this set is 119.01 kg; Epley's is 116.67. Posting
		// the higher one under the lower one's name is a value no derivation
		// supports, whichever equation is named.
		estimator: 'epley',
		postedValueKg: 119.01,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result).toEqual({ ok: false, reason: 'stale' })
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('a picked equation is the one re-run, and it is stored as the anchor’s protocol', async () => {
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
		estimator: 'mayhew',
		postedValueKg: 119.01,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result.ok).toBe(true)
	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	// The stored protocol is the equation that was actually applied, so the
	// number stays re-derivable by anyone who reads the row.
	expect(anchor?.protocol).toBe('mayhew')
	// Stored with the arithmetic intact — `119.01` is what a reader sees, and it
	// is `formatKg`'s decision, not one baked into the row.
	expect(anchor?.valueKg).toBeCloseTo(119.0106804515196, 10)
	expect(formatKg(anchor!.valueKg)).toBe('119.01')
})

// ── A kilo is rounded in the rendering, never in the value ───────────────────
// Twice now a stored or derived kilo has been snapped in the number itself. The
// number is a claim, its decimals are a presentation, and `formatKg` is the only
// place the second one is decided.

test('a tested single is stored as the weight that was lifted, not a rounded restatement of it', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	// A rack with 1.25 kg pairs makes 61.25, and the athlete lifted it once, to
	// failure. The propose screen says no equation is applied to a single to
	// failure — so the row it writes has to agree with that sentence.
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 61.25,
		reps: 1,
		toFailure: true,
	})

	const result = await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 61.25,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result).toEqual({ ok: true, id: expect.any(String), valueKg: 61.25 })
	const [anchor] = await listExerciseAnchors(athlete.id, exercise.id)
	expect(anchor?.construct).toBe('oneRm')
	expect(anchor?.protocol).toBe('tested')
	// Not 61.3. The 0.05 kg a one-decimal round invented was a weight nobody
	// lifted, and it was stored and then prescribed off.
	expect(anchor?.valueKg).toBe(61.25)
})

test('a resolved percentage of a stored anchor is derived from the anchor as stored', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 61.25,
		reps: 1,
		toFailure: true,
	})
	await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 61.25,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	const ctx = await getAnchorContext(
		athlete.id,
		exercise.id,
		new Date('2026-08-14T00:00:00Z'),
	)
	const resolved = resolveLoadTarget({ kind: 'pct1RM', minPct: 85 }, ctx)

	expect(resolved.kind).toBe('resolved')
	if (resolved.kind !== 'resolved') return
	// 85 % of 61.25 is 52.0625. Off a 61.3 that was never lifted it read 52.11 —
	// a fabricated kilo, one step removed and load-bearing on the bar.
	expect(resolved.kg).toBeCloseTo(52.0625, 10)
	expect(formatKg(resolved.kg)).toBe('52.06')
	expect(resolved.basis.anchorValueKg).toBe(61.25)
})

test('an estimate is never read from a set whose kilo includes the athlete', async () => {
	const athlete = await createAthlete()
	// A dip-belt bench press: `effectiveKg` is the athlete's 74 kg plus the 30 kg on
	// the belt, and 30 kg is the only weight that was on anything.
	const exercise = await createExercise('Bench press', 'horizontal-push')
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 104,
		reps: 5,
		toFailure: true,
		load: { kind: 'bodyweightPlus', addedKg: 30 },
	})

	const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	// Epley on 104 kg would have proposed 121.33 kg — a bar weight this athlete has
	// never touched, and one every percentage would then have been priced off.
	expect(proposal?.reading.kind).toBe('refusal')
	expect(proposal?.reading.kind === 'refusal' && proposal.reading.refusal).toBe(
		'load-not-on-the-bar',
	)
	// And the refusal is a sentence the surface can render in place.
	expect(
		proposal?.reading.kind === 'refusal' &&
			oneRmRefusalText(proposal.reading.refusal),
	).toContain('not logged as a weight on the bar')
})

test('a posted estimate from an incomparable set is refused and nothing is written', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise('Bench press', 'horizontal-push')
	await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 104,
		reps: 5,
		toFailure: true,
		load: { kind: 'bodyweightPlus', addedKg: 30 },
	})

	const result = await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		// The number the unguarded surface showed, posted straight back.
		postedValueKg: 121.33,
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(result).toEqual({ ok: false, reason: 'refused' })
	expect(await listExerciseAnchors(athlete.id, exercise.id)).toEqual([])
})

test('a set with no readable load kind is refused rather than priced as a bar weight', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	const { sessionId } = await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})
	// A row whose `load` column will not read as a `LoadValue` at all.
	await prisma.exerciseSetLog.updateMany({
		where: { sessionId },
		data: { load: 'not json' },
	})

	const proposal = await proposeExerciseOneRm(athlete.id, exercise.id, {
		now: new Date('2026-08-14T00:00:00Z'),
	})

	expect(proposal?.reading.kind === 'refusal' && proposal.reading.refusal).toBe(
		'load-kind-unstated',
	)
})

test('an anchor whose source set is gone does not keep claiming a derivation it cannot show', async () => {
	const athlete = await createAthlete()
	const exercise = await createExercise()
	const { sessionId } = await createLoggedSquat(athlete.id, exercise.id, {
		scheduledAt: new Date('2026-08-01T17:00:00Z'),
		loadKg: 100,
		reps: 5,
		toFailure: true,
	})

	const accepted = await acceptProposedExerciseOneRm({
		userId: athlete.id,
		exerciseId: exercise.id,
		postedValueKg: 116.67,
		now: new Date('2026-08-14T00:00:00Z'),
	})
	expect(accepted.ok).toBe(true)

	// While the set is on file the derivation is showable, and the anchor names the
	// set it was read from.
	const [before] = await listExerciseAnchors(athlete.id, exercise.id)
	expect(before?.derivation.kind).toBe('shown')

	// Now the set goes — the session is deleted, and `sourceSetLogId` is `SET NULL`
	// because an accepted estimate is the athlete's own number and losing the set
	// must not lose the anchor.
	await prisma.workoutSession.delete({ where: { id: sessionId } })

	const [after] = await listExerciseAnchors(athlete.id, exercise.id)
	// The number stands, unmoved.
	expect(after?.valueKg).toBe(before?.valueKg)
	expect(after?.protocol).toBe('epley')
	// The claim does not: there is no set to show, and the row says so instead of
	// naming an equation it can no longer re-run against anything.
	expect(after?.sourceSetLogId).toBeNull()
	expect(after?.derivation).toEqual({ kind: 'source-gone' })
})

test('a number the athlete typed has no derivation to lose', async () => {
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
	// Absent, not missing: `athlete-stated` never read a set, so "the set is gone"
	// would be a sentence about something that never existed.
	expect(anchor?.derivation).toEqual({ kind: 'no-set' })
})
