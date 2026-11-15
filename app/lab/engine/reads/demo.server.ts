/**
 * The **demo athlete**, for a read asked for it with `demo: true`: a runner
 * ten weeks out from a half marathon who also rides, swims and lifts.
 * Deterministic (the same day gives the same numbers), and every output says
 * `source: 'demo'`. Never served in place of the athlete's own data.
 */
import {
	addDays,
	daysBetween,
	isoWeekNumber,
	localDate,
	mondayOfDay,
} from '#app/utils/athlete-calendar.ts'
import {
	type AthleteOutput,
	type Form,
	type Goal,
	type Num,
	type PhasePosition,
	type PlanOutput,
	type ProgressOutput,
	type ProposalsOutput,
	type SessionCard,
	type SessionOutput,
	type SessionsOutput,
	type SessionStatus,
	type SportVolume,
	type TodayOutput,
	type WeekOutput,
	type WeekRole,
} from '../reads.types.ts'
import {
	loadVerdict,
	sportName,
	verdictOf,
	weekdayOf,
} from './shared.server.ts'

type Kind =
	| 'strength'
	| 'intervals'
	| 'easy-ride'
	| 'threshold'
	| 'long'
	| 'swim'

type Template = {
	kind: Kind
	sport: 'run' | 'bike' | 'swim' | 'strength'
	title: string
	purpose: string
	minutes: number
	km: number | null
	tss: number
	time: string
}

// Monday … Sunday.
const WEEK: (Template | null)[] = [
	{
		kind: 'strength',
		sport: 'strength',
		title: 'Styrke: knebøy og markløft',
		purpose: 'Styrke — maks',
		minutes: 50,
		km: null,
		tss: 35,
		time: '07:00',
	},
	{
		kind: 'intervals',
		sport: 'run',
		title: 'Intervaller 6 × 4 min',
		purpose: 'VO₂maks',
		minutes: 60,
		km: 11,
		tss: 78,
		time: '17:30',
	},
	{
		kind: 'easy-ride',
		sport: 'bike',
		title: 'Rolig sykkel',
		purpose: 'Utholdenhet',
		minutes: 75,
		km: 30,
		tss: 52,
		time: '17:30',
	},
	{
		kind: 'threshold',
		sport: 'run',
		title: 'Terskel 3 × 10 min',
		purpose: 'Terskel',
		minutes: 65,
		km: 12,
		tss: 82,
		time: '17:30',
	},
	null,
	{
		kind: 'long',
		sport: 'run',
		title: 'Langtur',
		purpose: 'Utholdenhet',
		minutes: 110,
		km: 21,
		tss: 115,
		time: '09:00',
	},
	{
		kind: 'swim',
		sport: 'swim',
		title: 'Teknikksvøm',
		purpose: 'Teknikk',
		minutes: 40,
		km: 1.8,
		tss: 30,
		time: '12:00',
	},
]

const PHASES = [
	{ name: 'Grunntrening', weeks: 6, rhythm: '3:1', tapers: false },
	{ name: 'Oppbygging', weeks: 6, rhythm: '3:1', tapers: false },
	{ name: 'Spesifikk', weeks: 3, rhythm: '3:1', tapers: false },
	{ name: 'Nedtrapping', weeks: 1, rhythm: '3:1', tapers: true },
]
const PLAN_WEEKS = 16
const HISTORY_WEEKS = 12

function hash(s: string): number {
	let h = 2166136261
	for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
	return (h >>> 0) / 4294967295
}

const k = (value: number): Num => ({ value, why: null })
const u = (why: string): Num => ({ value: null, why })
const round1 = (n: number) => Math.round(n * 10) / 10

type World = {
	today: string
	monday: string
	firstWeek: string
	eventDate: string
	cards: SessionCard[]
}

function roleOf(i: number): WeekRole | null {
	if (i < 0 || i >= PLAN_WEEKS) return null
	if (i === PLAN_WEEKS - 1) return 'taper'
	return i % 4 === 3 ? 'recovery' : 'loading'
}

function scaleOf(i: number): number {
	const role = roleOf(i)
	if (role === 'recovery') return 0.7
	if (role === 'taper') return 0.55
	return 0.85 + 0.025 * Math.max(i, -6)
}

