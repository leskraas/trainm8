/**
 * Writing sessions down (#505, ADR 0088): the session composer, imports on
 * I dag, the quick strength log, and Angre. Part of `labels.ts` (ADR 0081):
 * import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type {
	ImportLinkRefusal,
	MarkDoneRefusal,
} from '../import-link-schema.ts'
import type {
	LiftScheme,
	SetUnit,
	WorkingLoad,
} from '../strength/working-load.ts'
import type { QuickLogRefusal } from '../strength-quick-log.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { NB_MONTHS_SHORT } from './i-dag.ts'
import { NB_WEEKDAY_LABELS } from './vocabulary.ts'

// ---------------------------------------------------------------------------
// Imports on I dag (#505 stories 78–82, ADR 0049 as amended)
// ---------------------------------------------------------------------------

/** An import's row: ekstra, "hva var dette?", Angre kobling / Koble igjen. */
export const IMPORT_LINK_LABELS = {
	/** The chip on a session that was recorded with no plan behind it. */
	extra: 'ekstra',
	question: 'Hva var dette?',
	/** Under the question: why it is asked at all. */
	questionNote: (count: number) =>
		count === 1
			? 'Det lå en planlagt økt denne dagen som ikke ble koblet.'
			: `Det lå ${count} planlagte økter denne dagen, og vi vet ikke hvilken.`,
	linkTo: (title: string) => `Det var ${title}`,
	keep: 'En ekstra økt',
	annet: 'Annet, teller ikke',
	undo: 'Angre kobling',
	undoFor: (title: string) => `Angre kobling på ${title}`,
	undoNote: 'Hentet fra importen. Feil økt? Da blir den en ekstra økt.',
	relink: 'Koble igjen',
	relinkFor: (title: string) => `Koble igjen til ${title}`,
	relinkNote: (title: string) => `Tilbake til ${title}.`,
	/** Said while the post is in flight, before the row moves. */
	saving: 'Lagrer …',
	/**
	 * An ekstra's own name, for a recording nothing named (audit PR D):
	 * `Løping · 57 min`, `Sykling · 12,4 km` — never `57 min 12 s run`.
	 */
	extraTitle: (sport: string, quantity: string | null) =>
		quantity ? `${sport} · ${quantity}` : sport,
	/** The ekstra's glyph: an import, not one of the app's sessions. */
	glyph: (title: string) => `Importert økt ${title}`,
} as const

/** Why the server turned an import answer down, said to the athlete. */
export const IMPORT_LINK_REFUSAL_LABELS: Record<ImportLinkRefusal, string> = {
	'import-not-found': 'Fant ikke importen. Den kan være slettet.',
	'session-not-found': 'Fant ikke økta, eller den har fått en annen import.',
	'not-a-fit':
		'Den økta passer ikke med importen: en annen dag, en annen idrett, eller den har allerede en import.',
	'not-linked': 'Importen er ikke koblet til en planlagt økt.',
	'nothing-to-relink':
		'Økta den kom fra er borte eller har fått en annen import.',
}

/**
 * _Gjort_ by hand, and what a done session with no numbers says (#505 story
 * 82). With an import connected the numbers are on their way; without one,
 * nothing will bring them, and the row says so instead of promising.
 */
export const MARK_DONE_LABELS = {
	action: 'Gjort',
	actionFor: (title: string) => `Merk ${title} som gjort`,
	fromImport: 'Gjort · tallene kommer fra importen',
	noImport: 'Gjort · uten tall, ingen import er koblet til',
	/** The same, as the row's own small mark: the done dot already says Gjort. */
	rowFromImport: 'tallene kommer fra importen',
	rowNoImport: 'uten tall',
	saving: 'Merket som gjort …',
} as const

export const MARK_DONE_REFUSAL_LABELS: Record<MarkDoneRefusal, string> = {
	'session-not-found': 'Fant ikke økta. Den kan være slettet.',
	'not-markable': 'Økta kan ikke merkes som gjort nå.',
}

// ---------------------------------------------------------------------------
// The quick strength log on I dag (#505 stories 83–84, ADR 0064)
// ---------------------------------------------------------------------------

/** The `LoadValue` member a resolved working load is logged as. */
type WorkingLoadKind = Extract<WorkingLoad, { kind: 'resolved' }>['loadKind']

