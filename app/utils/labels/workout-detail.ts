/**
 * The Workout Detail View, the full editor and the strength runner's chrome
 * (#505 round 2, ADR 0081). Part of `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { SessionArchetype } from '../catalogue.ts'
import type { AdherenceTone } from '../load/adherence.ts'
import type { StepKind, WorkoutIntent } from '../workout-schema.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize } from './_helpers.ts'

// ---------------------------------------------------------------------------
// Workout authoring structure mode
// ---------------------------------------------------------------------------

export const STRUCTURE_MODE_LABELS = {
	simple: 'Simple',
	structured: 'Structured',
} as const satisfies Record<'simple' | 'structured', string>

// ---------------------------------------------------------------------------
// The Workout Detail View, the full editor and the runner's own chrome
// (#505 round 2, ADR 0081). One section for the pages "Se økta" opens:
// `/training/sessions/$id` (read and inline edit), `/training/sessions/new`,
// the block sheet, the exercise picker, the intensity popover and the strength
// runner's route. The parser's glue words and the token editor's own words are
// not here: they belong to the sentence (ADR 0027), not to these pages.
// ---------------------------------------------------------------------------

/**
 * The sixteen **Session Archetypes** in Norwegian, as the detail view's
 * metadata line and its comparison card name them. The English
 * {@link SESSION_ARCHETYPE_LABELS} stays for the surfaces that still speak it
 * (the Catalogue, plan generation) until they move.
 */
export const NB_SESSION_ARCHETYPE_LABELS: Record<SessionArchetype, string> = {
	recovery: 'Restitusjon',
	easy: 'Rolig',
	long: 'Langtur',
	steady: 'Jevn',
	tempo: 'Tempo',
	threshold: 'Terskel',
	'sub-threshold': 'Under terskel',
	'vo2max-long': 'VO₂maks (lange drag)',
	'vo2max-short': 'VO₂maks (korte drag)',
	anaerobic: 'Anaerob',
	neuromuscular: 'Nevromuskulær',
	fartlek: 'Fartlek',
	'race-simulation': 'Konkurransesimulering',
	test: 'Test',
	brick: 'Kombiøkt',
	technique: 'Teknikk',
}

/** A Workout's intent in Norwegian: the new-session picker and the fallback
 * token in the detail view's metadata line. */
export const NB_INTENT_LABELS: Record<WorkoutIntent, string> = {
	recovery: 'Restitusjon',
	endurance: 'Utholdenhet',
	tempo: 'Tempo',
	threshold: 'Terskel',
	vo2max: 'VO₂maks',
	anaerobic: 'Anaerob',
	neuromuscular: 'Nevromuskulær',
	race: 'Konkurranse',
	test: 'Test',
	technique: 'Teknikk',
	'strength-max': 'Styrke — maks',
	'strength-hypertrophy': 'Styrke — muskelvekst',
	'strength-power': 'Styrke — eksplosiv',
	'strength-endurance': 'Styrke — utholdenhet',
	mobility: 'Bevegelighet',
}

/** A step's kind, as the block sheet's kind picker and add row name it. */
export const NB_STEP_KIND_LABELS: Record<StepKind, string> = {
	cardio: 'Kondisjon',
	strength: 'Styrke',
	rest: 'Pause',
}

/**
 * A session's stored status, as the detail view's badge says it. The words
 * I dag already uses for a done and a missed session (`gjort`, `ikke gjort`),
 * so the badge and the row the athlete came from agree. An unknown status is
 * capitalized rather than shown raw.
 */
export function nbSessionStatusLabel(status: string): string {
	return (
		(
			{
				scheduled: 'Planlagt',
				completed: 'Gjort',
				missed: 'Ikke gjort',
				skipped: 'Hoppet over',
			} as Record<string, string>
		)[status] ?? capitalize(status)
	)
}

/** How sure Structure Detection or an archetype reading is, in one word. */
export function nbConfidenceLabel(grade: string): string {
	return (
		({ high: 'høy', medium: 'middels', low: 'lav' } as Record<string, string>)[
			grade
		] ?? grade
	)
}

