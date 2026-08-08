import {
	type CardioDiscipline,
	type Discipline,
	isCardioDiscipline,
} from '../workout-schema.ts'

/**
 * The **Zone Recipe** every cardio **Discipline** starts on, applied whenever a
 * **Discipline Profile** is created and backfilled onto every row that predates
 * this (#454, ADR 0006).
 *
 * **A recipe is shape, not size.** It fabricates no number about the athlete —
 * it chooses which ladder the athlete's *own* numbers are read on. That is
 * categorically different from defaulting a **Threshold**, which would be a
 * number about this athlete that nobody measured, and which stays manual-only
 * for exactly that reason. Without a threshold an **Intensity Target** degrades
 * to the **Training Zone** label or RPE — never to an invented pace or wattage.
 *
 * Leaving it unset was the honest-looking option and is the empty one: a null
 * `zoneSystem` short-circuits `resolveIntensity` before any band is consulted,
 * which is why every **Volume Conversion** needing a recipe returned an
 * **Unavailable Metric** while nothing but the seed wrote this column.
 *
 * **Why these three.** Each is the model its discipline's own literature is
 * written in, anchored on the threshold that discipline actually measures:
 *
 * - **run → `daniels-pace-5`** — pace is what a runner has without buying
 *   anything, and threshold pace is the run threshold `/settings/training` asks
 *   for first. (`stryd-run-power-5` needs a footpod; `friel-hr-5-run` and
 *   `olt-hr-5-run` need an LTHR or a max HR the athlete has to test for.)
 * - **bike → `coggan-power-7`** — FTP is the cycling threshold, and Coggan's
 *   seven bands are the vocabulary every bike computer and trainer already
 *   speaks.
 * - **swim → `css-5`** — CSS is the swim standard, and the five-band recipe is
 *   chosen over `css-3` because `css-3` declares no **Training Zone** 3 and no
 *   5, so a mix asking for either gets a *named substitution* rather than a
 *   band. Defaulting to the coarser recipe would build that substitution into
 *   every new swimmer. `css-3` stays reachable in the picker, and the swimmers
 *   already on it are untouched — this default only ever fills a *null*.
 *
 * **Strength has no entry**, and that is a positive statement rather than a gap:
 * no recipe ships for it, because lactate thresholds do not order a set of
 * squats (ADR 0046).
 */
export const DEFAULT_ZONE_RECIPES = {
	run: 'daniels-pace-5',
	bike: 'coggan-power-7',
	swim: 'css-5',
} as const satisfies Record<CardioDiscipline, string>

/**
 * How a **Discipline Profile**'s `zoneSystem` got there.
 *
 * Stored rather than inferred by comparing the id against
 * {@link DEFAULT_ZONE_RECIPES}, because those two facts are different: an
 * athlete who deliberately picks `daniels-pace-5` for their runs has *chosen*
 * the recipe that also happens to be the default, and a surface that tells them
 * "trainm8 chose this for you" would be describing an act that did not happen.
 * The same shape `proposeStarterPattern` uses for weekdays
 * (`source: 'availability' | 'default'`), for the same reason.
 *
 * `null` where there is no recipe to source — the strength row.
 */
export type ZoneRecipeSource = 'default' | 'athlete'

export const ZONE_RECIPE_SOURCES = ['default', 'athlete'] as const

/**
 * The recipe id a discipline starts on, or `null` for a discipline that has no
 * recipes at all (strength).
 */
export function defaultRecipeIdFor(discipline: Discipline): string | null {
	return isCardioDiscipline(discipline) ? DEFAULT_ZONE_RECIPES[discipline] : null
}

/**
 * The `zoneSystem` / `zoneSystemSource` pair to write when a **Discipline
 * Profile** row is created.
 *
 * `chosen` is what the athlete submitted, where they submitted anything; a
 * profile created as a side effect of saving a threshold has chosen nothing and
 * takes the default.
 */
export function zoneRecipeFieldsForNewProfile(
	discipline: Discipline,
	chosen?: string | null,
): { zoneSystem: string | null; zoneSystemSource: ZoneRecipeSource | null } {
	if (chosen) return { zoneSystem: chosen, zoneSystemSource: 'athlete' }
	const fallback = defaultRecipeIdFor(discipline)
	return {
		zoneSystem: fallback,
		zoneSystemSource: fallback == null ? null : 'default',
	}
}
