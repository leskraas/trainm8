import {
	autoMatchImport,
	createActivityImport,
	type ActivityImportInput,
} from '#app/utils/activity-import.server.ts'
import { isNum, type RawStream } from '#app/utils/activity-stream.ts'
import { enrichImportTelemetry } from '#app/utils/activity-telemetry.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { IntervalsIcuApiError, intervalsIcuApiGet } from './client.server.ts'
import { intervalsIcuTypeToDiscipline } from './discipline-map.ts'
import {
	createCourtesyPacer,
	INTERVALSICU_COURTESY_INTERVAL_MS,
} from './pacer.ts'
import {
	INTERVALSICU_PROVIDER,
	IntervalsIcuActivitiesSchema,
	intervalsIcuActivitiesPath,
	IntervalsIcuStreamsSchema,
	intervalsIcuStreamsPath,
	type IntervalsIcuActivity,
} from './types.ts'

/**
 * Intervals.icu ingest primitives for the Backfill Window (#204): the pure
 * activity → `ActivityImportInput` mapping, the windowed activity list fetch,
 * and per-activity telemetry (streams + phase bars). Import parity with Strava
 * happens here: everything downstream of `ActivityImportInput` and `RawStream`
 * is the shared provider-neutral pipeline (promotion, Telemetry Overlay, TSS,
 * Training Load), untouched by this provider.
 */

/**
 * Process-wide courtesy pacer shared by every Intervals.icu fetch, so a
 * backfill never bursts against the API (well within the 5,000 requests/day
 * per-athlete budget — see pacer.ts for why no sliding-window limiter).
 */
const intervalsIcuPacer = createCourtesyPacer({
	minIntervalMs: INTERVALSICU_COURTESY_INTERVAL_MS,
})

/**
 * Map one Intervals.icu activity onto the provider-neutral import shape.
 *
 * Intervals.icu's *computed* fitness numbers (`icu_training_load`, CTL, ATL)
 * are never imported — trainm8 earns TSS and Training Load from the activity's
 * own data (GOAL.md building principle); the source's opinions survive only
 * inside the `rawJson` snapshot.
 */
export function mapActivityToImportInput(
	activity: IntervalsIcuActivity,
): ActivityImportInput {
	const discipline = intervalsIcuTypeToDiscipline(activity.type ?? '')
	// Prefer the UTC timestamp; `start_date_local` is a fallback for bodies
	// that omit it (parsed as-is — without an offset it is only approximate).
	const startedAt = new Date(
		activity.start_date ?? activity.start_date_local ?? 0,
	)
	const durationSec = activity.moving_time ?? activity.elapsed_time ?? 0
	const elapsedSec = activity.elapsed_time ?? durationSec
	const endedAt = new Date(startedAt.getTime() + elapsedSec * 1000)
	const distanceM = activity.distance ?? null
	const paceAvgSecPerKm =
		distanceM != null && distanceM > 0 && durationSec > 0
			? durationSec / (distanceM / 1000)
			: null

	return {
		externalProvider: INTERVALSICU_PROVIDER,
		externalId: activity.id,
		startedAt,
		endedAt,
		durationSec,
		distanceM,
		discipline,
		hrAvg: activity.average_heartrate ?? null,
		hrMax: activity.max_heartrate ?? null,
		powerAvg: activity.icu_average_watts ?? activity.average_watts ?? null,
		powerMax: activity.max_watts ?? null,
		powerWeightedAvg:
			activity.icu_weighted_avg_watts ??
			activity.weighted_average_watts ??
			null,
		cadenceAvg: activity.average_cadence ?? null,
		paceAvgSecPerKm,
		speedMaxMps: activity.max_speed ?? null,
		elevationGainM: activity.total_elevation_gain ?? null,
		kilojoules: activity.icu_joules != null ? activity.icu_joules / 1000 : null,
		// Intervals.icu's list endpoint carries no route polyline.
		polyline: null,
		// `.passthrough()` (see types.ts) means `activity` still carries every
		// field Intervals.icu sent — including its computed load numbers — so
		// this snapshot is the full payload, not just the modeled subset.
		rawJson: JSON.stringify(activity),
	}
}

/**
 * File a batch of fetched activities as `ActivityImport`s for manual sync and
 * reconciliation (#205), auto-*matching* only — link an import to a single
 * same-day same-discipline planned session when one exists, but never create
 * recording-only sessions (that is the Backfill Window's job, #204).
 * Idempotent via the unique `(provider, externalId)` guard: an activity we
 * already hold is counted as skipped, not re-imported. Mirrors Strava's
 * `fileActivitiesWithAutoMatch`.
 */
