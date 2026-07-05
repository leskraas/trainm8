import { faker } from '@faker-js/faker'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import {
	ensureNpTssBackfillEnqueued,
	runNpTssBackfill,
	NP_TSS_BACKFILL_JOB_KIND,
} from './np-tss-backfill.server.ts'

// ── the one-shot NP recompute backfill (#174) ──────────────────────────────
// Existing Coggan rows were computed from average power at high confidence.
// The backfill pushes affected athletes through the existing recompute path so
// stream-backed rides upgrade to true NP (high) and stream-less average-power
// rides correct to medium.

async function createBikeAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					disciplineProfiles: {
						create: [
							{
								discipline: 'bike',
								ftp: 250,
								preferCogganTss: true,
								preferRTSS: false,
							},
						],
					},
				},
			},
		},
	})
}

/**
 * A completed 1h ride recorded yesterday with `powerAvg` 200W and stale
 * pre-#174 provenance (coggan / high, TSS from average power). Optionally
 * carries an Activity Stream power channel: 30s@100W + 30s@300W at 5s
 * resolution — average 200W, true NP ≈ 227.98W.
 */
async function createRide(userId: string, opts: { withStream: boolean }) {
	const scheduledAt = new Date()
	scheduledAt.setUTCDate(scheduledAt.getUTCDate() - 1)
	scheduledAt.setUTCHours(12, 0, 0, 0)

	const imp = await prisma.activityImport.create({
		data: {
			athleteId: userId,
			externalProvider: 'manual',
			externalId: faker.string.uuid(),
			startedAt: scheduledAt,
			endedAt: new Date(scheduledAt.getTime() + 3600 * 1000),
			durationSec: 3600,
			discipline: 'bike',
			powerAvg: 200,
			rawJson: '{}',
			...(opts.withStream
				? {
						stream: {
							create: {
								resolutionSec: 5,
								sampleCount: 12,
								timeSec: JSON.stringify(
									Array.from({ length: 12 }, (_, i) => i * 5),
								),
								power: JSON.stringify([
									100, 100, 100, 100, 100, 100, 300, 300, 300, 300, 300, 300,
								]),
							},
						},
					}
				: {}),
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt,
			status: 'completed',
			recordingId: imp.id,
			// Stale pre-#174 provenance: average power passed off as NP.
			tssValue: 64,
			tssFormula: 'coggan',
			tssConfidence: 'high',
		},
		select: { id: true },
	})
	await prisma.activityImport.update({
		where: { id: imp.id },
		data: { promotedSessionId: session.id },
	})
	return session
}

test('ensureNpTssBackfillEnqueued enqueues exactly once, ever', async () => {
	await prisma.job.deleteMany({ where: { kind: NP_TSS_BACKFILL_JOB_KIND } })

	await ensureNpTssBackfillEnqueued()
	await ensureNpTssBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: NP_TSS_BACKFILL_JOB_KIND } }),
	).toBe(1)

	// A finished job still counts as "ran" — later boots must not re-enqueue.
	await prisma.job.updateMany({
		where: { kind: NP_TSS_BACKFILL_JOB_KIND },
		data: { status: 'completed' },
	})
	await ensureNpTssBackfillEnqueued()
	expect(
		await prisma.job.count({ where: { kind: NP_TSS_BACKFILL_JOB_KIND } }),
	).toBe(1)
})

test('runNpTssBackfill recomputes stream-backed rides to NP-based Coggan at high confidence', async () => {
	const user = await createBikeAthlete()
	const session = await createRide(user.id, { withStream: true })

	await runNpTssBackfill()

	const updated = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { tssValue: true, tssFormula: true, tssConfidence: true },
	})
	expect(updated.tssFormula).toBe('coggan')
	expect(updated.tssConfidence).toBe('high')
	// TSS = NP²/FTP² × durationHr × 100 = 227.9764²/250² × 100 ≈ 83.2 — the
	// interval ride now costs more than the 64 the 200W average claimed.
	expect(updated.tssValue).toBeCloseTo(83.2, 0)

	// The corrected number flows into the day's Load Snapshot (Dashboard).
	const dateStr = new Date(Date.now() - 24 * 3600 * 1000)
		.toISOString()
		.slice(0, 10)
	const snap = await prisma.loadSnapshot.findUnique({
		where: { athleteId_date: { athleteId: user.id, date: dateStr } },
	})
	expect(snap).not.toBeNull()
	expect(snap!.tssTotal).toBeCloseTo(83.2, 0)
})

test('runNpTssBackfill corrects stream-less average-power Coggan to medium confidence', async () => {
	const user = await createBikeAthlete()
	const session = await createRide(user.id, { withStream: false })

	await runNpTssBackfill()

	const updated = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: session.id },
		select: { tssValue: true, tssFormula: true, tssConfidence: true },
	})
	expect(updated.tssFormula).toBe('coggan')
	expect(updated.tssConfidence).toBe('medium')
	// The TSS number itself was already right for a steady ride: avg 200W on
	// FTP 250 → 64. Only the claimed confidence changes.
	expect(updated.tssValue).toBeCloseTo(64, 1)
})
