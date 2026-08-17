/**
 * Training-level demo athletes — five logins, twelve months of *history* each,
 * at clearly different levels, so Plan Generation can be exercised against a
 * beginner, a real inconsistent human, an intermediate, an advanced runner and a
 * multi-track triathlete.
 *
 * Run with `npx tsx prisma/seed-athlete-levels.ts`. **Additive and idempotent**
 * — it never resets the database, never writes a migration, and every row it
 * owns hangs off a stable key (`username`, and an `externalId` under
 * `seed-levels:<slug>:`), so a second run updates in place and prunes nothing
 * else. It is deliberately *not* wired into `prisma/seed.ts`, which is a
 * reset-time script that creates its users unconditionally.
 *
 * **History only.** No Plan Outline, no Training Track, no planned or
 * future-dated Workout Session. Each athlete does get one *future* **Target
 * Event** carrying no Plan Outline — legal by construction (`PlanOutline` is 1:1
 * with `Event` through a unique `eventId`, so an Event without one is a calendar
 * marker, ADR 0018) — which is exactly the "something to plan toward, nothing
 * planned yet" state generation should be tested from.
 *
 * **Where history lands** (CONTEXT.md, ADR 0049): every logged effort is an
 * **Activity Import** promoted to a recording-only completed **Workout
 * Session** as its **Recording**, plus a **Session Log** carrying RPE — the
 * exact shape auto-save writes, and the same shape `prisma/seed.ts` replays
 * kody's real Strava history into. An Activity Import is never rendered on the
 * Tape by itself, so an import-only history would seed an invisible athlete.
 * Then one `recomputeLoadFrom` per athlete earns TSS / CTL / ATL / TSB through
 * the real load pipeline rather than storing numbers by hand.
 *
 * **Shape source.** The one athlete the intervals.icu key reaches (`i634692`,
 * the repo owner) is snapshotted in `seed-data/intervals-real-history.json` and
 * replayed verbatim as athlete #2. The other four are *scaled from that same
 * snapshot*: the run pace distribution, the pace spread, the weekday habit
 * weights, the average-HR spread and the RPE distribution are all measured off
 * the real activities at seed time (`deriveRealShape`) and re-sampled per level.
 * Nothing here is a smooth ramp of identical sessions.
 *
 * Dev/demo fixture only — the synthesized aggregates are fabricated data and
 * must never reach production (ADR 0008).
 */

