import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { z } from 'zod'
import {
	ChartFigure,
	useChartInspect,
	type ChartDataTableModel,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, TextareaField } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { RouteSketch } from '#app/components/route-sketch.tsx'
import { ScoreStanza } from '#app/components/score-stanza.tsx'
import { ShapeStrip } from '#app/components/shape-strip.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { type ActivityStream, isNum } from '#app/utils/activity-stream.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatClockDuration,
	formatDayMonth,
	formatDuration,
	formatDistance,
	formatLoad,
	formatPace,
	formatSigned,
	formatSpeed,
} from '#app/utils/format.ts'
import {
	type DisciplineThresholdMap,
	sessionMetricTarget,
	targetText,
	unresolvedThresholdReasons,
} from '#app/utils/intensity-target.ts'
import { type AdherenceBand } from '#app/utils/load/adherence.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type VsLastMetric,
	buildVsLastComparison,
} from '#app/utils/session-comparison.ts'
import { upsertSessionLog } from '#app/utils/session-log.server.ts'
import { useSessionPresenter } from '#app/utils/session-presenter.ts'
import {
	deriveSessionProfile,
	expandWorkoutSteps,
	parseRecordingPhaseBars,
} from '#app/utils/session-profile.ts'
import { buildReviewComparison } from '#app/utils/session-review.ts'
import { deriveShapeStrip } from '#app/utils/shape-strip.ts'
import { isDetectionDiscipline } from '#app/utils/structure-detection/types.ts'
import {
	type SessionDetail,
	type SimilarSession,
	getDisciplineThresholds,
	getLastSimilarSession,
	getSessionByIdForUser,
} from '#app/utils/training.server.ts'
import {
	getDisciplineLabel,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	deriveWorkoutNotation,
	workoutToNotationInput,
} from '#app/utils/workout-notation.ts'
import {
	INTENT_LABELS,
	type WorkoutIntent,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
import {
	deleteWorkoutSession,
	markSessionMissed,
	updateWorkoutSession,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.$sessionId.ts'
import { ScheduledWorkoutSentence } from './__workout-detail-editor.tsx'

const SessionLogSchema = z.object({
	content: z.string().min(1, 'Reflection is required'),
	rpe: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : null))
		.pipe(
			z
				.number()
				.int('RPE must be a whole number')
				.min(1, 'RPE must be between 1 and 10')
				.max(10, 'RPE must be between 1 and 10')
				.nullable(),
		),
})

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.session
			? `${data.session.workout?.title ?? 'Recording'} | Workout Details | Trainm8`
			: 'Workout Details | Trainm8',
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	// Thresholds resolve the workout's authored Intensity Target into the same
	// concrete headline target the home surface shows (#130), so the two agree.
	// "vs last time" (PRD #129): how this completed session compares to the last
	// similar one — same discipline + Workout intent. Only a completed session
	// carrying a Workout has a meaningful anchor; everything else skips the lookup
	// and the comparison card never renders.
	const [thresholds, lastSimilar] = await Promise.all([
		getDisciplineThresholds(userId),
		session.status === 'completed' && session.workout
			? getLastSimilarSession(
					userId,
					{
						discipline: session.workout.discipline,
						intent: session.workout.intent,
					},
					session.scheduledAt,
				)
			: Promise.resolve(null),
	])

	return { session, thresholds, lastSimilar }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, 'Session id is required', { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const deleted = await deleteWorkoutSession(userId, params.sessionId)
		invariantResponse(deleted, 'Workout session not found', { status: 404 })
		return redirect('/')
	}

	if (intent === 'mark-missed') {
		// Recording the miss fires the load-recompute path (ADR 0008), which runs
		// the Session Nudge applier — a recorded key miss eases the next planned
		// cardio session right here, never on a page open (#186).
		const result = await markSessionMissed(userId, params.sessionId)
		invariantResponse(result, 'Workout session not found', { status: 404 })
		invariantResponse(
			result.marked,
			'Only a planned session can be marked missed',
			{ status: 400 },
		)
		return redirect(`/training/sessions/${params.sessionId}`)
	}

	// Inline token editing autosave (§1, B9): the detail view IS the editor, so
	// a committed token or structure change posts the whole prescription here —
	// the former standalone edit page and its route are gone. This is that page's
	// action, moved in verbatim: the same Zod/Conform validation, resolved-range
	// bake, Planned-TSS recompute, and Generated-Session adoption
	// (`updateWorkoutSession`), so no save behaviour changed with the deletion.
	// The dispatch rides a dedicated `saveWorkout` control field, not the domain
	// `intent` the workout form already carries (which would collide).
	if (formData.get('saveWorkout')) {
		const submission = parseWithZod(formData, { schema: FormSchema })

		if (submission.status !== 'success') {
			return data({ result: submission.reply() }, { status: 400 })
		}

		const { title, discipline, intent, scheduledAtDate, scheduledAtTime } =
			submission.value

		const scheduledAt = new Date(
			`${scheduledAtDate}T${scheduledAtTime}:00.000Z`,
		)

		if (isNaN(scheduledAt.getTime())) {
			return data(
				{
					result: submission.reply({
						fieldErrors: {
							scheduledAtDate: ['Invalid date and time combination'],
						},
					}),
				},
				{ status: 400 },
			)
		}

		const authoringInput = WorkoutAuthoringSchema.safeParse({
			title,
			discipline,
			intent,
			scheduledAt: scheduledAt.toISOString(),
			blocks: buildBlocksInput(submission.value),
		})

		if (!authoringInput.success) {
			const fieldErrors: Record<string, string[]> = {}
			for (const issue of authoringInput.error.issues) {
				const path = issue.path.join('.')
				if (!fieldErrors[path]) fieldErrors[path] = []
				fieldErrors[path]!.push(issue.message)
			}
			return data(
				{ result: submission.reply({ fieldErrors }) },
				{ status: 400 },
			)
		}

		const updated = await updateWorkoutSession(
			userId,
			params.sessionId,
			authoringInput.data,
		)
		invariantResponse(updated, 'Workout session not found', { status: 404 })

		throw redirect(`/training/sessions/${params.sessionId}`)
	}

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, 'Workout session not found', { status: 404 })

	const submission = parseWithZod(formData, { schema: SessionLogSchema })

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { content, rpe } = submission.value
	await upsertSessionLog({ sessionId: params.sessionId, content, rpe })

	return { result: submission.reply() }
}