/** A primary muscle, as the exercise picker's chips and rows name it. */
export function nbMuscleLabel(muscle: string): string {
	return (
		(
			{
				chest: 'Bryst',
				back: 'Rygg',
				shoulders: 'Skuldre',
				biceps: 'Biceps',
				triceps: 'Triceps',
				forearms: 'Underarmer',
				abs: 'Mage',
				obliques: 'Skrå magemuskler',
				'lower-back': 'Korsrygg',
				glutes: 'Sete',
				quads: 'Forside lår',
				hamstrings: 'Bakside lår',
				calves: 'Legger',
				'hip-flexors': 'Hoftebøyere',
				'full-body': 'Hele kroppen',
			} as Record<string, string>
		)[muscle] ?? capitalize(muscle.replace('-', ' '))
	)
}

/** A piece of equipment, as the exercise picker's filter chips name it. */
export function nbEquipmentLabel(equipment: string): string {
	return (
		(
			{
				barbell: 'Stang',
				dumbbell: 'Manualer',
				bodyweight: 'Kroppsvekt',
				other: 'Annet',
				cable: 'Kabel',
				machine: 'Maskin',
				kettlebell: 'Kettlebell',
				'medicine-ball': 'Medisinball',
				band: 'Strikk',
				'ez-bar': 'EZ-stang',
			} as Record<string, string>
		)[equipment] ?? capitalize(equipment.replace('-', ' '))
	)
}

