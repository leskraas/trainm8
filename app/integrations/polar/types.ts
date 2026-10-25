import { z } from 'zod/v4'

/**
 * Polar AccessLink v3 wire shapes and constants (ADR 0108). Private to the
 * Polar folder (ADR 0014): the rest of the app speaks `ingestFit` and the
 * shared `AccountConnection` model.
 *
 * Endpoints from https://www.polar.com/accesslink-api/ (read 2026-10-24). The
 * transactional exercise endpoints are deprecated there, so trainm8 reads the
 * non-transactional ones: `GET /v3/exercises` (the last 30 days, only what
 * reached Flow after the athlete registered with our client) and
 * `GET /v3/exercises/{id}/fit`.
 */

export const POLAR_PROVIDER = 'polar' as const

export const POLAR_AUTHORIZE_URL = 'https://flow.polar.com/oauth2/authorization'
export const POLAR_TOKEN_URL = 'https://polarremote.com/v2/oauth2/token'
export const POLAR_API_BASE = 'https://www.polaraccesslink.com/v3'
export const POLAR_SCOPE = 'accesslink.read_all'

/** How the bytes reached trainm8, kept with the original file. */
export const POLAR_FETCHED_VIA = 'polar-accesslink'

/** The largest FIT trainm8 accepts from Polar, as for an upload (#548). */
export const POLAR_MAX_FIT_BYTES = 64 * 1024 * 1024

/** A stalled Polar call must not hold a sync or webhook job open. */
export const POLAR_REQUEST_TIMEOUT_MS = 30_000

/**
 * The EXERCISE webhook body. `user_id` is the Polar user id
 * (`AccountConnection.externalAthleteId`), `entity_id` the hashed exercise id.
 */
export const PolarWebhookEventSchema = z.object({
	event: z.string(),
	user_id: z.union([z.number(), z.string()]).transform(String).optional(),
	entity_id: z.string().optional(),
	timestamp: z.string().optional(),
	url: z.string().optional(),
})

/** One item of `GET /v3/exercises` (a bare array). Only the id is read. */
export const PolarExerciseListSchema = z.array(
	z.looseObject({ id: z.string() }),
)
