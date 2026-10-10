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
							className={cn('size-1.5 rounded-full', STRUCTURE_TONE[verdict].dot)}
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
						kind ?? nbSessionNoun(session.workout?.discipline ?? '').toLowerCase(),
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
											input.dispatchEvent(new Event('change', { bubbles: true }))
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
