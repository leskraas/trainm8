/**
 * The shared vocabulary: every athlete-facing enum's label that more than one
 * surface reads (discipline, intent, step and intensity kinds, events, units,
 * weekdays, volume currencies and figures), the app's tabs and page header,
 * and the shared schema and intensity strings. Part of `labels.ts` (ADR 0081):
 * import from the barrel, not from here.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type { AppTab } from '../app-tabs.ts'
import type {
	CatalogueGoalEvent,
	CatalogueLevel,
	CataloguePhase,
	CatalogueTier,
	SessionArchetype,
} from '../catalogue.ts'
import type { EventKind, EventPriority, EventStatus } from '../event-schema.ts'
import type { VolumeCurrency } from '../plan-outline/derive.ts'
import type { QualityZone } from '../plan-outline/quality-mix.ts'
import type {
	PatternDayKind,
	PatternWeekday,
} from '../plan-outline/week-pattern.ts'
import type {
	UnmeasuredReason,
	VolumeGrade,
} from '../plan-outline/week-volumes.ts'
import type { SessionOwner } from '../session-ownership.ts'
import type {
	Discipline,
	IntensityTarget,
	StepKind,
	WorkoutIntent,
} from '../workout-schema.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { capitalize } from './_helpers.ts'

// ---------------------------------------------------------------------------
// Discipline
// ---------------------------------------------------------------------------

/**
 * The *sport* noun for a discipline: `Run` / `Bike` / `Swim` / `Strength`.
 * Used where the discipline names a training domain — plan generation, the
 * per-discipline threshold settings sections, discipline pickers.
 */
export const DISCIPLINE_LABELS: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
	strength: 'Strength',
}

/**
 * The sixteen **Session Archetypes**, read out the way a coach says them.
 *
 * Here rather than in the two route files that each held a copy: the Catalogue
 * lists them, the publish screen offers them, and a generated week names them, and
 * a value spelled three ways is exactly what this module exists to prevent.
 */
export const SESSION_ARCHETYPE_LABELS: Record<SessionArchetype, string> = {
	recovery: 'Recovery',
	easy: 'Easy',
	long: 'Long',
	steady: 'Steady',
	tempo: 'Tempo',
	threshold: 'Threshold',
	'sub-threshold': 'Sub-threshold',
	'vo2max-long': 'VO₂max (long)',
	'vo2max-short': 'VO₂max (short)',
	anaerobic: 'Anaerobic',
	neuromuscular: 'Neuromuscular',
	fartlek: 'Fartlek',
	'race-simulation': 'Race simulation',
	test: 'Test',
	brick: 'Brick',
	technique: 'Technique',
}

// ---------------------------------------------------------------------------
// The Catalogue's other three retrieval axes
// ---------------------------------------------------------------------------

/**
 * The five **Catalogue** phases, as a season names them. Sentence-case rather
 * than the raw slug, and `race-week` spelled out — a facet control is read at a
 * glance, so the value's own hyphenation is not the athlete's problem.
 */
export const CATALOGUE_PHASE_LABELS: Record<CataloguePhase, string> = {
	base: 'Base',
	build: 'Build',
	peak: 'Peak',
	taper: 'Taper',
	'race-week': 'Race week',
}

/**
 * The eight goal events a Catalogue Entry may be scoped to. The **Discipline**
 * comes from the Workout, so these name a distance only — `10k`, never `10k run`.
 * In Norwegian (#505 round 2, ADR 0081), display only: the keys are stored.
 */
export const CATALOGUE_GOAL_EVENT_LABELS: Record<CatalogueGoalEvent, string> = {
	'1500m': '1500 m',
	'3k': '3 km',
	'5k': '5 km',
	'10k': '10 km',
	hm: 'Halvmaraton',
	marathon: 'Maraton',
	trail: 'Terreng',
	ultra: 'Ultra',
}

/** The three level floors. The "and up" is the surface's word, not the label's. */
export const CATALOGUE_LEVEL_LABELS: Record<CatalogueLevel, string> = {
	beginner: 'Beginner',
	intermediate: 'Intermediate',
	advanced: 'Advanced',
}

