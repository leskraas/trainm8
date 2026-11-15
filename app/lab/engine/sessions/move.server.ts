/**
 * Moving a session to a day the athlete picks, and swapping the days of two
 * sessions. Both are reschedules: only the sessions named move, the time of
 * day is kept, nothing about ownership changes, and nothing else in the week
 * is touched (so the week's target stays where it was).
 *
 * Each keeps a before-image on a `SessionAdjustment` row, in the same shape
 * the one-tap day change writes, so the existing undo (`undoJuster`) takes it
 * back exactly and refuses once a moved session has been trained or changed
 * again.
 */
import { type Prisma } from '@prisma/client'
import {
	addDays,
	dayBoundsUTC,
	localDate,
	localTimeOfDay,
	localTimeUTC,
	mondayOfDay,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatNbWeekday } from '#app/utils/format.ts'
import { type JusterImage } from '#app/utils/juster.ts'
import { JUSTER_LABELS } from '#app/utils/labels.ts'
import {
	type Clash,
	type PlacedSession,
	placingClashes,
} from '#app/utils/plan-outline/day-rule.ts'
import {
	placedOn,
	readPlacement,
	TRAINED_SESSION_STATUSES,
} from '#app/utils/plan-outline/session-placement.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'
import {
	effortWorkoutSelect,
	getDisciplineThresholds,
} from '#app/utils/training.server.ts'
import { type DayClash } from '../sessions.types.ts'

const moveSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	recordingId: true,
	replanReason: true,
	workoutId: true,
	sessionLog: { select: { id: true } },
	workout: effortWorkoutSelect,
} satisfies Prisma.WorkoutSessionSelect

type MoveRow = Prisma.WorkoutSessionGetPayload<{ select: typeof moveSelect }>

/** Open: still planned, nothing trained or linked onto it. */
export function isOpen(session: {
	status: string
	recordingId: string | null
	sessionLog: { id: string } | null
}): boolean {
	return (
		session.status === 'scheduled' &&
		session.recordingId == null &&
		session.sessionLog == null
	)
}

function weekdayWord(dayKey: string): string {
	return formatNbWeekday(new Date(`${dayKey}T12:00:00Z`), 'UTC')
}

function patternWeekdayOf(dayKey: string): PatternWeekday {
	return ((new Date(`${dayKey}T12:00:00Z`).getUTCDay() + 6) %
		7) as PatternWeekday
}

function onDay(instant: Date, dayKey: string, timezone: string): Date {
	return localTimeUTC(dayKey, localTimeOfDay(instant, timezone), timezone)
}

/** The note a moved session carries. */
export function movedNote(fromKey: string): string {
	return `Flyttet fra ${weekdayWord(fromKey)}.`
}

export type MoveRefusal =
	| 'not-found'
	| 'not-open'
	| 'past-date'
	| 'same-day'
	| 'same-session'

export type MoveResult =
	| {
			ok: true
			adjustmentId: string
			moves: Array<{ sessionId: string; fromDate: string; toDate: string }>
			sharesDayWith: string[]
			clashes: DayClash[]
			leftItsWeek: boolean
	  }
	| { ok: false; reason: MoveRefusal }

/** The day rule's warnings for `session` placed on `dayKey`. */
async function clashesOn(
	userId: string,
	session: MoveRow,
	dayKey: string,
	{ todayKey, timezone }: { todayKey: string; timezone: string },
): Promise<DayClash[]> {
	const monday = mondayOfDay(dayKey)
	const sunday = addDays(monday, 6)
	// Earlier days than today are past, and make no day hard any more.
	const from = monday > todayKey ? monday : todayKey
	const [rows, thresholds] = await Promise.all([
		prisma.workoutSession.findMany({
			where: {
				userId,
				id: { not: session.id },
				status: { in: [...TRAINED_SESSION_STATUSES] },
				scheduledAt: {
					gte: dayBoundsUTC(from, timezone).start,
					lte: dayBoundsUTC(sunday, timezone).end,
				},
			},
			select: { scheduledAt: true, workout: effortWorkoutSelect },
		}),
		getDisciplineThresholds(userId),
	])
	const week: PlacedSession[] = rows.flatMap((row) => {
		const shape = readPlacement(row.workout, thresholds)
		return shape
			? [
					placedOn(
						shape,
						patternWeekdayOf(localDate(row.scheduledAt, timezone)),
					),
				]
			: []
	})
	const shape = readPlacement(session.workout, thresholds) ?? {
		kind: 'session' as const,
		effort: 'rolig' as const,
	}
	const weekday = patternWeekdayOf(dayKey)
	const lifting = shape.kind === 'lifting'
	return placingClashes(week, { ...shape, weekday } as PlacedSession).map(
		(clash: Clash) => ({
			code: clash.reason,
			text: JUSTER_LABELS.clash[clash.reason]({
				lifting,
				after: clash.weekday !== weekday,
			}),
		}),
	)
}

