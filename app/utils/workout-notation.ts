/**
 * Workout Notation (ADR 0027, R1) — the pure, UI-free mapping from a
 * Workout → Block → Step structure to an ordered token model, and from that
 * model to the deterministic one-line **Token Sentence**
 * (`2 km warm-up → 4 × 6 min @ 4:40 /km (1 min rest) → cool-down`).
 *
 * The notation is always *rendered from* structure — never parsed from free
 * text (no grammar or parser exists). Two adapters normalize the two structure
 * sources into one input shape: persisted rows (`workoutToNotationInput`) and
 * draft Conform form values (`draftToNotationInput`); `deriveWorkoutNotation`
 * then builds the token model, and the sentence helpers serialize it.
 *
 * Design constraints, in order:
 * - **Honest facets.** Derived intensity facets (zone chip, resolved bpm/pace/
 *   watts range) come from the existing resolver (`describeStepTarget`,
 *   `intensityTargetToZone`); when a threshold is missing they are omitted or
 *   the token reduces to the Training Zone label — never an invented number
 *   (the Unavailable Metric principle, CONTEXT.md). The `equivalent` facet
 *   slot (race-pace equivalent, ADR 0027 A2) is reserved and always null.
 * - **Addressable tokens.** Every token carries a `TokenAddress`
 *   (block index / step index / form field name) so a downstream editor can
 *   bind it to its Conform field; the model itself stays DOM-free.
 * - **Separators live in the model** (`NOTATION_SEPARATORS`), not in
 *   components, and serialization is deterministic — a future free-text
 *   parser could target this token model, but none ships.
 * - **House format** is the fixed en-GB display layer (ADR 0023): all
 *   quantities render through the shared `format` module.
 */

import { type z } from 'zod'
import {
	formatDistance,
	formatDuration,
	parseDistance,
	parseDuration,
} from './format.ts'
import {
	describeStepTarget,
	parseAuthoredIntensity,
	type DisciplineThresholdMap,
} from './intensity-target.ts'
import {
	intensityTargetToZone,
	type TrainingZone,
	type Workout,
} from './session-profile.ts'
import {
	type LoadResolution,
	type ResolveContext,
	resolveLoadTarget,
} from './strength/anchors.ts'
import { formatKg } from './strength-log.ts'
import {
	EffortCapSchema,
	EXERCISE_SET_KINDS,
	LoadTargetSchema,
	RestSpecSchema,
	SendOffSchema,
	type EffortCap,
	type ExerciseSetKind,
	type IntensityTarget,
	type LoadTarget,
	type RestAct,
	type RestSpec,
	type SendOff,
} from './workout-schema.ts'
import { intensityChipText, zoneEquivalent } from './zone-equivalent.ts'

/**
 * Parse a stored union column back to its authored shape. Total: a null, a
 * malformed blob or a value this schema version no longer knows degrades to
 * null, which every renderer treats as "not stated" rather than throwing.
 */
