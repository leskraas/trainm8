/**
 * **The session runner** — the surface an athlete *runs* a strength workout on,
 * and the one a strength actual arrives through (ADR 0056, spec Slice 5).
 *
 * One scroll and a state machine rather than a wizard: exercises stacked, the
 * generated warm-up ramp above each one's working sets, the plate line under
 * every weight input, a rest bar that never blocks the next set, and one explicit
 * *"finish"* at the bottom that folds the log back into the program.
 *
 * ```
 * pre-session ──open──▶ warm-up ──▶ working sets ⇄ rest ──finish──▶ outcome
 *      │                                  ▲   │
 *      └─ loads resolved *now*            └───┘  (rest never blocks logging)
 * ```
 *
 * **No prose on the logging surface at all.** ADR 0028 was necessary and
 * demonstrably insufficient: #434 shipped a 4,283-line screen with 24
 * explanatory prose spans and the verdict was *"too much text, the flow and
 * design is too hard to follow."* Every explanation here lives one tap behind the
 * exercise name.
 *
 * A grid, not a Token Sentence. ADR 0027 makes the *prescription* a rendered
 * sentence and that is right: a prescription is read before the session, on the
 * couch, and `5 × 5 @ 100 kg · 3 min rest` reads well. The log is the same data
 * in the other mode — written during the session, one number at a time, twenty
 * seconds after a heavy set, one-thumbed. A sentence is the worst possible shape
 * for that: every edit is a popover, the numbers do not align into columns, and
 * the set-by-set diff against last time is invisible. So ADR 0027 governs the
 * prescription and stops at the log.
 *
 * The two-thumb path is three controls per row — load, reps, ✓. Everything else
 * (reps in reserve, the other side of a unilateral set, to-failure, abandoned) is
 * one tap away behind the row's own control, because asking for all of it on
 * every set of every session is how a logger becomes a chore.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, data, useFetcher } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
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
	type LogRow,
	clearLoggedSet,
	getStrengthLogView,
	saveLoggedSet,
} from '#app/utils/strength-log.server.ts'
import {
	type LoadValue,
	type SetRole,
	SET_ROLES,
	WARMUP_ORDER_INDEX_BASE,
	isMissedSet,
	isWarmupRampIndex,
	loadValueText,
} from '#app/utils/strength-log.ts'
import { programRunForSession } from '#app/utils/strength-program.server.ts'
import { finishStrengthSession } from '#app/utils/strength-runner.server.ts'
import { type Route } from './+types/sessions.$sessionId_.log.ts'
import {
	type OutcomeItem,
	buildOutcomePanel,
	buildPlateLine,
	buildRecordBanner,
	buildResolutionDetail,
	buildTargetText,
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
 * The load kinds this surface can author, as the athlete's own words.
 *
 * **Seven of the union's eight, and `perSide` is deliberately not one of them.**
 * It is not an oversight and it is not a rule that only unit tests reach — the
 * `perSide` branch of {@link calculatePlates} is live in the program's own
 * loadable rounding (`strength-program.server.ts` → `roundToLoadable`) and in the
 * warm-up ramp, which is where a dumbbell lift's working weight gets picked off
 * the rack. What is missing is the *picker*, and one reason remains — a property
 * of shipped code rather than of this file:
 *
 * **`LoadValue`'s `perSide` fixes `sides` at 2**, so storing one asserts both
 * hands were loaded. The corpus derives `perSide` from the equipment string
 * `dumbbell` alone (`exercise-corpus.ts`), and laterality is `null` on the ~700
 * rows nobody authored (ADR 0061) — so an offered per-hand option would let a
 * one-arm row be doubled on a claim nobody made.
 *
 * The second reason is gone: `buildPlateLine`'s gap sentence used to read
 * `totalWeight`, the doubled figure on a per-hand solve, so the line contradicted
 * the number in the box. It now reads `PlateSolution.achievedKg`, which is the
 * bell **per hand** — the same quantity the athlete typed.
 *
 * The path opens when the picker can read laterality off the exercise. Until then,
 * no athlete reaches `perSide` from here, and the words for a stored one live in
 * {@link LOAD_VALUE_KIND_WORDS}.
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

/** Which kinds need a number from the athlete, and what to call it. Null means
 * the kind is fully stated by its name. */
const LOAD_KIND_NUMBER: Record<LoadKind, string | null> = {
	external: 'kg',
	bodyweight: null,
	bodyweightPlus: '+ kg',
	assisted: 'kg off',
	stackLevel: 'level',
	band: null,
	unloaded: null,
}

/**
 * What a stored row was loaded with, in a phrase that fits mid-sentence. All
 * eight members of the union and not just the seven the picker offers: the words
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
	/** Present only when the athlete has touched *"How this is loaded"* — the one
	 * thing that licenses restating what a recorded set was loaded with. */
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

	// **Finishing is an explicit act**, which is how the spec resolves the
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
					error: `That set is recorded as ${LOAD_VALUE_KIND_WORDS[result.recordedKind]}. Change “How this is loaded” to log it as something else.`,
				},
				400,
			)
		}
		return data(
			{
				error:
					result.reason === 'not-strength'
						? 'That step is not a lift.'
						: // The count is refused in the same words as the load, one field
							// over: a weight with no count is not a set, and an accidental
							// tap would mint a record and stall the program. The way to
							// record a set that did not happen is to abandon it.
							result.reason === 'no-count'
							? 'Reps or seconds needs a number — or mark the set abandoned.'
							: 'That session is gone.',
			},
			400,
		)
	}
	// **The reason the feature exists** (ADR 0058's user story): the banner fires
	// the moment a record set is completed. Phrased server-side so only sentences
	// cross the wire, and scoped to *this* row's fetcher, so it appears on the set
	// that took the record and nowhere else.
	return {
		ok: true as const,
		id: result.id,
		record: buildRecordBanner(result.records),
	}
}