function world(now: Date, timezone: string): World {
	const today = localDate(now, timezone)
	const monday = mondayOfDay(today)
	const firstWeek = addDays(monday, -7 * 6)
	const eventDate = addDays(firstWeek, 7 * PLAN_WEEKS - 1)
	const cards: SessionCard[] = []
	const start = addDays(monday, -7 * (HISTORY_WEEKS - 1))
	for (let d = 0; d <= daysBetween(start, eventDate); d++) {
		const date = addDays(start, d)
		const t = WEEK[d % 7]
		if (!t) continue
		const weekIndex = Math.floor(daysBetween(firstWeek, date) / 7)
		const scale = date === eventDate ? 0 : scaleOf(weekIndex)
		const minutes = Math.round((t.minutes * scale) / 5) * 5
		const tss = Math.round(t.tss * scale)
		const km = t.km != null ? round1(t.km * scale) : null
		const r = hash(date)
		const status: SessionStatus =
			date < today ? (r < 0.08 ? 'missed' : 'done') : 'planned'
		const factor = 0.82 + r * 0.32
		const planned = {
			durationS: k(minutes * 60),
			distanceM: km != null ? k(km * 1000) : u('Styrke har ingen distanse.'),
			load: k(tss),
		}
		const isDone = status === 'done'
		const actual = {
			durationS: isDone
				? k(Math.round(minutes * 60 * factor))
				: u('Ikke registrert: ingen økt er tatt opp ennå.'),
			distanceM:
				isDone && km != null
					? k(Math.round(km * 1000 * factor))
					: u(
							km == null
								? 'Styrke har ingen distanse.'
								: 'Ikke registrert: ingen økt er tatt opp ennå.',
						),
			load: isDone
				? k(Math.round(tss * factor))
				: u('Ikke registrert: ingen økt er tatt opp ennå.'),
		}
		cards.push({
			id: `demo-${date}`,
			date,
			time: t.time,
			sport: t.sport,
			sportName: sportName(t.sport),
			title: t.title,
			purpose: t.purpose,
			status,
			whose: 'plan',
			planned,
			actual,
			verdict:
				status === 'planned'
					? verdictOf(null, 'Ikke gjort ennå.')
					: loadVerdict(planned.load, actual.load),
			rpe: isDone ? Math.min(10, Math.max(2, Math.round(3 + r * 6))) : null,
			hasRecording: isDone && t.sport !== 'strength',
			markedDone: false,
			strengthSetsLogged: t.sport === 'strength' ? (isDone ? 9 : 0) : null,
			adjustedBecause: null,
			outsideWeeklyCount: false,
		})
	}
	// The race itself, on the plan's last day.
	cards.push({
		...cards.find((c) => c.date === addDays(eventDate, -1))!,
		id: `demo-${eventDate}`,
		date: eventDate,
		time: '10:00',
		sport: 'run',
		sportName: sportName('run'),
		title: 'Halvmaraton',
		purpose: 'Konkurranse',
		status: eventDate < today ? 'done' : 'planned',
		planned: { durationS: k(6300), distanceM: k(21097), load: k(150) },
		actual: {
			durationS: u('Ikke registrert: ingen økt er tatt opp ennå.'),
			distanceM: u('Ikke registrert: ingen økt er tatt opp ennå.'),
			load: u('Ikke registrert: ingen økt er tatt opp ennå.'),
		},
		verdict: verdictOf(null, 'Ikke gjort ennå.'),
		rpe: null,
		hasRecording: false,
		strengthSetsLogged: null,
	})
	cards.sort((a, b) => a.date.localeCompare(b.date))
	return { today, monday, firstWeek, eventDate, cards }
}

function goalOf(w: World): Goal {
	return {
		kind: 'event',
		eventId: 'demo-event',
		name: 'Demo halvmaraton',
		date: w.eventDate,
		daysToGo: daysBetween(w.today, w.eventDate),
		eventKind: 'race',
		sports: ['run'],
		aim: 'På 1:45:00',
		aimDetail: { kind: 'time', seconds: 6300 },
	}
}

function phaseAt(w: World, weekKey: string): PhasePosition | null {
	const i = daysBetween(w.firstWeek, weekKey) / 7
	if (i < 0 || i >= PLAN_WEEKS) return null
	let start = 0
	for (const p of PHASES) {
		if (i < start + p.weeks) {
			return {
				name: p.name,
				planWeek: i + 1,
				planWeeks: PLAN_WEEKS,
				phaseWeek: i - start + 1,
				phaseWeeks: p.weeks,
				role: roleOf(i),
			}
		}
		start += p.weeks
	}
	return null
}

