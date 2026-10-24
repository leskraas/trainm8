/**
 * Plan creation (#505 round 2, ADR 0081, ADR 0090): the goal step and the
 * shape step. Part of `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { CreateOutlineRefusal } from '../plan-outline/authoring.server.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { nbJoin } from './_helpers.ts'
import { nbWeeks } from './plan-domain.ts'

/**
 * Plan creation's first step (`/training/plan/new`), which is Sesong's own
 * landing while there is no plan (ADR 0083): what the season builds toward.
 */
export const PLAN_NEW_LABELS = {
	heading: 'Hva bygger du mot?',
	intro: 'Velg løpet sesongen skal bygge mot, eller sett et mål med dato.',
	yourEvents: 'Dine kommende løp',
	allEvents: 'Alle løp',
	noEventsBefore: 'Ingenting i kalenderen ennå — sett et mål under, eller ',
	addEvent: 'legg inn et løp',
	planForEvent: 'Planlegg mot dette løpet',
	alreadyPlanned: 'har allerede en plan',
	openItsPlan: 'Åpne planen',
	setAGoal: 'Eller sett et mål',
	setAGoalIntro:
		'Dette lager et datomål i kalenderen din, så sesongen har noe ekte å bygge mot.',
	goal: 'Mål',
	goalPlaceholder: 'f.eks. Under 40 på 10 km',
	date: 'Dato',
	discipline: 'Idrett',
	create: 'Lag målet og gå videre',
	nameRequired: 'Skriv hva du bygger mot',
	dateRequired: 'Skriv en gyldig dato',
	disciplineRequired: 'Velg en idrett',
} as const

// ===========================================================================
// Plan creation (#505 round 2, r2-plan-new; ADR 0081, ADR 0090): the shape
// step (`/training/plan/new/$eventId`) — its shapes, tracks and start week —
// the words a convention's English citation is shown in, and the domain
// schema's messages as the athlete reads them. One section of its own so the
// area PRs that also add to this file merge cleanly. The goal step's words are
// `PLAN_NEW_LABELS` and `OPEN_ENDED_FORM_LABELS` above; a shape's name and
// note are Sesong's (`SESONG_SHAPE_LABELS`, `PHILOSOPHY_*`), so one method has
// one name on both surfaces (audit B7).
// ===========================================================================

export const PLAN_SHAPE_STEP_LABELS = {
	metaTitle: 'Legg opp sesongen | Trainm8',
	title: 'Legg opp sesongen',
	goalCreated: 'Mål laget',
	goalCreatedNote: 'lagt i kalenderen som et datomål',

	generateTitle: 'Eller la trainm8 bygge den',
	generateBody:
		'En hel sesong med ekte økter, hentet fra katalogen og merket med hvor de kommer fra. Ingenting havner i kalenderen før du godkjenner det, og alt kan endres etterpå.',
	generateAction: 'Bygg sesongen for meg',

	noDiscipline:
		'Løpet har ingen idrett, så det er ikke noe å lage et treningsspor fra.',
	noDisciplineLink: 'Legg til en på løpet',
	noDisciplineTail: 'og kom tilbake.',

	shapeTitle: 'Hvordan skal sesongen bygges?',
	shapeIntro:
		'Velg en form, så følger blokkene, stigningen og kvalitetsøktene med. Alt kan endres etterpå. Hver tegning er laget av formens egne tall, så den viser hva du får.',
	moreLengths: (count: number) => `${count} lengder til`,
	moreLengthsDetail:
		'De samme formene, lengre og kortere. De lander lenger fra løpet.',
	ownTitle: 'Jeg legger opp blokkene selv',
	ownDetail:
		'En fase sier når og hvorfor, aldri hvor mye. Fasene ligger etter hverandre fra startuka.',
	phaseName: (index: number) => `Navn på fase ${index}`,
	phaseNamePlaceholder: 'f.eks. Grunntrening',
	phaseWeeks: 'Uker',
	ownNote:
		'Hver fjerde uke er en lett uke etter vanlig praksis, og ingenting stiger før du sier det på en blokk.',
	fixedLength:
		'En form har fast lengde, så den strekkes aldri for å nå løpet. Uansett hvilken du velger, sier planen hvor den slutter, og du bestemmer om du vil legge til uker.',

	/** Where a shape of this length ends, after `18 uker ·`. */
	landsOnEvent: 'slutter i uka for løpet',
	endsBefore: (weeks: number) => `slutter ${nbWeeks(weeks)} før løpet`,
	runsPast: (weeks: number) => `går ${nbWeeks(weeks)} forbi løpet`,
	/** `Grunntrening med 7 uker` — one block the fitting rule would touch. */
	fitChange: (phase: string, weeks: number) => `${phase} med ${nbWeeks(weeks)}`,
	/** What the fitting rule would do: `å tilpasse den korter ned …`. */
	fitWould: (lengthens: boolean, changes: readonly string[]) =>
		`å tilpasse den ${lengthens ? 'forlenger' : 'korter ned'} ${nbJoin(changes)}`,
	fitTooLong: 'for lang til å tilpasses uten å fjerne en blokk',

	/** Said once above the tracks of a multi-sport Event. */
	multiTrack: (sports: readonly string[]) =>
		`Løpet ditt har ${nbJoin(sports)}, så sesongen får et spor for hver – over de samme blokkene, med toppen samtidig. Hvert spor beholder sin egen enhet.`,
	trackTitle: (sport: string) => `Hvor store er ukene i ${sport}?`,
	unitLabel: (sport: string) => `Hvilken enhet planlegger du ${sport} i?`,
	plannedIn: (sport: string) => `Sporet for ${sport} planlegges i`,
	anchorLabel: (sport: string) => `Startvolum per uke i ${sport}`,

	startTitle: 'Hvilken uke starter planen?',
	startIntro:
		'Blokkene legges framover herfra. Ingenting telles bakover fra løpet, så en blokk du legger til senere flytter aldri starten.',
	startLabel: 'Startuke for planen',
	/** `Uke 2 · 7. jan 2030 · denne uka`. */
	weekOption: (isoWeek: number, date: string, current: boolean) =>
		`Uke ${isoWeek} · ${date}${current ? ' · denne uka' : ''}`,

	create: 'Lag planen',

	// The form's own messages, each said at its field.
	structureRequired: 'Velg en form, eller legg opp blokkene selv',
	ownEmpty: 'Gi minst én blokk et navn, eller start fra en form',
	unitRequired: 'Velg enheten du planlegger i',
	anchorRequired: 'Et startvolum må fylles inn',
	anchorPositive: 'Startvolumet er mer enn null',
	tracksRequired: 'En plan har minst ett treningsspor',

	/** Why the plan could not be made, as the athlete reads it. */
	refusals: {
		'event-not-found': 'Det løpet kan ikke planlegges mot.',
		'event-past':
			'Det løpet har allerede vært, så det kan ikke være mål for en ny plan.',
		'event-cancelled':
			'Det løpet er avlyst, så det kan ikke være mål for en plan.',
		'event-already-planned': 'Det løpet har allerede en plan.',
		'open-ended-already-active':
			'Du har allerede en plan uten slutt. Åpne den fra Plan.',
	} satisfies Record<CreateOutlineRefusal, string>,
} as const

