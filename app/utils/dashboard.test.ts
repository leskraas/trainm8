import { expect, test } from 'vitest'
import {
	buildWeekDays,
	countdownLabel,
	greetingFor,
	isoDayKey,
	paletteFor,
	planArc,
	plannedMinutes,
	prescribedDuration,
	sumBlockDurationMin,
} from './dashboard.ts'

/** A reading with no thresholds: only authored times and paces count. */
const NO_THRESHOLDS = { thresholds: {} }

// --- paletteFor ---

test('paletteFor returns a palette with bg, ring, chip, ink for known activity types', () => {
	for (const type of ['run', 'bike', 'swim', 'strength']) {
		const p = paletteFor(type)
		expect(p.bg, `bg for ${type}`).toBeTruthy()
		expect(p.ring, `ring for ${type}`).toBeTruthy()
		expect(p.chip, `chip for ${type}`).toBeTruthy()
		expect(p.ink, `ink for ${type}`).toBeTruthy()
	}
})

test('paletteFor returns distinct palettes for run, bike, swim, strength', () => {
	const run = paletteFor('run')
	const bike = paletteFor('bike')
	const swim = paletteFor('swim')
	const strength = paletteFor('strength')
	expect(run).not.toEqual(bike)
	expect(bike).not.toEqual(swim)
	expect(swim).not.toEqual(strength)
	expect(run).not.toEqual(strength)
})

test('paletteFor returns default palette for unknown activity type', () => {
	const unknown = paletteFor('unknown-type')
	const fromNull = paletteFor(null)
	const fromUndefined = paletteFor(undefined)
	expect(unknown).toEqual(fromNull)
	expect(fromNull).toEqual(fromUndefined)
})

// --- sumBlockDurationMin ---

