/**
 * Bibliotek and the strength surfaces (#505 round 2, ADR 0081): the catalogue,
 * the strength programs and their runner, the exercise list, strength records
 * and the lift page. Part of `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type {
	CatalogueLevel,
	CataloguePhase,
	CatalogueTier,
} from '../catalogue.ts'
import type { EquipmentId } from '../strength-log.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { CATALOGUE_GOAL_EVENT_LABELS } from './vocabulary.ts'

/**
 * Bibliotek (spec #505 story 58): the hub that names the catalogue, the
 * strength programs and the athlete's own lifts — a section of Plan since ADR
 * 0101, no longer a tab. The pages it opens keep their own (English) words
 * until they are redesigned (ADR 0081 §4).
 */
export const LIBRARY_LABELS = {
	title: 'Bibliotek',
	catalogue: 'Katalog',
	catalogueDetail: 'Ferdige økter du kan ta inn i uka di.',
	programs: 'Styrkeprogrammer',
	programsDetail: 'Programmer som setter neste vekt ut fra forrige logg.',
	recentLifts: 'Dine løft',
	noExercises:
		'Løftene du legger inn i en økt vises her, hver med sin historikk.',
	allExercises: 'Alle øvelser',
	allExercisesDetail: 'Hele øvelsesbanken, med søk.',
} as const

/**
 * Bibliotek's exercise list (spec #505 story 58): every exercise an athlete can
 * put in a session, searchable by name, each opening its history.
 */
export const EXERCISE_LIST_LABELS = {
	search: 'Søk etter øvelse',
	searchButton: 'Søk',
	count: (count: number) => (count === 1 ? '1 øvelse' : `${count} øvelser`),
	none: (query: string) => `Ingen øvelse heter noe med «${query}».`,
	own: 'egen',
} as const

// ===========================================================================
// Bibliotek and the strength surfaces (#505 round 2, PR B + C; ADR 0081). The
// pages Bibliotek opens — the Catalogue, the strength programs, the exercise
// list — and the strength surfaces behind them: starting weights, the program
// overview, the runner's presenter sentences, the rest bar, the outcome panel
// and the lift chart. One section of its own so the area PRs that also add to
// this file merge cleanly. Words only: kilos arrive written by `formatNbKg`.
// ===========================================================================

/** The Catalogue's phases, as Sesong names them (`nbPhaseName`). */
export const NB_CATALOGUE_PHASE_LABELS: Record<CataloguePhase, string> = {
	base: 'Grunntrening',
	build: 'Oppbygging',
	peak: 'Spissing',
	taper: 'Nedtrapping',
	'race-week': 'Konkurranseuke',
}

/** The goal events, as the Catalogue names them: one Norwegian list. */
export const NB_CATALOGUE_GOAL_EVENT_LABELS = CATALOGUE_GOAL_EVENT_LABELS

/** The three level floors. "og opp" is the card's word, not the label's. */
export const NB_CATALOGUE_LEVEL_LABELS: Record<CatalogueLevel, string> = {
	beginner: 'Nybegynner',
	intermediate: 'Viderekommen',
	advanced: 'Erfaren',
}

/** Who wrote a row. `stock` is the app's own name: that is the badge's claim. */
export const NB_CATALOGUE_TIER_LABELS: Record<CatalogueTier, string> = {
	stock: 'trainm8',
	community: 'Fellesskapet',
	mine: 'Dine',
}

