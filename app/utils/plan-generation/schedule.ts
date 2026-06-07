import { type GeneratedPlan, type GeneratedSession } from './schema.ts'

/**
 * Training Availability + Athlete Timezone (PRD #103, #104), the inputs the
 * scheduler needs to place schedule-agnostic generated sessions onto concrete
 * UTC instants.
 */
export type TrainingAvailability = {
	/** Weekday numbers the athlete can train: 0=Sun … 6=Sat (ADR 0005). */
	trainableWeekdays: number[]
	/** Default time-of-day, "HH:MM" 24h, interpreted in `timezone`. */
	defaultTrainingTime: string
	/** IANA timezone string. */
	timezone: string
}

export type ScheduledSession = GeneratedSession & { scheduledAt: Date }

export type ScheduleOptions = {
	/** The plan's anchor instant; week 0 is the calendar week beginning here. */
	startDate: Date
	/** How many weeks the plan covers; sessions beyond this are dropped. */
	horizonWeeks: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Pure scheduling helper (PRD #103): map a typed plan + Training Availability +
 * horizon onto sessions with a concrete `scheduledAt` (UTC).
 *
 * Each session carries a `weekIndex` and `orderInWeek`. For week N we take the
 * trainable weekdays falling in the calendar week beginning `startDate + N*7`
 * days, and place that week's sessions onto them in `orderInWeek` order. The
 * local wall-clock time (`defaultTrainingTime`) is converted to a UTC instant in
 * the athlete's timezone — DST-aware, so 09:00 local stays 09:00 local across a
 * spring-forward or fall-back. Sessions beyond the horizon, or weeks with no
 * trainable days, are dropped.
 */
export function scheduleSessions(
	plan: GeneratedPlan,
	availability: TrainingAvailability,
	options: ScheduleOptions,
): ScheduledSession[] {
	const { trainableWeekdays, defaultTrainingTime, timezone } = availability
	const { startDate, horizonWeeks } = options
	const [hour, minute] = parseTime(defaultTrainingTime)

	const weekdaySet = new Set(trainableWeekdays)
	if (weekdaySet.size === 0) return []

	// Calendar date of the start instant, in the athlete's timezone. Anchor on
	// noon UTC so whole-day arithmetic never lands on a DST gap when we read back
	// the calendar date / weekday.
	const startLocal = localCalendarDate(startDate, timezone)
	const anchor = Date.UTC(
		startLocal.year,
		startLocal.month - 1,
		startLocal.day,
		12,
	)

	const scheduled: ScheduledSession[] = []

	for (const session of plan.sessions) {
		if (session.weekIndex >= horizonWeeks) continue

		// Trainable calendar dates within this session's week, in order.
		const slots: Array<{ year: number; month: number; day: number }> = []
		for (let d = 0; d < 7; d++) {
			const offsetDays = session.weekIndex * 7 + d
			const date = new Date(anchor + offsetDays * DAY_MS)
			if (weekdaySet.has(date.getUTCDay())) {
				slots.push({
					year: date.getUTCFullYear(),
					month: date.getUTCMonth() + 1,
					day: date.getUTCDate(),
				})
			}
		}
		if (slots.length === 0) continue

		// Place the session on the slot matching its ordinal; clamp extra
		// sessions onto the last trainable day of the week.
		const slot = slots[Math.min(session.orderInWeek, slots.length - 1)]!
		const scheduledAt = zonedTimeToUtc(
			slot.year,
			slot.month,
			slot.day,
			hour,
			minute,
			timezone,
		)
		scheduled.push({ ...session, scheduledAt })
	}

	return scheduled.sort(
		(a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
	)
}

/** The next undetailed window of a Plan Outline (PRD #103, user story 21). */
export type DetailWindow = {
	/** 0-based plan week the next window begins at (weeks after `startDate`). */
	startWeekIndex: number
	/** Calendar instant to anchor the scheduler at for the next window. */
	startDate: Date
	/** Weeks of the Outline still undetailed from `startWeekIndex` on (≥ 1). */
	remainingWeeks: number
}

/**
 * Compute the next undetailed window of a Plan Outline, or `null` when the
 * Outline is fully detailed (extend is then a no-op) — PRD #103 (#110).
 *
 * The Plan Outline spans `totalOutlineWeeks`, but only the near-term window is
 * ever materialized into concrete sessions. Given the `scheduledAt` instants of
 * the already-materialized generated sessions anchored to an Event, we treat the
 * earliest as plan week 0 and tile the plan into 7-day blocks: the latest session
 * sits in week `floor((latest − earliest) / 7d)`, so detailing resumes at the
 * week after it. When that week reaches `totalOutlineWeeks` the Outline is fully
 * detailed and we return `null`.
 *
 * With nothing materialized yet (an Outline-only Event) detailing starts at week
 * 0 anchored on `now`.
 */
export function nextDetailWindow(
	existingScheduledAts: Date[],
	totalOutlineWeeks: number,
	now: Date,
): DetailWindow | null {
	const WEEK_MS = 7 * DAY_MS

	if (existingScheduledAts.length === 0) {
		if (totalOutlineWeeks < 1) return null
		return {
			startWeekIndex: 0,
			startDate: now,
			remainingWeeks: totalOutlineWeeks,
		}
	}

	const times = existingScheduledAts.map((d) => d.getTime())
	const earliest = Math.min(...times)
	const latest = Math.max(...times)

	const latestWeek = Math.floor((latest - earliest) / WEEK_MS)
	const startWeekIndex = latestWeek + 1
	if (startWeekIndex >= totalOutlineWeeks) return null

	return {
		startWeekIndex,
		startDate: new Date(earliest + startWeekIndex * WEEK_MS),
		remainingWeeks: totalOutlineWeeks - startWeekIndex,
	}
}

function parseTime(time: string): [number, number] {
	const [h, m] = time.split(':')
	return [Number(h), Number(m)]
}

function localCalendarDate(
	instant: Date,
	timezone: string,
): { year: number; month: number; day: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(instant)
	const get = (type: string) =>
		Number(parts.find((p) => p.type === type)!.value)
	return { year: get('year'), month: get('month'), day: get('day') }
}

/**
 * Convert a wall-clock local time in `timezone` to the corresponding UTC
 * instant. DST-aware: the offset is recomputed at the candidate instant so a
 * spring-forward/fall-back yields the right UTC time. (We avoid date-fns-tz; the
 * project has no tz library, and `Intl` provides the offset.)
 */
function zonedTimeToUtc(
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
	timezone: string,
): Date {
	const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
	// First guess using the offset at the wall time read as UTC.
	const offset1 = tzOffsetMs(timezone, new Date(wallAsUtc))
	let utc = wallAsUtc - offset1
	// Refine: the offset may differ at the guessed instant (near a DST edge).
	const offset2 = tzOffsetMs(timezone, new Date(utc))
	if (offset2 !== offset1) {
		utc = wallAsUtc - offset2
	}
	return new Date(utc)
}

/**
 * Offset of `timezone` from UTC at `instant`, in ms (local − UTC). Positive east
 * of UTC. Derived by formatting the instant in the zone and comparing to UTC.
 */
function tzOffsetMs(timezone: string, instant: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(instant)
	const get = (type: string) =>
		Number(parts.find((p) => p.type === type)!.value)
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	)
	return asUtc - instant.getTime()
}