/**
 * Deleting a session is destructive (it takes the prescription, any Session
 * Log, and the session's place in training history with it), so it always
 * asks first (#179) — a real dialog with honest copy, not a bare button.
 */
function DeleteSessionDialog() {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="destructive" size="sm">
						Delete session
					</Button>
				}
			/>
			<AlertDialogPopup>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this session?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently removes the workout session, including its
						prescription and any session log, from your training history. This
						cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="POST">
					<input type="hidden" name="intent" value="delete" />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Keep session</AlertDialogCancel>
						<AlertDialogAction type="submit" variant="destructive">
							Delete session
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogPopup>
		</AlertDialog>
	)
}

export default function SessionDetailRoute({
	loaderData,
}: Route.ComponentProps) {
	const { session, thresholds, lastSimilar } = loaderData
	const presenter = useSessionPresenter()
	// The same headline Intensity Target the home surface shows, so the two agree
	// (#130). Resolves the workout's authored target against the athlete's
	// thresholds; null when there's no prescription or no truthful target. A
	// Training Zone the thresholds cannot resolve is captioned ("E —
	// easy/endurance"), never a bare code (#180).
	const target = sessionMetricTarget(session.workout, thresholds ?? {})
	const headlineTarget =
		target?.kind === 'zone' && target.caption
			? `${target.text} — ${target.caption}`
			: targetText(target)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Session"
				back={{ to: '/', label: 'Home' }}
				className="mb-6"
			/>

			{/* Session-level actions in one wrapping row below the header, never a
			    non-wrapping line that can overflow 390px (§1.8). The header's back
			    arrow is the mobile dismissal affordance, so there is no Cancel here.
			    No "Edit session" button: the detail view IS the editor (§1, B9) —
			    a scheduled session edits inline on the card below and autosaves. */}
			<div className="mb-6 flex flex-wrap gap-2">
				{session.status === 'scheduled' ? (
					<Form method="POST">
						<input type="hidden" name="intent" value="mark-missed" />
						<Button type="submit" variant="outline" size="sm">
							Mark as missed
						</Button>
					</Form>
				) : null}
				<DeleteSessionDialog />
			</div>

			{/* The session card (spec §2.6, B8): a quiet title over ONE metadata
			    line of text tokens — discipline · intent · date-time — then the
			    prescription stanza on the same card, separated by the same
			    hairline language. No form-field greys, no label grid. */}
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<CardTitle className="text-lg font-bold tracking-tight">
							{session.workout?.title ?? 'Recording'}
						</CardTitle>
						<p
							data-session-metadata
							className="text-body-xs text-muted-foreground flex flex-wrap items-baseline gap-x-1.5"
						>
							<span className="font-medium">
								{getDisciplineLabel(
									session.workout?.discipline ??
										session.recording?.discipline ??
										'',
								)}
							</span>
							<MetaDot />
							<span className="font-medium">
								{session.source === 'detected'
									? 'Detected'
									: session.workout
										? INTENT_LABELS[session.workout.intent as WorkoutIntent]
										: 'Recorded'}
							</span>
							<MetaDot />
							<span className="font-medium">
								{presenter.presentSession(session).shortDate},{' '}
								{presenter.presentSession(session).timeOfDay}
							</span>
							{headlineTarget ? (
								<>
									<MetaDot />
									<span className="tabular-nums">Target {headlineTarget}</span>
								</>
							) : null}
						</p>
					</div>
					<div className="flex flex-col items-end gap-1.5">
						{/* The "detected · (confidence)" provenance badge (ADR 0033): the
						    honest marker that this session's structure was auto-imported
						    from a Structure Detection, not authored. It retires the moment
						    the athlete edits the structure (source adopts to `authored`). */}
						{session.source === 'detected' ? (
							<Badge variant="secondary" data-detected-badge>
								detected
								{session.recording?.detection
									? ` · ${session.recording.detection.confidence}`
									: ''}
							</Badge>
						) : null}
						<Badge variant={getStatusVariant(session.status)}>
							{getStatusLabel(session.status)}
						</Badge>
					</div>
				</CardHeader>

				{session.workout?.description ? (
					<CardContent>
						<p className="text-body-sm text-muted-foreground">
							{session.workout.description}
						</p>
					</CardContent>
				) : null}

				{session.workout ? (
					<WorkoutPrescription
						session={{ ...session, workout: session.workout }}
						thresholds={thresholds ?? {}}
					/>
				) : session.recording &&
				  isDetectionDiscipline(session.recording.discipline) ? (
					<NoStructureDetected />
				) : null}
			</Card>

			{/* Completed review leads with the verdict: how the recorded effort
			    compared to the prescription (PRD #135, ADR 0019). Needs both a
			    plan and a recording — scheduled and recording-only sessions skip
			    it and render their one coherent side below. */}
			{session.workout && session.recording ? (
				<PlannedVsActualSummary session={session} />
			) : null}

			{/* "vs last time" (PRD #129): how this completed effort compares to the
			    last similar session — same discipline + Workout intent. The first of
			    its kind shows an Unavailable state, never a fabricated delta
			    (ADR 0008). */}
			{session.status === 'completed' && session.workout ? (
				<VsLastSessionSummary session={session} lastSimilar={lastSimilar} />
			) : null}

			{/* The telemetry overlay: the Recording's real per-sample stream plotted
			    against the plan. When the Recording carries no Activity Stream it's
			    an honest Unavailable Metric, never a curve faked from aggregates
			    (ADR 0008, ADR 0020). */}
			{session.recording ? (
				session.recording.stream ? (
					<TelemetryOverlay
						stream={session.recording.stream}
						workout={session.workout}
					/>
				) : (
					<TelemetryUnavailable />
				)
			) : null}

			{session.recording ? (
				<RecordingPanel recording={session.recording} />
			) : null}

			<SessionLogSection sessionLog={session.sessionLog} />
		</main>
	)
}

type WorkoutDetail = NonNullable<SessionDetail['workout']>

/** The metadata line's separator — part of the notation language, not chrome. */
function MetaDot() {
	return (
		<span aria-hidden className="text-muted-foreground/50">
			·
		</span>
	)
}