/** The Workout Detail View's own words (`/training/sessions/$id`). */
export const WORKOUT_DETAIL_LABELS = {
	pageTitle: 'Økt',
	metaTitle: (title: string) => `${title} | Økt | Trainm8`,
	metaFallback: 'Økt | Trainm8',
	untitled: 'Økt uten navn',
	actions: {
		logSets: 'Logg settene',
		setsLogged: 'Sett logget',
		markMissed: 'Marker som ikke gjort',
		more: 'Mer',
		delete: 'Slett økta',
	},
	deleteDialog: {
		title: 'Slette økta?',
		body: 'Økta forsvinner fra treningshistorikken, med det som var planlagt og notatet du har skrevet. Det kan ikke angres.',
		keep: 'Behold økta',
		confirm: 'Slett økta',
	},
	/** The header's figures, in the sport's own unit first (Arket M). */
	summaryName: 'Økta i tall',
	detected: 'funnet',
	detectedWith: (confidence: string) => `funnet · ${confidence}`,
	readWith: (confidence: string) => `lest · ${confidence}`,
	recorded: 'Registrert',
	target: (text: string) => `Mål ${text}`,
	archetype: {
		/** The absence itself, short enough for the metadata line (#437). */
		unread: 'Ingen økttype',
		read: 'Lest av økta',
		unreadTitle: 'For lite til å si hva slags økt',
	},
	noStructure:
		'Ingen struktur funnet: opptaket var jevn innsats, så ingen intervaller ble lagt inn.',
	redetect: {
		detectedNote:
			'Funnet automatisk i opptaket. Let på nytt når du har oppdatert tersklene, eller hvis strukturen ser feil ut.',
		recordedNote:
			'Let etter struktur i opptaket på nytt — nyttig rett etter at du har satt en terskel.',
		action: 'Let på nytt',
	},
	replanNote: 'Justert:',
	unresolved: {
		lead: 'Noen mål vises uten konkrete tall',
		before: 'Legg inn tersklene dine i',
		link: 'treningsinnstillingene',
		after: 'for å se nøyaktig fart, puls eller watt.',
	},
	plannedVsActual: {
		title: 'Plan mot gjennomført',
		fallback: 'Det registrerte, holdt opp mot det som var planlagt.',
		load: 'Belastning (TSS)',
		duration: 'Tid',
		distance: 'Distanse',
		planned: (value: string) => `planlagt ${value}`,
	},
	/** The TSS band's recommendation, after its `I rute` / `Under` / `Over`. */
	adherenceNote: {
		under: 'lettere enn planlagt',
		'on-target': 'som planlagt',
		over: 'hardere enn planlagt',
	} satisfies Record<AdherenceTone, string>,
	structure: {
		title: 'Struktur',
		'as-prescribed': {
			label: 'Som planlagt',
			description: 'fulgte den planlagte strukturen',
		},
		diverged: {
			label: 'Avvek',
			description: 'gikk ut over den planlagte strukturen',
		},
		'not-verifiable': {
			label: 'Kan ikke bekreftes',
			description: 'strukturen kan ikke leses sikkert fra opptaket',
		},
	},
	vsLast: {
		title: 'Mot forrige gang',
		/** `terskeløkt i sykling` — the kind the lookup used. */
		kind: (archetype: string, sport: string) =>
			`${archetype.toLowerCase()}økt i ${sport.toLowerCase()}`,
		firstOfKind: (kind: string) =>
			`Ingen tidligere ${kind} å sammenligne med ennå — dette er den første.`,
		noArchetype:
			'Økta har ingen økttype, så det er ingenting å sammenligne med.',
		/**
		 * The header says what the session reads as; this card used to answer
		 * "no archetype" beside it. A reading is not the stored type the lookup
		 * keys on, and saying so is what makes the two agree (ADR 0055 §6).
		 */
		readOnly: (word: string) =>
			`Økta leses som ${word.toLowerCase()}, men forrige gang slås opp på en økttype som er lagret på økta, og den har ingen.`,
		lead: (kind: string, date: string) =>
			`Denne økta mot forrige ${kind}, ${date}.`,
		load: 'Belastning (TSS)',
		duration: 'Tid',
		lastTime: (value: string) => `forrige gang ${value}`,
	},
	telemetry: {
		title: 'Data fra opptaket',
		description:
			'Innsatsen gjennom økta, med de planlagte målene og formen lagt over.',
		unavailableTitle: 'Ingen data over tid',
		unavailableBody:
			'Opptaket har ingen watt- eller pulsmålinger gjennom økta, så det er ingenting å tegne mot planen. Grafen kommer når opptaket har slike data.',
		loading: 'Henter grafen …',
		power: 'Watt',
		heartRate: 'Puls',
		pace: 'Fart',
		plannedTarget: 'Planlagt mål',
		paused: 'Pause',
		start: '0:00 · start',
		total: (clock: string) => `${clock} · totalt`,
		plannedShape: 'Planlagt form',
		inspectHint:
			'Dra over grafen for å lese hver kanal — trykk og dra på mobil, hold pekeren over på PC.',
		plannedRange: (min: number, max: number, unit: string) =>
			`Planlagt ${min}–${max} ${unit}`,
		missing: 'mangler',
		tableCaption:
			'Data fra opptaket, et utvalg gjennom økta, fra start til slutt.',
		time: 'Tid',
		plannedColumn: (unit: string) => `Planlagt ${unit}`,
		ariaLabel: (channels: string, withBands: boolean) =>
			`${channels} over tid${withBands ? ', mot de planlagte målene' : ''}. Dra over grafen for å lese hver kanal når som helst.`,
		ariaFallback: 'Data fra opptaket over tid.',
		srOver: (duration: string) => `Data fra opptaket over ${duration}.`,
		srPower: (lo: number, hi: number) => ` Watt fra ${lo} til ${hi} W.`,
		srHeartRate: (lo: number, hi: number) =>
			` Puls fra ${lo} til ${hi} slag/min.`,
		srPace: (lo: string, hi: string) => ` Fart fra ${lo} til ${hi}.`,
		srPauses: (count: number) =>
			` ${count} ${count === 1 ? 'pause' : 'pauser'} vist som hull.`,
		srTargets: (channel: 'power' | 'heartrate', labels: string, unit: string) =>
			` Planlagt ${channel === 'power' ? 'watt' : 'puls'}: ${labels} ${unit}.`,
		bpm: 'slag/min',
	},
	recording: {
		title: 'Opptak',
		zones: 'Intensitet etter pulssone',
		distance: 'Distanse',
		movingTime: 'Tid i bevegelse',
		avgPace: 'Snittfart',
		maxSpeed: 'Toppfart',
		avgHr: 'Snittpuls',
		maxHr: 'Makspuls',
		avgPower: 'Snittwatt',
		normPower: 'Normalisert watt',
		maxPower: 'Makswatt',
		avgCadence: 'Snittkadens',
		elevation: 'Stigning',
		work: 'Arbeid',
		load: 'Belastning (TSS)',
		/** Pedal revolutions (bike) or steps (run) per minute. */
		cadenceUnit: (discipline: string) =>
			discipline === 'bike' ? 'o/min' : 'steg/min',
	},
	wrongSession: {
		title: 'Feil økt?',
		moveTo: 'Flytt opptaket til',
		move: 'Flytt opptaket',
		detach: 'Ta det ut av planen',
		detachNote:
			'Aktiviteten får en egen økt, og denne planlagte økta står igjen uten opptak.',
		moveFailed: 'Fikk ikke flyttet opptaket til den økta.',
	},
	log: {
		title: 'Notat',
		writeLegend: 'Hvordan gikk det?',
		updateLegend: 'Endre notatet',
		label: 'Notat',
		placeholder: 'Hvordan gikk økta?',
		rpe: 'Opplevd anstrengelse (RPE)',
		rpeGroup: 'Velg RPE fra 1 til 10',
		rpeValue: (rpe: number) => `RPE ${rpe} av 10`,
		save: 'Lagre notatet',
		update: 'Lagre endringen',
		required: 'Skriv noen ord om økta',
		rpeWhole: 'RPE må være et helt tall',
		rpeRange: 'RPE må være mellom 1 og 10',
	},
	errors: {
		notFound: 'Fant ikke økta.',
		missingId: 'Økta mangler id.',
		onlyPlannedMissed: 'Bare en planlagt økt kan markeres som ikke gjort.',
		noRecording: 'Økta har ikke noe opptak.',
		notAttached: 'Opptaket er ikke koblet til en plan.',
		targetRequired: 'Velg økta opptaket skal flyttes til.',
		cannotRedetect: 'Denne økta kan ikke leses på nytt.',
		recordingNotEditable: 'Et opptak kan ikke redigeres som en plan.',
		badDateTime: 'Dato og klokkeslett henger ikke sammen.',
	},
} as const

