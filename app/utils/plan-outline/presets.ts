// The three built-in **periodization presets**: a season's *shape*, never its
// *size*.
//
// An athlete starting a plan should not face a blank season. They should not have
// to read three paragraphs either — a periodization scheme is a picture, so a
// preset is picked from **an illustration of the load profile it lays down**. That
// picture is drawn by `presetProfile` from the preset's own configuration through
// the *real* derivation (`weekTargets`), so it cannot drift from what applying the
// preset produces. There is no second, hand-drawn shape to keep in step.
//
// What a preset carries, per phase: a name, a week count, a loading rhythm and
// whether it tapers. Per endurance segment: a **Volume Ramp**, an optional **Block
// Boundary Step** and a **Quality Session Mix**.
//
// What a preset deliberately does **not** carry:
//
//   - **No Volume Currency and no Season Anchor value.** Both belong to the
//     athlete's **Training Track** (ADR 0043 §1). The same preset has to land
//     correctly on a 40 km week and on a 90 km week, so it asserts the shape and
//     says nothing about the size.
//   - **No `startWeekKey`.** The **Plan Start Week** is authored on the Outline
//     (ADR 0044 §3). A preset asserting it would overrule a per-athlete decision
//     and could move weeks the athlete has already lived.
//   - **No `recoveryCut` and no `taperCut`.** Left unset, the documented
//     convention applies *and stays visible as a convention*; stored, it would
//     read as though the athlete had authored it, and a convention that moved
//     later would look like an edit to their plan (ADR 0044 §4).
//
// Phases are **fixed length**. A preset applied to a 10-week or a 24-week run-in
// *shows* that the plan ends before or after the Event (`eventFit`) rather than
// stretching the durations the preset exists to recommend. There is nowhere in
// this module to pass a horizon, which is what makes that structural.
//
// Applying one **copies it in**. The rows written are ordinary phases and
// segments, editable afterwards through every existing edit path, with no live
// reference back and no `presetKey` column recording where they came from
// (ADR 0044 §2, #371 — provenance stays unbuilt until something needs it).
//
// Block and reverse periodization are deferred on evidence alone, the vocabulary
// objection having dissolved once phase names became free text. Re-adding either
// is a change to this file and the two tests that count what ships — no schema,
// no migration, no ADR.

import { invariant } from '@epic-web/invariant'
import {
	totalWeeks,
	weekTargets,
	type EnduranceSegmentSpec,
	type PhaseSpec,
	type Rhythm,
} from './derive.ts'
import { type QualitySessionMixEntry } from './quality-mix.ts'

/**
 * The **Volume Ramp** every preset authors: **+5% per loading week**.
 *
 * A **convention**, and worded as one wherever it is shown. It is the figure the
 * planning platforms in the #374 survey converge on, and it carries **no injury
 * claim** — the 10% rule it descends from has a failed RCT behind it (Buist 2008,
 * P=.90), and the ramp guard's own documentation is bound by the same rule.
 *
 * One rate across all three presets rather than a taper of rates per phase: a
 * different number in Build than in Base would be a figure with no source, and the
 * athlete can author one the moment they want it.
 */
export const PRESET_RAMP = 0.05

/**
 * The **Block Boundary Step** the pyramidal preset authors entering an
 * intensity-led block: **−10%**.
 *
 * A deliberate drop, which is exactly what the field exists to express — volume
 * comes down as the quality goes up (ADR 0040 §4). It is intent rather than a
 * mistake, so the ramp guard has nothing to say about it, and like every other
 * number here it is the athlete's to change the moment it lands.
 */
export const PRESET_BOUNDARY_DROP = -0.1

/**
 * The unit-free anchor the preview profile is drawn against: every week reads as a
 * **percentage of the plan's opening week**.
 *
 * A preset carries no **Season Anchor** value, so its picture cannot carry one
 * either. What the illustration shows is the *shape* — where the season climbs,
 * where it recovers, where it steps down and how it tapers — and a relative index
 * is the honest way to show a shape whose size is the athlete's.
 */
export const PRESET_PROFILE_ANCHOR = 100

/**
 * One phase of a preset, carrying both what the phase authors (`name`, `weeks`,
 * `rhythm`, `tapers`) and what its endurance segment authors (`ramp`,
 * `boundaryStep`, `mix`).
 *
 * They sit together because an endurance segment spans exactly one phase, 1:1
 * (ADR 0042 §8) — splitting them here would invent a join a preset does not have.
 * The two cuts are absent from this type rather than nullable in it, so a preset
 * that tried to author one would not compile.
 */
