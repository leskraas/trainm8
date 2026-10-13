import { createHash } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { parseFit } from '#app/utils/fit-parser.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import {
	IntervalsIcuApiError,
	IntervalsIcuKeyRejectedError,
	intervalsIcuApiGet,
} from './client.server.ts'
import { fetchIntervalsIcuOriginalFile } from './ingest.server.ts'
import {
	INTERVALSICU_ATHLETE_SELF_PATH,
	INTERVALSICU_PROVIDER,
} from './types.ts'

/**
 * **The FIT harvest** (#547, `watch-data-trainm8-ingest.md` §4). Intervals.icu
 * still serves Garmin activities, and its developer expects that to stop. For
 * every bridge-era import this fetches the activity's **original** file —
 * `GET /activity/{id}/file`, one request per activity; the bulk
 * `download-fit-files` endpoint returns files Intervals.icu generated, not
 * originals — and keeps two things on the import: the bytes (`ActivityFile`)
 * and the FIT key (`fitFileKey`, ADR 0096 §1). The key is what lets a later
 * direct source or an upload of the same file land as an alias instead of a
 * second session; the bytes let laps and channels be re-derived after the
 * bridge closes.
 *
 * It changes nothing else: no metric, no stream, no Recording, no identity
 * (ADR 0096 §6 is about a newcomer; this is the import's own file).
 *
 * **Budget.** Intervals.icu allows 5,000 requests a day per API key. The
 * harvest spends at most `HARVEST_DAILY_BUDGET` of them per key in any 24-hour
 * window, which leaves the daily sync its share. Several athletes may connect
 * with one key (#544), so the count is the key's (`IntervalsIcuKeyBudget`,
 * keyed by the key's SHA-256), shared by every connection that holds it, and
 * each request is reserved against it before it is made. The harvest works in
 * batches of `HARVEST_BATCH_SIZE` so the single job worker is never held for
 * long, and every request goes through the process-wide courtesy pacer.
 *
 * **Resuming.** `fitHarvestedAt` marks an import as asked, whatever the answer
 * (a file, or a 404 for a manual entry), so nothing is fetched twice. The job
 * re-enqueues itself until no import is left, at the key's window turn when
 * the budget is spent. A
 * rejected key revokes the connection (ADR 0026) and stops; a rate limit or a
 * server error backs off an hour and leaves the activity to the next run, as
 * does a 401/403 on a file when the key check that follows cannot answer.
 *
 * **Order.** Garmin-origin activities first, because Garmin is the supply at
 * risk, then newest first.
 */

export const INTERVALSICU_FIT_HARVEST_JOB_KIND = 'intervalsicu-fit-harvest'
export const INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND =
	'intervalsicu-fit-harvest-dispatch'

/** Requests per API key per 24 h, of the 5,000 a key allows. */
export const HARVEST_DAILY_BUDGET = 2000
/** Requests per job run before handing over to a fresh job. */
export const HARVEST_BATCH_SIZE = 100

const WINDOW_MS = 24 * 60 * 60 * 1000
const BACKOFF_MS = 60 * 60 * 1000

export type HarvestOutcome =
	/** Nothing left to ask for. */
	| { kind: 'done'; requests: number; keysFound: number }
	/** More to do: run again at `resumeAt`. */
	| { kind: 'paused'; requests: number; resumeAt: Date }
	/** The key was rejected; the connection is now `revoked`. */
	| { kind: 'revoked'; requests: number }
	| { kind: 'not-connected' }

type HarvestOptions = {
	now?: Date
	dailyBudget?: number
	batchSize?: number
}