/** The inline editor's own status words on the detail view. */
export const WORKOUT_DETAIL_EDITOR_LABELS = {
	saving: 'Lagrer …',
	thisExercise: 'denne øvelsen',
	/**
	 * Said before the athlete changes anything (ADR 0056): an exercise slot
	 * with logged sets is fixed, and its numbers are not.
	 */
	loggedSetsFixed: (count: number, name: string) =>
		`${count} sett er logget på ${name}, så hvilken øvelse dette er ligger fast — tallene kan du fortsatt endre. Skal det være et annet løft, slett de settene først.`,
} as const

/** The block sheet (workout-editor spec §3). */
export const BLOCK_SHEET_LABELS = {
	title: (blockNumber: number) => `Blokk ${blockNumber}`,
	description:
		'Hele blokka på ett sted. Endringer vises i setningen med en gang.',
	close: 'Lukk',
	name: 'Navn på blokka',
	namePlaceholder: 'f.eks. Oppvarming',
	nameUpdated: 'Navnet på blokka er endret',
	nameCleared: 'Navnet på blokka er fjernet',
	repeat: 'Antall ganger',
	repeatSet: (value: string) => `Blokka gjentas ${value} ganger`,
	steps: 'Steg',
	step: (stepNumber: number) => `Steg ${stepNumber}`,
	stepKind: (stepNumber: number) => `Type for steg ${stepNumber}`,
	moveEarlier: (stepNumber: number) => `Flytt steg ${stepNumber} opp`,
	moveLater: (stepNumber: number) => `Flytt steg ${stepNumber} ned`,
	duplicate: (stepNumber: number) => `Lag en kopi av steg ${stepNumber}`,
	remove: (stepNumber: number) => `Fjern steg ${stepNumber}`,
	stepRemoved: 'Steget er fjernet',
	addStep: 'Legg til steg:',
	deleteBlock: 'Slett blokka',
	blockDeleted: 'Blokka er slettet',
} as const

/** The exercise picker (ADR 0027 §8). Exercise names stay as the corpus
 * writes them: they are content, not chrome. */
export const EXERCISE_PICKER_LABELS = {
	placeholder: 'Velg øvelse …',
	search: 'Søk i øvelser',
	searchPlaceholder: 'Søk i øvelser …',
	empty: 'Ingen øvelser funnet.',
	filters: 'Filtrer øvelsene',
	recent: 'Nylig brukt',
	all: 'Alle øvelser',
	create: (name: string) => `Lag «${name}» …`,
	muscleFor: (name: string) => `Hovedmuskel for «${name}»`,
	muscleSearch: 'Søk i muskelgrupper',
	muscleSearchPlaceholder: 'Søk i muskelgrupper …',
	muscleEmpty: 'Ingen muskelgrupper funnet.',
	back: 'Tilbake til søket',
	saving: 'Lagrer …',
} as const

