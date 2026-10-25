import { z } from 'zod/v4'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS, ACTION_VALUE_LABELS } from '#app/utils/labels.ts'
import { lastClosedWeekKey } from '#app/utils/load/week-change.ts'
import {
	buildWeekVolumes,
	volumeSessionOf,
} from '#app/utils/plan-outline/week-volumes.ts'
import {
	getActivePlan,
	ledgerSessionSelect,
} from '#app/utils/training.server.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'
import { defineAction } from './define.ts'
import {
	platformsOver,
	readRecordedPlatformsByDay,
} from './provenance.server.ts'
import { athleteText, AthleteTextSchema } from './reading.ts'
import { toWeekTrack, WeekTrackSchema } from './week-tracks.server.ts'

/** An event's name is the athlete's text, capped like a workout title. */
const EVENT_NAME_MAX = 200

/** The most weeks one call states: two years of plan. */
export const SEASON_MAX_WEEKS = 104

/**
 * The active plan's season (ADR 0092, "The first slice"): the plan, its Target
 * Event if it has one, and every plan week's phase with each Training Track's
 * Week Target, Planned and Actual Volume in the track's own currency.
 *
 * Read through the same week model I dag and Sesong use
 * (`buildWeekVolumes`), over one ledger read for the whole season. `plan` is
 * null when there is no active plan: an entity that does not exist is null,
 * which is not a number (ADR 0092 §6).
 */
export const getSeasonAction = defineAction({
	name: 'get_season',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.get_season,
	description:
		"The athlete's active training plan: its target event (if any) and, for every plan week, its phase and each training track's weekly target, planned and actual volume in the track's own unit (km, hours, TSS or sets). plan is null when the athlete has no active plan. Every number is a Reading; never treat unavailable as zero.",
	input: z.object({}),
	output: z.object({
		plan: z
			.object({
				/** The event's name, the athlete's text; trainm8's words when open-ended. */
				name: z.union([AthleteTextSchema, z.string()]),
				openEnded: z.boolean(),
				event: z
					.object({ name: AthleteTextSchema, date: z.string() })
					.nullable(),
			})
			.nullable(),
		weeks: z.array(
			z.object({
				weekKey: z.string(),
				phase: z.string(),
				tracks: z.array(WeekTrackSchema),
			}),
		),
	}),
	async run(ctx) {
		const plan = await getActivePlan(ctx.userId, ctx.now)
		if (!plan) return { plan: null, weeks: [] }

		const startKey = weekMonday(plan.planStart, ctx.timezone)
		const phaseOfWeek = plan.phases.flatMap((phase) =>
			Array.from({ length: phase.weeks }, () => phase.name),
		)
		const weekCount = Math.min(phaseOfWeek.length, SEASON_MAX_WEEKS)
		const window = {
			from: dayBoundsUTC(startKey, ctx.timezone).start,
			to: dayBoundsUTC(addDays(startKey, 7 * weekCount - 1), ctx.timezone).end,
		}
		const [rows, byDay] = await Promise.all([
			prisma.workoutSession.findMany({
				where: {
					userId: ctx.userId,
					scheduledAt: { gte: window.from, lte: window.to },
				},
				orderBy: { scheduledAt: 'asc' },
				select: ledgerSessionSelect,
			}),
			readRecordedPlatformsByDay(ctx.userId, window, ctx.timezone),
		])
		const todayKey = localDate(ctx.now, ctx.timezone)
		const closedKey = lastClosedWeekKey(ctx.now, ctx.timezone)
		const sessions = rows.map((session) => {
			const dayKey = localDate(session.scheduledAt, ctx.timezone)
			return volumeSessionOf(session, {
				dayKey,
				status: deriveLedgerStatus(session, ctx.now, ctx.timezone),
			})
		})

		// The athlete typed the event's name: it crosses as theirs (ADR 0092 §7).
		const eventName = plan.eventName
			? athleteText(plan.eventName, EVENT_NAME_MAX)
			: null
		return {
			plan: {
				name: eventName ?? ACTION_VALUE_LABELS.openEndedPlan,
				openEnded: plan.eventId == null,
				event:
					eventName && plan.eventDate
						? {
								name: eventName,
								date: localDate(plan.eventDate, ctx.timezone),
							}
						: null,
			},
			weeks: Array.from({ length: weekCount }, (_, i) => {
				const weekKey = addDays(startKey, 7 * i)
				const sunday = addDays(weekKey, 6)
				const volumes = buildWeekVolumes({
					weekKey,
					todayKey,
					closed: weekKey <= closedKey,
					planStartWeekKey: startKey,
					tracks: plan.tracks,
					sessions: sessions.filter(
						(s) => s.dayKey >= weekKey && s.dayKey <= sunday,
					),
				})
				const recorded = platformsOver(byDay, weekKey, 7)
				return {
					weekKey,
					phase: phaseOfWeek[i] ?? '',
					tracks: volumes.tracks.map((track) =>
						toWeekTrack(track, recorded, ctx),
					),
				}
			}),
		}
	},
})
