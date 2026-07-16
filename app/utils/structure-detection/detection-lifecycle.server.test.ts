import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { disconnectAccountConnection } from '../account-connection.server.ts'
import {
	createActivityImport,
	deleteActivityImportIfUnpromoted,
	promoteToNewSession,
	unlinkImport,
} from '../activity-import.server.ts'
import { type RawStream } from '../activity-stream.ts'
import { enrichImportTelemetry } from '../activity-telemetry.server.ts'
import { prisma } from '../db.server.ts'
import { jobHandlers } from '../jobs/handlers.server.ts'
import { processNextJob } from '../jobs/queue.server.ts'
import {
	runStructureDetection,
	STRUCTURE_DETECTION_ENGINE_VERSION,
} from './detect-job.server.ts'

// ── Structure Detection lifecycle — real-DB integration (ADR 0032, ADR 0012) ──
// A detection stays truthful as its import changes: re-computed on an unpromoted
// re-snapshot, frozen once promoted, cascade-deleted with a discarded/source-
// deleted non-promoted import, kept (with a promoted Recording) on source delete,
// kept on unlink, and provenance-stamped on each (re)compute. Asserts external
// DB state only — the engine internals live in analyze.test.ts.

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

/**
 * A run import filed against a `strava` Account Connection — the shape the
 * discard (disconnect) path acts on. `manual` imports have no connection behind
 * them, so the disconnect transition needs a provider-backed import.
 */
async function createStravaRunAthleteAndImport() {
	const user = await createRunAthlete()
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: `ext-athlete-${Math.random().toString(36).slice(2)}`,
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-06-01T00:00:00.000Z'),
		},
	})
	const imp = await createActivityImport(user.id, {
		externalProvider: 'strava',
		externalId: `ext-${Math.random().toString(36).slice(2)}`,
		startedAt: new Date('2026-06-01T06:00:00.000Z'),
		endedAt: new Date('2026-06-01T06:43:00.000Z'),
		durationSec: 2580,
		discipline: 'run',
		rawJson: '{}',
	})
	return { user, imp }
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

async function runPendingJobs() {
	while ((await processNextJob(jobHandlers)) === 'processed') {
		/* keep draining */
	}
}

test('a provider update to an unpromoted import re-snapshots its stream and re-computes the detection', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)

	// First snapshot is steady → below the honesty gate → no detection.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(steadyPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()
	const steadyStream = await prisma.activityStream.findUniqueOrThrow({
		where: { activityImportId: imp.id },
		select: { sampleCount: true },
	})

	// A source-side `update` re-snapshots the stream with an interval signal and
	// re-computes: the detection now exists, stamped with provenance.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()

	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: imp.id },
		select: { confidence: true, engineVersion: true, computedAt: true },
	})
	expect(detection).not.toBeNull()
	expect(['high', 'medium', 'low']).toContain(detection!.confidence)
	// Each (re)computation stamps engineVersion + computedAt (acceptance #6).
	expect(detection!.engineVersion).toBe(STRUCTURE_DETECTION_ENGINE_VERSION)
	expect(detection!.computedAt).toBeInstanceOf(Date)

	// The stream was replaced in place, not duplicated — one row, new shape.
	const streams = await prisma.activityStream.findMany({
		where: { activityImportId: imp.id },
		select: { sampleCount: true },
	})
	expect(streams).toHaveLength(1)
	expect(streams[0]!.sampleCount).not.toBe(steadyStream.sampleCount)
})

test('a re-snapshot that drops below the honesty gate clears the stale detection', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)

	// Interval signal → a detection is stored.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()

	// The source edits the activity into a formless steady effort. The re-snapshot
	// recompute drops below the gate, so the now-untruthful detection is cleared.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(steadyPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()
})

test('a below-gate recompute on an import promoted after enqueue leaves the frozen detection', async () => {
	// The freeze race, in order: a detection exists on a still-unpromoted import,
	// a below-gate recompute is enqueued while it is unpromoted, then the import
	// is promoted before the worker drains. A promoted Recording is frozen (ADR
	// 0012), so when the recompute finally runs it must NOT clear the detection.
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)

	// A detection from an earlier snapshot, present before promotion. (Empty-blocks
	// structure: it never materializes on promotion, keeping this test about the
	// freeze guard, not materialization.)
	await prisma.workoutDetection.create({
		data: {
			activityImportId: imp.id,
			structureJson: JSON.stringify({ discipline: 'run', blocks: [] }),
			confidence: 'high',
			engineVersion: STRUCTURE_DETECTION_ENGINE_VERSION,
			computedAt: new Date('2026-06-01T00:00:00.000Z'),
		},
	})

	// A steady re-snapshot (analyze → null) enqueues a below-gate recompute while
	// the import is still unpromoted — but we do NOT drain the queue yet.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(steadyPhases()),
	)

	// The import is promoted before the enqueued recompute runs.
	await promoteToNewSession(user.id, imp.id)

	// Now the worker drains: the recompute runs against the freshly promoted import
	// and reads formless — but the freeze guard keeps the detection.
	await runPendingJobs()

	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()
})

