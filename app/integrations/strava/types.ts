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