/**
 * How a **Tier** is named to a reader. `stock` reads as the app's own name
 * because that is the claim the badge makes — trainm8 wrote this one — and
 * "Stock" is the model's word, not the athlete's.
 */
export const CATALOGUE_TIER_LABELS: Record<CatalogueTier, string> = {
	stock: 'trainm8',
	community: 'Community',
	mine: 'Yours',
}

/**
 * The *activity* noun for a discipline. Identical to {@link DISCIPLINE_LABELS}
 * except a bike session reads as a **Ride** (matching how imported activities
 * are named), used for session/recording titles like "Ride recording". The
 * split between "Bike" (the sport) and "Ride" (the activity) is intentional and
 * covered by tests. The rule is fixed (see `docs/design/ui-conventions.md`
 * §4.1): the *sport* register ({@link DISCIPLINE_LABELS}, "Bike") names a
 * training domain you configure or plan (plan generation, threshold settings);
 * the *activity* register (this helper, "Ride") names an actual session,
 * recording, import, or authored workout step.
 *
 * Accepts any string (not only a {@link Discipline}) because recordings can
 * carry an `other` discipline; unknown values are capitalized rather than shown
 * raw.
 */
export function getDisciplineLabel(discipline: string): string {
	if (discipline === 'bike') return 'Ride'
	return DISCIPLINE_LABELS[discipline as Discipline] ?? capitalize(discipline)
}

// ---------------------------------------------------------------------------
// Workout intent
// ---------------------------------------------------------------------------

export const INTENT_LABELS: Record<WorkoutIntent, string> = {
	recovery: 'Recovery',
	endurance: 'Endurance',
	tempo: 'Tempo',
	threshold: 'Threshold',
	vo2max: 'VO₂ Max',
	anaerobic: 'Anaerobic',
	neuromuscular: 'Neuromuscular',
	race: 'Race',
	test: 'Test',
	technique: 'Technique',
	'strength-max': 'Strength — Max',
	'strength-hypertrophy': 'Strength — Hypertrophy',
	'strength-power': 'Strength — Power',
	'strength-endurance': 'Strength — Endurance',
	mobility: 'Mobility',
}

// ---------------------------------------------------------------------------
// Step and intensity kinds (workout editor)
// ---------------------------------------------------------------------------

export const STEP_KIND_LABELS: Record<StepKind, string> = {
	cardio: 'Cardio',
	strength: 'Strength',
	rest: 'Rest',
}

export const INTENSITY_KIND_LABELS: Record<IntensityTarget['kind'], string> = {
	zoneLabel: 'Zone',
	rpe: 'RPE',
	hrBpm: 'HR (bpm)',
	hrPct: 'HR (%)',
	power: 'Power (W)',
	powerPct: 'Power (%)',
	pace: 'Pace',
	pacePct: 'Pace (%)',
	lactate: 'Lactate (mmol/L)',
	racePace: 'Race pace',
}

// ---------------------------------------------------------------------------
// Quality Session Mix zones (the Intensity Emphasis label)
// ---------------------------------------------------------------------------

/**
 * Reading names for the zones a Quality Session Mix may hold (ADR 0042 §5).
 *
 * **Lower-case**, unlike {@link INTENT_LABELS}' `Threshold` / `VO₂ Max`, because
 * these read mid-sentence inside an assembled label — "2× threshold + 1× VO₂
 * max" — where a capital would look like a proper noun. Same subscript `₂` as
 * `INTENT_LABELS`, so the two registers of the same word never disagree on
 * spelling. Assembled by `formatEmphasisLabel` (ADR 0023 owns the assembly).
 *
 * Only three zones appear: the mix admits zones 3–5, and neuromuscular work has
 * no position on this axis at all (ADR 0042 §3, §7).
 */
export const QUALITY_ZONE_LABELS: Record<QualityZone, string> = {
	3: 'tempo',
	4: 'threshold',
	5: 'VO₂ max',
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
	race: 'Race',
	'time-trial': 'Time Trial',
	'fitness-goal': 'Fitness Goal',
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
	planned: 'Planned',
	completed: 'Completed',
	cancelled: 'Cancelled',
}

