import fsExtra from 'fs-extra'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { BASE_DATABASE_PATH } from './setup/global-setup.ts'

/**
 * For a `describe` whose tests all start from the same expensive seed: runs
 * `seed` once, snapshots the database file, and puts that snapshot back before
 * each test, so a test sees a seeded database without paying for the seed.
 *
 * Call it inside the `describe`: its hook runs after the setup file's, which
 * has already swapped in the empty base database. Tests that assert on the
 * seed's own result, or on re-seeding, belong outside it.
 */
export function seededDatabase(seed: () => Promise<unknown>) {
	const databasePath = process.env.DATABASE_URL!.replace(/^file:/, '')
	const snapshotPath = `${databasePath}.seeded`

	beforeAll(async () => {
		const { prisma } = await import('#app/utils/db.server.ts')
		await prisma.$disconnect()
		await fsExtra.copyFile(BASE_DATABASE_PATH, databasePath)
		await seed()
		await prisma.$disconnect()
		await fsExtra.copyFile(databasePath, snapshotPath)
	})

	beforeEach(async () => {
		const { prisma } = await import('#app/utils/db.server.ts')
		await prisma.$disconnect()
		await fsExtra.copyFile(snapshotPath, databasePath)
	})

	afterAll(async () => {
		await fsExtra.remove(snapshotPath)
	})
}
