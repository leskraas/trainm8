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
						<AlertDialogDescription>{L.deleteDialog.body}</AlertDialogDescription>
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
								{isUnadoptedDetected(session) ||
								archetype?.kind === 'read' ? (
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
		const idle =
			'requestIdleCallback' in window
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
			if ('cancelIdleCallback' in window) window.cancelIdleCallback(idle)
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
						{view.kind === 'read'
							? L.archetype.read
							: L.archetype.unreadTitle}
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
			    "why" travels with the session. Rendered verbatim from the row;
			    null (never softened, or cleared by a rewrite) renders nothing. */}
			{replanReason ? (
				<p className="text-footnote text-foreground bg-status-under/10 mb-4 rounded-2xl px-3 py-2.5">
					<span className="font-semibold">{L.replanNote}</span> {replanReason}
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
					{L.unresolved.lead} — {unresolved.join('; ')}. {L.unresolved.before}{' '}
					<Link
						to="/settings/training"
						className="text-foreground relative underline underline-offset-2 after:absolute after:-inset-y-3 after:inset-x-0"
					>
						{L.unresolved.link}
					</Link>{' '}
					{L.unresolved.after}
				</p>
			) : null}
		</CardContent>
	)
}