/**
 * The honest "no structure detected" Unavailable Metric (ADR 0008/0033): a
 * recording-only run/bike session whose telemetry read as steady effort, so
 * Structure Detection found no genuine structure to import — shown plainly
 * rather than fabricating phantom intervals. A cleared detection would instead
 * have materialized a Workout (and this session would render its prescription).
 */
function NoStructureDetected() {
	return (
		<CardContent className="border-border/70 border-t pt-4">
			<p
				data-no-structure
				className="text-muted-foreground border-border/60 rounded-md border border-dashed p-3 text-xs"
			>
				No structure detected — this recording read as steady effort, so no
				workout structure was inferred from it.
			</p>
		</CardContent>
	)
}

/**
 * The prescription section of the session card: the Score stanza under the
 * session header, separated by a hairline (spec §2.6). A scheduled session's
 * stanza is editable in place, saving through the existing edit action (R7);
 * every other status renders it inert — no `renderToken` hook, no chrome —
 * so recorded history stays immutable.
 */
function WorkoutPrescription({
	session,
	thresholds,
}: {
	session: SessionDetail & { workout: WorkoutDetail }
	thresholds: DisciplineThresholdMap
}) {
	const { workout, replanReason } = session
	const editable = session.status === 'scheduled'
	// Missing thresholds keeping structure lines from resolving to concrete
	// ranges — surfaced once as an honest Unavailable Metric note with a pointer
	// to Training Settings, never papered over with fabricated ranges (#180).
	const unresolved = unresolvedThresholdReasons(workout, thresholds)
	// The Workout Shape strip belongs to the prescription, below the stanza
	// (the spec's card order — header, line, strip). Honest and lean (§8): it
	// derives only from what the steps state — no intent fallback — and with
	// zero paintable steps the region is entirely absent.
	const shapeSegments = deriveShapeStrip(workoutToNotationInput(workout), {
		thresholds,
	})
	return (
		<CardContent className="border-border/70 border-t pt-4">
			{/* The Replan Note (ADR 0025): the stored reason a Week Replan
			    softened this prescription, shown with the prescription so the
			    "why" travels with the session. Rendered verbatim from the row;
			    null (never softened, or cleared by a rewrite) renders nothing. */}
			{replanReason ? (
				<p className="text-foreground mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
					<span className="font-medium">Replan note:</span> {replanReason}
				</p>
			) : null}
			{editable ? (
				<ScheduledWorkoutSentence session={session} thresholds={thresholds} />
			) : (
				<ScoreStanza
					className="text-body-sm"
					notation={deriveWorkoutNotation(workoutToNotationInput(workout), {
						thresholds,
					})}
				/>
			)}
			<ShapeStrip segments={shapeSegments} className="mt-4" />
			{unresolved.length > 0 ? (
				<p className="text-muted-foreground border-border/60 mt-4 rounded-md border border-dashed p-3 text-xs">
					Some targets are shown without concrete ranges —{' '}
					{unresolved.join('; ')}. Add your thresholds in{' '}
					<Link
						to="/settings/training"
						className="text-foreground underline underline-offset-2"
					>
						Training Settings
					</Link>{' '}
					to see the exact pace, heart rate, or power to hold.
				</p>
			) : null}
		</CardContent>
	)
}

// Plan Adherence band palette, matching the Session Ledger / Cockpit: under a
// cool caution, on-target green, over the strongest warning.
const BAND_TONE: Record<
	AdherenceBand['tone'],
	{ dot: string; ink: string; wash: string }
> = {
	under: {
		dot: 'bg-sky-400',
		ink: 'text-sky-700 dark:text-sky-400',
		wash: 'bg-sky-500/10',
	},
	'on-target': {
		dot: 'bg-emerald-500',
		ink: 'text-emerald-700 dark:text-emerald-400',
		wash: 'bg-emerald-500/10',
	},
	over: {
		dot: 'bg-rose-500',
		ink: 'text-rose-700 dark:text-rose-400',
		wash: 'bg-rose-500/10',
	},
}

function AdherenceBandChip({ band }: { band: AdherenceBand }) {
	const tone = BAND_TONE[band.tone]
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
				tone.wash,
				tone.ink,
			)}
		>
			<span className={cn('size-1.5 rounded-full', tone.dot)} />
			{band.label}
		</span>
	)
}

const EM_DASH = '—'