/** The Catalogue page (`/training/catalogue`). */
export const CATALOGUE_LABELS = {
	metaTitle: 'Katalog | Trainm8',
	title: 'Katalog',
	intro:
		'Ferdige økter du kan ta inn i uka: trainm8 sine, andre utøveres og dine egne.',
	sessionsHeading: 'Økter',
	searchLabel: 'Søk i katalogen',
	searchPlaceholder: 'Søk etter økt',
	searchButton: 'Søk',
	filters: 'Filter',
	allSessions: 'Alle økter',
	facets: {
		discipline: 'Idrett',
		anyDiscipline: 'Alle idretter',
		archetype: 'Type økt',
		anyArchetype: 'Alle typer',
		phase: 'Fase',
		anyPhase: 'Alle faser',
		goalEvent: 'Målløp',
		anyGoalEvent: 'Alle løp',
		level: 'Passer for',
		anyLevel: 'Alle nivåer',
		tier: 'Skrevet av',
		anyTier: 'Alle',
	},
	savedOnly: 'Bare økter jeg har lagret',
	apply: 'Bruk filter',
	clear: 'Nullstill',
	/** The active-filter summary's words for the facets that are not a label. */
	suits: (level: string) => `Passer for ${level.toLowerCase()}`,
	savedFilter: 'Lagret',
	query: (q: string) => `«${q}»`,
	/** `152 økter`, `12 økter passer filtrene · viser 12`. */
	resultLine: (total: number, filtered: boolean, shown: number) =>
		`${total === 1 ? '1 økt' : `${total} økter`}${filtered ? ' passer filtrene' : ''}${shown < total ? ` · viser ${shown}` : ''}`,
	noneMatch: (filters: string) => `Ingen økter passer ${filters}.`,
	empty: 'Katalogen er tom ennå.',
	showMore: 'Vis flere',
	levelAndUp: (level: string) => `${level} og opp`,
	place: 'Legg i kalenderen',
	save: 'Lagre',
	saved: 'Lagret',
	report: 'Rapporter',
	adaptedFrom: (citation: string) =>
		`Bygd på ${citation}. Den kilden hører til økta denne ble kopiert fra, ikke til denne.`,
	yourSessions: 'Dine økter',
	publishIntro:
		'Publiserer du en økt, kan alle utøvere ta den, under et navn du velger. trainm8 går ikke gjennom og står ikke inne for det du publiserer.',
	noOwn: 'Du har ikke skrevet en økt ennå.',
	publishState: {
		published: 'I katalogen',
		withdrawn: 'Trukket tilbake av deg',
		'taken-down': 'Fjernet av en moderator',
		unpublished: 'Ikke publisert',
	},
	manage: 'Administrer',
	publish: 'Publiser',
} as const

/**
 * The provenance slot in Norwegian (`provenance.ts` keeps its English for the
 * surfaces that still speak it). One sentence per kind and the same asymmetry:
 * only a community row carries the non-vouch.
 */
export const NB_PROVENANCE_LABELS = {
	source: (citation: string) => `Kilde: ${citation}`,
	convention:
		'Vanlig trenerpraksis — trainm8 viser ikke til noen publisert kilde for denne økta.',
	handWritten: 'Skrevet av trainm8 — ingen publisert kilde, og ingen hevdet.',
	publishedBy: (name: string) => `Publisert av ${name}`,
	unnamedPublisher: 'Publisert av en utøver — trainm8 kan ikke si hvem.',
	unsourced: 'Ingen kilde kunne leses for denne økta.',
	nonVouch:
		'Publisert av en utøver. trainm8 har ikke gått gjennom eller stilt seg bak denne økta.',
} as const

/** The strength programs page (`/training/programs`). */
export const PROGRAMS_LABELS = {
	metaTitle: 'Styrkeprogrammer | Trainm8',
	intro:
		'Hvert program går ut fra vekta du løftet sist — aldri ut fra kalenderen.',
	empty:
		'Ingen programmer er lagt inn ennå, så det er ingenting å starte her — ikke noe du har gjort. Du kan fortsatt',
	emptyCatalogue: 'ta en økt fra katalogen',
	emptyOr: 'eller',
	emptyWrite: 'skrive en selv',
	running: 'I gang',
	openRun: 'Åpne dagens økt',
	manageRun: 'Rett en vekt eller avslutt programmet',
	start: (name: string) => `Start ${name}`,
	source: 'Kilde',
	unattributed: 'Uten opphav',
	/** `2 dagsoppsett · Økt A / Økt B`. */
	shape: (dayIds: readonly string[]) =>
		`${dayIds.length === 1 ? '1 dagsoppsett' : `${dayIds.length} dagsoppsett`} · ${dayIds.map((day) => `Økt ${day}`).join(' / ')}`,
} as const

/**
 * A program's own rules in the card's width: the increment and the **Stall
 * Response**. Kilos and percentages arrive already written (`formatNbKg`).
 */
