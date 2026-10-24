/**
 * I dag, the home surface (#505, ADR 0081, ADR 0082): the week model, the
 * season strip, the home list's rows, hero, caps and panes, and the full Home
 * Timeline. Part of `labels.ts` (ADR 0081): import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { EffortWord } from '../effort-word.ts'
import type { AdherenceTone } from '../load/adherence.ts'
import type { ReadinessTone } from '../load/readiness.ts'
import type { PlannedDiscipline } from '../planned-discipline.ts'
import type { ActivityKind } from '../simple-activity.ts'
import type { Discipline } from '../workout-schema.ts'
import type { SentenceProblem, UnreadReason } from '../workout-sentence.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { WEEK_FIGURE_LABELS } from './vocabulary.ts'

// ---------------------------------------------------------------------------
// I dag: the home week model and the season strip (#505 stories 16–31, 60)
// ---------------------------------------------------------------------------

/**
 * A Training Track's name in a week header: `Løping · mål 46 · planlagt 44 ·
 * gjort 35 km`. The sport, in the #505 surfaces' Norwegian (ADR 0081).
 */
export const NB_DISCIPLINE_LABELS: Record<Discipline, string> = {
	run: 'Løping',
	bike: 'Sykling',
	swim: 'Svømming',
	strength: 'Styrke',
}

/**
 * A planned discipline's name: the sport, or _Enkel aktivitet_ for `other`
 * — never the stored id.
 */
export function nbPlannedDisciplineLabel(
	discipline: PlannedDiscipline,
): string {
	return discipline === 'other'
		? SIMPLE_ACTIVITY_LABELS.noun
		: NB_DISCIPLINE_LABELS[discipline]
}

/**
 * A week named the way the athlete names it (#505, idea D): the three weeks
 * around today by where they sit, every other week by its number.
 */
export const RELATIVE_WEEK_LABELS = {
	previous: 'Forrige uke',
	current: 'Denne uka',
	next: 'Neste uke',
} as const

/** `Uke 41` — an ISO week number, as a Norwegian calendar prints it. */
export function weekNumberLabel(weekNumber: number): string {
	return `Uke ${weekNumber}`
}

/** A week before the plan began: history the athlete brought with them. */
export const BEFORE_PLAN_LABEL = 'før planen'

/** What the `≠` mark means, for the reader who cannot see it. */
export const DRIFT_MARK_LABEL = 'planlagt er mer enn 10 % unna målet'

/** `1 av 2 økter` — a strength week's sessions against its Strength Frequency. */
export function sessionsAgainstLabel(done: number, of: number): string {
	return `${done} av ${of} ${of === 1 ? 'økt' : 'økter'}`
}

/** `snitt 5:00 /km` — the week's running pace, from its completed runs. */
export function averagePaceLabel(pace: string): string {
	return `snitt ${pace}`
}

/**
 * `rolig 78 % · plan 80 %` — the easy share of a week's zone split, done
 * against the plan's intention (story 21). Either side may be missing.
 */
export function easyShareLabel(
	done: string | null,
	planned: string | null,
): string {
	return [done ? `rolig ${done}` : null, planned ? `plan ${planned}` : null]
		.filter((part): part is string => part != null)
		.join(' · ')
}

/**
 * A week's zone split, one side of it (#505 story 21, the skier's header):
 * `gjort Z2 75 % · Z4 25 %`, or `plan Z2 86 % · Z4 14 %` for what the plan
 * prescribes — said beside {@link ZONE_INTENT_NOTE}, since a prescription is
 * an intention and not a measurement. `parts` are already formatted.
 */
export function zoneSplitLabel(
	side: 'done' | 'planned',
	parts: ReadonlyArray<{ zone: number; share: string }>,
): string {
	return `${side === 'done' ? WEEK_FIGURE_LABELS.done : 'plan'} ${parts
		.map((part) => `Z${part.zone} ${part.share}`)
		.join(' · ')}`
}

/**
 * A week's load line where it has no Training Track to be read in — before
 * the plan, or with no plan at all. Counts and TSS only.
 */
