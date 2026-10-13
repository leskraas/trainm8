import { isEncryptedCredential } from './credential-crypto.server.ts'
import { prisma } from './db.server.ts'
import { enqueueJob } from './jobs/queue.server.ts'

/**
 * One-shot encryption of the Account Connection tokens stored before #548.
 *
 * **Why a job and not a SQL migration.** House rule is that data backfills ship
 * as SQL inside a migration (`docs/agents/production-seed-data.md`), but SQLite
 * cannot run AES-GCM and the key must never be written into a migration file.
 * So this follows the boot-time "enqueue once, the job row is the marker"
 * pattern of the other one-shot heals in `server/index.ts`.
 *
 * **Why delayed.** The job's `runAt` is {@link CREDENTIAL_ENCRYPTION_BACKFILL_DELAY_MS}
 * after the first boot of this release. A release that encrypts rows and is
 * then rolled back would leave the previous code sending ciphertext to the
 * provider, so the rows stay plaintext until the deploy has settled. Until
 * then they read through unchanged (`decryptCredential` passes a value
 * without the `enc:v1:` prefix through).
 *
 * **Without the key.** Production refuses to boot without
 * `CREDENTIALS_ENCRYPTION_KEY` (`env.server.ts`), before this is ever enqueued:
 * the release fails its health check, Fly keeps the previous machines, and no
 * row is touched.
 */
export const CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND =
	'credential-encryption-backfill'

export const CREDENTIAL_ENCRYPTION_BACKFILL_DELAY_MS = 30 * 60 * 1000

export async function ensureCredentialEncryptionBackfillEnqueued(
	now: Date = new Date(),
): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({
		kind: CREDENTIAL_ENCRYPTION_BACKFILL_JOB_KIND,
		runAt: new Date(now.getTime() + CREDENTIAL_ENCRYPTION_BACKFILL_DELAY_MS),
	})
}

const COLUMNS = ['accessToken', 'refreshToken'] as const

/**
 * Encrypt every token still stored in plaintext. Idempotent: an encrypted
 * value is skipped. Each write is guarded on the plaintext it read, so a token
 * rotated concurrently by a sync is never overwritten with a stale one. Returns
 * how many column values it encrypted.
 */
export async function encryptPlaintextCredentials(): Promise<{
	encrypted: number
}> {
	// Raw SQL: the client decrypts on read, so only the stored value tells
	// plaintext from ciphertext.
	const rows = await prisma.$queryRaw<
		Array<{ id: string; accessToken: string; refreshToken: string | null }>
	>`SELECT id, accessToken, refreshToken FROM AccountConnection`

	let encrypted = 0
	for (const row of rows) {
		for (const column of COLUMNS) {
			const value = row[column]
			if (value == null || isEncryptedCredential(value)) continue
			// The client's credential extension encrypts `data`; `where` matches
			// the stored plaintext as-is.
			const { count } = await prisma.accountConnection.updateMany({
				where: { id: row.id, [column]: value },
				data: { [column]: value },
			})
			encrypted += count
		}
	}
	return { encrypted }
}