const sum = (xs: (number | null)[]) =>
	xs.reduce<number>((a, b) => a + (b ?? 0), 0)

function sportsOf(w: World, weekKey: string): SportVolume[] {
	const sunday = addDays(weekKey, 6)
	const week = w.cards.filter((c) => c.date >= weekKey && c.date <= sunday)
	const i = daysBetween(w.firstWeek, weekKey) / 7
	const inPlan = i >= 0 && i < PLAN_WEEKS
	const track = (
		sport: 'run' | 'bike' | 'swim' | 'strength',
		unit: SportVolume['unit'],
		measure: (c: SessionCard, side: 'planned' | 'actual') => number | null,
	): SportVolume => {
		const of = week.filter((c) => c.sport === sport)
		const planned = round1(sum(of.map((c) => measure(c, 'planned'))))
		return {
			sport,
			sportName: sportName(sport),
			unit,
			target: inPlan ? k(planned) : u('Ikke satt: uka ligger utenfor planen.'),
			planned: k(planned),
			actual: k(
				round1(
					sum(
						of
							.filter((c) => c.status === 'done')
							.map((c) => measure(c, 'actual')),
					),
				),
			),
		}
	}
	return [
		track('run', 'km', (c, s) =>
			c[s].distanceM.value != null ? c[s].distanceM.value! / 1000 : null,
		),
		track('bike', 'hours', (c, s) =>
			c[s].durationS.value != null ? c[s].durationS.value! / 3600 : null,
		),
		track('swim', 'km', (c, s) =>
			c[s].distanceM.value != null ? c[s].distanceM.value! / 1000 : null,
		),
		track('strength', 'sets', (c, s) =>
			s === 'planned' ? 9 : (c.strengthSetsLogged ?? null),
		),
	]
}

/** Fitness, fatigue and form per day, from the demo's own daily load. */
function loadSeries(w: World) {
	const start = w.cards[0]!.date
	const days: {
		date: string
		tss: number
		ctl: number
		atl: number
		tsb: number
	}[] = []
	let ctl = 30
	let atl = 30
	for (let d = 0; d <= daysBetween(start, w.today); d++) {
		const date = addDays(start, d)
		const tss = sum(
			w.cards
				.filter((c) => c.date === date && c.status === 'done')
				.map((c) => c.actual.load.value),
		)
		const tsb = ctl - atl
		ctl = ctl + (tss - ctl) / 42
		atl = atl + (tss - atl) / 7
		days.push({
			date,
			tss,
			ctl: round1(ctl),
			atl: round1(atl),
			tsb: round1(tsb),
		})
	}
	return days
}

function formOf(w: World): Form {
	const last = loadSeries(w).at(-1)!
	return { fitness: k(last.ctl), fatigue: k(last.atl), form: k(last.tsb) }
}

export function demoAthlete(now: Date, timezone: string): AthleteOutput {
	const w = world(now, timezone)
	return {
		source: 'demo',
		name: 'Demo Utøver',
		username: 'demo',
		email: null,
		timezone,
		today: w.today,
		level: 'recreational',
		levelName: 'Mosjonist',
		sports: ['run', 'bike', 'strength', 'swim'],
		availability: {
			days: ['mon', 'tue', 'wed', 'thu', 'sat', 'sun'],
			usualTime: '17:30',
			weeklyHours: k(7),
			strengthPerWeek: 1,
			likes: ['long', 'intervals'],
		},
		setup: {
			firstOpen: false,
			answeredBasics: true,
			hasSessionSource: true,
			hasGoal: true,
			hasPlan: true,
			complete: true,
			next: null,
		},
		sources: [
			{
				provider: 'intervalsicu',
				name: 'Intervals.icu',
				status: 'connected',
				canConnect: true,
				connectedAt: new Date(`${w.cards[0]!.date}T08:00:00Z`).toISOString(),
				lastCheckedAt: now.toISOString(),
				newestSessionAt: now.toISOString(),
				historyImported: true,
			},
		],
		recordings: {
			count: w.cards.filter((c) => c.hasRecording).length,
			first: w.cards[0]!.date,
			last: w.cards.filter((c) => c.hasRecording).at(-1)?.date ?? null,
		},
		goal: goalOf(w),
		plan: {
			exists: true,
			firstWeek: w.firstWeek,
			lastWeek: addDays(w.firstWeek, 7 * (PLAN_WEEKS - 1)),
		},
		homePlace: { name: 'Lillehammer', municipality: 'Lillehammer' },
		adjustMode: 'autopilot',
		units: 'metric',
	}
}