/** The short log under a strength session's row. */
export const QUICK_LOG_LABELS = {
	heading: 'Logg økta',
	/** The group's accessible name: which session it logs. */
	headingFor: (title: string) => `Logg ${title}`,
	asPlanned: 'Som planlagt',
	asPlannedFor: (title: string) => `Logg ${title} som planlagt`,
	edit: 'Endre',
	editFor: (title: string) => `Endre loggen for ${title}`,
	save: 'Lagre',
	cancel: 'Avbryt',
	saving: 'Logger …',
	loading: 'Henter planen …',
	/** _Endre_'s weight (#530, ADR 0064 amended): one per lift, all its sets. */
	weightFor: (lift: string) => `Vekt for ${lift}, kilo`,
	lighter: (lift: string, step: string) => `${step} kg lettere på ${lift}`,
	heavier: (lift: string, step: string) => `${step} kg tyngre på ${lift}`,
	/** Beside a weight the athlete changed: what the plan said. */
	weightWas: (kg: string) => `fra ${kg}`,
	weightInvalid: 'Skriv vekta som kilo over 0, høyst 500, for eksempel 82,5.',
	notDoneNote: 'Tomt eller 0 betyr at settet ikke ble gjort.',
	setInput: (lift: string, position: number, unit: SetUnit) =>
		`Sett ${position} av ${lift}, ${unit === 'reps' ? 'repetisjoner' : 'sekunder'}`,
	notLoggable:
		'Ett av løftene har ingen fast vekt eller antall, så økta logges sett for sett.',
	runnerLink: 'Logg sett for sett',
	/** `5×5`, `3×45 s`, or `4 sett` where the sets ask for different counts. */
	scheme: ({ sets, same }: LiftScheme) =>
		same == null
			? `${sets} sett`
			: same.unit === 'reps'
				? `${sets}×${same.count}`
				: `${sets}×${same.count} s`,
	/** The toast once the sets are in: how many, and the week's done sets. */
	logged: (
		sets: number,
		week: { name: string; before: number; after: number } | null,
	) => {
		const head = `${sets} sett logget.`
		if (week == null) return head
		return `${head} Styrke ${week.name.toLowerCase()}: ${week.before} → ${week.after} sett gjort.`
	},
	/** The log's toast's way back (ADR 0088). */
	undo: 'Angre',
	/** After _Angre_: the sets are out, and the session is planned again. */
	undone: (
		sets: number,
		week: { name: string; before: number; after: number } | null,
	) => {
		const head =
			sets === 0
				? 'Loggen var allerede angret.'
				: `Loggen er angret — ${sets} sett tatt ut.`
		if (week == null || sets === 0) return head
		return `${head} Styrke ${week.name.toLowerCase()}: ${week.before} → ${week.after} sett gjort.`
	},
	/** The prescription's weight, in the load's own semantics (ADR 0056 §3);
	 * `kg` is the kilo as `formatNbKg` writes it (`82,5`). */
	load: (kind: WorkingLoadKind, kg: string | null) => {
		switch (kind) {
			case 'external':
				return kg == null ? null : `${kg} kg`
			case 'bodyweight':
				return 'kroppsvekt'
			case 'bodyweightPlus':
				return kg == null ? 'kroppsvekt' : `kroppsvekt + ${kg} kg`
			case 'assisted':
				return kg == null ? null : `${kg} kg avlastning`
			case 'unloaded':
				return 'uten vekt'
		}
	},
} as const

export const QUICK_LOG_REFUSAL_LABELS: Record<QuickLogRefusal, string> = {
	'session-not-found': 'Fant ikke økta. Den kan være slettet.',
	'not-loggable': 'Økta kan ikke logges herfra nå.',
	'not-plannable':
		'Ett av løftene har ingen fast vekt eller antall. Logg økta sett for sett.',
	'unknown-set':
		'Ett av settene finnes ikke i planen lenger. Last siden på nytt.',
	'nothing-done': 'Ingen sett er merket som gjort. Skriv inn minst ett.',
	'bad-weight': QUICK_LOG_LABELS.weightInvalid,
	'weight-not-editable':
		'Vekta på ett av løftene kan ikke endres her. Last siden på nytt.',
}

/**
 * The large-screen season pane beside the list (#505 story 60, ADR 0087): the
 * plan card, the season table and its compact curve, after Arket variant Q.
 */
