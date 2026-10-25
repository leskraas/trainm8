import {
	ingestFit,
	type IngestFitLegResult,
} from '#app/integrations/shared/ingest-fit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { parseFit } from '#app/utils/fit-parser.server.ts'
import {
	POLAR_API_BASE,
	POLAR_FETCHED_VIA,
	POLAR_MAX_FIT_BYTES,
	POLAR_PROVIDER,
	POLAR_REQUEST_TIMEOUT_MS,
	PolarExerciseListSchema,
} from './types.ts'

/**
 * Polar exercises in, as FIT, through the shared FIT ingest (ADR 0108):
 * transport `polar`, Origin Platform `polar`, the exercise's hashed id as the
 * external id. Dedupe, aliases (ADR 0096 §4), the original bytes, laps and
 * auto-save all happen inside `ingestFit`.
 */

export type PolarExerciseResult =
	| { status: 'filed'; legs: IngestFitLegResult[] }
	| { status: 'already-held' }
	| { status: 'not-found' }
	| { status: 'not-connected' }
	| { status: 'revoked' }

export class PolarApiError extends Error {
	constructor(readonly status: number) {
		super(`Polar AccessLink answered ${status}`)
		this.name = 'PolarApiError'
	}
}

type Connection = { id: string; athleteId: string; accessToken: string }

async function activeConnection(athleteId: string) {
	const connection = await prisma.accountConnection.findUnique({
		where: { athleteId_provider: { athleteId, provider: POLAR_PROVIDER } },
		select: { id: true, athleteId: true, accessToken: true, status: true },
	})
	return connection?.status === 'active' ? connection : null
}

async function timezoneOf(athleteId: string) {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: athleteId },
		select: { timezone: true },
	})
	return profile?.timezone ?? 'UTC'
}

async function polarGet(connection: Connection, path: string, accept: string) {
	const response = await fetch(`${POLAR_API_BASE}${path}`, {
		headers: {
			authorization: `Bearer ${connection.accessToken}`,
			accept,
		},
		signal: AbortSignal.timeout(POLAR_REQUEST_TIMEOUT_MS),
	})
	if (response.status === 401 || response.status === 403) {
		// The athlete revoked the grant at Polar, or never accepted Polar's
		// mandatory consents: only a reconnect helps (ADR 0012: delete nothing).
		await prisma.accountConnection.update({
			where: { id: connection.id },
			data: { status: 'revoked' },
		})
		return 'revoked' as const
	}
	return response
}

/**
 * What trainm8 already holds of one Polar exercise. A multisport FIT files one
 * leg at a time (`<id>`, `<id>#2`, …), so a held first leg does not mean the
 * exercise is complete: a run cut off after it holds only some legs. The FIT
 * Polar sent is kept with each leg it created (or with the mirror it
 * refreshed), so the leg count and a resume come from those bytes, not from a
 * second download.
 */
async function heldExercise(
	athleteId: string,
	exerciseId: string,
): Promise<
	| { status: 'absent' }
	| { status: 'complete' }
	| { status: 'partial'; bytes: Uint8Array | null }
> {
	const keys = {
		athleteId,
		externalProvider: POLAR_PROVIDER,
		OR: [
			{ externalId: exerciseId },
			{ externalId: { startsWith: `${exerciseId}#` } },
		],
	}
	const [imports, aliases] = await Promise.all([
		prisma.activityImport.findMany({
			where: keys,
			select: { id: true, externalId: true },
		}),
		prisma.activityImportAlias.findMany({
			where: keys,
			select: { activityImportId: true, externalId: true },
		}),
	])
	const held = new Set([...imports, ...aliases].map((row) => row.externalId))
	if (held.size === 0) return { status: 'absent' }

	const kept = await prisma.activityFile.findFirst({
		where: {
			fetchedVia: POLAR_FETCHED_VIA,
			activityImportId: {
				in: [
					...imports.map((i) => i.id),
					...aliases.map((a) => a.activityImportId),
				],
			},
		},
		select: { bytes: true },
	})
	if (!kept) return { status: 'partial', bytes: null }
	const bytes = new Uint8Array(kept.bytes)
	const legs = parseFit(bytes).sessions.length
	const complete = Array.from({ length: legs }, (_, i) =>
		i === 0 ? exerciseId : `${exerciseId}#${i + 1}`,
	).every((key) => held.has(key))
	return complete ? { status: 'complete' } : { status: 'partial', bytes }
}