/**
 * The full priority label, e.g. `Priority A` — used in select option lists.
 * Compact contexts (event badges) render the bare letter from
 * {@link EVENT_PRIORITIES} directly; that terseness is a badge-style choice,
 * not a second wording of the enum.
 */
export const EVENT_PRIORITY_LABELS: Record<EventPriority, string> = {
	A: 'Priority A',
	B: 'Priority B',
	C: 'Priority C',
}

/**
 * Event target kinds, keyed by the form's target-kind value. The empty string
 * is the "no target chosen" option carried by the event form, so it lives here
 * beside the real target kinds. `EventTarget['kind']` are the six non-empty
 * keys.
 */
export const TARGET_KIND_LABELS = {
	'': 'No target',
	finish: 'Finish',
	time: 'Time',
	pace: 'Pace',
	distance: 'Distance',
	placement: 'Placement',
	qualitative: 'Qualitative',
} as const satisfies Record<string, string>

// ---------------------------------------------------------------------------
// Session status (the training ledger's stored status)
// ---------------------------------------------------------------------------

/**
 * A session's stored status as a label, e.g. `scheduled` → `Scheduled`. The
 * status set is open-ended at the type level, so this capitalizes rather than
 * looking up a closed map.
 */
export function getStatusLabel(status: string): string {
	return capitalize(status)
}

// ---------------------------------------------------------------------------
// Athlete profile enums
// ---------------------------------------------------------------------------

/** Preferred-units labels, matching the profile's unit hints. */
export const UNIT_LABELS = {
	metric: 'Metric (km, kg)',
	imperial: 'Imperial (mi, lb)',
} as const satisfies Record<'metric' | 'imperial', string>

/**
 * Norwegian weekday names, Monday-first (index = `weekdayIndex`, ADR 0019), in
 * the mid-sentence register the #505 surfaces write them in ("ble ikke gjort
 * tirsdag"; ADR 0081).
 */
export const NB_WEEKDAY_LABELS = [
	'mandag',
	'tirsdag',
	'onsdag',
	'torsdag',
	'fredag',
	'lørdag',
	'søndag',
] as const

/**
 * Weekday names indexed by the athlete-profile weekday number (0 = Sunday …
 * 6 = Saturday, ADR 0005). Drives the week-starts-on picker and any weekday
 * rendering.
 */
export const WEEKDAY_LABELS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
] as const

/**
 * The Sunday-first calendar index of each Monday-first **Week Pattern** weekday —
 * the *inverse* of `calendarWeekdayOf` in `plan-outline/week-pattern.ts`, which is
 * the canonical mapping between a Training Week's Monday–Sunday ordering (ADR
 * 0019) and the Sunday-first index the profile stores (ADR 0005).
 *
 * A local literal rather than an import of that function, because this module is a
 * **runtime leaf** (see the header): a value import recreates the schema import
 * cycle that kills server boot with a TDZ error. It is used for *labelling only* —
 * nothing crosses the two conventions here — and `labels.test.ts` pins every entry
 * against `calendarWeekdayOf` itself, so the inverse cannot drift from the
 * canonical mapping.
 */
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const

/**
 * The same weekday names indexed **Monday-first**, for a **Week Pattern** day: a
 * Training Week runs Monday–Sunday (ADR 0019) while the profile's weekday number
 * is Sunday-first (ADR 0005).
 *
 * Indexed out of {@link WEEKDAY_LABELS} through {@link MONDAY_FIRST} rather than
 * retyped, so `WEEKDAY_LABELS` stays the one place a day is spelled and no day name
 * is written twice.
 */
export const PATTERN_WEEKDAY_LABELS = Object.fromEntries(
	MONDAY_FIRST.map((calendarWeekday, weekday) => [
		weekday,
		WEEKDAY_LABELS[calendarWeekday],
	]),
) as Record<PatternWeekday, string>

