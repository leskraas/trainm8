/**
 * The Events pages (`/training/events`) and the Events on Plan, in Norwegian
 * (ADR 0081, round 2). Part of `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { EventKind, EventPriority, EventStatus } from '../event-schema.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { type TARGET_KIND_LABELS } from './vocabulary.ts'

/**
 * Sesong's Events card (spec #505 story 57): the upcoming Events the season is
 * planned around, and the way to plan another.
 */
export const SEASON_EVENTS_LABELS = {
	title: 'Løp og arrangementer',
	comingUp: (count: number) =>
		count === 0 ? 'ingen kommende' : `${count} kommende`,
	none: 'Ingen kommende løp. Løp, testløp og datomål samles her.',
	all: 'Alle løp',
	newEvent: 'Nytt løp',
	newPlan: 'Planlegg en ny sesong',
} as const

/** An Event's kind in the #505 surfaces' Norwegian (ADR 0081). */
export const NB_EVENT_KIND_LABELS: Record<EventKind, string> = {
	race: 'Løp',
	'time-trial': 'Testløp',
	'fitness-goal': 'Datomål',
}

/** An Event's status, said on the Events pages. */
export const NB_EVENT_STATUS_LABELS: Record<EventStatus, string> = {
	planned: 'Planlagt',
	completed: 'Gjennomført',
	cancelled: 'Avlyst',
}

/**
 * What an Event's priority means, beside its letter on the form. The letter
 * itself is the badge (`A`), as on Sesong's Events card.
 */
export const NB_EVENT_PRIORITY_LABELS: Record<EventPriority, string> = {
	A: 'Hovedmål',
	B: 'Viktig',
	C: 'Underveis',
}

/** The form's target kinds, keyed as {@link TARGET_KIND_LABELS}; `''` is none. */
export const NB_TARGET_KIND_LABELS: Record<
	keyof typeof TARGET_KIND_LABELS,
	string
> = {
	'': 'Ingen mål',
	finish: 'Fullføre',
	time: 'Tid',
	pace: 'Fart',
	distance: 'Distanse',
	placement: 'Plassering',
	qualitative: 'Med egne ord',
}

