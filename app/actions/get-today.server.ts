import { z } from 'zod/v4'
import {
	dayBoundsUTC,
	localDate,
	weekBoundsUTC,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { readRecordedBindingSet } from '#app/utils/source-terms.server.ts'
import { ledgerSessionSelect } from '#app/utils/training.server.ts'
import { defineAction } from './define.ts'
import { waitingCount } from './get-week-change.server.ts'
import { NumberReading, reading, unavailable } from './reading.ts'
import {
	SessionSummarySchema,
	toSessionSummaries,
} from './session-summary.server.ts'
import { toWeekTrack, WeekTrackSchema } from './week-tracks.server.ts'

/**
 * I dag as data (ADR 0092, "The first slice"): today's sessions, today's
 * fitness, fatigue and form, this week's three numbers per track, and how many
 * Ukeskiftet proposals wait for the athlete.
 *
 * Form (TSB) is `building-baseline` before the 42-day trust gate, exactly as
 * the Coach card withholds it. Load is derived from the whole recorded
 * history, so its binding set is every Recording's platform (ADR 0098 §1).
 */
export const getTodayAction = defineAction({
	name: 'get_today',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_today,
	description:
		"The athlete's day: today's planned and recorded sessions, current fitness (CTL), fatigue (ATL) and form (TSB), this training week's target, planned and actual volume per training track in the track's own unit, and how many week-change proposals wait for the athlete's answer. Every number is a Reading: available with a value, or unavailable with a reason; never treat unavailable as zero.",
	input: z.object({}),
	output: z.object({
		/** `YYYY-MM-DD` in the Athlete Timezone. */
		date: z.string(),
		sessions: z.array(SessionSummarySchema),
		load: z.object({
			ctl: NumberReading(),
			atl: NumberReading(),
			tsb: NumberReading(),
		}),
		week: z.object({ tracks: z.array(WeekTrackSchema) }),
		openProposals: NumberReading(),
	}),
	async run(ctx) {
		const today = localDate(ctx.now, ctx.timezone)
		const { start, end } = dayBoundsUTC(today, ctx.timezone)
		const week = weekBoundsUTC(ctx.now, ctx.timezone)
		const [rows, current, trust, history, weekVolumes, weekRecorded, card] =
			await Promise.all([
				prisma.workoutSession.findMany({
					where: { userId: ctx.userId, scheduledAt: { gte: start, lte: end } },
					orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
					select: ledgerSessionSelect,
				}),
				getCurrentLoad(ctx.userId),
				getTsbTrust(ctx.userId, ctx.now),
				readRecordedBindingSet(ctx.userId),
				getWeekVolumes(ctx.userId, { now: ctx.now }),
				readRecordedBindingSet(ctx.userId, { from: week.start, to: week.end }),
				readWeekChange(ctx.userId, { now: ctx.now, onlyOpen: true }),
			])
		const noHistory = unavailable('insufficient-data')
		return {
			date: today,
			sessions: await toSessionSummaries(rows, ctx),
			load: {
				ctl: reading(current?.ctl ?? noHistory, history, ctx),
				atl: reading(current?.atl ?? noHistory, history, ctx),
				tsb: reading(
					!current
						? noHistory
						: trust.trustworthy
							? current.tsb
							: unavailable('building-baseline'),
					history,
					ctx,
				),
			},
			week: {
				tracks: weekVolumes.tracks.map((track) =>
					toWeekTrack(track, weekRecorded, ctx),
				),
			},
			// A count of the athlete's own questions: plan-side, so it binds to nothing.
			openProposals: reading(waitingCount(card, today), [], ctx),
		}
	},
})