/**
 * What a **Week Pattern** day *is* (ADR 0044 §7), for the picker that authors one.
 *
 * A stored vocabulary of two, so the labels belong here. Each **names** its kind and
 * no more: the select trigger is 316 px wide at the 390 px reference viewport, and a
 * label that says the whole rule ("Fixed session — prescribed, never scaled", 40
 * characters) renders clipped there, which §2.5 of the UI conventions forbids
 * outright. The rule each kind carries is said in full in the helper text under the
 * field, which is where a rule reads better than in a trigger anyway.
 */
export const PATTERN_DAY_KIND_LABELS: Record<PatternDayKind, string> = {
	fixed: 'Fixed session',
	share: 'Share of the week',
}

// ---------------------------------------------------------------------------
// Volume Currency (plan authoring)
// ---------------------------------------------------------------------------

/**
 * The unit a **Training Track** authors its weekly volume in (ADR 0043), spelled
 * out for a picker. `sets` reads "working sets" because it is a *systemic* weekly
 * count and never per muscle group (ADR 0047 §2).
 */
export const VOLUME_CURRENCY_LABELS: Record<VolumeCurrency, string> = {
	km: 'Kilometres per week',
	hours: 'Hours per week',
	tss: 'TSS per week',
	sets: 'Working sets per week',
}

/**
 * The same unit as a compact suffix for a weekly figure — `55 km/wk`,
 * `5.8 h/wk`. The long form above names the choice; this one rides beside a
 * number.
 */
export const VOLUME_CURRENCY_UNITS: Record<VolumeCurrency, string> = {
	km: 'km/wk',
	hours: 'h/wk',
	tss: 'TSS/wk',
	sets: 'sets/wk',
}

/**
 * The bare unit, for a figure that is **not** per week — a total over several
 * weeks, such as the Season Anchor pre-fill's window (`23.2 h`, `232 km`).
 */
export const VOLUME_UNITS: Record<VolumeCurrency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
	sets: 'sets',
}

/**
 * Whose a planned session is (**Session Ownership**, ADR 0080), as the mark on a
 * home row names it (#505 story 29). Norwegian, as the #505 surfaces are (ADR
 * 0081), and lower-case: it reads as a quiet aside beside the title.
 */
export const SESSION_OWNER_LABELS: Record<SessionOwner, string> = {
	athlete: 'din økt',
	machine: 'appens økt',
}

/**
 * What the ownership glyph on a planned row means, said once behind it rather
 * than under every row (#505 D6, ADR 0086). The athlete's own session is
 * changed only with their yes (ADR 0080); the app's may be adjusted when the
 * week changes.
 */
export const SESSION_OWNER_NOTES: Record<SessionOwner, string> = {
	athlete:
		'Du la inn eller endret denne økta. Appen endrer den bare hvis du sier ja.',
	machine:
		'Planen la inn denne økta. Appen kan justere den når uka endrer seg.',
}

/** What a session row's glyph opens (ADR 0086): the row's details, once. */
export const SESSION_DETAIL_LABELS = {
	open: 'Åpne økta',
	/** The glyph's name on a session whose ownership no longer matters. */
	name: (title: string) => `${title}: detaljer`,
	/** The done dot's name where no verdict is known. */
	done: 'gjort',
	missed: 'ikke gjort',
} as const

/** The glyph's own name: what it is, on which session, and that it explains. */
export function ownerGlyphName(owner: string, title: string): string {
	return `${owner[0]!.toUpperCase()}${owner.slice(1)}: ${title}. Hva betyr det?`
}

/**
 * A session's own volume, in its track's unit, at the row's right edge
 * (#505 D6): `6,1 km`, `55 min`, `13 sett`. Hours are said in minutes on a
 * single session — `0,9 t` is a week's number, not a run's.
 */
export function sessionVolumeLabel(
	value: number,
	currency: VolumeCurrency,
): string {
	switch (currency) {
		case 'km':
			// One decimal and a comma, as `formatNbVolumeFigure` writes km (labels.ts
			// imports no values, so `format.ts` can import it).
			return `${String(Math.round(value * 10) / 10).replace('.', ',')} km`
		case 'hours':
			return `${Math.round(value * 60)} min`
		case 'sets':
			return `${Math.round(value)} sett`
		case 'tss':
			return `${Math.round(value)} TSS`
	}
}

