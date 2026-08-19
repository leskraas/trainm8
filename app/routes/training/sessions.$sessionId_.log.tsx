/**
 * **The session runner** — the surface an athlete *runs* a strength workout on,
 * and the one a strength actual arrives through (ADR 0056, ADR 0060, ADR 0064).
 *
 * One card-scroll and a state machine rather than a wizard: one card per lift,
 * the generated warm-up ramp above its working sets, the working sets as a row of
 * large tap-to-log circles, a rest bar that never blocks the next set, and one
 * explicit *"finish"* at the bottom that folds the log back into the program.
 *
 * ```
 * pre-session ──open──▶ warm-up ──▶ working sets ⇄ rest ──finish──▶ outcome
 *      │                                  ▲   │
 *      └─ loads resolved *now*            └───┘  (rest never blocks logging)
 * ```
 *
 * **A working set is one control, and the control is a circle** (ADR 0064, which
 * supersedes ADR 0060 §1). ADR 0060 shipped three controls per row — load, reps,
 * ✓ — which is the right shape for a couch and the wrong one for a gym: one
 * thumb, phone at arm's length, twenty seconds after a heavy set, every set
 * costing a keyboard and a weight the program had already decided. So the row and
 * its load input are gone. The circle shows the target, one tap logs the target in
 * full, each further tap counts the reps down, and a tap past zero clears the set.
 *
 * **The cost is stated rather than papered over**: there is no longer any way, on
 * this screen, to log a working set at a weight other than the one the program
 * resolved. ADR 0064 names that absence and the others that came with it.
 *
 * **No prose on the logging surface at all.** ADR 0028 was necessary and
 * demonstrably insufficient: #434 shipped a 4,283-line screen with 24
 * explanatory prose spans and the verdict was *"too much text, the flow and
 * design is too hard to follow."* Every explanation here lives one tap behind the
 * lift's name.
 *
 * **The component computes no programme logic.** Circle state, the accessible
 * label, the tap cycle, the counter, the sub-line and the weight a tap posts are
 * all pure functions in `__runner-presenter.ts`, tested at that seam.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, data, useFetcher } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type LogExercise,
	clearLoggedSet,
	getStrengthLogView,
	saveLoggedSet,
} from '#app/utils/strength-log.server.ts'
import { type LoadValue, SET_ROLES } from '#app/utils/strength-log.ts'
import {
	programLiftProgress,
	programRunForSession,
} from '#app/utils/strength-program.server.ts'
import { finishStrengthSession } from '#app/utils/strength-runner.server.ts'
import { type Route } from './+types/sessions.$sessionId_.log.ts'
import {
	LiftHelpPanel,
	LiftHelpToggle,
	LiftPlateRow,
} from './__lift-help-panel.tsx'
import { buildOutcomePanelView } from './__outcome-panel-presenter.ts'
import { OutcomePanel } from './__outcome-panel.tsx'
import { RestBar, type RestState } from './__rest-bar.tsx'
import {
	type LiftProgress,
	type RestAction,
	type SetCircle,
	type WarmupChip,
	type WorkingLoad,
	buildHelpPanel,
	buildLastTime,
	buildLiftPlateAnnotation,
	buildLiftSubline,
	buildLoggedCounter,
	buildRecordBanner,
	buildRunnerLog,
	buildSetCircles,
	buildWarmupChips,
	buildWorkingLoad,
	findLiftProgress,
	nextSetReps,
	restDeadline,
	restForSetTap,
	restForWarmupTap,
} from './__runner-presenter.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `Log · ${loaderData?.sessionTitle ?? 'Session'} | Trainm8` },
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const view = await getStrengthLogView(userId, params.sessionId)
	if (!view) throw new Response('Not found', { status: 404 })
	// A program session prescribes the athlete's own **copy** of the day shape,
	// because that is where the resolved load lives — so the run is reached one hop
	// up `copiedFromId`, which the view's own direct lookup cannot see.
	const program =
		view.program ??
		(await programRunForSession({ userId, sessionId: params.sessionId }))
	// **Where each lift now stands, so the help panel can say the weight in the
	// athlete's own numbers** (#484). The kilo is in the stamp; *why* it is that
	// kilo — five made sessions, or two that came up short — is state, and only the
	// run holds it. Empty outside a run, and the panel then falls back to the
	// prescription's own provenance.
	return {
		...view,
		program,
		// **Which session of the run this is** — the header's `Session 14` badge
		// (#480). Only a run can number a session, so it is null outside one.
		sessionNumber: program
			? await runSessionNumber({
					instanceId: program.instanceId,
					sessionId: params.sessionId,
				})
			: null,
		liftProgress: program
			? await programLiftProgress({ userId, instanceId: program.instanceId })
			: [],
	}
}

/**
 * **This session's ordinal within the run**, counted from the folds the run has
 * recorded.
 *
 * `ProgramSessionApplication` is the only list of a run's sessions there is —
 * one row per session folded in, in the order they were folded — so the session
 * being run right now, which has not been folded yet, is the next one: *"Session
 * 14"* is the fourteenth session of this run. A session that **has** been folded
 * (a reopened day, a second visit) reads its own place in that order rather than
 * the end of it, so re-opening session 9 of 13 does not relabel it 14.
 *
 * Counting folds rather than scheduled days is deliberate: a run's calendar can
 * be edited, skipped and re-generated, and the number the athlete is owed is how
 * many sessions of this program they have actually put in.
 */
