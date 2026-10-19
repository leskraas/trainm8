/**
 * The shared enum→display-label layer (#281). Every athlete-facing enum value —
 * discipline, workout intent, step/intensity kind, event kind/priority/status,
 * event target, units, week-start day, structure mode, and integration
 * provider — is turned into its display string here, so `run`/`Run` never
 * disagree between a select trigger, its option list, and a badge.
 *
 * Sibling to `app/utils/format.ts` (ADR 0023) and the same house policy:
 *
 * - **English-only, fixed wording.** There is no i18n library yet; the labels
 *   are literal English strings. This module *is* the future i18n seam — when
 *   translation arrives it swaps the innards of one module, not every caller,
 *   so no surface should hand-capitalize or hard-code an enum's display text.
 *   New enum-facing UI must read its label from here.
 *   The #505 planning surfaces are the one exception to English: they speak
 *   the spec's Norwegian words (ADR 0081), and those labels live here too.
 * - **Values stay in the schema; labels live here.** The enum *value* arrays
 *   and their zod schemas remain in `workout-schema.ts` / `event-schema.ts` /
 *   `athlete-schema.ts` (the source of truth for what is valid). This module
 *   only imports their *types* (erased at build time), so it is a runtime leaf
 *   with no import cycle: schema files re-export these maps for their existing
 *   callers, everyone else imports straight from here.
 *
 * Some enums carry two athlete-facing registers on purpose (see
 * `getDisciplineLabel` vs `DISCIPLINE_LABELS`). Where that is deliberate the
 * rule is written down in `docs/design/ui-conventions.md` (§4.1 for the
 * discipline "Bike"/"Ride" split).
 */

