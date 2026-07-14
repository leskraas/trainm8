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
