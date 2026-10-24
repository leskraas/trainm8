import { expect, test, vi } from 'vitest'
import { persistActivityStream } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { DeferJob } from '#app/utils/jobs/queue.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { ingestActivityStreams } from './ingest.server.ts'
import { runStravaLapsBackfill } from './laps-backfill.server.ts'
import { StravaActivitySchema } from './types.ts'

/**
 * A spent Strava day defers the job (#637). The per-activity loops are
 * best-effort and swallow a failing activity, but a deferral is not one: it
 * must reach the queue, or every remaining activity would be skipped without
 * its stream while the budget is out.
 */
vi.mock('./client.server.ts', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	stravaApiGet: vi.fn(async () => {
		throw new DeferJob(new Date('2026-05-22T00:00:00Z'), 'budget spent')
	}),
}))

async function setupImport({ withStream }: { withStream: boolean }) {
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...createUser() },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'access',
			refreshToken: 'refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	const imp = await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'strava',
			externalId: '90042',
			startedAt: new Date('2026-05-21T11:00:00.000Z'),
			endedAt: new Date('2026-05-21T11:02:00.000Z'),
			durationSec: 120,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	if (withStream) {
		const time = Array.from({ length: 121 }, (_, i) => i)
		await persistActivityStream(imp.id, {
			time,
			heartrate: time.map(() => 150),
		})
	}
	return connection
}

test('the streams loop hands a deferral to the queue instead of skipping the activity', async () => {
	const connection = await setupImport({ withStream: false })
	const activity = StravaActivitySchema.parse({
		id: 90042,
		sport_type: 'Run',
		type: 'Run',
		distance: 800,
		moving_time: 120,
		elapsed_time: 120,
		start_date: '2026-05-21T11:00:00Z',
	})

	await expect(ingestActivityStreams(connection, [activity])).rejects.toThrow(
		DeferJob,
	)
})

test('the laps backfill hands a deferral to the queue instead of logging it', async () => {
	await setupImport({ withStream: true })

	await expect(runStravaLapsBackfill()).rejects.toThrow(DeferJob)
})