// `import type` (not the house inline `{ type … }` style): Node's type
// stripping keeps an inline-specifier import statement as a side-effect
// import, which loads the schema modules at runtime and recreates the very
// import cycle this module exists to avoid (server boot then dies on a TDZ
// error). `import type` statements are erased entirely.
/* eslint-disable import/consistent-type-specifier-style */
import type { OriginPlatform } from '../integrations/shared/origin-platform.ts'
import type { AppTab } from './app-tabs.ts'
import type {
	CatalogueGoalEvent,
	CatalogueLevel,
	CataloguePhase,
	CatalogueTier,
	SessionArchetype,
} from './catalogue.ts'
import type { ConnectionHubStatus } from './connection-hub-status.ts'
import type { EffortWord } from './effort-word.ts'
import type { EventKind, EventPriority, EventStatus } from './event-schema.ts'
import type { FirstRunPlanRefusal } from './first-run/first-run-schema.ts'
import type { FindingAbsence, HoursEstimate } from './first-run/first-run.ts'
import type {
	SessionPreference,
	TrainingLevel,
} from './first-run/start-draft.ts'
import type {
	ImportLinkRefusal,
	MarkDoneRefusal,
} from './import-link-schema.ts'
// The domain owns *which* outcomes a stored Week Replan can carry (ADR 0080);
// this module owns the name each one goes by.
import type {
	JusterIntent,
	JusterRefusal,
	JusterUndoRefusal,
	SwapSource,
} from './juster.ts'
import type { AdherenceTone } from './load/adherence.ts'
import type { RoundVerdict } from './load/propose-next-round.ts'
import type { ReadinessTone } from './load/readiness.ts'
import type { LoadRecomputeKind } from './load/recompute-notice.ts'
import type { UnlaidReason } from './load/week-change.ts'
import type { UndoRefusal } from './load/week-replan-undo.server.ts'
import type { WeekHoldWhy } from './load/week-replan.ts'
import type { GenerationRefusal } from './plan-generation/generate.server.ts'
import type { GenerationIntent } from './plan-generation/season.ts'
// The domain owns *which* currencies accumulate across Disciplines (ADR 0043 §5);
// this module owns the sentence each accumulation is explained by.
import type { CreateOutlineRefusal } from './plan-outline/authoring.server.ts'
import type { AccumulatingCurrency } from './plan-outline/commensurability.ts'
import type { ClashReason } from './plan-outline/day-rule.ts'
import type {
	Rhythm,
	StrengthGoal,
	VolumeCurrency,
	WeekRole,
} from './plan-outline/derive.ts'
// The domain owns *why* a Training Track feeds nothing into the projected curve
// (ADR 0045 §6, ADR 0047 §5); this module owns how each reason is worded.
import type { AttachEventRefusal } from './plan-outline/open-ended.server.ts'
import type { SwitchPhilosophyRefusal } from './plan-outline/philosophy.server.ts'
import type { NoContributionReason } from './plan-outline/planned-load.ts'
import type { PresetFamily } from './plan-outline/presets.ts'
import type { QualityZone } from './plan-outline/quality-mix.ts'
import type { ApplySeasonEditRefusal } from './plan-outline/season-edit.server.ts'
import type { HeldNumber } from './plan-outline/season-edit.ts'
// The domain owns *which* readings a strength plan cannot state (ADR 0047 §5);
// this module owns how each one is worded.
import type { UnavailableReading } from './plan-outline/unavailable-readings.ts'
// …and *which* conventions the Volume Conversion stacked, and which stored
// thresholds it read (ADR 0045 §10).
import type {
	ConventionId,
	ThresholdField,
} from './plan-outline/volume-conversion.ts'
import type {
	PatternDayKind,
	PatternWeekday,
} from './plan-outline/week-pattern.ts'
// The domain owns *why* a week number is missing and how a week grades (#505
// stories 20–26, 34); this module owns the words for each.
import type {
	UnmeasuredReason,
	VolumeGrade,
} from './plan-outline/week-volumes.ts'
import type { PlannedDiscipline } from './planned-discipline.ts'
// The domain owns *who* a session belongs to (ADR 0080); this module owns the
// words the athlete reads for each owner.
import type {
	EstimateConfidence,
	EstimateRefusal,
	ThresholdConstruct,
	ThresholdProtocol,
} from './profile-analysis/types.ts'
import type { SessionOwner } from './session-ownership.ts'
import type { ActivityKind } from './simple-activity.ts'
import type { Attribution } from './source-terms.ts'
import type { RepLoadBasis } from './strength/anchors.constants.ts'
import type { OneRmRefusal } from './strength/one-rm.ts'
import type { PlateRefusal } from './strength/plates.ts'
import type {
	LiftScheme,
	SetUnit,
	WorkingLoad,
} from './strength/working-load.ts'
import type {
	AnchorProtocol,
	EquipmentId,
	EstimatorName,
} from './strength-log.ts'
import type { QuickLogRefusal } from './strength-quick-log.ts'
import type {
	Discipline,
	IntensityTarget,
	RestAct,
	StepKind,
	WorkoutIntent,
} from './workout-schema.ts'
import type { SentenceProblem, UnreadReason } from './workout-sentence.ts'
// Meg's sub-pages (round 2).
import type { ZoneAnchor } from './zones/types.ts'
/* eslint-enable import/consistent-type-specifier-style */

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
 * The three week numbers side by side (#505 story 23): the Week Target, the
 * Planned Volume and the Actual Volume.
 */
export const WEEK_FIGURE_LABELS = {
	target: 'mål',
	planned: 'planlagt',
	done: 'gjort',
} as const

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
// Ukeskiftet, the week change card on I dag (#505 stories 4–6, 42–55, ADR 0080)
// ---------------------------------------------------------------------------

/** The card's fixed words. */
export const WEEK_CHANGE_LABELS = {
	heading: 'Ukeskiftet',
	weekThatWent: 'Uka som gikk',
	proposalsNextWeek: 'Forslag for neste uke',
	proposalsThisWeek: 'Forslag for denne uka',
	tooLate: 'For sent',
	goToCard: 'Se forslagene',
	missed: 'Ikke gjort',
	extras: 'Ekstra',
	nothingMissed: 'Alt planlagt ble gjort.',
	emptyWeek: 'Ingenting var planlagt eller gjort.',
	ok: 'Ok',
	no: 'Nei takk',
	saving: 'Lagrer …',
	scopeLegend: 'Hvor lenge?',
	thisTime: 'bare denne gangen',
	fromNowOn: 'fra nå av',
	own: 'din økt',
	ownNote: 'Endres bare hvis du sier ja.',
	addsLoad: 'mer trening',
	answeredOk: 'Du sa ok',
	answeredNo: 'Du sa nei takk',
	ease: 'Gjør uka lettere −15 %',
	easeNote: 'Gjør de øktene som er igjen ca. 15 % kortere. Én gang per uke.',
	eased: 'Uka er gjort lettere (−15 %).',
	easeNothing: 'Det var ingen økter igjen å gjøre lettere. Ukemålet står.',
	targetStands: 'Ukemålet står.',
	nothingChanged: 'Ingenting er endret.',
	allAnswered: 'Alt er besvart. Vi sees neste søndag.',
	close: 'Lukk',
	failed: 'Svaret ble ikke lagret. Prøv igjen.',
	factorLegend: 'Hvor mye trening i neste blokk?',
} as const

/** The line on I dag that leads to the card: `Ukeskiftet: 3 forslag venter`. */
export function weekChangeWaitingLabel(count: number): string {
	return `Ukeskiftet: ${count} forslag venter`
}

/**
 * I dag's top line (#505 owner decision 3, ADR 0086): the plan, its goal,
 * "+ Ny", the Ukeskiftet badge and the I dag pill on one compact row.
 */
export const TOP_LINE_LABELS = {
	region: 'Planen',
	noPlan: 'Ingen plan',
	/** The no-plan line's link, to Plan. */
	noPlanAction: 'Lag en i Plan',
	/** A race with no name, on the countdown. */
	raceDay: 'Løpsdagen',
	/**
	 * The Ukeskiftet badge: short on screen (`1 forslag` — the count, then
	 * this word, which gives way on the narrowest phones), whole in its name.
	 */
	weekChangeWord: 'forslag',
	weekChangeName: (count: number) =>
		`Ukeskiftet: ${count} forslag venter. Gå til forslagene`,
} as const

/**
 * The goal countdown on the top line: `Halvmaraton om 12 uker`, counted in
 * whole weeks the way an athlete counts them, and in days in the last week.
 */
export function eventCountdownLabel(name: string, days: number): string {
	return `${name} ${eventCountdownWhen(days)}`
}

/** The countdown half alone — `om 12 uker` — which the top line never cuts. */
export function eventCountdownWhen(days: number): string {
	if (days <= 0) return 'i dag'
	if (days === 1) return 'i morgen'
	if (days < 7) return `om ${days} dager`
	const weeks = Math.round(days / 7)
	return `om ${weeks} ${weeks === 1 ? 'uke' : 'uker'}`
}

/** A round's peak week before → after its factor: `Toppuka: 4,5 → 5 t`. */
export function roundPeakLabel(
	before: string,
	after: string,
	unit: string,
): string {
	return `Toppuka: ${before} → ${after} ${unit}`
}

/** "Gjort i morges" — a proposal silence applied, on the morning it did. */
export function silencedLabel(today: boolean, weekday: number): string {
	return today ? 'Gjort i morges' : `Gjort ${NB_WEEKDAY_LABELS[weekday]} morgen`
}

/** `«Terskel 5×5»`, or `økta` when the session has no title to quote. */
export function quotedSession(title: string | null): string {
	return title ? `«${title}»` : 'økta'
}

/** A round's volume against the one before: `samme volum`, `+5 % volum`. */
export function roundFactorLabel(factor: number): string {
	const percent = Math.round((factor - 1) * 100)
	if (percent === 0) return 'samme volum'
	return `${percent > 0 ? '+' : '−'}${Math.abs(percent)} % volum`
}

/** A softening or a lengthening, said as the change: `ca. 10 % kortere`. */
function scaleWords(factor: number): string {
	const percent = Math.round(Math.abs(1 - factor) * 100)
	return `ca. ${percent} % ${factor < 1 ? 'kortere' : 'lengre'}`
}

const weekdayOf = (weekday: number) => NB_WEEKDAY_LABELS[weekday]!

/**
 * What each proposal proposes, as its headline. The reason says why; this says
 * what — so the athlete reads the change before the argument for it.
 */
export const WEEK_CHANGE_PROPOSAL_LABELS = {
	keepWeek: 'Uka står som planlagt',
	letGo: (session: string) => `La ${session} gå`,
	makeUp: (session: string, toWeekday: number) =>
		`Ta igjen ${session} ${weekdayOf(toWeekday)}`,
	move: (session: string, fromWeekday: number, toWeekday: number) =>
		`Flytt ${session} fra ${weekdayOf(fromWeekday)} til ${weekdayOf(toWeekday)}`,
	scale: (session: string, weekday: number | null, factor: number) =>
		weekday == null
			? `${session} ${scaleWords(factor)}`
			: `${session} ${weekdayOf(weekday)} ${scaleWords(factor)}`,
	scaleWeek: (factor: number) => `Uka ${scaleWords(factor)}`,
	swap: (session: string, other: string) =>
		`Bytt dag på ${session} og ${other}`,
	add: (weekday: number) => `Legg til en økt ${weekdayOf(weekday)}`,
	round: (name: string, weeks: number, factor: number) =>
		`${name}: ${nbWeeks(weeks)}, ${roundFactorLabel(factor)}`,
} as const

/**
 * What an answer did, said once it is given — what changed, and what did not
 * (#505 story 39's rule, here for the week change): a session moved or eased
 * never moves the Week Target, so the line says the target stands.
 */
export const WEEK_CHANGE_DONE_LABELS = {
	keepWeek: 'Ingenting er endret. Ukemålet står.',
	letGo: (session: string) =>
		`${session} står som ikke gjort. Ingenting er flyttet.`,
	makeUp: (session: string, toWeekday: number) =>
		`${session} er lagt inn igjen ${weekdayOf(toWeekday)}. Den gamle står som ikke gjort. Ukemålet står.`,
	moveThisTime: (session: string, toWeekday: number) =>
		`${session} er flyttet til ${weekdayOf(toWeekday)}, bare denne gangen. Ukemålet står.`,
	moveFromNowOn: (session: string, toWeekday: number) =>
		`${session} er flyttet til ${weekdayOf(toWeekday)}, også de neste ukene. Ukemålet står.`,
	scale: (session: string, factor: number) =>
		`${session} er gjort ${scaleWords(factor)}. Ukemålet står.`,
	scaleWeek: (factor: number) =>
		`Uka er gjort ${scaleWords(factor)}. Ukemålet står.`,
	swap: (session: string, other: string) =>
		`${session} og ${other} har byttet dag. Ukemålet står.`,
	add: (weekday: number) =>
		`Økta er lagt til ${weekdayOf(weekday)}. Ukemålet står.`,
	round: (name: string, factor: number) =>
		`${name} er lagt til planen, ${roundFactorLabel(factor)}.`,
	/** A pending proposal whose session passed before it was answered. */
	tooLateToAnswer:
		'Økta er allerede passert, så forslaget kan ikke brukes lenger. Ingenting er endret.',
	/** An Ok that found its session already past or gone. */
	tooLate: 'Økta var allerede passert eller borte, så ingenting ble endret.',
	declined: (session: string) => `${session} står som den var. Ukemålet står.`,
	declinedWeek: 'Ingenting er endret. Ukemålet står.',
	declinedAdd: 'Ingenting er lagt til. Ukemålet står.',
	declinedMakeUp: (session: string) =>
		`${session} står som ikke gjort, og blir ikke tatt igjen. Ukemålet står.`,
	declinedRound: 'Ingen ny blokk ennå. Vi spør igjen neste søndag.',
	/** An Ok on a round whose plan has changed shape since it was proposed. */
	roundNotApplied:
		'Planen er endret siden forslaget, så ingen blokk ble lagt til.',
	/** "Gjør uka lettere" done, with the week's planned sum before and after. */
	eased: (before: string, after: string, unit: string) =>
		`Uka: ${before} → ${after} ${unit} planlagt. Ukemålet står.`,
} as const

/** Why the server turned an answer on the card down, said to the athlete. */
export const WEEK_CHANGE_REFUSAL_LABELS: Record<
	| 'not-found'
	| 'already-answered'
	| 'already-applied'
	| 'scope-not-a-move'
	| 'scope-not-for-a-make-up'
	| 'factor-not-a-round'
	| 'factor-out-of-range'
	| 'not-a-week'
	| 'not-the-coming-week'
	| 'already-eased'
	| 'autopilot',
	string
> = {
	'not-found': 'Fant ikke forslaget.',
	'already-answered': 'Forslaget er allerede besvart.',
	'already-applied': 'Forslaget er allerede gjort.',
	'scope-not-a-move': 'Bare en flytting kan gjelde fra nå av.',
	'scope-not-for-a-make-up': 'En økt som tas igjen gjelder bare denne gangen.',
	'factor-not-a-round': 'Bare en ny blokk har et volum å velge.',
	'factor-out-of-range': 'Velg et volum mellom −50 % og +50 %.',
	'not-a-week': 'Det er ikke en uke.',
	'not-the-coming-week': 'Bare uka etter ukeskiftet kan gjøres lettere.',
	'already-eased': 'Uka er allerede gjort lettere.',
	autopilot: 'Autopiloten har allerede lagt ut denne uka.',
}

/** The coming week's planned sum, under the ease action: `Neste uke: 44 km planlagt`. */
export function easePlannedLabel(
	weekName: string,
	figure: string,
	unit: string,
): string {
	return `${weekName}: ${figure} ${unit} planlagt`
}

/**
 * The facts a held week's reason is worded from, already formatted: the
 * overshoot and the shortfall as `25 %`, the form as `−12`, and the trust gate's
 * days.
 */
export type WeekHoldFacts = {
	over: string
	under: string
	tsb: string
	requiredDays: number
	daysOfHistory: number
}

/** "Forrige uke ble 25 % tyngre enn planlagt" — the overshoot, said once. */
function overClause(over: string): string {
	return `Forrige uke ble ${over} tyngre enn planlagt`
}

/**
 * Why the Week Replan holds a week (#505 story 50: "keep" is a real proposal
 * with a reason), one sentence per branch of ADR 0025's judgment.
 */
export const WEEK_HOLD_REASON_LABELS: Record<
	WeekHoldWhy,
	(facts: WeekHoldFacts) => string
> = {
	'no-adherence': () =>
		'Forrige uke hadde ingen planlagt belastning å måle mot, så vi har for lite å gå på. Denne uka står som planlagt.',
	under: ({ under }) =>
		`Forrige uke ble ${under} lettere enn planlagt. Vi legger ikke på noe ekstra – denne uka står som planlagt.`,
	'on-target': () =>
		'Forrige uke gikk som planlagt. Denne uka står som den er.',
	'form-untrusted': ({ over, requiredDays, daysOfHistory }) =>
		`${overClause(over)}, men formtallet er først til å stole på etter ${requiredDays} dager (dag ${daysOfHistory} av ${requiredDays}). Vi endrer ingenting ennå.`,
	'form-missing': ({ over }) =>
		`${overClause(over)}, men vi har ikke noe formtall. Uten det endrer vi ingenting.`,
	fresh: ({ over, tsb }) =>
		`${overClause(over)}, men formen er ${tsb} – du tåler det. Denne uka står som planlagt.`,
	'nothing-adjustable': ({ over, tsb }) =>
		`${overClause(over)} og formen er ${tsb}, men det er ingen økter igjen denne uka som kan gjøres lettere. Vi endrer ingenting.`,
}

/**
 * A clash of the cross-track day rule (#589, ADR 0104 §1) as a clause that
 * names its days: `day` is the day it is on and `next` the day after, which
 * only the two-day reasons read. Weekdays as {@link NB_WEEKDAY_LABELS} say
 * them. Never a number: the rule reads kinds of days (ADR 0046).
 */
export const CLASH_REASON_LABELS: Record<
	ClashReason,
	(day: string, next: string) => string
> = {
	'lifting-on-hard-day': (day) => `${day} får både styrke og en hard økt`,
	'lifting-before-hard-day': (day, next) =>
		`${day} får styrke dagen før en hard økt ${next}`,
	'lifting-on-long-day': (day) => `${day} får både styrke og en langtur`,
	'hard-days-in-a-row': (day, next) =>
		`${day} og ${next} blir harde dager på rad`,
	'two-hard-sessions': (day) => `${day} får to harde økter`,
	'two-long-sessions': (day) => `${day} får to langturer`,
	'easy-before-hard-day': (day, next) =>
		`${day} får en rolig økt dagen før en hard økt ${next}`,
}

/**
 * Said after a Week Replan move when no free day fits the day rule (#596): the
 * move took the first free day anyway, and this says what that day gets.
 */
function noFittingDay(clash: string | null): string {
	return clash ? ` Ingen ledig dag passer helt denne uka – ${clash}.` : ''
}

/**
 * The Week Replan's proposal reasons (#505 story 44, ADR 0080), as the
 * deterministic author (`propose-week-change.ts`) writes them. Never worded as
 * though anything were already applied: nothing has changed when they are
 * written.
 */
export const WEEK_CHANGE_REASON_LABELS = {
	/** One session softened: `over` and `cut` as `25 %`, `tsb` as `−12`. */
	scale: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen er ${tsb}. Vi foreslår å gjøre denne økta ca. ${cut} kortere.`,
	/** Said after a proposal on one of the athlete's own sessions. */
	theirs: 'Dette er din økt, så den endres bare hvis du sier ja.',
	/** A missed session, which stays on its day either way (story 53). */
	notDone: (title: string, weekday: string) =>
		`«${title}» ble ikke gjort ${weekday}, og står der som ikke gjort.`,
	letGoHeavyWeek: (notDone: string) =>
		`${notDone} Uka var tung nok likevel, så vi foreslår å la den gå.`,
	/** `clash`: what the day gets when no free day fits (#596), else null. */
	makeUp: (notDone: string, weekday: string, clash: string | null) =>
		`${notDone} Vil du ta den igjen ${weekday}? Den dagen er ledig.${noFittingDay(clash)} Det gir mer trening denne uka, så den legges bare inn hvis du sier ja.`,
	letGoNoFreeDay: (notDone: string) =>
		`${notDone} Det er ingen ledig dag igjen denne uka, så vi foreslår å la den gå.`,
	letGo: (notDone: string) =>
		`${notDone} Vi foreslår å la den gå, så uka ikke blir for full.`,
	/** A slot missed two closed weeks running, moved to a free day. */
	slotMove: (
		title: string,
		slot: string,
		toWeekday: string,
		clash: string | null,
	) =>
		`«${title}» ble ikke gjort ${slot} to uker på rad. Kanskje ${slot} ikke passer? Vi foreslår å flytte den til ${toWeekday}, som er ledig – bare denne gangen, eller fra nå av.${noFittingDay(clash)}`,
	/** The week-level sentences for a week with changes proposed. */
	weekSoften: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen er ${tsb}. Vi foreslår å gjøre de neste øktene ca. ${cut} kortere.`,
	weekMakeUp:
		'En økt forrige uke ble ikke gjort. Vi foreslår å ta den igjen, men bare hvis du sier ja.',
	weekSlotMove:
		'En økt er ikke gjort to uker på rad. Vi foreslår å flytte den til en dag som er ledig.',
	/** The athlete's own "Gjør uka lettere −15 %" (story 51), as its reason. */
	easeWeek:
		'Du ba om en lettere uke, så de øktene som er igjen er gjort ca. 15 % kortere.',
} as const

/** The reason sentences' shape, whichever mode they are worded for. */
type WeekChangeReasonWords = {
	[K in keyof typeof WEEK_CHANGE_REASON_LABELS]: (typeof WEEK_CHANGE_REASON_LABELS)[K] extends string
		? string
		: (typeof WEEK_CHANGE_REASON_LABELS)[K]
}

/**
 * The same reasons for a week closed under **Autopilot** (#576, ADR 0100):
 * the same author and the same rules, worded as what the close does, since
 * nothing waits for a yes — the Autopilot Notice shows them as stored. A
 * make-up is never placed by the autopilot (§3), so its reason says the
 * missed session was let go; a proposal on the athlete's own session says
 * the session stands.
 */
export const AUTOPILOT_REASON_LABELS: WeekChangeReasonWords = {
	scale: (over, tsb, cut) =>
		`${overClause(over)}, og formen er ${tsb}. Økta er gjort ca. ${cut} kortere.`,
	theirs: 'Dette er din økt, så den står.',
	notDone: WEEK_CHANGE_REASON_LABELS.notDone,
	letGoHeavyWeek: (notDone) =>
		`${notDone} Uka var tung nok likevel, så vi lar den gå.`,
	makeUp: (notDone) =>
		`${notDone} Å ta den igjen ville gitt mer trening på en dag du ikke har valgt, så vi lar den gå. Du kan legge den inn selv.`,
	letGoNoFreeDay: (notDone) =>
		`${notDone} Det er ingen ledig dag igjen denne uka, så vi lar den gå.`,
	letGo: (notDone) => `${notDone} Vi lar den gå, så uka ikke blir for full.`,
	slotMove: (title, slot, toWeekday, clash) =>
		`«${title}» ble ikke gjort ${slot} to uker på rad, så den er flyttet til ${toWeekday}, som er ledig. Bare denne gangen.${noFittingDay(clash)}`,
	weekSoften: (over, tsb, cut) =>
		`${overClause(over)}, og formen er ${tsb}. De neste øktene er gjort ca. ${cut} kortere.`,
	weekMakeUp:
		'En økt forrige uke ble ikke gjort. Den står som ikke gjort, og vi la ikke inn en ekstra.',
	weekSlotMove:
		'En økt er ikke gjort to uker på rad, så den er flyttet til en dag som er ledig.',
	easeWeek: WEEK_CHANGE_REASON_LABELS.easeWeek,
}

/** "Lås opp" on one of the athlete's own planned rows (#505 story 55). */
export const RELEASE_ACTION_LABELS = {
	action: 'Lås opp',
	/** The button's accessible name: which session it hands back. */
	actionFor: (title: string) => `Lås opp ${title}`,
	note: 'Gi økta tilbake til appen, så den kan justere den igjen.',
	released: 'Låst opp. Appen kan justere økta igjen.',
	notFound: 'Fant ikke økta. Den kan være slettet.',
} as const

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
	/** ADR 0064 §2, said where the athlete would look for a weight field. */
	weightNote: 'Vekta står som planlagt. En annen vekt kan ikke logges her.',
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
	hint: 'Eller la linja stå tom og legg til 45 min Z2.',
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

/**
 * Where "+ Ny"'s other two ways in went (owner decision 6): I dag's top line
 * creates sessions only, and a race or a plan is started from Sesong.
 */
export const SESONG_ENTRY_LABELS = {
	newEvent: 'Nytt løp',
	newPlan: 'Ny plan',
	group: 'Start noe nytt',
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

// ---------------------------------------------------------------------------
// The first run (#505 stories 61–71): plain words, no zone codes
// ---------------------------------------------------------------------------

/** A number the Norwegian way: `6,5`, `1,5`. */
function nbNumber(value: number): string {
	return String(Math.round(value * 10) / 10).replace('.', ',')
}

/** `5:35` from seconds per kilometre. */
function paceClock(secPerKm: number): string {
	const total = Math.round(secPerKm)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Monday-first weekdays as a list: `tirsdag, torsdag og lørdag`. */
export function nbWeekdayList(days: readonly number[]): string {
	const names = days.map((day) => NB_WEEKDAY_LABELS[day] ?? '')
	if (names.length <= 1) return names.join('')
	return `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
}

/** Hours a week, Norwegian: `4 t`, `6,5 t`. */
export function nbHoursLabel(hours: number): string {
	return `${nbNumber(hours)} t`
}

/**
 * The hours estimate with its arithmetic shown (#505 story 65):
 * `43 km/uke à 5:35 ≈ 4 t`, and sport by sport where there are several —
 * `43 km/uke à 5:35 + 2 økter/uke à 1 t 15 min ≈ 6,5 t`.
 */
export function hoursEstimateLabel(estimate: HoursEstimate): string {
	const parts = estimate.parts.map((part) =>
		part.kind === 'pace'
			? `${part.kmPerWeek} km/uke à ${paceClock(part.paceSecPerKm)}`
			: `${nbNumber(part.sessionsPerWeek)} ${part.sessionsPerWeek === 1 ? 'økt' : 'økter'}/uke à ${nbDurationLabel(part.secondsPerSession)}`,
	)
	return `${parts.join(' + ')} ≈ ${nbHoursLabel(estimate.hours)}`
}

/** Why the history gave no number (#505 story 71), said on the start (#578). */
export const FINDING_ABSENCE_LABELS: Record<FindingAbsence, string> = {
	'not-connected':
		'Ikke målt · intervals.icu er ikke koblet til, og du har ikke logget økter her',
	importing: 'Ikke målt ennå · historikken hentes fortsatt fra intervals.icu',
	'no-sessions': 'Ikke målt · vi fant ingen økter de siste fire ukene',
	'no-duration': 'Ikke målt · øktene dine har ingen tid registrert',
	'only-strength':
		'Ikke målt · vi fant styrkeøkter, men ingen løping, sykling eller svømming',
}

/**
 * The shipped presets' phase names as the first run and I dag say them
 * (stories 19, 27, 66 and 70). Display only: the stored names stay as the
 * preset wrote them, so a plan made before this map still reads in Norwegian
 * and a phase the athlete named themselves reads as they wrote it.
 */
export const PRESET_PHASE_NAME_LABELS: Record<string, string> = {
	Base: 'Grunntrening',
	'Big base': 'Stor base',
	Build: 'Oppbygging',
	Peak: 'Spissing',
	Taper: 'Nedtrapping',
}

/** A phase's name in Norwegian where it is a preset's, else as written. */
export function nbPhaseName(name: string): string {
	return PRESET_PHASE_NAME_LABELS[name] ?? name
}

/** The start's shared words: the step count, the day pills, connecting. */
export const FIRST_RUN_LABELS = {
	stepOf: (step: number, of: number) => `Steg ${step} av ${of}`,
	/**
	 * The days as the start's day pills say them, Monday first (the Training
	 * Week's order); each pill is read out by its full name.
	 */
	dayShort: ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'],
	/** What a question left unanswered says. */
	messages: {
		daysRequired: 'Velg minst én dag',
	},
	/**
	 * Connecting intervals.icu from the start (#578): a quiet way from the
	 * level screen, never a step, and back to it.
	 */
	connect: {
		title: 'Koble til intervals.icu',
		intro:
			'Da kan vi lese de siste ukene dine og fylle ut timer og dager for deg. Vi henter bare fullførte økter.',
		keyLabel: 'API-nøkkel fra intervals.icu',
		keyHelp:
			'Du finner den i intervals.icu under Settings → Developer Settings.',
		submit: 'Koble til',
		connected: 'intervals.icu er koblet til.',
		next: 'Tilbake til start',
		skip: 'Ikke nå',
		skipConsequence:
			'Uten historikk bruker vi det som er vanlig for nivået ditt. Du kan koble til senere under Meg.',
		back: 'Tilbake til nivå og timer',
		emptyKey: 'Lim inn API-nøkkelen fra intervals.icu.',
		rejected:
			'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke – kopier den som gjelder nå.',
		unreachable: 'Vi fikk ikke kontakt med intervals.icu. Prøv igjen om litt.',
	},
	weeks: {
		/**
		 * Why the plan lays on fewer days than were chosen (`patternDaysFor`).
		 * The chosen days stay the athlete's availability.
		 */
		fewerDays: (chosen: number, used: number) =>
			`Du valgte ${chosen} dager. Planen bruker ${used}, så ingen økt blir kortere enn en halvtime.`,
	},
} as const

/** Why the first run's plan could not be made, said where it is refused. */
export const FIRST_RUN_REFUSAL_LABELS: Record<FirstRunPlanRefusal, string> = {
	'plan-already-active': 'Du har allerede en plan. Du finner den i Plan.',
	'nothing-to-lay':
		'Med disse svarene ble det ingen økter å legge. Velg minst én dag og noen timer i uka.',
	'option-unavailable':
		'Den måten å trene på finnes ikke for disse svarene. Velg en av dem som vises.',
}

/** `4,5 timer`, `1 time`: hours as a Norwegian reads them, comma and word. */
export function nbHoursWords(hours: number): string {
	return `${nbNumber(hours)} ${hours === 1 ? 'time' : 'timer'}`
}

/**
 * The simple start (#558 _Levende start_, #563): _Hvor er du nå?_ with the
 * hours, then _Hva liker du å trene?_ with the days, and _Uka di_ — the
 * **Week Sketch** — filling in beside them as the athlete answers.
 */
export const SIMPLE_START_LABELS = {
	title: 'Kom i gang',
	/** Each **Training Level**, with the one sentence that describes it. */
	levels: {
		beginner: {
			name: 'Nybegynner',
			description: 'Jeg er i gang, eller kommer tilbake etter en pause.',
		},
		recreational: {
			name: 'Mosjonist',
			description: 'Jeg trener jevnlig, to–tre ganger i uka.',
		},
		experienced: {
			name: 'Erfaren',
			description: 'Jeg har trent strukturert i flere år.',
		},
		competitive: {
			name: 'Konkurranse',
			description: 'Jeg trener mot resultater og tåler mye.',
		},
	} satisfies Record<TrainingLevel, { name: string; description: string }>,
	level: {
		title: 'Hvor er du nå?',
		legend: 'Nivå',
		hours: 'Omtrent hvor mye tid i uka?',
		fewer: 'Mindre tid',
		more: 'Mer tid',
		/** The hours' sentence at each end of the range (1–20). */
		atMin: 'Minst 1 time. Mindre enn det blir ingen plan.',
		atMax: 'Høyst 20 timer i uka. Mer enn det lager vi ikke plan for.',
		/** Between the ends: where the number came from. */
		typical: {
			beginner: 'Vanlig for en nybegynner.',
			recreational: 'Vanlig for en mosjonist.',
			experienced: 'Vanlig for en som har trent i flere år.',
			competitive: 'Vanlig for en som trener mot konkurranser.',
		} satisfies Record<TrainingLevel, string>,
		/** The hours are what the athlete trains now (ADR 0091 §3). */
		meaning: 'Det du trener nå. Planen starter der og bygger seg opp.',
		next: 'Neste',
	},
	activities: {
		title: 'Hva liker du å trene?',
		sport: 'Hovedidrett',
		sportHelp: 'Planen bygges rundt denne idretten.',
		days: 'Hvilke dager kan du trene?',
		/** How many days are picked, and that they are a limit. */
		daysPicked: (days: number) =>
			days === 0
				? 'Ingen dager valgt ennå.'
				: `${days} ${days === 1 ? 'dag' : 'dager'}. Vi legger aldri inn mer enn du har tid til.`,
		/** A _Nybegynner_ with more days than four (the level's session cap). */
		beginnerCap: (cap: number) =>
			`Som nybegynner får du høyst ${cap} økter i uka. Vi velger dagene som gir mest hvile mellom.`,
		/** Seven days: one stays free (`MAX_SESSION_DAYS`). */
		restDay: 'Alle sju dager er valgt. Vi holder én dag fri, så du får hvile.',
		next: 'Neste',
		/** Several endurance sports (#573): every one picked, and the main one. */
		sports: 'Utholdenhetsidretter',
		sportsHelp:
			'Velg så mange du vil. Den første du velger, blir hovedidretten.',
		mainSportLead: 'Hovedidrett:',
		/** The line as a button, where another picked sport can take over. */
		switchMainSport: (sport: string, next: string) =>
			`Hovedidrett: ${sport}. Bytt til ${next}`,
		switchHint: 'Bytt',
		/**
		 * One list of everything the athlete can pick (#584, the prototype's
		 * chips): the sports, the Simple Activities and _Styrke_.
		 */
		list: 'Aktiviteter',
		listHelp:
			'Velg så mange du vil. Den første utholdenhetsidretten du velger, blir hovedidretten.',
	},
	/** _Uka di_: the live week (story 26–29). */
	sketch: {
		title: 'Uka di',
		empty: 'Uka di er tom ennå',
		hint: 'Svarene dine blir til en uke her.',
		summary: (sessions: number, duration: string) =>
			`${sessions} ${sessions === 1 ? 'økt' : 'økter'} · ${duration}`,
		free: 'fri',
		/** A day as a screen reader hears it: `mandag: Rolig økt · Løping, 45 min`. */
		day: (weekday: string, what: string) => `${weekday}: ${what}`,
		session: (title: string, duration: string) => `${title}, ${duration}`,
		/** A lifting day as a screen reader hears it, by its session. */
		lifting: (title: string) => `styrke: ${title}`,
	},
	/**
	 * _Styrke_ on the activities screen (#574, ADR 0103): the chip, and the
	 * one tap it asks for — strength sessions a week, pre-set and the
	 * athlete's own answer.
	 */
	strength: {
		chip: 'Styrke',
		chipLabel: 'Styrke i tillegg',
		legend: 'Styrkeøkter i uka',
		choiceLabel: (count: number) =>
			`${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka`,
		/** Where the pre-set came from, said once. */
		fromHistory: (count: number) =>
			`Satt fra treningen din: du har løftet omtrent ${count} ${count === 1 ? 'gang' : 'ganger'} i uka.`,
		fromLevel: 'Vanlig for nivået ditt. Velg det som passer deg.',
		/** How the hours count strength (#558 story 73). */
		notInHours:
			'Styrke kommer i tillegg til timene, på dager uten harde økter.',
	},
	backTo: {
		level: 'Tilbake til nivå og timer',
		activities: 'Tilbake til hva du liker å trene',
	},
	messages: {
		levelRequired: 'Velg hvor du er nå',
		hoursRequired: 'Velg hvor mye tid du har i uka',
		hoursMin: 'Minst 1 time i uka',
		hoursMax: 'Høyst 20 timer i uka',
		hoursStep: 'Timene går i halve timer',
		disciplineRequired: 'Velg en idrett',
		strengthRequired: 'Velg 1, 2 eller 3 styrkeøkter i uka',
	},
} as const

/**
 * The athlete's history on the start's first screen (#578): where the hours
 * and days came from, the arithmetic behind a disclosure, the import still on
 * its way, and the two quiet ways out — connecting intervals.icu, and setting
 * the season up yourself.
 */
export const START_HISTORY_LABELS = {
	/** `Fra de siste fire ukene dine: 4 timer i uka, tirsdag og lørdag.` */
	fromHistory: (hours: string | null, days: string | null) =>
		`Fra de siste fire ukene dine: ${[hours ? `${hours} i uka` : null, days]
			.filter(Boolean)
			.join(', ')}.`,
	/** The history read, but it gave no hours: why, and what stands instead. */
	noHours: (reason: string) =>
		`${reason}. Vi bruker det som er vanlig for nivået ditt.`,
	importing:
		'Historikken din hentes fortsatt fra intervals.icu. Til den er her, bruker vi det som er vanlig for nivået ditt.',
	/** The arithmetic's disclosure, and its one line. */
	arithmetic: 'Slik regnet vi',
	arithmeticNote:
		'Snittet av de fire siste hele ukene, rundet til en halvtime.',
	connect:
		'Har du intervals.icu? Koble til, så henter vi treningen din derfra.',
	selfSetUp: 'Jeg vil heller sette opp sesongen selv',
} as const

/**
 * _Hva slags økter liker du?_ (#558, #571): the **Session Preferences**, the
 * start's fourth question, which orders the **Start Options**; and where _Meg_
 * shows and changes them with the **Training Level**.
 */
export const SESSION_PREFERENCE_LABELS = {
	title: 'Hva slags økter liker du?',
	intro:
		'Vi bruker svaret til å velge hvilken måte å trene på du ser først. Velg så mange du vil.',
	legend: 'Økter du liker',
	/** Each preference, with the one line that says what it means. */
	options: {
		long: {
			name: 'Lange, rolige turer',
			description: 'Tid i beina, i et tempo der du kan prate.',
		},
		intervals: {
			name: 'Korte, harde intervaller',
			description: 'Få minutter der det virkelig går unna.',
		},
		threshold: {
			name: 'Jevnt hardt',
			description: 'Lengre drag der du jobber kontrollert hardt.',
		},
		short: {
			name: 'Korte økter',
			description: 'Høyst 45 minutter på hverdager.',
		},
		surprise: {
			name: 'Overrask meg',
			description: 'Bland gjerne, jeg liker variasjon.',
		},
	} satisfies Record<SessionPreference, { name: string; description: string }>,
	/** The way on: with something picked, or the skip (story 23). */
	next: (picked: number) =>
		picked > 0 ? 'Vis måtene å trene på' : 'Hopp over',
	back: 'Tilbake til hva du liker å trene',
	/** From the Start Options, back to this question. */
	backHere: 'Tilbake til hva slags økter du liker',
	/** _Korte økter_ with _Lange, rolige turer_: how the two are met (story 24). */
	shortAndLong:
		'Du liker både korte økter og lange turer: hverdagsøktene blir høyst 45 minutter, og langturen får bli lang.',
	/** Week 1 short of the hours because of _Korte økter_ (ADR 0102 §4). */
	shortOfHours: (planned: string, hours: string) =>
		`Uka blir ${planned}, ikke ${hours}: du valgte korte økter, så ingen økt på en hverdag er over 45 minutter.`,
	/** The preferences as one line: `Korte økter, Jevnt hardt`. */
	list: (names: readonly string[]) =>
		names.length === 0 ? 'Ingen valgt' : names.join(', '),
	/** _Meg_'s page for the start's answers. */
	meg: {
		title: 'Nivå og økter',
		/** The row on Meg: `Mosjonist · Korte økter`. */
		row: (level: string | null, preferences: string) =>
			`${level ?? 'Nivå ikke valgt'} · ${preferences}`,
		intro:
			'Det du svarte da planen ble laget. Endrer du her, endres ikke uka som ligger. Det brukes neste gang du velger en måte å trene på.',
		level: 'Nivå',
		activities: 'Aktiviteter',
		activitiesNone: 'Ingen plan ennå, så ingen aktiviteter.',
		activitiesNote:
			'Idrettene planen din har spor for. Du legger til og fjerner dem i Plan, under Avansert.',
		activitiesLink: 'Endre aktiviteter i Plan',
		save: 'Lagre',
		saved: 'Nivå og økter er lagret.',
	},
} as const

/** Months in full, as the start says a date: `19. oktober`. */
const NB_MONTHS_LONG = [
	'januar',
	'februar',
	'mars',
	'april',
	'mai',
	'juni',
	'juli',
	'august',
	'september',
	'oktober',
	'november',
	'desember',
] as const

/** `mandag 19. oktober`: a calendar day (`YYYY-MM-DD`), weekday and all. */
export function nbLongDay(dayKey: string): string {
	const [year, month, day] = dayKey.split('-').map(Number) as [
		number,
		number,
		number,
	]
	const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
	return `${NB_WEEKDAY_LABELS[weekday]} ${day}. ${NB_MONTHS_LONG[month - 1]}`
}

/** The families the start offers, each with its plain name. */
type StartFamily = Exclude<PresetFamily, 'masters'>

/**
 * _Tre måter å trene på_ (#558, #566): the **Start Options**, each a card led
 * by a plain name with the family's name small, and _Velg denne_.
 */
export const START_OPTION_LABELS = {
	metaTitle: 'Tre måter å trene på',
	/** The heading says how many ways there are once identical ones merged. */
	title: (count: number) =>
		count >= 3
			? 'Tre måter å trene på'
			: count === 2
				? 'To måter å trene på'
				: 'Én måte å trene på',
	intro: (count: number, hours: string, days: number) =>
		`${count === 1 ? 'Det er' : 'Hver er'} en ekte første uke med ${hours} på ${days} ${days === 1 ? 'dag' : 'dager'}.`,
	/** Why there are fewer than three (ADR 0102 §2). */
	merged: (shown: number) =>
		shown === 1
			? 'Med disse svarene la alle måtene nøyaktig samme uke, så du ser bare én.'
			: 'Med disse svarene la to av måtene nøyaktig samme uke, så du ser bare to.',
	/** Each family's plain name and why, the way variant A wrote them. */
	plain: {
		polarized: {
			name: 'Mest rolig, litt veldig hardt',
			why: 'Nesten alt går rolig. Av og til går det skikkelig hardt. Gir mye form for lite slitasje.',
		},
		threshold: {
			name: 'Jevnt og kontrollert hardt',
			why: 'Økter der du jobber jevnt hardt i lengre drag. Effektivt når tiden er knapp.',
		},
		classic: {
			name: 'Variert og bygger seg opp',
			why: 'Litt av alt. Tre uker blir gradvis tyngre, den fjerde er lett så kroppen tar igjen.',
		},
		'big-base': {
			name: 'Bygg grunnform først',
			why: 'Bare rolig trening i starten, så blir det hardere. Trygt når du starter opp.',
		},
	} satisfies Record<StartFamily, { name: string; why: string }>,
	familyName: (name: string) => `Fagnavn: ${name}`,
	badge: {
		'best-fit': 'Passer deg best',
		level: 'Anbefalt for nivået ditt',
	},
	/** A session's Effort Word: never a Training Zone. */
	effort: {
		rolig: 'rolig',
		middels: 'middels',
		hard: 'hard',
	} satisfies Record<EffortWord, string>,
	/** The bar of easy, middling and hard time, for a screen reader. */
	effortBar: (easy: number, moderate: number, hard: number) =>
		`${easy} % rolig, ${moderate} % middels, ${hard} % hard`,
	total: (duration: string) => `${duration} i uka`,
	sessions: (count: number) => `${count} ${count === 1 ? 'økt' : 'økter'}`,
	hardSessions: (count: number) => `${count} ${count === 1 ? 'hard' : 'harde'}`,
	free: 'fri',
	/** A session's facts on its row: `45 min · rolig`. */
	sessionFacts: (duration: string, effort: string) => `${duration} · ${effort}`,
	/** Week 1 short of the hours given (ADR 0102 §4), with the reason. */
	shortOfHours: (planned: string, hours: string) =>
		`Uka blir ${planned}, ikke ${hours}: øktene kan ikke bli lengre på dagene du valgte.`,
	startsOn: (day: string) => `Planen starter ${day}.`,
	/** Strength beside the hours, never in them (#574): `+2 styrkeøkter`. */
	plusStrength: (count: number) =>
		`+${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'}`,
	/** The strength frequency on the card, as the athlete's own answer. */
	strengthChoice: (count: number) =>
		`Styrke ${count} ${count === 1 ? 'gang' : 'ganger'} i uka, som du valgte.`,
	/** A _Nybegynner_'s lifts count in the session cap, so endurance got fewer. */
	strengthTakesDays: (cap: number, endurance: number) =>
		`Som nybegynner får du høyst ${cap} økter i uka, styrke medregnet, så utholdenheten får ${endurance}.`,
	/** Fewer lifting days than tapped: there were not more days. */
	strengthFewer: (laid: number, chosen: number) =>
		`Du valgte ${chosen} styrkeøkter. Dagene dine ga plass til ${laid}.`,
	choose: 'Velg denne',
	/** _Velg denne_ as a screen reader hears it, with the card's name. */
	chooseLabel: (name: string) => `Velg denne: ${name}`,
	rail: 'Måtene å trene på',
	railRole: 'karusell',
	cardRole: 'måte',
	card: (index: number, count: number, name: string) =>
		`${index} av ${count}: ${name}`,
	pager: 'Bla mellom måtene',
	dot: (index: number, count: number, name: string) =>
		`Vis ${index} av ${count}: ${name}`,
	back: 'Tilbake til hva du liker å trene',
	/** Sports picked that the week has no day for (#573), lower case. */
	sportsLeftOut: (sessions: number, sports: readonly string[]) =>
		`Uka har plass til ${sessions} ${sessions === 1 ? 'økt' : 'økter'}, så ${
			sports.length <= 1
				? sports.join('')
				: `${sports.slice(0, -1).join(', ')} og ${sports.at(-1)}`
		} fikk ikke egne dager. Velg flere dager, mer tid eller færre idretter.`,
} as const

/**
 * _Planen er klar_ (#558, #570): what _Velg denne_ made, by its plain name,
 * the day it begins, 12 weeks of hours, how it moves each Sunday, and _Under
 * panseret_ — a read-only view of everything that was written.
 */
export const PLAN_READY_LABELS = {
	metaTitle: 'Planen er klar',
	overline: 'Planen er klar',
	startsOn: (day: string) => `Planen starter ${day}.`,
	curveTitle: 'Timer i uka, de neste 12 ukene',
	/** The curve as a screen reader hears it. */
	curveName: (laid: number, projected: number) =>
		`Timer i uka: ${laid} uker som planen er lagt, så ${projected} uker hvis du trener som planlagt. De lette ukene er de lave søylene.`,
	curveCaption: 'Timer i uka, uke for uke',
	track: 'Timer',
	/** The lighter bars: ADR 0079's next rounds, if every week is done to plan. */
	ifAsPlanned: 'hvis du trener som planlagt',
	/** The chart's legend (#584): the round as laid, then the projection. */
	legendLaid: 'Lagt',
	legendProjected: 'Hvis du trener som planlagt',
	/** The step each projected round takes, under the 8 % guard. */
	note: (percent: number) =>
		percent > 0
			? `De neste blokkene får ${percent} % mer per blokk hvis du trener som planlagt.`
			: 'De neste blokkene holder samme nivå, fordi planen allerede bygger så raskt den kan.',
	/** How the plan moves (story 49): the autopilot, undo and _Spør meg først_. */
	sunday:
		'Hver søndag kveld legger appen ut neste uke, ut fra det du faktisk trente. Du får beskjed om hva den gjorde, og kan angre. Vil du heller at den spør deg først, velger du Spør meg først i Meg.',
	hood: {
		title: 'Under panseret',
		intro:
			'Dette er det appen laget av svarene dine. Den bruker det hver gang en ny uke legges ut. Du trenger aldri å se det, men det ligger her.',
		family: 'Filosofi',
		length: 'Lengde',
		openEnded: 'Åpen, uten løp og uten sluttdato. Den går blokk for blokk.',
		race: (name: string, day: string) => `Mot ${name}, ${day}.`,
		rhythm: 'Rytme',
		rhythms: {
			'3:1': '3 uker som bygger, så 1 lett',
			'2:1': '2 uker som bygger, så 1 lett',
			none: 'Ingen lett uke',
		} satisfies Record<Rhythm, string>,
		tracks: 'Spor',
		/** `Løping, starter på 3 t/uke`: a track and its Season Anchor. */
		track: (name: string, start: string | null) =>
			start == null ? name : `${name}, starter på ${start}`,
		level: 'Nivå',
		/** The Strength Frequency answer (#574, ADR 0103). */
		strength: 'Styrke',
		strengthPerWeek: (count: number) =>
			`${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka`,
		/** The Session Preferences, each by its own name (#571). */
		preferences: 'Økter du liker',
		pattern: 'Ukemønster',
		free: 'fri',
		/** A share day: `Løping · andel, vekt 1,5`. */
		shareDay: (track: string, weight: number) =>
			`${track} · andel, vekt ${nbNumber(weight)}`,
		fixedDay: (track: string, title: string) => `${track} · ${title}`,
		weeks: 'Timer per uke i blokka som er lagt',
		/** `uke 43`. */
		week: (number: number) => `uke ${number}`,
		easy: 'lett uke',
	},
	toToday: 'Til I dag',
} as const

/**
 * The **Simple Activities** in the simple start (#572): the chips, what they
 * are, the week laid from them alone, and _Fikk ikke plass_.
 */
export const START_SIMPLE_ACTIVITY_LABELS = {
	legend: 'Andre aktiviteter',
	help: 'Planlagt med tid og innsats. Teller i ukas timer.',
	nothingPicked: 'Velg en idrett eller en aktivitet',
	/** Story 16: no modelled endurance sport, so one simple week. */
	simpleOnly:
		'Uten en utholdenhetsidrett blir det én enkel uke med øktene spredt ut, ikke flere å velge mellom.',
	/** Story 41: what did not fit week 1, and what would make room. */
	notFitted: (kinds: readonly ActivityKind[], room: 'days' | 'hours') => {
		const names = nbJoin(
			kinds.map((kind) => SIMPLE_ACTIVITY_LABELS.kind[kind].toLowerCase()),
		)
		const them = kinds.length === 1 ? 'den' : 'de'
		return room === 'days'
			? `Fikk ikke plass denne uka: ${names}. Velg en dag til, så kommer ${them} med.`
			: `Fikk ikke plass denne uka: ${names}. Gi uka mer tid, så kommer ${them} med.`
	},
	/** The one hours Training Track the Simple Activities share, on `other`. */
	track: 'Enkle aktiviteter',
} as const

/**
 * What one session does to its week, in the track's unit (#505 stories 37 and
 * 39) — the preview under the writing line and the toast after a change.
 */
export const WEEK_SUM_LABELS = {
	unit: (currency: VolumeCurrency) => NB_VOLUME_UNITS[currency],
	targetStands: (target: string) => `målet står på ${target}`,
	targetStayed: (target: string) => `Ukemålet står på ${target}.`,
	noTargetPreview: 'uka har ikke noe ukemål',
	noTargetChange: 'Uka har ikke noe ukemål.',
	pricedOnSave: (currency: VolumeCurrency) =>
		`${NB_VOLUME_UNITS[currency]} regnes ut når økta er lagret`,
	annetPreview: 'Teller i Annet — ingen ukesum flytter seg',
	noPlanPreview: 'Ingen plan, så ikke noe ukemål å regne mot',
	noPlanChange: (change: 'added' | 'removed') =>
		change === 'added'
			? 'Økta er lagt inn. Uten plan er det ikke noe ukemål.'
			: 'Økta er fjernet. Uten plan er det ikke noe ukemål.',
	annetChange: (change: 'added' | 'removed') =>
		change === 'added'
			? 'Økta teller i Annet. Ingen ukesum flyttet seg.'
			: 'Økta talte i Annet. Ingen ukesum flyttet seg.',
} as const

/** The Load Recompute Notice on I dag (ADR 0046 §2). */
export const RECOMPUTE_NOTICE_LABELS = {
	/**
	 * Each correction's kicker and explanation, written together, so a `kind`
	 * can never inherit another's headline.
	 *
	 * The explanation deliberately does **not** point the athlete at the
	 * discipline mix as the honest home for their strength load. The mix is a
	 * share-of-total surface that still prices a strength slice against
	 * endurance TSS — the same defect one surface over, and its own open ruling.
	 * Copy that sent readers there would be vouching for a number this change
	 * hasn't fixed.
	 */
	copy: {
		'strength-left-the-triad': {
			kicker: 'Kondisjonen er regnet ut på nytt',
			explanation:
				'Styrkeøkter teller ikke lenger med i kondisjon, tretthet og form. Det finnes ingen ærlig måte å prise en styrkeøkt i samme enhet som en utholdenhetsøkt, så de tre tallene gjelder nå bare utholdenhet — og sier det. Treningen din er den samme; det som er endret, er hva tallene påstår å måle.',
		},
	} satisfies Record<
		LoadRecomputeKind,
		{ kicker: string; explanation: string }
	>,
	movement: (drop: string, before: string, after: string) =>
		`Kondisjonen falt med opptil ${drop} — ${before} → ${after} på det meste`,
	gotIt: 'Skjønner',
} as const

/**
 * The option that makes a plan with no Event and no end date (#505 story 1,
 * ADR 0079). Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const OPEN_ENDED_PLAN_LABEL = 'Hold meg aktiv'

/**
 * _Hold meg aktiv_'s form on Sesong's plan creation (ADR 0079), and the two
 * questions' messages it shares with the first run (`open-ended-schema.ts`).
 */
export const OPEN_ENDED_FORM_LABELS = {
	intro: (roundWeeks: number) =>
		`Ingen løp og ingen sluttdato. Planen går i blokker på ${roundWeeks} uker, tre som bygger og én lett, og fortsetter blokk for blokk.`,
	alreadyActive: 'Du har allerede en plan uten slutt.',
	openPlan: 'Åpne planen',
	discipline: 'Hva trener du mest?',
	hours: 'Timer i uka',
	hoursFromHistory: 'Snittet ditt de siste 4 ukene. Endre det om du vil.',
	hoursUnmeasured:
		'Vi fant ingen økter å regne fra, så skriv det du har tid til.',
	create: 'Lag planen',
	createFailed: 'Planen kunne ikke lages.',
	disciplineRequired: 'Velg en aktivitet',
	hoursRequired: 'Skriv hvor mange timer i uka',
	hoursPositive: 'Mer enn null timer i uka',
	hoursMax: 'Høyst 40 timer i uka',
} as const

/**
 * The name a round of an open-ended plan is laid with: `Blokk 1`, `Blokk 2`.
 * Only a starting name; a phase's name stays free text the athlete may change
 * (ADR 0079 §2).
 */
export function openEndedRoundName(round: number): string {
	return `Blokk ${round}`
}

/**
 * Where an athlete is in an open-ended plan: the round they are in, counted by
 * phase position and never by name, and no end (#505 story 9).
 */
export function openEndedBlockLabel(round: number): string {
	return `blokk ${round} av ∞`
}

/**
 * Adding an Event to an open-ended plan (#505 stories 7–8, ADR 0079 §4), as
 * the plan page words it. Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const ATTACH_EVENT_LABELS = {
	open: 'Legg til et løp',
	intro:
		'Runden du er i slutter etter denne uka, og planen bygger mot løpet derfra. Ukene du har trent og øktene dine blir stående.',
	choose: 'Velg et løp',
	orNew: 'Eller lag et nytt løp',
	newRace: 'Nytt løp',
	name: 'Navn på løpet',
	date: 'Dato',
	submit: 'Legg til løpet',
	done: 'Planen bygger mot løpet nå',
	pickOne: 'Velg et løp, eller skriv navn og dato for et nytt.',
	notBoth: 'Velg et løp eller lag et nytt – ikke begge.',
	nameMissing: 'Gi løpet et navn.',
	dateMissing: 'Skriv datoen for løpet.',
} as const

/** Why adding an Event to an open-ended plan was refused, as the athlete reads it. */
export const ATTACH_EVENT_REFUSAL_LABELS: Record<AttachEventRefusal, string> = {
	'outline-not-found': 'Fant ikke planen. Den kan ha fått et løp allerede.',
	'event-not-found': 'Fant ikke det løpet.',
	'event-cancelled': 'Det løpet er avlyst.',
	'event-past': 'Det løpet har allerede vært.',
	'event-already-planned': 'Det løpet har allerede en plan.',
	'event-too-soon':
		'Løpet er denne uka, så det er ingen uker igjen å bygge mot det.',
}

/**
 * What adding an Event did, in one sentence: the round that ended and the
 * phases laid toward the race.
 */
export function attachedEventSentence(
	ended: { name: string; weeks: number },
	phases: Array<{ name: string; weeks: number }>,
): string {
	const laid = phases
		.map((phase) => `${phase.name} ${nbWeeks(phase.weeks)}`)
		.join(', ')
	return `${ended.name} slutter etter ${nbWeeks(ended.weeks)}. Mot løpet: ${laid}.`
}

/** A count of weeks in Norwegian: `1 uke`, `3 uker`. */
export function nbWeeks(count: number): string {
	return count === 1 ? '1 uke' : `${count} uker`
}

/** "den siste uka" / "de siste 3 ukene" — the weeks a round was graded on. */
function lastWeeks(count: number): string {
	return count === 1 ? 'den siste uka' : `de siste ${count} ukene`
}

/**
 * Why an open-ended plan's next round is the size it is (ADR 0079 §3), in
 * plain Norwegian. `graded` is how many lived weeks the verdict read, and
 * `stepPercent` the step the round is authored at — the capped figure, so the
 * reason states what is made (#584).
 */
export function nextRoundReason(
	verdict: RoundVerdict,
	round: number,
	graded: number,
	stepPercent: number,
	{ autopilot = false }: { autopilot?: boolean } = {},
): string {
	const ended = openEndedRoundName(round)
	const next = openEndedRoundName(round + 1)
	if (autopilot)
		return nextRoundAutopilotReason(verdict, ended, next, graded, stepPercent)
	const same = `Vi foreslår ${next} med like mye trening som ${ended}`
	switch (verdict.kind) {
		case 'done-to-plan':
			// A ramp already at the guard leaves the round no room to step up (#584).
			if (stepPercent <= 0)
				return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${same}, fordi blokka allerede øker så mye fra uke til uke.`
			return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. Vi foreslår ${next} med ca. ${stepPercent} % mer trening. Det er mer belastning, så den legges bare inn hvis du sier ja.`
		case 'missed-weeks':
			return `${verdict.missed} av ${lastWeeks(graded)} ble ikke gjort som planlagt. ${same}, så planen ikke presser deg etter en tung blokk.`
		case 'unmeasured':
			return `${verdict.unmeasured} av ${lastWeeks(graded)} hadde ingen planlagte økter å måle mot, så vi kan ikke si at ${ended} gikk etter planen. ${same}.`
		case 'too-early':
			return `${ended} er for kort til å måle ennå. ${same}.`
	}
}

/**
 * The next round's reason under Autopilot (#576, ADR 0100 §2, amending ADR
 * 0079 §3): the round is appended at the close, so the reason says it is.
 */
function nextRoundAutopilotReason(
	verdict: RoundVerdict,
	ended: string,
	next: string,
	graded: number,
	stepPercent: number,
): string {
	const same = `${next} er lagt inn med like mye trening som ${ended}`
	switch (verdict.kind) {
		case 'done-to-plan':
			// A ramp already at the guard leaves the round no room to step up (#584).
			if (stepPercent <= 0)
				return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${same}, fordi blokka allerede øker så mye fra uke til uke.`
			return `${ended} har gått etter planen: ${lastWeeks(graded)} ble gjort som planlagt. ${next} er lagt inn med ca. ${stepPercent} % mer trening.`
		case 'missed-weeks':
			return `${verdict.missed} av ${lastWeeks(graded)} ble ikke gjort som planlagt. ${same}, så planen ikke presser deg etter en tung blokk.`
		case 'unmeasured':
			return `${verdict.unmeasured} av ${lastWeeks(graded)} hadde ingen planlagte økter å måle mot, så vi kan ikke si at ${ended} gikk etter planen. ${same}.`
		case 'too-early':
			return `${ended} er for kort til å måle ennå. ${same}.`
	}
}

/**
 * Each Periodization Preset family by the name the athlete picks it by — a
 * _filosofi_ (#505 story 10). Norwegian, as the #505 surfaces are (ADR 0081).
 */
export const PHILOSOPHY_LABELS: Record<PresetFamily, string> = {
	classic: 'Klassisk 3:1',
	masters: 'Masters 2:1',
	'big-base': 'Stor base',
	polarized: 'Polarisert 80/20',
	threshold: 'Terskelfokus',
}

/**
 * What each philosophy is, in a sentence of plain words and no zone codes
 * (#505 stories 10 and 70): the method the athlete is choosing to believe in.
 */
export const PHILOSOPHY_DESCRIPTIONS: Record<PresetFamily, string> = {
	classic:
		'Tre uker der treningen øker, så én lett uke. De harde øktene blir flere og hardere utover sesongen.',
	masters:
		'To uker der treningen øker, så én lett uke. Du får hvile oftere – fint når kroppen trenger lengre tid på å hente seg inn.',
	'big-base':
		'En lang periode med mye rolig trening først. Når de harde øktene kommer, går mengden litt ned.',
	polarized:
		'Det meste går rolig, og litt går veldig hardt. Nesten ingenting i midten – rolig er rolig, og hardt er hardt.',
	threshold:
		'Bygget rundt kontrollert harde økter i tempo og på terskel, to i uka. Ingen helt harde økter.',
}

/** A quality session's kind by its zone, in plain words (#505 story 70). */
export const QUALITY_ZONE_PLAIN_LABELS: Record<QualityZone, string> = {
	3: 'tempo',
	4: 'terskel',
	5: 'veldig hard',
}

/** A Quality Session Mix in plain words: `1 tempo + 1 terskel i uka`. */
export function plainMixSentence(
	mix: ReadonlyArray<{ zone: QualityZone; sessionsPerWeek: number }>,
): string {
	const terms = mix.filter((entry) => entry.sessionsPerWeek > 0)
	if (terms.length === 0) return 'ingen harde økter'
	return `${terms
		.map((e) => `${e.sessionsPerWeek} ${QUALITY_ZONE_PLAIN_LABELS[e.zone]}`)
		.join(' + ')} i uka`
}

/** Switching philosophy on the plan page (#505 stories 12–14). */
export const PHILOSOPHY_SWITCH_LABELS = {
	title: 'Filosofi',
	follows: 'Planen følger',
	/** A plan that records no family and whose phases read as none (audit B4). */
	none: 'Ingen filosofi valgt',
	noneHint:
		'Planen er ikke knyttet til en filosofi. Velg en under «Bytt filosofi» hvis du vil.',
	open: 'Bytt filosofi',
	choose: 'Velg en filosofi',
	intro:
		'Planen endres fra første uke som ikke har begynt. Ukene du har trent og øktene du har skrevet eller endret selv blir stående.',
	showPreview: 'Vis forhåndsvisning',
	preview: 'Forhåndsvisning',
	before: 'Nå',
	after: 'Etter byttet',
	weeks: 'Uke for uke',
	weekColumn: 'Uke',
	cancel: 'Avbryt',
	done: 'Planen følger en ny filosofi',
	pickOne: 'Velg en filosofi.',
	previewFirst: 'Se forhåndsvisningen før du bytter.',
	aroundYours:
		'Tallene er ukemålene. I uker der du har egne økter, legges appens økter rundt dem.',
	ended: 'slutt',
} as const

/** The confirm button: `Bytt til Polarisert 80/20`. */
export function switchToLabel(family: PresetFamily): string {
	return `Bytt til ${PHILOSOPHY_LABELS[family]}`
}

/** The preview's first line: from which week the plan changes, and to what. */
export function philosophyPreviewSentence(
	from: PresetFamily | null,
	to: PresetFamily,
	fromDate: string,
): string {
	const was = from ? `${PHILOSOPHY_LABELS[from]} → ` : ''
	return `${was}${PHILOSOPHY_LABELS[to]} fra uka som starter ${fromDate}.`
}

/** What a switch did, for the toast. */
export function switchedPhilosophySentence(
	to: PresetFamily,
	fromDate: string,
): string {
	return `Planen følger ${PHILOSOPHY_LABELS[to]} fra ${fromDate}. Ukene du har trent og øktene dine står som før.`
}

/** Why a philosophy switch was refused, as the athlete reads it. */
export const PHILOSOPHY_SWITCH_REFUSAL_LABELS: Record<
	SwitchPhilosophyRefusal,
	string
> = {
	'preview-stale':
		'Planen har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen før du bytter.',
	'same-family': 'Planen følger allerede den filosofien.',
	'event-too-soon':
		'Det er ingen uker igjen før løpet å legge en ny filosofi inn i.',
	'no-phases': 'Planen har ingen blokker å bytte filosofi på.',
	'outline-not-found': 'Fant ikke planen.',
}

/**
 * A week's role in its phase's rhythm in the #505 surfaces' words: a hard week
 * or an easy one (#505 story 19), and the taper before a race.
 */
export const NB_WEEK_ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'hard uke',
	recovery: 'lett uke',
	taper: 'nedtrapping',
}

/** The Sesong edits on the plan page (#505 stories 72–77). */
export const SEASON_EDIT_LABELS = {
	title: 'Endre sesongen',
	intro:
		'Du ser hver endring før den gjelder. Ukene du har trent og øktene du har skrevet selv blir stående.',
	weekTargetOpen: 'Endre ukemålet',
	phaseOpen: 'Endre navn eller lengde på en fase',
	easyWeekOpen: 'Velg hvilken uke som er lett',
	week: 'Uke',
	track: 'Spor',
	newTarget: 'Nytt ukemål',
	phase: 'Fase',
	phaseName: 'Nytt navn',
	phaseWeeks: 'Antall uker',
	phaseHint: 'La et felt stå tomt for å beholde det som er.',
	easyWeek: 'Lett uke',
	easyWeekHint:
		'Den lette uka flyttes i blokka uka ligger i. De andre blokkene følger rytmen.',
	showPreview: 'Vis forhåndsvisning',
	preview: 'Forhåndsvisning',
	before: 'Nå',
	after: 'Etter endringen',
	weeks: 'Ukene som endres',
	weekColumn: 'Uke',
	apply: 'Bruk endringen',
	done: 'Sesongen er endret',
	warningTitle: 'Raskt opp',
	warningNote:
		'Mer enn 10 % fra én hard uke til den neste er raskt. Det er en tommelfingerregel, ikke en grense, og du kan godkjenne likevel.',
	aroundYours:
		'Tallene er ukemålene. I uker der du har egne økter, legges appens økter rundt dem.',
	ended: 'utenfor planen',
	previewFirst: 'Se forhåndsvisningen før du godkjenner.',
	pickWeek: 'Velg en uke.',
	pickPhase: 'Velg en fase.',
	pickTrack: 'Velg et spor.',
	targetRequired: 'Skriv et ukemål.',
	targetNumber: 'Ukemålet er et tall, 0 eller mer.',
	weeksNumber: 'En fase varer fra 1 til 52 uker.',
	nameTooLong: 'Navnet kan ha opptil 60 tegn.',
	revert: 'Tilbake til planens mål',
	revertHint:
		'Tilbake til planens mål tar bort ukemålet du har satt selv, og uka følger planen igjen.',
	phaseRhythm: 'Rytme',
	phaseTapers: 'Trapper ned',
	keep: 'Som nå',
	yes: 'Ja',
	no: 'Nei',
	editHere: 'Endre i «Endre sesongen»',
	now: 'Nå',
} as const

/**
 * _Avansert_ on Sesong (#505 story 75, ADR 0084 §1): the plan's rules that are
 * outside the four Sesong edits of v1 — a segment's climb and quality mix, a
 * phase's place, a Season Anchor, a lifting block, a shape, the Event fit.
 * They apply directly, and the disclosure says so before it opens.
 */
export const SEASON_ADVANCED_LABELS = {
	title: 'Avansert',
	note: 'Disse endringene gjelder med en gang, uten forhåndsvisning.',
	phaseNote:
		'Stigning, kvalitetsøkter og plassering. Gjelder med en gang, uten forhåndsvisning.',
} as const

/**
 * "Start from a shape" once the plan has begun (#505 stories 14, 75): a shape
 * replaces every phase with no preview, so the page points to the philosophy
 * switch instead, which keeps the weeks lived and previews first.
 */
export const PRESET_GALLERY_LABELS = {
	begun:
		'Planen er i gang, og en ny form ville skrevet over ukene du har trent. Bytt filosofi i stedet: ukene du har trent og øktene dine blir stående, og du ser endringen før den gjelder.',
	switchLink: 'Til Bytt filosofi',
} as const

/** A phase's rhythm in the #505 surfaces' words (#505 story 73). */
export const NB_RHYTHM_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1',
	'2:1': '2:1',
	none: 'uten lett uke',
}

/** A rhythm as a choice in the phase edit: what it means, not just its ratio. */
export const NB_RHYTHM_CHOICE_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1 — tre harde uker, så en lett',
	'2:1': '2:1 — to harde uker, så en lett',
	none: 'Ingen lett uke',
}

/** Why a Sesong edit was refused, as the athlete reads it. */
export const SEASON_EDIT_REFUSAL_LABELS: Record<
	ApplySeasonEditRefusal,
	string
> = {
	'track-not-found': 'Det sporet er ikke lenger en del av planen.',
	'phase-not-found': 'Den fasen er ikke lenger en del av planen.',
	'week-outside-plan': 'Den uka er ikke i planen.',
	'week-lived':
		'Den uka har begynt eller er over. Ukene du har trent står som de ble.',
	'changes-lived-weeks':
		'Det ville endre en uke du allerede har trent. Ukene du har trent står som de ble.',
	'no-easy-week':
		'Den fasen har ingen lett uke å flytte: rytmen har ingen, eller fasen trapper ned.',
	'plan-too-long':
		'Da blir planen lengre enn to år. Gjør en fase kortere først.',
	'no-change': 'Det er det planen allerede sier. Ingenting å endre.',
	'not-hand-set': 'Den uka følger allerede planens mål.',
	'outline-not-found': 'Fant ikke planen.',
	'preview-stale':
		'Planen har endret seg siden forhåndsvisningen. Se over den nye forhåndsvisningen før du godkjenner.',
}

/**
 * The numbers an edit left where they were, as the message names them
 * (#505 story 77): `Fasen og de andre ukene står som før.`
 */
export const HELD_NUMBER_LABELS: Record<HeldNumber, string> = {
	phase: 'fasen',
	'phase-name': 'navnet',
	'phase-length': 'lengden på fasen',
	'other-weeks': 'de andre ukene',
	'week-targets': 'ukemålene',
	'plan-start': 'starten på planen',
	'other-phases': 'de andre fasene',
}

/** `Fasen og de andre ukene står som før.` — empty when nothing is named. */
export function heldSentence(held: readonly HeldNumber[]): string {
	const words = held.map((number) => HELD_NUMBER_LABELS[number])
	if (words.length === 0) return ''
	const list =
		words.length === 1
			? words[0]!
			: `${words.slice(0, -1).join(', ')} og ${words.at(-1)}`
	return `${list.charAt(0).toUpperCase()}${list.slice(1)} står som før.`
}

/** A Sesong edit's headline, with its figures already written out. */
export type SeasonEditWords =
	| {
			kind: 'week-target'
			weekNumber: number
			before: string | null
			after: string | null
			unit: string
			revert: boolean
	  }
	| {
			kind: 'phase'
			name: { before: string; after: string }
			weeks: { before: number; after: number }
			rhythm: { before: Rhythm; after: Rhythm }
			tapers: { before: boolean; after: boolean }
	  }
	| {
			kind: 'easy-week'
			phaseName: string
			weekNumber: number
			previousWeekNumber: number | null
	  }

/**
 * What an edit does, then what it left alone (#505 story 77):
 * `Uke 42: mål 40 → 46 km. Fasen og de andre ukene står som før.`
 */
export function seasonEditSentence(
	words: SeasonEditWords,
	held: readonly HeldNumber[],
): string {
	return [seasonEditHeadline(words), heldSentence(held)]
		.filter(Boolean)
		.join(' ')
}

function seasonEditHeadline(words: SeasonEditWords): string {
	switch (words.kind) {
		case 'week-target': {
			const week = `Uke ${words.weekNumber}`
			if (words.revert) {
				return words.after == null || words.before == null
					? `${week}: tilbake til planens mål.`
					: `${week}: tilbake til planens mål, ${words.before} → ${words.after} ${words.unit}.`
			}
			return words.before == null
				? `${week}: mål ${words.after} ${words.unit}.`
				: `${week}: mål ${words.before} → ${words.after} ${words.unit}.`
		}
		case 'phase': {
			const { name, weeks, rhythm, tapers } = words
			const clauses = [
				...(name.before !== name.after ? [`heter nå «${name.after}»`] : []),
				...(weeks.before !== weeks.after
					? [`varer ${nbWeeks(weeks.after)} (var ${weeks.before})`]
					: []),
				...(rhythm.before !== rhythm.after
					? [
							`går nå ${NB_RHYTHM_LABELS[rhythm.after]} (var ${NB_RHYTHM_LABELS[rhythm.before]})`,
						]
					: []),
				...(tapers.before !== tapers.after
					? [tapers.after ? 'trapper nå ned' : 'trapper ikke lenger ned']
					: []),
			]
			// A length alone reads as the figure it is: `Base: 4 → 6 uker.`
			if (clauses.length === 1 && weeks.before !== weeks.after) {
				return `${name.before}: ${weeks.before} → ${nbWeeks(weeks.after)}.`
			}
			const list =
				clauses.length === 1
					? clauses[0]!
					: `${clauses.slice(0, -1).join(', ')} og ${clauses.at(-1)}`
			return `«${name.before}» ${list}.`
		}
		case 'easy-week':
			return words.previousWeekNumber == null
				? `${words.phaseName}: uke ${words.weekNumber} blir den lette uka.`
				: `${words.phaseName}: den lette uka flyttes fra uke ${words.previousWeekNumber} til uke ${words.weekNumber}.`
	}
}

/**
 * A week target rising more than 10 % over the hard week before it (#505
 * story 76): `Uke 43: 42 → 50 km, +19 % over forrige harde uke.`
 */
export function weekRiseSentence(
	weekNumber: number,
	from: string,
	to: string,
	unit: string,
	rise: number,
): string {
	return `Uke ${weekNumber}: ${from} → ${to} ${unit}, +${Math.round(rise * 100)} % over forrige harde uke.`
}

/** A strength track proposed from the athlete's own lifting (#505 story 15). */
export const STRENGTH_OFFER_LABELS = {
	accept: 'Legg til styrkespor',
	done: 'Styrkesporet er lagt til',
	doneDetail:
		'Det står blant sporene i planen, der du kan endre det eller legge inn styrkeblokker.',
	noHistory:
		'Vi fant ingen styrketrening de siste fire ukene å foreslå et spor fra.',
} as const

/** `Vi ser at du styrketrener ~2 ganger i uka. Legg til et styrkespor?` */
export function strengthOfferSentence(sessionsPerWeek: number): string {
	const times = sessionsPerWeek === 1 ? '1 gang' : `${sessionsPerWeek} ganger`
	return `Vi ser at du styrketrener ~${times} i uka. Legg til et styrkespor?`
}

/** What the offered track is anchored on: `ca. 24 sett i uka de siste 4 ukene`. */
export function strengthOfferDetail(
	setsPerWeek: number,
	windowWeeks: number,
): string {
	return `Sporet starter på ca. ${setsPerWeek} sett i uka, snittet av de siste ${windowWeeks} ukene. Du kan endre det etterpå.`
}

/** A week's role in its phase's rhythm (ADR 0044 §4), as the athlete reads it. */
export const WEEK_ROLE_LABELS: Record<WeekRole, string> = {
	loading: 'Loading',
	recovery: 'Recovery',
	taper: 'Taper',
}

/**
 * The adaptation a strength segment is authored for (ADR 0047 §3), for the picker
 * that authors one.
 *
 * Each **names** the goal and no more — the `%1RM` band and rep range it derives are
 * a separate reading (`plan-outline/strength-goal.ts`), rendered by `format.ts`, and
 * a trigger that spelled the band out would both clip at the 390 px reference
 * viewport (UI conventions §2.5) and read as though the band were authored beside
 * the goal, which is precisely what ADR 0047 forbids.
 *
 * `maximal-strength` reads **Maximal strength**, the field's own term, so the middle
 * value never renders as "strength emphasis: strength" (GLOSSARY.md's _Avoid_ note).
 */
export const STRENGTH_GOAL_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'Hypertrophy',
	'maximal-strength': 'Maximal strength',
	power: 'Power',
}

/**
 * The same three goals in their **mid-sentence** register: "outside the 80–100%
 * 1RM that maximal strength works in".
 *
 * A second map for {@link QUALITY_ZONE_LABELS}' reason, and never
 * `STRENGTH_GOAL_LABELS[goal].toLowerCase()` at a call site: lower-casing a label
 * is a *rule about English* applied to a display string, so it silently breaks on
 * any label that carries a proper noun or an initialism, and it puts a second
 * spelling of an athlete-facing word outside this module — the one thing this
 * module exists to prevent. When translation arrives, the two registers are two
 * strings a translator answers, not one string plus a call to `toLowerCase`.
 */
export const STRENGTH_GOAL_SENTENCE_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'hypertrophy',
	'maximal-strength': 'maximal strength',
	power: 'power',
}

/**
 * One sentence per **Unavailable Metric** a plan carrying a strength track has to
 * state (ADR 0047 §5), each naming what is missing rather than only that something
 * is.
 *
 * **A sentence each, with its own reason** — never one line over three dashes. The
 * three are Unavailable for three different reasons, and a single "not available"
 * would tell the athlete that something is missing while hiding which of their own
 * data would change it (Unavailable Metric: the reason is the point). The reasons
 * are lifted from `UNAVAILABLE_READINGS`' own doc comment rather than paraphrased,
 * so the surface and the model say the same thing.
 *
 * Typed to the union, so a fourth reading added to `UNAVAILABLE_READINGS` is a
 * compile error here rather than a token that renders as nothing.
 */
export const UNAVAILABLE_READING_LABELS: Record<UnavailableReading, string> = {
	'hours-calendar-cost':
		'What your week costs in hours reads Unavailable — a lifting block says how many sessions a week it asks for, but nothing here stores how long one takes, and your own recorded lifting sessions are too sparse and too watch-dependent to read a median from.',
	'combined-cross-track-load':
		'One training load across both your tracks reads Unavailable — lifting carries no TSS at all, so a combined figure would be a partial sum reading as your whole week.',
	'strength-ctl':
		'Your Fitness, Fatigue and Form read your endurance training only, and your lifting is Unavailable to them by decision — pricing a lifting session as hours × an assumed intensity is a conversion this app will not make, so how the two kinds of fatigue interact is left unmodelled rather than approximated.',
}

/**
 * Why a **Training Track** contributes nothing to a load reading, as a phrase
 * that finishes "… because …".
 *
 * A **mid-sentence register**, like {@link STRENGTH_GOAL_SENTENCE_LABELS}: the
 * reason rides inside a sentence the surface builds around it ("Race-day
 * projection unavailable — no threshold pace is stored for your running"), so a
 * capitalized standalone line would read wrong wherever it lands.
 *
 * Each phrase names **the athlete's own missing datum** wherever there is one, and
 * says what is missing rather than only that something is (Unavailable Metric,
 * ADR 0008): "no threshold pace is stored" tells a runner what to go and enter,
 * where "unavailable" tells them nothing. The two that name no datum are the two
 * where nothing the athlete could enter would change the answer — lifting carries
 * no training load by decision (ADR 0041, ADR 0047 §5).
 *
 * Typed to the union, so a ninth reason is a compile error here rather than a
 * token that renders as nothing.
 */
export const NO_CONTRIBUTION_LABELS: Record<NoContributionReason, string> = {
	'sets-has-no-reading':
		'working sets carry no training load, and never convert into one',
	'not-an-endurance-discipline':
		'lifting carries no training load, and never converts into one',
	'no-zone-recipe': 'no zone system is set for that discipline',
	'no-intensity-source': 'that zone system prices no intensity to read',
	'no-heart-rate-anchor':
		'those zones are read off max HR, and no max HR or threshold HR is stored',
	'no-threshold-pace': 'no threshold pace is stored for that discipline',
	'no-critical-swim-speed': 'no critical swim speed is stored',
	'no-ride-history': 'no recorded rides to read a speed from',
	'no-season-anchor': 'no Season Anchor is in force on that track',
}

/**
 * The documented conventions the **Volume Conversion** stacks, named as
 * conventions and never as measurements (ADR 0040 §13) — a figure read from
 * somewhere, not a body measured.
 *
 * A noun phrase apiece, for a list: "priced through minutes in zone per quality
 * session and the easy-pace ratio".
 */
export const CONVERSION_CONVENTION_LABELS: Record<ConventionId, string> = {
	'minutes-in-zone-per-session': 'minutes in zone per quality session',
	'easy-pace-ratio': 'the easy-pace ratio',
}

/**
 * Why an accumulated **Season Span** may be added up at all — one sentence per
 * **Volume Currency** whose numbers mean the same thing in every Discipline
 * (ADR 0043 §6).
 *
 * Every accumulated figure is marked **derived** and carries one of these, because
 * a derived marker is a promise that a derivation exists and can be shown. There is
 * deliberately no sentence for `km` or `sets`: those never accumulate, so a caller
 * that wanted one would be about to word a claim the domain refuses.
 *
 * The TSS sentence says what the scale *is* rather than what the two disciplines
 * cost, because the equivalence is commensurability by construction and not a
 * measured fact (ADR 0043 §6's honesty caveat). The hours sentence names calendar
 * cost and rules out dose in the same breath, for the same reason.
 */
export const ACCUMULATED_SPAN_LABELS: Record<AccumulatingCurrency, string> = {
	tss: 'Added up across your endurance tracks, because a TSS is the same hour of threshold work whichever of them you spend it in.',
	hours:
		'Added up across your endurance tracks as what the week costs you in time — never as how hard it is.',
}

/**
 * The **Discipline Profile** thresholds the **Volume Conversion** reads, named as
 * the athlete's own stored data rather than by their column names.
 *
 * A mid-sentence register, like {@link NO_CONTRIBUTION_LABELS}: it rides inside
 * the derivation's "from …" clause. Saying **whose** number it is matters — a
 * derivation row that read "thresholdPaceSecPerKm" would be checkable only by
 * someone who reads the schema, and ADR 0045 §10's whole argument for showing the
 * chain is that the athlete can say "no, I run that slower".
 */
export const THRESHOLD_FIELD_LABELS: Record<ThresholdField, string> = {
	thresholdPaceSecPerKm: 'your stored threshold pace',
	cssSecPer100m: 'your stored critical swim speed',
}

/** A phase's loading rhythm — which of its weeks recover (ADR 0044 §4). */
export const RHYTHM_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1 — every 4th week recovers',
	'2:1': '2:1 — every 3rd week recovers',
	none: 'No recovery weeks',
}

/**
 * The same rhythm in a **summary** register: what fits on a phase's one-line
 * summary beside its span and its start date.
 *
 * Two registers rather than one wording flattened, the way `bike` carries a sport
 * and an activity register (`docs/design/ui-conventions.md` §4.1). The full label
 * above teaches the rhythm where the athlete is *choosing* it and has to know what
 * "3:1" does; this one names it where they are only *identifying* a block they
 * already authored, and the explanation would be four words of noise on every card.
 * `none` still says something rather than nothing — an empty tail would read as a
 * phase whose rhythm is missing rather than one that has no recovery week.
 */
export const RHYTHM_SUMMARY_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1',
	'2:1': '2:1',
	none: 'No recovery',
}

// ---------------------------------------------------------------------------
// Why a Block Boundary Step is not one the walk applies (ADR 0040 §5)
// ---------------------------------------------------------------------------

/**
 * The three ways a **Block Boundary Step** can be out of force, as the two surfaces
 * that author one read them: the season's own opening block, a block no **Season
 * Anchor** reaches yet, and a block an anchor restarts on.
 *
 * Declared here rather than imported from a schema, unlike every other union above,
 * because no stored column carries it — these are three states of the athlete's own
 * plan, worked out from the anchors by `boundaryStepInForce` and its strength twin.
 * Those two stay **booleans** in `derive.ts`, where the arithmetic wants a boolean;
 * *which* of the three a `false` means is a reading, and readings are worded here.
 *
 * `season-opens` is the endurance side's alone: phases are contiguous, so the first
 * one holds the anchor, while a lifting block is dated and can open the season with
 * an anchor sitting behind it (ADR 0047 §6). It is still worded beside the other two
 * rather than alone in the file that happens to use it, so the set reads at once.
 */
export type BoundaryStepOutOfForce =
	| 'season-opens'
	| 'no-anchor-yet'
	| 'anchor-opens-here'

/**
 * One sentence per reason, each naming the state of the plan that produced it.
 *
 * **A sentence each, never one line for all three.** They are three different
 * situations with three different edits that would change them, and a single "no
 * step here" would tell the athlete that a field is missing while hiding which of
 * their own authoring would bring it back (Unavailable Metric: the reason is the
 * point). `no-anchor-yet` says the opening reads Unavailable, because that is what
 * the week grid beside it prices those weeks at.
 *
 * Shared by the phase editor and the lifting-block editor, which is why they live
 * here at all: one situation said two ways is two situations to the person reading,
 * and the two surfaces had drifted into wording the *same* state with one sentence
 * and no state at all with the other.
 */
export const BOUNDARY_STEP_OUT_OF_FORCE_LABELS: Record<
	BoundaryStepOutOfForce,
	string
> = {
	'season-opens': 'Your season opens here, so there is no boundary to step at.',
	'no-anchor-yet':
		'No Season Anchor covers this block yet, so its opening reads Unavailable — there is no level for a step to move.',
	'anchor-opens-here':
		'Your anchor takes effect on the week this block opens, so that number is what it opens at — there is nothing for a step to step from.',
}

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

// ---------------------------------------------------------------------------
// Integration providers
// ---------------------------------------------------------------------------

/**
 * Display names for activity/import providers and OAuth connections. Keyed by
 * the provider slug used across the integration folders (ADR 0014) and the
 * import `externalProvider` enum. `providerLabel` falls back to a capitalized
 * slug so a new provider is never shown raw before it is added here.
 */
export const PROVIDER_LABELS: Record<string, string> = {
	manual: 'Manual',
	strava: 'Strava',
	intervalsicu: 'Intervals.icu',
	garmin: 'Garmin',
	github: 'GitHub',
}

export function providerLabel(provider: string): string {
	return PROVIDER_LABELS[provider] ?? capitalize(provider)
}

/**
 * Where a Recording came from, by its **Origin Platform** (ADR 0096) — never
 * the transport it came down. `unknown` has no words: a Recording that cannot
 * say where it came from says nothing rather than guess.
 */
export const ORIGIN_PLATFORM_LABELS: Record<
	Exclude<OriginPlatform, 'unknown'>,
	string
> = {
	garmin: 'Garmin',
	polar: 'Polar',
	suunto: 'Suunto',
	coros: 'COROS',
	wahoo: 'Wahoo',
	strava: 'Strava',
	zwift: 'Zwift',
	'apple-health': 'Apple Health',
	'health-connect': 'Health Connect',
	intervalsicu: 'intervals.icu',
	upload: 'Opplastet fil',
}

/**
 * The credits a platform's terms require (ADR 0098 §3, `source-terms.ts`).
 *
 * Garmin's derived-data line is Garmin's own wording, from its API Brand
 * Guidelines' list of acceptable attributions, and stays in English on
 * purpose: a Norwegian paraphrase is not on that list. Changing it waits on
 * Garmin saying a translation is acceptable (#542's outreach).
 */
export const SOURCE_ATTRIBUTION_LABELS = {
	derived: {
		garmin: 'Insights derived in part from Garmin device-sourced data.',
		polar: 'Bygger delvis på data fra Polar.',
	} satisfies Record<Attribution, string>,
} as const

// ---------------------------------------------------------------------------
// The three tabs
// ---------------------------------------------------------------------------

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

/**
 * The Autopilot Notice on I dag (#576, ADR 0100 §5): what the autopilot wrote
 * at the close, one line each with its stored reason and _Angre_, and _Angre
 * alt_. It states; it never asks. The lines the reason does not word itself —
 * a session left alone, a step held by the guards — are worded here.
 */
export const AUTOPILOT_NOTICE_LABELS = {
	heading: 'Neste uke er lagt ut',
	region: 'Autopiloten',
	/** What one line is about, when its reason does not say: `«Rolig tur» · onsdag`. */
	subject: (title: string, weekday: string) => `«${title}» · ${weekday}`,
	/** ADR 0100 §3: the athlete's own session stands, and the notice says so. */
	leftAlone: (weekday: string, title: string) =>
		`${capitalize(weekday)}ens «${title}» er din, den står.`,
	leftAloneUnnamed: 'Økta er din, så den står.',
	notPlacedExtra:
		'En ekstra økt ble ikke lagt inn: autopiloten legger ikke inn mer trening på en dag du ikke har valgt.',
	overGuard: (percent: string) =>
		`Endringen ville gitt mer enn ${percent} mer trening på én gang, så den er ikke gjort.`,
	gone: (title: string) =>
		`«${title}» var allerede gjort, flyttet eller slettet, så den ble ikke endret.`,
	goneUnnamed: 'Det var ingenting igjen å endre.',
	undo: 'Angre',
	undoFor: (what: string) => `Angre: ${what}`,
	undoing: 'Angrer …',
	undone: 'Angret',
	undoAll: 'Angre alt',
	undoAllFor: (count: number) => `Angre alle ${count} endringene`,
	/** The toast after an _Angre_. */
	undoneToast: 'Endringen er angret. Økta er som før.',
	undoneAllToast: (count: number) =>
		count === 1
			? 'Endringen er angret.'
			: `${count} endringer er angret. Uka er som før.`,
	nothingToUndo: 'Det var ingenting å angre.',
	/** ADR 0100 §4: the window has closed, said once under the lines. */
	closed: 'Uka har begynt, så endringene kan ikke angres lenger.',
	easeHeading: 'Vil du ha en lettere uke?',
	/** #580: from the Monday of the week it laid, that is this week, not the next. */
	headingThisWeek: 'Denne uka er lagt ut',
	/** #580: a past notice at its week in _Se hele sesongen_. */
	historyHeading: 'Lagt ut av autopiloten',
	/**
	 * #580, spec #558 story 88: a week the close could not lay, said with the
	 * reason, so an empty week never passes in silence. `week` is its Monday,
	 * `mandag 28. januar`.
	 */
	unlaid: (reason: UnlaidReason, week: string) =>
		`Uka fra ${week} ble ikke lagt ut${UNLAID_REASON_TAILS[reason]}`,
	/**
	 * #583: once, on the first notice of an athlete the switch to autopilot was
	 * news to — what changed, and where the old way is.
	 */
	intro:
		'Nytt: appen legger nå ut ukene dine selv, ut fra det du faktisk trente. Vil du heller si ja til endringene først, velg «Spør meg først» i Meg.',
	introLink: 'Gå til Ukeplanen i Meg',
} as const

/** Why a week was not laid, as the end of the notice's sentence (#580). */
const UNLAID_REASON_TAILS: Record<UnlaidReason, string> = {
	'no-pattern': ': planen har ikke noe ukemønster å legge den etter.',
	'past-plan-end': ': den ligger etter slutten av planen.',
	'nothing-to-lay': ': planen hadde ingen økter å legge den uka.',
	error: ' fordi noe gikk galt. Appen prøver igjen snart.',
}

/** Why an _Angre_ on the Autopilot Notice was refused (ADR 0100 §4, ADR 0088). */
export const AUTOPILOT_UNDO_REFUSAL_LABELS: Record<UndoRefusal, string> = {
	'not-found': 'Fant ikke endringen.',
	'not-applied': 'Endringen ble aldri gjort, så det er ingenting å angre.',
	'no-before-image': 'Denne endringen kan ikke angres.',
	'week-begun': 'Uka har begynt, så endringen kan ikke angres lenger.',
	'session-trained':
		'En økt endringen gjaldt er allerede trent, så den kan ikke angres.',
	'session-taken-over':
		'Du har endret økta selv etterpå, så den står som du la den.',
}

/**
 * The Autopilot setting in Meg (#576, ADR 0100 §1 and §6): on, the app lays
 * out each week by itself; _Spør meg først_ brings back the Week Change Card.
 */
export const AUTOPILOT_SETTING_LABELS = {
	title: 'Ukeplanen',
	legend: 'Hvordan neste uke legges ut',
	autopilot: 'Autopilot',
	autopilotDetail:
		'Appen legger ut neste uke hver søndag kveld ut fra det du faktisk gjorde. Den sier hva den endret, og du kan angre. Øktene du har lagt selv, endres aldri.',
	ask: 'Spør meg først',
	askDetail:
		'Appen foreslår endringene søndag kveld og venter på ditt ja i Ukeskiftet.',
	fromNextClose: 'Gjelder fra neste ukeskifte, søndag kveld.',
	saving: 'Lagrer …',
	saved: 'Lagret.',
	failed: 'Det ble ikke lagret. Prøv igjen.',
} as const

/**
 * **Juster** on the today card (spec #558 S5, ADR 0100 §7): the three chips
 * right above _Gjort_, what each says it did, the Replan Note it leaves on the
 * session, and why one could not act or be taken back.
 */
export const JUSTER_LABELS = {
	/** The chips' group, for a screen reader. */
	group: 'Juster dagens økt',
	chip: {
		tired: 'For sliten i dag',
		short: 'Lite tid',
		move: 'Bytt dag',
	} satisfies Record<JusterIntent, string>,
	/** A chip's name with the session it changes. */
	chipFor: (chip: string, title: string) => `${chip}: «${title}»`,
	/** On the chip while its change goes out. */
	working: 'Endrer …',
	/** The toast: what changed. The session's title is quoted under it. */
	done: {
		tired: (duration: string) => `Dagens økt er rolig nå, ${duration}.`,
		short: (duration: string) => `Dagens økt er kortet ned til ${duration}.`,
		moved: (day: string) => `Økta er flyttet til ${day}.`,
		swapped: (day: string, other: string) =>
			`Økta er flyttet til ${day}, og «${other}» er i dag.`,
		swappedSession: (title: string) => `Dagens økt er byttet til «${title}».`,
		/**
		 * _Bytt dag_ when every free day clashed (spec #588 story 30): the
		 * first free day, and in the same line why it lands there.
		 */
		movedAnyway: (day: string, why: string) =>
			`Økta er flyttet til ${day}, ${why}. Ingen ledig dag passet bedre.`,
	},
	/**
	 * Why a moved session's day clashes (ADR 0104 §1), said from the moved
	 * session: `lifting` when it is a lift, `after` when it is the second day
	 * of a two-day clash (the day after a lift, or after another hard day).
	 */
	clash: {
		'lifting-on-hard-day': ({ lifting }) =>
			lifting ? 'samme dag som en hard økt' : 'samme dag som styrke',
		'lifting-before-hard-day': ({ after }) =>
			after ? 'dagen etter styrke' : 'dagen før en hard økt',
		'lifting-on-long-day': ({ lifting }) =>
			lifting ? 'samme dag som langturen' : 'samme dag som styrke',
		'hard-days-in-a-row': ({ after }) =>
			after ? 'dagen etter en annen hard økt' : 'dagen før en annen hard økt',
		'two-hard-sessions': () => 'samme dag som en annen hard økt',
		'two-long-sessions': () => 'samme dag som en annen langtur',
		'easy-before-hard-day': () => 'dagen før en hard økt',
	} satisfies Record<
		ClashReason,
		(as: { lifting: boolean; after: boolean }) => string
	>,
	/** The Replan Note each change leaves on the session it changed. */
	note: {
		tired: 'For sliten i dag: gjort rolig og kortere.',
		short: 'Lite tid: kortet ned.',
		moved: (day: string) => `Flyttet fra ${day} med Bytt dag.`,
	},
	/** _Angre_ took the change back. */
	undone: (title: string | null) =>
		title ? `Angret. «${title}» står som før.` : 'Angret. Økta står som før.',
	/** Why a chip could not act, said where the chips are. */
	refused: {
		'session-not-found': 'Fant ikke økta. Den kan være slettet.',
		'not-today': 'Juster endrer bare dagens økt.',
		'not-open': 'Økta er allerede gjort eller merket som ikke gjort.',
		'no-workout': 'Økta har ingen plan å endre.',
		'no-time': 'Økta har ingen tid å korte ned fra.',
		'already-short': 'Økta er allerede kort, 20 minutter eller mindre.',
		'already-easy': 'Økta er allerede rolig og så kort den kan bli.',
		'no-later-day': 'Det er ingen dager igjen denne uka å flytte til.',
		'pick-not-found': 'Fant ikke økta i Bibliotek. Velg en annen.',
	} satisfies Record<JusterRefusal, string>,
	/** Why an _Angre_ was turned down. */
	undoRefused: {
		'not-found': 'Fant ikke endringen. Økta kan være slettet.',
		'session-trained': 'Det kan ikke angres lenger: økta er trent.',
		changed: 'Det kan ikke angres lenger: økta er endret igjen siden.',
	} satisfies Record<JusterUndoRefusal, string>,
} as const

/**
 * _Bytt økt_ and _Avansert_, the today card's last two chips (spec #558 S5,
 * #579): Bibliotek as a picker for today's session, and the way to the power
 * tools — the session itself, the composer and Plan's Avansert.
 */
export const BYTT_OKT_LABELS = {
	chip: 'Bytt økt',
	/** The picker sheet. */
	title: 'Bytt økt',
	description: (title: string) =>
		`Velg en økt fra Bibliotek i stedet for «${title}».`,
	/** Bibliotek's three parts, as the picker's tabs. */
	sources: {
		catalogue: 'Katalog',
		program: 'Program',
		exercise: 'Øvelser',
	} satisfies Record<SwapSource, string>,
	sourcesLabel: 'Hvor i Bibliotek',
	search: {
		catalogue: 'Søk i katalogen',
		program: 'Søk i programmene',
		exercise: 'Søk etter øvelse',
	} satisfies Record<SwapSource, string>,
	/** Over the exercise list: what one exercise becomes. */
	exerciseHint:
		'Én øvelse blir dagens økt: settene du la inn sist, ellers 3 × 8.',
	recentLifts: 'Dine løft',
	loading: 'Henter …',
	none: (query: string) => `Fant ingenting med «${query}».`,
	empty: {
		catalogue: 'Katalogen er tom.',
		program: 'Ingen program ennå.',
		exercise: 'Søk etter en øvelse for å ta den i dag.',
	} satisfies Record<SwapSource, string>,
	/** Under a capped list. */
	more: (shown: number, total: number) =>
		`Viser ${shown} av ${total}. Søk for å finne flere.`,
	/** A pick's name for a screen reader. */
	pickFor: (title: string) => `Ta «${title}» i dag`,
	picking: 'Bytter …',
	close: 'Lukk',
	/** The fourth chip, and its menu. */
	advanced: 'Avansert',
	advancedFor: (title: string) => `Avansert for «${title}»`,
	advancedMenu: {
		session: 'Rediger økta',
		composer: 'Ny økt i dag',
		plan: 'Planens verktøy',
	},
} as const

/** The page header's back button, named for the screen it goes back to. */
export const PAGE_HEADER_LABELS = {
	back: (screen: string) => `Tilbake til ${screen}`,
} as const

/** The tab bar's own name, for the landmark it is. */
export const APP_TABS_NAV_LABEL = 'Hovedmeny'

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

// ---------------------------------------------------------------------------
// Sesong: the plan page (`/training/plan`) in Norwegian (ADR 0081, round 2,
// ADR 0090). The hero, the season picture, the readings, the chart under
// Avansert, every editor on the page and every refusal its action words. The
// English maps above stay for the surfaces that still read them (plan
// creation, the catalogue); this page reads only what is below and the #505
// words already above (PHILOSOPHY_*, SEASON_EDIT_*, SEASON_EVENTS_*).
// ---------------------------------------------------------------------------

/** A weekly figure's unit on Sesong: `55 km/uke`, `5,8 t/uke`, `18 sett/uke`. */
export const NB_WEEKLY_UNITS: Record<VolumeCurrency, string> = {
	km: 'km/uke',
	hours: 't/uke',
	tss: 'TSS/uke',
	sets: 'sett/uke',
}

/** The unit a track is planned in, spelled out for a picker. */
export const NB_VOLUME_CURRENCY_LABELS: Record<VolumeCurrency, string> = {
	km: 'Kilometer i uka',
	hours: 'Timer i uka',
	tss: 'TSS i uka',
	sets: 'Arbeidssett i uka',
}

/** A quality session's zone, mid-sentence: `2× terskel + 1× VO₂maks`. */
export const NB_QUALITY_ZONE_LABELS: Record<QualityZone, string> = {
	3: 'tempo',
	4: 'terskel',
	5: 'VO₂maks',
}

/** What a lifting block is for (ADR 0047 §3). */
export const NB_STRENGTH_GOAL_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'Muskelvekst',
	'maximal-strength': 'Maksimal styrke',
	power: 'Eksplosivitet',
}

/** The same goals mid-sentence: `… som maksimal styrke trener i`. */
export const NB_STRENGTH_GOAL_SENTENCE_LABELS: Record<StrengthGoal, string> = {
	hypertrophy: 'muskelvekst',
	'maximal-strength': 'maksimal styrke',
	power: 'eksplosivitet',
}

/** A Week Pattern day's kind (ADR 0044 §7). */
export const NB_PATTERN_DAY_KIND_LABELS: Record<PatternDayKind, string> = {
	fixed: 'Fast økt',
	share: 'Andel av uka',
}

/** A Week Pattern weekday, Monday-first, capitalised as a row starts it. */
export const NB_PATTERN_WEEKDAY_LABELS = Object.fromEntries(
	NB_WEEKDAY_LABELS.map((name, weekday) => [
		weekday,
		name[0]!.toUpperCase() + name.slice(1),
	]),
) as Record<PatternWeekday, string>

/**
 * A Training Track's name on Sesong: the sport, in Norwegian, or _Enkle
 * aktiviteter_ for the track on `other` (#572).
 */
export function nbTrackName(discipline: string): string {
	return discipline === 'other'
		? START_SIMPLE_ACTIVITY_LABELS.track
		: nbDisciplineLabel(discipline)
}

/**
 * What a strength plan cannot state (ADR 0047 §5), one sentence each with its
 * reason, as `UNAVAILABLE_READING_LABELS` says it in English.
 */
export const NB_UNAVAILABLE_READING_LABELS: Record<UnavailableReading, string> =
	{
		'hours-calendar-cost':
			'Hva uka koster i timer kan ikke regnes ut. En styrkeblokk sier hvor mange økter den ber om i uka, men ingenting her lagrer hvor lang en økt er, og styrkeøktene du har registrert er for få og for avhengige av klokka til å lese et snitt fra.',
		'combined-cross-track-load':
			'Én samlet belastning for begge sporene kan ikke regnes ut. Styrketrening har ingen TSS, så et samlet tall ville vært en delsum som ser ut som hele uka.',
		'strength-ctl':
			'Formkurven leser bare utholdenhetstreningen din. Styrken er holdt utenfor med vilje: å prise en styrkeøkt som timer × en antatt intensitet er en omregning appen ikke gjør, så hvordan de to slags trøtthet virker sammen er ikke modellert.',
	}

/** Why a track feeds no load, finishing "… fordi …" (ADR 0045 §6). */
export const NB_NO_CONTRIBUTION_LABELS: Record<NoContributionReason, string> = {
	'sets-has-no-reading':
		'arbeidssett har ingen belastning, og regnes aldri om til en',
	'not-an-endurance-discipline':
		'styrketrening har ingen belastning, og regnes aldri om til en',
	'no-zone-recipe': 'ingen sonemodell er satt for den sporten',
	'no-intensity-source': 'sonemodellen gir ingen intensitet å lese',
	'no-heart-rate-anchor':
		'sonene leses av makspuls, og verken makspuls eller terskelpuls er lagret',
	'no-threshold-pace': 'ingen terskelfart er lagret for den sporten',
	'no-critical-swim-speed': 'ingen kritisk svømmefart er lagret',
	'no-ride-history': 'ingen registrerte sykkeløkter å lese en fart fra',
	'no-season-anchor': 'sporet har ikke noe startnivå',
}

/** The conventions the Volume Conversion stacks, as conventions (ADR 0040 §13). */
export const NB_CONVERSION_CONVENTION_LABELS: Record<ConventionId, string> = {
	'minutes-in-zone-per-session': 'minutter i sonen per kvalitetsøkt',
	'easy-pace-ratio': 'forholdet mellom rolig fart og terskelfart',
}

/** The stored thresholds the conversion reads, as the athlete's own. */
export const NB_THRESHOLD_FIELD_LABELS: Record<ThresholdField, string> = {
	thresholdPaceSecPerKm: 'terskelfarten du har lagret',
	cssSecPer100m: 'den kritiske svømmefarten du har lagret',
}

/** Why an accumulated Season Span may be added up at all (ADR 0043 §6). */
export const NB_ACCUMULATED_SPAN_LABELS: Record<AccumulatingCurrency, string> =
	{
		tss: 'Lagt sammen på tvers av utholdenhetssporene, fordi en TSS er den samme timen med terskelarbeid uansett hvilket spor den brukes i.',
		hours:
			'Lagt sammen på tvers av utholdenhetssporene som det uka koster i tid – aldri som hvor hard den er.',
	}

/** Why a Block Boundary Step is not one the walk applies (ADR 0040 §5). */
export const NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS: Record<
	BoundaryStepOutOfForce,
	string
> = {
	'season-opens':
		'Sesongen starter her, så det er ingen blokkgrense å hoppe ved.',
	'no-anchor-yet':
		'Ingen startnivå dekker denne blokka ennå, så starten kan ikke regnes ut – det er ikke noe nivå å hoppe fra.',
	'anchor-opens-here':
		'Startnivået ditt gjelder fra uka denne blokka starter, så blokka starter på det tallet – det er ikke noe å hoppe fra.',
}

/** A week's role in its rhythm, capitalised for a table cell. */
export const NB_WEEK_ROLE_CELL_LABELS: Record<WeekRole, string> = {
	loading: 'Hard uke',
	recovery: 'Lett uke',
	taper: 'Nedtrapping',
}

/** `Uke 33–36`, or `Uke 33` — a span of ISO weeks. */
export function isoWeekSpanLabel(from: number, to: number): string {
	return from === to ? `Uke ${from}` : `Uke ${from}–${to}`
}

/** `1 økt`, `3 økter`. */
export function nbSessions(count: number): string {
	return count === 1 ? '1 økt' : `${count} økter`
}

/** `1 dag`, `4 dager`. */
export function nbDays(count: number): string {
	return count === 1 ? '1 dag' : `${count} dager`
}

/** The page itself: its title, hero, picture, readings and summary card. */
export const SESONG_PAGE_LABELS = {
	metaTitle: 'Plan | Trainm8',
	heroToward: 'Du bygger mot',
	heroChange: 'Endre løpet',
	/** `24. okt 2026 · 10 uker fra 10. aug 2026`. */
	heroMeta: (eventDate: string, weeks: number, from: string) =>
		`${eventDate} · ${nbWeeks(weeks)} fra ${from}`,
	/** An open-ended plan's hero: no race, no end, and it carries on. */
	openEndedMeta: (from: string) =>
		`Ingen løp og ingen sluttdato · fra ${from} · fortsetter`,
	resting:
		'Planen hviler mens planen mot løpet ditt er i gang. Den tar over igjen når løpet er over.',
	restingLink: 'Åpne løpsplanen',
	restingElsewhere: 'Hold meg aktiv-planen din hviler mens denne går.',
	restingElsewhereLink: 'Åpne den',
	pictureTitle: 'Sesongen',
	pictureHint: 'Trykk på en uke for å endre ukemålet.',
	pictureBegunHint: 'Uker som har begynt, er historikk.',
	/** Under the last row of an open-ended plan: it does not stop there. */
	continues: 'fortsetter',
	continuesNote: 'Neste blokk legges til når denne er ferdig.',
	pendingRound: 'Neste blokk venter på svar',
	pendingRoundNote: (name: string) =>
		`${name} er foreslått i Ukeskiftet. Svar der, så legges blokka inn.`,
	pendingRoundLink: 'Til Ukeskiftet',
	readings: 'Visning',
	blocks: 'Blokker',
	weeks: 'Uker',
	summaryTitle: 'Hva planen består av',
	derived: 'Utledet',
	/** `Løping · Styrke`. */
	spanTracks: (names: string[]) => names.join(' · '),
	spanNote: (peakWeek: number | null, several: boolean) =>
		`Fra der du starter til den tyngste harde uka${peakWeek == null ? '' : `, uke ${peakWeek}`} · regnet ut fra ${several ? 'startnivåene' : 'startnivået'} og stigningen, aldri lagt sammen fra økter`,
	spanTotal: (total: string) => ` · ${total} over hele sesongen`,
	fitEnds: 'Planen slutter i uka for løpet.',
	fitBefore: (weeks: number) =>
		`Planen slutter ${nbWeeks(weeks)} før uka for løpet.`,
	fitPast: (weeks: number) =>
		`Planen går ${nbWeeks(weeks)} forbi uka for løpet.`,
	cannotTellTitle: 'Hva planen ikke kan si',
	cannotTellDetail: 'Tall som mangler, og hvorfor.',
	fillTitle: 'Fyll ukene',
	fillIntro:
		'Ukene fylles av seg selv fra den typiske uka di, en uke av gangen etter hvert som horisonten når dem. Kopier en uke du likte hvis du vil ha den igjen.',
	fillWaiting:
		'Ukene fylles fra den typiske uka di. Lag den, så legges øktene inn opp til horisonten.',
	fillFilled: (weeks: number, total: number) =>
		`${weeks} av ${nbWeeks(total)} har økter i kalenderen. Resten fylles når horisonten når dem.`,
	patternTitle: 'Den typiske uka di',
	patternEmpty: 'Lag uka du vanligvis trener, så fylles ukene fra den.',
	copyTitle: 'Kopier uke',
	copyDetail: 'Tar med øktene i en uke slik du skrev dem, uten mønster.',
	advancedChart: 'Sesongdiagram',
	advancedChartDetail:
		'Lag for fart, form, rytme og stigning, og regnestykket bak hver uke.',
	shapeTitle: 'Start fra en form',
	shapeDetail:
		'Ferdige former for sesongen, tegnet som belastningen de gir. En form erstatter blokkene dine.',
	anchorsTitle: 'Startnivå',
	liftingTitle: 'Styrkeblokker',
	addPhaseTitle: 'Legg til en fase',
	addPhaseDetail:
		'En ny fase der du vil ha den. Uka planen starter i flytter seg aldri.',
	deleteTitle: 'Slett planen',
	deleteDetailEvent: 'Løpet og øktene du har trent blir stående.',
	deleteDetail: 'Øktene du har trent blir stående.',
	phasesList: 'Faser',
	weeksList: 'Treningsuker',
	weekByWeek: 'Uke for uke',
	weekCount: (count: number) => nbWeeks(count),
	unavailable: 'Utilgjengelig',
	noLifting: 'Ingen styrke',
	deload: 'Avlastning',
	handSet: 'Satt selv',
	handSetNoRule: 'Satt selv. Regelen har ikke noe tall for denne uka.',
	handSetRule: (figure: string) => `Satt selv. Regelen gir ${figure}.`,
	weeksFootnote:
		'Åpne en uke for å endre ukemålet i Endre sesongen, der du ser endringen før den gjelder. Et ukemål du setter selv er ukas endelige tall – uten lett uke eller nedtrapping oppå – og gjelder bare den uka: resten av sesongen følger startnivået og stigningen. 0 er en uke uten trening, og det er en plan, ikke et hull.',
	unpricedTrack: (track: string) =>
		`${track}: ukene kan ikke regnes ut – ingen startnivå dekker planen ennå.`,
	deloadFootnote:
		'Avlastning er slutten på en styrkeblokk. Den kommer fra ukene du ga blokka, og rytmen i fasene når den ikke. Den kan derfor lande en annen uke enn en lett uke i planen – det er det en datert blokk er til for.',
	mixNoticesTitle: 'Uker som avviker fra kvalitetsøktene',
	/** `Uke 42 · løping · planen ber om 2 terskeløkter, uka har 1`. */
	mixDisagreement: (zone: string, authored: number, stamped: number) =>
		`planen ber om ${authored} ${zone}${authored === 1 ? 'økt' : 'økter'}, uka har ${stamped}`,
	mixNoticesNote:
		'Kvalitetsøktene sier hva blokka er til for; øktene er hva uka faktisk inneholder. Å bytte en hard økt mot en rolig i en sliten uke er en plan, ikke en feil – ingenting her er endret.',
} as const

/**
 * What _Plan_ leads with (ADR 0101 §2, #558 S9): the plan's plain name — the
 * Start Options' own words, so the plan reads as the card the athlete picked —
 * its family small, the curve, the next easy week, then a closed _Avansert_
 * holding the rest of the old Sesong page.
 */
export const PLAN_LEAD_LABELS = {
	/**
	 * Each family's plain name. The four the start offers are the cards' own
	 * (`START_OPTION_LABELS.plain`); _Masters 2:1_ is reached only through
	 * _Avansert_, so it gets a plain name in the same voice here.
	 */
	plainName: {
		polarized: START_OPTION_LABELS.plain.polarized.name,
		threshold: START_OPTION_LABELS.plain.threshold.name,
		classic: START_OPTION_LABELS.plain.classic.name,
		'big-base': START_OPTION_LABELS.plain['big-base'].name,
		masters: 'Kortere blokker, mer hvile',
	} satisfies Record<PresetFamily, string>,
	/** A plan whose phases follow no family: authored by hand. */
	ownPlan: 'Din egen plan',
	/** The family, small: the card's own `Fagnavn: …`. */
	familyName: START_OPTION_LABELS.familyName,
	/** `Mot Oslo Maraton`: the race the plan builds toward. */
	toward: 'Mot',
	nextEasyWeek: (week: number, from: string) =>
		`Neste lette uke er uke ${week}, fra ${from}.`,
	thisWeekEasy: 'Denne uka er en lett uke.',
	advanced: 'Avansert',
	advancedDetail:
		'Filosofi, ukemål, faser, treningsspor, den typiske uka og sesongdiagrammet.',
	/** No plan yet: Plan invites to the start, as I dag does (ADR 0101 §4). */
	noPlanTitle: 'Du har ingen plan ennå',
	noPlanBody:
		'Svar på noen få spørsmål, så legger appen opp ukene for deg. Under kan du sette opp sesongen selv.',
	noPlanAction: 'Kom i gang',
} as const

/**
 * _Bytt treningsform_ in Plan's lead (ADR 0101 §2, #581): the **Start
 * Options** again, laid for the plan's tracks and days, and picking one
 * through the philosophy switch's preview. The cards' own words are
 * `START_OPTION_LABELS`'.
 */
export const TRENINGSFORM_LABELS = {
	open: 'Bytt treningsform',
	/** The closed row's line: what is inside. */
	detail: 'Se måtene å trene på igjen, lagt for ukene dine',
	intro: (count: number, hours: string, days: number, from: string) =>
		`${count === 1 ? 'Det er' : 'Hver er'} en ekte uke med ${hours} på ${days} ${days === 1 ? 'dag' : 'dager'}, fra uka som starter ${from}. Du ser hva som endres før noe skjer.`,
	/** The current family's badge, and what stands where its button would. */
	current: 'Nå',
	currentNote: 'Planen følger denne nå.',
	/** The plan follows a family the options do not show (Masters, or merged). */
	currentNotShown: (family: string) =>
		`Planen følger ${family} nå, som ikke er blant måtene her. Alle filosofiene finner du under Avansert.`,
	/** An athlete from before the simple start, who never said a level. */
	levelUnsaid:
		'Du har ikke valgt nivå, så måtene er lagt som for en mosjonist. Nivået velger du i Meg.',
	/** The confirm under the preview: `Bytt til Mest rolig, litt veldig hardt`. */
	switchTo: (name: string) => `Bytt til ${name}`,
	done: 'Planen har ny treningsform',
	switched: (name: string, from: string) =>
		`Planen er nå «${name}» fra ${from}. Ukene du har trent og øktene dine står som før.`,
} as const

/** The ramp guard, the availability check and the load band (ADR 0040 §12–13). */
export const SESONG_NOTICE_LABELS = {
	dismiss: (name: string) => `Lukk ${name}`,
	dismissed: (name: string) =>
		`${name[0]!.toUpperCase()}${name.slice(1)} er lukket. Den kommer tilbake hvis det den sier endrer seg.`,
	rampName: 'merknaden om stigning',
	availabilityName: 'merknaden om treningsdager',
	bandName: 'merknaden om belastning',
	aBlock: 'En blokk',
	rampRate: (rate: string) => `stiger ${rate} per harde uke`,
	stepRate: (rate: string) => `hopper ${rate} ved starten`,
	rampLifting: (track: string, rate: string, phase: string) =>
		`${track} ${rate}, i blokka som starter i ${phase}.`,
	rampPhase: (phase: string, rate: string) => `${phase} ${rate}.`,
	rampNote: (rate: string) =>
		`Vanlig praksis er ${rate} – per harde uke for stigning, og på én gang for et hopp ved start. Mer enn det er uvanlig, ikke farlig: ingen volumregel er vist å forebygge skader, så dette er en merknad og ikke en grense. Tallene dine er lagret slik du skrev dem.`,
	rampLiftingNote:
		' En styrkeblokk er datert og ikke knyttet til en fase, så fasen som nevnes ved en slik blokk er bare der den første uka faller.',
	daysAsk: (span: string, single: boolean, sessions: string, days: number) =>
		`${span} ${single ? 'ber' : 'ber'} om ${sessions} i uka, og du kan trene ${nbDays(days)} i uka.`,
	hoursAsk: (span: string, single: boolean, peak: string, capacity: string) =>
		`${span} ber om ${single ? '' : 'opptil '}${peak} utholdenhetstrening, og kapasiteten din er ${capacity}.`,
	bothChecks:
		'Det er to ulike sammenligninger – økter mot dagene du trener, og timer mot kapasiteten du har satt – og en uke kan bomme på den ene uten den andre. ',
	daysCheck: 'Det er dager mot dager: økter mot dagene du trener. ',
	hoursCheck:
		'Det er timer mot timer: timene utholdenhetsukene blir til, mot kapasiteten du har satt. ',
	fitNote:
		'Det kan være akkurat det du mente: to økter kan dele en dag, og begge tallene er innstillinger, ikke fakta om uka di. Planen er lagret slik du skrev den.',
	/**
	 * One day clash (ADR 0104 §6), the day named: `Styrke og en hard økt på
	 * tirsdag`, `To harde dager etter hverandre (onsdag–torsdag)`. Takes the
	 * Monday-first weekday; a two-day reason runs to the next day on the wheel.
	 */
	dayClash: (reason: ClashReason, weekday: number) => {
		const day = NB_WEEKDAY_LABELS[weekday % 7]!
		const pair = `${day}–${NB_WEEKDAY_LABELS[(weekday + 1) % 7]!}`
		switch (reason) {
			case 'lifting-on-hard-day':
				return `Styrke og en hard økt på ${day}`
			case 'lifting-before-hard-day':
				return `Styrke dagen før en hard økt (${pair})`
			case 'lifting-on-long-day':
				return `Styrke og den lange økta på ${day}`
			case 'hard-days-in-a-row':
				return `To harde dager etter hverandre (${pair})`
			case 'two-hard-sessions':
				return `To harde økter på ${day}`
			case 'two-long-sessions':
				return `To lange økter på ${day}`
			case 'easy-before-hard-day':
				return `En rolig økt dagen før en hard økt (${pair})`
		}
	},
	/** `Uke 3`, `Uke 3–5 og uke 9`, `Uke 3, uke 6–7 og uke 9`. */
	weekSpans: (spans: readonly string[]) => {
		const [first = '', ...rest] = spans.map((span, at) =>
			at === 0 ? span : `${span[0]!.toLowerCase()}${span.slice(1)}`,
		)
		const last = rest.pop()
		return last == null ? first : `${[first, ...rest].join(', ')} og ${last}`
	},
	/** `Uke 12–14: Styrke og en hard økt på tirsdag – en dag du har valgt selv.` */
	dayClashLine: (span: string, clash: string, pinned: boolean) =>
		`${span}: ${clash}${pinned ? '\u00a0– en dag du har valgt selv' : ''}.`,
	dayClashCheck:
		'Det er dagene lest mot hverandre, på tvers av alt du trener: hard betyr her en økt som ikke er rolig, også middels. ',
	dayClashNote:
		'Det kan være akkurat det du mente – en dag du har valgt selv, blir der du satte den. Planen er lagret slik den er.',
	noCapacity: 'Timer er den andre sammenligningen, og',
	noCapacityLink: 'utøverprofilen',
	noCapacityEnd:
		'din har ingen ukentlig kapasitet ennå – så ingenting her er sjekket mot timene dine.',
	/** `3 kvalitetsøkter og 2 styrkeøkter`. */
	sessionCounts: (quality: number, lifting: number) =>
		[
			quality > 0
				? `${quality} ${quality === 1 ? 'kvalitetsøkt' : 'kvalitetsøkter'}`
				: null,
			lifting > 0
				? `${lifting} ${lifting === 1 ? 'styrkeøkt' : 'styrkeøkter'}`
				: null,
		]
			.filter((half): half is string => half != null)
			.join(' og '),
	bandLine: (pct: string, band: string, goal: string) =>
		`er lagt inn med ${pct}, utenfor ${band} som ${goal} trener i.`,
	bandNote:
		'Det spennet er utledet fra styrkemålet du satte på blokka, aldri skrevet ved siden av – endre målet, så flytter spennet seg, eller la økta være som den er. Dette er en merknad og ikke en grense: blokkene og øktene dine er lagret slik du skrev dem.',
} as const

/** A block's progression and quality mix, under Avansert on its card. */
export const SESONG_SEGMENT_LABELS = {
	progression: (track: string | null) =>
		track ? `Stigning for ${track.toLowerCase()}` : 'Stigning',
	ramp: 'Stigning, % per harde uke',
	rampBlank: 'Tomt – volumet holder seg flatt gjennom blokka.',
	rampSet: (rate: string) =>
		`${rate} hver harde uke. Lette uker og nedtrapping stiger ikke.`,
	step: 'Hopp ved starten av blokka, %',
	stepBlank: 'Tomt – blokka starter der uka før slapp.',
	stepSet: (rate: string) =>
		`${rate} én gang, ved starten. Et bevisst fall inn i en intensitetsblokk hører hjemme her, ikke i stigningen.`,
	recoveryCut: 'Kutt i lett uke, %',
	recoveryBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} fra siste harde uke. La det stå tomt, så følger det med om praksisen endres.`,
	recoverySet: (rate: string) => `Ditt: ${rate} fra siste harde uke.`,
	taperCut: 'Kutt i nedtrappingen mot løpet, %',
	taperBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} mot løpet. La det stå tomt, så følger det med om praksisen endres.`,
	taperSet: (rate: string) => `Ditt: ${rate} mot løpet.`,
	taperNote: ' Nedtrappingen går gradvis over blokka, ikke alt i siste uke.',
	saveProgression: (track: string | null) =>
		track ? `Lagre stigning for ${track.toLowerCase()}` : 'Lagre stigning',
	mix: (track: string | null) =>
		track ? `Kvalitetsøkter for ${track.toLowerCase()}` : 'Kvalitetsøkter',
	mixIntro:
		'Økter i uka i hver kvalitetssone. Tomt eller 0 tar sonen ut – alle tre tomme er en blokk uten kvalitetsøkter, og det er en plan, ikke et hull. Dette tomme feltet er ikke det samme som stigningens tomme felt over: kvalitetsøkter har ingen vanlig praksis å falle tilbake på.',
	mixField: (zone: number, name: string) => `Sone ${zone} ${name}, økter i uka`,
	emphasis: 'Vekt, utledet',
	count: 'Kvalitetsøkter i uka, utledet',
	derivedNote:
		'Begge leses av kvalitetsøktene du lagret, så det er ingenting å skrive her: en blokk får navn etter arbeidet den inneholder. Det fortsetter å lese planen når ukene fylles med ekte økter, så blokka skifter ikke karakter utover sesongen.',
	saveMix: (track: string | null) =>
		track
			? `Lagre kvalitetsøkter for ${track.toLowerCase()}`
			: 'Lagre kvalitetsøkter',
	noQuality: 'Ingen kvalitetsøkter',
	/** `Løping stiger +5 % per harde uke, med 2 kvalitetsøkter i uka – 1× tempo + 1× terskel.` */
	readingSubject: (track: string | null) => track ?? 'Den',
	readingFlat: 'stiger ikke – hver uke er like stor som uka før',
	readingClimb: (rate: string) => `stiger ${rate} per harde uke`,
	readingStep: (rate: string) => `, og starter ${rate} mot blokka før`,
	readingQuality: (count: number, mix: string) =>
		count === 0
			? 'uten kvalitetsøkter'
			: `med ${count} ${count === 1 ? 'kvalitetsøkt' : 'kvalitetsøkter'} i uka – ${mix}`,
	typeRate: 'Skriv en prosent, eller la feltet stå tomt',
	wholeSessions: 'Et helt antall økter, eller tomt for ingen',
	sessionRange: (max: number) => `Mellom 0 og ${max} økter i uka`,
	gone: 'Den blokka er ikke lenger en del av planen.',
} as const

/**
 * What is left to set up on a new plan, above the readings — two steps since
 * the weeks fill themselves (round-2 decision 14, ADR 0090): a climb, and a
 * typical week to fill them from. Gone once both are there.
 */
export const SESONG_NEXT_LABELS = {
	title: 'Det som gjenstår',
	left: (count: number) =>
		count === 1 ? '1 ting igjen' : `${count} ting igjen`,
	climbTitle: 'Gi ukene en stigning',
	climbDetail:
		'Hver uke er like stor som den første nå. Start fra en form, eller sett en stigning på en blokk.',
	climbAction: 'Sett en stigning',
	patternTitle: 'Si hvordan den typiske uka di ser ut',
	patternDetail:
		'Hvilke dager du trener, og hvilken som er den lange. Ukene fylles fra den av seg selv, opp til horisonten.',
	patternAction: 'Lag uka',
} as const

/** What the plan page's phase fields say when a box is left empty. */
export const SESONG_PHASE_FIELD_LABELS = {
	weeks: 'Hvor mange uker varer fasen?',
	rhythm: 'Velg hvordan fasen har lette uker',
} as const

/** The phase cards on Blokker, and adding and deleting (#402). */
export const SESONG_PHASE_LABELS = {
	current: 'Nå',
	tapers: 'Trapper ned',
	/** `Uke 33–36 · 3:1 · fra 10. aug`. */
	detail: (span: string, rhythm: string, from: string) =>
		`${span} · ${rhythm} · fra ${from}`,
	editTitle: 'Navn, lengde og lett uke',
	editDetail: 'Hvilke uker som er lette, og hvor du endrer det.',
	weekRoles: 'Ukenes rytme',
	weekRole: (week: number, role: string) => `Uke ${week}: ${role}`,
	tapersAll:
		'Hver uke i denne fasen trapper ned mot løpet, så den har ingen lett uke.',
	noRecovery: 'Ingen lette uker i denne fasen.',
	recoveryWeeks: (weeks: number[]) =>
		`Lette uker: ${weeks.map((week) => `uke ${week}`).join(', ')} i fasen. Hvor mye de kutter, bestemmer sporet, ikke fasen.`,
	moveEarlier: 'Flytt tidligere',
	moveLater: 'Flytt senere',
	remove: 'Fjern',
	rhythm: 'Rytme',
	taperRhythm:
		'Alle ukene i en fase som trapper ned er nedtrappingsuker, så det er ingen rytme å velge.',
	thisTapers: 'Fasen trapper ned',
	addTitle: 'Legg til en fase',
	name: 'Navn',
	namePlaceholder: 'f.eks. Off-season',
	weeks: 'Uker',
	where: 'Hvor den skal ligge',
	atStart: 'Først',
	after: (name: string) => `Etter ${name}`,
	growsForward:
		'Planen vokser framover – en ny fase flytter aldri uka planen starter i.',
	add: 'Legg til fase',
	deleteIntro: (eventName: string | null) =>
		`Fjerner sesongen du har laget. ${eventName ? `${eventName} blir stående i kalenderen, og hver` : 'Hver'} økt du allerede har trent blir stående som den er.`,
	delete: 'Slett planen',
	deleteConfirm: 'Slette planen?',
	deleteBody: (eventName: string | null) =>
		`Dette fjerner fasene, sporene og startnivåene dine. ${eventName ? `Det rører ikke ${eventName} eller noen økt du har trent – løpet blir stående i kalenderen.` : 'Det rører ingen økt du har trent.'} Det kan ikke angres.`,
	keep: 'Behold planen',
	sparkLabel: (phase: string, weeks: number, track: string) =>
		`${phase}: ${nbWeeks(weeks)} med ${track.toLowerCase()}`,
} as const

/** Season Anchors under Avansert (#407, ADR 0040 §5). */
export const SESONG_ANCHOR_LABELS = {
	intro:
		'Startnivået er ukevolumet sesongen regnes ut fra. Det er en liste med daterte nivåer, ikke ett tall: når sesongen ikke går som planlagt kan du si «fra denne uka starter jeg herfra», og ukene du allerede har levd blir stående som de var.',
	freshStart:
		'Et nytt startnivå er en ny start, ikke en rabatt. Stigningen starter på nytt fra uka du velger, så ukene etter stiger fra det nye tallet i stedet for å fortsette fra det gamle. Uker du har satt selv forblir satt selv, og kan fortsatt tilbakestilles.',
	list: (track: string) => `Startnivå for ${track.toLowerCase()}`,
	unit: (unit: string) =>
		`Startnivået er i ${unit} – enheten sporet har hele livet. Et nytt startnivå endrer tallet, aldri enheten; å måle sporet i noe annet er et nytt spor, ikke en endring.`,
	unpricedOpening: (span: string) =>
		`${span} i planen kan ikke regnes ut: ingen startnivå dekker dem, og appen finner ikke på et tall for en uke den ikke kan regne ut.`,
	outside: 'Utenfor ukene i planen',
	from: (week: number) => `Fra uke ${week}`,
	opening: 'Sesongstart',
	reAnchored: 'Nytt startnivå',
	outsideNote:
		'Dette startnivået gjelder fra en uke planen ikke dekker lenger – det er datert, så en kortere sesong lar det ligge der det var. Fjern det, eller legg til uker i planen.',
	value: (unit: string) => `Ukevolum, ${unit}`,
	save: 'Lagre',
	keepsFirst:
		'Sesongen beholder dette: hver uke fram til neste nye startnivå regnes ut fra det. Endre tallet her i stedet for å fjerne det.',
	remove: 'Fjern dette startnivået',
	allTaken:
		'Hver uke i planen har allerede et startnivå, så det er ingen uke igjen å starte på nytt fra.',
	reAnchorTitle: 'Nytt startnivå fra en uke',
	fromWeek: 'Fra uke',
	pickWeek: 'Velg en uke',
	startingFrom: (unit: string) => `Starter på, ${unit}`,
	restarts:
		'Stigningen starter på nytt her: uka du velger er dette tallet, og de harde ukene etter stiger fra det. Alt før er urørt.',
	reAnchor: 'Sett nytt startnivå',
	valueRequired: 'Hvor mye i uka starter du fra?',
	valueNumber: 'Skriv et ukevolum, f.eks. 45',
	weekRequired: 'Hvilken uke gjelder startnivået fra?',
	summaryNone: 'Ingen spor å gi et startnivå ennå.',
	summaryNotSet: 'ikke satt',
	/** `Løping fra 40 km/uke, nytt startnivå 2 ganger`. */
	summary: (track: string, opening: string, again: number) =>
		`${track} fra ${opening}${again > 0 ? `, nytt startnivå ${again === 1 ? 'én gang' : `${again} ganger`}` : ''}`,
} as const

/** Lifting blocks under Avansert (#409, ADR 0047). */
export const SESONG_LIFTING_LABELS = {
	intro:
		'En styrkeblokk er datert: den starter en uke du velger og varer så lenge du sier, så den kan starte og slutte inne i en fase. Ukene mellom to blokker er uten styrke – noe du har sagt, ikke et hull i planen.',
	unit: (unit: string) =>
		`Sporet planlegges i ${unit} – ukas arbeidssett til sammen, for hele kroppen, ikke per muskelgruppe eller øvelse. Det finnes ikke noe publisert tall å holde det opp mot, så tallet å planlegge fra er ditt eget: startnivået kommer fra settene du allerede logger, og stigningen er hvor fort du øker.`,
	list: 'Styrkeblokker',
	none: 'Ingen styrkeblokker ennå, så hver uke i planen er uten styrke. Legg til en når du vet hvilke uker du er på treningssenteret.',
	outside: 'Utenfor ukene i planen',
	outsideNote:
		'Denne blokka starter en uke planen ikke dekker lenger – den er datert, så en kortere sesong lar den ligge der den var. Velg en uke under for å hente den inn igjen.',
	/** `4 uker · 2× i uka`. */
	cardNote: (weeks: number, sessions: number) =>
		`${nbWeeks(weeks)} · ${sessions}× i uka`,
	remove: 'Fjern blokka',
	save: 'Lagre blokka',
	addTitle: 'Legg til en styrkeblokk',
	add: 'Legg til blokk',
	opensOn: 'Starter',
	pickWeek: 'Velg en uke',
	weeks: 'Uker',
	goal: 'Hva blokka er til for',
	pickGoal: 'Velg et mål',
	sessions: 'Økter i uka',
	ramp: 'Stigning, % per harde uke',
	rampBlank: 'Tomt – settene holder seg flatt gjennom blokka.',
	rampSet: (rate: string) =>
		`${rate} hver harde uke. Avlastningsuker stiger ikke.`,
	step: 'Hopp ved starten av blokka, %',
	stepBlank: 'Tomt – blokka starter der uka før slapp.',
	stepSet: (rate: string) =>
		`${rate} én gang, ved starten. Et bevisst fall inn i en tyngre blokk hører hjemme her, ikke i stigningen.`,
	deloadCut: 'Kutt i avlastning, %',
	deloadCutBlank: (rate: string) =>
		`Tomt – følger vanlig praksis, ${rate} hver avlastningsuke. La det stå tomt, så følger det med om praksisen endres.`,
	deloadCutSet: (rate: string) =>
		`Ditt: ${rate} hver avlastningsuke, flatt og ikke fallende.`,
	deloadWeeks: 'Avlastningsuker til slutt',
	deloadWeeksBlank: (weeks: string) =>
		`Tomt – følger vanlig praksis, ${weeks} til slutt i blokka. La det stå tomt, så følger det med om praksisen endres.`,
	deloadWeeksNone:
		'Ditt: ingen avlastning – blokka går til siste uke med fullt volum.',
	deloadWeeksSet: (weeks: string) =>
		`Ditt: de siste ${weeks} av blokka er avlastning, med kuttet ved siden av.`,
	band: 'Belastning, utledet',
	reps: 'Repetisjoner, utledet',
	derivedNote:
		'Begge kommer fra målet du valgte over, og det er ingenting å skrive: endre målet, så flytter spennet seg. Hvor mye styrke er et annet spørsmål og leses ikke av målet – det er startnivået og stigningen, så planen har aldri to kilder for ett tall.',
	typeRate: 'Skriv en prosent, eller la feltet stå tomt',
	wholeDeload: 'Et helt antall uker, eller tomt for vanlig praksis',
	weekRequired: 'Velg uka blokka starter',
	weeksRequired: 'Hvor mange uker varer blokka?',
	weeksWhole: 'En blokk varer i hele uker',
	goalRequired: 'Velg hva blokka er til for',
	sessionsRequired: 'Hvor mange styrkeøkter i uka?',
	sessionsWhole: 'Antall økter er et helt tall',
	summaryNone:
		'Ingen styrkeblokk ennå – ukene mellom blokker er uker uten styrke.',
	summary: (blocks: number) =>
		`${blocks === 1 ? '1 blokk' : `${blocks} blokker`}, hver datert og ikke knyttet til en fase.`,
} as const

/** The Week Pattern, under Uker (#410, ADR 0044 §7). */
export const SESONG_PATTERN_LABELS = {
	intro:
		'Beskriv uka du faktisk trener én gang, i stedet for å legge inn hver uke for hånd. En dag er enten en fast økt – slik du skrev den, de samme dragene i en stor uke og en liten – eller en andel av det som er igjen, etter vekt. Et mønster lagrer ingen distanser og ingen timer: hver ukes volum regnes ut, så det samme mønsteret blir ulikt i uke 1 og uke 8.',
	previewIntro:
		'Under ser du hva hver dag blir mot én ukes utregnede mål. Ukene i kalenderen fylles fra mønsteret når horisonten når dem.',
	readAgainst: 'Les mot',
	readWeek: 'Les denne uka',
	list: 'Ukemønstre',
	/** `4 dager · lest mot uke 41`. */
	cardNote: (days: number, week: number | null) =>
		`${nbDays(days)} · lest mot ${week == null ? 'ingen uke' : `uke ${week}`}`,
	name: 'Navn',
	rename: 'Gi nytt navn',
	noDays: 'Ingen dager ennå. Legg til øktene du trener i en vanlig uke.',
	/** The pattern's lifting slots (ADR 0104 §3), which have no weekday. */
	liftingSlots: (count: number) =>
		`Styrke: ${count} ${count === 1 ? 'økt' : 'økter'} i uka, på dager appen velger hver uke, unna de harde dagene.`,
	liftingSlotsLink: 'Velg styrkedagene selv',
	days: (name: string) => `Dager i ${name}`,
	unknownTrack: 'Ukjent spor',
	workoutRemoved: 'Økta er fjernet',
	fixedNote: 'slik du skrev den, aldri skalert',
	share: (weight: number, share: string | null) =>
		`Andel, vekt ${String(weight).replace('.', ',')}${share == null ? '' : ` · ${share} av det som er igjen`}`,
	shapedOn: (title: string) => ` · formet etter ${title}`,
	remove: (weekday: string, position: number | null) =>
		`Fjern ${weekday}${position == null ? '' : ` nr. ${position}`}`,
	earlierInDay: 'Tidligere på dagen',
	laterInDay: 'Senere på dagen',
	moveEarlier: 'Flytt tidligere',
	moveLater: 'Flytt senere',
	fixedGone:
		'Økta denne dagen la inn er borte, så det er ikke noe volum å lese.',
	fixedUnread: (unit: string) =>
		`Økta kan ikke leses i ${unit}, så den har ikke noe volum å legge inn her.`,
	noTarget: (track: string) =>
		`Uka har ikke noe utregnet mål for ${track.toLowerCase()}, så det er ingenting for denne andelen å ta en del av.`,
	unknownRemainder: (unit: string) =>
		`En fast økt i mønsteret kan ikke leses i ${unit}, så det som er igjen å dele er ukjent – og en andel av en ukjent rest ville vært et oppdiktet tall.`,
	totalsTitle: (track: string, week: number | null) =>
		`${track}${week == null ? '' : ` · uke ${week}`}`,
	weekTarget: 'Ukemål',
	fixedTotal: 'Lagt inn av faste dager',
	leftTotal: 'Igjen til andelsdagene',
	unallocated: 'Tatt av ingen dag',
	noShareDay: (track: string) =>
		`Mønsteret har ingen andelsdag for ${track.toLowerCase()}, så ingenting tar resten av uka. Legg til en, eller la det være – et mønster trenger ikke bruke hele uka.`,
	fixedExceeds: (track: string, fixed: string, target: string) =>
		`De faste øktene for ${track.toLowerCase()} legger inn ${fixed}, og ukemålet er ${target}. De står slik du skrev dem – drag er foreskrevet, så ingenting her korter ned en økt du har skrevet.`,
	fixedExceedsShares:
		' Det er ingenting igjen til andelsdagene denne uka, som tallene over sier.',
	fixedExceedsNoShares:
		' Uka er rett og slett mindre enn øktene du har lagt inn.',
	unreadFixed: (days: number, unit: string) =>
		`${days === 1 ? 'Én fast dag' : `${days} faste dager`} kan ikke leses i ${unit}, så uka kan ikke deles: det andelsdagene skulle dele er ukjent, og en andel av en ukjent rest ville vært et tall appen fant på. De faste øktene er ikke berørt.`,
	addDay: 'Legg til en dag',
	weekday: 'Ukedag',
	track: 'Spor',
	trackNote:
		'En svømmedag tar svømmevolum, så dagen sier hvilket spor den hører til.',
	kind: 'Hva slags dag',
	fixedHint:
		'Slik du skrev den og aldri skalert – de samme dragene i en stor uke og en liten.',
	shareHint:
		'En relativ vekt, fordelt over uka – dagen tar sin del av det de faste øktene lar være igjen.',
	weight: 'Relativ vekt',
	noWorkouts: 'En fast dag legger inn en økt, og du har ingen ennå',
	noTrackWorkouts: (track: string) =>
		`En fast dag legger inn en økt fra dagens eget spor, og du har ingen økt i ${track.toLowerCase()} ennå`,
	authorSession: 'skriv en økt',
	authorSessionLead: '– appen lager en økt sammen med en treningsøkt, så',
	authorSessionTail:
		'så tilbys den her. Til da kan en dag fortsatt ta en andel av uka.',
	workout: 'Økt',
	shape: 'Form (valgfri)',
	noShape: 'Ingen form – bare volum',
	fixedWorkoutHint:
		'Lagt inn slik du skrev den. Volumet leses av økta selv, så det er det samme hver uke.',
	shapeHint:
		'En form skaleres til andelen dagen tar. La den være for volum uten struktur.',
	addDayButton: 'Legg til dag',
	noTracks:
		'Planen har ikke noe spor ennå, og en dag i mønsteret tar volumet sitt fra et spor.',
	addPattern: 'Legg til et ukemønster',
	patternPlaceholder: 'f.eks. Vanlig uke',
	addPatternButton: 'Legg til mønster',
	none: 'Ingen typisk uke ennå.',
	starterProfile: (days: number) =>
		`Lag en fra ${days === 1 ? 'dagen' : `de ${days} dagene`} du sier du kan trene – én økt hver, den siste lang. Flytt, vekt eller fjern dager etterpå.`,
	starterDefault:
		'Lag en fra en uke med fire dager som utgangspunkt – én økt hver dag, den siste lang. Flytt, vekt eller fjern dager etterpå, og sett treningsdagene i utøverprofilen for å lese dem derfra i stedet.',
	starter: 'Lag en typisk uke for meg',
	orOwn: 'Eller gi din egen et navn under og legg til dagene selv.',
	delete: 'Slett mønsteret',
	deleteConfirm: (name: string) => `Slette ${name}?`,
	deleteBody: (name: string, days: number) =>
		`Dette fjerner ${name}${days === 0 ? ', som ikke har noen dager ennå' : days === 1 ? ' og den ene dagen' : ` og de ${days} dagene`}. Blokkene, sporene og hver økt du har trent blir stående som de er – økter som allerede er lagt inn i kalenderen blir også stående. Det kan ikke angres.`,
	keep: 'Behold mønsteret',
	starterToast: 'En uke å starte fra',
	starterFromProfile: (days: number) =>
		`Laget fra ${days === 1 ? 'dagen' : `de ${days} dagene`} du sier du kan trene på`,
	starterFromDefault:
		'En uke med fire dager som utgangspunkt – du har ikke satt treningsdagene dine, så ingenting ble lest derfra',
	starterTail: (built: string) =>
		`${built}, med den siste dagen lang. Hver dag kan flyttes, vektes eller fjernes. Ukene fylles fra den når horisonten når dem.`,
	nameRequired: 'Gi mønsteret et navn.',
	whichDay: 'Hvilken ukedag?',
	weightRequired:
		'Hvor stor er dagen ved siden av de andre? f.eks. 1, eller 2,5',
} as const

/** Kopier uke, under Uker (#415). */
export const SESONG_COPY_LABELS = {
	intro:
		'Hver økt i uka du velger kopieres til de samme dagene i den andre uka, på samme tid. Hver kopi får sin egen økt, så de to ukene er adskilt fra første stund – endre den ene, så står den andre.',
	asWritten:
		'En uke kopieres slik du skrev den. Den strekkes ikke for å møte målet i uka den havner i – ber den uka om mer, viser lista det slik den viser enhver uke du har satt selv.',
	oneWeek: 'Planen har én uke, så det er ingen annen uke å kopiere til.',
	source: 'Kopier denne uka',
	target: 'Til denne uka',
	copy: 'Kopier uka',
	week: (week: number) => `Uke ${week}`,
	weekOption: (week: number, date: string) => `Uke ${week} · ${date}`,
	filled: (week: number) => `Uke ${week} har allerede økter`,
	nothingWritten: 'Ingenting er skrevet ennå.',
	noneReplaced: 'Ingenting i den uka blir erstattet.',
	replacing: (count: number, source: string | null) =>
		`${nbSessions(count)[0]!.toUpperCase()}${nbSessions(count).slice(1)} blir slettet og skrevet på nytt fra ${source ?? 'uka du valgte'}. Endringer du har gjort i dem forsvinner, og det kan ikke angres.`,
	keeping: (count: number) =>
		` ${nbSessions(count)[0]!.toUpperCase()}${nbSessions(count).slice(1)} blir stående som de er – du har allerede trent eller logget dem, så en kopi rører dem aldri.`,
	replace: 'Erstatt og kopier',
	orEmpty: 'Eller velg en tom uke i stedet.',
	done: 'Uka er kopiert',
	/** `4 økter fra uke 41 til uke 43, slik du skrev dem. …`. */
	sentence: (sessions: number, from: number, to: number, replaced: number) =>
		`${nbSessions(sessions)} fra uke ${from} til uke ${to}, slik du skrev dem. Endre den ene uka – den andre står.${replaced > 0 ? ` ${nbSessions(replaced)} ble erstattet.` : ''}`,
	noPrescription:
		'En økt uten en økt bak seg ble utelatt – det var ingenting å kopiere.',
} as const

/** The roster of Training Tracks on the summary card (#414). */
export const SESONG_TRACK_LABELS = {
	list: 'Treningsspor',
	/** `· i km/uke · starter på 40 km/uke`. */
	line: (unit: string, start: string | null) =>
		`· i ${unit}${start == null ? '' : ` · starter på ${start}`}`,
	reAnchored: (times: number, latest: string) =>
		` · nytt startnivå ${times === 1 ? 'én gang' : `${times} ganger`}, sist til ${latest}`,
	add: 'Legg til et spor',
	addDetail: (names: string) => `${names} – hver i en enhet den beholder.`,
	remove: 'Fjern',
	removeName: (track: string) => `Fjern sporet ${track.toLowerCase()}`,
	removeConfirm: (track: string) => `Fjerne sporet ${track.toLowerCase()}?`,
	removeBody: (track: string) =>
		`Dette fjerner startnivået, stigningen og uker du har satt selv på sporet, og alle dager i mønsteret som tok volum fra det. Fasene står som de er, og det gjør hver økt du har trent. Du kan lage et spor for ${track.toLowerCase()} igjen etterpå – det starter på nytt, og du velger enheten igjen.`,
	keep: 'Behold sporet',
	removeButton: 'Fjern sporet',
	discipline: 'Sport',
	plannedIn: 'Planlegges i',
	ownUnit: '· styrkens egen enhet, ikke et valg',
	unit: 'Enhet',
	pickUnit: 'Velg enheten du planlegger i',
	proposed: 'Foreslått fra din egen historikk. ',
	noHistoryUnit: (weeks: number) =>
		`Ingenting i de siste ${weeks} ukene å lese en enhet fra, så du velger selv. `,
	unitFixed:
		'Enheten ligger fast når sporet finnes – å endre den ville skrevet om enheten i uker du har trent, så det er et nytt spor og ikke en endring.',
	startingVolume: (unit: string | null) =>
		unit ? `Startvolum (${unit})` : 'Startvolum',
	anchorNone: (weeks: number) =>
		`Ingenting i de siste ${weeks} ukene å lese dette fra – skriv ukevolumet du starter på.`,
	anchorAverage: (
		weeks: number,
		average: string,
		total: string,
		trained: number,
	) =>
		`De siste ${weeks} ukene var snittet ${average} (${total} til sammen)${trained === weeks ? '' : ` – du trente ${trained} av dem`}.`,
	anchorTail:
		' Startvolumet gjelder fra planens første uke, og fasene du allerede har er fasene sporet måles over.',
	addButton: 'Legg til spor',
	disciplineRequired: 'Velg hvilken sport sporet måler',
	unitRequired: 'Velg enheten du planlegger sporet i',
	anchorRequired: 'Et startvolum må fylles inn',
	anchorPositive: 'Startvolumet er mer enn null',
} as const

/** Every refusal the plan page's action says, as the athlete reads it. */
export const SESONG_REFUSAL_LABELS = {
	unknown: 'Det kan ikke denne siden gjøre.',
	phaseGone: 'Den fasen er ikke lenger en del av planen.',
	outlineGone: 'Den planen kan ikke endres.',
	position: 'Velg hvor den nye fasen skal ligge.',
	shapeUnknown: 'Den formen finnes ikke i appen. Ingenting ble endret.',
	noEvent: 'Planen har ikke noe løp, så det er ingenting å tilpasse den til.',
	alreadyFits: 'Planen slutter allerede i uka for løpet.',
	cannotFit:
		'Blokkene kan ikke endres til å nå løpet uten at én av dem forsvinner. Kort ned eller fjern en blokk selv.',
	planResting:
		'Planen hviler mens planen mot løpet ditt er i gang, så ingen uker legges for den nå.',
	patternGone: 'Det ukemønsteret er ikke lenger en del av planen.',
	noStarterWeek:
		'Treningsdagene dine sier at du trener ingen dager, så det er ingen uke å lage. Sett treningsdagene i utøverprofilen, eller gi et mønster navn og legg til dagene selv.',
	dayGone: 'Den dagen er ikke lenger en del av mønsteret.',
	trackGone: 'Det sporet er ikke lenger en del av planen.',
	weekOutside: 'Den uka er ikke i planen.',
	weekNotInPlan:
		'Den uka er ikke en av ukene i planen. Velg en uke mellom den første og den siste, eller legg til uker i planen først.',
	anchorGone: 'Det startnivået er ikke lenger en del av planen.',
	trackMissing: 'Velg hvilket spor dagen tar fra.',
	workoutMissing: 'En fast dag legger inn en økt, så velg hvilken.',
	dayKindUnknown:
		'En dag er enten en fast økt eller en andel av uka. Ingenting ble lagt til.',
	blockGone: 'Den styrkeblokka er ikke lenger en del av planen.',
	alreadyTracked:
		'Planen måler allerede den sporten. Ett spor per sport, så endre det du har.',
	lastTrack:
		'En plan måler minst én sport. Slett selve planen hvis du ikke vil ha noen.',
	badValue: 'Det er ikke en verdi denne fasen kan ha.',
	planTooLong: 'Da ville planen gått over to år. Kort ned en fase først.',
	lastPhase:
		'En plan har minst én fase. Slett selve planen hvis det er det du vil.',
	phaseAtEdge: 'Den fasen er allerede ytterst i den enden av sesongen.',
	workoutGone:
		'Den økta er ikke lenger din. Velg en annen økt for denne dagen.',
	workoutMismatch:
		'Den økta er en annen sport enn sporet til dagen, og en dag tar volumet fra sitt eget spor. Velg en økt på det sporet.',
	atEdge: 'Den er allerede ytterst i den enden av rekkefølgen.',
	earliestAnchor:
		'Sesongen beholder det første startnivået – hver uke fram til neste nye startnivå regnes ut fra det. Endre tallet i stedet, eller fjern et senere startnivå.',
	sameWeek: 'Det er samme uke to ganger. Velg en annen uke å kopiere til.',
	sourceEmpty:
		'Den uka har ingen økter, så det er ingenting å kopiere. Velg en uke du allerede har fylt.',
	nothingToCopy:
		'Den uka har bare registrerte aktiviteter, og de har ingen økt å kopiere. Ingenting ble endret.',
	notStrengthTrack:
		'Styrkeblokker hører til et styrkespor, og det sporet er et utholdenhetsspor. Ingenting ble endret.',
	segmentPastPlan:
		'Blokka ville gått forbi den siste uka i planen. Kort den ned, start den tidligere, eller legg til uker i planen.',
	weekOpensSegment:
		'En annen styrkeblokk starter allerede den uka. Start denne en annen uke.',
	segmentsOverlap:
		'Blokka ville overlappet en annen styrkeblokk. Blokker ligger etter hverandre, og ukene mellom to av dem er uten styrke.',
	presetDone: 'Kopiert inn i planen',
	presetDoneDetail:
		'Den er din nå – endre hva du vil. Ingenting er knyttet til formen du valgte.',
	fitDone: 'Planen lander på løpet',
	fitTail: ' Endre lengden på en blokk tilbake hvis det ikke var det du ville.',
	deleted: 'Planen er slettet',
	deletedDetail: 'Løpet og øktene du har trent er urørt.',
	fitAdd: (weeks: number) =>
		`Legg til ${nbWeeks(weeks)} så den lander på løpet`,
	fitRemove: (weeks: number) =>
		`Ta bort ${nbWeeks(weeks)} så den lander på løpet`,
	/** `Grunntrening 4 → 6 uker, Oppbygging 4 → 3 uker`. */
	fitChange: (name: string, from: number, to: number) =>
		`${name} ${from} → ${nbWeeks(to)}`,
	fitLengthens: (changes: string) =>
		`Forlenger grunntreningen for å nå løpet: ${changes}.`,
	fitShortens: (changes: string) =>
		`Tar ukene fra grunntreningen først, så framover gjennom sesongen: ${changes}. Nedtrappingen er urørt.`,
} as const

/** The analytical season chart, under Avansert (#413). */
export const SESONG_CHART_LABELS = {
	title: 'Sesongdiagram',
	/** `10 uker · Løping i km/uke`. */
	aside: (weeks: number, track: string, unit: string) =>
		`${nbWeeks(weeks)} · ${track} i ${unit}`,
	track: 'Spor',
	readIn: 'Les i',
	layers: 'Lag',
	derived: 'utledet',
	readInAuthored: (unit: string) =>
		`Les i ${unit.toLowerCase()}, slik du skrev det`,
	readInDerived: (unit: string) => `Les i ${unit.toLowerCase()}, utledet`,
	layer: {
		volume: 'Volum',
		fitness: 'Form',
		rhythm: 'Rytme',
		ramp: 'Stigning',
		emphasis: 'Vekt',
		form: 'Overskudd',
	},
	tableCaption: (track: string, unit: string, authoredIn: string | null) =>
		`Volum for ${track.toLowerCase()} per treningsuke, i ${unit}${authoredIn ? `, en utledet lesning av et spor skrevet i ${authoredIn}` : ''}. Gå over diagrammet for å lese utregningen for en uke i panelet under.`,
	columns: {
		week: 'Uke',
		starts: 'Starter',
		block: 'Blokk',
		role: 'Rolle',
		change: 'Endring',
		emphasis: 'Vekt',
	},
	noChange: 'Ingen endring å lese',
	ariaVolume: (track: string, unit: string) =>
		`Volum for ${track.toLowerCase()} gjennom sesongen, i ${unit}. Bruk piltastene for å lese en uke.`,
	event: 'Løp',
	na: 'mangler',
	fitnessUnavailable: (reason: string) =>
		`Formkurven kan ikke regnes ut – ${reason}.`,
	fitnessAria:
		'Beregnet form (CTL) gjennom sesongen, regnet fram fra planen din. Bruk piltastene for å lese en uke.',
	fitnessCaption: (eventName: string | null) =>
		`Beregnet form (CTL) på slutten av hver treningsuke, regnet fram fra ${eventName ? `planen mot ${eventName}` : 'planen din'}.`,
	fitnessColumn: 'Beregnet form (CTL)',
	fitnessHint: 'Trykk på en uke for å lese formen planen gir den.',
	fitnessWeek: (week: number, ctl: string) =>
		`Uke ${week} · beregnet form ${ctl}`,
	gapNoAnchor:
		'det er ingen registrert belastning å regne planen fram fra ennå',
	gapBaseline: (day: number, of: number) =>
		`formgrunnlaget bygges fortsatt, dag ${day} av ${of}`,
	gapUnpriced: 'planen har ingen uke en belastning kan leses fra',
	basisFrom: (from: string) =>
		`Regnet fram fra formen du hadde inn i den første uka, gjennom planens egne uker – ${from}.`,
	basisConventions: (conventions: string) =>
		`Priset gjennom din egen sonemodell, ${conventions}.`,
	basisOneNumber: 'Planen er ett tall i uka, så bare formen regnes fram.',
	basisTrack: (track: string, unit: string) => `${track} i ${unit}`,
	inspectHint:
		'Trykk på en uke for å lese den – tallene, og hvor et utledet tall kommer fra.',
	eventWeek: ' · uka for løpet',
	handSetWeek: ' · du satte denne uka selv',
	roleWeek: (role: string) => role,
	stepNone: 'Ingen endring å lese mot uka før.',
	stepOn: (rate: string) => `${rate} mot uka før.`,
	rampConvention: 'Stigning: vanlig praksis.',
	rampAuthored: (rate: string) => `Stigning satt til ${rate}.`,
	noQuality: 'Ingen kvalitetsøkter denne uka.',
	opening: 'Sesongstart',
	reAnchored: 'Nytt startnivå',
	blockOpens: (track: string) =>
		`En blokk med ${track.toLowerCase()} starter denne uka`,
	overflow:
		'Kvalitetsøktene alene ber om mer enn ukas volum. Det rolige arbeidet går ned til null, og planen står slik du skrev den.',
	whereFrom: 'Hvor tallet kommer fra',
	substitution: (
		requested: number,
		recipe: string,
		band: string,
		declared: number,
	) =>
		`Sone ${requested} prises fra ${recipe} sone ${band}, den nærmeste sone ${declared} sonemodellen din har.`,
	buckets: 'Uka delt opp i intensiteter',
	bucketColumns: {
		bucket: 'Del',
		hours: 'Timer',
		distance: 'Distanse',
		load: 'Belastning',
		intensity: 'Intensitet',
	},
	easy: 'Rolig',
	steps: {
		authored: 'Du skrev',
		'quality-hours': 'Kvalitetstid i sonen',
		'quality-km': 'Kvalitetsdistanse',
		'quality-tss': 'Kvalitetsbelastning',
		'easy-hours': 'Rolig tid',
		'easy-km': 'Rolig distanse',
		'easy-tss': 'Rolig belastning',
		'easy-pace-ratio': 'Forhold rolig fart',
		'speed:easy': 'Rolig fart',
		'speed:quality': 'Kvalitetsfart',
		'if:easy': 'Rolig intensitet',
		'tss-per-hour:easy': 'Rolig belastning per time',
		'total-km': 'Uka, i km',
		'total-hours': 'Uka, i timer',
		'total-tss': 'Uka, i TSS',
	} as Record<string, string>,
	zoneSteps: {
		'quality-hours': (zone: string) => `Tid i ${zone}`,
		'quality-km': (zone: string) => `Distanse i ${zone}`,
		'quality-tss': (zone: string) => `Belastning fra ${zone}`,
		if: (zone: string) => `Intensitet i ${zone}`,
		'tss-per-hour': (zone: string) => `Belastning per time i ${zone}`,
	} as Record<string, (zone: string) => string>,
	sourceConvention: (convention: string, citation: string) =>
		`fra ${convention} – vanlig praksis, ${citation}`,
	sourceThreshold: (field: string) => `fra ${field}`,
	sourceRecipe: (recipe: string, band: string, description: string | null) =>
		`fra sonemodellen ${recipe}, sone ${band}${description ? ` (${description})` : ''}`,
	sourceRides: (rides: number, weeks: number) =>
		`fra ${rides} registrerte sykkeløkter i de ${weeks} ukene før planen`,
	sourceArithmetic: 'regnet ut fra tallene under',
	unavailable: (reason: string) => `Utilgjengelig – ${reason}`,
	formTitle: 'Overskudd tegnes ikke her',
	formBody:
		'Planen sier hvor mye en uke inneholder, ikke hvilke dager, så en framregning må spre hver uke jevnt. Formen tåler det – den leser seks uker om gangen – men trøtthet leser de siste sju dagene, og overskudd er form minus trøtthet. Spredt flatt ville begge vært former av gjennomsnittet og ikke av treningen din, så dette laget tegner ingenting i stedet for en kurve planen ikke kan bære. Det ekte overskuddet ditt står på I dag, fra det du faktisk gjorde.',
	authoredMarker: 'skrevet',
	derivedMarker: 'utledet',
} as const

/**
 * The shapes under Avansert (_Start fra en form_, #405), named the way the
 * Filosofi card names a philosophy: `Klassisk 3:1`, `Klassisk 3:1, lang
 * innkjøring` — one name for one method on one page (audit B7).
 */
export const SESONG_SHAPE_LABELS = {
	lengthSuffix: {
		short: ', kort innkjøring',
		standard: '',
		long: ', lang innkjøring',
	},
	lengthNote: {
		short: 'Den samme sesongen over færre uker.',
		standard: null,
		long: 'Den samme sesongen over flere uker.',
	},
	list: 'Sesongformer',
	weeks: (weeks: number) => nbWeeks(weeks),
	replaces: 'Erstatter blokkene du har nå.',
	apply: (name: string) => `Bruk ${name}`,
	copied:
		'Hver form kopieres inn i planen din. Å bruke en erstatter blokkene du har nå – og det som lander er vanlige blokker du kan gi nytt navn, endre lengden på og flytte. Ingenting er knyttet til formen du valgte.',
	notSize:
		'En form sier hvordan sesongen bygges, aldri hvor store ukene er. Startuka, treningssporene og volumet du starter på står som før.',
	fixedLength:
		'Hver form har en fast lengde, så en kortere eller lengre innkjøring gjør at planen slutter før eller etter løpet i stedet for å strekke en blokk. Linja over blokkene sier hvilken – og tilbyr å tette gapet. Uker tas fra grunntreningen først, så framover gjennom sesongen, og nedtrappingen kortes aldri ned. Hver form finnes i tre lengder, så de fleste innkjøringer har en som passer.',
	climb: (rate: string) =>
		`Alle stiger etter vanlig praksis, rundt ${rate} per harde uke. Det er der trenerpraksis ligger, ikke en sikkerhetsgrense: ingen volumregel er vist å forebygge skader, så det er et utgangspunkt og ikke en regel.`,
	cuts: (recovery: string, taper: string) =>
		`Lette uker og nedtrapping følger vanlig praksis også – ${recovery} fra siste harde uke og ${taper} mot løpet. Ingen form velger dem, så de flytter seg hvis praksisen gjør det. Sett dine egne på en blokk etterpå.`,
	rhythms:
		'Rytmene er også vanlig praksis. Ingen studie har vist at tre harde uker og en lett slår to og en, eller å ta en lett uke når du trenger den – så velg rytmen som passer livet ditt. Du kan endre den på hver blokk.',
	loads: (rhythm: string) => `Rytme ${rhythm}.`,
	rhythmChanges: 'Rytmen skifter fra blokk til blokk.',
	step: (rate: string, phase: string) =>
		` Volumet går ${rate} inn i ${phase}, med vilje, når kvaliteten øker.`,
	tableCaption: (name: string) =>
		`${name}: belastningen formen gir, hver uke som andel av første uke`,
	columns: { week: 'Uke', block: 'Blokk', role: 'Rolle', load: 'Belastning' },
	week: (week: number) => `Uke ${week}`,
	summary: (
		name: string,
		weeks: number,
		peak: string,
		peakWeek: number,
		recovery: number,
		taper: number,
	) =>
		`${name}: en belastning over ${nbWeeks(weeks)}. Den starter på volumet du starter fra og topper på ${peak} av det i uke ${peakWeek}. ${recovery === 1 ? '1 lett uke' : `${recovery} lette uker`} underveis, så trapper den ned over ${taper === 1 ? 'den siste uka' : `de siste ${taper} ukene`}. Hver uke står i tabellen som følger.`,
} as const

// ---------------------------------------------------------------------------
// Events pages (`/training/events`, new, detail, edit) in Norwegian (ADR 0081,
// round 2): the list, the form, the detail and its dialogs. The English
// `EVENT_*_LABELS` above stay for any caller still on them.
// ---------------------------------------------------------------------------

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

/**
 * Meg (spec #505 story 59): the account, the training settings, the
 * intervals.icu connection and the file upload — imports have no page of their
 * own.
 */
export const ME_LABELS = {
	profileDetail:
		'Profil, e-post, passord, totrinns, passnøkler og dataene dine',
	settings: 'Innstillinger',
	training: 'Trening og terskler',
	integrations: 'Koblinger',
	upload: 'Last opp en aktivitetsfil',
	uploadDetail: '.fit, .tcx eller .gpx fra en klokke eller en annen app',
	logout: 'Logg ut',
} as const

/**
 * _Styrkeøkter i uka_ in Meg (#574, ADR 0103): the athlete's own **Strength
 * Frequency** answer, and that it changes no plan already made.
 */
export const MEG_STRENGTH_LABELS = {
	title: 'Styrkeøkter i uka',
	intro:
		'Hvor mange styrkeøkter du vil ha i uka. Det er ditt eget svar, og appen gjetter det aldri.',
	unanswered: 'Ikke valgt ennå.',
	answered: (count: number) =>
		`Du har valgt ${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka.`,
	/** Meg's row detail. */
	detail: (count: number | null) =>
		count == null ? 'Ikke valgt' : `${count} i uka`,
	planNote:
		'Planen du har nå, endres ikke av dette. Styrkedagene i den flytter du i Plan.',
	invalid: 'Velg 1, 2 eller 3 styrkeøkter i uka',
	save: 'Lagre',
	/** Under the frequency, where the plan's lifting days are chosen below it. */
	planNoteWithDays:
		'Planen du har nå, endres ikke av dette. Dagene i planen velger du under.',
	/** The frequency, once the athlete has chosen the days themselves. */
	fromDays: (count: number) =>
		`${count} i uka – én for hver dag du har valgt i planen.`,
} as const

/**
 * The plan's lifting days in _Meg → Trening → Styrke_ (#597, ADR 0104 §4):
 * _La appen velge_, or the athlete's own **Pinned days**, previewed over the
 * coming weeks before anything is written (ADR 0084) and undone from the
 * toast (ADR 0088). Weekdays Monday first, as {@link NB_WEEKDAY_LABELS}.
 */
export const MEG_STRENGTH_DAYS_LABELS = {
	heading: 'Styrkedagene i planen',
	intro:
		'Velg selv hvilke dager du løfter, eller la appen legge styrken unna de harde øktene hver uke.',
	modeLegend: 'Hvem velger dagene',
	auto: 'La appen velge',
	own: 'Velg dager',
	autoNote: (count: number) =>
		`Appen legger ${count} ${count === 1 ? 'styrkeøkt' : 'styrkeøkter'} i uka på dager uten harde økter, og flytter dem når de harde dagene flytter seg.`,
	chipsLegend: 'Dagene du løfter',
	chipsNote:
		'Bare dagene du kan trene, fra profilen din. Like mange dager som styrkeøkter i uka, opptil 3.',
	chipsNoteNoAvailability:
		'Like mange dager som styrkeøkter i uka, opptil 3. Setter du treningsdagene dine i profilen, kan du bare velge blant dem.',
	ownNote:
		'Styrken legges bare på disse dagene, og de harde øktene legges rundt dem.',
	/** Under the chips once three are chosen: why the others rest. */
	full: 'Du har valgt 3 dager, som er flest. Ta bort en dag for å velge en annen.',
	preview: 'Se hva som endres',
	previewing: 'Henter de neste ukene …',
	previewHeading: 'De neste ukene',
	/** `Uke 43`, the ISO week the athlete reads everywhere. */
	week: (isoWeek: number) => `Uke ${isoWeek}`,
	/** `Styrke tirsdag og torsdag`. */
	lifting: (days: readonly number[]) =>
		days.length === 0
			? 'Ingen styrke'
			: `Styrke ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** `Harde økter mandag`. */
	hard: (days: readonly number[]) =>
		days.length === 0
			? 'ingen harde økter'
			: `${days.length === 1 ? 'hard økt' : 'harde økter'} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** What the week had before, where it changes. */
	was: (days: readonly number[]) =>
		`Før: ${days.length === 0 ? 'ingen styrke' : nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	same: 'Som før',
	clashNote:
		'Dagene du velger, blir der du satte dem. Appen sier fra, men flytter dem ikke.',
	apply: 'Bruk',
	applying: 'Lagrer …',
	cancel: 'Avbryt',
	/** The toast after a write. */
	saved: (days: readonly number[] | null) =>
		days == null
			? 'Appen velger styrkedagene igjen.'
			: `Du løfter nå ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`,
	undo: 'Angre',
	undone: 'Styrkedagene er som før.',
	refusals: {
		'no-days': 'Velg minst én dag, eller la appen velge.',
		'outside-availability': 'Velg bare dager du kan trene.',
		'too-many': 'Velg opptil 3 dager.',
		stale: 'Planen endret seg mens du så på den. Se hva som endres igjen.',
		'no-session': 'Det finnes ingen styrkeøkt å legge inn ennå.',
		'no-plan': 'Du har ingen plan å legge styrkedagene i.',
		'no-strength-track': 'Planen din har ikke styrke.',
		'no-pattern': 'Planen har ikke noe ukemønster å legge styrken i ennå.',
		'bad-restore': 'Kunne ikke sette dagene tilbake.',
	},
} as const

/**
 * A row's name under _Dagene i uka_: a sport's own word, said lower-case
 * inside a sentence (_dagene for sykling_), or a Simple Activity's title,
 * which is the athlete's and is said as they wrote it (_HIIT_, _Langrenn_).
 */
export type TrackDaysName = { text: string; activity: boolean }

function inSentence(name: TrackDaysName): string {
	return name.activity ? name.text : lowerFirst(name.text)
}

/**
 * _Dagene i uka_ under _Plan → Avansert_ (#598, ADR 0104 §4): the days of
 * every endurance track and Simple Activity — _La appen velge_ or weekday
 * chips, as for strength in Meg, with the coming weeks before the write and
 * _Angre_ after it.
 */
export const PLAN_TRACK_DAYS_LABELS = {
	title: 'Dagene i uka',
	intro:
		'Velg selv hvilke dager en idrett eller aktivitet ligger på, eller la appen legge dem rundt de andre.',
	/** A Simple Activity's row: its name, or the generic word. */
	activity: (title: string | null) => title ?? 'Enkel aktivitet',
	/** `Mandag, torsdag og lørdag`, or what a unit with no day says. */
	days: (days: readonly number[]) =>
		days.length === 0
			? 'Ingen dager ennå'
			: capitalize(nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))),
	appChooses: 'appen velger',
	ownChoice: 'valgt selv',
	change: 'Endre',
	changeFor: (name: TrackDaysName) => `Endre dagene for ${inSentence(name)}`,
	modeLegend: 'Hvem velger dagene',
	auto: 'La appen velge',
	own: 'Velg dager',
	autoNote:
		'Appen gir den dagene de andre idrettene lar ligge, én økt om dagen, og den lange økta på den siste.',
	chipsLegend: (name: TrackDaysName) => `Dagene for ${inSentence(name)}`,
	chipsNote: 'Bare dagene du kan trene, fra profilen din.',
	chipsNoteNoAvailability:
		'Setter du treningsdagene dine i profilen, kan du bare velge blant dem.',
	ownNote:
		'Økta legges bare på disse dagene, og ukas mengde deles på dem. De harde øktene til de andre legges rundt.',
	/**
	 * Under the chips, where a chosen day left the athlete's Training
	 * Availability — a Simple Activity keeps it until they name a new one.
	 */
	notAvailable: (days: readonly number[]) =>
		`${capitalize(nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!)))} er ikke ${days.length === 1 ? 'en treningsdag' : 'treningsdager'} lenger. Ta ${days.length === 1 ? 'den' : 'dem'} bort, eller legg ${days.length === 1 ? 'den' : 'dem'} til i profilen din.`,
	activityNote:
		'En enkel aktivitet ligger alltid på dagene du velger. Økta er den samme hver gang.',
	preview: 'Se hva som endres',
	previewing: 'Henter de neste ukene …',
	previewHeading: 'De neste ukene',
	week: (isoWeek: number) => `Uke ${isoWeek}`,
	/** `Sykling onsdag og søndag`. */
	unitDays: (name: TrackDaysName, days: readonly number[]) =>
		days.length === 0
			? `Ingen ${inSentence(name)}`
			: `${name.text} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	/** `harde økter tirsdag og lørdag`. */
	hard: (days: readonly number[]) =>
		days.length === 0
			? 'ingen harde økter'
			: `${days.length === 1 ? 'hard økt' : 'harde økter'} ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	was: (days: readonly number[]) =>
		`Før: ${days.length === 0 ? 'ingen dager' : nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}`,
	same: 'Som før',
	clashNote:
		'Dagene du velger, blir der du satte dem. Appen sier fra, men flytter dem ikke.',
	apply: 'Bruk',
	applying: 'Lagrer …',
	cancel: 'Avbryt',
	/** The toast after a write. */
	saved: (name: TrackDaysName, days: readonly number[] | null) =>
		days == null
			? `Appen velger dagene for ${inSentence(name)} igjen.`
			: `${name.text} ligger nå ${nbJoin(days.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`,
	undo: 'Angre',
	undone: (name: TrackDaysName) => `Dagene for ${inSentence(name)} er som før.`,
	refusals: {
		'no-days': 'Velg minst én dag.',
		'outside-availability': 'Velg bare dager du kan trene.',
		stale: 'Planen endret seg mens du så på den. Se hva som endres igjen.',
		'no-plan': 'Fant ikke planen.',
		'no-pattern': 'Planen har ikke noe ukemønster ennå.',
		'no-unit': 'Fant ikke idretten i planen lenger.',
		'bad-restore': 'Kunne ikke sette dagene tilbake.',
	},
} as const

/**
 * What Meg says when the athlete takes a day out of their Training
 * Availability that a track had as its own (#598, spec #588 story 19).
 */
export const MEG_DROPPED_DAYS_LABELS = {
	/** One line per track: `Sykling mister søndag og ligger nå onsdag.` */
	line: (
		name: string,
		lost: readonly number[],
		kept: readonly number[] | null,
		activity: boolean,
	) => {
		const lostDays = nbJoin(lost.map((day) => NB_WEEKDAY_LABELS[day % 7]!))
		if (kept) {
			return `${name} mister ${lostDays} og ligger nå ${nbJoin(kept.map((day) => NB_WEEKDAY_LABELS[day % 7]!))}.`
		}
		return activity
			? `${name} ligger fortsatt ${lostDays}. Velg en ny dag under Plan → Avansert.`
			: `${name} mister ${lostDays}, og appen velger dagene igjen.`
	},
	heading: 'Treningsdagene dine endret planen',
} as const

/**
 * Meg's Form section: the Training Load triad and how far it can be trusted
 * (ADR 0008/0010). It came from the home hero's Form pane when the hero went
 * (#505). Every "ikke målt" here is said with its reason (story 71).
 */
export const ME_FORM_LABELS = {
	title: 'Form',
	notMeasured: 'ikke målt',
	noLoad:
		'Ikke målt ennå: ingen treningsbelastning er regnet ut. Den kommer når du har logget økter.',
	formColdStart: (day: number, required: number) =>
		`Formen er ikke målt ennå: den trenger ${required} dager med belastning, og du har ${day}. Kondisjon og tretthet kan leses fra første dag.`,
	baseline: 'Bygger grunnlag',
	baselineValue: (day: number, required: number) => `dag ${day} av ${required}`,
	trusted: (days: number) => `Bygger på ${days} dager med belastning`,
	asOf: (date: string) => `regnet ut ${date}`,
	fitnessTrend: (from: string, to: string, since: string) =>
		`Kondisjon ${from} → ${to} siden ${since}`,
} as const

/**
 * Meg's Rekorder section: Personal Records (ADR 0021), moved from the home
 * hero's Records pane (#505). Records only come from trusted, recorded efforts,
 * so the empty state says what will fill it rather than showing a zero.
 */
export const ME_RECORD_LABELS = {
	title: 'Rekorder',
	source: 'Fra økter med registrerte data fra klokke eller import',
	none: 'Ingen personlige rekorder ennå. De kommer når du har logget økter med registrerte data.',
	longest: (noun: string) => `Lengste ${noun}`,
	overBest: (delta: string) => `${delta} over forrige beste`,
	firstOnRecord: 'Første registrerte',
	setOn: (date: string) => `satt ${date}`,
} as const

/** An Account Connection's state, as Meg reads it (`connection-hub-status.ts`). */
export const CONNECTION_HUB_STATUS_LABELS: Record<ConnectionHubStatus, string> =
	{
		disconnected: 'Ikke koblet til',
		connected: 'Koblet til',
		backfilling: 'Koblet til · henter historikken din',
		revoked: 'Må kobles til på nytt',
	}

// ---------------------------------------------------------------------------
// Token Sentence words (owner decision 8, round 2; ADR 0089)
// ---------------------------------------------------------------------------

/**
 * The **Token Sentence**'s own words in Norwegian, wherever it is drawn: the
 * echo under the writing line, a session's row, the Workout Detail View and
 * its editor. They replace ADR 0027 A3's English glue (`rest`, `+ block`,
 * `repeat count`) on display only — nothing stored is a word from here: a rest
 * is a `RestSpec`, a zone is its stored label, and the writing line's grammar
 * (`p 90 s`, `pause`) is read in `workout-sentence.ts`, not here.
 */
export const TOKEN_SENTENCE_WORDS = {
	/** A rest with nothing more said, and the word after a rest's time. */
	rest: 'pause',
	/** `1 min 30 s pause`. */
	restFor: (duration: string) => `${duration} pause`,
	/** A recovery by distance: `200 m rolig`. */
	recoveryOver: (distance: string) => `${distance} rolig`,
	/** A recovery that ends at a heart rate: `til puls < 120 bpm`. */
	untilHeartRate: (bpm: number) => `til puls < ${bpm} bpm`,
	untilHeartRatePct: (pct: number) => `til puls < ${pct} % av maks`,
	/** A send-off: the set leaves on a clock, `på 1:40`, `på CSS + 10 s`. */
	sendOff: (clock: string) => `på ${clock}`,
	/** Metres of climb: `200 hm`. */
	vertical: (metres: number) => `${metres} hm`,
	/** The placeholders a step shows before its exercise or sets are chosen. */
	exercise: 'øvelse',
	sets: 'sett',
	/** A load with no number. */
	bodyweight: 'kroppsvekt',
	bodyweightPlus: (kg: string) => `kroppsvekt + ${kg} kg`,
	bodyweightMinus: (kg: string) => `kroppsvekt − ${kg} kg`,
	pctBodyweight: (pct: number) => `${pct}% kroppsvekt`,
	/** The absence beside a load that needs an anchor this athlete lacks. */
	noRepMax: (reps: number) => `ingen ${reps}RM registrert`,
	no1RM: 'ingen 1RM registrert',
	noBodyweight: 'ingen kroppsvekt registrert',
	notALoad: 'ingen belastning',
	/** The editor's last line: one more block. */
	addBlock: '+ blokk',
	addBlockAction: 'Legg til blokk',
} as const

/** A rest that is an act, not a clock (ADR 0007). */
export const REST_ACT_WORDS: Record<RestAct, string> = {
	jogBack: 'jogg tilbake',
	walkDown: 'gå ned',
	rideDown: 'sykle ned',
	swimDown: 'svøm rolig',
}

/**
 * The title over a token's popover in the editor — `ganger`, not `REPEAT
 * COUNT`. Keyed by the editor's own kinds of popover.
 */
export const TOKEN_EDITOR_TITLES = {
	duration: 'mengde',
	distance: 'mengde',
	repeat: 'ganger',
	rest: 'pause',
	restSeconds: 'pause',
	notes: 'notat',
	intensity: 'intensitet',
	sets: 'sett',
	discipline: 'idrett',
} as const

/**
 * A stored zone label read in Norwegian. The English words the archetype
 * seeds, the stamp's older rows and the Catalogue store (`easy`, `threshold`)
 * read as the words the athletes train in; a zone code (`Z2`, `I4`, `T`) and a
 * Norwegian word are already what the athlete reads, and pass through. The
 * stored label never changes.
 */
const ZONE_LABEL_WORDS: Record<string, string> = {
	recovery: 'restitusjon',
	easy: 'rolig',
	endurance: 'rolig',
	aerobic: 'rolig',
	steady: 'moderat',
	moderate: 'moderat',
	tempo: 'tempo',
	threshold: 'terskel',
	'sub-threshold': 'under terskel',
	subthreshold: 'under terskel',
	interval: 'intervall',
	intervals: 'intervall',
	vo2max: 'hardt',
	'vo2 max': 'hardt',
	'vo₂ max': 'hardt',
	hard: 'hardt',
	max: 'maks',
	maximal: 'maks',
	'warm-up': 'oppvarming',
	warmup: 'oppvarming',
	'cool-down': 'nedjogg',
	cooldown: 'nedjogg',
}

/** `Rolig` for a stored `easy`; `Z2` for `Z2`. Capitalised, as the chip draws it. */
export function zoneLabelWord(label: string): string {
	const trimmed = label.trim()
	const word = ZONE_LABEL_WORDS[trimmed.toLowerCase()] ?? trimmed
	return capitalize(word)
}
// Round 2 · first run, stamped titles, integrations and upload
// (branch claude/first-run-integrations). One block; other PRs add their own.
// ---------------------------------------------------------------------------

/** What a `StatusButton` says to a screen reader while it works, and when done. */
export const STATUS_BUTTON_LABELS = {
	pending: 'Arbeider',
	success: 'Ferdig',
} as const

/**
 * What a session the plan lays is called (`stampedSessionTitle`): its kind,
 * then the sport — `Rolig økt · Løping`, `Terskeløkt · Sykling`. The first
 * run's two-week preview reads the same words, so what it shows is what lands
 * on I dag. Stored as the new Workout's title (the athlete can rename it);
 * sessions laid before round 2 keep the duration title they were given.
 */
export const STAMPED_SESSION_LABELS = {
	easy: 'Rolig økt',
	long: 'Langtur',
	/** A long swim is not a _tur_. */
	longSwim: 'Lang økt',
	zone: {
		3: 'Tempoøkt',
		4: 'Terskeløkt',
		5: 'Intervalløkt',
	},
	/** The hard sessions of a week, as the first run's plan names them. */
	zoneShort: {
		3: 'tempo',
		4: 'terskel',
		5: 'intervaller',
	},
} as const

/**
 * The integrations page (`/settings/integrations`, #505 story 59, ADR 0081):
 * where the athlete's sessions come from. intervals.icu is the one source to
 * connect (#505: Strava is out of scope, so it is never offered; a Strava
 * connection made before keeps its card, to sync or disconnect).
 */
export const INTEGRATIONS_LABELS = {
	title: 'Integrasjoner',
	intro:
		'Her kommer øktene dine fra. En tilkoblet kilde importerer øktene av seg selv.',
	connected: 'Tilkoblet',
	available: 'Tilgjengelig',
	comingSoon: 'Kommer',
	badge: {
		revoked: 'Må kobles til på nytt',
		backfilling: 'Henter historikk',
		connected: 'Tilkoblet',
		comingSoon: 'Kommer',
	},
	/** `Sist synkronisert 23. mai kl. 17.00` — when the app last asked. */
	lastChecked: 'Sist synkronisert',
	syncNow: 'Synkroniser nå',
	syncing: 'Synkroniserer …',
	reconnect: 'Koble til på nytt',
	disconnect: 'Koble fra',
	keepConnected: 'Behold tilkoblingen',
	cancel: 'Avbryt',
	upload: 'Last opp økter',
	connectSoon: 'Kobling kommer snart',
	/** The confirm and the toast after it, for either provider. */
	disconnectTitle: (name: string) => `Koble fra ${name}?`,
	disconnectBody: (name: string) =>
		`Øktene du har importert fra ${name}, blir i treningshistorikken din. Å koble fra stopper bare nye fra å komme. Du kan koble til igjen når som helst.`,
	disconnectConfirm: (name: string) => `Koble fra ${name}`,
	disconnected: (name: string) => `Koblet fra ${name}`,
	disconnectedBody: 'Øktene du har importert, blir i treningshistorikken din.',
	// ADR 0096 §8: dedupe is strong, not certain, so the hub says both halves.
	dualSource:
		'Flere kilder er koblet til. En økt som kommer fra mer enn én av dem, lagres som én økt. Kjenner vi den ikke igjen, kan den likevel komme to ganger – da sletter du den du ikke vil beholde.',
	intervalsicu: {
		name: 'intervals.icu',
		revoked:
			'intervals.icu godtok ikke den lagrede nøkkelen. Lim inn en ny for å fortsette importen.',
		backfilling:
			'Henter treningshistorikken din fra intervals.icu … Det skjer i bakgrunnen.',
		daily:
			'Synkroniseres av seg selv én gang i døgnet. Trykk Synkroniser nå for det nyeste.',
		connect: 'Koble til intervals.icu',
		keyHelp:
			'Kopier den personlige API-nøkkelen din fra intervals.icu under Settings → Developer Settings, og lim den inn her. Lager du en ny nøkkel der, slutter de gamle å virke.',
		keyLabel: 'API-nøkkel',
		submit: 'Koble til',
		submitting: 'Kobler til …',
	},
	strava: {
		name: 'Strava',
		revoked:
			'Strava trakk tilbake tilkoblingen. Koble til på nytt for å fortsette importen.',
		backfilling:
			'Henter 42 dager med historikk fra Strava … Det skjer i bakgrunnen.',
		connected: 'Nye økter kommer av seg selv.',
	},
} as const

/** The provider directory's display words (`app/integrations/directory.ts`). */
export const PROVIDER_DIRECTORY_LABELS = {
	strava: {
		name: 'Strava',
		tagline: 'Øktene importeres av seg selv etter hver trening.',
	},
	'file-upload': {
		name: 'Filopplasting',
		tagline: 'FIT-, TCX- eller GPX-filer. Alltid tilgjengelig.',
	},
	// #546: no card promises a vendor's data through intervals.icu. Its Garmin
	// feed may close any day (its developer, 2026-10-09), and an activity's
	// terms follow the watch it was recorded on, not the bridge (ADR 0098). A
	// FIT file from the watch is the way in that does not depend on either.
	intervalsicu: {
		name: 'intervals.icu',
		tagline:
			'Gratis import med din personlige API-nøkkel: øktene som ligger i intervals.icu-kontoen din. Sjekkes daglig, og du kan synkronisere selv for det nyeste.',
	},
	garmin: {
		name: 'Garmin Connect',
		tagline:
			'Garmins API krever opptak i partnerprogrammet deres. Til da kan du laste opp FIT-filen fra klokka.',
	},
	suunto: {
		name: 'Suunto',
		tagline:
			'Suuntos API er også bare for partnere. Til da kan du laste opp FIT-filen fra klokka.',
	},
} as const

/**
 * What a connect or sync says in its toast, or at the key field. The refusals
 * mirror the first run's (`FIRST_RUN_LABELS.connect`).
 */
export const INTEGRATION_TOAST_LABELS = {
	emptyKey: 'Lim inn API-nøkkelen fra intervals.icu for å koble til.',
	keyRejected:
		'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke – kopier den som gjelder nå fra Settings → Developer Settings.',
	unreachable:
		'Vi fikk ikke kontakt med intervals.icu for å sjekke nøkkelen. Prøv igjen om litt.',
	connected: (name: string) => `Koblet til ${name}`,
	connectedBody: (name: string) => `${name}-kontoen din er nå koblet til.`,
	connectFailed: (name: string) => `Kunne ikke koble til ${name}`,
	syncFailed: 'Synkroniseringen feilet',
	synced: 'Synkronisert',
	syncedWith: (name: string) => `Synkronisert med ${name}`,
	nothingNew: 'Ingen nye økter å importere.',
	imported: (count: number) =>
		`${count} ${count === 1 ? 'ny økt' : 'nye økter'} importert.`,
	saved: (count: number) =>
		`${count} ${count === 1 ? 'ny økt' : 'nye økter'} lagt i treningsloggen.`,
	connectFirst: 'Koble til en kilde før du synkroniserer.',
	connectFirstNamed: (name: string) =>
		`Koble til ${name} før du synkroniserer.`,
	couldNotSync: (names: string) =>
		`Kunne ikke synkronisere ${names}. Se Integrasjoner.`,
	intervalsicuRevoked:
		'intervals.icu godtok ikke den lagrede nøkkelen. Lim inn en ny under Integrasjoner for å fortsette importen.',
	intervalsicuUnavailable:
		'Vi fikk ikke kontakt med intervals.icu, så ingenting ble importert. Prøv igjen om noen minutter.',
	stravaRevoked:
		'Strava trakk tilbake tilgangen. Koble til på nytt under Integrasjoner.',
	stravaAppInactive:
		'Strava har slått av appen (status: inactive). Det er på Stravas side – å koble til på nytt hjelper ikke.',
	stravaScope:
		'Trainm8 har ikke lov til å lese Strava-øktene dine. Koble til på nytt, og la avkrysningen for økttilgang stå på.',
	stravaUnavailable: 'Strava er ikke tilgjengelig',
	/** The Strava OAuth callback's refusals (a reconnect of an old link). */
	stravaDenied: 'Du sa nei til tilgangen hos Strava.',
	stravaState: 'Sikkerhetssjekken feilet. Prøv å koble til på nytt.',
	stravaNoCode: 'Strava sendte ingen godkjenningskode.',
	stravaNeedsScope:
		'Trainm8 trenger lov til å se øktene dine. Koble til på nytt, og la avkrysningen for økttilgang stå på.',
	stravaCouldNotConnect: 'Kunne ikke koble til Strava-kontoen din. Prøv igjen.',
	stravaNotConfigured: 'Strava er ikke satt opp på denne serveren.',
	/** "Strava og intervals.icu" */
	and: (names: readonly string[]) =>
		names.length > 1
			? `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`
			: (names[0] ?? ''),
} as const

/**
 * The upload page (`/imports/upload`) and the share sheet's receiver
 * (`/imports/share-target`), ADR 0049: every file is saved as it lands.
 */
export const UPLOAD_LABELS = {
	title: 'Last opp økter',
	intro:
		'Én fil eller mange – eller en hel ZIP, også Strava-eksporten din. Hver økt havner på sin dag i treningsloggen.',
	files: 'Aktivitetsfiler',
	filesHint: '.fit, .fit.gz, .tcx, .gpx, .zip eller .gz',
	choose: 'Velg filer',
	chosen: (count: number, first: string) =>
		count === 1 ? first : `${count} filer valgt`,
	none: 'Ingen filer valgt',
	drop: 'Eller slipp filene her.',
	stravaExport: 'Slik ber du Strava om eksporten din',
	discipline: 'Idrett',
	disciplineHint: 'Bare for én fil. Ellers leser vi idretten fra fila.',
	autoDetect: 'Les fra fila',
	submit: 'Last opp',
	submitting: 'Laster opp …',
	noFile: 'Velg minst én fil.',
	tooLarge: 'Fila er for stor.',
	tooManyFiles: (max: number) => `Last opp høyst ${max} filer om gangen.`,
	duplicate: 'Denne økta er allerede importert.',
	/** `3 importert · 1 fantes fra før · 2 feilet` */
	summary: (imported: number, duplicates: number, failed: number) =>
		`${imported} importert · ${duplicates} fantes fra før · ${failed} feilet`,
	seeThem: 'Se dem i treningsloggen',
	/** The share sheet's answer, as a toast on I dag. */
	shareImported: (count: number) =>
		`${count} ${count === 1 ? 'økt' : 'økter'} importert`,
	shareNothing: 'Ingen økter ble importert',
	shareDuplicates: (count: number) => `${count} fantes fra før.`,
	shareFailed: (count: number, reasons: string) =>
		`${count} ${count === 1 ? 'fil' : 'filer'} kunne ikke leses: ${reasons}`,
} as const

/**
 * A file the ingest could not read, said in Norwegian. The parsers throw
 * English (`Not a valid GPX file`) that other code matches on, so the words
 * are mapped where they are shown; anything unknown reads as the fallback.
 */
const UPLOAD_FAILURE_LABELS: Record<string, string> = {
	'Not a valid FIT file': 'Ikke en gyldig FIT-fil',
	'FIT file is corrupt (failed integrity check)': 'FIT-fila er skadet',
	'FIT file contains no activity session': 'FIT-fila har ingen økt',
	'FIT session has no start time':
		'Økta i FIT-fila har ikke noe starttidspunkt',
	'FIT session has no duration': 'Økta i FIT-fila har ingen varighet',
	'Not a valid GPX file': 'Ikke en gyldig GPX-fil',
	'GPX file contains no track points': 'GPX-fila har ingen sporpunkter',
	'Not a valid TCX file (no activity found)':
		'Ikke en gyldig TCX-fil (fant ingen økt)',
	'TCX activity has no start time':
		'Økta i TCX-fila har ikke noe starttidspunkt',
	'TCX activity has no duration': 'Økta i TCX-fila har ingen varighet',
	'Unsupported file type. Accepted: .fit, .fit.gz, .tcx, .gpx, .zip, .gz.':
		'Filtypen støttes ikke. Bruk .fit, .fit.gz, .tcx, .gpx, .zip eller .gz.',
	'Could not read the archive.': 'Kunne ikke lese ZIP-fila.',
	'The file is too large.': 'Fila er for stor.',
	'The archive is too large.': 'ZIP-fila er for stor.',
}

export function uploadFailureLabel(reason: string): string {
	return UPLOAD_FAILURE_LABELS[reason] ?? 'Fila kunne ikke leses.'
}

// ---------------------------------------------------------------------------
// Meg's sub-pages (round 2): profile, sign-in and security, training settings
// ---------------------------------------------------------------------------

/**
 * The pages behind Meg (spec #505 story 59, ADR 0081): the profile and its
 * sign-in and security pages, and "Trening og terskler" with its readings, gym
 * and lift numbers. One section so a page's every word is found in one place;
 * each export is named for the page it serves. The integrations and upload
 * pages are not here (they belong to the first-run/integrations work).
 *
 * Plurals are spelt per count (`1 annen økt`, `2 andre økter`), and every
 * figure arrives already formatted the Norwegian way (decimal comma) from the
 * page, so these functions only place words around it.
 */

/** Page titles (the page header and `<title>`), so the two never disagree. */
export const MEG_PAGE_TITLES = {
	profile: 'Profil',
	photo: 'Profilbilde',
	changeEmail: 'Bytt e-post',
	password: 'Passord',
	createPassword: 'Lag et passord',
	twoFactor: 'Totrinnsbekreftelse',
	twoFactorVerify: 'Slå på totrinnsbekreftelse',
	twoFactorDisable: 'Slå av totrinnsbekreftelse',
	connections: 'Innloggingskoblinger',
	passkeys: 'Passnøkler',
	training: 'Trening og terskler',
	analyze: 'Det historikken din sier',
	history: 'Terskelhistorikk',
	gym: 'Treningsstudioet ditt',
	lift: 'Tallene dine for løftet',
	propose: 'Det settene dine sier',
} as const

/** Words every Meg page shares. */
export const MEG_COMMON_LABELS = {
	cancel: 'Avbryt',
	save: 'Lagre',
	areYouSure: 'Er du sikker? Trykk igjen',
	unavailable: 'Ikke tilgjengelig',
	notGraded: 'ikke vurdert',
	unknownAction: 'Ukjent handling.',
	noProfile:
		'Utøverprofilen din mangler, så det er ingenting å knytte dette til.',
	liftGone: 'Det løftet finnes ikke lenger.',
} as const

/** The profile page (`/settings/profile`). */
export const MEG_PROFILE_LABELS = {
	changePhoto: 'Bytt profilbilde',
	account: 'Konto',
	username: 'Brukernavn',
	name: 'Navn',
	saveAccount: 'Lagre kontoen',
	usernameTaken: 'Det brukernavnet er tatt.',
	athlete: 'Utøverprofil',
	timezone: 'Tidssone',
	weekStartsOn: 'Uka starter',
	units: 'Enheter',
	birthdate: 'Fødselsdato',
	weightKg: 'Vekt (kg)',
	trainableDays: 'Dager du kan trene',
	defaultTrainingTime: 'Vanlig treningstid',
	weeklyCapacity: 'Timer i uka du har til trening',
	capacityAuthored:
		'Ditt tall, lagret. Ingenting leser treningen din på nytt for å endre det: historikken sier hva du gjorde, dette sier hva du har plass til.',
	capacityNoHistory:
		'Ingenting i treningen din den siste tiden å lese dette fra, så her spør vi: hvor mange timer i uka har du?',
	/** `avg` and `total` arrive formatted (`4,5`, `18`). */
	capacityDerived: (
		windowWeeks: number,
		weeksTrained: number,
		avg: string,
		total: string,
	) =>
		`De siste ${windowWeeks} ukene trente du i snitt ${avg} t utholdenhet i uka (${total} t totalt)${
			weeksTrained === windowWeeks
				? ''
				: `, i ${weeksTrained} av ${windowWeeks} uker`
		}.`,
	capacityChange: ' Endre det hvis det ikke stemmer med uka di.',
	saveAthlete: 'Lagre utøverprofilen',
	saved: 'Lagret.',
	security: 'Innlogging og sikkerhet',
	email: 'E-post',
	password: 'Passord',
	passwordSet: 'Bytt passordet ditt',
	passwordMissing: 'Du har ikke passord ennå. Lag et.',
	twoFactor: 'Totrinnsbekreftelse',
	twoFactorOn: 'På',
	twoFactorOff: 'Av',
	passkeys: 'Passnøkler',
	passkeysDetail: 'Logg inn med fingeravtrykk, ansikt eller sikkerhetsnøkkel',
	connections: 'Innloggingskoblinger',
	connectionsDetail: 'Logg inn med GitHub',
	training: 'Trening',
	trainingSettings: 'Trening og terskler',
	trainingSettingsDetail: 'Terskler, soner, treningsstudio og løft',
	integrations: 'Koblinger og aktivitetskilder',
	integrationsDetail: 'intervals.icu og filopplasting',
	data: 'Dataene dine',
	download: 'Last ned dataene dine',
	downloadDetail: 'Alt vi har lagret om deg, som én JSON-fil',
	otherSessions: (count: number) =>
		count === 1 ? 'Logg ut av 1 annen økt' : `Logg ut av ${count} andre økter`,
	onlySession: 'Dette er den eneste innloggingen din.',
	signedOut: 'Logget ut av de andre øktene.',
	logout: 'Logg ut',
	deleteData: 'Slett alle dataene dine',
	deleteDataDetail:
		'Kontoen, treningen og alt annet slettes for godt. Det kan ikke angres.',
	deletedTitle: 'Dataene er slettet',
	deletedBody: 'Alle dataene dine er slettet.',
} as const

/**
 * Weekday names for the profile's pickers, indexed 0 = søndag … 6 = lørdag
 * (the profile's own numbering, ADR 0005). Capitalised: they stand alone on a
 * button or in a menu, not mid-sentence.
 */
export const MEG_WEEKDAY_LABELS = [
	'Søndag',
	'Mandag',
	'Tirsdag',
	'Onsdag',
	'Torsdag',
	'Fredag',
	'Lørdag',
] as const

/** The trainable-day chips, same indexing, three letters. */
export const MEG_WEEKDAY_SHORT_LABELS = [
	'Søn',
	'Man',
	'Tir',
	'Ons',
	'Tor',
	'Fre',
	'Lør',
] as const

export const MEG_UNIT_LABELS = {
	metric: 'Metrisk (km, kg)',
	imperial: 'Britisk (mi, lb)',
} as const satisfies Record<'metric' | 'imperial', string>

/** Profile photo. */
export const MEG_PHOTO_LABELS = {
	choose: 'Velg bilde',
	save: 'Lagre bildet',
	reset: 'Angre',
	delete: 'Fjern bildet',
	required: 'Velg et bilde først.',
	tooLarge: 'Bildet må være mindre enn 3 MB.',
} as const

/** Change e-mail, and the two e-mails it sends. */
export const MEG_EMAIL_LABELS = {
	intro:
		'Du får en e-post med en kode på den nye adressen. Bytte skjer først når du har skrevet inn koden.',
	notice: (oldEmail: string) =>
		`Vi sender også et varsel til den gamle adressen, ${oldEmail}.`,
	newEmail: 'Ny e-postadresse',
	send: 'Send kode',
	inUse: 'Den e-postadressen er allerede i bruk.',
	sameDevice: 'Skriv inn koden på samme enhet som du ba om byttet fra.',
	changedTitle: 'E-posten er byttet',
	changedBody: (email: string) => `E-postadressen din er nå ${email}.`,
	codeSubject: 'Trainm8: kode for å bytte e-post',
	codeHeading: 'Bytte av e-post i Trainm8',
	codeLine: 'Her er koden din:',
	codeLink: 'Eller trykk på lenken:',
	noticeSubject: 'Trainm8: e-postadressen din er byttet',
	noticeHeading: 'E-postadressen din i Trainm8 er byttet',
	noticeBody:
		'Vi skriver for å si fra at e-postadressen på kontoen din i Trainm8 er byttet.',
	noticeIgnore:
		'Hvis det var deg, kan du se bort fra denne e-posten. Hvis det ikke var deg, ta kontakt med oss med en gang.',
	noticeAccount: (userId: string) => `Konto-ID: ${userId}`,
} as const

/** Change or create a password. */
export const MEG_PASSWORD_LABELS = {
	current: 'Nåværende passord',
	next: 'Nytt passord',
	confirm: 'Gjenta det nye passordet',
	change: 'Bytt passord',
	create: 'Lag passord',
	createIntro:
		'Du logger inn med en kobling i dag. Med et passord kan du også logge inn med brukernavn.',
	incorrect: 'Feil passord.',
	tooCommon: 'Det passordet er for vanlig. Velg et annet.',
	mustMatch: 'Passordene må være like.',
	changedTitle: 'Passordet er byttet',
	changedBody: 'Du bruker det nye passordet neste gang du logger inn.',
} as const

/** Two-factor authentication: status, set-up and turning it off. */
export const MEG_TWO_FACTOR_LABELS = {
	on: 'Totrinnsbekreftelse er på.',
	off: 'Totrinnsbekreftelse er av.',
	explain:
		'Med totrinnsbekreftelse skriver du også inn en kode fra en autentiseringsapp, for eksempel 1Password, når du logger inn eller gjør noe viktig.',
	enable: 'Slå på totrinnsbekreftelse',
	disable: 'Slå av totrinnsbekreftelse',
	disableWarning:
		'Vi anbefaler ikke å slå den av: da holder passordet alene for å komme inn på kontoen din.',
	disabledTitle: 'Totrinnsbekreftelse er av',
	disabledBody: 'Du logger inn med passord alene fra nå av.',
	scan: 'Skann QR-koden med autentiseringsappen din.',
	qrAlt: 'QR-kode for autentiseringsappen',
	manual:
		'Får du ikke skannet koden? Legg til kontoen i appen med denne adressen:',
	uriLabel: 'Engangspassord-URI',
	enterCode:
		'Skriv inn koden appen viser. Når totrinnsbekreftelse er på, trenger du en kode fra appen hver gang du logger inn. Mister du appen, mister du tilgangen til kontoen.',
	code: 'Kode',
	verify: 'Bekreft',
	invalidCode: 'Koden stemmer ikke. Prøv den nyeste koden fra appen.',
	codeLength: 'Koden har seks tegn.',
	enabledTitle: 'Totrinnsbekreftelse er på',
	enabledBody: 'Du trenger en kode fra appen neste gang du logger inn.',
} as const

/** Sign-in connections (GitHub). The activity sources live on integrations. */
export const MEG_CONNECTIONS_LABELS = {
	intro:
		'Kontoer du kan logge inn med. Klokker og treningsapper kobler du til under ',
	integrationsLink: 'koblinger og aktivitetskilder',
	none: 'Du har ingen innloggingskoblinger ennå.',
	connectedOn: (date: string) => `koblet til ${date}`,
	connect: (provider: string) => `Koble til ${provider}`,
	disconnect: (name: string) => `Koble fra ${name}`,
	lastOne:
		'Du kan ikke fjerne den siste koblingen før du har laget et passord.',
	deletedTitle: 'Koblet fra',
	deletedBody: 'Koblingen er fjernet.',
} as const

/** Passkeys. */
export const MEG_PASSKEY_LABELS = {
	intro:
		'En passnøkkel lar deg logge inn uten passord, med fingeravtrykk, ansikt eller en sikkerhetsnøkkel.',
	register: 'Legg til en passnøkkel',
	none: 'Ingen passnøkler ennå.',
	failed: 'Kunne ikke lage passnøkkelen. Prøv igjen.',
	device: 'Denne enheten',
	securityKey: 'Sikkerhetsnøkkel',
	registered: (date: string) => `Lagt til ${date}`,
	delete: 'Fjern',
	listName: 'Passnøkler',
} as const

/** "Trening og terskler" (`/settings/training`). */
export const MEG_TRAINING_LABELS = {
	intro: 'Tersklene dine per idrett. Belastning og soner regnes ut fra dem.',
	recipeIntro:
		'Hver idrett starter på en soneoppskrift vi valgte. Den bestemmer bare hvilken skala tallene dine leses på. En terskel er et tall om deg, så den fyller vi aldri inn selv: uten den står målene som sonenavn, ikke som et tall ingen har målt.',
	readHistory: 'Les tersklene fra historikken min',
	readHistoryDetail: 'Forslag fra øktene du har importert',
	history: 'Terskelhistorikk',
	historyDetail: 'Hver endring, nyeste først',
	gym: 'Treningsstudioet ditt',
	gymDetail: 'Stenger, skiver og manualer',
	maxHr: 'Makspuls (slag/min)',
	lthr: 'Terskelpuls (slag/min)',
	ftp: 'FTP (W)',
	runPower: 'Kritisk løpswatt (W)',
	thresholdPace: 'Terskelfart (mm:ss per km)',
	css: 'CSS (mm:ss per 100 m)',
	save: (discipline: string) => `Lagre ${discipline.toLowerCase()}`,
	saved: 'Lagret.',
	recipe: 'Soneoppskrift',
	recipeDefault: 'Valgt for deg',
	recipeChosen: 'Ditt valg',
	recipeDefaultLine: (discipline: string) =>
		`Vi valgte denne for ${discipline.toLowerCase()} fordi du ikke har valgt en sonemodell. Den bestemmer skalaen tallene dine leses på, og finner ikke på noen av dem.`,
	recipeChosenLine: 'Du valgte denne.',
	anchorSet: (anchor: string, reading: string) =>
		`Leses mot ${anchor}, ${reading}. Bytter du oppskrift, leses alle øktene du har logget på nytt, ikke bare de som kommer.`,
	anchorMissing: (anchor: string) =>
		`Leses mot ${anchor}, som du ikke har lagt inn. Derfor står målene i denne idretten som sonenavn, ikke som et tall ingen har målt.`,
	paceFormat: (example: string) =>
		`Skriv farten som mm:ss, for eksempel ${example}.`,
	paceRange: (min: string, max: string, unit: string) =>
		`Farten må være mellom ${min} og ${max} ${unit}.`,
	recipeWrongDiscipline: (discipline: string) =>
		`Den soneoppskriften hører ikke til ${discipline.toLowerCase()}.`,
} as const

/** Display names for the built-in Zone Recipes, keyed by recipe id. */
export const MEG_ZONE_RECIPE_LABELS: Record<string, string> = {
	'coggan-power-7': 'Coggan watt, 7 soner',
	'friel-hr-5-bike': 'Friel puls, 5 soner',
	'friel-hr-5-run': 'Friel puls, 5 soner',
	'daniels-pace-5': 'Daniels fart, 5 soner',
	'norwegian-threshold-run': 'Norsk terskelfart, 6 soner',
	'stryd-run-power-5': 'Stryd løpswatt, 5 soner',
	'css-3': 'CSS, 3 soner',
	'css-5': 'CSS, 5 soner',
	'olt-hr-5-run': 'Olympiatoppen puls, 5 soner',
	'olt-hr-5-bike': 'Olympiatoppen puls, 5 soner',
}

/** The threshold a recipe is read against, mid-sentence ("leses mot …"). */
export const MEG_ZONE_ANCHOR_LABELS: Record<ZoneAnchor, string> = {
	ftp: 'FTP-en din',
	runPower: 'løpswatten din',
	lthr: 'terskelpulsen din',
	maxHr: 'makspulsen din',
	thresholdPace: 'terskelfarten din',
	css: 'CSS-en din',
	rpe: 'opplevd anstrengelse',
}

/** Units as the training pages print them. */
export const MEG_UNIT_SUFFIX = {
	bpm: 'slag/min',
	watt: 'W',
	perKm: '/km',
	per100m: '/100 m',
	kg: 'kg',
} as const

/** "Det historikken din sier" (`/settings/training/analyze`). */
export const MEG_ANALYZE_LABELS = {
	intro: (count: number, days: number) =>
		`Lest fra ${count} ${count === 1 ? 'aktivitet' : 'aktiviteter'} de siste ${days} dagene. Ingenting lagres før du godtar det.`,
	unknown: 'Ukjent forslag.',
	gone: 'Det forslaget finnes ikke lenger.',
	noActivities:
		'Ingen importerte aktiviteter ennå, så det er ingenting å lese.',
	connect: 'Koble til en konto',
	saved: (value: string) => `Du har ${value} lagret.`,
	how: 'Slik kom vi fram til det',
	use: 'Bruk dette',
	replace: 'Erstatt det jeg har',
	accepted: 'Lagret som ditt tall.',
	footer: 'Tall du godtar, kan du endre etterpå under ',
	footerLink: 'Trening og terskler',
	footerEnd: '. De endrer seg aldri av seg selv.',
	readFrom: 'Lest fra',
	readFromDetail: (used: number, total: number) =>
		`${used} av ${total} aktiviteter`,
	effortsUsed: 'Innsatser brukt',
	tooCoarse: 'For grovt lagret',
	tooCoarseDetail: (durations: string) =>
		`${durations}. Aktivitetene dine er lagret med lav oppløsning, så korte innsatser blir jevnet ut i stedet for målt.`,
	fit: 'Tilpasning',
	companionDetail: (value: string) =>
		`${value}. Lest med, men ikke foreslått: de korte innsatsene den bygger på, ble avvist over.`,
	note: 'Merk',
	tanakaNote:
		'En aldersformel beskriver en befolkning, ikke deg. Den får lav sikkerhet uansett hvor mye du trener, og en målt makspuls slår den alltid.',
	seconds: (s: number) => `${s} s`,
	minutes: (m: number) => `${m} min`,
} as const

export const MEG_CONSTRUCT_LABELS: Record<ThresholdConstruct, string> = {
	maxHr: 'Makspuls',
	lthr: 'Terskelpuls',
	ftp: 'FTP',
	cp: 'Kritisk watt',
	thresholdPace: 'Terskelfart',
	criticalSpeed: 'Kritisk fart',
	css: 'Kritisk svømmefart',
	runPower: 'Løpswatt ved terskel',
}

/** The caveat that sits on the number, where the column says something else. */
export const MEG_CONSTRUCT_CAVEATS: Partial<
	Record<ThresholdConstruct, string>
> = {
	cp: 'En kritisk watt, vanligvis litt over FTP.',
	criticalSpeed: 'En kritisk fart, vanligvis litt raskere enn terskelfart.',
}

/** How a threshold got here (ADR 0005 as amended). */
export const MEG_THRESHOLD_PROTOCOL_LABELS: Record<ThresholdProtocol, string> =
	{
		manual: 'du skrev det inn',
		tt60: '60-minutterstest',
		ftp20: '20-minutterstest',
		ramp: 'rampetest',
		'cp-fit': 'tilpasset dine beste innsatser',
		'race-equivalence': 'fra et løpsresultat',
		observed: 'det høyeste du er registrert med',
		tanaka: 'anslått ut fra alderen din',
		provider: 'fra en tilkoblet konto',
	}

/** One sentence per refusal. Visible, never behind a disclosure. */
export const MEG_ESTIMATE_REFUSAL_LABELS: Record<EstimateRefusal, string> = {
	'no-birthdate': 'Legg inn fødselsdatoen din i profilen, så kan vi anslå den.',
	'no-data': 'Ingenting de siste 90 dagene hadde dataene som trengs.',
	resolution:
		'Aktivitetene dine er lagret med for lav oppløsning til å lese korte innsatser.',
	'insufficient-efforts':
		'For få harde innsatser av ulik lengde til å tilpasse en kurve.',
	'insufficient-spread':
		'De harde innsatsene dine er omtrent like lange, så en kurve ville vært gjetning.',
	'implausible-fit': 'Tilpasningen ble fysiologisk urimelig.',
	unbuilt: 'Dette kan vi ikke lese fra dataene dine ennå.',
}

/** A grade, said as a badge ("høy sikkerhet"). */
export const MEG_CONFIDENCE_LABELS: Record<EstimateConfidence, string> = {
	high: 'høy sikkerhet',
	medium: 'middels sikkerhet',
	low: 'lav sikkerhet',
}

/** Terskelhistorikk (`/settings/training/history`). */
export const MEG_HISTORY_LABELS = {
	intro: 'Hver endring av en terskel, nyeste først.',
	none: 'Ingen terskelendringer ennå.',
	observed: 'observert',
} as const

/** A threshold event's kind, as the history lists it. */
export const MEG_THRESHOLD_KIND_LABELS: Record<string, string> = {
	maxHr: 'Makspuls',
	lthr: 'Terskelpuls',
	ftp: 'FTP',
	runPower: 'Løpswatt',
	thresholdPace: 'Terskelfart',
	css: 'CSS',
	weight: 'Vekt',
}

/** The construct, only where it differs from the column it landed in. */
export const MEG_HISTORY_CONSTRUCT_LABELS: Record<string, string> = {
	cp: 'kritisk watt',
	criticalSpeed: 'kritisk fart',
}

/** Treningsstudioet ditt (`/settings/training/gym`). */
export const MEG_GYM_LABELS = {
	intro:
		'Det studioet ditt har, så vektfeltet kan si hva som skal på stanga. Antallet er par: to 20-skiver per side er 2.',
	name: 'Navn på studioet',
	defaultName: 'Studioet mitt',
	bars: 'Stenger, i kg',
	barsHint: 'Den første er stanga et løft regner med.',
	plates: 'Skiver, i kg',
	plateCounts: 'Par av hver',
	dumbbells: 'Faste manualer, i kg',
	dumbbellsHint:
		'La feltet stå tomt hvis du ikke vil si det. Et tomt felt er ikke et tomt stativ.',
	listHint:
		'Skill tallene med komma, og skriv desimaler med punktum: 2.5, 1.25.',
	save: 'Lagre studioet',
	invalid: 'Det ga ikke mening.',
	notNumbers: 'Hver vekt og hvert antall må være et tall.',
	countMismatch: 'Gi et antall for hver skive, eller la antallene stå tomme.',
	noProfile:
		'Utøverprofilen din mangler, så det er ikke noe studio å knytte dette til.',
	saved: 'Lagret. Hver vekt sier nå hva som skal på stanga.',
	exampleExact: (line: string) =>
		`100 kg på dette studioet er ${line} per side.`,
	exampleNearest: (kg: string, line: string) =>
		`Dette studioet kan ikke lage 100 kg. Nærmest er ${kg} kg, ${line} per side.`,
	emptyBar: 'tom stang',
} as const

/** Why the rack cannot make a load (`calculatePlates`' refusals). */
export const MEG_PLATE_REFUSAL_LABELS: Record<PlateRefusal, string> = {
	'stack-level-is-an-ordinal':
		'Et nivå i vektstabelen har ingen kilo. Det går fram mot seg selv.',
	'band-is-a-force-curve':
		'En strikk har ingen kilo. Kraften endrer seg gjennom bevegelsen.',
	'unloaded-has-no-external-load': 'Denne øvelsen har ingen ytre belastning.',
	'no-bodyweight-on-file':
		'Ingen kroppsvekt er lagret, så denne belastningen har ingenting å regnes ut fra.',
	'assist-exceeds-bodyweight':
		'Det er mer hjelp enn kroppsvekten, og det kan ikke være en belastning.',
	'no-dumbbell-rack-stated':
		'Studioet har ikke sagt hvilke manualer det har, så det er ingen manual å velge.',
	'dumbbell-rack-is-empty': 'Manualstativet på studioet er oppgitt som tomt.',
}

/** Tallene dine for løftet (`/settings/training/lifts/:id`). */
export const MEG_LIFT_LABELS = {
	readsAgainst: (headline: string) =>
		`Prosenter og repmaks for dette løftet leses mot ${headline}.`,
	nothingOnFile:
		'Ingenting lagret ennå, så en prosentforskrift for dette løftet vises som skrevet og blir ikke til kilo.',
	addTitle: 'Skriv inn et tall selv',
	addFormName: (exercise: string) => `Legg inn et tall for ${exercise}`,
	construct: 'Hva det er',
	kg: 'kg',
	reps: 'ved reps',
	from: 'Fra',
	repMaxHint:
		'Den tyngste vekten du klarer akkurat så mange reps med. Den regnes aldri om fra et annet antall reps: en 8RM lest fra en 5RM ville vært et gjett på ±10 % gjort to ganger.',
	statedHint:
		'Et tall du skriver inn, lagres som ditt og blir ikke vurdert. Appen vurderer ikke et tall du har oppgitt om deg selv.',
	save: 'Lagre tallet',
	saved: 'Lagret. Forskriftene dine leses mot det fra nå av.',
	onFile: 'Det du har lagret',
	noAnchors: 'Ingen tall ennå.',
	readFromSet: 'Les et tall fra et sett du har logget',
	appendOnly:
		'Ingenting her blir overskrevet: et nyere tall blir en ny linje, og en eldre økt leses fortsatt mot tallet den ble skrevet med.',
	prescribed: 'Der løftet står i planen',
	notPrescribed: 'Ingen økt i planen din har dette løftet ennå.',
	noSets: 'ingen sett skrevet',
	from_: (date: string) => `fra ${date}`,
	sourceGone: (protocol: string) =>
		`${protocol}. Lest fra et sett som ikke finnes lenger, så utregningen kan ikke vises.`,
	superseded: 'erstattet',
	numberInvalid: 'Det tallet ga ikke mening.',
	weightInvalid: 'En vekt må være et positivt antall kilo.',
	repsInvalid: 'Antall reps må være et helt tall, 1 eller mer.',
	repMaxNeedsReps: 'En repmaks trenger antall reps den gjelder.',
	dateInvalid: 'Den datoen er ikke en dato.',
	duplicate: 'Du har allerede lagret et tall for løftet på det tidspunktet.',
	headlineOneRm: (kg: string) => `${kg} kg 1RM`,
	headlineEstimated: (kg: string) => `${kg} kg anslått 1RM`,
	headlineRepMax: (kg: string, reps: string) => `${kg} kg ${reps}RM`,
} as const

export const MEG_LIFT_CONSTRUCT_LABELS: Record<'oneRm' | 'repMax', string> = {
	oneRm: 'Maks på én rep (1RM)',
	repMax: 'Repmaks',
}

/** How a lift's number was arrived at. Equation names stay as published. */
export const MEG_ANCHOR_PROTOCOL_LABELS: Record<AnchorProtocol, string> = {
	tested: 'du testet det',
	epley: 'Epley/Welday',
	brzycki: 'Brzycki',
	mayhew: 'Mayhew',
	wathen: 'Wathen',
	lombardi: 'Lombardi',
	lander: 'Lander',
	adams: 'Adams',
	'rep-max-observed': 'du klarte akkurat så mange reps',
	'athlete-stated': 'du skrev det inn',
	provider: 'fra en tilkoblet konto',
}

/** Det settene dine sier (`/settings/training/lifts/:id/propose`). */
export const MEG_PROPOSE_LABELS = {
	intro:
		'Lest fra settene du allerede har logget for dette løftet. Ingenting lagres før du godtar det.',
	tested: 'Testet 1RM',
	estimated: 'Anslått 1RM',
	band: (low: string, high: string, sd: string) =>
		`Et sted mellom ${low} og ${high} kg, ±${sd} %. Det er likningens egen spredning blant dem den ble tilpasset.`,
	stale:
		'lest fra et gammelt sett. Merket, ikke justert, fordi ingen kan vite hvilken vei en utestet løfter har gått.',
	how: 'Slik kom vi fram til det',
	setsRead: 'Sett lest',
	setUsed: 'Sett brukt',
	setUsedDetail: (kg: string, reps: number, date: string, effort: string) =>
		`${kg} kg × ${reps} ${date}${effort}`,
	toFailure: ', til utmattelse',
	inReserve: (rir: number) => `, ${rir} i reserve`,
	equation: 'Likning',
	testedEquation:
		'vekten som ble løftet. En singel til utmattelse er selve målingen, så ingen likning brukes.',
	bias: 'Kjent skjevhet',
	biasDetail: (pct: string) =>
		`${pct} % i snitt. Oppgitt, ikke rettet for, fordi en befolkningsrettelse er en påstand om deg som ingen har målt.`,
	rirNote:
		'Reps i reserve blir i snitt oppgitt for lavt, og det trekker anslaget ned. Vist, aldri rettet.',
	note: 'Merk',
	use: 'Bruk dette',
	replace: 'Erstatt det jeg har',
	noThanks: 'Nei takk',
	footer: 'Tall du godtar, ser og erstatter du under ',
	footerLink: 'tallene for løftet',
	footerEnd: '. De endrer seg aldri av seg selv.',
	equationPicker: 'Likning',
	equationIntro:
		'Les med en annen likning. Ingen av dem er bedre enn de andre: de er ulike publiserte tilpasninger til ulike utvalg, og ± ved hver er dens egen spredning. Bytter du, leses settene på nytt, og ingenting lagres.',
	meanBias: (pct: string) => `, gjennomsnittlig skjevhet ${pct} %`,
	applied: ', brukes nå',
	invalid: 'Det forslaget ga ikke mening.',
	refused: 'Det er ikke noe forslag å godta lenger.',
	staleError:
		'Settene dine er endret siden dette ble lest. Last siden på nytt og se igjen.',
	duplicate: 'Du lagret det tallet for et øyeblikk siden.',
	saved: (kg: string) =>
		`Lagret som din 1RM på ${kg} kg. Den er din nå, og ingenting leser historikken din på nytt for å flytte den.`,
} as const

/** Why no 1RM can be read off the sets (`oneRmRefusal`). */
export const MEG_ONE_RM_REFUSAL_LABELS: Record<
	OneRmRefusal,
	(maxReps: number) => string
> = {
	'no-sets-logged': () =>
		'Ingen lesbare arbeidssett for dette løftet, så det er ingenting å anslå fra. Logg et arbeidssett med oppgitt vekt og et talt antall reps.',
	'sets-not-readable': () =>
		'Settene dine på dette løftet oppgir en varighet, eller en vekt uten ærlige kilo, så ingen av dem er en vekt løftet et talt antall ganger. Arbeidet er gjort, men det kan ikke leses som en 1RM. Logg et sett med reps på en oppgitt vekt.',
	'reps-out-of-range': (maxReps) =>
		`Det beste settet ditt her har over ${maxReps} reps, der disse likningene slutter å være anslag. Logg et sett på ${maxReps} reps eller færre.`,
	'effort-unknown': () =>
		'Ingen av settene sier hvor nær utmattelse de var, og i løfting kan ikke tallene fortelle det. Merk et sett som til utmattelse, eller skriv reps i reserve.',
	'exercise-unmapped': () =>
		'Denne øvelsen har ingen validert sammenheng mellom reps og vekt, så et anslag ville lånt et annet løfts kurve. Legg inn en repmaks i stedet.',
	'load-not-on-the-bar': () =>
		'Settene her er ikke logget som vekt på stanga: de tar med kroppsvekt, trekker fra hjelp, teller én hånd eller er ikke en vekt. En 1RM er en stangvekt, så ingen av dem kan leses som en. Logg et sett som ytre belastning, eller legg inn en repmaks.',
	'load-kind-unstated': () =>
		'Ingenting på settene sier hva slags belastning som ble løftet, så stangvekt og kroppsvekt kan ikke skilles. Logg et sett med belastningstypen, så kan dette anslås.',
}

/** Said in place when the equation was not fitted to this movement. */
export const MEG_REP_LOAD_BASIS_LABELS: Record<RepLoadBasis, string | null> = {
	fitted: null,
	unmapped: null,
	'measured-biased':
		'Disse likningene er testet på markløft, og alle undervurderte det (LeSuer 1997), så tallet er trolig for lavt. Skjevheten er oppgitt, ikke rettet for, og sikkerheten er satt ett trinn ned.',
	transferred:
		'Ingen likning er tilpasset denne øvelsen. Denne låner kurven fra benkpress og knebøy den ble laget på (Nuzzo 2024 har tabeller bare for benkpress og beinpress). Den brukes på det svakere grunnlaget, sagt rett ut, med sikkerheten ett trinn ned.',
}

/** The equations as a reader can check them, Norwegian words and commas. */
export const MEG_ESTIMATOR_EQUATION_LABELS: Record<EstimatorName, string> = {
	epley: 'vekt × (1 + reps / 30)',
	brzycki: 'vekt / (1,0278 − 0,0278 × reps)',
	lander: 'vekt / (1,013 − 0,0267123 × reps)',
	adams: 'vekt / (1 − 0,02 × reps)',
	mayhew: 'vekt / (0,522 + 0,419 × e^(−0,055 × reps))',
	wathen: 'vekt / (0,488 + 0,538 × e^(−0,075 × reps))',
	lombardi: 'reps^0,10 × vekt',
}

/**
 * The shared validation messages (`user-validation.ts`, Zod's defaults), said
 * in Norwegian at the field on Meg's pages. Keyed by the English message the
 * shared schema produces, because the auth pages still read that English: the
 * rule stays in one place, and only the words differ.
 */
export const MEG_VALIDATION_LABELS: Record<string, string> = {
	'Username is required': 'Skriv et brukernavn.',
	'Username is too short': 'Brukernavnet er for kort (minst 3 tegn).',
	'Username is too long': 'Brukernavnet er for langt (høyst 20 tegn).',
	'Username can only include letters, numbers, and underscores':
		'Brukernavnet kan bare ha bokstaver, tall og understrek.',
	'Password is required': 'Skriv et passord.',
	'Password is too short': 'Passordet er for kort (minst 6 tegn).',
	'Password is too long': 'Passordet er for langt.',
	'Name is required': 'Skriv et navn.',
	'Name is too short': 'Navnet er for kort (minst 3 tegn).',
	'Name is too long': 'Navnet er for langt (høyst 40 tegn).',
	'Email is required': 'Skriv en e-postadresse.',
	'Email is invalid': 'Det ser ikke ut som en e-postadresse.',
	'Email is too short': 'E-postadressen er for kort.',
	'Email is too long': 'E-postadressen er for lang.',
	'The passwords must match': 'Passordene må være like.',
	'Use a 24-hour HH:MM time': 'Skriv klokkeslettet som TT:MM.',
	'Unknown zone recipe': 'Ukjent soneoppskrift.',
}

/** Zod's own default messages, by issue kind, for the fields Meg checks. */
export const MEG_ZOD_ISSUE_LABELS = {
	required: 'Fyll inn feltet.',
	notANumber: 'Skriv et tall.',
	notAWholeNumber: 'Skriv et helt tall.',
	tooSmall: (min: string) => `Tallet må være minst ${min}.`,
	mustBePositive: 'Tallet må være større enn 0.',
	tooBig: (max: string) => `Tallet kan være høyst ${max}.`,
	tooShort: (min: string) => `Minst ${min} tegn.`,
	tooLong: (max: string) => `Høyst ${max} tegn.`,
	invalidDate: 'Skriv en gyldig dato.',
	invalid: 'Sjekk feltet.',
} as const

// ---------------------------------------------------------------------------

/** The first character lower-cased, so a name stays its own mid-sentence. */
function lowerFirst(value: string): string {
	return value ? value[0]!.toLowerCase() + value.slice(1) : value
}

/** Capitalize the first character; the fallback for open-ended enum sets. */
function capitalize(value: string): string {
	return value ? value[0]!.toUpperCase() + value.slice(1) : value
}

// ===========================================================================
// Cross-cutting polish (#505 round 2): the Week Replan's and the Session
// Nudge's own sentences, in Norwegian at their source (ADR 0081). One section
// of its own so the area PRs that also add to this file merge cleanly.
// ===========================================================================

/**
 * ADR 0025's applied softening — the `adjusted` decision's per-session Replan
 * Note and its week-level reason. Past tense, because an `adjusted` row is one
 * the applier already rescaled. `over` and `cut` as `25 %`, `tsb` as `−12`.
 */
export const WEEK_REPLAN_SOFTENED_LABELS = {
	session: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen var ${tsb}. Denne økta ble gjort ca. ${cut} kortere.`,
	week: (over: string, tsb: string, cut: string) =>
		`${overClause(over)}, og formen var ${tsb}. Resten av ukas økter ble gjort ca. ${cut} kortere.`,
} as const

/**
 * The Session Nudge's reason (`decideSessionNudge`), one sentence per branch.
 * `weekday` is `tirsdag` (`formatNbWeekday`), `discipline` an id (`run`).
 */
export const SESSION_NUDGE_LABELS = {
	/** Why the coach backs off: sustained over-plan, or low Form. */
	overPlan: (weeks: number) => `Over planen ${weeks} uker på rad`,
	formLow: (tsb: string | null) =>
		tsb == null ? 'Formen er lav' : `Formen er lav (TSB ${tsb})`,
	/** Why the next session stands: sustained under-plan, or Form fine. */
	underPlan: (weeks: number) => `Under planen ${weeks} uker på rad`,
	formReads: (tone: 'fresh' | 'neutral', tsb: string | null) =>
		tsb == null
			? `Formen er ${NB_READINESS_LABELS[tone]}`
			: `Formen er ${NB_READINESS_LABELS[tone]} (TSB ${tsb})`,
	missed: (weekday: string) => `Økta ${weekday} ble ikke gjort`,
	/** What the eased session became; `minutes` null when its length is unknown. */
	easedTo: (minutes: number | null, cap: number) =>
		minutes == null
			? 'en rolig økt i sone 2'
			: minutes >= cap
				? 'en rolig time i sone 2'
				: `en rolig økt på ${minutes} min i sone 2`,
	eased: (signal: string, weekday: string, to: string) =>
		`${signal} – økta ${weekday} er gjort om til ${to}.`,
	easedAfterMiss: (signal: string, weekday: string, to: string) =>
		`${signal} – økta ${weekday} er gjort om til ${to}, så du ikke legger harde dager tett etter et opphold.`,
	easing: (signal: string) => `${signal} – neste økt blir gjort lettere.`,
	heldNoEase: (discipline: string) =>
		`Neste økt er ${nbDisciplineLabel(discipline).toLowerCase()}, og den kan ikke lettes etter formen ennå.`,
	heldAfterMissNoEase: (signal: string, discipline: string) =>
		`${signal} – neste økt er ${nbDisciplineLabel(discipline).toLowerCase()}, og den kan ikke lettes etter formen ennå.`,
	coldStart: (day: number, required: number) =>
		`Formtallet er til å stole på etter ${required} dager (dag ${day} av ${required}).`,
	stands: (signal: string) => `${signal} – neste økt står som planlagt.`,
} as const

/**
 * A stored Week Replan sentence, in Norwegian. Rows written before #505 round 2
 * hold `decideWeekReplan`'s English (the week's `WeekReplan.reason`, and ADR
 * 0025's per-session `replanReason`); this rewrites each of that composer's
 * eight known sentences — a closed set, from one file, with numbers in fixed
 * places — into the sentence the generator now writes. Anything else (every
 * row written since, all already Norwegian) passes through untouched, so it is
 * safe on any stored reason. Display only: nothing is written back.
 */
export function nbStoredReplanReason(stored: string): string {
	for (const [pattern, words] of LEGACY_REPLAN_REASONS) {
		const match = pattern.exec(stored)
		if (match) return words(match.slice(1))
	}
	return stored
}

/** The facts a sentence that names none of them is given. */
const NO_FACTS: WeekHoldFacts = {
	over: '',
	under: '',
	tsb: '',
	requiredDays: 0,
	daysOfHistory: 0,
}

/** `32%` → `32 %`: the English sentences wrote no space. */
const pct = (digits: string | undefined) => `${digits ?? ''} %`

const OVER = String.raw`Last week ran (\d+)% over plan`
const TSB = String.raw`([+−-]?\d+)`

const LEGACY_REPLAN_REASONS: ReadonlyArray<
	readonly [RegExp, (groups: Array<string | undefined>) => string]
> = [
	[
		/^Last week has no measurable Plan Adherence — no adjustment, not enough data\.$/,
		() => WEEK_HOLD_REASON_LABELS['no-adherence'](NO_FACTS),
	],
	[
		/^Last week ran (\d+)% under plan — bank the planned work; this week stands as planned\.$/,
		([under]) =>
			WEEK_HOLD_REASON_LABELS.under({ ...NO_FACTS, under: pct(under) }),
	],
	[
		/^Last week matched the plan — this week stands as planned\.$/,
		() => WEEK_HOLD_REASON_LABELS['on-target'](NO_FACTS),
	],
	[
		new RegExp(
			String.raw`^${OVER}, but your Form reading is reliable after (\d+) days — day (\d+)/\d+ — no adjustment yet\.$`,
		),
		([over, required, day]) =>
			WEEK_HOLD_REASON_LABELS['form-untrusted']({
				...NO_FACTS,
				over: pct(over),
				requiredDays: Number(required),
				daysOfHistory: Number(day),
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER}, but Form is unavailable — no adjustment without it\.$`,
		),
		([over]) =>
			WEEK_HOLD_REASON_LABELS['form-missing']({ ...NO_FACTS, over: pct(over) }),
	],
	[
		new RegExp(
			String.raw`^${OVER} but Form is ${TSB} — you're absorbing it, so this week stands as planned\.$`,
		),
		([over, tsb]) =>
			WEEK_HOLD_REASON_LABELS.fresh({
				...NO_FACTS,
				over: pct(over),
				tsb: tsb ?? '',
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER} and Form was ${TSB}, but nothing in the coming week can be softened — no change made\.$`,
		),
		([over, tsb]) =>
			WEEK_HOLD_REASON_LABELS['nothing-adjustable']({
				...NO_FACTS,
				over: pct(over),
				tsb: tsb ?? '',
			}),
	],
	[
		new RegExp(
			String.raw`^${OVER} and Form was ${TSB} — softened (this session|this week's remaining sessions) ~(\d+)%\.$`,
		),
		([over, tsb, subject, cut]) =>
			WEEK_REPLAN_SOFTENED_LABELS[
				subject === 'this session' ? 'session' : 'week'
			](pct(over), tsb ?? '', pct(cut)),
	],
]

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

/** `a`, `a og b`, `a, b og c`. */
function nbJoin(items: readonly string[]): string {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} og ${items.at(-1)}`
}

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
