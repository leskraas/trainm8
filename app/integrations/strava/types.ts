import { z } from 'zod'

/**
 * Strava-native API types and parse schemas. Private to the Strava integration
 * folder (ADR 0014) — nothing outside `app/integrations/strava/` should import
 * these; the rest of the app speaks `ActivityImportInput` and the shared
 * `AccountConnection` model.
 */

export const STRAVA_PROVIDER = 'strava' as const

/** Scope required to read all of an athlete's activities (incl. private). */
export const STRAVA_SCOPE = 'activity:read_all'

export const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3'

/** The athlete summary Strava returns alongside a token exchange. */
export const StravaAthleteSchema = z.object({
	id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	username: z.string().nullish(),
	firstname: z.string().nullish(),
	lastname: z.string().nullish(),
})
export type StravaAthlete = z.infer<typeof StravaAthleteSchema>

/**
 * Strava's `/oauth/token` response. `expires_at` is a Unix timestamp in
 * seconds; refresh tokens rotate on each refresh and must be persisted
 * (ADR 0013).
 */
export const StravaTokenResponseSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	expires_at: z.number(),
	token_type: z.string().optional(),
	athlete: StravaAthleteSchema.optional(),
})
export type StravaTokenResponse = z.infer<typeof StravaTokenResponseSchema>

/**
 * A Strava summary activity as returned by `GET /athlete/activities`. We model
 * the fields the ingest pipeline maps onto an `ActivityImport`; `.passthrough()`
 * keeps every other field on the parsed object so the whole payload is preserved
 * verbatim in `rawJson` (lossless — nothing Strava sends is silently dropped).
 * `sport_type` is the modern field (preferred); `type` is the legacy fallback.
 * Distances are in metres, speeds in m/s, times in seconds; `start_date` is an
 * ISO-8601 UTC timestamp.
 */
export const StravaActivitySchema = z
	.object({
		id: z.union([z.number(), z.string()]).transform((id) => String(id)),
		name: z.string().nullish(),
		distance: z.number().nullish(),
		moving_time: z.number().nullish(),
		elapsed_time: z.number().nullish(),
		type: z.string().nullish(),
		sport_type: z.string().nullish(),
		start_date: z.string(),
		average_heartrate: z.number().nullish(),
		max_heartrate: z.number().nullish(),
		average_watts: z.number().nullish(),
		max_watts: z.number().nullish(),
		weighted_average_watts: z.number().nullish(),
		average_cadence: z.number().nullish(),
		max_speed: z.number().nullish(),
		total_elevation_gain: z.number().nullish(),
		kilojoules: z.number().nullish(),
		map: z
			.object({ summary_polyline: z.string().nullish() })
			.passthrough()
			.nullish(),
	})
	.passthrough()
export type StravaActivity = z.infer<typeof StravaActivitySchema>

export const StravaActivitiesSchema = z.array(StravaActivitySchema)

/**
 * A Strava activity stream set as returned by
 * `GET /activities/{id}/streams?keys=time,heartrate,watts,velocity_smooth&key_by_type=true`.
 * Each requested key is its own `{ data: [...] }` channel; absent channels (e.g.
 * a run with no HR strap, or a ride without a power meter) are simply missing.
 * `time` and `heartrate` feed phase-bar derivation; `watts` (power) and
 * `velocity_smooth` (m/s speed, converted to pace at ingest) join them to build
 * the Activity Stream overlay (#139). Channel arrays are index-aligned with
 * `time`; `watts`/`velocity_smooth` may carry `null` samples where the device had
 * no reading. `.passthrough()` keeps any other requested channel around.
 */
export const StravaStreamSetSchema = z
	.object({
		time: z.object({ data: z.array(z.number()) }).nullish(),
		heartrate: z.object({ data: z.array(z.number()) }).nullish(),
		watts: z.object({ data: z.array(z.number().nullable()) }).nullish(),
		velocity_smooth: z
			.object({ data: z.array(z.number().nullable()) })
			.nullish(),
	})
	.passthrough()
export type StravaStreamSet = z.infer<typeof StravaStreamSetSchema>
