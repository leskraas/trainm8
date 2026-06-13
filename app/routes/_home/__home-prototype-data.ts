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
	dayNum: number
	isToday: boolean
	discipline: Discipline | null
	title: string | null
	/** Short prescription summary, e.g. "Z4 · 4:05/km". */
	target: string | null
	durationMin: number | null
	plannedTss: number | null
	status: 'done' | 'today' | 'planned' | 'missed' | 'rest'
	actualTss: number | null
	/** Intensity profile so the week shows the *shape* of each workout. */
	structure: StructureStep[]
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

export type PR = {
	label: string
	value: string
	delta: string
	improved: boolean
}

// A chronological ledger row spanning past (done/missed) and future (planned),
// so the dense Session Ledger from the live home can be rendered.
export type LedgerEntry = {
	id: string
	date: Date
	discipline: Discipline
	title: string
	status: 'done' | 'missed' | 'planned' | 'today'
	durationMin: number | null
	plannedTss: number | null
	actualTss: number | null
	rpe: number | null
	band: Session['band']
	structure: StructureStep[]
}

export type MockAthlete = {
	name: string
	event: {
		name: string
		date: Date
		daysOut: number
		priority: 'A' | 'B' | 'C'
	}
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
	/** Legible "what's ahead" — future key sessions beyond today. */
	upcoming: Session[]
	/** Dense chronological log spanning past → now → planned. */
	ledger: LedgerEntry[]
	/** Progression banked so far this block. */
	banked: {
		fitnessGained: number
		sessionsDone: number
		weeksDone: number
		startFitness: number
	}
}

const DAY_MS = 86_400_000

function addDays(base: Date, n: number): Date {
	return new Date(base.getTime() + n * DAY_MS)
}

// Build a repeated work/rest block for a workout's intensity profile.
function reps(
	n: number,
	work: StructureStep,
	rest: StructureStep,
): StructureStep[] {
	const out: StructureStep[] = []
	for (let i = 0; i < n; i++) {
		out.push(work)
		if (i < n - 1) out.push(rest)
	}
	return out
}