function PlannedVsActualSummary({ session }: { session: SessionDetail }) {
	const comparison = buildReviewComparison(session)
	const num = (v: number | null) => (v != null ? formatLoad(v) : EM_DASH)
	const dur = (v: number | null) => (v != null ? formatDuration(v) : EM_DASH)
	const dist = (v: number | null) => (v != null ? formatDistance(v) : EM_DASH)

	const cells: Array<{
		label: string
		actual: string
		planned: string
		band?: AdherenceBand
	}> = [
		{
			label: 'Load (TSS)',
			actual: num(comparison.tss.actual),
			planned: num(comparison.tss.planned),
			band: comparison.tss.band ?? undefined,
		},
		{
			label: 'Duration',
			actual: dur(comparison.duration.actual),
			planned: dur(comparison.duration.planned),
		},
		{
			label: 'Distance',
			actual: dist(comparison.distance.actual),
			planned: dist(comparison.distance.planned),
		},
	]

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Planned vs actual</CardTitle>
				<CardDescription>
					{comparison.tss.band ? (
						<>
							<span className="text-foreground font-medium">
								{comparison.tss.band.label}
							</span>{' '}
							— {comparison.tss.band.recommendation}.
						</>
					) : (
						'How the recorded effort compared to its prescription.'
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="bg-border/60 grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
					{cells.map((cell) => (
						<div key={cell.label} className="bg-card p-4">
							<dt className="text-muted-foreground text-xs">{cell.label}</dt>
							<dd className="text-foreground mt-1 text-lg font-semibold tabular-nums">
								{cell.actual}
							</dd>
							<dd className="text-muted-foreground mt-0.5 text-xs tabular-nums">
								planned {cell.planned}
							</dd>
							{cell.band ? (
								<dd className="mt-2">
									<AdherenceBandChip band={cell.band} />
								</dd>
							) : null}
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	)
}

/** A signed duration change, e.g. "+5 min" / "-3 min". Direction is neutral — a
 * longer or shorter session is informational here, not better or worse. */
function signedDuration(seconds: number): string {
	return `${seconds > 0 ? '+' : '-'}${formatDuration(Math.abs(seconds))}`
}

function VsLastCell({
	label,
	metric,
	format,
	formatChange,
}: {
	label: string
	metric: VsLastMetric
	format: (value: number) => string
	formatChange: (change: number) => string
}) {
	return (
		<div className="bg-card p-4">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="text-foreground mt-1 text-lg font-semibold tabular-nums">
				{metric.current != null ? format(metric.current) : EM_DASH}
			</dd>
			<dd className="text-muted-foreground mt-0.5 text-xs tabular-nums">
				{metric.previous != null ? (
					<>
						last time {format(metric.previous)}
						{metric.change != null && metric.change !== 0 ? (
							<span className="text-foreground ml-1 font-medium">
								({formatChange(metric.change)})
							</span>
						) : null}
					</>
				) : (
					`last time ${EM_DASH}`
				)}
			</dd>
		</div>
	)
}

/**
 * "vs last time": this completed session against the last similar one (same
 * discipline + Workout intent). Truthful metrics only — TSS and recorded
 * duration today, widening to pace/power/HR once metric Intensity Targets land
 * (#129). With no prior similar session it's an Unavailable state, never a
 * fabricated delta (ADR 0008).
 */
function VsLastSessionSummary({
	session,
	lastSimilar,
}: {
	session: SessionDetail
	lastSimilar: SimilarSession | null
}) {
	const timeZone = useAthleteTimezone()
	const comparison = buildVsLastComparison(session, lastSimilar)
	const intent = session.workout
		? INTENT_LABELS[session.workout.intent as WorkoutIntent].toLowerCase()
		: ''
	const kind = [intent, session.workout?.discipline].filter(Boolean).join(' ')

	if (!comparison) {
		return (
			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="text-h5">vs last time</CardTitle>
					<CardDescription>
						No earlier {kind} session to compare against yet — this is the first
						of its kind.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}

	const cells: Array<{
		label: string
		metric: VsLastMetric
		format: (value: number) => string
		formatChange: (change: number) => string
	}> = [
		{
			label: 'Load (TSS)',
			metric: comparison.tss,
			format: formatLoad,
			formatChange: formatSigned,
		},
		{
			label: 'Duration',
			metric: comparison.durationSec,
			format: formatDuration,
			formatChange: signedDuration,
		},
	]

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">vs last time</CardTitle>
				<CardDescription>
					How this effort compared to your last {kind} session on{' '}
					{formatDayMonth(comparison.previousDate, timeZone)}.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="bg-border/60 grid grid-cols-1 gap-px overflow-hidden rounded-xl border sm:grid-cols-2">
					{cells.map((cell) => (
						<VsLastCell key={cell.label} {...cell} />
					))}
				</dl>
			</CardContent>
		</Card>
	)
}

function TelemetryUnavailable() {
	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Telemetry overlay</CardTitle>
				<CardDescription>
					Power and heart rate over time, against the planned targets.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="border-border/60 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
					<Icon name="bar-chart" size="lg" className="opacity-60" />
					<p className="text-body-sm text-foreground font-medium">
						Telemetry not available
					</p>
					<p className="max-w-sm text-xs">
						This recording has no per-sample power or heart-rate stream yet, so
						there is nothing to plot against the plan. The overlay appears once
						telemetry is captured for the activity.
					</p>
				</div>
			</CardContent>
		</Card>
	)
}

type BandChannel = 'power' | 'heartrate'

type Step = NonNullable<
	SessionDetail['workout']
>['blocks'][number]['steps'][number]

/** A planned step laid out as a fraction of the workout's planned duration,
 * carrying its resolved Intensity Target on the chosen channel (when any). */
type PlannedSegment = {
	id: string
	startFrac: number
	endFrac: number
	target: { min: number; max: number } | null
}

function resolveStepTarget(
	step: Step,
	channel: BandChannel,
): { min: number; max: number } | null {
	if (step.kind !== 'cardio') return null
	if (channel === 'power') {
		if (!isNum(step.intensityPowerMin)) return null
		return {
			min: step.intensityPowerMin,
			max: step.intensityPowerMax ?? step.intensityPowerMin,
		}
	}
	if (!isNum(step.intensityHrMin)) return null
	return {
		min: step.intensityHrMin,
		max: step.intensityHrMax ?? step.intensityHrMin,
	}
}

/**
 * Lay the workout's planned steps out as fractions of its total planned
 * duration. This is the *plan's* shape, stretched across the chart's width — it
 * is deliberately not aligned sample-by-sample to the recording (that fragile
 * telemetry-to-step alignment is out of scope per PRD #135), so we never assert a
 * per-step verdict; the athlete eyeballs the comparison.
 */
function buildPlannedSegments(
	workout: WorkoutDetail | null,
	channel: BandChannel | null,
): PlannedSegment[] {
	const expanded = expandWorkoutSteps(workout)
	const total = expanded.reduce((sum, e) => sum + e.durationSec, 0)
	if (total <= 0) return []
	let cum = 0
	return expanded.map((e) => {
		const startFrac = cum / total
		cum += e.durationSec
		return {
			id: e.id,
			startFrac,
			endFrac: cum / total,
			target: channel ? resolveStepTarget(e.step, channel) : null,
		}
	})
}

/** Plot bands on the channel the plan targets *and* the stream actually carries;
 * power wins when both are available (the richer signal), else heart rate. */
function pickBandChannel(
	stream: ActivityStream,
	workout: WorkoutDetail | null,
): BandChannel | null {
	const expanded = expandWorkoutSteps(workout)
	const hasPowerTarget = expanded.some((e) => isNum(e.step.intensityPowerMin))
	const hasHrTarget = expanded.some((e) => isNum(e.step.intensityHrMin))
	if ((stream.power?.some(isNum) ?? false) && hasPowerTarget) return 'power'
	if ((stream.heartrate?.some(isNum) ?? false) && hasHrTarget)
		return 'heartrate'
	return null
}

/** Contiguous runs of `null` on a channel — the paused stretches the chart shades
 * and breaks its lines across, rather than interpolating through them. */
function nullRuns(values: Array<number | null>): Array<[number, number]> {
	const runs: Array<[number, number]> = []
	let start: number | null = null
	for (let i = 0; i < values.length; i++) {
		if (!isNum(values[i])) {
			if (start == null) start = i
		} else if (start != null) {
			runs.push([start, i])
			start = null
		}
	}
	if (start != null) runs.push([start, values.length])
	return runs
}

function rangeOf(values: Array<number | null>): [number, number] | null {
	const nums = values.filter(isNum)
	if (nums.length === 0) return null
	return [Math.min(...nums), Math.max(...nums)]
}

function TelemetryOverlay({
	stream,
	workout,
}: {
	stream: ActivityStream
	workout: WorkoutDetail | null
}) {
	const bandChannel = pickBandChannel(stream, workout)
	const profile = deriveSessionProfile(workout)

	const time = stream.timeSec
	const totalSec = time[time.length - 1] ?? 0

	// The channels actually carried, in a stable read order (effort first, then
	// heart rate, then pace) — one list drives the lines, the inspect readout, the
	// legend, and the data-table columns.
	const channels = buildChannels(stream)

	const hasPower = stream.power?.some(isNum) ?? false
	const hasHr = stream.heartrate?.some(isNum) ?? false
	const hasPace = stream.pace?.some(isNum) ?? false
	// The pause runs shade off the densest effort channel present.
	const primary = hasPower
		? stream.power!
		: hasHr
			? stream.heartrate!
			: hasPace
				? stream.pace!
				: []
	const pauseCount = nullRuns(primary).filter(
		([s, e]) => s > 0 && e < primary.length,
	).length
	const powerRange = hasPower ? rangeOf(stream.power!) : null
	const hrRange = hasHr ? rangeOf(stream.heartrate!) : null
	const paceRange = hasPace ? rangeOf(stream.pace!) : null

	const bands =
		bandChannel != null
			? buildPlannedSegments(workout, bandChannel).filter((s) => s.target)
			: []
	const targetLabels = Array.from(
		new Set(bands.map((b) => `${b.target!.min}–${b.target!.max}`)),
	)
	const targetUnit = bandChannel === 'power' ? 'W' : 'bpm'

	// The Chart Inspect controller scrubs sample-by-sample across the whole stream
	// — continuous `trackProps` on touch/desktop, arrow keys for keyboard — so the
	// count is the sample count, not a discrete-mark count (ADR 0029/0030).
	const inspect = useChartInspect(time.length)

	// Elapsed-time fraction → nearest sample index, for the continuous track.
	const indexAtFraction = (frac: number) => {
		if (time.length === 0) return 0
		const target = frac * totalSec
		let best = 0
		let bestDist = Infinity
		for (let i = 0; i < time.length; i++) {
			const d = Math.abs((time[i] ?? 0) - target)
			if (d < bestDist) {
				bestDist = d
				best = i
			}
		}
		return best
	}

	// The planned target active at a sample, by fraction of the plan's duration
	// (the plan's shape stretched across the axis, never sample-aligned — PRD
	// #135), or null.
	const targetAt = (i: number): PlannedSegment['target'] => {
		if (totalSec <= 0) return null
		const frac = (time[i] ?? 0) / totalSec
		return (
			bands.find((b) => frac >= b.startFrac && frac <= b.endFrac)?.target ??
			null
		)
	}

	// The accessible data table (ADR 0030): each channel's value at a bounded set
	// of sample times. Capped so a dense (≤1000-sample) stream can't bloat the
	// hidden DOM; full per-sample resolution stays reachable by keyboard scrub (the
	// aria-live inspect panel steps every sample). A `null` reading is `n/a`, never
	// interpolated (ADR 0008/0020).
	const tableIdx = sampleIndices(time.length, 48)
	const dataTable: ChartDataTableModel = {
		caption:
			'Recorded telemetry sampled across the session, earliest to latest.',
		columns: [
			'Time',
			...channels.map((c) => c.label),
			...(bands.length > 0 ? [`Planned ${targetUnit}`] : []),
		],
		rows: tableIdx.map((i) => [
			formatClockDuration(time[i] ?? 0),
			...channels.map((c) => {
				const v = c.values[i]
				return isNum(v) ? c.format(v) : 'n/a'
			}),
			...(bands.length > 0
				? [
						(() => {
							const t = targetAt(i)
							return t ? `${t.min}–${t.max}` : '—'
						})(),
					]
				: []),
		]),
	}

	const ariaLabel =
		channels.length > 0
			? `Recorded ${channels
					.map((c) => c.label.toLowerCase())
					.join(', ')} over time${
					bands.length > 0 ? ' against the planned target bands' : ''
				}. Move across the recording to read each channel at any point.`
			: 'Recorded telemetry over time.'

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Telemetry overlay</CardTitle>
				<CardDescription>
					Your recorded effort over time, with the planned targets and shape
					laid across it.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
					{channels.map((c) => (
						<span key={c.key} className="flex items-center gap-1.5">
							<span className={cn('h-0.5 w-4', c.legendClass)} /> {c.label}
						</span>
					))}
					{bands.length > 0 ? (
						<span className="flex items-center gap-1.5">
							<span className="size-3 rounded-sm bg-emerald-500/25 ring-1 ring-emerald-500/40" />{' '}
							Planned target
						</span>
					) : null}
					{pauseCount > 0 ? (
						<span className="text-muted-foreground flex items-center gap-1.5">
							<span className="bg-muted-foreground/20 size-3 rounded-sm" />{' '}
							Paused
						</span>
					) : null}
				</div>

				<ChartFigure
					inspect={inspect}
					count={time.length}
					yMax={100}
					ariaLabel={ariaLabel}
					dataTable={dataTable}
					padding={{ top: 14, right: 8, bottom: 8, left: 8 }}
					renderMarks={(geom) => (
						<TelemetryMarks
							geom={geom}
							time={time}
							totalSec={totalSec}
							channels={channels}
							bands={bands}
							bandChannel={bandChannel}
							primary={primary}
							inspect={inspect}
							indexAtFraction={indexAtFraction}
						/>
					)}
					renderOverlay={(geom) => (
						<TelemetryDots
							geom={geom}
							time={time}
							totalSec={totalSec}
							channels={channels}
							bands={bands}
							bandChannel={bandChannel}
							inspectedIndex={inspect.index}
						/>
					)}
					renderInspect={(index) => (
						<TelemetryReading
							index={index}
							time={time}
							channels={channels}
							targetAt={targetAt}
							targetUnit={targetUnit}
						/>
					)}
				/>

				<div className="text-muted-foreground flex items-center justify-between text-xs">
					<span>0:00 · start</span>
					<span>{formatClockDuration(totalSec)} · total</span>
				</div>

				{profile.bars.length > 0 ? (
					<div className="space-y-1">
						<p className="text-muted-foreground text-xs">
							Planned Workout Shape
						</p>
						<ProfileBars
							bars={profile.bars}
							groups={profile.groups}
							className="h-6"
						/>
					</div>
				) : null}

				{/* Screen-reader / non-visual ranged summary, kept alongside the
				    data-table equivalent (ADR 0030) so the review is never chart-only
				    (PRD #135 user story 18). */}
				<p className="sr-only">
					Recorded telemetry over {formatDuration(totalSec)}.
					{powerRange
						? ` Power ranged ${powerRange[0]} to ${powerRange[1]} W.`
						: ''}
					{hrRange
						? ` Heart rate ranged ${hrRange[0]} to ${hrRange[1]} bpm.`
						: ''}
					{paceRange
						? ` Pace ranged ${formatPace(paceRange[0])} to ${formatPace(paceRange[1])}.`
						: ''}
					{pauseCount > 0
						? ` ${pauseCount} paused ${pauseCount === 1 ? 'stretch' : 'stretches'} shown as gaps.`
						: ''}
					{targetLabels.length > 0
						? ` Planned ${bandChannel === 'power' ? 'power' : 'heart-rate'} ${
								targetLabels.length === 1 ? 'target' : 'targets'
							} ${targetLabels.join(', ')} ${targetUnit}.`
						: ''}
				</p>
			</CardContent>
		</Card>
	)
}

// The channels the Telemetry Overlay can plot, each with its identity (line +
// dot + legend colours) and how it scales and formats. Power reads from a zero
// baseline; heart rate and pace zoom to their own range for legibility (pace
// inverted, so faster sits higher).
type TelemetryChannelKey = 'power' | 'heartrate' | 'pace'

type TelemetryChannel = {
	key: TelemetryChannelKey
	label: string
	values: Array<number | null>
	format: (v: number) => string
	strokeClass: string
	legendClass: string
	dotClass: string
	textClass: string
	invert: boolean
	includeZero: boolean
}

const CHANNEL_META: Record<
	TelemetryChannelKey,
	Omit<TelemetryChannel, 'key' | 'values'>
> = {
	power: {
		label: 'Power',
		format: (v) => `${Math.round(v)} W`,
		strokeClass: 'stroke-sky-500',
		legendClass: 'bg-sky-500',
		dotClass: 'bg-sky-500',
		textClass: 'text-sky-600 dark:text-sky-400',
		invert: false,
		includeZero: true,
	},
	heartrate: {
		label: 'Heart rate',
		format: (v) => `${Math.round(v)} bpm`,
		strokeClass: 'stroke-rose-500 opacity-70',
		legendClass: 'bg-rose-500',
		dotClass: 'bg-rose-500',
		textClass: 'text-rose-600 dark:text-rose-400',
		invert: false,
		includeZero: false,
	},
	pace: {
		label: 'Pace',
		format: (v) => formatPace(v),
		strokeClass: 'stroke-amber-500',
		legendClass: 'bg-amber-500',
		dotClass: 'bg-amber-500',
		textClass: 'text-amber-600 dark:text-amber-400',
		invert: true,
		includeZero: false,
	},
}

const CHANNEL_ORDER: TelemetryChannelKey[] = ['power', 'heartrate', 'pace']

function buildChannels(stream: ActivityStream): TelemetryChannel[] {
	return CHANNEL_ORDER.filter((k) => stream[k]?.some(isNum) ?? false).map(
		(k) => ({ key: k, values: stream[k]!, ...CHANNEL_META[k] }),
	)
}

/** Up to `max` evenly-spaced sample indices spanning `[0, n)` (both ends kept). */
function sampleIndices(n: number, max: number): number[] {
	if (n <= 0) return []
	if (n <= max) return Array.from({ length: n }, (_, i) => i)
	const out: number[] = []
	for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)))
	return Array.from(new Set(out))
}

