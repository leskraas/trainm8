/**
 * The Token Sentence editor's chrome (#505 round 2, ADR 0081, ADR 0089): its
 * menus, controls, sets popover, empty state and repairs. Part of `labels.ts`:
 * import from the barrel.
 */

import { capitalize } from './_helpers.ts'

// ===========================================================================
// Token Sentence editor chrome (#505 round 2, r2-editor-finish): the ⠿/⋮
// menus, the value popovers' controls, the sets popover, the empty state and
// the validation summary, in Norwegian (ADR 0081). The sentence's own glue
// words are `TOKEN_SENTENCE_WORDS` and the popover titles
// `TOKEN_EDITOR_TITLES` (ADR 0089); this is everything around them. Nothing
// here is stored: the seeds' zone labels (`easy`, `threshold`) stay the keys
// the archetypes write, and a step kind is still `cardio | strength | rest`.
// ===========================================================================

/** A set's kind, as the sets popover's kind select names it. */
export const NB_SET_KIND_LABELS: Record<
	'reps' | 'timed' | 'amrap' | 'toRir' | 'velocityLoss',
	string
> = {
	reps: 'Repetisjoner',
	timed: 'På tid',
	amrap: 'AMRAP',
	toRir: 'Til RIR',
	velocityLoss: 'Fartstap',
}

/**
 * What a step or a block can be told to do from its ⠿/⋮ menu, and what the
 * live region says once it is done. `kind` is a `NB_STEP_KIND_LABELS` word.
 */
export const TOKEN_EDITOR_MENU_LABELS = {
	blockActions: (block: number, blocks: number) =>
		`Handlinger for blokk ${block} av ${blocks}`,
	blockGripTitle: 'Handlinger for blokka — dra for å flytte den',
	blockName: 'Navn …',
	blockRepeat: 'Gjenta …',
	addStep: 'Legg til steg',
	addBlockAfter: 'Legg til blokk etter',
	openBlockSheet: 'Åpne blokka …',
	deleteBlock: 'Slett blokka',
	stepActions: (step: number, steps: number, block: number, blocks: number) =>
		`Handlinger for steg ${step} av ${steps}, blokk ${block} av ${blocks}`,
	addFacet: 'Legg til …',
	moveEarlier: 'Flytt opp',
	moveLater: 'Flytt ned',
	duplicate: 'Lag en kopi',
	kind: 'Type',
	makeKind: (kind: string) => `⇄ Gjør til ${kind.toLowerCase()}`,
	remove: 'Fjern',
	addStepTo: (block: number) => `Legg til steg i blokk ${block}`,
	/** The live region, one sentence per change. */
	announce: {
		stepMoved: (earlier: boolean) =>
			earlier ? 'Steget er flyttet opp' : 'Steget er flyttet ned',
		stepDuplicated: 'Steget er kopiert',
		stepRemoved: (withBlock: boolean) =>
			withBlock ? 'Steget er fjernet sammen med blokka' : 'Steget er fjernet',
		stepKind: (kind: string) => `Steget er nå ${kind.toLowerCase()}`,
		stepAdded: (kind: string) => `Nytt steg: ${kind.toLowerCase()}`,
		blockMoved: (earlier: boolean) =>
			earlier ? 'Blokka er flyttet opp' : 'Blokka er flyttet ned',
		blockAdded: 'Blokka er lagt til',
		seedAdded: (name: string) => `${name} er lagt inn`,
	},
} as const

/** The gutter popover's titles and the block-name editor (`TOKEN_EDITOR_TITLES`'
 * style: a lower-case word over the control). */
export const TOKEN_EDITOR_GUTTER_LABELS = {
	nameTitle: 'navn på blokka',
	repeatTitle: 'ganger',
	clearName: 'Fjern navnet',
	close: 'Lukk',
} as const

/**
 * The value popovers' controls: the type-to-edit stepper (`label` is one of
 * `stepper`'s words), the notes and quantity editors, the per-step sport
 * select and the "＋ …" row of what a step is missing.
 */
