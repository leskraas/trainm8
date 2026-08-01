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
import type { EventKind, EventPriority, EventStatus } from './event-schema.ts'
import type {
	Rhythm,
	StrengthGoal,
	VolumeCurrency,
	WeekRole,
} from './plan-outline/derive.ts'
// The domain owns *why* a Training Track feeds nothing into the projected curve
// (ADR 0045 §6, ADR 0047 §5); this module owns how each reason is worded.
import type { NoContributionReason } from './plan-outline/planned-load.ts'
import type { QualityZone } from './plan-outline/quality-mix.ts'
// The domain owns *which* readings a strength plan cannot state (ADR 0047 §5);
// this module owns how each one is worded.
import type { UnavailableReading } from './plan-outline/unavailable-readings.ts'
// …and *which* conventions the Volume Conversion stacked (ADR 0045 §10).
import type { ConventionId } from './plan-outline/volume-conversion.ts'
import type {
	PatternDayKind,
	PatternWeekday,
} from './plan-outline/week-pattern.ts'
import type {
	Discipline,
	IntensityTarget,
	StepKind,
	WorkoutIntent,
} from './workout-schema.ts'
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
	powerPct: 'Power (%FTP)',
	pace: 'Pace',
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
 * value never renders as "strength emphasis: strength" (CONTEXT.md's _Avoid_ note).
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

/** A phase's loading rhythm — which of its weeks recover (ADR 0044 §4). */
export const RHYTHM_LABELS: Record<Rhythm, string> = {
	'3:1': '3:1 — every 4th week recovers',
	'2:1': '2:1 — every 3rd week recovers',
	none: 'No recovery weeks',
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