/**
 * A channel's value → svg-y mapping over the plot. Power keeps a zero baseline;
 * the others zoom to their own (padded) range so a narrow HR or pace band still
 * reads. `extra` folds the planned-band targets into the domain so bands on the
 * chosen channel never clip. Pace inverts: a lower seconds-per-km (faster) sits
 * higher.
 */
function channelScale(
	ch: TelemetryChannel,
	geom: ChartGeom,
	extra: number[] = [],
): (v: number) => number {
	const { baselineY, plotH } = geom
	const nums = [...ch.values.filter(isNum), ...extra]
	let lo = nums.length ? Math.min(...nums) : 0
	let hi = nums.length ? Math.max(...nums) : 1
	if (ch.includeZero) {
		lo = 0
		hi = Math.max(hi * 1.08, 1)
	} else {
		const span = hi - lo || 1
		lo = Math.max(0, lo - span * 0.08)
		hi = hi + span * 0.08
	}
	const range = hi - lo || 1
	return (v) =>
		ch.invert
			? baselineY - ((hi - v) / range) * plotH
			: baselineY - ((v - lo) / range) * plotH
}

function buildScales(
	channels: TelemetryChannel[],
	bands: PlannedSegment[],
	bandChannel: BandChannel | null,
	geom: ChartGeom,
): Array<(v: number) => number> {
	return channels.map((c) =>
		channelScale(
			c,
			geom,
			c.key === bandChannel
				? bands.flatMap((b) => [b.target!.min, b.target!.max])
				: [],
		),
	)
}

