// PROTOTYPE DATA — a rich, fabricated athlete so the home redesign can show the
// jobs a self-coaching athlete actually opens the app for: follow the plan, see
// progression, compare sessions, get an overview. Deliberately NOT constrained
// to what the live loader can truthfully compute (per the prototype brief) —
// pace/HR/power targets, planned-vs-actual, fitness projection and PRs are all
// mocked here. Throwaway; delete with the prototype.

export type Discipline = 'run' | 'bike' | 'swim' | 'strength'

export const DISCIPLINE_COLOR: Record<Discipline, string> = {
	run: '#f97316',
	bike: '#0ea5e9',
	swim: '#06b6d4',
	strength: '#8b5cf6',
}
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Ride',
	swim: 'Swim',
	strength: 'Strength',
}

export type Zone = 1 | 2 | 3 | 4 | 5
export type StructureStep = { zone: Zone; minutes: number; label?: string }

export type FitnessPoint = {
	day: number
	date: Date
	ctl: number // fitness
	atl: number // fatigue
	tsb: number // form
	projected: boolean
}

export type PlanPhase = {
	name: string
	startWeek: number // 1-based inclusive
	endWeek: number // inclusive
	color: string
}

export type WeekLoad = {
	week: number
	label: string
	phase: string
	plannedTss: number
	actualTss: number | null // null = future
	isCurrent: boolean
}

export type DayCell = {
	weekday: string
	date: Date
	isToday: boolean
	discipline: Discipline | null
	title: string | null
	plannedTss: number | null
	status: 'done' | 'today' | 'planned' | 'missed' | 'rest'
	actualTss: number | null
}

export type Session = {
	id: string
	date: Date
	discipline: Discipline
	title: string
	plannedMin: number
	actualMin: number | null
	plannedTss: number
	actualTss: number | null
	targetMetric: string // e.g. "4:05 /km @ threshold"
	actualMetric: string | null
	rpe: number | null
	band: 'under' | 'on-target' | 'over' | null
	structure: StructureStep[]
}

export type PR = { label: string; value: string; delta: string; improved: boolean }

export type MockAthlete = {
	name: string
	event: { name: string; date: Date; daysOut: number; priority: 'A' | 'B' | 'C' }
	phase: { name: string; weekInPlan: number; totalWeeks: number }
	fitness: FitnessPoint[]
	phases: PlanPhase[]
	weeks: WeekLoad[]
	today: Session
	lastSimilar: Session
	week: DayCell[]
	recent: Session[]
	prs: PR[]
	overview: {
		fitness: number
		fatigue: number
		form: number
		formLabel: string
		formTone: 'fresh' | 'neutral' | 'fatigued'
		formAdvice: string
		peakProjected: number
	}
	weekStats: {
		done: number
		planned: number
		loadDone: number
		loadPlanned: number
		adherencePct: number
	}
}

const DAY_MS = 86_400_000

function addDays(base: Date, n: number): Date {
	return new Date(base.getTime() + n * DAY_MS)
}

const PLAN_DAYS = 77 // 11 weeks
const TODAY_DAY = 38 // mid-build, week 6

// Smooth, deterministic fitness ramp: base → build peak → taper. Fatigue rides
// above fitness through the build (form dips), then drops in taper (form rises).
function ctlAt(day: number): number {
	if (day <= 63) return 45 + (day / 63) * 33 // 45 → 78 by end of peak
	return 78 - ((day - 63) / (PLAN_DAYS - 63)) * 5 // taper 78 → 73
}
function atlAt(day: number, ctl: number): number {
	const wave = Math.sin((day / 7) * Math.PI * 2)
	if (day >= 64) return ctl * 0.78 // taper: shed fatigue, form goes positive
	return ctl * (1.06 + 0.16 * wave)
}

