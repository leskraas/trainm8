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
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	formatDistance,
	formatDuration,
	parseDistance,
	parseDuration,
} from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { cn } from '#app/utils/misc.tsx'
import { emptyBlock, emptyStep } from '#app/utils/workout-authoring.ts'
import {
	deriveWorkoutNotation,
	draftToNotationInput,
	NOTATION_SEPARATORS,
	type DraftBlockValue,
	type NotationToken,
} from '#app/utils/workout-notation.ts'

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
	/** id → name for the exercise catalog, so strength tokens read as names. */
	exerciseNames?: Record<string, string>
	/** Athlete thresholds per discipline; absent → facets degrade honestly. */
	thresholds?: DisciplineThresholdMap
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
	exerciseNames,
	thresholds,
	className,
}: TokenSentenceEditorProps) {
	const blockList = blocksField.getFieldList() as FieldMeta[]
	const draftBlocks = (blocksField.value ?? []) as DraftBlockValue[]
	const notation = deriveWorkoutNotation(
		draftToNotationInput(draftBlocks, { exerciseNames }),
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

	function renderToken(segment: TokenSentenceSegment, children: ReactNode) {
		const kind = editorKindFor(segment.token)
		if (!kind) return children
		const { blockIndex, stepIndex, field } = segment.token.address
		const blockField = blockList[blockIndex]
		if (!blockField) return children
		const blockFields = blockField.getFieldset()
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