export const WEEK_LOAD_LABELS = {
	nothingWritten: 'Ingenting lagt inn',
	nothingLogged: 'Ingenting logget',
} as const

/**
 * The week header's disclosure (#505 polish): the facts that qualify a week's
 * numbers but are not them — why a track is not graded, pace, the easy share,
 * the zone split, Annet — behind the week's summary line instead of under it.
 */
export const WEEK_DETAIL_LABELS = {
	/** Said after the summary, for a screen reader and as the icon's name. */
	more: 'mer om uka',
	/** The popover's title: `Denne uka · 5.–11. okt`. */
	title: (week: string, range: string) => `${week} · ${range}`,
	/** Where a week has no summary line to hang the disclosure on. */
	trigger: 'Mer om uka',
} as const

/** `2 av 5 gjort` — the sessions of a week that has begun. */
export function sessionsDoneLabel(done: number, total: number): string {
	return `${done} av ${total} gjort`
}

/** `3 økter` / `1 økt`. */
export function sessionCountLabel(count: number): string {
	return `${count} ${count === 1 ? 'økt' : 'økter'}`
}

/** `1 ikke gjort` — the missed sessions of a week. */
export function missedCountLabel(count: number): string {
	return `${count} ikke gjort`
}

/**
 * A week past the Planning Horizon (#505 story 27): when the week change will
 * fill it — the Sunday-evening close of the week two before it
 * (`horizonWeekKey`), stated as the time it happens.
 */
export function horizonFillLabel(closesWeekNumber: number): string {
	return `fylles søndag kveld i uke ${closesWeekNumber}`
}

/**
 * The divider above the first week past the Planning Horizon (ADR 0086):
 * `Horisont · herfra bare mål, ingen økter ennå`. Past it the weeks are whole
 * calendar weeks with empty days; what they carry is a target, not sessions.
 * With no plan the only weeks past it are far ones, and it says that instead.
 */
export const HORIZON_LABELS = {
	name: 'Horisont',
	plan: 'herfra bare mål, ingen økter ennå',
	far: 'herfra bare øktene du skriver selv',
} as const

/** A week past the horizon of a plan with no Week Pattern to fill it from. */
export const NOT_FILLED_LABEL = 'ingen økter lagt inn ennå'

/**
 * A week far ahead, past any plan (#505 story 40): the app fills nothing
 * there, so it shows only the sessions the athlete wrote into it.
 */
export const FAR_WEEK_LABEL = 'langt fram · bare øktene du skriver selv'

/** The season strip (#505 stories 17–18, 26). */
export const SEASON_STRIP_LABELS = {
	title: 'Sesongen',
	region: 'Sesongen, uke for uke',
	today: 'I dag',
	/**
	 * The pill's accessible name: a verb, so it never collides with the hero's
	 * "I dag" pane dot, and with the way back in it once today is off-screen —
	 * the arrow a sighted reader gets, said in words.
	 */
	todayName: 'Gå til i dag',
	todayNameUp: 'Gå opp til i dag',
	todayNameDown: 'Gå ned til i dag',
	/** The pill, when today is off-screen above or below. */
	todayUp: '↑ I dag',
	todayDown: '↓ I dag',
	noFigure: 'ingen tall',
	/** A week the plan has not filled yet: its bar is the target, dashed. */
	unfilled: 'bare mål',
	/** The race week's flag, in the week's name. */
	event: (name: string) => `⚑ ${name}`,
	/**
	 * The strip's window on a season too long for the width (S10): how many
	 * weeks lie beyond each edge, and the buttons that step the window there.
	 */
	earlier: (weeks: number) => `${weeks} uker før`,
	later: (weeks: number) => `${weeks} uker etter`,
	earlierName: (weeks: number) => `Vis ${weeks} tidligere uker`,
	laterName: (weeks: number) => `Vis ${weeks} senere uker`,
} as const

/** A sessions-only week in the strip, where no Training Track reads it. */
export function stripTssLabel(tss: string): string {
	return `${tss} TSS`
}

/**
 * Which track a session counts in, as a row action (#505 story 33): a session
 * the athlete put in Annet counts in nothing, and goes back on the same tap.
 */
