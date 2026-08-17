/**
 * PROTOTYPE — the pure season builder behind the "create a training plan"
 * journey. Four radically different variants of that journey share this file so
 * they argue about *shape*, not about numbers.
 *
 * Nothing here touches Prisma or the clock. The athlete arrives as a value from
 * the route's loader (`plan.prototype.tsx`), so every function below is pure and
 * synchronous and a variant may call it in `useMemo` on every keystroke.
 *
 * **The rules are sourced.** Every band, cap and share below cites
 * `docs/research/` by line. Anything the corpus does not say is marked
 * `// CONVENTION (not corpus):` so a reader can tell a citation from a guess.
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */

/* -------------------------------------------------------------------------- */
/* Athlete + Season Anchor                                                     */
/* -------------------------------------------------------------------------- */

/** The endurance disciplines the prototype plans. Strength is out of scope. */
export type Discipline = 'run' | 'bike' | 'swim'

export type Currency = 'km' | 'hours' | 'tss'

/**
 * What the athlete's intensity targets can actually be expressed in, given the
 * thresholds their `DisciplineProfile` carries. The journey must degrade to a
 * zone label or an RPE rather than invent a threshold the athlete never set.
 */
export type IntensityBasis = 'pace' | 'power' | 'hr' | 'zone' | 'rpe'

/** One threshold the athlete has set, or deliberately has not. */
export type ThresholdReading = {
	/** Athlete-facing name, e.g. `LTHR`. */
	label: string
	/** Formatted value, or null when unset. */
	value: string | null
}

/**
 * One track of an athlete's week, read from their real history.
 *
 * `proposedAnchor` is the Season Anchor proposed from the last four complete
 * Training Weeks (`ANCHOR_WINDOW_WEEKS`) — the number the journey asks the
 * athlete to confirm rather than invent.
 */
export type PrototypeTrack = {
	discipline: Discipline
	currency: Currency
	proposedAnchor: number
	/** One sentence naming the derivation, for a surface that wants prose. */
	anchorSource: string
	/** The same derivation as numbers, for a surface that wants a table. */
	derivation: {
		windowWeeks: number
		weeksTrained: number
		total: number
		sessions: number
	}
	/** Which unit intensity can be stated in for this discipline. */
	intensityBasis: IntensityBasis
	/** Every applicable threshold, set or unset, in display order. */
	thresholds: ThresholdReading[]
	/** Just the unset ones' labels — the UI's reason for degrading. */
	unsetThresholds: string[]
}

