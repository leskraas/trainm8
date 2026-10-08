/**
 * Tapping an empty day — the payoff of the grid (ADR 0065 §5, issue #501).
 *
 * Three states live here, in the row itself, and the athlete never leaves the
 * timeline for any of them:
 *
 * 1. **The draft.** The tapped cell opens in place with a Discipline chip row —
 *    prefilled from the athlete's **most-trained discipline**, shown *before* it
 *    commits, one tap to change — and the sentence the stamp is about to write.
 *    Nothing has been written yet.
 * 2. **The stamp.** Confirming posts the day and the chip to home's own action,
 *    which writes a real one-step block through the very same
 *    `createWorkoutSession` the full authoring route uses.
 * 3. **The sentence.** The row then renders the **Token Sentence** for what was
 *    written — the editor's own instrument, tokens and all — so every value is
 *    one the athlete taps and types over, with ± nudges, saving as they go.
 *
 * **Nothing is parsed.** ADR 0027 §1 decides *render, never parse*; this surface
 * inherits that rule rather than weakening it. What the tap produces is
 * structure, and the sentence is a pure rendering of it.
 *
 * **The popover problem, and how it is answered.** The token popover is a 324px
 * instrument built for a full-width editor, and it arrives in a 44px row. Left
 * alone it opens *over the next day*. So an open sentence is not a row any more:
 * it is a **stage** the row grows into, tall enough that the instrument opens
 * onto the open cell's own ground. The next day's row is pushed down by real
 * layout rather than painted under a floating panel — which is the only version
 * of "does not cover the next day" that survives a scroll.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ScheduledWorkoutSentence } from '#app/routes/training/__workout-detail-editor.tsx'
import { STAMP_SENTENCE, isStampableDiscipline } from '#app/utils/day-stamp.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { DAY_STAMP_LABELS, nbDisciplineLabel } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
import { type StampedLedgerSession, useDayStamp } from './day-stamp-context.tsx'
import { DiscDot } from './disc-dot.tsx'
import { growIn } from './reflow.ts'

/**
 * The height the cell had before it was tapped — ADR 0028's control floor, and
 * the height the draft grows *from* (#502).
 *
 * Not from zero. The row the athlete's thumb is on already occupies 44px, and a
 * draft that starts at nothing collapses the row under the finger before it
 * opens, which is a lurch rather than the state change the animation is there
 * to indicate.
 */
const CELL_FLOOR_PX = 44

/** Where the full authoring route opens for a given day and chip — the **More**
 * escape, carrying the cell's own day so the route lands on the day the athlete
 * tapped rather than on "in an hour". */
function fullEditorTo(dayKey: string, discipline: Discipline | null) {
	const params = new URLSearchParams({ date: dayKey })
	if (discipline) params.set('discipline', discipline)
	return `/training/sessions/new?${params}`
}

const CHIP =
	'flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2.5 text-[11.5px]/[1] font-semibold'

/**
 * The draft — everything the cell has to say **before** anything is written.
 *
 * The Discipline is the one thing the stamp cannot derive from the tap, so it is
 * the one thing the draft exists to show. It is prefilled from the athlete's own
 * history and never silently defaulted; where there is no history to read, the
 * row leads with the question instead of an answer nobody gave (ADR 0065 §5).
 */
