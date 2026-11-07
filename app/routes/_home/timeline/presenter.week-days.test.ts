/**
 * A week's days are built when the week is read, once (ADR 0113 §2). The
 * season presenter builds only the week skeleton — what the Week Strip and
 * the headers read — so opening the full view does work in proportion to
 * what it mounts, not to the length of the season.
 *
 * `formatNbWeekdayShort` labels a day's gutter and nothing in the skeleton
 * calls it, so counting its calls counts the days built.
 */
import { expect, test, vi } from 'vitest'
import type * as Format from '#app/utils/format.ts'
import type * as SessionProfile from '#app/utils/session-profile.ts'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { buildCalmToday } from '../__calm-today.ts'
import { findDay } from './day-lookup.ts'
import { buildTimelineSeason, weekDays } from './presenter.ts'

const dayLabels = vi.hoisted(() => ({ calls: 0 }))
const profiles = vi.hoisted(() => ({ calls: 0 }))

vi.mock('#app/utils/session-profile.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof SessionProfile>()
	return {
		...actual,
		deriveSessionProfile: (
			...args: Parameters<typeof actual.deriveSessionProfile>
		) => {
			profiles.calls += 1
			return actual.deriveSessionProfile(...args)
		},
	}
})

vi.mock('#app/utils/format.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof Format>()
	return {
		...actual,
		formatNbWeekdayShort: (
			...args: Parameters<typeof actual.formatNbWeekdayShort>
		) => {
			dayLabels.calls += 1
			return actual.formatNbWeekdayShort(...args)
		},
	}
})

const NOW = new Date('2030-02-20T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function planned(days: number): LedgerSession {
	return {
		id: `session-${days}`,
		scheduledAt: new Date(NOW.getTime() + days * DAY),
		status: 'planned',
		source: 'authored',
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: null,
		plannedTssValue: 40,
		plannedTssConfidence: 'full',
		replanReason: null,
		workout: null,
		recording: null,
		sessionLog: null,
		setLogs: [],
	}
}

/**
 * A season a year long: a session a week, on Mondays, from half a year back to
 * half a year ahead. Today (Wednesday) is free; the next session is Monday.
 */
function longSeason() {
	const ledger = Array.from({ length: 52 }, (_, i) => planned((i - 25) * 7 + 5))
	return buildTimelineSeason({ ledger, now: NOW, timezone: 'UTC' })
}

test('building the season builds no week its days, and draws no session its bars', () => {
	dayLabels.calls = 0
	profiles.calls = 0
	const season = longSeason()
	expect(season.weeks.length).toBeGreaterThan(50)
	expect(dayLabels.calls).toBe(0)
	// A row's profile bars are only drawn: they are built with its day.
	expect(profiles.calls).toBe(0)
	weekDays(season.weeks[season.todayWeekIndex + 2]!)
	expect(profiles.calls).toBe(1)
})

test('reading a week builds that week its days, once, and no other week', () => {
	const season = longSeason()
	const thisWeek = season.weeks[season.todayWeekIndex]!
	dayLabels.calls = 0
	const days = weekDays(thisWeek)
	expect(days).toHaveLength(7)
	expect(dayLabels.calls).toBe(7)
	expect(weekDays(thisWeek)).toBe(days)
	expect(dayLabels.calls).toBe(7)
})

test('finding a day builds only the week it falls in', () => {
	const season = longSeason()
	dayLabels.calls = 0
	expect(findDay(season.weeks, '2030-05-01')?.day.key).toBe('2030-05-01')
	expect(dayLabels.calls).toBe(7)
})

test('the calm view reads this week and walks ahead only to the next planned session', () => {
	const season = longSeason()
	dayLabels.calls = 0
	const calm = buildCalmToday({
		season,
		ledger: [],
		now: NOW,
		timezone: 'UTC',
		activePlan: null,
	})
	expect(calm.week.days).toHaveLength(7)
	// This week, and next week, which holds the next planned session.
	expect(dayLabels.calls).toBe(14)
})

test('a week built outside the presenter has no days to read', () => {
	const season = longSeason()
	expect(() => weekDays({ ...season.weeks[0]! })).toThrow(/has no days/)
})
