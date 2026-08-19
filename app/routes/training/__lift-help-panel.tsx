/**
 * **The lift's help panel, and the annotations under its sets** (#484).
 *
 * One question per card — *"where did this weight come from?"* — behind one
 * control, and **collapsed by default**. The screen has to stay quiet: this is
 * the surface #434 shipped with 24 explanatory prose spans and the verdict was
 * *"too much text, the flow and design is too hard to follow."* So the account
 * exists, in full, and costs one tap to ask for.
 *
 * Open, it says four things and no more (`docs/design/strength-program-handoff`
 * §3): how this weight was resolved *in the athlete's own numbers*, which rack
 * the plate line is solved against, what the rest timer does and does not
 * survive, and where to see this lift over time.
 *
 * **Nothing here is computed.** Every sentence, including which of the two
 * resolution sentences a lift gets, comes from `__runner-presenter.ts`, where it
 * is tested without a browser. This file draws strings.
 *
 * The panel's expand is the **only** animation on this screen besides the
 * circles' own colour change and press-scale.
 */
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	type HelpPanelLines,
	type PlateAnnotation,
} from './__runner-presenter.ts'

/**
 * The control that opens the panel: 36 px drawn, **44 px to a thumb** through the
 * `after:` inset the rest of this screen uses (ADR 0028), because it is pressed
 * with a shaking hand twenty seconds after a heavy set.
 *
 * `aria-expanded` and `aria-controls` rather than a popover: the panel is part of
 * the card and reads in document order, so a screen reader meets the explanation
 * where the weight is.
 */
export function LiftHelpToggle({
	liftName,
	panelId,
	open,
	onToggle,
}: {
	liftName: string
	panelId: string
	open: boolean
	onToggle: () => void
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={`About ${liftName}`}
			aria-expanded={open}
			aria-controls={panelId}
			className={cn(
				'text-muted-foreground focus-visible:ring-ring border-foreground/15 relative flex size-9 shrink-0 items-center justify-center rounded-xl border outline-none after:absolute after:-inset-1 focus-visible:ring-2',
				open && 'bg-foreground/10 text-foreground',
			)}
		>
			<Icon name="question-mark-circled" size="md" />
		</button>
	)
}

/**
 * The panel itself — four lines in the handoff's copy, in the handoff's order.
 *
 * Rendered only while open, which is what makes *"collapsed by default"* an
 * absence rather than a hidden paragraph a screen reader still reads out.
 */
export function LiftHelpPanel({
	panelId,
	lines,
}: {
	panelId: string
	lines: HelpPanelLines
}) {
	return (
		<div
			id={panelId}
			data-lift-help-panel
			className="bg-muted text-muted-foreground text-body-2xs animate-in fade-in-0 slide-in-from-top-1 flex flex-col gap-2 rounded-2xl p-3.5 leading-relaxed duration-150"
		>
			{/* The weight, in the athlete's own numbers rather than in the
			    algorithm's — *"82.5 kg is your working weight after five made
			    sessions"* / *"60 kg is held: two sessions in a row came up short"*.
			    A weight that stopped moving and says nothing reads as a bug. Where
			    the ramp refused, its sentence is folded into this line rather than
			    given a fifth of its own: the panel says four things (#484). */}
			{lines.resolution ? <p>{lines.resolution}</p> : null}
			<p>{lines.plates}</p>
			<p>{lines.timer}</p>
			{lines.history ? (
				<p>
					<Link to={lines.history.href} className="underline">
						{lines.history.text}
					</Link>
				</p>
			) : null}
		</div>
	)
}

/**
 * **What goes under the working sets**: the plate line and, on the right, last
 * time.
 *
 * Three answers for the left-hand side, and the two that are not a plate line
 * are the ones that matter (ADR 0060 §2):
 *
 * - the line, monospace, per side and heaviest first — so the columns line up
 *   between one card and the next;
 * - a rack that **cannot make the number**, saying so in the solver's own
 *   sentence, so nobody hunts for a plate that does not exist;
 * - **no gym described: no line at all**, and the offer to describe one in its
 *   place. Not a default rack, not an assumed bar.
 */
export function LiftPlateRow({
	annotation,
	lastTime,
}: {
	annotation: PlateAnnotation
	lastTime: string | null
}) {
	if (!annotation && lastTime == null) return null
	return (
		<div className="mt-2 flex items-baseline justify-between gap-2.5">
			{annotation?.kind === 'plates' ? (
				<p
					className="text-body-2xs text-muted-foreground truncate font-mono"
					data-plate-line
				>
					{annotation.text}
				</p>
			) : annotation?.kind === 'refusal' ? (
				<p className="text-body-2xs text-muted-foreground" data-plate-line>
					{annotation.text}
				</p>
			) : annotation?.kind === 'no-gym' ? (
				<p className="text-body-2xs text-muted-foreground" data-plate-offer>
					<Link
						to="/settings/training/gym"
						className="inline-flex min-h-11 items-center underline"
					>
						Tell us what your gym has
					</Link>{' '}
					and every weight gets a plate line.
				</p>
			) : (
				<span />
			)}
			{lastTime ? <LastTime text={lastTime} /> : null}
		</div>
	)
}

/**
 * `Last time 80 × 5,5,5,5,5` — the previous session's working sets, so today
 * reads as progress or as a repeat without doing arithmetic (#476's user story
 * 25).
 *
 * **It is a statement, not a control.** The handoff asks for a dotted-underline
 * line at this spot and asks it to *say* last time's sets; it names nothing a
 * tap should open. It used to open the lift's help panel, which is a surface
 * about *this* session's weight and says nothing about last time — a control
 * that opens something other than what it names is worse than the text the
 * capture actually shows. The dotted underline is kept, because it is this
 * app's mark for *"quoted from elsewhere"*, and the account of every number on
 * the card is still one tap away behind the card's own help button.
 */
function LastTime({ text }: { text: string }) {
	return (
		<p
			className="text-body-2xs text-muted-foreground shrink-0 underline decoration-dotted"
			data-last-time
		>
			{text}
		</p>
	)
}
