import { z } from 'zod/v4'
import { dayBoundsUTC, daysBetween } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { ACTION_TITLE_LABELS } from '#app/utils/labels.ts'
import { ledgerSessionSelect } from '#app/utils/training.server.ts'
import { defineAction } from './define.ts'
import {
	SessionSummarySchema,
	toSessionSummaries,
} from './session-summary.server.ts'

/** The widest window one call reads (ADR 0092, "The first slice"). */
export const LIST_SESSIONS_MAX_DAYS = 28
/** Sessions per page: well under a host's result cap (~150k characters). */
export const LIST_SESSIONS_PAGE = 50

const DayKey = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine(isCalendarKey, { message: 'not a calendar day' })

/** `2026-13-45` matches the shape and rolls over; a real day survives. */
function isCalendarKey(day: string): boolean {
	const instant = new Date(`${day}T00:00:00Z`)
	return (
		!Number.isNaN(instant.getTime()) &&
		instant.toISOString().slice(0, 10) === day
	)
}

/** Days from `from` to `to`, both counted. */
function dayCount(from: string, to: string): number {
	return daysBetween(from, to) + 1
}

/** An opaque page cursor: the last row's instant and id. */
const CursorSchema = z.object({ t: z.string(), id: z.string() })

function encodeCursor(row: { scheduledAt: Date; id: string }): string {
	return Buffer.from(
		JSON.stringify({ t: row.scheduledAt.toISOString(), id: row.id }),
	).toString('base64url')
}

function decodeCursor(cursor: string): z.infer<typeof CursorSchema> | null {
	try {
		const parsed = CursorSchema.safeParse(
			JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
		)
		return parsed.success && !Number.isNaN(Date.parse(parsed.data.t))
			? parsed.data
			: null
	} catch {
		return null
	}
}

/**
 * The athlete's sessions between two days, planned and recorded (ADR 0092,
 * "The first slice"), oldest first, paged. Days are the Athlete Timezone's,
 * both inclusive, at most 28 of them.
 */
export const listSessionsAction = defineAction({
	name: 'list_sessions',
	revision: 1,
	kind: 'read',
	callers: ['web', 'mcp', 'agent'],
	title: ACTION_TITLE_LABELS.list_sessions,
	description: `The athlete's training sessions between two days (YYYY-MM-DD in the athlete's timezone, both inclusive, at most ${LIST_SESSIONS_MAX_DAYS} days apart), oldest first, ${LIST_SESSIONS_PAGE} per page. Pass nextCursor back as cursor for the next page. Each session has planned and actual duration (seconds), distance (metres) and TSS as Readings.`,
	input: z
		.object({
			from: DayKey,
			to: DayKey,
			cursor: z.string().min(1).optional(),
		})
		.refine(
			({ from, to }) => {
				const days = dayCount(from, to)
				return days >= 1 && days <= LIST_SESSIONS_MAX_DAYS
			},
			{ message: `from ≤ to, at most ${LIST_SESSIONS_MAX_DAYS} days` },
		)
		.refine(({ cursor }) => cursor == null || decodeCursor(cursor) != null, {
			message: 'cursor is not one this tool returned',
		}),
	output: z.object({
		sessions: z.array(SessionSummarySchema),
		nextCursor: z.string().nullable(),
	}),
	async run(ctx, { from, to, cursor }) {
		const { start } = dayBoundsUTC(from, ctx.timezone)
		const { end } = dayBoundsUTC(to, ctx.timezone)
		const after = cursor ? decodeCursor(cursor) : null
		const rows = await prisma.workoutSession.findMany({
			where: {
				userId: ctx.userId,
				scheduledAt: { gte: start, lte: end },
				...(after
					? {
							OR: [
								{ scheduledAt: { gt: new Date(after.t) } },
								{ scheduledAt: new Date(after.t), id: { gt: after.id } },
							],
						}
					: {}),
			},
			orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
			take: LIST_SESSIONS_PAGE + 1,
			select: ledgerSessionSelect,
		})
		const page = rows.slice(0, LIST_SESSIONS_PAGE)
		const last = page.at(-1)
		return {
			sessions: await toSessionSummaries(page, ctx),
			nextCursor:
				rows.length > LIST_SESSIONS_PAGE && last ? encodeCursor(last) : null,
		}
	},
})