test('discarding a non-promoted import (disconnect) cascade-deletes its WorkoutDetection', async () => {
	const { user, imp } = await createStravaRunAthleteAndImport()
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()

	// Athlete-initiated disconnect drops the non-promoted inbox import (ADR 0012);
	// the 1:1 detection cascades with it (ADR 0032).
	await disconnectAccountConnection({ athleteId: user.id, provider: 'strava' })

	expect(
		await prisma.activityImport.findUnique({ where: { id: imp.id } }),
	).toBeNull()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()
})

test('a source delete of a non-promoted import cascade-deletes its WorkoutDetection', async () => {
	const { user, imp } = await createStravaRunAthleteAndImport()
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()

	const { deleted } = await deleteActivityImportIfUnpromoted(
		'strava',
		(
			await prisma.activityImport.findUniqueOrThrow({
				where: { id: imp.id },
				select: { externalId: true },
			})
		).externalId,
	)
	expect(deleted).toBe(true)
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).toBeNull()
})

test('a promoted import deleted at source keeps its Recording and detection', async () => {
	const { user, imp } = await createStravaRunAthleteAndImport()
	const { session } = await promoteToNewSession(user.id, imp.id)
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: imp.id },
	})
	expect(detection).not.toBeNull()

	const externalId = (
		await prisma.activityImport.findUniqueOrThrow({
			where: { id: imp.id },
			select: { externalId: true },
		})
	).externalId

	// A source `delete` of a promoted import is a no-op against the Recording
	// (ADR 0012): the import, its session, and the detection all survive.
	const { deleted } = await deleteActivityImportIfUnpromoted(
		'strava',
		externalId,
	)
	expect(deleted).toBe(false)
	expect(
		await prisma.activityImport.findUnique({ where: { id: imp.id } }),
	).not.toBeNull()
	expect(
		await prisma.workoutSession.findUnique({ where: { id: session.id } }),
	).not.toBeNull()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()
})

test('a re-detect over a detected session replaces its materialized Workout (#357)', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	const before = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true, source: true },
	})
	expect(before.source).toBe('detected')
	expect(before.workoutId).not.toBeNull()

	// Re-run detection (the version-bump backfill or the manual control): the
	// session already carries a `detected` Workout, so it is rebuilt, not skipped.
	await runStructureDetection({ activityImportId: imp.id })

	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true, source: true },
	})
	expect(after.source).toBe('detected')
	expect(after.workoutId).not.toBeNull()
	expect(after.workoutId).not.toBe(before.workoutId)
	// The superseded Workout is deleted, not orphaned — and the session survived
	// the swap (the `onDelete: Cascade` FK never took it down with the old Workout).
	expect(
		await prisma.workout.findUnique({ where: { id: before.workoutId! } }),
	).toBeNull()
})

test('a re-detect never rebuilds an adopted authored session (#357, ADR 0033)', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	// The athlete edits the detected structure, adopting it to `authored`.
	await prisma.workoutSession.update({
		where: { id: session.id },
		data: { source: 'authored' },
	})
	const before = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true },
	})

	await runStructureDetection({ activityImportId: imp.id })

	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { workoutId: true, source: true },
	})
	// The athlete's Workout is sacred: same row, still `authored`.
	expect(after.source).toBe('authored')
	expect(after.workoutId).toBe(before.workoutId)
})

test('unlinking a Recording from its session keeps the detection', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()

	// Unlink detaches the recording from its session but keeps the import — the
	// detection describes the import's telemetry, independent of promotion.
	await unlinkImport(user.id, imp.id)

	const after = await prisma.activityImport.findUniqueOrThrow({
		where: { id: imp.id },
		select: { promotedSessionId: true },
	})
	expect(after.promotedSessionId).toBeNull()
	expect(
		await prisma.workoutDetection.findUnique({
			where: { activityImportId: imp.id },
		}),
	).not.toBeNull()
	// The session still exists (a materialized Workout keeps it a real session);
	// unlink cleared only the recording link.
	expect(
		await prisma.workoutSession.findUnique({ where: { id: session.id } }),
	).not.toBeNull()
})
