/**
 * `progress`: fitness, fatigue and form over time, each week's load against
 * the plan, each sport's volume, and how far there is to the goal.
 */
import { runAction } from '#app/actions/run.server.ts'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	mondayOfDay,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sustainedAdherence } from '#app/utils/load/coach.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import {
	getActivePlan,
	getRecentWeeklyAdherence,
} from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { type ProgressOutput, type ProgressWeek } from '../reads.types.ts'
import { readGoal } from './goal.server.ts'
import { phasePosition, sportVolumesOver } from './plan-weeks.server.ts'
import { projectedFitnessOnGoalDay } from './plan.server.ts'
import {
	actionCtxOf,
	done,
	known,
	maybe,
	num,
	sportName,
	sportOf,
	unknown,
	valueOf,
	verdictOf,
	whyOf,
} from './shared.server.ts'
import { formTrustOf } from './today.server.ts'

export async function readProgress(
	ctx: CapabilityCtx,
	weeks: number,
): Promise<ProgressOutput> {
	const firstMonday = addDays(
		weekMonday(ctx.now, ctx.timezone),
		-7 * (weeks - 1),
	)
	const today = localDate(ctx.now, ctx.timezone)
	const [loadResult, plan, current, trust, adherence, recordings] =
		await Promise.all([
			runAction(actionCtxOf(ctx), 'get_training_load', { weeks }),
			getActivePlan(ctx.userId, ctx.now),
			getCurrentLoad(ctx.userId),
			getTsbTrust(ctx.userId, ctx.now),
			getRecentWeeklyAdherence(ctx.userId, 8, ctx.now),
			prisma.activityImport.findMany({
				where: {
					athleteId: ctx.userId,
					startedAt: {
						gte: dayBoundsUTC(firstMonday, ctx.timezone).start,
						lte: dayBoundsUTC(today, ctx.timezone).end,
					},
				},
				select: {
					startedAt: true,
					discipline: true,
					durationSec: true,
					distanceM: true,
				},
			}),
		])
	const load = done(loadResult)
	const volumes = await sportVolumesOver(ctx, plan, firstMonday, weeks)

	const weekly: ProgressWeek[] = Array.from({ length: weeks }, (_, i) => {
		const weekKey = addDays(firstMonday, 7 * i)
		const w = load?.weeks.find((x) => x.weekKey === weekKey)
		const inWeek = recordings.filter(
			(r) => mondayOfDay(localDate(r.startedAt, ctx.timezone)) === weekKey,
		)
		const sports = [...new Set(inWeek.map((r) => r.discipline))]
		const band = valueOf(w?.adherence)
		return {
			weekKey,
			plannedLoad: num(w?.plannedTss),
			actualLoad: num(w?.actualTss),
			verdict: band
				? verdictOf(band, null)
				: verdictOf(
						null,
						w?.adherence.status === 'unavailable'
							? whyOf(w.adherence.reason)
							: null,
					),
			sports: volumes.get(weekKey) ?? [],
			recorded: sports.map((discipline) => {
				const rows = inWeek.filter((r) => r.discipline === discipline)
				const distances = rows
					.map((r) => r.distanceM)
					.filter((d): d is number => d != null)
				return {
					sport: sportOf(discipline),
					sportName: sportName(discipline),
					sessions: rows.length,
					durationS: known(rows.reduce((sum, r) => sum + r.durationSec, 0)),
					distanceM:
						distances.length > 0
							? known(distances.reduce((a, b) => a + b, 0))
							: unknown('Ingen distanse i opptakene.'),
				}
			}),
		}
	})

	const sustained = sustainedAdherence(adherence)
	const goal = await readGoal(ctx, plan)
	const position = plan
		? phasePosition(plan, weekMonday(ctx.now, ctx.timezone), ctx.timezone)
		: null
	const fitnessToday = current
		? known(current.ctl)
		: unknown(whyOf('insufficient-data'))

	return {
		source: 'athlete',
		weeks,
		current: {
			fitness: fitnessToday,
			fatigue: current
				? known(current.atl)
				: unknown(whyOf('insufficient-data')),
			form: !current
				? unknown(whyOf('insufficient-data'))
				: trust.trustworthy
					? known(current.tsb)
					: unknown(whyOf('building-baseline')),
		},
		formTrust: formTrustOf(trust, current != null),
		days: (load?.days ?? []).map((d) => ({
			date: d.date,
			load: num(d.tss),
			fitness: num(d.ctl),
			fatigue: num(d.atl),
			form: num(d.tsb),
		})),
		weekly,
		trend: sustained
			? { direction: sustained.tone, weeks: sustained.weeks }
			: null,
		goal: goal
			? {
					goal,
					weeksToGo:
						goal.daysToGo != null && goal.daysToGo >= 0
							? Math.ceil(goal.daysToGo / 7)
							: null,
					planWeek: position?.planWeek ?? null,
					planWeeks: position?.planWeeks ?? null,
					phase: position?.name ?? null,
					fitnessToday,
					projectedFitnessOnGoalDay: plan
						? await projectedFitnessOnGoalDay(ctx, plan)
						: maybe(null, 'Ingen plan å regne fram fra.'),
				}
			: null,
	}
}
