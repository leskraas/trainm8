/**
 * The server half of the **writing line** and of every change I dag makes to
 * a session (#505 stories 39–40): which days may be written, and the toast
 * that says what a change did to its week.
 */
import { mondayOfDay, weekMonday } from './athlete-calendar.ts'
import { prisma } from './db.server.ts'
import { weekSumChangeLine } from './plan-outline/week-sum-words.ts'
import { weekSumMoved } from './plan-outline/week-sum.ts'
import { getWeekVolumes } from './plan-outline/week-volumes.server.ts'
import { relativeWeekName } from './relative-week.ts'
import { timelineWindow, type TimelineWindow } from './timeline-window.ts'
import { createToastHeaders } from './toast.server.ts'
import { getActivePlan } from './training.server.ts'
import { type SentenceExercise } from './workout-sentence.ts'

/**
 * The days this athlete's I dag reads, for `now`: half a year back, and two
 * years ahead or to the end of the active plan where that is later. The
 * writing line writes from its first day on, with no last (`isWritableDay`).
 */
export async function readTimelineWindow(
	userId: string,
	{ now, timezone }: { now: Date; timezone: string },
): Promise<TimelineWindow> {
	const plan = await getActivePlan(userId, now)
	return timelineWindow({ now, timezone, plan })
}

/**
 * The exercises a lift on the writing line may name (ADR 0089): the catalogue
 * the strength editor's combobox picks from — trainm8's rows and this
 * athlete's own, by the same asserted-authorship rule as
 * `getExerciseCatalog` — with every **Exercise Alias** that names the movement
 * (`OHP`, `squat`, and the Norwegian names of owner decision 9 as they land).
 * An alias that names one variant (`DB bench`) is left out: a strength step
 * names an exercise, and reading the variant's alias as its movement would
 * write a barbell bench for a dumbbell one.
 *
 * Read by the reader on both sides, the client's preview and the server's
 * second read. Only what the reader needs travels: ids, names and aliases.
 */
export async function readSentenceExercises(
	userId: string,
): Promise<SentenceExercise[]> {
	const rows = await prisma.exercise.findMany({
		where: {
			OR: [{ authorship: 'system' }, { createdByAthleteId: userId }],
		},
		select: {
			id: true,
			name: true,
			aliases: { where: { variantId: null }, select: { text: true } },
		},
		orderBy: [{ name: 'asc' }],
	})
	return rows.map(({ id, name, aliases }) =>
		aliases.length > 0
			? { id, name, aliases: aliases.map((alias) => alias.text) }
			: { id, name },
	)
}

/**
 * Run a write that adds, changes or removes one session, and say what it did
 * to the week (#505 story 39): the week read on both sides of the write, so
 * the toast states the sum before → after as the database now has it, and
 * that the Week Target stayed — which it always does, because no session
 * moves it.
 *
 * `quietUnlessMoved` is the edit's case: a token edit that leaves the week's
 * sum where it was (an intensity, a time of day) says nothing, and neither
 * does one in a week no plan track counts.
 */
export async function withWeekSumToast<T>(
	userId: string,
	{
		dayKey,
		discipline,
		change,
		timezone,
		now = new Date(),
		quietUnlessMoved = false,
	}: {
		dayKey: string
		discipline: string
		change: 'added' | 'removed'
		timezone: string
		now?: Date
		quietUnlessMoved?: boolean
	},
	write: () => Promise<T>,
): Promise<{
	result: T
	headers: Headers | null
	/** The toast's words, for a caller that shows the toast itself. */
	description: string | null
}> {
	const weekKey = mondayOfDay(dayKey)
	const before = await getWeekVolumes(userId, { weekKey, now })
	const result = await write()
	const after = await getWeekVolumes(userId, { weekKey, now })
	if (quietUnlessMoved && !weekSumMoved(before, after, discipline)) {
		return { result, headers: null, description: null }
	}
	const description = weekSumChangeLine({
		before,
		after,
		discipline,
		weekName: relativeWeekName(weekKey, weekMonday(now, timezone)),
		change,
	})
	return {
		result,
		headers: await createToastHeaders({ description, type: 'success' }),
		description,
	}
}
