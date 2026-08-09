export { type ZoneAnchor, type ZoneBand, type ZoneRecipe } from './types.ts'
export {
	anchorLabel,
	formatMmol,
	raceAnchorLabel,
	resolveIntensity,
	type DisciplineProfileForResolver,
	type RaceAnchorPaces,
	type ResolvedIntensity,
} from './resolve.ts'
export {
	DEFAULT_ZONE_RECIPES,
	ZONE_RECIPE_SOURCES,
	defaultRecipeIdFor,
	zoneRecipeFieldsForNewProfile,
	type ZoneRecipeSource,
} from './defaults.ts'
export {
	BUILT_IN_RECIPES,
	COGGAN_POWER_7,
	STRYD_RUN_POWER_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	NORWEGIAN_THRESHOLD_RUN,
	CSS_3,
	CSS_5,
	OLT_HR_5_RUN,
	OLT_HR_5_BIKE,
} from './recipes.ts'

import { type CardioDiscipline } from '../workout-schema.ts'
import { BUILT_IN_RECIPES } from './recipes.ts'
import { type ZoneRecipe } from './types.ts'

export function getRecipe(id: string): ZoneRecipe | undefined {
	return BUILT_IN_RECIPES.find((r) => r.id === id)
}

export function listRecipesForDiscipline(
	discipline: CardioDiscipline,
): ZoneRecipe[] {
	return BUILT_IN_RECIPES.filter((r) => r.discipline === discipline)
}
