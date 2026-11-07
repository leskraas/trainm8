/**
 * **I dag's calm default view** (spec #558 S4, ADR 0101 §3–§4), as data: the
 * top line, the today card and this week's seven rows.
 *
 * It is a reading of the **Home Timeline's own week model**
 * (`buildTimelineSeason`), never a second one: the week's days, their
 * sessions, each session's status and whether it may be marked _Gjort_ all
 * come off the season the full view (_Se hele sesongen_) renders, so the two
 * cannot disagree about a number. The ledger is read only for what a row of
 * the full view does not carry: a session's minutes, its Effort Word and its
 * own note.
 *
 * The rules it holds (ADR 0101 §4):
 *
 * - **Actions by time.** _Gjort_ only on today's session and on past sessions
 *   not yet done — `canMarkDone`'s rule, which the timeline's rows already
 *   carry as `markDone`. A session still ahead offers nothing to mark.
 * - **_fri_ on a free day**, never _hvile_; _hviledag_ only where the plan
 *   prescribes recovery (`restPrescribed`, today never).
 * - **Before the Plan Start Week** the card says when the plan starts and
 *   names its first session; with **no plan** it invites the athlete to the
 *   start.
 * - **The weather** (#433, ADR 0112 §6): with a **Home Place**, the card
 *   carries today's **Day Forecast** and each row from tomorrow on its day's;
 *   today's row, past days and days without a forecast carry nothing. With no
 *   Home Place nothing changes at all.
 */
import {
	addDays,
	localTimeOfDay,
	weekMonday,
} from '#app/utils/athlete-calendar.ts'
import {
	type EffortWord,
	readEffortWord,
	titleStatesEffort,
} from '#app/utils/effort-word.ts'
import { formatNbDayMonth, formatNbWeekday } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	approxLabel,
	CALM_TODAY_LABELS as L,
	nbDurationLabel,
	WEATHER_LABELS,
} from '#app/utils/labels.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { toSessionLedgerEntry } from '#app/utils/training.ts'
import {
	type DayForecast,
	type WeatherGlyph,
	weatherGlyph,
} from '#app/utils/weather/day-forecast.ts'
import {
	type TimelineDay,
	type TimelineSeason,
	type TimelineSession,
} from './timeline/presenter.ts'

/** A **Day Forecast** as I dag shows it: the glyph, the words, the numbers. */
export type CalmWeather = {
	glyph: WeatherGlyph
	/** `Lett regn`. */
	word: string
	/** `kl. 17`. */
	hourLabel: string
	/** `6°`, `−23°`. */
	temperatureLabel: string
	/** `0,6 mm`, `0 mm`. */
	precipitationLabel: string
	/** What a screen reader hears instead of the numbers. */
	spoken: string
}

/** One session as the calm view says it. */
export type CalmSession = {
	id: string
	dayKey: string
	/** The Workout Detail View: every row leads somewhere (ADR 0101 §4). */
	to: string
	title: string
	discipline: string
	disciplineLabel: string
	status: TimelineSession['status']
	/** `45 min`, `1 t 30 min`; null where the session states no time. */
	durationLabel: string | null
	effort: EffortWord | null
	/** The Effort Word as shown; null where the title already says it. */
	effortLabel: string | null
	/** _Gjort_, where `canMarkDone` allows it; null on anything still ahead. */
	markDone: TimelineSession['markDone']
}

/** The next session, named: the card's last line on a free or done day. */
export type CalmNext = {
	id: string
	title: string
	/** `i morgen`, `torsdag`, or `mandag 26. okt` past this week. */
	whenLabel: string
	line: string
}

export type CalmCard =
	| {
			kind: 'session'
			session: CalmSession
			/** One plain sentence of what to do. */
			sentence: string
			/**
			 * A lift is run, not marked (ADR 0060): its action is the runner. Null
			 * on everything else, which takes _Gjort_.
			 */
			logTo: { label: string; to: string } | null
	  }
	| { kind: 'done'; done: CalmSession[]; line: string; next: CalmNext | null }
	| { kind: 'free'; next: CalmNext | null }
	| {
			kind: 'before-start'
			title: string
			first: CalmNext | null
	  }
	| { kind: 'no-plan' }

export type CalmDay = {
	key: string
	/** `man` — the weekday, as the row's gutter says it. */
	weekdayLabel: string
	/** `12` — the date alone. */
	dayOfMonth: string
	/** `mandag 12. okt` — for a screen reader and the free day's button. */
	dayName: string
	isToday: boolean
	/** Before today: a planned session left open there reads _ikke gjort_. */
	past: boolean
	sessions: CalmSession[]
	/** `fri`, or `hviledag` where the plan prescribes recovery; null with sessions. */
	freeLabel: string | null
	/** From tomorrow on, the day's Day Forecast; null today, before, or with none. */
	weather: CalmWeather | null
}

