/**
 * `sessions`: the athlete's sessions between two days, oldest first, a page
 * at a time — for history, a calendar or a log.
 */
import { type Prisma } from '@prisma/client'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { type CapabilityCtx } from '../define.ts'
import { type SessionsOutput, type Sport } from '../reads.types.ts'
import { readSessionCards } from './shared.server.ts'

type Cursor = { t: string; id: string }

export function encodeCursor(row: { scheduledAt: Date; id: string }): string {
	return Buffer.from(
		JSON.stringify({ t: row.scheduledAt.toISOString(), id: row.id }),
	).toString('base64url')
}

export function decodeCursor(cursor: string): Cursor | null {
	try {
		const parsed: unknown = JSON.parse(
			Buffer.from(cursor, 'base64url').toString('utf8'),
		)
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			't' in parsed &&
			'id' in parsed &&
			typeof parsed.t === 'string' &&
			typeof parsed.id === 'string' &&
			!Number.isNaN(Date.parse(parsed.t))
		) {
			return { t: parsed.t, id: parsed.id }
		}
	} catch {
		// fall through
	}
	return null
}

function sportWhere(sport: Sport): Prisma.WorkoutSessionWhereInput {
	return {
		OR: [
			{ workout: { discipline: sport } },
			{ workoutId: null, recording: { discipline: sport } },
		],
	}
}

export async function readSessions(
	ctx: CapabilityCtx,
	{
		from,
		to,
		cursor,
		sport,
		limit,
	}: {
		from: string
		to: string
		cursor: Cursor | null
		sport?: Sport
		limit: number
	},
): Promise<SessionsOutput> {
	const { rows, cards } = await readSessionCards(
		ctx,
		{
			AND: [
				{
					scheduledAt: {
						gte: dayBoundsUTC(from, ctx.timezone).start,
						lte: dayBoundsUTC(to, ctx.timezone).end,
					},
				},
				...(cursor
					? [
							{
								OR: [
									{ scheduledAt: { gt: new Date(cursor.t) } },
									{
										scheduledAt: new Date(cursor.t),
										id: { gt: cursor.id },
									},
								],
							},
						]
					: []),
				...(sport ? [sportWhere(sport)] : []),
			],
		},
		{ take: limit + 1 },
	)
	const more = rows.length > limit
	const last = rows[limit - 1]
	return {
		source: 'athlete',
		from,
		to,
		sessions: cards.slice(0, limit),
		nextCursor: more && last ? encodeCursor(last) : null,
	}
}
