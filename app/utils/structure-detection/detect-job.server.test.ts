import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { ingestActivityFile } from '../activity-file-ingest.server.ts'
import {
	createActivityImport,
	promoteToNewSession,
} from '../activity-import.server.ts'
import { type RawStream } from '../activity-stream.ts'
import { enrichImportTelemetry } from '../activity-telemetry.server.ts'
import { prisma } from '../db.server.ts'
import { jobHandlers } from '../jobs/handlers.server.ts'
import { processNextJob } from '../jobs/queue.server.ts'
import { recomputePlannedTssForSession } from '../load/planned-tss.server.ts'
import { buildSegments } from './segments.ts'

// A pass-through spy, so the TCX tests can read the laps `analyze` hands on.
vi.mock('./segments.ts', async (importOriginal) => {
	const actual = await importOriginal<{ buildSegments: typeof buildSegments }>()
	return { ...actual, buildSegments: vi.fn(actual.buildSegments) }
})

// ── Structure Detection job handler — real-DB integration ────────────────────
// The auto-import path (map #326, ADR 0032/0033/0034): a run/bike import with a
// signal runs through detect → store → materialize on the Job Queue. Asserts
// external behavior only — the stored WorkoutDetection, the materialized Workout,
// the Session Source, the Planned-TSS carve-out — never the engine internals
// (those are covered pure in analyze.test.ts).

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
	// Drain the queue: detection enqueues one job per enriched import.
	while ((await processNextJob(jobHandlers)) === 'processed') {
		/* keep draining */
	}
}

test('a clearing detection materializes a detected Workout and stores the WorkoutDetection', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)
	// Promotion with no detection yet → structureless `recorded`.
	const beforeDetection = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, workoutId: true },
	})
	expect(beforeDetection.source).toBe('recorded')
	expect(beforeDetection.workoutId).toBeNull()

	// Stream lands → detection enqueued → worker runs it.
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	await runPendingJobs()

	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: imp.id },
		select: { confidence: true, engineVersion: true, structureJson: true },
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

test('a steady import writes no WorkoutDetection and the session stays recorded and structureless', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	const { session } = await promoteToNewSession(user.id, imp.id)

	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(steadyPhases()),
	)
	await runPendingJobs()

	const detection = await prisma.workoutDetection.findUnique({
		where: { activityImportId: imp.id },
	})
	expect(detection).toBeNull()

	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, workoutId: true, plannedTssValue: true },
	})
	expect(after.source).toBe('recorded')
	expect(after.workoutId).toBeNull()
	expect(after.plannedTssValue).toBeNull()
})

test('a detection that lands before promotion is auto-imported at promotion time', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)

	// Detection runs while the import is still un-promoted (mid-ingest): it
	// stores the WorkoutDetection but has no session to materialize onto yet.
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

	// Promotion now materializes the already-stored structure.
	const { session } = await promoteToNewSession(user.id, imp.id)
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, workoutId: true },
	})
	expect(after.source).toBe('detected')
	expect(after.workoutId).not.toBeNull()
})

test('the Planned-TSS guard keeps a detected session at null even on recompute', async () => {
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

	// Even with a materialized Workout present, an explicit recompute must not
	// populate Planned TSS for a `detected` session (ADR 0034).
	await recomputePlannedTssForSession(user.id, session.id)
	const after = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { source: true, plannedTssValue: true },
	})
	expect(after.source).toBe('detected')
	expect(after.plannedTssValue).toBeNull()
})

test('a swim import never enqueues detection (run/bike only, ADR 0015)', async () => {
	const user = await createRunAthlete()
	const imp = await createActivityImport(user.id, {
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
		imp.id,
		'swim',
		buildRawStream(intervalPhases()),
	)

	const jobs = await prisma.job.count({
		where: { kind: 'structure-detection' },
	})
	expect(jobs).toBe(0)
})

// ── TCX laps reach the engine (#612) ─────────────────────────────────────────
// The fixture's two 1200 s laps must arrive at `buildSegments` as lap edges, both
// from a fresh upload and from a row stored in the old `TcxLapMarker` shape.

test('a TCX upload with laps reaches buildSegments with lap edges (#612)', async () => {
	const user = await createRunAthlete()
	const result = await ingestActivityFile(
		user.id,
		{
			fileName: 'run-with-hr.tcx',
			bytes: new Uint8Array(readFileSync('tests/fixtures/tcx/run-with-hr.tcx')),
		},
		{ timezone: 'UTC' },
	)
	expect(result.status).toBe('imported')
	vi.mocked(buildSegments).mockClear()

	await runPendingJobs()

	expect(vi.mocked(buildSegments)).toHaveBeenCalledTimes(1)
	expect(vi.mocked(buildSegments).mock.calls[0]![3]).toEqual([
		expect.objectContaining({ startSec: 0, endSec: 1200 }),
		expect.objectContaining({ startSec: 1200, endSec: 2400 }),
	])
})

test('a TCX import stored with legacy lap markers still reaches buildSegments with lap edges (#612)', async () => {
	const user = await createRunAthlete()
	const imp = await createRunImport(user.id)
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: {
			lapsJson: JSON.stringify([
				{
					startOffsetSec: 0,
					durationSec: 1200,
					distanceM: 3000,
					trigger: 'Manual',
				},
				{
					startOffsetSec: 1200,
					durationSec: 1200,
					distanceM: 3000,
					trigger: 'Manual',
				},
			]),
		},
	})
	await enrichImportTelemetry(
		user.id,
		imp.id,
		'run',
		buildRawStream(intervalPhases()),
	)
	vi.mocked(buildSegments).mockClear()

	await runPendingJobs()

	expect(vi.mocked(buildSegments).mock.calls[0]![3]).toEqual([
		expect.objectContaining({ startSec: 0, endSec: 1200 }),
		expect.objectContaining({ startSec: 1200, endSec: 2400 }),
	])
})
