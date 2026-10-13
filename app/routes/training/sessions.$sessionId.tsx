import { getFormProps, getTextareaProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { invariantResponse } from '@epic-web/invariant'
import {
	lazy,
	startTransition,
	Suspense,
	useEffect,
	useRef,
	useState,
} from 'react'
import {
	data,
	Form,
	Link,
	redirect,
	useActionData,
	useNavigation,
} from 'react-router'
import { z } from 'zod/v3'
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
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
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
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	ImportLinkNotFoundError,
	relinkRecordingToSession,
} from '#app/utils/activity-import.server.ts'
import { type ActivityStream } from '#app/utils/activity-stream.ts'
import {
	readSessionArchetype,
	type SessionArchetypeView,
} from '#app/utils/archetype-classification/index.ts'
import { dayBoundsUTC, localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	formatLoad,
	formatNbDayDate,
	formatNbDayMonth,
	formatPace,
	formatSigned,
	formatTime,
} from '#app/utils/format.ts'
import { undoImportLink } from '#app/utils/import-link.server.ts'
import {
	type DisciplineThresholdMap,
	parseAuthoredIntensity,
	sessionMetricTarget,
	targetText,
	unresolvedThresholdReasons,
} from '#app/utils/intensity-target.ts'
import {
	APP_TAB_LABELS,
	NB_ADHERENCE_LABELS,
	NB_INTENT_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	WORKOUT_DETAIL_LABELS,
	nbConfidenceLabel,
	nbDisciplineLabel,
	nbDurationLabel,
	nbSessionNoun,
	nbSessionStatusLabel,
	nbStoredReplanReason,
	nbUnavailableReason,
	providerLabel,
	sessionVolumeLabel,
} from '#app/utils/labels.ts'
import { type AdherenceBand } from '#app/utils/load/adherence.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type VsLastMetric,
	buildVsLastComparison,
} from '#app/utils/session-comparison.ts'
import { upsertSessionLog } from '#app/utils/session-log.server.ts'
import { parseRecordingPhaseBars } from '#app/utils/session-profile.ts'
import { buildReviewComparison } from '#app/utils/session-review.ts'
import { deriveShapeStrip } from '#app/utils/shape-strip.ts'
import { type ResolveContext } from '#app/utils/strength/anchors.ts'
import { getWorkoutLoadContexts } from '#app/utils/strength-log.server.ts'
import {
	type StructureAdherenceVerdict,
	structureAdherence,
} from '#app/utils/structure-adherence.ts'
import { runStructureDetection } from '#app/utils/structure-detection/detect-job.server.ts'
import {
	type DetectionGrade,
	isDetectionDiscipline,
} from '#app/utils/structure-detection/types.ts'
import {
	type SessionDetail,
	type SimilarSession,
	findActiveOutline,
	getDisciplineThresholds,
	getLastSimilarSession,
	getMedianSessionDurationSec,
	getSessionByIdForUser,
} from '#app/utils/training.server.ts'
import { getStatusVariant } from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	deriveWorkoutNotation,
	workoutToNotationInput,
} from '#app/utils/workout-notation.ts'
import {
	type WorkoutIntent,
	type WorkoutStructure,
	WorkoutAuthoringSchema,
	WorkoutStructureSchema,
} from '#app/utils/workout-schema.ts'
import {
	deleteWorkoutSession,
	describeLoggedSetRefusal,
	getExerciseCatalog,
	getRecentExerciseIds,
	markSessionMissed,
	updateWorkoutSession,
} from '#app/utils/workout.server.ts'
import { withWeekSumToast } from '#app/utils/writing-line.server.ts'
import { type Route } from './+types/sessions.$sessionId.ts'
import { type ExerciseItem } from './__exercise-combobox.tsx'
import { ScheduledWorkoutSentence } from './__workout-detail-editor.tsx'
import {
	buildSessionSummary,
	type SummaryFigure,
} from './__workout-detail-summary.ts'

const L = WORKOUT_DETAIL_LABELS

/**
 * The telemetry card is its own chunk, mounted when it nears the viewport
 * (`DeferredTelemetry`): it was half the page's DOM and all of it below the
 * fold (#505 round 2, measured at 4× CPU).
 */
const TelemetryOverlay = lazy(() => import('./__workout-detail-telemetry.tsx'))

const SessionLogSchema = z.object({
	content: z.string().min(1, L.log.required),
	rpe: z
		.string()
		.optional()
		.transform((val) => (val ? Number(val) : null))
		.pipe(
			z
				.number()
				.int(L.log.rpeWhole)
				.min(1, L.log.rpeRange)
				.max(10, L.log.rpeRange)
				.nullable(),
		),
})

/**
 * The session's display title: an authored/derived Workout title when it has a
 * structure, else the sport's session noun (`Løpeøkt`), the name I dag's row
 * gives a recording that arrived with no workout (`nbSessionNoun`). It used to
 * be a title derived from the recording (`45 min run`), in English and with the
 * duration in it — the header's figures now say the duration, in the sport's
 * own unit, right under the title.
 */
function sessionDisplayTitle(session: {
	workout?: { title: string } | null
	recording?: { discipline: string } | null
}): string {
	if (session.workout?.title) return session.workout.title
	if (session.recording) return nbSessionNoun(session.recording.discipline)
	return L.untitled
}

/**
 * Is this session's structure still the **engine's own** — Session Source
 * `detected` and not yet taken over by the athlete (#460)?
 *
 * The three surfaces that mark auto-imported structure — the "Detected" label,
 * the "detected · (confidence)" badge, and the re-detect control — all ask this
 * one question, and none of them can ask it of `source` alone any more. Origin
 * is permanent now, so a session the athlete corrected still reads `detected`
 * forever; what retires the badge and the control is **adoption**, exactly as
 * ADR 0033 always described it in prose.
 *
 * Takes the timestamp loosely because loader data crosses the network: a `Date`
 * on the server, possibly its serialized form in the component.
 */
function isUnadoptedDetected(session: {
	source: string
	adoptedAt: Date | string | null
}): boolean {
	return session.source === 'detected' && session.adoptedAt == null
}

