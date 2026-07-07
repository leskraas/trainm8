import { invariant } from '@epic-web/invariant'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { RECONCILE_OVERLAP_MS } from '#app/integrations/reconcile-sweep.server.ts'
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
	expect(oldest).toBe(
		new Date(lastSyncedAt.getTime() - RECONCILE_OVERLAP_MS).toISOString(),
	)

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