test('sumBlockDurationMin returns null when no steps have durationSec', () => {
	const blocks = [
		{ repeatCount: 1, steps: [{ durationSec: null }, { durationSec: null }] },
		{ repeatCount: 2, steps: [{ durationSec: null }] },
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
})

test('sumBlockDurationMin returns null for empty blocks array', () => {
	expect(sumBlockDurationMin([], NO_THRESHOLDS)).toBeNull()
})

test('sumBlockDurationMin sums step durations across multiple blocks', () => {
	const blocks = [
		{ repeatCount: 1, steps: [{ durationSec: 600 }, { durationSec: 300 }] }, // 900s = 15min
		{ repeatCount: 1, steps: [{ durationSec: 1200 }] }, // 1200s = 20min
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBe(35)
})

test('sumBlockDurationMin multiplies each block by its repeatCount', () => {
	const blocks = [
		{ repeatCount: 4, steps: [{ durationSec: 180 }, { durationSec: 60 }] }, // 4 * 240s = 960s = 16min
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBe(16)
})

test('sumBlockDurationMin rounds to nearest minute', () => {
	// 90s = 1.5min → rounds to 2
	expect(
		sumBlockDurationMin(
			[{ repeatCount: 1, steps: [{ durationSec: 90 }] }],
			NO_THRESHOLDS,
		),
	).toBe(2)
	// 89s → rounds to 1
	expect(
		sumBlockDurationMin(
			[{ repeatCount: 1, steps: [{ durationSec: 89 }] }],
			NO_THRESHOLDS,
		),
	).toBe(1)
})

test('sumBlockDurationMin hides a total that leaves an untimed step out', () => {
	const blocks = [
		{ repeatCount: 1, steps: [{ durationSec: 600 }, { durationSec: null }] },
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
})

// --- prescribedDuration (#615) ---

const zone = (label: string) => JSON.stringify({ kind: 'zoneLabel', label })
const run = (step: {
	kind?: string
	discipline?: string | null
	intensity?: string | null
	durationSec?: number | null
	distanceM?: number | null
}) => ({
	kind: 'cardio',
	discipline: 'run',
	intensity: null,
	durationSec: null,
	distanceM: null,
	...step,
})

/** `15 min Z2 + 6 × (1 km @ 3:40 + 90 s) + 10 min Z1`: 15 + 6 × 5:10 + 10. */
const distanceReps = [
	{ repeatCount: 1, steps: [run({ intensity: zone('Z2'), durationSec: 900 })] },
	{
		repeatCount: 6,
		steps: [
			run({
				intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 220 }),
				distanceM: 1000,
			}),
			run({ kind: 'rest', durationSec: 90 }),
		],
	},
	{ repeatCount: 1, steps: [run({ intensity: zone('Z1'), durationSec: 600 })] },
]

/** `3 × 13 × 30/15 s` with 6 min between the series: 39 × 45 s + 2 × 6 min. */
const seriesBlock = {
	repeatCount: 13,
	seriesRepeatCount: 3,
	betweenSeriesRestSec: 360,
	steps: [
		run({ intensity: zone('Z5'), durationSec: 30 }),
		run({ kind: 'rest', durationSec: 15 }),
	],
}

test('prescribedDuration times a distance rep through the pace it is run at', () => {
	expect(prescribedDuration(distanceReps, NO_THRESHOLDS)).toEqual({
		seconds: 3360,
		complete: true,
		estimated: true,
	})
	expect(sumBlockDurationMin(distanceReps, NO_THRESHOLDS)).toBe(56)
})

test('prescribedDuration falls back to the threshold pace for a distance rep with no pace of its own', () => {
	const blocks = [
		{
			repeatCount: 5,
			steps: [run({ intensity: zone('Z4'), distanceM: 1000 })],
		},
	]
	const thresholds = {
		run: {
			lthr: null,
			maxHr: null,
			ftp: null,
			runPowerThresholdW: null,
			thresholdPaceSecPerKm: 240,
			cssSecPer100m: null,
			zoneSystem: null,
			zoneOverrides: null,
		},
	}
	expect(prescribedDuration(blocks, { thresholds })).toEqual({
		seconds: 1200,
		complete: true,
		estimated: true,
	})
})

test('prescribedDuration says when a distance step was timed through a pace', () => {
	expect(prescribedDuration(distanceReps, NO_THRESHOLDS)?.estimated).toBe(true)
	expect(prescribedDuration([seriesBlock], NO_THRESHOLDS)?.estimated).toBe(
		false,
	)
	expect(plannedMinutes(distanceReps, NO_THRESHOLDS)).toEqual({
		minutes: 56,
		estimated: true,
	})
})

test('prescribedDuration adds the rests between series', () => {
	expect(prescribedDuration([seriesBlock], NO_THRESHOLDS)).toEqual({
		seconds: 39 * 45 + 2 * 360,
		complete: true,
		estimated: false,
	})
	expect(sumBlockDurationMin([seriesBlock], NO_THRESHOLDS)).toBe(41)
})

test('prescribedDuration says when a step it cannot time leaves the total short', () => {
	const blocks = [
		{ repeatCount: 1, steps: [run({ durationSec: 600 })] },
		{ repeatCount: 5, steps: [run({ distanceM: 1000 })] },
	]
	expect(prescribedDuration(blocks, NO_THRESHOLDS)).toEqual({
		seconds: 600,
		complete: false,
		estimated: false,
	})
	expect(
		prescribedDuration([{ repeatCount: 1, steps: [run({})] }], NO_THRESHOLDS),
	).toBeNull()
})

const runProfile = {
	lthr: null,
	maxHr: null,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

test('sumBlockDurationMin hides a session whose distance step has no pace to time it by', () => {
	// `15 min · 8 km terskel · 10 min` with no threshold pace is not 25 min.
	const blocks = [
		{ repeatCount: 1, steps: [run({ durationSec: 900 })] },
		{
			repeatCount: 1,
			steps: [run({ intensity: zone('Z4'), distanceM: 8000 })],
		},
		{ repeatCount: 1, steps: [run({ durationSec: 600 })] },
	]
	expect(sumBlockDurationMin(blocks, NO_THRESHOLDS)).toBeNull()
	expect(sumBlockDurationMin(blocks, { thresholds: { run: runProfile } })).toBe(
		57,
	)
})

test('prescribedDuration times a step with no Discipline of its own as the Workout’s', () => {
	const blocks = [
		{
			repeatCount: 5,
			steps: [
				run({ discipline: null, intensity: zone('Z4'), distanceM: 1000 }),
			],
		},
	]
	const thresholds = { run: runProfile }
	expect(prescribedDuration(blocks, { thresholds })).toBeNull()
	expect(prescribedDuration(blocks, { thresholds, discipline: 'run' })).toEqual(
		{ seconds: 1200, complete: true, estimated: true },
	)
})

// --- countdownLabel ---

const REF = new Date('2025-01-15T10:00:00.000Z')

test('countdownLabel returns "Now" when scheduled time is in the past', () => {
	const past = new Date('2025-01-15T09:00:00.000Z') // 60 min before REF
	expect(countdownLabel(past, REF)).toBe('Now')
})

test('countdownLabel returns "In N min" when less than 60 minutes away', () => {
	const in45 = new Date('2025-01-15T10:45:00.000Z') // 45 min after REF
	expect(countdownLabel(in45, REF)).toBe('In 45 min')
})

test('countdownLabel returns "In Nh" when less than 24 hours away', () => {
	const in3h = new Date('2025-01-15T13:00:00.000Z') // 3h after REF
	expect(countdownLabel(in3h, REF)).toBe('In 3h')
})

test('countdownLabel returns "Tomorrow" when exactly 1 day away', () => {
	const tomorrow = new Date('2025-01-16T10:00:00.000Z') // 24h after REF
	expect(countdownLabel(tomorrow, REF)).toBe('Tomorrow')
})

test('countdownLabel returns "Tomorrow" for 1 day and a few hours', () => {
	const tomorrowPlus = new Date('2025-01-16T14:00:00.000Z') // 28h after REF
	expect(countdownLabel(tomorrowPlus, REF)).toBe('Tomorrow')
})

test('countdownLabel returns "In N days" when less than 7 days away', () => {
	const in4d = new Date('2025-01-19T10:00:00.000Z') // 4 days after REF
	expect(countdownLabel(in4d, REF)).toBe('In 4 days')
})

test('countdownLabel returns "In Nw" when 7 or more days away', () => {
	const in2w = new Date('2025-01-29T10:00:00.000Z') // 14 days after REF → 2w
	expect(countdownLabel(in2w, REF)).toBe('In 2w')
})

test('countdownLabel returns "In 1w" when exactly 7 days away', () => {
	const in7d = new Date('2025-01-22T10:00:00.000Z') // 7 days after REF
	expect(countdownLabel(in7d, REF)).toBe('In 1w')
})

// --- greetingFor (hour evaluated in the Athlete Timezone, #172) ---

test('greetingFor returns "Good morning" for hours before noon', () => {
	expect(greetingFor(new Date('2025-01-15T06:00:00Z'), 'UTC')).toBe(
		'Good morning',
	)
	expect(greetingFor(new Date('2025-01-15T11:59:00Z'), 'UTC')).toBe(
		'Good morning',
	)
})

test('greetingFor returns "Good afternoon" for hours 12–16', () => {
	expect(greetingFor(new Date('2025-01-15T12:00:00Z'), 'UTC')).toBe(
		'Good afternoon',
	)
	expect(greetingFor(new Date('2025-01-15T16:59:00Z'), 'UTC')).toBe(
		'Good afternoon',
	)
})

test('greetingFor returns "Good evening" for hours 17–20', () => {
	expect(greetingFor(new Date('2025-01-15T17:00:00Z'), 'UTC')).toBe(
		'Good evening',
	)
	expect(greetingFor(new Date('2025-01-15T20:59:00Z'), 'UTC')).toBe(
		'Good evening',
	)
})

test('greetingFor returns "Up late" for hours 21–23', () => {
	expect(greetingFor(new Date('2025-01-15T21:00:00Z'), 'UTC')).toBe('Up late')
	expect(greetingFor(new Date('2025-01-15T23:59:00Z'), 'UTC')).toBe('Up late')
})

test('greetingFor evaluates the hour in the given timezone', () => {
	// 23:00 UTC is 08:00 next morning in Tokyo.
	const instant = new Date('2025-01-15T23:00:00Z')
	expect(greetingFor(instant, 'UTC')).toBe('Up late')
	expect(greetingFor(instant, 'Asia/Tokyo')).toBe('Good morning')
})

// --- isoDayKey ---

test('isoDayKey formats date as YYYY-MM-DD', () => {
	expect(isoDayKey(new Date(2025, 0, 15))).toBe('2025-01-15')
})

test('isoDayKey pads month and day with leading zero', () => {
	expect(isoDayKey(new Date(2025, 2, 5))).toBe('2025-03-05')
})

test('isoDayKey handles year-end boundary', () => {
	expect(isoDayKey(new Date(2024, 11, 31))).toBe('2024-12-31')
})

// --- buildWeekDays ---

test('buildWeekDays returns 7 dates by default', () => {
	const today = new Date(2025, 0, 15)
	expect(buildWeekDays(today)).toHaveLength(7)
})

test('buildWeekDays starts at midnight on the given today', () => {
	const today = new Date(2025, 0, 15)
	const days = buildWeekDays(today)
	expect(days[0]).toEqual(new Date(2025, 0, 15, 0, 0, 0, 0))
})

test('buildWeekDays returns consecutive days in ascending order', () => {
	const today = new Date(2025, 0, 15)
	const days = buildWeekDays(today)
	expect(isoDayKey(days[0]!)).toBe('2025-01-15')
	expect(isoDayKey(days[1]!)).toBe('2025-01-16')
	expect(isoDayKey(days[6]!)).toBe('2025-01-21')
})

test('buildWeekDays respects custom length', () => {
	const today = new Date(2025, 0, 15)
	expect(buildWeekDays(today, 5)).toHaveLength(5)
	expect(buildWeekDays(today, 14)).toHaveLength(14)
})

// --- planArc ---

const ARC_PHASES = [
	{ name: 'Base', weeks: 4 },
	{ name: 'Build', weeks: 4 },
	{ name: 'Peak', weeks: 2 },
	{ name: 'Taper', weeks: 2 }, // total = 12 weeks
]
// A 12-week plan whose authored start is 12 weeks before its event (ADR 0044:
// the start is stored, not counted back from the event).
const ARC_EVENT = new Date('2025-04-01T00:00:00.000Z')
const ARC_START = new Date('2025-01-07T00:00:00.000Z') // 12 weeks (84 days) before
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

test('planArc sums total weeks across all phases', () => {
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, ARC_START)
	expect(arc.totalWeeks).toBe(12)
})

test('planArc reports week 1 at the plan start', () => {
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, ARC_START)
	expect(arc.weekInPlan).toBe(1)
	expect(arc.phase).toBe('Base')
	expect(arc.progressPct).toBe(0)
})

test('planArc derives the current phase and week from weeks elapsed', () => {
	// 5 weeks in → week 6 (1-based), which falls in the Build phase (weeks 5–8).
	const now = new Date(ARC_START.getTime() + 5 * WEEK_MS)
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, now)
	expect(arc.weekInPlan).toBe(6)
	expect(arc.phase).toBe('Build')
})