/** What the runner hands a row when a set is logged: how long to rest, and why. */
export type RestStart = { sec: number | null; reason: RestReason }

export default function SetLogRoute({ loaderData }: Route.ComponentProps) {
	const view = loaderData
	// One rest timer for the session, keyed off a wall-clock deadline rather than
	// a countdown integer, so backgrounding the tab cannot desynchronize it.
	const [rest, setRest] = useState<{
		deadline: number
		reason: RestReason
	} | null>(null)
	const lastCompletedAt = useRef<number | null>(null)

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
		<main className="container mx-auto max-w-2xl py-6 pb-28 md:py-8">
			<PageHeader
				title="Run your workout"
				back={{
					to: `/training/sessions/${view.sessionId}`,
					label: 'the session',
				}}
				className="mb-1"
			/>
			<p className="text-body-xs text-muted-foreground mb-6">
				{view.sessionTitle}
			</p>

			{view.status === 'completed' ? <AlreadyRecorded view={view} /> : null}

			{view.exercises.length === 0 ? (
				<p className="text-body-sm text-muted-foreground">
					This session has no lifts to log.
				</p>
			) : (
				<div className="space-y-8">
					{view.exercises.map((exercise) => (
						<ExerciseGrid
							key={exercise.stepId}
							exercise={exercise}
							bodyweightKg={view.bodyweightKg}
							hasGymOnFile={view.hasGymOnFile}
							lastCompletedAt={lastCompletedAt}
							onSetLogged={onSetLogged}
						/>
					))}
				</div>
			)}

			{view.exercises.length > 0 ? <FinishSession view={view} /> : null}

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
 * **Finish the workout, and hear what you lift next time.**
 *
 * The one control on this screen that is not a set. Explicitly *not* a "save
 * workout" button — every set is already persisted the moment it is logged — and
 * explicitly not an inference either: it writes `status: 'completed'` because the
 * athlete said the session was over, and it folds the log into the running
 * program server-side, where the pure engine re-reads `ExerciseSetLog` rather
 * than trusting anything this form posted.
 */
function FinishSession({ view }: { view: Route.ComponentProps['loaderData'] }) {
	const fetcher = useFetcher<typeof action>()
	const finished =
		fetcher.data && 'finished' in fetcher.data ? fetcher.data.finished : null
	const error =
		fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null

	if (finished) return <OutcomePanel view={view} finished={finished} />

	// Already recorded: no button. Tapping Finish twice is safe — the fold is
	// idempotent on `ProgramSessionApplication` and does not advance a second time
	// — but a live-looking control over a session that is already done is the
	// surface telling the athlete nothing happened yet, which is untrue. The
	// statement lives at the top of the screen (`AlreadyRecorded`), because the one
	// thing that matters must not be fifteen editable rows below the fold.
	if (view.status === 'completed') return null

	return (
		<div className="mt-10">
			<Button
				type="button"
				className="w-full"
				disabled={fetcher.state !== 'idle'}
				onClick={() =>
					void fetcher.submit({ intent: 'finish-session' }, { method: 'POST' })
				}
			>
				Finish workout
			</Button>
			{error ? (
				<p className="text-destructive text-body-xs mt-2" role="alert">
					{error}
				</p>
			) : null}
		</div>
	)
}

/**
 * **This session is already recorded**, said before the grid rather than under
 * it.
 *
 * A reload used to drop the outcome panel and put `Finish workout` back with
 * nothing on the screen saying the day was already folded in, so the surface read
 * as *"nothing has happened yet"* about a session that had. It sits above the
 * rows on purpose: the rows stay editable — a set logged after the fact is still
 * the truth about the day — and this is the one line the athlete needs before
 * touching them.
 */
function AlreadyRecorded({
	view,
}: {
	view: Route.ComponentProps['loaderData']
}) {
	return (
		<div
			role="status"
			className="border-border bg-muted/40 mb-6 rounded-md border p-3"
		>
			<p className="text-body-sm font-medium">Already recorded.</p>
			<p className="text-body-xs text-muted-foreground mt-1">
				You finished this workout. Your sets are the record, and editing one
				below still changes it — but nothing here is waiting to be filed.
			</p>
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-body-sm mt-2 inline-flex min-h-11 items-center underline"
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
 * being told rather than asked: an engine that silently drops the squat 10 % and
 * shows the new number is the failure the Load Recompute Notice pattern exists to
 * prevent, and one that turns the same drop into an offer is the other half of it.
 */
function OutcomePanel({
	view,
	finished,
}: {
	view: Route.ComponentProps['loaderData']
	finished: { outcomes: OutcomeItem[]; programName: string | null }
}) {
	return (
		<section className="mt-10" aria-labelledby="what-next">
			<h2 id="what-next" className="mb-3 text-base font-semibold">
				What you lift next time
			</h2>
			{finished.outcomes.length === 0 ? (
				<p className="text-body-sm text-muted-foreground">
					Session finished. This one is not part of a running program, so
					nothing advanced.
				</p>
			) : (
				<ul className="space-y-3">
					{finished.outcomes.map((item) => (
						<li
							key={item.key}
							{...(item.isNotice ? { role: 'status' as const } : {})}
							className={cn(
								'rounded-md border p-3',
								item.isNotice ? 'border-border bg-muted/40' : 'border-border',
							)}
						>
							<p className="text-body-sm">
								{item.label ? (
									<span className="font-medium">{item.label}: </span>
								) : null}
								<span className="font-medium">{item.headline}</span>
							</p>
							<p className="text-body-xs text-muted-foreground mt-1">
								{item.reason}
							</p>
						</li>
					))}
				</ul>
			)}
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-body-sm mt-3 inline-flex min-h-11 items-center underline"
				>
					{view.program.name}
				</Link>
			) : null}
		</section>
	)
}

/**
 * The load kind to open an exercise on, in order of what each source knows:
 * what was already logged against it, then what the prescription asks for, then
 * the **Load Semantics** the corpus authored for the movement itself.
 *
 * The third source is the one a bodyweight plank needs. A hold is prescribed as
 * seconds with no Load Target at all, so the first two say nothing — and opening
 * on `Weight (kg)` there refuses the set until the athlete either changes the
 * picker or invents a kilo, which is exactly what ADR 0056 §3 and ADR 0008's
 * Unavailable Metric forbid. A bodyweight movement states its own load, so the
 * grid asks nothing.
 */
function defaultLoadKind(exercise: LogExercise): LoadKind {
	const logged = exercise.rows.find((r) => r.logged?.load)?.logged?.load
	if (logged) {
		const kind = pickerKind(logged.kind)
		if (kind) return kind
	}
	const prescribed = exercise.rows.find((r) => r.prescribedLoad)?.prescribedLoad
	if (prescribed?.kind === 'bodyweight') {
		return prescribed.addedKg ? 'bodyweightPlus' : 'bodyweight'
	}
	return pickerKind(exercise.loadSemanticsKind) ?? 'external'
}

/**
 * A `LoadValue` kind as the picker can show it, or null where it cannot.
 *
 * `perSide` is the only gap, and it falls through to the caller's own default
 * rather than being mapped to something else — a per-hand 32 is not an external
 * 32. Why the gap is deliberate rather than unfinished, and what would close it,
 * is stated once at {@link LOAD_KINDS}.
 */
function pickerKind(kind: string | null | undefined): LoadKind | null {
	return kind != null && (LOAD_KINDS as readonly string[]).includes(kind)
		? (kind as LoadKind)
		: null
}

function ExerciseGrid({
	exercise,
	bodyweightKg,
	hasGymOnFile,
	lastCompletedAt,
	onSetLogged,
}: {
	exercise: LogExercise
	bodyweightKg: number | null
	hasGymOnFile: boolean
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart, at: number) => void
}) {
	// The load kind sits on the exercise, not the row: it is a property of the
	// equipment, and asking per set would ask the same question five times.
	// Persisting it against the exercise is the exercise database's job.
	//
	// **`null` until the athlete says otherwise**, and that distinction is the fix
	// for the reopened-session corruption. A default is a guess about a row nobody
	// has logged yet; it must never speak for a row that *has* been logged, which
	// already carries its own answer (`SetRow` reads it off `row.logged.load`).
	// Holding the picker as "chosen or not" instead of as a resolved kind is what
	// lets a recorded row keep its kind while an empty row still opens on a sensible
	// one — and what makes changing a recorded row's kind a deliberate act, since
	// only a real choice here is non-null.
	const [chosenKind, setChosenKind] = useState<LoadKind | null>(null)
	const [fillAll, setFillAll] = useState(0)
	/** What the picker shows, and what an unlogged row opens on. */
	const loadKind = chosenKind ?? defaultLoadKind(exercise)
	const needsBodyweight =
		loadKind === 'bodyweight' ||
		loadKind === 'bodyweightPlus' ||
		loadKind === 'assisted'

	return (
		<section aria-labelledby={`ex-${exercise.stepId}`}>
			<div className="mb-2 flex items-start gap-2">
				<h2
					id={`ex-${exercise.stepId}`}
					className="min-w-0 flex-1 text-base font-semibold"
				>
					{exercise.name}
				</h2>
				{/* Every explanation this exercise owes, one tap behind its name — never
				    a paragraph beside a control (#434's defect). */}
				<ExerciseNotes exercise={exercise} hasGymOnFile={hasGymOnFile} />
				{/* "Same as last time" at the exercise scope — the one that gets used. */}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setFillAll((n) => n + 1)}
				>
					Fill from last time
				</Button>
			</div>

			<div className="mb-3">
				<label
					htmlFor={`kind-${exercise.stepId}`}
					className="text-body-xs text-muted-foreground"
				>
					How this is loaded
				</label>
				<Select
					value={loadKind}
					onValueChange={(v) => setChosenKind(v as LoadKind)}
				>
					<SelectTrigger id={`kind-${exercise.stepId}`} className="mt-1 w-full">
						<SelectValue>
							{(chosen) => LOAD_KIND_LABELS[(chosen as LoadKind) ?? 'external']}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{LOAD_KINDS.map((kind) => (
							<SelectItem key={kind} value={kind}>
								{LOAD_KIND_LABELS[kind]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{/* The caveat sits on the number, in a phrase. */}
				{loadKind === 'stackLevel' || loadKind === 'band' ? (
					<p className="text-body-xs text-muted-foreground mt-1">
						No kilos — this progresses against itself only.
					</p>
				) : null}
				{needsBodyweight && bodyweightKg == null ? (
					<p className="text-body-xs text-muted-foreground mt-1">
						No bodyweight on file, so this set records no kilos.
					</p>
				) : null}
			</div>

			{exercise.warmupRows.length > 0 ? (
				<div className="mb-4">
					<p
						id={`warmup-${exercise.stepId}`}
						className="text-body-xs text-muted-foreground mb-2"
					>
						Warm-up
					</p>
					<ul
						className="space-y-3"
						aria-labelledby={`warmup-${exercise.stepId}`}
					>
						{exercise.warmupRows.map((row, index) => (
							<SetRow
								key={row.orderIndex}
								exercise={exercise}
								row={row}
								chosenKind={chosenKind}
								openingKind={loadKind}
								fillAll={0}
								// The pause is before the *last* rung, and nowhere else on the
								// ramp — the reference product's own behaviour.
								isLastWarmupSet={index === exercise.warmupRows.length - 1}
								lastCompletedAt={lastCompletedAt}
								onSetLogged={onSetLogged}
							/>
						))}
					</ul>
				</div>
			) : null}

			<ul className="space-y-3">
				{exercise.rows.map((row) => (
					<SetRow
						key={row.orderIndex}
						exercise={exercise}
						row={row}
						chosenKind={chosenKind}
						openingKind={loadKind}
						fillAll={fillAll}
						lastCompletedAt={lastCompletedAt}
						onSetLogged={onSetLogged}
					/>
				))}
			</ul>
		</section>
	)
}

/**
 * The exercise's explanations, one tap behind its name: where a resolved load
 * came from, why one did not resolve and what would fix it, why there is no
 * warm-up ramp, and which rack the plate line is solved against.
 *
 * All of it is here rather than on the rows because this screen's rule is **no
 * prose on the logging surface at all** — and because an athlete twenty seconds
 * after a heavy set is not reading a provenance sentence.
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
				className="text-muted-foreground focus-visible:ring-ring relative flex size-9 shrink-0 items-center justify-center rounded-md outline-none after:absolute after:-inset-1 focus-visible:ring-2"
				aria-label={`About ${exercise.name}`}
			>
				<Icon name="question-mark-circled" size="md" />
			</PopoverTrigger>
			<PopoverContent className="w-[min(18rem,calc(100vw-2rem))]">
				<PopoverHeader>
					<PopoverTitle>{exercise.name}</PopoverTitle>
				</PopoverHeader>
				<div className="text-body-xs text-muted-foreground space-y-2">
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

/** The ghost's number for the load field, in the units the chosen kind expects.
 * Only offered where the kinds agree — a kg ghost typed into a machine-level
 * field would be a fabricated level. */
function ghostNumber(row: LogRow, loadKind: LoadKind): string {
	const load = row.ghost?.load
	if (!load) return ''
	if (loadKind === 'external' && load.kind === 'external')
		return String(load.kg)
	if (loadKind === 'bodyweightPlus' && load.kind === 'bodyweightPlus')
		return String(load.addedKg)
	if (loadKind === 'assisted' && load.kind === 'assisted')
		return String(load.assistKg)
	if (loadKind === 'stackLevel' && load.kind === 'stackLevel')
		return String(load.level)
	return ''
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

/** What a failure says when the server did not say anything a row can print. */
const UNEXPLAINED_FAILURE = 'That set did not save — tap ✓ again.'

function SetRow({
	exercise,
	row,
	chosenKind,
	openingKind,
	fillAll,
	isLastWarmupSet = false,
	lastCompletedAt,
	onSetLogged,
}: {
	exercise: LogExercise
	row: LogRow
	/** What the athlete has actually picked for this exercise, or null if they have
	 * not touched the picker. Only a real choice may restate a recorded row. */
	chosenKind: LoadKind | null
	/** What a row with no answer of its own opens on — the picker's default. */
	openingKind: LoadKind
	fillAll: number
	isLastWarmupSet?: boolean
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart, at: number) => void
}) {
	const fetcher = useFetcher<typeof action>()
	const logged = row.logged
	const isWarmupRung = isWarmupRampIndex(row.orderIndex)
	/**
	 * **How this row is loaded, read off the row itself where the row knows.**
	 *
	 * The order is what fixed the reopened-session corruption: a recorded row's own
	 * stored kind outranks any default, because the default is a guess and the
	 * stored kind is what happened. A session whose Barbell Row rows hold
	 * `{"kind":"stackLevel","level":7}` used to reopen labelled `kg` with `7` in the
	 * box, and the next tap on ✓ — following the page's own invitation to edit a
	 * recorded set — posted that 7 as kilos and rewrote the row.
	 *
	 * So the kind of a logged row is **not** component state at all: it is derived
	 * from `row.logged.load` on every render and cannot drift from it. ADR 0056's
	 * "component state is right for today" reasoning was about an *unlogged* row
	 * picking a default; a logged row already has an answer, and only an explicit
	 * pick (`chosenKind`) overrides it.
	 */
	const recordedKind = pickerKind(logged?.load?.kind)
	const loadKind = chosenKind ?? recordedKind ?? openingKind
	/** Whether posting this row would restate what a recorded set was loaded with.
	 * The server refuses that unless it is said, and this is where it is said. */
	const changesRecordedKind = recordedKind != null && loadKind !== recordedKind
	const numberLabel = LOAD_KIND_NUMBER[loadKind]
	const [loadNumber, setLoadNumber] = useState(() =>
		logged?.load
			? String(loadNumberOf(logged.load) ?? '')
			: // A rung of the generated ramp opens on the weight the ramp says, because
				// that number *is* this session's prescription, generated a second ago
				// from the load that resolved. ADR 0056 §5's empty-input rule is about
				// the **ghost** — last time's numbers, which get logged by accident and
				// never noticed — and a rung is not last time's anything.
				//
				// **And only while it is a number this box takes.** `targetKg` is the
				// rung in the load's *own* semantics (`WarmupSet.statedKg`), so on a
				// weighted dip it is the kilos on the belt and not the athlete plus the
				// belt — the box is labelled `+ kg` and the two are not the same
				// quantity. A rung with nothing added is `0`, which is the base alone:
				// it prefills **nothing**, because `0` in a `+ kg` box is a set that
				// cannot be logged, and the total it used to prefill was worse — one tap
				// on a rung meaning *no plates at all* stored a fabricated 84 kg belt.
				row.warmupRung && row.warmupRung.targetKg > 0
				? String(row.warmupRung.targetKg)
				: '',
	)
	const [loadLabel, setLoadLabel] = useState(() => labelOf(logged?.load) ?? '')
	const [reps, setReps] = useState(() =>
		logged?.reps != null ? String(logged.reps) : '',
	)
	// A timed hold is counted in seconds, not reps. Which quantity the row asks
	// for comes off the prescription — a plank prescribed `3 × 45 s` has no rep
	// count to record, and offering a reps field there invites a fabricated one.
	const timed =
		row.prescribedDurationSec != null && row.prescribedReps == null
			? true
			: logged?.durationSec != null && logged.reps == null
	const [durationSec, setDurationSec] = useState(() =>
		logged?.durationSec != null ? String(logged.durationSec) : '',
	)
	// A generated rung is a `warmup` by construction — that is the one flag that is
	// stored rather than inferred, and it is what keeps the ramp out of records,
	// hard-set counts and the program's success predicate.
	const [role, setRole] = useState<SetRole>(
		logged?.role ?? (isWarmupRung ? 'warmup' : 'working'),
	)
	const [rir, setRir] = useState(() =>
		logged?.rir != null ? String(logged.rir) : '',
	)
	const [repsLeft, setRepsLeft] = useState(() =>
		logged?.repsLeft != null ? String(logged.repsLeft) : '',
	)
	const [toFailure, setToFailure] = useState(logged?.toFailure ?? false)
	const formRef = useRef<HTMLFormElement>(null)
	/** The tap that is in flight, and the rest it earns if the save lands. */
	const pending = useRef<{ at: number; rest: RestStart } | null>(null)
	/** A save came back and was not a success, and carried no sentence to show. */
	const [unexplainedFailure, setUnexplainedFailure] = useState(false)

	// **A save either lands or says so.** The action answers with a tagged union,
	// but this row does not trust it to: anything that is not a success is a
	// failure, and the athlete needs to know *that* far more than they need the
	// reason. Twenty seconds after a heavy set they move on, and a set that
	// appeared to save and did not is gone — and it feeds the program fold, where a
	// lost set reads as a missed rep and eventually cuts their working weight.
	useEffect(() => {
		const inFlight = pending.current
		if (!inFlight || fetcher.state !== 'idle') return
		pending.current = null
		if (isSaved(fetcher.data)) {
			onSetLogged(inFlight.rest, inFlight.at)
		} else {
			// A refusal normally carries its own sentence; a response this row cannot
			// read as either is the case that used to render nothing at all.
			setUnexplainedFailure(messageOf(fetcher.data) == null)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the fetcher's answer is the signal
	}, [fetcher.state, fetcher.data])

	// Adopt what is already in the inputs on hydration. The same keystrokes that
	// used to be posted as empty are also the ones the plate line and the rest
	// arithmetic read, so state and screen are made to agree the moment this row
	// starts listening.
	useEffect(() => {
		const form = formRef.current
		if (!form) return
		const value = (name: string) =>
			form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value ?? ''
		setLoadNumber((current) => value('loadNumber') || current)
		setLoadLabel((current) => value('loadLabel') || current)
		setReps((current) => value('reps') || current)
		setDurationSec((current) => value('durationSec') || current)
	}, [])

	// The per-exercise "fill from last time" reaches every row at once. It fills
	// the inputs and stops there: submitting on the athlete's behalf is how a
	// ghost gets logged as a set nobody did.
	useEffect(() => {
		if (fillAll === 0) return
		fillFromGhost()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the counter is the signal
	}, [fillAll])

	function fillFromGhost() {
		const n = ghostNumber(row, loadKind)
		if (n) setLoadNumber(n)
		if (row.ghost?.reps != null) setReps(String(row.ghost.reps))
		if (row.ghost?.durationSec != null)
			setDurationSec(String(row.ghost.durationSec))
	}

	/**
	 * Send this row, reading every number **off the form** rather than out of React
	 * state.
	 *
	 * This is the fix for *a set tapped too soon that silently did not save*. The
	 * inputs are controlled, so a keystroke that lands before this route has
	 * hydrated sits in the DOM with no `onChange` listening to record it: the row
	 * showed `100 kg × 5`, the state still said `''`, and the tap posted
	 * `loadNumber=` — which the action rightly refuses, about a number the athlete
	 * can see on the screen. Reading the form makes what is posted what is
	 * displayed in every hydration state, and it is why the whole row is a real
	 * `fetcher.Form`: with no JS attached yet the ✓ is still a real submit
	 * button posting the same named fields to the same action, instead of a control
	 * that does nothing at all.
	 */
	function submit(
		form: HTMLFormElement | null,
		extra: Record<string, string> = {},
	) {
		if (!form) return
		const formData = new FormData(form)
		for (const [name, value] of Object.entries(extra)) {
			formData.set(name, value)
		}
		// The tap, not the answer: the rest deadline is anchored here so a slow save
		// cannot shorten the athlete's rest (see `onSetLogged`).
		const at = Date.now()
		const restTaken = lastCompletedAt.current
			? Math.round((at - lastCompletedAt.current) / 1000)
			: null
		if (restTaken != null) formData.set('restTakenSec', String(restTaken))

		const postedReps = String(formData.get('reps') ?? '')
		// **Rest is outcome-aware**, and the outcome is read off the number just
		// typed rather than off a flag: a set that came up short rests longer,
		// because that is what the program says and not what the UI prefers. It is
		// held until the save lands — a rest bar counting down for a set the server
		// refused is the surface telling the athlete the set is in when it is not.
		pending.current = {
			at,
			rest: restAfterSet({
				role,
				missed: isMissedSet({
					outcome: extra.abandoned ? 'abandoned' : 'completed',
					reps: postedReps === '' ? null : Number(postedReps),
					prescribedReps: row.prescribedReps,
				}),
				isLastWarmupSet,
				prescribedSec: exercise.restBetweenSetsSec,
			}),
		}
		setUnexplainedFailure(false)
		void fetcher.submit(formData, { method: 'POST' })
	}

	const missed = logged
		? isMissedSet({
				outcome: logged.outcome,
				reps: logged.reps,
				prescribedReps: row.prescribedReps,
			})
		: false
	const isDone = logged != null
	const prescription = buildTargetText(row)
	/**
	 * **The plate line, or nothing at all.**
	 *
	 * Two conditions, and both of them are about the line not contradicting the row
	 * it sits under:
	 *
	 * 1. **The kind being loaded has to have plates** ({@link hasPlateSolve}). The
	 *    solver would refuse a stack level anyway, but its refusal is a *sentence*,
	 *    and a sentence about plates two lines from "No kilos recorded" is the
	 *    surface arguing with itself about the same set.
	 * 2. **A recorded row is described, never argued with.** While the picker says
	 *    something the stored row does not, this row is mid-restatement and gets no
	 *    line at all. Flipping the picker to `kg` above a set stored as
	 *    `stackLevel 7` used to preview *"empty bar · Your gym makes 20 kg, not
	 *    7 kg."* beside that same row's "No kilos recorded" — the 7 in the box is
	 *    an ordinal until a save says otherwise. The line comes back the moment the
	 *    restatement is saved, which is when it is true.
	 *
	 * And the options are built by {@link plateOptionsForKind} rather than spread:
	 * the picker is the athlete's live answer to *"how is this loaded"* and it
	 * outranks the variant's default — but a variant's bar and pair-multiplier are
	 * that variant's *geometry*, and carrying them into another kind's solve is what
	 * answered a dip belt with a 20 kg bar.
	 */
	const restatingRecordedKind =
		logged?.load != null && logged.load.kind !== loadKind
	const plateOptions =
		restatingRecordedKind || !hasPlateSolve(loadKind)
			? null
			: plateOptionsForKind(loadKind, exercise.plateContext?.options)
	const plateLine = plateOptions
		? buildPlateLine({
				loadNumber,
				inventory: exercise.plateContext?.inventory ?? null,
				options: plateOptions,
			})
		: null
	const error =
		messageOf(fetcher.data) ?? (unexplainedFailure ? UNEXPLAINED_FAILURE : null)
	// The PR banner. It rides on **this row's** fetcher, so it belongs to the set
	// that took the record; a second tap on the same row replaces the answer
	// rather than stacking one, and the upsert underneath means the re-derivation
	// reads the same row and says the same thing.
	const record =
		fetcher.data && 'record' in fetcher.data ? fetcher.data.record : null
	// A rung is numbered within the ramp, not within the index band it lives in:
	// "W1" and never "Set 1001".
	const positionLabel = isWarmupRung
		? `W${row.orderIndex - WARMUP_ORDER_INDEX_BASE + 1}`
		: String(row.orderIndex + 1)
	const setLabel = isWarmupRung
		? `warm-up ${positionLabel}`
		: `set ${positionLabel}`

	return (
		<li
			className={cn(
				'rounded-md border p-3',
				isDone && logged?.outcome === 'abandoned'
					? 'border-muted bg-muted/40'
					: isDone
						? 'border-primary/40 bg-primary/5'
						: 'border-border',
			)}
			data-set-row={row.orderIndex}
		>
			{/* A real form, so the ✓ works before this route has hydrated and so the
			    numbers that get posted are the numbers on the screen. `onSubmit` takes
			    over once JS is listening, to add the rest taken and to keep the row in
			    place; without JS the same fields post to the same action. */}
			<fetcher.Form
				method="POST"
				ref={formRef}
				onSubmit={(event) => {
					event.preventDefault()
					submit(event.currentTarget)
				}}
			>
				{/* What the athlete never types: the row's identity, and the answers the
				    popover collects. Every one of them is written from the first render,
				    server-side included, so none of them can be the empty field a save
				    is refused for. */}
				<input type="hidden" name="intent" value="log-set" />
				<input type="hidden" name="stepId" value={exercise.stepId} />
				<input type="hidden" name="orderIndex" value={row.orderIndex} />
				<input type="hidden" name="role" value={role} />
				<input type="hidden" name="loadKind" value={loadKind} />
				{/* **Restating a recorded set's load kind is a deliberate act.** This
				    field is written only when the athlete has picked a kind that differs
				    from what the row already says, and without it the server refuses the
				    save rather than rewriting history. It is what keeps "edit the reps of
				    a set logged on a machine" from turning level 7 into 7 kg. */}
				{changesRecordedKind ? (
					<input type="hidden" name="changeLoadKind" value="on" />
				) : null}
				<input type="hidden" name="rir" value={rir} />
				<input type="hidden" name="repsLeft" value={repsLeft} />
				{toFailure ? <input type="hidden" name="toFailure" value="on" /> : null}

				<div className="flex items-end gap-2">
					<span className="text-body-xs text-muted-foreground w-8 shrink-0 pb-2.5">
						{positionLabel}
					</span>

					{numberLabel ? (
						<div className="min-w-0 flex-1">
							<label
								htmlFor={`load-${exercise.stepId}-${row.orderIndex}`}
								className="text-body-xs text-muted-foreground"
							>
								{numberLabel}
							</label>
							<Input
								id={`load-${exercise.stepId}-${row.orderIndex}`}
								name="loadNumber"
								type="number"
								inputMode="decimal"
								step="any"
								value={loadNumber}
								onChange={(e) => setLoadNumber(e.currentTarget.value)}
								onFocus={(e) => e.currentTarget.select()}
								className="mt-1"
							/>
						</div>
					) : null}

					{loadKind === 'band' ? (
						<div className="min-w-0 flex-1">
							<label
								htmlFor={`band-${exercise.stepId}-${row.orderIndex}`}
								className="text-body-xs text-muted-foreground"
							>
								band
							</label>
							<Input
								id={`band-${exercise.stepId}-${row.orderIndex}`}
								name="loadLabel"
								value={loadLabel}
								onChange={(e) => setLoadLabel(e.currentTarget.value)}
								className="mt-1"
							/>
						</div>
					) : null}

					<div className="min-w-0 flex-1">
						<label
							htmlFor={`qty-${exercise.stepId}-${row.orderIndex}`}
							className="text-body-xs text-muted-foreground"
						>
							{timed ? 'seconds' : 'reps'}
						</label>
						<Input
							id={`qty-${exercise.stepId}-${row.orderIndex}`}
							// A hold is counted in seconds, so the quantity posts under the
							// name it is: `durationSec`, never a rep count.
							name={timed ? 'durationSec' : 'reps'}
							type="number"
							inputMode="numeric"
							value={timed ? durationSec : reps}
							onChange={(e) =>
								timed
									? setDurationSec(e.currentTarget.value)
									: setReps(e.currentTarget.value)
							}
							onFocus={(e) => e.currentTarget.select()}
							className="mt-1"
						/>
					</div>

					<Button
						// A submit button and not a click handler: the tap has to mean
						// something in the window before this route hydrates, which is the
						// window the athlete's first tap lands in.
						type="submit"
						size="icon"
						variant={isDone ? 'default' : 'outline'}
						// ~44px effective target on a 36px control (ADR 0028).
						className="relative shrink-0 after:absolute after:-inset-1"
						aria-label={
							isDone
								? `Log ${setLabel} again — it is already logged`
								: `Log ${setLabel}`
						}
						// **The between-sets double-tap.** Disabled in flight, and the save
						// itself is an upsert on `(sessionId, stepId, orderIndex)`, so neither
						// half of the interaction can produce two rows for one set.
						disabled={fetcher.state !== 'idle'}
					>
						<Icon name="check" size="md" />
					</Button>

					<RowMore
						exercise={exercise}
						row={row}
						role={role}
						setRole={setRole}
						rir={rir}
						setRir={setRir}
						repsLeft={repsLeft}
						setRepsLeft={setRepsLeft}
						toFailure={toFailure}
						setToFailure={setToFailure}
						isDone={isDone}
						setLabel={setLabel}
						onAbandon={() => submit(formRef.current, { abandoned: 'on' })}
						onClear={() =>
							void fetcher.submit(
								{
									intent: 'clear-set',
									stepId: exercise.stepId,
									orderIndex: String(row.orderIndex),
								},
								{ method: 'POST' },
							)
						}
					/>
				</div>

				<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-10">
					{/* The plate line: a passive annotation under the row, muted, updating
				    as you type. It sits in this wrapping line rather than under the kg
				    input because a third of a 390 px row truncated it — and the half
				    being cut was the refusal ("your gym makes 20 kg, not 20.3 kg"),
				    which is the half that matters. Here it wraps, and on most rows it
				    shares a line with the target instead of adding one. */}
					{plateLine ? (
						<span
							className="text-body-xs text-muted-foreground"
							data-plate-line
						>
							{plateLine.kind === 'unavailable'
								? plateLine.note
								: plateLine.kind === 'nearest'
									? `${plateLine.text} · ${plateLine.note}`
									: plateLine.text}
						</span>
					) : null}
					{prescription ? (
						<span className="text-body-xs text-muted-foreground">
							Target {prescription}
						</span>
					) : null}
					{/* The ghost is text, and filling it is an explicit tap — an input
				    pre-filled with last time's numbers gets logged by accident. */}
					{row.ghost ? (
						<button
							type="button"
							onClick={fillFromGhost}
							className="text-body-xs text-muted-foreground underline decoration-dotted"
						>
							Last time {loadValueText(row.ghost.load)}
							{row.ghost.reps != null
								? ` × ${row.ghost.reps}`
								: // A timed hold's quantity is seconds, so the ghost says seconds.
									row.ghost.durationSec != null
									? ` × ${row.ghost.durationSec} s`
									: ''}
							{row.ghost.extrapolated ? ' (beyond last time)' : ''}
						</button>
					) : null}
					{missed ? (
						<span className="text-body-xs text-muted-foreground">
							Under target
						</span>
					) : null}
					{logged?.outcome === 'abandoned' ? (
						<span className="text-body-xs text-muted-foreground">
							Abandoned
						</span>
					) : null}
					{logged?.toFailure ? (
						<span className="text-body-xs text-muted-foreground">
							To failure
						</span>
					) : null}
					{logged?.role === 'warmup' ? (
						<span className="text-body-xs text-muted-foreground">Warm-up</span>
					) : null}
					{logged && logged.effectiveKg == null && logged.load ? (
						<span className="text-body-xs text-muted-foreground">
							No kilos recorded
						</span>
					) : null}
				</div>

				{record ? (
					<div
						className="border-primary/40 bg-primary/10 mt-2 ml-10 flex items-start gap-2 rounded-md border px-2.5 py-1.5"
						data-record-banner
						// Announced, because the athlete's eyes are on the bar and not the
						// screen when the set that took the record finishes.
						role="status"
					>
						<Icon
							name="trophy"
							size="sm"
							aria-hidden="true"
							className="text-primary mt-0.5 shrink-0"
						/>
						<div className="min-w-0">
							{record.lines.map((line) => (
								<p key={line} className="text-body-xs text-foreground">
									{line}
								</p>
							))}
						</div>
					</div>
				) : null}

				{/* Every refusal lands here, in words. */}
				{error ? (
					<p className="text-destructive text-body-xs mt-1 pl-10" role="alert">
						{error}
					</p>
				) : null}
			</fetcher.Form>
		</li>
	)
}

function loadNumberOf(load: LoadValue): number | null {
	switch (load.kind) {
		case 'external':
		case 'perSide':
			return load.kg
		case 'bodyweightPlus':
			return load.addedKg
		case 'assisted':
			return load.assistKg
		case 'stackLevel':
			return load.level
		default:
			return null
	}
}

function labelOf(load: LoadValue | null | undefined): string | null {
	if (!load) return null
	if (load.kind === 'band') return load.band
	if (load.kind === 'stackLevel') return load.label ?? null
	return null
}

const RIR_CHIPS = [0, 1, 2, 3, 4] as const

/** Everything a set may carry and usually does not, behind one tap. */
function RowMore({
	exercise,
	row,
	role,
	setRole,
	rir,
	setRir,
	repsLeft,
	setRepsLeft,
	toFailure,
	setToFailure,
	isDone,
	setLabel,
	onAbandon,
	onClear,
}: {
	exercise: LogExercise
	row: LogRow
	role: SetRole
	setRole: (r: SetRole) => void
	rir: string
	setRir: (v: string) => void
	repsLeft: string
	setRepsLeft: (v: string) => void
	toFailure: boolean
	setToFailure: (v: boolean) => void
	isDone: boolean
	/** "set 3" or "warm-up W2" — the row's own name, so every control in here
	 * says which row it belongs to. */
	setLabel: string
	onAbandon: () => void
	onClear: () => void
}) {
	return (
		<Popover>
			<PopoverTrigger
				// ~44px effective target on a smaller glyph (ADR 0028).
				className="text-muted-foreground focus-visible:ring-ring relative flex size-9 shrink-0 items-center justify-center rounded-md outline-none after:absolute after:-inset-1 focus-visible:ring-2"
				aria-label={`More for ${setLabel}`}
			>
				<Icon name="dots-horizontal" size="md" />
			</PopoverTrigger>
			{/* Never a fixed 16rem: at 390px a fixed width plus the trigger's
			    offset pushes the page sideways (ADR 0028's litmus test). */}
			<PopoverContent className="w-[min(16rem,calc(100vw-2rem))]">
				<PopoverHeader>
					<PopoverTitle className="capitalize">{setLabel}</PopoverTitle>
				</PopoverHeader>
				<div className="space-y-3">
					<div>
						<span className="text-body-xs text-muted-foreground">Role</span>
						<div className="mt-1 flex flex-wrap gap-1">
							{SET_ROLES.map((r) => (
								<Button
									key={r}
									type="button"
									size="sm"
									variant={role === r ? 'default' : 'outline'}
									onClick={() => setRole(r)}
								>
									{r === 'warmup'
										? 'Warm-up'
										: r === 'backoff'
											? 'Back-off'
											: 'Working'}
								</Button>
							))}
						</div>
					</div>

					<div>
						<span className="text-body-xs text-muted-foreground">
							Reps in reserve
						</span>
						<div className="mt-1 flex flex-wrap gap-1">
							{RIR_CHIPS.map((n) => (
								<Button
									key={n}
									type="button"
									size="sm"
									variant={rir === String(n) ? 'default' : 'outline'}
									onClick={() => setRir(rir === String(n) ? '' : String(n))}
								>
									{n}
								</Button>
							))}
						</div>
					</div>

					{/* The other side's reps, offered on **three** answers and not two
					    (ADR 0061). A stated bilateral movement — `unilateral: false` —
					    does not get the field at all: a barbell back squat has no other
					    side, and asking for one is the same defect as the raw enum. A
					    stated unilateral movement gets it named flatly, because there
					    *is* another side. And a NULL — nobody has stated this movement's
					    laterality — keeps the conditional phrasing and keeps the field:
					    an absence is not a "no", and dropping the field on NULL would
					    silence a genuinely one-armed lift nobody has authored. */}
					{exercise.unilateral === false ? null : (
						<div>
							<label
								htmlFor={`repsleft-${exercise.stepId}-${row.orderIndex}`}
								className="text-body-xs text-muted-foreground"
							>
								{exercise.unilateral
									? 'Reps on the other side'
									: 'Other side, if this was one-armed'}
							</label>
							<Input
								id={`repsleft-${exercise.stepId}-${row.orderIndex}`}
								type="number"
								inputMode="numeric"
								value={repsLeft}
								onChange={(e) => setRepsLeft(e.currentTarget.value)}
								className="mt-1"
							/>
						</div>
					)}

					<Button
						type="button"
						size="sm"
						variant={toFailure ? 'default' : 'outline'}
						onClick={() => setToFailure(!toFailure)}
						className="w-full"
					>
						{toFailure ? 'To failure ✓' : 'Went to failure'}
					</Button>

					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onAbandon}
						className="w-full"
					>
						Racked it — abandoned
					</Button>

					{isDone ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={onClear}
							className="w-full"
						>
							Un-log this set
						</Button>
					) : null}
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
			className="bg-background fixed inset-x-0 bottom-0 z-20 border-t px-4 py-2"
			role="status"
			aria-live="off"
		>
			<div className="container mx-auto flex max-w-2xl items-center gap-2">
				<Icon name="clock" size="md" className="text-muted-foreground" />
				<span className="text-base font-semibold tabular-nums">{clock}</span>
				{/* The reason, in a phrase — a five-minute timer nobody can account for
				    reads as a bug. */}
				<span className="text-body-xs text-muted-foreground flex-1 truncate">
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
