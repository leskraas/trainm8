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
 * instrument with the §7.3 editor body (#253), and the sets token opens it
 * with the §5.2 uniform-first sets editor (#256); only the exercise token
 * keeps its own instrument — the searchable combobox IS the token.
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
	TOKEN_POPUP_CLASS,
	TokenPopover,
	TokenPopoverTrigger,
} from '#app/components/token-popover.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	attachStashes,
	extractStashes,
	KIND_SEED_DURATIONS,
	normalizeKind,
	previewKindSwitch,
	switchStepKind,
	type StepKindStash,
	type SwitchableStep,
} from '#app/utils/step-kind-reconciliation.ts'
import { emptyBlock, emptyStep } from '#app/utils/workout-authoring.ts'
import {
	deriveWorkoutNotation,
	draftToNotationInput,
	type DraftBlockValue,
	type DraftSetValue,
	type DraftStepValue,
	type NotationToken,
	type TokenAddress,
	type TokenField,
	type WorkoutNotation,
} from '#app/utils/workout-notation.ts'
import {
	CARDIO_DISCIPLINES,
	STEP_KIND_LABELS,
	STEP_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'
import { type ServerErrorItem } from '#app/utils/workout-server-errors.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/index.ts'
import { BlockEditorSheet } from './__block-editor-sheet.tsx'
import {
	KindChooserItems,
	WorkoutEmptyState,
	type ArchetypeSeed,
} from './__empty-state.tsx'
import { ExerciseCombobox, type ExerciseItem } from './__exercise-combobox.tsx'
import { IntensityPopoverEditor, UnitToggle } from './__intensity-popover.tsx'
import {
	QUIET_TEXT_BUTTON_CLASS,
	StrengthSetsEditor,
} from './__sets-popover.tsx'
import {
	STEPPERS,
	TypeToEditStepper,
	useFieldControl,
} from './__token-editor-controls.tsx'
import {
	CHROME_ERROR_CLASS,
	MenuErrorLead,
	PopoverErrorLead,
	TOKEN_ERROR_CLASS,
	useServerErrorMarkings,
	ValidationSummaryLine,
	type ServerErrorRecord,
} from './__validation-summary.tsx'

// Conform metadata is typed loosely here, matching the sibling form modules
// (`__workout-editor.tsx`, `__workout-detail-editor.tsx`): the editor only
// reads names/keys/values and dispatches intents, so the generics add noise
// without safety.
type FieldMeta = any
type FormMeta = any

// ——— The complete field mirror ——————————————————————————————————————————
//
// The Token Sentence only mounts inputs for the tokens the athlete can tap, so
// a submit of just the sentence would drop the fields it never renders (block
// names, step kinds, strength sets). Both authoring surfaces — the create
// route's editor and the detail view's inline editor — keep the whole
// prescription in the form by rendering the complete Conform field tree as
// hidden inputs beside the sentence; the token popovers' `useInputControl`
// writes bind to these very fields by name, so an edited token updates its
// hidden input in place. These carriers also keep Conform tracking the full
// tree, so a structural `form.update` (a §11 seed, an add/remove block) is
// reflected in `blocksField.value` and re-renders the stanza. This is the same
// job the deleted nested-fieldset form used to do as a side effect of its real
// inputs (spec §12).

/**
 * One field as a hidden input carrying its CURRENT value. Deliberately
 * *controlled*, not `getInputProps`'s uncontrolled `defaultValue = initialValue`:
 * a field written programmatically (a popover edit, a structural `form.update`)
 * must ride the next submit as its live value, but an uncontrolled input keeps
 * its seeded `defaultValue` at the React level and only *happens* to submit the
 * live value while `useInputControl` mutates the DOM node underneath it — a
 * coupling that snaps back to the stale seed on a form reset. Reflecting the
 * live value directly makes the carrier authoritative (same job
 * `SetHiddenFields` does for per-set values).
 *
 * Used for the top-level session fields the detail editor mirrors; the
 * Block/Step tree carries its live *draft* value instead (see
 * `HiddenBlockFields`), because a removed facet can't be told from a pristine
 * one at the leaf.
 */
export function HiddenField({ meta }: { meta: FieldMeta }) {
	// The live value with the seed as fallback: a pristine loaded field exposes
	// its value only through `initialValue` (`value` is undefined until dirtied),
	// so falling back keeps it round-tripping; a dirtied field prefers `value`.
	const value = typeof meta.value === 'string' ? meta.value : meta.initialValue
	return (
		<input
			type="hidden"
			name={meta.name}
			value={typeof value === 'string' ? value : ''}
			readOnly
		/>
	)
}

/**
 * A controlled hidden carrier bound to a live *draft* value. Sourcing from the
 * draft (`blocksField.value`, the very tree the notation renders) is what makes
 * a removed facet drop: an emptied facet vanishes from the draft, yet its field
 * meta still reports the seeded `initialValue` with an `undefined` `value` —
 * indistinguishable from a never-touched loaded field — so `undefined` here
 * means "gone" and submits empty, never the lingering seed.
 */
function HiddenDraftField({ name, value }: { name: string; value?: string }) {
	return <input type="hidden" name={name} value={value ?? ''} readOnly />
}

/**
 * The Block/Step field tree as hidden inputs (block name/repeat and every
 * per-step scalar). Iterating the live field lists keeps the mirror in step
 * with add/remove/reorder and preserves Conform's tracking of the tree, while
 * each input's *value* comes from the aligned draft entry so a facet the athlete
 * removed submits empty rather than its stale seed. The per-*set* carriers are
 * deliberately NOT rendered here: a strength step's sets token already mounts
 * its own always-on `SetHiddenFields` beside the trigger, so mirroring the sets
 * again would give each set field two inputs and Conform would collect a
 * spurious `["8","8"]` value array.
 */
export function HiddenBlockFields({ blocksField }: { blocksField: FieldMeta }) {
	const draftBlocks = (blocksField.value ?? []) as DraftBlockValue[]
	return (
		<>
			{blocksField
				.getFieldList()
				.map((blockField: FieldMeta, blockIndex: number) => {
					const block = blockField.getFieldset()
					const draftBlock = draftBlocks[blockIndex]
					return (
						<div key={blockField.key} hidden>
							<HiddenDraftField
								name={block.name.name}
								value={draftBlock?.name}
							/>
							<HiddenDraftField
								name={block.repeatCount.name}
								value={draftBlock?.repeatCount}
							/>
							{block.steps
								.getFieldList()
								.map((stepField: FieldMeta, stepIndex: number) => {
									const step = stepField.getFieldset()
									const draftStep = draftBlock?.steps?.[stepIndex]
									return (
										<div key={stepField.key}>
											<HiddenDraftField
												name={step.kind.name}
												value={draftStep?.kind}
											/>
											<HiddenDraftField
												name={step.discipline.name}
												value={draftStep?.discipline}
											/>
											<HiddenDraftField
												name={step.intensity.name}
												value={draftStep?.intensity}
											/>
											<HiddenDraftField
												name={step.duration.name}
												value={draftStep?.duration}
											/>
											<HiddenDraftField
												name={step.distance.name}
												value={draftStep?.distance}
											/>
											<HiddenDraftField
												name={step.exerciseId.name}
												value={draftStep?.exerciseId}
											/>
											<HiddenDraftField
												name={step.restBetweenSetsSec.name}
												value={draftStep?.restBetweenSetsSec}
											/>
											<HiddenDraftField
												name={step.notes.name}
												value={draftStep?.notes}
											/>
										</div>
									)
								})}
						</div>
					)
				})}
		</>
	)
}

// ——— Token → editor mapping ————————————————————————————————————————————

/**
 * Which popover a token opens. Duration-flavoured editors differ only in
 * granularity: `duration` steps in athlete-sized increments, `rest` in the
 * finer steps recovery is written in. `restSeconds` is the strength
 * rest-between-sets field, whose form value is raw seconds, not a humane
 * string. `sets` opens the §5.2 uniform-first sets editor.
 */
type EditorKind =
	| 'duration'
	| 'distance'
	| 'repeat'
	| 'rest'
	| 'restSeconds'
	| 'notes'
	| 'intensity'
	| 'sets'
	| 'discipline'

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
		case 'sets':
			return 'sets'
		case 'discipline':
			return 'discipline'
		// The exercise token keeps its own instrument (the combobox IS the
		// token); block labels never render on the line (G2).
		default:
			return null
	}
}