export type CalmWeek = {
	/**
	 * False only with no plan and nothing written this week: I dag then
	 * invites the athlete to the start instead of drawing an empty calendar.
	 */
	shown: boolean
	heading: string
	/** `2 av 5 økter gjort`; null for a week with nothing in it. */
	doneLine: string | null
	days: CalmDay[]
}

export type CalmToday = {
	topLine: {
		/** `lørdag 17. okt`. */
		dateLabel: string
		/** The plan's name; null with no plan. */
		planName: string | null
	}
	card: CalmCard
	/**
	 * No plan, yet the card is a session the athlete wrote: the start is still
	 * offered, beside it rather than instead of it.
	 */
	invite: boolean
	week: CalmWeek
	todayKey: string
	/** Today's Day Forecast, for the card; null with none. */
	cardWeather: CalmWeather | null
	/**
	 * Any weather on the page: the week's rows take their weather column and
	 * MET Norway is credited once. False is I dag exactly as without weather.
	 */
	weatherShown: boolean
}

export function buildCalmToday({
	season,
	ledger,
	now,
	timezone,
	activePlan,
	strengthCta,
	thresholds = {},
	weather = null,
}: {
	season: TimelineSeason
	ledger: readonly LedgerSession[]
	now: Date
	timezone: string
	activePlan: ActivePlan | null
	/** Today's runner link for a lift (`buildTodayRow`'s cta), by session. */
	strengthCta?: { sessionId: string; label: string; to: string } | null
	/** What an Effort Word reads an absolute pace, watts or bpm by (#617). */
	thresholds?: DisciplineThresholdMap
	/**
	 * The Day Forecasts the `/` loader read, by day (ADR 0112 §6): only the
	 * days that have one. Null or absent with no Home Place.
	 */
	weather?: Readonly<Record<string, DayForecast>> | null
}): CalmToday {
	const todayKey = season.todayKey
	const byId = new Map(ledger.map((session) => [session.id, session]))
	const toCalm = (session: TimelineSession, dayKey: string): CalmSession => {
		const source = byId.get(session.id)
		const entry = source
			? toSessionLedgerEntry(source, now, timezone, thresholds)
			: null
		const minutes = entry?.durationMin ?? null
		const effort = source ? readEffortWord(source.workout, thresholds) : null
		return {
			id: session.id,
			dayKey,
			to: session.to,
			title: session.title,
			discipline: session.discipline,
			disciplineLabel: session.disciplineLabel,
			status: session.status,
			// Minutes timed through a pace read `≈ 57 min`, as on the row (#638).
			durationLabel:
				minutes != null && minutes > 0
					? approxLabel(
							nbDurationLabel(Math.round(minutes) * 60),
							entry?.durationEstimated ?? false,
						)
					: null,
			effort,
			// A title that already says how hard (`Rolig løpetur`, `45 min
			// moderat`) is not told it again in another word beside it (#638).
			effortLabel:
				effort && !titleStatesEffort(session.title, effort)
					? L.effort[effort]
					: null,
			markDone: session.markDone,
		}
	}

	const thisWeek = season.weeks[season.todayWeekIndex]
	const weatherOf = (dayKey: string): CalmWeather | null => {
		const forecast = weather?.[dayKey]
		return forecast ? calmWeather(forecast, timezone) : null
	}
	const days: CalmDay[] = (thisWeek?.rows ?? []).map((day) =>
		calmDay(day, todayKey, toCalm, weatherOf),
	)
	const cardWeather = weatherOf(todayKey)
	const sessions = days.flatMap((day) => day.sessions)
	const done = sessions.filter((session) => session.status === 'completed')

	const later = season.weeks
		.flatMap((week) => week.rows)
		.filter((day) => day.key > todayKey)
	const nextAfter = (
		fromKey: string,
		say: (title: string, when: string) => string = L.next,
	): CalmNext | null => {
		for (const day of later) {
			if (day.key <= fromKey) continue
			const session = day.sessions.find((one) => one.status === 'planned')
			if (session) {
				return named(toCalm(session, day.key), {
					todayKey,
					weekEndKey: thisWeek?.rows.at(-1)?.key ?? todayKey,
					say,
				})
			}
		}
		return null
	}

	const today = days.find((day) => day.isToday)
	const planStartMonday = activePlan
		? weekMonday(new Date(activePlan.planStart), timezone)
		: null
	const card = ((): CalmCard => {
		if (planStartMonday && todayKey < planStartMonday) {
			return {
				kind: 'before-start',
				title: L.beforeStartTitle(dayName(planStartMonday)),
				first: nextAfter(addDays(planStartMonday, -1), L.firstSession),
			}
		}
		const open = today?.sessions.find(
			(session) => session.status !== 'completed',
		)
		if (open) {
			const source = byId.get(open.id)
			return {
				kind: 'session',
				session: open,
				sentence: sentenceOf(open, source),
				logTo:
					open.discipline === 'strength' && strengthCta?.sessionId === open.id
						? { label: strengthCta.label, to: strengthCta.to }
						: null,
			}
		}
		const doneToday = today?.sessions ?? []
		const next = nextAfter(todayKey)
		if (doneToday.length > 0) {
			return {
				kind: 'done',
				done: doneToday,
				line: L.doneLine(listOf(doneToday.map((session) => session.title))),
				next,
			}
		}
		if (!activePlan) return { kind: 'no-plan' }
		return { kind: 'free', next }
	})()

	return {
		topLine: {
			dateLabel: dayName(todayKey),
			planName: activePlan ? season.topLine.planLabel : null,
		},
		card,
		invite: !activePlan && card.kind !== 'no-plan',
		week: {
			shown: activePlan != null || sessions.length > 0,
			heading: L.weekHeading,
			doneLine:
				sessions.length > 0 ? L.weekDone(done.length, sessions.length) : null,
			days,
		},
		todayKey,
		cardWeather,
		weatherShown: cardWeather != null || days.some((day) => day.weather),
	}
}

