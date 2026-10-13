import { expect, test } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { connectAccountConnection } from './account-connection.server.ts'
import {
	CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND,
	CREDENTIAL_ENCRYPTION_BACKFILL_DELAY_MS,
	encryptPlaintextCredentials,
	ensureCredentialEncryptionBackfillEnqueued,
} from './credential-backfill.server.ts'
import { prisma } from './db.server.ts'
import { jobHandlers } from './jobs/handlers.server.ts'

async function createAthlete() {
	return prisma.user.create({ select: { id: true }, data: createUser() })
}

/** A row as it was stored before #548: tokens in plaintext. */
async function insertLegacyConnection(
	athleteId: string,
	provider: string,
	accessToken: string,
	refreshToken: string | null,
) {
	const id = `legacy-${provider}-${athleteId}`
	await prisma.$executeRaw`
		INSERT INTO AccountConnection (id, provider, externalAthleteId, accessToken, refreshToken, status, connectedAt, createdAt, updatedAt, athleteId)
		VALUES (${id}, ${provider}, 'ext', ${accessToken}, ${refreshToken}, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${athleteId})`
	return id
}

async function storedTokens(id: string) {
	const rows = await prisma.$queryRaw<
		Array<{ accessToken: string; refreshToken: string | null }>
	>`SELECT accessToken, refreshToken FROM AccountConnection WHERE id = ${id}`
	return rows[0]!
}

test('existing plaintext tokens become unreadable in the database and still read back', async () => {
	const athlete = await createAthlete()
	const strava = await insertLegacyConnection(
		athlete.id,
		'strava',
		'legacy-access',
		'legacy-refresh',
	)
	const intervals = await insertLegacyConnection(
		athlete.id,
		'intervalsicu',
		'legacy-api-key',
		null,
	)

	const result = await encryptPlaintextCredentials()

	expect(result).toEqual({ encrypted: 3 })
	const stravaStored = await storedTokens(strava)
	expect(stravaStored.accessToken).toMatch(/^enc:v1:/)
	expect(stravaStored.refreshToken).toMatch(/^enc:v1:/)
	expect(await storedTokens(intervals)).toMatchObject({
		accessToken: expect.stringMatching(/^enc:v1:/),
		refreshToken: null,
	})
	const read = await prisma.accountConnection.findUniqueOrThrow({
		where: { id: strava },
	})
	expect(read).toMatchObject({
		accessToken: 'legacy-access',
		refreshToken: 'legacy-refresh',
	})
	expect(
		(
			await prisma.accountConnection.findUniqueOrThrow({
				where: { id: intervals },
			})
		).accessToken,
	).toBe('legacy-api-key')
})

test('the backfill is idempotent and leaves encrypted rows alone', async () => {
	const athlete = await createAthlete()
	const fresh = await connectAccountConnection({
		athleteId: athlete.id,
		provider: 'strava',
		externalAthleteId: '1',
		accessToken: 'new-access',
		refreshToken: 'new-refresh',
		expiresAt: null,
	})
	const before = await storedTokens(fresh.id)
	await insertLegacyConnection(athlete.id, 'intervalsicu', 'k', null)

	expect(await encryptPlaintextCredentials()).toEqual({ encrypted: 1 })
	expect(await encryptPlaintextCredentials()).toEqual({ encrypted: 0 })
	expect(await storedTokens(fresh.id)).toEqual(before)
})

test('the backfill is enqueued once, delayed past the deploy window', async () => {
	const now = new Date('2026-10-13T12:00:00Z')
	await ensureCredentialEncryptionBackfillEnqueued(now)
	await ensureCredentialEncryptionBackfillEnqueued(now)

	const jobs = await prisma.job.findMany({
		where: { kind: CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND },
	})
	expect(jobs).toHaveLength(1)
	expect(jobs[0]!.runAt.getTime()).toBe(
		now.getTime() + CREDENTIAL_ENCRYPTION_BACKFILL_DELAY_MS,
	)
})

test('the job worker knows how to run the backfill', async () => {
	const athlete = await createAthlete()
	const id = await insertLegacyConnection(athlete.id, 'strava', 'a', 'r')

	await jobHandlers[CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND]!({})

	expect((await storedTokens(id)).accessToken).toMatch(/^enc:v1:/)
})
