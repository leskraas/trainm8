import { expect, test, vi } from 'vitest'
import { createUser } from '#tests/db-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { prisma } from './db.server.ts'

async function connection(accessToken: string) {
	const user = await prisma.user.create({
		select: { id: true },
		data: createUser(),
	})
	return prisma.accountConnection.create({
		select: { id: true },
		data: {
			athleteId: user.id,
			provider: 'intervalsicu',
			externalAthleteId: `i${user.id}`,
			accessToken,
			refreshToken: 'refresh-secret',
		},
	})
}

test('one undecryptable connection does not stop the others from being read', async () => {
	consoleError.mockImplementation(() => {})
	const good = await connection('good-api-key')
	const bad = await connection('bad-api-key')
	// Encrypted under a key this deployment does not hold (or tampered with).
	const unreadable = 'enc:v1:AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA.AAAA'
	await prisma.$executeRaw`UPDATE AccountConnection SET accessToken = ${unreadable} WHERE id = ${bad.id}`

	const rows = await prisma.accountConnection.findMany({
		where: { id: { in: [good.id, bad.id] } },
	})

	expect(rows.find((r) => r.id === good.id)).toMatchObject({
		accessToken: 'good-api-key',
		refreshToken: 'refresh-secret',
		status: 'active',
	})
	// The unreadable one reads as needing a reconnect, with no token at all.
	expect(rows.find((r) => r.id === bad.id)).toMatchObject({
		accessToken: '',
		refreshToken: null,
		status: 'error',
	})
	// ... and is marked so, so the sync sweep stops picking it.
	await vi.waitFor(async () => {
		const [row] = await prisma.$queryRaw<
			Array<{ status: string }>
		>`SELECT status FROM AccountConnection WHERE id = ${bad.id}`
		expect(row?.status).toBe('error')
	})
	// Said once, naming the row and never its secrets.
	const logged = JSON.stringify(consoleError.mock.calls)
	expect(logged).toContain(bad.id)
	expect(logged).not.toContain(unreadable)
	expect(logged).not.toContain('refresh-secret')
})