async function runSessionNumber(input: {
	instanceId: string
	sessionId: string
}): Promise<number> {
	const folded = await prisma.programSessionApplication.findMany({
		where: { instanceId: input.instanceId },
		// `appliedAt` is NULL on a legacy row the table's migration reconstructed,
		// which has no recorded time; `id` is the tiebreak so the order is at least
		// stable rather than arbitrary.
		orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
		select: { sessionId: true },
	})
	const already = folded.findIndex((row) => row.sessionId === input.sessionId)
	return already === -1 ? folded.length + 1 : already + 1
}

/**
 * The load kinds the action accepts, unchanged from ADR 0056's grid.
 *
 * **The runner no longer offers a picker.** The circles post the kind the
 * prescription implies (`buildWorkingLoad`), so the seven members below are now
 * the *action's* vocabulary rather than a menu — which is what keeps a set logged
 * on a machine from being restated as kilos, and what keeps a session logged
 * before ADR 0064 readable. `perSide` remains absent for the reason ADR 0061
 * gives: `LoadValue`'s `perSide` fixes `sides` at 2, and laterality is NULL on the
 * ~700 corpus rows nobody authored, so storing one would assert both hands were
 * loaded on a claim nobody made.
 */
const LOAD_KINDS = [
	'external',
	'bodyweight',
	'bodyweightPlus',
	'assisted',
	'stackLevel',
	'band',
	'unloaded',
] as const
type LoadKind = (typeof LOAD_KINDS)[number]

const LOAD_KIND_LABELS: Record<LoadKind, string> = {
	external: 'Weight (kg)',
	bodyweight: 'Bodyweight',
	bodyweightPlus: 'Bodyweight + kg',
	assisted: 'Assisted (kg off)',
	stackLevel: 'Machine level',
	band: 'Band',
	unloaded: 'No load',
}

/**
 * What a stored row was loaded with, in a phrase that fits mid-sentence. All
 * eight members of the union and not just the seven the action takes: the words
 * are for describing a row that already exists, and `perSide` rows exist.
 */
const LOAD_VALUE_KIND_WORDS: Record<LoadValue['kind'], string> = {
	external: 'kilos',
	perSide: 'kilos per hand',
	bodyweight: 'bodyweight',
	bodyweightPlus: 'bodyweight plus kilos',
	assisted: 'assisted kilos',
	stackLevel: 'a machine level',
	band: 'a band',
	unloaded: 'no load',
}

const optionalNumber = z
	.string()
	.optional()
	.transform((v) => (v == null || v.trim() === '' ? null : Number(v)))
	.refine((v) => v == null || Number.isFinite(v), 'Not a number')

const LogSetSchema = z.object({
	stepId: z.string().min(1),
	orderIndex: z.coerce.number().int().min(0),
	role: z.enum(SET_ROLES).default('working'),
	loadKind: z.enum(LOAD_KINDS),
	loadNumber: optionalNumber,
	loadLabel: z.string().max(40).optional(),
	reps: optionalNumber,
	repsLeft: optionalNumber,
	durationSec: optionalNumber,
	rir: optionalNumber,
	restTakenSec: optionalNumber,
	toFailure: z.string().optional(),
	abandoned: z.string().optional(),
	/** Present only where the posted kind differs from what the row already says —
	 * the one thing that licenses restating what a recorded set was loaded with. */
	changeLoadKind: z.string().optional(),
})

/**
 * Turn the posted fields into a {@link LoadValue}, refusing rather than guessing.
 * A kind that needs a number and did not get one is not "0 kg" — it is a row
 * that cannot be logged, and saying so is a first-class answer.
 */