export function demoToday(now: Date, timezone: string): TodayOutput {
	const w = world(now, timezone)
	const sessions = w.cards.filter((c) => c.date === w.today)
	const form = formOf(w)
	const tsb = form.form.value!
	const call = tsb >= 5 ? 'fresh' : tsb <= -10 ? 'fatigued' : 'neutral'
	return {
		source: 'demo',
		date: w.today,
		weekday: weekdayOf(w.today),
		weekKey: w.monday,
		restDay: sessions.length === 0,
		sessions,
		next:
			w.cards.find((c) => c.date > w.today && c.status === 'planned') ?? null,
		form,
		formTrust: {
			trusted: true,
			daysOfHistory: 84,
			requiredDays: 42,
			why: null,
		},
		readiness: {
			call,
			ledBy: 'form',
			sentence:
				call === 'fresh'
					? `Formen er ${tsb > 0 ? '+' : ''}${tsb}, uthvilt — du er uthvilt, kjør økta`
					: call === 'fatigued'
						? `Formen er ${tsb}, sliten — ta det med ro i dag`
						: `Formen er ${tsb}, i balanse — tren som planlagt`,
			nextSession: { outcome: 'held', sentence: null },
		},
		week: sportsOf(w, w.monday),
		phase: phaseAt(w, w.monday),
		proposalsWaiting: 0,
		changesMade: 0,
		weather: {
			at: new Date(`${w.today}T16:00:00Z`).toISOString(),
			symbol: 'partly-cloudy',
			label: 'Delvis skyet',
			temperatureC: 8,
			precipitationMm: 0,
			credit: 'Værdata fra MET Norge',
		},
		weatherWhy: null,
	}
}

export function demoWeek(
	now: Date,
	timezone: string,
	day: string | undefined,
): WeekOutput {
	const w = world(now, timezone)
	const weekKey = day ? mondayOfDay(day) : w.monday
	const sunday = addDays(weekKey, 6)
	const cards = w.cards.filter((c) => c.date >= weekKey && c.date <= sunday)
	const planned = sum(cards.map((c) => c.planned.load.value))
	const actual = sum(
		cards.filter((c) => c.status === 'done').map((c) => c.actual.load.value),
	)
	const when =
		sunday < w.today ? 'past' : weekKey > w.today ? 'future' : 'current'
	return {
		source: 'demo',
		weekKey,
		when,
		isoWeek: isoWeekNumber(weekKey),
		phase: phaseAt(w, weekKey),
		days: Array.from({ length: 7 }, (_, i) => {
			const date = addDays(weekKey, i)
			const sessions = cards.filter((c) => c.date === date)
			return {
				date,
				weekday: weekdayOf(date),
				isToday: date === w.today,
				isPast: date < w.today,
				available: i !== 4,
				restDay: sessions.length === 0,
				sessions,
			}
		}),
		sports: sportsOf(w, weekKey),
		load: {
			planned: cards.length ? k(planned) : u('Ingen planlagte økter.'),
			actual: when === 'future' ? u('Uka har ikke begynt.') : k(actual),
			verdict:
				when === 'future'
					? verdictOf(null, 'Uka har ikke begynt.')
					: loadVerdict(k(planned), k(actual)),
		},
		counts: {
			planned: cards.filter((c) => c.status === 'planned').length,
			done: cards.filter((c) => c.status === 'done').length,
			missed: cards.filter((c) => c.status === 'missed').length,
			recordingOnly: 0,
		},
		proposals: [],
		eased: false,
	}
}

