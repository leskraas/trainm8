import {
	addDays,
	isCalendarDay,
	localDate,
	mondayOfDay,
	weekBoundsFromMondayUTC,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { listCatalogue } from '#app/utils/catalogue.server.ts'
import { type SessionArchetype } from '#app/utils/catalogue.ts'
import { prisma } from '#app/utils/db.server.ts'
import { dayPaneTitle, SESSION_ARCHETYPE_LABELS } from '#app/utils/labels.ts'
import { type SummedWorkout } from '#app/utils/plan-outline/week-sum.ts'
import {
	type NotationInput,
	workoutToNotationInput,
} from '#app/utils/workout-notation.ts'
import { ComposerSourcesQuerySchema } from '#app/utils/writing-line-schema.ts'
import { readTimelineWindow } from '#app/utils/writing-line.server.ts'
import { structureSentence } from '../_home/timeline/composer-sentence.ts'
import { type Route } from './+types/composer-sources.ts'

/** How many Catalogue sessions the composer's Bibliotek lists at most. */
const LIBRARY_LIMIT = 40

/**
 * One thing the composer can start from: a Catalogue session (Bibliotek) or
 * one of the athlete's own sessions (Kopier).
 */
export type ComposerSourceItem = {
	/** The Workout to place (Bibliotek), or the session to copy (Kopier). */
	id: string
	title: string
	discipline: string
	/** What sets it apart in the list: an archetype, or the day it was on. */
	label: string
	/**
	 * The line that reads back to exactly this session, so the pick arrives in
	 * the composer as tokens the athlete adjusts — or null when the line cannot
	 * say it, and the pick is placed whole (`composer-sentence.ts`).
	 */
	sentence: string | null
	/** Its tokens, rendered from structure like every Token Sentence. */
	notation: NotationInput
	/** Its shape for the week sum before → after. */
	summed: SummedWorkout
}

const workoutSelect = {
	id: true,
	title: true,
	discipline: true,
	blocks: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			name: true,
			orderIndex: true,
			repeatCount: true,
			seriesRepeatCount: true,
			betweenSeriesRestSec: true,
			sendOff: true,
			steps: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					kind: true,
					notes: true,
					orderIndex: true,
					discipline: true,
					intensity: true,
					durationSec: true,
					distanceM: true,
					verticalM: true,
					gradePct: true,
					cadenceRpmMin: true,
					cadenceRpmMax: true,
					rest: true,
					exerciseId: true,
					restBetweenSetsSec: true,
					exercise: { select: { name: true } },
					sets: {
						orderBy: { orderIndex: 'asc' as const },
						select: {
							orderIndex: true,
							kind: true,
							load: true,
							weightKg: true,
							pct1RM: true,
							effortCap: true,
							tempo: true,
							reps: true,
							durationSec: true,
							terminationRir: true,
							velocityLossPct: true,
						},
					},
				},
			},
		},
	},
} as const

type SourceWorkout = {
	id: string
	title: string
	discipline: string
} & Parameters<typeof workoutToNotationInput>[0] & {}

/**
 * The session's shape as the week sum and the line read it, and whether the
 * line may say it at all: anything it has no words for (a named block, a
 * series, a send-off, a cadence, a climb, a step's own sport or note) makes
 * the pick a whole session rather than a line, so nothing is lost on a nudge.
 */
function readShape(
	discipline: string,
	notation: NotationInput,
): { summed: SummedWorkout; sentence: string | null } {
	let sayable = true
	const blocks = notation.blocks.map((block) => {
		if (
			block.name ||
			(block.seriesRepeatCount ?? 1) !== 1 ||
			block.sendOff ||
			block.betweenSeriesRestSec
		)
			sayable = false
		return {
			repeatCount: block.repeatCount,
			steps: block.steps.map((step) => {
				if (
					step.verticalM != null ||
					step.gradePct != null ||
					step.cadenceRpmMin != null ||
					step.cadenceRpmMax != null ||
					// A timed rest is the line's own `p 90 s`; any other form is not.
					(step.rest != null && step.rest.kind !== 'time') ||
					step.notes ||
					step.disciplineOverride
				)
					sayable = false
				if (step.kind === 'rest')
					return {
						kind: 'rest' as const,
						...(step.durationSec != null
							? { durationSec: step.durationSec }
							: {}),
					}
				if (step.kind === 'strength')
					return {
						kind: 'strength' as const,
						exerciseId: step.exerciseId ?? '',
						sets: [],
					}
				return {
					kind: 'cardio' as const,
					discipline: (step.discipline ?? discipline) as 'run',
					...(step.durationSec != null
						? { durationSec: step.durationSec }
						: {}),
					...(step.distanceM != null ? { distanceM: step.distanceM } : {}),
					...(step.intensity ? { intensity: step.intensity } : {}),
				}
			}),
		}
	})
	const summed = { discipline, blocks } as SummedWorkout
	return { summed, sentence: sayable ? structureSentence(summed) : null }
}

