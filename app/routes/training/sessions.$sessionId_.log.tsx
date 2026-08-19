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
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	hasPlateSolve,
	plateOptionsForKind,
} from '#app/utils/strength/plates.ts'
import {
	REST_ADJUST_STEP_SEC,
	type RestReason,
	restAfterSet,
	restReasonText,
} from '#app/utils/strength/rest.ts'
import {
	type LogExercise,
	clearLoggedSet,
	getStrengthLogView,
	saveLoggedSet,
} from '#app/utils/strength-log.server.ts'
import {
	type LoadValue,
	SET_ROLES,
	isMissedSet,
} from '#app/utils/strength-log.ts'
import { programRunForSession } from '#app/utils/strength-program.server.ts'
import { finishStrengthSession } from '#app/utils/strength-runner.server.ts'
import { type Route } from './+types/sessions.$sessionId_.log.ts'
import {
	type OutcomeItem,
	type SetCircle,
	type WarmupChip,
	type WorkingLoad,
	buildLiftSubline,
	buildLoggedCounter,
	buildOutcomePanel,
	buildPlateLine,
	buildRecordBanner,
	buildResolutionDetail,
	buildRunnerLog,
	buildSetCircles,
	buildWarmupChips,
	buildWorkingLoad,
	nextSetReps,
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
	return {
		...view,
		program:
			view.program ??
			(await programRunForSession({ userId, sessionId: params.sessionId })),
	}
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
				outcomes: buildOutcomePanel(finished.outcomes, finished.liftNames),
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

/** What the runner hands the rest bar when a set is logged: how long, and why. */
export type RestStart = { sec: number | null; reason: RestReason }

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
	// a countdown integer, so backgrounding the tab cannot desynchronize it.
	const [rest, setRest] = useState<{
		deadline: number
		reason: RestReason
	} | null>(null)
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
	function onSetLogged(started: RestStart, at: number) {
		lastCompletedAt.current = at
		setRest(
			started.sec
				? { deadline: at + started.sec * 1000, reason: started.reason }
				: null,
		)
	}

	return (
		<main className="flex min-h-svh flex-col">
			<RunnerHeader view={view} />

			{/* The scroll area. **The bottom padding clears the rest bar** and must
			    not be dropped — 120px, per the handoff, which is what keeps the bar
			    from covering the last card's circles (#482). */}
			<div className="container mx-auto max-w-2xl flex-1 pb-30">
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
								logged={logged}
								setLoggedValue={setLoggedValue}
								lastCompletedAt={lastCompletedAt}
								onSetLogged={onSetLogged}
								onRestCancelled={() => setRest(null)}
							/>
						))}
					</div>
				)}

				{view.exercises.length > 0 ? <FinishSession view={view} /> : null}
			</div>

			<RestTimerBar
				rest={rest}
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
			{/* The badge names the run this session belongs to. The handoff's
			    `Session 14` needs the session's **ordinal within the run**, which the
			    loader's view does not carry — see the ADR's open item. */}
			{view.program ? (
				<Badge
					variant="secondary"
					className="bg-muted text-muted-foreground h-6 shrink-0"
				>
					{view.program.name}
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
	logged,
	setLoggedValue,
	lastCompletedAt,
	onSetLogged,
	onRestCancelled,
}: {
	exercise: LogExercise
	hasGymOnFile: boolean
	logged: Record<string, number>
	setLoggedValue: (key: string, value: number | null) => void
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart, at: number) => void
	onRestCancelled: () => void
}) {
	/** The one refusal this card is showing, if any. A save that fails puts the
	 * circle back and says why here, where the thumb already is. */
	const [failure, setFailure] = useState<string | null>(null)
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
	const plateLine = buildLiftPlateLine(exercise, load)

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
				    paragraph beside a control (#434's defect). #484 turns this into the
				    handoff's collapsible panel. */}
				<ExerciseNotes exercise={exercise} hasGymOnFile={hasGymOnFile} />
			</div>

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
								setLoggedValue={setLoggedValue}
								onFailure={setFailure}
								lastCompletedAt={lastCompletedAt}
								onSetLogged={onSetLogged}
								onRestCancelled={onRestCancelled}
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
							setLoggedValue={setLoggedValue}
							onFailure={setFailure}
							lastCompletedAt={lastCompletedAt}
							onSetLogged={onSetLogged}
							onRestCancelled={onRestCancelled}
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
				{plateLine ? (
					<p
						className="text-body-2xs text-muted-foreground mt-2 font-mono"
						data-plate-line
					>
						{plateLine}
					</p>
				) : null}
				{failure ? (
					<p className="text-destructive text-body-2xs mt-2" role="alert">
						{failure}
					</p>
				) : null}
			</div>
		</Card>
	)
}

