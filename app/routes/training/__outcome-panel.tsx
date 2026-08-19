/**
 * **What you lift next time** — the panel the session ends on (#485, #476's
 * screen 4, ADR 0060 §7).
 *
 * It is a **decision, not a summary**: one panel per lift, each saying what the
 * program did with the day and why, in the program's own numbers. Nothing here
 * praises the athlete and nothing softens a cut.
 *
 * **The Stall Cut offers nothing.** No undo, no dismiss, no "keep the weight
 * anyway": it is a `role="status"` region containing no button, no link and no
 * input, and it carries the program's provenance note above a hairline, because
 * the percentage is convention with no trial behind it and an athlete reading a
 * 6 kg drop in their own bench is entitled to read that in the same breath. The
 * word *"deload"* appears nowhere — that is ADR 0059 §4's vocabulary, and a
 * Stall Cut is not a planned light week.
 *
 * **Every sentence is the presenter's.** The component decides no weight, no
 * percentage and no wording: `buildOutcomePanelView` holds the rule that a
 * sentence about where a lift now stands reads the lift state and never the
 * weight this session was stamped at, and it is not restated here.
 */
import { Link } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type LogExercise } from '#app/utils/strength-log.server.ts'
import {
	type OutcomePanelItem,
	type OutcomeTone,
	buildCutFeasibilityNote,
} from './__outcome-panel-presenter.ts'

/**
 * How each tone is drawn, in tokens rather than in hexes.
 *
 * Progress and "not logged" share the outline on purpose — both are quiet: one
 * is the program working, the other is the program having nothing to read. A
 * held lift is filled, because it is the one the athlete will look for. A cut is
 * destructive, because it is the only one that took something away.
 */
const TONE_CLASS: Record<OutcomeTone, string> = {
	progressed: 'border-border',
	held: 'border-border bg-card',
	notLogged: 'border-border',
	cut: 'border-destructive/40 bg-destructive/10',
	notice: 'border-border bg-muted/40',
}

export function OutcomePanel({
	items,
	exercises,
	onBack,
}: {
	items: readonly OutcomePanelItem[]
	/** The session's lifts, for the rack a cut weight has to be built on. */
	exercises: readonly LogExercise[]
	/** Back from this panel returns to the runner, not to the cockpit — the sets
	 * are still the truth about the day and are still editable. */
	onBack: () => void
}) {
	// The design's single outline link. The first lift with a catalogue entry is
	// the one it names, which on a linear program's day is the day's main lift.
	const linked = items.find((item) => item.exerciseId !== '')

	return (
		<section className="mt-6" aria-labelledby="what-next">
			<div className="mb-3 flex items-center gap-2">
				<button
					type="button"
					onClick={onBack}
					aria-label="Back to your sets"
					className={cn(
						buttonVariants({ variant: 'ghost', size: 'icon' }),
						// ~44px effective touch target on a 32px control (ADR 0028).
						'relative -ml-2 shrink-0 after:absolute after:-inset-1.5',
					)}
				>
					<Icon name="arrow-left" size="md" />
				</button>
				<h2 id="what-next" className="text-h6">
					What you lift next time
				</h2>
			</div>

			{items.length === 0 ? (
				<p className="text-body-2xs text-muted-foreground">
					Session finished. This one is not part of a running program, so
					nothing advanced.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => (
						<OutcomeCard key={item.key} item={item} exercises={exercises} />
					))}
				</ul>
			)}

			<div className="mt-4 flex flex-col gap-3">
				{linked ? (
					<Link
						to={`/training/exercises/${linked.exerciseId}`}
						className={cn(
							buttonVariants({ variant: 'outline' }),
							'h-12 w-full',
						)}
					>
						See {linked.liftName} over time
					</Link>
				) : null}
				<Link to="/" className={cn(buttonVariants(), 'h-12 w-full')}>
					Back to today
				</Link>
			</div>
		</section>
	)
}

/**
 * One lift's outcome.
 *
 * A notice is a `role="status"` region and holds nothing interactive — the drop
 * already happened, and the athlete is being told rather than asked.
 */
function OutcomeCard({
	item,
	exercises,
}: {
	item: OutcomePanelItem
	exercises: readonly LogExercise[]
}) {
	// **Which weight the rack can actually make**, asked of the same gym the
	// runner solved this session's plates against. A cut to 54 kg on a rack of
	// 20/10/5/2.5 kg plates is a bar the athlete cannot load, and naming 54 alone
	// would send them to it.
	const plateContext =
		exercises.find((exercise) => exercise.exerciseId === item.exerciseId)
			?.plateContext ?? null
	const gymNote = buildCutFeasibilityNote({
		kg: item.movedToKg,
		inventory: plateContext?.inventory ?? null,
		options: plateContext?.options ?? null,
	})

	return (
		<li
			{...(item.isNotice ? { role: 'status' as const } : {})}
			className={cn('rounded-2xl border px-4 py-3', TONE_CLASS[item.tone])}
		>
			<p className="text-body-sm font-bold">
				{item.isNotice && item.label ? <span>{item.label}: </span> : null}
				<span>{item.headline}</span>
			</p>
			<p className="text-body-2xs text-muted-foreground mt-1.5">
				{item.reason}
				{gymNote ? ` ${gymNote}` : null}
			</p>
			{!item.isNotice && item.label ? (
				<p className="text-body-2xs text-muted-foreground/85 mt-1.5">
					{item.label}
				</p>
			) : null}
			{item.provenance ? (
				<p className="text-body-2xs text-muted-foreground/85 border-border mt-3 border-t pt-3">
					{item.provenance}
				</p>
			) : null}
		</li>
	)
}