export const meta: Route.MetaFunction = ({ data }) => [
	{
		title: data?.session
			? L.metaTitle(sessionDisplayTitle(data.session))
			: L.metaFallback,
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, L.errors.missingId, { status: 400 })

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, L.errors.notFound, { status: 404 })

	// Thresholds resolve the workout's authored Intensity Target into the same
	// concrete headline target the home surface shows (#130), so the two agree.
	// "vs last time" (PRD #129): how this completed session compares to the last
	// one of the same **Session Archetype**. Only a completed session carrying a
	// Workout has a meaningful anchor; everything else skips the lookup and the
	// comparison card never renders. A Workout with no archetype finds nothing,
	// which is the honest answer rather than a delta against an incomparable
	// session (ADR 0055 §6).
	//
	// A scheduled session's prescription IS the editor (ADR 0027 R7), and its
	// exercise token is the catalogue combobox — which names the lift it holds by
	// finding that id in the catalogue. So the editable branch needs the same two
	// lists the create route loads; without them every named lift renders as an
	// empty "Select exercise…" picker. Read only where the sentence is editable:
	// a completed session's inert sentence carries the names on its own steps.
	const editable = session.status === 'scheduled' && session.workout != null
	const [
		thresholds,
		lastSimilar,
		relinkTargets,
		medianSessionSec28d,
		loadContexts,
		exercises,
		recentExerciseIds,
		activeOutline,
	] = await Promise.all([
		getDisciplineThresholds(userId),
		session.status === 'completed' && session.workout
			? getLastSimilarSession(
					userId,
					{
						discipline: session.workout.discipline,
						archetype: session.workout.archetype,
					},
					session.scheduledAt,
				)
			: Promise.resolve(null),
		getRelinkTargets(userId, session),
		// The *role in the week* half of an archetype reading. Skipped where the
		// athlete already stated one, because then nothing is read at all.
		session.workout?.archetype
			? Promise.resolve(null)
			: getMedianSessionDurationSec(userId, session.scheduledAt),
		// The strength half of "for this athlete": the anchors an authored
		// `85 % 1RM` or `8RM` resolves against, read **as of the session's own
		// day**. Handed to the sentence rather than looked up by it (ADR 0027).
		getWorkoutLoadContexts(userId, session.workout, session.scheduledAt),
		editable ? getExerciseCatalog(userId) : Promise.resolve([]),
		editable ? getRecentExerciseIds(userId) : Promise.resolve([]),
		// The unit the header leads with: the plan's track for this sport, read
		// the way I dag's row reads it (`trackCurrencies`, the first track per
		// sport), so the page and the row it was opened from agree.
		findActiveOutline(userId, new Date()),
	])

	const archetype = readSessionArchetype({
		workout: session.workout,
		recording: session.recording,
		detectionGrade:
			(session.recording?.detection?.confidence as
				| DetectionGrade
				| undefined) ?? null,
		profile:
			thresholds[
				session.workout?.discipline ?? session.recording?.discipline ?? ''
			],
		medianSessionSec28d,
	})

	// Which of this session's exercise slots already carry logged sets, and how
	// many (ADR 0056). Two jobs: the editor states, before the athlete taps, that
	// changing one of those exercises is refused rather than allowed to destroy
	// the sets; and the count is the same number the refusal sentence uses, so the
	// warning and the refusal can never disagree.
	//
	// Every log on the Step, not just this session's: a `Workout` can be scheduled
	// more than once, so an edit made from Tuesday can reach Saturday's sets.
	const loggedSetsByStep = Object.fromEntries(
		(
			await prisma.exerciseSetLog.groupBy({
				by: ['stepId'],
				where: {
					step: {
						block: { workoutId: session.workout?.id ?? '__none__' },
					},
				},
				_count: { _all: true },
			})
		).flatMap((row) =>
			row.stepId == null ? [] : [[row.stepId, row._count._all] as const],
		),
	)

	// How many working sets the athlete has logged here (ADR 0056). The count only
	// decides which word the log control uses; the sets themselves live on their
	// own surface, because a grid of them on this card is the "too much text"
	// defect #434 reported.
	const loggedSetCount =
		session.workout?.discipline === 'strength'
			? await prisma.exerciseSetLog.count({
					where: {
						sessionId: session.id,
						role: 'working',
						outcome: 'completed',
					},
				})
			: 0

	const discipline =
		session.workout?.discipline ?? session.recording?.discipline ?? ''
	const trackCurrency =
		activeOutline?.outline.tracks.find(
			(track) => track.discipline === discipline,
		)?.currency ?? null

	return {
		session,
		thresholds,
		loadContexts,
		exercises,
		recentExerciseIds,
		lastSimilar,
		relinkTargets,
		archetype,
		loggedSetCount,
		loggedSetsByStep,
		// Arket M: the session in its own numbers, the track's unit first. Built
		// here, from the rows the page already loaded — the presenter is pure.
		summary: buildSessionSummary({
			discipline,
			status: session.status,
			currency: isSummaryCurrency(trackCurrency) ? trackCurrency : null,
			workout: session.workout,
			recording: session.recording,
			loggedSets: loggedSetCount,
		}),
	}
}

/** The currencies a session's own figures can lead with; a TSS track's
 * session leads with its sport's default instead (I dag's row does the same). */
function isSummaryCurrency(
	currency: string | null,
): currency is 'km' | 'hours' | 'sets' {
	return currency === 'km' || currency === 'hours' || currency === 'sets'
}

/**
 * The planned sessions this Recording could be moved onto instead — same
 * calendar day in the Athlete Timezone, still unrecorded. With the Activity
 * Inbox gone (ADR 0049) this is the athlete's fix for an auto-match that picked
 * the wrong session, or for an activity auto-save had to stand up on its own.
 * Empty (and the control hidden) when the session carries no Recording.
 */
