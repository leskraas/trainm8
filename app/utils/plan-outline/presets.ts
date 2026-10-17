// The built-in **periodization presets**: a season's *shape*, never its *size*.
//
// **Five families, three lengths each.** A family — classic 3:1, masters 2:1,
// big base, polarized 80/20, threshold focus — is the shape: which blocks, in which order, on which rhythm, with
// which ramp, step and mix. A *variant* changes one thing and one thing only, the
// week count of each block, so that a family has a short, a standard and a long
// season in it. That is why the variants of a family are built from **one**
// `PhaseShape[]` and a list of week counts rather than written out three times:
// two shapes in a family that disagreed about anything but length would be two
// families wearing one name.
//
// The nine distinct lengths — 11, 12, 14, 18, 19, 21, 24, 25 and 27 weeks
// (polarized and threshold focus run Klassisk's) — put every
// run-in from ten to twenty-seven weeks within **two weeks** of a shipped shape.
// That is the whole reason for the breadth: a shape still stretches nothing, so
// coverage has to come from *how many shapes there are*, and the remainder from
// the documented shortening rule in `fit-proposal.ts` (base absorbs first, the
// taper never).
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
// Phases are **fixed length**. A preset applied to a run-in it does not fill
// *shows* that the plan ends before or after the Event (`eventFit`) rather than
// stretching the durations the preset exists to recommend. There is nowhere in
// this module to pass a horizon, which is what makes that structural — and it is
// unchanged by there being fifteen shapes instead of three. A shape that fitted
// itself to the run-in would be a different recommendation for every athlete;
// fifteen shapes are fifteen recommendations, each of them the same season whoever
// picks it.
//
// Applying one **copies it in**. The rows written are ordinary phases and
// segments, editable afterwards through every existing edit path, with no live
// reference back and no `presetKey` column recording where they came from
// (ADR 0044 §2, #371). What *is* recorded since #505 S7 is the **family**
// (`PlanOutline.family`): a plan's philosophy is something the athlete can
// see and switch, and its rounds follow it — the length and every number
// still copy in and stay editable.
//
// Block and reverse periodization are deferred on evidence alone, the vocabulary
// objection having dissolved once phase names became free text. Re-adding either
// is a change to this file and the two tests that count what ships — no schema,
// no migration, no ADR.