export const TOKEN_EDITOR_CONTROL_LABELS = {
	/** The noun each stepper adjusts, in the sentence `Senk {noun}`. */
	stepper: {
		quantity: 'mengden',
		duration: 'varigheten',
		distance: 'distansen',
		repeat: 'antall ganger',
		rest: 'pausen',
		notes: 'notatet',
		intensity: 'intensiteten',
		sets: 'antall sett',
		discipline: 'idretten',
		reps: 'repetisjonene',
		timePerSet: 'tiden per sett',
		restBetweenSets: 'pausen mellom settene',
	},
	decrease: (noun: string) => `Senk ${noun}`,
	increase: (noun: string) => `Øk ${noun}`,
	value: (noun: string) => `Verdi for ${noun}`,
	valueSet: (noun: string, value: string) =>
		`${capitalize(noun)} er satt til ${value}`,
	note: 'Notat',
	noteUpdated: 'Notatet er endret',
	noteRemoved: 'Notatet er fjernet',
	removeNote: 'Fjern notatet',
	intensityRemoved: 'Intensiteten er fjernet',
	quantityKind: 'Mål steget i',
	duration: 'Tid',
	distance: 'Distanse',
	quantityIs: (unit: 'duration' | 'distance', value: string) =>
		`Steget måles nå i ${unit === 'duration' ? 'tid' : 'distanse'} — ${value}`,
	noQuantity: 'Steget har ingen lengde ennå — velg hvordan det skal måles.',
	removeQuantity: 'Fjern tid eller distanse',
	quantityRemoved: 'Tid eller distanse er fjernet',
	discipline: 'idrett',
	stepDiscipline: 'Idrett for steget',
	inheritDiscipline: (sport: string) => `som økta · ${sport}`,
	disciplineSet: (sport: string) =>
		`Idretten er satt til ${sport.toLowerCase()} — sonene leses mot de tersklene`,
	disciplineInherits: 'Idretten følger økta',
	addQuantity: '＋ tid eller distanse',
	addIntensity: '＋ intensitet',
	addNote: '＋ notat',
} as const

/** The sets popover (ADR 0027 §5.2): the uniform row, the per-set grid and the
 * rest-between-sets footer. `n` is the set's number from 1. */
export const TOKEN_EDITOR_SETS_LABELS = {
	setKind: 'Type sett',
	of: 'av',
	vary: 'Ulike sett ▸',
	collapse: '◂ Like sett',
	setsKind: (kind: string) => `Settene er nå ${kind.toLowerCase()}`,
	keptAsAuthored:
		'beholdt som skrevet — denne belastningen kan ikke endres her ennå',
	decreaseLoad: 'Senk belastningen',
	increaseLoad: 'Øk belastningen',
	loadKg: 'Belastning i kg',
	loadPct: 'Belastning i %1RM',
	loadUnit: 'Enhet for belastning',
	loadSet: (value: string, unit: 'kg' | 'pct') =>
		`Belastningen er satt til ${value}${unit === 'kg' ? ' kg' : ' % 1RM'}`,
	loadRemoved: 'Belastningen er fjernet',
	setKindOf: (n: number) => `Type for sett ${n}`,
	duplicateSet: (n: number) => `Lag en kopi av sett ${n}`,
	duplicateTitle: 'Kopier',
	removeSet: (n: number) => `Fjern sett ${n}`,
	removeTitle: 'Fjern',
	repsOf: (n: number) => `Repetisjoner i sett ${n}`,
	repsPlaceholder: 'rep',
	secondsOf: (n: number) => `Sekunder i sett ${n}`,
	secondsPlaceholder: 'sek',
	kgOf: (n: number) => `Kg i sett ${n}`,
	pctOf: (n: number) => `%1RM i sett ${n}`,
	setDuplicated: (n: number) => `Sett ${n} er kopiert`,
	setRemoved: (n: number) => `Sett ${n} er fjernet`,
	setAdded: 'Et sett er lagt til',
	addSet: '＋ legg til sett',
	restBetween: 'pause mellom settene',
	removeRest: 'Fjern pausen mellom settene',
	removeRestTitle: 'Fjern pausen',
	restRemoved: 'Pausen mellom settene er fjernet',
	restSet: (value: string) => `Pausen mellom settene er satt til ${value}`,
	addRest: '＋ pause mellom settene',
} as const

/**
 * The zero-step editor (§11.2–11.3): three seeds that teach the notation, and
 * the kind chooser. The ghost lines are drawn in the sentence's own Norwegian
 * words; the seeds still write the stored zone keys (`easy`, `threshold`).
 */
export const TOKEN_EDITOR_EMPTY_LABELS = {
	hints: {
		cardio: 'starter som 10 min',
		strength: 'starter som en øvelse, 1 × 5',
		rest: 'starter som 1 min hvile',
	},
	easy: 'Rolig økt',
	intervals: 'Intervaller',
	strength: 'Styrkeøkt',
	warmUp: 'Oppvarming',
	coolDown: 'Nedkjøling',
	fromScratch: 'eller begynn med et tomt steg ＋',
} as const

/**
 * The validation summary (§10) and the ⇄ rows' previews (§4.1). A preview
 * reads *brings back … / keeps … / sets aside …*, joined with ` — `.
 */
export const TOKEN_EDITOR_REPAIR_LABELS = {
	summary: 'Rett opp før du lagrer',
	errorCount: (count: number) =>
		count === 1 ? '1 ting må rettes' : `${count} ting må rettes`,
	bringsBack: (values: string) => `henter tilbake ${values}`,
	startsAsExercise: (sets: string) => `starter som en øvelse, ${sets}`,
	startsAs: (duration: string, rest: boolean) =>
		rest ? `starter som ${duration} hvile` : `starter som ${duration}`,
	keeps: (values: string) => `beholder ${values}`,
	note: 'notat',
	setsAside: (values: string) => `legger til side ${values}`,
	nothingToCarry: 'ingenting å ta med',
	itsValues: 'verdiene',
} as const

