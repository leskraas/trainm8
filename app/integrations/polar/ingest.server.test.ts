import fs from 'node:fs'
import path from 'node:path'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import { ingestFit } from '#app/integrations/shared/ingest-fit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recordingSource } from '#app/utils/source-attribution.ts'
import { createUser } from '#tests/db-utils.ts'
import { server } from '#tests/mocks/index.ts'
import { MOCK_POLAR_EXERCISE_ID } from '#tests/mocks/polar.ts'
import { ingestPolarExercise, syncPolarExercises } from './ingest.server.ts'

async function setup({ status = 'active' } = {}) {
	const user = await prisma.user.create({
		select: { id: true },
		data: { ...createUser(), athleteProfile: { create: { timezone: 'UTC' } } },
	})
	const connection = await prisma.accountConnection.create({
		data: {
			athleteId: user.id,
			provider: 'polar',
			externalAthleteId: '475',
			accessToken: 'mock_polar_access_token',
			status,
		},
	})
	return { athleteId: user.id, connectionId: connection.id }
}

test('a Polar exercise is filed from its FIT with Polar as its origin and credit', async () => {
	const { athleteId } = await setup()

	const result = await ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID)

	expect(result.status).toBe('filed')
	const imp = await prisma.activityImport.findFirstOrThrow({
		where: { athleteId },
		select: {
			externalProvider: true,
			externalId: true,
			originPlatform: true,
			deviceName: true,
			fitFileKey: true,
			promotedSessionId: true,
			originalFile: { select: { fetchedVia: true } },
		},
	})
	expect(imp).toMatchObject({
		externalProvider: 'polar',
		externalId: MOCK_POLAR_EXERCISE_ID,
		originPlatform: 'polar',
		originalFile: { fetchedVia: 'polar-accesslink' },
	})
	expect(imp.fitFileKey).toMatch(/^fit:/)
	expect(imp.promotedSessionId).not.toBeNull()
	// "Source: Polar" by the Recording's title (ADR 0098 §3).
	expect(
		recordingSource({ originPlatform: 'polar', deviceName: null }),
	).toEqual({ text: 'Polar', owed: true })
})

test('the same exercise again is not downloaded twice', async () => {
	const { athleteId } = await setup()
	await ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID)
	let downloads = 0
	server.use(
		http.get('https://www.polaraccesslink.com/v3/exercises/:id/fit', () => {
			downloads++
			return new HttpResponse(null, { status: 500 })
		}),
	)

	expect(await ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID)).toEqual({
		status: 'already-held',
	})
	expect(downloads).toBe(0)
})

test('an exercise the athlete already uploaded becomes an alias, not a second session (ADR 0096)', async () => {
	const { athleteId } = await setup()
	const bytes = new Uint8Array(
		fs.readFileSync(
			path.join(process.cwd(), 'tests/fixtures/fit/run-with-laps.fit'),
		),
	)
	await ingestFit(athleteId, bytes, {
		externalProvider: 'manual',
		fetchedVia: 'upload',
		timezone: 'UTC',
	})

	const result = await ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID)

	expect(result).toMatchObject({
		status: 'filed',
		legs: [{ status: 'duplicate', matchedBy: 'fit-file-key' }],
	})
	expect(await prisma.activityImport.count({ where: { athleteId } })).toBe(1)
	expect(
		await prisma.activityImportAlias.findFirst({
			where: { athleteId },
			select: { externalProvider: true, originPlatform: true },
		}),
	).toEqual({ externalProvider: 'polar', originPlatform: 'polar' })
})

test('a token Polar no longer accepts revokes the connection and files nothing', async () => {
	const { athleteId, connectionId } = await setup()
	server.use(
		http.get('https://www.polaraccesslink.com/v3/exercises', () =>
			HttpResponse.json({}, { status: 401 }),
		),
	)

	expect(await syncPolarExercises(athleteId)).toEqual({
		ok: false,
		reason: 'revoked',
	})
	expect(
		(
			await prisma.accountConnection.findUniqueOrThrow({
				where: { id: connectionId },
			})
		).status,
	).toBe('revoked')
	expect(await prisma.activityImport.count({ where: { athleteId } })).toBe(0)
})

test('the sync files what Polar lists and skips an exercise Polar no longer has', async () => {
	const { athleteId } = await setup()
	server.use(
		http.get('https://www.polaraccesslink.com/v3/exercises', () =>
			HttpResponse.json([{ id: MOCK_POLAR_EXERCISE_ID }, { id: 'gone' }]),
		),
	)

	expect(await syncPolarExercises(athleteId)).toEqual({ ok: true, created: 1 })
})

test('no connection, nothing fetched', async () => {
	const { athleteId } = await setup({ status: 'revoked' })
	expect(await syncPolarExercises(athleteId)).toEqual({
		ok: false,
		reason: 'not-connected',
	})
})