function TelemetryMarks({
	geom,
	time,
	totalSec,
	channels,
	bands,
	bandChannel,
	primary,
	inspect,
	indexAtFraction,
}: {
	geom: ChartGeom
	time: number[]
	totalSec: number
	channels: TelemetryChannel[]
	bands: PlannedSegment[]
	bandChannel: BandChannel | null
	primary: Array<number | null>
	inspect: ReturnType<typeof useChartInspect>
	indexAtFraction: (frac: number) => number
}) {
	const { padding, plotW, plotH } = geom
	const x = (sec: number) =>
		padding.left + (totalSec > 0 ? sec / totalSec : 0) * plotW
	const xFrac = (frac: number) => padding.left + frac * plotW

	const scales = buildScales(channels, bands, bandChannel, geom)
	const bandIdx = channels.findIndex((c) => c.key === bandChannel)
	const bandScale = bandIdx >= 0 ? scales[bandIdx]! : null

	const gappedPath = (
		values: Array<number | null>,
		y: (n: number) => number,
	) => {
		let d = ''
		let pen = false
		for (let i = 0; i < time.length; i++) {
			const v = values[i]
			if (!isNum(v)) {
				pen = false
				continue
			}
			d += `${pen ? 'L' : 'M'}${x(time[i] ?? 0).toFixed(1)} ${y(v).toFixed(1)} `
			pen = true
		}
		return d
	}

	const pauses = nullRuns(primary).map(([s, e]) => {
		const x0 = x(time[s] ?? 0)
		const x1 = x(time[Math.min(e, time.length - 1)] ?? 0)
		return { x: x0, width: Math.max(0, x1 - x0) }
	})

	const inspected = inspect.index

	return (
		<>
			{/* Paused stretches shaded as known-empty, so a gap never reads as zero. */}
			{pauses.map((r, i) =>
				r.width > 0 ? (
					<rect
						key={`pause-${i}`}
						x={r.x}
						y={padding.top}
						width={r.width}
						height={plotH}
						className="fill-muted-foreground/10"
					/>
				) : null,
			)}

			{/* Planned target bands on the channel the plan targets. */}
			{bandScale
				? bands.map((b) => {
						const x0 = xFrac(b.startFrac)
						const x1 = xFrac(b.endFrac)
						return (
							<rect
								key={`band-${b.id}`}
								x={x0}
								y={bandScale(b.target!.max)}
								width={Math.max(0, x1 - x0)}
								height={Math.max(
									0,
									bandScale(b.target!.min) - bandScale(b.target!.max),
								)}
								className="fill-emerald-500/15 stroke-emerald-500/40"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
						)
					})
				: null}

			{/* One gapped polyline per channel — `null` breaks the line, never
			    interpolated across (ADR 0008/0020). */}
			{channels.map((c, ci) => (
				<path
					key={c.key}
					d={gappedPath(c.values, scales[ci]!)}
					fill="none"
					className={c.strokeClass}
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			))}

			{/* The inspection crosshair at the scrubbed sample. Per-channel dots ride
			    as crisp HTML overlays (see `TelemetryDots`). */}
			{inspected != null ? (
				<line
					x1={x(time[inspected] ?? 0)}
					x2={x(time[inspected] ?? 0)}
					y1={padding.top}
					y2={padding.top + plotH}
					stroke="currentColor"
					className="text-foreground/60"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}

			{/* The continuous pointer track (ADR 0029): one full-plot hit area that
			    maps the pointer's x to the nearest sample. Desktop hovers to read;
			    touch drags to scrub. Transparent, on top, so it catches every
			    pointer. */}
			<rect
				x={padding.left}
				y={padding.top}
				width={plotW}
				height={plotH}
				fill="transparent"
				className="cursor-crosshair"
				{...inspect.trackProps(indexAtFraction)}
			/>
		</>
	)
}

function TelemetryDots({
	geom,
	time,
	totalSec,
	channels,
	bands,
	bandChannel,
	inspectedIndex,
}: {
	geom: ChartGeom
	time: number[]
	totalSec: number
	channels: TelemetryChannel[]
	bands: PlannedSegment[]
	bandChannel: BandChannel | null
	inspectedIndex: number | null
}) {
	if (inspectedIndex == null) return null
	const { padding, plotW, leftPct, topPct } = geom
	const scales = buildScales(channels, bands, bandChannel, geom)
	const svgX =
		padding.left +
		(totalSec > 0 ? (time[inspectedIndex] ?? 0) / totalSec : 0) * plotW

	return (
		<>
			{channels.map((c, ci) => {
				const v = c.values[inspectedIndex]
				if (!isNum(v)) return null
				return (
					<span
						key={c.key}
						className="absolute -translate-x-1/2 -translate-y-1/2"
						style={{ left: leftPct(svgX), top: topPct(scales[ci]!(v)) }}
					>
						<span
							className={cn(
								'ring-background block size-2.5 rounded-full ring-2',
								c.dotClass,
							)}
						/>
					</span>
				)
			})}
		</>
	)
}

function TelemetryReading({
	index,
	time,
	channels,
	targetAt,
	targetUnit,
}: {
	index: number | null
	time: number[]
	channels: TelemetryChannel[]
	targetAt: (i: number) => PlannedSegment['target']
	targetUnit: string
}) {
	if (index == null) {
		return (
			<span className="text-muted-foreground">
				Move across the recording to read each channel at any point — tap and
				drag on a phone, hover on desktop.
			</span>
		)
	}

	const target = targetAt(index)

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className="font-medium">
				{formatClockDuration(time[index] ?? 0)}
			</span>
			{channels.map((c) => {
				const v = c.values[index]
				return (
					<span
						key={c.key}
						className={isNum(v) ? c.textClass : 'text-muted-foreground'}
					>
						{c.label} {isNum(v) ? c.format(v) : 'n/a'}
					</span>
				)
			})}
			{target ? (
				<span className="text-emerald-600 dark:text-emerald-400">
					Planned {target.min}–{target.max} {targetUnit}
				</span>
			) : null}
		</div>
	)
}

