/**
 * Thresholds and zones per sport: what is stored, the zone system each is read
 * on, and every zone as a range, or why it has none.
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import {
	getOrCreateAthleteProfile,
	getThresholdHistory,
} from '#app/utils/athlete.server.ts'
import { MEG_ZONE_RECIPE_LABELS, nbZoneCaption } from '#app/utils/labels.ts'
import {
	defaultRecipeIdFor,
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
} from '#app/utils/zones/index.ts'
import {
	SPORTS,
	type Sport,
	type SportThresholds,
	type ThresholdValues,
	type Zone,
} from '../setup.types.ts'

type ProfileRow = Awaited<
	ReturnType<typeof getOrCreateAthleteProfile>
>['disciplineProfiles'][number]

const KIND_TO_VALUE: Record<string, keyof ThresholdValues> = {
	maxHr: 'maxHr',
	lthr: 'lthr',
	ftp: 'ftp',
	runPower: 'runPower',
	thresholdPace: 'thresholdPacePerKm',
	css: 'cssPer100m',
}

const ANCHOR_WHY: Record<string, string> = {
	ftp: 'Sett FTP for å se sonene i watt.',
	runPower: 'Sett terskelwatt for løping for å se sonene.',
	lthr: 'Sett terskelpuls for å se sonene.',
	maxHr: 'Sett makspuls for å se sonene.',
	thresholdPace: 'Sett terskelfart for å se sonene.',
	css: 'Sett CSS for å se sonene.',
	rpe: 'Denne soneoppskriften har ingen tall, bare opplevd anstrengelse.',
}

function recipeName(id: string): string {
	return MEG_ZONE_RECIPE_LABELS[id] ?? getRecipe(id)?.name ?? id
}

function zonesOf(row: ProfileRow | undefined, sport: Sport): Zone[] {
	const recipeId = row?.zoneSystem ?? defaultRecipeIdFor(sport)
	const recipe = recipeId ? getRecipe(recipeId) : undefined
	if (!recipe) return []
	const profile = {
		lthr: row?.lthr ?? null,
		maxHr: row?.maxHr ?? null,
		ftp: row?.ftp ?? null,
		runPowerThresholdW: row?.runPowerThresholdW ?? null,
		thresholdPaceSecPerKm: row?.thresholdPaceSecPerKm ?? null,
		cssSecPer100m: row?.cssSecPer100m ?? null,
		zoneSystem: recipe.id,
		zoneOverrides: row?.zoneOverrides ?? null,
	}
	return recipe.zones.map((band) => {
		const resolved = resolveIntensity(
			{ kind: 'zoneLabel', label: band.label },
			profile,
		)
		const description = band.description
			? nbZoneCaption(band.description)
			: null
		if ('unavailable' in resolved && resolved.unavailable) {
			return {
				label: band.label,
				description,
				range: null,
				why: ANCHOR_WHY[recipe.anchor] ?? 'Mangler terskel.',
			}
		}
		if (resolved.hrMin != null) {
			return {
				label: band.label,
				description,
				range: {
					min: resolved.hrMin,
					max: resolved.hrMax ?? null,
					unit: 'bpm',
				},
			}
		}
		if (resolved.powerMin != null) {
			return {
				label: band.label,
				description,
				range: {
					min: resolved.powerMin,
					max: resolved.powerMax ?? null,
					unit: 'watt',
				},
			}
		}
		if (resolved.paceMin != null) {
			return {
				label: band.label,
				description,
				range: {
					min: Math.round(resolved.paceMin),
					max: resolved.paceMax != null ? Math.round(resolved.paceMax) : null,
					unit:
						resolved.paceUnit === 'secPer100m' ? 'sec-per-100m' : 'sec-per-km',
				},
			}
		}
		return {
			label: band.label,
			description,
			range: null,
			why: ANCHOR_WHY[recipe.anchor] ?? 'Mangler terskel.',
		}
	})
}

export async function readThresholds(
	userId: string,
	timezone: string,
): Promise<SportThresholds[]> {
	const [profile, history] = await Promise.all([
		getOrCreateAthleteProfile(userId),
		getThresholdHistory(userId),
	])
	return SPORTS.map((sport) => {
		const row = profile.disciplineProfiles.find(
			(candidate) => candidate.discipline === sport,
		)
		const recipeId = row?.zoneSystem ?? defaultRecipeIdFor(sport)
		return {
			sport,
			values: {
				maxHr: row?.maxHr ?? null,
				lthr: row?.lthr ?? null,
				ftp: sport === 'bike' ? (row?.ftp ?? null) : null,
				runPower: sport === 'run' ? (row?.runPowerThresholdW ?? null) : null,
				thresholdPacePerKm:
					sport === 'run' ? (row?.thresholdPaceSecPerKm ?? null) : null,
				cssPer100m: sport === 'swim' ? (row?.cssSecPer100m ?? null) : null,
			},
			zoneSystem: recipeId
				? {
						id: recipeId,
						name: recipeName(recipeId),
						chosenBy: row?.zoneSystemSource === 'athlete' ? 'athlete' : 'app',
					}
				: null,
			zoneSystems: listRecipesForDiscipline(sport).map((recipe) => ({
				id: recipe.id,
				name: recipeName(recipe.id),
			})),
			zones: zonesOf(row, sport),
			history: history
				.filter(
					(event) => event.discipline === sport && KIND_TO_VALUE[event.kind],
				)
				.map((event) => ({
					what: KIND_TO_VALUE[event.kind]!,
					value: event.valueNumeric,
					date: localDate(event.effectiveAt, timezone),
				})),
		}
	})
}

/** Which threshold fields a sport has. */
export const SPORT_FIELDS: Record<
	Sport,
	ReadonlyArray<keyof ThresholdValues>
> = {
	run: ['maxHr', 'lthr', 'runPower', 'thresholdPacePerKm'],
	bike: ['maxHr', 'lthr', 'ftp'],
	swim: ['maxHr', 'lthr', 'cssPer100m'],
}
