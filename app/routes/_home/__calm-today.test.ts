/**
 * I dag's calm default view (spec #558 S4, ADR 0101 §3–§4): what the today
 * card and this week's rows say, read off the same season the full Home
 * Timeline renders. Ledger in, card and week out.
 */
import { expect, test } from 'vitest'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { buildCalmToday, type CalmCard } from './__calm-today.ts'
import { buildTimelineSeason } from './timeline/presenter.ts'

const DAY = 24 * 60 * 60 * 1000
const TZ = 'UTC'
// Wednesday 2 January 2030, midday. The week runs Mon 31 Dec – Sun 6 Jan.
const NOW = new Date('2030-01-02T12:00:00Z')

type Workout = NonNullable<LedgerSession['workout']>
type Step = Workout['blocks'][number]['steps'][number]

function step(overrides: Partial<Step> = {}): Step {
	return {
		id: 'step-1',
		kind: 'cardio',
		notes: null,
		discipline: 'run',
		intensity: null,
		intensityHrMin: null,
		intensityHrMax: null,
		intensityPowerMin: null,
		intensityPowerMax: null,
		intensityPaceMin: null,
		intensityPaceMax: null,
		orderIndex: 0,
		durationSec: 45 * 60,
		distanceM: null,
		verticalM: null,
		gradePct: null,
		cadenceRpmMin: null,
		cadenceRpmMax: null,
		rest: null,
		exerciseId: null,
		restBetweenSetsSec: null,
		exercise: null,
		sets: [],
		...overrides,
	}
}

function session(
	id: string,
	at: string,
	{
		status = 'scheduled',
		title = 'Rolig løpetur',
		intent = 'endurance',
		discipline = 'run',
		description = null,
		minutes = 45,
		source = 'generated',
	}: {
		status?: string
		title?: string
		intent?: string
		discipline?: string
		description?: string | null
		minutes?: number
		source?: string
	} = {},
): LedgerSession {
	return {
		id,
		scheduledAt: new Date(at),
		status,
		source,
		adoptedAt: null,
		releasedAt: null,
		countsInNoTrack: false,
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: `w-${id}`,
			title,
			description,
			discipline,
			intent,
			archetype: null,
			activityKind: null,
			effortWord: null,
			blocks: [
				{
					id: `b-${id}`,
					name: 'Hoveddel',
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [
						step({ id: `s-${id}`, discipline, durationSec: minutes * 60 }),
					],
				},
			],
		},
		recording: null,
		sessionLog: null,
		setLogs: [],
	}
}

function plan(overrides: Partial<ActivePlan> = {}): ActivePlan {
	return {
		eventId: null,
		eventName: null,
		eventDate: null,
		// The plan began the Monday two weeks back.
		planStart: new Date('2029-12-17T00:00:00Z'),
		phases: [{ name: 'Grunntrening', weeks: 4 }],
		weeklyTss: [null, null, null, null],
		round: 1,
		tracks: [],
		weekRoles: ['loading', 'loading', 'loading', 'recovery'],
		fillsWeeks: false,
		family: 'polarized',
		loadBasis: {
			tracks: [],
			conventions: [],
			formulae: [],
			substitutions: [],
		},
		...overrides,
	}
}

function calm(
	ledger: LedgerSession[],
	{
		activePlan = plan(),
		now = NOW,
	}: { activePlan?: ActivePlan | null; now?: Date } = {},
) {
	const season = buildTimelineSeason({
		ledger,
		now,
		timezone: TZ,
		activePlan,
	})
	return {
		season,
		view: buildCalmToday({ season, ledger, now, timezone: TZ, activePlan }),
	}
}

function cardOf<K extends CalmCard['kind']>(
	card: CalmCard,
	kind: K,
): Extract<CalmCard, { kind: K }> {
	expect(card.kind).toBe(kind)
	return card as Extract<CalmCard, { kind: K }>
}

