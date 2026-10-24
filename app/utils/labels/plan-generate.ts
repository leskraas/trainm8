/**
 * The generated season (#505 round 2, ADR 0081, ADR 0085). Part of
 * `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { GenerationRefusal } from '../plan-generation/generate.server.ts'
import type { GenerationIntent } from '../plan-generation/season.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { nbWeeks } from './plan-domain.ts'
import { PLAN_SHAPE_STEP_LABELS } from './plan-new.ts'

// ===========================================================================
// The generated season (#505 round 2, r2-plan-generate; ADR 0081, ADR 0085):
// `/training/plan/generate/$eventId`, reached from the shape step's «Bygg
// sesongen for meg». The one question it asks, the season it previews week by
// week, what the season leaves out, and the approval. One section of its own
// so the area PRs that also add to this file merge cleanly. A shape's name and
// note are Sesong's (`nbPresetName`, `nbPresetNote`); where a shape lands
// against the Event, and the refusals the plan service shares with the shape
// step, are `PLAN_SHAPE_STEP_LABELS`'s — one fact, one wording on both steps.
// ===========================================================================

/** `a`, `a eller b`, `a, b eller c`. */
function nbOr(items: readonly string[]): string {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} eller ${items.at(-1)}`
}

/** `1 økt`, `12 økter`. */
function nbSessionCount(count: number): string {
	return count === 1 ? '1 økt' : `${count} økter`
}

export const PLAN_GENERATE_LABELS = {
	metaTitle: 'Sesongen din | Trainm8',
	title: 'Sesongen din, klar til å se over',
	/** The title when there is no season to show, only a reason. */
	refusedTitle: 'Sesongen din',
	/** Back to the shape step: the way in that authors the season by hand. */
	layOutMyself: 'Legg den opp selv',

	/** `48 økter over 18 uker`, beside the Event's date and where it lands. */
	summary: (sessions: number, weeks: number) =>
		`${nbSessionCount(sessions)} over ${nbWeeks(weeks)}`,
	intro:
		'Hver økt er hentet fra katalogen og viser hvor den kommer fra. Ingenting havner i kalenderen før du legger det inn.',

	youTitle: 'Hvor står du nå?',
	youIntro:
		'Det eneste treningshistorikken din ikke kan fortelle. Svaret avgjør hvor høyt opp på katalogens doseringsstige øktene hentes – en oppgitt praksis, ikke en vurdering av deg.',
	/** Three situations, worded as the athlete would say them. */
	intents: {
		'first-season': 'Dette er min første strukturerte sesong',
		'returning-from-injury':
			'Jeg er på vei tilbake etter skade eller et langt opphold',
		'deliberately-building': 'Jeg trener jevnt og bygger videre',
	} satisfies Record<GenerationIntent, string>,

	shapeTitle: 'Formen på sesongen',
	/** Under the chosen shape's name on the closed row: its length, and why it. */
	shapeDetail: (weeks: number) =>
		`${nbWeeks(weeks)} · valgt fordi den lander nærmest løpet`,
	/** The same row once the athlete has picked a shape themselves. */
	shapeDetailOwn: (weeks: number) => `${nbWeeks(weeks)} · valgt av deg`,
	/** A shape on offer: `18 uker · Samme sesong over færre uker.` */
	shapeOption: (weeks: number, note: string) => `${nbWeeks(weeks)} · ${note}`,
	shapeNote:
		'Et utgangspunkt, aldri en anbefaling – en form som passer kalenderen, er ikke dermed den rette sesongen for deg.',

	anchorTitle: 'Hvor starter ukene?',
	/** `Startvolum per uke i løping (km)`. */
	anchorLabel: (sport: string, unit: string) =>
		`Startvolum per uke i ${sport} (${unit})`,
	anchorFromHistory: 'Fylt inn fra din egen trening. Endre det gjerne.',
	/** Under a figure the athlete typed: every week is sized from it. */
	anchorOwn: 'Ditt eget tall. Hver uke i sesongen regnes ut fra det.',
	anchorNone:
		'Ingenting i treningen din de siste ukene å lese dette fra, så det er ditt å oppgi. Til du gjør det, står det «—» i hver uke.',
	rebuild: 'Bygg sesongen på nytt',

	seasonTitle: 'Sesongen',
	/** `Grunntrening 4 uker`, in the line of phases. */
	phase: (name: string, weeks: number) => `${name} ${nbWeeks(weeks)}`,
	/** A week by its ISO number, as every week on Sesong is named. */
	week: (isoWeek: number) => `Uke ${isoWeek}`,
	/** `uke 3 av 18` — where the week sits in this season. */
	weekOf: (index: number, total: number) => `uke ${index} av ${total}`,
	raceWeek: 'Løpsuke',
	zone: (zone: number) => `sone ${zone}`,
	/** The weeks behind one tap: `14 uker til`. */
	remaining: (count: number) =>
		count === 1 ? 'Én uke til' : `${count} uker til`,
	remainingDetail: 'Den samme sesongen, uke for uke, helt fram til løpet.',

	absencesTitle: 'Dette er ikke med i sesongen',
	/** `Ingen spor for styrke.` */
	noTrack: (sport: string) => `Ingen spor for ${sport}.`,
	noTrackBody:
		'Ingen av sesongformene har en styrkeblokk, og en styrkeblokk trenger et mål, en lengde og et antall økter i uka som ingenting her kan lese. I stedet for å finne på dem lar sesongen den være ute – legg til en selv på planen når sesongen er lagt inn.',
	emptyDays: (count: number) =>
		count === 1 ? '1 treningsdag er tom.' : `${count} treningsdager er tomme.`,
	emptyDaysBody:
		'Katalogen har ingen økt som passer det de dagene ba om, og ingenting er satt inn i stedet. De er merket i ukene under.',
	/** `Ingenting å legge inn – terskel eller under terskel i grunntrening …`. */
	nothingToPlace: (archetypes: readonly string[], phase: string) =>
		`Ingenting å legge inn – ${nbOr(archetypes)} i ${phase} finnes ikke i katalogen for denne idretten.`,

	approve: (count: number) =>
		count === 1
			? 'Legg denne økta i kalenderen'
			: `Legg disse ${count} øktene i kalenderen`,
	approveNote:
		'Alt havner der som vanlige økter du kan endre – og hver av dem peker tilbake til katalogøkta den kom fra.',

	/** Why the season could not be built or added, as the athlete reads it. */
	refusals: {
		...PLAN_SHAPE_STEP_LABELS.refusals,
		'no-cardio-discipline':
			'Løpet har ingen løping, sykling eller svømming, så det er ikke noe utholdenhetsspor å bygge en sesong på.',
		'anchor-missing':
			'Oppgi hvor hver idrett starter før du legger sesongen i kalenderen – et spor uten startvolum har ingen størrelse, og ingenting her finner på en.',
	} satisfies Record<GenerationRefusal, string>,
} as const