/**
 * The plate line under the sets — per side, heaviest first, solved against the
 * active gym's inventory, and **absent where the athlete has described no gym**
 * (ADR 0060 §2: not a default rack, not an assumed bar).
 *
 * It is solved against the weight the program resolved rather than against
 * something typed, because nothing is typed here any more. #484 owns its
 * `Last time …` neighbour and the panel copy.
 */
function buildLiftPlateLine(
	exercise: LogExercise,
	load: WorkingLoad,
): string | null {
	if (load.kind !== 'resolved' || load.kg == null) return null
	if (!hasPlateSolve(load.loadKind)) return null
	const options = plateOptionsForKind(
		load.loadKind,
		exercise.plateContext?.options,
	)
	if (!options) return null
	const line = buildPlateLine({
		loadNumber: load.loadNumber,
		inventory: exercise.plateContext?.inventory ?? null,
		options,
	})
	if (!line) return null
	return line.kind === 'unavailable'
		? line.note
		: line.kind === 'nearest'
			? `${line.text} · ${line.note}`
			: line.text
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
	setLoggedValue,
	onFailure,
	lastCompletedAt,
	onSetLogged,
	onRestCancelled,
}: {
	exercise: LogExercise
	circle: SetCircle
	load: WorkingLoad
	setLoggedValue: (key: string, value: number | null) => void
	onFailure: (message: string | null) => void
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart, at: number) => void
	onRestCancelled: () => void
}) {
	const fetcher = useFetcher<typeof action>()
	/** The tap in flight: what to put back if it fails, and the rest it earns. */
	const pending = useRef<{
		at: number
		previous: number | null
		rest: RestStart | null
	} | null>(null)

	// **A save either lands or says so.** Anything that is not a success is a
	// failure, and the athlete needs to know *that* far more than they need the
	// reason: a set that appeared to save and did not is gone, and it feeds the
	// program fold, where a lost set reads as a missed rep and eventually cuts the
	// athlete's working weight.
	useEffect(() => {
		const inFlight = pending.current
		if (!inFlight || fetcher.state !== 'idle') return
		pending.current = null
		if (isSaved(fetcher.data)) {
			if (inFlight.rest) onSetLogged(inFlight.rest, inFlight.at)
		} else {
			setLoggedValue(circle.key, inFlight.previous)
			onFailure(messageOf(fetcher.data) ?? UNEXPLAINED_FAILURE)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the fetcher's answer is the signal
	}, [fetcher.state, fetcher.data])

	function tap() {
		if (load.kind !== 'resolved' || circle.target == null) return
		onFailure(null)
		// **The tap cycle is the presenter's**, so the component never decides what
		// a second tap on a five means.
		const next = circle.countsDown
			? nextSetReps(circle.logged, circle.target)
			: circle.logged == null
				? circle.target
				: ('cleared' as const)
		const at = Date.now()

		if (next === 'cleared') {
			setLoggedValue(circle.key, null)
			pending.current = { at, previous: circle.logged, rest: null }
			void fetcher.submit(
				{
					intent: 'clear-set',
					stepId: exercise.stepId,
					orderIndex: String(circle.orderIndex),
				},
				{ method: 'POST' },
			)
			// A cleared set has no rest to serve: the set it was resting from is gone.
			onRestCancelled()
			return
		}

		setLoggedValue(circle.key, next)
		const restTaken = lastCompletedAt.current
			? Math.round((at - lastCompletedAt.current) / 1000)
			: null
		pending.current = {
			at,
			previous: circle.logged,
			// **Rest is outcome-aware**, and the outcome is read off the count just
			// tapped rather than off a flag: a set that came up short rests longer,
			// because that is what the program says. The durations are the rest
			// module's; `180` and `300` are never written here.
			rest: restAfterSet({
				role: circle.role,
				missed: isMissedSet({
					outcome: 'completed',
					reps: circle.quantity === 'reps' ? next : null,
					prescribedReps: circle.quantity === 'reps' ? circle.target : null,
				}),
				prescribedSec: exercise.restBetweenSetsSec,
			}),
		}
		void fetcher.submit(
			{
				intent: 'log-set',
				stepId: exercise.stepId,
				orderIndex: String(circle.orderIndex),
				role: circle.role,
				loadKind: load.loadKind,
				loadNumber: load.loadNumber,
				[circle.quantity]: String(next),
				...(restTaken != null ? { restTakenSec: String(restTaken) } : {}),
			},
			{ method: 'POST' },
		)
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
 * A warm-up rung as a chip that toggles.
 *
 * **Interim, and #483's seam.** The chip and its write are here so the generated
 * ramp stays loggable now that the row it used to be is gone; the rest the last
 * rung starts, the earlier rung that cancels a running rest and the handoff's
 * exact chip metrics are that ticket's. The duration still comes from the rest
 * module — `restAfterSet` is told which rung is the last one and answers.
 */
function WarmupChipButton({
	exercise,
	chip,
	setLoggedValue,
	onFailure,
	lastCompletedAt,
	onSetLogged,
	onRestCancelled,
}: {
	exercise: LogExercise
	chip: WarmupChip
	setLoggedValue: (key: string, value: number | null) => void
	onFailure: (message: string | null) => void
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart, at: number) => void
	onRestCancelled: () => void
}) {
	const fetcher = useFetcher<typeof action>()
	const pending = useRef<{
		at: number
		previous: number | null
		rest: RestStart | null
	} | null>(null)

	useEffect(() => {
		const inFlight = pending.current
		if (!inFlight || fetcher.state !== 'idle') return
		pending.current = null
		if (isSaved(fetcher.data)) {
			if (inFlight.rest) onSetLogged(inFlight.rest, inFlight.at)
		} else {
			setLoggedValue(chip.key, inFlight.previous)
			onFailure(messageOf(fetcher.data) ?? UNEXPLAINED_FAILURE)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the fetcher's answer is the signal
	}, [fetcher.state, fetcher.data])

	function toggle() {
		onFailure(null)
		const at = Date.now()
		const count = chip.reps ?? chip.durationSec
		if (chip.on || count == null) {
			setLoggedValue(chip.key, null)
			pending.current = { at, previous: count ?? null, rest: null }
			void fetcher.submit(
				{
					intent: 'clear-set',
					stepId: exercise.stepId,
					orderIndex: String(chip.orderIndex),
				},
				{ method: 'POST' },
			)
			onRestCancelled()
			return
		}
		setLoggedValue(chip.key, count)
		const restTaken = lastCompletedAt.current
			? Math.round((at - lastCompletedAt.current) / 1000)
			: null
		pending.current = {
			at,
			previous: null,
			rest: restAfterSet({
				role: 'warmup',
				missed: false,
				isLastWarmupSet: chip.isLast,
				prescribedSec: exercise.restBetweenSetsSec,
			}),
		}
		void fetcher.submit(
			{
				intent: 'log-set',
				stepId: exercise.stepId,
				orderIndex: String(chip.orderIndex),
				role: 'warmup',
				loadKind: chip.loadKind,
				loadNumber: chip.loadNumber,
				...(chip.reps != null
					? { reps: String(chip.reps) }
					: { durationSec: String(chip.durationSec ?? '') }),
				...(restTaken != null ? { restTakenSec: String(restTaken) } : {}),
			},
			{ method: 'POST' },
		)
	}

	return (
		<button
			type="button"
			onClick={toggle}
			aria-pressed={chip.on}
			aria-label={chip.ariaLabel}
			className={cn(
				'text-body-2xs flex min-h-11 items-center rounded-xl border px-2.5 font-semibold',
				chip.on
					? 'bg-foreground/10 border-foreground/20 text-foreground'
					: 'border-foreground/10 text-muted-foreground',
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

	if (finished) return <OutcomePanel view={view} finished={finished} />

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

/**
 * **What you lift next time**, per lift.
 *
 * A **Stall Cut renders as a notice with its reason and offers nothing** — no
 * button, no choice, no "apply?". The drop already happened, and the athlete is
 * being told rather than asked. #485 gives this panel the handoff's shape; the
 * rule it must not lose is that the sentences come from the presenter's outcome
 * builder and are never restated here.
 */
function OutcomePanel({
	view,
	finished,
}: {
	view: Route.ComponentProps['loaderData']
	finished: { outcomes: OutcomeItem[]; programName: string | null }
}) {
	return (
		<section className="mt-6" aria-labelledby="what-next">
			<h2 id="what-next" className="text-h6 mb-3">
				What you lift next time
			</h2>
			{finished.outcomes.length === 0 ? (
				<p className="text-body-2xs text-muted-foreground">
					Session finished. This one is not part of a running program, so
					nothing advanced.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{finished.outcomes.map((item) => (
						<li
							key={item.key}
							{...(item.isNotice ? { role: 'status' as const } : {})}
							className={cn(
								'rounded-2xl border p-3',
								item.isNotice ? 'border-border bg-muted/40' : 'border-border',
							)}
						>
							<p className="text-body-xs">
								{item.label ? (
									<span className="font-medium">{item.label}: </span>
								) : null}
								<span className="font-medium">{item.headline}</span>
							</p>
							<p className="text-body-2xs text-muted-foreground mt-1">
								{item.reason}
							</p>
						</li>
					))}
				</ul>
			)}
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-body-2xs mt-3 inline-flex min-h-11 items-center underline"
				>
					{view.program.name}
				</Link>
			) : null}
		</section>
	)
}

/**
 * The lift's explanations, one tap behind its name: where the resolved load came
 * from, why one did not resolve and what would fix it, why there is no warm-up
 * ramp, which rack the plate line is solved against, and this lift over time.
 *
 * All of it is here rather than on the card because this screen's rule is **no
 * prose on the logging surface at all** — and because an athlete twenty seconds
 * after a heavy set is not reading a provenance sentence. #484 turns it into the
 * handoff's collapsible panel, in the athlete's own numbers.
 */
function ExerciseNotes({
	exercise,
	hasGymOnFile,
}: {
	exercise: LogExercise
	hasGymOnFile: boolean
}) {
	const resolution = exercise.rows
		.map((row) => buildResolutionDetail(row.resolvedLoad))
		.find((detail) => detail != null)

	return (
		<Popover>
			<PopoverTrigger
				className="text-muted-foreground focus-visible:ring-ring border-foreground/15 relative flex size-9 shrink-0 items-center justify-center rounded-full border outline-none after:absolute after:-inset-1 focus-visible:ring-2"
				aria-label={`About ${exercise.name}`}
			>
				<Icon name="question-mark-circled" size="md" />
			</PopoverTrigger>
			<PopoverContent className="w-[min(18rem,calc(100vw-2rem))]">
				<PopoverHeader>
					<PopoverTitle>{exercise.name}</PopoverTitle>
				</PopoverHeader>
				<div className="text-body-2xs text-muted-foreground space-y-2">
					{/* The lift's history and records, one tap behind its name — the
					    only entry point that does not require a running program, so a
					    session logged outside one still leads somewhere. Absent where
					    the step names no catalogued exercise: there is no history to
					    open for a lift the database does not know. */}
					{exercise.exerciseId ? (
						<p>
							<Link
								to={`/training/exercises/${exercise.exerciseId}`}
								className="underline"
							>
								This lift over time
							</Link>
						</p>
					) : null}
					{resolution ? (
						<p>
							{resolution.text}
							{resolution.fix ? ` ${resolution.fix}` : ''}
						</p>
					) : null}
					{exercise.warmupUnavailable ? (
						<p>{exercise.warmupUnavailable}</p>
					) : null}
					{exercise.plateContext ? (
						<p>
							Plates are solved against {exercise.plateContext.gymName}
							{exercise.plateContext.variantName
								? ` for ${exercise.plateContext.variantName}`
								: ''}
							.
						</p>
					) : hasGymOnFile ? null : (
						<p>
							<Link to="/settings/training/gym" className="underline">
								Tell us what your gym has
							</Link>{' '}
							and every weight gets a plate line.
						</p>
					)}
					{/* Stated as an absence rather than approximated: a tab the athlete
					    closed loses the timer, and the honest fix is a scheduled local
					    notification, which is not built. */}
					<p>The rest timer survives a locked phone, but not a closed tab.</p>
				</div>
			</PopoverContent>
		</Popover>
	)
}

/**
 * The rest timer as a persistent bar rather than a screen. Auto-started by
 * completing a set (a timer you have to start is a timer you forget), never
 * blocking the next set, and derived from a wall-clock deadline on every tick —
 * a suspended tab stops running intervals, and a decremented counter would come
 * back wrong.
 *
 * #482 pins it to the scroll container and gives it the handoff's shape; the
 * scroll area's bottom padding is already there so it cannot cover a circle.
 */
function RestTimerBar({
	rest,
	onAdjust,
	onDismiss,
}: {
	rest: { deadline: number; reason: RestReason } | null
	onAdjust: (sec: number) => void
	onDismiss: () => void
}) {
	const [, setTick] = useState(0)
	const deadline = rest?.deadline ?? null
	useEffect(() => {
		if (deadline == null) return
		const id = setInterval(() => setTick((n) => n + 1), 500)
		return () => clearInterval(id)
	}, [deadline])

	if (rest == null) return null
	const remaining = Math.round((rest.deadline - Date.now()) / 1000)
	const mins = Math.floor(Math.abs(remaining) / 60)
	const secs = Math.abs(remaining) % 60
	const clock = `${remaining < 0 ? '+' : ''}${mins}:${String(secs).padStart(2, '0')}`

	return (
		<div
			className="bg-card fixed inset-x-0 bottom-0 z-20 border-t px-4 py-2.5"
			role="status"
			aria-live="off"
		>
			<div className="container mx-auto flex max-w-2xl items-center gap-2">
				<Icon name="clock" size="md" className="text-muted-foreground" />
				<span
					className={cn(
						'text-body-md min-w-14 font-bold tabular-nums',
						remaining < 0 ? 'text-destructive' : 'text-primary',
					)}
				>
					{clock}
				</span>
				{/* The reason, in a phrase — a five-minute timer nobody can account for
				    reads as a bug. */}
				<span className="text-body-2xs text-muted-foreground flex-1 truncate">
					{remaining < 0 ? 'over your rest' : restReasonText(rest.reason)}
				</span>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onAdjust(-REST_ADJUST_STEP_SEC)}
				>
					−{REST_ADJUST_STEP_SEC}s
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => onAdjust(REST_ADJUST_STEP_SEC)}
				>
					+{REST_ADJUST_STEP_SEC}s
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					aria-label="Dismiss the rest timer"
					onClick={onDismiss}
				>
					<Icon name="cross-1" size="md" />
				</Button>
			</div>
		</div>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
