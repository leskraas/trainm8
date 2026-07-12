/**
 * The editable Token Sentence (ADR 0027, R3; workout-editor spec §2.4 + §9,
 * #252): renders the live Workout Notation from the draft Conform form
 * values and makes the value tokens interactive.
 *
 * The simple value tokens (duration, distance, repeat count, rest, notes)
 * share ONE retargeting popover (`TokenPopover`): every token is a native
 * button tab stop named value + facet + position, opening the caret-anchored
 * popover; activating another token glides the open popover to the new
 * anchor and swaps its content in place — never close-and-reopen. Every
 * numeric value is type-to-edit with ± nudges, and only values the format
 * layer parses are written back, so the athlete can never trip a red form
 * error for a value this UI accepted. Committed changes announce through a
 * polite live region in human words. The intensity chip opens the same
 * instrument with the §7.3 editor body (#253); the exercise and sets tokens
 * keep their own popovers until their interaction tickets fold them in.
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
 */
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { useInputControl } from '@conform-to/react'
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import {
	ScoreStanza,
	type StanzaTokenSegment,
} from '#app/components/score-stanza.tsx'
import {
	createTokenPopoverHandle,
	TokenPopover,
	TokenPopoverTrigger,
} from '#app/components/token-popover.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
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
	type DraftBlockValue,
	type DraftSetValue,
	type DraftStepValue,
	type NotationToken,
	type TokenAddress,
	type WorkoutNotation,
} from '#app/utils/workout-notation.ts'
import {
	EXERCISE_SET_KINDS,
	STEP_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/index.ts'
import { BlockEditorSheet } from './__block-editor-sheet.tsx'
import { ExerciseCombobox, type ExerciseItem } from './__exercise-combobox.tsx'
import { IntensityPopoverEditor } from './__intensity-popover.tsx'
import { STEP_KIND_LABELS } from './__workout-step-fields.tsx'

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
	| 'intensity'

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
		case 'intensity':
			return 'intensity'
		// Exercise and sets keep their own instruments; block labels never
		// render on the line (G2).
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
	notes: 'note',
	intensity: 'intensity',
}

// ——— The retargeting popover's payload ——————————————————————————————————

/**
 * What a token trigger hands the shared popover: the editor kind and the
 * token's address — deliberately no live field metadata, which the popover
 * body re-resolves from the current form state on every render (the payload
 * is captured once, at open).
 */
type TokenPayload = { kind: EditorKind; address: TokenAddress }

// ——— Stepper value codecs ———————————————————————————————————————————————

/**
 * A numeric token editor: how the form field's string becomes a number, how a
 * stepped number is written back (always a string the schema accepts), and
 * the step curve. `start` seeds the first increase when the field is empty
 * (only rest can be empty — a bare `(rest)` token still renders).
 * `parseInput` covers the one field whose form value isn't what the
 * athlete types (`restSeconds` stores raw seconds, edits as a duration).
 * `min`/`max` bound the ± nudges; typed values only honor `max` — the
 * stepper floor is a nudge convention, not a schema bound, and the athlete
 * may author any value the format layer parses (the schema is the truth).
 */