import { invariant } from '@epic-web/invariant'
import {
	rhythmPeriod,
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

/**
 * One phase of a **family's** shape with its length left out.
 *
 * The family says what the block *is* — its name, its rhythm, whether it tapers,
 * how it climbs and what quality it carries. A variant says only how long it
 * runs. Splitting the type this way is what stops a "short classic" from drifting
 * into a different season from the classic it is a length of.
 */
type PhaseShape = Omit<PresetPhase, 'weeks'>

export const PRESET_KEYS = [
	'classic-linear-short',
	'classic-linear',
	'classic-linear-long',
	'masters-2-1-short',
	'masters-2-1',
	'masters-2-1-long',
	'big-base-short',
	'big-base',
	'big-base-long',
	'polarized-short',
	'polarized',
	'polarized-long',
	'threshold-focus-short',
	'threshold-focus',
	'threshold-focus-long',
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
 * One family at one length.
 *
 * The invariant is the point: a variant supplies exactly one week count per phase
 * of its family's shape, so it cannot add a block, drop one, or reorder them. The
 * only axis a variant moves on is length.
 */
function atLength(
	key: PresetKey,
	name: string,
	provenance: string,
	shape: PhaseShape[],
	weeks: number[],
): PeriodizationPreset {
	invariant(
		shape.length === weeks.length,
		`Preset ${key} gives ${weeks.length} week counts for ${shape.length} blocks`,
	)
	return {
		key,
		name,
		provenance,
		phases: shape.map((phase, index) => ({ ...phase, weeks: weeks[index]! })),
	}
}

/**
 * Classic **3:1 linear**, the Friel-family default: a base that climbs at the
 * convention with every fourth week recovering, a build at the same rate under
 * threshold work, a short peak, and a taper.
 *
 * Its shortest variant runs a four-week base, which is the floor for this
 * family rather than a preference: a 3:1 block shorter than four weeks contains
 * no recovery week at all, so the rhythm the shape is named for would not appear
 * in it.
 */
const CLASSIC_SHAPE: PhaseShape[] = [
	{
		name: 'Base',
		rhythm: '3:1',
		tapers: false,
		ramp: PRESET_RAMP,
		boundaryStep: null,
		mix: [{ zone: 3, sessionsPerWeek: 1 }],
	},
	{
		name: 'Build',
		rhythm: '3:1',
		tapers: false,
		ramp: PRESET_RAMP,
		boundaryStep: null,
		mix: [{ zone: 4, sessionsPerWeek: 2 }],
	},
	{
		name: 'Peak',
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
		rhythm: 'none',
		tapers: true,
		ramp: null,
		boundaryStep: null,
		mix: [],
	},
]

/**
 * **Masters 2:1**: the same progression on a two-weeks-on, one-week-easy rhythm,
 * so a third of the season recovers rather than a quarter of it.
 *
 * The rhythm is the whole difference. The ramp is unchanged, because it is a rate
 * per *loading* week and recovering more often already makes the season accumulate
 * more gently — discounting the rate as well would cut twice for one reason.
 *
 * It is also the family that compresses furthest, and for a structural reason
 * rather than a coaching one: a 2:1 block still recovers at three weeks where a
 * 3:1 block needs four. That is why the **shortest shape the app ships is a
 * masters one**.
 */
const MASTERS_SHAPE: PhaseShape[] = CLASSIC_SHAPE.map((phase) => ({
	...phase,
	rhythm: phase.rhythm === '3:1' ? ('2:1' as const) : phase.rhythm,
}))

/**
 * **Big base / pyramidal**: most of the season spent accumulating easy volume,
 * then a **Block Boundary Step** down as the quality goes up.
 *
 * The step is what makes the profile a pyramid rather than a ramp — the picture
 * the athlete is choosing between is exactly this difference — and it is authored
 * intent, so nothing flags it.
 *
 * The base is **all easy**: an empty Quality Session Mix, so the first block —
 * and with it every open-ended round, which reads it — lays no hard session
 * (ADR 0102 §3). That is what sets _Stor base_ apart from _Klassisk 3:1_ in
 * the weeks the athlete actually sees. Tracks already written keep the mix
 * they were stored with until a philosophy is re-applied.
 */
const BIG_BASE_SHAPE: PhaseShape[] = [
	{
		name: 'Big base',
		rhythm: '3:1',
		tapers: false,
		ramp: PRESET_RAMP,
		boundaryStep: null,
		mix: [],
	},
	{
		name: 'Build',
		rhythm: '3:1',
		tapers: false,
		ramp: null,
		boundaryStep: PRESET_BOUNDARY_DROP,
		mix: [{ zone: 4, sessionsPerWeek: 2 }],
	},
	{
		name: 'Peak',
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
		rhythm: 'none',
		tapers: true,
		ramp: null,
		boundaryStep: null,
		mix: [],
	},
]

/**
 * **Polarized 80/20**: Klassisk's blocks and rhythm, with the quality at the
 * two ends of the scale and next to nothing in the middle — most of the week
 * easy, and what is hard is very hard (zone 5), with no threshold or tempo
 * session in any block (Seiler's polarized model, counted in sessions, the
 * session-goal method ADR 0040 §2 admits).
 *
 * The **Quality Session Mix** is the whole difference from Klassisk, which is
 * why the blocks, the rhythm, the ramp and the lengths are Klassisk's: a
 * family that changed two things at once would not say which of them the
 * athlete chose.
 */
const POLARIZED_SHAPE: PhaseShape[] = CLASSIC_SHAPE.map((phase, index) => ({
	...phase,
	mix: phase.tapers
		? []
		: [{ zone: 5 as const, sessionsPerWeek: index === 0 ? 1 : 2 }],
}))

/**
 * **Threshold focus**: Klassisk's blocks and rhythm, built around threshold and
 * tempo work — zones 3 and 4, two sessions a week, and no zone 5 at all. The
 * opposite end from polarized: the hard work sits in the middle of the scale,
 * where Klassisk saves it for the build. As with polarized, only the mix
 * differs from Klassisk.
 */
const THRESHOLD_SHAPE: PhaseShape[] = CLASSIC_SHAPE.map((phase, index) => ({
	...phase,
	mix: phase.tapers
		? []
		: index === 1
			? [{ zone: 4 as const, sessionsPerWeek: 2 }]
			: [
					{ zone: 3 as const, sessionsPerWeek: 1 },
					{ zone: 4 as const, sessionsPerWeek: 1 },
				],
}))

// Which weeks go where, per variant. The **Peak** and the **Taper** hold at two
// weeks in every one of the fifteen: they are the blocks that are about the Event
// rather than about accumulation, so shortening a season shortens the run-up to
// it and never the sharpening at the end — the same ordering the fitting rule
// states (`fit-proposal.ts`), expressed here in what ships rather than in what a
// resize does.

const BY_KEY: Record<PresetKey, PeriodizationPreset> = {
	'classic-linear-short': atLength(
		'classic-linear-short',
		'Classic 3:1 linear, short run-in',
		'The same three-on, one-easy season over fewer weeks.',
		CLASSIC_SHAPE,
		[4, 4, 2, 2],
	),
	'classic-linear': atLength(
		'classic-linear',
		'Classic 3:1 linear',
		'Friel’s classic three-weeks-on, one-week-easy season.',
		CLASSIC_SHAPE,
		[8, 6, 2, 2],
	),
	'classic-linear-long': atLength(
		'classic-linear-long',
		'Classic 3:1 linear, long run-in',
		'The same three-on, one-easy season over more weeks.',
		CLASSIC_SHAPE,
		[12, 8, 2, 2],
	),
	'masters-2-1-short': atLength(
		'masters-2-1-short',
		'Masters 2:1, short run-in',
		'Two weeks on, one easy — the shortest season the app ships.',
		MASTERS_SHAPE,
		[4, 3, 2, 2],
	),
	'masters-2-1': atLength(
		'masters-2-1',
		'Masters 2:1',
		'Two weeks on, one easy — more frequent recovery across the season.',
		MASTERS_SHAPE,
		[9, 6, 2, 2],
	),
	'masters-2-1-long': atLength(
		'masters-2-1-long',
		'Masters 2:1, long run-in',
		'Two weeks on, one easy, held across a long season.',
		MASTERS_SHAPE,
		[12, 9, 2, 2],
	),
	'big-base-short': atLength(
		'big-base-short',
		'Big base / pyramidal, short run-in',
		'Aerobic base first even on a short run-in, then volume steps down.',
		BIG_BASE_SHAPE,
		[7, 3, 2, 2],
	),
	'big-base': atLength(
		'big-base',
		'Big base / pyramidal',
		'A long aerobic base, then volume steps down as intensity arrives.',
		BIG_BASE_SHAPE,
		[12, 5, 2, 2],
	),
	'big-base-long': atLength(
		'big-base-long',
		'Big base / pyramidal, long run-in',
		'A very long aerobic base, then volume steps down as intensity arrives.',
		BIG_BASE_SHAPE,
		[16, 7, 2, 2],
	),
	// Polarized and threshold focus are Klassisk's season at Klassisk's lengths
	// with a different mix, so they run Klassisk's week counts too.
	'polarized-short': atLength(
		'polarized-short',
		'Polarized 80/20, short run-in',
		'Mostly easy, a little very hard — over fewer weeks.',
		POLARIZED_SHAPE,
		[4, 4, 2, 2],
	),
	polarized: atLength(
		'polarized',
		'Polarized 80/20',
		'Seiler’s polarized model: most sessions easy, the hard ones very hard.',
		POLARIZED_SHAPE,
		[8, 6, 2, 2],
	),
	'polarized-long': atLength(
		'polarized-long',
		'Polarized 80/20, long run-in',
		'Mostly easy, a little very hard — over more weeks.',
		POLARIZED_SHAPE,
		[12, 8, 2, 2],
	),
	'threshold-focus-short': atLength(
		'threshold-focus-short',
		'Threshold focus, short run-in',
		'Built around tempo and threshold work, over fewer weeks.',
		THRESHOLD_SHAPE,
		[4, 4, 2, 2],
	),
	'threshold-focus': atLength(
		'threshold-focus',
		'Threshold focus',
		'Built around tempo and threshold work, with no very hard sessions.',
		THRESHOLD_SHAPE,
		[8, 6, 2, 2],
	),
	'threshold-focus-long': atLength(
		'threshold-focus-long',
		'Threshold focus, long run-in',
		'Built around tempo and threshold work, over more weeks.',
		THRESHOLD_SHAPE,
		[12, 8, 2, 2],
	),
}

/**
 * The fifteen shapes on offer, in the order the gallery shows them: **family
 * first, length within it**. Grouping by family is what makes the three
 * pictures in a row read as one season at three lengths rather than as three
 * different seasons — the length is the axis the athlete is scanning, and it is
 * easier to scan inside a family than across fifteen unrelated cards.
 */
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

// ── Families, and the round each drives in an open-ended plan ───────────────
// A preset is a family at a length; an open-ended plan (ADR 0079) has no length
// to pick, so what it takes from a family is one block of it: one round is the
// family's opening block at its rhythm (ADR 0079 §5).

/**
 * The shipped families — each a _filosofi_ the athlete picks (#505 story 10),
 * and each the shape its three lengths share. Stored on the Outline
 * (`PlanOutline.family`) since #505 S7, so a plan can say which it follows.
 */
export const PRESET_FAMILIES = [
	'classic',
	'masters',
	'big-base',
	'polarized',
	'threshold',
] as const
export type PresetFamily = (typeof PRESET_FAMILIES)[number]

/**
 * Each family's shape and its three lengths, short to long — the one table the
 * family readers below derive from, so a family's shape, its standard length
 * and the family a key belongs to cannot disagree.
 */
const FAMILY_TABLE: Record<
	PresetFamily,
	{ shape: PhaseShape[]; keys: readonly [PresetKey, PresetKey, PresetKey] }
> = {
	classic: {
		shape: CLASSIC_SHAPE,
		keys: ['classic-linear-short', 'classic-linear', 'classic-linear-long'],
	},
	masters: {
		shape: MASTERS_SHAPE,
		keys: ['masters-2-1-short', 'masters-2-1', 'masters-2-1-long'],
	},
	'big-base': {
		shape: BIG_BASE_SHAPE,
		keys: ['big-base-short', 'big-base', 'big-base-long'],
	},
	polarized: {
		shape: POLARIZED_SHAPE,
		keys: ['polarized-short', 'polarized', 'polarized-long'],
	},
	threshold: {
		shape: THRESHOLD_SHAPE,
		keys: ['threshold-focus-short', 'threshold-focus', 'threshold-focus-long'],
	},
}

/** The family a shipped preset is a length of. */
export function familyOfPreset(key: PresetKey): PresetFamily {
	const family = PRESET_FAMILIES.find((candidate) =>
		FAMILY_TABLE[candidate].keys.includes(key),
	)
	invariant(family, `Preset ${key} belongs to no family`)
	return family
}

/**
 * A stored `PlanOutline.family` read back as a {@link PresetFamily}, or null
 * for a plan that records none (made before #505 S7, or from phases the
 * athlete typed) and for anything outside the vocabulary.
 */
export function presetFamilyOf(stored: string | null): PresetFamily | null {
	return PRESET_FAMILIES.find((family) => family === stored) ?? null
}

/**
 * How long the first round of a "Hold meg aktiv" plan runs: one 3:1 block.
 * Here rather than in `authoring.server.ts` so the plan-creation page can say
 * it without reaching into a server module.
 */
export const OPEN_ENDED_ROUND_WEEKS = 4

/**
 * One round of an open-ended plan on a family: **one block of the family's
 * opening rhythm** (ADR 0079 §5) — three loading weeks and one easy on 3:1
 * (Klassisk, big base, polarized, threshold focus), two and one for Masters
 * 2:1 — with the opening block's climb and **Quality Session Mix**, which is
 * what tells a polarized round from a threshold one. Pure; read off the
 * family's own first block, so a family whose shape changed would change its
 * rounds with it.
 */
export function openEndedRound(family: PresetFamily): {
	weeks: number
	rhythm: Rhythm
	ramp: number | null
	boundaryStep: number | null
	mix: QualitySessionMixEntry[]
} {
	const opening = FAMILY_TABLE[family].shape[0]!
	return {
		// One block of the rhythm; a family opening with no easy week (none
		// ships) would still run a four-week round.
		weeks: rhythmPeriod(opening.rhythm) || 4,
		rhythm: opening.rhythm,
		ramp: opening.ramp,
		boundaryStep: null,
		mix: opening.mix.map((entry) => ({ ...entry })),
	}
}

/**
 * The family an Outline's own phase reads as **by its rhythm alone**: 3:1 is
 * Klassisk, 2:1 is Masters. The fallback for a plan that records no family
 * ({@link outlineFamily}); null for a phase with no rhythm, which no family's
 * round has.
 */
export function familyForRhythm(rhythm: Rhythm): 'classic' | 'masters' | null {
	if (rhythm === '3:1') return 'classic'
	if (rhythm === '2:1') return 'masters'
	return null
}

/**
 * The family a plan follows: the one it records (`PlanOutline.family`), or —
 * for a plan that records none — the one its phases' rhythm reads as.
 *
 * Given one rhythm, that rhythm (a round of an open-ended plan, which the next
 * round repeats). Given the plan's **phases in order**, the first that is not a
 * taper and has a rhythm: a race plan ends in a Peak and a Taper with none
 * (audit B4), so its last phase names no family while its base does. Null when
 * no such phase exists — the plan truly follows none.
 */
export function outlineFamily(
	stored: string | null,
	rhythm: Rhythm | ReadonlyArray<{ rhythm: Rhythm; tapers: boolean }>,
): PresetFamily | null {
	const recorded = presetFamilyOf(stored)
	if (recorded) return recorded
	if (typeof rhythm === 'string') return familyForRhythm(rhythm)
	for (const phase of rhythm) {
		if (phase.tapers) continue
		const family = familyForRhythm(phase.rhythm)
		if (family) return family
	}
	return null
}

/** The family's whole season at its standard length, in order. */
export function familySeason(family: PresetFamily): PresetPhase[] {
	return presetFor(FAMILY_TABLE[family].keys[1]).phases.map((phase) => ({
		...phase,
		mix: phase.mix.map((entry) => ({ ...entry })),
	}))
}

/**
 * The family's run-up toward an Event, for a plan whose base is already behind
 * it (ADR 0079 §4): the blocks of its standard length **after** its
 * accumulating first block. In order, at the standard week counts; fitting
 * them to the weeks left is `fitRunUp`'s.
 */
export function familyRunUp(family: PresetFamily): PresetPhase[] {
	return familySeason(family).slice(1)
}
