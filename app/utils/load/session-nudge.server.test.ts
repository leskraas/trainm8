import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { type IntensityTarget } from '#app/utils/workout-schema.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { applySessionNudgeForUser } from './session-nudge.server.ts'

// ── fixtures ──────────────────────────────────────────────────────────────
//
// The applier runs on the load-recompute path: it reconciles the athlete's most
// recent LoadSnapshot (TSB) + trust + sustained adherence, and on a back-off
// call rewrites the next planned cardio session to the canonical eased target.
// These tests set up the persisted state each branch needs and assert the
// *persisted* effect — external behaviour only.

const NOW = new Date('2026-06-10T09:00:00.000Z')

async function createBiker({
	ftp = 250,
	zoneSystem = 'coggan-power-7' as string | null,
	firstSnapshotDaysAgo = 60,
	tsb = -18,
}: {
	ftp?: number | null
	zoneSystem?: string | null
	firstSnapshotDaysAgo?: number
	tsb?: number
} = {}) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [
							{ discipline: 'bike', ftp, zoneSystem, preferCogganTss: true },
						],
					},
				},
			},
		},
	})

	// Load history: a first snapshot `firstSnapshotDaysAgo` back (drives the trust
	// gate) and the most recent snapshot carrying the TSB the coach reads.
	const dayMs = 24 * 60 * 60 * 1000
	const first = new Date(NOW.getTime() - firstSnapshotDaysAgo * dayMs)
	const iso = (d: Date) => d.toISOString().slice(0, 10)
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(first),
			tssTotal: 50,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40,
			tsb: 0,
		},
	})
	await prisma.loadSnapshot.create({
		data: {
			athleteId: user.id,
			date: iso(NOW),
			tssTotal: 0,
			tssByDiscipline: '{}',
			ctl: 40,
			atl: 40 - tsb,
			tsb,
		},
	})
	return user
}

/** A hard bike interval session tomorrow (the next planned session). */
async function createIntervalSession(
	userId: string,
	{
		durationSec = 5400,
		source = 'generated' as string,
		scheduledAt = new Date('2026-06-11T08:00:00.000Z'),
		status = 'scheduled' as string,
		// VO2 intensity (zone 5) by default — a "key" prescription.
		minPct = 110,
		maxPct = 120,
	} = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title: 'VO2 intervals',
			discipline: 'bike',
			intent: 'vo2max',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 5,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'bike',
									durationSec,
									intensity: JSON.stringify({
										kind: 'powerPct',
										minPct,
										maxPct,
									}),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status,
			source,
		},
		select: { id: true },
	})
	return session
}

async function readPrescription(sessionId: string) {
	const session = await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: {
			source: true,
			plannedTssValue: true,
			workout: {
				select: {
					discipline: true,
					intent: true,
					blocks: {
						orderBy: { orderIndex: 'asc' },
						select: {
							repeatCount: true,
							steps: {
								orderBy: { orderIndex: 'asc' },
								select: {
									kind: true,
									discipline: true,
									intensity: true,
									durationSec: true,
								},
							},
						},
					},
				},
			},
		},
	})
	return session!
}

// ── eased: the next cardio session is softened to the canonical target ────────

test('a back-off call eases the next planned cardio session to a single Z2 endurance block, capped at an hour', async () => {
	const user = await createBiker({ tsb: -18 })
	const session = await createIntervalSession(user.id, { durationSec: 5400 })

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.workout!.blocks).toHaveLength(1)
	expect(after.workout!.blocks[0]!.repeatCount).toBe(1)
	expect(after.workout!.blocks[0]!.steps).toHaveLength(1)
	const step = after.workout!.blocks[0]!.steps[0]!
	expect(step.kind).toBe('cardio')
	expect(step.discipline).toBe('bike')
	expect(step.durationSec).toBe(60 * 60) // capped at the hour
	expect(JSON.parse(step.intensity!) as IntensityTarget).toEqual({
		kind: 'zoneLabel',
		label: 'Z2',
	})
	expect(after.workout!.intent).toBe('endurance')
	// Planned TSS is recomputed off the new (easier) prescription.
	expect(after.plannedTssValue).not.toBeNull()
})

test('applying twice leaves the session unchanged the second time (idempotent)', async () => {
	const user = await createBiker({ tsb: -18 })
	const session = await createIntervalSession(user.id)

	await applySessionNudgeForUser(user.id, NOW)
	const once = await readPrescription(session.id)
	await applySessionNudgeForUser(user.id, NOW)
	const twice = await readPrescription(session.id)

	expect(twice).toEqual(once)
})