export async function runIntervalsIcuFitHarvest(
	athleteId: string,
	{
		now = new Date(),
		dailyBudget = HARVEST_DAILY_BUDGET,
		batchSize = HARVEST_BATCH_SIZE,
	}: HarvestOptions = {},
): Promise<HarvestOutcome> {
	const connection = await prisma.accountConnection.findUnique({
		where: {
			athleteId_provider: { athleteId, provider: INTERVALSICU_PROVIDER },
		},
		select: { id: true, status: true, accessToken: true },
	})
	if (!connection || connection.status !== 'active') {
		return { kind: 'not-connected' }
	}

	const keyHash = createHash('sha256')
		.update(connection.accessToken)
		.digest('hex')
	let requests = 0
	let keysFound = 0
	const paused = (resumeAt: Date): HarvestOutcome => ({
		kind: 'paused',
		requests,
		resumeAt,
	})
	const backOff = () => paused(new Date(now.getTime() + BACKOFF_MS))

	while (true) {
		const batchLeft = batchSize - requests
		const pending = await pendingImports(athleteId, Math.max(batchLeft, 1))
		if (pending.length === 0) return { kind: 'done', requests, keysFound }
		if (batchLeft <= 0) return paused(now)

		for (const imp of pending) {
			const windowTurns = await reserveRequest(keyHash, now, dailyBudget)
			if (windowTurns) return paused(windowTurns)
			let file: Uint8Array | null
			try {
				requests++
				file = await fetchIntervalsIcuOriginalFile(
					connection.accessToken,
					imp.externalId,
				)
			} catch (err) {
				if (err instanceof IntervalsIcuKeyRejectedError) {
					// A 401/403 may be about this one activity (Garmin's block may
					// answer per activity), not the key. Ask who owns the key: if
					// that still works, the activity is unavailable, not the key.
					// When the check itself fails, nothing is known: back off rather
					// than write the activity off for good.
					const checkTurns = await reserveRequest(keyHash, now, dailyBudget)
					if (checkTurns) return paused(checkTurns)
					requests++
					const key = await checkKey(connection.accessToken)
					if (key === 'works') {
						file = null
					} else if (key === 'rejected') {
						await prisma.accountConnection.update({
							where: { id: connection.id },
							data: { status: 'revoked' },
						})
						return { kind: 'revoked', requests }
					} else {
						return backOff()
					}
				} else if (
					err instanceof IntervalsIcuApiError ||
					err instanceof TypeError // network failure from fetch
				) {
					return backOff()
				} else {
					throw err
				}
			}
			if (await keepOriginal(imp.id, file, now)) keysFound++
		}
	}
}

/**
 * Reserve one request from the key's budget: null when reserved, else when
 * the key's window turns. A window a day old starts afresh at `now`. The
 * increment is conditional, so runs on the same key never spend past the
 * budget between them.
 */
async function reserveRequest(
	keyHash: string,
	now: Date,
	dailyBudget: number,
): Promise<Date | null> {
	const budget = await prisma.intervalsIcuKeyBudget.upsert({
		where: { keyHash },
		create: { keyHash, windowStartedAt: now, requestsInWindow: 0 },
		update: {},
		select: { windowStartedAt: true },
	})
	let windowStartedAt = budget.windowStartedAt
	if (now.getTime() - windowStartedAt.getTime() >= WINDOW_MS) {
		await prisma.intervalsIcuKeyBudget.updateMany({
			where: { keyHash, windowStartedAt },
			data: { windowStartedAt: now, requestsInWindow: 0 },
		})
		windowStartedAt = (
			await prisma.intervalsIcuKeyBudget.findUniqueOrThrow({
				where: { keyHash },
				select: { windowStartedAt: true },
			})
		).windowStartedAt
	}
	const { count } = await prisma.intervalsIcuKeyBudget.updateMany({
		where: {
			keyHash,
			windowStartedAt,
			requestsInWindow: { lt: dailyBudget },
		},
		data: { requestsInWindow: { increment: 1 } },
	})
	return count === 1 ? null : new Date(windowStartedAt.getTime() + WINDOW_MS)
}

/**
 * Whether the key still opens `athlete/0`: a rejection there is the key's; any
 * other failure (a 5xx, the network) says nothing either way.
 */
async function checkKey(
	apiKey: string,
): Promise<'works' | 'rejected' | 'unknown'> {
	try {
		await intervalsIcuApiGet(apiKey, INTERVALSICU_ATHLETE_SELF_PATH)
		return 'works'
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) return 'rejected'
		return 'unknown'
	}
}

/**
 * The next imports to ask for: this athlete's Intervals.icu imports not yet
 * asked, Garmin-origin first, then newest first.
 */
async function pendingImports(athleteId: string, take: number) {
	const where = {
		athleteId,
		externalProvider: INTERVALSICU_PROVIDER,
		fitHarvestedAt: null,
	}
	const select = { id: true, externalId: true } as const
	const garmin = await prisma.activityImport.findMany({
		where: { ...where, originPlatform: 'garmin' },
		orderBy: { startedAt: 'desc' },
		select,
		take,
	})
	if (garmin.length >= take) return garmin
	const rest = await prisma.activityImport.findMany({
		where: { ...where, originPlatform: { not: 'garmin' } },
		orderBy: { startedAt: 'desc' },
		select,
		take: take - garmin.length,
	})
	return [...garmin, ...rest]
}

