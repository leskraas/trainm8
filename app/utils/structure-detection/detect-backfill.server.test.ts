import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import {
	createActivityImport,
	promoteToNewSession,
} from '../activity-import.server.ts'
import { type RawStream } from '../activity-stream.ts'
import { enrichImportTelemetry } from '../activity-telemetry.server.ts'
import { prisma } from '../db.server.ts'
import { jobHandlers } from '../jobs/handlers.server.ts'
import { processNextJob } from '../jobs/queue.server.ts'
import {
	ensureStructureDetectionBackfillEnqueued,
	runStructureDetectionBackfill,
	STRUCTURE_DETECTION_BACKFILL_JOB_KIND,
} from './detect-backfill.server.ts'

// ── Structure Detection backfill — real-DB integration ───────────────────────
// The reach-back over existing imports (#344): a one-shot, boot-enqueued job that
// walks run/bike imports carrying a stream and runs each through the same
// detect → store → materialize path as the forward job. Asserts external
// behavior only — the stored WorkoutDetection, the materialized Workout, the
// Session Source — never the engine internals (covered pure in analyze.test.ts).

const RES = 5

type Phase = { durationSec: number; pace?: number; pause?: boolean }

/** A raw pace stream from constant-intensity phases, on a 5 s grid. */
function buildRawStream(phases: Phase[]): RawStream {
	const time: number[] = []
	const pace: Array<number | null> = []
	let t = 0
	for (const phase of phases) {
		const count = Math.max(1, Math.round(phase.durationSec / RES))
		for (let i = 0; i < count; i++) {
			time.push(t)
			t += RES
			pace.push(phase.pause ? null : (phase.pace ?? null))
		}
	}
	return { time, pace }
}

/** A raw power stream from constant-intensity phases, on a 5 s grid. */
function buildRawPowerStream(
	phases: Array<{ durationSec: number; power?: number }>,
): RawStream {
	const time: number[] = []
	const power: Array<number | null> = []
	let t = 0
	for (const phase of phases) {
		const count = Math.max(1, Math.round(phase.durationSec / RES))
		for (let i = 0; i < count; i++) {
			time.push(t)
			t += RES
			power.push(phase.power ?? null)
		}
	}
	return { time, power }
}

/** A clean bike interval on power: warm-up (Z1) → 6×(Z5 work + Z1 recovery) → cool. */
function bikeIntervalPhases(): Array<{ durationSec: number; power?: number }> {
	const phases = [{ durationSec: 300, power: 130 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, power: 285 })
		phases.push({ durationSec: 120, power: 130 })
	}
	phases.push({ durationSec: 180, power: 130 })
	return phases
}

/** The #330 clean zone-crossing archetype: warm-up → 6×(work+recovery) → cool. */
function intervalPhases(): Phase[] {
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230 })
		phases.push({ durationSec: 120, pace: 360 })
	}
	phases.push({ durationSec: 180, pace: 360 })
	return phases
}

/** An easy/steady run: all within one zone, no band separation → no structure. */
function steadyPhases(): Phase[] {
	return [
		{ durationSec: 600, pace: 355 },
		{ durationSec: 600, pace: 365 },
		{ durationSec: 600, pace: 350 },
		{ durationSec: 600, pace: 360 },
	]
}

/** A run athlete with a resolvable Daniels pace profile (so the gate can run). */
async function createRunAthlete() {
	return prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: {
							discipline: 'run',
							lthr: 160,
							maxHr: 190,
							thresholdPaceSecPerKm: 240,
							zoneSystem: 'daniels-pace-5',
						},
					},
				},
			},
		},
	})
}

/** A bike athlete with a resolvable Coggan power profile (so the gate can run). */
async function createBikeAthlete() {
	return prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: {
							discipline: 'bike',
							ftp: 250,
							zoneSystem: 'coggan-power-7',
						},
					},
				},
			},
		},
	})
}

async function createRunImport(athleteId: string) {
	return createActivityImport(athleteId, {
		externalProvider: 'manual',
		externalId: `ext-${Math.random().toString(36).slice(2)}`,
		startedAt: new Date('2026-06-01T06:00:00.000Z'),
		endedAt: new Date('2026-06-01T06:43:00.000Z'),
		durationSec: 2580,
		discipline: 'run',
		rawJson: '{}',
	})
}

/**
 * Persist a stream onto an existing import without running detection — the
 * "pre-existing history" state the backfill exists to reach. `enrichImportTelemetry`
 * enqueues a forward `structure-detection` job; leaving it undrained models an
 * import that landed before the detection job shipped.
 */
async function seedStreamWithoutDetection(
	athleteId: string,
	importId: string,
	phases: Phase[],
) {
	await enrichImportTelemetry(
		athleteId,
		importId,
		'run',
		buildRawStream(phases),
	)
}

