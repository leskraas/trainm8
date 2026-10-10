import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (old[:70], s.count(old))
    s = s.replace(old, new)


rep(""" * The panel's expand is the **only** animation on this screen besides the
 * circles' own colour change and press-scale.
 */
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
""", """ * The panel's expand is the **only** animation on this screen besides the
 * circles' own colour change and press-scale. It is the app's `Collapsible`
 * (#505 round 2): height and opacity on `motion-collapse`, 200ms in and 150ms
 * out on `--ease-out`, interruptible because it is a transition, and gentler
 * under reduced motion. It was a tw-animate keyframe — `slide-in-from-top`
 * on a 150ms built-in curve — that restarted from zero when tapped twice and
 * let the circles below jump.
 */
import { Link } from 'react-router'
import {
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { RUNNER_LABELS } from '#app/utils/labels.ts'
""")
rep("""/**
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
		>""", """/**
 * The control that opens the panel: 36 px drawn, **44 px to a thumb** through the
 * `after:` inset the rest of this screen uses (ADR 0028), because it is pressed
 * with a shaking hand twenty seconds after a heavy set.
 *
 * A `Collapsible` trigger rather than a popover: it carries `aria-expanded` and
 * `aria-controls` itself, and the panel is part of the card and reads in
 * document order, so a screen reader meets the explanation where the weight
 * is. It must sit inside the card's `Collapsible` root (the route's
 * `LiftCard`), which owns whether it is open.
 */
export function LiftHelpToggle({ liftName }: { liftName: string }) {
	return (
		<CollapsibleTrigger
			aria-label={RUNNER_LABELS.helpToggle(liftName)}
			className="text-muted-foreground focus-visible:ring-ring border-foreground/15 data-panel-open:bg-muted data-panel-open:text-foreground pressable relative flex size-9 shrink-0 items-center justify-center rounded-3xl border outline-none after:absolute after:-inset-1 focus-visible:ring-2"
		>
			<Icon name="question-mark-circled" size="md" />
		</CollapsibleTrigger>
	)
}

/**
 * The panel itself — four lines in the handoff's copy, in the handoff's order.
 *
 * Mounted only while open (Base UI unmounts a closed panel once its exit has
 * played), which is what makes *"collapsed by default"* an absence rather than
 * a hidden paragraph a screen reader still reads out.
 */
export function LiftHelpPanel({
	panelId,
	lines,
}: {
	panelId: string
	lines: HelpPanelLines
}) {
	return (
		<CollapsibleContent id={panelId} data-lift-help-panel>
			<div className="bg-muted text-muted-foreground text-footnote flex flex-col gap-2 rounded-3xl p-3.5">""")
rep("""			{lines.history ? (
				<p>
					<Link to={lines.history.href} className="underline">
						{lines.history.text}
					</Link>
				</p>
			) : null}
		</div>
	)
}""", """			{lines.history ? (
				<p>
					<Link
						to={lines.history.href}
						className="text-foreground inline-flex min-h-11 items-center underline underline-offset-2"
					>
						{lines.history.text}
					</Link>
				</p>
			) : null}
			</div>
		</CollapsibleContent>
	)
}""")
rep("""				<p
					className="text-body-2xs text-muted-foreground truncate font-mono"
					data-plate-line
				>""", """				<p
					className="text-footnote text-muted-foreground truncate font-mono"
					data-plate-line
				>""")
rep("""				<p className="text-body-2xs text-muted-foreground" data-plate-line>""", """				<p className="text-footnote text-muted-foreground" data-plate-line>""")
rep("""				<p className="text-body-2xs text-muted-foreground" data-plate-offer>
					<Link
						to="/settings/training/gym"
						className="inline-flex min-h-11 items-center underline"
					>
						Tell us what your gym has
					</Link>{' '}
					and every weight gets a plate line.
				</p>""", """				<p className="text-footnote text-muted-foreground" data-plate-offer>
					<Link
						to="/settings/training/gym"
						className="text-foreground inline-flex min-h-11 items-center underline underline-offset-2"
					>
						{RUNNER_LABELS.describeGym}
					</Link>{' '}
					{RUNNER_LABELS.describeGymAfter}
				</p>""")
rep("""		<p
			className="text-body-2xs text-muted-foreground shrink-0 underline decoration-dotted"
			data-last-time
		>""", """		<p
			className="text-footnote text-muted-foreground shrink-0 underline decoration-dotted tabular-nums"
			data-last-time
		>""")
open(p, 'w').write(s)
