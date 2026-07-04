import {
	autoMatchImport,
	createActivityImport,
	type ActivityImportInput,
} from './activity-import.server.ts'
import { type RawStream } from './activity-stream.ts'
import { enrichImportTelemetry } from './activity-telemetry.server.ts'
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
	| {
			kind: 'activity'
			activity: ParsedActivity
			/** Raw telemetry for the shared enrichment (#168), when the file has it. */
			stream: RawStream | null
			rawJson: string
	  }
	| { kind: 'unsupported'; message: string }

/**
 * Dispatch one artifact to its parser by file extension + magic-byte sniff:
 * XML formats are UTF-8 decoded and parsed as text; FIT is decoded from its
 * binary record stream. Throws on a recognized-but-garbled payload.
 */
function parseArtifact(artifact: UploadedArtifact): ParseOutcome {
	const { fileName, bytes } = artifact
	const ext = fileName.split('.').pop()?.toLowerCase()

	if (ext === 'fit' || looksLikeFit(bytes)) {
		const { activity, stream } = parseFit(bytes)
		// The binary payload is not JSON-serializable; snapshot the decoded
		// summary instead. (Raw-file retention is a later slice.)
		return {
			kind: 'activity',
			activity,
			stream,
			rawJson: JSON.stringify({ fileName, format: 'fit', ...activity }),
		}
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

	return {
		kind: 'unsupported',
		message: 'Only .gpx and .fit files are accepted.',
	}
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

	const { activity, stream, rawJson } = parsed
	if (options.disciplineOverride) {
		activity.discipline = options.disciplineOverride
	}

	// Same key scheme the GPX path has always used. A stable content-derived
	// key (dedupe across renames / zip entries) is the batch-import slice's job.
	const externalId = `manual-${artifact.fileName}-${activity.startedAt.toISOString()}`

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

	return { status: 'imported', importId }
}