/**
 * The response body, read chunk by chunk and dropped as soon as it is known to
 * pass the cap: from `Content-Length` before a byte is read, or from the
 * running total for a body without one. Never buffers more than the cap.
 */
async function readCappedBody(response: Response, cap: number) {
	const declared = Number(response.headers.get('content-length') ?? 0)
	if (declared > cap) {
		void response.body?.cancel().catch(() => {})
		throw new PolarApiError(413)
	}
	if (!response.body) return new Uint8Array()
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	for (;;) {
		const { done, value } = await reader.read()
		if (done) break
		total += value.byteLength
		if (total > cap) {
			void reader.cancel().catch(() => {})
			throw new PolarApiError(413)
		}
		chunks.push(value)
	}
	const bytes = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return bytes
}

/**
 * Fetch one exercise's FIT and file it. Idempotent on the exercise id: a
 * complete exercise is never downloaded again (Polar's limits count it), and
 * one cut off part way is completed — from the kept FIT when there is one.
 */
export async function ingestPolarExercise(
	athleteId: string,
	exerciseId: string,
): Promise<PolarExerciseResult> {
	const connection = await activeConnection(athleteId)
	if (!connection) return { status: 'not-connected' }
	const held = await heldExercise(athleteId, exerciseId)
	if (held.status === 'complete') return { status: 'already-held' }

	let bytes = held.status === 'partial' ? held.bytes : null
	if (!bytes) {
		const response = await polarGet(
			connection,
			`/exercises/${encodeURIComponent(exerciseId)}/fit`,
			'*/*',
		)
		if (response === 'revoked') return { status: 'revoked' }
		if (response.status === 404 || response.status === 204) {
			return { status: 'not-found' }
		}
		if (!response.ok) throw new PolarApiError(response.status)
		bytes = await readCappedBody(response, POLAR_MAX_FIT_BYTES)
	}

	// Legs already held come back as transport-key duplicates; only the
	// missing ones are filed.
	const legs = await ingestFit(athleteId, bytes, {
		externalProvider: POLAR_PROVIDER,
		externalId: exerciseId,
		originPlatform: 'polar',
		fetchedVia: POLAR_FETCHED_VIA,
		timezone: await timezoneOf(athleteId),
	})
	return { status: 'filed', legs }
}

export type PolarSyncResult =
	| { ok: true; created: number }
	| { ok: false; reason: 'not-connected' | 'revoked' }

/**
 * Pull every exercise Polar still lists (its last 30 days) and file the ones
 * trainm8 does not hold. The webhook's safety net and the first backfill.
 */
export async function syncPolarExercises(
	athleteId: string,
	{ now = new Date() }: { now?: Date } = {},
): Promise<PolarSyncResult> {
	const connection = await activeConnection(athleteId)
	if (!connection) return { ok: false, reason: 'not-connected' }
	const response = await polarGet(connection, '/exercises', 'application/json')
	if (response === 'revoked') return { ok: false, reason: 'revoked' }
	if (!response.ok) throw new PolarApiError(response.status)
	const exercises = PolarExerciseListSchema.parse(await response.json())

	let created = 0
	for (const { id } of exercises) {
		const result = await ingestPolarExercise(athleteId, id)
		if (result.status === 'revoked') return { ok: false, reason: 'revoked' }
		if (result.status === 'filed') {
			created += result.legs.filter((l) => l.status === 'imported').length
		}
	}
	await prisma.accountConnection.update({
		where: { id: connection.id },
		data: { lastCheckedAt: now },
	})
	return { ok: true, created }
}