type StepperConfig = {
	parse: (value: string) => number | null
	serialize: (value: number) => string
	display: (value: number) => string
	/** Parse athlete-typed text (defaults to `parse`). */
	parseInput?: (text: string) => number | null
	/** The touch keypad for the type-to-edit input (§9.2). */
	inputMode: 'decimal' | 'numeric'
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

const STEPPERS: Record<
	Exclude<EditorKind, 'notes' | 'intensity'>,
	StepperConfig
> = {
	duration: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		inputMode: 'decimal',
		step: durationStep,
		min: 15,
		start: 300,
	},
	rest: {
		parse: parseDuration,
		serialize: formatDuration,
		display: formatDuration,
		inputMode: 'decimal',
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	restSeconds: {
		parse: parseSeconds,
		serialize: String,
		display: formatDuration,
		// The form value is raw seconds, but the athlete reads and types the
		// humane duration form (`1 min 30 s`).
		parseInput: parseDuration,
		inputMode: 'decimal',
		step: (sec) => (sec < 120 ? 15 : 30),
		min: 15,
		start: 60,
	},
	distance: {
		parse: (value) => parseDistance(value, { defaultUnit: 'm' }),
		serialize: formatDistance,
		display: formatDistance,
		inputMode: 'decimal',
		// Steps must land on values `formatDistance` renders losslessly (0.1 km
		// resolution above 1 km), or the round-trip would drift.
		step: (m) => (m < 1000 ? 100 : 500),
		min: 100,
		start: 1000,
	},
	repeat: {
		parse: parseCount,
		serialize: String,
		display: String,
		inputMode: 'numeric',
		step: () => 1,
		min: 1,
		max: 99,
		start: 2,
	},
}

// ——— Accessible names & announcements ———————————————————————————————————

function capitalize(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text
}

/**
 * A token button's accessible name: value + facet + position (§9.4) —
 * "6 min duration, step 1 of 2, block 2 of 4". Facet words that already live
 * in the token's own text (`1 min rest`) aren't repeated.
 */
function tokenAccessibleName(
	token: NotationToken,
	kind: EditorKind,
	notation: WorkoutNotation,
): string {
	const { blockIndex, stepIndex } = token.address
	const blockCount = notation.blocks.length
	const stepCount = notation.blocks[blockIndex]?.steps.length ?? 1
	const position =
		stepIndex == null
			? `block ${blockIndex + 1} of ${blockCount}`
			: `step ${stepIndex + 1} of ${stepCount}, block ${blockIndex + 1} of ${blockCount}`
	const subject = (() => {
		switch (kind) {
			case 'duration':
				return `${token.text} duration`
			case 'distance':
				return `${token.text} distance`
			case 'repeat':
				return `repeated ${token.type === 'repeat' ? token.count : token.text} times`
			case 'rest':
				return token.text
			case 'restSeconds':
				return `${token.text} between sets`
			case 'notes':
				return `note: ${token.type === 'notes' ? token.note : token.text}`
			case 'intensity':
				// The chip's content is the authored value in its own form (§7.2);
				// the mid-edit draft placeholder has no chip yet.
				return token.type === 'intensity' && token.chip
					? `${token.chip.text} intensity`
					: 'intensity, not set yet'
		}
	})()
	return `${subject}, ${position}`
}

/**
 * A polite live region announcing committed token changes in human words
 * (§9.4). Announcements debounce briefly so a typed edit announces its final
 * value once, not every keystroke.
 */
function usePoliteAnnouncer() {
	const [message, setMessage] = useState('')
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const announce = useCallback((text: string) => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => setMessage(text), 350)
	}, [])
	useEffect(
		() => () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
		},
		[],
	)
	const liveRegion = (
		<div aria-live="polite" role="status" className="sr-only">
			{message}
		</div>
	)
	return { liveRegion, announce }
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

/**
 * The ＋ kind chooser's seeds (§4.1, G5): each kind lands as its own
 * notation — never a blind cardio insert. Cardio seeds the visible 10 min
 * step; strength seeds its exercise + `1 × 5` placeholder tokens; rest seeds
 * the 1 min the notation renders as `( 1 min rest )`.
 */
export function sentenceStepOfKind(kind: StepKind) {
	switch (kind) {
		case 'strength':
			return { ...emptyStep(), kind: 'strength' }
		case 'rest':
			return { ...emptyStep(), kind: 'rest', duration: '1 min' }
		case 'cardio':
			return sentenceStep()
	}
}

/** The seed hint each kind-chooser row carries (§4.1). */
const STEP_KIND_HINTS: Record<StepKind, string> = {
	cardio: 'starts as 10 min',
	strength: 'starts as an exercise, 1 × 5',
	rest: 'starts as 1 min of recovery',
}

