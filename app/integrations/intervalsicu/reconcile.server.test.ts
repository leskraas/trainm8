import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { parseStoredStream } from '#app/utils/activity-stream.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import {
	MOCK_INTERVALSICU_API_KEY,
	MOCK_INTERVALSICU_ATHLETE_ID,
} from '#tests/mocks/intervalsicu.ts'
import { runIntervalsIcuReconciliation } from './reconcile.server.ts'

const ACTIVITIES_URL =
	'https://intervals.icu/api/v1/athlete/:athleteId/activities'

async function setupConnection(
	overrides: Partial<{
		status: string
		lastSyncedAt: Date | null
		accessToken: string
	}> = {},
) {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: MOCK_INTERVALSICU_ATHLETE_ID,
			accessToken: overrides.accessToken ?? MOCK_INTERVALSICU_API_KEY,
			status: overrides.status ?? 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
			lastSyncedAt:
				overrides.lastSyncedAt === undefined
					? new Date('2026-05-20T00:00:00.000Z')
					: overrides.lastSyncedAt,
		},
	})
	return { user, connection }
}

function missedActivity(id = 'i5001', start_date = '2026-05-21T06:00:00Z') {
	return {
		id,
		name: 'Missed Morning Run',
		type: 'Run',
		distance: 10000,
		moving_time: 3000,
		elapsed_time: 3100,
		start_date,
		average_heartrate: 150,
	}
}

test('repairs a missed activity by filing it as an ActivityImport', async () => {
	const { user } = await setupConnection()
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	expect(result.created).toBe(1)

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: user.id },
	})
	expect(imports).toHaveLength(1)
	expect(imports[0]!.externalId).toBe('i5001')
	expect(imports[0]!.externalProvider).toBe('intervalsicu')
})

test('fetches with a 48h overlap before lastSyncedAt to catch late arrivals', async () => {
	const lastSyncedAt = new Date('2026-05-20T00:00:00.000Z')
	const { user } = await setupConnection({ lastSyncedAt })

	let oldest: string | null = null
	server.use(
		http.get(ACTIVITIES_URL, ({ request }) => {
			oldest = new URL(request.url).searchParams.get('oldest')
			// A device that synced late: the activity predates the watermark and a
			// manual sync (no overlap) would never reach back for it.
			return HttpResponse.json([
				missedActivity('i5002', '2026-05-19T06:00:00Z'),
			])
		}),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	// 48h before the 2026-05-20T00:00Z watermark, as the zone-less local
	// ISO-8601 date-time the API expects (timezone defaults to UTC).
	expect(oldest).toBe('2026-05-18T00:00:00')

	const imported = await prisma.activityImport.findFirst({
		where: { athleteId: user.id, externalId: 'i5002' },
	})
	expect(imported).not.toBeNull()
})

test('advances lastSyncedAt to the latest activity time on success', async () => {
	const { user, connection } = await setupConnection({
		lastSyncedAt: new Date('2026-05-20T00:00:00.000Z'),
	})
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([
				missedActivity('i6001', '2026-05-21T06:00:00Z'),
				missedActivity('i6002', '2026-05-23T18:00:00Z'),
			]),
		),
	)

	await runIntervalsIcuReconciliation(user.id)

	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe('2026-05-23T18:00:00.000Z')
})

test('never regresses lastSyncedAt when the overlap only returns older activities', async () => {
	const lastSyncedAt = new Date('2026-05-25T00:00:00.000Z')
	const { user, connection } = await setupConnection({ lastSyncedAt })
	server.use(
		http.get(ACTIVITIES_URL, () =>
			HttpResponse.json([missedActivity('i6003', '2026-05-24T06:00:00Z')]),
		),
	)

	await runIntervalsIcuReconciliation(user.id)

	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.lastSyncedAt?.toISOString()).toBe(lastSyncedAt.toISOString())
})

test('the sweep ingests each filed activity’s telemetry stream', async () => {
	const { user } = await setupConnection()
	// Default streams mock: a 900s HR profile for any activity id.
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: user.id, externalId: 'i5001' },
		select: { stream: true },
	})
	invariant(imported.stream, 'expected the sweep to persist an Activity Stream')
	const parsed = parseStoredStream(imported.stream)
	invariant(parsed, 'expected a parseable stored stream')
	expect(parsed.heartrate).toBeDefined()
	expect(parsed.heartrate!.some((v) => v != null)).toBe(true)
})

test('the sweep heals a stream-less import it already holds inside the window', async () => {
	const { user } = await setupConnection()
	// An import filed by an earlier sweep run before streams were ingested (or
	// whose streams fetch failed): re-swept, it should gain its stream even
	// though filing skips it as a duplicate.
	const existing = await prisma.activityImport.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: 'i5001',
			startedAt: new Date('2026-05-21T06:00:00.000Z'),
			endedAt: new Date('2026-05-21T06:51:40.000Z'),
			durationSec: 3000,
			discipline: 'run',
			hrAvg: 150,
			rawJson: '{}',
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	expect(result.created).toBe(0)
	expect(result.skipped).toBe(1)
	const stream = await prisma.activityStream.findUnique({
		where: { activityImportId: existing.id },
	})
	expect(stream).not.toBeNull()
})

test('a swept activity that auto-matches a planned session earns TSS from the load recompute', async () => {
	const { user } = await setupConnection()
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			timezone: 'UTC',
			disciplineProfiles: { create: [{ discipline: 'run', lthr: 160 }] },
		},
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: faker.lorem.words(3),
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date('2026-05-21T09:00:00.000Z'),
		},
	})
	server.use(
		http.get(ACTIVITIES_URL, () => HttpResponse.json([missedActivity()])),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	invariant(result.ok, 'expected a successful reconciliation')
	// The import auto-matched the planned run, and the sweep's load recompute
	// stamped HR-based TSS from the recording's own data (avg HR 150 vs LTHR
	// 160) — previously nothing recomputed after the sweep, so TSS stayed null.
	const imported = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId: user.id, externalId: 'i5001' },
		select: { promotedSessionId: true, tssValue: true, tssFormula: true },
	})
	expect(imported.promotedSessionId).not.toBeNull()
	expect(imported.tssFormula).toBe('hrTSS')
	expect(imported.tssValue).toBeGreaterThan(0)
})

test('a 401 flips the connection to revoked and reports it', async () => {
	const { user, connection } = await setupConnection({
		accessToken: 'stale_or_regenerated_key',
	})

	const result = await runIntervalsIcuReconciliation(user.id)

	expect(result).toEqual({ ok: false, reason: 'revoked' })
	const after = await prisma.accountConnection.findUnique({
		where: { id: connection.id },
	})
	expect(after!.status).toBe('revoked')
})

test('does not poll a connection that is no longer active', async () => {
	const { user } = await setupConnection({ status: 'revoked' })
	let fetched = false
	server.use(
		http.get(ACTIVITIES_URL, () => {
			fetched = true
			return HttpResponse.json([missedActivity()])
		}),
	)

	const result = await runIntervalsIcuReconciliation(user.id)

	expect(result).toEqual({ ok: false, reason: 'inactive' })
	expect(fetched).toBe(false)
	expect(
		await prisma.activityImport.count({ where: { athleteId: user.id } }),
	).toBe(0)
})