export const SEASON_PANE_LABELS = {
	heading: 'Sesongen',
	/** The plan card's region name. */
	plan: 'Planen',
	/** The table's caption corner: what a cell holds. */
	perWeek: 'Per uke',
	cellKey: 'mål · gjort',
	week: 'Uke',
	rhythm: 'Rytme',
	/** A week with no plan behind it: a load column instead of tracks. */
	load: 'TSS',
	sessions: 'økter',
	table: 'Sesongtabell',
	jumpTo: (week: string) => `Gå til ${week}`,
	/** The row of the table where the Planning Horizon stands. */
	horizon: 'horisont · økter fylles hit, videre bare mål',
	noPlan: 'Ingen plan ennå',
	noPlanNote: 'Sesongen er bare ukene du har skrevet.',
	noPlanAction: 'Lag en i Plan',
	/** A table cell's accessible name: `Løping: mål 46 km, gjort 35`. */
	cellName: (track: string, target: string, done: string) =>
		`${track}: mål ${target}, gjort ${done}`,
	/** The curve: what it draws, said once for a screen reader. */
	curveName: (track: string, unit: string) =>
		`${track} (${unit}): ukemål som linje, gjort som søyler, i dag og horisont markert`,
	curveCaption: (track: string) => `${track}, uke for uke`,
	/** The curve's legend, in the order the marks are drawn. */
	legendTarget: (track: string, unit: string) =>
		`mål ${track.toLowerCase()} (${unit})`,
	legendDone: 'gjort',
	legendToday: 'i dag',
	legendHorizon: 'horisont',
	legendPhase: 'fargestripe = fase',
	legendDrift: '≠ øktene avviker over 10 % fra målet',
} as const

/**
 * The day beside the list on a large screen (#505 story 60, ADR 0087): the
 * selected day's sessions, what they ask and who owns them, their actions,
 * and the week's zones.
 */
export const DAY_PANE_LABELS = {
	region: 'Dagen',
	/** `torsdag 17. sep · i dag`. */
	today: 'i dag',
	track: 'Spor',
	status: 'Status',
	owner: 'Eier',
	volume: 'Volum',
	statusWord: {
		planned: 'planlagt',
		completed: 'gjort',
		missed: 'ikke gjort',
	},
	open: 'Se økta',
	edit: 'Rediger',
	/** A Link's name, so two "Se økta" on one day are told apart. */
	openFor: (title: string) => `Se økta ${title}`,
	editFor: (title: string) => `Rediger ${title}`,
	free: 'Ingen økt · fri.',
	write: 'Skriv økt her',
	zones: (week: string) => `${week} i soner`,
	noZones: 'Ingen soner å vise for denne uka.',
	close: 'Lukk',
	/** The sheet's own heading, before the day's. */
	sheet: 'Dagen',
	/** How a keyboard reaches the day from a row (1024–1279, the sheet). */
	keyHint: 'Trykk I på en dag i lista for å se den ved siden av.',
} as const

/** `torsdag 17. sep` — a day as the day pane names it. */
export function dayPaneTitle(weekday: number, day: number, month: number) {
	return `${NB_WEEKDAY_LABELS[weekday]} ${day}. ${NB_MONTHS_SHORT[month]}`
}

// ---------------------------------------------------------------------------
// The session composer (round 2, owner decisions 1, 2, 4–7 and 11; ADR 0088):
// one Drawer from every "+", the same content in the day pane on a large
// screen, and one undo for every write.
// ---------------------------------------------------------------------------

/** The composer's four sources (Arket's FILL_SOURCES). */
export type ComposerSourceKey = 'skriv' | 'bibliotek' | 'kopier' | 'appen'