export function StampDraft({
	dayKey,
	dayLabel,
	dateLabel,
}: {
	dayKey: string
	dayLabel: string
	dateLabel: string
}) {
	const stamp = useDayStamp()
	const [chosen, setChosen] = useState<Discipline | null>(stamp.prefill)
	const ref = useRef<HTMLDivElement>(null)
	const pending = stamp.pendingDayKey === dayKey
	const failed = stamp.failedDayKey === dayKey

	// The cell **opens** rather than swapping (#502): one of the timeline's two
	// sanctioned `height` animations, because the days below this one genuinely
	// move down and no transform moves them. Before paint, so the first frame the
	// athlete sees is the closed one and not the open one.
	useLayoutEffect(() => {
		const node = ref.current
		return node ? growIn(node, CELL_FLOOR_PX) : undefined
	}, [])

	// The panel is taller than the cell it replaced, so on a day near the bottom
	// edge the thing the athlete just tapped would otherwise be half off-screen.
	useEffect(() => {
		// Optional-called: jsdom has no scroller, and a test that renders the
		// open row is not a test about scrolling.
		ref.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])

	const stampable = chosen != null && isStampableDiscipline(chosen)

	return (
		<div
			ref={ref}
			data-timeline-draft={dayKey}
			className="bg-primary/4 reflow grid grid-cols-[46px_1fr] items-start gap-3 px-[18px] py-[10px]"
		>
			<span className="flex flex-col gap-0.5 pt-px">
				<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{dayLabel}
				</span>
				<span className="text-ink-dimmer text-[12px]/[1.1]">{dateLabel}</span>
			</span>
			<div className="flex min-w-0 flex-col gap-2">
				<p className="text-ink-dimmer text-[11px]/[1.3]">
					{stamp.prefill ? DAY_STAMP_LABELS.prefilled : DAY_STAMP_LABELS.ask}
				</p>
				<div
					role="radiogroup"
					aria-label={DAY_STAMP_LABELS.discipline}
					className="flex flex-wrap gap-1.5"
				>
					{DISCIPLINES.map((discipline) => {
						const active = chosen === discipline
						return (
							<button
								key={discipline}
								type="button"
								role="radio"
								aria-checked={active}
								onClick={() => setChosen(discipline)}
								className={cn(
									CHIP,
									active
										? 'border-primary text-primary bg-primary/10'
										: 'border-hairline-edge text-ink-dim',
								)}
							>
								<DiscDot solid discipline={discipline} className="size-[6px]" />
								{nbDisciplineLabel(discipline)}
							</button>
						)
					})}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{stampable ? (
						<button
							type="button"
							disabled={pending}
							onClick={() => stamp.stamp(dayKey, chosen)}
							className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[34px] items-center rounded-[10px] px-[13px] text-[12.5px]/[1] font-bold disabled:opacity-60"
						>
							{pending
								? DAY_STAMP_LABELS.adding
								: DAY_STAMP_LABELS.add(STAMP_SENTENCE)}
						</button>
					) : chosen != null ? (
						/* A lifting session has to name a lift, and no lift can be read
						   off a tap on a Thursday — so strength takes the **More**
						   escape rather than stamping a half-made session. */
						<Link
							to={fullEditorTo(dayKey, chosen)}
							className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[34px] items-center rounded-[10px] px-[13px] text-[12.5px]/[1] font-bold"
						>
							{DAY_STAMP_LABELS.nameTheLifts}
						</Link>
					) : /* Nothing chosen and nothing derived: there is no session to
						   offer yet, so the row offers none. The question above is the
						   whole of the state. */
					null}
					<Link
						to={fullEditorTo(dayKey, chosen)}
						className="border-hairline-edge text-foreground hover:border-primary flex h-[34px] items-center rounded-[10px] border px-[13px] text-[12.5px]/[1] font-semibold"
					>
						{DAY_STAMP_LABELS.more}
					</Link>
					<button
						type="button"
						onClick={stamp.closeDraft}
						className="text-ink-dim h-[34px] px-1 text-[12.5px]/[1] font-semibold"
					>
						{DAY_STAMP_LABELS.cancel}
					</button>
				</div>
				{chosen != null && !stampable ? (
					<p className="text-ink-dimmer text-[11px]/[1.35]">
						{DAY_STAMP_LABELS.liftsNote}
					</p>
				) : null}
				{/* Nothing was written, and the row says so rather than sitting on
				    `Adding…` (#501 AC 8). The draft is still open on the chip they
				    chose, so the way out of a failure is the same tap that got here —
				    `role="status"` because the athlete is looking at the button, not
				    at the line under it. */}
				{failed ? (
					<p role="status" className="text-destructive text-[11px]/[1.35]">
						{DAY_STAMP_LABELS.failed}
					</p>
				) : null}
			</div>
		</div>
	)
}

/**
 * The gap between the instrument and the row below it, once the row has grown to
 * hold it — the same 10px the popover already offsets itself from its token.
 */
const STAGE_GAP_PX = 10

/**
 * **The stage**: how much ground the open row keeps under itself while the token
 * popover is open.
 *
 * The popover is a 324px instrument built for a full-width editor and it arrives
 * in a 44px row (ADR 0065's consequences name this as the first place the
 * editor's existing instrument does not simply drop in). It opens **below** its
 * token — there is always viewport under a row near the top of the stream, so it
 * never flips — and in a 44px row that lands it squarely on the next day.
 *
 * So the row grows by exactly the instrument's own measured height for exactly
 * as long as the instrument is open. The next day's row is pushed down by real
 * layout rather than painted under a floating panel, which is the only version
 * of "does not cover the next day" that survives a scroll — and the row is back
 * to its own height the moment the popover closes, so an open sentence is never
 * a hole in the stream.
 *
 * Measured rather than guessed: the popover's height depends on which token it
 * was opened on (a duration stepper and the intensity editor are not the same
 * size), and a constant would be wrong for one of them by construction.
 */
