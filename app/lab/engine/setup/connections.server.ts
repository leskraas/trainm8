/**
 * Where sessions come from: the sources the athlete can connect, their state,
 * connecting intervals.icu, disconnecting, syncing, uploading files and how
 * far the import has got. Each source's own code does the work; this only
 * names the states in product terms.
 */
import {
	FormDataParseError,
	MaxFilesExceededError,
	MultipartParseError,
	parseFormData,
} from '@mjackson/form-data-parser'
import { linkIntervalsIcu } from '#app/integrations/intervalsicu/link.server.ts'
import { syncIntervalsIcuActivities } from '#app/integrations/intervalsicu/sync.server.ts'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { syncStravaActivities } from '#app/integrations/strava/sync.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import { type SyncResult } from '#app/integrations/sync-summary.server.ts'
import {
	connectionHubStatus,
	disconnectAccountConnection,
	getAccountConnection,
} from '#app/utils/account-connection.server.ts'
import {
	ingestActivityFile,
	ingestUploadedFiles,
	UPLOAD_LIMITS,
	type UploadedArtifact,
} from '#app/utils/activity-file-ingest.server.ts'
import { type ConnectionHubStatus } from '#app/utils/connection-hub-status.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	PROVIDER_DIRECTORY_LABELS,
	uploadFailureLabel,
} from '#app/utils/labels.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import {
	type Source,
	type SourceId,
	type SourceState,
	type SyncOutput,
	type UploadOutput,
} from '../setup.types.ts'

const STATE: Record<ConnectionHubStatus, SourceState> = {
	disconnected: 'not-connected',
	connected: 'connected',
	backfilling: 'importing-history',
	revoked: 'needs-reconnect',
}

type ConnectionRow = Awaited<ReturnType<typeof getAccountConnection>>

function lastChecked(row: ConnectionRow): string | null {
	return (row?.lastCheckedAt ?? row?.lastSyncedAt)?.toISOString() ?? null
}

function intervalsSource(row: ConnectionRow, now: Date): Source {
	const state = STATE[connectionHubStatus(row, now)]
	return {
		id: 'intervalsicu',
		name: PROVIDER_DIRECTORY_LABELS.intervalsicu.name,
		description:
			'Henter øktene fra intervals.icu-kontoen din, der klokka di synker til. Du kobler til med din personlige API-nøkkel fra intervals.icu (Settings → Developer Settings).',
		how: 'api-key',
		availability: 'available',
		state,
		lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
		canSync: state === 'connected' || state === 'importing-history',
		canDisconnect: state !== 'not-connected',
		why: null,
	}
}

function stravaSource(row: ConnectionRow, now: Date): Source {
	const state = STATE[connectionHubStatus(row, now)]
	return {
		id: 'strava',
		name: PROVIDER_DIRECTORY_LABELS.strava.name,
		description: PROVIDER_DIRECTORY_LABELS.strava.tagline,
		how: 'oauth',
		availability: 'not-available',
		state,
		lastCheckedAt: lastChecked(row),
		canSync: state === 'connected' || state === 'importing-history',
		canDisconnect: state !== 'not-connected',
		why: 'Nye koblinger til Strava tilbys ikke. En kobling du har fra før, kan synkroniseres og kobles fra.',
	}
}

function fixedSources(): Source[] {
	const unavailable = (
		id: SourceId,
		name: string,
		description: string,
		availability: Source['availability'],
		why: string,
	): Source => ({
		id,
		name,
		description,
		how: 'oauth',
		availability,
		state: 'not-connected',
		lastCheckedAt: null,
		canSync: false,
		canDisconnect: false,
		why,
	})
	return [
		unavailable(
			'polar',
			'Polar Flow',
			'Henter øktene rett fra Polar.',
			'not-available',
			'Polar kan ikke kobles til herfra ennå. Til da kan du koble Polar til intervals.icu, eller laste opp filene fra klokka.',
		),
		unavailable(
			'garmin',
			PROVIDER_DIRECTORY_LABELS.garmin.name,
			PROVIDER_DIRECTORY_LABELS.garmin.tagline,
			'coming-soon',
			PROVIDER_DIRECTORY_LABELS.garmin.tagline,
		),
		unavailable(
			'suunto',
			PROVIDER_DIRECTORY_LABELS.suunto.name,
			PROVIDER_DIRECTORY_LABELS.suunto.tagline,
			'coming-soon',
			PROVIDER_DIRECTORY_LABELS.suunto.tagline,
		),
	]
}

