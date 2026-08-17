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
import { finishStrengthSession } from '#app/utils/strength-runner.server.ts'
import { type Route } from './+types/sessions.$sessionId_.log.ts'
import {
	type OutcomeItem,
	buildOutcomePanel,
	buildPlateLine,
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
	return view
}

/**
 * The load kinds this surface can author, as the athlete's own words. The union
 * has eight members (`strength-log.ts`); `perSide` is dropped from the picker
 * only because a per-hand load also needs to know whether *this* exercise is
 * two-handed, which is a property of the exercise and arrives with the exercise
 * database. Nothing about the stored shape assumes it is absent.
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
	})
	if (!result.ok) {
		return data(
			{
				error:
					result.reason === 'not-strength'
						? 'That step is not a lift.'
						: 'That session is gone.',
			},
			400,
		)
	}
	return { ok: true as const, id: result.id }
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

	function onSetLogged(started: RestStart) {
		const now = Date.now()
		lastCompletedAt.current = now
		setRest(
			started.sec
				? { deadline: now + started.sec * 1000, reason: started.reason }
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
			{view.status === 'completed' && !error ? (
				<p className="text-body-xs text-muted-foreground mt-2">
					Finished. Your sets are the record; this only marks the day.
				</p>
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

/** The load kind to open an exercise on: whatever its prescription implies, so
 * a bodyweight prescription does not greet the athlete with a kg field. */
function defaultLoadKind(exercise: LogExercise): LoadKind {
	const logged = exercise.rows.find((r) => r.logged?.load)?.logged?.load
	if (logged && (LOAD_KINDS as readonly string[]).includes(logged.kind)) {
		return logged.kind as LoadKind
	}
	const prescribed = exercise.rows.find((r) => r.prescribedLoad)?.prescribedLoad
	if (prescribed?.kind === 'bodyweight') {
		return prescribed.addedKg ? 'bodyweightPlus' : 'bodyweight'
	}
	return 'external'
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
	onSetLogged: (started: RestStart) => void
}) {
	// The load kind sits on the exercise, not the row: it is a property of the
	// equipment, and asking per set would ask the same question five times.
	// Persisting it against the exercise is the exercise database's job.
	const [loadKind, setLoadKind] = useState<LoadKind>(() =>
		defaultLoadKind(exercise),
	)
	const [fillAll, setFillAll] = useState(0)
	const numberLabel = LOAD_KIND_NUMBER[loadKind]
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
					onValueChange={(v) => setLoadKind(v as LoadKind)}
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
								loadKind={loadKind}
								numberLabel={numberLabel}
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
						loadKind={loadKind}
						numberLabel={numberLabel}
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

function SetRow({
	exercise,
	row,
	loadKind,
	numberLabel,
	fillAll,
	isLastWarmupSet = false,
	lastCompletedAt,
	onSetLogged,
}: {
	exercise: LogExercise
	row: LogRow
	loadKind: LoadKind
	numberLabel: string | null
	fillAll: number
	isLastWarmupSet?: boolean
	lastCompletedAt: React.MutableRefObject<number | null>
	onSetLogged: (started: RestStart) => void
}) {
	const fetcher = useFetcher<typeof action>()
	const logged = row.logged
	const isWarmupRung = isWarmupRampIndex(row.orderIndex)
	const [loadNumber, setLoadNumber] = useState(() =>
		logged?.load
			? String(loadNumberOf(logged.load) ?? '')
			: // A rung of the generated ramp opens on the weight the ramp says, because
				// that number *is* this session's prescription, generated a second ago
				// from the load that resolved. ADR 0056 §5's empty-input rule is about
				// the **ghost** — last time's numbers, which get logged by accident and
				// never noticed — and a rung is not last time's anything.
				row.warmupRung
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

	function submit(extra: Record<string, string> = {}) {
		const restTaken = lastCompletedAt.current
			? Math.round((Date.now() - lastCompletedAt.current) / 1000)
			: null
		void fetcher.submit(
			{
				intent: 'log-set',
				stepId: exercise.stepId,
				orderIndex: String(row.orderIndex),
				role,
				loadKind,
				loadNumber,
				loadLabel,
				reps,
				durationSec,
				repsLeft,
				rir,
				...(toFailure ? { toFailure: 'on' } : {}),
				...(restTaken != null ? { restTakenSec: String(restTaken) } : {}),
				...extra,
			},
			{ method: 'POST' },
		)
		// **Rest is outcome-aware**, and the outcome is read off the number just
		// typed rather than off a flag: a set that came up short rests longer,
		// because that is what the program says and not what the UI prefers.
		onSetLogged(
			restAfterSet({
				role,
				missed: isMissedSet({
					outcome: extra.abandoned ? 'abandoned' : 'completed',
					reps: reps === '' ? null : Number(reps),
					prescribedReps: row.prescribedReps,
				}),
				isLastWarmupSet,
				prescribedSec: exercise.restBetweenSetsSec,
			}),
		)
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
	const plateLine = buildPlateLine({
		loadNumber,
		inventory: exercise.plateContext?.inventory ?? null,
		options: {
			...exercise.plateContext?.options,
			// The picker is the athlete's live answer to *"how is this loaded"* and it
			// outranks the variant's default: they are the one looking at the machine.
			kind: loadKind,
		},
	})
	const error =
		fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null
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
							type="number"
							inputMode="decimal"
							step="any"
							value={loadNumber}
							onChange={(e) => setLoadNumber(e.currentTarget.value)}
							onFocus={(e) => e.currentTarget.select()}
							className="mt-1"
						/>
						{/* The plate line: a passive annotation under the input, muted,
						    updating as you type. Never a screen and never a sentence. */}
						{plateLine ? (
							<p
								className="text-body-xs text-muted-foreground mt-0.5 truncate"
								data-plate-line
							>
								{plateLine.kind === 'unavailable'
									? plateLine.note
									: plateLine.kind === 'nearest'
										? `${plateLine.text} · ${plateLine.note}`
										: plateLine.text}
							</p>
						) : null}
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
					type="button"
					size="icon"
					variant={isDone ? 'default' : 'outline'}
					// ~44px effective target on a 36px control (ADR 0028).
					className="relative shrink-0 after:absolute after:-inset-1"
					aria-label={
						isDone
							? `Log ${setLabel} again — it is already logged`
							: `Log ${setLabel}`
					}
					onClick={() => submit()}
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
					onAbandon={() => submit({ abandoned: 'on' })}
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
					<span className="text-body-xs text-muted-foreground">Abandoned</span>
				) : null}
				{logged?.toFailure ? (
					<span className="text-body-xs text-muted-foreground">To failure</span>
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

			{error ? (
				<p className="text-destructive text-body-xs mt-1 pl-10" role="alert">
					{error}
				</p>
			) : null}
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

					<div>
						<label
							htmlFor={`repsleft-${exercise.stepId}-${row.orderIndex}`}
							className="text-body-xs text-muted-foreground"
						>
							Other side, if this was one-armed
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