export type PrototypeAthlete = {
	username: string
	name: string
	/** One per discipline with history, busiest first. Never empty. */
	tracks: PrototypeTrack[]
	/** Days the athlete said they can train. Empty = never set. */
	trainableDays: Day[]
	/** Hours per Training Week they have room for, or null when unset. */
	weeklyCapacityHours: number | null
	/** Median sessions per week over the last 12 closed Training Weeks. */
	medianSessionsPerWeek: number
	/** Median km per week over the same 12 weeks, all disciplines summed. */
	medianWeeklyKm: number
	/** How many of those 12 weeks carried any training at all. */
	closedWeeksWithTraining: number
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export type EventPriority = 'A' | 'B' | 'C'

export type PrototypeEvent = {
	id: string
	name: string
	/** ISO date, YYYY-MM-DD. */
	date: string
	discipline: Discipline
	priority: EventPriority
	/** Complete Training Weeks between the season's first Monday and race day. */
	weeksAway: number
}

/* -------------------------------------------------------------------------- */
/* Intent                                                                      */
/* -------------------------------------------------------------------------- */

export type Intent =
	| 'first-season'
	| 'returning-from-injury'
	| 'deliberately-building'

/** Short athlete-facing labels — 2–4 words, never a sentence. */
export const INTENTS: { key: Intent; label: string }[] = [
	{ key: 'first-season', label: 'My first season' },
	{ key: 'returning-from-injury', label: 'Coming back from injury' },
	{ key: 'deliberately-building', label: 'Building deliberately' },
]

/* -------------------------------------------------------------------------- */
/* Level bands — docs/research/workouts-running.md:73-74, :520-527             */
/* -------------------------------------------------------------------------- */

export type LevelBand = 'beginner' | 'intermediate' | 'advanced'

/**
 * The level bands, verbatim from `docs/research/workouts-running.md:73-74` and
 * the level-scaling table at `:520-527`:
 *
 * > _Beginner_ ≈ <40 km/wk, ≤2 quality sessions; _intermediate_ ≈ 40–80 km/wk,
 * > 2–3 quality; _advanced_ ≈ 80 km+/wk, 3 quality (or 2 doubles + 1).
 *
 * `quality` is also the 2–3 key-workout-days pattern at
 * `docs/research/intensity-distribution.md:416-418`.
 */
const BANDS = {
	beginner: {
		/** Upper bound of the band, in run-equivalent km/wk. */
		maxRunEquivalentKm: 40,
		/** Quality sessions per week: [base phase, build/peak phase]. */
		quality: [1, 2] as [number, number],
		/** workouts-running.md:248 — doubles are inappropriate below ~80 km/wk. */
		doublesAllowed: false,
	},
	intermediate: {
		maxRunEquivalentKm: 80,
		quality: [2, 3] as [number, number],
		doublesAllowed: false,
	},
	advanced: {
		maxRunEquivalentKm: Infinity,
		quality: [3, 3] as [number, number],
		doublesAllowed: true,
	},
} satisfies Record<LevelBand, unknown>

export const LEVEL_BAND_LABELS: Record<LevelBand, string> = {
	beginner: 'beginner',
	intermediate: 'intermediate',
	advanced: 'advanced',
}

/**
 * workouts-running.md:185 (B1) and :189 (B5) — the long run is capped at
 * **25–30 % of weekly volume**, and Hansons cap it absolutely at ~26 km. The
 * top of the range is used for a loading week and the bottom for a reduced one.
 */
const LONG_RUN_SHARE = { loading: 0.3, reduced: 0.25 }
const LONG_RUN_ABSOLUTE_KM = 26

/**
 * workouts-running.md:153 — easy running is **75–85 % of weekly volume**. This
 * is the target the builder is measured against, not an input: the easy share
 * falls out of how much of the week the capped quality doses claim.
 */
export const EASY_SHARE_TARGET: [number, number] = [0.75, 0.85]

/**
 * workouts-running.md:264 (D4) — cap `I` reps at **8 % of weekly volume**; and
 * :336 (F2) — cap `R` reps at **5 %**. These bound the *rep* volume inside a
 * quality session, not the session's total.
 */
const REP_SHARE = { threshold: 0.08, vo2: 0.08, reps: 0.05 }

/**
 * workouts-running.md:503-508, Taper row — "Cut _volume_ 40–60 %, keep
 * intensity and frequency."
 */
const TAPER_CUT: [number, number] = [0.4, 0.6]

// CONVENTION (not corpus): cross-discipline volume is compared in
// *run-equivalent km* so one set of bands can classify a triathlete's three
// tracks. 1 bike km ≈ 0.25 run km and 1 swim km ≈ 4 run km are the coaching
// rules of thumb, not a corpus figure.
const RUN_EQUIVALENT_PER_KM: Record<Discipline, number> = {
	run: 1,
	bike: 0.25,
	swim: 4,
}

// CONVENTION (not corpus): hours and TSS are converted to km before banding —
// 10 km/h and 7 TSS/km. Both are placeholders so a track authored in hours
// still lands in a band.
const KM_PER_HOUR = 10
const TSS_PER_KM = 7

// CONVENTION (not corpus): session counts per band. The corpus fixes *quality*
// counts and nothing else, so the total is interpolated inside each band. These
// are the numbers the prototype exists to get looked at.
const SESSION_COUNTS: Record<
	LevelBand,
	{ upToKm: number; sessions: number }[]
> = {
	beginner: [
		{ upToKm: 20, sessions: 3 },
		{ upToKm: 30, sessions: 4 },
		{ upToKm: Infinity, sessions: 5 },
	],
	intermediate: [
		{ upToKm: 55, sessions: 5 },
		{ upToKm: 70, sessions: 6 },
		{ upToKm: Infinity, sessions: 7 },
	],
	advanced: [
		{ upToKm: 100, sessions: 7 },
		{ upToKm: 120, sessions: 8 },
		{ upToKm: 140, sessions: 9 },
		{ upToKm: Infinity, sessions: 10 },
	],
}

// CONVENTION (not corpus): the smallest session worth prescribing — 4 run km,
// 30 min, 30 TSS, converted per discipline the same way the long-run cap is (so
// a swim floor is 1 km, not 4). Below it the builder merges the session away
// rather than emitting a 1 km run.
const MIN_SESSION_RUN: Record<Currency, number> = { km: 4, hours: 0.5, tss: 30 }

// CONVENTION (not corpus): the rounding grain per currency — whole km, whole
// 5 minutes, whole 5 TSS.
const CURRENCY_STEP: Record<Currency, number> = { km: 1, hours: 5 / 60, tss: 5 }

// CONVENTION (not corpus): a quality session's *total* volume is 1.15× a plain
// easy day's. The corpus caps only the rep dose inside it (`REP_SHARE`); the
// session's total is the athlete's ordinary run with reps in the middle, so it
// must never outgrow the long run and it must not distort the easy days.
const QUALITY_SESSION_TILT = 1.15

function minSessionFor(currency: Currency, discipline: Discipline): number {
	if (currency !== 'km') return MIN_SESSION_RUN[currency]
	return MIN_SESSION_RUN.km / RUN_EQUIVALENT_PER_KM[discipline]
}

/** How many km of the given currency one unit is worth, for banding. */
function toRunEquivalentKm(
	value: number,
	currency: Currency,
	discipline: Discipline,
): number {
	const km =
		currency === 'km'
			? value
			: currency === 'hours'
				? value * KM_PER_HOUR
				: value / TSS_PER_KM
	return km * RUN_EQUIVALENT_PER_KM[discipline]
}

/** The absolute long-run cap, expressed in this track's own currency. */
function longRunAbsoluteCap(
	currency: Currency,
	discipline: Discipline,
): number {
	const km = LONG_RUN_ABSOLUTE_KM / RUN_EQUIVALENT_PER_KM[discipline]
	if (currency === 'km') return km
	if (currency === 'hours') return km / KM_PER_HOUR
	return km * TSS_PER_KM
}

function bandFor(runEquivalentKm: number): LevelBand {
	if (runEquivalentKm < BANDS.beginner.maxRunEquivalentKm) return 'beginner'
	if (runEquivalentKm < BANDS.intermediate.maxRunEquivalentKm)
		return 'intermediate'
	return 'advanced'
}

/**
 * The level band a weekly volume lands in, **with its caps as numbers**, so a
 * variant can render the reasoning (`beginner · 3 sessions · long ≤ 5 km`)
 * instead of a sentence claiming to have reasoned.
 */
export type LevelDescription = {
	band: LevelBand
	/** The volume asked about, echoed back. */
	weeklyVolume: number
	currency: Currency
	discipline: Discipline
	/** The banded volume, in run-equivalent km. */
	runEquivalentKm: number
	/** Sessions per week this band prescribes, before availability clamps it. */
	sessions: number
	/** Quality sessions per week: [base phase, build/peak phase]. */
	quality: [number, number]
	/** Long-run cap as a share of the week, and as a rounded volume. */
	longCapShare: number
	longCap: number
	/** The corpus' easy-volume window, for the UI to check itself against. */
	easyShareTarget: [number, number]
	doublesAllowed: boolean
	/** One line, numbers only: `beginner · 3 sessions · long ≤ 5 km`. */
	summary: string
}

export function describeLevel(
	weeklyVolume: number,
	currency: Currency,
	discipline: Discipline = 'run',
): LevelDescription {
	const runEquivalentKm = toRunEquivalentKm(weeklyVolume, currency, discipline)
	const band = bandFor(runEquivalentKm)
	const rules = BANDS[band]
	const sessions =
		SESSION_COUNTS[band].find((row) => runEquivalentKm < row.upToKm)
			?.sessions ?? 3
	const longCap = roundToStep(
		Math.min(
			weeklyVolume * LONG_RUN_SHARE.loading,
			longRunAbsoluteCap(currency, discipline),
		),
		CURRENCY_STEP[currency],
	)

	return {
		band,
		weeklyVolume,
		currency,
		discipline,
		runEquivalentKm: Math.round(runEquivalentKm * 10) / 10,
		sessions,
		quality: rules.quality,
		longCapShare: LONG_RUN_SHARE.loading,
		longCap,
		easyShareTarget: EASY_SHARE_TARGET,
		doublesAllowed: rules.doublesAllowed,
		summary: `${LEVEL_BAND_LABELS[band]} · ${sessions} sessions · long ≤ ${formatVolume(longCap, currency)}`,
	}
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

export const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km',
	hours: 'h',
	tss: 'TSS',
}

/** `12 km`, `1h 25min`, `250 TSS` — the grain the builder rounds to. */
export function formatVolume(value: number, currency: Currency): string {
	if (currency === 'km') return `${round1(value)} km`
	if (currency === 'tss') return `${Math.round(value)} TSS`
	const minutes = Math.round(value * 60)
	const hours = Math.floor(minutes / 60)
	const rest = minutes % 60
	if (hours === 0) return `${rest} min`
	return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`
}

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

function roundToStep(value: number, step: number): number {
	return Math.round(value / step) * step
}

/* -------------------------------------------------------------------------- */
/* Periodization Presets                                                       */
/* -------------------------------------------------------------------------- */

export type Phase = {
	name: string
	weeks: number
}

export type Preset = {
	key: string
	/** Short athlete-facing name. */
	name: string
	phases: Phase[]
	/** Total weeks — always the sum of `phases`. */
	weeks: number
	/** Normalized 0–1 weekly load, one entry per week. Draw it as a sparkline. */
	weeklyLoad: number[]
}

export const PRESETS: Preset[] = [
	{
		key: 'classic-build',
		name: 'Classic build',
		phases: [
			{ name: 'Base', weeks: 8 },
			{ name: 'Build', weeks: 6 },
			{ name: 'Peak', weeks: 2 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.4, 0.48, 0.56, 0.36, 0.6, 0.68, 0.74, 0.5, 0.78, 0.86, 0.92, 0.6, 0.94,
			1, 0.98, 0.9, 0.6, 0.3,
		],
	},
	{
		key: 'mostly-easy',
		name: 'Mostly easy',
		phases: [
			{ name: 'Base', weeks: 10 },
			{ name: 'Sharpen', weeks: 5 },
			{ name: 'Taper', weeks: 3 },
		],
		weeks: 18,
		weeklyLoad: [
			0.45, 0.52, 0.6, 0.4, 0.64, 0.7, 0.76, 0.5, 0.8, 0.86, 0.9, 0.94, 0.62, 1,
			0.96, 0.72, 0.5, 0.28,
		],
	},
	{
		key: 'speed-first',
		name: 'Speed first',
		phases: [
			{ name: 'Speed', weeks: 6 },
			{ name: 'Build', weeks: 6 },
			{ name: 'Endurance', weeks: 4 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.5, 0.58, 0.64, 0.42, 0.68, 0.74, 0.78, 0.84, 0.88, 0.56, 0.92, 0.96,
			0.98, 1, 0.94, 0.86, 0.58, 0.3,
		],
	},
	{
		key: 'focused-blocks',
		name: 'Focused blocks',
		phases: [
			{ name: 'Base', weeks: 6 },
			{ name: 'Threshold block', weeks: 4 },
			{ name: 'VO2 block', weeks: 4 },
			{ name: 'Peak', weeks: 2 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.42, 0.5, 0.58, 0.36, 0.62, 0.7, 0.88, 0.94, 0.98, 0.5, 0.9, 0.96, 1,
			0.52, 0.92, 0.86, 0.56, 0.28,
		],
	},
	{
		key: 'three-up-one-down',
		name: 'Three up, one down',
		phases: [
			{ name: 'Base', weeks: 8 },
			{ name: 'Build', weeks: 8 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.44, 0.54, 0.62, 0.38, 0.6, 0.7, 0.78, 0.46, 0.74, 0.84, 0.92, 0.54,
			0.88, 0.94, 1, 0.58, 0.6, 0.3,
		],
	},
	{
		key: 'gentle-ramp',
		name: 'Gentle ramp',
		phases: [
			{ name: 'Foundation', weeks: 10 },
			{ name: 'Build', weeks: 6 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.32, 0.36, 0.42, 0.3, 0.46, 0.5, 0.56, 0.4, 0.6, 0.66, 0.72, 0.78, 0.84,
			0.56, 0.9, 1, 0.62, 0.32,
		],
	},
	{
		key: 'back-from-injury',
		name: 'Back from injury',
		phases: [
			{ name: 'Rebuild', weeks: 8 },
			{ name: 'Base', weeks: 6 },
			{ name: 'Build', weeks: 3 },
			{ name: 'Taper', weeks: 1 },
		],
		weeks: 18,
		weeklyLoad: [
			0.2, 0.26, 0.32, 0.24, 0.38, 0.44, 0.5, 0.36, 0.56, 0.62, 0.68, 0.48,
			0.74, 0.8, 0.86, 0.92, 1, 0.34,
		],
	},
	{
		key: 'short-and-sharp',
		name: 'Short and sharp',
		phases: [
			{ name: 'Base', weeks: 4 },
			{ name: 'Build', weeks: 8 },
			{ name: 'Peak', weeks: 4 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.5, 0.6, 0.68, 0.42, 0.72, 0.8, 0.86, 0.52, 0.84, 0.9, 0.94, 0.58, 0.96,
			1, 0.98, 0.6, 0.56, 0.28,
		],
	},
	{
		key: 'two-peaks',
		name: 'Two peaks',
		phases: [
			{ name: 'Base', weeks: 6 },
			{ name: 'First peak', weeks: 4 },
			{ name: 'Reset', weeks: 2 },
			{ name: 'Second peak', weeks: 4 },
			{ name: 'Taper', weeks: 2 },
		],
		weeks: 18,
		weeklyLoad: [
			0.4, 0.48, 0.56, 0.34, 0.6, 0.68, 0.8, 0.88, 0.94, 0.5, 0.44, 0.52, 0.86,
			0.94, 1, 0.9, 0.58, 0.3,
		],
	},
]

export const DEFAULT_PRESET_KEY = 'classic-build'

/* -------------------------------------------------------------------------- */
/* Season                                                                      */
/* -------------------------------------------------------------------------- */

export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const DAYS: Day[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type Provenance = 'corpus' | 'convention' | 'hand-written' | 'community'

/** What a session is *for* — the thing the caps are applied per kind. */
export type SessionKind = 'easy' | 'long' | 'quality' | 'recovery' | 'race'

export type Session = {
	day: Day
	/** Which track this session belongs to. */
	discipline: Discipline
	archetype: string
	/** Short — this is a row label, not a description. */
	title: string
	kind: SessionKind
	/** The rounded volume, in `currency`. Whole km / 5 min / 5 TSS. */
	value: number
	currency: Currency
	/** `value` formatted — what the old API called `volume`. */
	volume: string
	intensity: string
	provenance: Provenance
	/** The corpus rule that sized this session, or null where none applies. */
	cap: string | null
}

export type WeekRole = 'loading' | 'recovery' | 'taper' | 'race'

/** One discipline's slice of a week — its own target, sessions and shares. */
export type WeekTrack = {
	discipline: Discipline
	currency: Currency
	/** The week's target for this track, rounded to the currency's grain. */
	targetVolume: number
	sessions: Session[]
	/** The long session's volume, or null in a week with no long session. */
	longRun: number | null
	/** The long session as a share of this track's week, 0–1. */
	longRunShare: number
	/** Volume not spent on capped quality reps, as a share, 0–1. */
	easyShare: number
	/** Quality sessions in this week. */
	quality: number
	level: LevelDescription
}

export type Week = {
	/** Monday of the week, ISO YYYY-MM-DD. */
	weekKey: string
	/** 1-based. */
	index: number
	phase: string
	role: WeekRole
	/** The **primary** track's target — `tracks[0]`. */
	targetVolume: number
	/** The primary track's currency. */
	currency: Currency
	/** Every track's sessions, ordered by weekday. */
	sessions: Session[]
	tracks: WeekTrack[]
}

/** Monday of the first season week, when the caller has nothing better. */
export const SEASON_START_MONDAY = '2026-08-17'

const MS_PER_DAY = 86_400_000

/** Monday `index` (1-based) weeks after `startMonday`. */
function mondayOf(startMonday: string, index: number): string {
	const start = Date.parse(`${startMonday}T00:00:00Z`)
	return new Date(start + (index - 1) * 7 * MS_PER_DAY)
		.toISOString()
		.slice(0, 10)
}

/** Expand a preset's phase list into one phase name per week. */
function phaseForEachWeek(preset: Preset, weeks: number): string[] {
	const names: string[] = []
	for (const phase of preset.phases) {
		for (let i = 0; i < phase.weeks; i++) names.push(phase.name)
	}
	// CONVENTION (not corpus): a preset is authored at 18 weeks; a season that is
	// shorter or longer resamples the phase list rather than refusing to build.
	// The taper always survives because it is the tail of the list.
	if (names.length === weeks) return names
	return Array.from(
		{ length: weeks },
		(_, i) =>
			names[
				Math.min(names.length - 1, Math.floor((i * names.length) / weeks))
			]!,
	)
}

/** The preset's normalized load, resampled to `weeks` entries. */
function loadForEachWeek(preset: Preset, weeks: number): number[] {
	const load = preset.weeklyLoad
	if (load.length === weeks) return load
	return Array.from(
		{ length: weeks },
		(_, i) =>
			load[Math.min(load.length - 1, Math.floor((i * load.length) / weeks))] ??
			0.5,
	)
}

function roleFor(
	phase: string,
	index: number,
	total: number,
	load: number,
	previousLoad: number,
): WeekRole {
	if (index === total) return 'race'
	if (phase.toLowerCase().includes('taper')) return 'taper'
	if (load < previousLoad) return 'recovery'
	return 'loading'
}

/** Whether a phase name reads as a sharpening phase (more quality). */
function isSharpPhase(phase: string): boolean {
	const lower = phase.toLowerCase()
	return (
		lower.includes('build') ||
		lower.includes('peak') ||
		lower.includes('sharpen') ||
		lower.includes('speed') ||
		lower.includes('vo2') ||
		lower.includes('threshold') ||
		lower.includes('specific')
	)
}

/* -------------------------------------------------------------------------- */
/* Weekly volume target                                                        */
/* -------------------------------------------------------------------------- */

// CONVENTION (not corpus): a loading week's target is the Season Anchor scaled
// 0.85× at the preset's lightest week to 1.35× at its heaviest. The corpus gives
// no ramp shape; ADR 0040 §3's real formula is multiplicative per phase and out
// of scope for a prototype.
function targetFor(
	anchor: number,
	load: number,
	role: WeekRole,
	taperProgress: number,
): number {
	if (role === 'taper' || role === 'race') {
		// workouts-running.md:503-508 — taper cuts volume 40–60 %, deepening as
		// race day approaches. Race week takes the full 60 %.
		const cut =
			role === 'race'
				? TAPER_CUT[1]
				: TAPER_CUT[0] + (TAPER_CUT[1] - TAPER_CUT[0]) * taperProgress
		return anchor * (1 - cut)
	}
	return anchor * (0.85 + load * 0.5)
}

/* -------------------------------------------------------------------------- */
/* Apportionment — largest remainder, so rounding never drifts the week        */
/* -------------------------------------------------------------------------- */

/**
 * Round `exact` to whole multiples of `step` so the result sums to exactly
 * `total` (itself snapped to `step`). Largest-remainder: floor everything, then
 * hand the leftover units to the largest fractional parts.
 */
function apportion(exact: number[], total: number, step: number): number[] {
	if (exact.length === 0) return []
	const units = Math.max(exact.length, Math.round(total / step))
	const raw = exact.map((value) => Math.max(0, value) / step)
	const floors = raw.map((value) => Math.max(1, Math.floor(value)))
	let left = units - floors.reduce((sum, value) => sum + value, 0)

	const order = raw
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder)

	let cursor = 0
	while (left > 0) {
		floors[order[cursor % order.length]!.index]! += 1
		left -= 1
		cursor += 1
	}
	// Negative leftover means the floors already overshot (every session was
	// pinned to at least one unit); shave the biggest until it fits.
	while (left < 0) {
		const biggest = floors.reduce(
			(best, value, index) => (value > floors[best]! ? index : best),
			0,
		)
		if (floors[biggest]! <= 1) break
		floors[biggest]! -= 1
		left += 1
	}
	return floors.map((value) => value * step)
}

/* -------------------------------------------------------------------------- */
/* Session composition                                                         */
/* -------------------------------------------------------------------------- */

type SessionDraft = {
	discipline: Discipline
	currency: Currency
	kind: SessionKind
	archetype: string
	title: string
	/** Un-rounded volume, in `currency`. */
	exact: number
	/** Un-rounded rep volume inside the session, for a quality session. */
	repExact: number
	intensityKey:
		| 'recovery'
		| 'easy'
		| 'long'
		| 'threshold'
		| 'vo2'
		| 'reps'
		| 'race'
	cap: string | null
	provenance: Provenance
}

/**
 * How intensity is written when the athlete has no threshold for it — a zone
 * label or an RPE, never a fabricated pace or power number (ADR 0008).
 */
function intensityText(
	key: SessionDraft['intensityKey'],
	basis: IntensityBasis,
): string {
	const anchorFor = (
		zone: number,
		rpe: number,
		pace: string,
		power: string,
	) => {
		switch (basis) {
			case 'pace':
				return pace
			case 'power':
				return power
			case 'hr':
				return `Z${zone} HR`
			case 'zone':
				return `Zone ${zone}`
			case 'rpe':
				return `RPE ${rpe}`
		}
	}
	switch (key) {
		case 'recovery':
			return anchorFor(1, 2, 'Zone 1', 'Zone 1')
		case 'easy':
			return anchorFor(2, 4, 'Easy pace', 'Zone 2')
		case 'long':
			return anchorFor(2, 4, 'Easy pace', 'Zone 2')
		case 'threshold':
			return `4×8 min @ ${anchorFor(4, 7, 'threshold pace', 'FTP')}`
		case 'vo2':
			return `5×3 min @ ${anchorFor(5, 9, '3–5 k pace', '110 % FTP')}`
		case 'reps':
			return `8×200 m @ ${anchorFor(5, 9, '1500 m pace', 'max')}`
		case 'race':
			return 'Race effort'
	}
}

const PROVENANCES: Provenance[] = [
	'corpus',
	'convention',
	'hand-written',
	'community',
]

/**
 * The drafts for one track's week.
 *
 * Priority order, which is the whole point: the **long session takes its capped
 * share first**, the quality sessions take their capped doses, and the easy
 * sessions absorb whatever is left. Nothing is sized by "1/n of the week", and
 * no session is allowed to outgrow the long one.
 */
function draftTrackWeek({
	discipline,
	currency,
	target,
	sessions,
	quality,
	role,
	sharpPhase,
	isRaceTrack,
}: {
	discipline: Discipline
	currency: Currency
	target: number
	sessions: number
	quality: number
	role: WeekRole
	sharpPhase: boolean
	/** Whether race day belongs to this track — a triathlon has one race day. */
	isRaceTrack: boolean
}): SessionDraft[] {
	const min = minSessionFor(currency, discipline)
	// No session below the minimum: drop sessions until each can clear it.
	// CONVENTION (not corpus): the floor outranks the taper's "keep frequency",
	// so a deeply tapered beginner week loses a session rather than gain a 2 km run.
	const count = Math.max(1, Math.min(sessions, Math.floor(target / min) || 1))

	if (role === 'race') {
		// workouts-running.md:508 (Race week) — a primer, not a workout.
		const drafts: SessionDraft[] = []
		const race = isRaceTrack ? Math.max(min, target * 0.5) : 0
		if (isRaceTrack) {
			drafts.push({
				discipline,
				currency,
				kind: 'race',
				archetype: 'race',
				title: 'Race day',
				exact: race,
				repExact: 0,
				intensityKey: 'race',
				cap: null,
				provenance: 'hand-written',
			})
		}
		const primers = Math.max(1, Math.min(count - drafts.length, 2))
		const rest = Math.max(0, target - race)
		for (let i = 0; i < primers; i++) {
			drafts.push({
				discipline,
				currency,
				kind: i === 0 ? 'easy' : 'recovery',
				archetype: i === 0 ? 'strides' : 'recovery',
				title: i === 0 ? 'Primer + strides' : 'Shakeout',
				exact: rest / primers,
				repExact: 0,
				intensityKey: i === 0 ? 'easy' : 'recovery',
				cap: 'Race week: a primer, not a workout (workouts-running.md:508)',
				provenance: 'corpus',
			})
		}
		return drafts
	}

	const drafts: SessionDraft[] = []
	// CONVENTION (not corpus): a week of fewer than three sessions has no long
	// session — with two runs there is no "long one", just two runs.
	const wantsLong = count >= 3
	// workouts-running.md:185/:189 — 25–30 % of the week, and ~26 km absolute.
	const longShare =
		role === 'loading' ? LONG_RUN_SHARE.loading : LONG_RUN_SHARE.reduced
	const longExact = wantsLong
		? Math.min(target * longShare, longRunAbsoluteCap(currency, discipline))
		: 0
	if (wantsLong) {
		drafts.push({
			discipline,
			currency,
			kind: 'long',
			archetype: 'long',
			title: role === 'recovery' ? 'Steady' : 'Long',
			exact: longExact,
			repExact: 0,
			intensityKey: 'long',
			cap: `Long capped at ${Math.round(longShare * 100)} % of the week (workouts-running.md:185)`,
			provenance: 'corpus',
		})
	}

	// A recovery week keeps its frequency but drops the quality; a taper keeps
	// intensity *and* frequency (workouts-running.md:503-508).
	const qualityCount =
		role === 'recovery'
			? 0
			: Math.max(0, Math.min(quality, count - (wantsLong ? 2 : 1)))
	const easyCount = Math.max(0, count - (wantsLong ? 1 : 0) - qualityCount)

	// What is left after the long run, shared between the quality and easy days —
	// a quality day is `QUALITY_SESSION_TILT` of an easy day, never more than the
	// long run.
	const remainder = Math.max(0, target - longExact)
	const weight = qualityCount * QUALITY_SESSION_TILT + easyCount
	const easyBase = weight > 0 ? remainder / weight : 0
	const qualityExact = Math.min(
		easyBase * QUALITY_SESSION_TILT,
		wantsLong ? longExact : Number.POSITIVE_INFINITY,
	)
	const easyExact =
		easyCount > 0
			? (remainder - qualityCount * qualityExact) / easyCount
			: easyBase

	// CONVENTION (not corpus): threshold leads every week; the second key day is
	// reps in a base phase and VO2 in a sharpening one, since the corpus' phase
	// table puts C (threshold) everywhere and D (VO2) in build and peak.
	const qualityOrder: ('threshold' | 'vo2' | 'reps')[] = sharpPhase
		? ['threshold', 'vo2', 'reps']
		: ['threshold', 'reps', 'vo2']

	for (let i = 0; i < qualityCount; i++) {
		const kind = qualityOrder[i % qualityOrder.length]!
		// workouts-running.md:264 / :336 — the rep dose inside the session.
		const repExact = Math.min(target * REP_SHARE[kind], qualityExact * 0.55)
		drafts.push({
			discipline,
			currency,
			kind: 'quality',
			archetype: kind,
			title:
				kind === 'threshold'
					? 'Threshold'
					: kind === 'vo2'
						? 'Intervals'
						: 'Reps',
			exact: Math.max(min, qualityExact),
			repExact,
			intensityKey: kind,
			cap: `${kind === 'reps' ? 'R' : 'I'} reps capped at ${Math.round(REP_SHARE[kind] * 100)} % of the week (workouts-running.md:${kind === 'reps' ? '336' : '264'})`,
			provenance: 'corpus',
		})
	}

	// Easy absorbs the remainder — workouts-running.md:153.
	for (let i = 0; i < easyCount; i++) {
		const recovery = role !== 'loading' && i === easyCount - 1 && easyCount > 1
		drafts.push({
			discipline,
			currency,
			kind: recovery ? 'recovery' : 'easy',
			archetype: recovery ? 'recovery' : i === 0 ? 'strides' : 'easy',
			title: recovery ? 'Recovery' : i === 0 ? 'Easy + strides' : 'Easy',
			exact: Math.max(min, easyExact),
			repExact: 0,
			intensityKey: recovery ? 'recovery' : 'easy',
			cap:
				i === 0
					? 'Easy volume is 75–85 % of the week (workouts-running.md:153)'
					: null,
			provenance: i === 0 ? 'corpus' : 'convention',
		})
	}

	return drafts
}

/* -------------------------------------------------------------------------- */
/* Day assignment                                                              */
/* -------------------------------------------------------------------------- */

// CONVENTION (not corpus): the long session takes Saturday if it is available,
// else Sunday, else the last trainable day; quality sessions are then spread as
// far apart as the remaining days allow; easy sessions fill what is left, and
// only then does a second session land on a day already used (a double).
function assignDays(
	drafts: SessionDraft[],
	trainableDays: Day[],
	allowDoubles: boolean,
): Day[] {
	const days = (trainableDays.length > 0 ? trainableDays : DAYS)
		.slice()
		.sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b))
	const used = new Map<Day, number>()
	const assigned = new Array<Day | null>(drafts.length).fill(null)

	const take = (day: Day) => {
		used.set(day, (used.get(day) ?? 0) + 1)
		return day
	}
	const free = () => days.filter((day) => !used.has(day))

	// Long first.
	const longIndex = drafts.findIndex(
		(draft) => draft.kind === 'long' || draft.kind === 'race',
	)
	if (longIndex >= 0) {
		const preferred =
			days.find((day) => day === 'Sat') ??
			days.find((day) => day === 'Sun') ??
			days[days.length - 1]!
		assigned[longIndex] = take(preferred)
	}

	// Quality, spread as far from each other and from the long day as possible.
	for (const [index, draft] of drafts.entries()) {
		if (draft.kind !== 'quality') continue
		const candidates = free()
		if (candidates.length === 0) continue
		const busy = [...used.keys()].map((day) => DAYS.indexOf(day))
		const best = candidates.reduce((bestDay, day) => {
			const distance = Math.min(
				...busy.map((position) => Math.abs(DAYS.indexOf(day) - position)),
			)
			const bestDistance = Math.min(
				...busy.map((position) => Math.abs(DAYS.indexOf(bestDay) - position)),
			)
			return distance > bestDistance ? day : bestDay
		}, candidates[0]!)
		assigned[index] = take(best)
	}

	// Everything else fills the free days, then doubles up on the lightest day.
	for (const [index, draft] of drafts.entries()) {
		if (assigned[index]) continue
		const candidates = free()
		if (candidates.length > 0) {
			assigned[index] = take(candidates[0]!)
			continue
		}
		if (!allowDoubles) {
			// Nowhere left and no doubles allowed: stack it on the lightest day
			// anyway rather than emit a session with no day at all. The caller
			// prevents this by clamping the session count first.
			void draft
		}
		const lightest = days.reduce(
			(best, day) =>
				(used.get(day) ?? 0) < (used.get(best) ?? 0) ? day : best,
			days[0]!,
		)
		assigned[index] = take(lightest)
	}

	return assigned.map((day, index) => day ?? days[index % days.length]!)
}

/* -------------------------------------------------------------------------- */
/* buildSeason                                                                 */
/* -------------------------------------------------------------------------- */

/** One track's input to the builder: what to plan and how much of it. */
export type SeasonTrackInput = {
	discipline: Discipline
	currency: Currency
	/** The confirmed Season Anchor, per week, in `currency`. */
	anchor: number
	/** How intensity may be written for this discipline. */
	intensityBasis: IntensityBasis
}

export type SeasonInput = {
	/** Every track the athlete authored, primary first. Never empty. */
	tracks: SeasonTrackInput[]
	presetKey: string
	/** The athlete's Training Availability. Empty falls back to all seven days. */
	trainableDays: Day[]
	/** Monday of week 1. Defaults to `SEASON_START_MONDAY`. */
	startMonday?: string
	/** Season length. Defaults to the preset's own 18. Clamped 6–30. */
	weeks?: number
	/**
	 * Which track race day belongs to. A triathlon still has *one* race day, so
	 * only one track gets a `race` session. Defaults to the primary track.
	 */
	raceDiscipline?: Discipline
}

/**
 * The maximum sessions a week can hold: one per trainable day, plus a double
 * day where the corpus allows one.
 *
 * workouts-running.md:248 — "doubles presuppose the A4 volume base and are
 * inappropriate below ~80 km/wk".
 *
 * CONVENTION (not corpus): a multi-track athlete also gets extra slots, one per
 * extra track, because a triathlete has three disciplines and one week.
 */
function capacityFor(
	trainableDays: Day[],
	tracks: SeasonTrackInput[],
	totalRunEquivalentKm: number,
): number {
	const days = (trainableDays.length > 0 ? trainableDays : DAYS).length
	const doubles = totalRunEquivalentKm >= 80 ? 1 : 0
	const multiTrack = Math.min(tracks.length - 1, Math.floor(days / 2))
	return days + doubles + multiTrack
}

/**
 * Deterministically expand confirmed Season Anchors plus a Periodization Preset
 * into a season of weeks.
 *
 * Pure: same input, same season — no clock, no randomness, no I/O. Session
 * counts come from the athlete's **level band** and are then clamped by their
 * trainable weekdays; every session volume is a whole unit of its currency and
 * the rounded sessions sum to exactly the week's target.
 */
export function buildSeason(input: SeasonInput): Week[] {
	const preset =
		PRESETS.find((p) => p.key === input.presetKey) ??
		PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!
	const total = Math.max(6, Math.min(30, input.weeks ?? preset.weeks))
	const startMonday = input.startMonday ?? SEASON_START_MONDAY
	const phases = phaseForEachWeek(preset, total)
	const loads = loadForEachWeek(preset, total)
	const tracks = input.tracks.length > 0 ? input.tracks : []
	if (tracks.length === 0) return []

	// Level per track, then the week's session budget shared between them.
	const levels = tracks.map((track) =>
		describeLevel(track.anchor, track.currency, track.discipline),
	)
	const totalRunEquivalentKm = levels.reduce(
		(sum, level) => sum + level.runEquivalentKm,
		0,
	)
	const capacity = capacityFor(
		input.trainableDays,
		tracks,
		totalRunEquivalentKm,
	)
	const wanted = levels.map((level) => level.sessions)
	const sessionsPerTrack = shareSessions(wanted, capacity)
	const doublesAllowed =
		totalRunEquivalentKm >= 80 || tracks.length > 1
			? true
			: levels.some((level) => level.doublesAllowed)

	// Where the taper block starts, so its cut can deepen week by week.
	const taperWeeks = phases
		.map((phase, index) => ({ phase, index }))
		.filter(({ phase }) => phase.toLowerCase().includes('taper'))
		.map(({ index }) => index)

	return phases.map((phase, i) => {
		const index = i + 1
		const load = loads[i] ?? 0.5
		const previousLoad = i === 0 ? 0 : (loads[i - 1] ?? 0)
		const role = roleFor(phase, index, total, load, previousLoad)
		const taperProgress =
			taperWeeks.length > 1
				? Math.max(0, taperWeeks.indexOf(i)) / (taperWeeks.length - 1)
				: 1
		const sharpPhase = isSharpPhase(phase)
		const raceDiscipline = input.raceDiscipline ?? tracks[0]!.discipline

		const weekTracks: WeekTrack[] = tracks.map((track, t) => {
			const level = levels[t]!
			const step = CURRENCY_STEP[track.currency]
			const target = roundToStep(
				targetFor(track.anchor, load, role, taperProgress),
				step,
			)
			const quality = sharpPhase ? level.quality[1] : level.quality[0]
			const drafts = draftTrackWeek({
				discipline: track.discipline,
				currency: track.currency,
				target,
				sessions: sessionsPerTrack[t]!,
				quality,
				role,
				sharpPhase,
				isRaceTrack: track.discipline === raceDiscipline,
			})
			const values = apportion(
				drafts.map((draft) => draft.exact),
				target,
				step,
			)
			const actual = values.reduce((sum, value) => sum + value, 0)
			const repVolume = drafts.reduce((sum, draft) => sum + draft.repExact, 0)
			const long = drafts.findIndex((draft) => draft.kind === 'long')

			const sessions: Session[] = drafts.map((draft, s) => ({
				day: 'Mon' as Day, // replaced below, once every track is drafted
				discipline: draft.discipline,
				archetype: draft.archetype,
				title: draft.title,
				kind: draft.kind,
				value: values[s]!,
				currency: draft.currency,
				volume: formatVolume(values[s]!, draft.currency),
				intensity: intensityText(draft.intensityKey, track.intensityBasis),
				provenance: draft.provenance ?? PROVENANCES[(i + s) % 4]!,
				cap: draft.cap,
			}))

			return {
				discipline: track.discipline,
				currency: track.currency,
				targetVolume: roundToStep(actual, step),
				sessions,
				longRun: long >= 0 ? values[long]! : null,
				longRunShare: long >= 0 && actual > 0 ? values[long]! / actual : 0,
				easyShare: actual > 0 ? 1 - repVolume / actual : 1,
				quality: drafts.filter((draft) => draft.kind === 'quality').length,
				level,
			}
		})

		// One day assignment across every track, so the week is a real week.
		const flat = weekTracks.flatMap((track) => track.sessions)
		const draftsForDays: SessionDraft[] = flat.map((session) => ({
			discipline: session.discipline,
			currency: session.currency,
			kind: session.kind,
			archetype: session.archetype,
			title: session.title,
			exact: session.value,
			repExact: 0,
			intensityKey: 'easy',
			cap: null,
			provenance: session.provenance,
		}))
		const days = assignDays(draftsForDays, input.trainableDays, doublesAllowed)
		flat.forEach((session, s) => {
			session.day = days[s]!
		})

		return {
			weekKey: mondayOf(startMonday, index),
			index,
			phase,
			role,
			targetVolume: weekTracks[0]!.targetVolume,
			currency: weekTracks[0]!.currency,
			sessions: [...flat].sort(
				(a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day),
			),
			tracks: weekTracks,
		}
	})
}

/**
 * Share `capacity` session slots between tracks that together want more,
 * largest-remainder again, with a floor of one slot each.
 */
function shareSessions(wanted: number[], capacity: number): number[] {
	const total = wanted.reduce((sum, value) => sum + value, 0)
	if (total <= capacity) return wanted
	const scaled = wanted.map((value) => (value / total) * capacity)
	const floors = scaled.map((value) => Math.max(1, Math.floor(value)))
	let left = capacity - floors.reduce((sum, value) => sum + value, 0)
	const order = scaled
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder)
	let cursor = 0
	while (left > 0 && order.length > 0) {
		floors[order[cursor % order.length]!.index]! += 1
		left -= 1
		cursor += 1
	}
	return floors
}

/**
 * Re-size one track's week to `target`, keeping its session mix and re-rounding
 * every session to a whole unit of the currency so the parts still sum to the
 * whole.
 *
 * This is what a direct-manipulation surface needs when the athlete drags a
 * single week's bar: the shape of the week is already right, only its size
 * changed, and the sessions must stay whole km rather than become `4.2 km`.
 */
export function rescaleWeekTrack(track: WeekTrack, target: number): WeekTrack {
	const step = CURRENCY_STEP[track.currency]
	const snapped = roundToStep(Math.max(step, target), step)
	const current = track.sessions.reduce(
		(sum, session) => sum + session.value,
		0,
	)
	const factor = current > 0 ? snapped / current : 1
	const values = apportion(
		track.sessions.map((session) => session.value * factor),
		snapped,
		step,
	)
	const actual = values.reduce((sum, value) => sum + value, 0)
	const longIndex = track.sessions.findIndex(
		(session) => session.kind === 'long',
	)
	return {
		...track,
		targetVolume: roundToStep(actual, step),
		sessions: track.sessions.map((session, s) => ({
			...session,
			value: values[s]!,
			volume: formatVolume(values[s]!, session.currency),
		})),
		longRun: longIndex >= 0 ? values[longIndex]! : null,
		longRunShare:
			longIndex >= 0 && actual > 0 ? values[longIndex]! / actual : 0,
	}
}

/* -------------------------------------------------------------------------- */
/* Season summary — what a variant shows to prove the plan adapted            */
/* -------------------------------------------------------------------------- */

export type SeasonSummary = {
	weeks: number
	/** Sessions in the season's first loading week. */
	sessionsPerWeek: number
	/** The primary track's peak week target. */
	peakVolume: number
	currency: Currency
	/** Long-run volume and share in that same week. */
	longRun: number | null
	longRunShare: number
	easyShare: number
	level: LevelDescription
}

/** The one week a variant should quote when it wants to show the adaptation. */
export function summarizeSeason(season: Week[]): SeasonSummary | null {
	const reference =
		season.find((week) => week.role === 'loading') ?? season[0] ?? null
	if (!reference) return null
	const primary = reference.tracks[0]!
	return {
		weeks: season.length,
		sessionsPerWeek: reference.sessions.length,
		peakVolume: season.reduce(
			(most, week) => Math.max(most, week.targetVolume),
			0,
		),
		currency: primary.currency,
		longRun: primary.longRun,
		longRunShare: primary.longRunShare,
		easyShare: primary.easyShare,
		level: primary.level,
	}
}

/* -------------------------------------------------------------------------- */
/* What the route hands every variant                                          */
/* -------------------------------------------------------------------------- */

/** The props each variant takes. The loader in `plan.prototype.tsx` fills them. */
export type VariantProps = {
	athlete: PrototypeAthlete
	/** The athlete's own future Target Event. */
	event: PrototypeEvent
	/** Every future event of theirs, the goal first. Often just the one. */
	events: PrototypeEvent[]
	/** Monday of the season's first week. */
	seasonStartMonday: string
	/** Complete Training Weeks from `seasonStartMonday` to race day. */
	seasonWeeks: number
}

/**
 * The order a surface should show an athlete's Training Tracks in: the biggest
 * slice of their week first, measured in run-equivalent km so a triathlete's
 * 4 km of swimming does not outrank their 170 km of cycling.
 *
 * The lead track is the one whose numbers a headline should quote. It is not
 * taken from the Target Event, because a triathlon's `discipline` is whichever
 * leg happens to be listed first — which for a 70.3 is the smallest one.
 *
 * A single-discipline athlete has exactly one track, so this is a no-op for
 * them, and a surface that renders one row per entry shows them one row.
 */
export function orderTracks(tracks: PrototypeTrack[]): PrototypeTrack[] {
	return [...tracks].sort(
		(a, b) =>
			describeLevel(b.proposedAnchor, b.currency, b.discipline)
				.runEquivalentKm -
			describeLevel(a.proposedAnchor, a.currency, a.discipline).runEquivalentKm,
	)
}

/** `buildSeason` input for an athlete who confirmed every proposed anchor. */
export function tracksFor(
	athlete: PrototypeAthlete,
	anchors?: Partial<Record<Discipline, number>>,
): SeasonTrackInput[] {
	return athlete.tracks.map((track) => ({
		discipline: track.discipline,
		currency: track.currency,
		anchor: anchors?.[track.discipline] ?? track.proposedAnchor,
		intensityBasis: track.intensityBasis,
	}))
}
