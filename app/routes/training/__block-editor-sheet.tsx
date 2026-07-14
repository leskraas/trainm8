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
 */
import { Dialog } from '@base-ui/react/dialog'
import { useInputControl } from '@conform-to/react'
import { OverlayHeader } from '#app/components/overlay-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	tokenText,
	type BlockNotation,
	type DraftBlockValue,
} from '#app/utils/workout-notation.ts'
import {
	STEP_KIND_LABELS,
	STEP_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'
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
	return (
		<Dialog.Root open={open} onOpenChange={(next) => (next ? null : onClose())}>
			<Dialog.Portal>
				<Dialog.Backdrop className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/40" />
				<Dialog.Popup
					data-block-editor-sheet
					finalFocus={() => finalFocus()}
					// A single Base UI Dialog re-docked by breakpoint (§ #285 / #321):
					// a bottom drawer on phones (bottom edge, rounded top, capped at
					// 85dvh so the steps list scrolls inside it, slides up), flipping
					// to the tall right-side sheet at `md` (slides in from the right).
					className="bg-background border-border data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4 md:data-open:slide-in-from-bottom-0 md:data-open:motion-safe:slide-in-from-right-4 md:data-closed:slide-out-to-bottom-0 md:data-closed:slide-out-to-right-4 fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl border-t p-6 shadow-xl duration-150 outline-none md:inset-x-auto md:inset-y-0 md:right-0 md:max-h-none md:max-w-md md:rounded-t-none md:border-t-0 md:border-l"
				>
					{open ? (
						<>
							{/* Bottom-drawer grabber (phones only): signals the summoned
							    surface; dismissal stays the OverlayHeader ✕ (§3.2). */}
							<div
								aria-hidden
								className="bg-border mx-auto -mb-2 h-1.5 w-10 shrink-0 rounded-full md:hidden"
							/>
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
						</>
					) : null}
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
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
			<OverlayHeader
				title={`Block ${blockIndex + 1}`}
				description="The block's full structure. Changes mirror into the notation."
			/>

			{/* The §10.5 error mirror: the block's own server errors, inline. */}
			<PopoverErrorLead messages={errorsFor?.(null) ?? []} />

			<div className="grid grid-cols-2 gap-3">
				<SheetField
					meta={blockFields.name}
					label="Block name"
					placeholder="e.g. Warm-up"
					onCommit={(value) =>
						announce(value.trim() ? 'Block name updated' : 'Block name cleared')
					}
				/>
				<SheetField
					meta={blockFields.repeatCount}
					label="Repeat count"
					type="number"
					min={1}
					onCommit={(value) => announce(`Repeat count set to ${value}`)}
				/>
			</div>

			<div className="space-y-2">
				<p className="text-body-2xs text-muted-foreground font-semibold tracking-wide uppercase">
					Steps
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
							className="border-border/70 flex flex-wrap items-center gap-2 rounded-md border p-2"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="text-body-2xs text-muted-foreground font-medium">
										Step {stepIndex + 1}
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
										<SelectTrigger aria-label={`Step ${stepIndex + 1} kind`}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{STEP_KINDS.map((stepKind) => (
												<SelectItem key={stepKind} value={stepKind}>
													{STEP_KIND_LABELS[stepKind]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<p className="truncate text-sm">{summary || '—'}</p>
								{/* The step's mirrored server errors (§10.5). */}
								<PopoverErrorLead messages={errorsFor?.(stepIndex) ?? []} />
							</div>
							{/* Adjacent hit-area extensions trimmed to half the 4px gap
							    (§2.2) so neighbouring targets meet instead of stacking. */}
							<div className="flex gap-1">
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="after:-inset-x-0.5"
									aria-label={`Move step ${stepIndex + 1} earlier`}
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
									size="icon-xs"
									className="after:-inset-x-0.5"
									aria-label={`Move step ${stepIndex + 1} later`}
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
									size="icon-xs"
									className="after:-inset-x-0.5"
									aria-label={`Duplicate step ${stepIndex + 1}`}
									onClick={() => onDuplicateStep(blockIndex, stepIndex)}
								>
									⧉
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									className="after:-inset-x-0.5"
									aria-label={`Remove step ${stepIndex + 1}`}
									// Deliberately NOT the ⋮ menu's removeStep: that one
									// collapses a single-step block, which would delete the
									// block this sheet is open on — here the last step is
									// guarded and "Delete block" sits in the footer instead.
									disabled={stepList.length === 1}
									onClick={() => {
										restructure((blocks) => {
											blocks[blockIndex]?.steps?.splice(stepIndex, 1)
										})
										announce('Step removed')
									}}
								>
									✕
								</Button>
							</div>
						</div>
					)
				})}
				<div className="flex flex-wrap items-center gap-1">
					<span className="text-muted-foreground text-sm">＋ Add step:</span>
					{STEP_KINDS.map((kind) => (
						<Button
							key={kind}
							type="button"
							variant="outline"
							size="xs"
							onClick={() => onAddStep(blockIndex, kind)}
						>
							{STEP_KIND_LABELS[kind]}
						</Button>
					))}
				</div>
			</div>

			{/* Dismissal lives in the header's close button (#282); the footer
			    keeps only the block-level destructive action. */}
			<div className="border-border mt-auto flex items-center border-t pt-4">
				<Button
					type="button"
					variant="destructive"
					size="sm"
					// No last-block guard: deleting the only block lands on §11's
					// empty composition, same as the ⠿ menu's Delete.
					onClick={() => {
						onClose()
						restructure((blocks) => {
							blocks.splice(blockIndex, 1)
						})
						announce('Block deleted')
					}}
				>
					Delete block
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