test("the today card names today's session: name, activity, duration, effort word and one sentence", () => {
	const { view } = calm([
		session('today', '2030-01-02T07:00:00Z', {
			title: 'Rolig løpetur',
			minutes: 50,
		}),
	])

	const card = cardOf(view.card, 'session')
	expect(card.session.title).toBe('Rolig løpetur')
	expect(card.session.disciplineLabel).toBe('Løping')
	expect(card.session.durationLabel).toBe('50 min')
	expect(card.session.effortLabel).toBe('rolig')
	expect(card.sentence).toBe('Rolig hele veien. Du skal kunne prate.')
	expect(card.session.markDone).not.toBeNull()
})

test("the athlete's own note is the card's sentence, its first sentence only", () => {
	const { view } = calm([
		session('today', '2030-01-02T07:00:00Z', {
			intent: 'vo2max',
			description: 'Fem drag på bakken ved skolen. Gå ned mellom.',
		}),
	])

	const card = cardOf(view.card, 'session')
	expect(card.sentence).toBe('Fem drag på bakken ved skolen.')
	expect(card.session.effortLabel).toBe('hard')
})

test('a threshold session written as pace reads hard against T-pace (#617)', () => {
	const reps = session('today', '2030-01-02T07:00:00Z', {
		title: '6 × 1000 m',
	})
	const block = reps.workout!.blocks[0]!
	const workout = {
		...reps.workout!,
		blocks: [
			{
				...block,
				repeatCount: 6,
				steps: [
					{
						...block.steps[0]!,
						durationSec: null,
						distanceM: 1000,
						intensity: JSON.stringify({ kind: 'pace', minSecPerKm: 220 }),
					},
				],
			},
		],
	}
	const ledger = [{ ...reps, workout }]
	const season = buildTimelineSeason({ ledger, now: NOW, timezone: TZ })
	const view = buildCalmToday({
		season,
		ledger,
		now: NOW,
		timezone: TZ,
		activePlan: plan(),
		thresholds: {
			run: {
				lthr: null,
				maxHr: null,
				ftp: null,
				runPowerThresholdW: null,
				thresholdPaceSecPerKm: 220,
				cssSecPer100m: null,
				zoneSystem: 'daniels-pace-5',
				zoneOverrides: null,
			},
		},
	})

	expect(cardOf(view.card, 'session').session.effortLabel).toBe('hard')
})

/** A run profile with a threshold pace, the Daniels recipe declared. */
const DANIELS_RUN = {
	run: {
		lthr: null,
		maxHr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	},
}

/** Today's session as `steps`, read through the season and I dag on DANIELS_RUN. */
function calmWithSteps(steps: Step[]) {
	const base = session('today', '2030-01-02T07:00:00Z', {
		title: '10 km rolig',
	})
	const block = base.workout!.blocks[0]!
	const ledger = [
		{ ...base, workout: { ...base.workout!, blocks: [{ ...block, steps }] } },
	]
	const season = buildTimelineSeason({
		ledger,
		now: NOW,
		timezone: TZ,
		thresholds: DANIELS_RUN,
	})
	const view = buildCalmToday({
		season,
		ledger,
		now: NOW,
		timezone: TZ,
		activePlan: plan(),
		thresholds: DANIELS_RUN,
	})
	const row = season.weeks[season.todayWeekIndex]!.rows.find(
		(day) => day.key === '2030-01-02',
	)!.sessions[0]!
	return { card: cardOf(view.card, 'session'), row }
}

const ROLIG = JSON.stringify({ kind: 'zoneLabel', label: 'Z2' })

test('a distance written in a zone word is timed through the threshold pace on the card and the row (#615)', () => {
	const { card, row } = calmWithSteps([
		step({ durationSec: null, distanceM: 10_000, intensity: ROLIG }),
	])

	expect(card.session.durationLabel).not.toBeNull()
	expect(row.externalLoad).toMatch(/\d+ min/)
})