export const PROGRAM_RULE_LABELS = {
	firstStall: 'ved første stopp',
	afterStalls: (n: number) => `etter ${n} stopp`,
	stallCut: (pct: string, after: string) => `−${pct} % ${after}`,
	rollback: (sessions: number, after: string) =>
		`${sessions === 1 ? '1 økt' : `${sessions} økter`} tilbake ${after}`,
	reEstimate: (estimator: string, after: string) =>
		`ny 1RM-beregning (${estimator}) ${after}`,
	absolute: (kg: string) => `+${kg} kg`,
	pctOfLastTopSet: (pct: string) => `+${pct} % av siste toppsett`,
	byAmrapReps: (table: string) => `etter repsene i siste sett (${table})`,
	amrapRow: (minReps: number, kg: string) => `${minReps}+ → +${kg} kg`,
	multipliedOnAmrap: (kg: string, reps: number) =>
		`+${kg} kg, dobbelt ved ${reps}+ reps`,
	/** Arket M's lift table: what the next made session adds. */
	next: (increment: string) => `neste: ${increment}`,
} as const

/**
 * Each seeded program's provenance note in Norwegian, keyed `key:variantId`.
 * Display only: the stored note stays the record, and a program not listed
 * here shows its note as stored.
 */
export const NB_PROGRAM_PROVENANCE_NOTES: Record<string, string> = {
	'stronglifts-5x5:basic':
		'Økningene og kuttet på −10 % etter tre økter som kom til kort er StrongLifts’ egne publiserte standarder. Prosenten er programkonvensjon, uten studier bak. Stigen 5×5 → 3×5 → 1×5 er ikke StrongLifts’ regel og er ikke bygd inn.',
	'starting-strength:phase-1':
		'Nullstillingen kutter vekta og gjør økningen mindre. Hvor mange bom som går før en nullstilling er ikke publisert; familiens tre brukes.',
	'greyskull-lp:base':
		'GreySkulls primærkilde er en betalt e-bok. Den doble økningen ved 10+ reps og kuttet på ca. 10 % er rekonstruert fra sekundærkilder.',
}

/** Putting one Catalogue session on the calendar (`catalogue.place`). */
export const CATALOGUE_PLACE_LABELS = {
	metaTitle: 'Legg i kalenderen | Trainm8',
	title: 'Legg i kalenderen',
	whichDay: 'Hvilken dag?',
	defaultTime: 'Den legges på ditt vanlige treningstidspunkt.',
	submit: 'Legg i kalenderen',
	cancel: 'Avbryt',
	ownCopy: 'Du får din egen kopi. Endrer du den, endres ikke katalogens.',
	errors: {
		badDate: 'Velg en dag.',
		gone: 'Den økta er ikke i katalogen lenger.',
	},
} as const

/** Publishing one's own session to the Catalogue (`catalogue.publish`). */
export const CATALOGUE_PUBLISH_LABELS = {
	metaTitle: 'Publiser i katalogen | Trainm8',
	title: 'Publiser i katalogen',
	whereFrom: 'Hvor denne kommer fra',
	forkedFrom: (citation: string) =>
		`Du kopierte denne fra en økt trainm8 har med, med kilde ${citation}.`,
	sourceStays:
		'Den kilden blir hos originalen. Økta du publiserer viser den som «bygd på» og aldri som sin egen — en økt en utøver publiserer kan aldri ha en kilde.',
	removed: 'Fjernet fra katalogen',
	removedOn: (date: string) => `En moderator fjernet økta ${date}.`,
	reason: (reason: string) => `Grunn: ${reason}`,
	removedNote:
		'Selve økta er urørt og fortsatt din — den er ute av katalogen, ikke ute av treningshistorikken din. Den kan ikke publiseres igjen.',
	inCatalogue: 'I katalogen',
	publishedAs: (name: string, date: string) =>
		`Publisert som ${name} ${date}. Alle kan rapportere den; en moderator kan fjerne den.`,
	withdraw: 'Trekk tilbake fra katalogen',
	backToCatalogue: 'Tilbake til katalogen',
	nameLabel: 'Publiser under navnet',
	kindLabel: 'Hva slags økt er det?',
	pickOne: 'Velg én',
	levelLabel: 'Laveste nivå den passer for (valgfritt)',
	anyLevel: 'Alle nivåer',
	beforeYouPublish: 'Før du publiserer',
	everyAthlete:
		'Alle utøvere kan lese den, og alle kan rapportere den. En moderator som gir en rapport medhold, fjerner den fra katalogen for godt — økta er fortsatt din, men den kan ikke publiseres igjen.',
	update: 'Oppdater',
	publish: 'Publiser',
	cancel: 'Avbryt',
	errors: {
		name: 'Velg navnet økta publiseres under',
		kind: 'Si hva slags økt dette er',
		takenDown:
			'En moderator fjernet denne økta fra katalogen. Den kan ikke publiseres igjen.',
		notYours: 'Dette er ikke din økt å publisere.',
		stock: 'trainm8 har med denne økta, så den er allerede i katalogen.',
		gone: 'Den økta finnes ikke lenger.',
	},
} as const