const FILE_SOURCE: Source = {
	id: 'file',
	name: PROVIDER_DIRECTORY_LABELS['file-upload'].name,
	description:
		'Last opp .fit, .fit.gz, .tcx, .gpx, eller en hel .zip (også Strava-eksporten din). Hver økt havner på sin dag.',
	how: 'file',
	availability: 'available',
	state: 'connected',
	lastCheckedAt: null,
	canSync: false,
	canDisconnect: false,
	why: null,
}

export async function readSources(userId: string, now: Date) {
	const [intervals, strava] = await Promise.all([
		getAccountConnection(userId, INTERVALSICU_PROVIDER),
		getAccountConnection(userId, STRAVA_PROVIDER),
	])
	const sources: Source[] = [intervalsSource(intervals, now)]
	// Strava is never offered; a link made before keeps its place.
	if (strava) sources.push(stravaSource(strava, now))
	sources.push(...fixedSources(), FILE_SOURCE)
	return {
		sources,
		duplicateRisk:
			intervals?.status === 'active' && strava?.status === 'active'
				? 'Med to kilder kan samme økt en sjelden gang komme inn to ganger.'
				: null,
	}
}

export async function readSource(
	userId: string,
	id: 'intervalsicu' | 'strava',
	now: Date,
): Promise<Source> {
	const row = await getAccountConnection(
		userId,
		id === 'intervalsicu' ? INTERVALSICU_PROVIDER : STRAVA_PROVIDER,
	)
	return id === 'intervalsicu'
		? intervalsSource(row, now)
		: stravaSource(row, now)
}

export const CONNECT_REFUSALS = {
	'empty-key': 'Lim inn API-nøkkelen fra intervals.icu for å koble til.',
	'key-rejected':
		'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke. Kopier den som gjelder nå fra Settings → Developer Settings.',
	unreachable:
		'Fikk ikke kontakt med intervals.icu for å sjekke nøkkelen. Prøv igjen om litt.',
} as const

export { linkIntervalsIcu }

export async function disconnect(
	userId: string,
	id: 'intervalsicu' | 'strava',
) {
	await disconnectAccountConnection({
		athleteId: userId,
		provider: id === 'intervalsicu' ? INTERVALSICU_PROVIDER : STRAVA_PROVIDER,
	})
}

const SYNCS: Array<{
	id: 'intervalsicu' | 'strava'
	provider: string
	run: (athleteId: string) => Promise<SyncResult>
}> = [
	{
		id: 'intervalsicu',
		provider: INTERVALSICU_PROVIDER,
		run: (athleteId) => syncIntervalsIcuActivities(athleteId),
	},
	{ id: 'strava', provider: STRAVA_PROVIDER, run: syncStravaActivities },
]

const SYNC_FAILURES: Record<string, string> = {
	'not-connected': 'Ikke koblet til.',
	revoked: 'Tilgangen er trukket tilbake. Koble til på nytt.',
	unavailable: 'Kilden svarer ikke akkurat nå. Prøv igjen om litt.',
	'insufficient-scope': 'Tilgangen er for smal. Koble til på nytt.',
	'app-inactive': 'Koblingen er ikke aktiv. Koble til på nytt.',
	'rate-limited': 'For mange forespørsler. Prøv igjen senere.',
}

/**
 * Ask every active source (or the one named) for new sessions. Null when
 * there is nothing to ask.
 */
export async function syncSources(
	userId: string,
	only?: 'intervalsicu' | 'strava',
): Promise<SyncOutput | null> {
	const active = await prisma.accountConnection.findMany({
		where: { athleteId: userId, status: 'active' },
		select: { provider: true },
	})
	const providers = new Set(active.map((row) => row.provider))
	const syncs = SYNCS.filter(
		(sync) => providers.has(sync.provider) && (!only || sync.id === only),
	)
	if (syncs.length === 0) return null
	const out: SyncOutput = { imported: 0, failed: [], retryAt: null }
	for (const sync of syncs) {
		const result = await sync.run(userId)
		if (result.ok) {
			out.imported += result.created
			continue
		}
		out.failed.push({
			source: sync.id,
			message: SYNC_FAILURES[result.reason] ?? 'Synkroniseringen feilet.',
		})
		if (result.reason === 'rate-limited') {
			const at = result.retryAt.toISOString()
			if (out.retryAt == null || at < out.retryAt) out.retryAt = at
		}
	}
	return out
}