/**
 * The three week numbers' words (#505 stories 20–26, 33, 34, 85): the Week
 * Target, the Planned Volume and the Actual Volume per Training Track. Norwegian,
 * as the #505 surfaces are (ADR 0081).
 */
export const NB_VOLUME_UNITS: Record<VolumeCurrency, string> = {
	km: 'km',
	hours: 't',
	tss: 'TSS',
	sets: 'sett',
}

/** The currency as a word after "uten": `+2 uten km`, `+1 uten timer`. */
const NB_UNMEASURED_WORDS: Record<VolumeCurrency, string> = {
	km: 'km',
	hours: 'timer',
	tss: 'TSS',
	sets: 'sett',
}

/**
 * `+2 uten km` — sessions with no number in the track's currency, counted beside
 * the sum and never added to it as zero (#505 story 34).
 */
export function unmeasuredCountLabel(
	count: number,
	currency: VolumeCurrency,
	/** `−` when sessions without a number left the week (an undo). */
	sign: '+' | '−' = '+',
): string {
	return `${sign}${count} uten ${NB_UNMEASURED_WORDS[currency]}`
}

/**
 * `planlagt +2 uten km` / `gjort +1 uten km` — the same count as
 * {@link unmeasuredCountLabel}, with the side it belongs to said first, so the
 * planned and the done counts never read as one number twice (#505 story 34).
 */
export function sidedUnmeasuredLabel(
	side: 'planned' | 'done',
	count: number,
	currency: VolumeCurrency,
): string {
	return `${WEEK_FIGURE_LABELS[side]} ${unmeasuredCountLabel(count, currency)}`
}

/**
 * `2 økter uten km` — what stands where a sum would be when every session on
 * that side has no number in the track's unit: a dash would read as "nothing
 * planned" beside a zone split that says otherwise, and `0` would be a lie.
 */
export function unmeasuredFigureLabel(
	count: number,
	currency: VolumeCurrency,
): string {
	return `${count} ${count === 1 ? 'økt' : 'økter'} uten ${NB_UNMEASURED_WORDS[currency]}`
}

/**
 * Why a week whose days are past carries no verdict (`ungraded`), said so it
 * never contradicts the done figure beside it. Nothing done measured is the
 * plain `ikke målt`; something done and measured means the **reference** is
 * what is missing (`ikke vurdert · ingen planlagte km å holde det opp mot`);
 * nothing done at all is simply not graded yet.
 */
export function ungradedNoteLabel(
	currency: VolumeCurrency,
	actual: number | null,
): string {
	if (actual == null) return VOLUME_GRADE_LABELS.ungraded
	return actual > 0
		? `ikke vurdert · ingen planlagte ${NB_UNMEASURED_WORDS[currency]} å holde det opp mot`
		: 'ikke vurdert · ingen tall å holde opp mot'
}

/** Why one session has no number — every "ikke målt" gives a reason (story 71). */
export const UNMEASURED_REASON_LABELS: Record<UnmeasuredReason, string> = {
	'no-distance': 'ingen km i økta',
	'no-duration': 'ingen tid i økta',
	'no-tss': 'ingen TSS regnet ut',
	'no-sets': 'ingen sett i økta',
	'awaiting-import': 'tallene kommer fra importen',
	'no-sets-logged': 'ingen sett logget',
}

/** How a week's Actual Volume stands against what was asked through the days past. */
export const VOLUME_GRADE_LABELS: Record<VolumeGrade, string> = {
	'not-yet': 'ikke vurdert ennå',
	ungraded: 'ikke målt · ingen tall å holde opp mot',
	under: 'under',
	on: 'i rute',
	over: 'over',
}

/** A planned zone split is what the plan means, not what was measured (idea M). */
export const ZONE_INTENT_NOTE = 'hensikt, ikke en måling'

/** The mark on a week planned more than 10 % off its target (story 25). */
export const DRIFT_MARK = '≠'

/** The track that counts in nothing (story 33), and what it says about itself. */
export const ANNET_TRACK_LABELS = {
	name: 'Annet',
	note: 'teller ikke med',
} as const