function calmDay(
	day: TimelineDay,
	todayKey: string,
	toCalm: (session: TimelineSession, dayKey: string) => CalmSession,
	weatherOf: (dayKey: string) => CalmWeather | null,
): CalmDay {
	const sessions = day.sessions.map((session) => toCalm(session, day.key))
	return {
		key: day.key,
		weekdayLabel: day.dayLabel,
		dayOfMonth: day.dayOfMonth,
		dayName: dayName(day.key),
		isToday: day.isToday,
		past: day.key < todayKey,
		sessions,
		freeLabel:
			sessions.length > 0 ? null : day.restPrescribed ? L.restDay : L.free,
		// Today's weather is the card's; a past day has none.
		weather: day.key > todayKey ? weatherOf(day.key) : null,
	}
}

/** A Day Forecast in I dag's words, at its hour in the Athlete Timezone. */
function calmWeather(forecast: DayForecast, timezone: string): CalmWeather {
	const word = WEATHER_LABELS.symbol[forecast.symbol]
	const hour = localTimeOfDay(new Date(forecast.at), timezone).slice(0, 2)
	return {
		glyph: weatherGlyph(forecast.symbol, forecast.night),
		word,
		hourLabel: WEATHER_LABELS.hour(hour),
		temperatureLabel: WEATHER_LABELS.temperature(forecast.temperatureC),
		precipitationLabel: WEATHER_LABELS.precipitation(forecast.precipitationMm),
		spoken: WEATHER_LABELS.spoken({
			hour,
			word,
			celsius: forecast.temperatureC,
			mm: forecast.precipitationMm,
		}),
	}
}

/**
 * `mandag 19. okt` — a day key read as its own calendar day. The key is
 * already local, so it is formatted at its UTC noon in UTC: no zone can move
 * it across midnight.
 */
function dayName(dayKey: string): string {
	const noon = new Date(`${dayKey}T12:00:00Z`)
	return `${formatNbWeekday(noon, 'UTC')} ${formatNbDayMonth(noon, 'UTC')}`
}

function named(
	session: CalmSession,
	{
		todayKey,
		weekEndKey,
		say,
	}: {
		todayKey: string
		weekEndKey: string
		say: (title: string, when: string) => string
	},
): CalmNext {
	const noon = new Date(`${session.dayKey}T12:00:00Z`)
	const whenLabel =
		session.dayKey === addDays(todayKey, 1)
			? L.tomorrow
			: session.dayKey <= weekEndKey
				? formatNbWeekday(noon, 'UTC')
				: dayName(session.dayKey)
	const facts = [whenLabel, session.durationLabel].filter(Boolean).join(', ')
	return {
		id: session.id,
		title: session.title,
		whenLabel,
		line: say(session.title, facts),
	}
}

/**
 * The card's one sentence. The athlete's own note on the session wins (its
 * first sentence, so the card stays one line of instruction); otherwise the
 * Effort Word says how to hold it, and a lift says to take the sets.
 */
function sentenceOf(
	session: CalmSession,
	source: LedgerSession | undefined,
): string {
	const note = source?.workout?.description?.trim()
	if (note) return firstSentence(note)
	if (session.discipline === 'strength') return L.sentenceStrength
	if (session.effort) return L.sentence[session.effort]
	return L.sentencePlain
}

function firstSentence(text: string): string {
	const match = /^.*?[.!?](?=\s|$)/s.exec(text)
	return (match ? match[0] : text).replace(/\s+/g, ' ').trim()
}

/** `A`, `A og B`, `A, B og C`. */
function listOf(titles: string[]): string {
	if (titles.length <= 1) return titles[0] ?? ''
	return `${titles.slice(0, -1).join(', ')} og ${titles.at(-1)}`
}