test('planArc progress is weeks-elapsed of total weeks', () => {
	// 6 of 12 weeks elapsed → 50%.
	const now = new Date(ARC_START.getTime() + 6 * WEEK_MS)
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, now)
	expect(arc.progressPct).toBe(50)
})

test('planArc clamps week and progress at the final week on the event date', () => {
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, ARC_EVENT)
	expect(arc.weekInPlan).toBe(12)
	expect(arc.phase).toBe('Taper')
	expect(arc.progressPct).toBe(100)
})

test('planArc clamps to week 1 before the plan has started', () => {
	const before = new Date(ARC_START.getTime() - 3 * WEEK_MS)
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, before)
	expect(arc.weekInPlan).toBe(1)
	expect(arc.progressPct).toBe(0)
})

test('planArc reports the current phase by position, not by name', () => {
	// Two phases may share a name in a multi-event season; the index disambiguates.
	const now = new Date(ARC_START.getTime() + 5 * WEEK_MS)
	expect(planArc(ARC_PHASES, ARC_START, ARC_EVENT, now).phaseIndex).toBe(1)
})

test('planArc runs forward from the authored start, so a plan may end before its event', () => {
	// A 12-week plan starting 16 weeks out finishes 4 weeks early: at the event the
	// arc reads its final week rather than stretching to meet the date.
	const earlyStart = new Date(ARC_EVENT.getTime() - 16 * WEEK_MS)
	const arc = planArc(ARC_PHASES, earlyStart, ARC_EVENT, ARC_EVENT)
	expect(arc.weekInPlan).toBe(12)
	expect(arc.progressPct).toBe(100)
})

test('planArc carries a countdown to the event date', () => {
	const now = new Date(ARC_EVENT.getTime() - 14 * 24 * 60 * 60 * 1000)
	const arc = planArc(ARC_PHASES, ARC_START, ARC_EVENT, now)
	expect(arc.countdown).toBe('In 2w')
})
