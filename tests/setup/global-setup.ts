import path from 'node:path'
import { execaCommand } from 'execa'
import fsExtra from 'fs-extra'
import 'dotenv/config'
import '#app/utils/env.server.ts'

export const BASE_DATABASE_PATH = path.join(
	process.cwd(),
	`./tests/prisma/base.db`,
)

export async function setup() {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)

	if (databaseExists) {
		const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
			.mtime
		const prismaSchemaLastModifiedAt = (
			await fsExtra.stat('./prisma/schema.prisma')
		).mtime

		if (prismaSchemaLastModifiedAt < databaseLastModifiedAt) {
			return
		}
	}

	// Built beside the base database and renamed over it, never reset in place.
	// Another run in this checkout (parallel runs, or one already going when a
	// merge or checkout moved the schema's mtime) copies the base database before
	// every test; resetting it in place drops every table first, so that run's
	// tests fail with "The table `main.User` does not exist" for as long as the
	// migrations take. A rename is atomic: a copy reads the old file or the new
	// one, whole.
	const buildPath = `${BASE_DATABASE_PATH}.${process.pid}.tmp`
	await removeDatabaseFiles(buildPath)
	try {
		await execaCommand(
			'npx prisma migrate reset --force --skip-seed --skip-generate',
			{
				stdio: 'inherit',
				env: {
					...process.env,
					DATABASE_URL: `file:${buildPath}`,
					// allow AI agents to reset the database while running tests
					PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'true',
				},
			},
		)
		await fsExtra.rename(buildPath, BASE_DATABASE_PATH)
	} finally {
		await removeDatabaseFiles(buildPath)
	}
}

async function removeDatabaseFiles(databasePath: string) {
	await Promise.all(
		['', '-journal', '-wal', '-shm'].map((suffix) =>
			fsExtra.remove(`${databasePath}${suffix}`),
		),
	)
}
