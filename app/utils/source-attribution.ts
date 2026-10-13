/**
 * The words a value carries about where its data came from (ADR 0098 §3),
 * built on `sourceTerms` so no screen decides terms on its own and none reads
 * the transport (`externalProvider`).
 *
 * - `recordingSource`: the line by a Recording's title. "Garmin [device
 *   model]" (plain "Garmin" when the device is unknown) and the Polar credit
 *   are **owed**: they must sit by the title, above the fold, never in a
 *   tooltip or a collapsed section. Other platforms' words are courtesy.
 * - `derivedAttributionLines`: the line under anything computed from the data
 *   (load, the coach's verdict, the first run's findings).
 */
import {
	normalizeDeviceName,
	type OriginPlatform,
} from '#app/integrations/shared/origin-platform.ts'
import { ORIGIN_PLATFORM_LABELS, SOURCE_ATTRIBUTION_LABELS } from './labels.ts'
import { type Attribution, sourceTerms } from './source-terms.ts'

export type RecordingSource = {
	text: string
	/** The platform's terms require this line (Garmin, Polar). */
	owed: boolean
}

/** "Garmin" + the model, whether the source named the brand or not. */
function brandedDevice(brand: string, deviceName: string | null): string {
	if (!deviceName) return brand
	// The brand, when it is a word of its own: followed by a separator (space,
	// `_`, `-`) or nothing — `Garmin_fēnix` and `garmin-edge` lose it,
	// `Garminator` does not.
	const model = deviceName.replace(
		new RegExp(`^${brand}(?![\\p{L}\\p{N}])[\\s_\\-]*`, 'iu'),
		'',
	)
	return model ? `${brand} ${model}` : brand
}

export function recordingSource({
	originPlatform,
	deviceName,
	aliasOrigins = [],
}: {
	originPlatform: OriginPlatform | string
	deviceName: string | null
	/**
	 * The Origin Platforms of the Recording's aliases (ADR 0096 §3): the same
	 * activity from other sources. They bind it too, so a credit one of them
	 * owes is owed here.
	 */
	aliasOrigins?: ReadonlyArray<OriginPlatform | string>
}): RecordingSource | null {
	const device = normalizeDeviceName(deviceName)
	const verdict = sourceTerms([originPlatform, ...aliasOrigins], 'screen')
	const owed = verdict.allowed ? verdict.attributions : []
	const credited = owed[0]
	if (credited) {
		return {
			text: brandedDevice(ORIGIN_PLATFORM_LABELS[credited]!, device),
			owed: true,
		}
	}
	const text = device ?? ORIGIN_PLATFORM_LABELS[originPlatform] ?? null
	return text ? { text, owed: false } : null
}

/**
 * The derived-data lines a value computed from these platforms' data must
 * carry: one per credit owed, none when nothing is owed.
 */
export function derivedAttributionLines(
	bindingSet: Iterable<string>,
): string[] {
	const verdict = sourceTerms(bindingSet, 'screen')
	if (!verdict.allowed) return []
	return verdict.attributions.map(
		(a: Attribution) => SOURCE_ATTRIBUTION_LABELS.derived[a],
	)
}
