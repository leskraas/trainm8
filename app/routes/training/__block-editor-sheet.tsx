/**
 * The **block editor sheet** (workout-editor spec §3, #254): the rich block
 * editor as a *summoned* secondary surface — opened from the block ⠿ menu,
 * dismissed after use, never a permanent parallel form (§0). One block's full
 * structure in one place: its name and repeat (the two values that never
 * render on the line, G2), each step with the uniform structural actions, and
 * the block-level add/delete.
 *
 * Value edits bind to the same Conform fields the rest of the editor writes
 * (`useInputControl`), so the sheet mirrors into the sentence live and the
 * submission path is untouched; structure edits dispatch through the same
 * atomic `restructure` update. Closing returns focus to the block's ⠿ grip —
 * the mark that summoned it.
 *
 * **The container is the app's Drawer** (ADR 0085 §6; #505 round 2). It was a
 * Base UI Dialog re-docked by breakpoint and animated with tw-animate
 * keyframes on a 150ms built-in curve: no swipe to dismiss, and an
 * interrupted close restarted from zero. Base UI's Drawer owns the gesture —
 * a flick dismisses it, the pointer is captured, the exit scales with the
 * swipe — on `--ease-drawer`. It comes up from the bottom on a phone and in
 * from the right from `md`, where the sheet used to dock; the direction is
 * the swipe that dismisses it.
 */
import { useInputControl } from '@conform-to/react'
import { useSyncExternalStore } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerTitle,
} from '#app/components/ui/drawer.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { BLOCK_SHEET_LABELS, NB_STEP_KIND_LABELS } from '#app/utils/labels.ts'
import {
	tokenText,
	type BlockNotation,
	type DraftBlockValue,
} from '#app/utils/workout-notation.ts'
import { STEP_KINDS, type StepKind } from '#app/utils/workout-schema.ts'
import { PopoverErrorLead } from './__validation-summary.tsx'

// Conform metadata is typed loosely here, matching the sibling form modules.
type FieldMeta = any

export type BlockEditorSheetProps = {
	/** The open block's index, or null when the sheet is closed. */
	blockIndex: number | null
	onClose: () => void
	/** The open block's Conform field metadata (null when closed). */
	blockField: FieldMeta | null
	/** The open block's derived notation, for human step summaries. */
	blockNotation: BlockNotation | null
	restructure: (mutate: (blocks: DraftBlockValue[]) => void) => void
	/** The editor's own step mutations, reused so the sheet and the ⋮ menu
	 * can never drift. */
	onMoveStep: (blockIndex: number, from: number, to: number) => void
	onDuplicateStep: (blockIndex: number, stepIndex: number) => void
	/** Seed-and-append a step of the chosen kind (the ＋ chooser's seeds, §4.1). */
	onAddStep: (blockIndex: number, kind: StepKind) => void
	/** Switch a step's kind through the editor's §4.2 reconciliation — the
	 * same routine the ⋮ menu's Kind section dispatches, so the sheet's Kind
	 * select and the menu produce identical outcomes (§4.3). */
	onSwitchKind: (blockIndex: number, stepIndex: number, kind: StepKind) => void
	announce: (message: string) => void
	/** The §10.5 error mirror: the live server-error messages scoped to this
	 * block (`stepIndex` null) or to one of its steps. The sheet renders them
	 * inline but is never the required repair surface. */
	errorsFor?: (stepIndex: number | null) => string[]
	/** Where focus returns on dismiss — the block's ⠿ grip. */
	finalFocus: () => HTMLElement | null
}

const L = BLOCK_SHEET_LABELS

/** `md` and up: the sheet docks on the right, as it did before the Drawer. */
const WIDE_QUERY = '(min-width: 48rem)'

/**
 * Whether the screen is `md` or wider, read from `matchMedia` and kept live,
 * so the swipe that dismisses the sheet follows the edge it is docked to.
 * The server and the first client render say "phone"; the sheet is never
 * open on either, so nothing can mismatch. Where `matchMedia` is missing (jsdom,
 * an old embedded webview) the answer is "phone" too, rather than taking the
 * whole detail page down with it — the same guard as `ui/sonner.tsx`.
 */
function useWideScreen(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const query = window.matchMedia?.(WIDE_QUERY)
			query?.addEventListener('change', onChange)
			return () => query?.removeEventListener('change', onChange)
		},
		() => window.matchMedia?.(WIDE_QUERY).matches ?? false,
		() => false,
	)
}