test('the backfill reaches an existing promoted import: structured history gains a detection and a materialized detected Workout', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await seedStreamWithoutDetection(user.id, imp.id, intervalPhases())

	// Precondition: the forward job never ran, so nothing is detected yet.
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()

	await runStructureDetectionBackfill()

	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: imp.id },
		select: { confidence: true, engineVersion: true },
	})
	expect(detection).not.toBeNull()
	expect(['high', 'medium', 'low']).toContain(detection!.confidence)
	expect(detection!.engineVersion).toBeTruthy()

	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: {
			source: true,
			plannedTssValue: true,
			workout: {
				select: { discipline: true, blocks: { select: { id: true } } },
			},
		},
	})
	expect(after.source).toBe('detected')
	expect(after.workout).not.toBeNull()
	expect(after.workout!.discipline).toBe('run')
	expect(after.workout!.blocks.length).toBeGreaterThan(0)
	// Planned-TSS carve-out (ADR 0034): a detected session never gets Planned TSS.
	expect(after.plannedTssValue).toBeNull()
})

test('a steady existing import gains neither a detection nor a structure', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await seedStreamWithoutDetection(user.id, imp.id, steadyPhases())

	await runStructureDetectionBackfill()

	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, workoutId: true },
	})
	expect(after.source).toBe('recorded')
	expect(after.workoutId).toBeNull()
})

test('the backfill reaches an existing bike import too (run/bike, ADR 0015)', async () => {
	const user = await createBikeAthlete()
	const imp = await createActivityImport(user.id, {
		externalProvider: 'manual',
		externalId: `bike-${Math.random().toString(36).slice(2)}`,
		startedAt: new Date('2026-06-03T06:00:00.000Z'),
		endedAt: new Date('2026-06-03T06:43:00.000Z'),
		durationSec: 2580,
		discipline: 'bike',
		rawJson: '{}',
	})
	const { session } = await promoteToNewSession(user.id, imp.id)
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'bike',
		buildRawPowerStream(bikeIntervalPhases()),
	)

	await runStructureDetectionBackfill()

	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, workout: { select: { discipline: true } } },
	})
	expect(after.source).toBe('detected')
	expect(after.workout!.discipline).toBe('bike')
})

test('the backfill reaches an un-promoted import: the detection is stored, ready for promotion', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	// No promotion — a bare inbox item carrying only a stream.
	await seedStreamWithoutDetection(user.id, imp.id, intervalPhases())

	await runStructureDetectionBackfill()

	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()
})

test('the backfill does not disturb a promoted Recording that already carries a detection (#343)', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await seedStreamWithoutDetection(user.id, imp.id, intervalPhases())

	// Run the forward detection first, so this import already carries a detection
	// and a materialized structure before the backfill ever runs.
	while ((await processNextJob(jobHandlers)) === 'processed') {
		/* drain the forward detection job */
	}
	const before = await prisma.workoutDetection.findUniqueOrThrow({
		where: { activityImportId: imp.id },
		select: { computedAt: true, structureJson: true },
	})
	const sessionBefore = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true, source: true },
	})

	await runStructureDetectionBackfill()

	// Untouched: the backfill's `detection: null` filter skips it entirely, so the
	// stored detection and the materialized Workout are byte-for-byte the same.
	const after = await prisma.workoutDetection.findUniqueOrThrow({
		where: { activityImportId: imp.id },
		select: { computedAt: true, structureJson: true },
	})
	expect(after.computedAt).toStrictEqual(before.computedAt)
	expect(after.structureJson).toBe(before.structureJson)
	const sessionAfter = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true, source: true },
	})
	expect(sessionAfter.workoutId).toBe(sessionBefore.workoutId)
	expect(sessionAfter.source).toBe(sessionBefore.source)
})

test('the backfill ignores a stream-less import and a swim import', async () => {
	const user = await createRunAthlete()
	// A run import with no stream at all — nothing to detect.
	const streamless = await createRunImport(user.id)
	// A swim import carrying a stream — out of scope (run/bike only, ADR 0015).
	const swim = await createActivityImport(user.id, {
		externalProvider: 'manual',
		externalId: `swim-${Math.random().toString(36).slice(2)}`,
		startedAt: new Date('2026-06-02T06:00:00.000Z'),
		endedAt: new Date('2026-06-02T06:30:00.000Z'),
		durationSec: 1800,
		discipline: 'swim',
		rawJson: '{}',
	})
	await enrichImportTelemetry(
		user.id,
		swim.id,
		'swim',
		buildRawStream(intervalPhases()),
	)

	await runStructureDetectionBackfill()

	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: streamless.id },
		}),
	).toBeNull()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: swim.id },
		}),
	).toBeNull()
})

test('boot enqueue is idempotent: only one backfill job is ever created', async () => {
	await ensureStructureDetectionBackfillEnqueued()
	await ensureStructureDetectionBackfillEnqueued()

	const jobs = await prisma.job.count({
		where: { kind: STRUCTURE_DETECTION_BACKFILL_JOB_KIND },
	})
	expect(jobs).toBe(1)
})