function parseStoredJson<Schema extends z.ZodTypeAny>(
	schema: Schema,
	json: string | null | undefined,
): z.infer<Schema> | null {
	if (!json) return null
	try {
		const parsed = schema.safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

// ——— Separators ————————————————————————————————————————————————————————

/**
 * The notation's separator glyphs. Components render these from the model —
 * they are part of the notation, not styling.
 */
export const NOTATION_SEPARATORS = {
	/** Between steps and blocks: `warm-up → intervals → cool-down`. */
	step: '→',
	/** Between a repeat count and its group, and inside set counts: `4 ×`. */
	repeat: '×',
	/** Before a metric value: `@ 4:40 /km`, `@ 80 kg`. */
	value: '@',
	/** Between an intensity value and its derived facet chip: `· Z4`. */
	facet: '·',
} as const

// ——— Token model ————————————————————————————————————————————————————————

/**
 * The Conform form field a token binds to (`FormStepSchema` /
 * `FormBlockSchema` names in `workout-authoring.ts`), so the editor can wire
 * each token to `useInputControl` without a translation table.
 */
export type TokenField =
	| 'name'
	| 'repeatCount'
	| 'duration'
	| 'distance'
	// The third Step Quantity (ADR 0002) and the block's cycle time (ADR 0007).
	// Neither has an editor control yet — the Conform form does not carry them —
	// so a token addressed to one is read-only until it does. It is drawn anyway,
	// because a corpus row quantified in metres of climb renders with *no*
	// quantity at all otherwise (#451).
	| 'vertical'
	| 'sendOff'
	| 'intensity'
	| 'exerciseId'
	| 'sets'
	| 'restBetweenSetsSec'
	| 'notes'
	| 'discipline'

/** Where a token lives in the Block/Step tree; `stepIndex` is null for block-level tokens. */
export type TokenAddress = {
	blockIndex: number
	stepIndex: number | null
	field: TokenField
}

/**
 * Display-only facets derived from an intensity token's authored target.
 * Every facet is honest: null means "could not be truthfully resolved" and
 * the facet is simply not rendered — never a fabricated value.
 */
export type IntensityFacets = {
	/** Normalized zone chip (1–5) via the Workout Shape's mapping, or null. */
	zone: TrainingZone | null
	/** Resolved concrete range, e.g. `170–178 bpm` / `238–263 W`, or null. */
	range: string | null
	/**
	 * Whether `range` is a **translation** rather than arithmetic — a lactate
	 * band read through the athlete's recipe, a race pace read off a dated
	 * result. Rendered as `≈` inside the facet: `2.5–3.0 mmol/L (≈ 3:35/km)`.
	 */
	approximate: boolean
	/**
	 * Reserved slot for the *metric-authored* half of the race-pace bridge — a
	 * pace or power target annotated with the race it is equivalent to
	 * (`= HM pace`), ADR 0027 A2 as amended by #449.
	 *
	 * Still null, and for a narrower reason than A2 gave. The race-*authored*
	 * direction ships: a `racePace` target renders its portable name as the
	 * token text with the resolved pace as its facet, which is §5.3's own
	 * rendering and needs no second slot. This direction is the inverse, and it
	 * needs the **Race Equivalence** conversion ladder — converting an absolute
	 * pace back to "which race is this?" requires the equivalence model and its
	 * distance-ratio confidence rule, neither of which is built. Annotating a
	 * pace with a race name we cannot convert to would be the fabrication A2
	 * declined, so the slot stays reserved.
	 */
	equivalent: string | null
}

/**
 * The intensity chip (spec §7.2): the authored value in its own compact form
 * as content, tinted by the zone-equivalent step of the athlete's own recipe
 * (#250). `step: null` renders the same chip dashed on transparent — the
 * honest unresolvable treatment, never an asterisk or a fabricated zone.
 */
export type IntensityChip = { text: string; step: TrainingZone | null }

export type NotationToken =
	/** A Step Quantity: `6 min` (field `duration`) or `2 km` (field `distance`). */
	| { type: 'quantity'; text: string; address: TokenAddress }
	/** A block's repeat count, e.g. `4` (rendered `4 ×`). Present only when > 1. */
	| { type: 'repeat'; text: string; count: number; address: TokenAddress }
	/**
	 * An Intensity Target with derived facets: `4:40 /km`, `Threshold`,
	 * `95–105% FTP`. `targetKind` is null for the editor-only placeholder of a
	 * draft target still being authored (rendered `…`, no facets).
	 */
	| {
			type: 'intensity'
			text: string
			targetKind: IntensityTarget['kind'] | null
			/** The §7.2 chip; null only for the editor's draft placeholder token. */
			chip: IntensityChip | null
			facets: IntensityFacets
			address: TokenAddress
	  }
	/** A rest — a rest step (`1 min rest`) or a strength rest-between-sets facet. */
	| { type: 'rest'; text: string; address: TokenAddress }
	/** A strength step's exercise name: `Squat`. */
	| { type: 'exercise'; text: string; address: TokenAddress }
	/** A strength step's compact set summary: `5 × 5 @ 80 kg`. */
	| { type: 'sets'; text: string; address: TokenAddress }
	/** A marker that the step carries notes; `note` holds the full text. */
	| { type: 'notes'; text: string; note: string; address: TokenAddress }
	/**
	 * A step's *overridden* discipline as a quiet word at the step's start
	 * (spec §6.2): present only when the step states a discipline different
	 * from the workout's — an inherited discipline renders nothing.
	 */
	| { type: 'discipline'; text: string; address: TokenAddress }
	/** A block's name rendered as a plain word in the sentence: `warm-up`. */
	| { type: 'label'; text: string; address: TokenAddress }

/** A token plus how it joins the sentence: its leading separator and parens. */
export type PositionedToken = {
	/** Glyph rendered before this token, or null for a plain space. */
	separator:
		| typeof NOTATION_SEPARATORS.value
		| typeof NOTATION_SEPARATORS.facet
		| null
	/** Rendered wrapped in parentheses: `(1 min rest)`. */
	parenthesized: boolean
	token: NotationToken
}

export type StepNotation = {
	blockIndex: number
	stepIndex: number
	kind: 'cardio' | 'strength' | 'rest'
	tokens: PositionedToken[]
}

export type BlockNotation = {
	blockIndex: number
	/** The repeat-group token, present only when repeatCount > 1. */
	repeat: Extract<NotationToken, { type: 'repeat' }> | null
	/** The block name as a label token, when the block is named. */
	label: Extract<NotationToken, { type: 'label' }> | null
	/** Steps render wrapped in group parens: `3 × (3 min → 1 min)`. */
	grouped: boolean
	steps: StepNotation[]
}

/** The ordered token model for a whole workout: one repeat-group per block. */
export type WorkoutNotation = { blocks: BlockNotation[] }

// ——— Normalized input ———————————————————————————————————————————————————

export type NotationSet = {
	kind: ExerciseSetKind
	reps?: number | null
	durationSec?: number | null
	/** The two conditional endings (ADR 0007) — a set that stops at a reps-in-
	 * reserve or a velocity drop has no authored rep count. */
	terminationRir?: number | null
	velocityLossPct?: number | null
	/** The authored Load Target; `weightKg`/`pct1RM` are its legacy pair. */
	load?: LoadTarget | null
	weightKg?: number | null
	pct1RM?: number | null
	effortCap?: EffortCap | null
	tempo?: string | null
}

export type NotationStep = {
	kind: 'cardio' | 'strength' | 'rest'
	discipline?: string | null
	/**
	 * The step's discipline when it *overrides* the workout's (§6.2) — only
	 * then does the quiet word token render. `discipline` above stays the
	 * effective discipline facets resolve against, override or not.
	 */
	disciplineOverride?: string | null
	intensity?: IntensityTarget | null
	/**
	 * An intensity is authored but not (yet) a valid Intensity Target — an
	 * in-progress editor draft. Renders an addressable placeholder token (`…`)
	 * with no facets, so the editor's popover keeps its anchor mid-edit. Only
	 * the draft adapter sets this; persisted workouts never carry drafts.
	 */
	intensityDraft?: boolean
	durationSec?: number | null
	distanceM?: number | null
	/** The third Step Quantity (ADR 0002) — metres of climb. */
	verticalM?: number | null
	/** Step Parameters, which are not quantities and coexist with one. */
	gradePct?: number | null
	cadenceRpmMin?: number | null
	cadenceRpmMax?: number | null
	/** A rest step's authored form (ADR 0007). `durationSec` above stays the
	 * `time` form's number so existing readers are undisturbed. */
	rest?: RestSpec | null
	exerciseName?: string | null
	/**
	 * Which lift this step is, so the sentence can look up **this athlete's**
	 * anchors for it ({@link NotationOptions.loadContexts}). A back squat 1RM says
	 * nothing about a front squat, so the key is the exercise and never the step.
	 * Absent — free-text steps, drafts, the Catalogue — and the loads render
	 * exactly as authored.
	 */
	exerciseId?: string | null
	sets?: NotationSet[]
	restBetweenSetsSec?: number | null
	notes?: string | null
}

export type NotationBlock = {
	name?: string | null
	repeatCount: number
	/** The outer of the two repeat levels (ADR 0007). Absent means one series. */
	seriesRepeatCount?: number | null
	betweenSeriesRestSec?: number | null
	/** The cycle time this repeat group leaves on, where the rest is the
	 * residual after the work. A block has this or rest steps, never both. */
	sendOff?: SendOff | null
	steps: NotationStep[]
}

/** The single normalized structure both adapters produce. */
export type NotationInput = { blocks: NotationBlock[] }

export type NotationOptions = {
	/** Athlete thresholds per discipline; absent → facets degrade honestly. */
	thresholds?: DisciplineThresholdMap
	/**
	 * **This athlete's strength anchors, keyed by exercise id** — what turns an
	 * authored `85 % 1RM` or `8RM` into their own kilos on a step whose
	 * {@link NotationStep.exerciseId} is one of these keys.
	 *
	 * Resolved by the loader and handed in, never queried here: ADR 0027 keeps
	 * the sentence a pure function of structure, so the same structure plus the
	 * same context always renders the same text.
	 *
	 * **Omitting it is the Catalogue's case** and renders every load exactly as
	 * authored — a corpus row belongs to nobody. An exercise missing from the map
	 * is the same case, and a *present* context with no anchor of the construct
	 * renders the authored form plus its stated absence, never a number.
	 */
	loadContexts?: Record<string, ResolveContext>
}

// ——— Adapter: persisted rows ————————————————————————————————————————————

type PersistedSet = {
	kind: string
	orderIndex: number
	/** Stored Load Target JSON. */
	load?: string | null
	weightKg?: number | null
	pct1RM?: number | null
	/** Stored Effort Cap JSON. */
	effortCap?: string | null
	tempo?: string | null
	reps?: number | null
	durationSec?: number | null
	terminationRir?: number | null
	velocityLossPct?: number | null
}

type PersistedStep = {
	kind: string
	orderIndex: number
	notes?: string | null
	discipline?: string | null
	/** Stored Intensity Target JSON, or a legacy plain zone-label string. */
	intensity?: string | null
	durationSec?: number | null
	distanceM?: number | null
	verticalM?: number | null
	gradePct?: number | null
	cadenceRpmMin?: number | null
	cadenceRpmMax?: number | null
	/** Stored Rest Spec JSON. */
	rest?: string | null
	restBetweenSetsSec?: number | null
	exerciseId?: string | null
	exercise?: { name: string } | null
	sets?: PersistedSet[]
}

type PersistedWorkout = {
	/** The workout's own discipline — steps that state a different one render
	 * the §6.2 override word token. Absent → no override tokens. */
	discipline?: string | null
	blocks: Array<{
		name?: string | null
		orderIndex: number
		repeatCount: number
		seriesRepeatCount?: number | null
		betweenSeriesRestSec?: number | null
		/** Stored Send-Off JSON. */
		sendOff?: string | null
		steps: PersistedStep[]
	}>
}

function toStepKind(kind: string): NotationStep['kind'] {
	return kind === 'strength' || kind === 'rest' ? kind : 'cardio'
}

/**
 * The §6.2 override statement, shared by both adapters: a non-rest step's
 * discipline counts as an override only when it differs from a *known*
 * workout discipline — equality reads as inherited (a persisted step always
 * reloads with a concrete discipline, so equality, not mere presence, is
 * what distinguishes an override), and with no workout discipline to compare
 * against, no override is claimed.
 */
function disciplineOverride(
	kind: NotationStep['kind'],
	discipline: string | null | undefined,
	workoutDiscipline: string | null | undefined,
): string | null {
	return kind !== 'rest' &&
		discipline &&
		workoutDiscipline &&
		discipline !== workoutDiscipline
		? discipline
		: null
}

/** Coerce a stored/draft set-kind string to the set-kind union — shared with
 * the strength-sets editing helpers so both normalize identically. */
export function normalizeSetKind(
	kind: string | undefined,
): NotationSet['kind'] {
	return EXERCISE_SET_KINDS.includes(kind as ExerciseSetKind)
		? (kind as ExerciseSetKind)
		: 'reps'
}

/**
 * Normalize a persisted Workout row tree (the `training.server` step select)
 * for the notation: blocks/steps/sets ordered by `orderIndex`, stored
 * intensity JSON — or a legacy plain zone-label string — parsed to the
 * authored Intensity Target union.
 */
export function workoutToNotationInput(
	workout: PersistedWorkout | null | undefined,
): NotationInput {
	if (!workout) return { blocks: [] }
	const byOrder = (a: { orderIndex: number }, b: { orderIndex: number }) =>
		a.orderIndex - b.orderIndex
	return {
		blocks: workout.blocks
			.slice()
			.sort(byOrder)
			.map((block) => ({
				name: block.name,
				repeatCount: block.repeatCount ?? 1,
				seriesRepeatCount: block.seriesRepeatCount ?? 1,
				betweenSeriesRestSec: block.betweenSeriesRestSec,
				sendOff: parseStoredJson(SendOffSchema, block.sendOff),
				steps: block.steps
					.slice()
					.sort(byOrder)
					.map((step) => ({
						kind: toStepKind(step.kind),
						discipline: step.discipline,
						disciplineOverride: disciplineOverride(
							toStepKind(step.kind),
							step.discipline,
							workout.discipline,
						),
						intensity: parseAuthoredIntensity(step.intensity),
						durationSec: step.durationSec,
						distanceM: step.distanceM,
						verticalM: step.verticalM,
						gradePct: step.gradePct,
						cadenceRpmMin: step.cadenceRpmMin,
						cadenceRpmMax: step.cadenceRpmMax,
						rest: parseStoredJson(RestSpecSchema, step.rest),
						exerciseName: step.exercise?.name ?? null,
						exerciseId: step.exerciseId ?? null,
						sets: (step.sets ?? [])
							.slice()
							.sort(byOrder)
							.map((set) => ({
								kind: normalizeSetKind(set.kind),
								reps: set.reps,
								durationSec: set.durationSec,
								terminationRir: set.terminationRir,
								velocityLossPct: set.velocityLossPct,
								load: parseStoredJson(LoadTargetSchema, set.load),
								weightKg: set.weightKg,
								pct1RM: set.pct1RM,
								effortCap: parseStoredJson(EffortCapSchema, set.effortCap),
								tempo: set.tempo,
							})),
						restBetweenSetsSec: step.restBetweenSetsSec,
						notes: step.notes,
					})),
			})),
	}
}

// ——— Adapter: draft form values —————————————————————————————————————————

export type DraftSetValue = {
	kind?: string
	orderIndex?: string
	/** The authored Load Target as JSON — the general form the draft carries, of
	 * which `weightKg`/`pct1RM` are the legacy projection. */
	load?: string
	weightKg?: string
	pct1RM?: string
	/** The authored Effort Cap as JSON. */
	effortCap?: string
	tempo?: string
	reps?: string
	durationSec?: string
}

export type DraftStepValue = {
	kind?: string
	discipline?: string
	intensity?: string
	duration?: string
	distance?: string
	exerciseId?: string
	restBetweenSetsSec?: string
	sets?: DraftSetValue[]
	notes?: string
}

export type DraftBlockValue = {
	name?: string
	repeatCount?: string
	steps?: DraftStepValue[]
}

function positiveNumber(value: string | undefined): number | undefined {
	if (!value?.trim()) return undefined
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : undefined
}

function draftSet(set: DraftSetValue): NotationSet | null {
	const kind = normalizeSetKind(set.kind)
	// The union first, the legacy pair beside it: `setLoadText` prefers `load`,
	// so a draft `85–90% 1RM` renders as the range it is instead of the minimum
	// the pair projects it to.
	const load = {
		load: parseStoredJson(LoadTargetSchema, set.load),
		weightKg: positiveNumber(set.weightKg),
		pct1RM: positiveNumber(set.pct1RM),
		effortCap: parseStoredJson(EffortCapSchema, set.effortCap),
		tempo: set.tempo?.trim() || null,
	}
	if (kind === 'reps') {
		const reps = positiveNumber(set.reps)
		return reps != null ? { kind, reps, ...load } : null
	}
	if (kind === 'timed') {
		const durationSec = positiveNumber(set.durationSec)
		return durationSec != null ? { kind, durationSec, ...load } : null
	}
	return { kind, ...load }
}

/**
 * A draft set list as the compact set notation (`3 × 8 @ 60 kg`), parsed the
 * same way the sentence parses it. Null when nothing in the draft renders.
 */
export function draftSetsSummary(
	sets: DraftSetValue[] | null | undefined,
): string | null {
	return formatSetsSummary(
		(sets ?? []).flatMap((set) => {
			const parsed = draftSet(set)
			return parsed ? [parsed] : []
		}),
	)
}

/**
 * Normalize draft Conform form values (the `FormBlockSchema` field tree,
 * possibly mid-edit and unvalidated) for the notation. Humane strings parse
 * through the shared format layer; anything unparseable simply produces no
 * token — the notation never guesses at half-typed input. Draft steps carry
 * only an `exerciseId`, so pass `exerciseNames` (id → name) to render
 * strength exercise tokens.
 */
export function draftToNotationInput(
	blocks: DraftBlockValue[] | null | undefined,
	options: {
		exerciseNames?: Record<string, string>
		/**
		 * The workout's discipline, used for any step that doesn't override it —
		 * so intensity facets resolve against the athlete's thresholds even when
		 * the step inherits the workout discipline (the common case). Mirrors
		 * `buildStepInput`'s `step.discipline || workoutDiscipline` fallback.
		 */
		workoutDiscipline?: string
	} = {},
): NotationInput {
	return {
		blocks: (blocks ?? []).map((block) => ({
			name: block.name,
			repeatCount: positiveNumber(block.repeatCount) ?? 1,
			steps: (block.steps ?? []).map((step) => {
				const kind = toStepKind(step.kind ?? 'cardio')
				const intensity = parseAuthoredIntensity(step.intensity)
				return {
					kind,
					discipline: step.discipline || options.workoutDiscipline || null,
					disciplineOverride: disciplineOverride(
						kind,
						step.discipline,
						options.workoutDiscipline,
					),
					intensity,
					intensityDraft: intensity == null && Boolean(step.intensity?.trim()),
					durationSec: step.duration
						? (parseDuration(step.duration) ?? null)
						: null,
					distanceM: step.distance
						? (parseDistance(step.distance, { defaultUnit: 'm' }) ?? null)
						: null,
					exerciseName:
						(step.exerciseId && options.exerciseNames?.[step.exerciseId]) ||
						null,
					// The key the notation looks this lift's anchors up under
					// (`NotationOptions.loadContexts`): without it a draft's loads
					// could never resolve for anybody, however complete the context.
					exerciseId: step.exerciseId || null,
					sets: (step.sets ?? []).flatMap((set) => {
						const parsed = draftSet(set)
						return parsed ? [parsed] : []
					}),
					restBetweenSetsSec: positiveNumber(step.restBetweenSetsSec) ?? null,
					notes: step.notes || null,
				}
			}),
		})),
	}
}

// ——— Adapter: normalized input → Workout Shape ——————————————————————————

/**
 * Every draft step is authored before its intensity resolves to concrete
 * numbers, so none of the resolved-range columns exist yet. The Workout Shape
 * never reads them (it derives its zone from the authored target), but the
 * `Workout` row shape requires them.
 */
const UNRESOLVED_RANGE = {
	intensityHrMin: null,
	intensityHrMax: null,
	intensityPowerMin: null,
	intensityPowerMax: null,
	intensityPaceMin: null,
	intensityPaceMax: null,
}

/**
 * Adapt the shared normalized notation input (from either adapter, but used for
 * the *draft* form values) into the persisted `Workout` row shape the Workout
 * Shape pipeline expects, so the editor can feed the draft through the exact
 * same `expandWorkoutSteps` / `deriveSessionProfile` derivation the detail view
 * and ledger use — one shape everywhere, no duplicated zone/duration logic.
 *
 * Pure and total: authored intensity re-serializes to the JSON string
 * `stepToZone` parses; `intent`/`discipline` seed the intent-fallback zone
 * (a draft cardio step with no authored intensity inherits the workout intent,
 * exactly as a saved one does). Fields the Shape never reads (ids, resolved
 * ranges, exercise rows) are filled with honest nulls/placeholders.
 */
export function notationInputToWorkout(
	input: NotationInput,
	options: { intent?: string | null; discipline?: string | null } = {},
): Workout {
	return {
		id: 'draft',
		title: '',
		description: null,
		discipline: (options.discipline ?? 'run') as Workout['discipline'],
		intent: (options.intent ?? null) as Workout['intent'],
		// The Shape never reads the archetype, and a draft has stated nothing.
		archetype: null,
		blocks: input.blocks.map((block, blockIndex) => ({
			id: `block-${blockIndex}`,
			name: block.name ?? null,
			orderIndex: blockIndex,
			repeatCount: block.repeatCount,
			seriesRepeatCount: block.seriesRepeatCount ?? 1,
			betweenSeriesRestSec: block.betweenSeriesRestSec ?? null,
			sendOff: block.sendOff ? JSON.stringify(block.sendOff) : null,
			steps: block.steps.map((step, stepIndex) => ({
				id: `step-${blockIndex}-${stepIndex}`,
				kind: step.kind,
				notes: step.notes ?? null,
				discipline: step.discipline ?? null,
				intensity: step.intensity ? JSON.stringify(step.intensity) : null,
				orderIndex: stepIndex,
				durationSec: step.durationSec ?? null,
				distanceM: step.distanceM ?? null,
				verticalM: step.verticalM ?? null,
				gradePct: step.gradePct ?? null,
				cadenceRpmMin: step.cadenceRpmMin ?? null,
				cadenceRpmMax: step.cadenceRpmMax ?? null,
				rest: step.rest ? JSON.stringify(step.rest) : null,
				exerciseId: null,
				restBetweenSetsSec: step.restBetweenSetsSec ?? null,
				exercise: null,
				sets: (step.sets ?? []).map((set, setIndex) => ({
					id: `set-${blockIndex}-${stepIndex}-${setIndex}`,
					kind: set.kind,
					orderIndex: setIndex,
					load: set.load ? JSON.stringify(set.load) : null,
					weightKg: set.weightKg ?? null,
					pct1RM: set.pct1RM ?? null,
					effortCap: set.effortCap ? JSON.stringify(set.effortCap) : null,
					tempo: set.tempo ?? null,
					terminationRir: set.terminationRir ?? null,
					velocityLossPct: set.velocityLossPct ?? null,
					reps: set.reps ?? null,
					durationSec: set.durationSec ?? null,
				})),
				...UNRESOLVED_RANGE,
			})),
		})),
	}
}

// ——— Set summary ————————————————————————————————————————————————————————

function setQuantityText(set: NotationSet): string {
	switch (set.kind) {
		case 'reps':
			return String(set.reps)
		case 'timed':
			return formatDuration(set.durationSec ?? 0)
		case 'amrap':
			return 'AMRAP'
		// The two conditional endings. They say what stops the set, because a
		// rep count for them would be a number nobody authored.
		case 'toRir':
			return `to RIR ${set.terminationRir ?? 0}`
		case 'velocityLoss':
			return `to −${set.velocityLossPct ?? 0}% velocity`
	}
}

/**
 * A set's load, read off the **Load Target** union first and the legacy pair
 * only as a fallback.
 *
 * Reading the legacy columns alone dropped four of the six members on the
 * floor: `absolute` and `pct1RM` mirror into `weightKg`/`pct1RM`
 * (`workout.server.ts`'s `legacyLoadProjection`) and the other four have
 * nothing to mirror into, so a `repMax`, `bodyweight`, `pctBodyweight` or
 * `velocity` set rendered **no load at all**. That silently erased Rønnestad's
 * `10RM → 4RM` — the acquisition ADR 0007's amendment was written for — down to
 * a bare `4 × 10`, along with 34 seeded corpus sets.
 *
 * **The authored form is always what leads.** With no {@link ResolveContext}
 * this renders exactly as it always has — which is what the Catalogue's portable
 * form needs, since a corpus row belongs to nobody and has no anchors to resolve
 * against. With one, the athlete's own kilos follow the prescription after a
 * facet dot (`85% 1RM · 119 kg`), and where the anchor is missing **the absence
 * follows instead of a number** (`85% 1RM · no 1RM on file`).
 *
 * ADR 0027 is untouched. This is still a pure function of structure — the
 * anchors are handed in, nothing is parsed back out of the sentence, and the
 * same structure plus the same context always renders the same text.
 */
function setLoadText(set: NotationSet, ctx?: ResolveContext): string | null {
	const load = set.load ?? legacyLoadTarget(set)
	if (load) {
		return loadTargetText(load, ctx ? resolveLoadTarget(load, ctx) : null)
	}
	return null
}

/**
 * The legacy `weightKg`/`pct1RM` pair read back as the Load Target it is a
 * projection of — so a set that carries only the pair resolves against this
 * athlete's anchors exactly as one carrying the union does.
 *
 * This is a lossless read, not a conversion. `workout.server.ts`'s
 * `legacyLoadColumns` fills `pct1RM` from a `pct1RM` target and `weightKg` from
 * an `absolute` one and leaves the other four kinds null on purpose, so the two
 * columns mean precisely those two kinds and nothing else. A `repMax` never
 * lands here, which is what keeps `@ 8RM` from round-tripping through a 1RM it
 * was never anchored to (ADR 0007's amendment).
 *
 * It matters because the two surfaces that render from the **draft** form — the
 * scheduled session's editable sentence and the create route's — carry only the
 * legacy pair through Conform. Without this they showed a bare `85% 1RM` for an
 * athlete with a 1RM on file and, worse, the same bare string for one without:
 * a percentage with no basis and no stated absence.
 *
 * A range is the one thing the pair cannot hold: `85–90% 1RM` projects to its
 * minimum, so a draft states and resolves the bottom of the range. The union on
 * the stored set keeps the whole thing.
 */
function legacyLoadTarget(set: NotationSet): LoadTarget | null {
	if (set.weightKg != null) return { kind: 'absolute', kg: set.weightKg }
	if (set.pct1RM != null) return { kind: 'pct1RM', minPct: set.pct1RM }
	return null
}

/**
 * One Load Target as a phrase: **the authored form first**, then this athlete's
 * kilos or the absence where the anchor is missing.
 *
 * Exported because the **set log grid** needs exactly this phrase per row and
 * must not reimplement it. That is not ADR 0027 reaching into the log: the grid
 * renders no sentence, it renders the prescription for one row beside the inputs
 * that record what happened. `resolution` is passed in rather than resolved here
 * so the grid can resolve as of the *session's* day, which is not today.
 */
export function loadTargetText(
	load: LoadTarget,
	resolution?: LoadResolution | null,
): string {
	const authored = authoredLoadText(load)
	const resolved = resolution ? resolutionSuffix(load, resolution) : null
	return resolved
		? `${authored} ${NOTATION_SEPARATORS.facet} ${resolved}`
		: authored
}

/** The prescription exactly as it was written — the only half a corpus row has. */
function authoredLoadText(load: LoadTarget): string {
	switch (load.kind) {
		case 'absolute':
			return `${load.kg} kg`
		case 'pct1RM':
			return load.maxPct == null
				? `${load.minPct}% 1RM`
				: `${load.minPct}–${load.maxPct}% 1RM`
		case 'repMax':
			return `${load.reps}RM`
		case 'bodyweight':
			// Signed on purpose: assisted work carries a negative added load, so
			// `−20 kg` is a real prescription and not a malformed one.
			if (load.addedKg == null || load.addedKg === 0) return 'bodyweight'
			return load.addedKg > 0
				? `bodyweight + ${load.addedKg} kg`
				: `bodyweight − ${Math.abs(load.addedKg)} kg`
		case 'pctBodyweight':
			return `${load.pct}% bodyweight`
		case 'velocity':
			return load.maxMs == null
				? `${load.minMs} m/s`
				: `${load.minMs}–${load.maxMs} m/s`
	}
}

/**
 * The half that is about *this athlete*: their kilos, or the absence where the
 * anchor is missing. `null` where there is nothing to add.
 *
 * Two members add nothing on purpose. An `absolute` load **is** its own
 * resolution, so `100 kg · 100 kg` would be noise; and a `velocity` target is
 * permanently `not-resolvable` — it needs a sensor, it is a complete instruction
 * as authored, and appending *"the app cannot compute this"* to every bar-speed
 * set would be a fault notice on a working prescription.
 *
 * The absence phrases are short on purpose: the resolver's own sentences carry
 * *"for this lift"*, which inside a lift's own sentence is a word repeated. The
 * long form and the fix belong on the thresholds screen, where there is
 * something to do about it.
 */
function resolutionSuffix(
	load: LoadTarget,
	resolution: LoadResolution,
): string | null {
	if (load.kind === 'absolute' || load.kind === 'velocity') return null
	if (resolution.kind === 'resolved') {
		return resolution.kgMax == null
			? `${formatKg(resolution.kg)} kg`
			: `${formatKg(resolution.kg)}–${formatKg(resolution.kgMax)} kg`
	}
	switch (resolution.reason) {
		case 'no-anchor':
			return load.kind === 'repMax'
				? `no ${load.reps}RM on file`
				: 'no 1RM on file'
		case 'no-bodyweight':
			return 'no bodyweight on file'
		case 'not-resolvable':
			// The assistance-heavier-than-the-athlete case: a stated impossibility,
			// never a negative kilo.
			return 'not a load'
	}
}

/**
 * A strength step's set list as compact set notation. Uniform sets collapse
 * to `5 × 5 @ 80 kg` (count × quantity @ load); mixed sets list each:
 * `5 @ 80 kg / 3 @ 90 kg`. Null when there are no sets to summarize.
 */
export function formatSetsSummary(
	sets: NotationSet[],
	/** This athlete's anchors, where the sentence is being read *for* somebody.
	 * Omitted — the Catalogue's case — the loads render as authored. */
	ctx?: ResolveContext,
): string | null {
	if (sets.length === 0) return null
	const parts = sets.map((set) => ({
		quantity: setQuantityText(set),
		load: setLoadText(set, ctx),
		kind: set.kind,
	}))
	const first = parts[0]!
	const uniform = parts.every(
		(p) =>
			p.kind === first.kind &&
			p.quantity === first.quantity &&
			p.load === first.load,
	)
	const withLoad = (text: string, load: string | null) =>
		load ? `${text} ${NOTATION_SEPARATORS.value} ${load}` : text
	if (uniform) {
		return withLoad(
			`${sets.length} ${NOTATION_SEPARATORS.repeat} ${first.quantity}`,
			first.load,
		)
	}
	return parts.map((p) => withLoad(p.quantity, p.load)).join(' / ')
}

// ——— Structure → token model ————————————————————————————————————————————

function capitalize(label: string): string {
	const trimmed = label.trim()
	return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed
}

function plain(token: NotationToken): PositionedToken {
	return { separator: null, parenthesized: false, token }
}

function intensityToken(
	target: IntensityTarget,
	address: TokenAddress,
	thresholds: DisciplineThresholdMap,
	discipline: string | null | undefined,
): PositionedToken {
	const profile = discipline ? thresholds[discipline] : undefined
	const display = describeStepTarget(target, profile)
	// The dense notation shows a zone label as the bare capitalized label
	// (`Threshold`, `Z4`) — the spelled-out caption stays a detail-view
	// concern. Metric targets keep the resolver's concrete label.
	const text =
		target.kind === 'zoneLabel' ? capitalize(target.label) : display.label
	return {
		// A metric value reads `@ 4:40 /km`; a zone label reads as prose
		// (`45 min Easy`), so it joins with a plain space.
		separator: target.kind === 'zoneLabel' ? null : NOTATION_SEPARATORS.value,
		parenthesized: false,
		token: {
			type: 'intensity',
			text,
			targetKind: target.kind,
			chip: {
				text: intensityChipText(target),
				step: zoneEquivalent(target, profile).step,
			},
			facets: {
				zone: intensityTargetToZone(target),
				range: display.resolved,
				approximate: display.approximate,
				equivalent: null, // reserved — ADR 0027 A2, as amended by #449
			},
			address,
		},
	}
}

function notesToken(
	note: string,
	blockIndex: number,
	stepIndex: number,
): PositionedToken {
	return plain({
		type: 'notes',
		text: '*',
		note,
		address: { blockIndex, stepIndex, field: 'notes' },
	})
}

/**
 * A rest step's words, in whichever of the four forms it was authored (ADR
 * 0007). Only a `time` rest states a duration; the others say what ends the
 * recovery instead of pretending to a number they do not have — `jog back`,
 * `200 m jog`, `until HR < 120`. Before these were drawn every non-`time` rest
 * rendered as the bare word `rest`, which threw the prescription away.
 */
function restText(step: NotationStep): string {
	const spec =
		step.rest ??
		(step.durationSec != null
			? ({ kind: 'time', durationSec: step.durationSec } as const)
			: null)
	if (!spec) return 'rest'
	switch (spec.kind) {
		case 'time':
			return `${formatDuration(spec.durationSec)} rest`
		case 'distance':
			return `${formatDistance(spec.distanceM)} recovery`
		case 'toHr':
			return `until HR < ${spec.belowBpm} bpm`
		case 'toHrPct':
			return `until HR < ${spec.belowPct}% max`
		case 'sendOff':
			return sendOffText(spec)
		case 'act':
			return REST_ACT_WORDS[spec.act]
	}
}

/** The plain words for a **Rest Spec** that is an act rather than a clock. */
const REST_ACT_WORDS: Record<RestAct, string> = {
	jogBack: 'jog back',
	walkDown: 'walk down',
	rideDown: 'ride down',
	swimDown: 'swim down',
}

/**
 * A **Send-Off**: `on CSS + 10 s`, or `on 1:40`. The anchored form is what a
 * shared Catalogue ships, because an absolute cycle time is not portable — the
 * same `1:40` is a moderate set for one swimmer and impossible for another.
 */
function sendOffText(
	sendOff: SendOff | Extract<RestSpec, { kind: 'sendOff' }>,
): string {
	if (sendOff.kind === 'absolute') {
		return `on ${formatDuration(sendOff.intervalSec)}`
	}
	const allowance = sendOff.allowanceSecPer100m
	if (allowance === 0) return 'on CSS'
	const sign = allowance > 0 ? '+' : '−'
	return `on CSS ${sign} ${Math.abs(allowance)} s`
}

function buildStep(
	step: NotationStep,
	blockIndex: number,
	stepIndex: number,
	thresholds: DisciplineThresholdMap,
	loadContexts: Record<string, ResolveContext> = {},
): StepNotation {
	const at = (field: TokenField): TokenAddress => ({
		blockIndex,
		stepIndex,
		field,
	})
	const tokens: PositionedToken[] = []

	// An overridden discipline leads the step as a quiet word token (§6.2) —
	// tap to edit or clear. Inherited discipline renders nothing, and rest
	// steps have no discipline at all.
	if (step.kind !== 'rest' && step.disciplineOverride?.trim()) {
		tokens.push(
			plain({
				type: 'discipline',
				text: step.disciplineOverride.trim(),
				address: at('discipline'),
			}),
		)
	}

	if (step.kind === 'rest') {
		tokens.push({
			separator: null,
			parenthesized: true,
			token: {
				type: 'rest',
				text: restText(step),
				address: at('duration'),
			},
		})
	} else if (step.kind === 'strength') {
		tokens.push(
			plain({
				type: 'exercise',
				text: step.exerciseName?.trim() || 'exercise',
				address: at('exerciseId'),
			}),
		)
		// Strength steps always carry a sets token so the set-notation popover
		// (the sole set editor since ADR 0027 slice 9/9) stays reachable even
		// mid-edit when no set yet parses to a summary — an honest `sets`
		// placeholder, mirroring the `exercise` placeholder above. Persisted
		// steps always have at least one set, so the read view never shows it.
		// The athlete's own anchors reach the sentence here, on the one screen they
		// read the plan before training. The lookup is by exercise, so a step with
		// no exercise — or an athlete with no context for it — renders as authored,
		// which is exactly what the Catalogue's nobody-in-particular render is.
		const summary = formatSetsSummary(
			step.sets ?? [],
			step.exerciseId ? loadContexts[step.exerciseId] : undefined,
		)
		tokens.push(
			plain({ type: 'sets', text: summary ?? 'sets', address: at('sets') }),
		)
		if (step.restBetweenSetsSec != null) {
			// Rest-between-sets folds into the set notation with the facet mid-dot
			// (`5 × 5 @ 80 kg · 3 min rest`, §5.1) — `( … rest )` parentheses stay
			// reserved for rest steps, so the two never read alike.
			tokens.push({
				separator: NOTATION_SEPARATORS.facet,
				parenthesized: false,
				token: {
					type: 'rest',
					text: `${formatDuration(step.restBetweenSetsSec)} rest`,
					address: at('restBetweenSetsSec'),
				},
			})
		}
	} else {
		if (step.durationSec != null) {
			tokens.push(
				plain({
					type: 'quantity',
					text: formatDuration(step.durationSec),
					address: at('duration'),
				}),
			)
		} else if (step.distanceM != null) {
			tokens.push(
				plain({
					type: 'quantity',
					text: formatDistance(step.distanceM),
					address: at('distance'),
				}),
			)
		} else if (step.verticalM != null) {
			// Metres of climb — the quantity a vertical repeat, a VK test and a
			// mountain long run are actually measured in. Without this the step
			// renders with no quantity at all, which reads as "unbounded" rather
			// than as "200 vertical metres".
			tokens.push(
				plain({
					type: 'quantity',
					text: `${step.verticalM} vm`,
					address: at('vertical'),
				}),
			)
		}
		if (step.intensity) {
			tokens.push(
				intensityToken(
					step.intensity,
					at('intensity'),
					thresholds,
					step.discipline,
				),
			)
		} else if (step.intensityDraft) {
			// A draft target mid-edit: an honest placeholder (never a guessed
			// value) that stays addressable so the editor's popover keeps its
			// anchor while the athlete completes the target.
			tokens.push({
				separator: NOTATION_SEPARATORS.value,
				parenthesized: false,
				token: {
					type: 'intensity',
					text: '…',
					targetKind: null,
					chip: null,
					facets: {
						zone: null,
						range: null,
						approximate: false,
						equivalent: null,
					},
					address: at('intensity'),
				},
			})
		}
	}

	if (step.notes?.trim()) {
		tokens.push(notesToken(step.notes, blockIndex, stepIndex))
	}

	return { blockIndex, stepIndex, kind: step.kind, tokens }
}

/**
 * Build the ordered token model from a normalized structure. Deterministic
 * and pure: the same structure, thresholds and load contexts always produce the
 * same model. Nothing here queries — both halves of "for this athlete" are
 * handed in (ADR 0027).
 */
export function deriveWorkoutNotation(
	input: NotationInput,
	options: NotationOptions = {},
): WorkoutNotation {
	const thresholds = options.thresholds ?? {}
	const loadContexts = options.loadContexts ?? {}
	return {
		blocks: input.blocks.map((block, blockIndex) => {
			const steps = block.steps.map((step, stepIndex) =>
				buildStep(step, blockIndex, stepIndex, thresholds, loadContexts),
			)
			// A block states a send-off *or* rest steps, never both, so the cycle
			// time is the whole of what this block says about recovery — and it
			// rendered as nothing at all before. It rides on the last step rather
			// than as a block-level token so it reads where a rest would:
			// `10 × (100 m Z4) (on CSS + 10 s)`.
			const lastStep = steps.at(-1)
			if (block.sendOff && lastStep) {
				lastStep.tokens.push({
					separator: null,
					parenthesized: true,
					token: {
						type: 'rest',
						text: sendOffText(block.sendOff),
						address: {
							blockIndex,
							stepIndex: lastStep.stepIndex,
							field: 'sendOff',
						},
					},
				})
			}
			const repeat =
				block.repeatCount > 1
					? ({
							type: 'repeat',
							text: String(block.repeatCount),
							count: block.repeatCount,
							address: { blockIndex, stepIndex: null, field: 'repeatCount' },
						} as const)
					: null
			const name = block.name?.trim()
			const label = name
				? ({
						type: 'label',
						text: name,
						address: { blockIndex, stepIndex: null, field: 'name' },
					} as const)
				: null
			// A repeated block with two or more inline (non-parenthesized) steps
			// needs group parens so the repeat visibly spans them all.
			const inlineSteps = steps.filter(
				(s) => s.tokens.length > 0 && !s.tokens[0]!.parenthesized,
			)
			return {
				blockIndex,
				repeat,
				label,
				grouped: repeat != null && inlineSteps.length >= 2,
				steps,
			}
		}),
	}
}

// ——— Token model → sentence text ————————————————————————————————————————

/**
 * A token's full display text including derived facets — an intensity token
 * composes its zone chip and resolved range (`95–105% FTP · Z4 (238–263 W)`);
 * unresolvable facets are simply absent. The chip is skipped for zone-label
 * targets (the text *is* the zone).
 */
export function tokenText(token: NotationToken): string {
	if (token.type !== 'intensity') return token.text
	const chip =
		token.facets.zone != null && token.targetKind !== 'zoneLabel'
			? ` ${NOTATION_SEPARATORS.facet} Z${token.facets.zone}`
			: ''
	// `≈` whenever the number is a translation rather than arithmetic, so its
	// absence is meaningful (CONTEXT.md **Target Resolution**).
	const range = token.facets.range
		? ` (${token.facets.approximate ? '≈ ' : ''}${token.facets.range})`
		: ''
	return `${token.text}${chip}${range}`
}

// ——— Token model → sentence segments ————————————————————————————————————

/**
 * A flat render plan for the Token Sentence: every token becomes an
 * addressable `token` segment (its `text` is the full `tokenText`, facets
 * included) and every piece of joining text — step arrows, spaces, parens —
 * becomes `glue`. Concatenating segment texts *is* the plain-text sentence,
 * so a component that renders segments verbatim cannot disagree with the
 * model about separators or parenthesization.
 */
export type SentenceSegment =
	| { kind: 'token'; text: string; token: NotationToken }
	| { kind: 'glue'; text: string }

function glue(text: string): SentenceSegment {
	return { kind: 'glue', text }
}

function tokenSegment(token: NotationToken): SentenceSegment {
	return { kind: 'token', text: tokenText(token), token }
}

function stepSegments(step: StepNotation): SentenceSegment[] {
	const out: SentenceSegment[] = []
	for (const positioned of step.tokens) {
		const base = tokenText(positioned.token)
		if (!base) continue
		if (out.length > 0) {
			if (positioned.token.type === 'notes') {
				// the marker attaches directly to what it annotates — no glue
			} else if (positioned.separator) {
				out.push(glue(` ${positioned.separator} `))
			} else {
				out.push(glue(' '))
			}
		}
		if (positioned.parenthesized) out.push(glue('('))
		out.push({ kind: 'token', text: base, token: positioned.token })
		if (positioned.parenthesized) out.push(glue(')'))
	}
	return out
}

function stepIsParenthetical(step: StepNotation): boolean {
	return step.tokens[0]?.parenthesized === true
}

function blockSegments(block: BlockNotation): SentenceSegment[] {
	let steps: SentenceSegment[] = []
	for (const step of block.steps) {
		const segments = stepSegments(step)
		if (segments.length === 0) continue
		if (steps.length === 0) {
			steps = segments
		} else if (stepIsParenthetical(step)) {
			// A rest reads inline (`6 min (1 min rest)`), not as a step arrow.
			steps.push(glue(' '), ...segments)
		} else {
			steps.push(glue(` ${NOTATION_SEPARATORS.step} `), ...segments)
		}
	}
	if (block.grouped && steps.length > 0) {
		steps = [glue('('), ...steps, glue(')')]
	}
	const out: SentenceSegment[] = []
	if (block.repeat) {
		out.push(tokenSegment(block.repeat), glue(` ${NOTATION_SEPARATORS.repeat}`))
	}
	if (steps.length > 0) {
		if (out.length > 0) out.push(glue(' '))
		out.push(...steps)
	}
	if (block.label) {
		if (out.length > 0) out.push(glue(' '))
		out.push(tokenSegment(block.label))
	}
	return out
}

/**
 * The whole workout as an ordered segment list — what the Token Sentence
 * component renders, one element per segment.
 */
export function notationSegments(notation: WorkoutNotation): SentenceSegment[] {
	const out: SentenceSegment[] = []
	for (const block of notation.blocks) {
		const segments = blockSegments(block)
		if (segments.length === 0) continue
		if (out.length > 0) out.push(glue(` ${NOTATION_SEPARATORS.step} `))
		out.push(...segments)
	}
	return out
}

function segmentsText(segments: SentenceSegment[]): string {
	return segments.map((segment) => segment.text).join('')
}

// ——— Token model → sentence text ————————————————————————————————————————

/** One step's sentence fragment, e.g. `6 min @ 4:40 /km` or `(1 min rest)`. */
export function stepSentence(step: StepNotation): string {
	return segmentsText(stepSegments(step))
}

/** One block's sentence fragment, e.g. `4 × 6 min @ 4:40 /km (1 min rest)`. */
export function blockSentence(block: BlockNotation): string {
	return segmentsText(blockSegments(block))
}

/**
 * The whole workout as one deterministic Token Sentence string — the plain-
 * text form of what the Token Sentence component renders, and the shape the
 * unit tests pin.
 */
export function notationSentence(notation: WorkoutNotation): string {
	return segmentsText(notationSegments(notation))
}