export const ANNET_ACTION_LABELS = {
	toAnnet: 'Tell i Annet',
	toTrack: 'Tell i sporet',
	/** The chip a session the athlete put in Annet carries. */
	chip: 'Annet',
	notFound: 'Fant ikke økta. Den kan være slettet.',
} as const

// ---------------------------------------------------------------------------
// I dag, the whole surface (#505, ADR 0081 §1 and ADR 0082): the home list,
// its rows, the hero, the caps and the strip read in Norwegian, so no English
// word sits beside a Norwegian one on the screen the athlete opens daily.
// ---------------------------------------------------------------------------

/** Months as a Norwegian calendar abbreviates them: `28. sep`. */
export const NB_MONTHS_SHORT = [
	'jan',
	'feb',
	'mar',
	'apr',
	'mai',
	'jun',
	'jul',
	'aug',
	'sep',
	'okt',
	'nov',
	'des',
] as const

/** Weekdays, Monday first, the way a day gutter prints them: `ons`. */
export const NB_WEEKDAYS_SHORT = [
	'man',
	'tir',
	'ons',
	'tor',
	'fre',
	'lør',
	'søn',
] as const

/** `av` — the word between two figures: `35 av 46 km`. */
export const OF_WORD = 'av'

/** A sport's name, with a fallback for an import-only activity (ADR 0015). */
export function nbDisciplineLabel(discipline: string): string {
	return (
		(NB_DISCIPLINE_LABELS as Record<string, string>)[discipline] ??
		'Annen aktivitet'
	)
}

/**
 * A **Simple Activity** (ADR 0015 §A, #567): its Activity Kind, its Effort
 * Word and the numbers it does not carry. Every one of those is _ikke målt_
 * with the same reason, never a number (spec #558 story 63).
 */
export const SIMPLE_ACTIVITY_LABELS = {
	/** The UI word for the thing itself. */
	noun: 'Enkel aktivitet',
	kind: {
		'cross-country-ski': 'Langrenn',
		hike: 'Fjelltur',
		climb: 'Klatring',
		'yoga-mobility': 'Yoga og bevegelighet',
	} satisfies Record<ActivityKind, string>,
	/** The Effort Word as a row and the detail page say it. Never a zone. */
	effort: {
		rolig: 'Rolig',
		middels: 'Middels',
		hard: 'Hard',
	} satisfies Record<EffortWord, string>,
	/** The heading over the numbers it does not carry. */
	notMeasuredHeading: 'Ikke målt',
	notMeasured: 'ikke målt',
	/** Why, said once under the list. */
	notMeasuredReason:
		'En enkel aktivitet har bare tid og innsats. Soner, fart, watt og belastning kan ikke måles for den ennå, så de står uten tall.',
	/** The numbers withheld, in the order the page lists them. */
	metrics: {
		zones: 'Soner',
		pace: 'Fart',
		power: 'Watt',
		plannedTss: 'Planlagt TSS',
		trainingLoad: 'Treningsbelastning',
	},
	/**
	 * Under "hva var dette?" for an import on `other` on a day with a planned
	 * Simple Activity: the app never links one itself (story 66).
	 */
	linkQuestionNote:
		'Appen kobler ikke enkle aktiviteter selv. Si fra om det var denne.',
} as const

/**
 * What a session with no title of its own is called: `Løpeøkt`, `Sykkeløkt` —
 * an untitled plan session, or a recording that arrived with no workout.
 */
export function nbSessionNoun(discipline: string): string {
	return (
		(
			{
				run: 'Løpeøkt',
				bike: 'Sykkeløkt',
				swim: 'Svømmeøkt',
				strength: 'Styrkeøkt',
			} as Record<string, string>
		)[discipline] ?? 'Økt'
	)
}

/** `5×5` where every set agrees on its reps, otherwise `3 sett`. */
export function liftSchemeLabel(sets: number, reps: number | null): string {
	return reps != null ? `${sets}×${reps}` : `${sets} sett`
}

