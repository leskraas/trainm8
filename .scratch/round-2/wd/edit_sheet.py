import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:70], s.count(old))
    s = s.replace(old, new)


rep(""" * Value edits bind to the same Conform fields the rest of the editor writes
 * (`useInputControl`), so the sheet mirrors into the sentence live and the
 * submission path is untouched; structure edits dispatch through the same
 * atomic `restructure` update. Closing returns focus to the block's ⠿ grip —
 * the mark that summoned it.
 */
import { Dialog } from '@base-ui/react/dialog'
import { useInputControl } from '@conform-to/react'
import { OverlayHeader } from '#app/components/overlay-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
""", """ * Value edits bind to the same Conform fields the rest of the editor writes
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
""")
rep("""import {
	tokenText,
	type BlockNotation,
	type DraftBlockValue,
} from '#app/utils/workout-notation.ts'
import {
	STEP_KIND_LABELS,
	STEP_KINDS,
	type StepKind,
} from '#app/utils/workout-schema.ts'
""", """import { BLOCK_SHEET_LABELS, NB_STEP_KIND_LABELS } from '#app/utils/labels.ts'
import {
	tokenText,
	type BlockNotation,
	type DraftBlockValue,
} from '#app/utils/workout-notation.ts'
import { STEP_KINDS, type StepKind } from '#app/utils/workout-schema.ts'
""")
a = s.index("export function BlockEditorSheet({")
b = s.index("function SheetBody({")
s = s[:a] + """const L = BLOCK_SHEET_LABELS

/** `md` and up: the sheet docks on the right, as it did before the Drawer. */
const WIDE_QUERY = '(min-width: 48rem)'

/**
 * Whether the screen is `md` or wider, read from `matchMedia` and kept live,
 * so the swipe that dismisses the sheet follows the edge it is docked to.
 * The server and the first client render say "phone"; the sheet is never
 * open on either, so nothing can mismatch.
 */
function useWideScreen(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const query = window.matchMedia(WIDE_QUERY)
			query.addEventListener('change', onChange)
			return () => query.removeEventListener('change', onChange)
		},
		() => window.matchMedia(WIDE_QUERY).matches,
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

""" + s[b:]
rep("""		<>
			<OverlayHeader
				title={`Block ${blockIndex + 1}`}
				description="The block's full structure. Changes mirror into the notation."
			/>
""", """		<>
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
""")
rep("""				<SheetField
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
				/>""", """				<SheetField
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
				/>""")
rep("""				<p className="text-body-2xs text-muted-foreground font-semibold tracking-wide uppercase">
					Steps
				</p>""", """				<p className="text-overline text-muted-foreground uppercase">
					{L.steps}
				</p>""")
rep("""							className="border-border/70 flex flex-wrap items-center gap-2 rounded-md border p-2"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="text-body-2xs text-muted-foreground font-medium">
										Step {stepIndex + 1}
									</p>""", """							className="bg-muted/60 flex flex-wrap items-center gap-2 rounded-3xl p-3"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="text-caption text-muted-foreground">
										{L.step(stepIndex + 1)}
									</p>""")
rep("""										<SelectTrigger aria-label={`Step ${stepIndex + 1} kind`}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{STEP_KINDS.map((stepKind) => (
												<SelectItem key={stepKind} value={stepKind}>
													{STEP_KIND_LABELS[stepKind]}
												</SelectItem>
											))}""", """										<SelectTrigger aria-label={L.stepKind(stepIndex + 1)}>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{STEP_KINDS.map((stepKind) => (
												<SelectItem key={stepKind} value={stepKind}>
													{NB_STEP_KIND_LABELS[stepKind]}
												</SelectItem>
											))}""")
rep("""								<p className="truncate text-sm">{summary || '—'}</p>""", """								{/* The step's notation in full: a summary cut with "…" is
								    the half-read sentence story 32 rules out. */}
								<p className="text-callout mt-1 font-normal [overflow-wrap:anywhere]">
									{summary || '—'}
								</p>""")
s = s.replace("aria-label={`Move step ${stepIndex + 1} earlier`}", "aria-label={L.moveEarlier(stepIndex + 1)}")
s = s.replace("aria-label={`Move step ${stepIndex + 1} later`}", "aria-label={L.moveLater(stepIndex + 1)}")
s = s.replace("aria-label={`Duplicate step ${stepIndex + 1}`}", "aria-label={L.duplicate(stepIndex + 1)}")
s = s.replace("aria-label={`Remove step ${stepIndex + 1}`}", "aria-label={L.remove(stepIndex + 1)}")
rep("""									announce('Step removed')""", """									announce(L.stepRemoved)""")
rep("""					<span className="text-muted-foreground text-sm">＋ Add step:</span>""", """					<span className="text-footnote text-muted-foreground">
						{L.addStep}
					</span>""")
rep("""							{STEP_KIND_LABELS[kind]}""", """							{NB_STEP_KIND_LABELS[kind]}""")
rep("""			<div className="border-border mt-auto flex items-center border-t pt-4">
				<Button
					type="button"
					variant="destructive"
					size="sm\"""", """			<div className="mt-auto flex items-center pt-2">
				<Button
					type="button"
					variant="destructive\"""")
rep("""					Delete block
				</Button>""", """					{L.deleteBlock}
				</Button>""")
rep("""					announce('Block deleted')""", """					announce(L.blockDeleted)""")
open(p, 'w').write(s)
