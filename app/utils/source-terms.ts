/**
 * **Source terms** (ADR 0098): whether a value may go to a surface, decided by
 * every **Origin Platform** behind it (ADR 0096), never by the transport.
 *
 * The one place that answers `(binding set, surface) → allowed with
 * attributions | closed with platforms`. Every attribution site and every
 * model-facing reader asks here; none decides terms on its own. Changing a
 * platform's rule — Garmin's §5.2(o) answer, a Polar opt-in — is an edit to
 * the table below.
 *
 * A value's **binding set** is the Origin Platforms of every import it read:
 * an import's own value, the import's platform (plus its aliases' once #547
 * adds them); a derived value (TSS, CTL/ATL/TSB, a Coach line, a finding) the
 * union over every import in its window. Plan-side and athlete-entered values
 * have an empty set, which every surface allows.
 */

import { type OriginPlatform } from '#app/integrations/shared/origin-platform.ts'

/** Where a value is going (ADR 0098 §2). */
export type Surface = 'screen' | 'model' | 'export'

/**
 * The credits a value may owe, in the order they are shown. Words in
 * `labels.ts`.
 */
export const ATTRIBUTIONS = [
	'garmin',
	'polar',
] as const satisfies readonly OriginPlatform[]

/** A credit a value must carry wherever it is shown. */
export type Attribution = (typeof ATTRIBUTIONS)[number]

export type SourceTermsVerdict =
	| { allowed: true; attributions: Attribution[] }
	| { allowed: false; platforms: OriginPlatform[] }

type PlatformRule = {
	/** May this platform's data, or anything derived from it, reach a model? */
	model: boolean
	attribution: Attribution | null
}

/**
 * ADR 0098 §3. `screen` is open for every platform and `export` always is
 * (the athlete's own right), so only the model column and the credit vary.
 * - garmin: open with the Garmin credit, for the data trainm8 has today
 *   (through Intervals.icu or an uploaded file). The owner's call, 2026-10-14;
 *   a Garmin direct integration needs Garmin's §5.2(o) approval before it ships.
 * - polar: open only with the athlete's separate Polar opt-in, which is not
 *   built yet (#549), so closed.
 * - strava: closed always (Policy §5.3, §5.10, §5.16).
 * - apple-health, health-connect: closed until explicit permission naming the
 *   AI exists and a store review has seen it.
 * - upload, intervalsicu: open; the athlete's own file is not vendor API data.
 * - anything else, `unknown` included: no rule, no model.
 */
const RULES: Partial<Record<OriginPlatform, PlatformRule>> = {
	garmin: { model: true, attribution: 'garmin' },
	polar: { model: false, attribution: 'polar' },
	strava: { model: false, attribution: null },
	'apple-health': { model: false, attribution: null },
	'health-connect': { model: false, attribution: null },
	upload: { model: true, attribution: null },
	intervalsicu: { model: true, attribution: null },
}

const NO_RULE: PlatformRule = { model: false, attribution: null }

function ruleFor(platform: OriginPlatform): PlatformRule {
	return RULES[platform] ?? NO_RULE
}

export function sourceTerms(
	bindingSet: Iterable<OriginPlatform>,
	surface: Surface,
): SourceTermsVerdict {
	const platforms = [...new Set(bindingSet)]
	if (surface === 'model') {
		const closing = platforms.filter((p) => !ruleFor(p).model).sort()
		if (closing.length > 0) return { allowed: false, platforms: closing }
	}
	const owed = new Set(platforms.map((p) => ruleFor(p).attribution))
	return {
		allowed: true,
		attributions: ATTRIBUTIONS.filter((a) => owed.has(a)),
	}
}
