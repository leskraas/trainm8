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
 * paginated cursors.
 */
export function intervalsIcuActivitiesPath(
	externalAthleteId: string,
	{ oldest, newest }: { oldest: Date; newest: Date },
): string {
	const params = new URLSearchParams({
		oldest: oldest.toISOString(),
		newest: newest.toISOString(),
	})
	return `/athlete/${encodeURIComponent(externalAthleteId)}/activities?${params}`
}

/** The per-activity streams endpoint, filtered to the modeled channels. */
export function intervalsIcuStreamsPath(externalId: string): string {
	return `/activity/${encodeURIComponent(externalId)}/streams?types=time,heartrate,watts,velocity_smooth`
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