/** The 4-byte data-type tag at offset 8 of every FIT file header. */
function isFit(bytes: Uint8Array): boolean {
	return (
		bytes.length >= 12 &&
		String.fromCharCode(...bytes.subarray(8, 12)) === '.FIT'
	)
}

/**
 * Mark the import asked and keep what came back: a FIT's bytes, and its key
 * when the file has one. Returns whether a key was found. A FIT the parser
 * cannot read yet is still kept, so a later parser can; a non-FIT original
 * (a GPX or TCX the athlete uploaded to Intervals.icu) is not kept.
 */
async function keepOriginal(
	importId: string,
	file: Uint8Array | null,
	now: Date,
): Promise<boolean> {
	if (!file || !isFit(file)) {
		await prisma.activityImport.update({
			where: { id: importId },
			data: { fitHarvestedAt: now },
		})
		return false
	}

	let fitFileKey: string | null = null
	try {
		fitFileKey = parseFit(file).fitFileKey
	} catch (err) {
		console.error(`harvested FIT for import ${importId} did not parse`, err)
	}
	await prisma.$transaction([
		prisma.activityFile.upsert({
			where: { activityImportId: importId },
			create: {
				activityImportId: importId,
				format: 'fit',
				source: 'intervalsicu-harvest',
				bytes: new Uint8Array(file),
			},
			update: {},
		}),
		prisma.activityImport.update({
			where: { id: importId },
			data: { fitHarvestedAt: now, ...(fitFileKey ? { fitFileKey } : {}) },
		}),
	])
	return fitFileKey != null
}

/**
 * The job: run one batch, then enqueue the continuation the outcome asks for.
 * The payload is `{ athleteId }` (a budget window an older payload carries is
 * ignored: the key's budget row holds it now).
 */
export async function runIntervalsIcuFitHarvestJob(
	payload: Record<string, unknown>,
	options: HarvestOptions = {},
): Promise<void> {
	const athleteId = payload.athleteId
	if (typeof athleteId !== 'string') {
		throw new Error(
			'intervalsicu-fit-harvest job requires a string athleteId payload',
		)
	}
	const outcome = await runIntervalsIcuFitHarvest(athleteId, options)
	if (outcome.kind !== 'paused') return
	await enqueueJob({
		kind: INTERVALSICU_FIT_HARVEST_JOB_KIND,
		payload: { athleteId },
		runAt: outcome.resumeAt,
	})
}

/**
 * Start a harvest for every active Intervals.icu connection that has none
 * pending or running. Run once after deploy (the dispatch job) and by the
 * daily sweep, so activities synced later are harvested too while the bridge
 * still serves them.
 */
export async function dispatchIntervalsIcuFitHarvest(): Promise<{
	enqueued: number
}> {
	const connections = await prisma.accountConnection.findMany({
		where: { provider: INTERVALSICU_PROVIDER, status: 'active' },
		select: { athleteId: true },
	})
	let enqueued = 0
	for (const { athleteId } of connections) {
		if (await harvestInFlight(athleteId)) continue
		await enqueueJob({
			kind: INTERVALSICU_FIT_HARVEST_JOB_KIND,
			payload: { athleteId },
		})
		enqueued++
	}
	return { enqueued }
}

async function harvestInFlight(athleteId: string): Promise<boolean> {
	const jobs = await prisma.job.findMany({
		where: {
			kind: INTERVALSICU_FIT_HARVEST_JOB_KIND,
			status: { in: ['pending', 'running'] },
		},
		select: { payload: true },
	})
	return jobs.some((job) => {
		try {
			return (
				(JSON.parse(job.payload) as { athleteId?: unknown }).athleteId ===
				athleteId
			)
		} catch {
			return false
		}
	})
}

/**
 * Enqueue the dispatch once, at boot: the job row is the "already ran" marker,
 * as for the other one-shot backfills. Deploying is what starts the harvest.
 */
export async function ensureIntervalsIcuFitHarvestEnqueued(): Promise<void> {
	const existing = await prisma.job.findFirst({
		where: { kind: INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND },
		select: { id: true },
	})
	if (existing) return
	await enqueueJob({ kind: INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND })
}
