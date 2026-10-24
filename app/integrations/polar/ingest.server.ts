import {
	ingestFit,
	type IngestFitLegResult,
} from '#app/integrations/shared/ingest-fit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	POLAR_API_BASE,
	POLAR_FETCHED_VIA,
	POLAR_MAX_FIT_BYTES,
	POLAR_PROVIDER,
	PolarExerciseListSchema,
} from './types.ts'

/**
 * Polar exercises in, as FIT, through the shared FIT ingest (ADR 0105):
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

async function isHeld(athleteId: string, exerciseId: string) {
	const key = {
		athleteId,
		externalProvider: POLAR_PROVIDER,
		externalId: exerciseId,
	}
	const [imported, alias] = await Promise.all([
		prisma.activityImport.findUnique({
			where: { athleteId_externalProvider_externalId: key },
			select: { id: true },
		}),
		prisma.activityImportAlias.findUnique({
			where: { athleteId_externalProvider_externalId: key },
			select: { id: true },
		}),
	])
	return Boolean(imported ?? alias)
}

/** Fetch one exercise's FIT and file it. Idempotent on the exercise id. */
export async function ingestPolarExercise(
	athleteId: string,
	exerciseId: string,
): Promise<PolarExerciseResult> {
	const connection = await activeConnection(athleteId)
	if (!connection) return { status: 'not-connected' }
	// Skip the download for an exercise already held: Polar's limits count it.
	if (await isHeld(athleteId, exerciseId)) return { status: 'already-held' }

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
	const declared = Number(response.headers.get('content-length') ?? 0)
	if (declared > POLAR_MAX_FIT_BYTES) throw new PolarApiError(413)
	const bytes = new Uint8Array(await response.arrayBuffer())
	if (bytes.byteLength > POLAR_MAX_FIT_BYTES) throw new PolarApiError(413)

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
