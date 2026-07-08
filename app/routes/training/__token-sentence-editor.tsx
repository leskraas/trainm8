/**
 * The editable Token Sentence (ADR 0027, R3 — slice 4/9): renders the live
 * Workout Notation from the draft Conform form values and makes the simple
 * value tokens interactive. Each editable token wraps its default rendering
 * (via `TokenSentence`'s `renderToken` seam) in a popover trigger; the popover
 * holds a small stepper (duration, distance, repeat count, rest) or a textarea
 * (notes) that writes the existing Conform field through `useInputControl` —
 * the field tree, submission path, and server validation are untouched.
 *
 * Structure edits are sentence affordances dispatching a Conform intent —
 * one `form.update` carrying the restructured draft — so order indexes stay
 * consistent with the classic field editor: an add-step / remove-block
 * cluster per block, an add-block button at the end, and move/remove step
 * actions in each step-scoped popover. A single atomic `update` (instead of
 * the bare `insert`/`remove`/`reorder` list intents) is deliberate: the list
 * intents rebuild rows from `initialValue`, silently reverting draft values
 * that only live in `value`, and Conform applies just one intent per
 * interaction so syncing first is not an option.
 *
 * Steppers only produce valid values (humane strings through the shared
 * format layer), so the athlete can never trip a red form error for a value
 * this UI offered. Intensity, exercise, and sets tokens stay inert here —
 * their popovers are later slices (5/9, 9/9).
 */
import { useInputControl } from '@conform-to/react'
import { Fragment, useState, type ReactNode } from 'react'
import {
	TokenSentence,
	type TokenSentenceSegment,
} from '#app/components/token-sentence.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	formatDistance,
	formatDuration,
	parseDistance,
	parseDuration,
} from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	emptyBlock,
	emptySet,
	emptyStep,
} from '#app/utils/workout-authoring.ts'
import {
	deriveWorkoutNotation,
	draftToNotationInput,
	NOTATION_SEPARATORS,
	type DraftBlockValue,
	type DraftSetValue,
	type NotationToken,
} from '#app/utils/workout-notation.ts'
import { EXERCISE_SET_KINDS } from '#app/utils/workout-schema.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/index.ts'
import { ExerciseCombobox, type ExerciseItem } from './__exercise-combobox.tsx'
import { IntensityEditor } from './__intensity-editor.tsx'

// Conform metadata is typed loosely here, matching the existing form modules
// (`__workout-step-fields.tsx`): the editor only reads names/keys/values and
// dispatches intents, so the generics add noise without safety.
type FieldMeta = any
type FormMeta = any

// ——— Token → editor mapping ————————————————————————————————————————————

/**
 * Which popover a token opens. Duration-flavoured editors differ only in
 * granularity: `duration` steps in athlete-sized increments, `rest` in the
 * finer steps recovery is written in. `restSeconds` is the strength
 * rest-between-sets field, whose form value is raw seconds, not a humane
 * string.
 */
type EditorKind =
	| 'duration'
	| 'distance'
	| 'repeat'
	| 'rest'
	| 'restSeconds'
	| 'notes'

function editorKindFor(token: NotationToken): EditorKind | null {
	switch (token.type) {
		case 'quantity':
			return token.address.field === 'distance' ? 'distance' : 'duration'
		case 'repeat':
			return 'repeat'
		case 'rest':
			return token.address.field === 'restBetweenSetsSec'
				? 'restSeconds'
				: 'rest'
		case 'notes':
			return 'notes'
		// Intensity (5/9), exercise and sets (9/9), and block labels are later
		// slices — they render inert.
		default:
			return null
	}
}

const EDITOR_LABELS: Record<EditorKind, string> = {
	duration: 'duration',
	distance: 'distance',
	repeat: 'repeat count',
	rest: 'rest',
	restSeconds: 'rest',
	notes: 'notes',
}

// ——— Stepper value codecs ———————————————————————————————————————————————