test('a generated session stays generated after an ease (source preserved, no adoption)', async () => {
	const user = await createBiker({ tsb: -18 })
	const session = await createIntervalSession(user.id, { source: 'generated' })

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.source).toBe('generated')
})

// ── trust gate: below 42 days nothing is mutated (Form-derived) ───────────────

test('below the trust gate a Form-derived back-off does not mutate the session', async () => {
	const user = await createBiker({ tsb: -18, firstSnapshotDaysAgo: 12 })
	const session = await createIntervalSession(user.id)
	const before = await readPrescription(session.id)

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	// Untouched: still the 5× interval block.
	expect(after.workout!.blocks[0]!.repeatCount).toBe(5)
	expect(after.workout!.intent).toBe('vo2max')
	expect(after).toEqual(before)
})

// ── sustained over eases even during cold-start ───────────────────────────────

test('a sustained-over streak eases during cold-start (adherence is independent of TSB trust)', async () => {
	// Below the trust gate, but a sustained over-plan streak still speaks.
	const user = await createBiker({ tsb: 2, firstSnapshotDaysAgo: 12 })
	const session = await createIntervalSession(user.id)

	// Two completed weeks both well over plan → sustained over.
	const dayMs = 24 * 60 * 60 * 1000
	for (let i = 1; i <= 12; i++) {
		const day = new Date(NOW.getTime() - i * dayMs)
		const w = await prisma.workout.create({
			data: {
				title: 'easy',
				discipline: 'bike',
				intent: 'endurance',
				ownerId: user.id,
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
										discipline: 'bike',
										durationSec: 3600,
										intensity: JSON.stringify({
											kind: 'powerPct',
											minPct: 55,
											maxPct: 65,
										}),
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
				userId: user.id,
				workoutId: w.id,
				scheduledAt: day,
				status: 'completed',
				// Actual TSS far above planned → over-plan adherence.
				tssValue: 200,
				plannedTssValue: 60,
			},
		})
	}

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.workout!.blocks[0]!.repeatCount).toBe(1)
	expect(after.workout!.intent).toBe('endurance')
	expect(after.workout!.blocks[0]!.steps[0]!.durationSec).toBe(60 * 60)
})

// ── unresolvable endurance zone → honest Unavailable target ───────────────────

test('an unresolvable endurance zone eases the prescription but leaves Planned TSS unavailable (no fabricated range)', async () => {
	// No zone system configured → the endurance zone cannot resolve to a range.
	const user = await createBiker({ tsb: -18, zoneSystem: null })
	const session = await createIntervalSession(user.id)

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	// Still eased to the canonical single Z2 endurance block…
	expect(after.workout!.blocks).toHaveLength(1)
	expect(JSON.parse(after.workout!.blocks[0]!.steps[0]!.intensity!)).toEqual({
		kind: 'zoneLabel',
		label: 'Z2',
	})
	// …but Planned TSS is honestly Unavailable — never a fabricated number.
	expect(after.plannedTssValue).toBeNull()
})

// ── prescription rewrites clear the Replan Note (#197, ADR 0025 §4) ───────────

/** A Replan Note as the Week Replan applier (ADR 0025) would have left it. */
const REPLAN_NOTE =
	'Last week ran 25% over plan and Form was −12 — softened this session ~20%.'

test('a back-off ease clears the eased session Replan Note — the ease takes over that session story', async () => {
	const user = await createBiker({ tsb: -18 })
	const session = await createIntervalSession(user.id, { source: 'generated' })
	// The week rescale runs first on the recompute path; the ease lands on top.
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { replanReason: REPLAN_NOTE },
	})

	await applySessionNudgeForUser(user.id, NOW)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { replanReason: true, source: true },
	})
	// The ease rewrote the prescription the note explained — the note goes…
	expect(after!.replanReason).toBeNull()
	// …while `source` still stays exactly as it was (no adoption flip, ADR 0016).
	expect(after!.source).toBe('generated')
})

test('a held outcome leaves an existing Replan Note untouched (nothing was rewritten)', async () => {
	const user = await createBiker({ tsb: 8 })
	const session = await createIntervalSession(user.id)
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { replanReason: REPLAN_NOTE },
	})

	await applySessionNudgeForUser(user.id, NOW)

	const after = await prisma.workoutSession.findUnique({
		where: { id: session.id },
		select: { replanReason: true },
	})
	expect(after!.replanReason).toBe(REPLAN_NOTE)
})

// ── held tones do not mutate ──────────────────────────────────────────────────

