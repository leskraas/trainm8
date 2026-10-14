import { Prisma } from '@prisma/client'
import {
	ActivityImportInputSchema,
	createActivityImport,
	provenanceOf,
	type ActivityImportInput,
} from '#app/utils/activity-import.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * How a candidate matched an activity the athlete already holds (ADR 0096 §4):
 * its own transport key again (re-fetched; nothing new is written), the same
 * original FIT file, or a fuzzy match on discipline, start and duration.
 */
export type MatchedBy = 'transport-key' | 'fit-file-key' | 'fuzzy'

export type FileImportResult =
	| { kind: 'created'; importId: string }
	| { kind: 'duplicate'; importId: string; matchedBy: MatchedBy }

/** ADR 0096 §4 rule 3: start times within this many seconds. */
const FUZZY_START_TOLERANCE_SEC = 120
/** ADR 0096 §4 rule 3: durations within this share of the longer one. */
const FUZZY_DURATION_TOLERANCE = 0.05

/**
 * **The one insert choke point** (ADR 0096 §5): every ingest path — sync,
 * webhook, backfill, reconciliation, file upload, share target, harvest —
 * files a candidate activity through here, never through
 * `createActivityImport` directly. Before anything is written the candidate is
 * resolved against the athlete's imports and aliases; the first rule that
 * matches decides:
 *
 * 1. **Same transport key** in an import or an alias → the same activity
 *    re-fetched. Nothing is written; a source-side update follows ADR 0049's
 *    mirror rule at the caller.
 * 2. **Same FIT key** (`fitFileKey`) on an import or an alias of this athlete
 *    → an alias, `matchedBy: 'fit-file-key'`.
 * 3. **Fuzzy**: an import with the same discipline (`other` only matches
 *    `other`), a start within 120 s and a duration within 5 % of the longer
 *    one, both above zero → an alias, `matchedBy: 'fuzzy'`. Closest start
 *    wins, then the oldest import. Different FIT keys do not block it.
 * 4. Otherwise a new import.
 *
 * Auto-save, telemetry and the Live Imports Stream belong to `created` only,
 * so ADR 0049 never sees a duplicate. Everything here is scoped to the
 * athlete: another athlete's copy of the same file is never a match.
 *
 * One refinement the ADR leaves open: a multisport file gives every leg the
 * same FIT key, so under a shared key a held activity is only the same
 * activity when it has the candidate's discipline or starts within 120 s of
 * it; of several, the same discipline wins, then the closest start.
 */
export async function fileActivityImport(
	athleteId: string,
	candidate: ActivityImportInput,
): Promise<FileImportResult> {
	const input = ActivityImportInputSchema.parse(candidate)

	const sameKey = await findByTransportKey(athleteId, input)
	if (sameKey) {
		return { kind: 'duplicate', importId: sameKey, matchedBy: 'transport-key' }
	}

	const match =
		(input.fitFileKey &&
			(await matchByFitFileKey(athleteId, input, input.fitFileKey))) ||
		(await matchFuzzy(athleteId, input))
	if (match) {
		return recordAlias(athleteId, input, match.importId, match.matchedBy)
	}

	try {
		const created = await createActivityImport(athleteId, input)
		return { kind: 'created', importId: created.id }
	} catch (err) {
		// Two deliveries of one activity racing each other: the other one won.
		if (isUniqueViolation(err)) {
			const winner = await findByTransportKey(athleteId, input)
			if (winner) {
				return {
					kind: 'duplicate',
					importId: winner,
					matchedBy: 'transport-key',
				}
			}
		}
		throw err
	}
}

async function findByTransportKey(
	athleteId: string,
	input: ActivityImportInput,
): Promise<string | null> {
	const key = {
		athleteId,
		externalProvider: input.externalProvider,
		externalId: input.externalId,
	}
	const imported = await prisma.activityImport.findUnique({
		where: { athleteId_externalProvider_externalId: key },
		select: { id: true },
	})
	if (imported) return imported.id
	const alias = await prisma.activityImportAlias.findUnique({
		where: { athleteId_externalProvider_externalId: key },
		select: { activityImportId: true },
	})
	return alias?.activityImportId ?? null
}