export type UploadRefusal = { code: string; message: string }

/** The upload, read from the multipart request as the upload page reads it. */
export async function uploadFiles(
	userId: string,
	request: Request,
	timezone: string,
): Promise<
	{ ok: true; value: UploadOutput } | { ok: false; refusal: UploadRefusal }
> {
	const type = request.headers.get('content-type') ?? ''
	if (!type.includes('multipart/form-data')) {
		return {
			ok: false,
			refusal: {
				code: 'no-file',
				message: 'Send filene som multipart/form-data, i feltet «file».',
			},
		}
	}
	const artifacts: UploadedArtifact[] = []
	let form: FormData
	try {
		form = await parseFormData(
			request,
			{
				maxFileSize: UPLOAD_LIMITS.maxFileSize,
				maxFiles: UPLOAD_LIMITS.maxFiles,
			},
			async (field) => {
				if (field.fieldName !== 'file') return
				const bytes = await field.bytes()
				const unnamed = !field.name || field.name === 'file-upload'
				if (unnamed && bytes.byteLength === 0) return
				artifacts.push({ fileName: field.name ?? 'upload', bytes })
			},
		)
	} catch (error) {
		if (error instanceof MaxFilesExceededError) {
			return {
				ok: false,
				refusal: {
					code: 'too-many-files',
					message: `Last opp høyst ${UPLOAD_LIMITS.maxFiles} filer om gangen.`,
				},
			}
		}
		if (
			error instanceof FormDataParseError ||
			error instanceof MultipartParseError
		) {
			return {
				ok: false,
				refusal: { code: 'too-large', message: 'Fila er for stor.' },
			}
		}
		throw error
	}
	if (artifacts.length === 0) {
		return {
			ok: false,
			refusal: { code: 'no-file', message: 'Velg minst én fil.' },
		}
	}
	const rawSport = form.get('sport')
	const sport =
		typeof rawSport === 'string' &&
		(DISCIPLINES as readonly string[]).includes(rawSport)
			? rawSport
			: undefined
	const isBatch =
		artifacts.length > 1 ||
		artifacts[0]!.fileName.toLowerCase().endsWith('.zip')
	if (isBatch) {
		const summary = await ingestUploadedFiles(userId, artifacts, { timezone })
		return {
			ok: true,
			value: {
				imported: summary.imported,
				duplicates: summary.duplicates,
				failed: summary.failed.map((failure) => ({
					file: failure.fileName,
					reason: uploadFailureLabel(failure.reason),
				})),
				sessionId: null,
			},
		}
	}
	const result = await ingestActivityFile(userId, artifacts[0]!, {
		disciplineOverride: sport,
		timezone,
	})
	const file = artifacts[0]!.fileName
	switch (result.status) {
		case 'imported':
			return {
				ok: true,
				value: {
					imported: 1,
					duplicates: 0,
					failed: [],
					sessionId: result.sessionId,
				},
			}
		case 'duplicate':
			return {
				ok: true,
				value: { imported: 0, duplicates: 1, failed: [], sessionId: null },
			}
		case 'unsupported':
		case 'failed':
			return {
				ok: true,
				value: {
					imported: 0,
					duplicates: 0,
					failed: [{ file, reason: uploadFailureLabel(result.message) }],
					sessionId: null,
				},
			}
	}
}

/** Recordings by source, and their span. */
export async function readRecordings(userId: string) {
	const [groups, span] = await Promise.all([
		prisma.activityImport.groupBy({
			by: ['externalProvider'],
			where: { athleteId: userId },
			_count: { _all: true },
		}),
		prisma.activityImport.aggregate({
			where: { athleteId: userId },
			_min: { startedAt: true },
			_max: { startedAt: true },
			_count: { _all: true },
		}),
	])
	return {
		total: span._count._all,
		bySource: groups.map((group) => ({
			source: (group.externalProvider === 'manual'
				? 'upload'
				: group.externalProvider) as SourceId | 'upload',
			count: group._count._all,
		})),
		earliest: span._min.startedAt?.toISOString() ?? null,
		latest: span._max.startedAt?.toISOString() ?? null,
	}
}