/** The empty day, the rest day and the row's own words. */
export const DAY_ROW_LABELS = {
	addWorkout: 'Legg inn en økt',
	/** Today's row with nothing on it: it still says so (ADR 0086). */
	nothingToday: 'Ingenting i dag',
	/** A day with nothing on it, as variant P writes it: free to write into. */
	free: 'fri',
	addWorkoutOn: (day: string) => `Legg inn en økt ${day}`,
	restDay: 'Hviledag',
	restDayOn: (day: string) => `Hviledag — ${day}`,
	restDayNote: 'Planen ber ikke om noe i dag.',
	open: 'Åpne',
	missedMark: (discipline: string) => `${discipline} — ikke gjort`,
	planStart:
		'Alt over denne linja er trening du hadde med deg — ingen plan å holde den opp mot.',
} as const

/**
 * What a session row says on its two lines and its chips. Sentence case, in
 * the muted footnote the row's facts are set in (#505 polish): the chips were
 * capitals (`I DAG · IKKE GJORT ENNÅ`), which shouted in a list of quiet facts
 * and, on today's row, repeated what its tint, its circled date and `Se økta`
 * already say.
 */
export const ROW_LABELS = {
	todayNotDone: 'I dag · ikke gjort ennå',
	missed: 'Ikke gjort',
	unplanned: 'Utenfor planen · ingen plan å sammenligne med',
	nothingRecorded: 'Ingenting registrert',
	nothingLogged: 'Ingen sett logget',
	planned: (what: string) => `${what} planlagt`,
	perSide: 'per side',
	distanceAt: (distance: string, pace: string) => `${distance} i ${pace}`,
	hrCeiling: (bpm: number) => `under ${bpm} bpm`,
	sets: (count: number) => `${count} sett`,
	setsChip: (logged: number, prescribed: number) =>
		`SETT ${logged} / ${prescribed}`,
	srpe: (load: string) => `sRPE ${load} — fra tid og innsats, ikke fra settene`,
} as const

/** A session's TSS band on its chip: `TSS 88 / 91 · I RUTE`. */
export const NB_ADHERENCE_CHIP_LABELS: Record<AdherenceTone, string> = {
	'on-target': 'I RUTE',
	under: 'UNDER',
	over: 'OVER',
}

/** The same band in a sentence: `I rute · 94 % av …`. */
export const NB_ADHERENCE_LABELS: Record<AdherenceTone, string> = {
	'on-target': 'I rute',
	under: 'Under',
	over: 'Over',
}

/** A logged load that is not plain kilos, in a lifter's Norwegian. */
export const NB_LOAD_WORDS = {
	bodyweight: 'kroppsvekt',
	assisted: 'assistert',
	level: (level: number) => `nivå ${level}`,
	band: (band: string) => `${band} strikk`,
	unloaded: 'uten vekt',
} as const

/** Today's one honest action (#179), on today's row (ADR 0086). */
export const NB_SESSION_CTA_LABELS: Record<
	'View session' | 'Log session' | 'Log your sets',
	string
> = {
	'View session': 'Se økta',
	'Log session': 'Logg økta',
	'Log your sets': 'Logg settene',
}

/** Form, read as a state, and what to do about it (ADR 0008/0010). */
export const NB_READINESS_LABELS: Record<ReadinessTone, string> = {
	fresh: 'uthvilt',
	neutral: 'i balanse',
	fatigued: 'sliten',
}

export const NB_READINESS_ADVICE: Record<ReadinessTone, string> = {
	fresh: 'du er uthvilt, kjør økta',
	neutral: 'tren som planlagt',
	fatigued: 'ta det med ro i dag',
}

/** The coach's one line, in words the athlete reads every day. */
export const VERDICT_LABELS = {
	form: (signed: string, state: string) => `Form ${signed}, ${state}`,
	coldStart: (day: number, required: number) =>
		`Formen kan leses etter ${required} dager — dag ${day}/${required}.`,
	sustainedOver: (weeks: number) =>
		`Over planen ${weeks} uker på rad — formen synker. Ta det ned før det koster deg.`,
	sustainedUnder: (weeks: number) =>
		`Under planen ${weeks} uker på rad — formen glir fra målet. Få inn den planlagte treningen.`,
	eased: (duration: string | null) =>
		duration
			? `neste økt er gjort lettere: ${duration} rolig i sone 2`
			: 'neste økt er gjort lettere: rolig i sone 2',
	heldStrength: 'neste økt er styrke, så den står som planlagt',
} as const