/** The day rule's warnings for a session on the day it now stands on. */
export async function readClashes(
	userId: string,
	sessionId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<DayClash[]> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: moveSelect,
	})
	if (!session) return []
	return clashesOn(userId, session, localDate(session.scheduledAt, timezone), {
		todayKey: localDate(now, timezone),
		timezone,
	})
}

function imageOf(row: MoveRow, after: Date): JusterImage['sessions'][number] {
	return {
		id: row.id,
		scheduledAt: row.scheduledAt.toISOString(),
		replanReason: row.replanReason,
		workoutId: row.workoutId,
		after: { scheduledAt: after.toISOString(), workoutId: row.workoutId },
	}
}

/** Move one open session to `dayKey` (today or later), at its time of day. */
export async function moveSessionToDay(
	userId: string,
	sessionId: string,
	dayKey: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<MoveResult> {
	const session = await prisma.workoutSession.findFirst({
		where: { id: sessionId, userId },
		select: moveSelect,
	})
	if (!session) return { ok: false, reason: 'not-found' }
	if (!isOpen(session)) return { ok: false, reason: 'not-open' }
	const todayKey = localDate(now, timezone)
	const fromKey = localDate(session.scheduledAt, timezone)
	if (dayKey < todayKey) return { ok: false, reason: 'past-date' }
	if (dayKey === fromKey) return { ok: false, reason: 'same-day' }

	const clashes = await clashesOn(userId, session, dayKey, {
		todayKey,
		timezone,
	})
	const bounds = dayBoundsUTC(dayKey, timezone)
	const sharing = await prisma.workoutSession.findMany({
		where: {
			userId,
			id: { not: session.id },
			scheduledAt: { gte: bounds.start, lte: bounds.end },
		},
		orderBy: { scheduledAt: 'asc' },
		select: { id: true },
	})
	const moved = onDay(session.scheduledAt, dayKey, timezone)
	const adjustmentId = await prisma.$transaction(async (tx) => {
		await tx.workoutSession.update({
			where: { id: session.id },
			data: { scheduledAt: moved, replanReason: movedNote(fromKey) },
		})
		const image: JusterImage = {
			sessions: [imageOf(session, moved)],
			workout: null,
		}
		const row = await tx.sessionAdjustment.create({
			data: {
				userId,
				sessionId: session.id,
				intent: 'move',
				beforeImage: JSON.stringify(image),
			},
			select: { id: true },
		})
		return row.id
	})
	return {
		ok: true,
		adjustmentId,
		moves: [{ sessionId: session.id, fromDate: fromKey, toDate: dayKey }],
		sharesDayWith: sharing.map((row) => row.id),
		clashes,
		leftItsWeek: mondayOfDay(fromKey) !== mondayOfDay(dayKey),
	}
}

/** Exchange the days of two open sessions, each keeping its time of day. */
export async function swapSessionDays(
	userId: string,
	sessionId: string,
	otherSessionId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<MoveResult> {
	if (sessionId === otherSessionId) return { ok: false, reason: 'same-session' }
	const rows = await prisma.workoutSession.findMany({
		where: { id: { in: [sessionId, otherSessionId] }, userId },
		select: moveSelect,
	})
	const one = rows.find((row) => row.id === sessionId)
	const other = rows.find((row) => row.id === otherSessionId)
	if (!one || !other) return { ok: false, reason: 'not-found' }
	if (!isOpen(one) || !isOpen(other)) return { ok: false, reason: 'not-open' }
	const todayKey = localDate(now, timezone)
	const oneKey = localDate(one.scheduledAt, timezone)
	const otherKey = localDate(other.scheduledAt, timezone)
	if (oneKey < todayKey || otherKey < todayKey) {
		return { ok: false, reason: 'past-date' }
	}
	if (oneKey === otherKey) return { ok: false, reason: 'same-day' }

	const oneMoved = onDay(one.scheduledAt, otherKey, timezone)
	const otherMoved = onDay(other.scheduledAt, oneKey, timezone)
	const adjustmentId = await prisma.$transaction(async (tx) => {
		await tx.workoutSession.update({
			where: { id: one.id },
			data: { scheduledAt: oneMoved, replanReason: movedNote(oneKey) },
		})
		await tx.workoutSession.update({
			where: { id: other.id },
			data: { scheduledAt: otherMoved, replanReason: movedNote(otherKey) },
		})
		const image: JusterImage = {
			sessions: [imageOf(one, oneMoved), imageOf(other, otherMoved)],
			workout: null,
		}
		const row = await tx.sessionAdjustment.create({
			data: {
				userId,
				sessionId: one.id,
				intent: 'move',
				beforeImage: JSON.stringify(image),
			},
			select: { id: true },
		})
		return row.id
	})
	return {
		ok: true,
		adjustmentId,
		moves: [
			{ sessionId: one.id, fromDate: oneKey, toDate: otherKey },
			{ sessionId: other.id, fromDate: otherKey, toDate: oneKey },
		],
		sharesDayWith: [],
		clashes: [],
		leftItsWeek: mondayOfDay(oneKey) !== mondayOfDay(otherKey),
	}
}