function toLoadValue(
	kind: LoadKind,
	num: number | null,
	label: string | undefined,
): LoadValue | null {
	switch (kind) {
		case 'external':
			return num != null && num > 0 ? { kind: 'external', kg: num } : null
		case 'bodyweight':
			return { kind: 'bodyweight' }
		case 'bodyweightPlus':
			return num != null && num > 0
				? { kind: 'bodyweightPlus', addedKg: num }
				: null
		case 'assisted':
			return num != null && num > 0 ? { kind: 'assisted', assistKg: num } : null
		case 'stackLevel':
			return num != null && num > 0 && Number.isInteger(num)
				? { kind: 'stackLevel', level: num, ...(label ? { label } : {}) }
				: null
		case 'band':
			return label && label.trim() ? { kind: 'band', band: label.trim() } : null
		case 'unloaded':
			return { kind: 'unloaded' }
	}
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = String(formData.get('intent') ?? '')

	// **Finishing is an explicit act**, which is how ADR 0060 §6 resolves the
	// `WorkoutSession.status` question ADR 0056 left open: the athlete says the
	// session is done, and every strength aggregate still reads logged working
	// sets rather than the column.
	if (intent === 'finish-session') {
		const finished = await finishStrengthSession({
			userId,
			sessionId: params.sessionId,
		})
		if (!finished.ok) {
			return data(
				{
					error:
						finished.reason === 'nothing-logged'
							? 'Log a working set first — there is nothing to finish yet.'
							: 'That session is gone.',
				},
				400,
			)
		}
		return {
			ok: true as const,
			finished: {
				outcomes: buildOutcomePanelView(
					finished.outcomes,
					finished.liftNames,
					finished.programName,
				),
				programName: finished.programName,
			},
		}
	}

	if (intent === 'clear-set') {
		const cleared = await clearLoggedSet(
			userId,
			params.sessionId,
			String(formData.get('stepId') ?? ''),
			Number(formData.get('orderIndex') ?? -1),
		)
		return cleared ? { ok: true as const } : data({ error: 'Not found' }, 404)
	}

	const parsed = LogSetSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success)
		return data({ error: 'That set did not make sense.' }, 400)
	const input = parsed.data

	const load = toLoadValue(input.loadKind, input.loadNumber, input.loadLabel)
	if (!load) {
		return data(
			{ error: `${LOAD_KIND_LABELS[input.loadKind]} needs a number.` },
			400,
		)
	}

	const result = await saveLoggedSet({
		athleteId: userId,
		sessionId: params.sessionId,
		stepId: input.stepId,
		orderIndex: input.orderIndex,
		role: input.role,
		outcome: input.abandoned ? 'abandoned' : 'completed',
		toFailure: Boolean(input.toFailure),
		load,
		reps: input.reps,
		repsLeft: input.repsLeft,
		durationSec: input.durationSec,
		rir: input.rir,
		restTakenSec: input.restTakenSec,
		changeLoadKind: Boolean(input.changeLoadKind),
	})
	if (!result.ok) {
		if (result.reason === 'load-kind-locked') {
			// The refusal names what the set already says it was, because the athlete's
			// screen is showing them something else — that mismatch *is* the bug this
			// guard caught, and a generic "did not save" would leave them retapping.
			return data(
				{
					error: `That set is recorded as ${LOAD_VALUE_KIND_WORDS[result.recordedKind]}. It cannot be re-logged as something else from here.`,
				},
				400,
			)
		}
		return data(
			{
				error:
					result.reason === 'not-strength'
						? 'That step is not a lift.'
						: result.reason === 'no-count'
							? 'That set recorded no count.'
							: 'That session is gone.',
			},
			400,
		)
	}
	// **The reason the feature exists** (ADR 0058's user story): the banner fires
	// the moment a record set is completed. Phrased server-side so only sentences
	// cross the wire, and scoped to *this* circle's fetcher, so it appears on the
	// set that took the record and nowhere else.
	return {
		ok: true as const,
		id: result.id,
		record: buildRecordBanner(result.records),
	}
}

/**
 * The runner's client state is the logged map and nothing derived.
 *
 * `logged` is `stepId_orderIndex → reps`; absent means unlogged. Resolved working
 * weight, plate breakdown, circle colour, the counter and the outcome are
 * **derived, never stored** — every one of them from the presenter. The map is
 * held here rather than read back off the loader so a tapped circle answers
 * before the round trip; a save the server refuses puts the previous value back
 * and says so in words.
 */
