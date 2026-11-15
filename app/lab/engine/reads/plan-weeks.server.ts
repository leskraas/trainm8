/**
 * Weeks against the plan: where a week sits in the plan's phases, and each
 * sport's three numbers for a run of weeks — the domain's week model
 * (`buildWeekVolumes`) over one session read, as the season read does.
 */
import {
	addDays,
	dayBoundsUTC,
	daysBetween,
	localDate,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import {
	buildWeekVolumes,
	ledgerVolumeSessions,
} from '#app/utils/plan-outline/week-volumes.ts'
import {
	type ActivePlan,
	getDisciplineThresholds,
	ledgerSessionSelect,
} from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import {
	type PhasePosition,
	type SportVolume,
	type WeekRole,
} from '../reads.types.ts'
import { sportVolumeOf } from './shared.server.ts'

export function planFirstWeek(plan: ActivePlan, timezone: string): string {
	return weekMonday(plan.planStart, timezone)
}

export function planWeekCount(plan: ActivePlan): number {
	return plan.phases.reduce((sum, p) => sum + p.weeks, 0)
}

/** Where `weekKey` sits in the plan, or null outside it. */
export function phasePosition(
	plan: ActivePlan | null,
	weekKey: string,
	timezone: string,
): PhasePosition | null {
	if (!plan) return null
	const index = daysBetween(planFirstWeek(plan, timezone), weekKey) / 7
	const total = planWeekCount(plan)
	if (!Number.isInteger(index) || index < 0 || index >= total) return null
	let start = 0
	for (const phase of plan.phases) {
		if (index < start + phase.weeks) {
			return {
				name: phase.name,
				planWeek: index + 1,
				planWeeks: total,
				phaseWeek: index - start + 1,
				phaseWeeks: phase.weeks,
				role: (plan.weekRoles[index] as WeekRole | undefined) ?? null,
			}
		}
		start += phase.weeks
	}
	return null
}

/**
 * Each sport's target, planned and actual for `count` weeks from
 * `fromWeekKey`, keyed by week. A week with no plan has only what was done.
 */
export async function sportVolumesOver(
	ctx: CapabilityCtx,
	plan: ActivePlan | null,
	fromWeekKey: string,
	count: number,
): Promise<Map<string, SportVolume[]>> {
	const lastSunday = addDays(fromWeekKey, 7 * count - 1)
	const [rows, thresholds] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId: ctx.userId,
				scheduledAt: {
					gte: dayBoundsUTC(fromWeekKey, ctx.timezone).start,
					lte: dayBoundsUTC(lastSunday, ctx.timezone).end,
				},
			},
			orderBy: { scheduledAt: 'asc' },
			select: ledgerSessionSelect,
		}),
		getDisciplineThresholds(ctx.userId),
	])
	const sessions = ledgerVolumeSessions(rows, {
		now: ctx.now,
		timezone: ctx.timezone,
		thresholds,
	})
	const todayKey = localDate(ctx.now, ctx.timezone)
	const closedKey = lastClosedWeekKey(ctx.now, ctx.timezone)
	const planStartWeekKey = plan ? planFirstWeek(plan, ctx.timezone) : null
	const out = new Map<string, SportVolume[]>()
	for (let i = 0; i < count; i++) {
		const weekKey = addDays(fromWeekKey, 7 * i)
		const sunday = addDays(weekKey, 6)
		const volumes = buildWeekVolumes({
			weekKey,
			todayKey,
			closed: weekKey <= closedKey,
			planStartWeekKey,
			tracks: plan?.tracks ?? [],
			sessions: sessions.filter(
				(s) => s.dayKey >= weekKey && s.dayKey <= sunday,
			),
		})
		out.set(weekKey, volumes.tracks.map(sportVolumeOf))
	}
	return out
}
