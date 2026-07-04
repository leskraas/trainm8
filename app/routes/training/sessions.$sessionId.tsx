import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, TextareaField } from '#app/components/forms.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { RouteSketch } from '#app/components/route-sketch.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
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
import { sessionMetricTarget, targetText } from '#app/utils/intensity-target.ts'
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
import {
	type SessionDetail,
	type SimilarSession,
	getDisciplineThresholds,
	getLastSimilarSession,
	getSessionByIdForUser,
} from '#app/utils/training.server.ts'
import { getStatusLabel, getStatusVariant } from '#app/utils/training.ts'
import {
	formatClock,
	formatDistance,
	formatDuration,
	formatMonthDay,
	formatPace,
	formatSpeed,
	formatTss,
} from '#app/utils/format.ts'
import { useDisplayTimeZone } from '#app/utils/client-hints.tsx'
import {
	INTENT_LABELS,
	IntensityTargetSchema,
	type WorkoutIntent,
} from '#app/utils/workout-schema.ts'
import {
	deleteWorkoutSession,
	markSessionMissed,
} from '#app/utils/workout.server.ts'
import { type Route } from './+types/sessions.$sessionId.ts'

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

export default function SessionDetailRoute({
	loaderData,
}: Route.ComponentProps) {
	const { session, thresholds, lastSimilar } = loaderData
	const presenter = useSessionPresenter()
	// The same headline Intensity Target the home surface shows, so the two agree
	// (#130). Resolves the workout's authored target against the athlete's
	// thresholds; null when there's no prescription or no truthful target.
	const headlineTarget = targetText(
		sessionMetricTarget(session.workout, thresholds ?? {}),
	)

	return (
		<main className="container py-10">
			<div className="mb-6 flex items-center justify-between gap-3">
				<Link
					to="/"
					prefetch="intent"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to home
				</Link>
				<div className="flex gap-2">
					{session.status === 'scheduled' ? (
						<Form method="POST">
							<input type="hidden" name="intent" value="mark-missed" />
							<Button type="submit" variant="outline" size="sm">
								Mark as missed
							</Button>
						</Form>
					) : null}
					<Link
						to={`/training/upcoming/${session.id}/edit`}
						prefetch="intent"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Edit session
					</Link>
					<Form method="POST">
						<input type="hidden" name="intent" value="delete" />
						<Button
							type="submit"
							variant="destructive"
							size="sm"
							onClick={(e) => {
								if (
									!window.confirm(
										'Delete this workout session? This cannot be undone.',
									)
								) {
									e.preventDefault()
								}
							}}
						>
							Delete session
						</Button>
					</Form>
				</div>
			</div>

			<Card className="bg-muted">
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<CardTitle>{session.workout?.title ?? 'Recording'}</CardTitle>
						<CardDescription className="capitalize">
							{session.workout?.discipline ?? session.recording?.discipline}
						</CardDescription>
						<div className="flex items-center gap-2">
							<p className="text-body-sm text-muted-foreground">
								{presenter.presentSession(session).timeOfDay}
							</p>
							{session.workout ? (
								<span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium">
									{INTENT_LABELS[session.workout.intent as WorkoutIntent]}
								</span>
							) : (
								<span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs font-medium tracking-wide uppercase">
									recorded
								</span>
							)}
							{headlineTarget ? (
								<span className="bg-primary/10 text-foreground rounded px-2 py-0.5 text-xs font-medium tabular-nums">
									Target {headlineTarget}
								</span>
							) : null}
						</div>
					</div>
					<Badge variant={getStatusVariant(session.status)}>
						{getStatusLabel(session.status)}
					</Badge>
				</CardHeader>

				{session.workout?.description ? (
					<CardContent>
						<p className="text-body-sm">{session.workout.description}</p>
					</CardContent>
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

			{session.workout ? <WorkoutStructure workout={session.workout} /> : null}

			<SessionLogSection sessionLog={session.sessionLog} />
		</main>
	)
}

type WorkoutDetail = NonNullable<SessionDetail['workout']>

function WorkoutStructure({ workout }: { workout: WorkoutDetail }) {
	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Workout structure</CardTitle>
				<CardDescription>The prescription for this session.</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="space-y-3">
					{workout.blocks.map((block) => {
						const blockLabel = block.name ?? `Block ${block.orderIndex + 1}`
						return (
							<li key={block.id} className="rounded-md border p-3">
								<p className="text-body-sm font-semibold">
									{block.repeatCount > 1
										? `${block.repeatCount} × ${blockLabel}`
										: blockLabel}
								</p>
								<ul className="mt-2 space-y-1 pl-4">
									{block.steps.map((step) => (
										<li
											key={step.id}
											className="text-body-sm text-muted-foreground"
										>
											<StepDisplay step={step} />
										</li>
									))}
								</ul>
							</li>
						)
					})}
				</ul>
			</CardContent>
		</Card>
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
	const num = (v: number | null) => (v != null ? formatTss(v) : EM_DASH)
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



function signedNumber(n: number): string {
	const r = Math.round(n)
	return r > 0 ? `+${r}` : String(r)
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
	const timeZone = useDisplayTimeZone()
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
			format: formatTss,
			formatChange: signedNumber,
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
					{formatMonthDay(comparison.previousDate, timeZone)}.
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
	const hasPower = stream.power?.some(isNum) ?? false
	const hasHr = stream.heartrate?.some(isNum) ?? false
	const bandChannel = pickBandChannel(stream, workout)
	const profile = deriveSessionProfile(workout)

	const totalSec = stream.timeSec[stream.timeSec.length - 1] ?? 0
	const primary = hasPower ? stream.power! : hasHr ? stream.heartrate! : []
	const pauseCount = nullRuns(primary).filter(
		([s, e]) => s > 0 && e < primary.length,
	).length
	const powerRange = hasPower ? rangeOf(stream.power!) : null
	const hrRange = hasHr ? rangeOf(stream.heartrate!) : null

	const bands =
		bandChannel != null
			? buildPlannedSegments(workout, bandChannel).filter((s) => s.target)
			: []
	const targetLabels = Array.from(
		new Set(bands.map((b) => `${b.target!.min}–${b.target!.max}`)),
	)
	const targetUnit = bandChannel === 'power' ? 'W' : 'bpm'

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
				<figure className="space-y-2">
					<figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
						{hasPower ? (
							<span className="flex items-center gap-1.5">
								<span className="h-0.5 w-4 bg-sky-500" /> Power
							</span>
						) : null}
						{hasHr ? (
							<span className="flex items-center gap-1.5">
								<span className="h-0.5 w-4 bg-rose-500" /> Heart rate
							</span>
						) : null}
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
					</figcaption>

					<TelemetryChart
						stream={stream}
						bands={bands}
						bandChannel={bandChannel}
					/>

					{profile.bars.length > 0 ? (
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">
								Planned Workout Shape
							</p>
							<ProfileBars bars={profile.bars} className="h-6" />
						</div>
					) : null}

					{/* Screen-reader / non-visual summary so the review is never
					    chart-only (PRD #135 user story 18). */}
					<p className="sr-only">
						Recorded telemetry over {formatDuration(totalSec)}.
						{powerRange
							? ` Power ranged ${powerRange[0]} to ${powerRange[1]} W.`
							: ''}
						{hrRange
							? ` Heart rate ranged ${hrRange[0]} to ${hrRange[1]} bpm.`
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
				</figure>
			</CardContent>
		</Card>
	)
}

const CHART_W = 720
const CHART_H = 240
const CHART_PAD_X = 8
const CHART_PAD_TOP = 14
const CHART_PAD_BOT = 22

function TelemetryChart({
	stream,
	bands,
	bandChannel,
}: {
	stream: ActivityStream
	bands: PlannedSegment[]
	bandChannel: BandChannel | null
}) {
	const time = stream.timeSec
	const totalT = time[time.length - 1] || 1
	const power = stream.power
	const hr = stream.heartrate
	const hasPower = power?.some(isNum) ?? false
	const hasHr = hr?.some(isNum) ?? false

	// Scales sized to the data *and* the planned bands so neither clips.
	const bandPowerMax =
		bandChannel === 'power'
			? Math.max(0, ...bands.map((b) => b.target!.max))
			: 0
	const powerMax = Math.max(1, ...(power ?? []).filter(isNum), bandPowerMax)
	const yMaxP = Math.ceil((powerMax * 1.08) / 10) * 10

	const bandHr =
		bandChannel === 'heartrate'
			? bands.flatMap((b) => [b.target!.min, b.target!.max])
			: []
	const hrNums = [...(hr ?? []).filter(isNum), ...bandHr]
	const hrLo = hrNums.length ? Math.min(...hrNums) : 0
	const hrHi = hrNums.length ? Math.max(...hrNums) : 1
	const hrMin = Math.max(0, Math.floor((hrLo - 5) / 5) * 5)
	const hrMax = Math.max(hrMin + 1, Math.ceil((hrHi + 5) / 5) * 5)

	const xSec = (sec: number) =>
		CHART_PAD_X + (sec / totalT) * (CHART_W - 2 * CHART_PAD_X)
	const xFrac = (frac: number) =>
		CHART_PAD_X + frac * (CHART_W - 2 * CHART_PAD_X)
	const yP = (w: number) =>
		CHART_H -
		CHART_PAD_BOT -
		(w / yMaxP) * (CHART_H - CHART_PAD_BOT - CHART_PAD_TOP)
	const yH = (b: number) =>
		CHART_H -
		CHART_PAD_BOT -
		((b - hrMin) / (hrMax - hrMin)) * (CHART_H - CHART_PAD_BOT - CHART_PAD_TOP)
	const yBand = bandChannel === 'power' ? yP : yH

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
			d += `${pen ? 'L' : 'M'}${xSec(time[i]!).toFixed(1)} ${y(v).toFixed(1)} `
			pen = true
		}
		return d
	}

	const primary = hasPower ? power! : hasHr ? hr! : []
	const pauses = nullRuns(primary).map(([s, e]) => {
		const x0 = xSec(time[s]!)
		const x1 = xSec(time[Math.min(e, time.length - 1)]!)
		return { x: x0, width: Math.max(0, x1 - x0) }
	})

	return (
		<svg
			viewBox={`0 0 ${CHART_W} ${CHART_H}`}
			preserveAspectRatio="none"
			className="h-56 w-full sm:h-64"
			role="img"
			aria-label="Recorded power and heart rate over time with the planned target bands"
		>
			{pauses.map((r, i) =>
				r.width > 0 ? (
					<rect
						key={`pause-${i}`}
						x={r.x}
						y={CHART_PAD_TOP}
						width={r.width}
						height={CHART_H - CHART_PAD_BOT - CHART_PAD_TOP}
						className="fill-muted-foreground/10"
					/>
				) : null,
			)}
			{bands.map((b) => {
				const x0 = xFrac(b.startFrac)
				const x1 = xFrac(b.endFrac)
				return (
					<rect
						key={`band-${b.id}`}
						x={x0}
						y={yBand(b.target!.max)}
						width={Math.max(0, x1 - x0)}
						height={Math.max(0, yBand(b.target!.min) - yBand(b.target!.max))}
						className="fill-emerald-500/15 stroke-emerald-500/40"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				)
			})}
			{hasHr ? (
				<path
					d={gappedPath(hr!, yH)}
					fill="none"
					className="stroke-rose-500 opacity-70"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}
			{hasPower ? (
				<path
					d={gappedPath(power!, yP)}
					fill="none"
					className="stroke-sky-500"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}
		</svg>
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
			? { label: 'Load (TSS)', value: formatTss(rec.tssValue) }
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

type Step = NonNullable<
	SessionDetail['workout']
>['blocks'][number]['steps'][number]

function StepDisplay({ step }: { step: Step }) {
	if (step.kind === 'strength') {
		const exerciseName = step.exercise?.name ?? 'Unknown exercise'
		return (
			<div className="space-y-1">
				<span className="font-medium">{exerciseName}</span>
				{step.sets.length > 0 ? (
					<ul className="space-y-0.5 pl-4">
						{step.sets.map((set, i) => {
							const parts: string[] = [`Set ${i + 1}:`]
							if (set.kind === 'reps') {
								parts.push(`${set.reps} reps`)
							} else if (set.kind === 'timed' && set.durationSec != null) {
								parts.push(formatDuration(set.durationSec))
							} else if (set.kind === 'amrap') {
								parts.push('AMRAP')
							}
							if (set.weightKg != null) parts.push(`@ ${set.weightKg} kg`)
							if (set.pct1RM != null) parts.push(`@ ${set.pct1RM}% 1RM`)
							return (
								<li key={set.id} className="text-xs">
									{parts.join(' ')}
								</li>
							)
						})}
					</ul>
				) : null}
				{step.restBetweenSetsSec != null ? (
					<p className="text-xs">
						{formatDuration(step.restBetweenSetsSec)} rest between sets
					</p>
				) : null}
				{step.notes ? <p className="text-xs italic">{step.notes}</p> : null}
			</div>
		)
	}

	if (step.kind === 'rest') {
		const parts: string[] = ['Rest']
		if (step.durationSec != null) parts.push(formatDuration(step.durationSec))
		if (step.notes) parts.push(`— ${step.notes}`)
		return <span>{parts.join(' ')}</span>
	}

	// cardio
	const parts: string[] = []
	if (step.durationSec != null) parts.push(formatDuration(step.durationSec))
	if (step.distanceM != null) parts.push(formatDistance(step.distanceM))
	if (step.notes) parts.push(step.notes)

	let authoredLabel: string | null = null
	let resolvedLabel: string | null = null

	if (step.intensity) {
		try {
			const parsed = IntensityTargetSchema.safeParse(JSON.parse(step.intensity))
			if (parsed.success) {
				const t = parsed.data
				switch (t.kind) {
					case 'zoneLabel':
						authoredLabel = t.label
						break
					case 'rpe':
						authoredLabel =
							t.max != null ? `RPE ${t.min}–${t.max}` : `RPE ${t.min}`
						break
					case 'hrBpm':
						authoredLabel =
							t.max != null ? `${t.min}–${t.max} bpm` : `${t.min}+ bpm`
						break
					case 'hrPct':
						authoredLabel =
							t.maxPct != null
								? `${t.minPct}–${t.maxPct}% ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
								: `${t.minPct}%+ ${t.ref === 'max' ? 'MaxHR' : 'LTHR'}`
						break
					case 'power':
						authoredLabel =
							t.maxW != null ? `${t.minW}–${t.maxW} W` : `${t.minW}+ W`
						break
					case 'powerPct':
						authoredLabel =
							t.maxPct != null
								? `${t.minPct}–${t.maxPct}% FTP`
								: `${t.minPct}%+ FTP`
						break
					case 'pace': {
						authoredLabel =
							t.maxSecPerKm != null
								? `${formatClock(t.minSecPerKm)}–${formatClock(t.maxSecPerKm)} /km`
								: `${formatClock(t.minSecPerKm)}+ /km`
						break
					}
				}
			}
		} catch {
			// malformed JSON — skip
		}
	}

	const resolvedParts: string[] = []
	if (step.intensityHrMin != null) {
		resolvedParts.push(
			step.intensityHrMax != null
				? `${step.intensityHrMin}–${step.intensityHrMax} bpm`
				: `${step.intensityHrMin}+ bpm`,
		)
	}
	if (step.intensityPowerMin != null) {
		resolvedParts.push(
			step.intensityPowerMax != null
				? `${step.intensityPowerMin}–${step.intensityPowerMax} W`
				: `${step.intensityPowerMin}+ W`,
		)
	}
	if (step.intensityPaceMin != null) {
		resolvedParts.push(
			step.intensityPaceMax != null
				? `${formatClock(step.intensityPaceMin)}–${formatClock(step.intensityPaceMax)} /km`
				: `${formatClock(step.intensityPaceMin)}+ /km`,
		)
	}
	if (resolvedParts.length > 0) resolvedLabel = resolvedParts.join(' · ')

	return (
		<span>
			{parts.join(' ') || null}
			{authoredLabel ? (
				<>
					{parts.length > 0 ? ' — ' : ''}
					<span className="font-medium">{authoredLabel}</span>
					{resolvedLabel ? (
						<span className="text-muted-foreground ml-1 text-xs">
							({resolvedLabel})
						</span>
					) : null}
				</>
			) : null}
			{!parts.length && !authoredLabel ? '—' : null}
		</span>
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