export default function SetLogRoute({ loaderData }: Route.ComponentProps) {
	const view = loaderData
	const [logged, setLogged] = useState<Record<string, number>>(() =>
		buildRunnerLog(view.exercises),
	)
	// One rest timer for the session, keyed off a wall-clock deadline rather than
	// a countdown integer, so backgrounding the tab cannot desynchronize it. What
	// a tap does to it — start it, and for how long, or cancel it — is the
	// presenter's answer (`restForSetTap`, `restForWarmupTap`); this holds the
	// timestamp and nothing derived from it.
	const [rest, setRest] = useState<RestState | null>(null)
	const lastCompletedAt = useRef<number | null>(null)

	/** A tap, applied to the map the circles read. `null` clears the set. */
	function setLoggedValue(key: string, value: number | null) {
		setLogged((current) => {
			const next = { ...current }
			if (value == null) delete next[key]
			else next[key] = value
			return next
		})
	}

	/**
	 * A set was recorded. `at` is **when the athlete tapped**, not when the server
	 * answered, so the deadline is anchored to the end of the set even though the
	 * bar only appears once the save has landed — a rest clock that starts when
	 * the network finishes would be short by the round trip.
	 */
	function onSetLogged(action: RestAction, at: number) {
		lastCompletedAt.current = at
		setRest(
			action.kind === 'start'
				? { deadline: restDeadline(action, at), reason: action.reason }
				: null,
		)
	}

	/** What the runner owes a tapped set, in one parameter rather than four —
	 * see {@link RunnerHandlers}. */
	const runner: RunnerHandlers = {
		setLoggedValue,
		lastCompletedAt,
		onSetLogged,
		onRestCancelled: () => setRest(null),
	}

	return (
		<main className="flex min-h-svh flex-col">
			<RunnerHeader view={view} />

			{/* The scroll area. **The bottom padding clears the rest bar** and must
			    not be dropped — 120px, per the handoff, which is what keeps the bar
			    from covering the last card's circles (#482). */}
			<div
				data-runner-scroll=""
				className="container mx-auto max-w-2xl flex-1 pb-30"
			>
				{view.status === 'completed' ? <AlreadyRecorded view={view} /> : null}

				{view.exercises.length === 0 ? (
					<p className="text-body-2xs text-muted-foreground">
						This session has no lifts to log.
					</p>
				) : (
					<div className="flex flex-col gap-4">
						{view.exercises.map((exercise) => (
							<LiftCard
								key={exercise.stepId}
								exercise={exercise}
								hasGymOnFile={view.hasGymOnFile}
								liftProgress={view.liftProgress ?? []}
								logged={logged}
								runner={runner}
							/>
						))}
					</div>
				)}

				{view.exercises.length > 0 ? <FinishSession view={view} /> : null}
			</div>

			{/* Pinned to the foot of the scroll area, whose bottom padding above
			    reserves its height — so it never covers a set circle, and every
			    circle stays tappable while it runs (#482). */}
			<RestBar
				rest={rest}
				// **±15 s moves the deadline**, which is the only number there is; a
				// remaining time would have to be recomputed to be added to.
				onAdjust={(sec) =>
					setRest((r) =>
						r == null ? null : { ...r, deadline: r.deadline + sec * 1000 },
					)
				}
				onDismiss={() => setRest(null)}
			/>
		</main>
	)
}

/**
 * The header: the back arrow, the workout eyebrow, the title and the session
 * badge.
 *
 * Back returns to the **cockpit**, because that is where the athlete entered the
 * section from and the back affordance has to be predictable across all four
 * strength screens (#476). It is the `PageHeader` affordance rather than the
 * component itself: this header carries an eyebrow above its title, which
 * `PageHeader` has no slot for, and a route may not grow one for itself.
 */
function RunnerHeader({ view }: { view: Route.ComponentProps['loaderData'] }) {
	return (
		<header className="container mx-auto flex max-w-2xl items-start gap-2 py-4">
			<Link
				to="/"
				aria-label="Back to today"
				className={cn(
					buttonVariants({ variant: 'ghost', size: 'icon' }),
					// ~44px effective touch target on a 32px control (ADR 0028).
					'relative -ml-2 shrink-0 after:absolute after:-inset-1.5',
				)}
			>
				<Icon name="arrow-left" size="md" />
			</Link>
			<div className="min-w-0 flex-1">
				<p className="text-button text-primary truncate tracking-widest uppercase">
					{view.sessionTitle}
				</p>
				<h1 className="text-h6 truncate">Run your workout</h1>
			</div>
			{/* `Session 14` — which session of the run this is ({@link
			    runSessionNumber}). A session that belongs to no run has no number,
			    and no badge: a run is the only thing that can count sessions, and
			    inventing an ordinal out of the calendar would be a claim. */}
			{view.sessionNumber != null ? (
				<Badge
					variant="secondary"
					className="bg-muted text-muted-foreground h-6 shrink-0 rounded-2xl"
				>
					Session {view.sessionNumber}
				</Badge>
			) : null}
		</header>
	)
}

/**
 * One lift: its name, the weight the program resolved, the warm-up ramp, and the
 * row of tap-to-log circles.
 *
 * Everything on it is read from the presenter. The card decides nothing about
 * what a circle says, what a tap means or what gets posted.
 */
