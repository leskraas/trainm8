import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { jobHandlers } from './handlers.server.ts'
import { enqueueJob, processNextJob } from './queue.server.ts'

async function setupConnectedAthlete() {
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...createUser(),
			athleteProfile: { create: { timezone: 'UTC' } },
		},
	})
	await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'strava',
			externalAthleteId: '12345678',
			accessToken: 'initial_access',
			refreshToken: 'initial_refresh',
			expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
			status: 'active',
			connectedAt: new Date('2026-05-28T00:00:00.000Z'),
		},
	})
	return user
}

test('processing a strava-backfill job runs the backfill end-to-end', async () => {
	const user = await setupConnectedAthlete()
	const job = await enqueueJob({
		kind: 'strava-backfill',
		payload: { athleteId: user.id },
	})

	const result = await processNextJob(jobHandlers)

	expect(result).toBe('processed')
	const imports = await prisma.activityImport.count({
		where: { athleteId: user.id },
	})
	expect(imports).toBe(4)
	const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
	expect(row.status).toBe('completed')
})