export const SESSION_COMPOSER_LABELS = {
	/** The top line's one creation control (owner decision 6). */
	newSession: 'Ny økt',
	title: 'Ny økt',
	/** `Ny økt tirsdag 13. okt` — the Drawer's name. */
	titleOn: (day: string) => `Ny økt ${day}`,
	day: 'Dag',
	/** The day strip's own name, and its week buttons. */
	days: 'Velg dag',
	earlierWeek: 'Uka før',
	laterWeek: 'Uka etter',
	/** Any day further off than the strip's weeks (story 40). */
	otherDay: 'Annen dag',
	source: 'Start fra',
	sources: {
		skriv: 'Skriv',
		bibliotek: 'Bibliotek',
		kopier: 'Kopier',
		appen: 'Appen',
	} satisfies Record<ComposerSourceKey, string>,
	/** The app's tab, shown and not yet working (owner decision 7). */
	soon: 'kommer',
	appenNote:
		'La appen fylle dagen ut fra fasen og ukas mål. Det kommer i en senere versjon.',
	sport: 'Idrett',
	annet: 'Annet',
	annetNote:
		'Annet teller ikke i noe spor. Si idretten i linja: «25 min sykkel».',
	annetNoDiscipline: 'Si hvilken idrett i linja: «25 min sykkel til jobb».',
	/** The Styrke chip on an empty line: lifts are named, never stamped (ADR 0089). */
	strengthNote:
		'Skriv løftene i linja — øvelse, sett × reps og vekt. Skill dem med «·».',
	/** The line names lifts and the exercise catalogue is still on its way. */
	exercisesLoading: 'Henter øvelsene…',
	/** An unknown lift with no name near it. */
	noExercise:
		'Skriv øvelsen slik den heter i Bibliotek, f.eks. Knebøy eller Markløft.',
	/** `Til sammen 10 sett` — a session of lifts, counted as the week counts it. */
	sets: (count: number) => `${count} sett`,
	add: 'Legg til',
	/** The empty state: the stamp (ADR 0065 §5). */
	addStamp: (sentence: string) => `Legg til ${sentence}`,
	adding: 'Legger til…',
	deeper: 'Gjør grundigere',
	cancel: 'Avbryt',
	close: 'Lukk',
	failed: 'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
	/** Owner decision 5: a past day's session written as done. */
	done: 'Allerede gjort',
	doneNote: 'Skrives som gjort, uten tall til en import kobler seg på.',
	doneStrength:
		'Styrke logges sett for sett, så den kan ikke skrives som gjort her.',
	dayPast: 'Dagen er passert.',
	blocks: 'Blokker og steg',
	once: 'én gang',
	times: (count: number) => `${count} ganger`,
	addPart: 'Legg til en del',
	notes: 'Notat',
	notesPlaceholder: 'Med gjengen fra klubben, start ved bryggen',
	fullEditor: 'Åpne hele editoren',
	repeat: 'Gjentak',
	rest: 'Pause i sekunder',
	fewer: (what: string) => `Færre: ${what}`,
	more: (what: string) => `Flere: ${what}`,
	libraryEmpty: 'Ingen økter i biblioteket for denne idretten ennå.',
	copyFrom: (week: string) => `Fra ${week.toLowerCase()}`,
	copyEmpty: 'Ingen økter å kopiere den uka.',
	copyEarlier: 'Uka før den',
	loading: 'Henter…',
	/** A pick from Bibliotek or Kopier, in the line as tokens. */
	picked: {
		bibliotek: 'Fra biblioteket — blir din når du endrer den',
		kopier: 'Kopiert — blir din når du endrer den',
	},
	/** A pick the line cannot say, placed as it is. */
	whole:
		'Linja kan ikke si hele økta, så den legges inn som den er. Juster den i økta etterpå.',
	clearPick: 'Fjern valget',
	pick: (title: string) => `Bruk ${title}`,
	/** Under a day's sessions: one more on the same day. */
	addAnother: 'legg til en til',
	addAnotherOn: (day: string) => `Legg til en økt til ${day}`,
	undo: 'Angre',
	undoFor: (title: string) => `Angre ${title}`,
	undoing: 'Fjerner…',
	/** The toast's floor, when the reply had no week sum to say. */
	written: 'Økta er lagt inn.',
	writtenDone: 'Økta er lagt inn som gjort.',
	/** The session's details, in the same Drawer at full. */
	detail: {
		name: (title: string) => `Om økta ${title}`,
		counts: 'Teller i',
		inTrack: 'sporet sitt',
		inAnnet: 'Annet',
		open: 'Se økta',
		openFor: (title: string) => `Se økta ${title}`,
	},
} as const

// ===========================================================================
// Angre on Gjort and on a link answer (#505 round 2, r2-angre-rest; ADR 0088
// as amended): the toasts those two writes land with, the undo's own toast,
// and why an undo was turned down. One section of its own so the area PRs
// that also add to this file merge cleanly. The button itself says `Angre`
// (`SESSION_COMPOSER_LABELS.undo`), as every other write's does.
// ===========================================================================

export const ANGRE_REST_LABELS = {
	/** _Gjort_'s toast; the session's title is quoted under it. */
	markedDone: 'Merket som gjort.',
	/** A link answer's toast; the planned session's title is quoted under it. */
	linked: 'Importen er koblet til økta.',
	/** _Angre_ on _Gjort_ took it back. */
	markDoneUndone: (title: string | null) =>
		title
			? `Gjort er angret. «${title}» står som før.`
			: 'Gjort er angret. Økta står som før.',
	/** _Angre_ on a link took it back: the import is asked about again. */
	linkUndone: (title: string | null) =>
		title
			? `Koblingen til «${title}» er angret. Importen er en ekstra økt igjen, og vi spør hva den var.`
			: 'Koblingen er angret. Importen er en ekstra økt igjen, og vi spør hva den var.',
	/** Why an undo was turned down, said to the athlete. */
	refused: {
		'session-not-found': 'Fant ikke økta. Den kan være slettet.',
		'import-not-found': 'Fant ikke importen. Den kan være slettet.',
		'not-undoable':
			'Det kan ikke angres lenger: noe annet har skjedd med økta siden.',
	} satisfies Record<
		'session-not-found' | 'import-not-found' | 'not-undoable',
		string
	>,
} as const