/**
 * The Training Load triad, as Meg's Form section names it (ADR 0008). `short`
 * is what is written under each figure — plain words, never a clipped one
 * (`Kond`, `Tretth`): #505 story 70 asks for words over jargon, and the three
 * fit a phone's three columns whole.
 */
export const NB_LOAD_LEGENDS = {
	fitness: {
		short: 'Kondisjon',
		term: 'Kondisjon (CTL)',
		description:
			'Kondisjon (CTL): snittet av treningsbelastningen (TSS) de siste 42 dagene, vektet — formen du har bygd opp.',
	},
	fatigue: {
		short: 'Tretthet',
		term: 'Tretthet (ATL)',
		description:
			'Tretthet (ATL): snittet av treningsbelastningen (TSS) de siste 7 dagene, vektet — slitet du bærer nå.',
	},
	form: {
		short: 'Form',
		term: 'Form (TSB)',
		description:
			'Form (TSB): kondisjon minus tretthet. Positiv betyr uthvilt, negativ betyr under belastning.',
	},
} as const

/** The record's sport, as the noun after `Lengste`. */
export const NB_RECORD_NOUNS: Record<string, string> = {
	run: 'løpetur',
	bike: 'sykkeltur',
	swim: 'svømmeøkt',
	strength: 'styrkeøkt',
}

/** The header's one line of orientation: `ons 7. okt · uke 9 av 10`. */
export function planWeekLabel(week: number, total: number): string {
	return `uke ${week} av ${total}`
}

/** The two ends of the list (ADR 0075 §3). */
export const CAP_LABELS = {
	readsBackTo: (date: string) => `I dag leser tilbake til ${date}`,
	reach: (weeks: number, earliest: string | null) =>
		earliest
			? `${weeks} uker av det, og den første økta i den perioden er ${earliest}. Eldre trening vises ikke her — stripa stopper her også.`
			: `${weeks} uker av det, uten noe logget i den perioden. Eldre trening vises ikke her — stripa stopper her også.`,
	writtenThrough: (date: string) => `Alt er skrevet til og med ${date}`,
	noPlan:
		'Det finnes ingen sesongplan ennå, så lista er bare så lang som det du har skrevet.',
	sketched: (weeks: number, event: string | null, date: string) =>
		`Resten av sesongen er skissert, ikke skrevet — ${weeks === 1 ? '1 uke' : `${weeks} uker`} uten økter ennå, frem til ${event ?? 'løpsdagen'} ${date}.`,
	whole: 'Det er hele planen. Ingenting er lagt inn etter dette.',
	/**
	 * An open-ended plan's end (ADR 0079): a plan with no end date, never "no
	 * plan". Its last round is sketched past what is written, and the next
	 * round is proposed in Ukeskiftet before this one ends.
	 */
	openEnded: (weeks: number, date: string) =>
		weeks > 0
			? `Resten av blokka er skissert, ikke skrevet — ${weeks === 1 ? '1 uke' : `${weeks} uker`} uten økter ennå, til og med ${date}. Planen har ingen sluttdato: neste blokk foreslås i Ukeskiftet før denne er ferdig.`
			: `Det er hele blokka, til og med ${date}. Planen har ingen sluttdato: neste blokk foreslås i Ukeskiftet før denne er ferdig.`,
	writeLast: (weeks: number) =>
		weeks === 1 ? 'Skriv den siste uka' : `Skriv de siste ${weeks} ukene`,
	seasonPlan: 'Sesongplan',
	planASeason: 'Planlegg en sesong',
} as const

/** The creation menu in I dag's header (#178). */
export const CREATE_MENU_LABELS = {
	trigger: 'Ny',
	name: 'Lag ny',
	write: 'Skriv en økt',
	session: 'Ny økt',
	event: 'Nytt løp',
	plan: 'Ny plan',
} as const

