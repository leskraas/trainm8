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
import { type IntensityTarget } from './workout-schema.ts'
import { intensityChipText, zoneEquivalent } from './zone-equivalent.ts'

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
	| 'intensity'
	| 'exerciseId'
	| 'sets'
	| 'restBetweenSetsSec'
	| 'notes'

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
	 * Reserved slot for a race-pace-equivalent facet (`= HM pace`), ADR 0027
	 * A2. No truthful race-pace model exists, so it is always null in v1.
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
	kind: 'reps' | 'timed' | 'amrap'
	reps?: number | null
	durationSec?: number | null
	weightKg?: number | null
	pct1RM?: number | null
}

export type NotationStep = {
	kind: 'cardio' | 'strength' | 'rest'
	discipline?: string | null
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
	exerciseName?: string | null
	sets?: NotationSet[]
	restBetweenSetsSec?: number | null
	notes?: string | null
}

export type NotationBlock = {
	name?: string | null
	repeatCount: number
	steps: NotationStep[]
}

/** The single normalized structure both adapters produce. */
export type NotationInput = { blocks: NotationBlock[] }

export type NotationOptions = {
	/** Athlete thresholds per discipline; absent → facets degrade honestly. */
	thresholds?: DisciplineThresholdMap
}

// ——— Adapter: persisted rows ————————————————————————————————————————————

type PersistedSet = {
	kind: string
	orderIndex: number
	weightKg?: number | null
	pct1RM?: number | null
	reps?: number | null
	durationSec?: number | null
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
	restBetweenSetsSec?: number | null
	exercise?: { name: string } | null
	sets?: PersistedSet[]
}

type PersistedWorkout = {
	blocks: Array<{
		name?: string | null
		orderIndex: number
		repeatCount: number
		steps: PersistedStep[]
	}>
}

function toStepKind(kind: string): NotationStep['kind'] {
	return kind === 'strength' || kind === 'rest' ? kind : 'cardio'
}

/** Coerce a stored/draft set-kind string to the set-kind union — shared with
 * the strength-sets editing helpers so both normalize identically. */
export function normalizeSetKind(
	kind: string | undefined,
): NotationSet['kind'] {
	return kind === 'timed' || kind === 'amrap' ? kind : 'reps'
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
				steps: block.steps
					.slice()
					.sort(byOrder)
					.map((step) => ({
						kind: toStepKind(step.kind),
						discipline: step.discipline,
						intensity: parseAuthoredIntensity(step.intensity),
						durationSec: step.durationSec,
						distanceM: step.distanceM,
						exerciseName: step.exercise?.name ?? null,
						sets: (step.sets ?? [])
							.slice()
							.sort(byOrder)
							.map((set) => ({
								kind: normalizeSetKind(set.kind),
								reps: set.reps,
								durationSec: set.durationSec,
								weightKg: set.weightKg,
								pct1RM: set.pct1RM,
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
	weightKg?: string
	pct1RM?: string
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
	const load = {
		weightKg: positiveNumber(set.weightKg),
		pct1RM: positiveNumber(set.pct1RM),
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
		blocks: input.blocks.map((block, blockIndex) => ({
			id: `block-${blockIndex}`,
			name: block.name ?? null,
			orderIndex: blockIndex,
			repeatCount: block.repeatCount,
			steps: block.steps.map((step, stepIndex) => ({
				id: `step-${blockIndex}-${stepIndex}`,
				kind: step.kind,
				notes: step.notes ?? null,
				discipline: step.discipline ?? null,
				intensity: step.intensity ? JSON.stringify(step.intensity) : null,
				orderIndex: stepIndex,
				durationSec: step.durationSec ?? null,
				distanceM: step.distanceM ?? null,
				exerciseId: null,
				restBetweenSetsSec: step.restBetweenSetsSec ?? null,
				exercise: null,
				sets: (step.sets ?? []).map((set, setIndex) => ({
					id: `set-${blockIndex}-${stepIndex}-${setIndex}`,
					kind: set.kind,
					orderIndex: setIndex,
					weightKg: set.weightKg ?? null,
					pct1RM: set.pct1RM ?? null,
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
	}
}

function setLoadText(set: NotationSet): string | null {
	if (set.weightKg != null) return `${set.weightKg} kg`
	if (set.pct1RM != null) return `${set.pct1RM}% 1RM`
	return null
}

/**
 * A strength step's set list as compact set notation. Uniform sets collapse
 * to `5 × 5 @ 80 kg` (count × quantity @ load); mixed sets list each:
 * `5 @ 80 kg / 3 @ 90 kg`. Null when there are no sets to summarize.
 */
export function formatSetsSummary(sets: NotationSet[]): string | null {
	if (sets.length === 0) return null
	const parts = sets.map((set) => ({
		quantity: setQuantityText(set),
		load: setLoadText(set),
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
				equivalent: null, // reserved — ADR 0027 A2
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

function buildStep(
	step: NotationStep,
	blockIndex: number,
	stepIndex: number,
	thresholds: DisciplineThresholdMap,
): StepNotation {
	const at = (field: TokenField): TokenAddress => ({
		blockIndex,
		stepIndex,
		field,
	})
	const tokens: PositionedToken[] = []

	if (step.kind === 'rest') {
		tokens.push({
			separator: null,
			parenthesized: true,
			token: {
				type: 'rest',
				text:
					step.durationSec != null
						? `${formatDuration(step.durationSec)} rest`
						: 'rest',
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
		const summary = formatSetsSummary(step.sets ?? [])
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
					facets: { zone: null, range: null, equivalent: null },
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
 * and pure: the same structure and thresholds always produce the same model.
 */
export function deriveWorkoutNotation(
	input: NotationInput,
	options: NotationOptions = {},
): WorkoutNotation {
	const thresholds = options.thresholds ?? {}
	return {
		blocks: input.blocks.map((block, blockIndex) => {
			const steps = block.steps.map((step, stepIndex) =>
				buildStep(step, blockIndex, stepIndex, thresholds),
			)
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
	const range = token.facets.range ? ` (${token.facets.range})` : ''
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
