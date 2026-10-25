import { z } from 'zod/v4'
import {
	addDays,
	dayBoundsUTC,
	daysBetween,
	localDate,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import {
	assessTsbTrust,
	daysOfLoadHistory,
} from '#app/utils/load/trustworthiness.ts'
import { readRecordedBindingSet } from '#app/utils/source-terms.server.ts'
import { getRecentWeeklyBuild } from '#app/utils/training.server.ts'
import { defineAction } from './define.ts'
import {
	platformsOver,
	readRecordedPlatformsByDay,
} from './provenance.server.ts'
import {
	NumberReading,
	reading,
	readingSchema,
	unavailable,
} from './reading.ts'

/**
 * Training Load over the last weeks (ADR 0092, "The first slice"): each day's
 * TSS and its fitness (CTL), fatigue (ATL) and form (TSB), and each week's
 * Planned against actual TSS with its Adherence Band (ADR 0019).
 *
 * A day before the load history begins has no snapshot: `insufficient-data`,
 * never a zero. A day's form inside the first 42 days of history is
 * `building-baseline`, the Coach card's own gate.
 */
export const getTrainingLoadAction = defineAction({
	name: 'get_training_load',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_training_load,
	description:
		"The athlete's training load over the last 1–26 weeks: per day the TSS and the fitness (CTL), fatigue (ATL) and form (TSB) after it; per training week the planned and actual TSS and the adherence band; and whether form is trustworthy yet (it needs 42 days of history). Every number is a Reading; never treat unavailable as zero.",
	input: z.object({ weeks: z.number().int().min(1).max(26) }),
	output: z.object({
		days: z.array(
			z.object({
				date: z.string(),
				tss: NumberReading(),
				ctl: NumberReading(),
				atl: NumberReading(),
				tsb: NumberReading(),
			}),
		),
		weeks: z.array(
			z.object({
				/** The week's Monday. */
				weekKey: z.string(),
				plannedTss: NumberReading(),
				actualTss: NumberReading(),
				adherence: readingSchema(z.enum(['under', 'on-target', 'over'])),
			}),
		),
		tsbTrust: z.object({
			trustworthy: z.boolean(),
			daysOfHistory: NumberReading(),
			requiredDays: NumberReading(),
		}),
	}),
	async run(ctx, { weeks }) {
		const today = localDate(ctx.now, ctx.timezone)
		const firstMonday = addDays(
			weekMonday(ctx.now, ctx.timezone),
			-7 * (weeks - 1),
		)
		const dayCount = daysBetween(firstMonday, today) + 1
		const window = {
			from: dayBoundsUTC(firstMonday, ctx.timezone).start,
			to: dayBoundsUTC(today, ctx.timezone).end,
		}
		const [snapshots, firstSnapshot, byDay, history, build] = await Promise.all(
			[
				prisma.loadSnapshot.findMany({
					where: {
						athleteId: ctx.userId,
						date: { gte: firstMonday, lte: today },
					},
					select: {
						date: true,
						tssTotal: true,
						ctl: true,
						atl: true,
						tsb: true,
					},
				}),
				prisma.loadSnapshot.findFirst({
					where: { athleteId: ctx.userId },
					orderBy: { date: 'asc' },
					select: { date: true },
				}),
				readRecordedPlatformsByDay(ctx.userId, window, ctx.timezone),
				readRecordedBindingSet(ctx.userId),
				getRecentWeeklyBuild(ctx.userId, weeks, ctx.now),
			],
		)
		const byDate = new Map(snapshots.map((s) => [s.date, s]))
		const firstDate = firstSnapshot?.date ?? null
		const noHistory = unavailable('insufficient-data')

		const days = Array.from({ length: dayCount }, (_, i) => {
			const date = addDays(firstMonday, i)
			const snapshot = byDate.get(date)
			const trusted = assessTsbTrust(daysOfLoadHistory(firstDate, date))
			return {
				date,
				// The day's own load reads only that day's Recordings.
				tss: reading(
					snapshot?.tssTotal ?? noHistory,
					platformsOver(byDay.recorded, date, 1),
					ctx,
				),
				ctl: reading(snapshot?.ctl ?? noHistory, history, ctx),
				atl: reading(snapshot?.atl ?? noHistory, history, ctx),
				tsb: reading(
					!snapshot
						? noHistory
						: trusted.trustworthy
							? snapshot.tsb
							: unavailable('building-baseline'),
					history,
					ctx,
				),
			}
		})

		const trust = assessTsbTrust(daysOfLoadHistory(firstDate, today))
		return {
			days,
			weeks: build.map((week, i) => {
				const weekKey = addDays(firstMonday, 7 * i)
				const recorded = platformsOver(byDay.recorded, weekKey, 7)
				return {
					weekKey,
					plannedTss: reading(
						week.plannedTss ?? unavailable('not-resolved'),
						[],
						ctx,
					),
					actualTss: reading(
						week.actualTss ?? unavailable('no-recording'),
						recorded,
						ctx,
					),
					adherence: reading(
						week.adherence?.band.tone ??
							unavailable(
								week.plannedTss == null
									? 'not-resolved'
									: week.actualTss == null
										? 'no-recording'
										: 'not-resolved',
							),
						recorded,
						ctx,
					),
				}
			}),
			tsbTrust: {
				trustworthy: trust.trustworthy,
				// Counts of days, from the load history's dates alone.
				daysOfHistory: reading(trust.daysOfHistory, [], ctx),
				requiredDays: reading(trust.requiredDays, [], ctx),
			},
		}
	},
})