/** The report reasons, as the athlete picks them (keys stored as-is). */
export const NB_REPORT_REASON_LABELS: Record<string, string> = {
	unsafe: 'Utrygg å trene',
	miscited: 'Viser til en kilde den ikke har',
	spam: 'Spam, eller ikke en treningsøkt',
	abusive: 'Krenkende eller støtende',
	other: 'Noe annet',
}

export const NB_REPORT_REASON_HINTS: Record<string, string> = {
	unsafe: 'Den som fulgte forskriften, kunne blitt skadet.',
	miscited: 'Den nevner en trener, bok eller studie den ikke kommer fra.',
	spam: 'Reklame, eller en økt som ikke er en økt.',
	abusive: 'Tittelen, beskrivelsen eller notatene er krenkende.',
	other: 'Si hva som er galt — denne trenger en beskrivelse.',
}

/** Reporting a community session (`catalogue.report`). */
export const CATALOGUE_REPORT_LABELS = {
	metaTitle: 'Rapporter en økt | Trainm8',
	title: 'Rapporter denne økta',
	already:
		'Du har allerede rapportert denne økta. Den er skjult i katalogen din, og en moderator har den.',
	backToCatalogue: 'Tilbake til katalogen',
	whatIsWrong: 'Hva er galt med den?',
	detail: 'Noe mer en moderator bør vite?',
	whatReportingDoes: 'Hva en rapport gjør',
	hides:
		'Den skjuler økta i katalogen din med en gang, og sender den til en moderator.',
	notForOthers:
		'Den fjerner den ikke for noen andre — det avgjør en moderator, så ingen utøver kan ta ned en annens økt.',
	send: 'Send rapport',
	cancel: 'Avbryt',
	errors: {
		reason: 'Velg hva som er galt med den',
		detail: 'Si hva som er galt — «noe annet» trenger en beskrivelse',
		yourOwn: 'Dette er din egen økt — trekk den tilbake i stedet.',
		notPublic: 'Den økta er ikke i katalogen.',
		gone: 'Den økta finnes ikke lenger.',
	},
} as const

/** Bibliotek's exercise list, beside `EXERCISE_LIST_LABELS`. */
export const EXERCISE_SEARCH_LABELS = {
	/** Beside a row found by another of its names: `«knebøy»`. */
	alias: (alias: string) => `«${alias}»`,
} as const

/** Starting weights (`programs.$programId.start`). Kilos arrive as `82,5`. */
export const PROGRAM_START_LABELS = {
	metaTitle: (program: string) => `Start ${program} | Trainm8`,
	back: 'Tilbake til programmene',
	heading: 'Startvekter',
	intro:
		'Ett tall per løft. Etter dette bestemmer programmet vekta ut fra det du logger.',
	unit: 'kg',
	submit: (program: string) => `Start ${program}`,
	hints: {
		emptyBar: (program: string, kg: string) =>
			`${program} starter her på ${kg} kg — den tomme stanga.`,
		pullRange: (low: string, high: string) =>
			`Den nedre enden av det publiserte spennet på ${low}–${high} kg.`,
		published: (program: string, kg: string) =>
			`${program} oppgir ${kg} kg her. Skriv over hvis du vet bedre.`,
		repMax: (program: string, reps: number) =>
			`${program} sier: en vekt du kunne løftet ${reps} ganger.`,
		none: (program: string) =>
			`${program} oppgir ingen startvekt for dette løftet. La feltet stå tomt, så startes det ikke.`,
	},
	errors: {
		weight: 'En startvekt må være et positivt antall kilo.',
		form: 'Skjemaet ga ikke mening.',
		gone: 'Det programmet finnes ikke lenger.',
		atLeastOne: 'Gi minst ett løft en startvekt.',
	},
} as const