const EDITOR_LABELS: Record<EditorKind, string> = {
	// The cardio quantity popover covers both measures behind its
	// Duration ⇄ Distance switch (§6.1, G8), so it caps as the domain word.
	duration: 'quantity',
	distance: 'quantity',
	repeat: 'repeat count',
	rest: 'rest',
	restSeconds: 'rest',
	notes: 'note',
	intensity: 'intensity',
	sets: 'sets',
	discipline: 'discipline',
}

// ——— The retargeting popover's payload ——————————————————————————————————

/**
 * What a token trigger hands the shared popover: the editor kind and the
 * token's address — deliberately no live field metadata, which the popover
 * body re-resolves from the current form state on every render (the payload
 * is captured once, at open).
 */
type TokenPayload = { kind: EditorKind; address: TokenAddress }

/** A payload's stable identity — the anchor token, not the shown facet. The
 * §6.1 swap-in-place state keys on this so it only applies while the popover
 * still sits on the token whose neighbour link set it. */
function payloadKey(payload: TokenPayload): string {
	const { blockIndex, stepIndex, field } = payload.address
	return `${blockIndex}-${stepIndex ?? 'block'}-${field}`
}

/** An editor body plus the form field its address points at — what a §6.1
 * neighbour link swaps the open popover to. */
type FacetTarget = { kind: EditorKind; field: TokenField }

/** Which §6.1 neighbour affordance a popover body already IS — excluded from
 * its own neighbour row. `none` excludes nothing (the rest-between-sets
 * popover, whose facet has its own footer home in the sets popover). */
type FacetExclude =
	| 'quantity'
	| 'intensity'
	| 'notes'
	| 'discipline'
	| 'sets'
	| 'none'

const FACET_EXCLUDES: Record<EditorKind, FacetExclude> = {
	duration: 'quantity',
	distance: 'quantity',
	// A rest step's rest IS its quantity — no "＋ time or distance" on itself.
	rest: 'quantity',
	restSeconds: 'none',
	notes: 'notes',
	intensity: 'intensity',
	sets: 'sets',
	discipline: 'discipline',
	repeat: 'none', // block-level; never renders a neighbour row
}

// ——— Accessible names & announcements ———————————————————————————————————

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
			case 'sets':
				// The compact set notation is the value; the mid-edit placeholder
				// token renders the bare word.
				return token.text === 'sets'
					? 'sets, not set yet'
					: `sets: ${token.text}`
			case 'discipline':
				return `${token.text} discipline`
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
 * The ＋ kind chooser's seeds (§4.1, G5): each kind lands as its own
 * notation — never a blind cardio insert. Cardio seeds the visible 10 min
 * step; strength seeds its exercise + `1 × 5` placeholder tokens; rest seeds
 * the 1 min the notation renders as `( 1 min rest )`. These are explicit,
 * hinted choices ("starts as 10 min") — the *implicit* new-session seed died
 * with §11's honest empty state.
 */
export function sentenceStepOfKind(kind: StepKind) {
	switch (kind) {
		case 'strength':
			return { ...emptyStep(), kind: 'strength' }
		case 'rest':
			return {
				...emptyStep(),
				kind: 'rest',
				duration: KIND_SEED_DURATIONS.rest,
			}
		case 'cardio':
			return { ...emptyStep(), duration: KIND_SEED_DURATIONS.cardio }
	}
}