import { readFileSync } from 'node:fs'
import { intervalsIcuTypeToDiscipline } from '#app/integrations/intervalsicu/discipline-map.ts'
import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { createPassword } from '#tests/db-utils.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 52
const TIMEZONE = 'Europe/Oslo'
/** Every `externalId` this script owns starts here, which is what makes a rerun prunable. */
const KEY_PREFIX = 'seed-levels'

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, seedable, stable across runs so the fixture is reproducible. */
function makeRandom(seed: string) {
	let h = 2166136261
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i)
		h = Math.imul(h, 16777619)
	}
	let a = h >>> 0
	return function random() {
		a |= 0
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

type Random = () => number

function pick<T>(random: Random, xs: readonly T[]): T {
	return xs[Math.floor(random() * xs.length)]!
}

/** A value from a sorted sample at a uniformly-drawn quantile — keeps the real spread. */
function sample(random: Random, sorted: number[]): number {
	if (sorted.length === 0) return 0
	return sorted[
		Math.min(sorted.length - 1, Math.floor(random() * sorted.length))
	]!
}

function median(xs: number[]): number {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Half-kilometre grain: humans record 6.5 km, never 6.4318 km. */
function snapKm(km: number): number {
	return Math.max(1, Math.round(km * 2) / 2)
}

/** Whole or half minutes, which is what a watch's summary screen shows. */
function snapMinutes(minutes: number): number {
	return Math.max(10, Math.round(minutes / 5) * 5)
}

// ---------------------------------------------------------------------------
// The real snapshot, and the shape measured off it
// ---------------------------------------------------------------------------

type RealActivity = {
	externalId: string
	type: string
	name: string | null
	startedAt: string
	movingSec: number
	elapsedSec: number
	distanceM: number | null
	hrAvg: number | null
	hrMax: number | null
	cadenceAvg: number | null
	speedMaxMps: number | null
	elevationGainM: number | null
	rpe: number | null
	raw: Record<string, unknown>
}

type RealSnapshot = {
	source: string
	capturedAt: string
	count: number
	activities: RealActivity[]
}

function loadRealSnapshot(): RealSnapshot {
	const raw = readFileSync(
		new URL('./seed-data/intervals-real-history.json', import.meta.url),
		'utf8',
	)
	return JSON.parse(raw) as RealSnapshot
}

type RealShape = {
	/** Sorted run paces (sec/km) — the real range easy-to-hard efforts land in. */
	runPacesSecPerKm: number[]
	/** Sorted multiplicative pace residuals around the median, for jitter with real width. */
	paceResiduals: number[]
	/** Sorted average-HR values, used for the width of the HR spread, not its level. */
	hrAvgs: number[]
	/** Weekday habit weights, Sun…Sat, from the real start days. */
	weekdayWeights: number[]
	/** The real RPE values (with the real 8 % of sessions carrying none). */
	rpeValues: Array<number | null>
	medianRunPaceSecPerKm: number
}

function deriveRealShape(snapshot: RealSnapshot): RealShape {
	const runs = snapshot.activities.filter(
		(a) =>
			intervalsIcuTypeToDiscipline(a.type) === 'run' &&
			(a.distanceM ?? 0) > 1000 &&
			a.movingSec > 0,
	)
	const runPaces = runs
		.map((a) => a.movingSec / (a.distanceM! / 1000))
		.sort((x, y) => x - y)
	const medianPace = median(runPaces)
	const weekdayWeights = [0, 0, 0, 0, 0, 0, 0]
	for (const a of snapshot.activities) {
		weekdayWeights[new Date(a.startedAt).getUTCDay()]! += 1
	}
	return {
		runPacesSecPerKm: runPaces,
		paceResiduals: runPaces.map((p) => p / medianPace).sort((x, y) => x - y),
		hrAvgs: snapshot.activities
			.map((a) => a.hrAvg)
			.filter((v): v is number => v != null)
			.sort((x, y) => x - y),
		weekdayWeights,
		rpeValues: snapshot.activities.map((a) => a.rpe ?? null),
		medianRunPaceSecPerKm: medianPace,
	}
}

// ---------------------------------------------------------------------------
// Level definitions
// ---------------------------------------------------------------------------

type Discipline = 'run' | 'bike' | 'swim' | 'strength'

/**
 * One recurring slot in an athlete's week. `km` drives runs and swims (the
 * distance-recording disciplines); `minutes` drives rides and lifting.
 * `perWeek` may be fractional — 0.5 means "most other weeks".
 */
type Slot = {
	label: string
	discipline: Discipline
	perWeek: number
	/** Preferred weekdays, 0=Sun…6=Sat, tried in order. */
	days: number[]
	km?: number
	minutes?: number
	/** Relative effort, used for pace, HR and RPE — never stored as a plan. */
	effort: 'recovery' | 'easy' | 'endurance' | 'tempo' | 'threshold' | 'vo2max'
	/** May share a day with another slot (the advanced athlete's double). */
	double?: boolean
}

type ThresholdSpec = {
	discipline: Discipline
	maxHr?: number
	lthr?: number
	ftp?: number
	thresholdPaceSecPerKm?: number
	cssSecPer100m?: number
	zoneSystem?: string
	/** How the recipe got there (#454) — authored per athlete, never inferred. */
	zoneSystemSource?: 'default' | 'athlete'
	/** Why the unset ones are unset — printed in the summary, not stored. */
	note: string
}

type LevelSpec = {
	slug: string
	username: string
	name: string
	blurb: string
	sex: 'male' | 'female'
	weightKg: number
	heightCm: number
	/** Availability the generator honours and Plan Generation reads (PRD #103). */
	trainableWeekdays: number[]
	defaultTrainingTime: string
	weeklyCapacityHours: number | null
	/** Run pace level relative to the real athlete's 5:44/km median (1 = same). */
	paceFactor: number
	/** HR level: the average-HR spread is recentred on this. */
	hrCentre: number | null
	slots: Slot[]
	thresholds: ThresholdSpec[]
	/** Weeks (counting back from this week) with no training at all. */
	blankWeeksAgo: number[]
	/** Chance a scheduled slot simply did not happen. */
	missRate: number
	/** Every Nth week is an easier week. */
	easyWeekEvery: number
	pastRace?: {
		weeksAgo: number
		name: string
		discipline: Discipline
		distanceM: number
		timeSec: number
		priority: 'A' | 'B' | 'C'
	}
	targetEvent: {
		name: string
		weeksAhead: number
		kind: 'race' | 'time-trial' | 'fitness-goal'
		priority: 'A' | 'B' | 'C'
		disciplines: Discipline[]
		target?: { kind: 'time'; seconds: number } | { kind: 'finish' }
	}
	/** Replay the real snapshot instead of synthesizing (athlete #2 only). */
	replayReal?: boolean
}

const LEVELS: LevelSpec[] = [
	{
		slug: 'beginner',
		username: 'bea',
		name: 'Bea Nordli',
		blurb: 'Beginner runner — ~17 km/wk, single Run track',
		sex: 'female',
		weightKg: 66,
		heightCm: 168,
		trainableWeekdays: [2, 4, 6],
		defaultTrainingTime: '17:30',
		weeklyCapacityHours: 3,
		paceFactor: 1.22, // ~7:00/km
		hrCentre: 158,
		slots: [
			{
				label: 'Easy run',
				discipline: 'run',
				perWeek: 2,
				days: [2, 4],
				km: 4.5,
				effort: 'easy',
			},
			{
				label: 'Weekend long run',
				discipline: 'run',
				perWeek: 1,
				days: [6],
				km: 8,
				effort: 'endurance',
			},
		],
		thresholds: [
			{
				discipline: 'run',
				// A watch's age-formula max HR and nothing else: no LTHR, no threshold
				// pace. Zone labels and RPE have to carry her (ADR 0008).
				maxHr: 194,
				zoneSystem: 'olt-hr-5-run',
				// Not the run default (`daniels-pace-5`): with no threshold pace, an
				// HR recipe is the one that can resolve anything for her.
				zoneSystemSource: 'athlete',
				note: 'maxHr only (watch estimate); LTHR + threshold pace unset',
			},
		],
		blankWeeksAgo: [8, 9, 21, 34, 47],
		missRate: 0.16,
		easyWeekEvery: 5,
		targetEvent: {
			name: 'Sentrumsløpet 10K',
			weeksAhead: 11,
			kind: 'race',
			priority: 'B',
			disciplines: ['run'],
			target: { kind: 'finish' },
		},
	},
	{
		slug: 'real',
		username: 'rune',
		name: 'Rune Aas',
		blurb: 'The real athlete — verbatim replay of 12 months of intervals.icu',
		sex: 'male',
		weightKg: 77,
		heightCm: 181,
		trainableWeekdays: [1, 2, 3, 4, 6, 0],
		defaultTrainingTime: '17:00',
		weeklyCapacityHours: 4,
		paceFactor: 1,
		hrCentre: 154,
		slots: [],
		thresholds: [
			{
				discipline: 'run',
				// Exactly the real sport settings: HR is known, run threshold pace is
				// genuinely unmeasured.
				maxHr: 200,
				lthr: 182,
				zoneSystem: 'olt-hr-5-run',
				zoneSystemSource: 'athlete',
				note: 'maxHr + LTHR from sport settings; threshold pace unset (real)',
			},
			{
				discipline: 'bike',
				maxHr: 200,
				lthr: 182,
				ftp: 250,
				zoneSystem: 'coggan-power-7',
				zoneSystemSource: 'default',
				note: 'FTP 250 + LTHR 182 + maxHr 200 (real)',
			},
			{
				discipline: 'swim',
				maxHr: 200,
				lthr: 182,
				cssSecPer100m: 120, // 0.8333 m/s from the real settings
				zoneSystem: 'css-5',
				zoneSystemSource: 'default',
				note: 'CSS 2:00/100m (real)',
			},
			{
				discipline: 'strength',
				note: 'nothing set — strength has no threshold to resolve',
			},
		],
		blankWeeksAgo: [],
		missRate: 0,
		easyWeekEvery: 0,
		targetEvent: {
			name: 'Oslo Half Marathon',
			weeksAhead: 14,
			kind: 'race',
			priority: 'B',
			disciplines: ['run'],
			target: { kind: 'time', seconds: 6300 },
		},
		replayReal: true,
	},
	{
		slug: 'intermediate',
		username: 'ida',
		name: 'Ida Fjell',
		blurb: 'Intermediate runner — ~50 km/wk, 5 sessions, 2 quality',
		sex: 'female',
		weightKg: 58,
		heightCm: 171,
		trainableWeekdays: [0, 1, 2, 3, 4, 5],
		defaultTrainingTime: '06:30',
		weeklyCapacityHours: 6,
		paceFactor: 0.83, // ~4:45/km easy
		hrCentre: 150,
		slots: [
			{
				label: 'Easy run',
				discipline: 'run',
				perWeek: 2,
				days: [1, 5],
				km: 10,
				effort: 'easy',
			},
			{
				label: 'Threshold run',
				discipline: 'run',
				perWeek: 1,
				days: [2],
				km: 14,
				effort: 'threshold',
			},
			{
				label: 'Interval session',
				discipline: 'run',
				perWeek: 1,
				days: [4],
				km: 12,
				effort: 'vo2max',
			},
			{
				label: 'Long run',
				discipline: 'run',
				perWeek: 1,
				days: [0],
				km: 15,
				effort: 'endurance',
			},
			{
				label: 'Strength',
				discipline: 'strength',
				perWeek: 0.5,
				days: [3],
				minutes: 45,
				effort: 'easy',
			},
		],
		thresholds: [
			{
				discipline: 'run',
				maxHr: 190,
				lthr: 174,
				thresholdPaceSecPerKm: 245,
				zoneSystem: 'daniels-pace-5',
				zoneSystemSource: 'default',
				note: 'full run set (threshold pace from a 10K race equivalence)',
			},
			{
				discipline: 'strength',
				note: 'nothing set',
			},
		],
		blankWeeksAgo: [30],
		missRate: 0.06,
		easyWeekEvery: 4,
		pastRace: {
			weeksAgo: 19,
			name: 'Hytteplanmila 10K',
			discipline: 'run',
			distanceM: 10000,
			timeSec: 2412,
			priority: 'A',
		},
		targetEvent: {
			name: 'Oslo Marathon',
			weeksAhead: 16,
			kind: 'race',
			priority: 'A',
			disciplines: ['run'],
			target: { kind: 'time', seconds: 12600 },
		},
	},
	{
		slug: 'advanced',
		username: 'arne',
		name: 'Arne Holt',
		blurb:
			'Advanced runner — ~90 km/wk, 6–7 sessions incl. a double, 3 quality',
		sex: 'male',
		weightKg: 64,
		heightCm: 178,
		trainableWeekdays: [1, 2, 3, 4, 5, 6, 0],
		defaultTrainingTime: '06:00',
		weeklyCapacityHours: 9,
		paceFactor: 0.71, // ~4:05/km easy
		hrCentre: 146,
		slots: [
			{
				label: 'Easy run',
				discipline: 'run',
				perWeek: 2,
				days: [1, 5],
				km: 11.5,
				effort: 'easy',
			},
			{
				label: 'Second run (double)',
				discipline: 'run',
				perWeek: 1,
				days: [2],
				km: 7,
				effort: 'recovery',
				double: true,
			},
			{
				label: 'Threshold run',
				discipline: 'run',
				perWeek: 1,
				days: [2],
				km: 14.5,
				effort: 'threshold',
			},
			{
				label: 'Hills / VO₂max',
				discipline: 'run',
				perWeek: 1,
				days: [4],
				km: 12.5,
				effort: 'vo2max',
			},
			{
				label: 'Tempo run',
				discipline: 'run',
				perWeek: 1,
				days: [6],
				km: 13,
				effort: 'tempo',
			},
			{
				label: 'Long run',
				discipline: 'run',
				perWeek: 1,
				days: [0],
				km: 23,
				effort: 'endurance',
			},
		],
		thresholds: [
			{
				discipline: 'run',
				// Deliberately the inverse of the beginner: he races often, so the pace
				// anchor is solid, but he has not worn a chest strap in years — LTHR and
				// max HR are genuinely unmeasured and must stay unset.
				thresholdPaceSecPerKm: 196,
				zoneSystem: 'daniels-pace-5',
				zoneSystemSource: 'default',
				note: 'threshold pace only (race-derived); LTHR + maxHr unset',
			},
		],
		blankWeeksAgo: [27],
		missRate: 0.04,
		easyWeekEvery: 4,
		pastRace: {
			weeksAgo: 24,
			name: 'Bergen Half Marathon',
			discipline: 'run',
			distanceM: 21097,
			timeSec: 4392,
			priority: 'A',
		},
		targetEvent: {
			name: 'Berlin Marathon',
			weeksAhead: 18,
			kind: 'race',
			priority: 'A',
			disciplines: ['run'],
			target: { kind: 'time', seconds: 9300 },
		},
	},
	{
		slug: 'triathlete',
		username: 'tora',
		name: 'Tora Vik',
		blurb:
			'Triathlete — 3 tracks: ~4 km swim + ~6 h bike + ~40 km run per week',
		sex: 'female',
		weightKg: 61,
		heightCm: 170,
		trainableWeekdays: [1, 2, 3, 4, 5, 6, 0],
		defaultTrainingTime: '05:45',
		weeklyCapacityHours: 12,
		paceFactor: 0.92, // ~5:15/km easy
		hrCentre: 148,
		slots: [
			{
				label: 'Swim technique',
				discipline: 'swim',
				perWeek: 1,
				days: [1],
				km: 1.2,
				effort: 'easy',
			},
			{
				label: 'Swim threshold',
				discipline: 'swim',
				perWeek: 1,
				days: [3],
				km: 1.5,
				effort: 'threshold',
			},
			{
				label: 'Swim endurance',
				discipline: 'swim',
				perWeek: 1,
				days: [5],
				km: 1.4,
				effort: 'endurance',
			},
			{
				label: 'Bike intervals',
				discipline: 'bike',
				perWeek: 1,
				days: [2],
				minutes: 85,
				effort: 'threshold',
			},
			{
				label: 'Bike endurance',
				discipline: 'bike',
				perWeek: 1,
				days: [4],
				minutes: 105,
				effort: 'endurance',
			},
			{
				label: 'Long ride',
				discipline: 'bike',
				perWeek: 1,
				days: [6],
				minutes: 200,
				effort: 'endurance',
			},
			{
				label: 'Run off the bike',
				discipline: 'run',
				perWeek: 1,
				days: [2],
				km: 9,
				effort: 'easy',
				double: true,
			},
			{
				label: 'Run intervals',
				discipline: 'run',
				perWeek: 1,
				days: [4],
				km: 13,
				effort: 'vo2max',
				double: true,
			},
			{
				label: 'Long run',
				discipline: 'run',
				perWeek: 1,
				days: [0],
				km: 22,
				effort: 'endurance',
			},
		],
		thresholds: [
			{
				discipline: 'bike',
				maxHr: 194,
				lthr: 178,
				ftp: 235,
				zoneSystem: 'coggan-power-7',
				zoneSystemSource: 'default',
				note: 'FTP 235 + LTHR 178 + maxHr 194',
			},
			{
				discipline: 'swim',
				cssSecPer100m: 105,
				zoneSystem: 'css-5',
				zoneSystemSource: 'default',
				note: 'CSS 1:45/100m; no pool HR',
			},
			{
				discipline: 'run',
				maxHr: 194,
				lthr: 176,
				zoneSystem: 'olt-hr-5-run',
				zoneSystemSource: 'athlete',
				note: 'HR set; run threshold pace unset (never tested off the bike)',
			},
		],
		blankWeeksAgo: [12, 40],
		missRate: 0.07,
		easyWeekEvery: 4,
		pastRace: {
			weeksAgo: 15,
			name: 'Trondheim Olympic Triathlon',
			discipline: 'run',
			distanceM: 10000,
			timeSec: 2760,
			priority: 'B',
		},
		targetEvent: {
			name: 'Ironman 70.3 Haugesund',
			weeksAhead: 20,
			kind: 'race',
			priority: 'A',
			disciplines: ['swim', 'bike', 'run'],
			target: { kind: 'time', seconds: 19800 },
		},
	},
]

// ---------------------------------------------------------------------------
// Effort → numbers, all widths taken from the real snapshot
// ---------------------------------------------------------------------------

const EFFORT_PACE_FACTOR: Record<Slot['effort'], number> = {
	recovery: 1.12,
	easy: 1,
	endurance: 0.98,
	tempo: 0.9,
	threshold: 0.93, // includes warm-up/cool-down inside the session average
	vo2max: 0.95,
}

const EFFORT_HR_DELTA: Record<Slot['effort'], number> = {
	recovery: -12,
	easy: 0,
	endurance: 4,
	tempo: 14,
	threshold: 12,
	vo2max: 16,
}

const EFFORT_RPE: Record<Slot['effort'], number> = {
	recovery: 2,
	easy: 3,
	endurance: 4,
	tempo: 6,
	threshold: 7,
	vo2max: 8,
}

const LOG_LINES: Record<Slot['effort'], string[]> = {
	recovery: ['Shake-out, legs heavy.', 'Very easy, just turnover.'],
	easy: [
		'Easy and controlled.',
		'Felt fine, nothing forced.',
		'Rainy, kept it easy.',
	],
	endurance: [
		'Steady all the way through.',
		'Long and honest, faded a little late.',
		'Good rhythm, ate on the way.',
	],
	tempo: [
		'Comfortably hard, held it together.',
		'Tempo felt smoother than last time.',
	],
	threshold: [
		'Reps on target, last one hurt.',
		'Held threshold, breathing controlled.',
		'Cut the last rep short.',
	],
	vo2max: ['Hard session, hit the splits.', 'Legs gave out on the last rep.'],
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

type PlannedActivity = {
	key: string
	label: string
	/** `other` is import-only and reachable only through the real replay (ADR 0015). */
	discipline: Discipline | 'other'
	startedAt: Date
	movingSec: number
	elapsedSec: number
	distanceM: number | null
	paceAvgSecPerKm: number | null
	hrAvg: number | null
	hrMax: number | null
	powerAvg: number | null
	cadenceAvg: number | null
	elevationGainM: number | null
	rpe: number | null
	note: string
	/** The provider payload, verbatim where one exists; `{}` for synthesized efforts. */
	rawJson?: string
	isRace?: boolean
}

/** The Monday (UTC) of the Training Week containing `d`. */
function mondayOf(d: Date): Date {
	const x = new Date(d)
	x.setUTCHours(0, 0, 0, 0)
	const dow = (x.getUTCDay() + 6) % 7
	return new Date(x.getTime() - dow * DAY_MS)
}

function weekdayOffsetFromMonday(weekday: number): number {
	return (weekday + 6) % 7
}

function synthesizeHistory(
	spec: LevelSpec,
	shape: RealShape,
	now: Date,
): PlannedActivity[] {
	const random = makeRandom(`${spec.slug}:v1`)
	const thisMonday = mondayOf(now)
	const out: PlannedActivity[] = []

	for (let weeksAgo = WEEKS; weeksAgo >= 0; weeksAgo--) {
		if (spec.blankWeeksAgo.includes(weeksAgo)) continue
		const monday = new Date(thisMonday.getTime() - weeksAgo * 7 * DAY_MS)
		const easyWeek =
			spec.easyWeekEvery > 0 && weeksAgo % spec.easyWeekEvery === 0
		// A recovery week is genuinely lighter; every other week wobbles a little,
		// with the wobble width taken from the real pace/volume spread.
		const weekFactor = (easyWeek ? 0.72 : 1) * (0.92 + random() * 0.16)
		const usedDays = new Set<number>()

		for (const slot of spec.slots) {
			let count = Math.floor(slot.perWeek)
			if (random() < slot.perWeek - count) count += 1

			for (let i = 0; i < count; i++) {
				if (random() < spec.missRate) continue
				const weekday = chooseWeekday(random, spec, slot, usedDays, shape)
				if (weekday == null) continue
				if (!slot.double) usedDays.add(weekday)

				const day = new Date(
					monday.getTime() + weekdayOffsetFromMonday(weekday) * DAY_MS,
				)
				if (day.getTime() > now.getTime()) continue // history only
				const [hh, mm] = spec.defaultTrainingTime.split(':').map(Number)
				// ±40 min around the habitual time, plus the double moving to the evening.
				const minuteJitter = Math.round((random() - 0.5) * 80)
				const startedAt = new Date(day)
				startedAt.setUTCHours(
					(hh ?? 17) + (slot.double && i === 0 ? 11 : 0),
					(mm ?? 0) + minuteJitter,
					0,
					0,
				)

				out.push(
					makeActivity({
						random,
						shape,
						spec,
						slot,
						startedAt,
						weekFactor,
					}),
				)
			}
		}
	}

	if (spec.pastRace) out.push(makeRace(spec, thisMonday))
	return out.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
}

/** The first free preferred day, else the athlete's habit weights break the tie. */
function chooseWeekday(
	random: Random,
	spec: LevelSpec,
	slot: Slot,
	usedDays: Set<number>,
	shape: RealShape,
): number | null {
	const allowed = slot.days.filter((d) => spec.trainableWeekdays.includes(d))
	const free = allowed.filter((d) => slot.double || !usedDays.has(d))
	const candidates = free.length > 0 ? free : allowed
	if (candidates.length === 0) return null
	if (candidates.length === 1) return candidates[0]!
	// Weight by the real weekday habit so busy real days stay busy here too.
	const weights = candidates.map((d) => (shape.weekdayWeights[d] ?? 1) + 1)
	const total = weights.reduce((a, b) => a + b, 0)
	let r = random() * total
	for (let i = 0; i < candidates.length; i++) {
		r -= weights[i]!
		if (r <= 0) return candidates[i]!
	}
	return candidates[candidates.length - 1]!
}

function makeActivity({
	random,
	shape,
	spec,
	slot,
	startedAt,
	weekFactor,
}: {
	random: Random
	shape: RealShape
	spec: LevelSpec
	slot: Slot
	startedAt: Date
	weekFactor: number
}): PlannedActivity {
	const residual = sample(random, shape.paceResiduals)
	const rpeBase = EFFORT_RPE[slot.effort]
	// The real athlete logs RPE on 92 % of sessions; keep exactly that hole.
	const missingRpeRate =
		shape.rpeValues.filter((v) => v == null).length / shape.rpeValues.length
	const rpe =
		random() < missingRpeRate
			? null
			: Math.max(1, Math.min(10, rpeBase + (random() < 0.3 ? 1 : 0)))

	const hrAvg =
		spec.hrCentre == null ||
		slot.discipline === 'swim' ||
		slot.discipline === 'strength'
			? null
			: Math.round(
					spec.hrCentre +
						EFFORT_HR_DELTA[slot.effort] +
						(sample(random, shape.hrAvgs) - median(shape.hrAvgs)) * 0.5,
				)

	if (slot.km != null && slot.discipline === 'run') {
		const km = snapKm(slot.km * weekFactor * (0.9 + random() * 0.2))
		const pace = Math.round(
			shape.medianRunPaceSecPerKm *
				spec.paceFactor *
				EFFORT_PACE_FACTOR[slot.effort] *
				(0.97 + (residual - 1) * 0.25),
		)
		const movingSec = Math.round(km * pace)
		return {
			key: '',
			label: slot.label,
			discipline: 'run',
			startedAt,
			movingSec,
			elapsedSec: movingSec + Math.round(random() * 180),
			distanceM: km * 1000,
			paceAvgSecPerKm: pace,
			hrAvg,
			hrMax: hrAvg == null ? null : hrAvg + 8 + Math.round(random() * 12),
			powerAvg: null,
			cadenceAvg: 80 + Math.round(random() * 8),
			elevationGainM: Math.round(km * (8 + random() * 22)),
			rpe,
			note: pick(random, LOG_LINES[slot.effort]),
		}
	}

	if (slot.km != null && slot.discipline === 'swim') {
		const km = Math.max(
			0.6,
			Math.round(slot.km * weekFactor * (0.9 + random() * 0.2) * 10) / 10,
		)
		// 1:45/100m CSS-ish, eased by effort, with the real spread's width scaled down.
		const per100 = Math.round(
			105 * (1 / EFFORT_PACE_FACTOR[slot.effort]) * (0.98 + random() * 0.06),
		)
		const movingSec = Math.round(km * 10 * per100)
		return {
			key: '',
			label: slot.label,
			discipline: 'swim',
			startedAt,
			movingSec,
			elapsedSec: movingSec + 120 + Math.round(random() * 300),
			distanceM: Math.round(km * 1000),
			paceAvgSecPerKm: Math.round(movingSec / km),
			hrAvg: null, // no strap in the pool — an honest Unavailable Metric
			hrMax: null,
			powerAvg: null,
			cadenceAvg: null,
			elevationGainM: null,
			rpe,
			note: pick(random, LOG_LINES[slot.effort]),
		}
	}

	const minutes = snapMinutes(
		(slot.minutes ?? 45) * weekFactor * (0.9 + random() * 0.2),
	)
	const movingSec = minutes * 60
	if (slot.discipline === 'bike') {
		const ftp =
			spec.thresholds.find((t) => t.discipline === 'bike')?.ftp ?? null
		const intensity =
			slot.effort === 'threshold' ? 0.82 : slot.effort === 'tempo' ? 0.76 : 0.66
		const speedKph = 27 + (slot.effort === 'threshold' ? 5 : 0) + random() * 4
		return {
			key: '',
			label: slot.label,
			discipline: 'bike',
			startedAt,
			movingSec,
			elapsedSec: movingSec + Math.round(random() * 420),
			distanceM: Math.round((speedKph * minutes) / 60) * 1000,
			paceAvgSecPerKm: null,
			hrAvg,
			hrMax: hrAvg == null ? null : hrAvg + 10 + Math.round(random() * 14),
			powerAvg:
				ftp == null
					? null
					: Math.round(ftp * intensity * (0.95 + random() * 0.1)),
			cadenceAvg: 84 + Math.round(random() * 8),
			elevationGainM: Math.round(minutes * (5 + random() * 10)),
			rpe,
			note: pick(random, LOG_LINES[slot.effort]),
		}
	}

	return {
		key: '',
		label: slot.label,
		discipline: 'strength',
		startedAt,
		movingSec,
		elapsedSec: movingSec + Math.round(random() * 300),
		distanceM: null,
		paceAvgSecPerKm: null,
		hrAvg: null,
		hrMax: null,
		powerAvg: null,
		cadenceAvg: null,
		elevationGainM: null,
		rpe: rpe ?? 5,
		note: 'Full-body session in the gym.',
	}
}

/** The past race, as history: a hard session on a Sunday, later linked to its Event. */
function makeRace(spec: LevelSpec, thisMonday: Date): PlannedActivity {
	const race = spec.pastRace!
	const random = makeRandom(`${spec.slug}:race`)
	const day = new Date(
		thisMonday.getTime() - race.weeksAgo * 7 * DAY_MS + 6 * DAY_MS,
	)
	day.setUTCHours(10, 0, 0, 0)
	const hrAvg =
		spec.hrCentre == null ? null : Math.round(spec.hrCentre + 22 + random() * 6)
	return {
		key: '',
		label: race.name,
		discipline: race.discipline,
		startedAt: day,
		movingSec: race.timeSec,
		elapsedSec: race.timeSec,
		distanceM: race.distanceM,
		paceAvgSecPerKm: Math.round(race.timeSec / (race.distanceM / 1000)),
		hrAvg,
		hrMax: hrAvg == null ? null : hrAvg + 6,
		powerAvg: null,
		cadenceAvg: 86,
		elevationGainM: Math.round((race.distanceM / 1000) * 6),
		rpe: 9,
		note: `${race.name} — raced it, emptied the tank.`,
		isRace: true,
	}
}

/** The real athlete's snapshot, shifted whole days so it stays anchored to today. */
function replayRealActivities(
	snapshot: RealSnapshot,
	now: Date,
): PlannedActivity[] {
	const startOfDay = (d: Date) => {
		const x = new Date(d)
		x.setUTCHours(0, 0, 0, 0)
		return x.getTime()
	}
	const shiftMs = startOfDay(now) - startOfDay(new Date(snapshot.capturedAt))
	// Whole-day shift, so today's real evening session can land later today than
	// the seed runs. History only: anything the shift pushes past `now` is left
	// out rather than seeded as a future-dated session.
	return snapshot.activities
		.filter((a) => Date.parse(a.startedAt) + shiftMs <= now.getTime())
		.map((a) => {
			const startedAt = new Date(Date.parse(a.startedAt) + shiftMs)
			const discipline = intervalsIcuTypeToDiscipline(a.type)
			const distanceM = a.distanceM ?? null
			return {
				key: a.externalId,
				label: a.name ?? a.type,
				// `other` (hike, NordicSki) is a legal Activity Import discipline and is
				// deliberately preserved: it never feeds TSS or Training Load (ADR 0015),
				// which is part of what makes this the hardest athlete to plan for.
				discipline,
				startedAt,
				movingSec: a.movingSec,
				elapsedSec: a.elapsedSec,
				distanceM,
				paceAvgSecPerKm:
					distanceM != null && distanceM > 0 && a.movingSec > 0
						? Math.round(a.movingSec / (distanceM / 1000))
						: null,
				hrAvg: a.hrAvg,
				hrMax: a.hrMax,
				powerAvg: null,
				cadenceAvg: a.cadenceAvg,
				elevationGainM: a.elevationGainM,
				rpe: a.rpe,
				rawJson: JSON.stringify(a.raw),
				note: a.name
					? `${a.name} — replayed from intervals.icu.`
					: 'Replayed from intervals.icu.',
			}
		})
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function upsertAthlete(spec: LevelSpec) {
	const user = await prisma.user.upsert({
		where: { username: spec.username },
		select: { id: true },
		create: {
			email: `${spec.username}@levels.trainm8.dev`,
			username: spec.username,
			name: spec.name,
			password: { create: createPassword(spec.username) },
			roles: { connect: { name: 'user' } },
		},
		update: { name: spec.name },
	})

	const profile = await prisma.athleteProfile.upsert({
		where: { userId: user.id },
		select: { id: true },
		create: {
			userId: user.id,
			timezone: TIMEZONE,
			preferredUnits: 'metric',
			weekStartsOn: 1,
			sex: spec.sex,
			weightKg: spec.weightKg,
			heightCm: spec.heightCm,
			trainableWeekdays: JSON.stringify(spec.trainableWeekdays),
			defaultTrainingTime: spec.defaultTrainingTime,
			weeklyCapacityHours: spec.weeklyCapacityHours,
		},
		update: {
			timezone: TIMEZONE,
			sex: spec.sex,
			weightKg: spec.weightKg,
			heightCm: spec.heightCm,
			trainableWeekdays: JSON.stringify(spec.trainableWeekdays),
			defaultTrainingTime: spec.defaultTrainingTime,
			weeklyCapacityHours: spec.weeklyCapacityHours,
		},
	})

	for (const t of spec.thresholds) {
		const row = {
			maxHr: t.maxHr ?? null,
			lthr: t.lthr ?? null,
			ftp: t.ftp ?? null,
			runPowerThresholdW: null,
			thresholdPaceSecPerKm: t.thresholdPaceSecPerKm ?? null,
			cssSecPer100m: t.cssSecPer100m ?? null,
			zoneSystem: t.zoneSystem ?? null,
			zoneSystemSource: t.zoneSystem ? (t.zoneSystemSource ?? 'default') : null,
		}
		await prisma.disciplineProfile.upsert({
			where: {
				athleteProfileId_discipline: {
					athleteProfileId: profile.id,
					discipline: t.discipline,
				},
			},
			create: {
				athleteProfileId: profile.id,
				discipline: t.discipline,
				...row,
			},
			update: row,
		})
	}

	return { userId: user.id, athleteProfileId: profile.id }
}

/**
 * Land one effort the way auto-save does (ADR 0049): an Activity Import,
 * promoted to a recording-only completed Workout Session that carries it as its
 * Recording, plus a Session Log with the RPE. Keyed on the import's
 * `(provider, externalId)` unique, so a rerun updates the same three rows.
 */
async function persistActivity(
	userId: string,
	slug: string,
	activity: PlannedActivity,
	index: number,
): Promise<{ sessionId: string; externalId: string }> {
	const externalId =
		activity.key !== ''
			? `${KEY_PREFIX}:${slug}:${activity.key}`
			: `${KEY_PREFIX}:${slug}:${String(index).padStart(4, '0')}`
	const provider = activity.key !== '' ? 'intervalsicu' : 'manual'
	const metrics = {
		startedAt: activity.startedAt,
		endedAt: new Date(
			activity.startedAt.getTime() + activity.elapsedSec * 1000,
		),
		durationSec: activity.movingSec,
		distanceM: activity.distanceM,
		discipline: activity.discipline,
		hrAvg: activity.hrAvg,
		hrMax: activity.hrMax,
		powerAvg: activity.powerAvg,
		powerMax: null,
		powerWeightedAvg: null,
		cadenceAvg: activity.cadenceAvg,
		paceAvgSecPerKm: activity.paceAvgSecPerKm,
		speedMaxMps: null,
		elevationGainM: activity.elevationGainM,
		kilojoules: null,
		// Synthesized efforts carry no provider payload to be lossless about; the
		// replayed ones carry the real one, trimmed of its chart blobs.
		rawJson: activity.rawJson ?? '{}',
	}

	const existing = await prisma.activityImport.findUnique({
		where: {
			externalProvider_externalId: {
				externalProvider: provider,
				externalId,
			},
		},
		select: { id: true, promotedSessionId: true },
	})

	const importId = existing
		? (
				await prisma.activityImport.update({
					where: { id: existing.id },
					data: metrics,
					select: { id: true },
				})
			).id
		: (
				await prisma.activityImport.create({
					data: {
						athleteId: userId,
						externalProvider: provider,
						externalId,
						...metrics,
					},
					select: { id: true },
				})
			).id

	const sessionData = {
		scheduledAt: activity.startedAt,
		status: 'completed',
		recordingId: importId,
		// A recording-only promotion is structureless — exactly what
		// `promoteToNewSession` writes.
		source: 'recorded',
	}
	const sessionId = existing?.promotedSessionId
		? (
				await prisma.workoutSession.update({
					where: { id: existing.promotedSessionId },
					data: sessionData,
					select: { id: true },
				})
			).id
		: (
				await prisma.workoutSession.create({
					data: { userId, workoutId: null, ...sessionData },
					select: { id: true },
				})
			).id

	if (existing?.promotedSessionId !== sessionId) {
		await prisma.activityImport.update({
			where: { id: importId },
			data: { promotedSessionId: sessionId },
		})
	}

	if (activity.rpe != null) {
		await prisma.sessionLog.upsert({
			where: { sessionId },
			create: { sessionId, rpe: activity.rpe, content: activity.note },
			update: { rpe: activity.rpe, content: activity.note },
		})
	} else {
		await prisma.sessionLog.deleteMany({ where: { sessionId } })
	}

	return { sessionId, externalId }
}

/** Drop rows this script wrote on an earlier run that the current run no longer produces. */
async function pruneStale(userId: string, slug: string, keep: Set<string>) {
	const stale = await prisma.activityImport.findMany({
		where: {
			athleteId: userId,
			externalId: { startsWith: `${KEY_PREFIX}:${slug}:` },
			NOT: { externalId: { in: [...keep] } },
		},
		select: { id: true, promotedSessionId: true },
	})
	for (const row of stale) {
		await prisma.activityImport.update({
			where: { id: row.id },
			data: { promotedSessionId: null },
		})
		if (row.promotedSessionId) {
			await prisma.workoutSession.deleteMany({
				where: { id: row.promotedSessionId },
			})
		}
		await prisma.activityImport.delete({ where: { id: row.id } })
	}
	return stale.length
}

/**
 * The **Target Event** — a future race with **no Plan Outline**, which is what
 * makes it a calendar marker rather than an active plan (ADR 0018). Nothing here
 * seeds a plan; generation is what is being tested.
 */
async function upsertTargetEvent(userId: string, spec: LevelSpec, now: Date) {
	const startDate = new Date(
		now.getTime() + spec.targetEvent.weeksAhead * 7 * DAY_MS,
	)
	startDate.setUTCHours(9, 0, 0, 0)
	const data = {
		kind: spec.targetEvent.kind,
		priority: spec.targetEvent.priority,
		startDate,
		disciplines: JSON.stringify(spec.targetEvent.disciplines),
		target: spec.targetEvent.target
			? JSON.stringify(spec.targetEvent.target)
			: null,
		status: 'planned',
	}
	const existing = await prisma.event.findFirst({
		where: { athleteId: userId, name: spec.targetEvent.name },
		select: { id: true },
	})
	if (existing) {
		await prisma.event.update({ where: { id: existing.id }, data })
	} else {
		await prisma.event.create({
			data: { athleteId: userId, name: spec.targetEvent.name, ...data },
		})
	}
}

/** The past race as an Event Result + a Performance Result (the race-equivalence datum). */
async function upsertPastRace(
	userId: string,
	athleteProfileId: string,
	spec: LevelSpec,
	raceSessionId: string,
	occurredAt: Date,
) {
	const race = spec.pastRace!
	const data = {
		kind: 'race',
		priority: race.priority,
		startDate: occurredAt,
		disciplines: JSON.stringify([race.discipline]),
		target: null,
		status: 'completed',
		resultSessionId: raceSessionId,
	}
	const existingEvent = await prisma.event.findFirst({
		where: { athleteId: userId, name: race.name },
		select: { id: true },
	})
	if (existingEvent) {
		await prisma.event.update({ where: { id: existingEvent.id }, data })
	} else {
		await prisma.event.create({
			data: { athleteId: userId, name: race.name, ...data },
		})
	}

	const existingResult = await prisma.performanceResult.findFirst({
		where: {
			athleteProfileId,
			discipline: race.discipline,
			distanceM: race.distanceM,
		},
		select: { id: true },
	})
	const resultData = {
		discipline: race.discipline,
		distanceM: race.distanceM,
		timeSec: race.timeSec,
		occurredAt,
		source: 'race',
		verified: true,
	}
	if (existingResult) {
		await prisma.performanceResult.update({
			where: { id: existingResult.id },
			data: resultData,
		})
	} else {
		await prisma.performanceResult.create({
			data: { athleteProfileId, ...resultData },
		})
	}
}

// ---------------------------------------------------------------------------
// Reporting — measured back out of the database, never the intent
// ---------------------------------------------------------------------------

type Row = Record<string, string>

async function measure(
	userId: string,
	spec: LevelSpec,
	now: Date,
): Promise<Row> {
	const since = new Date(mondayOf(now).getTime() - WEEKS * 7 * DAY_MS)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: since }, status: 'completed' },
		select: {
			scheduledAt: true,
			recording: {
				select: { discipline: true, distanceM: true, durationSec: true },
			},
			sessionLog: { select: { rpe: true } },
		},
	})
	const byWeek = new Map<string, { n: number; km: number; hours: number }>()
	const disciplines = new Map<
		string,
		{ km: number; hours: number; n: number }
	>()
	let withRpe = 0
	for (const s of sessions) {
		if (s.sessionLog?.rpe != null) withRpe += 1
		const key = mondayOf(s.scheduledAt).toISOString().slice(0, 10)
		const week = byWeek.get(key) ?? { n: 0, km: 0, hours: 0 }
		const km = (s.recording?.distanceM ?? 0) / 1000
		const hours = (s.recording?.durationSec ?? 0) / 3600
		week.n += 1
		week.km += km
		week.hours += hours
		byWeek.set(key, week)
		const d = s.recording?.discipline ?? 'unknown'
		const disc = disciplines.get(d) ?? { km: 0, hours: 0, n: 0 }
		disc.km += km
		disc.hours += hours
		disc.n += 1
		disciplines.set(d, disc)
	}
	// The week in progress is a partial week and would drag every median down, so
	// the per-week figures are the *closed* Training Weeks only.
	const currentWeekKey = mondayOf(now).toISOString().slice(0, 10)
	const weeks = [...byWeek.entries()]
		.filter(([key]) => key !== currentWeekKey)
		.map(([, v]) => v)
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: {
			disciplineProfiles: {
				select: {
					discipline: true,
					maxHr: true,
					lthr: true,
					ftp: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
				},
			},
		},
	})
	let set = 0
	let unset = 0
	for (const dp of profile?.disciplineProfiles ?? []) {
		// Only the fields that *could* apply to the discipline are counted.
		const applicable =
			dp.discipline === 'run'
				? [dp.maxHr, dp.lthr, dp.thresholdPaceSecPerKm]
				: dp.discipline === 'bike'
					? [dp.maxHr, dp.lthr, dp.ftp]
					: dp.discipline === 'swim'
						? [dp.maxHr, dp.lthr, dp.cssSecPer100m]
						: []
		set += applicable.filter((v) => v != null).length
		unset += applicable.filter((v) => v == null).length
	}
	const load = await prisma.loadSnapshot.findFirst({
		where: { athleteId: userId },
		orderBy: { date: 'desc' },
		select: { ctl: true, atl: true, tsb: true },
	})

	const trackSummary = [...disciplines.entries()]
		.sort((a, b) => b[1].n - a[1].n)
		.map(([d, v]) => {
			const per = v.km > 1 ? `${(v.km / weeks.length).toFixed(0)}km` : ''
			const hours = (v.hours / weeks.length).toFixed(1)
			return `${d} ${per ? `${per}/${hours}h` : `${hours}h`}/wk ×${v.n}`
		})
		.join(', ')

	return {
		athlete: `${spec.name} (${spec.slug})`,
		login: `${spec.username} / ${spec.username}`,
		sessions: String(sessions.length),
		activeWeeks: `${weeks.length}/${WEEKS}`,
		'km/wk med': median(weeks.map((w) => w.km)).toFixed(1),
		'h/wk med': median(weeks.map((w) => w.hours)).toFixed(1),
		'sess/wk med': median(weeks.map((w) => w.n)).toFixed(1),
		tracks: trackSummary,
		thresholds: `${set} set / ${unset} unset`,
		rpe: `${Math.round((withRpe / Math.max(1, sessions.length)) * 100)}%`,
		CTL: load ? load.ctl.toFixed(1) : '—',
		TSB: load ? load.tsb.toFixed(1) : '—',
	}
}