/** The program overview (`programs.run.$instanceId`). */
export const PROGRAM_RUN_LABELS = {
	metaFallback: 'Program',
	running: 'I gang. Neste vekt kommer fra forrige logg, ikke fra kalenderen.',
	notRunning: (status: string) =>
		status === 'ended'
			? 'Programmet er avsluttet.'
			: 'Programmet står på pause.',
	today: (dayId: string | null) => (dayId ? `I dag: Økt ${dayId}` : 'I dag'),
	noWeightYet: 'ingen vekt ennå',
	stamped:
		'Dette er vektene som står på økta du har åpen, og det er dem settene spør etter.',
	stampedLogged:
		'Siden sett allerede er logget på den, gjelder en endret arbeidsvekt under fra neste økt.',
	stampedOpen:
		'Ingenting er logget på den ennå, så en endret arbeidsvekt under settes på økta neste gang du åpner den.',
	next: (dayId: string) => `Neste etter i dag: Økt ${dayId}.`,
	openToday: 'Åpne dagens økt',
	yourWeights: 'Vektene dine',
	/** Plain words for the Stall Count (the audit's "jargon in English"). */
	shortInARow: (n: number) =>
		n === 1 ? '1 økt til kort' : `${n} økter på rad til kort`,
	weightFor: (lift: string) => `Arbeidsvekt for ${lift} i kg`,
	saveWeight: 'Lagre vekt',
	stop: 'Avslutt programmet',
	stopNote: 'Settene du har logget i programmet blir liggende.',
	stopped:
		'Programmet er avsluttet. Alle settene du logget i det blir liggende.',
	weightSaved: 'Arbeidsvekta er lagret.',
	stallNotice: (program: string) =>
		`Du kom til kort på dette løftet mange nok økter på rad til at ${program} sier: ta vekta ned og bygg den opp igjen.`,
	errors: {
		nonsense: 'Det ga ikke mening.',
		gone: 'Programmet finnes ikke lenger.',
		liftGone: 'Det løftet finnes ikke lenger.',
		positive: 'En arbeidsvekt må være et positivt antall kilo.',
		tooHigh: (max: number) =>
			`En arbeidsvekt må være ${max} kg eller mindre — over det er det en skrivefeil, ikke et løft.`,
	},
} as const

/** The three **Stall Responses**, as the athlete reads them. */
export const NB_STALL_RESPONSE_LABELS: Record<string, string> = {
	stallCut: 'Vekta kuttes',
	weightRollback: 'Tilbake i vekt',
	anchorReEstimate: 'Ny 1RM-beregning',
}