async function getRelinkTargets(userId: string, session: SessionDetail) {
	if (!session.recording) return []

	const timezone = await getAthleteTimezone(userId)
	const { start, end } = dayBoundsUTC(
		localDate(session.recording.startedAt, timezone),
		timezone,
	)

	const candidates = await prisma.workoutSession.findMany({
		where: {
			userId,
			id: { not: session.id },
			recordingId: null,
			workoutId: { not: null },
			scheduledAt: { gte: start, lte: end },
		},
		select: {
			id: true,
			scheduledAt: true,
			workout: { select: { title: true, discipline: true } },
		},
		orderBy: { scheduledAt: 'asc' },
	})

	return candidates.map((c) => ({
		id: c.id,
		scheduledAt: c.scheduledAt,
		title: c.workout?.title ?? L.untitled,
		discipline: c.workout?.discipline ?? null,
	}))
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.sessionId, L.errors.missingId, { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const sessionId = params.sessionId
		// Read before it goes, owner-scoped: what the toast's week sum is about
		// (#505 story 39). A recording-only session has no prescription to sum.
		const target = await prisma.workoutSession.findFirst({
			where: { id: sessionId, userId },
			select: { scheduledAt: true, workout: { select: { discipline: true } } },
		})
		invariantResponse(target, L.errors.notFound, { status: 404 })
		if (!target.workout) {
			const deleted = await deleteWorkoutSession(userId, sessionId)
			invariantResponse(deleted, L.errors.notFound, { status: 404 })
			return redirect('/')
		}
		const timezone = await getAthleteTimezone(userId)
		const { result: deleted, headers } = await withWeekSumToast(
			userId,
			{
				dayKey: localDate(target.scheduledAt, timezone),
				discipline: target.workout.discipline,
				change: 'removed',
				timezone,
			},
			() => deleteWorkoutSession(userId, sessionId),
		)
		invariantResponse(deleted, L.errors.notFound, { status: 404 })
		return redirect('/', headers ? { headers } : undefined)
	}

	if (intent === 'mark-missed') {
		// Recording the miss fires the load-recompute path (ADR 0008), which runs
		// the Session Nudge applier — a recorded key miss eases the next planned
		// cardio session right here, never on a page open (#186).
		const result = await markSessionMissed(userId, params.sessionId)
		invariantResponse(result, L.errors.notFound, { status: 404 })
		invariantResponse(result.marked, L.errors.onlyPlannedMissed, {
			status: 400,
		})
		return redirect(`/training/sessions/${params.sessionId}`)
	}

	// The Recording fix-ups the Activity Inbox used to host (ADR 0049). Both keep
	// the activity attached to *some* session — with no inbox, an unpromoted
	// import would be invisible.
	if (intent === 'relink' || intent === 'detach') {
		const current = await getSessionByIdForUser(userId, params.sessionId)
		invariantResponse(current, L.errors.notFound, { status: 404 })
		invariantResponse(current.recording, L.errors.noRecording, {
			status: 400,
		})

		if (intent === 'detach') {
			// The same path as _Angre kobling_ on I dag (#505 story 81): the
			// answer is remembered, and the ekstra session it makes offers
			// _Koble igjen_ back to this one.
			const moved = await undoImportLink(userId, current.recording.id)
			invariantResponse(moved.ok, L.errors.notAttached, {
				status: 400,
			})
			return redirect(`/training/sessions/${moved.sessionId}`)
		}

		const targetSessionId = formData.get('targetSessionId')
		invariantResponse(
			typeof targetSessionId === 'string',
			L.errors.targetRequired,
			{ status: 400 },
		)
		try {
			const moved = await relinkRecordingToSession(
				userId,
				current.recording.id,
				targetSessionId,
			)
			return redirect(`/training/sessions/${moved.sessionId}`)
		} catch (error) {
			if (!(error instanceof ImportLinkNotFoundError)) throw error
			return data({ error: L.wrongSession.moveFailed }, { status: 400 })
		}
	}

	if (intent === 'redetect') {
		// The manual "Re-run detection" control (#357): re-run the engine for this
		// session's Recording synchronously, so the fresh structure (or an honest
		// cleared state) shows on redirect rather than after a background job drains.
		// `analyze` is a pure pass over one bounded stream, so the request stays snappy.
		// Gated to an *unadopted* detected or a structureless recording-only run/bike
		// session — an authored/generated prescription is never re-detected, and
		// neither is one the athlete has taken over (ADR 0033, #460): re-detection
		// rebuilds the whole Workout, so offering it over an adopted session would
		// offer to overwrite their own edits. The engine itself guards every write;
		// this gate just keeps the control off ineligible sessions.
		const session = await getSessionByIdForUser(userId, params.sessionId)
		invariantResponse(session, L.errors.notFound, { status: 404 })
		invariantResponse(
			session.recording &&
				isDetectionDiscipline(session.recording.discipline) &&
				(isUnadoptedDetected(session) || session.source === 'recorded'),
			L.errors.cannotRedetect,
			{ status: 400 },
		)
		await runStructureDetection({ activityImportId: session.recording.id })
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
							scheduledAtDate: [L.errors.badDateTime],
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

		// The token edit's toast (#505 story 39): what the change did to its
		// week's sum, and that the Week Target stayed — said only when the sum
		// moved, so retyping an intensity or a time of day says nothing.
		const timezone = await getAthleteTimezone(userId)
		const sessionId = params.sessionId
		const { result: updated, headers: toastHeaders } = await withWeekSumToast(
			userId,
			{
				dayKey: localDate(authoringInput.data.scheduledAt, timezone),
				discipline: authoringInput.data.discipline,
				change: 'added',
				timezone,
				quietUnlessMoved: true,
			},
			() => updateWorkoutSession(userId, sessionId, authoringInput.data),
		)
		invariantResponse(
			updated.ok || updated.reason !== 'not-found',
			L.errors.notFound,
			{
				status: 404,
			},
		)

		// The save would have changed what a Step *is* while sets are logged against
		// it, so nothing was written. It comes back as a rejected save — §10's error
		// language, painted at the exercise token that was about to change — because
		// autosave has no button to disable and no dialog to open: the athlete edited
		// a token, and the honest answer is the same shape as every other refusal
		// this card gives. The editor also says it up front, before the tap
		// (`LoggedSetNotice`), so this is the second line of defence and not the
		// first.
		if (!updated.ok && updated.reason === 'logged-sets') {
			const fieldErrors: Record<string, string[]> = {}
			const formErrors: string[] = []
			for (const refusal of updated.refusals) {
				const sentence = describeLoggedSetRefusal(refusal)
				if (refusal.change === 'step-removed') {
					// The step is gone from the submitted draft, so its index anchors
					// nothing — an index-addressed marking would paint whichever step
					// slid into its place. Anchor-less summary text is the honest answer
					// (§10.5).
					formErrors.push(sentence)
					continue
				}
				const path = `blocks[${refusal.blockIndex}].steps[${refusal.stepIndex}].exerciseId`
				fieldErrors[path] = [sentence]
			}
			return data(
				{ result: submission.reply({ fieldErrors, formErrors }) },
				{ status: 400 },
			)
		}

		/**
		 * A saved autosave is **not a navigation**. This used to `throw redirect`
		 * back here, which was correct while the save came from the standalone edit
		 * page that has since been deleted (workout-editor spec §12) and harmless
		 * afterwards, because from this route it redirected to this route.
		 *
		 * The Token Sentence is no longer only on this route: the home timeline's
		 * stamped row renders the very same editor (#501), and a fetcher that
		 * follows a redirect takes the athlete off the timeline mid-edit — losing
		 * the surface the whole gesture exists to keep them on. Returning instead
		 * revalidates exactly as the self-redirect did, from wherever the sentence
		 * happens to be mounted.
		 *
		 * Deliberately not a `submission.reply()`: a *successful* Conform result
		 * resets the form to its defaults, and an autosave has no business
		 * rewinding the draft the athlete is still typing into.
		 */
		return data(
			{ saved: true as const },
			toastHeaders ? { headers: toastHeaders } : undefined,
		)
	}

	const session = await getSessionByIdForUser(userId, params.sessionId)
	invariantResponse(session, L.errors.notFound, { status: 404 })

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
 * The session's own actions, as one row under the header. The strength log
 * leads (the one primary), "ikke gjort" is quiet, and **Slett økta** sits
 * behind **Mer**: a destructive act is never the second thing in the first
 * row (#505 round 2, audit D11), and it still always asks first (#179) — a
 * real dialog with honest copy, opened from the menu rather than a bare
 * button. Every control is a real 44px (`size="default"`).
 */
function SessionActions({
	session,
	loggedSetCount,
}: {
	session: SessionDetail
	loggedSetCount: number
}) {
	const [confirmDelete, setConfirmDelete] = useState(false)
	return (
		<div className="flex flex-wrap items-center gap-2" data-session-actions>
			{/* The strength track's only route to an actual (ADR 0056). Leads the
			    row for a lift, because no provider exports set-by-set data and
			    this is therefore the whole of the plan↔actual loop for strength. */}
			{session.workout?.discipline === 'strength' ? (
				<Link
					to={`/training/sessions/${session.id}/log`}
					className={buttonVariants({ size: 'default' })}
				>
					{loggedSetCount > 0 ? L.actions.setsLogged : L.actions.logSets}
				</Link>
			) : null}
			{session.status === 'scheduled' ? (
				<Form method="POST">
					<input type="hidden" name="intent" value="mark-missed" />
					<Button type="submit" variant="outline">
						{L.actions.markMissed}
					</Button>
				</Form>
			) : null}
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" className="ml-auto" data-session-more>
							{L.actions.more}
							<Icon name="dots-horizontal" aria-hidden="true" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						variant="destructive"
						onClick={() => setConfirmDelete(true)}
					>
						<Icon name="trash" aria-hidden="true" />
						{L.actions.delete}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{L.deleteDialog.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{L.deleteDialog.body}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Form method="POST">
						<input type="hidden" name="intent" value="delete" />
						<AlertDialogFooter>
							<AlertDialogCancel type="button">
								{L.deleteDialog.keep}
							</AlertDialogCancel>
							<AlertDialogAction type="submit" variant="destructive">
								{L.deleteDialog.confirm}
							</AlertDialogAction>
						</AlertDialogFooter>
					</Form>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

export default function SessionDetailRoute({
	loaderData,
}: Route.ComponentProps) {
	const {
		session,
		thresholds,
		loadContexts,
		exercises,
		recentExerciseIds,
		lastSimilar,
		relinkTargets,
		archetype,
		loggedSetCount,
		loggedSetsByStep,
		summary,
	} = loaderData
	const timeZone = useAthleteTimezone()
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
	const discipline =
		session.workout?.discipline ?? session.recording?.discipline ?? ''
	const hasReview = session.recording != null || session.status === 'completed'

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8 lg:max-w-6xl">
			<PageHeader
				title={L.pageTitle}
				back={{ to: '/', label: APP_TAB_LABELS.today }}
				className="mb-4"
			/>

			{/* Two columns on a large screen (Arket Q, audit D12): the session as
			    prescribed on the left, the review of it — the recording, the
			    comparisons, the note — on the right. One column on a phone, in
			    the same order. A planned session has nothing to review yet, so
			    it keeps one centred column. */}
			<div
				className={cn(
					'flex flex-col gap-6',
					hasReview &&
						'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start',
					!hasReview && 'lg:mx-auto lg:max-w-2xl',
				)}
			>
				<div className="flex min-w-0 flex-col gap-4">
					<SessionActions session={session} loggedSetCount={loggedSetCount} />

					{/* The session card (spec §2.6, B8; Arket M). Its order is the
					    reading order: the title, **the session in its own numbers**,
					    one quiet metadata line, then the sentence and its shape. Prose
					    and provenance follow the numbers, never lead them. */}
					<Card>
						<CardHeader className="gap-2">
							<div className="flex items-start justify-between gap-3">
								<CardTitle className="text-title min-w-0 [overflow-wrap:anywhere]">
									{sessionDisplayTitle(session)}
								</CardTitle>
								<Badge
									variant={getStatusVariant(session.status)}
									className="mt-1 shrink-0"
								>
									{nbSessionStatusLabel(session.status)}
								</Badge>
							</div>
							<SummaryFigures figures={summary} />
							<p
								data-session-metadata
								className="text-footnote text-muted-foreground flex flex-wrap items-baseline gap-x-1.5"
							>
								<span className="text-foreground font-medium">
									{nbDisciplineLabel(discipline)}
								</span>
								<MetaDot />
								{/* The **Session Archetype** token (ADR 0055): what kind of
								    session this was, in the slot that used to hold `intent`
								    — the intensity axis wearing this name. Replaced rather
								    than joined, because a fourth token overflows 390px and
								    because two words for one axis is the defect. Falls back
								    to the old token for a session nothing can say an
								    archetype about. */}
								{archetype ? (
									<ArchetypeToken view={archetype} />
								) : (
									<span className="text-foreground font-medium">
										{isUnadoptedDetected(session)
											? L.detected
											: session.workout
												? NB_INTENT_LABELS[
														session.workout.intent as WorkoutIntent
													]
												: L.recorded}
									</span>
								)}
								<MetaDot />
								<span className="tabular-nums">
									{formatNbDayDate(session.scheduledAt, timeZone)},{' '}
									{formatTime(session.scheduledAt, timeZone)}
								</span>
								{headlineTarget ? (
									<>
										<MetaDot />
										<span className="tabular-nums">
											{L.target(headlineTarget)}
										</span>
									</>
								) : null}
							</p>
						</CardHeader>

						{session.workout ? (
							<WorkoutPrescription
								session={{ ...session, workout: session.workout }}
								thresholds={thresholds ?? {}}
								loadContexts={loadContexts ?? {}}
								exercises={exercises ?? []}
								recentExerciseIds={recentExerciseIds ?? []}
								loggedSetsByStep={loggedSetsByStep ?? {}}
							/>
						) : session.recording &&
						  isDetectionDiscipline(session.recording.discipline) ? (
							<NoStructureDetected />
						) : null}

						{/* Provenance follows the numbers (Arket M): the
						    "funnet · høy" mark that this structure was read from the
						    recording rather than written (ADR 0033), and the archetype
						    reading's own caveat (ADR 0054). It retires the moment the
						    athlete adopts the structure — read off `adoptedAt` now that
						    the origin survives the takeover (#460). */}
						{session.workout?.description ||
						isUnadoptedDetected(session) ||
						archetype?.kind === 'read' ? (
							<CardContent className="flex flex-col gap-2">
								{session.workout?.description ? (
									<p className="text-footnote text-muted-foreground">
										{session.workout.description}
									</p>
								) : null}
								{isUnadoptedDetected(session) || archetype?.kind === 'read' ? (
									<div className="flex flex-wrap gap-1.5">
										{isUnadoptedDetected(session) ? (
											<Badge variant="secondary" data-detected-badge>
												{session.recording?.detection
													? L.detectedWith(
															nbConfidenceLabel(
																session.recording.detection.confidence,
															),
														)
													: L.detected}
											</Badge>
										) : null}
										{/* A *read* archetype says so, in the same
										    "word · confidence" language the detected mark
										    speaks (ADR 0033, 0054). A stated one carries none:
										    the athlete said it. */}
										{archetype?.kind === 'read' ? (
											<Badge variant="outline" data-archetype-badge>
												{L.readWith(
													nbConfidenceLabel(archetype.reading.confidence),
												)}
											</Badge>
										) : null}
									</div>
								) : null}
							</CardContent>
						) : null}

						{/* The manual "Let på nytt" control (#357). Sits with the
						    detection provenance it acts on — never in the top action
						    row. Only a detected or a structureless recording-only
						    run/bike session shows it; an authored/generated
						    prescription never does (ADR 0033). */}
						{session.recording &&
						isDetectionDiscipline(session.recording.discipline) &&
						(isUnadoptedDetected(session) || session.source === 'recorded') ? (
							<RedetectFooter detected={isUnadoptedDetected(session)} />
						) : null}
					</Card>
				</div>

				<div className="flex min-w-0 flex-col gap-6">
					{/* Completed review leads with the verdict: how the recorded effort
					    compared to the prescription (PRD #135, ADR 0019). Needs both a
					    plan and a recording — scheduled and recording-only sessions
					    skip it and render their one coherent side below. */}
					{session.workout && session.recording ? (
						<PlannedVsActualSummary session={session} />
					) : null}

					{/* "Mot forrige gang" (PRD #129): how this completed effort
					    compares to the last session of the same discipline and
					    **Session Archetype** (ADR 0054). The first of its kind — and a
					    session with no stored archetype — show an Unavailable state,
					    never a fabricated delta (ADR 0008). */}
					{session.status === 'completed' && session.workout ? (
						<VsLastSessionSummary
							session={session}
							lastSimilar={lastSimilar}
							archetype={archetype}
						/>
					) : null}

					{/* The recording over time: the Recording's real per-sample
					    stream plotted against the plan. When the Recording carries no
					    Activity Stream it's an honest Unavailable Metric, never a
					    curve faked from aggregates (ADR 0008, ADR 0020). */}
					{session.recording ? (
						session.recording.stream ? (
							<DeferredTelemetry
								stream={session.recording.stream}
								workout={session.workout}
							/>
						) : (
							<TelemetryUnavailable />
						)
					) : null}

					{session.recording ? (
						<RecordingPanel
							recording={session.recording}
							sessionTss={session.tssValue}
							relinkTargets={relinkTargets}
							onPlannedSession={session.workout != null}
						/>
					) : null}

					<SessionLogSection sessionLog={session.sessionLog} />
				</div>
			</div>
		</main>
	)
}

/**
 * **The session in its own numbers** (Arket M): the track's unit first, as
 * the figure the eye lands on — `10 km` — and the others quieter beside it —
 * `· 50 min`. Built by `buildSessionSummary`; absent when the session has no
 * number worth stating (a missed day, a done session nothing came in for).
 */
function SummaryFigures({ figures }: { figures: SummaryFigure[] }) {
	if (figures.length === 0) return null
	const [lead, ...rest] = figures
	return (
		<p
			data-session-summary
			aria-label={`${L.summaryName}: ${figures.map((f) => f.text).join(', ')}`}
			className="flex flex-wrap items-baseline gap-x-2 tabular-nums"
		>
			<span className="text-title font-semibold" data-summary-unit={lead!.unit}>
				{lead!.text}
			</span>
			{rest.map((figure) => (
				<span
					key={figure.unit}
					className="text-callout text-muted-foreground"
					data-summary-unit={figure.unit}
				>
					<span aria-hidden className="mr-2">
						·
					</span>
					{figure.text}
				</span>
			))}
		</p>
	)
}

/**
 * The telemetry card, mounted when it nears the viewport (#505 round 2).
 *
 * Measured on a completed ride at 4× CPU, the card was 311 of the page's 597
 * elements and sat at ~1 540 px, below the fold: it was hydrated, styled and
 * laid out inside the page's longest task before anybody scrolled to it. The
 * server and the first client render now draw a placeholder of the card's
 * size; an IntersectionObserver 600px ahead of the viewport mounts the real
 * card as a transition (time-sliced, never blocking a tap), from a chunk that
 * was prefetched while the browser was idle. On a large screen, where the
 * card is in the right column and may already be in view, the observer fires
 * at once and the swap happens right after hydration rather than inside it.
 */
function DeferredTelemetry({
	stream,
	workout,
}: {
	stream: ActivityStream
	workout: SessionDetail['workout']
}) {
	const placeholderRef = useRef<HTMLDivElement>(null)
	const [mounted, setMounted] = useState(false)

	useEffect(() => {
		// Warm the chunk while the browser is idle, so a quick scroll finds it.
		const preload = () => void import('./__workout-detail-telemetry.tsx')
		const hasIdle = typeof window.requestIdleCallback === 'function'
		const idle = hasIdle
			? window.requestIdleCallback(preload, { timeout: 3000 })
			: window.setTimeout(preload, 1500)

		const node = placeholderRef.current
		if (!node || !('IntersectionObserver' in window)) {
			startTransition(() => setMounted(true))
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect()
					startTransition(() => setMounted(true))
				}
			},
			{ rootMargin: '600px 0px' },
		)
		observer.observe(node)
		return () => {
			observer.disconnect()
			if (hasIdle) window.cancelIdleCallback(idle)
			else window.clearTimeout(idle)
		}
	}, [])

	const placeholder = (
		<Card className="min-h-[34rem]" ref={placeholderRef} aria-busy="true">
			<CardHeader>
				<CardTitle className="text-heading">{L.telemetry.title}</CardTitle>
				<CardDescription className="text-footnote">
					{L.telemetry.description}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="bg-muted/50 h-56 rounded-3xl" />
				<span className="sr-only">{L.telemetry.loading}</span>
			</CardContent>
		</Card>
	)

	if (!mounted) return placeholder
	return (
		<Suspense fallback={placeholder}>
			<TelemetryOverlay stream={stream} workout={workout} />
		</Suspense>
	)
}

type WorkoutDetail = NonNullable<SessionDetail['workout']>

/** The short phrase in the metadata line, for each of the three states. */
function archetypeWord(view: SessionArchetypeView): string {
	switch (view.kind) {
		case 'stated':
			return NB_SESSION_ARCHETYPE_LABELS[view.archetype]
		case 'read':
			return NB_SESSION_ARCHETYPE_LABELS[view.reading.archetype]
		case 'unread':
			// The absence itself, kept short enough for the line and never deferred
			// behind the tap (#437: a source may wait, an absence may not).
			return L.archetype.unread
	}
}

/**
 * The **Session Archetype** token: one word in the metadata line, with the
 * reasoning behind a tap (ADR 0055; #437's rule, generalized).
 *
 * The three states read differently on purpose. A **stated** archetype is flat
 * text — the athlete said it, so there is nothing to disclose and nothing to tap.
 * A **read** one and a **refusal** are both tappable, because both are the app
 * talking about the athlete's data and owe their derivation. The caveat rides on
 * the word (the `lest · middels` badge); the reasons wait behind the tap.
 *
 * Inline in a text line, so it takes ADR 0028's `after:` hit-area extension to
 * a real 44 × 44 rather than growing the line to 44px tall — the exception the
 * standard names for inline links and glyph controls. The audit measured the
 * drawn word at 66 × 18; the hit area is what a thumb meets.
 */
function ArchetypeToken({ view }: { view: SessionArchetypeView }) {
	const word = archetypeWord(view)

	if (view.kind === 'stated') {
		return (
			<span className="text-foreground font-medium" data-archetype="stated">
				{word}
			</span>
		)
	}

	const reasons = view.kind === 'read' ? view.reading.reasons : view.reasons
	const caveat = view.kind === 'read' ? view.reading.caveat : null

	return (
		<Popover>
			<PopoverTrigger
				className="focus-visible:ring-ring decoration-muted-foreground text-foreground relative rounded-sm font-medium underline decoration-dotted underline-offset-2 outline-none after:absolute after:top-1/2 after:left-1/2 after:size-11 after:min-w-full after:-translate-x-1/2 after:-translate-y-1/2 focus-visible:ring-2"
				data-archetype={view.kind}
			>
				{word}
			</PopoverTrigger>
			<PopoverContent className="max-w-[min(20rem,calc(100vw-2rem))]">
				<PopoverHeader>
					<PopoverTitle className="text-callout">
						{view.kind === 'read' ? L.archetype.read : L.archetype.unreadTitle}
					</PopoverTitle>
				</PopoverHeader>
				<ul className="text-footnote text-muted-foreground list-disc space-y-1 pl-4">
					{reasons.map((reason) => (
						<li key={reason}>{reason}</li>
					))}
				</ul>
				{caveat ? (
					<p className="text-footnote text-foreground mt-2 font-medium">
						{caveat}
					</p>
				) : null}
			</PopoverContent>
		</Popover>
	)
}

/** The metadata line's separator — part of the notation language, not chrome.
 * Decorative (`aria-hidden`), so it may sit below text contrast. */
function MetaDot() {
	return (
		<span aria-hidden className="text-muted-foreground">
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
		<CardContent>
			<p
				data-no-structure
				className="text-footnote text-muted-foreground bg-muted rounded-2xl px-3 py-2.5"
			>
				{L.noStructure}
			</p>
		</CardContent>
	)
}

/**
 * The manual "Let på nytt" control (#357): a quiet inline button that
 * re-runs Structure Detection for this session's Recording. Useful right after
 * setting a threshold (so the engine can now resolve zones) or when an
 * auto-detected structure looks wrong. Detection runs synchronously in the
 * action, so the page comes back with the fresh result. `detected` decides the
 * copy — re-checking an existing detected structure vs. a structureless recording.
 */
function RedetectFooter({ detected }: { detected: boolean }) {
	const navigation = useNavigation()
	const pending =
		navigation.state !== 'idle' &&
		navigation.formData?.get('intent') === 'redetect'
	return (
		<CardContent>
			<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<p className="text-footnote text-muted-foreground min-w-0 flex-1 basis-56">
					{detected ? L.redetect.detectedNote : L.redetect.recordedNote}
				</p>
				<Form method="POST">
					<input type="hidden" name="intent" value="redetect" />
					<StatusButton
						type="submit"
						variant="outline"
						status={pending ? 'pending' : 'idle'}
						data-redetect
					>
						{L.redetect.action}
					</StatusButton>
				</Form>
			</div>
		</CardContent>
	)
}

/**
 * The prescription section of the session card: the Score stanza under the
 * session header (spec §2.6). A scheduled session's stanza is editable in
 * place, saving through the existing edit action (R7); every other status
 * renders it inert — no `renderToken` hook, no chrome — so recorded history
 * stays immutable.
 */
function WorkoutPrescription({
	session,
	thresholds,
	loadContexts,
	exercises,
	recentExerciseIds,
	loggedSetsByStep,
}: {
	session: SessionDetail & { workout: WorkoutDetail }
	thresholds: DisciplineThresholdMap
	/** This athlete's strength anchors per exercise, resolved by the loader as of
	 * the session's own day. Empty is a real answer and renders the loads exactly
	 * as authored. */
	loadContexts: Record<string, ResolveContext>
	/** The exercise catalogue and the athlete's recent lifts, for the editable
	 * sentence's exercise combobox — empty on every inert branch, which never
	 * opens one. */
	exercises: ExerciseItem[]
	recentExerciseIds: string[]
	/** Logged sets per Step id — what the editable sentence warns about before an
	 * exercise change is attempted, and refused. */
	loggedSetsByStep: Record<string, number>
}) {
	const { workout, replanReason } = session
	const editable = session.status === 'scheduled'
	// Missing thresholds keeping structure lines from resolving to concrete
	// ranges — surfaced once as an honest Unavailable Metric note with a pointer
	// to the training settings, never papered over with fabricated ranges (#180).
	const unresolved = unresolvedThresholdReasons(workout, thresholds)
	// The Workout Shape strip belongs to the prescription, below the stanza
	// (the spec's card order — header, line, strip). Honest and lean (§8): it
	// derives only from what the steps state — no intent fallback — and with
	// zero paintable steps the region is entirely absent.
	const shapeSegments = deriveShapeStrip(workoutToNotationInput(workout), {
		thresholds,
	})
	return (
		<CardContent>
			{/* The Replan Note (ADR 0025): the stored reason a Week Replan
			    softened this prescription, shown with the prescription so the
			    "why" travels with the session. Rows written before round 2 hold
			    the generator's English and are read in Norwegian here, as I dag's
			    row reads them (`nbStoredReplanReason`; display only). Null
			    (never softened, or cleared by a rewrite) renders nothing. */}
			{replanReason ? (
				<p className="text-footnote text-foreground bg-status-under/10 mb-4 rounded-2xl px-3 py-2.5">
					<span className="font-semibold">{L.replanNote}</span>{' '}
					{nbStoredReplanReason(replanReason)}
				</p>
			) : null}
			{editable ? (
				<ScheduledWorkoutSentence
					session={session}
					thresholds={thresholds}
					exercises={exercises}
					recentExerciseIds={recentExerciseIds}
					loadContexts={loadContexts}
					loggedSetsByStep={loggedSetsByStep}
				/>
			) : (
				<ScoreStanza
					className="text-callout font-normal"
					notation={deriveWorkoutNotation(workoutToNotationInput(workout), {
						thresholds,
						loadContexts,
					})}
				/>
			)}
			<ShapeStrip segments={shapeSegments} className="mt-4" />
			{unresolved.length > 0 ? (
				<p className="text-footnote text-muted-foreground bg-muted mt-4 rounded-2xl px-3 py-2.5">
					{L.unresolved.lead} — {unresolved.map(nbUnavailableReason).join('; ')}
					. {L.unresolved.before}{' '}
					<Link
						to="/settings/training"
						className="text-foreground relative underline underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-3"
					>
						{L.unresolved.link}
					</Link>{' '}
					{L.unresolved.after}
				</p>
			) : null}
		</CardContent>
	)
}

// The Plan Adherence band on the app's status tokens (ADR 0085): under amber,
// on target the primary green, over blue-violet — more than asked, not
// alarming. The word is always beside the colour (design-system.md), and it
// is I dag's word for the same band (`NB_ADHERENCE_LABELS`).
const BAND_TONE: Record<AdherenceBand['tone'], { dot: string; wash: string }> =
	{
		under: { dot: 'bg-status-under', wash: 'bg-status-under/12' },
		'on-target': { dot: 'bg-status-on', wash: 'bg-status-on/12' },
		over: { dot: 'bg-status-over', wash: 'bg-status-over/12' },
	}

function AdherenceBandChip({ band }: { band: AdherenceBand }) {
	const tone = BAND_TONE[band.tone]
	return (
		<span
			className={cn(
				'text-caption text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
				tone.wash,
			)}
		>
			<span className={cn('size-1.5 rounded-full', tone.dot)} />
			{NB_ADHERENCE_LABELS[band.tone]}
		</span>
	)
}

const EM_DASH = '—'

// ── Structure Adherence (ADR 0034, #345) ─────────────────────────────────────
// The whole-session, display-derived verdict comparing a matched planned
// session's plan-blind detected structure against its prescription. Computed on
// demand from the two stored structures — never stored, and it never reads
// Planned TSS or Training Load (that carve-out is the whole point of ADR 0034).

/** Parse a stored detected structure (WorkoutStructureSchema JSON), or null. */
function parseDetectedStructure(
	json: string | null | undefined,
): WorkoutStructure | null {
	if (!json) return null
	try {
		const parsed = WorkoutStructureSchema.safeParse(JSON.parse(json))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * Rebuild a WorkoutStructure from the session's prescribed Workout rows — the
 * Block → Step → Intensity Target core the comparator reads, with the authoring
 * envelope dropped. Strength steps (never part of a run/bike interval plan) are
 * skipped, and the result is validated so a malformed prescription degrades to
 * null (no verdict) rather than a fabricated one.
 */
function plannedStructureFromWorkout(
	workout: WorkoutDetail,
): WorkoutStructure | null {
	const candidate = {
		discipline: workout.discipline,
		blocks: workout.blocks
			.map((block) => ({
				repeatCount: block.repeatCount ?? 1,
				steps: block.steps.flatMap((step) => {
					if (step.kind === 'rest') {
						return step.durationSec != null
							? [{ kind: 'rest', durationSec: step.durationSec }]
							: [{ kind: 'rest' }]
					}
					if (step.kind !== 'cardio') return []
					const intensity = parseAuthoredIntensity(step.intensity)
					return [
						{
							kind: 'cardio',
							discipline: step.discipline ?? workout.discipline,
							...(intensity ? { intensity } : {}),
							...(step.durationSec != null
								? { durationSec: step.durationSec }
								: step.distanceM != null
									? { distanceM: step.distanceM }
									: {}),
						},
					]
				}),
			}))
			.filter((b) => b.steps.length > 0),
	}
	const parsed = WorkoutStructureSchema.safeParse(candidate)
	return parsed.success ? parsed.data : null
}

/**
 * The Structure Adherence verdict for a session, or null when the slot has no
 * business rendering (ADR 0034): only a matched planned run/bike session with a
 * genuine prescription qualifies. With a gate-clearing detection it compares the
 * two structures; with a *structured* prescription but no confident detection it
 * degrades to the honest Unavailable state; otherwise it stays absent.
 *
 * **This gate inverts, and the inversion is the point.** Every other `detected`
 * read asks "is this still the machine's?"; this one asks the opposite — is there
 * a prescription worth comparing the detection *against*. An untouched `detected`
 * session is excluded because grading the engine's structure against itself is a
 * guaranteed `as-prescribed`; the moment the athlete corrects it, the two sides
 * genuinely differ and the comparison becomes the most useful thing on the
 * screen. That is why an adopted `detected` session belongs here.
 *
 * Before #460 that worked only by accident: adoption rewrote `source` to
 * `authored`, and this read picked it up as a side effect of the overload. With
 * origin and adoption split, the condition has to say what it always meant —
 * `authored`, `generated`, **or adopted** — because an adopted session now keeps
 * reading `detected` forever. Dropping `authored` or `generated` here would take
 * the verdict away from every hand-authored session in the app.
 */
function resolveStructureAdherence(
	session: SessionDetail,
): StructureAdherenceVerdict | null {
	const hasGenuinePrescription =
		session.adoptedAt != null ||
		session.source === 'authored' ||
		session.source === 'generated'
	if (!hasGenuinePrescription) return null
	const { workout, recording } = session
	if (!workout || !recording) return null
	if (!isDetectionDiscipline(workout.discipline)) return null
	const planned = plannedStructureFromWorkout(workout)
	if (!planned) return null
	const detected = parseDetectedStructure(recording.detection?.structureJson)
	if (detected) return structureAdherence(detected, planned)
	// No gate-clearing detection: only speak up for a structured prescription,
	// where the absence of confirmable structure is itself worth stating.
	return planned.blocks.some((b) => b.repeatCount >= 2)
		? 'not-verifiable'
		: null
}

// The two asserting verdicts get a coloured chip; `not-verifiable` renders as an
// honest muted Unavailable Metric, never a red "you failed" grade (ADR 0008).
const STRUCTURE_TONE: Record<
	'as-prescribed' | 'diverged',
	{ dot: string; wash: string }
> = {
	'as-prescribed': { dot: 'bg-status-on', wash: 'bg-status-on/12' },
	diverged: { dot: 'bg-status-under', wash: 'bg-status-under/12' },
}

/**
 * Structure Adherence shown beside the Adherence Band (ADR 0034): the load band
 * answers "did I train as hard as planned?", this answers "did I execute the
 * structure I planned?" — two independent signals a session can pass one of and
 * not the other. `not-verifiable` is the honest Unavailable Metric. The words
 * are this page's own (`WORKOUT_DETAIL_LABELS.structure`), keyed on the verdict
 * enum rather than on `describeStructureAdherence`'s English sentence.
 */
function StructureAdherenceRow({
	verdict,
}: {
	verdict: StructureAdherenceVerdict
}) {
	const detail = L.structure[verdict]
	return (
		<div
			data-structure-adherence
			data-structure-verdict={verdict}
			className="text-footnote mt-4 flex flex-wrap items-center gap-x-2 gap-y-1"
		>
			<span className="text-muted-foreground font-medium">
				{L.structure.title}
			</span>
			{verdict === 'not-verifiable' ? (
				<span className="text-muted-foreground">
					{EM_DASH} {detail.description}
				</span>
			) : (
				<>
					<span
						className={cn(
							'text-caption text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
							STRUCTURE_TONE[verdict].wash,
						)}
					>
						<span
							className={cn(
								'size-1.5 rounded-full',
								STRUCTURE_TONE[verdict].dot,
							)}
						/>
						{detail.label}
					</span>
					<span className="text-muted-foreground">— {detail.description}.</span>
				</>
			)}
		</div>
	)
}

/** A km figure the Norwegian way, `9,7 km` / `800 m`: `formatDistance`'s
 * rounding with a decimal comma. Display only. */
function nbDistance(meters: number): string {
	return meters >= 1000
		? sessionVolumeLabel(meters / 1000, 'km')
		: `${Math.round(meters)} m`
}

/** Speed as `31,2 km/t`, the Norwegian unit and decimal mark. */
function nbSpeed(metersPerSec: number): string {
	return `${(metersPerSec * 3.6).toFixed(1).replace('.', ',')} km/t`
}

/** A figure tile: the value the eye lands on, its label above, a quiet line
 * under. One shape for both comparison cards. */
function FigureTile({
	label,
	value,
	note,
	children,
}: {
	label: string
	value: string
	note: React.ReactNode
	children?: React.ReactNode
}) {
	return (
		<div className="bg-muted/60 rounded-3xl px-4 py-3">
			<dt className="text-caption text-muted-foreground">{label}</dt>
			<dd className="text-heading mt-1 tabular-nums">{value}</dd>
			<dd className="text-footnote text-muted-foreground mt-0.5 tabular-nums">
				{note}
			</dd>
			{children}
		</div>
	)
}

function PlannedVsActualSummary({ session }: { session: SessionDetail }) {
	const comparison = buildReviewComparison(session)
	const structureVerdict = resolveStructureAdherence(session)
	const num = (v: number | null) => (v != null ? formatLoad(v) : EM_DASH)
	const dur = (v: number | null) => (v != null ? nbDurationLabel(v) : EM_DASH)
	const dist = (v: number | null) => (v != null ? nbDistance(v) : EM_DASH)
	const P = L.plannedVsActual

	const cells: Array<{
		label: string
		actual: string
		planned: string
		band?: AdherenceBand
	}> = [
		{
			label: P.load,
			actual: num(comparison.tss.actual),
			planned: num(comparison.tss.planned),
			band: comparison.tss.band ?? undefined,
		},
		{
			label: P.duration,
			actual: dur(comparison.duration.actual),
			planned: dur(comparison.duration.planned),
		},
		{
			label: P.distance,
			actual: dist(comparison.distance.actual),
			planned: dist(comparison.distance.planned),
		},
	]

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-heading">{P.title}</CardTitle>
				<CardDescription className="text-footnote">
					{comparison.tss.band ? (
						<>
							<span className="text-foreground font-medium">
								{NB_ADHERENCE_LABELS[comparison.tss.band.tone]}
							</span>{' '}
							— {L.adherenceNote[comparison.tss.band.tone]}.
						</>
					) : (
						P.fallback
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
					{cells.map((cell) => (
						<FigureTile
							key={cell.label}
							label={cell.label}
							value={cell.actual}
							note={P.planned(cell.planned)}
						>
							{cell.band ? (
								<dd className="mt-2">
									<AdherenceBandChip band={cell.band} />
								</dd>
							) : null}
						</FigureTile>
					))}
				</dl>
				{structureVerdict ? (
					<StructureAdherenceRow verdict={structureVerdict} />
				) : null}
			</CardContent>
		</Card>
	)
}

/** A signed duration change, e.g. "+5 min" / "−3 min". Direction is neutral — a
 * longer or shorter session is informational here, not better or worse. */
function signedDuration(seconds: number): string {
	return `${seconds > 0 ? '+' : '−'}${nbDurationLabel(Math.abs(seconds))}`
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
		<FigureTile
			label={label}
			value={metric.current != null ? format(metric.current) : EM_DASH}
			note={
				metric.previous != null ? (
					<>
						{L.vsLast.lastTime(format(metric.previous))}
						{metric.change != null && metric.change !== 0 ? (
							<span className="text-foreground ml-1 font-medium">
								({formatChange(metric.change)})
							</span>
						) : null}
					</>
				) : (
					L.vsLast.lastTime(EM_DASH)
				)
			}
		/>
	)
}

/**
 * "Mot forrige gang": this completed session against the last similar one
 * (same discipline + stated **Session Archetype**, ADR 0055). Truthful metrics
 * only — TSS and recorded duration today. With no prior similar session it's
 * an Unavailable state, never a fabricated delta (ADR 0008).
 *
 * **Three absences, said three ways.** The header names what the session
 * *reads* as (ADR 0054), and this card used to answer "no archetype" right
 * beside it — the contradiction the round-2 audit found. A reading is not the
 * stored type the lookup is keyed on, so a read session now says exactly that:
 * it reads as threshold, and a comparison needs the type stored on the
 * session. A session nothing can be read from has no archetype at all; a
 * stated one with no predecessor is the first of its kind.
 */
function VsLastSessionSummary({
	session,
	lastSimilar,
	archetype,
}: {
	session: SessionDetail
	lastSimilar: SimilarSession | null
	archetype: SessionArchetypeView | null
}) {
	const timeZone = useAthleteTimezone()
	const comparison = buildVsLastComparison(session, lastSimilar)
	const V = L.vsLast
	// The comparison key is discipline + **Session Archetype** since ADR 0055, so
	// the sentence names the archetype the lookup actually used — and only a
	// *stated* one, because the key is the stored column and a reading is not it.
	const kind =
		archetype?.kind === 'stated'
			? V.kind(
					NB_SESSION_ARCHETYPE_LABELS[archetype.archetype],
					nbDisciplineLabel(session.workout?.discipline ?? ''),
				)
			: null

	if (!comparison) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-heading">{V.title}</CardTitle>
					<CardDescription className="text-footnote" data-vs-last-absence>
						{kind
							? V.firstOfKind(kind)
							: archetype?.kind === 'read'
								? V.readOnly(
										NB_SESSION_ARCHETYPE_LABELS[archetype.reading.archetype],
									)
								: V.noArchetype}
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
			label: V.load,
			metric: comparison.tss,
			format: formatLoad,
			formatChange: formatSigned,
		},
		{
			label: V.duration,
			metric: comparison.durationSec,
			format: nbDurationLabel,
			formatChange: signedDuration,
		},
	]

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-heading">{V.title}</CardTitle>
				<CardDescription className="text-footnote">
					{V.lead(
						kind ??
							nbSessionNoun(session.workout?.discipline ?? '').toLowerCase(),
						formatNbDayMonth(comparison.previousDate, timeZone),
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
		<Card>
			<CardHeader>
				<CardTitle className="text-heading">{L.telemetry.title}</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="bg-muted/60 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-3xl px-4 py-10 text-center">
					<Icon name="bar-chart" size="lg" />
					<p className="text-callout text-foreground">
						{L.telemetry.unavailableTitle}
					</p>
					<p className="text-footnote max-w-sm">
						{L.telemetry.unavailableBody}
					</p>
				</div>
			</CardContent>
		</Card>
	)
}

type Recording = NonNullable<SessionDetail['recording']>
type Metric = { label: string; value: string }

/** Build the metric tiles a recording actually has — omit anything the provider
 * didn't send so the grid never shows empty cells. */
function recordingMetrics(rec: Recording, sessionTss: number | null): Metric[] {
	const tss = sessionTss ?? rec.tssValue
	const R = L.recording
	const bpm = (v: number) => `${Math.round(v)} ${L.telemetry.bpm}`
	const watts = (v: number) => `${Math.round(v)} W`

	const candidates: Array<Metric | null> = [
		rec.distanceM != null
			? { label: R.distance, value: nbDistance(rec.distanceM) }
			: null,
		{ label: R.movingTime, value: nbDurationLabel(rec.durationSec) },
		rec.paceAvgSecPerKm != null
			? { label: R.avgPace, value: formatPace(rec.paceAvgSecPerKm) }
			: null,
		rec.speedMaxMps != null
			? { label: R.maxSpeed, value: nbSpeed(rec.speedMaxMps) }
			: null,
		rec.hrAvg != null ? { label: R.avgHr, value: bpm(rec.hrAvg) } : null,
		rec.hrMax != null ? { label: R.maxHr, value: bpm(rec.hrMax) } : null,
		rec.powerAvg != null
			? { label: R.avgPower, value: watts(rec.powerAvg) }
			: null,
		rec.powerWeightedAvg != null
			? { label: R.normPower, value: watts(rec.powerWeightedAvg) }
			: null,
		rec.powerMax != null
			? { label: R.maxPower, value: watts(rec.powerMax) }
			: null,
		rec.cadenceAvg != null
			? {
					label: R.avgCadence,
					value: `${Math.round(rec.cadenceAvg)} ${R.cadenceUnit(rec.discipline)}`,
				}
			: null,
		rec.elevationGainM != null
			? { label: R.elevation, value: `${Math.round(rec.elevationGainM)} m` }
			: null,
		rec.kilojoules != null
			? { label: R.work, value: `${Math.round(rec.kilojoules)} kJ` }
			: null,
		tss != null ? { label: R.load, value: formatLoad(tss) } : null,
	]
	return candidates.filter((m): m is Metric => m !== null)
}

function RecordingPanel({
	recording,
	relinkTargets,
	onPlannedSession,
	sessionTss,
}: {
	recording: Recording
	relinkTargets: RelinkTarget[]
	onPlannedSession: boolean
	/**
	 * The session's own TSS. A Recording on a done session is priced on the
	 * session (the import row keeps a figure only while no counted session
	 * carries it), so the session's number is the one the load counted.
	 */
	sessionTss: number | null
}) {
	const metrics = recordingMetrics(recording, sessionTss)
	const phaseBars = parseRecordingPhaseBars(recording.phaseBarsJson)
	const provider = recording.externalProvider
		? providerLabel(recording.externalProvider)
		: null

	return (
		<Card>
			<CardHeader className="flex flex-row items-baseline justify-between gap-3">
				<CardTitle className="text-heading">{L.recording.title}</CardTitle>
				{provider ? (
					<span className="text-overline text-muted-foreground uppercase">
						{provider}
					</span>
				) : null}
			</CardHeader>
			<CardContent className="space-y-4">
				{phaseBars.length > 0 ? (
					<div className="space-y-1">
						<p className="text-caption text-muted-foreground">
							{L.recording.zones}
						</p>
						<ProfileBars bars={phaseBars} className="h-8" />
					</div>
				) : null}

				<dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
					{metrics.map((m) => (
						<div key={m.label} className="space-y-0.5">
							<dt className="text-caption text-muted-foreground">{m.label}</dt>
							<dd className="text-callout tabular-nums">{m.value}</dd>
						</div>
					))}
				</dl>

				{recording.polyline ? (
					<div className="bg-muted/60 text-foreground/80 rounded-3xl p-3">
						<RouteSketch
							polyline={recording.polyline}
							className="mx-auto h-48 w-full"
						/>
					</div>
				) : null}

				<WrongSessionControls
					relinkTargets={relinkTargets}
					onPlannedSession={onPlannedSession}
				/>
			</CardContent>
		</Card>
	)
}

function relinkTargetLabel(target: RelinkTarget, timeZone: string) {
	const discipline = target.discipline
		? ` — ${nbDisciplineLabel(target.discipline)}`
		: ''
	return `${target.title}${discipline} · ${formatTime(new Date(target.scheduledAt), timeZone)}`
}

type RelinkTarget = {
	id: string
	/** A Date from the loader; an ISO string once serialized to the client. */
	scheduledAt: Date | string
	title: string
	discipline: string | null
}

/**
 * "Feil økt?" — the fix-up the Activity Inbox used to host (ADR 0049).
 * Activities auto-save, and auto-match is a guess, so the athlete needs a way
 * to correct it: move the Recording onto another planned session from the same
 * day, or lift it off the plan onto a session of its own. Both keep the
 * activity attached to something; neither can strand it. Renders nothing when
 * there is no correction to offer.
 */
function WrongSessionControls({
	relinkTargets,
	onPlannedSession,
}: {
	relinkTargets: RelinkTarget[]
	onPlannedSession: boolean
}) {
	const timeZone = useAthleteTimezone()
	const navigation = useNavigation()
	const busy = navigation.state !== 'idle'
	const W = L.wrongSession

	if (relinkTargets.length === 0 && !onPlannedSession) return null

	return (
		<div className="space-y-3 pt-2">
			<p className="text-overline text-muted-foreground uppercase">{W.title}</p>

			{relinkTargets.length > 0 ? (
				<Form method="post" className="flex flex-wrap items-center gap-2">
					<input type="hidden" name="intent" value="relink" />
					<label htmlFor="relink-target" className="sr-only">
						{W.moveTo}
					</label>
					<Select
						name="targetSessionId"
						defaultValue={relinkTargets[0]!.id}
						items={relinkTargets.map((target) => ({
							value: target.id,
							label: relinkTargetLabel(target, timeZone),
						}))}
					>
						<SelectTrigger id="relink-target" className="min-w-48 flex-1">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{relinkTargets.map((target) => (
								<SelectItem key={target.id} value={target.id}>
									{relinkTargetLabel(target, timeZone)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button type="submit" variant="secondary" disabled={busy}>
						{W.move}
					</Button>
				</Form>
			) : null}

			{onPlannedSession ? (
				<Form method="post" className="space-y-1">
					<input type="hidden" name="intent" value="detach" />
					<Button type="submit" variant="outline" disabled={busy}>
						{W.detach}
					</Button>
					<p className="text-footnote text-muted-foreground">{W.detachNote}</p>
				</Form>
			) : null}
		</div>
	)
}

function SessionLogSection({
	sessionLog,
}: {
	sessionLog: SessionDetail['sessionLog']
}) {
	const actionData = useActionData<typeof action>()
	// The action serves several intents; only a log submission carries `result`.
	// A failed Recording re-link must not feed its error into the log form — nor
	// does a saved autosave, which carries no submission result at all (#501).
	const logActionData =
		actionData && 'result' in actionData && actionData.result !== undefined
			? { result: actionData.result }
			: undefined

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-heading">{L.log.title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{sessionLog ? <SessionLogDisplay sessionLog={sessionLog} /> : null}
				<SessionLogForm
					defaultContent={sessionLog?.content}
					defaultRpe={sessionLog?.rpe}
					actionData={logActionData}
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
		<div className="bg-muted/60 rounded-3xl px-4 py-3">
			<p className="text-body whitespace-pre-wrap">{sessionLog.content}</p>
			{sessionLog.rpe != null ? (
				<p className="text-footnote text-muted-foreground mt-2 tabular-nums">
					{L.log.rpeValue(sessionLog.rpe)}
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
	const rpeLabelId = `${form.id}-rpe-label`

	return (
		<Form method="POST" {...getFormProps(form)}>
			<fieldset className="space-y-4">
				<legend className="text-callout">
					{defaultContent ? L.log.updateLegend : L.log.writeLegend}
				</legend>

				<TextareaField
					labelProps={{ children: L.log.label }}
					textareaProps={{
						...getTextareaProps(fields.content),
						placeholder: L.log.placeholder,
					}}
					errors={fields.content.errors as string[] | undefined}
				/>

				<div className="space-y-2">
					<p id={rpeLabelId} className="text-caption text-muted-foreground">
						{L.log.rpe}
					</p>
					{/* Ten 44px targets (ADR 0028): five to a row on a phone, all ten
					    on one line from `sm`. They were 36px. */}
					<div
						className="grid grid-cols-5 gap-1.5 sm:grid-cols-10"
						role="group"
						aria-labelledby={rpeLabelId}
						aria-label={L.log.rpeGroup}
					>
						{RPE_VALUES.map((value) => {
							const pressed = fields.rpe.value === String(value)
							return (
								<Button
									key={value}
									type="button"
									variant={pressed ? 'default' : 'outline'}
									className="h-11 min-w-11 px-0 tabular-nums"
									onClick={() => {
										const input = document.querySelector<HTMLInputElement>(
											`input[name="${fields.rpe.name}"]`,
										)
										if (input) {
											const newValue =
												input.value === String(value) ? '' : String(value)
											input.value = newValue
											input.dispatchEvent(new Event('input', { bubbles: true }))
											input.dispatchEvent(
												new Event('change', { bubbles: true }),
											)
										}
									}}
									aria-pressed={pressed}
								>
									{value}
								</Button>
							)
						})}
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
					variant="secondary"
					status={form.status === 'error' ? 'error' : 'idle'}
				>
					{defaultContent ? L.log.update : L.log.save}
				</StatusButton>
				<ErrorList errors={form.errors as string[] | undefined} />
			</fieldset>
		</Form>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
