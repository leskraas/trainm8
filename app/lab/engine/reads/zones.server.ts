/**
 * `zones`: the athlete's thresholds per sport, the zone model each sport
 * uses and every zone resolved to their own numbers, the threshold history,
 * and the race results pace targets are read from.
 */
import { localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	nbUnavailableReason,
	ZONE_PROVENANCE_LABELS,
} from '#app/utils/labels.ts'
import { CARDIO_DISCIPLINES } from '#app/utils/workout-schema.ts'
import {
	getRecipe,
	listRecipesForDiscipline,
	resolveIntensity,
} from '#app/utils/zones/index.ts'
import { type CapabilityCtx } from '../define.ts'
import { type SportZones, type ZonesOutput } from '../reads.types.ts'
import { maybe, sportName } from './shared.server.ts'

const NOT_SET = 'Ikke satt.'

export async function readZones(ctx: CapabilityCtx): Promise<ZonesOutput> {
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: ctx.userId },
		select: {
			disciplineProfiles: true,
			thresholdEvents: {
				orderBy: { effectiveAt: 'desc' },
				take: 50,
				select: {
					discipline: true,
					kind: true,
					valueNumeric: true,
					effectiveAt: true,
					protocol: true,
				},
			},
			performanceResults: {
				orderBy: { occurredAt: 'desc' },
				select: {
					id: true,
					discipline: true,
					distanceM: true,
					timeSec: true,
					occurredAt: true,
					source: true,
					verified: true,
				},
			},
		},
	})

	const sports: SportZones[] = CARDIO_DISCIPLINES.map((discipline) => {
		const row = profile?.disciplineProfiles.find(
			(p) => p.discipline === discipline,
		)
		const recipe = row?.zoneSystem ? getRecipe(row.zoneSystem) : undefined
		const resolver = {
			lthr: row?.lthr ?? null,
			maxHr: row?.maxHr ?? null,
			ftp: row?.ftp ?? null,
			runPowerThresholdW: row?.runPowerThresholdW ?? null,
			thresholdPaceSecPerKm: row?.thresholdPaceSecPerKm ?? null,
			cssSecPer100m: row?.cssSecPer100m ?? null,
			zoneSystem: row?.zoneSystem ?? null,
			zoneOverrides: row?.zoneOverrides ?? null,
		}
		return {
			sport: discipline,
			sportName: sportName(discipline),
			thresholds: {
				maxHeartRate: maybe(row?.maxHr, NOT_SET),
				thresholdHeartRate: maybe(row?.lthr, NOT_SET),
				ftp: maybe(
					discipline === 'bike' ? row?.ftp : null,
					discipline === 'bike' ? NOT_SET : 'Gjelder sykling.',
				),
				runPower: maybe(
					discipline === 'run' ? row?.runPowerThresholdW : null,
					discipline === 'run' ? NOT_SET : 'Gjelder løping.',
				),
				thresholdPace: maybe(
					discipline === 'run' ? row?.thresholdPaceSecPerKm : null,
					discipline === 'run' ? NOT_SET : 'Gjelder løping.',
				),
				css: maybe(
					discipline === 'swim' ? row?.cssSecPer100m : null,
					discipline === 'swim' ? NOT_SET : 'Gjelder svømming.',
				),
			},
			model: recipe
				? {
						id: recipe.id,
						name: recipe.name,
						chosenBy:
							row?.zoneSystemSource === 'athlete'
								? 'athlete'
								: row?.zoneSystemSource === 'default'
									? 'default'
									: null,
						basedOn:
							ZONE_PROVENANCE_LABELS.anchors[recipe.anchor] ?? recipe.anchor,
					}
				: null,
			models: listRecipesForDiscipline(discipline).map((r) => ({
				id: r.id,
				name: r.name,
			})),
			zones: (recipe?.zones ?? []).map((band) => {
				const resolved = resolveIntensity(
					{ kind: 'zoneLabel', label: band.label },
					resolver,
				)
				const range = (min?: number, max?: number) =>
					min == null && max == null
						? null
						: { min: min ?? null, max: max ?? null }
				const pace = range(resolved.paceMin, resolved.paceMax)
				return {
					label: band.label,
					description: band.description ?? null,
					step: band.zone ?? null,
					heartRate: range(resolved.hrMin, resolved.hrMax),
					power: range(resolved.powerMin, resolved.powerMax),
					pace: pace
						? {
								...pace,
								unit:
									resolved.paceUnit === 'secPer100m'
										? ('100m' as const)
										: ('km' as const),
							}
						: null,
					why: resolved.unavailable
						? nbUnavailableReason(resolved.unavailable)
						: null,
				}
			}),
			modelWhy: recipe ? null : ZONE_PROVENANCE_LABELS.noZoneSystem,
		}
	})

	return {
		source: 'athlete',
		sports,
		history: (profile?.thresholdEvents ?? []).map((e) => ({
			sport: e.discipline,
			kind: e.kind,
			value: e.valueNumeric,
			at: e.effectiveAt.toISOString(),
			how: e.protocol,
		})),
		results: (profile?.performanceResults ?? []).map((r) => ({
			id: r.id,
			sport: r.discipline,
			distanceM: r.distanceM,
			timeS: r.timeSec,
			date: localDate(r.occurredAt, ctx.timezone),
			kind: r.source,
			verified: r.verified,
		})),
	}
}