function LiftCard({
	exercise,
	hasGymOnFile,
	liftProgress,
	logged,
	runner,
}: {
	exercise: LogExercise
	hasGymOnFile: boolean
	/** Where each lift of the run stands — {@link programLiftProgress}. */
	liftProgress: readonly LiftProgress[]
	logged: Record<string, number>
	runner: RunnerHandlers
}) {
	/** The one refusal this card is showing, if any. A save that fails puts the
	 * circle back and says why here, where the thumb already is. */
	const [failure, setFailure] = useState<string | null>(null)
	/** The runner's four, plus the one thing that is this card's: where a refusal
	 * is printed. Every set control on the card logs through this. */
	const handlers: SetLogHandlers = { ...runner, onFailure: setFailure }
	/** **Collapsed by default**, because the screen has to stay quiet: the account
	 * of every number on this card exists and costs one tap to ask for. */
	const [helpOpen, setHelpOpen] = useState(false)
	const load = buildWorkingLoad(exercise)
	const subline = buildLiftSubline(exercise)
	const circles = buildSetCircles({
		liftName: exercise.name,
		stepId: exercise.stepId,
		rows: exercise.rows,
		logged,
		tappable: load.kind === 'resolved',
	})
	const chips = buildWarmupChips({
		liftName: exercise.name,
		stepId: exercise.stepId,
		rows: exercise.warmupRows,
		logged,
	})
	const panelId = `lift-help-${exercise.stepId}`
	const help = buildHelpPanel({
		exercise,
		hasGymOnFile,
		progress: findLiftProgress(liftProgress, exercise.exerciseId),
	})
	const plateAnnotation = buildLiftPlateAnnotation({
		exercise,
		load,
		hasGymOnFile,
	})
	const lastTime = buildLastTime(exercise.rows)

	return (
		<Card
			className="gap-3.5 px-4.5 py-4.5"
			aria-labelledby={`lift-${exercise.stepId}`}
		>
			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<h2 id={`lift-${exercise.stepId}`} className="text-h6 truncate">
						{exercise.name}
					</h2>
					{subline ? (
						<p className="text-body-2xs text-muted-foreground mt-0.5">
							{subline}
						</p>
					) : null}
				</div>
				{/* Every explanation this lift owes, one tap behind its name — never a
				    paragraph beside a control (#434's defect). */}
				<LiftHelpToggle
					liftName={exercise.name}
					panelId={panelId}
					open={helpOpen}
					onToggle={() => setHelpOpen((open) => !open)}
				/>
			</div>

			{helpOpen ? <LiftHelpPanel panelId={panelId} lines={help} /> : null}

			{chips.length > 0 ? (
				<div>
					<p className="text-button text-muted-foreground tracking-widest uppercase">
						Warm-up
					</p>
					<div className="mt-2 flex flex-wrap gap-2">
						{chips.map((chip) => (
							<WarmupChipButton
								key={chip.key}
								exercise={exercise}
								chip={chip}
								handlers={handlers}
							/>
						))}
					</div>
				</div>
			) : null}

			<div>
				<div className="flex items-baseline justify-between gap-2">
					<p className="text-button text-muted-foreground tracking-widest uppercase">
						Working sets
					</p>
					{/* What is left, without counting circles. */}
					<p className="text-body-2xs text-muted-foreground">
						{buildLoggedCounter(circles)}
					</p>
				</div>
				<div className="mt-2 flex items-stretch gap-2.5">
					{circles.map((circle) => (
						<SetCircleButton
							key={circle.key}
							exercise={exercise}
							circle={circle}
							load={load}
							handlers={handlers}
						/>
					))}
				</div>
				{/* The weight is an absence, so there is nothing to tap. **The
				    absence itself is stated once**, in the sub-line under the lift's
				    name, where the weight would have been (ADR 0008's Unavailable
				    Metric). What goes here is only the way out of it: repeating the
				    sentence beside the circles said the same thing twice, three lines
				    apart, on the one screen with the least attention available. */}
				{load.kind === 'absent' && load.fix ? (
					<p className="text-body-2xs text-muted-foreground mt-2">{load.fix}</p>
				) : null}
				{/* Under the sets: the plate line, and last time on the right. Both
				    are the presenter's strings — including the sentence a rack that
				    cannot make the number says, and the offer that stands where no
				    gym is described. */}
				<LiftPlateRow annotation={plateAnnotation} lastTime={lastTime} />
				{failure ? (
					<p className="text-destructive text-body-2xs mt-2" role="alert">
						{failure}
					</p>
				) : null}
			</div>
		</Card>
	)
}

/** Whether the action's answer says the set is stored. */
function isSaved(answer: unknown): boolean {
	return (
		typeof answer === 'object' &&
		answer != null &&
		'ok' in answer &&
		answer.ok === true
	)
}

/** The sentence a refusal carried, or null when it carried none. */
function messageOf(answer: unknown): string | null {
	return typeof answer === 'object' &&
		answer != null &&
		'error' in answer &&
		typeof answer.error === 'string'
		? answer.error
		: null
}

/** What a failure says when the server did not say anything a card can print. */
const UNEXPLAINED_FAILURE = 'That set did not save — tap it again.'