export const EVENTS_LABELS = {
	// The list.
	title: 'Løp',
	metaTitle: 'Løp | Trainm8',
	backToSeason: 'Plan',
	newEvent: 'Nytt løp',
	upcoming: 'Kommende',
	past: 'Tidligere og avlyste',
	emptyTitle: 'Ingen løp ennå',
	emptyBody:
		'Løp, testløp og datomål samles her, og sesongen planlegges mot dem.',
	emptyAction: 'Legg inn et løp',
	priority: (letter: string) => `Prioritet ${letter}`,

	// The form (new and edit).
	newTitle: 'Nytt løp',
	newMetaTitle: 'Nytt løp | Trainm8',
	editTitle: 'Endre løpet',
	editMetaTitle: (name: string) => `Endre ${name} | Trainm8`,
	name: 'Navn',
	namePlaceholder: 'f.eks. Trondheim Maraton',
	kind: 'Type',
	priorityLegend: 'Prioritet',
	startDate: 'Dato',
	endDate: 'Siste dag',
	endDateHint: 'Bare for løp over flere dager.',
	optional: 'valgfritt',
	disciplines: 'Idrett',
	location: 'Sted',
	locationPlaceholder: 'f.eks. Trondheim',
	target: 'Mål',
	targetTime: 'Måltid',
	targetTimeHint: 'Timer, minutter og sekunder, f.eks. 3:30:00 eller 42.30.',
	targetPace: 'Fart',
	targetPaceHint: 'Minutter og sekunder per km, f.eks. 4:15.',
	targetDistance: 'Distanse',
	targetDistanceHint: 'I km, f.eks. 42,2.',
	targetPlacement: 'Plassering',
	targetPlacementHint: 'f.eks. 3 for pallen.',
	targetDescription: 'Målet med egne ord',
	targetDescriptionPlaceholder: 'f.eks. Sterk hele veien',
	notes: 'Notater',
	notesPlaceholder: 'Det du vil huske om løpet',
	create: 'Lag løpet',
	save: 'Lagre endringene',

	// The form's errors, each said at its field.
	nameRequired: 'Skriv hva løpet heter',
	nameTooLong: (max: number) => `Navnet kan ha høyst ${max} tegn`,
	kindRequired: 'Velg hva slags løp det er',
	priorityRequired: 'Velg en prioritet',
	startDateRequired: 'Skriv en gyldig dato',
	endDateInvalid: 'Skriv en gyldig dato, eller la feltet stå tomt',
	endDateBeforeStart: 'Siste dag kan ikke være før første dag',
	disciplineRequired: 'Velg minst én idrett',
	locationTooLong: (max: number) => `Stedet kan ha høyst ${max} tegn`,
	notesTooLong: (max: number) => `Notatene kan ha høyst ${max} tegn`,
	targetTimeInvalid: 'Skriv tiden som 3:30:00 eller 42:30',
	targetPaceInvalid: 'Skriv farten som 4:15',
	targetDistanceInvalid: 'Skriv distansen i km, f.eks. 42,2',
	targetPlacementInvalid: 'Skriv en plassering, 1 eller høyere',
	targetDescriptionRequired: 'Skriv hva målet er',
	formInvalid: 'Noe i skjemaet stemmer ikke. Se feltene over.',

	// The detail.
	edit: 'Endre',
	cancel: 'Avlys',
	delete: 'Slett',
	keep: 'Behold løpet',
	cancelTitle: 'Avlyse løpet?',
	cancelBody:
		'Løpet blir stående i listen som avlyst, så planhistorikken din er intakt. Vil du fjerne det helt, bruk Slett i stedet.',
	cancelConfirm: 'Avlys løpet',
	deleteTitle: 'Slette løpet?',
	deleteBody: (planned: boolean) =>
		planned
			? 'Løpet blir fjernet for godt. Vil du beholde det i listen som avlyst, bruk Avlys i stedet. Dette kan ikke angres.'
			: 'Løpet blir fjernet for godt. Dette kan ikke angres.',
	deleteConfirm: 'Slett løpet',
	targetHeading: 'Mål',
	targetTop: (position: number) =>
		position === 1 ? 'Vinne' : `Topp ${position}`,
	result: 'Resultat',
	linkedSession: 'Økta som er resultatet',
	viewSession: 'Se økta',
	unlink: 'Fjern koblingen',
	setResult: 'Velg resultat',
	noCandidates: 'Ingen økter i løpets idrett på løpsdagen ennå.',
	candidatesOn: (date: string) => `Økter ${date} i løpets idrett:`,
	setAsResult: 'Bruk som resultat',
	untitledSession: 'Økt uten navn',
	notFound: 'Fant ikke løpet',

	// The Event Distance (#670, ADR 0112 §1): the form's pills and the result
	// section's fix.
	distance: 'Distanse',
	distanceNames: {
		'1500m': '1500 m',
		'3k': '3 km',
		'5k': '5 km',
		'10k': '10 km',
		hm: 'Halvmaraton',
		marathon: 'Maraton',
		other: 'Annen',
	},
	distanceKm: 'Distanse i km',
	distanceKmHint: 'I km, f.eks. 7,5.',
	distanceKmInvalid: 'Skriv distansen i km, mellom 1 og 500, f.eks. 7,5',
	distanceFormHint:
		'Når du velger økta som er resultatet, lagres tida fra klokka på denne distansen.',
	raceDistance: 'Løpets distanse',
	saveDistance: 'Lagre distansen',
	changeDistance: 'Endre distansen',

	// An Event's result (#670, ADR 0112): measured, or why there is none.
	measured: 'Målt av klokka',
	askDistance: 'Hvor langt var løpet?',
	askDistanceBody: 'Velg distansen, så lagres tida fra klokka som et resultat.',
	noTimeSaved: 'Ingen tid er lagret',
	mismatch: (measured: string, race: string) =>
		`Klokka målte ${measured} km, men løpet er ${race}. Tida lagres bare når de to stemmer.`,
	mismatchTypedBefore: (race: string) => `Var løypa ${race}? Skriv tida inn på`,
	noRecordingDistance: (race: string) =>
		`Opptaket fra klokka har ingen distanse, så det kan ikke måles mot ${race}.`,
	otherDiscipline: (discipline: string) =>
		`Opptaket er ${discipline.toLowerCase()}, ikke løping.`,
	waiting: 'Venter på klokka',
	waitingBody: 'Økta har ikke noe opptak ennå. Tida lagres når det kommer.',
	resultsLink: 'Løpsresultater',
	inUse: (racePace: string) =>
		`Øktene med ${racePace} regner farten fra denne tida.`,
	typedSameDay: (race: string, racePace: string) =>
		`Du skrev inn en tid på ${race} samme dag. Øktene med ${racePace} bruker den, se`,
	newerInUse: (race: string, racePace: string) =>
		`Et nyere resultat på ${race} brukes av øktene med ${racePace}, se`,
	notAnchor: (race: string) =>
		`${race} er ingen standarddistanse, så ingen økt regner fart fra den.`,
	candidatesDistance: (race: string) =>
		`Tida fra klokka lagres som resultat på ${race}.`,
} as const
