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
import type {
	CatalogueGoalEvent,
	CatalogueLevel,
	CataloguePhase,
	CatalogueTier,
	SessionArchetype,
} from './catalogue.ts'
import type { EventKind, EventPriority, EventStatus } from './event-schema.ts'
import type { FirstRunPlanRefusal } from './first-run/first-run-schema.ts'
import type {
	FamilyChoice,
	FindingAbsence,
	HoursEstimate,
} from './first-run/first-run.ts'
import type {
	ImportLinkRefusal,
	MarkDoneRefusal,
} from './import-link-schema.ts'
// The domain owns *which* outcomes a stored Week Replan can carry (ADR 0080);
// this module owns the name each one goes by.
import type { AdherenceTone } from './load/adherence.ts'
import type { RoundVerdict } from './load/propose-next-round.ts'
import type { ReadinessTone } from './load/readiness.ts'
import type { WeekReplanOutcome } from './load/week-replan.ts'
// The domain owns *which* currencies accumulate across Disciplines (ADR 0043 §5);
// this module owns the sentence each accumulation is explained by.
import type { AccumulatingCurrency } from './plan-outline/commensurability.ts'
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
	AnnetReason,
	PaceAbsence,
	TargetAbsence,
	UnmeasuredReason,
	VolumeGrade,
	ZoneAbsence,
} from './plan-outline/week-volumes.ts'
// The domain owns *who* a session belongs to (ADR 0080); this module owns the
// words the athlete reads for each owner.
import type { SessionOwner } from './session-ownership.ts'
import type {
	LiftScheme,
	SetUnit,
	WorkingLoad,
} from './strength/working-load.ts'
import type { QuickLogRefusal } from './strength-quick-log.ts'
import type {
	Discipline,
	IntensityTarget,
	StepKind,
	WorkoutIntent,
} from './workout-schema.ts'
import type { SentenceProblem, UnreadReason } from './workout-sentence.ts'
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
 */