test('a timed warm-up and a distance in a zone word total both (#615)', () => {
	const distance = step({
		id: 's-distance',
		durationSec: null,
		distanceM: 10_000,
		intensity: ROLIG,
	})
	const alone = calmWithSteps([distance])
	const { card, row } = calmWithSteps([
		step({ id: 's-warmup', durationSec: 15 * 60, intensity: ROLIG }),
		distance,
	])

	const minutes = (line: string | null) => Number(/(\d+) min/.exec(line!)![1])
	expect(minutes(row.externalLoad)).toBe(minutes(alone.row.externalLoad) + 15)
	expect(card.session.durationLabel).not.toBe('15 min')
})

test("a Simple Activity's card says the Effort Word the athlete stored, not one read from its step", () => {
	const climb = session('today', '2030-01-02T07:00:00Z', {
		title: 'Klatring',
		intent: 'simple-activity',
		discipline: 'other',
		minutes: 90,
	})
	const { view } = calm([
		{
			...climb,
			workout: { ...climb.workout!, activityKind: 'climb', effortWord: 'hard' },
		},
	])

	const card = cardOf(view.card, 'session')
	expect(card.session.effortLabel).toBe('hard')
})

test('Gjort is offered only on today and on past sessions not yet done; nothing still ahead offers it', () => {
	const { view } = calm([
		session('mon-open', '2029-12-31T07:00:00Z'),
		session('tue-done', '2030-01-01T07:00:00Z', { status: 'completed' }),
		session('today', '2030-01-02T07:00:00Z'),
		session('thu', '2030-01-03T07:00:00Z'),
		session('sat', '2030-01-05T07:00:00Z'),
	])

	const offers = Object.fromEntries(
		view.week.days
			.flatMap((day) => day.sessions)
			.map((one) => [one.id, one.markDone != null]),
	)
	expect(offers).toEqual({
		'mon-open': true,
		'tue-done': false,
		today: true,
		thu: false,
		sat: false,
	})
})

test('this week is seven rows: fri on a free day, ikke gjort on a past missed day, and n av m økter gjort', () => {
	const { view } = calm([
		session('mon-open', '2029-12-31T07:00:00Z'),
		session('tue-done', '2030-01-01T07:00:00Z', { status: 'completed' }),
		session('today', '2030-01-02T07:00:00Z'),
		// A threshold session is hard here as on the Start Option cards.
		session('sat', '2030-01-05T07:00:00Z', { intent: 'threshold' }),
	])

	expect(view.week.heading).toBe('Denne uka')
	expect(view.week.doneLine).toBe('1 av 4 økter gjort')
	expect(view.week.days.map((day) => day.weekdayLabel)).toEqual([
		'man',
		'tir',
		'ons',
		'tor',
		'fre',
		'lør',
		'søn',
	])
	const [mon, tue, wed, thu, , sat] = view.week.days
	expect(mon!.sessions[0]!.status).toBe('missed')
	expect(mon!.past).toBe(true)
	expect(tue!.sessions[0]!.status).toBe('completed')
	expect(wed!.isToday).toBe(true)
	expect(thu!.freeLabel).toBe('fri')
	expect(sat!.sessions[0]!.effortLabel).toBe('hard')
	expect(view.week.days.some((day) => day.freeLabel === 'hvile')).toBe(false)
})

test("the week's count is the full view's own: the same week model, never a second count", () => {
	const ledger = [
		session('mon-open', '2029-12-31T07:00:00Z'),
		session('tue-done', '2030-01-01T07:00:00Z', { status: 'completed' }),
		session('fri', '2030-01-04T07:00:00Z'),
	]
	const { view, season } = calm(ledger)

	const fullWeek = season.weeks[season.todayWeekIndex]!
	expect(fullWeek.loadLine).toMatch(/^1 av 3 gjort/)
	expect(view.week.doneLine).toBe('1 av 3 økter gjort')
})

