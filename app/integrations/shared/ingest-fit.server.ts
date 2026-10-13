import { createHash } from 'node:crypto'
import {
	autoSaveImport,
	isAutoSaveMirror,
	recomputeLoadAfterBatch,
	type ImportTransport,
} from '#app/utils/activity-import.server.ts'
import {
	enrichImportTelemetry,
	persistActivityLaps,
} from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	parseFit,
	type ParsedActivity,
	type ParsedFitFile,
	type ParsedFitSession,
} from '#app/utils/fit-parser.server.ts'
import {
	fileActivityImport,
	type MatchedBy,
} from './file-activity-import.server.ts'
import { type OriginPlatform } from './origin-platform.ts'

export type IngestFitOptions = {
	/** The transport the file came down (`manual` for the athlete's upload). */
	externalProvider: ImportTransport
	/**
	 * The source's id for the activity. Omitted for an upload, whose id is
	 * derived from the activity itself (`contentDerivedExternalId`). A
	 * multisport file's later legs get `<id>#2`, `<id>#3`, ….
	 */
	externalId?: string
	/** The Origin Platform; defaults to what the transport implies. */
	originPlatform?: OriginPlatform
	/** How the bytes reached trainm8, recorded with the kept original file. */
	fetchedVia: string
	/** IANA timezone used to resolve the calendar day for auto-matching. */
	timezone: string
	/** Manual Discipline override (single-file uploads only). */
	disciplineOverride?: string
	/** The uploaded file's name, kept in the import's raw snapshot. */
	fileName?: string
}

export type IngestFitLegResult =
	| { status: 'imported'; importId: string; sessionId: string | null }
	| { status: 'duplicate'; importId: string; matchedBy: MatchedBy }

/**
 * **The shared FIT ingest** (WI §2): every source that hands trainm8 one FIT
 * per activity — the athlete's upload, a direct vendor, the Intervals.icu
 * harvest — calls this with the bytes and its own provider and activity id.
 *
 * Each sport session of the file is one activity (a triathlon is three). Per
 * leg: the candidate goes through the dedupe choke point
 * (`fileActivityImport`, ADR 0096 §4) carrying the file's FIT key and device.
 * A new import keeps the original bytes, has its laps persisted *before*
 * telemetry enqueues Structure Detection (so the lap-edged path runs first),
 * and is auto-saved (ADR 0049). A duplicate files nothing new — but when the
 * held import is still an auto-save mirror without an original file, it takes
 * this file's metrics, stream, laps, device and FIT key (ADR 0096 §6), never
 * its provider, id or Origin Platform.
 *
 * Throws on a file that cannot be decoded; the caller reports it.
 */
export async function ingestFit(
	athleteId: string,
	bytes: Uint8Array,
	options: IngestFitOptions,
): Promise<IngestFitLegResult[]> {
	const parsed = parseFit(bytes)
	const results: IngestFitLegResult[] = []
	let oldestSaved: Date | null = null

	try {
		for (const [index, leg] of parsed.sessions.entries()) {
			const activity: ParsedActivity = {
				...leg.activity,
				...(options.disciplineOverride
					? { discipline: options.disciplineOverride }
					: {}),
			}
			const filed = await fileActivityImport(athleteId, {
				externalProvider: options.externalProvider,
				externalId: legExternalId(options.externalId, activity, index),
				...(options.originPlatform
					? { originPlatform: options.originPlatform }
					: {}),
				deviceName: parsed.deviceName,
				fitFileKey: parsed.fitFileKey,
				...activity,
				rawJson: JSON.stringify({
					fileName: options.fileName,
					format: 'fit',
					fitFileKey: parsed.fitFileKey,
					deviceName: parsed.deviceName,
					leg: index + 1,
					legs: parsed.sessions.length,
					suuntoPlusGuides: leg.suuntoPlusGuides,
					...activity,
				}),
			})

			if (filed.kind === 'duplicate') {
				if (filed.matchedBy !== 'transport-key') {
					await refreshMirrorFromOriginalFit(athleteId, filed.importId, {
						bytes,
						parsed,
						leg,
						options,
					})
				}
				results.push({
					status: 'duplicate',
					importId: filed.importId,
					matchedBy: filed.matchedBy,
				})
				continue
			}

			await keepOriginalFile(filed.importId, bytes, options.fetchedVia)
			if (leg.laps.length > 0) {
				await persistActivityLaps(filed.importId, leg.laps)
			}
			const saved = await autoSaveImport(
				athleteId,
				filed.importId,
				options.timezone,
				{ recomputeLoad: false },
			)
			if (oldestSaved == null || activity.startedAt < oldestSaved) {
				oldestSaved = activity.startedAt
			}
			// Telemetry parity with the API providers (#168). Best-effort.
			if (leg.stream) {
				await enrichImportTelemetry(
					athleteId,
					filed.importId,
					activity.discipline,
					leg.stream,
				)
			}
			results.push({
				status: 'imported',
				importId: filed.importId,
				sessionId: saved?.sessionId ?? null,
			})
		}
	} finally {
		// One load recompute for the file, from its first saved leg's day.
		await recomputeLoadAfterBatch(athleteId, oldestSaved, options.timezone)
	}
	return results
}

