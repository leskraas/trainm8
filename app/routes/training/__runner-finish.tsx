/**
 * **Finish the workout, and hear what you lift next time.**
 *
 * The one control on the runner that is not a set. Explicitly *not* a "save
 * workout" button — every set is already persisted the moment it is tapped, and
 * the caption says so — and explicitly not an inference either: it writes
 * `status: 'completed'` because the athlete said the session was over, and it
 * folds the log into the running program server-side, where the pure engine
 * re-reads `ExerciseSetLog` rather than trusting anything this form posted.
 *
 * **Untapped sets are asked about, never assumed** (owner decision 10). With
 * sets still untapped, Finish first asks *"N sett er ikke logget: marker som
 * ikke gjort, eller fortsett?"* — inline, where the button was, not a modal
 * over the circles the athlete may want to go back to. *Marker som ikke gjort*
 * posts the answer (`untapped=not-done`); *Fortsett* puts the button back. The
 * server holds the same rule (`finishStrengthSession` refuses an unanswered
 * finish with the count), so a stale screen cannot fold a session silently; a
 * refusal from it opens the same question.
 *
 * **The rest bar stops when the session is finished** (`onFinished`): it is for
 * between sets, and over the outcome panel it is noise.
 *
 * Refused, in words, on a session with no logged working set (ADR 0060 §6), and
 * refused by the server rather than by this button.
 */
import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import {
	FINISH_UNTAPPED_LABELS as Q,
	RUNNER_LABELS as L,
} from '#app/utils/labels.ts'
import { untappedWorkingSets } from '#app/utils/strength/working-load.ts'
import { type LogExercise } from '#app/utils/strength-log.server.ts'
import { type OutcomePanelItem } from './__outcome-panel-presenter.ts'
import { OutcomePanel } from './__outcome-panel.tsx'
import { setCircleKey } from './__runner-presenter.ts'

/** What the runner's finish action answers. */
export type FinishActionData =
	| {
			ok: true
			finished: { outcomes: OutcomePanelItem[]; programName: string | null }
	  }
	| { error: string; untapped?: number }

export function RunnerFinish({
	exercises,
	logged,
	status,
	onFinished,
}: {
	exercises: readonly LogExercise[]
	/** The runner's map of taps — the same record the circles draw. */
	logged: Readonly<Record<string, number>>
	status: string
	onFinished: () => void
}) {
	const fetcher = useFetcher<FinishActionData>()
	const data = fetcher.data
	const finished = data && 'finished' in data ? data.finished : null
	const error = data && 'error' in data ? data.error : null
	const [dismissed, setDismissed] = useState(false)
	// The count the question names: this screen's own, or the server's where it
	// refused a finish this screen thought was complete.
	const [asking, setAsking] = useState<number | null>(null)
	const serverUntapped = data && 'untapped' in data ? data.untapped : undefined

	useEffect(() => {
		if (serverUntapped != null) setAsking(serverUntapped)
	}, [serverUntapped])
	useEffect(() => {
		if (finished) onFinished()
		// `onFinished` is the route's setter; a new identity is not a new finish.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [finished])

	function finish(untapped?: 'not-done') {
		setAsking(null)
		void fetcher.submit(
			untapped
				? { intent: 'finish-session', untapped }
				: { intent: 'finish-session' },
			{ method: 'POST' },
		)
	}

	// **Back from the panel returns to the runner**, not to I dag (#476's
	// navigation rule). Nothing is undone by it: the fold has happened, every set
	// is still the record of the day, and the athlete is simply back among them.
	if (finished && !dismissed) {
		return (
			<OutcomePanel
				items={finished.outcomes}
				exercises={exercises}
				onBack={() => setDismissed(true)}
			/>
		)
	}

	// Already recorded: no button. The statement lives at the top of the screen.
	if (status === 'completed' || finished) return null

	if (asking != null) {
		return (
			<div
				role="alertdialog"
				aria-labelledby="untapped-question"
				className="bg-muted mt-6 rounded-3xl p-4"
			>
				<p id="untapped-question" className="text-callout">
					{Q.question(asking)}
				</p>
				<div className="mt-3 flex flex-col gap-2 sm:flex-row">
					<Button
						type="button"
						variant="outline"
						className="rounded-full sm:flex-1"
						disabled={fetcher.state !== 'idle'}
						onClick={() => finish('not-done')}
					>
						{Q.markNotDone}
					</Button>
					<Button
						type="button"
						className="rounded-full sm:flex-1"
						autoFocus
						onClick={() => setAsking(null)}
					>
						{Q.keepGoing}
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="mt-6">
			<Button
				type="button"
				className="h-13 w-full rounded-full"
				disabled={fetcher.state !== 'idle'}
				onClick={() => {
					const untapped = untappedWorkingSets(
						exercises,
						(exercise, row) =>
							setCircleKey(exercise.stepId, row.orderIndex) in logged,
					)
					if (untapped > 0) setAsking(untapped)
					else finish()
				}}
			>
				{L.finish}
			</Button>
			{error && serverUntapped == null ? (
				<p
					className="text-foreground-destructive text-footnote mt-2"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{/* The one thing an athlete worried about losing work needs to read. */}
			<p className="text-footnote text-muted-foreground mt-2 text-center">
				{L.finishNote}
			</p>
		</div>
	)
}