/**
 * A numeric token editor: how the form field's string becomes a number, how a
 * stepped number is written back (always a string the schema accepts), and
 * the step curve. `start` seeds the first increase when the field is empty
 * (only rest can be empty — a bare `(rest)` token still renders).
 */
type StepperConfig = {
	parse: (value: string) => number | null
	serialize: (value: number) => string
	display: (value: number) => string
	/** Step size at `value` — increments use `step(value)`, decrements `step(value - 1)`. */
	step: (value: number) => number
	min: number
	max?: number
	start: number
}

const parseSeconds = (value: string) => {
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

const parseCount = (value: string) => {
	const n = Number(value)
	return Number.isInteger(n) && n > 0 ? n : null
}

const durationStep = (sec: number) => (sec < 120 ? 15 : sec < 1200 ? 60 : 300)

const STEPPERS: Record<Exclude<EditorKind, 'notes'>, StepperConfig> = {
	duration: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		step: durationStep,
		min: 15,
		start: 300,
	},
	rest: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	restSeconds: {
		parse: parseSeconds,
		serialize: String,
		display: formatDuration,
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	distance: {
		parse: (value) => parseDistance(value, { defaultUnit: 'm' }),
		serialize: formatDistance,
		display: formatDistance,
		// Steps must land on values `formatDistance` renders losslessly (0.1 km
		// resolution above 1 km), or the round-trip would drift.
		step: (m) => (m < 1000 ? 100 : 500),
		min: 100,
		start: 1000,
	},
	repeat: {
		parse: parseCount,
		serialize: String,
		display: (n) => `${n} ${NOTATION_SEPARATORS.repeat}`,
		step: () => 1,
		min: 1,
		max: 99,
		start: 2,
	},
}

// ——— Sentence-inserted defaults —————————————————————————————————————————

/**
 * Steps added from the sentence arrive with a valid default duration so they
 * render a token immediately — an invisible empty step would leave nothing to
 * tap. The classic "+ Add Step" keeps inserting the blank `emptyStep()`.
 */
export function sentenceStep() {
	return { ...emptyStep(), duration: '10 min' }
}

export function sentenceBlock() {
	return { ...emptyBlock(), steps: [sentenceStep()] }
}

// ——— The editor ————————————————————————————————————————————————————————

export type TokenSentenceEditorProps = {
	/** The Conform form metadata — used only to dispatch structure intents. */
	form: FormMeta
	/** The `blocks` array field metadata from the same form. */
	blocksField: FieldMeta
	/** The exercise catalog — the strength `exercise` token opens this combobox. */
	exercises?: ExerciseItem[]
	/** Recently used exercise ids, grouped on top of the exercise combobox. */
	recentExerciseIds?: string[]
	/** id → name for the exercise catalog, so strength tokens read as names. */
	exerciseNames?: Record<string, string>
	/** Athlete thresholds per discipline; absent → facets degrade honestly. */
	thresholds?: DisciplineThresholdMap
	/** The workout discipline, so steps that don't override it resolve facets. */
	workoutDiscipline?: string
	className?: string
}

/**
 * The editable Token Sentence, derived live from the draft form values. One
 * sentence fragment per block, joined by the notation's step arrow, each
 * followed by its block affordances.
 */
export function TokenSentenceEditor({
	form,
	blocksField,
	exercises = [],
	recentExerciseIds = [],
	exerciseNames,
	thresholds,
	workoutDiscipline,
	className,
}: TokenSentenceEditorProps) {
	const blockList = blocksField.getFieldList() as FieldMeta[]
	const draftBlocks = (blocksField.value ?? []) as DraftBlockValue[]
	const notation = deriveWorkoutNotation(
		draftToNotationInput(draftBlocks, { exerciseNames, workoutDiscipline }),
		{ thresholds },
	)

	// Structure edits go through ONE Conform `update` intent carrying the
	// restructured draft. The plain list intents (`insert`/`remove`/`reorder`)
	// rebuild the affected rows from `initialValue`, which silently reverts
	// values that so far live only in `value` (typed text, popover writes) —
	// and Conform applies only one intent per interaction, so a separate
	// sync-then-reorder pair is not an option. A single atomic update keeps
	// the draft lossless and the order indexes consistent.
	function restructure(mutate: (blocks: DraftBlockValue[]) => void) {
		const draft = JSON.parse(
			JSON.stringify(blocksField.value ?? []),
		) as DraftBlockValue[]
		mutate(draft)
		form.update({ name: blocksField.name, value: draft })
	}

	function moveStep(blockIndex: number, from: number, to: number) {
		restructure((blocks) => {
			const steps = blocks[blockIndex]?.steps
			if (!steps) return
			steps.splice(to, 0, ...steps.splice(from, 1))
		})
	}

	function removeStep(blockIndex: number, stepIndex: number) {
		restructure((blocks) => {
			blocks[blockIndex]?.steps?.splice(stepIndex, 1)
		})
	}

	// Set add/duplicate/remove/reorder mutate the draft's set array through the
	// same atomic `update` intent as every other structure edit, then reindex
	// `orderIndex` to the array position — matching the classic set-row editor,
	// which forced `orderIndex = row position` on every render. Per-set value
	// edits (kind, reps/secs, load) stay on their Conform fields via the
	// popover's `useInputControl`, so they survive the update untouched.
	function mutateSets(
		blockIndex: number,
		stepIndex: number,
		mutate: (sets: DraftSetValue[]) => void,
	) {
		restructure((blocks) => {
			const step = blocks[blockIndex]?.steps?.[stepIndex]
			if (!step) return
			const sets = (step.sets ??= [])
			mutate(sets)
			sets.forEach((set, index) => {
				set.orderIndex = String(index)
			})
		})
	}

	function renderToken(segment: TokenSentenceSegment, children: ReactNode) {
		const { token } = segment
		const { blockIndex, stepIndex, field } = token.address
		const blockField = blockList[blockIndex]
		if (!blockField) return children
		const blockFields = blockField.getFieldset()

		// Intensity tokens open the shared IntensityTarget editor, bound to the
		// step's intensity field through Conform — replacing the old
		// out-of-Conform picker. Live facets re-derive from the written JSON.
		if (token.type === 'intensity' && stepIndex != null) {
			const stepList = blockFields.steps.getFieldList() as FieldMeta[]
			const stepField = stepList[stepIndex]
			if (!stepField) return children
			const stepFields = stepField.getFieldset()
			const meta = stepFields.intensity
			if (!meta) return children
			const effectiveDiscipline =
				(stepFields.discipline?.value as string | undefined) ||
				workoutDiscipline ||
				'run'
			return (
				<IntensityTokenPopover
					meta={meta}
					segment={segment}
					profile={thresholds?.[effectiveDiscipline] ?? null}
					effectiveDiscipline={effectiveDiscipline}
				>
					{children}
				</IntensityTokenPopover>
			)
		}

		// The exercise token IS the reused combobox (slice 2/9), bound to the
		// step's `exerciseId` field through Conform — the submitted id is
		// identical to the classic flat picker's.
		if (token.type === 'exercise' && stepIndex != null) {
			const stepList = blockFields.steps.getFieldList() as FieldMeta[]
			const stepField = stepList[stepIndex]
			if (!stepField) return children
			const meta = stepField.getFieldset().exerciseId
			if (!meta) return children
			return (
				<ExerciseTokenControl
					meta={meta}
					exercises={exercises}
					recentExerciseIds={recentExerciseIds}
				/>
			)
		}

		// The sets token opens the set-notation popover editing the full set
		// list — the sole set editor since the classic set rows were removed.
		if (token.type === 'sets' && stepIndex != null) {
			const stepList = blockFields.steps.getFieldList() as FieldMeta[]
			const stepField = stepList[stepIndex]
			if (!stepField) return children
			const setsField = stepField.getFieldset().sets
			if (!setsField) return children
			return (
				<SetsTokenPopover
					setsField={setsField}
					segment={segment}
					mutate={(mutate) => mutateSets(blockIndex, stepIndex, mutate)}
				>
					{children}
				</SetsTokenPopover>
			)
		}

		const kind = editorKindFor(token)
		if (!kind) return children
		if (stepIndex == null) {
			if (field !== 'repeatCount') return children
			return (
				<TokenEditorPopover
					meta={blockFields.repeatCount}
					kind={kind}
					segment={segment}
				>
					{children}
				</TokenEditorPopover>
			)
		}
		const stepList = blockFields.steps.getFieldList() as FieldMeta[]
		const stepField = stepList[stepIndex]
		if (!stepField) return children
		const meta = stepField.getFieldset()[field]
		if (!meta) return children
		return (
			<TokenEditorPopover
				meta={meta}
				kind={kind}
				segment={segment}
				stepActions={{
					onMoveEarlier:
						stepIndex > 0
							? () => moveStep(blockIndex, stepIndex, stepIndex - 1)
							: undefined,
					onMoveLater:
						stepIndex < stepList.length - 1
							? () => moveStep(blockIndex, stepIndex, stepIndex + 1)
							: undefined,
					onRemove:
						stepList.length > 1
							? () => removeStep(blockIndex, stepIndex)
							: undefined,
				}}
			>
				{children}
			</TokenEditorPopover>
		)
	}

	return (
		<div
			data-token-sentence-editor
			className={cn(
				'text-body-sm flex flex-wrap items-center gap-x-2 gap-y-1.5 leading-relaxed',
				className,
			)}
		>
			{notation.blocks.map((block, blockIndex) => {
				const blockField = blockList[blockIndex]
				if (!blockField) return null
				return (
					<Fragment key={blockField.key ?? blockIndex}>
						{blockIndex > 0 ? (
							<span aria-hidden className="text-muted-foreground/80">
								{NOTATION_SEPARATORS.step}
							</span>
						) : null}
						<span className="inline-flex flex-wrap items-center gap-1">
							<TokenSentence
								notation={{ blocks: [block] }}
								renderToken={renderToken}
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								aria-label={`Add step to block ${blockIndex + 1}`}
								onClick={() =>
									restructure((blocks) => {
										const block = blocks[blockIndex]
										if (!block) return
										block.steps = [...(block.steps ?? []), sentenceStep()]
									})
								}
							>
								+
							</Button>
							{blockList.length > 1 ? (
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Remove block ${blockIndex + 1}`}
									onClick={() =>
										restructure((blocks) => {
											blocks.splice(blockIndex, 1)
										})
									}
								>
									×
								</Button>
							) : null}
						</span>
					</Fragment>
				)
			})}
			<Button
				type="button"
				variant="ghost"
				size="xs"
				aria-label="Add block"
				onClick={() =>
					restructure((blocks) => {
						blocks.push(sentenceBlock())
					})
				}
			>
				+ block
			</Button>
		</div>
	)
}

// ——— Intensity token popover ————————————————————————————————————————————

/**
 * The intensity token's popover: the shared `IntensityEditor` bound to the
 * step's `intensity` field through `useInputControl`, so every kind writes the
 * `IntensityTarget` JSON the server already accepts and validation errors
 * surface through Conform — no hidden JSON input. The sentence's zone/bpm/pace
 * facets re-derive live from the written value; this popover previews the
 * resolved range in place when the athlete's thresholds are known.
 */
function IntensityTokenPopover({
	meta,
	segment,
	profile,
	effectiveDiscipline,
	children,
}: {
	meta: FieldMeta
	segment: TokenSentenceSegment
	profile: DisciplineProfileForResolver | null
	effectiveDiscipline: string
	children: ReactNode
}) {
	const [open, setOpen] = useState(false)
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
	const rawValue = typeof meta.value === 'string' ? meta.value : ''

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				type="button"
				aria-label={`Edit intensity: ${segment.text}`}
				data-token-editor="intensity"
				className="focus-visible:ring-ring hover:bg-muted -mx-0.5 cursor-pointer rounded-sm px-0.5 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
			>
				{children}
			</PopoverTrigger>
			<PopoverContent className="w-72">
				<PopoverHeader>
					<PopoverTitle>Intensity</PopoverTitle>
				</PopoverHeader>
				<IntensityEditor
					value={rawValue}
					onChange={(serialized) => control.change(serialized)}
					profile={profile}
					effectiveDiscipline={effectiveDiscipline}
				/>
			</PopoverContent>
		</Popover>
	)
}

// ——— Exercise token ————————————————————————————————————————————————————

/**
 * The exercise token: the reused `ExerciseCombobox` (slice 2/9) rendered inline
 * as the token itself and bound to the step's `exerciseId` field through
 * `useInputControl`. Because this control is mounted for as long as the
 * strength step's exercise token renders (always), its shadow input persists in
 * the form — so the selected id submits exactly as the classic picker's did,
 * even while the combobox's own dropdown is closed.
 */
function ExerciseTokenControl({
	meta,
	exercises,
	recentExerciseIds,
}: {
	meta: FieldMeta
	exercises: ExerciseItem[]
	recentExerciseIds: string[]
}) {
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
	return (
		<span
			data-token-editor="exercise"
			className="inline-flex w-48 max-w-full align-middle"
		>
			<ExerciseCombobox
				exercises={exercises}
				recentExerciseIds={recentExerciseIds}
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(exerciseId) => control.change(exerciseId)}
				invalid={meta.errors ? true : undefined}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
		</span>
	)
}

// ——— Sets token ————————————————————————————————————————————————————————

/**
 * The set-notation popover: the strength step's whole set list, editable per
 * set (kind, reps/seconds, and load as kg **or** %1RM) with add / duplicate /
 * remove / reorder. It replaces the cramped fixed-width set-row inputs the
 * shared editor embedded before (ADR 0027 slice 9/9).
 *
 * Persistence vs. editing are split like every other token: the per-set values
 * ride on hidden inputs rendered **inline** here (in the form, always mounted
 * because the strength `sets` token always renders), while the popover — which
 * Radix portals out of the form — edits those same fields through
 * `useInputControl`. So the set values submit unchanged whether or not the
 * popover is open, and a sequence of set edits produces the same payload the
 * old set-row fields did.
 *
 * Add / duplicate / remove / reorder dispatch the same atomic `update` intent
 * the rest of the editor uses (`mutate`), which re-seeds the field-list keys —
 * so, like the step-scoped actions, they close the popover first (the sentence
 * re-derives, and a popover pinned to a field-list key would otherwise reattach
 * to whichever set lands there); per-set value edits stay open.
 */
function SetsTokenPopover({
	setsField,
	segment,
	mutate,
	children,
}: {
	setsField: FieldMeta
	segment: TokenSentenceSegment
	mutate: (mutate: (sets: DraftSetValue[]) => void) => void
	children: ReactNode
}) {
	const [open, setOpen] = useState(false)
	const setList = setsField.getFieldList() as FieldMeta[]

	function closeThen(action: () => void) {
		setOpen(false)
		action()
	}

	return (
		<>
			{setList.map((setField, index) => (
				<SetHiddenFields key={setField.key} setField={setField} index={index} />
			))}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					type="button"
					aria-label={`Edit sets: ${segment.text}`}
					data-token-editor="sets"
					className="focus-visible:ring-ring hover:bg-muted -mx-0.5 cursor-pointer rounded-sm px-0.5 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
				>
					{children}
				</PopoverTrigger>
				<PopoverContent className="w-80">
					<PopoverHeader>
						<PopoverTitle>Sets</PopoverTitle>
					</PopoverHeader>
					<div className="space-y-2">
						{setList.map((setField, index) => (
							<SetEditorRow
								key={setField.key}
								setField={setField}
								index={index}
								onDuplicate={() =>
									closeThen(() =>
										mutate((sets) => {
											const source = sets[index]
											if (!source) return
											sets.splice(index + 1, 0, { ...source })
										}),
									)
								}
								onMoveEarlier={
									index > 0
										? () =>
												closeThen(() =>
													mutate((sets) => {
														sets.splice(index - 1, 0, ...sets.splice(index, 1))
													}),
												)
										: undefined
								}
								onMoveLater={
									index < setList.length - 1
										? () =>
												closeThen(() =>
													mutate((sets) => {
														sets.splice(index + 1, 0, ...sets.splice(index, 1))
													}),
												)
										: undefined
								}
								onRemove={
									setList.length > 1
										? () =>
												closeThen(() =>
													mutate((sets) => {
														sets.splice(index, 1)
													}),
												)
										: undefined
								}
							/>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								closeThen(() =>
									mutate((sets) => {
										sets.push({ ...emptySet() })
									}),
								)
							}
						>
							+ Add set
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</>
	)
}

/**
 * The always-mounted, in-form carriers for one set's values — the elements the
 * browser serializes on submit (the popover's editors are portaled out of the
 * form by Radix, so they can't). These are *controlled* hidden inputs bound to
 * the live Conform field value: the popover edits the field through
 * `useInputControl`, and each input re-renders with the new value. (Uncontrolled
 * `getInputProps` inputs wouldn't do — they ignore a programmatic control change
 * such as the kind Select's, only reflecting values typed into them directly.)
 * `orderIndex` is pinned to the row position, as the classic set-row editor did.
 */
function SetHiddenFields({
	setField,
	index,
}: {
	setField: FieldMeta
	index: number
}) {
	const setFs = setField.getFieldset()
	// A pristine nested field exposes its seed through `initialValue`, not
	// `value` (which is undefined until the field is dirtied) — fall back so the
	// hidden input carries the seeded set on submit even if it was never edited.
	const val = (meta: FieldMeta) => {
		if (typeof meta.value === 'string') return meta.value
		if (typeof meta.initialValue === 'string') return meta.initialValue
		return ''
	}
	return (
		<>
			<input
				type="hidden"
				name={setFs.kind.name}
				value={val(setFs.kind) || 'reps'}
				readOnly
			/>
			<input
				type="hidden"
				name={setFs.reps.name}
				value={val(setFs.reps)}
				readOnly
			/>
			<input
				type="hidden"
				name={setFs.durationSec.name}
				value={val(setFs.durationSec)}
				readOnly
			/>
			<input
				type="hidden"
				name={setFs.weightKg.name}
				value={val(setFs.weightKg)}
				readOnly
			/>
			<input
				type="hidden"
				name={setFs.pct1RM.name}
				value={val(setFs.pct1RM)}
				readOnly
			/>
			<input
				type="hidden"
				name={setFs.orderIndex.name}
				value={String(index)}
				readOnly
			/>
		</>
	)
}

const SET_KIND_LABELS: Record<string, string> = {
	reps: 'Reps',
	timed: 'Timed',
	amrap: 'AMRAP',
}

/** A `useInputControl` seeded from a field's metadata — the popover's editors
 * all bind their field this way. */
function useFieldControl(meta: FieldMeta) {
	return useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
}

function SetEditorRow({
	setField,
	index,
	onDuplicate,
	onMoveEarlier,
	onMoveLater,
	onRemove,
}: {
	setField: FieldMeta
	index: number
	onDuplicate: () => void
	onMoveEarlier?: () => void
	onMoveLater?: () => void
	onRemove?: () => void
}) {
	const setFs = setField.getFieldset()
	const kind = useFieldControl(setFs.kind)
	const reps = useFieldControl(setFs.reps)
	const durationSec = useFieldControl(setFs.durationSec)
	const weightKg = useFieldControl(setFs.weightKg)
	const pct1RM = useFieldControl(setFs.pct1RM)
	const setKind = (typeof kind.value === 'string' && kind.value) || 'reps'
	const num = (c: ReturnType<typeof useFieldControl>) =>
		typeof c.value === 'string' ? c.value : ''
	const inputClass =
		'border-input bg-background h-8 w-full rounded-md border px-2 text-sm'

	// kg and %1RM are mutually exclusive per set (schema `weightXorPct`): the UI
	// enforces it by clearing the other field the moment one is given a value,
	// so the athlete can never author both. Server Zod stays the safety net.
	function changeWeight(value: string) {
		weightKg.change(value)
		if (value.trim()) pct1RM.change('')
	}
	function changePct(value: string) {
		pct1RM.change(value)
		if (value.trim()) weightKg.change('')
	}

	return (
		<div className="border-border/70 space-y-2 rounded border p-2">
			<div className="flex items-center justify-between">
				<span className="text-body-2xs text-muted-foreground font-medium">
					Set {index + 1}
				</span>
				<div className="w-28">
					<Select value={setKind} onValueChange={(value) => kind.change(value)}>
						<SelectTrigger
							aria-label={`Set ${index + 1} kind`}
							onFocus={() => kind.focus()}
							onBlur={() => kind.blur()}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{EXERCISE_SET_KINDS.map((k) => (
								<SelectItem key={k} value={k}>
									{SET_KIND_LABELS[k]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="flex flex-wrap items-end gap-2">
				{setKind === 'reps' ? (
					<label className="w-16 space-y-1">
						<span className="text-body-2xs text-muted-foreground font-medium">
							Reps
						</span>
						<input
							type="number"
							min={1}
							aria-label={`Set ${index + 1} reps`}
							value={num(reps)}
							onChange={(event) => reps.change(event.target.value)}
							className={inputClass}
						/>
					</label>
				) : setKind === 'timed' ? (
					<label className="w-20 space-y-1">
						<span className="text-body-2xs text-muted-foreground font-medium">
							Secs
						</span>
						<input
							type="number"
							min={1}
							aria-label={`Set ${index + 1} seconds`}
							value={num(durationSec)}
							onChange={(event) => durationSec.change(event.target.value)}
							className={inputClass}
						/>
					</label>
				) : null}
				<label className="w-20 space-y-1">
					<span className="text-body-2xs text-muted-foreground font-medium">
						kg
					</span>
					<input
						type="number"
						min={0}
						step={0.5}
						placeholder="—"
						aria-label={`Set ${index + 1} kg`}
						value={num(weightKg)}
						onChange={(event) => changeWeight(event.target.value)}
						className={inputClass}
					/>
				</label>
				<label className="w-16 space-y-1">
					<span className="text-body-2xs text-muted-foreground font-medium">
						%1RM
					</span>
					<input
						type="number"
						min={0}
						max={200}
						placeholder="—"
						aria-label={`Set ${index + 1} %1RM`}
						value={num(pct1RM)}
						onChange={(event) => changePct(event.target.value)}
						className={inputClass}
					/>
				</label>
			</div>
			<div className="flex flex-wrap gap-1">
				<Button type="button" variant="ghost" size="xs" onClick={onDuplicate}>
					Duplicate
				</Button>
				{onMoveEarlier ? (
					<Button
						type="button"
						variant="ghost"
						size="xs"
						aria-label={`Move set ${index + 1} earlier`}
						onClick={onMoveEarlier}
					>
						↑
					</Button>
				) : null}
				{onMoveLater ? (
					<Button
						type="button"
						variant="ghost"
						size="xs"
						aria-label={`Move set ${index + 1} later`}
						onClick={onMoveLater}
					>
						↓
					</Button>
				) : null}
				{onRemove ? (
					<Button
						type="button"
						variant="destructive"
						size="xs"
						aria-label={`Remove set ${index + 1}`}
						onClick={onRemove}
					>
						Remove
					</Button>
				) : null}
			</div>
		</div>
	)
}

// ——— Token popover —————————————————————————————————————————————————————

type StepActions = {
	/** Absent callback → the action does not apply (first/last/only step). */
	onMoveEarlier?: () => void
	onMoveLater?: () => void
	onRemove?: () => void
}

function TokenEditorPopover({
	meta,
	kind,
	segment,
	stepActions,
	children,
}: {
	meta: FieldMeta
	kind: EditorKind
	segment: TokenSentenceSegment
	stepActions?: StepActions
	children: ReactNode
}) {
	const [open, setOpen] = useState(false)
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
	const label = EDITOR_LABELS[kind]
	// The live draft value comes from the field metadata (kept fresh by
	// Conform's input tracking), not the control's internal state — the
	// classic field UI edits the same field alongside this popover.
	const rawValue = typeof meta.value === 'string' ? meta.value : ''

	// The notes marker's `*` would make a cryptic accessible name; every other
	// token's text is its value and belongs in the name.
	const triggerLabel =
		kind === 'notes' ? 'Edit notes' : `Edit ${label}: ${segment.text}`

	function closeThen(action: () => void) {
		// Close before dispatching: the intent re-derives the sentence, and an
		// open popover pinned to a segment position would otherwise attach to
		// whichever token lands there.
		setOpen(false)
		action()
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				type="button"
				aria-label={triggerLabel}
				data-token-editor={kind}
				className="focus-visible:ring-ring hover:bg-muted -mx-0.5 cursor-pointer rounded-sm px-0.5 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
			>
				{children}
			</PopoverTrigger>
			<PopoverContent className="w-64">
				<PopoverHeader>
					<PopoverTitle className="capitalize">{label}</PopoverTitle>
				</PopoverHeader>
				{kind === 'notes' ? (
					// Uncontrolled on purpose: the write-through round-trips through a
					// Conform effect, and a controlled value that lags a keystroke
					// behind would clobber fast typing. The popover content mounts
					// fresh on every open, so `defaultValue` is always current.
					<Textarea
						aria-label="Note text"
						rows={3}
						defaultValue={rawValue}
						onChange={(event) => control.change(event.target.value)}
						onFocus={() => control.focus()}
						onBlur={() => control.blur()}
					/>
				) : (
					<StepperEditor
						label={label}
						config={STEPPERS[kind]}
						rawValue={rawValue}
						onChange={(value) => control.change(value)}
					/>
				)}
				{stepActions ? (
					<div className="flex flex-wrap justify-center gap-1">
						{stepActions.onMoveEarlier ? (
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={() => closeThen(stepActions.onMoveEarlier!)}
							>
								Move earlier
							</Button>
						) : null}
						{stepActions.onMoveLater ? (
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={() => closeThen(stepActions.onMoveLater!)}
							>
								Move later
							</Button>
						) : null}
						{stepActions.onRemove ? (
							<Button
								type="button"
								variant="destructive"
								size="xs"
								onClick={() => closeThen(stepActions.onRemove!)}
							>
								Remove step
							</Button>
						) : null}
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	)
}

function StepperEditor({
	label,
	config,
	rawValue,
	onChange,
}: {
	label: string
	config: StepperConfig
	rawValue: string
	onChange: (serialized: string) => void
}) {
	const value = rawValue.trim() ? config.parse(rawValue) : null

	function decrease() {
		if (value == null) return
		onChange(
			config.serialize(Math.max(config.min, value - config.step(value - 1))),
		)
	}

	function increase() {
		const next = value == null ? config.start : value + config.step(value)
		onChange(
			config.serialize(config.max != null ? Math.min(config.max, next) : next),
		)
	}

	return (
		<div className="flex items-center justify-center gap-3">
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label={`Decrease ${label}`}
				disabled={value == null || value <= config.min}
				onClick={decrease}
			>
				−
			</Button>
			<span className="min-w-16 text-center font-medium tabular-nums">
				{value != null ? config.display(value) : '—'}
			</span>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label={`Increase ${label}`}
				disabled={config.max != null && value != null && value >= config.max}
				onClick={increase}
			>
				+
			</Button>
		</div>
	)
}
