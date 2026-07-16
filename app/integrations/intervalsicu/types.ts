import { z } from 'zod'

/**
 * Intervals.icu-native API types and parse schemas. Private to the
 * Intervals.icu integration folder (ADR 0014) — nothing outside
 * `app/integrations/intervalsicu/` should import these; the rest of the app
 * speaks `ActivityImportInput` and the shared `AccountConnection` model.
 */

export const INTERVALSICU_PROVIDER = 'intervalsicu' as const

export const INTERVALSICU_API_BASE = 'https://intervals.icu/api/v1'

/**
 * The athlete-self endpoint: `athlete/0` resolves to whoever owns the API key,
 * which both validates the key and yields the external athlete id (ADR 0026).
 */
export const INTERVALSICU_ATHLETE_SELF_PATH = '/athlete/0'

/**
 * The athlete object returned by `GET /athlete/{id}`. Intervals.icu athlete
 * ids look like `i12345`; tolerate a bare number just in case.
 */
export const IntervalsIcuAthleteSchema = z.object({
	id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	name: z.string().nullish(),
})
export type IntervalsIcuAthlete = z.infer<typeof IntervalsIcuAthleteSchema>

/**
 * The activity list endpoint for the Backfill Window (#204): Intervals.icu
 * lists activities with `oldest`/`newest` window parameters rather than
 * paginated cursors. Per the API's own OpenAPI docs both are "Local ISO-8601
 * date or date and time e.g. 2019-07-22T16:18:49 or 2019-07-22" — a zone
 * suffix (like `Date.toISOString()`'s trailing `Z`) is rejected, so instants
 * are rendered as wall-clock time in the athlete's timezone. A profile
 * timezone that differs from the athlete's Intervals.icu one only shifts the
 * window edges; idempotent `(provider, externalId)` filing and the sweep's
 * overlap absorb that.
 */
export function intervalsIcuActivitiesPath(
	externalAthleteId: string,
	{
		oldest,
		newest,
		timezone,
	}: { oldest: Date; newest: Date; timezone: string },
): string {
	const params = new URLSearchParams({
		oldest: intervalsIcuLocalDateTime(oldest, timezone),
		newest: intervalsIcuLocalDateTime(newest, timezone),
	})
	return `/athlete/${encodeURIComponent(externalAthleteId)}/activities?${params}`
}

/** An instant as the zone-less local ISO-8601 date-time the API expects. */
export function intervalsIcuLocalDateTime(
	date: Date,
	timezone: string,
): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date)
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)!.value
	return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

/** The per-activity streams endpoint, filtered to the modeled channels. */
export function intervalsIcuStreamsPath(externalId: string): string {
	return `/activity/${encodeURIComponent(externalId)}/streams?types=time,heartrate,watts,velocity_smooth`
}

/**
 * The per-activity intervals endpoint (#356): Intervals.icu's own detected (or
 * lap-derived, per the athlete's setting) interval breakdown — the highest-trust
 * external structure signal, athlete-editable and pre-typed `WORK`/`RECOVERY`.
 */
export function intervalsIcuIntervalsPath(externalId: string): string {
	return `/activity/${encodeURIComponent(externalId)}/intervals`
}

/**
 * One activity as listed by `GET /athlete/{id}/activities`. Kept tolerant
 * (`.passthrough()`, everything but `id` optional): the full body is snapshot
 * into `rawJson`, and the mapping layer only reads the modeled subset. Power
 * comes as `icu_average_watts` / `icu_weighted_avg_watts` (device fields may
 * also appear under the Strava-style names — accept both). Intervals.icu's own
 * computed load fields (`icu_training_load`, CTL/ATL) are deliberately NOT
 * modeled here: trainm8 never imports another platform's load numbers (#204,
 * building principle in GOAL.md) — they survive only inside the raw snapshot.
 */
export const IntervalsIcuActivitySchema = z
	.object({
		id: z.union([z.number(), z.string()]).transform((id) => String(id)),
		type: z.string().nullish(),
		start_date: z.string().nullish(),
		start_date_local: z.string().nullish(),
		moving_time: z.number().nullish(),
		elapsed_time: z.number().nullish(),
		distance: z.number().nullish(),
		average_heartrate: z.number().nullish(),
		max_heartrate: z.number().nullish(),
		icu_average_watts: z.number().nullish(),
		average_watts: z.number().nullish(),
		icu_weighted_avg_watts: z.number().nullish(),
		weighted_average_watts: z.number().nullish(),
		max_watts: z.number().nullish(),
		average_cadence: z.number().nullish(),
		max_speed: z.number().nullish(),
		total_elevation_gain: z.number().nullish(),
		icu_joules: z.number().nullish(),
	})
	.passthrough()
export type IntervalsIcuActivity = z.infer<typeof IntervalsIcuActivitySchema>

export const IntervalsIcuActivitiesSchema = z.array(IntervalsIcuActivitySchema)

/**
 * The streams endpoint returns an array of `{ type, data }` channels. Samples
 * may be `null` (sensor dropouts); non-numeric entries are treated as gaps.
 */
export const IntervalsIcuStreamsSchema = z.array(
	z
		.object({
			type: z.string(),
			data: z.array(z.union([z.number(), z.null()])).nullish(),
		})
		.passthrough(),
)

/**
 * One entry of the `icu_intervals` breakdown from `GET /activity/{id}/intervals`
 * (#356). `start_time`/`end_time` are elapsed seconds on the same axis as the
 * stream's `time` channel — the axis the stored Activity Stream inherits — so
 * they map straight onto the engine's `{ startSec, endSec }` with no index
 * arithmetic. The `WORK`/`RECOVERY` `type` and the per-interval aggregates ride
 * along in the raw body but aren't read here: the engine labels each edge from
 * the stream itself (ADR 0035), and laps only supply the edges.
 */
export const IntervalsIcuIntervalSchema = z
	.object({
		start_time: z.number().nullish(),
		end_time: z.number().nullish(),
		start_index: z.number().nullish(),
		end_index: z.number().nullish(),
		type: z.string().nullish(),
	})
	.passthrough()
export type IntervalsIcuInterval = z.infer<typeof IntervalsIcuIntervalSchema>

/**
 * The `IntervalsDTO` body. Only `icu_intervals` is modeled; `icu_groups`
 * (repeated-effort grouping) and `analyzed` ride along via `.passthrough()`.
 * Tolerant of a missing `icu_intervals` (a manual entry with no breakdown).
 */
export const IntervalsIcuIntervalsSchema = z
	.object({
		icu_intervals: z.array(IntervalsIcuIntervalSchema).nullish(),
	})
	.passthrough()