/**
 * **What the runner owes every set control**, as one parameter.
 *
 * These four travelled as four separate props through three levels — the route,
 * the card, and each circle and chip — which is a Data Clump: they are never
 * useful apart, and a control that took three of them would be a control that
 * cannot log. They are the runner's half of {@link SetLogHandlers}.
 */
type RunnerHandlers = {
	/** A tap, applied to the map the circles read. `null` clears the set. */
	setLoggedValue: (key: string, value: number | null) => void
	/** When the last set was recorded, so a save can post the rest actually
	 * taken. A ref rather than state: reading it must not re-render a circle. */
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (action: RestAction, at: number) => void
	onRestCancelled: () => void
}

/** The runner's four plus the card's one — where a refusal gets printed. */
type SetLogHandlers = RunnerHandlers & {
	onFailure: (message: string | null) => void
}

/**
 * **One tap, one write, and the screen put back if the write is refused** — the
 * whole of a set control's behaviour, in one hook.
 *
 * A working-set circle (#480) and a warm-up chip (#483) differ in what they draw
 * and in *what* a tap means — the circle counts reps down, the chip toggles —
 * and in nothing else: both write through ADR 0056 §2's upsert on
 * `(sessionId, stepId, orderIndex)`, both clear through the shipped clear path,
 * both hold the rest until the save lands, and both put the previous value back
 * and say why when it does not. That reconciliation used to exist twice,
 * verbatim, which is two places for the rule to drift.
 *
 * **A save either lands or says so.** Anything that is not a success is a
 * failure, and the athlete needs to know *that* far more than they need the
 * reason: a set that appeared to save and did not is gone, and it feeds the
 * program fold, where a lost set reads as a missed rep and eventually cuts the
 * athlete's working weight.
 */