test('a free day says Fri i dag and names the next session and its day', () => {
	const { view } = calm([
		session('fri', '2030-01-04T07:00:00Z', {
			title: 'Intervaller',
			minutes: 60,
		}),
	])

	const card = cardOf(view.card, 'free')
	expect(card.next?.line).toBe('Neste økt: Intervaller, fredag, 1 t.')
})

test('a free day with the next session tomorrow says i morgen', () => {
	const { view } = calm([
		session('thu', '2030-01-03T07:00:00Z', { title: 'Langtur', minutes: 90 }),
	])

	expect(cardOf(view.card, 'free').next?.line).toBe(
		'Neste økt: Langtur, i morgen, 1 t 30 min.',
	)
})

test('a next session past this week is named with its date', () => {
	const { view } = calm([
		session('next-week', '2030-01-08T07:00:00Z', { title: 'Terskel' }),
	])

	expect(cardOf(view.card, 'free').next?.line).toBe(
		'Neste økt: Terskel, tirsdag 8. jan, 45 min.',
	)
})

test('today done: the card says so and names the next session', () => {
	const { view } = calm([
		session('today', '2030-01-02T07:00:00Z', {
			status: 'completed',
			title: 'Rolig løpetur',
		}),
		session('sat', '2030-01-05T07:00:00Z', { title: 'Langtur' }),
	])

	const card = cardOf(view.card, 'done')
	expect(card.line).toBe('Du har gjort Rolig løpetur.')
	expect(card.next?.title).toBe('Langtur')
})

test('before the Plan Start Week the card says when the plan starts and names the first session', () => {
	const { view } = calm(
		[session('first', '2030-01-08T07:00:00Z', { title: 'Rolig løpetur' })],
		{ activePlan: plan({ planStart: new Date('2030-01-07T00:00:00Z') }) },
	)

	const card = cardOf(view.card, 'before-start')
	expect(card.title).toBe('Planen starter mandag 7. jan')
	expect(card.first?.line).toBe(
		'Første økt: Rolig løpetur, tirsdag 8. jan, 45 min.',
	)
})

test('with no plan and nothing written, I dag invites the athlete to the start instead of an empty calendar', () => {
	const { view } = calm([], { activePlan: null })

	expect(view.card.kind).toBe('no-plan')
	expect(view.topLine.planName).toBeNull()
	expect(view.week.shown).toBe(false)
})

test('with no plan, a week the athlete wrote in is still shown', () => {
	const { view } = calm(
		[session('fri', '2030-01-04T07:00:00Z', { source: 'authored' })],
		{ activePlan: null },
	)

	expect(view.card.kind).toBe('no-plan')
	expect(view.week.shown).toBe(true)
	expect(view.week.doneLine).toBe('0 av 1 økt gjort')
})

test('the top line is the date and the plan name', () => {
	const { view } = calm([])

	expect(view.topLine.dateLabel).toBe('onsdag 2. jan')
	expect(view.topLine.planName).toBe('Polarisert 80/20')
})

test('with no plan but a session written for today, the card is that session and the start is still offered', () => {
	const { view } = calm(
		[session('today', '2030-01-02T07:00:00Z', { source: 'authored' })],
		{ activePlan: null },
	)

	expect(cardOf(view.card, 'session').session.id).toBe('today')
	expect(view.invite).toBe(true)
})

test('with a plan, nothing invites the athlete to the start', () => {
	const { view } = calm([session('today', '2030-01-02T07:00:00Z')])

	expect(view.invite).toBe(false)
})

test('Gjort on a session reaches back a week at most, as the full view offers it', () => {
	// Sunday: Monday's open session is six days back and still markable.
	const sunday = new Date(NOW.getTime() + 4 * DAY)
	const { view } = calm([session('mon-open', '2029-12-31T07:00:00Z')], {
		now: sunday,
	})

	expect(view.week.days[0]!.sessions[0]!.markDone).not.toBeNull()
})