export function demoPlan(now: Date, timezone: string): PlanOutput {
	const w = world(now, timezone)
	const currentIndex = daysBetween(w.firstWeek, w.monday) / 7
	let start = 0
	return {
		source: 'demo',
		plan: {
			goal: goalOf(w),
			firstWeek: w.firstWeek,
			lastWeek: addDays(w.firstWeek, 7 * (PLAN_WEEKS - 1)),
			totalWeeks: PLAN_WEEKS,
			currentWeek: currentIndex + 1,
			block: null,
			philosophy: {
				key: 'classic',
				name: 'Klassisk 3:1',
				description:
					'Tre uker der treningen øker, så én lett uke. De harde øktene blir flere og hardere utover sesongen.',
			},
			sports: (['run', 'bike', 'swim', 'strength'] as const).map((s) => ({
				sport: s,
				sportName: sportName(s),
				unit: s === 'bike' ? 'hours' : s === 'strength' ? 'sets' : 'km',
			})),
			phases: PHASES.map((p) => {
				const firstWeek = addDays(w.firstWeek, 7 * start)
				const out = {
					name: p.name,
					weeks: p.weeks,
					firstWeek,
					lastWeek: addDays(firstWeek, 7 * (p.weeks - 1)),
					isCurrent: currentIndex >= start && currentIndex < start + p.weeks,
					rhythm: p.rhythm,
					tapers: p.tapers,
				}
				start += p.weeks
				return out
			}),
			weeks: Array.from({ length: PLAN_WEEKS }, (_, i) => {
				const weekKey = addDays(w.firstWeek, 7 * i)
				const sunday = addDays(weekKey, 6)
				return {
					weekKey,
					number: i + 1,
					phase: phaseAt(w, weekKey)?.name ?? null,
					role: roleOf(i),
					when:
						i < currentIndex
							? 'past'
							: i === currentIndex
								? 'current'
								: 'future',
					sports: sportsOf(w, weekKey),
					projectedLoad: k(
						sum(
							w.cards
								.filter((c) => c.date >= weekKey && c.date <= sunday)
								.map((c) => c.planned.load.value),
						),
					),
				}
			}),
			projectedFitnessOnGoalDay: k(round1(formOf(w).fitness.value! * 1.08)),
		},
		events: [
			{
				id: 'demo-event',
				name: 'Demo halvmaraton',
				date: w.eventDate,
				kind: 'race',
				priority: 'A',
				isPlanGoal: true,
			},
		],
	}
}

export function demoSessions(
	now: Date,
	timezone: string,
	from: string,
	to: string,
): SessionsOutput {
	const w = world(now, timezone)
	return {
		source: 'demo',
		from,
		to,
		sessions: w.cards.filter((c) => c.date >= from && c.date <= to),
		nextCursor: null,
	}
}