/** The intensity popover's chrome (workout-editor spec §7.3). */
export const INTENSITY_POPOVER_LABELS = {
	orSet: 'eller sett:',
	zone: 'Sone',
	kinds: {
		pace: 'fart',
		watts: 'watt',
		heartRate: 'puls',
		lactate: 'laktat',
		rpe: 'RPE',
	},
	from: (unit: string) => `Fra ${unit}`,
	to: (unit: string) => `Til ${unit} (valgfritt)`,
	paceUnit: 'Enhet for fart',
	powerUnit: 'Enhet for watt',
	heartRateUnit: 'Enhet for puls',
	thresholdPace: '% terskelfart',
	pace: 'fart',
	bpm: 'slag/min',
	lthr: '%terskelpuls',
	maxHr: '%makspuls',
	decrease: (label: string) => `Senk ${label.toLowerCase()}`,
	increase: (label: string) => `Øk ${label.toLowerCase()}`,
	notPlaced: 'ikke plassert i en sone ennå — fyll inn verdien',
	none: 'ingen intensitet satt',
	remove: 'Fjern intensiteten',
	announce: (text: string) => `Intensiteten er satt til ${text}`,
} as const

/** The full editor page (`/training/sessions/new`), the no-JS and deep-link
 * way in; the composer's full snap is the quick one (#505 round 2). */
export const NEW_SESSION_LABELS = {
	metaTitle: 'Ny økt | Trainm8',
	title: 'Ny økt',
	name: 'Tittel',
	namePlaceholder: 'f.eks. Tempoløp tirsdag',
	sport: 'Sport',
	sportPlaceholder: 'Velg sport',
	intent: 'Formål',
	date: 'Dato',
	time: 'Klokkeslett',
	create: 'Lag økta',
} as const

/** The strength runner route's own chrome (ADR 0060, 0064). The presenter's
 * sentences (`__runner-presenter.ts`) are the strength surfaces' to word. */
export const RUNNER_LABELS = {
	metaTitle: (title: string) => `Logg · ${title} | Trainm8`,
	metaFallback: 'Økt',
	back: 'Tilbake til I dag',
	heading: 'Gjennomfør økta',
	sessionNumber: (n: number) => `Økt ${n}`,
	noLifts: 'Økta har ingen løft å logge.',
	warmup: 'Oppvarming',
	workingSets: 'Arbeidssett',
	unexplainedFailure: 'Settet ble ikke lagret — trykk på det igjen.',
	finish: 'Fullfør økta',
	finishNote: 'Hvert sett ble lagret da du trykket. Dette markerer bare dagen.',
	alreadyRecorded: 'Allerede registrert.',
	alreadyRecordedNote:
		'Du har fullført økta. Settene er det som gjelder, og trykker du på ett under, endres det — men ingenting her venter på å bli lagret.',
	nextFromProgram: (program: string) =>
		`Hva ${program} sier du løfter neste gang`,
	helpToggle: (lift: string) => `Om ${lift}`,
	describeGym: 'Beskriv gymmet ditt',
	describeGymAfter: 'så får hver vekt et skiveoppsett.',
	loadKinds: {
		external: 'Vekt (kg)',
		bodyweight: 'Kroppsvekt',
		bodyweightPlus: 'Kroppsvekt + kg',
		assisted: 'Assistert (kg avlastning)',
		stackLevel: 'Maskinnivå',
		band: 'Strikk',
		unloaded: 'Uten vekt',
	},
	loadWords: {
		external: 'kilo',
		perSide: 'kilo per hånd',
		bodyweight: 'kroppsvekt',
		bodyweightPlus: 'kroppsvekt pluss kilo',
		assisted: 'assisterte kilo',
		stackLevel: 'et maskinnivå',
		band: 'en strikk',
		unloaded: 'ingen vekt',
	},
	errors: {
		nothingLogged:
			'Logg et arbeidssett først — det er ingenting å fullføre ennå.',
		gone: 'Økta finnes ikke lenger.',
		notFound: 'Fant ikke settet.',
		nonsense: 'Settet ga ikke mening.',
		needsNumber: (kind: string) => `${kind} trenger et tall.`,
		kindLocked: (word: string) =>
			`Settet er registrert med ${word}. Det kan ikke logges på nytt som noe annet herfra.`,
		notALift: 'Det steget er ikke et løft.',
		noCount: 'Settet har ingen telling.',
	},
} as const

/**
 * Kilos the Norwegian way, for display (#505 round 2: `82,5 kg`): a decimal
 * comma and a whole number left whole. **Display only** — `formatKg` keeps its
 * `82.5`, because the parser reads that back. A local stand-in until the
 * cross-cutting `formatNbKg` lands in `format.ts`; then this one goes.
 */
export function nbKgLabel(kg: number): string {
	const rounded = Math.round(kg * 100) / 100
	return `${String(rounded).replace('.', ',')} kg`
}