/**
 * The domain schema's messages (`authoring-schema.ts`, English: the domain
 * carries no copy of its own, ADR 0023) as the creation flow shows them. Keyed
 * by the English text, so the schema and its tests stay as they are; a message
 * not listed passes through rather than vanishing.
 */
const NB_AUTHORING_MESSAGES: Record<string, string> = {
	'A week key is a YYYY-MM-DD date': 'Velg en uke fra listen',
	'A Training Week starts on a Monday': 'En treningsuke starter på en mandag',
	'Name the phase': 'Gi fasen et navn',
	'A phase runs in whole weeks': 'En fase varer i hele uker',
	'A phase runs at least one week': 'En fase varer minst én uke',
	'A phase runs at most 52 weeks': 'En fase varer høyst 52 uker',
	'A plan has at least one phase': 'En plan har minst én fase',
	'Your starting volume is more than zero': 'Startvolumet er mer enn null',
	'That unit is not one this discipline authors':
		'Den enheten kan ikke brukes for den idretten',
	'A plan has at least one Training Track':
		'En plan har minst ett treningsspor',
	'One Training Track per discipline': 'Ett treningsspor per idrett',
	'A plan runs at most 104 weeks': 'En plan varer høyst 104 uker',
}

/** {@link NB_AUTHORING_MESSAGES}, one message at a time. */
export function nbAuthoringMessage(message: string): string {
	return NB_AUTHORING_MESSAGES[message] ?? message
}

/**
 * Where a Volume Conversion convention's figure was read (the `*_CITATION`
 * constants in `volume-conversion.ts`, English source data), as the season
 * chart's derivation panel shows it. Display only: the source strings stay as
 * they are, so this is keyed by them, and a citation not listed passes through
 * in its own words.
 */
const NB_CONVENTION_CITATIONS: Record<string, string> = {
	"Daniels' published VDOT table, whose T ÷ E speed ratio holds at 0.825–0.838 across VDOT 40–60":
		'Daniels’ publiserte VDOT-tabell, der farten på T delt på farten på E ligger på 0,825–0,838 for VDOT 40–60',
	'CSS + 6 s per 100 m, which is 0.926–0.948 across CSS 1:15–1:50':
		'CSS + 6 s per 100 m, som gir 0,926–0,948 for CSS 1:15–1:50',
	'TrainingPeaks: a threshold workout totals 30–60 min at LT excluding recoveries; VO₂ max work in 2–5 min efforts':
		'TrainingPeaks: en terskeløkt har til sammen 30–60 min på terskel uten pausene, og VO₂maks-arbeid gjøres i drag på 2–5 min',
}

/** {@link NB_CONVENTION_CITATIONS}, one citation at a time. */
export function nbConventionCitation(citation: string): string {
	return NB_CONVENTION_CITATIONS[citation] ?? citation
}