export const CATALOGUE_GOAL_EVENT_LABELS: Record<CatalogueGoalEvent, string> = {
	'1500m': '1500 m',
	'3k': '3 km',
	'5k': '5 km',
	'10k': '10 km',
	hm: 'Half marathon',
	marathon: 'Marathon',
	trail: 'Trail',
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
 * The name each stored **Week Replan** outcome goes by on the Hero's This week
 * pane. `proposed` is the #505 Ukeskiftet word, so it is Norwegian (ADR 0081);
 * the older outcomes keep their English until their surface is redesigned.
 */
export const WEEK_REPLAN_OUTCOME_LABELS: Record<WeekReplanOutcome, string> = {
	adjusted: 'This week adjusted',
	proposed: 'Endringer foreslått',
	'no-change': 'No change',
	'insufficient-data': 'No adjustment',
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

/** Why a week has no Week Target. */
export const TARGET_ABSENCE_LABELS: Record<TargetAbsence, string> = {
	'outside-plan': 'utenfor planen',
	'no-anchor': 'planen har ikke noe mål for uka',
}

/** Why a pace has no figure. */
export const PACE_ABSENCE_LABELS: Record<PaceAbsence, string> = {
	'no-recorded-pace': 'ingen økt med både tid og km',
	'no-easy-session': 'ingen rolig økt gjort',
}

/** Why a zone split has no figure. */
export const ZONE_ABSENCE_LABELS: Record<ZoneAbsence, string> = {
	'no-zone-prescribed': 'øktene har ingen soner',
	'no-zone-recorded': 'importen har ingen soner',
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

/** Why a session is in Annet. */
export const ANNET_REASON_LABELS: Record<AnnetReason, string> = {
	'other-discipline': 'en aktivitet appen ikke følger',
	'no-track': 'planen har ikke denne idretten',
	'athlete-choice': 'du valgte at den ikke teller',
}

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
 * A closed week folded to one line (#505 story 31): `35 av 46 km · under`.
 * `of` is the Week Target, or the Planned Volume where the week had no target;
 * `done` null means nothing done was measured, which is said rather than
 * counted as zero.
 */
export function foldedTrackLabel({
	done,
	of,
	unit,
	grade,
}: {
	done: string | null
	of: string | null
	unit: string
	grade: string | null
}): string {
	const figure =
		done == null
			? of == null
				? 'ikke målt'
				: `ikke målt av ${of} ${unit}`
			: of == null
				? `${done} ${unit} ${WEEK_FIGURE_LABELS.done}`
				: `${done} av ${of} ${unit}`
	return grade ? `${figure} · ${grade}` : figure
}

/**
 * A week's load line where it has no Training Track to be read in — before
 * the plan, or with no plan at all. Counts and TSS only.
 */
export const WEEK_LOAD_LABELS = {
	nothingWritten: 'Ingenting lagt inn',
	nothingLogged: 'Ingenting logget',
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

/** A week past the horizon of a plan with no Week Pattern to fill it from. */
export const NOT_FILLED_LABEL = 'ingen økter lagt inn ennå'

/** A fold's control, for the reader who hears it rather than sees it. */
export function foldedWeekControlLabel(name: string, line: string): string {
	return `${name}, ${line}`
}

/**
 * A run of empty days behind today (ADR 0065 §3, ADR 0075): `7 dager ·
 * ingenting logget`, named in full as `7 dager uten noe logget, 4–10 August`.
 */
export function pastBandLabels(
	days: number,
	range: string,
): { summary: string; control: string } {
	return {
		summary: `${days} dager · ingenting logget`,
		control: `${days} dager uten noe logget, ${range}`,
	}
}

/**
 * A run of free days ahead of today (#505 story 30): `2 ledige dager`, a short
 * row that opens into the days so one of them can be written into.
 */
export function freeBandLabels(
	days: number,
	range: string,
): { summary: string; control: string } {
	return {
		summary: `${days} ledige dager`,
		control: `${days} ledige dager, ${range} — åpne for å legge inn en økt`,
	}
}

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
	| 'already-eased',
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
}

/** The coming week's planned sum, under the ease action: `Neste uke: 44 km planlagt`. */
export function easePlannedLabel(
	weekName: string,
	figure: string,
	unit: string,
): string {
	return `${weekName}: ${figure} ${unit} planlagt`
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
		`Sett ${position} av ${lift}, ${unit === 'reps' ? 'reps' : 'sekunder'}`,
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
	/** The prescription's weight, in the load's own semantics (ADR 0056 §3);
	 * `kg` is the kilo as `formatKg` writes it. */
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

/** The large-screen season pane beside the list (#505 story 60). */
export const SEASON_PANE_LABELS = {
	heading: 'Sesongen',
	week: 'Uke',
	phase: 'Fase',
	grade: 'vurdering',
	load: 'økter og belastning',
	jumpTo: (week: string) => `Gå til ${week}`,
	noPlan: 'Ingen plan ennå, så sesongen er bare ukene du har skrevet.',
	loadFailed:
		'Sesongkurven kunne ikke lastes nå. Lista til venstre er den samme.',
} as const

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
	addWorkoutOn: (day: string) => `Legg inn en økt ${day}`,
	restDay: 'Hviledag',
	restDayOn: (day: string) => `Hviledag — ${day}`,
	restDayNote: 'Planen ber ikke om noe i dag.',
	open: 'Åpne',
	missedMark: (discipline: string) => `${discipline} — ikke gjort`,
	planStart:
		'Alt over denne linja er trening du hadde med deg — ingen plan å holde den opp mot.',
} as const

/** What a session row says on its two lines and its chips. */
export const ROW_LABELS = {
	todayNotDone: 'I DAG · IKKE GJORT ENNÅ',
	missed: 'IKKE GJORT',
	unplanned: 'UTENFOR PLANEN · INGEN PLAN Å SAMMENLIGNE MED',
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

/** The hero: today's session, what today is, and the way in. */
export const HERO_LABELS = {
	today: 'I dag',
	tomorrow: 'I morgen',
	nextUp: (title: string) => `Neste · ${title}`,
	todayDone: 'I dag er gjort',
	nothingLeftToday: 'Ingenting igjen i dag',
	nothingToday: 'Ingenting i dag',
	daysToRace: (days: number) =>
		days === 1 ? '1 dag til løpsdagen' : `${days} dager til løpsdagen`,
	weeksToRace: (weeks: number) =>
		weeks === 1 ? '1 uke til løpsdagen' : `${weeks} uker til løpsdagen`,
	seasonPlan: 'Sesongplan',
	nothingScheduled: 'Ingenting planlagt',
	nothingScheduledNote: 'Det står ingen økt foran deg i kalenderen.',
	planASession: 'Planlegg en økt',
	carousel: 'I dag, på fire måter',
	pane: (name: string, index: number, count: number) =>
		`${name}, side ${index} av ${count}`,
	choosePane: 'Velg hva toppen viser',
} as const

/** The hero's four panes, by their codes. */
export const HERO_PANE_LABELS = {
	today: 'I dag',
	form: 'Form',
	week: 'Denne uka',
	records: 'Rekorder',
} as const

/** The hero's one honest action (#179), in Norwegian. */
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

/** The Form pane's triad, as the hero names it (ADR 0008). */
export const NB_LOAD_LEGENDS = {
	fitness: {
		short: 'Kond',
		term: 'Kondisjon (CTL)',
		description:
			'Kondisjon (CTL): snittet av treningsbelastningen (TSS) de siste 42 dagene, vektet — formen du har bygd opp.',
	},
	fatigue: {
		short: 'Tretth',
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

/** The hero's other three panes. */
export const HERO_PANE_TEXT = {
	baseline: (day: number, required: number) =>
		`Bygger grunnlag — dag ${day}/${required}`,
	fitnessTrend: (from: string, to: string, since: string) =>
		`Kondisjon ${from} → ${to} siden ${since}`,
	adherence: (band: string, percent: number) =>
		`${band} · ${percent} % av planlagt utholdenhetsbelastning`,
	adherenceUnavailable: 'Planlagt utholdenhetsbelastning kan ikke måles',
	strength: (completed: number, planned: number) =>
		`${completed} av ${planned} styrkeøkter logget`,
	noStrength: 'Ingen styrkeøkter denne uka',
	noRecords:
		'Ingen personlige rekorder ennå — de kommer når du har logget registrerte økter.',
	overBest: (delta: string) => `${delta} over forrige beste`,
	firstOnRecord: 'Første registrerte',
	longest: (discipline: string) => `Lengste ${discipline}`,
} as const

/** The record's sport, as the noun after `Lengste`. */
export const NB_RECORD_NOUNS: Record<string, string> = {
	run: 'løpetur',
	bike: 'sykkeltur',
	swim: 'svømmeøkt',
	strength: 'styrkeøkt',
}

/**
 * A closed week's Week Replan outcome on the hero (ADR 0025, ADR 0080). Only a
 * `proposed` outcome's reason is Norwegian prose; the older outcomes' stored
 * reasons are English sentences, so they are said in these words instead.
 */
export const HOME_REPLAN_LABELS: Record<
	WeekReplanOutcome,
	{ outcome: string; reason: string | null }
> = {
	adjusted: {
		outcome: 'Uka er justert',
		reason: 'Vi gjorde denne uka lettere etter uka som gikk.',
	},
	proposed: { outcome: 'Endringer foreslått', reason: null },
	'no-change': {
		outcome: 'Ingen endring',
		reason: 'Uka som gikk holdt planen, så denne står som den er.',
	},
	'insufficient-data': {
		outcome: 'Ingen justering',
		reason: 'Det var for lite å lese av uka som gikk til å endre noe.',
	},
}

/** An outcome with no words of its own still names a decision. */
export const HOME_REPLAN_FALLBACK = 'Ukeskiftet'

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
	writeLast: (weeks: number) =>
		weeks === 1 ? 'Skriv den siste uka' : `Skriv de siste ${weeks} ukene`,
	seasonPlan: 'Sesongplan',
	planASeason: 'Planlegg en sesong',
	elsewhere: 'Andre steder i trainm8',
	events: 'Løp og arrangementer',
	catalogue: 'Katalog',
	programs: 'Programmer',
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
} as const

/**
 * The **writing line** (#505 stories 35–41): a session typed as a sentence,
 * what the app understood of it, and what it does to the week.
 */
export const WRITING_LINE_LABELS = {
	input: 'Skriv økta',
	placeholder: 'f.eks. 10 km rolig eller 3x10 min terskel p 1 min',
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
	} satisfies Record<SentenceProblem, string>,
	add: (sentence: string) => `Legg til «${sentence}»`,
	addEmpty: 'Legg til',
	/** The creation menu's way in, and the panel it opens (story 40). */
	open: 'Skriv en økt',
	day: 'Dag',
	close: 'Lukk',
	failed: 'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
	outsideWindow: 'Den dagen ligger utenfor det I dag viser.',
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

/** Why a finding on "Dette fant vi" has no number (#505 story 71). */
export const FINDING_ABSENCE_LABELS: Record<FindingAbsence, string> = {
	'not-connected':
		'Ikke målt · intervals.icu er ikke koblet til, og du har ikke logget økter her',
	importing: 'Ikke målt ennå · historikken hentes fortsatt fra intervals.icu',
	'no-sessions': 'Ikke målt · vi fant ingen økter de siste fire ukene',
	'no-duration': 'Ikke målt · øktene dine har ingen tid registrert',
}

/**
 * "Vi valgte X fordi …" (#505 stories 66 and 70): the philosophy the first
 * run proposes, and its one reason, in plain words.
 */
export function familyChoiceSentence(choice: FamilyChoice): string {
	const name = PHILOSOPHY_LABELS[choice.family]
	const reason = choice.reason
	const because = (() => {
		switch (reason.code) {
			case 'older-athlete':
				return `du er ${reason.age} år. Da trenger kroppen hvile oftere, så hver tredje uke er lett.`
			case 'little-history':
				return reason.weeksTrained == null || reason.weeksTrained === 0
					? 'vi ikke har noe trening å lese fra. En jevn økning med en lett uke hver fjerde uke er den tryggeste starten.'
					: `vi fant trening i ${reason.weeksTrained} av de siste fire ukene. En jevn økning med en lett uke hver fjerde uke er den tryggeste starten.`
			case 'few-days':
				return `du har ${reason.days} ${reason.days === 1 ? 'dag' : 'dager'} i uka. Da passer en jevn økning med en lett uke hver fjerde uke best.`
			case 'few-hours':
				return `du har ${nbHoursLabel(reason.hours)} i uka. Med lite tid gir en jevn økning med en lett uke hver fjerde uke mest.`
			case 'long-run-up':
				return `det er ${reason.weeks} uker til løpet. Da rekker du en lang periode med rolig trening før de harde øktene kommer.`
			case 'many-hours':
				return `du har ${nbHoursLabel(reason.hours)} i uka. Med så mye tid lønner det seg å trene det meste rolig og litt veldig hardt.`
			case 'race-on-limited-time':
				return `du har ${nbHoursLabel(reason.hours)} i uka mot et løp. Med begrenset tid gir kontrollert harde økter mest igjen.`
			case 'steady':
				return 'du trener jevnt og vil holde deg i form. Tre uker som bygger og én lett holder formen oppe uten å slite deg ut.'
		}
	})()
	return `Vi valgte ${name} fordi ${because}`
}

/** The first run's own words, screen by screen. */
export const FIRST_RUN_LABELS = {
	stepOf: (step: number, of: number) => `Steg ${step} av ${of}`,
	connect: {
		title: 'Koble til intervals.icu',
		intro:
			'Da kan vi lese de siste ukene dine og fylle ut svarene for deg. Vi henter bare fullførte økter.',
		keyLabel: 'API-nøkkel fra intervals.icu',
		keyHelp:
			'Du finner den i intervals.icu under Settings → Developer Settings.',
		submit: 'Koble til',
		connected: 'intervals.icu er koblet til.',
		next: 'Fortsett',
		skip: 'Hopp over',
		skipConsequence:
			'Hopper du over, har vi ingen historikk å lese. Da fyller du inn svarene selv, og planen bygger bare på det du sier.',
		emptyKey: 'Lim inn API-nøkkelen fra intervals.icu.',
		rejected:
			'intervals.icu godtok ikke nøkkelen. Lager du en ny nøkkel, slutter den gamle å virke – kopier den som gjelder nå.',
		unreachable: 'Vi fikk ikke kontakt med intervals.icu. Prøv igjen om litt.',
	},
	findings: {
		title: 'Dette fant vi',
		intro: 'Fra de siste fire ukene dine.',
		importing:
			'Historikken hentes fra intervals.icu. Siden oppdaterer seg selv når den er hentet.',
		discipline: 'Mest trent',
		volume: 'Timer i uka',
		days: 'Vanlige treningsdager',
		strength: 'Styrke',
		disciplineValue: (sport: string, sessions: number, weeks: number) =>
			`${sport} · ${sessions} ${sessions === 1 ? 'økt' : 'økter'} på ${weeks} ${weeks === 1 ? 'uke' : 'uker'}`,
		strengthValue: (perWeek: number) =>
			perWeek === 0
				? 'Ingen styrkeøkter'
				: `${nbNumber(perWeek)} ${perWeek === 1 ? 'økt' : 'økter'} i uka`,
		correct: 'Det stemmer',
		wrong: 'Noe er feil',
		wrongIntro:
			'Rett det som ikke stemmer. Svarene på neste side fylles ut med det du skriver her.',
		saveCorrection: 'Bruk dette',
	},
	questions: {
		title: 'Tre spørsmål',
		intro: 'Fylt ut fra historikken din. Endre det som ikke passer.',
		goal: 'Hva trener du mot?',
		goalActive: 'Hold meg aktiv',
		goalActiveHelp: 'Ingen løp og ingen sluttdato. Planen går i blokker.',
		goalEvent: 'Et løp eller en dato',
		eventName: 'Hva heter det?',
		eventDate: 'Dato',
		hours: 'Timer i uka',
		hoursFromHistory: (arithmetic: string) => `Fra historikken: ${arithmetic}`,
		hoursUnmeasured: (reason: string) => `${reason}. Skriv det du har tid til.`,
		days: 'Hvilke dager kan du trene?',
		daysFromHistory: 'Dagene du pleier å trene.',
		daysDefault:
			'Et forslag – vi hadde ingen dager å lese fra. Velg dagene som passer deg.',
		daysCorrected: 'Dagene du skrev.',
		discipline: 'Planen gjelder',
		next: 'Vis planen',
	},
	plan: {
		title: 'Planen',
		youChose: (name: string) => `Du valgte ${name}.`,
		weSuggested: (sentence: string) => `Vårt forslag: ${sentence}`,
		openEnded: (weeks: number) =>
			`Blokk 1 · ${weeks} uker, så neste blokk. Ingen sluttdato.`,
		towardEvent: (name: string, weeks: number) => `${weeks} uker mot ${name}.`,
		phase: (name: string, weeks: number) =>
			`${name} · ${weeks} ${weeks === 1 ? 'uke' : 'uker'}`,
		firstWeek: (hours: string) => `Første uke: ${hours}`,
		peakWeek: (hours: string) => `Tyngste uke: ${hours}`,
		startsOn: (date: string) => `Planen starter ${date}.`,
		switchTitle: 'Bytt filosofi',
		switchSubmit: 'Bruk denne',
		next: 'Se de to første ukene',
		back: 'Endre svarene',
	},
	weeks: {
		title: 'De to første ukene',
		intro: (days: string, hours: string) =>
			`Øktene ligger på ${days}. Første uke er ${hours} til sammen.`,
		weekHeading: (weekNumber: number, from: string) =>
			`Uke ${weekNumber} · fra ${from}`,
		weekTotal: (planned: string, target: string) =>
			`${planned} planlagt · målet er ${target}`,
		long: 'Langtur',
		easy: 'Rolig økt',
		tooManyHardSessions: (hard: number, days: number) =>
			`Planen ber senere om ${hard} harde økter i uka, men du har ${days} ${days === 1 ? 'dag' : 'dager'}. Du kan ta to økter samme dag, eller velge flere dager i Sesong.`,
		create: 'Start planen',
		selfSetUp: 'Jeg vil heller sette opp sesongen selv',
		selfSetUpHelp: 'Du får den samme planen i Sesong, og kan endre alt i den.',
		created: 'Planen er klar',
		createdDescription: 'De to første ukene ligger i I dag.',
		back: 'Tilbake til planen',
	},
} as const

/** Why the first run's plan could not be made, said where it is refused. */
export const FIRST_RUN_REFUSAL_LABELS: Record<FirstRunPlanRefusal, string> = {
	'plan-already-active': 'Du har allerede en plan. Du finner den i Sesong.',
	'event-too-soon':
		'Velg en dato etter neste uke, så det blir uker å trene mot den.',
	'nothing-to-lay':
		'Med disse svarene ble det ingen økter å legge. Velg minst én dag og noen timer i uka.',
}

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
	kicker: 'Kondisjonen er regnet ut på nytt',
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
 * `stepPercent` the step a round done to plan earns.
 */
export function nextRoundReason(
	verdict: RoundVerdict,
	round: number,
	graded: number,
	stepPercent: number,
): string {
	const ended = openEndedRoundName(round)
	const next = openEndedRoundName(round + 1)
	const same = `Vi foreslår ${next} med like mye trening som ${ended}`
	switch (verdict.kind) {
		case 'done-to-plan':
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
} as const

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
			after: string
			unit: string
	  }
	| {
			kind: 'phase'
			name: { before: string; after: string }
			weeks: { before: number; after: number }
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
		case 'week-target':
			return words.before == null
				? `Uke ${words.weekNumber}: mål ${words.after} ${words.unit}.`
				: `Uke ${words.weekNumber}: mål ${words.before} → ${words.after} ${words.unit}.`
		case 'phase': {
			const renamed = words.name.before !== words.name.after
			const resized = words.weeks.before !== words.weeks.after
			if (renamed && resized) {
				return `«${words.name.before}» heter nå «${words.name.after}» og varer ${nbWeeks(words.weeks.after)} (var ${words.weeks.before}).`
			}
			if (renamed) {
				return `«${words.name.before}» heter nå «${words.name.after}».`
			}
			return `${words.name.before}: ${words.weeks.before} → ${nbWeeks(words.weeks.after)}.`
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

// ---------------------------------------------------------------------------

/** Capitalize the first character; the fallback for open-ended enum sets. */
function capitalize(value: string): string {
	return value ? value[0]!.toUpperCase() + value.slice(1) : value
}