function buildFitness(planStart: Date): FitnessPoint[] {
	const pts: FitnessPoint[] = []
	for (let day = 0; day <= PLAN_DAYS; day++) {
		const ctl = ctlAt(day)
		const atl = atlAt(day, ctl)
		pts.push({
			day,
			date: addDays(planStart, day),
			ctl: Math.round(ctl),
			atl: Math.round(atl),
			tsb: Math.round(ctl - atl),
			projected: day > TODAY_DAY,
		})
	}
	return pts
}

export function getMockAthlete(now: Date = new Date()): MockAthlete {
	const planStart = addDays(now, -TODAY_DAY)
	const raceDate = addDays(planStart, PLAN_DAYS)
	const daysOut = Math.round((raceDate.getTime() - now.getTime()) / DAY_MS)

	const fitness = buildFitness(planStart)
	const todayPoint = fitness[TODAY_DAY]!
	const peakProjected = Math.max(...fitness.map((p) => p.ctl))

	const phases: PlanPhase[] = [
		{ name: 'Base', startWeek: 1, endWeek: 4, color: '#38bdf8' },
		{ name: 'Build', startWeek: 5, endWeek: 8, color: '#a78bfa' },
		{ name: 'Peak', startWeek: 9, endWeek: 10, color: '#fb923c' },
		{ name: 'Taper', startWeek: 11, endWeek: 11, color: '#34d399' },
	]

	const plannedByWeek = [
		340, 380, 430, 300, 500, 560, 600, 640, 700, 620, 300,
	]
	const currentWeek = 6
	const weeks: WeekLoad[] = plannedByWeek.map((planned, i) => {
		const week = i + 1
		const phase = phases.find((p) => week >= p.startWeek && week <= p.endWeek)!
		const isPast = week < currentWeek
		const isCurrent = week === currentWeek
		// Actuals wobble around plan; the current week is partly done.
		const actual = isPast
			? Math.round(planned * (0.9 + ((i * 7) % 5) / 20))
			: isCurrent
				? Math.round(planned * 0.62)
				: null
		return {
			week,
			label: `W${week}`,
			phase: phase.name,
			plannedTss: planned,
			actualTss: actual,
			isCurrent,
		}
	})

	const today: Session = {
		id: 'today',
		date: now,
		discipline: 'run',
		title: 'Threshold Run — 3 × 10 min',
		plannedMin: 62,
		actualMin: null,
		plannedTss: 78,
		actualTss: null,
		targetMetric: '4:05 /km · HR Z4 165–172',
		actualMetric: null,
		rpe: null,
		band: null,
		structure: [
			{ zone: 1, minutes: 15, label: 'Warm-up' },
			{ zone: 4, minutes: 10 },
			{ zone: 2, minutes: 3 },
			{ zone: 4, minutes: 10 },
			{ zone: 2, minutes: 3 },
			{ zone: 4, minutes: 10 },
			{ zone: 1, minutes: 11, label: 'Cool-down' },
		],
	}

	const lastSimilar: Session = {
		id: 'last-tempo',
		date: addDays(now, -12),
		discipline: 'run',
		title: 'Threshold Run — 3 × 8 min',
		plannedMin: 54,
		actualMin: 53,
		plannedTss: 68,
		actualTss: 71,
		targetMetric: '4:08 /km · HR Z4',
		actualMetric: '4:06 /km · HR 169 avg',
		rpe: 6,
		band: 'on-target',
		structure: [],
	}

	const week: DayCell[] = [
		{ d: -3, disc: 'swim', title: 'CSS Swim — 6 × 200m', tss: 48, status: 'done', actual: 50 },
		{ d: -2, disc: 'bike', title: 'Sweet-spot — 3 × 12min', tss: 82, status: 'done', actual: 79 },
		{ d: -1, disc: 'run', title: 'Easy aerobic', tss: 38, status: 'done', actual: 36 },
		{ d: 0, disc: 'run', title: 'Threshold Run — 3 × 10min', tss: 78, status: 'today', actual: null },
		{ d: 1, disc: null, title: null, tss: null, status: 'rest', actual: null },
		{ d: 2, disc: 'bike', title: 'Long ride — endurance', tss: 145, status: 'planned', actual: null },
		{ d: 3, disc: 'run', title: 'Long run — 90min', tss: 96, status: 'planned', actual: null },
	].map(({ d, disc, title, tss, status, actual }) => {
		const date = addDays(now, d)
		return {
			weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
			date,
			isToday: d === 0,
			discipline: disc as Discipline | null,
			title,
			plannedTss: tss,
			status: status as DayCell['status'],
			actualTss: actual,
		}
	})

	const recent: Session[] = [
		{
			id: 'r1', date: addDays(now, -1), discipline: 'run', title: 'Easy aerobic run',
			plannedMin: 45, actualMin: 47, plannedTss: 38, actualTss: 36,
			targetMetric: '5:20 /km easy', actualMetric: '5:18 /km · HR 142',
			rpe: 3, band: 'on-target', structure: [],
		},
		{
			id: 'r2', date: addDays(now, -2), discipline: 'bike', title: 'Sweet-spot — 3 × 12min',
			plannedMin: 75, actualMin: 75, plannedTss: 82, actualTss: 79,
			targetMetric: '235 W · 88–94% FTP', actualMetric: '231 W avg',
			rpe: 7, band: 'on-target', structure: [],
		},
		{
			id: 'r3', date: addDays(now, -3), discipline: 'swim', title: 'CSS Swim — 6 × 200m',
			plannedMin: 50, actualMin: 52, plannedTss: 48, actualTss: 50,
			targetMetric: '1:40 /100m', actualMetric: '1:39 /100m',
			rpe: 6, band: 'on-target', structure: [],
		},
		{
			id: 'r4', date: addDays(now, -5), discipline: 'run', title: 'VO2 — 5 × 3min',
			plannedMin: 55, actualMin: 58, plannedTss: 84, actualTss: 97,
			targetMetric: '3:45 /km', actualMetric: '3:41 /km · cooked',
			rpe: 9, band: 'over', structure: [],
		},
		{
			id: 'r5', date: addDays(now, -6), discipline: 'bike', title: 'Recovery spin',
			plannedMin: 45, actualMin: 30, plannedTss: 30, actualTss: 19,
			targetMetric: '< 120 W', actualMetric: 'cut short',
			rpe: 2, band: 'under', structure: [],
		},
	]

	const prs: PR[] = [
		{ label: '10K time', value: '42:18', delta: '−0:46', improved: true },
		{ label: 'Bike FTP', value: '262 W', delta: '+7 W', improved: true },
		{ label: 'Swim CSS', value: '1:39 /100m', delta: '−3 s', improved: true },
	]

	const doneDays = week.filter((d) => d.status === 'done')
	const trainingDays = week.filter((d) => d.status !== 'rest')
	const loadDone = week.reduce((s, d) => s + (d.actualTss ?? 0), 0)
	const loadPlanned = week.reduce((s, d) => s + (d.plannedTss ?? 0), 0)

	return {
		name: 'Kody',
		event: { name: 'Trondheim 70.3', date: raceDate, daysOut, priority: 'A' },
		phase: { name: 'Build', weekInPlan: currentWeek, totalWeeks: 11 },
		fitness,
		phases,
		weeks,
		today,
		lastSimilar,
		week,
		recent,
		prs,
		overview: {
			fitness: todayPoint.ctl,
			fatigue: todayPoint.atl,
			form: todayPoint.tsb,
			formLabel: 'Building',
			formTone: 'neutral',
			formAdvice:
				'Mid-build fatigue is normal — Form dips now and rebounds in the taper. Hit today’s threshold work.',
			peakProjected,
		},
		weekStats: {
			done: doneDays.length,
			planned: trainingDays.length,
			loadDone,
			loadPlanned,
			adherencePct: Math.round((loadDone / loadPlanned) * 100),
		},
	}
}
