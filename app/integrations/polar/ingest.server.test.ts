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
import {
	ingestPolarExercise,
	PolarApiError,
	syncPolarExercises,
} from './ingest.server.ts'
import { POLAR_MAX_FIT_BYTES } from './types.ts'

const FIT_URL = 'https://www.polaraccesslink.com/v3/exercises/:id/fit'

function fixture(name: string) {
	return fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/fit', name))
}

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

test('a FIT over the cap with no Content-Length is refused while it streams, not after', async () => {
	const { athleteId } = await setup()
	const chunk = new Uint8Array(1024 * 1024)
	const total = POLAR_MAX_FIT_BYTES + 16 * chunk.byteLength
	let sent = 0
	server.use(
		http.get(
			FIT_URL,
			() =>
				new HttpResponse(
					new ReadableStream<Uint8Array>({
						pull(controller) {
							if (sent >= total) return controller.close()
							sent += chunk.byteLength
							controller.enqueue(chunk)
						},
					}),
				),
		),
	)

	const result = ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID)

	await expect(result).rejects.toEqual(new PolarApiError(413))
	// The read stopped near the cap instead of draining the whole body.
	expect(sent).toBeLessThan(total)
	expect(await prisma.activityImport.count({ where: { athleteId } })).toBe(0)
})

test('a FIT whose Content-Length is over the cap is refused before its body is read', async () => {
	const { athleteId } = await setup()
	let sent = 0
	server.use(
		http.get(
			FIT_URL,
			() =>
				new HttpResponse(
					new ReadableStream<Uint8Array>({
						pull(controller) {
							if (sent >= 2 * POLAR_MAX_FIT_BYTES) return controller.close()
							sent += 1024 * 1024
							controller.enqueue(new Uint8Array(1024 * 1024))
						},
					}),
					{ headers: { 'content-length': String(POLAR_MAX_FIT_BYTES + 1) } },
				),
		),
	)

	await expect(
		ingestPolarExercise(athleteId, MOCK_POLAR_EXERCISE_ID),
	).rejects.toEqual(new PolarApiError(413))
	expect(sent).toBeLessThan(POLAR_MAX_FIT_BYTES)
})

test('a multisport exercise cut off after its first leg is completed from the kept FIT, without a second download', async () => {
	const { athleteId } = await setup()
	server.use(
		http.get(FIT_URL, () => new HttpResponse(fixture('triathlon.fit'))),
	)
	const first = await ingestPolarExercise(athleteId, 'tri')
	expect(first).toMatchObject({ status: 'filed' })
	// What a crash after the first leg leaves behind: the swim held, the
	// bike and the run not.
	await prisma.activityImport.deleteMany({
		where: { athleteId, externalId: { startsWith: 'tri#' } },
	})
	let downloads = 0
	server.use(
		http.get(FIT_URL, () => {
			downloads++
			return new HttpResponse(null, { status: 500 })
		}),
	)

	const retried = await ingestPolarExercise(athleteId, 'tri')

	expect(retried).toMatchObject({
		status: 'filed',
		legs: [
			{ status: 'duplicate', matchedBy: 'transport-key' },
			{ status: 'imported' },
			{ status: 'imported' },
		],
	})
	expect(downloads).toBe(0)
	expect(
		(
			await prisma.activityImport.findMany({
				where: { athleteId, externalProvider: 'polar' },
				select: { externalId: true },
				orderBy: { externalId: 'asc' },
			})
		).map((i) => i.externalId),
	).toEqual(['tri', 'tri#2', 'tri#3'])
	expect(await ingestPolarExercise(athleteId, 'tri')).toEqual({
		status: 'already-held',
	})
	expect(downloads).toBe(0)
})

test('an exercise cut off before its FIT was kept is downloaded again and completed', async () => {
	const { athleteId } = await setup()
	server.use(
		http.get(FIT_URL, () => new HttpResponse(fixture('triathlon.fit'))),
	)
	await ingestPolarExercise(athleteId, 'tri')
	await prisma.activityImport.deleteMany({
		where: { athleteId, externalId: { startsWith: 'tri#' } },
	})
	await prisma.activityFile.deleteMany({
		where: { activityImport: { athleteId } },
	})

	const retried = await ingestPolarExercise(athleteId, 'tri')

	expect(retried).toMatchObject({ status: 'filed' })
	expect(
		await prisma.activityImport.count({
			where: { athleteId, externalProvider: 'polar' },
		}),
	).toBe(3)
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
