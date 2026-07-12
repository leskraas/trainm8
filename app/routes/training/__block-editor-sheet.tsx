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
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	tokenText,
	type BlockNotation,
	type DraftBlockValue,
	type DraftStepValue,
} from '#app/utils/workout-notation.ts'
import { STEP_KINDS, type StepKind } from '#app/utils/workout-schema.ts'
import { STEP_KIND_LABELS } from './__workout-step-fields.tsx'

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
	blockCount: number
	restructure: (mutate: (blocks: DraftBlockValue[]) => void) => void
	/** Seed-and-append a step of the chosen kind (the ＋ chooser's seeds, §4.1). */
	onAddStep: (blockIndex: number, kind: StepKind) => void
	announce: (message: string) => void
	/** Where focus returns on dismiss — the block's ⠿ grip. */
	finalFocus: () => HTMLElement | null
}

export function BlockEditorSheet({
	blockIndex,
	onClose,
	blockField,
	blockNotation,
	blockCount,
	restructure,
	onAddStep,
	announce,
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
					className="bg-background data-open:animate-in data-open:motion-safe:slide-in-from-right-4 data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 border-border fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l p-6 shadow-xl duration-150 outline-none"
				>
					{open ? (
						<SheetBody
							blockIndex={blockIndex}
							onClose={onClose}
							blockField={blockField}
							blockNotation={blockNotation}
							blockCount={blockCount}
							restructure={restructure}
							onAddStep={onAddStep}
							announce={announce}
						/>
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
	blockCount,
	restructure,
	onAddStep,
	announce,
}: {
	blockIndex: number
	onClose: () => void
	blockField: FieldMeta
	blockNotation: BlockNotation | null
	blockCount: number
	restructure: BlockEditorSheetProps['restructure']
	onAddStep: BlockEditorSheetProps['onAddStep']
	announce: BlockEditorSheetProps['announce']
}) {
	const blockFields = blockField.getFieldset()
	const stepList = blockField.getFieldset().steps.getFieldList() as FieldMeta[]

	return (
		<>
			<div>
				<Dialog.Title className="text-lg font-semibold">
					Block {blockIndex + 1}
				</Dialog.Title>
				<Dialog.Description className="text-muted-foreground text-sm">
					The block's full structure. Changes mirror into the notation.
				</Dialog.Description>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<SheetTextField
					meta={blockFields.name}
					label="Block name"
					placeholder="e.g. Warm-up"
					onCommit={(value) =>
						announce(value.trim() ? 'Block name updated' : 'Block name cleared')
					}
				/>
				<SheetNumberField
					meta={blockFields.repeatCount}
					label="Repeat count"
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
								<p className="text-body-2xs text-muted-foreground font-medium">
									Step {stepIndex + 1} · {STEP_KIND_LABELS[kind]}
								</p>
								<p className="truncate text-sm">{summary || '—'}</p>
							</div>
							<div className="flex gap-1">
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Move step ${stepIndex + 1} earlier`}
									disabled={stepIndex === 0}
									onClick={() => {
										restructure((blocks) => {
											const steps = blocks[blockIndex]?.steps
											if (!steps) return
											steps.splice(
												stepIndex - 1,
												0,
												...steps.splice(stepIndex, 1),
											)
										})
										announce('Step moved earlier')
									}}
								>
									↑
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Move step ${stepIndex + 1} later`}
									disabled={stepIndex === stepList.length - 1}
									onClick={() => {
										restructure((blocks) => {
											const steps = blocks[blockIndex]?.steps
											if (!steps) return
											steps.splice(
												stepIndex + 1,
												0,
												...steps.splice(stepIndex, 1),
											)
										})
										announce('Step moved later')
									}}
								>
									↓
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Duplicate step ${stepIndex + 1}`}
									onClick={() => {
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
									}}
								>
									⧉
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-xs"
									aria-label={`Remove step ${stepIndex + 1}`}
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

			<div className="border-border mt-auto flex items-center justify-between gap-2 border-t pt-4">
				<Button
					type="button"
					variant="destructive"
					size="sm"
					disabled={blockCount === 1}
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
				<Dialog.Close
					render={
						<Button type="button" variant="secondary" size="sm">
							Done
						</Button>
					}
				/>
			</div>
		</>
	)
}

/** A sheet text field bound to its Conform field through `useInputControl`,
 * so the value writes through to the in-form carriers (classic fields or the
 * detail view's hidden mirror) and submits unchanged. */
function SheetTextField({
	meta,
	label,
	placeholder,
	onCommit,
}: {
	meta: FieldMeta
	label: string
	placeholder?: string
	onCommit: (value: string) => void
}) {
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
	const id = `sheet-${meta.name}`
	return (
		<div className="space-y-1">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="text"
				placeholder={placeholder}
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(event) => {
					control.change(event.target.value)
					onCommit(event.target.value)
				}}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
		</div>
	)
}

function SheetNumberField({
	meta,
	label,
	min,
	onCommit,
}: {
	meta: FieldMeta
	label: string
	min: number
	onCommit: (value: string) => void
}) {
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue:
			typeof meta.initialValue === 'string' ? meta.initialValue : undefined,
	})
	const id = `sheet-${meta.name}`
	return (
		<div className="space-y-1">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type="number"
				min={min}
				value={typeof control.value === 'string' ? control.value : ''}
				onChange={(event) => {
					control.change(event.target.value)
					if (event.target.value) onCommit(event.target.value)
				}}
				onFocus={() => control.focus()}
				onBlur={() => control.blur()}
			/>
		</div>
	)
}
