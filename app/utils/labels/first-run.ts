/**
 * The first run (#505 stories 61–71): the start draft, the Start Options, the
 * plan-ready step. Part of `labels.ts` (ADR 0081): import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { EffortWord } from '../effort-word.ts'
import type { FirstRunPlanRefusal } from '../first-run/first-run-schema.ts'
import type { FindingAbsence, HoursEstimate } from '../first-run/first-run.ts'
import type {
	SessionPreference,
	TrainingLevel,
} from '../first-run/start-draft.ts'
import type { LoadRecomputeKind } from '../load/recompute-notice.ts'
import type { Rhythm, VolumeCurrency } from '../plan-outline/derive.ts'
import type { PresetFamily } from '../plan-outline/presets.ts'
import type { ActivityKind } from '../simple-activity.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { nbJoin } from './_helpers.ts'
import { SIMPLE_ACTIVITY_LABELS, nbDurationLabel } from './i-dag.ts'
import { NB_VOLUME_UNITS, NB_WEEKDAY_LABELS } from './vocabulary.ts'

/** A number the Norwegian way: `6,5`, `1,5`. */
function nbNumber(value: number): string {
	return String(Math.round(value * 10) / 10).replace('.', ',')
}

/** `5:35` from seconds per kilometre. */
function paceClock(secPerKm: number): string {
	const total = Math.round(secPerKm)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Monday-first weekdays as a list: `tirsdag, torsdag og lørdag`. */
export function nbWeekdayList(days: readonly number[]): string {
	const names = days.map((day) => NB_WEEKDAY_LABELS[day] ?? '')
	if (names.length <= 1) return names.join('')
	return `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
}

/** Hours a week, Norwegian: `4 t`, `6,5 t`. */
export function nbHoursLabel(hours: number): string {
	return `${nbNumber(hours)} t`
}

/**
 * The hours estimate with its arithmetic shown (#505 story 65):
 * `43 km/uke à 5:35 ≈ 4 t`, and sport by sport where there are several —
 * `43 km/uke à 5:35 + 2 økter/uke à 1 t 15 min ≈ 6,5 t`.
 */
export function hoursEstimateLabel(estimate: HoursEstimate): string {
	const parts = estimate.parts.map((part) =>
		part.kind === 'pace'
			? `${part.kmPerWeek} km/uke à ${paceClock(part.paceSecPerKm)}`
			: `${nbNumber(part.sessionsPerWeek)} ${part.sessionsPerWeek === 1 ? 'økt' : 'økter'}/uke à ${nbDurationLabel(part.secondsPerSession)}`,
	)
	return `${parts.join(' + ')} ≈ ${nbHoursLabel(estimate.hours)}`
}

/** Why the history gave no number (#505 story 71), said on the start (#578). */
export const FINDING_ABSENCE_LABELS: Record<FindingAbsence, string> = {
	'not-connected':
		'Ikke målt · intervals.icu er ikke koblet til, og du har ikke logget økter her',
	importing: 'Ikke målt ennå · historikken hentes fortsatt fra intervals.icu',
	'no-sessions': 'Ikke målt · vi fant ingen økter de siste fire ukene',
	'no-duration': 'Ikke målt · øktene dine har ingen tid registrert',
	'only-strength':
		'Ikke målt · vi fant styrkeøkter, men ingen løping, sykling eller svømming',
}

/**
 * The shipped presets' phase names as the first run and I dag say them
 * (stories 19, 27, 66 and 70). Display only: the stored names stay as the
 * preset wrote them, so a plan made before this map still reads in Norwegian
 * and a phase the athlete named themselves reads as they wrote it.
 */
export const PRESET_PHASE_NAME_LABELS: Record<string, string> = {
	Base: 'Grunntrening',
	'Big base': 'Stor base',
	Build: 'Oppbygging',
	Peak: 'Spissing',
	Taper: 'Nedtrapping',
}

/** A phase's name in Norwegian where it is a preset's, else as written. */
export function nbPhaseName(name: string): string {
	return PRESET_PHASE_NAME_LABELS[name] ?? name
}

/** The start's shared words: the step count, the day pills, connecting. */
export const FIRST_RUN_LABELS = {
	stepOf: (step: number, of: number) => `Steg ${step} av ${of}`,
	/**
	 * The days as the start's day pills say them, Monday first (the Training
	 * Week's order); each pill is read out by its full name.
	 */
	dayShort: ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'],
	/** What a question left unanswered says. */
	messages: {
		daysRequired: 'Velg minst én dag',
	},
	/**
	 * Connecting intervals.icu from the start (#578): a quiet way from the
	 * level screen, never a step, and back to it.
	 */
	connect: {
		title: 'Koble til intervals.icu',
		intro:
			'Da kan vi lese de siste ukene dine og fylle ut timer og dager for deg. Vi henter bare fullførte økter.',
		keyLabel: 'API-nøkkel fra intervals.icu',
		keyHelp:
			'Du finner den i intervals.icu under Settings → Developer Settings.',
		submit: 'Koble til',
		connected: 'intervals.icu er koblet til.',
		next: 'Tilbake til start',
		skip: 'Ikke nå',
		skipConsequence:
			'Uten historikk bruker vi det som er vanlig for nivået ditt. Du kan koble til senere under Meg.',
		back: 'Tilbake til nivå og timer',
		emptyKey: 'Lim inn API-nøkkelen fra intervals.icu.',
		rejected:
			'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke – kopier den som gjelder nå.',
		unreachable: 'Vi fikk ikke kontakt med intervals.icu. Prøv igjen om litt.',
	},
	weeks: {
		/**
		 * Why the plan lays on fewer days than were chosen (`patternDaysFor`).
		 * The chosen days stay the athlete's availability.
		 */
		fewerDays: (chosen: number, used: number) =>
			`Du valgte ${chosen} dager. Planen bruker ${used}, så ingen økt blir kortere enn en halvtime.`,
	},
} as const

/** Why the first run's plan could not be made, said where it is refused. */
export const FIRST_RUN_REFUSAL_LABELS: Record<FirstRunPlanRefusal, string> = {
	'plan-already-active': 'Du har allerede en plan. Du finner den i Plan.',
	'nothing-to-lay':
		'Med disse svarene ble det ingen økter å legge. Velg minst én dag og noen timer i uka.',
	'option-unavailable':
		'Den måten å trene på finnes ikke for disse svarene. Velg en av dem som vises.',
}

/** `4,5 timer`, `1 time`: hours as a Norwegian reads them, comma and word. */
export function nbHoursWords(hours: number): string {
	return `${nbNumber(hours)} ${hours === 1 ? 'time' : 'timer'}`
}

/**
 * The simple start (#558 _Levende start_, #563): _Hvor er du nå?_ with the
 * hours, then _Hva liker du å trene?_ with the days, and _Uka di_ — the
 * **Week Sketch** — filling in beside them as the athlete answers.
 */
export const SIMPLE_START_LABELS = {
	title: 'Kom i gang',
	/** Each **Training Level**, with the one sentence that describes it. */
	levels: {
		beginner: {
			name: 'Nybegynner',
			description: 'Jeg er i gang, eller kommer tilbake etter en pause.',
		},
		recreational: {
			name: 'Mosjonist',
			description: 'Jeg trener jevnlig, to–tre ganger i uka.',
		},
		experienced: {
			name: 'Erfaren',
			description: 'Jeg har trent strukturert i flere år.',
		},
		competitive: {
			name: 'Konkurranse',
			description: 'Jeg trener mot resultater og tåler mye.',
		},
	} satisfies Record<TrainingLevel, { name: string; description: string }>,
	level: {
		title: 'Hvor er du nå?',
		legend: 'Nivå',
		hours: 'Omtrent hvor mye tid i uka?',
		fewer: 'Mindre tid',
		more: 'Mer tid',
		/** The hours' sentence at each end of the range (1–20). */
		atMin: 'Minst 1 time. Mindre enn det blir ingen plan.',
		atMax: 'Høyst 20 timer i uka. Mer enn det lager vi ikke plan for.',
		/** Between the ends: where the number came from. */
		typical: {
			beginner: 'Vanlig for en nybegynner.',
			recreational: 'Vanlig for en mosjonist.',
			experienced: 'Vanlig for en som har trent i flere år.',
			competitive: 'Vanlig for en som trener mot konkurranser.',
		} satisfies Record<TrainingLevel, string>,
		/** The hours are what the athlete trains now (ADR 0091 §3). */
		meaning: 'Det du trener nå. Planen starter der og bygger seg opp.',
		next: 'Neste',
	},
	activities: {
		title: 'Hva liker du å trene?',
		sport: 'Hovedidrett',
		sportHelp: 'Planen bygges rundt denne idretten.',
		days: 'Hvilke dager kan du trene?',
		/** How many days are picked, and that they are a limit. */
		daysPicked: (days: number) =>
			days === 0
				? 'Ingen dager valgt ennå.'
				: `${days} ${days === 1 ? 'dag' : 'dager'}. Vi legger aldri inn mer enn du har tid til.`,
		/** A _Nybegynner_ with more days than four (the level's session cap). */
		beginnerCap: (cap: number) =>
			`Som nybegynner får du høyst ${cap} økter i uka. Vi velger dagene som gir mest hvile mellom.`,
		/** Seven days: one stays free (`MAX_SESSION_DAYS`). */
		restDay: 'Alle sju dager er valgt. Vi holder én dag fri, så du får hvile.',
		next: 'Neste',
		/** Several endurance sports (#573): every one picked, and the main one. */
		sports: 'Utholdenhetsidretter',
		sportsHelp:
			'Velg så mange du vil. Den første du velger, blir hovedidretten.',
		mainSportLead: 'Hovedidrett:',
		/** The line as a button, where another picked sport can take over. */
		switchMainSport: (sport: string, next: string) =>
			`Hovedidrett: ${sport}. Bytt til ${next}`,
		switchHint: 'Bytt',
		/**
		 * One list of everything the athlete can pick (#584, the prototype's
		 * chips): the sports, the Simple Activities and _Styrke_.
		 */
		list: 'Aktiviteter',
		listHelp:
			'Velg så mange du vil. Den første utholdenhetsidretten du velger, blir hovedidretten.',
	},
	/** _Uka di_: the live week (story 26–29). */
	sketch: {
		title: 'Uka di',
		empty: 'Uka di er tom ennå',
		hint: 'Svarene dine blir til en uke her.',
		summary: (sessions: number, duration: string) =>
			`${sessions} ${sessions === 1 ? 'økt' : 'økter'} · ${duration}`,
		free: 'fri',
		/** A day as a screen reader hears it: `mandag: Rolig økt · Løping, 45 min`. */
		day: (weekday: string, what: string) => `${weekday}: ${what}`,
		session: (title: string, duration: string) => `${title}, ${duration}`,
		/** A lifting day as a screen reader hears it, by its session. */
		lifting: (title: string) => `styrke: ${title}`,
	},
	/**
	 * _Styrke_ on the activities screen (#574, ADR 0103): the chip, and the
	 * one tap it asks for — strength sessions a week, pre-set and the
	 * athlete's own answer.
	 */
	strength: {
		chip: 'Styrke',
		chipLabel: 'Styrke i tillegg',
		legend: 'Styrkeøkter i uka',
		choiceLabel: (count: number) =>
			`${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka`,
		/** Where the pre-set came from, said once. */
		fromHistory: (count: number) =>
			`Satt fra treningen din: du har løftet omtrent ${count} ${count === 1 ? 'gang' : 'ganger'} i uka.`,
		fromLevel: 'Vanlig for nivået ditt. Velg det som passer deg.',
		/** How the hours count strength (#558 story 73). */
		notInHours:
			'Styrke kommer i tillegg til timene, på dager uten harde økter.',
	},
	backTo: {
		level: 'Tilbake til nivå og timer',
		activities: 'Tilbake til hva du liker å trene',
	},
	messages: {
		levelRequired: 'Velg hvor du er nå',
		hoursRequired: 'Velg hvor mye tid du har i uka',
		hoursMin: 'Minst 1 time i uka',
		hoursMax: 'Høyst 20 timer i uka',
		hoursStep: 'Timene går i halve timer',
		disciplineRequired: 'Velg en idrett',
		strengthRequired: 'Velg 1, 2 eller 3 styrkeøkter i uka',
	},
} as const

/**
 * The athlete's history on the start's first screen (#578): where the hours
 * and days came from, the arithmetic behind a disclosure, the import still on
 * its way, and the two quiet ways out — connecting intervals.icu, and setting
 * the season up yourself.
 */
export const START_HISTORY_LABELS = {
	/** `Fra de siste fire ukene dine: 4 timer i uka, tirsdag og lørdag.` */
	fromHistory: (hours: string | null, days: string | null) =>
		`Fra de siste fire ukene dine: ${[hours ? `${hours} i uka` : null, days]
			.filter(Boolean)
			.join(', ')}.`,
	/** The history read, but it gave no hours: why, and what stands instead. */
	noHours: (reason: string) =>
		`${reason}. Vi bruker det som er vanlig for nivået ditt.`,
	importing:
		'Historikken din hentes fortsatt fra intervals.icu. Til den er her, bruker vi det som er vanlig for nivået ditt.',
	/** The arithmetic's disclosure, and its one line. */
	arithmetic: 'Slik regnet vi',
	arithmeticNote:
		'Snittet av de fire siste hele ukene, rundet til en halvtime.',
	connect:
		'Har du intervals.icu? Koble til, så henter vi treningen din derfra.',
	selfSetUp: 'Jeg vil heller sette opp sesongen selv',
} as const

/**
 * _Hva slags økter liker du?_ (#558, #571): the **Session Preferences**, the
 * start's fourth question, which orders the **Start Options**; and where _Meg_
 * shows and changes them with the **Training Level**.
 */
export const SESSION_PREFERENCE_LABELS = {
	title: 'Hva slags økter liker du?',
	intro:
		'Vi bruker svaret til å velge hvilken måte å trene på du ser først. Velg så mange du vil.',
	legend: 'Økter du liker',
	/** Each preference, with the one line that says what it means. */
	options: {
		long: {
			name: 'Lange, rolige turer',
			description: 'Tid i beina, i et tempo der du kan prate.',
		},
		intervals: {
			name: 'Korte, harde intervaller',
			description: 'Få minutter der det virkelig går unna.',
		},
		threshold: {
			name: 'Jevnt hardt',
			description: 'Lengre drag der du jobber kontrollert hardt.',
		},
		short: {
			name: 'Korte økter',
			description: 'Høyst 45 minutter på hverdager.',
		},
		surprise: {
			name: 'Overrask meg',
			description: 'Bland gjerne, jeg liker variasjon.',
		},
	} satisfies Record<SessionPreference, { name: string; description: string }>,
	/** The way on: with something picked, or the skip (story 23). */
	next: (picked: number) =>
		picked > 0 ? 'Vis måtene å trene på' : 'Hopp over',
	back: 'Tilbake til hva du liker å trene',
	/** From the Start Options, back to this question. */
	backHere: 'Tilbake til hva slags økter du liker',
	/** _Korte økter_ with _Lange, rolige turer_: how the two are met (story 24). */
	shortAndLong:
		'Du liker både korte økter og lange turer: hverdagsøktene blir høyst 45 minutter, og langturen får bli lang.',
	/** Week 1 short of the hours because of _Korte økter_ (ADR 0102 §4). */
	shortOfHours: (planned: string, hours: string) =>
		`Uka blir ${planned}, ikke ${hours}: du valgte korte økter, så ingen økt på en hverdag er over 45 minutter.`,
	/** The preferences as one line: `Korte økter, Jevnt hardt`. */
	list: (names: readonly string[]) =>
		names.length === 0 ? 'Ingen valgt' : names.join(', '),
	/** _Meg_'s page for the start's answers. */
	meg: {
		title: 'Nivå og økter',
		/** The row on Meg: `Mosjonist · Korte økter`. */
		row: (level: string | null, preferences: string) =>
			`${level ?? 'Nivå ikke valgt'} · ${preferences}`,
		intro:
			'Det du svarte da planen ble laget. Endrer du her, endres ikke uka som ligger. Det brukes neste gang du velger en måte å trene på.',
		level: 'Nivå',
		activities: 'Aktiviteter',
		activitiesNone: 'Ingen plan ennå, så ingen aktiviteter.',
		activitiesNote:
			'Idrettene planen din har spor for. Du legger til og fjerner dem i Plan, under Avansert.',
		activitiesLink: 'Endre aktiviteter i Plan',
		save: 'Lagre',
		saved: 'Nivå og økter er lagret.',
	},
} as const

/** Months in full, as the start says a date: `19. oktober`. */
const NB_MONTHS_LONG = [
	'januar',
	'februar',
	'mars',
	'april',
	'mai',
	'juni',
	'juli',
	'august',
	'september',
	'oktober',
	'november',
	'desember',
] as const

/** `mandag 19. oktober`: a calendar day (`YYYY-MM-DD`), weekday and all. */
export function nbLongDay(dayKey: string): string {
	const [year, month, day] = dayKey.split('-').map(Number) as [
		number,
		number,
		number,
	]
	const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
	return `${NB_WEEKDAY_LABELS[weekday]} ${day}. ${NB_MONTHS_LONG[month - 1]}`
}

/** The families the start offers, each with its plain name. */
type StartFamily = Exclude<PresetFamily, 'masters'>

/**
 * _Tre måter å trene på_ (#558, #566): the **Start Options**, each a card led
 * by a plain name with the family's name small, and _Velg denne_.
 */
export const START_OPTION_LABELS = {
	metaTitle: 'Tre måter å trene på',
	/** The heading says how many ways there are once identical ones merged. */
	title: (count: number) =>
		count >= 3
			? 'Tre måter å trene på'
			: count === 2
				? 'To måter å trene på'
				: 'Én måte å trene på',
	intro: (count: number, hours: string, days: number) =>
		`${count === 1 ? 'Det er' : 'Hver er'} en ekte første uke med ${hours} på ${days} ${days === 1 ? 'dag' : 'dager'}.`,
	/** Why there are fewer than three (ADR 0102 §2). */
	merged: (shown: number) =>
		shown === 1
			? 'Med disse svarene la alle måtene nøyaktig samme uke, så du ser bare én.'
			: 'Med disse svarene la to av måtene nøyaktig samme uke, så du ser bare to.',
	/** Each family's plain name and why, the way variant A wrote them. */
	plain: {
		polarized: {
			name: 'Mest rolig, litt veldig hardt',
			why: 'Nesten alt går rolig. Av og til går det skikkelig hardt. Gir mye form for lite slitasje.',
		},
		threshold: {
			name: 'Jevnt og kontrollert hardt',
			why: 'Økter der du jobber jevnt hardt i lengre drag. Effektivt når tiden er knapp.',
		},
		classic: {
			name: 'Variert og bygger seg opp',
			why: 'Litt av alt. Tre uker blir gradvis tyngre, den fjerde er lett så kroppen tar igjen.',
		},
		'big-base': {
			name: 'Bygg grunnform først',
			why: 'Bare rolig trening i starten, så blir det hardere. Trygt når du starter opp.',
		},
	} satisfies Record<StartFamily, { name: string; why: string }>,
	familyName: (name: string) => `Fagnavn: ${name}`,
	badge: {
		'best-fit': 'Passer deg best',
		level: 'Anbefalt for nivået ditt',
	},
	/** A session's Effort Word: never a Training Zone. */
	effort: {
		rolig: 'rolig',
		middels: 'middels',
		hard: 'hard',
	} satisfies Record<EffortWord, string>,
	/** The bar of easy, middling and hard time, for a screen reader. */
	effortBar: (easy: number, moderate: number, hard: number) =>
		`${easy} % rolig, ${moderate} % middels, ${hard} % hard`,
	total: (duration: string) => `${duration} i uka`,
	sessions: (count: number) => `${count} ${count === 1 ? 'økt' : 'økter'}`,
	hardSessions: (count: number) => `${count} ${count === 1 ? 'hard' : 'harde'}`,
	free: 'fri',
	/** A session's facts on its row: `45 min · rolig`. */
	sessionFacts: (duration: string, effort: string) => `${duration} · ${effort}`,
	/** Week 1 short of the hours given (ADR 0102 §4), with the reason. */
	shortOfHours: (planned: string, hours: string) =>
		`Uka blir ${planned}, ikke ${hours}: øktene kan ikke bli lengre på dagene du valgte.`,
	startsOn: (day: string) => `Planen starter ${day}.`,
	/** Strength beside the hours, never in them (#574): `+2 styrkeøkter`. */
	plusStrength: (count: number) =>
		`+${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'}`,
	/** The strength frequency on the card, as the athlete's own answer. */
	strengthChoice: (count: number) =>
		`Styrke ${count} ${count === 1 ? 'gang' : 'ganger'} i uka, som du valgte.`,
	/** A _Nybegynner_'s lifts count in the session cap, so endurance got fewer. */
	strengthTakesDays: (cap: number, endurance: number) =>
		`Som nybegynner får du høyst ${cap} økter i uka, styrke medregnet, så utholdenheten får ${endurance}.`,
	/** Fewer lifting days than tapped: there were not more days. */
	strengthFewer: (laid: number, chosen: number) =>
		`Du valgte ${chosen} styrkeøkter. Dagene dine ga plass til ${laid}.`,
	choose: 'Velg denne',
	/** _Velg denne_ as a screen reader hears it, with the card's name. */
	chooseLabel: (name: string) => `Velg denne: ${name}`,
	rail: 'Måtene å trene på',
	railRole: 'karusell',
	cardRole: 'måte',
	card: (index: number, count: number, name: string) =>
		`${index} av ${count}: ${name}`,
	pager: 'Bla mellom måtene',
	dot: (index: number, count: number, name: string) =>
		`Vis ${index} av ${count}: ${name}`,
	back: 'Tilbake til hva du liker å trene',
	/** Sports picked that the week has no day for (#573), lower case. */
	sportsLeftOut: (sessions: number, sports: readonly string[]) =>
		`Uka har plass til ${sessions} ${sessions === 1 ? 'økt' : 'økter'}, så ${
			sports.length <= 1
				? sports.join('')
				: `${sports.slice(0, -1).join(', ')} og ${sports.at(-1)}`
		} fikk ikke egne dager. Velg flere dager, mer tid eller færre idretter.`,
} as const

/**
 * _Planen er klar_ (#558, #570): what _Velg denne_ made, by its plain name,
 * the day it begins, 12 weeks of hours, how it moves each Sunday, and _Under
 * panseret_ — a read-only view of everything that was written.
 */
export const PLAN_READY_LABELS = {
	metaTitle: 'Planen er klar',
	overline: 'Planen er klar',
	startsOn: (day: string) => `Planen starter ${day}.`,
	curveTitle: 'Timer i uka, de neste 12 ukene',
	/** The curve as a screen reader hears it. */
	curveName: (laid: number, projected: number) =>
		`Timer i uka: ${laid} uker som planen er lagt, så ${projected} uker hvis du trener som planlagt. De lette ukene er de lave søylene.`,
	curveCaption: 'Timer i uka, uke for uke',
	track: 'Timer',
	/** The lighter bars: ADR 0079's next rounds, if every week is done to plan. */
	ifAsPlanned: 'hvis du trener som planlagt',
	/** The chart's legend (#584): the round as laid, then the projection. */
	legendLaid: 'Lagt',
	legendProjected: 'Hvis du trener som planlagt',
	/** The step each projected round takes, under the 8 % guard. */
	note: (percent: number) =>
		percent > 0
			? `De neste blokkene får ${percent} % mer per blokk hvis du trener som planlagt.`
			: 'De neste blokkene holder samme nivå, fordi planen allerede bygger så raskt den kan.',
	/** How the plan moves (story 49): the autopilot, undo and _Spør meg først_. */
	sunday:
		'Hver søndag kveld legger appen ut neste uke, ut fra det du faktisk trente. Du får beskjed om hva den gjorde, og kan angre. Vil du heller at den spør deg først, velger du Spør meg først i Meg.',
	hood: {
		title: 'Under panseret',
		intro:
			'Dette er det appen laget av svarene dine. Den bruker det hver gang en ny uke legges ut. Du trenger aldri å se det, men det ligger her.',
		family: 'Filosofi',
		length: 'Lengde',
		openEnded: 'Åpen, uten løp og uten sluttdato. Den går blokk for blokk.',
		race: (name: string, day: string) => `Mot ${name}, ${day}.`,
		rhythm: 'Rytme',
		rhythms: {
			'3:1': '3 uker som bygger, så 1 lett',
			'2:1': '2 uker som bygger, så 1 lett',
			none: 'Ingen lett uke',
		} satisfies Record<Rhythm, string>,
		tracks: 'Spor',
		/** `Løping, starter på 3 t/uke`: a track and its Season Anchor. */
		track: (name: string, start: string | null) =>
			start == null ? name : `${name}, starter på ${start}`,
		level: 'Nivå',
		/** The Strength Frequency answer (#574, ADR 0103). */
		strength: 'Styrke',
		strengthPerWeek: (count: number) =>
			`${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka`,
		/** The Session Preferences, each by its own name (#571). */
		preferences: 'Økter du liker',
		pattern: 'Ukemønster',
		free: 'fri',
		/** A share day: `Løping · andel, vekt 1,5`. */
		shareDay: (track: string, weight: number) =>
			`${track} · andel, vekt ${nbNumber(weight)}`,
		fixedDay: (track: string, title: string) => `${track} · ${title}`,
		weeks: 'Timer per uke i blokka som er lagt',
		/** `uke 43`. */
		week: (number: number) => `uke ${number}`,
		easy: 'lett uke',
	},
	toToday: 'Til I dag',
} as const

/**
 * The **Simple Activities** in the simple start (#572): the chips, what they
 * are, the week laid from them alone, and _Fikk ikke plass_.
 */
export const START_SIMPLE_ACTIVITY_LABELS = {
	legend: 'Andre aktiviteter',
	help: 'Planlagt med tid og innsats. Teller i ukas timer.',
	nothingPicked: 'Velg en idrett eller en aktivitet',
	/** Story 16: no modelled endurance sport, so one simple week. */
	simpleOnly:
		'Uten en utholdenhetsidrett blir det én enkel uke med øktene spredt ut, ikke flere å velge mellom.',
	/** Story 41: what did not fit week 1, and what would make room. */
	notFitted: (kinds: readonly ActivityKind[], room: 'days' | 'hours') => {
		const names = nbJoin(
			kinds.map((kind) => SIMPLE_ACTIVITY_LABELS.kind[kind].toLowerCase()),
		)
		const them = kinds.length === 1 ? 'den' : 'de'
		return room === 'days'
			? `Fikk ikke plass denne uka: ${names}. Velg en dag til, så kommer ${them} med.`
			: `Fikk ikke plass denne uka: ${names}. Gi uka mer tid, så kommer ${them} med.`
	},
	/** The one hours Training Track the Simple Activities share, on `other`. */
	track: 'Enkle aktiviteter',
} as const

/**
 * What one session does to its week, in the track's unit (#505 stories 37 and
 * 39) — the preview under the writing line and the toast after a change.
 */
export const WEEK_SUM_LABELS = {
	unit: (currency: VolumeCurrency) => NB_VOLUME_UNITS[currency],
	targetStands: (target: string) => `målet står på ${target}`,
	targetStayed: (target: string) => `Ukemålet står på ${target}.`,
	noTargetPreview: 'uka har ikke noe ukemål',
	noTargetChange: 'Uka har ikke noe ukemål.',
	pricedOnSave: (currency: VolumeCurrency) =>
		`${NB_VOLUME_UNITS[currency]} regnes ut når økta er lagret`,
	annetPreview: 'Teller i Annet — ingen ukesum flytter seg',
	noPlanPreview: 'Ingen plan, så ikke noe ukemål å regne mot',
	noPlanChange: (change: 'added' | 'removed') =>
		change === 'added'
			? 'Økta er lagt inn. Uten plan er det ikke noe ukemål.'
			: 'Økta er fjernet. Uten plan er det ikke noe ukemål.',
	annetChange: (change: 'added' | 'removed') =>
		change === 'added'
			? 'Økta teller i Annet. Ingen ukesum flyttet seg.'
			: 'Økta talte i Annet. Ingen ukesum flyttet seg.',
} as const

/** The Load Recompute Notice on I dag (ADR 0046 §2). */
export const RECOMPUTE_NOTICE_LABELS = {
	/**
	 * Each correction's kicker and explanation, written together, so a `kind`
	 * can never inherit another's headline.
	 *
	 * The explanation deliberately does **not** point the athlete at the
	 * discipline mix as the honest home for their strength load. The mix is a
	 * share-of-total surface that still prices a strength slice against
	 * endurance TSS — the same defect one surface over, and its own open ruling.
	 * Copy that sent readers there would be vouching for a number this change
	 * hasn't fixed.
	 */
	copy: {
		'strength-left-the-triad': {
			kicker: 'Kondisjonen er regnet ut på nytt',
			explanation:
				'Styrkeøkter teller ikke lenger med i kondisjon, tretthet og form. Det finnes ingen ærlig måte å prise en styrkeøkt i samme enhet som en utholdenhetsøkt, så de tre tallene gjelder nå bare utholdenhet — og sier det. Treningen din er den samme; det som er endret, er hva tallene påstår å måle.',
		},
	} satisfies Record<
		LoadRecomputeKind,
		{ kicker: string; explanation: string }
	>,
	movement: (drop: string, before: string, after: string) =>
		`Kondisjonen falt med opptil ${drop} — ${before} → ${after} på det meste`,
	gotIt: 'Skjønner',
} as const