/** The day stamp's draft (ADR 0065 §5, #501). */
export const DAY_STAMP_LABELS = {
	prefilled: 'Det du trener mest — trykk på en annen for å bytte.',
	ask: 'Ingenting å lese det av ennå, så: hvilken?',
	discipline: 'Idrett',
	/** The open draft, named for the day it writes on. */
	draftFor: (day: string) => `Ny økt ${day}`,
	liftsNote: 'En styrkeøkt sier hvilke løft — mer enn linja har plass til.',
	failed: 'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
	done: 'Ferdig',
	add: (sentence: string) => `Legg til ${sentence}`,
	adding: 'Legger til…',
	nameTheLifts: 'Navngi løftene',
	more: 'Mer',
	cancel: 'Avbryt',
	undo: 'Angre',
	removing: 'Fjerner…',
	/**
	 * The toast after a write from "+ Ny" → "Skriv en økt", when the reply had
	 * no week sum to say (it always has one today; this is the floor).
	 */
	written: 'Økta er lagt inn.',
} as const

/**
 * The **writing line** (#505 stories 35–41): a session typed as a sentence,
 * what the app understood of it, and what it does to the week.
 */
export const WRITING_LINE_LABELS = {
	input: 'Skriv økta',
	placeholder: 'f.eks. 10 km rolig eller 3x10 min terskel p 1 min',
	/** The empty line under the Styrke chip (ADR 0089). */
	placeholderLifts: 'f.eks. Knebøy 5×5 @ 80 kg · Benkpress 5×5 @ 60 kg',
	hint: 'Eller la linja stå tom og legg til 45 min rolig.',
	understood: 'Forstått',
	/** `Til sammen 10 km`, `Til sammen 5 km og 7 min 30 s`. */
	totals: (parts: string[]) => `Til sammen ${parts.join(' og ')}`,
	/** Why a piece of the sentence was not read, said where it stands. */
	unread: {
		'unknown-word': (word: string) => `Kjenner ikke «${word}»`,
		'no-unit': (word: string) => `«${word}» mangler enhet`,
		'ambiguous-time': (word: string) => `«${word}» kan leses på to måter`,
		'ambiguous-number': (word: string) =>
			`«${word}» kan være tusen eller desimaler`,
		stray: (word: string) => `Tegnet «${word}» hører ikke hjemme her`,
		'unknown-exercise': (word: string) => `Finner ikke øvelsen «${word}»`,
	} satisfies Record<UnreadReason, (word: string) => string>,
	noSuggestion: 'Prøv et ord som rolig, terskel eller pause.',
	suggestionsFor: (word: string) => `Forslag for «${word}»`,
	replace: (from: string, to: string) => `Bytt «${from}» med «${to}»`,
	/** `Løping denne uka:` — the week the session lands in. */
	weekLead: (sport: string, weekName: string) =>
		`${sport} ${weekName.toLowerCase()}:`,
	problems: {
		empty: '',
		'too-long': 'Linja tar en kort setning — høyst 200 tegn.',
		'empty-part': 'Det står et + eller komma uten noe på den ene siden.',
		'no-quantity': 'Skriv hvor langt eller hvor lenge: 10 km, 45 min, 1 t.',
		'two-quantities': 'En del sier enten km eller tid, ikke begge.',
		'two-repeats': 'En del kan gjentas én gang: 3x10 min, ikke 2 x 3 x 10 min.',
		'two-intensities': 'En del har én intensitet — ett ord eller én fart.',
		'two-disciplines': 'Setningen nevner to idretter. Skriv én økt om gangen.',
		'dangling-rest': 'Pausen mangler tid: p 1 min.',
		'distance-rest': 'En pause skrives som tid her, f.eks. p 1 min.',
		'out-of-range': 'Et av tallene er utenfor det en økt kan være.',
		'no-discipline': 'Velg idrett over, eller skriv den: løp, sykkel, svøm.',
		'no-sets': 'Skriv sett og repetisjoner etter løftet: Knebøy 5×5.',
		'no-exercise': 'Skriv hvilket løft settene er: Knebøy 5×5 @ 80 kg.',
		'dangling-load': 'Vekten mangler tall: @ 80 kg.',
		'two-loads': 'Et sett har én vekt — skriv neste vekt som egne sett.',
	} satisfies Record<SentenceProblem, string>,
	add: (sentence: string) => `Legg til «${sentence}»`,
	addEmpty: 'Legg til',
	/** The creation menu's way in, and the panel it opens (story 40). */
	open: 'Skriv en økt',
	day: 'Dag',
	close: 'Lukk',
	failed: 'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
	outsideWindow:
		'Den dagen ligger for langt tilbake — I dag leser et halvt år bakover.',
} as const