/**
 * `til og med torsdag · resten ikke målt` — strength logged up to a day and not
 * after (story 85). `weekday` is Monday-first, 0 = Monday.
 */
export function strengthPartialLabel(weekday: number): string {
	return `til og med ${NB_WEEKDAY_LABELS[weekday]} · resten ikke målt`
}

/**
 * The three week numbers side by side (#505 story 23): the Week Target, the
 * Planned Volume and the Actual Volume.
 */
export const WEEK_FIGURE_LABELS = {
	target: 'mål',
	planned: 'planlagt',
	done: 'gjort',
} as const

/**
 * The tab names, in the spec's Norwegian (spec #558, ADR 0101 §1; ADR 0081
 * lets the spec's surfaces use the spec's own words). They are the bar's
 * labels and the titles of the tabs' landing pages, so the two never disagree.
 * _Sesong_ and _Bibliotek_ are retired as tab names: Plan is the old Sesong,
 * and Bibliotek is a section of it (`LIBRARY_LABELS.title`).
 */
export const APP_TAB_LABELS: Record<AppTab, string> = {
	today: 'I dag',
	plan: 'Plan',
	me: 'Meg',
}

/** The page header's back button, named for the screen it goes back to. */
export const PAGE_HEADER_LABELS = {
	back: (screen: string) => `Tilbake til ${screen}`,
} as const

/** The tab bar's own name, for the landmark it is. */
export const APP_TABS_NAV_LABEL = 'Hovedmeny'

/** What a `StatusButton` says to a screen reader while it works, and when done. */
export const STATUS_BUTTON_LABELS = {
	pending: 'Arbeider',
	success: 'Ferdig',
} as const

// ===========================================================================
// Shared strings (#505 round 2, r2-shared-strings): the workout schemas'
// validation messages and the shared intensity utils' chip and caption words,
// in Norwegian (ADR 0081). The editor, I dag and settings all read these. Only
// what is shown changes: a stored zone label, a recipe's own `description`, a
// race anchor key and a `pacePct`/`hrPct` target keep their stored form, and
// nothing here is read back by a parser.
// ===========================================================================

/**
 * The messages `WorkoutStructureSchema` / `WorkoutAuthoringSchema` (and the
 * editor's form schema, `workout-authoring.ts`) answer with. They reach the
 * athlete verbatim — the editor's summary line, a field's error, a 400 from
 * the server — so they are sentences, never a field name.
 */
export const WORKOUT_SCHEMA_MESSAGES = {
	tempo: 'Tempo skrives eksentrisk-pause-konsentrisk, for eksempel «3-0-3»',
	weightXorPct: 'Et sett kan ha kilo eller prosent av 1RM, ikke begge',
	loadOnce: 'Et sett oppgir belastningen bare én gang',
	repsPositive: 'Repetisjonene må være et helt tall over null',
	durationPositive: 'Tiden må være et helt antall sekunder over null',
	discipline: 'Velg en sport',
	durationXorDistance: 'Et steg kan ha tid eller distanse, ikke begge',
	oneQuantity: 'Et steg oppgir én mengde: tid, distanse eller høydemeter',
	cadenceOrder: 'Kadensen må gå fra lav til høy',
	exercise: 'Velg en øvelse',
	setsMin: 'Legg til minst ett sett',
	restOnce: 'En pause oppgir formen sin bare én gang',
	repeatMin: 'Antall ganger må være minst 1',
	seriesMin: 'Antall serier må være minst 1',
	blockStepsMin: 'En blokk må ha minst ett steg',
	betweenSeriesRest: 'Pause mellom serier krever mer enn én serie',
	sendOffOrRest: 'En blokk har enten avgangstid eller pauser, aldri begge',
	blocksMin: 'En økt må ha minst én blokk',
	titleRequired: 'Gi økta en tittel',
	titleMax: 'Tittelen kan ha høyst 120 tegn',
	intent: 'Velg et formål',
	scheduledAt: 'Velg en gyldig dato og et klokkeslett',
	/** The zero-step save's one summary line (workout-editor spec §11.6). */
	noSteps: 'Legg til minst ett steg for å lagre økta',
	// The editor's form schema (`workout-authoring.ts`) only.
	dateRequired: 'Velg en dato',
	timeRequired: 'Velg et klokkeslett',
	durationHint: 'Skriv en tid som «40 min» eller «1 t 30 min»',
	distanceHint: 'Skriv en distanse som «8 km»',
	stepDistanceHint: 'Skriv en distanse som «400 m» eller «1,2 km»',
	intensityHint: 'Fyll ut intensiteten eller fjern den',
	strengthNeedsExercises:
		'En styrkeøkt trenger øvelser — legg dem til i strukturen',
	durationOrDistance:
		'Skriv en tid (f.eks. «40 min») eller en distanse (f.eks. «8 km»)',
	durationXorDistanceSimple: 'Skriv enten en tid eller en distanse, ikke begge',
	// Zod's own generic fallbacks, re-worded for the summary line.
	invalid: 'Dette kan ikke lagres slik det står',
	required: 'Dette må fylles ut',
} as const