const WU: StructureStep = { zone: 1, minutes: 10, label: 'Warm-up' }
const CD: StructureStep = { zone: 1, minutes: 8, label: 'Cool-down' }

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

	const plannedByWeek = [340, 380, 430, 300, 500, 560, 600, 640, 700, 620, 300]
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

	const weekSource: Array<{
		d: number
		disc: Discipline | null
		title: string | null
		target: string | null
		min: number | null
		tss: number | null
		status: DayCell['status']
		actual: number | null
		structure: StructureStep[]
	}> = [
		{
			d: -3,
			disc: 'swim',
			title: 'CSS Swim — 6 × 200m',
			target: 'CSS 1:40 /100m',
			min: 50,
			tss: 48,
			status: 'done',
			actual: 50,
			structure: [
				WU,
				...reps(6, { zone: 3, minutes: 4 }, { zone: 1, minutes: 1 }),
				CD,
			],
		},
		{
			d: -2,
			disc: 'bike',
			title: 'Sweet-spot — 3 × 12 min',
			target: '88–94% FTP · 235 W',
			min: 75,
			tss: 82,
			status: 'done',
			actual: 79,
			structure: [
				WU,
				...reps(3, { zone: 3, minutes: 12 }, { zone: 1, minutes: 4 }),
				CD,
			],
		},
		{
			d: -1,
			disc: 'run',
			title: 'Easy aerobic run',
			target: 'Z2 · 5:20 /km',
			min: 45,
			tss: 38,
			status: 'done',
			actual: 36,
			structure: [
				{ zone: 1, minutes: 5 },
				{ zone: 2, minutes: 35 },
				{ zone: 1, minutes: 5 },
			],
		},
		{
			d: 0,
			disc: 'run',
			title: 'Threshold Run — 3 × 10 min',
			target: 'Z4 · 4:05 /km',
			min: 62,
			tss: 78,
			status: 'today',
			actual: null,
			structure: [
				{ zone: 1, minutes: 15, label: 'Warm-up' },
				{ zone: 4, minutes: 10 },
				{ zone: 2, minutes: 3 },
				{ zone: 4, minutes: 10 },
				{ zone: 2, minutes: 3 },
				{ zone: 4, minutes: 10 },
				{ zone: 1, minutes: 11, label: 'Cool-down' },
			],
		},
		{
			d: 1,
			disc: null,
			title: null,
			target: null,
			min: null,
			tss: null,
			status: 'rest',
			actual: null,
			structure: [],
		},
		{
			d: 2,
			disc: 'bike',
			title: 'Long ride — endurance',
			target: 'Z2 · 3 h aerobic',
			min: 180,
			tss: 145,
			status: 'planned',
			actual: null,
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 150 },
				{ zone: 3, minutes: 10 },
				{ zone: 1, minutes: 10 },
			],
		},
		{
			d: 3,
			disc: 'run',
			title: 'Long run — 90 min',
			target: 'Z2 + 3 × surge',
			min: 90,
			tss: 96,
			status: 'planned',
			actual: null,
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 35 },
				{ zone: 3, minutes: 5 },
				{ zone: 2, minutes: 30 },
				{ zone: 1, minutes: 10 },
			],
		},
	]
	const week: DayCell[] = weekSource.map((s) => {
		const date = addDays(now, s.d)
		return {
			weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(
				date,
			),
			date,
			dayNum: date.getDate(),
			isToday: s.d === 0,
			discipline: s.disc,
			title: s.title,
			target: s.target,
			durationMin: s.min,
			plannedTss: s.tss,
			status: s.status,
			actualTss: s.actual,
			structure: s.structure,
		}
	})

	const recent: Session[] = [
		{
			id: 'r1',
			date: addDays(now, -1),
			discipline: 'run',
			title: 'Easy aerobic run',
			plannedMin: 45,
			actualMin: 47,
			plannedTss: 38,
			actualTss: 36,
			targetMetric: '5:20 /km easy',
			actualMetric: '5:18 /km · HR 142',
			rpe: 3,
			band: 'on-target',
			structure: [],
		},
		{
			id: 'r2',
			date: addDays(now, -2),
			discipline: 'bike',
			title: 'Sweet-spot — 3 × 12min',
			plannedMin: 75,
			actualMin: 75,
			plannedTss: 82,
			actualTss: 79,
			targetMetric: '235 W · 88–94% FTP',
			actualMetric: '231 W avg',
			rpe: 7,
			band: 'on-target',
			structure: [],
		},
		{
			id: 'r3',
			date: addDays(now, -3),
			discipline: 'swim',
			title: 'CSS Swim — 6 × 200m',
			plannedMin: 50,
			actualMin: 52,
			plannedTss: 48,
			actualTss: 50,
			targetMetric: '1:40 /100m',
			actualMetric: '1:39 /100m',
			rpe: 6,
			band: 'on-target',
			structure: [],
		},
		{
			id: 'r4',
			date: addDays(now, -5),
			discipline: 'run',
			title: 'VO2 — 5 × 3min',
			plannedMin: 55,
			actualMin: 58,
			plannedTss: 84,
			actualTss: 97,
			targetMetric: '3:45 /km',
			actualMetric: '3:41 /km · cooked',
			rpe: 9,
			band: 'over',
			structure: [],
		},
		{
			id: 'r5',
			date: addDays(now, -6),
			discipline: 'bike',
			title: 'Recovery spin',
			plannedMin: 45,
			actualMin: 30,
			plannedTss: 30,
			actualTss: 19,
			targetMetric: '< 120 W',
			actualMetric: 'cut short',
			rpe: 2,
			band: 'under',
			structure: [],
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

	// What's ahead — legible future key sessions (this week's remaining + the
	// next couple of weeks' highlights), so "the road ahead" has real stops.
	const upcoming: Session[] = [
		{
			id: 'u-ride',
			date: addDays(now, 2),
			discipline: 'bike',
			title: 'Long ride — endurance',
			plannedMin: 180,
			actualMin: null,
			plannedTss: 145,
			actualTss: null,
			targetMetric: 'Z2 · 3 h aerobic',
			actualMetric: null,
			rpe: null,
			band: null,
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 150 },
				{ zone: 3, minutes: 10 },
				{ zone: 1, minutes: 10 },
			],
		},
		{
			id: 'u-long',
			date: addDays(now, 3),
			discipline: 'run',
			title: 'Long run — 90 min',
			plannedMin: 90,
			actualMin: null,
			plannedTss: 96,
			actualTss: null,
			targetMetric: 'Z2 + 3 × surge',
			actualMetric: null,
			rpe: null,
			band: null,
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 35 },
				{ zone: 3, minutes: 5 },
				{ zone: 2, minutes: 30 },
				{ zone: 1, minutes: 10 },
			],
		},
		{
			id: 'u-brick',
			date: addDays(now, 7),
			discipline: 'bike',
			title: 'Brick — 75 min ride + 20 min run',
			plannedMin: 95,
			actualMin: null,
			plannedTss: 118,
			actualTss: null,
			targetMetric: 'Race effort · off-the-bike',
			actualMetric: null,
			rpe: null,
			band: null,
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 3, minutes: 55 },
				{ zone: 4, minutes: 5 },
				{ zone: 3, minutes: 20 },
				{ zone: 2, minutes: 5 },
			],
		},
		{
			id: 'u-ftp',
			date: addDays(now, 9),
			discipline: 'bike',
			title: 'Threshold Bike — 4 × 8 min',
			plannedMin: 70,
			actualMin: null,
			plannedTss: 95,
			actualTss: null,
			targetMetric: '95–100% FTP · 255 W',
			actualMetric: null,
			rpe: null,
			band: null,
			structure: [
				WU,
				...reps(4, { zone: 4, minutes: 8 }, { zone: 1, minutes: 3 }),
				CD,
			],
		},
		{
			id: 'u-ow',
			date: addDays(now, 13),
			discipline: 'swim',
			title: 'Open-water rehearsal — race pace',
			plannedMin: 55,
			actualMin: null,
			plannedTss: 70,
			actualTss: null,
			targetMetric: 'Race pace · sighting',
			actualMetric: null,
			rpe: null,
			band: null,
			structure: [WU, { zone: 3, minutes: 35 }, CD],
		},
	]

	const banked = {
		fitnessGained: todayPoint.ctl - fitness[0]!.ctl,
		sessionsDone: 27,
		weeksDone: currentWeek - 1,
		startFitness: fitness[0]!.ctl,
	}

	// Build the dense ledger: synthetic older history + recent (done) + today +
	// upcoming (planned), sorted chronologically.
	const olderSource: Array<{
		id: string
		d: number
		disc: Discipline
		title: string
		min: number
		p: number
		a: number | null
		rpe: number | null
		band: Session['band']
		missed?: boolean
		structure: StructureStep[]
	}> = [
		{
			id: 'o1',
			d: -14,
			disc: 'run',
			title: 'Easy aerobic run',
			min: 50,
			p: 42,
			a: 41,
			rpe: 3,
			band: 'on-target',
			structure: [
				{ zone: 1, minutes: 5 },
				{ zone: 2, minutes: 40 },
				{ zone: 1, minutes: 5 },
			],
		},
		{
			id: 'o2',
			d: -13,
			disc: 'bike',
			title: 'Endurance ride',
			min: 120,
			p: 95,
			a: 92,
			rpe: 5,
			band: 'on-target',
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 100 },
				{ zone: 1, minutes: 10 },
			],
		},
		{
			id: 'o3',
			d: -12,
			disc: 'swim',
			title: 'Technique swim — drills',
			min: 45,
			p: 40,
			a: 42,
			rpe: 4,
			band: 'on-target',
			structure: [WU, { zone: 2, minutes: 28 }, CD],
		},
		{
			id: 'o4',
			d: -11,
			disc: 'run',
			title: 'Hill repeats — 8 × 1 min',
			min: 55,
			p: 78,
			a: null,
			rpe: null,
			band: null,
			missed: true,
			structure: [
				WU,
				...reps(8, { zone: 5, minutes: 1 }, { zone: 1, minutes: 2 }),
				CD,
			],
		},
		{
			id: 'o5',
			d: -9,
			disc: 'bike',
			title: 'Sweet-spot — 2 × 20 min',
			min: 80,
			p: 90,
			a: 95,
			rpe: 7,
			band: 'over',
			structure: [
				WU,
				...reps(2, { zone: 3, minutes: 20 }, { zone: 1, minutes: 5 }),
				CD,
			],
		},
		{
			id: 'o6',
			d: -8,
			disc: 'run',
			title: 'Long run — 75 min',
			min: 75,
			p: 80,
			a: 82,
			rpe: 6,
			band: 'on-target',
			structure: [
				{ zone: 1, minutes: 10 },
				{ zone: 2, minutes: 60 },
				{ zone: 1, minutes: 5 },
			],
		},
	]
	const ledger: LedgerEntry[] = [
		...olderSource.map((s) => ({
			id: s.id,
			date: addDays(now, s.d),
			discipline: s.disc,
			title: s.title,
			status: (s.missed ? 'missed' : 'done') as LedgerEntry['status'],
			durationMin: s.min,
			plannedTss: s.p,
			actualTss: s.a,
			rpe: s.rpe,
			band: s.band,
			structure: s.structure,
		})),
		...recent.map((s) => ({
			id: s.id,
			date: s.date,
			discipline: s.discipline,
			title: s.title,
			status: 'done' as const,
			durationMin: s.actualMin,
			plannedTss: s.plannedTss,
			actualTss: s.actualTss,
			rpe: s.rpe,
			band: s.band,
			structure: s.structure,
		})),
		{
			id: today.id,
			date: today.date,
			discipline: today.discipline,
			title: today.title,
			status: 'today' as const,
			durationMin: today.plannedMin,
			plannedTss: today.plannedTss,
			actualTss: null,
			rpe: null,
			band: null,
			structure: today.structure,
		},
		...upcoming.map((s) => ({
			id: s.id,
			date: s.date,
			discipline: s.discipline,
			title: s.title,
			status: 'planned' as const,
			durationMin: s.plannedMin,
			plannedTss: s.plannedTss,
			actualTss: null,
			rpe: null,
			band: null,
			structure: s.structure,
		})),
	].sort((a, b) => a.date.getTime() - b.date.getTime())

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
		upcoming,
		ledger,
		banked,
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
