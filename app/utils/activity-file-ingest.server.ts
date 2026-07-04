import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import {
	autoMatchImport,
	createActivityImport,
	type ActivityImportInput,
} from './activity-import.server.ts'
import { parseFit } from './fit-parser.server.ts'
import { parseGpx } from './gpx-parser.server.ts'

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
	| { status: 'imported'; importId: string }
	| { status: 'duplicate' }
	| { status: 'unsupported'; message: string }
	| { status: 'failed'; message: string }

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
	| { kind: 'activity'; activity: ParsedActivity; rawJson: string }
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
		return parseArtifact({
			fileName: fileName.slice(0, -'.gz'.length),
			bytes: new Uint8Array(gunzipSync(bytes)),
		})
	}

	if (ext === 'fit' || looksLikeFit(bytes)) {
		const activity = parseFit(bytes)
		// The binary payload is not JSON-serializable; snapshot the decoded
		// summary instead. (Raw-file retention is a later slice.)
		return {
			kind: 'activity',
			activity,
			rawJson: JSON.stringify({ fileName, format: 'fit', ...activity }),
		}
	}

	if (ext === 'gpx') {
		const fileContent = new TextDecoder().decode(bytes)
		return {
			kind: 'activity',
			activity: parseGpx(fileContent),
			// Unchanged from the pre-ingest-function GPX path.
			rawJson: JSON.stringify({ fileName, fileContent }),
		}
	}

	return {
		kind: 'unsupported',
		message: 'Unsupported file type. Accepted: .fit, .fit.gz, .gpx, .zip, .gz.',
	}
}

/**
 * Stable content-derived dedupe key: a hash over the normalized activity
 * identity (start time + duration + distance), not the file name or bytes —
 * so the same activity uploaded twice, renamed, or once loose and once inside
 * a zip collapses via the `unique(externalProvider, externalId)` constraint.
 */
function contentDerivedExternalId(activity: ParsedActivity): string {
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

/**
 * The provider-neutral ingest entry point (PRD #164): takes an uploaded
 * artifact and files zero-or-more Activity Imports through the existing
 * `createActivityImport` + `autoMatchImport` pipeline — the same pipeline
 * Strava imports take, so Discipline handling, ADR 0015 `'other'` behavior,
 * and TSS / Training Load treatment are identical across sources. Every
 * upload surface (route action today; share target later) calls this.
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

	const { activity, rawJson } = parsed
	if (options.disciplineOverride) {
		activity.discipline = options.disciplineOverride
	}

	const externalId = contentDerivedExternalId(activity)

	let importId: string
	try {
		importId = (
			await createActivityImport(athleteId, {
				externalProvider: 'manual',
				externalId,
				rawJson,
				...activity,
			})
		).id
	} catch (err) {
		if (err instanceof Error && err.message.toLowerCase().includes('unique')) {
			return { status: 'duplicate' }
		}
		throw err
	}

	await autoMatchImport(athleteId, importId, options.timezone)

	return { status: 'imported', importId }
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
 * else is a single candidate. Throws on an unreadable archive.
 */
function expandArtifact(artifact: UploadedArtifact): UploadedArtifact[] {
	const ext = artifact.fileName.split('.').pop()?.toLowerCase()
	if (ext !== 'zip') return [artifact]

	const entries = unzipSync(artifact.bytes)
	return Object.entries(entries).flatMap(([entryPath, bytes]) => {
		if (entryPath.endsWith('/')) return [] // directory entry
		const entryExt = entryPath.split('.').pop()?.toLowerCase()
		const entry = { fileName: entryPath, bytes }
		if (entryExt === 'zip') return expandArtifact(entry)
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
		} catch {
			summary.failed.push({
				fileName: artifact.fileName,
				reason: 'Could not read the archive.',
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