type Held = { id: string; discipline: string; startedAt: Date; createdAt: Date }

const HELD_SELECT = {
	id: true,
	discipline: true,
	startedAt: true,
	createdAt: true,
} as const

async function matchByFitFileKey(
	athleteId: string,
	input: ActivityImportInput,
	fitFileKey: string,
): Promise<{ importId: string; matchedBy: MatchedBy } | null> {
	const [imports, aliases] = await Promise.all([
		prisma.activityImport.findMany({
			where: { athleteId, fitFileKey },
			select: HELD_SELECT,
		}),
		prisma.activityImportAlias.findMany({
			where: { athleteId, fitFileKey },
			select: { activityImport: { select: HELD_SELECT } },
		}),
	])
	const held = new Map<string, Held>()
	for (const imp of [...imports, ...aliases.map((a) => a.activityImport)]) {
		held.set(imp.id, imp)
	}
	// Every leg of a multisport file carries the file's key. A held activity is
	// this leg when it is the same discipline or starts with it; the swim and
	// the run of one triathlon are neither.
	const sameLeg = (h: Held) =>
		h.discipline === input.discipline ||
		startGap(h, input) <= FUZZY_START_TOLERANCE_SEC * 1000
	const best = [...held.values()]
		.filter(sameLeg)
		.sort(
			(a, b) =>
				Number(b.discipline === input.discipline) -
					Number(a.discipline === input.discipline) ||
				startGap(a, input) - startGap(b, input) ||
				a.createdAt.getTime() - b.createdAt.getTime(),
		)[0]
	return best ? { importId: best.id, matchedBy: 'fit-file-key' } : null
}

async function matchFuzzy(
	athleteId: string,
	input: ActivityImportInput,
): Promise<{ importId: string; matchedBy: MatchedBy } | null> {
	if (!(input.durationSec > 0)) return null
	const windowMs = FUZZY_START_TOLERANCE_SEC * 1000
	const candidates = await prisma.activityImport.findMany({
		where: {
			athleteId,
			discipline: input.discipline,
			startedAt: {
				gte: new Date(input.startedAt.getTime() - windowMs),
				lte: new Date(input.startedAt.getTime() + windowMs),
			},
			durationSec: { gt: 0 },
		},
		select: { ...HELD_SELECT, durationSec: true },
	})
	const best = candidates
		.filter(
			(c) =>
				Math.abs(c.durationSec - input.durationSec) <=
				FUZZY_DURATION_TOLERANCE * Math.max(c.durationSec, input.durationSec),
		)
		.sort(
			(a, b) =>
				startGap(a, input) - startGap(b, input) ||
				a.createdAt.getTime() - b.createdAt.getTime(),
		)[0]
	return best ? { importId: best.id, matchedBy: 'fuzzy' } : null
}

function startGap(held: { startedAt: Date }, input: { startedAt: Date }) {
	return Math.abs(held.startedAt.getTime() - input.startedAt.getTime())
}

async function recordAlias(
	athleteId: string,
	input: ActivityImportInput,
	importId: string,
	matchedBy: MatchedBy,
): Promise<FileImportResult> {
	try {
		await prisma.activityImportAlias.create({
			data: {
				activityImportId: importId,
				athleteId,
				externalProvider: input.externalProvider,
				externalId: input.externalId,
				// The newcomer's own provenance, by the same rules as an import's.
				...provenanceOf(input),
				matchedBy,
			},
		})
	} catch (err) {
		// The same duplicate delivered twice at once: the alias is already there.
		if (!isUniqueViolation(err)) throw err
	}
	return { kind: 'duplicate', importId, matchedBy }
}

function isUniqueViolation(err: unknown): boolean {
	return (
		err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
	)
}
