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
 * harvest spends at most `HARVEST_DAILY_BUDGET` of them per connection in any
 * 24-hour window, which leaves the daily sync its share and keeps two
 * athletes who share one key (#544) inside the limit together. It works in
 * batches of `HARVEST_BATCH_SIZE` so the single job worker is never held for
 * long, and every request goes through the process-wide courtesy pacer.
 *
 * **Resuming.** `fitHarvestedAt` marks an import as asked, whatever the answer
 * (a file, or a 404 for a manual entry), so nothing is fetched twice. The
 * window and its count travel in the job's payload; the job re-enqueues itself
 * until no import is left, at the window's turn when the budget is spent. A
 * rejected key revokes the connection (ADR 0026) and stops; a rate limit or a
 * server error backs off an hour and leaves the activity to the next run.
 *
 * **Order.** Garmin-origin activities first, because Garmin is the supply at
 * risk, then newest first.
 */

export const INTERVALSICU_FIT_HARVEST_JOB_KIND = 'intervalsicu-fit-harvest'
export const INTERVALSICU_FIT_HARVEST_DISPATCH_JOB_KIND =
	'intervalsicu-fit-harvest-dispatch'

/** Requests per connection per 24 h, of the 5,000 a key allows. */
export const HARVEST_DAILY_BUDGET = 2000
/** Requests per job run before handing over to a fresh job. */
export const HARVEST_BATCH_SIZE = 100

const WINDOW_MS = 24 * 60 * 60 * 1000
const BACKOFF_MS = 60 * 60 * 1000

/** Where a harvest stands in its budget window; carried in the job payload. */
export type HarvestState = {
	windowStartedAt?: string
	requestsInWindow?: number
}

export type HarvestOutcome =
	/** Nothing left to ask for. */
	| { kind: 'done'; requests: number; keysFound: number }
	/** More to do: run again at `resumeAt` with `state`. */
	| {
			kind: 'paused'
			requests: number
			resumeAt: Date
			state: Required<HarvestState>
	  }
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
	state: HarvestState,
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

	// The window carried in the state still counts until it is a day old;
	// after that a fresh one opens now.
	const windowOpen =
		state.windowStartedAt != null &&
		now.getTime() - new Date(state.windowStartedAt).getTime() < WINDOW_MS
	const windowStart = windowOpen ? new Date(state.windowStartedAt!) : now
	let used = windowOpen ? (state.requestsInWindow ?? 0) : 0
	const windowState = () => ({
		windowStartedAt: windowStart.toISOString(),
		requestsInWindow: used,
	})

	let requests = 0
	let keysFound = 0
	while (true) {
		const budgetLeft = dailyBudget - used
		const batchLeft = batchSize - requests
		const take = Math.max(0, Math.min(budgetLeft, batchLeft))
		const pending = await pendingImports(athleteId, Math.max(take, 1))
		if (pending.length === 0) return { kind: 'done', requests, keysFound }
		if (budgetLeft <= 0) {
			return {
				kind: 'paused',
				requests,
				resumeAt: new Date(windowStart.getTime() + WINDOW_MS),
				state: windowState(),
			}
		}
		if (batchLeft <= 0) {
			return { kind: 'paused', requests, resumeAt: now, state: windowState() }
		}

		for (const imp of pending) {
			let file: Uint8Array | null
			try {
				requests++
				used++
				file = await fetchIntervalsIcuOriginalFile(
					connection.accessToken,
					imp.externalId,
				)
			} catch (err) {
				if (err instanceof IntervalsIcuKeyRejectedError) {
					// A 401/403 may be about this one activity (Garmin's block may
					// answer per activity), not the key. Ask who owns the key: if
					// that still works, the activity is unavailable, not the key.
					requests++
					used++
					if (await keyStillWorks(connection.accessToken)) {
						file = null
					} else {
						await prisma.accountConnection.update({
							where: { id: connection.id },
							data: { status: 'revoked' },
						})
						return { kind: 'revoked', requests }
					}
				} else if (
					err instanceof IntervalsIcuApiError ||
					err instanceof TypeError // network failure from fetch
				) {
					return {
						kind: 'paused',
						requests,
						resumeAt: new Date(now.getTime() + BACKOFF_MS),
						state: windowState(),
					}
				} else {
					throw err
				}
			}
			if (await keepOriginal(imp.id, file, now)) keysFound++
		}
	}
}

/** Whether the key still opens `athlete/0` (a rejection there is the key's). */
async function keyStillWorks(apiKey: string): Promise<boolean> {
	try {
		await intervalsIcuApiGet(apiKey, INTERVALSICU_ATHLETE_SELF_PATH)
		return true
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) return false
		// Any other failure says nothing about the key; keep it.
		return true
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
 * The payload is `{ athleteId, windowStartedAt?, requestsInWindow? }`.
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
	const state: HarvestState = {
		windowStartedAt:
			typeof payload.windowStartedAt === 'string'
				? payload.windowStartedAt
				: undefined,
		requestsInWindow:
			typeof payload.requestsInWindow === 'number'
				? payload.requestsInWindow
				: undefined,
	}
	const outcome = await runIntervalsIcuFitHarvest(athleteId, state, options)
	if (outcome.kind !== 'paused') return
	await enqueueJob({
		kind: INTERVALSICU_FIT_HARVEST_JOB_KIND,
		payload: { athleteId, ...outcome.state },
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
