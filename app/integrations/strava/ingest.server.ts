import { type AccountConnection } from '@prisma/client'
import { fileActivityImport } from '#app/integrations/shared/file-activity-import.server.ts'
import {
	autoSaveImport,
	recomputeLoadAfterBatch,
	type ActivityImportInput,
} from '#app/utils/activity-import.server.ts'
import { isNum, type RawStream } from '#app/utils/activity-stream.ts'
import {
	enrichImportTelemetry,
	persistActivityLaps,
} from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { rethrowDeferral } from '#app/utils/jobs/queue.server.ts'
import { type Lap } from '#app/utils/structure-detection/types.ts'
import { stravaApiGet } from './client.server.ts'
import { stravaTypeToDiscipline } from './discipline-map.ts'
import { type RateLimitLane } from './rate-limit.ts'
import {
	STRAVA_PROVIDER,
	StravaActivitiesSchema,
	StravaActivitySchema,
	StravaLapsSchema,
	StravaStreamSetSchema,
	type StravaActivity,
	type StravaLap,
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
 * shared by manual sync (#72) and the reconciliation poll (#77). Every activity
 * auto-saves (ADR 0049): matched onto a same-day planned session when exactly
 * one fits, else onto a recording-only session of its own — the same landing
 * every other ingest path uses.
 *
 * Idempotent: a duplicate hits the unique `(athlete, provider, externalId)` guard and is
 * counted as `skipped` rather than re-imported. `'other'` imports (ADR 0015)
 * never match a plan but still get their own session. `latestActivityAt` is the
 * most recent activity start time seen, for callers that advance a watermark.
 */
export async function fileActivitiesWithAutoSave(
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
	let oldestCreatedAt: Date | null = null

	try {
		for (const activity of activities) {
			const input = mapActivityToImportInput(activity)
			if (latestActivityAt == null || input.startedAt > latestActivityAt) {
				latestActivityAt = input.startedAt
			}

			// The dedupe choke point (ADR 0096 §4): an activity already held —
			// this key again, or the same run from another source — is skipped,
			// the latter kept as an alias.
			const filed = await fileActivityImport(athleteId, input)
			if (filed.kind === 'duplicate') {
				skipped++
				continue
			}
			const importId = filed.importId
			created++
			if (oldestCreatedAt == null || input.startedAt < oldestCreatedAt) {
				oldestCreatedAt = input.startedAt
			}

			await autoSaveImport(athleteId, importId, timezone, {
				recomputeLoad: false,
			})
		}
	} finally {
		// One load recompute for the batch, from its oldest new import's day —
		// also when an activity throws, so the imports already saved count.
		await recomputeLoadAfterBatch(athleteId, oldestCreatedAt, timezone)
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
 * of band. Paced in the limiter's `live` lane, so a burst of webhook events
 * stays within the per-app budget without waiting behind a backfill.
 */
export async function fetchStravaActivityById(
	connection: ConnectionRef,
	externalId: string,
): Promise<StravaActivity> {
	return StravaActivitySchema.parse(
		await stravaApiGet(connection, `/activities/${externalId}`, 'live'),
	)
}

/**
 * Fetch an activity's per-sample telemetry and adapt it to the provider-neutral
 * `RawStream` the downsampler consumes, or `null` when the activity carries no
 * usable streams (manual upload, no device, or Strava omits every channel).
 * Requests the elapsed-time axis plus the modeled channels: heart rate, power
 * (`watts`), and speed (`velocity_smooth`, converted per sample to pace in
 * sec/km — a stop reads as a `null` gap, not an infinite pace). Shares the
 * process-wide rate limiter like every other Strava fetch, in `lane`.
 */
export async function fetchStravaActivityStreams(
	connection: ConnectionRef,
	externalId: string,
	lane: RateLimitLane = 'bulk',
): Promise<RawStream | null> {
	const parsed = StravaStreamSetSchema.safeParse(
		await stravaApiGet(
			connection,
			`/activities/${externalId}/streams?keys=time,heartrate,watts,velocity_smooth&key_by_type=true`,
			lane,
		),
	)
	if (!parsed.success) return null
	const time = parsed.data.time?.data
	if (!time?.length) return null

	const raw: RawStream = { time }
	const heartrate = parsed.data.heartrate?.data
	if (heartrate?.length) raw.heartrate = heartrate
	const power = parsed.data.watts?.data
	if (power?.length) raw.power = power
	const velocity = parsed.data.velocity_smooth?.data
	if (velocity?.length) {
		raw.pace = velocity.map((v) => (isNum(v) && v > 0 ? 1000 / v : null))
	}
	return raw
}

/**
 * Fetch an activity's provider laps via `GET /activities/{id}/laps`. Returns
 * `null` on a shape that doesn't parse (never throws for a bad body) so a
 * missing/malformed laps response degrades to stream-only detection (#356).
 * Shares the process-wide rate limiter like every other Strava fetch, in `lane`.
 */
export async function fetchStravaActivityLaps(
	connection: ConnectionRef,
	externalId: string,
	lane: RateLimitLane = 'bulk',
): Promise<StravaLap[] | null> {
	const parsed = StravaLapsSchema.safeParse(
		await stravaApiGet(connection, `/activities/${externalId}/laps`, lane),
	)
	if (!parsed.success) return null
	return parsed.data
}

/**
 * Adapt Strava's lap objects to the engine's provider-neutral `{ startSec,
 * endSec }` markers on the stream's elapsed-second axis (#356). A single
 * whole-activity lap is "no laps pressed" and yields nothing — laps must be real
 * interior edges. Each lap's bounds come, in order of fidelity, from:
 *   1. its `start_index`/`end_index` into the raw stream, when a `time` axis is
 *      supplied — exact, and the same axis the stored Activity Stream inherits;
 *   2. its `start_date` offset against the activity start plus `elapsed_time` —
 *      the wall-clock fallback a backfill uses without the raw stream in hand
 *      (every Strava lap carries `start_date`).
 * A lap that resolves by neither carries no trustworthy edge and is dropped
 * (fewer/no laps, stream-only detection) rather than positioned by guesswork;
 * laps without a positive span are likewise dropped. The engine's honesty gate
 * (ADR 0033) — not a here-guessed trust heuristic — decides whether the edges
 * are structure.
 */
export function stravaLapsToMarkers(
	laps: StravaLap[],
	opts: { time?: number[]; activityStartMs?: number } = {},
): Lap[] {
	// One lap spanning the whole activity means the athlete pressed no laps.
	if (laps.length <= 1) return []
	const { time, activityStartMs } = opts
	const markers: Lap[] = []
	for (const lap of laps) {
		let startSec: number | null = null
		let endSec: number | null = null

		// 1) Raw-stream indices — exact edges on the stored stream's axis.
		if (
			time != null &&
			lap.start_index != null &&
			lap.end_index != null &&
			lap.start_index >= 0 &&
			lap.end_index < time.length &&
			lap.end_index > lap.start_index
		) {
			startSec = time[lap.start_index] ?? null
			endSec = time[lap.end_index] ?? null
		}

		// 2) Wall-clock offset from the activity start (backfill has no raw stream).
		if (
			(startSec == null || endSec == null) &&
			activityStartMs != null &&
			lap.start_date != null &&
			lap.elapsed_time != null &&
			lap.elapsed_time > 0
		) {
			const lapStartMs = new Date(lap.start_date).getTime()
			if (!Number.isNaN(lapStartMs)) {
				startSec = Math.max(
					0,
					Math.round((lapStartMs - activityStartMs) / 1000),
				)
				endSec = startSec + lap.elapsed_time
			}
		}

		if (startSec != null && endSec != null && endSec > startSec) {
			markers.push({ startSec, endSec })
		}
	}
	return markers
}

/**
 * Best-effort: fetch an activity's provider laps and persist them as the
 * import's lap markers (#356), mapped against the raw stream axis. Never throws
 * — laps are a Structure Detection refinement, so a fetch/shape failure leaves
 * the import lap-less (stream-only detection) rather than blocking telemetry.
 * Must run *before* the caller enqueues detection so the lap-edged path is used
 * on the first compute.
 */
export async function ingestActivityLaps(
	connection: ConnectionRef,
	externalId: string,
	activityImportId: string,
	streamTime: number[],
	activityStartMs?: number,
	lane: RateLimitLane = 'bulk',
): Promise<void> {
	try {
		const laps = await fetchStravaActivityLaps(connection, externalId, lane)
		if (!laps) return
		const markers = stravaLapsToMarkers(laps, {
			time: streamTime,
			activityStartMs,
		})
		if (markers.length > 0) await persistActivityLaps(activityImportId, markers)
	} catch (err) {
		// Laps are a refinement; a failure must never abort the enclosing ingest.
		// A spent Strava budget is not a failure: the job waits for it (#637).
		rethrowDeferral(err)
	}
}

/**
 * Best-effort: for each modeled-discipline activity, fetch its per-sample
 * telemetry, downsample it (ADR 0020), and persist it as the Activity Import's
 * Activity Stream — the data the Workout Detail View overlays against the plan
 * (#139) — with its HR phase bars, then enqueue Structure Detection. Skips
 * `'other'` activities (no overlay), imports we don't have, and imports already
 * carrying a stream (idempotent + spares a redundant stream call on re-sync).
 * An activity with no usable streams persists nothing. Never throws —
 * telemetry is an enrichment, never load-bearing for a sync's success — except
 * `DeferJob` when Strava's budget is spent, so the job resumes later. `lane`
 * is the rate-limit lane its Strava calls are paced in.
 */
export async function ingestActivityStreams(
	connection: ConnectionRef & { athleteId: string },
	activities: StravaActivity[],
	lane: RateLimitLane = 'bulk',
): Promise<void> {
	for (const activity of activities) {
		const discipline = stravaTypeToDiscipline(
			activity.sport_type ?? activity.type ?? '',
		)
		if (discipline === 'other') continue

		try {
			const existing = await prisma.activityImport.findUnique({
				where: {
					athleteId_externalProvider_externalId: {
						athleteId: connection.athleteId,
						externalProvider: STRAVA_PROVIDER,
						externalId: activity.id,
					},
				},
				select: { id: true, stream: { select: { id: true } } },
			})
			if (!existing || existing.stream) continue

			const raw = await fetchStravaActivityStreams(
				connection,
				activity.id,
				lane,
			)
			if (!raw) continue
			// Provider laps first (#356): ground-truth edges for the lap-edged path,
			// persisted before the stream so any detection reads them on first compute.
			await ingestActivityLaps(
				connection,
				activity.id,
				existing.id,
				raw.time,
				new Date(activity.start_date).getTime(),
				lane,
			)
			// The shared enrichment (#611): stream, HR phase bars and the detection
			// enqueue, all from this one streams call.
			await enrichImportTelemetry(
				connection.athleteId,
				existing.id,
				discipline,
				raw,
			)
		} catch (err) {
			// One activity's stream failing (fetch error, or a concurrent trigger
			// that already inserted the row) must not abort the rest. A spent
			// Strava budget would fail every one of them, so the job waits instead.
			rethrowDeferral(err)
		}
	}
}
