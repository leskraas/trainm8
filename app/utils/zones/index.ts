export { type ZoneAnchor, type ZoneBand, type ZoneRecipe } from './types.ts'
export {
	resolveIntensity,
	type DisciplineProfileForResolver,
	type ResolvedIntensity,
} from './resolve.ts'
export {
	BUILT_IN_RECIPES,
	COGGAN_POWER_7,
	STRYD_RUN_POWER_5,
	FRIEL_HR_5_BIKE,
	FRIEL_HR_5_RUN,
	DANIELS_PACE_5,
	CSS_3,
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