/** The runner presenter's sentences (`__runner-presenter.ts`). */
export const STRENGTH_RUNNER_LABELS = {
	reps: (n: number) => `${n} reps`,
	seconds: (n: number) => `${n} s`,
	bodyweight: 'kroppsvekt',
	bodyweightPlus: (kg: string) => `kroppsvekt + ${kg} kg`,
	/** A warm-up chip's bodyweight, in the chip's width. */
	bodyweightShort: 'kv',
	rackGap: (made: string, asked: string) =>
		`Gymmet ditt får til ${made} kg, ikke ${asked} kg.`,
	logSet: (position: number, lift: string) =>
		`Logg sett ${position} av ${lift}`,
	loggedSet: (position: number, lift: string) =>
		`Logget sett ${position} av ${lift}`,
	counter: (done: number, total: number) => `${done} av ${total} logget`,
	warmup: (on: boolean, position: number, lift: string, label: string) =>
		`${on ? 'Logget' : 'Logg'} oppvarming ${position} av ${lift}, ${label}`,
	restOver: 'over pausen',
	restReasons: {
		'made-the-target': 'pause',
		'missed-the-target': 'lengre pause etter et sett til kort',
		'between-warmup-sets': 'ingen pause mellom oppvarmingssett',
		'before-the-last-warmup-set': 'pause før siste oppvarmingssett',
	},
	held: (kg: string, count: number, spelled: string) =>
		count === 1
			? `${kg} kg står: en økt kom til kort.`
			: `${kg} kg står: ${spelled} økter på rad kom til kort.`,
	working: (kg: string, count: number, spelled: string) =>
		count === 1
			? `${kg} kg er arbeidsvekta di etter én fullført økt.`
			: `${kg} kg er arbeidsvekta di etter ${spelled} fullførte økter.`,
	workingFresh: (kg: string) =>
		`${kg} kg er arbeidsvekta di. Ingenting er logget for dette løftet i programmet ennå.`,
	numberWords: [
		'null',
		'én',
		'to',
		'tre',
		'fire',
		'fem',
		'seks',
		'sju',
		'åtte',
		'ni',
		'ti',
		'elleve',
		'tolv',
	],
	plates: (gym: string, variant: string | null) =>
		`Skivene regnes ut fra ${gym}${variant ? ` for ${variant}` : ''}.`,
	timerLimit: 'Pausetimeren tåler en låst telefon, men ikke en lukket fane.',
	history: 'Dette løftet over tid',
	lastTime: (work: string) => `Sist ${work}`,
	/** A logged Load Value in a lift line (`loadValueText`'s Norwegian twin). */
	load: {
		external: (kg: string) => `${kg} kg`,
		perSide: (sides: number, kg: string) => `${sides} × ${kg} kg`,
		bodyweight: 'kroppsvekt',
		bodyweightPlus: (kg: string) => `kroppsvekt + ${kg} kg`,
		assisted: (kg: string) => `assistert − ${kg} kg`,
		level: (level: number) => `nivå ${level}`,
		band: (band: string) => `strikk ${band}`,
		unloaded: 'uten vekt',
	},
} as const

/** Why a lift's circles cannot be tapped — the runner's sub-line. */
export const WORKING_LOAD_LABELS = {
	noSets: 'løftet har ingen sett å logge',
	noLoad:
		'ingen vekt er foreskrevet for løftet, og et trykk kan ikke finne på en',
	noKilos: 'forskriften blir ikke til kilo, så det er ingenting å trykke',
	notTappable: (load: string) => `${load} kan ikke logges med et trykk`,
	thisLoad: 'denne belastningen',
} as const

/** The outcome panel: what you lift next time (`__outcome-panel*`). */
export const OUTCOME_LABELS = {
	heading: 'Hva du løfter neste gang',
	notInProgram:
		'Økta er fullført. Den hører ikke til et program, så ingenting rykket fram.',
	seeOverTime: (lift: string) => `Se ${lift} over tid`,
	backToToday: 'Tilbake til I dag',
	backToSets: 'Tilbake til settene',
	headline: {
		moved: (lift: string, from: string, to: string) =>
			`${lift} ${from} kg → ${to} kg`,
		movedTrainingMax: (lift: string, from: string, to: string) =>
			`${lift} treningsmaks ${from} kg → ${to} kg`,
		stays: (lift: string, kg: string) => `${lift} står på ${kg} kg`,
		unchanged: (lift: string, kg: string) => `${lift} uendret på ${kg} kg`,
		unreadable: (lift: string, kg: string, sets: string, prescribed: string) =>
			`${lift} står på ${kg} kg — ${sets}, så de ${prescribed} kg som var foreskrevet kunne ikke sjekkes`,
		lighter: (lift: string, kg: string, logged: string, prescribed: string) =>
			`${lift} står på ${kg} kg — logget på ${logged} kg, foreskrevet ${prescribed} kg`,
	},
	unreadableSets: (all: boolean, count: number, of: number) =>
		all
			? 'ingen av settene ble logget med en kilo som kan sjekkes'
			: `${count} av de ${of} settene ble logget uten en kilo som kan sjekkes`,
	reason: {
		incremented: (delta: string) =>
			`Alle arbeidssettene ble gjort, så vekta går opp ${delta} kg.`,
		repeated: 'Vekta står til neste økt.',
		repeatedShort: 'Økta kom til kort, så vekta står til neste økt.',
		stalled:
			'Løftet kom til kort for mange økter på rad, så programmet tar vekta ned og bygger den opp igjen.',
		stalledTrainingMax:
			'Løftet kom til kort for mange økter på rad, så programmet senker treningsmaksen og bygger den opp igjen.',
		unavailable:
			'Programmet skulle ha justert vekta, men manglet det det trengte for å gjøre det. Ingenting ble endret.',
		unreadable:
			'Logg settene som kilo på stanga, så kan neste økt leses. Ingenting ble endret.',
		lighter:
			'Settene ble løftet lettere enn foreskrevet. Det teller verken som fullført eller som til kort, så vekta står.',
		skipped:
			'Ingen arbeidssett ble logget for dette løftet, så ingenting endret seg.',
	},
	unreadableLabel: 'Kunne ikke leses',
	lighterLabel: 'Lettere enn foreskrevet',
	cutProvenance: (pct: string, program: string | null) =>
		`Kuttet på ${pct} % er ${program ? `${program} sin` : 'programmets'} egen publiserte konvensjon. Ingen studier støtter det.`,
} as const