// ---------------------------------------------------------------------------

async function main() {
	const now = new Date()
	const snapshot = loadRealSnapshot()
	const shape = deriveRealShape(snapshot)
	console.log(
		`🌱 Seeding ${LEVELS.length} training-level athletes (shape source: ${snapshot.count} real activities)`,
	)

	const rows: Row[] = []
	for (const spec of LEVELS) {
		console.time(`   ${spec.username}`)
		const { userId, athleteProfileId } = await upsertAthlete(spec)
		const activities = spec.replayReal
			? replayRealActivities(snapshot, now)
			: synthesizeHistory(spec, shape, now)

		const keep = new Set<string>()
		let raceSessionId: string | null = null
		let raceAt: Date | null = null
		let index = 0
		for (const activity of activities) {
			const { sessionId, externalId } = await persistActivity(
				userId,
				spec.slug,
				activity,
				index++,
			)
			keep.add(externalId)
			if (activity.isRace) {
				raceSessionId = sessionId
				raceAt = activity.startedAt
			}
		}
		const pruned = await pruneStale(userId, spec.slug, keep)

		if (spec.pastRace && raceSessionId && raceAt) {
			await upsertPastRace(
				userId,
				athleteProfileId,
				spec,
				raceSessionId,
				raceAt,
			)
		}
		await upsertTargetEvent(userId, spec, now)

		// Earn CTL/ATL/TSB and per-session TSS through the real pipeline.
		const earliest = activities[0]?.startedAt
		if (earliest) {
			await recomputeLoadFrom(userId, earliest.toISOString().slice(0, 10), now)
		}
		console.timeEnd(`   ${spec.username}`)
		console.log(
			`      ${activities.length} sessions written${pruned ? `, ${pruned} stale pruned` : ''}`,
		)
		rows.push(await measure(userId, spec, now))
	}

	console.log(
		'\n📊 Measured per-athlete aggregates (queried back from the DB)\n',
	)
	printTable(rows)
	console.log(
		'\nPer-week figures are medians over CLOSED Training Weeks (the week in progress is excluded).\n' +
			'Thresholds set/unset counts only the fields that apply to each Discipline.\n' +
			'No Plan Outline, no Training Track, no planned or future-dated session was written.\n' +
			'Each athlete has one FUTURE Target Event carrying no Plan Outline.',
	)
}

function printTable(rows: Row[]) {
	if (rows.length === 0) return
	const columns = Object.keys(rows[0]!)
	const width = (c: string) =>
		Math.max(c.length, ...rows.map((r) => (r[c] ?? '').length))
	const line = (cells: string[]) =>
		cells.map((cell, i) => cell.padEnd(width(columns[i]!))).join('  ')
	console.log(line(columns))
	console.log(columns.map((c) => '-'.repeat(width(c))).join('  '))
	for (const row of rows) console.log(line(columns.map((c) => row[c] ?? '')))
}

main()
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})

// The seed scripts are allowed to reach into the test helpers for password
// hashing, exactly as `prisma/seed.ts` does.
/*
eslint
	no-restricted-imports: "off",
*/