export function demoSession(
	now: Date,
	timezone: string,
	sessionId: string,
): SessionOutput | null {
	const w = world(now, timezone)
	const card = w.cards.find((c) => c.id === sessionId)
	if (!card) return null
	const t = WEEK[((daysBetween(w.cards[0]!.date, card.date) % 7) + 7) % 7]
	const done = card.status === 'done'
	const pace = (min: number, max: number) => ({
		label: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}–${Math.floor(max / 60)}:${String(max % 60).padStart(2, '0')} /km`,
		resolvedText: null,
		heartRate: null,
		power: null,
		pace: { min, max, unit: 'km' as const },
		approximate: false,
		why: null,
	})
	const zone = (label: string, hrMin: number, hrMax: number) => ({
		label,
		resolvedText: `${hrMin}–${hrMax} bpm`,
		heartRate: { min: hrMin, max: hrMax },
		power: null,
		pace: null,
		approximate: false,
		why: null,
	})
	const step = (
		kind: 'work' | 'rest',
		minutes: number,
		target: ReturnType<typeof zone> | ReturnType<typeof pace> | null,
		text: string,
	) => ({
		kind,
		sport: kind === 'rest' ? null : card.sport,
		durationS: minutes * 60,
		distanceM: null,
		climbM: null,
		target,
		exercise: null,
		sets: null,
		restBetweenSetsS: null,
		note: null,
		text,
	})
	const block = (
		repeat: number,
		steps: ReturnType<typeof step>[],
		text: string,
		name: string | null = null,
	) => ({ name, repeat, series: 1, restBetweenSeriesS: null, steps, text })
	const warm = block(
		1,
		[step('work', 15, zone('Z1–Z2 — rolig', 120, 145), '15 min Z1–Z2')],
		'15 min rolig',
		'Oppvarming',
	)
	const cool = block(
		1,
		[step('work', 10, zone('Z1 — veldig rolig', 110, 130), '10 min Z1')],
		'10 min rolig',
		'Nedjogg',
	)
	const structure =
		t?.kind === 'intervals'
			? [
					warm,
					block(
						6,
						[
							step('work', 4, pace(225, 235), '4 min 3:45–3:55 /km'),
							step('rest', 2, null, '2 min pause'),
						],
						'6 × (4 min 3:45–3:55 /km, 2 min pause)',
						'Drag',
					),
					cool,
				]
			: t?.kind === 'threshold'
				? [
						warm,
						block(
							3,
							[
								step('work', 10, pace(245, 255), '10 min 4:05–4:15 /km'),
								step('rest', 2, null, '2 min pause'),
							],
							'3 × (10 min 4:05–4:15 /km, 2 min pause)',
							'Drag',
						),
						cool,
					]
				: t?.kind === 'strength'
					? null
					: [
							block(
								1,
								[
									step(
										'work',
										Math.round((card.planned.durationS.value ?? 0) / 60),
										zone('Z2 — rolig', 130, 150),
										'Z2',
									),
								],
								`${Math.round((card.planned.durationS.value ?? 0) / 60)} min Z2`,
							),
						]
	const exercise = (id: string, name: string, kg: number) => ({
		stepId: `${card.id}-${id}`,
		exerciseId: null,
		name,
		restBetweenSetsS: 180,
		oneSideAtATime: false,
		sets: [1, 2, 3].map((n) => ({
			number: n,
			role: 'working' as const,
			prescribed: { reps: 5, durationS: null, loadText: `${kg} kg`, kg: k(kg) },
			logged: done
				? {
						setLogId: `${card.id}-${id}-${n}`,
						reps: 5,
						durationS: null,
						kg,
						loadText: `${kg} kg`,
						repsInReserve: 2,
						outcome: 'completed' as const,
					}
				: null,
			lastTime: `${kg - 2.5} kg × 5`,
		})),
	})
	const strength =
		card.sport === 'strength'
			? {
					exercises: [
						exercise('squat', 'Knebøy', 80),
						exercise('deadlift', 'Markløft', 100),
						exercise('row', 'Roing med stang', 50),
					],
					loggedSets: done ? 9 : 0,
					prescribedSets: 9,
				}
			: null
	const yes = { allowed: true, why: null }
	const no = (why: string) => ({ allowed: false, why })
	const open = card.status === 'planned'
	return {
		...card,
		source: 'demo',
		description: null,
		summary: structure
			? structure.map((b) => b.text).join(', ')
			: '3 × 5 knebøy, markløft og roing',
		structure,
		comparison: {
			load: { planned: card.planned.load, actual: card.actual.load },
			durationS: {
				planned: card.planned.durationS,
				actual: card.actual.durationS,
			},
			distanceM: {
				planned: card.planned.distanceM,
				actual: card.actual.distanceM,
			},
			verdict: card.verdict,
			structure:
				done && card.sport !== 'strength'
					? { call: 'as-planned', label: 'Som planlagt', why: null }
					: {
							call: null,
							label: null,
							why: 'Ikke registrert: ingen økt er tatt opp ennå.',
						},
			sinceLast: null,
		},
		feeling: { rpe: card.rpe, note: done ? 'Fin økt, gode bein.' : null },
		strength,
		recording:
			done && card.sport !== 'strength'
				? {
						id: `${card.id}-rec`,
						from: 'garmin',
						startedAt: new Date(
							`${card.date}T${card.time ?? '12:00'}:00Z`,
						).toISOString(),
						durationS: card.actual.durationS,
						distanceM: card.actual.distanceM,
						avgHeartRate: k(142),
						maxHeartRate: k(171),
						avgPower:
							card.sport === 'bike' ? k(185) : u('Ingen watt i opptaket.'),
						normalizedPower:
							card.sport === 'bike' ? k(196) : u('Ingen watt i opptaket.'),
						avgPace:
							card.actual.distanceM.value && card.actual.durationS.value
								? k(
										Math.round(
											card.actual.durationS.value /
												(card.actual.distanceM.value / 1000),
										),
									)
								: u('Ingen fart i opptaket.'),
						climbM: k(85),
						load: card.actual.load,
					}
				: null,
		can: {
			move: open ? yes : no('Økta er ikke åpen.'),
			swap: open ? yes : no('Økta er ikke åpen.'),
			skip: open ? yes : no('Økta er ikke åpen.'),
			shorten:
				open && card.date === w.today
					? yes
					: no('Bare dagens økt kan endres slik.'),
			makeEasier:
				open && card.date === w.today
					? yes
					: no('Bare dagens økt kan endres slik.'),
			markDone:
				open && card.date <= w.today && card.sport !== 'strength'
					? yes
					: no('Økta kan ikke merkes som gjort nå.'),
			undoDone: no('Økta er ikke merket som gjort for hånd.'),
			logStrength:
				card.sport === 'strength' && card.date <= w.today
					? yes
					: no('Økta har ingen styrkeøvelser.'),
			rateFeeling: done ? yes : no('Si hvordan det kjentes når økta er gjort.'),
		},
	}
}

export function demoProgress(
	now: Date,
	timezone: string,
	weeks: number,
): ProgressOutput {
	const w = world(now, timezone)
	const firstMonday = addDays(w.monday, -7 * (weeks - 1))
	const series = loadSeries(w).filter((d) => d.date >= firstMonday)
	const form = formOf(w)
	return {
		source: 'demo',
		weeks,
		current: form,
		formTrust: {
			trusted: true,
			daysOfHistory: 84,
			requiredDays: 42,
			why: null,
		},
		days: series.map((d) => ({
			date: d.date,
			load: k(d.tss),
			fitness: k(d.ctl),
			fatigue: k(d.atl),
			form: k(d.tsb),
		})),
		weekly: Array.from({ length: weeks }, (_, i) => {
			const weekKey = addDays(firstMonday, 7 * i)
			const week = demoWeek(now, timezone, weekKey)
			const cards = week.days.flatMap((d) => d.sessions)
			return {
				weekKey,
				plannedLoad: week.load.planned,
				actualLoad: week.load.actual,
				verdict: week.load.verdict,
				sports: week.sports,
				recorded: (['run', 'bike', 'swim'] as const).map((sport) => {
					const of = cards.filter(
						(c) => c.sport === sport && c.status === 'done',
					)
					return {
						sport,
						sportName: sportName(sport),
						sessions: of.length,
						durationS: k(sum(of.map((c) => c.actual.durationS.value))),
						distanceM: k(sum(of.map((c) => c.actual.distanceM.value))),
					}
				}),
			}
		}),
		trend: null,
		goal: {
			goal: goalOf(w),
			weeksToGo: Math.ceil(daysBetween(w.today, w.eventDate) / 7),
			planWeek: phaseAt(w, w.monday)?.planWeek ?? null,
			planWeeks: PLAN_WEEKS,
			phase: phaseAt(w, w.monday)?.name ?? null,
			fitnessToday: form.fitness,
			projectedFitnessOnGoalDay: k(round1(form.fitness.value! * 1.08)),
		},
	}
}

export function demoProposals(now: Date, timezone: string): ProposalsOutput {
	const w = world(now, timezone)
	const next = addDays(w.monday, 7)
	const thursday = w.cards.find((c) => c.date === addDays(next, 3))
	return {
		source: 'demo',
		adjustMode: 'ask-first',
		waiting: thursday ? 1 : 0,
		closedWeek: addDays(w.monday, -7),
		forWeek: next,
		summary: 'Forrige uke gikk som planlagt.',
		proposals: thursday
			? [
					{
						id: 'demo-proposal',
						kind: 'move',
						headline: `Flytt «${thursday.title}» fra torsdag til fredag`,
						reason:
							'Torsdag og tirsdag blir to harde økter tett; fredag gir en hviledag imellom.',
						addsLoad: false,
						touchesOwnSession: false,
						state: 'waiting',
						stateLabel: null,
						weekKey: next,
						session: {
							id: thursday.id,
							date: thursday.date,
							sport: thursday.sport,
							title: thursday.title,
							whose: 'plan',
						},
						otherSession: null,
						asksScope: true,
						block: null,
						change: {
							kind: 'move',
							fromDate: thursday.date,
							toDate: addDays(thursday.date, 1),
							makeUp: false,
						},
					},
				]
			: [],
		changesMade: null,
		easedWeek: null,
	}
}