test('a fresh Form call leaves the next session as planned', async () => {
	const user = await createBiker({ tsb: 8 })
	const session = await createIntervalSession(user.id)
	const before = await readPrescription(session.id)

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after).toEqual(before)
})

// ── strength next session holds (no zone ease) ────────────────────────────────

test('a strength next session is not eased on a back-off call', async () => {
	const user = await createBiker({ tsb: -18 })
	// Give the athlete an exercise + a strength session as the next planned one.
	const exercise = await prisma.exercise.create({
		data: { name: 'Back Squat', primaryMuscle: 'quads' },
		select: { id: true },
	})
	const workout = await prisma.workout.create({
		data: {
			title: 'Lower body',
			discipline: 'strength',
			intent: 'strength-max',
			ownerId: user.id,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 3,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									sets: {
										create: [
											{ orderIndex: 0, kind: 'reps', reps: 5, weightKg: 100 },
										],
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
	const session = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-06-11T08:00:00.000Z'),
			status: 'scheduled',
			source: 'generated',
		},
		select: { id: true },
	})
	const before = await readPrescription(session.id)

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.workout!.discipline).toBe('strength')
	expect(after).toEqual(before)
})

// ── a recorded miss feeds the same applier (#186, PRD #163) ───────────────────

/** A hard (key) bike session two days back, recorded as missed. */
async function createRecordedMiss(
	userId: string,
	overrides: Parameters<typeof createIntervalSession>[1] = {},
) {
	return createIntervalSession(userId, {
		scheduledAt: new Date('2026-06-08T08:00:00.000Z'),
		status: 'missed',
		...overrides,
	})
}

test('a recorded key miss eases the next planned cardio session and recomputes its Planned TSS', async () => {
	// Neutral Form — without the miss this would be a held outcome (no mutation).
	const user = await createBiker({ tsb: 2 })
	await createRecordedMiss(user.id)
	const session = await createIntervalSession(user.id, { durationSec: 5400 })

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.workout!.blocks).toHaveLength(1)
	expect(after.workout!.blocks[0]!.repeatCount).toBe(1)
	const step = after.workout!.blocks[0]!.steps[0]!
	expect(step.durationSec).toBe(60 * 60) // capped at the hour
	expect(JSON.parse(step.intensity!) as IntensityTarget).toEqual({
		kind: 'zoneLabel',
		label: 'Z2',
	})
	expect(after.workout!.intent).toBe('endurance')
	// Planned TSS is recomputed off the new (easier) prescription.
	expect(after.plannedTssValue).not.toBeNull()
})

test('a miss-driven ease is idempotent and preserves a generated source', async () => {
	const user = await createBiker({ tsb: 2 })
	await createRecordedMiss(user.id)
	const session = await createIntervalSession(user.id, { source: 'generated' })

	await applySessionNudgeForUser(user.id, NOW)
	const once = await readPrescription(session.id)
	await applySessionNudgeForUser(user.id, NOW)
	const twice = await readPrescription(session.id)

	expect(twice).toEqual(once)
	// No adoption flip — regeneration remains the reversibility path (ADR 0016).
	expect(twice.source).toBe('generated')
})

test('a recorded easy miss mutates nothing (not a qualifying miss)', async () => {
	const user = await createBiker({ tsb: 2 })
	// A missed Z2 endurance ride — never "key", so it does not move the plan.
	await createRecordedMiss(user.id, { minPct: 60, maxPct: 70 })
	const session = await createIntervalSession(user.id)
	const before = await readPrescription(session.id)

	await applySessionNudgeForUser(user.id, NOW)

	const after = await readPrescription(session.id)
	expect(after.workout!.blocks[0]!.repeatCount).toBe(5)
	expect(after.workout!.intent).toBe('vo2max')
	expect(after).toEqual(before)
})

test('a co-occurring Form back-off and a recorded miss produce one and the same ease (never double-counted)', async () => {
	// The Form-only ease is the baseline…
	const formOnly = await createBiker({ tsb: -18 })
	const formOnlySession = await createIntervalSession(formOnly.id)
	await applySessionNudgeForUser(formOnly.id, NOW)
	const formOnlyAfter = await readPrescription(formOnlySession.id)

	// …and adding a recorded miss on top changes nothing about what persists.
	const both = await createBiker({ tsb: -18 })
	await createRecordedMiss(both.id)
	const bothSession = await createIntervalSession(both.id)
	await applySessionNudgeForUser(both.id, NOW)
	const bothAfter = await readPrescription(bothSession.id)

	expect(bothAfter.workout).toEqual(formOnlyAfter.workout)
	expect(bothAfter.plannedTssValue).toEqual(formOnlyAfter.plannedTssValue)
})
