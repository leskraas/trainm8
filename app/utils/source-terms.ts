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
	/**
	 * May this platform's data, or anything derived from it, reach a model?
	 * `opt-in`: only once the athlete has given that platform's own
	 * **Model Sharing Opt-In** (ADR 0108), never by default.
	 */
	model: boolean | 'opt-in'
	attribution: Attribution | null
}

/**
 * The platforms whose model rule is an athlete's opt-in (ADR 0108): the only
 * platforms a **Model Sharing Opt-In** can be stored for. An opt-in for any
 * other platform would open nothing, so it is never offered or kept.
 */
export const OPT_IN_PLATFORMS = [
	'polar',
] as const satisfies readonly OriginPlatform[]
export type OptInPlatform = (typeof OPT_IN_PLATFORMS)[number]

export function isOptInPlatform(value: string): value is OptInPlatform {
	return (OPT_IN_PLATFORMS as readonly string[]).includes(value)
}

export type SourceTermsContext = {
	/**
	 * The platforms the athlete whose data this is has opted in to sending to
	 * an assistant (`getModelSharingOptIns`). Read only on the `model`
	 * surface, and only for a platform whose rule is `opt-in`: an opt-in can
	 * never open a platform whose terms bar a model whatever the athlete says.
	 */
	optIns?: Iterable<OriginPlatform>
}

/**
 * ADR 0098 §3. `screen` is open for every platform and `export` always is
 * (the athlete's own right), so only the model column and the credit vary.
 * - garmin: open with the Garmin credit, for the data trainm8 has today
 *   (through Intervals.icu or an uploaded file). The owner's call, 2026-10-14;
 *   a Garmin direct integration needs Garmin's §5.2(o) approval before it ships.
 * - polar: open only with the athlete's separate Polar opt-in (§3.1.1; ADR
 *   0108), stored as a Model Sharing Opt-In; closed without it.
 * - strava: closed always (Policy §5.3, §5.10, §5.16).
 * - apple-health, health-connect: closed until explicit permission naming the
 *   AI exists and a store review has seen it.
 * - upload, intervalsicu: open; the athlete's own file is not vendor API data.
 * - anything else, `unknown` included: no rule, no model.
 */
const RULES: Partial<Record<OriginPlatform, PlatformRule>> = {
	garmin: { model: true, attribution: 'garmin' },
	polar: { model: 'opt-in', attribution: 'polar' },
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
	{ optIns = [] }: SourceTermsContext = {},
): SourceTermsVerdict {
	const platforms = [...new Set(bindingSet)]
	if (surface === 'model') {
		const optedIn = new Set(optIns)
		const opens = (p: OriginPlatform) => {
			const { model } = ruleFor(p)
			return model === 'opt-in' ? optedIn.has(p) : model
		}
		const closing = platforms.filter((p) => !opens(p)).sort()
		if (closing.length > 0) return { allowed: false, platforms: closing }
	}
	const owed = new Set(platforms.map((p) => ruleFor(p).attribution))
	return {
		allowed: true,
		attributions: ATTRIBUTIONS.filter((a) => owed.has(a)),
	}
}