function toItem(
	workout: SourceWorkout,
	{ id, label }: { id: string; label: string },
): ComposerSourceItem {
	const notation = workoutToNotationInput(workout)
	return {
		id,
		title: workout.title,
		discipline: workout.discipline,
		label,
		notation,
		...readShape(workout.discipline, notation),
	}
}

/**
 * The composer's two sources a day can start from (owner decisions 1 and 11):
 *
 * - **Bibliotek** — Catalogue sessions the athlete may see, in the sport they
 *   are writing, through the Catalogue's own visibility guard
 *   (`listCatalogue`). Placing one goes through `placeCatalogueSession`.
 * - **Kopier** — the athlete's own sessions with a prescription, from the week
 *   before the day's (`weeksBack` reaches further), the same weekday first:
 *   "last Tuesday's" is what one copies most.
 *
 * And the day's own limit, so the composer can say why a day cannot be
 * filled rather than offering a list that writes nothing: a day before the
 * first one I dag reads.
 *
 * Every failure answers as data, as the week-sum resource does (ADR 0082
 * §11): a fetcher's throw would take home down over a list that is only ever a
 * convenience.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const query = ComposerSourcesQuerySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	)
	const empty = {
		day: query.success ? query.data.day : '',
		firstDayKey: null as string | null,
		library: [] as ComposerSourceItem[],
		copy: {
			weekKey: null as string | null,
			weeksBack: 1,
			items: [] as ComposerSourceItem[],
		},
	}
	if (!query.success) return empty
	try {
		const { day, discipline, weeksBack = 1 } = query.data
		const timezone = await getAthleteTimezone(userId)
		if (!isCalendarDay(day, timezone)) return empty
		const now = new Date()
		const window = await readTimelineWindow(userId, { now, timezone })

		const entries = await listCatalogue({ viewerId: userId, discipline })
		const shown = entries.slice(0, LIBRARY_LIMIT)
		const libraryWorkouts = await prisma.workout.findMany({
			where: { id: { in: shown.map((entry) => entry.workoutId) } },
			select: workoutSelect,
		})
		const byId = new Map(libraryWorkouts.map((w) => [w.id, w]))
		const library = shown.flatMap((entry) => {
			const workout = byId.get(entry.workoutId)
			return workout
				? [
						toItem(workout, {
							id: workout.id,
							label: entry.archetype
								? SESSION_ARCHETYPE_LABELS[entry.archetype as SessionArchetype]
								: '',
						}),
					]
				: []
		})

		const weekKey = addDays(mondayOfDay(day), -7 * weeksBack)
		const { start, end } = weekBoundsFromMondayUTC(weekKey, timezone)
		const sessions = await prisma.workoutSession.findMany({
			where: {
				userId,
				scheduledAt: { gte: start, lte: end },
				workoutId: { not: null },
				...(discipline ? { workout: { discipline } } : {}),
			},
			orderBy: { scheduledAt: 'asc' },
			select: {
				id: true,
				scheduledAt: true,
				workout: { select: workoutSelect },
			},
		})
		const sameWeekday = weekdayIndex(day)
		const copy = sessions
			.flatMap((session) => {
				if (!session.workout) return []
				const key = localDate(session.scheduledAt, timezone)
				return [
					{
						weekday: weekdayIndex(key),
						item: toItem(session.workout, {
							id: session.id,
							label: dayPaneTitle(
								weekdayIndex(key),
								Number(key.slice(8, 10)),
								Number(key.slice(5, 7)) - 1,
							),
						}),
					},
				]
			})
			// The same weekday first, then the week in order.
			.sort(
				(a, b) =>
					Number(b.weekday === sameWeekday) - Number(a.weekday === sameWeekday),
			)
			.map(({ item }) => item)

		return {
			day,
			firstDayKey: window.firstDayKey,
			library,
			copy: { weekKey, weeksBack, items: copy },
		}
	} catch (error) {
		console.error('[composer-sources] the sources could not be read', error)
		return empty
	}
}