/** The lift-over-time chart (`__lift-chart.tsx`). */
export const LIFT_CHART_LABELS = {
	/** Over a session whose load could not be read as a kilo: no bar, and this
	 * word where it would stand (ADR 0030 rule 1). The data table says it in
	 * full (`EXERCISE_PAGE_LABELS.chart.noBar`). */
	unavailable: 'ingen',
} as const

/** The rest bar (`__rest-bar.tsx`). */
export const REST_BAR_LABELS = {
	region: 'Pausetimer',
	dismiss: 'Lukk pausetimeren',
} as const

/**
 * Owner decision 10: Finish with sets still untapped asks first, so an untapped
 * set never silently counts as made or as missed.
 */
export const FINISH_UNTAPPED_LABELS = {
	question: (count: number) =>
		`${count} sett er ikke logget: marker som ikke gjort, eller fortsett?`,
	markNotDone: 'Marker som ikke gjort',
	keepGoing: 'Fortsett',
	refused: (count: number) =>
		`${count} sett er ikke logget. Logg dem, eller marker dem som ikke gjort.`,
} as const

// ===========================================================================
// Strength records and the lift page (#505 round 2, r2-records; ADR 0081).
// What a strength record calls itself (`strength/records.ts`), read in the
// runner's PR banner and on the lift page, and the lift page's own words
// (`exercises.$exerciseId`, its presenter and its chart). One section of its
// own so the area PRs that also add to this file merge cleanly. Words only:
// kilos arrive written by `formatNbKg`, and nothing stored is a word from here.
// ===========================================================================

/** A strength record's headline, gain and caveat (`strength/records.ts`). */
export const STRENGTH_RECORD_LABELS = {
	/** The bar's heaviest working set — what an athlete means by "my squat". */
	heaviest: 'Tyngste noensinne',
	/** Any other load basis names itself in the headline: `Tyngste sett per hånd`. */
	heaviestQualified: (qualifier: string) => `Tyngste sett ${qualifier}`,
	/** A rep-max record: the best load at *exactly* this many reps. */
	repMax: (reps: number, qualifier: string | null) =>
		`Beste sett på ${reps} ${reps === 1 ? 'rep' : 'reps'}${qualifier ? ` ${qualifier}` : ''}`,
	estimatedOneRm: 'Beste anslåtte 1RM',
	/** A single: no equation touched it, so it is not an estimate. */
	testedOneRm: 'Beste testede 1RM',
	level: 'Beste nivå',
	/** The load basis inside a headline. The bar takes none. */
	qualifiers: {
		perHand: 'per hånd',
		bodyweightDerived: 'med kroppsvekt',
	},
	/** Nothing came before this reading. */
	firstTime: 'første gang',
	/** Inside the debut window: the best of every qualifying set, said quietly. */
	bestSoFar: 'best hittil',
	upKg: (kg: string) => `opp ${kg} kg`,
	upLevels: (levels: string, count: number) =>
		`opp ${levels} ${count === 1 ? 'nivå' : 'nivåer'}`,
	/** A tested 1RM's number is the load on the bar (`one-rm.ts`'s `tested`). */
	testedSingle: 'vekten som ble løftet',
	notes: {
		noKilos: 'Uten kilo — dette måles bare mot seg selv.',
		perHand: 'Kilo per hånd — dette måles bare mot andre sett per hånd.',
		bodyweightDerived:
			'Med kroppsvekten din — dette måles bare mot andre sett med kroppsvekt.',
		assisted:
			'Et assistert sett gir ingen rekord: tallet er kroppsvekten din minus hjelpen, så det stiger når arbeidet blir lettere.',
	},
} as const

