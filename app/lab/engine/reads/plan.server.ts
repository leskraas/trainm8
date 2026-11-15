/**
 * `plan`: the whole season — the goal, the phases, every week with each
 * sport's target, planned and actual, and where today is.
 */
import { addDays, daysBetween, localDate } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
} from '#app/utils/labels.ts'
import { projectFitnessToRace } from '#app/utils/load/fitness-projection.ts'
import { getCurrentLoad } from '#app/utils/load/snapshot.server.ts'
import { type ActivePlan, getActivePlan } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { nbPhaseName } from '../nb.ts'
import {
	type Num,
	type PlanOutput,
	type VolumeUnit,
	type WeekRole,
} from '../reads.types.ts'
import { readGoal } from './goal.server.ts'
import {
	planFirstWeek,
	planWeekCount,
	sportVolumesOver,
} from './plan-weeks.server.ts'
import {
	known,
	maybe,
	sportName,
	sportOf,
	todayOf,
	unknown,
	whyOf,
} from './shared.server.ts'

/** The most weeks one read states: two years of plan. */
const MAX_WEEKS = 104

/** Fitness on the goal's day if the plan is followed, or why not. */
export async function projectedFitnessOnGoalDay(
	ctx: CapabilityCtx,
	plan: ActivePlan,
): Promise<Num> {
	if (!plan.eventDate) return unknown('Planen har ingen dato å regne fram til.')
	const current = await getCurrentLoad(ctx.userId)
	if (!current) return unknown(whyOf('insufficient-data'))
	const points = projectFitnessToRace({
		weeklyTss: plan.weeklyTss,
		planStart: plan.planStart,
		anchorCtl: current.ctl,
		anchorDate: new Date(`${current.date}T12:00:00.000Z`),
		eventDate: plan.eventDate,
	})
	if (!points) {
		return plan.eventDate <= ctx.now
			? unknown('Dagen er passert.')
			: unknown('Ikke alle ukene i planen har en belastning å regne med.')
	}
	return known(Math.round(points.at(-1)!.ctl * 10) / 10)
}

export async function readPlan(ctx: CapabilityCtx): Promise<PlanOutput> {
	const [plan, events] = await Promise.all([
		getActivePlan(ctx.userId, ctx.now),
		prisma.event.findMany({
			where: {
				athleteId: ctx.userId,
				status: { not: 'cancelled' },
				startDate: { gte: new Date(ctx.now.getTime() - 86_400_000) },
			},
			orderBy: { startDate: 'asc' },
			select: {
				id: true,
				name: true,
				startDate: true,
				kind: true,
				priority: true,
			},
		}),
	])
	const today = todayOf(ctx)
	const eventList = events
		.map((e) => ({
			id: e.id,
			name: e.name,
			date: localDate(e.startDate, ctx.timezone),
			kind: e.kind,
			priority: e.priority,
			isPlanGoal: plan?.eventId === e.id,
		}))
		.filter((e) => e.date >= today)
	if (!plan) return { source: 'athlete', plan: null, events: eventList }

	const goal = (await readGoal(ctx, plan))!
	const firstWeek = planFirstWeek(plan, ctx.timezone)
	const totalWeeks = Math.min(planWeekCount(plan), MAX_WEEKS)
	const [volumes, projected] = await Promise.all([
		sportVolumesOver(ctx, plan, firstWeek, totalWeeks),
		projectedFitnessOnGoalDay(ctx, plan),
	])
	const weekIndex = Math.floor(daysBetween(firstWeek, today) / 7)
	const currentWeek =
		weekIndex >= 0 && weekIndex < totalWeeks ? weekIndex + 1 : null

	let start = 0
	const phases = plan.phases.map((phase) => {
		const reading = phase as typeof phase & {
			rhythm?: string
			tapers?: boolean
		}
		const first = addDays(firstWeek, 7 * start)
		const out = {
			name: nbPhaseName(phase.name),
			weeks: phase.weeks,
			firstWeek: first,
			lastWeek: addDays(first, 7 * (phase.weeks - 1)),
			isCurrent: weekIndex >= start && weekIndex < start + phase.weeks,
			rhythm: reading.rhythm ?? null,
			tapers: reading.tapers ?? false,
		}
		start += phase.weeks
		return out
	})
	const phaseOfWeek = plan.phases.flatMap((p) =>
		Array.from({ length: p.weeks }, () => nbPhaseName(p.name)),
	)
	const family = plan.family
	return {
		source: 'athlete',
		plan: {
			goal,
			firstWeek,
			lastWeek: addDays(firstWeek, 7 * (totalWeeks - 1)),
			totalWeeks,
			currentWeek,
			block: plan.round,
			philosophy: family
				? {
						key: family,
						name: PHILOSOPHY_LABELS[family],
						description: PHILOSOPHY_DESCRIPTIONS[family],
					}
				: null,
			sports: plan.tracks.map((t) => ({
				sport: sportOf(t.discipline),
				sportName: sportName(t.discipline),
				unit: t.currency as VolumeUnit,
			})),
			phases,
			weeks: Array.from({ length: totalWeeks }, (_, i) => {
				const weekKey = addDays(firstWeek, 7 * i)
				return {
					weekKey,
					number: i + 1,
					phase: phaseOfWeek[i] ?? null,
					role: (plan.weekRoles[i] as WeekRole | undefined) ?? null,
					when: i < weekIndex ? 'past' : i === weekIndex ? 'current' : 'future',
					sports: volumes.get(weekKey) ?? [],
					projectedLoad: maybe(
						plan.weeklyTss[i],
						'Ikke regnet: en av idrettene har ingen belastning å regne om fra.',
					),
				}
			}),
			projectedFitnessOnGoalDay: projected,
		},
		events: eventList,
	}
}