/**
 * A token's accessible name (§9): what it says, then where it sits —
 * `6 min varighet, steg 1 av 2, blokk 1 av 3`. The visible token is the
 * notation; this is its spoken form.
 */
export const TOKEN_EDITOR_TOKEN_NAMES = {
	inBlock: (block: number, blocks: number) => `blokk ${block} av ${blocks}`,
	inStep: (step: number, steps: number, block: number, blocks: number) =>
		`steg ${step} av ${steps}, blokk ${block} av ${blocks}`,
	duration: (text: string) => `${text} varighet`,
	distance: (text: string) => `${text} distanse`,
	repeat: (count: string | number) => `gjentas ${count} ganger`,
	/** A block in series, `3 × 13`: the series first, as the badge reads. */
	repeatSeries: (series: number, reps: number) =>
		`${series} serier, gjentas ${reps} ganger`,
	restBetweenSets: (text: string) => `${text} mellom settene`,
	note: (note: string) => `notat: ${note}`,
	intensity: (chip: string) => `${chip} intensitet`,
	intensityUnset: 'intensitet, ikke satt ennå',
	sets: (text: string) => `sett: ${text}`,
	setsUnset: 'sett, ikke satt ennå',
	discipline: (text: string) => `${text} idrett`,
} as const

/**
 * The intensity popover's provenance line (§7.3, B5): where a target's zone
 * placement comes from, or why it has none — `Z2 er 143–150 bpm etter
 * profilen din`, `≈ sone 3 for deg`. The chip's own text is the notation's.
 */
export const ZONE_PROVENANCE_LABELS = {
	cantPlace: (reason: string) => `kan ikke plasseres i en sone — ${reason}`,
	rpe: (chip: string, zone: number) => `${chip} ≈ innsats i sone ${zone}`,
	zoneResolves: (chip: string, range: string) =>
		`${chip} er ${range} etter profilen din`,
	zoneForYou: (zone: number) => `sone ${zone} for deg`,
	approx: (zone: number, range?: string | null) =>
		range
			? `≈ sone ${zone} for deg — ${range} etter profilen din`
			: `≈ sone ${zone} for deg`,
	notAZone: (label: string) => `«${label}» er ikke en sone i sonesystemet ditt`,
	noZoneSystem: 'ingen sonesystem valgt i innstillingene',
	noThresholds: 'ingen terskler i innstillingene',
	missingInSettings: (name: string) => `${name} mangler i innstillingene`,
	noLactate: (recipe: string) =>
		`${recipe} oppgir ingen laktat for den verdien`,
	noMap: (channel: string) =>
		`målet lar seg ikke plassere i sonene dine for ${channel}`,
	/** A recipe's anchor threshold, by name. */
	anchors: {
		ftp: 'FTP',
		runPower: 'løpewatt',
		lthr: 'terskelpuls',
		maxHr: 'makspuls',
		thresholdPace: 'terskelfart',
		css: 'CSS',
	} as Record<string, string>,
	/** A threshold the resolver names as missing (`Max HR is not
	 * configured`), keyed lower-case; an unknown name passes through. */
	thresholds: {
		ftp: 'FTP',
		map: 'MAP',
		'max hr': 'makspuls',
		lthr: 'terskelpuls',
		'threshold pace': 'terskelfart',
		'critical power': 'kritisk watt',
		'run power': 'løpewatt',
		css: 'CSS',
	} as Record<string, string>,
	/** The channel a recipe's zones are read in. */
	channels: {
		ftp: 'watt',
		runPower: 'watt',
		lthr: 'puls',
		maxHr: 'puls',
		thresholdPace: 'fart',
		css: 'fart',
	} as Record<string, string>,
} as const

/**
 * The resolver's reason a target has no concrete numbers, in Norwegian:
 * `threshold pace is not configured` → `terskelfart mangler i
 * innstillingene`. The resolver (`intensity-target.ts`) speaks English for its
 * callers and tests; this reads its two known shapes on display and passes
 * anything else through unchanged.
 */
export function nbUnavailableReason(reason: string): string {
	const missing = /^(.+) is not configured$/.exec(reason)
	if (missing) {
		const name = missing[1]!
		return ZONE_PROVENANCE_LABELS.missingInSettings(
			ZONE_PROVENANCE_LABELS.thresholds[name.toLowerCase()] ?? name,
		)
	}
	if (reason.startsWith('No zone system')) {
		return ZONE_PROVENANCE_LABELS.noZoneSystem
	}
	return reason
}