export function sentenceBlockOfKind(kind: StepKind) {
	return { ...emptyBlock(), steps: [sentenceStepOfKind(kind)] }
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
	/**
	 * The header discipline field's Conform metadata — the §11 strength seed
	 * flips it to `strength` in the same atomic update that materializes the
	 * seed. Only its `name` is read; omitted, it defaults to `discipline`.
	 */
	disciplineMeta?: FieldMeta
	/**
	 * The last rejected save's error record (`SubmissionResult['error']`) —
	 * spec §10. Its object identity marks a new rejection: errors paint at
	 * their anchors, focus moves, and the live region announces. Pass the
	 * record straight off the action data; null/undefined paints nothing.
	 */
	serverErrors?: ServerErrorRecord | null
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
	disciplineMeta,
	serverErrors,
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

	// The last rejected save painted onto the current notation (§10): token
	// markings, ⋮/⠿ tints, and the summary items, live through edit-to-clear.
	// On a new 400 the first anchored item takes focus with a live-region
	// announcement in human words.
	const rootRef = useRef<HTMLDivElement>(null)
	const serverMarkings = useServerErrorMarkings({
		serverErrors,
		formValue: form.value ?? {},
		notation,
		announce,
		onRejected: (items) => {
			const first = items.find((item) => item.anchor.level !== 'floor')
			const element = first ? errorAnchorElement(first) : null
			if (element) {
				element.focus()
				return
			}
			// Nothing anchored — the zero-step floor (§11.6) or an anchor the
			// host doesn't render: the summary line itself takes focus, so
			// repair starts from the message.
			rootRef.current
				?.querySelector<HTMLElement>('[data-validation-summary]')
				?.focus()
		},
	})

	/** A token trigger's stable DOM address, so summary items and the 400's
	 * focus move can find their anchor element. */
	function tokenAnchorAttr(address: TokenAddress): string {
		return `${address.blockIndex}.${address.stepIndex ?? 'block'}.${address.field}`
	}

	function tokenAnchorElement(address: TokenAddress): HTMLElement | null {
		const element =
			rootRef.current?.querySelector<HTMLElement>(
				`[data-token-address="${tokenAnchorAttr(address)}"]`,
			) ?? null
		// The exercise token is a combobox in a wrapper span — the focusable
		// control inside is the real anchor.
		if (element?.dataset.tokenEditor === 'exercise') {
			return element.querySelector<HTMLElement>('input, button') ?? element
		}
		return element
	}

	/** The session header's form control for a workout-level error — found by
	 * name in the host form, skipped when the host renders it hidden. */
	function sessionAnchorElement(field: string): HTMLElement | null {
		const name = field === 'scheduledAt' ? 'scheduledAtDate' : field
		const hostForm = document.getElementById(form.id) as HTMLFormElement | null
		const control = hostForm?.elements.namedItem(name)
		if (!(control instanceof HTMLElement)) return null
		if (control.tabIndex === -1 || control.getAttribute('aria-hidden')) {
			return null
		}
		return control
	}

	/** Where a marking's anchor lives in the DOM; null for floor items and
	 * anchors the host doesn't render (§10.5 — degrade, never crash). */
	function errorAnchorElement(item: ServerErrorItem): HTMLElement | null {
		const { anchor } = item
		switch (anchor.level) {
			case 'token':
				return tokenAnchorElement(anchor.address)
			case 'step':
				return (
					stepMenuRefs.current.get(
						`${anchor.blockIndex}:${anchor.stepIndex}`,
					) ?? null
				)
			case 'block':
				return gripRefs.current.get(anchor.blockIndex) ?? null
			case 'session':
				return sessionAnchorElement(anchor.field)
			case 'floor':
				return null
		}
	}

	/**
	 * A summary item's activation (§10.1): retarget the editor's own
	 * instrument to the anchor — a token's popover opens (or glides) onto it,
	 * a step-anchored error opens its repair popover (§10.2: the first
	 * token's, whose neighbour row carries the ＋ links, or the ⋮ "Add…"
	 * fallback when the step is token-less), a block error opens the ⠿ menu
	 * that leads with the message, and a session error focuses its header
	 * field.
	 */
	function activateErrorAnchor(item: ServerErrorItem) {
		const { anchor } = item
		if (anchor.level === 'step') {
			const step = notation.blocks[anchor.blockIndex]?.steps.find(
				(candidate) => candidate.stepIndex === anchor.stepIndex,
			)
			const firstToken = step?.tokens[0]?.token
			const element = firstToken ? tokenAnchorElement(firstToken.address) : null
			if (element) {
				element.focus()
				if (!('popupOpen' in element.dataset)) element.click()
				return
			}
			// Token-less step: the ⋮-anchored "Add…" popover is the anchor of
			// last resort, opened on the absent facet when the path names one.
			const target: FacetTarget | undefined =
				anchor.facet === 'intensity'
					? { kind: 'intensity', field: 'intensity' }
					: anchor.facet === 'notes'
						? { kind: 'notes', field: 'notes' }
						: undefined
			openAddFacet(anchor.blockIndex, anchor.stepIndex, target)
			return
		}
		const element = errorAnchorElement(item)
		if (!element) return
		element.focus()
		// Tokens, grips and step marks toggle their popover/menu on click —
		// only click closed ones so activation never dismisses an open repair.
		if (
			anchor.level !== 'session' &&
			!('popupOpen' in element.dataset) &&
			element.getAttribute('aria-expanded') !== 'true'
		) {
			element.click()
		}
	}

	/** The sheet's inline error mirror (§10.5): every live message scoped to
	 * the sheet's block — block-level for `stepIndex` null, else the step's
	 * own (token- and step-anchored alike). */
	function sheetErrorMessages(
		blockIndex: number,
		stepIndex: number | null,
	): string[] {
		return serverMarkings.items.flatMap((item) => {
			const { anchor } = item
			const matches =
				stepIndex == null
					? (anchor.level === 'block' && anchor.blockIndex === blockIndex) ||
						(anchor.level === 'token' &&
							anchor.address.blockIndex === blockIndex &&
							anchor.address.stepIndex == null)
					: (anchor.level === 'step' &&
							anchor.blockIndex === blockIndex &&
							anchor.stepIndex === stepIndex) ||
						(anchor.level === 'token' &&
							anchor.address.blockIndex === blockIndex &&
							anchor.address.stepIndex === stepIndex)
			return matches ? [item.message] : []
		})
	}

	/** What a popover for this anchor leads with (§10.1–10.2): the token's own
	 * message, plus — from any of the step's popovers — the step-anchored one. */
	function popoverErrorLead(
		address: TokenAddress,
	): Array<string | null | undefined> {
		return [
			serverMarkings.tokenError(address),
			address.stepIndex != null
				? serverMarkings.stepMarking(address.blockIndex, address.stepIndex)
						?.message
				: null,
		]
	}

	// The workout discipline every step-scoped consumer falls back to when
	// the host passes none (mirrors `ActiveTokenEditor`'s historic default).
	const effectiveWorkoutDiscipline = workoutDiscipline || 'run'

	// §6.1's neighbour links swap the OPEN popover's content in place to the
	// absent facet's editor — the anchor stays put, nothing closes or
	// reopens. The swap is keyed to the anchor payload that set it, so a real
	// retarget (activating another token) renders that token's own editor,
	// and closing clears it.
	const [facetSwap, setFacetSwap] = useState<
		({ source: string } & FacetTarget) | null
	>(null)

	function activeFor(payload: TokenPayload): TokenPayload {
		if (facetSwap && facetSwap.source === payloadKey(payload)) {
			return {
				kind: facetSwap.kind,
				address: { ...payload.address, field: facetSwap.field },
			}
		}
		return payload
	}

	// The §6.3 zero-token fallback: a fully emptied step has no popover
	// anchor, so its ⋮ menu grows one "Add…" row opening this ⋮-anchored
	// popover on the quantity intro; its neighbour row reaches every other
	// facet. Present only in that state.
	const [addFacet, setAddFacet] = useState<
		({ blockIndex: number; stepIndex: number } & FacetTarget) | null
	>(null)
	const stepMenuRefs = useRef(new Map<string, HTMLElement>())
	const addAnchorRef = useRef<HTMLElement | null>(null)

	function openAddFacet(
		blockIndex: number,
		stepIndex: number,
		target: FacetTarget = { kind: 'duration', field: 'duration' },
	) {
		addAnchorRef.current =
			stepMenuRefs.current.get(`${blockIndex}:${stepIndex}`) ?? null
		setAddFacet({ blockIndex, stepIndex, ...target })
	}

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

	// The §4.2 set-aside stash lives OUTSIDE the form, in a ref: Conform
	// re-derives its value from the live form inputs on every event, and the
	// stash deliberately has no input — anything in the form would ride the
	// submission, and the stash must die with the editing session (#255).
	// Indexed [blockIndex][stepIndex], kept aligned by `restructure` below.
	// (The classic field editor's own list intents bypass this bookkeeping;
	// it is slated for deletion with the fieldset form, spec §12.)
	const stashesRef = useRef<(StepKindStash | undefined)[][]>([])

	// Structure edits go through ONE Conform `update` intent carrying the
	// restructured draft. The plain list intents (`insert`/`remove`/`reorder`)
	// rebuild the affected rows from `initialValue`, which silently reverts
	// values that so far live only in `value` (typed text, popover writes) —
	// and Conform applies only one intent per interaction, so a separate
	// sync-then-reorder pair is not an option. A single atomic update keeps
	// the draft lossless and the order indexes consistent.
	//
	// A mutation that REMOVES rows dispatches the update at the form ROOT
	// (the whole value, every other field carried unchanged) instead of the
	// `blocks` subtree. Conform only clears form controls missing from the
	// new value on a root-level update — under a blocks-scoped shrink, a
	// removed row's `useInputControl` dummy select can outlive its unmount
	// and resurrect the row as a phantom `value` entry (a stanza line for a
	// block the field list no longer has). Root-level updates make removal
	// stick, which §11's "deleting everything lands on the empty
	// composition" depends on. Growth and reorders stay blocks-scoped: a
	// root update also promotes every typed-but-unvalidated header value
	// into `initialValue`, which is harmless but trips Base UI's
	// changed-default dev warning, so it is reserved for the cases that
	// need it. `mutateValue` (which forces a root update) lets a caller
	// ride a workout-level field change on the same atomic update — the
	// strength seed's discipline flip — because a second intent in the
	// same interaction would be dropped.
	//
	// The kind-switch stashes are zipped onto the cloned draft steps before
	// the mutation — so splices move, copy, and delete a stash with its step
	// — and stripped back into the ref afterwards, keeping them out of the
	// value Conform sees.
	function restructure(
		mutate: (blocks: DraftBlockValue[]) => void,
		mutateValue?: (value: Record<string, unknown>) => void,
	) {
		const value = JSON.parse(JSON.stringify(form.value ?? {})) as Record<
			string,
			unknown
		>
		const draft = (value[blocksField.name] ?? []) as DraftBlockValue[]
		const countRows = (blocks: DraftBlockValue[]) =>
			blocks.reduce((count, block) => count + 1 + (block.steps?.length ?? 0), 0)
		const rowsBefore = countRows(draft)
		attachStashes(draft, stashesRef.current)
		mutate(draft)
		stashesRef.current = extractStashes(draft)
		value[blocksField.name] = draft
		mutateValue?.(value)
		if (mutateValue || countRows(draft) < rowsBefore) {
			form.update({ value })
		} else {
			form.update({ name: blocksField.name, value: draft })
		}
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
	// Remove action stays uniform on every step — the whole workout's last
	// step included, which lands on §11's empty composition.
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

	// Kind switches route through the §4.2 reconciliation — one model for the
	// ⋮ menu's Kind section and the sheet's Kind select (§4.3). The stash the
	// switch writes rides the draft value only; no input renders it, so it
	// dies with the editing session and never reaches the server.
	function changeStepKind(blockIndex: number, stepIndex: number, to: StepKind) {
		restructure((blocks) => {
			const steps = blocks[blockIndex]?.steps
			const step = steps?.[stepIndex] as SwitchableStep | undefined
			if (!steps || !step) return
			steps[stepIndex] = switchStepKind(step, to)
		})
		announce(`Step is now ${STEP_KIND_LABELS[to].toLowerCase()}`)
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
			blocks.splice(blockIndex + 1, 0, sentenceBlockOfKind('cardio'))
		})
		announce('Block added')
	}

	// ——— The §11 empty state: seeds and the scratch chooser ———————————————

	/** A first block from the scratch chooser (§11.4) — the same kind seeds
	 * as the line's ＋, landing as the whole stanza. */
	function startFromScratch(kind: StepKind) {
		restructure((blocks) => {
			blocks.push(sentenceBlockOfKind(kind))
		})
		announce(`${STEP_KIND_LABELS[kind]} step added`)
	}

	/** Materialize an archetype seed (§11.3): the seed's blocks become the
	 * draft; the strength seed also flips the header discipline, riding the
	 * same atomic update. */
	function materializeSeed(seed: ArchetypeSeed) {
		restructure(
			(blocks) => {
				blocks.push(...seed.blocks())
			},
			seed.discipline
				? (value) => {
						value[disciplineMeta?.name ?? 'discipline'] = seed.discipline
					}
				: undefined,
		)
		announce(`${seed.name} added`)
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
					anchorAttr={tokenAnchorAttr(token.address)}
					serverError={serverMarkings.tokenError(token.address)}
				/>
			)
		}

		// The sets token opens the shared retargeting popover on the §5.2
		// uniform-first sets editor — the sole set editor since the classic set
		// rows were removed. Its hidden inputs (the always-mounted, in-form
		// carriers of the per-set values) render here beside the trigger.
		if (token.type === 'sets' && stepIndex != null) {
			const stepList = blockFields.steps.getFieldList() as FieldMeta[]
			const stepField = stepList[stepIndex]
			if (!stepField) return children
			const setsField = stepField.getFieldset().sets
			if (!setsField) return children
			const setList = setsField.getFieldList() as FieldMeta[]
			return (
				<>
					{setList.map((setField, index) => (
						<SetHiddenFields
							key={setField.key}
							setField={setField}
							index={index}
						/>
					))}
					<TokenPopoverTrigger
						handle={popoverHandle}
						payload={{ kind: 'sets', address: token.address }}
						aria-label={tokenAccessibleName(token, 'sets', notation)}
						data-token-editor="sets"
						data-token-address={tokenAnchorAttr(token.address)}
						data-server-error={
							serverMarkings.tokenError(token.address) != null || undefined
						}
						className={cn(
							serverMarkings.tokenError(token.address) != null &&
								TOKEN_ERROR_CLASS,
						)}
					>
						{children}
					</TokenPopoverTrigger>
				</>
			)
		}

		// The simple value tokens share the one retargeting popover: the token
		// renders as a native button tab stop (its accessible name is value +
		// facet + position, §9.4) whose activation opens — or glides — the
		// shared instrument to this anchor.
		const kind = editorKindFor(token)
		if (!kind) return children
		if (!resolvePayload({ kind, address: token.address })) return children
		// The token-primary error paint (§10.1): a tint/underline in the
		// notation's own language, never a new chip.
		const serverError = serverMarkings.tokenError(token.address)
		return (
			<TokenPopoverTrigger
				handle={popoverHandle}
				payload={{ kind, address: token.address }}
				aria-label={tokenAccessibleName(token, kind, notation)}
				data-token-editor={kind}
				data-token-address={tokenAnchorAttr(token.address)}
				data-server-error={serverError != null || undefined}
				className={cn(serverError != null && TOKEN_ERROR_CLASS)}
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

	/**
	 * A facet editor body plus its §6.1 neighbour row — shared by the token
	 * popover (where `onSwap` swaps the shared popover's content in place)
	 * and the ⋮ "Add…" fallback popover (where it swaps that popover's own
	 * facet). Not a component: hooks live in the editor components it renders.
	 */
	function renderFacetEditor(
		active: TokenPayload,
		onSwap: (target: FacetTarget) => void,
		close: () => void,
	) {
		const { blockIndex, stepIndex, field } = active.address
		// Close before dispatching an anchor-removing change: the write
		// re-derives the sentence, and an open popover pinned to this address
		// would otherwise attach to whichever token lands there.
		const closeThen = (action: () => void) => {
			close()
			action()
		}
		const blockField = blockList[blockIndex]
		if (!blockField) return null
		const blockFields = blockField.getFieldset()

		if (stepIndex == null) {
			// Block level: only the repeat badge routes here — no neighbour row.
			if (field !== 'repeatCount') return null
			return (
				<ActiveTokenEditor
					key={`${blockIndex}-repeat`}
					kind="repeat"
					meta={blockFields.repeatCount}
					announce={announce}
					closeThen={closeThen}
				/>
			)
		}

		const stepList = blockFields.steps.getFieldList() as FieldMeta[]
		const stepField = stepList[stepIndex]
		if (!stepField) return null
		const stepFields = stepField.getFieldset()
		const draftStep = draftBlocks[blockIndex]?.steps?.[stepIndex]
		const notationStep = notation.blocks[blockIndex]?.steps?.[stepIndex]
		const stepKind = normalizeKind(draftStep?.kind)
		const effectiveDiscipline =
			(stepFields.discipline?.value as string | undefined) ||
			effectiveWorkoutDiscipline
		const editorKey = `${blockIndex}-${stepIndex}-${active.kind}`

		const neighbours = (
			<FacetNeighbourRow
				stepKind={stepKind}
				exclude={FACET_EXCLUDES[active.kind]}
				// A step-anchored absent-facet error highlights the ＋ link that
				// introduces the missing facet (§10.2).
				errorFacet={
					serverMarkings.stepMarking(blockIndex, stepIndex)?.facet ?? null
				}
				hasQuantity={Boolean(
					notationStep?.tokens.some((t) => t.token.type === 'quantity'),
				)}
				hasIntensity={Boolean(
					notationStep?.tokens.some((t) => t.token.type === 'intensity'),
				)}
				hasNote={Boolean(draftStep?.notes?.trim())}
				disciplineMeta={stepFields.discipline}
				workoutDiscipline={effectiveWorkoutDiscipline}
				announce={announce}
				onSwap={onSwap}
			/>
		)

		// The sets editor is step-scoped, not single-field: it edits the whole
		// set list (through the atomic `update` intent, which keeps this
		// popover open — the sets token's address never moves) plus the
		// rest-between-sets footer field.
		if (active.kind === 'sets') {
			return (
				<>
					<StrengthSetsEditor
						// Remount per step so the expand/collapse view state resets
						// when the popover retargets to another step's sets.
						key={`${blockIndex}-${stepIndex}-sets`}
						setsField={stepFields.sets}
						restMeta={stepFields.restBetweenSetsSec}
						draftSets={
							(draftBlocks[blockIndex]?.steps?.[stepIndex]?.sets ??
								[]) as DraftSetValue[]
						}
						mutate={(mutator) => mutateSets(blockIndex, stepIndex, mutator)}
						announce={announce}
					/>
					{neighbours}
				</>
			)
		}

		// The cardio quantity editor spans both measures (G8): it leads with
		// the Duration ⇄ Distance switch, so it binds both fields regardless
		// of which one the anchor token renders.
		if (active.kind === 'duration' || active.kind === 'distance') {
			return (
				<>
					<QuantityEditor
						key={`${blockIndex}-${stepIndex}-quantity`}
						durationMeta={stepFields.duration}
						distanceMeta={stepFields.distance}
						announce={announce}
						closeThen={closeThen}
					/>
					{neighbours}
				</>
			)
		}

		if (active.kind === 'discipline') {
			return (
				<>
					<StepDisciplineSelect
						key={editorKey}
						meta={stepFields.discipline}
						workoutDiscipline={effectiveWorkoutDiscipline}
						announce={announce}
						// Clearing back to inherit removes the word token — this
						// popover's own anchor — so the select closes first then.
						closeOnClear={closeThen}
					/>
					{neighbours}
				</>
			)
		}

		const meta = stepFields[field]
		if (!meta) return null
		return (
			<>
				<ActiveTokenEditor
					// Remount per token so editor state (typed text, the bound
					// input control) resets when the popover retargets.
					key={editorKey}
					kind={active.kind}
					meta={meta}
					announce={announce}
					intensityContext={{
						profile: thresholds?.[effectiveDiscipline] ?? null,
						effectiveDiscipline,
					}}
					closeThen={closeThen}
				/>
				{neighbours}
			</>
		)
	}

	const blockCount = blockList.length

	// The §11 composition is a pure function of "zero steps": a brand-new
	// session and one emptied out by deleting everything render the same
	// thing. (Removing a block's only step removes the block, so zero steps
	// means zero blocks — but count steps, so a manipulated draft with empty
	// blocks still renders honestly.)
	const totalSteps = draftBlocks.reduce(
		(count, block) => count + (block.steps?.length ?? 0),
		0,
	)

	// The stanza is the editor's rendering (spec §2, #251): one block per
	// line, gutter grip + repeat badge, the intensity chip as the line's only
	// chip. The structural chrome is always visible on the line (§2.3/§3):
	// the gutter ⠿ opens the block menu and drags to reorder, every step
	// leads with its ⋮ menu, the line ends in the ＋ kind chooser, and
	// `+ block` closes the stanza like the prototype's footer.
	return (
		<div
			ref={rootRef}
			data-token-sentence-editor
			className={cn('text-body-sm', className)}
		>
			{/* The complete field mirror: hidden carrier inputs for the whole
			    Block/Step/Set tree, so the form submits losslessly and Conform
			    tracks the tree through structural edits (§11 seeds, add/remove) —
			    the job the deleted fieldset form used to do (§12). */}
			<HiddenBlockFields blocksField={blocksField} />
			{/* The §11 empty composition: with zero steps there is no stanza
			    chrome anchored to nothing (the stanza below renders null) — three
			    archetype seeds and the scratch chooser are the only affordances. */}
			{totalSteps === 0 ? (
				<WorkoutEmptyState
					onSeed={materializeSeed}
					onStartFromScratch={startFromScratch}
				/>
			) : null}
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
							data-server-error={
								serverMarkings.blockError(blockIndex) != null || undefined
							}
							className={cn(
								CHROME_MARK_CLASS,
								'cursor-grab active:cursor-grabbing',
								// A block-anchored server error tints the gutter (§10.3);
								// the ⠿ menu it opens leads with the message.
								serverMarkings.blockError(blockIndex) != null &&
									CHROME_ERROR_CLASS,
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
							{/* A block-anchored server error leads the menu (§10.3). */}
							{serverMarkings.blockError(blockIndex) ? (
								<>
									<MenuErrorLead
										message={serverMarkings.blockError(blockIndex)}
									/>
									<DropdownMenuSeparator />
								</>
							) : null}
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
									<KindChooserItems
										onChoose={(kind) => addStepOfKind(blockIndex, kind)}
									/>
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
					// The step plus its in-session stash (kept outside the form), so
					// the ⇄ previews can state what a switch back would bring back.
					const draftValue = draftBlocks[blockIndex]?.steps?.[stepIndex]
					const draftStep: SwitchableStep | undefined = draftValue && {
						...draftValue,
						setAside: stashesRef.current[blockIndex]?.[stepIndex],
					}
					const currentKind = normalizeKind(draftStep?.kind)
					// A step-anchored server error (an absent facet, §10.2) tints
					// the ⋮ mark — the smallest unit guaranteed to render — and its
					// menu leads with the message.
					const stepError = serverMarkings.stepMarking(blockIndex, stepIndex)
					return (
						<DropdownMenu>
							<DropdownMenuTrigger
								ref={(element: HTMLElement | null) => {
									const key = `${blockIndex}:${stepIndex}`
									if (element) stepMenuRefs.current.set(key, element)
									else stepMenuRefs.current.delete(key)
								}}
								aria-label={`Step ${stepIndex + 1} of ${stepCount} actions, block ${blockIndex + 1} of ${blockCount}`}
								data-step-menu
								data-server-error={stepError != null || undefined}
								className={cn(
									CHROME_MARK_CLASS,
									stepError != null && CHROME_ERROR_CLASS,
								)}
							>
								⋮
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-auto min-w-44">
								{/* A step-anchored server error leads the menu (§10.2). */}
								{stepError ? (
									<>
										<MenuErrorLead message={stepError.message} />
										<DropdownMenuSeparator />
									</>
								) : null}
								{/* The §6.3 zero-token fallback: a fully emptied step has no
								    popover anchor left, so — only then — the menu grows one
								    "Add…" row that opens the ⋮-anchored facet popover. */}
								{step.tokens.length === 0 ? (
									<>
										<DropdownMenuItem
											onClick={() => openAddFacet(blockIndex, stepIndex)}
										>
											Add…
										</DropdownMenuItem>
										<DropdownMenuSeparator />
									</>
								) : null}
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
								{/* The Kind section (§4.1): the current kind checked and
								    inert, the other two as ⇄ switch rows, each previewing
								    its consequences for the step's actual values. */}
								<DropdownMenuGroup>
									<DropdownMenuLabel>Kind</DropdownMenuLabel>
									{STEP_KINDS.map((kind) =>
										kind === currentKind ? (
											<DropdownMenuItem key={kind} disabled>
												✓ {STEP_KIND_LABELS[kind]}
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem
												key={kind}
												onClick={() =>
													changeStepKind(blockIndex, stepIndex, kind)
												}
											>
												<span className="flex max-w-64 flex-col">
													<span>
														⇄ Make {STEP_KIND_LABELS[kind].toLowerCase()}
													</span>
													{draftStep ? (
														<span className="text-muted-foreground text-xs text-wrap">
															{previewKindSwitch(draftStep, kind, {
																exerciseNames,
															})}
														</span>
													) : null}
												</span>
											</DropdownMenuItem>
										),
									)}
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									variant="destructive"
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
							<KindChooserItems
								onChoose={(kind) => addStepOfKind(blockIndex, kind)}
							/>
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
			{totalSteps > 0 ? (
				<div className="pt-2">
					<Button
						type="button"
						variant="ghost"
						size="xs"
						aria-label="Add block"
						onClick={() =>
							restructure((blocks) => {
								blocks.push(sentenceBlockOfKind('cardio'))
							})
						}
					>
						+ block
					</Button>
				</div>
			) : null}
			<TokenPopover
				handle={popoverHandle}
				// The cap label follows the facet actually shown, which a §6.1
				// neighbour link may have swapped away from the anchor's own.
				label={(payload) => EDITOR_LABELS[activeFor(payload).kind]}
				onOpenChange={(open) => {
					if (!open) setFacetSwap(null)
				}}
			>
				{(payload) => (
					<>
						{/* The message leads, in human words (§10.1) — anchored to the
						    token the popover opened on, not the swapped-in facet. */}
						<PopoverErrorLead messages={popoverErrorLead(payload.address)} />
						{renderFacetEditor(
							activeFor(payload),
							(target) =>
								setFacetSwap({ source: payloadKey(payload), ...target }),
							() => popoverHandle.close(),
						)}
					</>
				)}
			</TokenPopover>
			{/* The §10 validation summary — one quiet line between sentence and
			    strip, items in document order, each retargeting the editor's own
			    instruments to its anchor. Absent when nothing needs fixing. */}
			<ValidationSummaryLine
				items={serverMarkings.items}
				onActivate={activateErrorAnchor}
			/>
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
							className={TOKEN_POPUP_CLASS}
						>
							{gutterEditor != null ? (
								<>
									<div className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
										{gutterEditor.type === 'name' ? 'block name' : 'repeat'}
									</div>
									<PopoverErrorLead
										messages={[
											serverMarkings.blockError(gutterEditor.blockIndex),
										]}
									/>
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
			{/* The ⋮-anchored facet popover behind the §6.3 "Add…" row: the one
			    case with no token to anchor to, so the step's ⋮ mark stands in.
			    It opens on the quantity intro (the only facet a fully emptied
			    cardio step must regain first) and its neighbour row swaps to the
			    others in place. */}
			<PopoverPrimitive.Root
				open={addFacet != null}
				onOpenChange={(open) => {
					if (!open) setAddFacet(null)
				}}
				modal="trap-focus"
			>
				<PopoverPrimitive.Portal>
					<PopoverPrimitive.Positioner
						anchor={addAnchorRef}
						side="bottom"
						align="start"
						sideOffset={10}
						collisionPadding={8}
						className="isolate z-50"
					>
						<PopoverPrimitive.Popup
							data-slot="add-facet-popover"
							finalFocus={addAnchorRef}
							className={TOKEN_POPUP_CLASS}
						>
							{addFacet != null ? (
								<>
									<div className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
										{EDITOR_LABELS[addFacet.kind]}
									</div>
									<PopoverErrorLead
										messages={[
											serverMarkings.stepMarking(
												addFacet.blockIndex,
												addFacet.stepIndex,
											)?.message,
										]}
									/>
									{renderFacetEditor(
										{
											kind: addFacet.kind,
											address: {
												blockIndex: addFacet.blockIndex,
												stepIndex: addFacet.stepIndex,
												field: addFacet.field,
											},
										},
										(target) => setAddFacet({ ...addFacet, ...target }),
										() => setAddFacet(null),
									)}
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
				restructure={restructure}
				onMoveStep={moveStep}
				onDuplicateStep={duplicateStep}
				onAddStep={addStepOfKind}
				onSwitchKind={changeStepKind}
				announce={announce}
				// The sheet mirrors its block's errors inline but is never
				// required (§10.5) — repair works on either surface.
				errorsFor={(stepIndex) =>
					sheetBlockIndex != null
						? sheetErrorMessages(sheetBlockIndex, stepIndex)
						: []
				}
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
	anchorAttr,
	serverError,
}: {
	meta: FieldMeta
	exercises: ExerciseItem[]
	recentExerciseIds: string[]
	/** The §10 anchor address, so the validation summary can find and focus
	 * this token — the combobox IS the token, so the wrapper carries it. */
	anchorAttr?: string
	/** A server-error marking on the exercise (§10.1): the combobox's own
	 * invalid treatment is the token's error paint. */
	serverError?: string | null
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
			data-token-address={anchorAttr}
			data-server-error={serverError != null || undefined}
			className="inline-flex w-48 max-w-full align-middle"
		>
			<ExerciseCombobox
				exercises={exercises}
				recentExerciseIds={recentExerciseIds}
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(exerciseId) => control.change(exerciseId)}
				invalid={meta.errors || serverError != null ? true : undefined}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
		</span>
	)
}

// ——— Sets token ————————————————————————————————————————————————————————

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
	// The sets, quantity, and discipline kinds never reach this body — they
	// route to their step-scoped editors before the single-field ones.
	kind: Exclude<EditorKind, 'sets' | 'duration' | 'distance' | 'discipline'>
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
					// The quiet footer removal exists only once there is an
					// intensity to remove (§6.1) — an introduction visit (via a
					// "＋ intensity" neighbour link) offers nothing to undo.
					onRemove={
						rawValue.trim()
							? () =>
									closeThen(() => {
										control.change('')
										announce('Intensity removed')
									})
							: undefined
					}
				/>
			) : kind === 'notes' ? (
				<div className="flex flex-col gap-2">
					{/* Uncontrolled on purpose: the write-through round-trips through
					    a Conform effect, and a controlled value that lags a keystroke
					    behind would clobber fast typing. This editor remounts per
					    token (keyed by address), so `defaultValue` is always current. */}
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
					{rawValue.trim() ? (
						<div className="flex justify-center">
							<Button
								type="button"
								variant="ghost"
								size="xs"
								onClick={() =>
									closeThen(() => {
										control.change('')
										announce('Note removed')
									})
								}
							>
								Remove note
							</Button>
						</div>
					) : null}
				</div>
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

// ——— The cardio quantity editor — Duration ⇄ Distance (§6.1, G8) —————————

/** The switch's seeds: a fresh measure starts as something sensible, never
 * empty — an empty field would drop the token this popover may be anchored
 * to. Duration matches the ＋ kind chooser's cardio seed. */
const QUANTITY_SEEDS = {
	duration: KIND_SEED_DURATIONS.cardio,
	distance: '1 km',
} as const

type QuantityUnit = 'duration' | 'distance'

/**
 * The cardio quantity popover's body: it leads with the Duration ⇄ Distance
 * segmented switch, then the active measure's type-to-edit stepper. The two
 * fields are mutually exclusive (the schema's both-set refinement), so
 * switching clears the other; the value each measure last held in this visit
 * is remembered, so the switch round-trips without retyping. An unquantified
 * step (reached via a "＋ time or distance" neighbour link, or the ⋮ "Add…"
 * row) opens on the bare switch — nothing is seeded until a measure is
 * chosen. A quiet footer removes the quantity altogether (the step stays
 * valid; the notation simply renders no quantity token).
 */
function QuantityEditor({
	durationMeta,
	distanceMeta,
	announce,
	closeThen,
}: {
	durationMeta: FieldMeta
	distanceMeta: FieldMeta
	announce: (message: string) => void
	closeThen: (action: () => void) => void
}) {
	const durationControl = useFieldControl(durationMeta)
	const distanceControl = useFieldControl(distanceMeta)
	const durationValue =
		typeof durationMeta.value === 'string' ? durationMeta.value : ''
	const distanceValue =
		typeof distanceMeta.value === 'string' ? distanceMeta.value : ''
	const unit: QuantityUnit | null = distanceValue.trim()
		? 'distance'
		: durationValue.trim()
			? 'duration'
			: null

	// What each measure last held during this popover visit, so the switch
	// round-trips (6 min → distance → back restores 6 min). Session state
	// only — never persisted; the form always carries exactly one measure.
	const lastAuthored = useRef({
		duration: durationValue,
		distance: distanceValue,
	})
	if (unit === 'duration') lastAuthored.current.duration = durationValue
	if (unit === 'distance') lastAuthored.current.distance = distanceValue

	function switchTo(next: QuantityUnit) {
		if (next === unit) return
		const restored = lastAuthored.current[next].trim()
		const value = restored || QUANTITY_SEEDS[next]
		// Write the new measure before clearing the old: any intermediate
		// render still finds a quantity token, so the popover's anchor never
		// unmounts mid-switch. Only one measure survives the second write.
		if (next === 'duration') {
			durationControl.change(value)
			distanceControl.change('')
		} else {
			distanceControl.change(value)
			durationControl.change('')
		}
		announce(
			`Quantity is now a ${next === 'duration' ? 'duration' : 'distance'} — ${value}`,
		)
	}

	return (
		<div className="flex flex-col gap-2" data-slot="quantity-editor">
			<UnitToggle
				label="Quantity kind"
				options={[
					{ id: 'duration', label: 'Duration' },
					{ id: 'distance', label: 'Distance' },
				]}
				active={unit ?? ''}
				onSelect={(id) => switchTo(id as QuantityUnit)}
			/>
			{unit != null ? (
				<TypeToEditStepper
					// Remount per measure: the stepper's typed text seeds from the
					// field once, and the switch swaps which field that is.
					key={unit}
					label={unit}
					config={STEPPERS[unit]}
					rawValue={unit === 'duration' ? durationValue : distanceValue}
					announce={announce}
					onChange={(value) =>
						(unit === 'duration' ? durationControl : distanceControl).change(
							value,
						)
					}
				/>
			) : (
				<p className="text-muted-foreground text-xs">
					This step has no length yet — pick how to measure it.
				</p>
			)}
			{unit != null ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="ghost"
						size="xs"
						onClick={() =>
							closeThen(() => {
								durationControl.change('')
								distanceControl.change('')
								announce('Time or distance removed')
							})
						}
					>
						Remove time or distance
					</Button>
				</div>
			) : null}
		</div>
	)
}

// ——— The per-step discipline select (§6.1, G6) ———————————————————————————

const DISCIPLINE_INHERIT = 'inherit'

/**
 * The single-chevron discipline select — `inherit · run` / run / bike /
 * swim. It rides the quantity popover (cardio) and the sets popover
 * (strength) as a neighbour-row control, and is the whole body of the
 * override word token's own popover. Choosing the workout's own discipline
 * reads as inheriting it — only a *different* discipline is an override, and
 * only overrides render the word token (§6.2).
 */
function StepDisciplineSelect({
	meta,
	workoutDiscipline,
	announce,
	closeOnClear,
}: {
	meta: FieldMeta
	workoutDiscipline: string
	announce: (message: string) => void
	/** Present when this select's popover is anchored to the override word
	 * token itself: clearing the override removes that anchor, so the change
	 * closes the popover first. */
	closeOnClear?: (action: () => void) => void
}) {
	const control = useFieldControl(meta)
	const rawValue = typeof meta.value === 'string' ? meta.value : ''
	const selected =
		CARDIO_DISCIPLINES.includes(
			rawValue as (typeof CARDIO_DISCIPLINES)[number],
		) && rawValue !== workoutDiscipline
			? rawValue
			: DISCIPLINE_INHERIT

	function select(value: string | null) {
		if (value == null || value === selected) return
		const next = value === DISCIPLINE_INHERIT ? '' : value
		const isOverride = next !== '' && next !== workoutDiscipline
		const commit = () => {
			control.change(next)
			announce(
				isOverride
					? `Discipline set to ${next} — zones resolve against ${next} thresholds`
					: 'Discipline inherits from the workout',
			)
		}
		if (closeOnClear && !isOverride) closeOnClear(commit)
		else commit()
	}

	return (
		<div
			data-slot="step-discipline"
			className="flex items-center gap-2 self-start"
		>
			<span className="text-muted-foreground text-xs">discipline</span>
			<Select value={selected} onValueChange={(value) => select(value)}>
				<SelectTrigger aria-label="Step discipline" size="sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={DISCIPLINE_INHERIT}>
						inherit · {workoutDiscipline}
					</SelectItem>
					{CARDIO_DISCIPLINES.map((discipline) => (
						<SelectItem key={discipline} value={discipline}>
							{discipline}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

// ——— The neighbour row (§6.1) ————————————————————————————————————————————

/**
 * What this step is missing, reachable from any of its value popovers: quiet
 * "＋ …" links that swap the open popover's content in place to the absent
 * facet's editor — no new line chrome, no menu rows — plus the discipline
 * select, which rides here on cardio and strength steps (never rest). The
 * facet the popover already shows is excluded; when nothing is absent and no
 * select applies, the row simply isn't.
 */
function FacetNeighbourRow({
	stepKind,
	exclude,
	errorFacet = null,
	hasQuantity,
	hasIntensity,
	hasNote,
	disciplineMeta,
	workoutDiscipline,
	announce,
	onSwap,
}: {
	stepKind: StepKind
	exclude: FacetExclude
	/** The absent facet a server error names (§10.2) — its ＋ link highlights
	 * as the repair route. */
	errorFacet?: TokenField | null
	hasQuantity: boolean
	hasIntensity: boolean
	hasNote: boolean
	disciplineMeta: FieldMeta | undefined
	workoutDiscipline: string
	announce: (message: string) => void
	onSwap: (target: FacetTarget) => void
}) {
	const links: Array<{ label: string; errored: boolean } & FacetTarget> = []
	if (stepKind === 'cardio' && exclude !== 'quantity' && !hasQuantity) {
		links.push({
			label: '＋ time or distance',
			kind: 'duration',
			field: 'duration',
			errored: errorFacet === 'duration' || errorFacet === 'distance',
		})
	}
	if (stepKind === 'cardio' && exclude !== 'intensity' && !hasIntensity) {
		links.push({
			label: '＋ intensity',
			kind: 'intensity',
			field: 'intensity',
			errored: errorFacet === 'intensity',
		})
	}
	if (exclude !== 'notes' && !hasNote) {
		links.push({
			label: '＋ note',
			kind: 'notes',
			field: 'notes',
			errored: errorFacet === 'notes',
		})
	}
	const withDiscipline =
		stepKind !== 'rest' && exclude !== 'discipline' && disciplineMeta != null
	if (links.length === 0 && !withDiscipline) return null

	return (
		<div
			data-slot="facet-neighbours"
			className="border-border/60 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2"
		>
			{links.map((link) => (
				<button
					key={link.label}
					type="button"
					onClick={() => onSwap({ kind: link.kind, field: link.field })}
					data-error-highlight={link.errored || undefined}
					className={cn(
						QUIET_TEXT_BUTTON_CLASS,
						link.errored && 'text-destructive font-medium',
					)}
				>
					{link.label}
				</button>
			))}
			{withDiscipline ? (
				<StepDisciplineSelect
					meta={disciplineMeta}
					workoutDiscipline={workoutDiscipline}
					announce={announce}
				/>
			) : null}
		</div>
	)
}