function usePopoverStage(): number {
	const [stage, setStage] = useState(0)
	useEffect(() => {
		const sync = () => {
			const popup = document.querySelector<HTMLElement>(
				'[data-slot="token-popover"]',
			)
			const height = popup
				? Math.ceil(popup.getBoundingClientRect().height) + STAGE_GAP_PX
				: 0
			setStage((current) => (current === height ? current : height))
		}
		// The popover is portalled, so it mounts and unmounts as a child of the
		// body — and retargeting to another token swaps the popup's contents,
		// which the subtree watch catches so the stage tracks a taller editor.
		const observer = new MutationObserver(sync)
		observer.observe(document.body, { childList: true, subtree: true })
		sync()
		return () => observer.disconnect()
	}, [])
	return stage
}

/**
 * The just-stamped session, rendered as the editable **Token Sentence** in the
 * row it belongs to — the editor's own instrument, unchanged and unforked
 * (`ScheduledWorkoutSentence`), so every token opens the same popover, types the
 * same way, nudges the same way, and autosaves through the same action.
 *
 * That reuse is also what makes the session **indistinguishable from one
 * authored on the full route**: it is the same component over the same
 * structure saving through the same path.
 */
export function StampedSentence({
	session,
	dayLabel,
	dateLabel,
	thresholds,
}: {
	session: StampedLedgerSession
	dayLabel: string
	dateLabel: string
	thresholds: DisciplineThresholdMap
}) {
	const stamp = useDayStamp()
	const ref = useRef<HTMLDivElement>(null)
	const stage = usePopoverStage()

	useEffect(() => {
		// Optional-called: jsdom has no scroller, and a test that renders the
		// open row is not a test about scrolling.
		ref.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])

	return (
		<div
			ref={ref}
			data-timeline-stamped={session.id}
			className="bg-primary/4 grid grid-cols-[46px_1fr] items-start gap-3 px-[18px] py-[10px]"
		>
			<span className="flex flex-col gap-0.5 pt-px">
				<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{dayLabel}
				</span>
				<span className="text-ink-dimmer text-[12px]/[1.1]">{dateLabel}</span>
			</span>
			<div className="flex min-w-0 flex-col gap-2.5">
				<ScheduledWorkoutSentence
					session={{
						id: session.id,
						scheduledAt: session.scheduledAt,
						workout: session.workout,
					}}
					thresholds={thresholds}
					// A stamped session is one cardio step: no exercise token exists to
					// open a combobox, no strength anchors to resolve against, and no
					// logged sets to warn about. Handing over empty lists is the honest
					// shape of that, not a shortfall — the moment the athlete needs any
					// of it, **More** takes them to the route that has it.
					exercises={[]}
					recentExerciseIds={[]}
					loadContexts={{}}
					loggedSetsByStep={{}}
				/>
				<StampedRowActions
					to={`/training/sessions/${session.id}`}
					onUndo={() => stamp.undo(session.id)}
					onDone={stamp.closeOpen}
					undoing={stamp.undoingSessionId === session.id}
				/>
				{/* The instrument's ground. See {@link usePopoverStage}. */}
				<div aria-hidden style={{ height: stage }} />
			</div>
		</div>
	)
}

function StampedRowActions({
	to,
	onUndo,
	onDone,
	undoing,
}: {
	to: string
	onUndo: () => void
	onDone: () => void
	undoing: boolean
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{/* ADR 0076: the way back, on the row, while the row is still open. A
			    mistap is one tap from gone and the cell is empty again. */}
			<button
				type="button"
				onClick={onUndo}
				disabled={undoing}
				className="border-hairline-edge text-foreground hover:border-destructive hover:text-destructive flex h-[30px] items-center rounded-[9px] border px-[11px] text-[11.5px]/[1] font-semibold disabled:opacity-60"
			>
				{undoing ? DAY_STAMP_LABELS.removing : DAY_STAMP_LABELS.undo}
			</button>
			<Link
				to={to}
				prefetch="intent"
				className="border-hairline-edge text-foreground hover:border-primary flex h-[30px] items-center rounded-[9px] border px-[11px] text-[11.5px]/[1] font-semibold"
			>
				{DAY_STAMP_LABELS.more}
			</Link>
			<button
				type="button"
				onClick={onDone}
				className="text-primary h-[30px] px-1 text-[11.5px]/[1] font-bold"
			>
				{DAY_STAMP_LABELS.done}
			</button>
		</div>
	)
}