type Recording = NonNullable<SessionDetail['recording']>
type Metric = { label: string; value: string }

/** Build the metric tiles a recording actually has — omit anything the provider
 * didn't send so the grid never shows empty cells. */
function recordingMetrics(rec: Recording): Metric[] {
	const cadenceUnit = rec.discipline === 'bike' ? 'rpm' : 'spm'
	const bpm = (v: number) => `${Math.round(v)} bpm`
	const watts = (v: number) => `${Math.round(v)} W`

	const candidates: Array<Metric | null> = [
		rec.distanceM != null
			? { label: 'Distance', value: formatDistance(rec.distanceM) }
			: null,
		{ label: 'Moving time', value: formatDuration(rec.durationSec) },
		rec.paceAvgSecPerKm != null
			? { label: 'Avg pace', value: formatPace(rec.paceAvgSecPerKm) }
			: null,
		rec.speedMaxMps != null
			? { label: 'Max speed', value: formatSpeed(rec.speedMaxMps) }
			: null,
		rec.hrAvg != null ? { label: 'Avg HR', value: bpm(rec.hrAvg) } : null,
		rec.hrMax != null ? { label: 'Max HR', value: bpm(rec.hrMax) } : null,
		rec.powerAvg != null
			? { label: 'Avg power', value: watts(rec.powerAvg) }
			: null,
		rec.powerWeightedAvg != null
			? { label: 'Norm. power', value: watts(rec.powerWeightedAvg) }
			: null,
		rec.powerMax != null
			? { label: 'Max power', value: watts(rec.powerMax) }
			: null,
		rec.cadenceAvg != null
			? {
					label: 'Avg cadence',
					value: `${Math.round(rec.cadenceAvg)} ${cadenceUnit}`,
				}
			: null,
		rec.elevationGainM != null
			? { label: 'Elevation', value: `${Math.round(rec.elevationGainM)} m` }
			: null,
		rec.kilojoules != null
			? { label: 'Work', value: `${Math.round(rec.kilojoules)} kJ` }
			: null,
		rec.tssValue != null
			? { label: 'Load (TSS)', value: formatLoad(rec.tssValue) }
			: null,
	]
	return candidates.filter((m): m is Metric => m !== null)
}

