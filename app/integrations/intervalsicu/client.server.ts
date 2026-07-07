import { INTERVALSICU_API_BASE } from './types.ts'

/**
 * Intervals.icu API client. Auth is HTTP Basic with the literal username
 * `API_KEY` and the athlete's personal API key as the password (ADR 0026 #3).
 * Keys neither rotate nor expire, so unlike the Strava client there is no
 * refresh machinery — a 401/403 means the key is no longer valid at the
 * source (the athlete regenerated or deleted it).
 *
 * V1 surface is intentionally small: `intervalsIcuApiGet`, used by the
 * connect flow's key validation. Ingest endpoints join in the backfill slice.
 */

/**
 * Thrown when Intervals.icu rejects the API key (401/403). Permanent for this
 * key: regenerating a key at Intervals.icu invalidates the old one, so the
 * only remedy is pasting a fresh key. Callers on a stored connection flip it
 * to `revoked`; the connect flow surfaces it as an inline form error.
 */
export class IntervalsIcuKeyRejectedError extends Error {
	constructor(message = 'Intervals.icu rejected the API key') {
		super(message)
		this.name = 'IntervalsIcuKeyRejectedError'
	}
}

/** Thrown on any other non-OK Intervals.icu response (treat as transient). */
export class IntervalsIcuApiError extends Error {
	readonly status: number

	constructor(message: string, status: number) {
		super(message)
		this.name = 'IntervalsIcuApiError'
		this.status = status
	}
}

/** The HTTP Basic Authorization header for a personal API key. */
export function intervalsIcuAuthHeader(apiKey: string): string {
	return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString('base64')}`
}

/**
 * Authenticated GET against the Intervals.icu API. Throws
 * `IntervalsIcuKeyRejectedError` on 401/403 (bad or regenerated key) and
 * `IntervalsIcuApiError` on any other non-OK status.
 */
export async function intervalsIcuApiGet<T>(
	apiKey: string,
	path: string,
): Promise<T> {
	const response = await fetch(`${INTERVALSICU_API_BASE}${path}`, {
		headers: {
			authorization: intervalsIcuAuthHeader(apiKey),
			accept: 'application/json',
		},
	})
	if (response.status === 401 || response.status === 403) {
		throw new IntervalsIcuKeyRejectedError(
			`Intervals.icu rejected the API key on GET ${path} (${response.status})`,
		)
	}
	if (!response.ok) {
		throw new IntervalsIcuApiError(
			`Intervals.icu API GET ${path} failed (${response.status})`,
			response.status,
		)
	}
	return response.json() as Promise<T>
}