/**
 * A variant tab on the lift page — one per equipment, each its own history.
 * Complete over `EQUIPMENT_IDS`; the picker's chips (`nbEquipmentLabel`) use the
 * same words where the two overlap.
 */
export const NB_EQUIPMENT_VARIANT_LABELS: Record<EquipmentId, string> = {
	barbell: 'Stang',
	dumbbell: 'Manualer',
	kettlebell: 'Kettlebell',
	machine: 'Maskin',
	cable: 'Kabel',
	'smith-machine': 'Smithmaskin',
	'trap-bar': 'Trap bar',
	'ez-bar': 'EZ-stang',
	bodyweight: 'Kroppsvekt',
	'assisted-machine': 'Assistert maskin',
	band: 'Strikk',
	'medicine-ball': 'Medisinball',
	sled: 'Slede',
	suspension: 'Slynge',
	other: 'Annet',
}

/** The lift page (`/training/exercises/:id`): this lift over time. */
export const EXERCISE_PAGE_LABELS = {
	metaTitle: (exercise: string) => `${exercise} | Trainm8`,
	metaFallback: 'Øvelse | Trainm8',
	workingWeight: 'Arbeidsvekt',
	estOneRm: 'Anslått 1RM',
	/** The set an estimate was read off: `fra 82,5 kg × 5`. */
	from: (set: string) => `fra ${set}`,
	topSet: (set: string) => `Toppsett: ${set}`,
	fillsIn: 'Logg et arbeidssett, så fylles siden ut.',
	yourNumbers: 'Tallene dine for dette løftet',
	variants: 'Varianter',
	allVariants: 'Alle varianter',
	empty:
		'Ingen arbeidssett er logget på dette løftet ennå, så det er ingenting å lese.',
	records: 'Rekorder',
	noRecords: 'Ingenting her kan leses som en rekord ennå.',
	noOneRm: (reason: string) => `Ingen anslått 1RM: ${reason}`,
	/** Beside an estimate: `Epley/Welday-likningen`. */
	equation: (name: string) => `${name}-likningen`,
	estimatorNote: (name: string) =>
		`Anslått 1RM bruker ${name}-likningen. Et anslag er en modell, ikke et løft.`,
	level: (level: string) => `nivå ${level}`,
	history: 'Hver økt med dette løftet',
	/** `sett` is its own plural. */
	workingSets: (count: number) => `${count} arbeidssett`,
	notFound: 'Vi fant ikke den øvelsen.',
	lastTime: {
		first: 'Første gang på dette løftet',
		today: 'Sist: i dag',
		yesterday: 'Sist: i går',
		days: (days: number) => `Sist: for ${days} dager siden`,
		weeks: (weeks: number) =>
			`Sist: for ${weeks} ${weeks === 1 ? 'uke' : 'uker'} siden`,
	},
	/** The chart's words: its name, its data table and the notes under it. */
	chart: {
		label: (exercise: string, sessions: number, cuts: number) =>
			`${exercise}: toppsett over ${sessions} ${sessions === 1 ? 'økt' : 'økter'}, eldste først${
				cuts === 0 ? '' : `, med ${cuts} vektkutt merket`
			}.`,
		caption: (exercise: string) =>
			`${exercise}, toppsett per økt, eldste først`,
		columns: ['Økt', 'Dato', 'Toppsett', 'Merket'],
		session: (ordinal: number) => `Økt ${ordinal}`,
		/** Under every third bar: which session it is. */
		tick: (ordinal: number) => `${ordinal}`,
		noBar: 'Ingen søyle — ingen sammenlignbar kilo',
		latest: 'Siste',
		unmarked: '—',
		stallCut: (from: string, to: string) =>
			`vekta kuttet, ${from} kg → ${to} kg`,
		stallNote: (ordinal: number, cut: string) => `Økt ${ordinal} — ${cut}`,
	},
} as const