/**
 * Stable content-derived dedupe key for a file the athlete gave us: a hash
 * over the normalized activity identity (start time + duration + distance),
 * not the file name or bytes — so the same activity uploaded twice, renamed,
 * or once loose and once inside a zip collapses on the transport key.
 *
 * The athlete is deliberately not hashed in: the key already carries them
 * (#544), so two athletes uploading the same file each keep a copy. Hashing the
 * athlete as well would change the id of every upload already stored, and a
 * re-upload of an old file would no longer be caught as a duplicate.
 */
export function contentDerivedExternalId(
	activity: Pick<ParsedActivity, 'startedAt' | 'durationSec' | 'distanceM'>,
): string {
	const hash = createHash('sha256')
		.update(
			[
				activity.startedAt.toISOString(),
				activity.durationSec,
				activity.distanceM ?? '',
			].join('|'),
		)
		.digest('hex')
	return `manual-${hash}`
}

function legExternalId(
	externalId: string | undefined,
	activity: ParsedActivity,
	index: number,
): string {
	if (externalId == null) return contentDerivedExternalId(activity)
	return index === 0 ? externalId : `${externalId}#${index + 1}`
}

async function keepOriginalFile(
	activityImportId: string,
	bytes: Uint8Array,
	fetchedVia: string,
) {
	await prisma.activityFile.upsert({
		where: { activityImportId },
		create: {
			activityImportId,
			format: 'fit',
			fetchedVia,
			bytes: new Uint8Array(bytes),
		},
		update: {},
	})
}

/**
 * ADR 0096 §6: a duplicate carrying the original FIT may refresh the held
 * import when that import is still an auto-save mirror (nothing built on it)
 * and has no original file of its own. Metrics, laps, stream, device and FIT
 * key take the file's; the provider, id, Origin Platform, discipline and the
 * Recording it is on never change. Best-effort: the alias is already recorded.
 */
async function refreshMirrorFromOriginalFit(
	athleteId: string,
	importId: string,
	{
		bytes,
		parsed,
		leg,
		options,
	}: {
		bytes: Uint8Array
		parsed: ParsedFitFile
		leg: ParsedFitSession
		options: IngestFitOptions
	},
): Promise<void> {
	try {
		const held = await prisma.activityImport.findUnique({
			where: { id: importId },
			select: {
				discipline: true,
				startedAt: true,
				originalFile: { select: { id: true } },
			},
		})
		if (!held || held.originalFile) return
		if (!(await isAutoSaveMirror(importId))) return

		const a = leg.activity
		await prisma.$transaction([
			prisma.activityImport.update({
				where: { id: importId },
				data: {
					startedAt: a.startedAt,
					endedAt: a.endedAt,
					durationSec: a.durationSec,
					distanceM: a.distanceM ?? null,
					hrAvg: a.hrAvg ?? null,
					hrMax: a.hrMax ?? null,
					powerAvg: a.powerAvg ?? null,
					powerMax: a.powerMax ?? null,
					powerWeightedAvg: a.powerWeightedAvg ?? null,
					cadenceAvg: a.cadenceAvg ?? null,
					paceAvgSecPerKm: a.paceAvgSecPerKm ?? null,
					speedMaxMps: a.speedMaxMps ?? null,
					elevationGainM: a.elevationGainM ?? null,
					kilojoules: a.kilojoules ?? null,
					lapsJson: leg.laps.length > 0 ? JSON.stringify(leg.laps) : null,
					...(parsed.deviceName ? { deviceName: parsed.deviceName } : {}),
					fitFileKey: parsed.fitFileKey,
				},
			}),
			prisma.activityFile.create({
				data: {
					activityImportId: importId,
					format: 'fit',
					fetchedVia: options.fetchedVia,
					bytes: new Uint8Array(bytes),
				},
			}),
		])
		if (leg.stream) {
			await enrichImportTelemetry(
				athleteId,
				importId,
				held.discipline,
				leg.stream,
			)
		}
		const earliest = held.startedAt < a.startedAt ? held.startedAt : a.startedAt
		await recomputeLoadAfterBatch(athleteId, earliest, options.timezone)
	} catch (err) {
		console.error(`refreshing import ${importId} from its FIT failed`, err)
	}
}
