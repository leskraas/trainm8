import { type AccountConnection } from '@prisma/client'
import {
	autoMatchImport,
	createActivityImport,
	type ActivityImportInput,
} from '#app/utils/activity-import.server.ts'
import { stravaApiGet } from './client.server.ts'
import { stravaTypeToDiscipline } from './discipline-map.ts'
import { createRateLimiter, STRAVA_RATE_LIMIT } from './rate-limit.ts'
import {
	StravaActivitiesSchema,
	StravaActivitySchema,
	type StravaActivity,
} from './types.ts'

/**
 * Shared Strava ingest primitives used by both manual sync (#72) and the
 * Backfill Window (#74): the pure activity → `ActivityImportInput` mapping and
 * the paginated activity fetch. Keeping these in one place means the two trigger
 * paths file identical imports and stay idempotent against each other.
 */

/** Strava caps `per_page` at 200; a modest page size keeps each request small. */
const PER_PAGE = 100
/** Safety cap so a misbehaving cursor can never loop forever. */
const MAX_PAGES = 20

/**
 * Process-wide limiter shared by every Strava fetch (manual sync + backfill), so
 * the per-app 600/15min budget is honoured across all athletes' activity. The
 * single-worker design serialises concurrent backfills; this paces the requests
 * within and across them.
 */
const stravaRateLimiter = createRateLimiter(STRAVA_RATE_LIMIT)

/** Map one Strava summary activity onto the provider-neutral import shape. */
export function mapActivityToImportInput(
	activity: StravaActivity,
): ActivityImportInput {
	const discipline = stravaTypeToDiscipline(
		activity.sport_type ?? activity.type ?? '',
	)
	const startedAt = new Date(activity.start_date)
	const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0
	const elapsedSec = activity.elapsed_time ?? durationSec
	const endedAt = new Date(startedAt.getTime() + elapsedSec * 1000)
	const distanceM = activity.distance ?? null
	const paceAvgSecPerKm =
		distanceM != null && distanceM > 0 && durationSec > 0
			? durationSec / (distanceM / 1000)
			: null

	return {
		externalProvider: 'strava',
		externalId: activity.id,
		startedAt,
		endedAt,
		durationSec,
		distanceM,
		discipline,
		hrAvg: activity.average_heartrate ?? null,
		hrMax: activity.max_heartrate ?? null,
		powerAvg: activity.average_watts ?? null,
		powerMax: activity.max_watts ?? null,
		powerWeightedAvg: activity.weighted_average_watts ?? null,
		cadenceAvg: activity.average_cadence ?? null,
		paceAvgSecPerKm,
		speedMaxMps: activity.max_speed ?? null,
		elevationGainM: activity.total_elevation_gain ?? null,
		kilojoules: activity.kilojoules ?? null,
		// `.passthrough()` (see types.ts) means `activity` still carries every
		// field Strava sent, so this snapshot is the full payload, not just the
		// modeled subset.
		polyline: activity.map?.summary_polyline ?? null,
		rawJson: JSON.stringify(activity),
	}
}

/**
 * File a batch of fetched activities as `ActivityImport` rows and auto-match
 * each modeled-discipline import to an existing planned session — the pipeline
 * shared by manual sync (#72) and the reconciliation poll (#77). Both link to
 * existing sessions only; auto-creating recording-only sessions is backfill's
 * (#74) job alone.
 *
 * Idempotent: a duplicate hits the unique `(provider, externalId)` guard and is
 * counted as `skipped` rather than re-imported. `'other'` imports (ADR 0015) are
 * excluded from auto-match and wait in the inbox. `latestActivityAt` is the most
 * recent activity start time seen, for callers that advance a watermark.
 */
export async function fileActivitiesWithAutoMatch(
	athleteId: string,
	activities: StravaActivity[],
	timezone: string,
): Promise<{
	created: number
	skipped: number
	latestActivityAt: Date | null
}> {
	let created = 0
	let skipped = 0
	let latestActivityAt: Date | null = null

	for (const activity of activities) {
		const input = mapActivityToImportInput(activity)
		if (latestActivityAt == null || input.startedAt > latestActivityAt) {
			latestActivityAt = input.startedAt
		}

		let importId: string
		try {
			importId = (await createActivityImport(athleteId, input)).id
		} catch (err) {
			if (
				err instanceof Error &&
				err.message.toLowerCase().includes('unique')
			) {
				skipped++
				continue
			}
			throw err
		}
		created++

		if (input.discipline !== 'other') {
			await autoMatchImport(athleteId, importId, timezone)
		}
	}

	return { created, skipped, latestActivityAt }
}

type ConnectionRef = Pick<
	AccountConnection,
	'id' | 'accessToken' | 'refreshToken' | 'expiresAt'
>

/**
 * Fetch all Strava activities created after `afterUnixSec`, walking pages until
 * a short page (or the safety cap) ends the cursor. Token refresh and the
 * revoked-grant signal are handled by the API client.
 */
export async function fetchStravaActivitiesAfter(
	connection: ConnectionRef,
	afterUnixSec: number,
): Promise<StravaActivity[]> {
	const all: StravaActivity[] = []
	for (let page = 1; page <= MAX_PAGES; page++) {
		await stravaRateLimiter.acquire()
		const activities = StravaActivitiesSchema.parse(
			await stravaApiGet(
				connection,
				`/athlete/activities?after=${afterUnixSec}&per_page=${PER_PAGE}&page=${page}`,
			),
		)
		if (activities.length === 0) break
		all.push(...activities)
		if (activities.length < PER_PAGE) break
	}
	return all
}

/**
 * Fetch a single Strava activity by its external id. Used by the webhook fetch
 * worker (#76), which receives only `{ object_id }` and must pull the body out
 * of band. Shares the process-wide rate limiter so a burst of webhook events
 * stays within the per-app budget.
 */
export async function fetchStravaActivityById(
	connection: ConnectionRef,
	externalId: string,
): Promise<StravaActivity> {
	await stravaRateLimiter.acquire()
	return StravaActivitySchema.parse(
		await stravaApiGet(connection, `/activities/${externalId}`),
	)
}