/**
 * The shared intensity utils' words (`intensity-target.ts`'s structure-line
 * label and zone caption, `zone-equivalent.ts`'s tinted chip): the reference a
 * percentage is of, a race pace, and the plain-words caption a zone code
 * carries (`E — rolig/utholdenhet`). FTP, MAP, CP and RPE are the athletes'
 * own words and stay; the stored target is unchanged.
 */
export const INTENSITY_DISPLAY_WORDS = {
	/** `hrPct` by its reference: `85–90% terskelpuls`, `70% makspuls`. */
	hrRef: { max: 'makspuls', lthr: 'terskelpuls' },
	/** `pacePct`: `98% terskelfart`. */
	thresholdPace: 'terskelfart',
	/** A race anchor as a distance: `105% maraton`. */
	race: {
		'1500m': '1500 m',
		'3k': '3 km',
		'5k': '5 km',
		'10k': '10 km',
		hm: 'halvmaraton',
		marathon: 'maraton',
	} as Record<string, string>,
	/** A race anchor as a pace: `5 km-fart`, `maratonfart`. */
	racePace: {
		'1500m': '1500 m-fart',
		'3k': '3 km-fart',
		'5k': '5 km-fart',
		'10k': '10 km-fart',
		hm: 'halvmaratonfart',
		marathon: 'maratonfart',
	} as Record<string, string>,
} as const

/**
 * A zone recipe's English `description` (`zones/recipes.ts`), keyed as
 * written, in the words the athlete reads beside the code. An unknown one
 * passes through, so a recipe added later still shows its own words.
 */
const ZONE_CAPTION_WORDS: Record<string, string> = {
	'active recovery': 'aktiv restitusjon',
	recovery: 'restitusjon',
	endurance: 'utholdenhet',
	'aerobic endurance': 'aerob utholdenhet',
	'easy/endurance': 'rolig/utholdenhet',
	easy: 'rolig',
	'easy aerobic': 'rolig aerob',
	moderate: 'moderat',
	tempo: 'tempo',
	'marathon pace': 'maratonfart',
	'sub-threshold': 'under terskel',
	'sub-threshold (lactate-guided)': 'under terskel (laktatstyrt)',
	threshold: 'terskel',
	'threshold (CSS)': 'terskel (CSS)',
	'above threshold': 'over terskel',
	'CSS and faster': 'CSS og raskere',
	'VO₂ max': 'VO₂maks',
	'interval (VO₂ max)': 'intervall (VO₂maks)',
	'repetition (speed)': 'repetisjon (fart)',
	'anaerobic capacity': 'anaerob kapasitet',
	'neuromuscular power': 'nevromuskulær kraft',
	'very easy': 'svært lett',
	'fairly easy': 'ganske lett',
	'comfortably hard': 'behagelig hardt',
	hard: 'hardt',
	'very hard': 'svært hardt',
}

/** `rolig/utholdenhet` for the Daniels `easy/endurance`; unknown passes through. */
export function nbZoneCaption(description: string): string {
	return ZONE_CAPTION_WORDS[description] ?? description
}