/** A duration the Norwegian way: `33 min`, `1 t 30 min`, `7 min 30 s`. */
export function nbDurationLabel(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const rest = Math.round(seconds % 60)
	return [
		hours > 0 ? `${hours} t` : null,
		minutes > 0 ? `${minutes} min` : null,
		rest > 0 ? `${rest} s` : null,
	]
		.filter(Boolean)
		.join(' ')
}

/**
 * The full Home Timeline at its own address (spec #558 story 102, #562): the
 * Week Strip, the Stream, the Writing Line and the panes, behind I dag's link
 * of these words. The page's title says what the link promised.
 */
export const HOME_TIMELINE_FULL_VIEW_LABELS = {
	link: 'Se hele sesongen',
	title: 'Hele sesongen',
	/** I dag's and the full view's 404: a state to act on, not a bug. */
	notFound: 'Vi fant ikke treningen din.',
} as const

/**
 * I dag's calm default view (spec #558 S4, ADR 0101 §3–§4): the top line, the
 * today card and this week's seven rows. A free day is _fri_, never _hvile_;
 * _hviledag_ only where the plan prescribes recovery (Every-Day Grid rule).
 */
export const CALM_TODAY_LABELS = {
	region: 'I dag',
	cardRegion: 'Dagens økt',
	effort: {
		rolig: 'rolig',
		middels: 'middels',
		hard: 'hard',
	} satisfies Record<EffortWord, string>,
	/** The card's one plain sentence, when the session carries no note. */
	sentence: {
		rolig: 'Rolig hele veien. Du skal kunne prate.',
		middels: 'Kontrollert hardt. Pusten er tung, men jevn.',
		hard: 'Varm godt opp. Hardt i dragene, rolig mellom.',
	} satisfies Record<EffortWord, string>,
	sentenceStrength: 'Ta settene slik de står, med hvile mellom.',
	sentencePlain: 'Gjør økta slik den står.',
	done: 'Gjort',
	doneFor: (title: string) => `Marker «${title}» som gjort`,
	openSession: 'Se økta',
	doneTitle: 'Ferdig for i dag',
	doneLine: (titles: string) => `Du har gjort ${titles}.`,
	freeTitle: 'Fri i dag',
	next: (title: string, when: string) => `Neste økt: ${title}, ${when}.`,
	nothingAhead: 'Ingen økter er lagt ut framover ennå.',
	tomorrow: 'i morgen',
	addToday: 'Legg til en økt i dag',
	beforeStartTitle: (date: string) => `Planen starter ${date}`,
	firstSession: (title: string, when: string) =>
		`Første økt: ${title}, ${when}.`,
	noFirstSession: 'Ukene legges ut før planen starter.',
	noPlanTitle: 'Du har ingen plan ennå',
	noPlanBody: 'Svar på noen få spørsmål, så legger appen opp ukene for deg.',
	noPlanAction: 'Kom i gang',
	weekHeading: 'Denne uka',
	weekDone: (done: number, total: number) =>
		`${done} av ${total} ${total === 1 ? 'økt' : 'økter'} gjort`,
	free: 'fri',
	restDay: 'hviledag',
	missed: 'ikke gjort',
	doneMark: 'gjort',
	plannedMark: 'ikke gjort ennå',
	addOn: (day: string) => `Legg til en økt ${day}`,
	weekChangeWaiting: (count: number) =>
		`Ukeskiftet har ${count} forslag som venter på deg.`,
	weekChangeOpen: 'Se forslagene',
} as const
