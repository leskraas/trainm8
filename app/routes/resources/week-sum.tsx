import {
	isCalendarDay,
	mondayOfDay,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getWeekVolumes } from '#app/utils/plan-outline/week-volumes.server.ts'
import { relativeWeekName } from '#app/utils/relative-week.ts'
import { WeekSumQuerySchema } from '#app/utils/writing-line-schema.ts'
import { type Route } from './+types/week-sum.ts'

/**
 * The week a day on the writing line belongs to, as it stands (#505 story 37):
 * every track's three numbers, through the same reader the Ukeskiftet card and
 * the toast use — so the "before" the line shows while the athlete types is the
 * "before" the toast reports after the write.
 *
 * Its own resource route rather than home's loader, because the line can name
 * any day the timeline renders, including days in a collapsed week whose
 * numbers home never built. The preview's arithmetic stays on the client
 * (`weekSumPreview`), so typing costs nothing after this one read per day.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const query = WeekSumQuerySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams),
	)
	const day = query.success ? query.data.day : ''
	// Every other ending answers as data rather than throwing — a decision
	// recorded in ADR 0082's S11 notes: a fetcher's error would reach home's
	// own error boundary and take the whole list down over a line that is only
	// ever a preview. Without the week, the line says nothing about it, the
	// write still works, and the toast after it reads the week on the server.
	try {
		const timezone = await getAthleteTimezone(userId)
		if (!query.success || !isCalendarDay(day, timezone)) {
			return { day, week: null }
		}
		const weekKey = mondayOfDay(day)
		return {
			day,
			week: {
				weekName: relativeWeekName(weekKey, weekMonday(new Date(), timezone)),
				volumes: await getWeekVolumes(userId, { weekKey }),
			},
		}
	} catch (error) {
		console.error('[week-sum] the week could not be read', error)
		return { day, week: null }
	}
}
