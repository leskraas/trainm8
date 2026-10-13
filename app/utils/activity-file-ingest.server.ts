import { gunzipSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import { fileActivityImport } from '#app/integrations/shared/file-activity-import.server.ts'
import {
	contentDerivedExternalId,
	ingestFit,
} from '#app/integrations/shared/ingest-fit.server.ts'
import {
	autoSaveImport,
	type ActivityImportInput,
} from './activity-import.server.ts'
import { type RawStream } from './activity-stream.ts'
import { enrichImportTelemetry } from './activity-telemetry.server.ts'
import { parseGpx } from './gpx-parser.server.ts'
import { parseTcx } from './tcx-parser.server.ts'

/** An uploaded activity file: its name plus the raw, undecoded bytes. */
export type UploadedArtifact = {
	fileName: string
	bytes: Uint8Array
}

export type IngestOptions = {
	/**
	 * Manual Discipline override — single-file uploads only (the caller decides;
	 * this function applies it to whatever it parses).
	 */
	disciplineOverride?: string
	/** IANA timezone used to resolve the calendar day for auto-matching. */
	timezone: string
}

export type IngestFileResult =
	/**
	 * `sessionId` is the Workout Session auto-save landed the activity on
	 * (ADR 0049), so the upload surface can send the athlete straight to it.
	 * Null only if the save itself failed — the import row still exists.
	 */
	| { status: 'imported'; importId: string; sessionId: string | null }
	| { status: 'duplicate' }
	| { status: 'unsupported'; message: string }
	| { status: 'failed'; message: string }

const MiB = 1024 * 1024

/**
 * What one upload request may carry. Each file is held in memory whole, so
 * these bound one request's memory: the form parser refuses a bigger part or
 * more parts, a `.gz` may inflate to at most `maxInflatedFileSize`, and the
 * entries of a `.zip` (nested archives included) may add up to at most
 * `maxUnzippedSize`, checked against the sizes the archive declares before
 * anything is inflated (an entry never inflates past its declared size).
 */
export const UPLOAD_LIMITS = {
	maxFileSize: 64 * MiB,
	maxFiles: 20,
	maxInflatedFileSize: 64 * MiB,
	maxUnzippedSize: 256 * MiB,
} as const

const FILE_TOO_LARGE = 'The file is too large.'
const ARCHIVE_TOO_LARGE = 'The archive is too large.'

/** The 4-byte data-type tag at offset 8 of every FIT file header. */
const FIT_MAGIC_OFFSET = 8
const FIT_MAGIC = '.FIT'

function looksLikeFit(bytes: Uint8Array): boolean {
	if (bytes.length < FIT_MAGIC_OFFSET + FIT_MAGIC.length) return false
	return (
		String.fromCharCode(
			...bytes.subarray(FIT_MAGIC_OFFSET, FIT_MAGIC_OFFSET + FIT_MAGIC.length),
		) === FIT_MAGIC
	)
}

type ParsedActivity = Omit<
	ActivityImportInput,
	'externalProvider' | 'externalId' | 'rawJson'
>

type ParseOutcome =
	| {
			kind: 'activity'
			activity: ParsedActivity
			/** Raw telemetry for the shared enrichment (#168), when the file has it. */
			stream: RawStream | null
			rawJson: string
	  }
	/** A FIT file: handed whole to the shared FIT ingest (`ingestFit`). */
	| { kind: 'fit'; fileName: string; bytes: Uint8Array }
	| { kind: 'unsupported'; message: string }

/**
 * Dispatch one artifact to its parser by file extension + magic-byte sniff:
 * XML formats are UTF-8 decoded and parsed as text; FIT is decoded from its
 * binary record stream; `.gz` is gunzipped and re-dispatched by the inner
 * extension. Throws on a recognized-but-garbled payload.
 */
function parseArtifact(artifact: UploadedArtifact): ParseOutcome {
	const { fileName, bytes } = artifact
	const ext = fileName.split('.').pop()?.toLowerCase()

	if (ext === 'gz') {
		let inflated: Uint8Array
		try {
			inflated = new Uint8Array(
				gunzipSync(bytes, {
					maxOutputLength: UPLOAD_LIMITS.maxInflatedFileSize,
				}),
			)
		} catch (err) {
			if ((err as { code?: unknown }).code === 'ERR_BUFFER_TOO_LARGE') {
				throw new Error(FILE_TOO_LARGE)
			}
			throw err
		}
		return parseArtifact({
			fileName: fileName.slice(0, -'.gz'.length),
			bytes: inflated,
		})
	}

	if (ext === 'fit' || looksLikeFit(bytes)) {
		// Decoded by the shared FIT ingest, which keeps the original bytes.
		return { kind: 'fit', fileName, bytes }
	}

	if (ext === 'gpx') {
		const fileContent = new TextDecoder().decode(bytes)
		const { activity, stream } = parseGpx(fileContent)
		return {
			kind: 'activity',
			activity,
			stream,
			// Unchanged from the pre-ingest-function GPX path.
			rawJson: JSON.stringify({ fileName, fileContent }),
		}
	}

	if (ext === 'tcx') {
		const fileContent = new TextDecoder().decode(bytes)
		const { activity, stream } = parseTcx(fileContent)
		return {
			kind: 'activity',
			activity,
			// Full stream parity with GPX/FIT (ADR 0036): the trackpoints become the
			// Activity Stream, so a run/bike TCX gains the Telemetry Overlay and
			// stream-derived Normalized Power → Coggan TSS. The full XML is kept
			// verbatim so the same stream is re-derivable by the backfill (zero I/O).
			stream,
			// Same raw-snapshot scheme as the GPX path.
			rawJson: JSON.stringify({ fileName, fileContent }),
		}
	}

	return {
		kind: 'unsupported',
		message:
			'Unsupported file type. Accepted: .fit, .fit.gz, .tcx, .gpx, .zip, .gz.',
	}
}

/**
 * The provider-neutral ingest entry point (PRD #164): takes an uploaded
 * artifact and files its activity through the dedupe choke point
 * (`fileActivityImport`, ADR 0096 §4) and `autoSaveImport` — the same pipeline
 * every provider takes, so Discipline handling, ADR 0015 `'other'` behavior,
 * and TSS / Training Load treatment are identical across sources. A FIT file
 * goes whole to the shared FIT ingest (`ingestFit`), which also keeps its bytes
 * and files each sport session of a multisport file on its own. Every upload
 * surface (the upload route, the share target) calls this.
 *
 * `duplicate` covers a file uploaded before and an activity another source
 * already delivered — the latter is kept as an Import Alias, not a session.
 */
export async function ingestActivityFile(
	athleteId: string,
	artifact: UploadedArtifact,
	options: IngestOptions,
): Promise<IngestFileResult> {
	let parsed: ParseOutcome
	try {
		parsed = parseArtifact(artifact)
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to parse file'
		return { status: 'failed', message }
	}
	if (parsed.kind === 'unsupported') {
		return { status: 'unsupported', message: parsed.message }
	}

	if (parsed.kind === 'fit') {
		let legs
		try {
			legs = await ingestFit(athleteId, parsed.bytes, {
				externalProvider: 'manual',
				fetchedVia: 'upload',
				fileName: parsed.fileName,
				timezone: options.timezone,
				disciplineOverride: options.disciplineOverride,
			})
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Failed to parse file'
			return { status: 'failed', message }
		}
		// A multisport file lands as several sessions; the athlete goes to the
		// first one that is new.
		const imported = legs.find((leg) => leg.status === 'imported')
		return imported
			? {
					status: 'imported',
					importId: imported.importId,
					sessionId: imported.sessionId,
				}
			: { status: 'duplicate' }
	}

	const { activity, stream, rawJson } = parsed
	if (options.disciplineOverride) {
		activity.discipline = options.disciplineOverride
	}

	const filed = await fileActivityImport(athleteId, {
		externalProvider: 'manual',
		externalId: contentDerivedExternalId(activity),
		rawJson,
		...activity,
	})
	if (filed.kind === 'duplicate') return { status: 'duplicate' }
	const importId = filed.importId

	const saved = await autoSaveImport(athleteId, importId, options.timezone)

	// Telemetry parity with Strava imports (#168): the file's raw stream becomes
	// the Activity Stream + HR phase bars through the same provider-neutral
	// enrichment. Best-effort — a telemetry hiccup never fails the import.
	if (stream) {
		await enrichImportTelemetry(
			athleteId,
			importId,
			activity.discipline,
			stream,
		)
	}

	return { status: 'imported', importId, sessionId: saved?.sessionId ?? null }
}

export type BatchFileFailure = { fileName: string; reason: string }

/** The imported / duplicates / failed outcome of a batch or ZIP import. */
export type BatchImportSummary = {
	imported: number
	duplicates: number
	failed: BatchFileFailure[]
}

/** Extensions that can hold an activity — everything else in a zip is noise. */
const ACTIVITY_EXTENSIONS = new Set(['fit', 'gpx', 'tcx'])

function activityExtension(fileName: string): string | undefined {
	const name = fileName.toLowerCase()
	const inner = name.endsWith('.gz') ? name.slice(0, -'.gz'.length) : name
	return inner.split('.').pop()
}

/**
 * Expand one uploaded file into the activity-file candidates it holds:
 * a `.zip` (including nested folders and nested archives, as in the Strava
 * bulk export) fans out to its activity-format entries — non-activity entries
 * (images, `activities.csv`, segment files) are skipped silently; anything
 * else is a single candidate. Throws on an unreadable archive, and with
 * `ARCHIVE_TOO_LARGE` when its entries add up past `maxUnzippedSize`.
 */
function expandArtifact(
	artifact: UploadedArtifact,
	budget = { remaining: UPLOAD_LIMITS.maxUnzippedSize as number },
): UploadedArtifact[] {
	const ext = artifact.fileName.split('.').pop()?.toLowerCase()
	if (ext !== 'zip') return [artifact]

	const entries = unzipSync(artifact.bytes, {
		filter: (entry) => {
			budget.remaining -= entry.originalSize
			if (budget.remaining < 0) throw new Error(ARCHIVE_TOO_LARGE)
			return true
		},
	})
	return Object.entries(entries).flatMap(([entryPath, bytes]) => {
		if (entryPath.endsWith('/')) return [] // directory entry
		const entryExt = entryPath.split('.').pop()?.toLowerCase()
		const entry = { fileName: entryPath, bytes }
		if (entryExt === 'zip') return expandArtifact(entry, budget)
		const inner = activityExtension(entryPath)
		return inner && ACTIVITY_EXTENSIONS.has(inner) ? [entry] : []
	})
}

/**
 * Bulk import: expands each uploaded file (ZIP fan-out, `.gz` handled by the
 * per-file dispatch) and runs every candidate through `ingestActivityFile`,
 * counting outcomes into a summary. One bad file never aborts the batch;
 * duplicates are counted, not surfaced as errors. Discipline override does
 * not apply here (PRD #164: single-file uploads only).
 */
export async function ingestUploadedFiles(
	athleteId: string,
	artifacts: UploadedArtifact[],
	options: Omit<IngestOptions, 'disciplineOverride'>,
): Promise<BatchImportSummary> {
	const summary: BatchImportSummary = {
		imported: 0,
		duplicates: 0,
		failed: [],
	}

	for (const artifact of artifacts) {
		let candidates: UploadedArtifact[]
		try {
			candidates = expandArtifact(artifact)
		} catch (err) {
			summary.failed.push({
				fileName: artifact.fileName,
				reason:
					err instanceof Error && err.message === ARCHIVE_TOO_LARGE
						? ARCHIVE_TOO_LARGE
						: 'Could not read the archive.',
			})
			continue
		}
		const fromArchive = candidates.length !== 1 || candidates[0] !== artifact

		for (const candidate of candidates) {
			const result = await ingestActivityFile(athleteId, candidate, options)
			switch (result.status) {
				case 'imported':
					summary.imported += 1
					break
				case 'duplicate':
					summary.duplicates += 1
					break
				case 'unsupported':
					// Inside an archive, non-activity entries are noise — skip
					// silently. A file the user picked directly is worth reporting.
					if (!fromArchive) {
						summary.failed.push({
							fileName: candidate.fileName,
							reason: result.message,
						})
					}
					break
				case 'failed':
					summary.failed.push({
						fileName: candidate.fileName,
						reason: result.message,
					})
					break
			}
		}
	}

	return summary
}
