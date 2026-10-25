import { type IntervalsIcuSyncResult } from './intervalsicu/sync.server.ts'
import { type StravaSyncResult } from './strava/sync.server.ts'

/**
 * What the Integration Hub's "Sync now" reads back from a provider's sync: the
 * union of each provider's own result. ADR 0014 stands, so providers implement
 * no shared interface; the hub narrows on `ok` and `reason` instead, and only
 * a `rate-limited` result carries a `retryAt`.
 */
export type SyncResult = StravaSyncResult | IntervalsIcuSyncResult

export type SyncSummary = {
	/** Activities filed across every provider that synced. */
	created: number
	/** The label of each provider whose sync failed, in order. */
	failed: string[]
	/** The earliest a rate-limited provider may be asked again, or `null`. */
	retryAt: Date | null
}

/** Fold each provider's result into the one toast the hub shows. */
export function summariseSyncs(
	results: ReadonlyArray<{ label: string; result: SyncResult }>,
): SyncSummary {
	let created = 0
	const failed: string[] = []
	let retryAt: Date | null = null
	for (const { label, result } of results) {
		if (result.ok) {
			created += result.created
			continue
		}
		failed.push(label)
		// The earliest wins: by then at least one of them may be asked again.
		if (
			result.reason === 'rate-limited' &&
			(retryAt == null || result.retryAt < retryAt)
		) {
			retryAt = result.retryAt
		}
	}
	return { created, failed, retryAt }
}
