/**
 * `week`: any Training Week, Monday to Sunday — its days and sessions, each
 * sport against its target, the week's load, and the proposals that would
 * change it.
 */
import {
	addDays as addDayKeys,
	dayBoundsUTC,
	isoWeekNumber,
	mondayOfDay,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { availablePatternDays } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { weeklyLoad } from '#app/utils/load/adherence.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { getActivePlan } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import { type WeekDay, type WeekOutput } from '../reads.types.ts'
import { phasePosition, sportVolumesOver } from './plan-weeks.server.ts'
import { proposalItems } from './proposals.server.ts'
import {
	maybe,
	readSessionCards,
	todayOf,
	verdictOf,
	weekdayOf,
	whyOf,
} from './shared.server.ts'

export async function readWeek(
	ctx: CapabilityCtx,
	day: string | undefined,
): Promise<WeekOutput> {
	const today = todayOf(ctx)
	const weekKey = day ? mondayOfDay(day) : weekMonday(ctx.now, ctx.timezone)
	const sunday = addDayKeys(weekKey, 6)
	const [plan, profile, change, { rows, cards }] = await Promise.all([
		getActivePlan(ctx.userId, ctx.now),
		prisma.athleteProfile.findUnique({
			where: { userId: ctx.userId },
			select: { trainableWeekdays: true },
		}),
		readWeekChange(ctx.userId, { now: ctx.now }),
		readSessionCards(ctx, {
			scheduledAt: {
				gte: dayBoundsUTC(weekKey, ctx.timezone).start,
				lte: dayBoundsUTC(sunday, ctx.timezone).end,
			},
		}),
	])
	const volumes = await sportVolumesOver(ctx, plan, weekKey, 1)
	const available = availablePatternDays(profile?.trainableWeekdays)

	const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
		const date = addDayKeys(weekKey, i)
		const sessions = cards.filter((c) => c.date === date)
		return {
			date,
			weekday: weekdayOf(date),
			isToday: date === today,
			isPast: date < today,
			available: available ? (available as number[]).includes(i) : null,
			restDay: !sessions.some((s) => s.status !== 'recording-only'),
			sessions,
		}
	})

	const load = weeklyLoad(
		rows.map((r) => ({ plannedTss: r.plannedTssValue, actualTss: r.tssValue })),
	)
	const when = sunday < today ? 'past' : weekKey > today ? 'future' : 'current'
	const proposals =
		change && change.comingWeekKey === weekKey
			? proposalItems(ctx, change, plan).filter((p) => p.weekKey === weekKey)
			: []

	return {
		source: 'athlete',
		weekKey,
		when,
		isoWeek: isoWeekNumber(weekKey),
		phase: phasePosition(plan, weekKey, ctx.timezone),
		days,
		sports: volumes.get(weekKey) ?? [],
		load: {
			planned: maybe(load.plannedTss, 'Ingen planlagte økter med belastning.'),
			actual: maybe(
				load.actualTss,
				when === 'future' ? 'Uka har ikke begynt.' : whyOf('no-recording'),
			),
			verdict: load.adherence
				? verdictOf(load.adherence.band.tone, null)
				: verdictOf(
						null,
						when === 'future'
							? 'Uka har ikke begynt.'
							: 'Ingen økt har både plan og gjennomføring å sammenligne.',
					),
		},
		counts: {
			planned: cards.filter((c) => c.status === 'planned').length,
			done: cards.filter((c) => c.status === 'done').length,
			missed: cards.filter((c) => c.status === 'missed').length,
			recordingOnly: cards.filter((c) => c.status === 'recording-only').length,
		},
		proposals,
		eased: change?.comingWeekKey === weekKey && change.eased != null,
	}
}