export type PresetPhase = {
	name: string
	weeks: number
	rhythm: Rhythm
	tapers: boolean
	/** Fraction per loading week, or null for a phase that does not climb. */
	ramp: number | null
	/** The step at this phase's opening, or null for continuity — the default. */
	boundaryStep: number | null
	/** Zones 3–5, each at most once. An empty mix means "no quality sessions here". */
	mix: QualitySessionMixEntry[]
}

export const PRESET_KEYS = [
	'classic-linear',
	'masters-2-1',
	'big-base',
] as const
export type PresetKey = (typeof PRESET_KEYS)[number]

export type PeriodizationPreset = {
	key: PresetKey
	/** What the athlete calls it. Phase names are free text, so this is too. */
	name: string
	/**
	 * Where the shape comes from, one line. It sits *beside* the picture and never
	 * instead of it: the illustration is what the athlete chooses from.
	 */
	provenance: string
	phases: PresetPhase[]
}

/**
 * Classic **3:1 linear**, the Friel-family default: a long base that climbs at the
 * convention with every fourth week recovering, a build at the same rate under
 * threshold work, a short peak, and a taper.
 */
const CLASSIC_LINEAR: PeriodizationPreset = {
	key: 'classic-linear',
	name: 'Classic 3:1 linear',
	provenance: 'Friel’s classic three-weeks-on, one-week-easy season.',
	phases: [
		{
			name: 'Base',
			weeks: 8,
			rhythm: '3:1',
			tapers: false,
			ramp: PRESET_RAMP,
			boundaryStep: null,
			mix: [{ zone: 3, sessionsPerWeek: 1 }],
		},
		{
			name: 'Build',
			weeks: 6,
			rhythm: '3:1',
			tapers: false,
			ramp: PRESET_RAMP,
			boundaryStep: null,
			mix: [{ zone: 4, sessionsPerWeek: 2 }],
		},
		{
			name: 'Peak',
			weeks: 2,
			rhythm: 'none',
			tapers: false,
			ramp: null,
			boundaryStep: null,
			mix: [
				{ zone: 4, sessionsPerWeek: 1 },
				{ zone: 5, sessionsPerWeek: 1 },
			],
		},
		{
			name: 'Taper',
			weeks: 2,
			rhythm: 'none',
			tapers: true,
			ramp: null,
			boundaryStep: null,
			mix: [],
		},
	],
}

/**
 * **Masters 2:1**: the same progression on a two-weeks-on, one-week-easy rhythm,
 * so a third of the season recovers rather than a quarter of it.
 *
 * The rhythm is the whole difference. The ramp is unchanged, because it is a rate
 * per *loading* week and recovering more often already makes the season accumulate
 * more gently — discounting the rate as well would cut twice for one reason.
 */
const MASTERS_2_1: PeriodizationPreset = {
	key: 'masters-2-1',
	name: 'Masters 2:1',
	provenance:
		'Two weeks on, one easy — more frequent recovery across the season.',
	phases: [
		{
			name: 'Base',
			weeks: 9,
			rhythm: '2:1',
			tapers: false,
			ramp: PRESET_RAMP,
			boundaryStep: null,
			mix: [{ zone: 3, sessionsPerWeek: 1 }],
		},
		{
			name: 'Build',
			weeks: 6,
			rhythm: '2:1',
			tapers: false,
			ramp: PRESET_RAMP,
			boundaryStep: null,
			mix: [{ zone: 4, sessionsPerWeek: 2 }],
		},
		{
			name: 'Peak',
			weeks: 2,
			rhythm: 'none',
			tapers: false,
			ramp: null,
			boundaryStep: null,
			mix: [
				{ zone: 4, sessionsPerWeek: 1 },
				{ zone: 5, sessionsPerWeek: 1 },
			],
		},
		{
			name: 'Taper',
			weeks: 2,
			rhythm: 'none',
			tapers: true,
			ramp: null,
			boundaryStep: null,
			mix: [],
		},
	],
}

/**
 * **Big base / pyramidal**: most of the season spent accumulating easy volume,
 * then a **Block Boundary Step** down as the quality goes up.
 *
 * The step is what makes the profile a pyramid rather than a ramp — the picture
 * the athlete is choosing between is exactly this difference — and it is authored
 * intent, so nothing flags it.
 */
