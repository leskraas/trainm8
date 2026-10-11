/**
 * Display-only provider directory for the Integration Hub (ADR 0026 #2).
 *
 * This is UI metadata ONLY — name, tagline, auth kind, availability, connect
 * route, placeholder logo. ADR 0014 stands: there is no shared TypeScript
 * interface providers implement. Each hub card's actions post to that
 * provider's own routes; provider behavior stays in its folder. The directory
 * is just how the hub composes per-provider cards without a registry pattern
 * leaking into behavior.
 *
 * The words (name, tagline) are Norwegian and live in `labels.ts` (ADR 0081).
 */

import { PROVIDER_DIRECTORY_LABELS } from '#app/utils/labels.ts'

export type ProviderDirectoryEntry = {
	id: 'strava' | 'intervalsicu' | 'file-upload' | 'garmin' | 'suunto'
	name: string
	tagline: string
	/** How an athlete authorizes this source. `none` = no account to link. */
	authKind: 'oauth' | 'api-key' | 'none'
	/**
	 * - `live`        — fully working today (connect/upload flows exist).
	 * - `available`   — listed honestly, but its connect flow hasn't landed yet.
	 * - `coming-soon` — blocked on something outside trainm8 (named in the card).
	 */
	availability: 'live' | 'available' | 'coming-soon'
	/** Route the card's connect affordance targets, if one exists today. */
	connectRoute: string | null
	/**
	 * Placeholder identity tile — monogram in a brand-adjacent color until a
	 * real logo asset pass (design review, docs/design/integration-hub).
	 */
	monogram: string
	monogramClassName: string
}

export const PROVIDER_DIRECTORY: readonly ProviderDirectoryEntry[] = [
	{
		id: 'strava',
		...PROVIDER_DIRECTORY_LABELS['strava'],
		authKind: 'oauth',
		availability: 'live',
		connectRoute: '/integrations/strava/connect',
		monogram: 'S',
		monogramClassName: 'bg-[#fc5200] text-white',
	},
	{
		id: 'file-upload',
		...PROVIDER_DIRECTORY_LABELS['file-upload'],
		authKind: 'none',
		availability: 'live',
		connectRoute: '/imports/upload',
		monogram: '↑',
		monogramClassName:
			'border-muted-foreground text-muted-foreground border-2 border-dashed bg-transparent',
	},
	{
		id: 'intervalsicu',
		...PROVIDER_DIRECTORY_LABELS['intervalsicu'],
		authKind: 'api-key',
		availability: 'live',
		connectRoute: '/integrations/intervalsicu/connect',
		monogram: 'i',
		monogramClassName: 'bg-[#4653b0] text-white',
	},
	{
		id: 'garmin',
		...PROVIDER_DIRECTORY_LABELS['garmin'],
		authKind: 'oauth',
		availability: 'coming-soon',
		connectRoute: null,
		monogram: 'G',
		monogramClassName: 'bg-[#0a6cad] text-white',
	},
	{
		id: 'suunto',
		...PROVIDER_DIRECTORY_LABELS['suunto'],
		authKind: 'oauth',
		availability: 'coming-soon',
		connectRoute: null,
		monogram: 'Su',
		monogramClassName: 'bg-[#33444e] text-white',
	},
]