export function BlockEditorSheet({
	blockIndex,
	onClose,
	blockField,
	blockNotation,
	restructure,
	onMoveStep,
	onDuplicateStep,
	onAddStep,
	onSwitchKind,
	announce,
	errorsFor,
	finalFocus,
}: BlockEditorSheetProps) {
	const open = blockIndex != null && blockField != null
	const wide = useWideScreen()
	return (
		<Drawer
			open={open}
			onOpenChange={(next) => (next ? null : onClose())}
			swipeDirection={wide ? 'right' : 'down'}
			showSwipeHandle={!wide}
		>
			<DrawerContent
				data-block-editor-sheet
				finalFocus={() => finalFocus()}
				className="md:[--drawer-content-width:28rem]"
			>
				{open ? (
					// The scrolling region the Drawer asks for: its own scroll, so a
					// long block scrolls inside the sheet and never drags the page.
					<div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-2 pb-5 md:pt-5">
						<SheetBody
							blockIndex={blockIndex}
							onClose={onClose}
							blockField={blockField}
							blockNotation={blockNotation}
							restructure={restructure}
							onMoveStep={onMoveStep}
							onDuplicateStep={onDuplicateStep}
							onAddStep={onAddStep}
							onSwitchKind={onSwitchKind}
							announce={announce}
							errorsFor={errorsFor}
						/>
					</div>
				) : null}
			</DrawerContent>
		</Drawer>
	)
}