export async function fileIntervalsIcuActivities(
	athleteId: string,
	activities: IntervalsIcuActivity[],
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

		// 'other' is import-only (ADR 0015): never auto-matched.
		if (input.discipline !== 'other') {
			await autoMatchImport(athleteId, importId, timezone)
		}
	}

	return { created, skipped, latestActivityAt }
}

/**
 * List every activity in the `[oldest, newest]` window. Intervals.icu's list
 * endpoint takes the window directly (no cursor pagination); key rejection
 * (401/403) surfaces as `IntervalsIcuKeyRejectedError` from the client.
 */
export async function fetchIntervalsIcuActivitiesBetween(
	connection: { externalAthleteId: string; accessToken: string },
	window: { oldest: Date; newest: Date },
): Promise<IntervalsIcuActivity[]> {
	await intervalsIcuPacer.acquire()
	return IntervalsIcuActivitiesSchema.parse(
		await intervalsIcuApiGet(
			connection.accessToken,
			intervalsIcuActivitiesPath(connection.externalAthleteId, window),
		),
	)
}

/**
 * Fetch an activity's per-sample telemetry and adapt it to the provider-neutral
 * `RawStream` the downsampler consumes (ADR 0020), or `null` when the activity
 * carries no usable streams (manual entry, no device — Intervals.icu answers
 * 404 or an empty channel list). Speed (`velocity_smooth`, m/s) converts per
 * sample to pace in sec/km — a stop reads as a `null` gap, not infinite pace.
 */
export async function fetchIntervalsIcuActivityStreams(
	apiKey: string,
	externalId: string,
): Promise<RawStream | null> {
	await intervalsIcuPacer.acquire()
	let body: unknown
	try {
		body = await intervalsIcuApiGet(apiKey, intervalsIcuStreamsPath(externalId))
	} catch (err) {
		// No recorded streams for this activity — degrade, don't fail (#204).
		if (err instanceof IntervalsIcuApiError && err.status === 404) return null
		throw err
	}
	const parsed = IntervalsIcuStreamsSchema.safeParse(body)
	if (!parsed.success) return null

	const byType = new Map(parsed.data.map((s) => [s.type, s.data]))
	const rawTime = byType.get('time')
	if (!rawTime?.length) return null
	// Keep channels index-aligned: drop any sample whose time is missing.
	const keep: number[] = []
	for (let i = 0; i < rawTime.length; i++) {
		if (isNum(rawTime[i])) keep.push(i)
	}
	if (keep.length === 0) return null
	const pick = (data: Array<number | null>) => keep.map((i) => data[i] ?? null)

	const raw: RawStream = { time: keep.map((i) => rawTime[i]!) }
	const heartrate = byType.get('heartrate')
	if (heartrate?.length) raw.heartrate = pick(heartrate)
	const power = byType.get('watts')
	if (power?.length) raw.power = pick(power)
	const velocity = byType.get('velocity_smooth')
	if (velocity?.length) {
		raw.pace = pick(velocity).map((v) => (isNum(v) && v > 0 ? 1000 / v : null))
	}
	return raw
}

/**
 * Best-effort: for each modeled-discipline activity, fetch its per-sample
 * telemetry once and persist both the downsampled Activity Stream (ADR 0020 —
 * feeding the Telemetry Overlay and NP-based TSS, ADR 0024) and, when the
 * athlete has a threshold HR for the discipline, the HR phase bars. Skips
 * `'other'` activities (no overlay, ADR 0015), imports we don't have, and
 * imports already carrying a stream (idempotent + spares a redundant fetch on
 * retry). An activity with no usable streams persists nothing — its metrics
 * read as Unavailable rather than fabricated. Never throws — telemetry is an
 * enrichment, never load-bearing for the backfill's success.
 */
export async function ingestActivityTelemetry(
	connection: { athleteId: string; accessToken: string },
	activities: IntervalsIcuActivity[],
): Promise<void> {
	for (const activity of activities) {
		const discipline = intervalsIcuTypeToDiscipline(activity.type ?? '')
		if (discipline === 'other') continue

		try {
			const existing = await prisma.activityImport.findUnique({
				where: {
					externalProvider_externalId: {
						externalProvider: INTERVALSICU_PROVIDER,
						externalId: activity.id,
					},
				},
				select: { id: true, stream: { select: { id: true } } },
			})
			if (!existing || existing.stream) continue

			const raw = await fetchIntervalsIcuActivityStreams(
				connection.accessToken,
				activity.id,
			)
			if (!raw) continue
			await enrichImportTelemetry(
				connection.athleteId,
				existing.id,
				discipline,
				raw,
			)
		} catch {
			// One activity's stream failing must not abort the rest.
		}
	}
}
