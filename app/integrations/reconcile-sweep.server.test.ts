import { expect, test } from 'vitest'
import { INTERVALSICU_RECONCILE_JOB_KIND } from '#app/integrations/intervalsicu/reconcile.server.ts'
import { STRAVA_RECONCILE_JOB_KIND } from '#app/integrations/strava/reconcile.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { enqueueReconciliationJobs } from './reconcile-sweep.server.ts'

async function createConnection(provider: string, status = 'active') {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider,
			externalAthleteId: provider === 'strava' ? '12345678' : 'i9876543',
			accessToken: 'tok',
			refreshToken: provider === 'strava' ? 'ref' : null,
			expiresAt:
				provider === 'strava'
					? new Date(Date.now() + 6 * 60 * 60 * 1000)
					: null,
			status,
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	return user
}

test('dispatches each active connection to its own provider job kind', async () => {
	const stravaAthlete = await createConnection('strava')
	const icuAthlete = await createConnection('intervalsicu')

	const result = await enqueueReconciliationJobs()

	expect(result.enqueued).toBe(2)

	const stravaJobs = await prisma.job.findMany({
		where: { kind: STRAVA_RECONCILE_JOB_KIND },
	})
	expect(stravaJobs).toHaveLength(1)
	expect(JSON.parse(stravaJobs[0]!.payload)).toEqual({
		athleteId: stravaAthlete.id,
	})

	const icuJobs = await prisma.job.findMany({
		where: { kind: INTERVALSICU_RECONCILE_JOB_KIND },
	})
	expect(icuJobs).toHaveLength(1)
	expect(JSON.parse(icuJobs[0]!.payload)).toEqual({ athleteId: icuAthlete.id })
})

test('skips non-active connections across every provider', async () => {
	await createConnection('strava', 'revoked')
	await createConnection('strava', 'expired')
	await createConnection('intervalsicu', 'revoked')
	await createConnection('intervalsicu', 'error')

	const result = await enqueueReconciliationJobs()

	expect(result.enqueued).toBe(0)
	expect(await prisma.job.count()).toBe(0)
})

test('an athlete with both providers active gets one job per provider', async () => {
	const user = await prisma.user.create({
		data: { ...createUser() },
		select: { id: true },
	})
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'tok',
			refreshToken: 'ref',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: 'i9876543',
			accessToken: 'key',
			status: 'active',
			connectedAt: new Date('2026-05-01T00:00:00.000Z'),
		},
	})

	const result = await enqueueReconciliationJobs()

	expect(result.enqueued).toBe(2)
	const kinds = (await prisma.job.findMany()).map((j) => j.kind).sort()
	expect(kinds).toEqual(
		[INTERVALSICU_RECONCILE_JOB_KIND, STRAVA_RECONCILE_JOB_KIND].sort(),
	)
})