function SheetBody({
	blockIndex,
	onClose,
	blockField,
	blockNotation,
	restructure,
	onMoveStep,
	onDuplicateStep,
	onAddStep,
	onSwitchKind,
	announce,
	errorsFor,
}: {
	blockIndex: number
	onClose: () => void
	blockField: FieldMeta
	blockNotation: BlockNotation | null
	restructure: BlockEditorSheetProps['restructure']
	onMoveStep: BlockEditorSheetProps['onMoveStep']
	onDuplicateStep: BlockEditorSheetProps['onDuplicateStep']
	onAddStep: BlockEditorSheetProps['onAddStep']
	onSwitchKind: BlockEditorSheetProps['onSwitchKind']
	announce: BlockEditorSheetProps['announce']
	errorsFor: BlockEditorSheetProps['errorsFor']
}) {
	const blockFields = blockField.getFieldset()
	const stepList = blockField.getFieldset().steps.getFieldList() as FieldMeta[]

	return (
		<>
			{/* The summoned surface's header (#282): the title, what it is, and a
			    close button — the swipe is the gesture, this is the control. */}
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<DrawerTitle className="text-heading">
						{L.title(blockIndex + 1)}
					</DrawerTitle>
					<DrawerDescription className="text-footnote">
						{L.description}
					</DrawerDescription>
				</div>
				<DrawerClose
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={L.close}
							className="-mt-1 -mr-1 shrink-0"
						/>
					}
				>
					<Icon name="cross-1" />
				</DrawerClose>
			</div>

			{/* The §10.5 error mirror: the block's own server errors, inline. */}
			<PopoverErrorLead messages={errorsFor?.(null) ?? []} />

			<div className="grid grid-cols-2 gap-3">
				<SheetField
					meta={blockFields.name}
					label={L.name}
					placeholder={L.namePlaceholder}
					onCommit={(value) =>
						announce(value.trim() ? L.nameUpdated : L.nameCleared)
					}
				/>
				<SheetField
					meta={blockFields.repeatCount}
					label={L.repeat}
					type="number"
					min={1}
					onCommit={(value) => announce(L.repeatSet(value))}
				/>
			</div>

			<div className="space-y-2">
				<p className="text-overline text-muted-foreground uppercase">
					{L.steps}
				</p>
				{stepList.map((stepField: FieldMeta, stepIndex: number) => {
					const kind = (stepField.getFieldset().kind.value ||
						'cardio') as StepKind
					const summary = blockNotation?.steps
						.find((step) => step.stepIndex === stepIndex)
						?.tokens.map((positioned) => tokenText(positioned.token))
						.join(' ')
					return (
						<div
							key={stepField.key}
							className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-3xl p-3"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="text-caption text-muted-foreground">
										{L.step(stepIndex + 1)}
									</p>
									{/* The Kind select routes through the same §4.2
									    reconciliation as the ⋮ menu, so both surfaces
									    agree (§4.3). */}
									<Select
										value={kind}
										onValueChange={(value) => {
											if (value !== kind) {
												onSwitchKind(blockIndex, stepIndex, value as StepKind)
											}
										}}
									>
										{/* Inherits the shared 44px / 16px-phone control
										    (§2.1/§2.3) — no local height or font override. */}
										<SelectTrigger aria-label={L.stepKind(stepIndex + 1)}>
											{/* Base UI shows the raw value (`cardio`) unless told
											    how to say it. */}
											<SelectValue>
												{(value) => NB_STEP_KIND_LABELS[value as StepKind]}
											</SelectValue>
										</SelectTrigger>
										<SelectContent>
											{STEP_KINDS.map((stepKind) => (
												<SelectItem key={stepKind} value={stepKind}>
													{NB_STEP_KIND_LABELS[stepKind]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								{/* The step's notation in full: a summary cut with "…" is
								    the half-read sentence story 32 rules out. */}
								<p className="text-callout mt-1 font-normal [overflow-wrap:anywhere]">
									{summary || '—'}
								</p>
								{/* The step's mirrored server errors (§10.5). */}
								<PopoverErrorLead messages={errorsFor?.(stepIndex) ?? []} />
							</div>
							{/* 36px icons whose `after:` hit areas (4px a side) reach 44 and
							    meet across the 8px gap (§2.2, ADR 0028): neighbouring
							    targets touch instead of stacking. They were 24px drawn and
							    28px wide to a thumb. */}
							<div className="flex gap-2">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={L.moveEarlier(stepIndex + 1)}
									disabled={stepIndex === 0}
									onClick={() =>
										onMoveStep(blockIndex, stepIndex, stepIndex - 1)
									}
								>
									↑
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={L.moveLater(stepIndex + 1)}
									disabled={stepIndex === stepList.length - 1}
									onClick={() =>
										onMoveStep(blockIndex, stepIndex, stepIndex + 1)
									}
								>
									↓
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={L.duplicate(stepIndex + 1)}
									onClick={() => onDuplicateStep(blockIndex, stepIndex)}
								>
									⧉
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={L.remove(stepIndex + 1)}
									// Deliberately NOT the ⋮ menu's removeStep: that one
									// collapses a single-step block, which would delete the
									// block this sheet is open on — here the last step is
									// guarded and "Delete block" sits in the footer instead.
									disabled={stepList.length === 1}
									onClick={() => {
										restructure((blocks) => {
											blocks[blockIndex]?.steps?.splice(stepIndex, 1)
										})
										announce(L.stepRemoved)
									}}
								>
									✕
								</Button>
							</div>
						</div>
					)
				})}
				<div className="flex flex-wrap items-center gap-1">
					<span className="text-footnote text-muted-foreground">
						{L.addStep}
					</span>
					{STEP_KINDS.map((kind) => (
						<Button
							key={kind}
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onAddStep(blockIndex, kind)}
						>
							{NB_STEP_KIND_LABELS[kind]}
						</Button>
					))}
				</div>
			</div>

			{/* Dismissal lives in the header's close button (#282); the footer
			    keeps only the block-level destructive action. */}
			<div className="mt-auto flex items-center pt-2">
				<Button
					type="button"
					variant="destructive"
					// No last-block guard: deleting the only block lands on §11's
					// empty composition, same as the ⠿ menu's Delete.
					onClick={() => {
						onClose()
						restructure((blocks) => {
							blocks.splice(blockIndex, 1)
						})
						announce(L.blockDeleted)
					}}
				>
					{L.deleteBlock}
				</Button>
			</div>
		</>
	)
}

/** A `useInputControl` seeded from a field's metadata — the same binding the
 * editor's popovers use, local to avoid an import cycle with the editor. */
function useSheetControl(meta: FieldMeta) {
	return useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
}

/** A sheet field bound to its Conform field through `useInputControl`, so
 * the value writes through to the in-form carriers (classic fields or the
 * detail view's hidden mirror) and submits unchanged. */
function SheetField({
	meta,
	label,
	type = 'text',
	placeholder,
	min,
	onCommit,
}: {
	meta: FieldMeta
	label: string
	type?: 'text' | 'number'
	placeholder?: string
	min?: number
	onCommit: (value: string) => void
}) {
	const control = useSheetControl(meta)
	const id = `sheet-${meta.name}`
	return (
		<div className="space-y-1">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				min={min}
				placeholder={placeholder}
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(event) => {
					control.change(event.target.value)
					if (type === 'text' || event.target.value) {
						onCommit(event.target.value)
					}
				}}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
		</div>
	)
}