function useOptimisticSetLog(handlers: SetLogHandlers) {
	const fetcher = useFetcher<typeof action>()
	/** The tap in flight: which set, what to put back if it fails, and the rest
	 * it earns. */
	const pending = useRef<{
		key: string
		at: number
		previous: number | null
		rest: RestAction | null
	} | null>(null)

	useEffect(() => {
		const inFlight = pending.current
		if (!inFlight || fetcher.state !== 'idle') return
		pending.current = null
		if (isSaved(fetcher.data)) {
			if (inFlight.rest) handlers.onSetLogged(inFlight.rest, inFlight.at)
		} else {
			handlers.setLoggedValue(inFlight.key, inFlight.previous)
			handlers.onFailure(messageOf(fetcher.data) ?? UNEXPLAINED_FAILURE)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the fetcher's answer is the signal
	}, [fetcher.state, fetcher.data])

	/**
	 * Record a set: the map moves first, the post follows, and the rest the tap
	 * earns is held until the server has agreed. `at` is **when the athlete
	 * tapped**, so the rest is anchored to the end of the set rather than to the
	 * end of the round trip.
	 *
	 * `fields` are the caller's typed fields — the load kind and number the
	 * presenter resolved, and the count under the name of the quantity it is —
	 * so nothing here parses anything.
	 */
	function log(input: {
		key: string
		previous: number | null
		value: number
		rest: RestAction | null
		fields: Record<string, string>
	}) {
		handlers.onFailure(null)
		const at = Date.now()
		handlers.setLoggedValue(input.key, input.value)
		const restTaken = handlers.lastCompletedAt.current
			? Math.round((at - handlers.lastCompletedAt.current) / 1000)
			: null
		pending.current = {
			key: input.key,
			at,
			previous: input.previous,
			rest: input.rest,
		}
		void fetcher.submit(
			{
				intent: 'log-set',
				...input.fields,
				...(restTaken != null ? { restTakenSec: String(restTaken) } : {}),
			},
			{ method: 'POST' },
		)
	}

	/** Take a set back. **A cleared set has no rest to serve**: the set it was
	 * resting from is gone. */
	function clear(input: {
		key: string
		previous: number | null
		stepId: string
		orderIndex: number
	}) {
		handlers.onFailure(null)
		const at = Date.now()
		handlers.setLoggedValue(input.key, null)
		pending.current = {
			key: input.key,
			at,
			previous: input.previous,
			rest: null,
		}
		void fetcher.submit(
			{
				intent: 'clear-set',
				stepId: input.stepId,
				orderIndex: String(input.orderIndex),
			},
			{ method: 'POST' },
		)
		handlers.onRestCancelled()
	}

	return { log, clear }
}

const CIRCLE_STATE_CLASS = {
	// Transparent with a dim border and the target in muted text: a set that is
	// asking to be done.
	untouched: 'border-foreground/15 text-muted-foreground',
	// Primary, filled: made.
	made: 'bg-primary border-primary text-primary-foreground',
	// **Destructive, at a glance.** A set under its target is one the program will
	// read as a miss, and the athlete is entitled to see that without arithmetic.
	short: 'bg-destructive/20 border-destructive text-destructive',
} satisfies Record<SetCircle['state'], string>

/**
 * **One working set, as one control.**
 *
 * Every tap is a write, through ADR 0056 §2's upsert on
 * `(sessionId, stepId, orderIndex)` — nothing is added to `ExerciseSetLog`, and
 * a clear goes through the shipped clear path. **The circle parses nothing**: it
 * posts typed fields — the load kind and number the presenter resolved, and the
 * count under the name of the quantity it is — so render-never-parse is intact.
 *
 * The rest is held until the save lands. A bar counting down for a set the server
 * refused is the surface telling the athlete the set is in when it is not.
 */
function SetCircleButton({
	exercise,
	circle,
	load,
	handlers,
}: {
	exercise: LogExercise
	circle: SetCircle
	load: WorkingLoad
	handlers: SetLogHandlers
}) {
	const setLog = useOptimisticSetLog(handlers)

	function tap() {
		if (load.kind !== 'resolved' || circle.target == null) return
		// **The tap cycle is the presenter's**, so the component never decides what
		// a second tap on a five means.
		const next = circle.countsDown
			? nextSetReps(circle.logged, circle.target)
			: circle.logged == null
				? circle.target
				: ('cleared' as const)

		if (next === 'cleared') {
			setLog.clear({
				key: circle.key,
				previous: circle.logged,
				stepId: exercise.stepId,
				orderIndex: circle.orderIndex,
			})
			return
		}

		setLog.log({
			key: circle.key,
			previous: circle.logged,
			value: next,
			// **Rest is outcome-aware**, and which rest this tap earns is the
			// presenter's pure answer: a set that came up short rests longer, because
			// that is what the program says. No duration is written here.
			rest: restForSetTap({
				circle,
				next,
				prescribedSec: exercise.restBetweenSetsSec,
			}),
			fields: {
				stepId: exercise.stepId,
				orderIndex: String(circle.orderIndex),
				role: circle.role,
				loadKind: load.loadKind,
				loadNumber: load.loadNumber,
				[circle.quantity]: String(next),
			},
		})
	}

	return (
		<button
			type="button"
			onClick={tap}
			// **60px tall, for a reason**: it is pressed with a shaking hand, twenty
			// seconds after a heavy set (#476's user story 26).
			className={cn(
				'focus-visible:ring-ring text-body-md flex h-15 flex-1 items-center justify-center rounded-2xl border-2 bg-transparent font-bold outline-none focus-visible:ring-2',
				// The only two animations on this screen: the 120ms colour change and
				// the 80ms press-scale.
				'[transition:background-color_120ms,border-color_120ms,color_120ms,transform_80ms] active:scale-[0.94]',
				CIRCLE_STATE_CLASS[circle.state],
				circle.tappable ? '' : 'opacity-50',
			)}
			aria-label={circle.ariaLabel}
			// Never disabled while a rest runs — the timer must never stand between
			// the athlete and the bar (ADR 0060 §4). Only a load that does not
			// resolve to a number takes the tap away.
			disabled={!circle.tappable}
			data-set-circle={circle.orderIndex}
			data-state={circle.state}
		>
			{circle.display}
		</button>
	)
}

/**
 * **A warm-up rung as a chip that toggles** (#483, screen
 * `04-runner-logging-rest.png`).
 *
 * A chip and not a circle, because a rung is not a working set: it is not
 * counted, it is not a record, it does not appear in `n of m logged`, and it is
 * ticked on the way past rather than logged after. So it is small, it wraps, and
 * it carries its own weight and reps in its face — but it is still ≥44 px, since
 * it is tapped by the same shaking hand.
 *
 * **The rest a rung implies is the presenter's**, and the whole rule is one call:
 * `restForWarmupTap` starts the one pause in the ramp from the last rung, and
 * cancels a running rest from any earlier one — the timer follows what the
 * athlete is actually doing. No duration is written here.
 */
function WarmupChipButton({
	exercise,
	chip,
	handlers,
}: {
	exercise: LogExercise
	chip: WarmupChip
	handlers: SetLogHandlers
}) {
	const setLog = useOptimisticSetLog(handlers)

	function toggle() {
		const count = chip.reps ?? chip.durationSec
		if (chip.on || count == null) {
			setLog.clear({
				key: chip.key,
				previous: count ?? null,
				stepId: exercise.stepId,
				orderIndex: chip.orderIndex,
			})
			return
		}
		setLog.log({
			key: chip.key,
			previous: null,
			value: count,
			rest: restForWarmupTap({ chip, on: true }),
			fields: {
				stepId: exercise.stepId,
				orderIndex: String(chip.orderIndex),
				role: 'warmup',
				loadKind: chip.loadKind,
				loadNumber: chip.loadNumber,
				...(chip.reps != null
					? { reps: String(chip.reps) }
					: { durationSec: String(chip.durationSec ?? '') }),
			},
		})
	}

	return (
		<button
			type="button"
			onClick={toggle}
			// `aria-pressed` and not a checkbox: the chip is a toggle over a rung
			// that is already prescribed, not a question being answered.
			aria-pressed={chip.on}
			aria-label={chip.ariaLabel}
			className={cn(
				// The handoff's chip: radius 14px (`rounded-xl` against this repo's
				// 10px `--radius`), padding `8px 11px`, and **44px minimum** — the same
				// hit target as every other control on this screen, on an element that
				// only needs 28px to hold its text.
				'text-body-2xs focus-visible:ring-ring flex min-h-11 items-center justify-center rounded-xl border px-2.75 py-2 font-semibold whitespace-nowrap outline-none focus-visible:ring-2',
				chip.on
					? // Ticked: filled to the same 10% the border was, a brighter
						// hairline, and full foreground text.
						'bg-foreground/10 border-foreground/22 text-foreground'
					: // Untouched: transparent with a dim hairline — a rung that is
						// asking to be walked up, and never the loudest thing on the card.
						'border-foreground/10 text-muted-foreground bg-transparent',
			)}
			data-warmup-chip={chip.orderIndex}
		>
			{chip.label}
		</button>
	)
}

/**
 * **Finish the workout, and hear what you lift next time.**
 *
 * The one control on this screen that is not a set. Explicitly *not* a "save
 * workout" button — every set is already persisted the moment it is tapped, and
 * the caption says so — and explicitly not an inference either: it writes
 * `status: 'completed'` because the athlete said the session was over, and it
 * folds the log into the running program server-side, where the pure engine
 * re-reads `ExerciseSetLog` rather than trusting anything this form posted.
 *
 * **Refused, in words, on a session with no logged working set** (ADR 0060 §6),
 * and refused by the server rather than by this button: the sets are the truth,
 * and a second copy of the rule up here could disagree with them.
 */
function FinishSession({ view }: { view: Route.ComponentProps['loaderData'] }) {
	const fetcher = useFetcher<typeof action>()
	const finished =
		fetcher.data && 'finished' in fetcher.data ? fetcher.data.finished : null
	const error =
		fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null
	const [dismissed, setDismissed] = useState(false)

	// **Back from the panel returns to the runner**, not to the cockpit (#476's
	// navigation rule). Nothing is undone by it: the fold has happened, every set
	// is still the record of the day, and the athlete is simply back among them.
	if (finished && !dismissed) {
		return (
			<OutcomePanel
				items={finished.outcomes}
				exercises={view.exercises}
				onBack={() => setDismissed(true)}
			/>
		)
	}

	// Already recorded: no button. Tapping Finish twice is safe — the fold is
	// idempotent on `ProgramSessionApplication` — but a live-looking control over
	// a session that is already done is the surface telling the athlete nothing
	// happened yet, which is untrue. The statement lives at the top of the screen
	// (`AlreadyRecorded`).
	if (view.status === 'completed') return null

	return (
		<div className="mt-6">
			<Button
				type="button"
				className="h-13 w-full"
				disabled={fetcher.state !== 'idle'}
				onClick={() =>
					void fetcher.submit({ intent: 'finish-session' }, { method: 'POST' })
				}
			>
				Finish workout
			</Button>
			{error ? (
				<p className="text-destructive text-body-2xs mt-2" role="alert">
					{error}
				</p>
			) : null}
			{/* The one thing an athlete worried about losing work needs to read. */}
			<p className="text-body-2xs text-muted-foreground mt-2 text-center">
				Every set was saved as you tapped it. This only marks the day.
			</p>
		</div>
	)
}

/**
 * **This session is already recorded**, said before the cards rather than under
 * them.
 *
 * A reload used to drop the outcome panel and put `Finish workout` back with
 * nothing on the screen saying the day was already folded in, so the surface read
 * as *"nothing has happened yet"* about a session that had. It sits above the
 * cards on purpose: the circles stay tappable — a set logged after the fact is
 * still the truth about the day — and this is the one line the athlete needs
 * before touching them.
 */
function AlreadyRecorded({
	view,
}: {
	view: Route.ComponentProps['loaderData']
}) {
	return (
		<div
			role="status"
			className="border-border bg-muted/40 mb-4 rounded-2xl border p-3"
		>
			<p className="text-body-2xs font-medium">Already recorded.</p>
			<p className="text-body-2xs text-muted-foreground mt-1">
				You finished this workout. Your sets are the record, and tapping one
				below still changes it — but nothing here is waiting to be filed.
			</p>
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-body-2xs mt-2 inline-flex min-h-11 items-center underline"
				>
					What {view.program.name} says you lift next
				</Link>
			) : null}
		</div>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