function RecordingPanel({ recording }: { recording: Recording }) {
	const metrics = recordingMetrics(recording)
	const phaseBars = parseRecordingPhaseBars(recording.phaseBarsJson)
	const provider =
		recording.externalProvider === 'strava'
			? 'Strava'
			: recording.externalProvider

	return (
		<Card className="mt-6">
			<CardHeader className="flex flex-row items-center justify-between gap-3">
				<CardTitle className="text-h5">Recording</CardTitle>
				<span className="text-muted-foreground text-xs tracking-wide uppercase">
					{provider}
				</span>
			</CardHeader>
			<CardContent className="space-y-4">
				{phaseBars.length > 0 ? (
					<div className="space-y-1">
						<p className="text-muted-foreground text-xs">
							Intensity by HR zone
						</p>
						<ProfileBars bars={phaseBars} className="h-8" />
					</div>
				) : null}

				<dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
					{metrics.map((m) => (
						<div key={m.label} className="space-y-0.5">
							<dt className="text-muted-foreground text-xs">{m.label}</dt>
							<dd className="text-body-sm font-semibold tabular-nums">
								{m.value}
							</dd>
						</div>
					))}
				</dl>

				{recording.polyline ? (
					<div className="border-border/60 bg-background/50 text-foreground/80 rounded-lg border p-3">
						<RouteSketch
							polyline={recording.polyline}
							className="mx-auto h-48 w-full"
						/>
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}

function SessionLogSection({
	sessionLog,
}: {
	sessionLog: SessionDetail['sessionLog']
}) {
	const actionData = useActionData<typeof action>()

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Session Log</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{sessionLog ? <SessionLogDisplay sessionLog={sessionLog} /> : null}
				<SessionLogForm
					defaultContent={sessionLog?.content}
					defaultRpe={sessionLog?.rpe}
					actionData={actionData}
				/>
			</CardContent>
		</Card>
	)
}

function SessionLogDisplay({
	sessionLog,
}: {
	sessionLog: NonNullable<SessionDetail['sessionLog']>
}) {
	return (
		<div className="bg-muted rounded-lg p-4">
			<p className="text-body-sm whitespace-pre-wrap">{sessionLog.content}</p>
			{sessionLog.rpe != null ? (
				<p className="text-muted-foreground mt-2 text-sm">
					RPE: {sessionLog.rpe}/10
				</p>
			) : null}
		</div>
	)
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

function SessionLogForm({
	defaultContent,
	defaultRpe,
	actionData,
}: {
	defaultContent?: string
	defaultRpe?: number | null
	actionData?: { result: Parameters<typeof useForm>[0]['lastResult'] }
}) {
	const [form, fields] = useForm({
		id: 'session-log',
		constraint: getZodConstraint(SessionLogSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionLogSchema })
		},
		defaultValue: {
			content: defaultContent ?? '',
			rpe: defaultRpe?.toString() ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(form)}>
			<fieldset className="space-y-4">
				<legend className="text-body-sm font-semibold">
					{defaultContent ? 'Update your reflection' : 'Log your reflection'}
				</legend>

				<TextareaField
					labelProps={{ children: 'Reflection' }}
					textareaProps={{
						...getTextareaProps(fields.content),
						placeholder: 'How did the session go?',
					}}
					errors={fields.content.errors as string[] | undefined}
				/>

				<div className="space-y-2">
					<label className="text-body-xs text-muted-foreground font-medium">
						RPE (Rate of Perceived Exertion)
					</label>
					<div
						className="flex flex-wrap gap-1.5"
						role="group"
						aria-label="RPE selector"
					>
						{RPE_VALUES.map((value) => (
							<Button
								key={value}
								type="button"
								variant={
									fields.rpe.value === String(value) ? 'default' : 'outline'
								}
								size="sm"
								className={cn(
									'h-9 w-9 p-0',
									fields.rpe.value === String(value) && 'ring-ring/30 ring-2',
								)}
								onClick={() => {
									const input = document.querySelector<HTMLInputElement>(
										`input[name="${fields.rpe.name}"]`,
									)
									if (input) {
										const newValue =
											input.value === String(value) ? '' : String(value)
										input.value = newValue
										input.dispatchEvent(new Event('input', { bubbles: true }))
										input.dispatchEvent(new Event('change', { bubbles: true }))
									}
								}}
								aria-pressed={fields.rpe.value === String(value)}
							>
								{value}
							</Button>
						))}
					</div>
					<input
						type="hidden"
						name={fields.rpe.name}
						value={fields.rpe.value ?? ''}
					/>
					<ErrorList errors={fields.rpe.errors as string[] | undefined} />
				</div>

				<StatusButton
					type="submit"
					status={form.status === 'error' ? 'error' : 'idle'}
				>
					{defaultContent ? 'Update Session Log' : 'Save Session Log'}
				</StatusButton>
				<ErrorList errors={form.errors as string[] | undefined} />
			</fieldset>
		</Form>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
