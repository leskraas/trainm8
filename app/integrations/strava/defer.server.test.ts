import { expect, test, vi } from 'vitest'
import { persistActivityStream } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { DeferJob } from '#app/utils/jobs/queue.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { runStravaBackfill } from './backfill.server.ts'
import { stravaApiGet } from './client.server.ts'
import { ingestActivityStreams } from './ingest.server.ts'
import { runStravaLapsBackfill } from './laps-backfill.server.ts'
import { runStravaReconciliation } from './reconcile.server.ts'
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

/**
 * The 7-day deferral cap only applies to a run that made no progress (#638):
 * a big heal reading a day's budget at a time must not dead-letter with work
 * left. A loop that settled an activity before the budget ran out says so.
 */
async function caughtDeferral(run: () => Promise<unknown>): Promise<DeferJob> {
	const err = await run().then(
		() => null,
		(e: unknown) => e,
	)
	expect(err).toBeInstanceOf(DeferJob)
	return err as DeferJob
}

test('a deferral before any activity is settled made no progress', async () => {
	await setupImport({ withStream: true })

	expect((await caughtDeferral(runStravaLapsBackfill)).progressed).toBe(false)
})

test('the laps backfill marks its deferral as progressed after healing an import', async () => {
	const connection = await setupImport({ withStream: true })
	const second = await prisma.activityImport.create({
		data: {
			athleteId: connection.athleteId,
			externalProvider: 'strava',
			externalId: '90043',
			startedAt: new Date('2026-05-20T11:00:00.000Z'),
			endedAt: new Date('2026-05-20T11:02:00.000Z'),
			durationSec: 120,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	const time = Array.from({ length: 121 }, (_, i) => i)
	await persistActivityStream(second.id, {
		time,
		heartrate: time.map(() => 150),
	})
	// The first answer has no laps (settled as `[]`); the next defers.
	vi.mocked(stravaApiGet).mockResolvedValueOnce([])

	expect((await caughtDeferral(runStravaLapsBackfill)).progressed).toBe(true)
})

test('the streams loop marks its deferral as progressed after settling an activity', async () => {
	const connection = await setupImport({ withStream: false })
	await prisma.activityImport.create({
		data: {
			athleteId: connection.athleteId,
			externalProvider: 'strava',
			externalId: '90043',
			startedAt: new Date('2026-05-20T11:00:00.000Z'),
			endedAt: new Date('2026-05-20T11:02:00.000Z'),
			durationSec: 120,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	const activity = (id: number, start: string) =>
		StravaActivitySchema.parse({
			id,
			sport_type: 'Run',
			type: 'Run',
			distance: 800,
			moving_time: 120,
			elapsed_time: 120,
			start_date: start,
		})
	// The first activity has no usable streams (checked and settled); the next defers.
	vi.mocked(stravaApiGet).mockResolvedValueOnce({})

	const deferral = await caughtDeferral(() =>
		ingestActivityStreams(connection, [
			activity(90042, '2026-05-21T11:00:00Z'),
			activity(90043, '2026-05-20T11:00:00Z'),
		]),
	)
	expect(deferral.progressed).toBe(true)
})

test('the backfill and the reconciliation sweep count filed activities as progress', async () => {
	const connection = await setupImport({ withStream: true })
	const feed = [
		{
			id: 90100,
			sport_type: 'Run',
			type: 'Run',
			distance: 800,
			moving_time: 120,
			elapsed_time: 120,
			start_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
		},
	]

	// The list page files the activity; its streams fetch then defers.
	vi.mocked(stravaApiGet).mockResolvedValueOnce(feed)
	const backfill = await caughtDeferral(() =>
		runStravaBackfill(connection.athleteId),
	)
	expect(backfill.progressed).toBe(true)

	// Already filed, so a rerun's list page makes no progress of its own.
	vi.mocked(stravaApiGet).mockResolvedValueOnce(feed)
	const rerun = await caughtDeferral(() =>
		runStravaReconciliation(connection.athleteId),
	)
	expect(rerun.progressed).toBe(false)
})

/**
 * A 200 whose body doesn't parse is a glitch, not Strava's answer (#638): the
 * import is left for the next pass to ask again, never settled for good. Each
 * pass is finite and an unparseable answer is no progress, so it can't loop.
 */
test('an unparseable streams body leaves the import for a retry', async () => {
	const connection = await setupImport({ withStream: false })
	vi.mocked(stravaApiGet).mockResolvedValueOnce({ time: 'not a stream' })

	await ingestActivityStreams(connection, [
		StravaActivitySchema.parse({
			id: 90042,
			sport_type: 'Run',
			type: 'Run',
			distance: 800,
			moving_time: 120,
			elapsed_time: 120,
			start_date: '2026-05-21T11:00:00Z',
		}),
	])

	const imp = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: connection.athleteId, externalId: '90042' },
		select: { streamsCheckedAt: true },
	})
	expect(imp.streamsCheckedAt).toBeNull()
})

test('an unparseable laps body leaves the import for a retry', async () => {
	const connection = await setupImport({ withStream: true })
	vi.mocked(stravaApiGet).mockResolvedValueOnce({ not: 'laps' })
	consoleError.mockImplementation(() => {})

	await runStravaLapsBackfill()

	const imp = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: connection.athleteId, externalId: '90042' },
		select: { lapsJson: true },
	})
	expect(imp.lapsJson).toBeNull()
})