const BIG_BASE: PeriodizationPreset = {
	key: 'big-base',
	name: 'Big base / pyramidal',
	provenance:
		'A long aerobic base, then volume steps down as intensity arrives.',
	phases: [
		{
			name: 'Big base',
			weeks: 12,
			rhythm: '3:1',
			tapers: false,
			ramp: PRESET_RAMP,
			boundaryStep: null,
			mix: [{ zone: 3, sessionsPerWeek: 1 }],
		},
		{
			name: 'Build',
			weeks: 5,
			rhythm: '3:1',
			tapers: false,
			ramp: null,
			boundaryStep: PRESET_BOUNDARY_DROP,
			mix: [{ zone: 4, sessionsPerWeek: 2 }],
		},
		{
			name: 'Peak',
			weeks: 2,
			rhythm: 'none',
			tapers: false,
			ramp: null,
			boundaryStep: PRESET_BOUNDARY_DROP,
			mix: [
				{ zone: 4, sessionsPerWeek: 1 },
				{ zone: 5, sessionsPerWeek: 1 },
			],
		},
		{
			name: 'Taper',
			weeks: 2,
			rhythm: 'none',
			tapers: true,
			ramp: null,
			boundaryStep: null,
			mix: [],
		},
	],
}

const BY_KEY: Record<PresetKey, PeriodizationPreset> = {
	'classic-linear': CLASSIC_LINEAR,
	'masters-2-1': MASTERS_2_1,
	'big-base': BIG_BASE,
}

/** The three shapes on offer, in the order the gallery shows them. */
export const PERIODIZATION_PRESETS: PeriodizationPreset[] =
	PRESET_KEYS.map(presetFor)

/**
 * The preset a **known** key names. Total over `PresetKey`, so a caller that has
 * already parsed a key — the authoring service, whose schema admits nothing else —
 * never narrows a null it cannot reach.
 */
export function presetFor(key: PresetKey): PeriodizationPreset {
	return BY_KEY[key]
}

// There is deliberately no `findPreset(key: string)` beside `presetFor`. An
// unknown key never reaches this module: `PresetApplySchema`'s `z.enum` is the
// one gate, and a second lookup that answered `null` would be a second place for
// "this shape does not exist" to be decided.

/** The preset's phases as the derivation reads them. */
export function presetPhaseSpecs(preset: PeriodizationPreset): PhaseSpec[] {
	return preset.phases.map((phase) => ({
		weeks: phase.weeks,
		rhythm: phase.rhythm,
		tapers: phase.tapers,
	}))
}

/**
 * The preset's endurance segments as the derivation reads them — one per phase,
 * with **both cuts null**, which is how the documented convention comes to apply.
 */
export function presetSegmentSpecs(
	preset: PeriodizationPreset,
): EnduranceSegmentSpec[] {
	return preset.phases.map((phase, phaseIndex) => ({
		kind: 'endurance' as const,
		phaseIndex,
		ramp: phase.ramp,
		boundaryStep: phase.boundaryStep,
		recoveryCut: null,
		taperCut: null,
	}))
}

/** How many Training Weeks the preset lays down. Fixed: it never reads a horizon. */
export function presetWeeks(preset: PeriodizationPreset): number {
	return totalWeeks(presetPhaseSpecs(preset))
}

/**
 * The load profile the preset lays down, week by week, as a percentage of the
 * plan's opening week — the illustration the athlete chooses from.
 *
 * Derived by running the preset's *own* configuration through `weekTargets`, the
 * same function that prices the athlete's season once the preset is applied. That
 * is the point: the picture and the plan share one implementation, so the picture
 * cannot promise a shape the plan does not deliver.
 *
 * One thing still outranks it, and should. A **Week Volume Override** is the
 * athlete's explicit statement about a particular week, it survives applying
 * (ADR 0044 §5), and it short-circuits the derivation — so an athlete who has
 * hand-set a week reads that week at the number they typed rather than at the
 * share this picture drew. The illustration is faithful to the *preset*; it was
 * never a promise to overrule the athlete.
 *
 * The `currency` handed to the derivation is immaterial — `presets.test.ts` pins
 * that the profile is identical in every one — because a preset carries no
 * currency and the derivation's arithmetic is unit-free (ADR 0040 §10).
 *
 * **Every week has a value**, which is why the return type narrows `weekTargets`'
 * nullable one. `null` is its Unavailable Metric, and the two states that produce
 * it are both excluded by construction here: the anchor is in force from week 0,
 * and every week is inside the plan because the plan *is* the preset. Narrowing at
 * this seam rather than passing the nullability on spares every caller a branch
 * that cannot be reached — and an unreachable "no value" branch in a drawing
 * routine is one nobody can get right, because nobody can see it. The invariant is
 * asserted rather than assumed, so a change to the derivation that broke it would
 * fail loudly here instead of drawing a gap.
 */
export function presetProfile(preset: PeriodizationPreset): number[] {
	return weekTargets(presetPhaseSpecs(preset), {
		currency: 'km',
		anchors: [{ fromWeekIndex: 0, value: PRESET_PROFILE_ANCHOR }],
		segments: presetSegmentSpecs(preset),
		overrides: [],
	}).map((value, weekIndex) => {
		invariant(
			value != null,
			`Preset ${preset.key} derives no target for week ${weekIndex + 1}`,
		)
		return value
	})
}