// ——— The inline chrome marks ————————————————————————————————————————————

/**
 * The ⠿/⋮/＋ marks' shared treatment (§2.3, B1): ink-faint on the text
 * baseline, hover/press/open in accent on accent-soft, ≥22 px hit targets
 * (30 px under 640 px) grown through padding + negative margins so the line
 * never shifts, and a visible focus ring — every mark is a native tab stop.
 */
const CHROME_MARK_CLASS =
	'text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground focus-visible:ring-ring -my-1.5 inline-flex min-h-[22px] min-w-[22px] cursor-pointer items-center justify-center self-center rounded-sm px-0.5 text-[0.85em] leading-none select-none outline-none focus-visible:ring-2 max-sm:min-h-[30px] max-sm:min-w-[30px]'

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

	// The one popover the simple value tokens share (§2.4/§9.1): every trigger
	// connects through this handle, so activating another token retargets the
	// open popover instead of closing it.
	const popoverHandle = useMemo(
		() => createTokenPopoverHandle<TokenPayload>(),
		[],
	)
	const { liveRegion, announce } = usePoliteAnnouncer()

	// The structural chrome's transient UI state: the block whose ⠿ menu is
	// open (its row tints), the gutter popover for name/repeat editing, the
	// summoned block-editor sheet, and the pointer-drag reorder bookkeeping.
	const [menuBlockIndex, setMenuBlockIndex] = useState<number | null>(null)
	const [gutterEditor, setGutterEditor] = useState<{
		type: 'name' | 'repeat'
		blockIndex: number
	} | null>(null)
	const [sheetBlockIndex, setSheetBlockIndex] = useState<number | null>(null)
	const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
	const gripRefs = useRef(new Map<number, HTMLElement>())
	const gutterAnchorRef = useRef<HTMLElement | null>(null)
	const dragBlockIndex = useRef<number | null>(null)

	function openGutterEditor(type: 'name' | 'repeat', blockIndex: number) {
		gutterAnchorRef.current = gripRefs.current.get(blockIndex) ?? null
		setGutterEditor({ type, blockIndex })
	}

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
		announce(to < from ? 'Step moved earlier' : 'Step moved later')
	}

	function duplicateStep(blockIndex: number, stepIndex: number) {
		restructure((blocks) => {
			const steps = blocks[blockIndex]?.steps
			if (!steps) return
			const source = steps[stepIndex]
			if (!source) return
			steps.splice(
				stepIndex + 1,
				0,
				JSON.parse(JSON.stringify(source)) as DraftStepValue,
			)
		})
		announce('Step duplicated')
	}

	// Removing a block's only step removes the block itself (§3, G4): the ⋮
	// Remove action stays uniform on every step, and only the whole workout's
	// last step is guarded (the empty state is a later slice).
	function removeStep(blockIndex: number, stepIndex: number) {
		const removesBlock = (draftBlocks[blockIndex]?.steps?.length ?? 0) <= 1
		restructure((blocks) => {
			const steps = blocks[blockIndex]?.steps
			if (!steps) return
			if (steps.length > 1) steps.splice(stepIndex, 1)
			else blocks.splice(blockIndex, 1)
		})
		announce(removesBlock ? 'Step removed with its block' : 'Step removed')
	}

	function addStepOfKind(blockIndex: number, kind: StepKind) {
		restructure((blocks) => {
			const block = blocks[blockIndex]
			if (!block) return
			block.steps = [...(block.steps ?? []), sentenceStepOfKind(kind)]
		})
		announce(`${STEP_KIND_LABELS[kind]} step added`)
	}

	function moveBlock(from: number, to: number) {
		if (from === to) return
		restructure((blocks) => {
			blocks.splice(to, 0, ...blocks.splice(from, 1))
		})
		announce(to < from ? 'Block moved earlier' : 'Block moved later')
	}

	function addBlockAfter(blockIndex: number) {
		restructure((blocks) => {
			blocks.splice(blockIndex + 1, 0, sentenceBlock())
		})
		announce('Block added')
	}

	function removeBlock(blockIndex: number) {
		restructure((blocks) => {
			blocks.splice(blockIndex, 1)
		})
		announce('Block deleted')
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

	function renderToken(segment: StanzaTokenSegment, children: ReactNode) {
		const { token } = segment
		const { blockIndex, stepIndex } = token.address
		const blockField = blockList[blockIndex]
		if (!blockField) return children
		const blockFields = blockField.getFieldset()

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

		// The simple value tokens share the one retargeting popover: the token
		// renders as a native button tab stop (its accessible name is value +
		// facet + position, §9.4) whose activation opens — or glides — the
		// shared instrument to this anchor.
		const kind = editorKindFor(token)
		if (!kind) return children
		if (!resolvePayload({ kind, address: token.address })) return children
		return (
			<TokenPopoverTrigger
				handle={popoverHandle}
				payload={{ kind, address: token.address }}
				aria-label={tokenAccessibleName(token, kind, notation)}
				data-token-editor={kind}
			>
				{children}
			</TokenPopoverTrigger>
		)
	}

	/**
	 * Resolve a payload's live Conform field metadata from the current form
	 * state — re-resolved on every render so the popover body never reads
	 * stale metadata, and null when a structure change has removed the
	 * address out from under an open popover. Structural actions live in the
	 * ⠿/⋮ menus (§3), not here: the popover is purely the value's editor.
	 */
	function resolvePayload(payload: TokenPayload): {
		meta: FieldMeta
		intensityContext?: IntensityContext
	} | null {
		const { blockIndex, stepIndex, field } = payload.address
		const blockField = blockList[blockIndex]
		if (!blockField) return null
		const blockFields = blockField.getFieldset()
		if (stepIndex == null) {
			return field === 'repeatCount' ? { meta: blockFields.repeatCount } : null
		}
		const stepList = blockFields.steps.getFieldList() as FieldMeta[]
		const stepField = stepList[stepIndex]
		if (!stepField) return null
		const stepFields = stepField.getFieldset()
		const meta = stepFields[field]
		if (!meta) return null
		// The intensity editor resolves facets against the step's effective
		// discipline (step override or the workout's), like the notation does.
		const effectiveDiscipline =
			(stepFields.discipline?.value as string | undefined) ||
			workoutDiscipline ||
			'run'
		return {
			meta,
			intensityContext: {
				profile: thresholds?.[effectiveDiscipline] ?? null,
				effectiveDiscipline,
			},
		}
	}

	/** The three-row kind chooser's items (§4.1) — shared by the line's ＋
	 * and the block menu's Add-step submenu, so a step kind is always chosen,
	 * never assumed. */
	function kindChooserItems(blockIndex: number) {
		return STEP_KINDS.map((kind) => (
			<DropdownMenuItem
				key={kind}
				onClick={() => addStepOfKind(blockIndex, kind)}
			>
				<span className="flex flex-col">
					<span className="font-medium">{STEP_KIND_LABELS[kind]}</span>
					<span className="text-muted-foreground text-xs">
						{STEP_KIND_HINTS[kind]}
					</span>
				</span>
			</DropdownMenuItem>
		))
	}

	const blockCount = blockList.length

	// The stanza is the editor's rendering (spec §2, #251): one block per
	// line, gutter grip + repeat badge, the intensity chip as the line's only
	// chip. The structural chrome is always visible on the line (§2.3/§3):
	// the gutter ⠿ opens the block menu and drags to reorder, every step
	// leads with its ⋮ menu, the line ends in the ＋ kind chooser, and
	// `+ block` closes the stanza like the prototype's footer.
	return (
		<div data-token-sentence-editor className={cn('text-body-sm', className)}>
			<ScoreStanza
				notation={notation}
				renderToken={renderToken}
				renderGrip={(blockIndex) => (
					<DropdownMenu
						onOpenChange={(open) => setMenuBlockIndex(open ? blockIndex : null)}
					>
						<DropdownMenuTrigger
							ref={(element: HTMLElement | null) => {
								if (element) gripRefs.current.set(blockIndex, element)
								else gripRefs.current.delete(blockIndex)
							}}
							aria-label={`Block ${blockIndex + 1} of ${blockCount} actions`}
							title="Block actions — drag to reorder"
							data-stanza-grip
							className={cn(
								CHROME_MARK_CLASS,
								'cursor-grab active:cursor-grabbing',
							)}
							draggable
							onDragStart={(event: React.DragEvent) => {
								dragBlockIndex.current = blockIndex
								event.dataTransfer.effectAllowed = 'move'
								try {
									event.dataTransfer.setData('text/plain', String(blockIndex))
								} catch {
									// jsdom's dataTransfer may be read-only; the index rides the ref.
								}
							}}
							onDragEnd={() => {
								dragBlockIndex.current = null
								setDropTargetIndex(null)
							}}
						>
							⠿
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-auto min-w-52">
							<DropdownMenuItem
								onClick={() => openGutterEditor('name', blockIndex)}
							>
								Name…
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => openGutterEditor('repeat', blockIndex)}
							>
								Repeat…
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={blockIndex === 0}
								onClick={() => moveBlock(blockIndex, blockIndex - 1)}
							>
								Move earlier
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={blockIndex === blockCount - 1}
								onClick={() => moveBlock(blockIndex, blockIndex + 1)}
							>
								Move later
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuSub>
								<DropdownMenuSubTrigger>Add step</DropdownMenuSubTrigger>
								<DropdownMenuSubContent className="w-auto min-w-44">
									{kindChooserItems(blockIndex)}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuItem onClick={() => addBlockAfter(blockIndex)}>
								Add block after
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setSheetBlockIndex(blockIndex)}>
								Open block editor…
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								disabled={blockCount === 1}
								onClick={() => removeBlock(blockIndex)}
							>
								Delete block
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				renderStepChrome={(blockIndex, step) => {
					const stepCount = draftBlocks[blockIndex]?.steps?.length ?? 1
					const stepIndex = step.stepIndex
					return (
						<DropdownMenu>
							<DropdownMenuTrigger
								aria-label={`Step ${stepIndex + 1} of ${stepCount} actions, block ${blockIndex + 1} of ${blockCount}`}
								data-step-menu
								className={CHROME_MARK_CLASS}
							>
								⋮
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-auto min-w-44">
								<DropdownMenuItem
									disabled={stepIndex === 0}
									onClick={() => moveStep(blockIndex, stepIndex, stepIndex - 1)}
								>
									Move earlier
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={stepIndex === stepCount - 1}
									onClick={() => moveStep(blockIndex, stepIndex, stepIndex + 1)}
								>
									Move later
								</DropdownMenuItem>
								<DropdownMenuItem
									onClick={() => duplicateStep(blockIndex, stepIndex)}
								>
									Duplicate
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
									disabled={stepCount === 1 && blockCount === 1}
									onClick={() => removeStep(blockIndex, stepIndex)}
								>
									Remove
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)
				}}
				lineExtras={(blockIndex) => (
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-label={`Add step to block ${blockIndex + 1}`}
							data-add-step
							className={CHROME_MARK_CLASS}
						>
							＋
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-auto min-w-44">
							{kindChooserItems(blockIndex)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
				lineProps={(blockIndex) => ({
					className: cn(
						'transition-colors',
						(menuBlockIndex === blockIndex || dropTargetIndex === blockIndex) &&
							'bg-accent/40',
					),
					'data-drop-target': dropTargetIndex === blockIndex ? '' : undefined,
					onDragOver: (event) => {
						const from = dragBlockIndex.current
						if (from == null || from === blockIndex) return
						event.preventDefault()
						event.dataTransfer.dropEffect = 'move'
						setDropTargetIndex((current) =>
							current === blockIndex ? current : blockIndex,
						)
					},
					onDragLeave: () =>
						setDropTargetIndex((current) =>
							current === blockIndex ? null : current,
						),
					onDrop: (event) => {
						event.preventDefault()
						const from = dragBlockIndex.current
						dragBlockIndex.current = null
						setDropTargetIndex(null)
						if (from != null && from !== blockIndex) {
							moveBlock(from, blockIndex)
						}
					},
				})}
			/>
			<div className="pt-2">
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
			<TokenPopover
				handle={popoverHandle}
				label={(payload) => EDITOR_LABELS[payload.kind]}
			>
				{(payload) => {
					const resolved = resolvePayload(payload)
					if (!resolved) return null
					const { blockIndex, stepIndex, field } = payload.address
					return (
						<ActiveTokenEditor
							// Remount per token so editor state (typed text, the bound
							// input control) resets when the popover retargets.
							key={`${blockIndex}-${stepIndex ?? 'block'}-${field}`}
							kind={payload.kind}
							meta={resolved.meta}
							announce={announce}
							intensityContext={resolved.intensityContext}
							closeThen={(action) => {
								// Close before dispatching: the intent re-derives the
								// sentence, and an open popover pinned to this address would
								// otherwise attach to whichever token lands there.
								popoverHandle.close()
								action()
							}}
						/>
					)
				}}
			</TokenPopover>
			{/* The gutter popover: the block menu's Name…/Repeat… editors,
			    anchored to the ⠿ grip that summoned them — block names never
			    render on the line (G2), so the grip is their anchor. */}
			<PopoverPrimitive.Root
				open={gutterEditor != null}
				onOpenChange={(open) => {
					if (!open) setGutterEditor(null)
				}}
				modal="trap-focus"
			>
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Positioner
						anchor={gutterAnchorRef}
						side="bottom"
						align="start"
						sideOffset={10}
						collisionPadding={8}
						className="isolate z-50"
					>
						<PopoverPrimitive.Popup
							data-slot="gutter-popover"
							finalFocus={gutterAnchorRef}
							className="bg-popover text-popover-foreground ring-foreground/10 motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-90 flex w-[19.5rem] max-w-[min(324px,calc(100vw-1rem))] origin-(--transform-origin) flex-col gap-3 rounded-xl p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_12px_rgb(0_0_0/0.08),0_16px_40px_-12px_rgb(0_0_0/0.18)] ring-1 duration-[130ms] outline-none"
						>
							{gutterEditor != null ? (
								<>
									<div className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
										{gutterEditor.type === 'name' ? 'block name' : 'repeat'}
									</div>
									{(() => {
										const blockField = blockList[gutterEditor.blockIndex]
										if (!blockField) return null
										const blockFields = blockField.getFieldset()
										return gutterEditor.type === 'name' ? (
											<BlockNameEditor
												key={gutterEditor.blockIndex}
												meta={blockFields.name}
												announce={announce}
												onClear={() => setGutterEditor(null)}
											/>
										) : (
											<GutterRepeatEditor
												key={gutterEditor.blockIndex}
												meta={blockFields.repeatCount}
												announce={announce}
											/>
										)
									})()}
								</>
							) : null}
							<PopoverPrimitive.Close className="sr-only">
								Close
							</PopoverPrimitive.Close>
						</PopoverPrimitive.Popup>
					</PopoverPrimitive.Positioner>
				</PopoverPrimitive.Portal>
			</PopoverPrimitive.Root>
			{/* The block editor sheet — the one summoned secondary surface (§0/§3),
			    opened from the ⠿ menu, dismissed back to the grip. */}
			<BlockEditorSheet
				blockIndex={sheetBlockIndex}
				onClose={() => setSheetBlockIndex(null)}
				blockField={
					sheetBlockIndex != null ? (blockList[sheetBlockIndex] ?? null) : null
				}
				blockNotation={
					sheetBlockIndex != null
						? (notation.blocks.find(
								(block) => block.blockIndex === sheetBlockIndex,
							) ?? null)
						: null
				}
				blockCount={blockCount}
				restructure={restructure}
				onMoveStep={moveStep}
				onDuplicateStep={duplicateStep}
				onAddStep={addStepOfKind}
				announce={announce}
				finalFocus={() =>
					sheetBlockIndex != null
						? (gripRefs.current.get(sheetBlockIndex) ?? null)
						: null
				}
			/>
			{liveRegion}
		</div>
	)
}

// ——— The gutter popover's editors ————————————————————————————————————————

/**
 * The block-name editor (G2): names live in the ⠿ menu and the sheet only.
 * Uncontrolled like the notes editor — the write-through round-trips a
 * Conform effect, and a controlled value lagging a keystroke would clobber
 * fast typing; the editor remounts per block (keyed), so `defaultValue` is
 * always current.
 */
function BlockNameEditor({
	meta,
	announce,
	onClear,
}: {
	meta: FieldMeta
	announce: (message: string) => void
	onClear: () => void
}) {
	const control = useFieldControl(meta)
	const rawValue = typeof meta.value === 'string' ? meta.value : ''
	return (
		<div className="flex flex-col gap-2">
			<input
				type="text"
				aria-label="Block name"
				defaultValue={rawValue}
				placeholder="e.g. Warm-up"
				maxLength={60}
				// 16 px text so mobile browsers never zoom the field (§9.2).
				className="border-input bg-background focus-visible:ring-ring h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-2"
				onChange={(event) => {
					control.change(event.target.value)
					announce(
						event.target.value.trim()
							? 'Block name updated'
							: 'Block name cleared',
					)
				}}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
			{rawValue.trim() ? (
				<Button
					type="button"
					variant="ghost"
					size="xs"
					onClick={() => {
						control.change('')
						announce('Block name cleared')
						onClear()
					}}
				>
					Clear name
				</Button>
			) : null}
		</div>
	)
}

/** The ⠿ menu's Repeat… editor — the same type-to-edit stepper the gutter
 * badge opens, so repeat is introduced and adjusted with one instrument. */
function GutterRepeatEditor({
	meta,
	announce,
}: {
	meta: FieldMeta
	announce: (message: string) => void
}) {
	const control = useFieldControl(meta)
	const rawValue = typeof meta.value === 'string' ? meta.value : ''
	return (
		<TypeToEditStepper
			label="repeat count"
			config={STEPPERS.repeat}
			rawValue={rawValue}
			announce={announce}
			onChange={(value) => control.change(value)}
		/>
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
	segment: StanzaTokenSegment
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

// ——— The active token's editor body ——————————————————————————————————————

/** What the intensity editor resolves facets against (§7.3). */
type IntensityContext = {
	profile: DisciplineProfileForResolver | null
	effectiveDiscipline: string
}

/**
 * The shared popover's body for the active token: a type-to-edit stepper for
 * the numeric kinds, a textarea for notes. Bound to the token's Conform
 * field through `useInputControl`, exactly as the classic field UI is — the
 * field tree, submission path, and server validation are untouched. The
 * step-scoped structure actions moved to the step's ⋮ menu (§3, #254).
 */
function ActiveTokenEditor({
	kind,
	meta,
	announce,
	intensityContext,
	closeThen,
}: {
	kind: EditorKind
	meta: FieldMeta
	announce: (message: string) => void
	intensityContext?: IntensityContext
	closeThen: (action: () => void) => void
}) {
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

	return (
		<>
			{kind === 'intensity' ? (
				// The §7.3 instrument: zone chips first, the quiet kind row, unit
				// toggles, and the provenance line. Removal closes first — clearing
				// the field removes the token this popover is anchored to.
				<IntensityPopoverEditor
					value={rawValue}
					onChange={(serialized) => control.change(serialized)}
					profile={intensityContext?.profile ?? null}
					effectiveDiscipline={intensityContext?.effectiveDiscipline ?? 'run'}
					announce={announce}
					onRemove={() => closeThen(() => control.change(''))}
				/>
			) : kind === 'notes' ? (
				// Uncontrolled on purpose: the write-through round-trips through a
				// Conform effect, and a controlled value that lags a keystroke
				// behind would clobber fast typing. This editor remounts per token
				// (keyed by address), so `defaultValue` is always current.
				<Textarea
					aria-label="Note text"
					rows={3}
					defaultValue={rawValue}
					// 16 px text so mobile browsers never zoom the field (§9.2).
					className="text-base"
					onChange={(event) => {
						control.change(event.target.value)
						announce('Note updated')
					}}
					onFocus={() => control.focus()}
					onBlur={() => control.blur()}
				/>
			) : (
				<TypeToEditStepper
					label={label}
					config={STEPPERS[kind]}
					rawValue={rawValue}
					announce={announce}
					onChange={(value) => control.change(value)}
				/>
			)}
		</>
	)
}

/**
 * Type-to-edit with ± nudges — never stepper-only (§2.4, B4). The input is
 * the value: the athlete types in the same humane form the token renders
 * (`6 min`, `1.5 km`), and only text the format layer parses is written back
 * to the form — an unparseable draft stays local to the input, so the token
 * (this popover's anchor) never vanishes mid-edit and the athlete can never
 * author a red value from here. Nudges clamp to the config's range; controls
 * meet the ≥44 px touch target and the input the 16 px / keypad rules (§9.2).
 */
function TypeToEditStepper({
	label,
	config,
	rawValue,
	announce,
	onChange,
}: {
	label: string
	config: StepperConfig
	rawValue: string
	announce: (message: string) => void
	onChange: (serialized: string) => void
}) {
	const fieldValue = rawValue.trim() ? config.parse(rawValue) : null
	const [text, setText] = useState(
		fieldValue != null ? config.display(fieldValue) : '',
	)

	function commit(next: number) {
		onChange(config.serialize(next))
		announce(`${capitalize(label)} set to ${config.display(next)}`)
	}

	function nudge(next: number) {
		setText(config.display(next))
		commit(next)
	}

	function decrease() {
		if (fieldValue == null) return
		nudge(Math.max(config.min, fieldValue - config.step(fieldValue - 1)))
	}

	function increase() {
		const next =
			fieldValue == null ? config.start : fieldValue + config.step(fieldValue)
		nudge(config.max != null ? Math.min(config.max, next) : next)
	}

	function handleTyped(nextText: string) {
		setText(nextText)
		const parsed = nextText.trim()
			? (config.parseInput ?? config.parse)(nextText)
			: null
		if (parsed == null) return
		if (config.max != null && parsed > config.max) return
		commit(parsed)
	}

	return (
		<div className="flex items-center gap-2">
			<Button
				type="button"
				variant="outline"
				aria-label={`Decrease ${label}`}
				disabled={fieldValue == null || fieldValue <= config.min}
				onClick={decrease}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				−
			</Button>
			<input
				type="text"
				inputMode={config.inputMode}
				aria-label={`${capitalize(label)} value`}
				value={text}
				onChange={(event) => handleTyped(event.target.value)}
				className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 flex-1 rounded-lg border px-3 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2"
			/>
			<Button
				type="button"
				variant="outline"
				aria-label={`Increase ${label}`}
				disabled={
					config.max != null && fieldValue != null && fieldValue >= config.max
				}
				onClick={increase}
				className="size-11 shrink-0 rounded-lg text-lg"
			>
				+
			</Button>
		</div>
	)
}
