import { intervalsIcuApiGet } from './client.server.ts'
import {
	INTERVALSICU_ATHLETE_SELF_PATH,
	IntervalsIcuAthleteSchema,
} from './types.ts'

/**
 * Domain-side result of connecting an Intervals.icu account: the external
 * athlete id plus the credential fields, ready to hand to
 * `connectAccountConnection`. The API key is the credential — stored in
 * `accessToken`, with no refresh token and no expiry (ADR 0026 #4).
 */
export type IntervalsIcuConnectionMetadata = {
	externalAthleteId: string
	accessToken: string
	refreshToken: null
	expiresAt: null
}

/**
 * Validate a pasted personal API key against Intervals.icu's athlete-self
 * endpoint and read the external athlete id from the response. Throws
 * `IntervalsIcuKeyRejectedError` when the key is rejected (401/403 — bad,
 * regenerated, or deleted) and `IntervalsIcuApiError` on other failures;
 * the caller stores nothing in either case.
 */
export async function connectIntervalsIcuAccount(
	apiKey: string,
): Promise<IntervalsIcuConnectionMetadata> {
	const athlete = IntervalsIcuAthleteSchema.parse(
		await intervalsIcuApiGet(apiKey, INTERVALSICU_ATHLETE_SELF_PATH),
	)
	return {
		externalAthleteId: athlete.id,
		accessToken: apiKey,
		refreshToken: null,
		expiresAt: null,
	}
}
