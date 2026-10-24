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
} as const
