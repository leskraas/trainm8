R = 'SESONG_REFUSAL_LABELS'
PAIRS = [
# --- imports -------------------------------------------------------------
("""import {
	formatDate,
	formatEmphasisLabel,
	formatPct1RMBand,
	formatPct1RMs,
	formatRateField,
	formatSessionCounts,
	formatSignedPercent,
	formatVolumeTotal,
	formatWeeklyVolume,
	formatWeekSpan,
} from '#app/utils/format.ts'
import {
	ACCUMULATED_SPAN_LABELS,
	ATTACH_EVENT_LABELS,
	ATTACH_EVENT_REFUSAL_LABELS,
	attachedEventSentence,
	APP_TAB_LABELS,
	BOUNDARY_STEP_OUT_OF_FORCE_LABELS,
	DISCIPLINE_LABELS,
	OPEN_ENDED_PLAN_LABEL,
	openEndedBlockLabel,
	PHILOSOPHY_SWITCH_LABELS,
	PRESET_GALLERY_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	SEASON_ADVANCED_LABELS,
	SEASON_EDIT_LABELS,
	STRENGTH_OFFER_LABELS,
	switchedPhilosophySentence,
	QUALITY_ZONE_LABELS,
	STRENGTH_GOAL_SENTENCE_LABELS,
	UNAVAILABLE_READING_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
	type BoundaryStepOutOfForce,
} from '#app/utils/labels.ts'""",
"""import {
	formatDate,
	formatNbDate,
	formatNbDayMonth,
	formatNbEmphasisLabel,
	formatNbPct1RMBand,
	formatNbPct1RMs,
	formatNbSignedPercent,
	formatNbVolumeTotal,
	formatNbWeeklyVolume,
	formatRateField,
} from '#app/utils/format.ts'
import {
	ATTACH_EVENT_LABELS,
	ATTACH_EVENT_REFUSAL_LABELS,
	attachedEventSentence,
	APP_TAB_LABELS,
	isoWeekSpanLabel,
	NB_ACCUMULATED_SPAN_LABELS,
	NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS,
	NB_QUALITY_ZONE_LABELS,
	NB_STRENGTH_GOAL_SENTENCE_LABELS,
	NB_UNAVAILABLE_READING_LABELS,
	NB_WEEK_ROLE_LABELS,
	NB_WEEKLY_UNITS,
	nbPhaseName,
	nbTrackName,
	OPEN_ENDED_PLAN_LABEL,
	openEndedBlockLabel,
	PHILOSOPHY_SWITCH_LABELS,
	PRESET_GALLERY_LABELS,
	PHILOSOPHY_SWITCH_REFUSAL_LABELS,
	SEASON_ADVANCED_LABELS,
	SEASON_EDIT_LABELS,
	SESONG_ANCHOR_LABELS,
	SESONG_COPY_LABELS,
	SESONG_LIFTING_LABELS,
	SESONG_NOTICE_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_PATTERN_LABELS,
	SESONG_REFUSAL_LABELS,
	SESONG_SEGMENT_LABELS,
	SESONG_TRACK_LABELS,
	STRENGTH_OFFER_LABELS,
	switchedPhilosophySentence,
	type BoundaryStepOutOfForce,
} from '#app/utils/labels.ts'"""),
("export const meta: Route.MetaFunction = () => [{ title: 'Plan | Trainm8' }]",
 "export const meta: Route.MetaFunction = () => [\n\t{ title: SESONG_PAGE_LABELS.metaTitle },\n]"),
("""/**
 * The two readings' own names. Not a domain enum — **Block** is a UI word only
 * (GLOSSARY.md, Plan Outline phase) and these label a view, so they live beside
 * the view rather than in `labels.ts`.
 */
const TAB_LABELS: Record<Tab, string> = { blocks: 'Blocks', weeks: 'Weeks' }""",
"""/** The two readings' own names, in the page's Norwegian (`labels.ts`). */
const TAB_LABELS: Record<Tab, string> = {
	blocks: SESONG_PAGE_LABELS.blocks,
	weeks: SESONG_PAGE_LABELS.weeks,
}"""),
# --- form schemas ----------------------------------------------------------
("""				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Type a percentage, or leave it blank',
				})""",
"""				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: SESONG_SEGMENT_LABELS.typeRate,
				})"""),
("""				message: 'A whole number of sessions, or blank for none',""",
"""				message: SESONG_SEGMENT_LABELS.wholeSessions,"""),
("""				message: `Between 0 and ${MAX_QUALITY_SESSIONS_PER_WEEK} sessions a week`,""",
"""				message: SESONG_SEGMENT_LABELS.sessionRange(
					MAX_QUALITY_SESSIONS_PER_WEEK,
				),"""),
("""			.number({ errorMap: () => ({ message: 'How many weeks is this phase?' }) })""",
"""			.number({
				errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.weeks }),
			})"""),
("""const RhythmField = z.enum(RHYTHMS, {
	errorMap: () => ({ message: 'Pick how this phase recovers' }),
})""",
"""const RhythmField = z.enum(RHYTHMS, {
	errorMap: () => ({ message: SESONG_PHASE_FIELD_LABELS.rhythm }),
})"""),
("""	errorMap: () => ({ message: 'Pick which discipline this track measures' }),""",
"""	errorMap: () => ({ message: SESONG_TRACK_LABELS.disciplineRequired }),"""),
("""	errorMap: () => ({ message: 'Pick the unit you plan this track in' }),""",
"""	errorMap: () => ({ message: SESONG_TRACK_LABELS.unitRequired }),"""),
("""			errorMap: () => ({ message: 'A starting volume is required' }),
		})
		.positive('Your starting volume is more than zero'),""",
"""			errorMap: () => ({ message: SESONG_TRACK_LABELS.anchorRequired }),
		})
		.positive(SESONG_TRACK_LABELS.anchorPositive),"""),
("""		.number({ errorMap: () => ({ message: 'Which day of the week?' }) })""",
"""		.number({
			errorMap: () => ({ message: SESONG_PATTERN_LABELS.whichDay }),
		})"""),
("""				message: 'How big is this day next to the others? e.g. 1, or 2.5',""",
"""				message: SESONG_PATTERN_LABELS.weightRequired,"""),
# --- action toasts ---------------------------------------------------------
("""				title: 'A week to start from',
				description: starterSentence(started.proposal),""",
"""				title: SESONG_PATTERN_LABELS.starterToast,
				description: starterSentence(started.proposal),"""),
("""				title: 'Copied into your plan',
				description:
					'It’s yours now — edit anything. Nothing stays linked to the shape you picked.',""",
"""				title: SESONG_REFUSAL_LABELS.presetDone,
				description: SESONG_REFUSAL_LABELS.presetDoneDetail,"""),
("""				title: 'Your plan lands on your event',
				description: `${fitProposalSentence(fitted.proposal)} Resize any block back if that is not what you wanted.`,""",
"""				title: SESONG_REFUSAL_LABELS.fitDone,
				description: `${fitProposalSentence(fitted.proposal)}${SESONG_REFUSAL_LABELS.fitTail}`,"""),
("""					formatDate(new Date(`${switched.fromWeekKey}T12:00:00Z`), 'UTC'),""",
"""					formatNbDate(new Date(`${switched.fromWeekKey}T12:00:00Z`), 'UTC'),"""),
("""				title: 'Plan deleted',
				description: 'Your event and your trained sessions are untouched.',""",
"""				title: SESONG_REFUSAL_LABELS.deleted,
				description: SESONG_REFUSAL_LABELS.deletedDetail,"""),
("""	return refuse('That is not something this page can do.')""",
"""	return refuse(SESONG_REFUSAL_LABELS.unknown)"""),
# --- refusal constants -----------------------------------------------------
("""const PHASE_GONE = 'That phase is no longer part of this plan.'
const OUTLINE_GONE = 'That plan is not available to edit.'
const POSITION_UNREADABLE = 'Choose where the new phase goes.'
const SHAPE_UNKNOWN = 'That is not a shape this app ships. Nothing was changed.'""",
f"""const PHASE_GONE = {R}.phaseGone
const OUTLINE_GONE = {R}.outlineGone
const POSITION_UNREADABLE = {R}.position
const SHAPE_UNKNOWN = {R}.shapeUnknown"""),
("""		case 'no-event':
			return 'This plan has no event, so there is nothing to fit it to.'
		case 'already-fits':
			return 'Your plan already ends on your event’s week.'
		case 'cannot-fit':
			return 'Your blocks cannot be resized to reach your event without one of them disappearing. Shorten or remove a block yourself.'""",
f"""		case 'no-event':
			return {R}.noEvent
		case 'already-fits':
			return {R}.alreadyFits
		case 'cannot-fit':
			return {R}.cannotFit"""),
("""/**
 * An open-ended plan resting behind a plan toward a race (ADR 0079). Said in
 * the #505 surface's Norwegian, like the plan's own hero (ADR 0081).
 */
const PLAN_RESTING =
	'Planen hviler mens planen mot løpet ditt er i gang, så ingen uker legges for den nå.'
const PATTERN_GONE = 'That week pattern is no longer part of this plan.'""",
f"""/** An open-ended plan resting behind a plan toward a race (ADR 0079). */
const PLAN_RESTING = {R}.planResting
const PATTERN_GONE = {R}.patternGone"""),
("""const NO_STARTER_WEEK =
	'Your training days say you train on no days, so there is no week to build. Set your training days in your athlete profile, or name a pattern and add the days yourself.'
const DAY_GONE = 'That day is no longer part of this pattern.'""",
f"""const NO_STARTER_WEEK = {R}.noStarterWeek
const DAY_GONE = {R}.dayGone"""),
("""const TRACK_GONE = 'That training track is no longer part of this plan.'
const WEEK_OUTSIDE_PLAN = 'That week is not in your plan.'""",
f"""const TRACK_GONE = {R}.trackGone
const WEEK_OUTSIDE_PLAN = {R}.weekOutside"""),
("""const WEEK_NOT_ONE_OF_THE_PLANS =
	'That week is not one of your plan’s weeks. Pick a week between your first and your last, or add weeks to your plan first.'
const ANCHOR_GONE = 'That anchor is no longer part of this plan.'
const TRACK_MISSING = 'Choose which training track this day draws from.'
const WORKOUT_MISSING =
	'A fixed day prescribes a workout, so choose the session it stamps.'
const DAY_KIND_UNKNOWN =
	'A day is either a fixed session or a share of the week. Nothing was added.'
const BLOCK_GONE = 'That lifting block is no longer part of this plan.'""",
f"""const WEEK_NOT_ONE_OF_THE_PLANS = {R}.weekNotInPlan
const ANCHOR_GONE = {R}.anchorGone
const TRACK_MISSING = {R}.trackMissing
const WORKOUT_MISSING = {R}.workoutMissing
const DAY_KIND_UNKNOWN = {R}.dayKindUnknown
const BLOCK_GONE = {R}.blockGone"""),
("""			return 'Your plan already measures that discipline. One training track each, so edit the one you have.'
		case 'last-track':
			return 'A plan measures at least one discipline. Delete the plan itself if you want none.'""",
f"""			return {R}.alreadyTracked
		case 'last-track':
			return {R}.lastTrack"""),
("""	return error.issues[0]?.message ?? 'That is not a value this phase can take.'""",
f"""	return error.issues[0]?.message ?? {R}.badValue"""),
("""		case 'plan-too-long':
			return 'That would run your plan past two years. Shorten a phase first.'
		case 'last-phase':
			return 'A plan keeps at least one phase. Delete the plan itself if that is what you want.'""",
f"""		case 'plan-too-long':
			return {R}.planTooLong
		case 'last-phase':
			return {R}.lastPhase"""),
("""			return 'That phase is already at that end of your season.'""",
f"""			return {R}.phaseAtEdge"""),
("""			return 'That workout is no longer one of yours. Pick another session for this day.'""",
f"""			return {R}.workoutGone"""),
("""			return 'That session is a different discipline from this day’s track, and a day draws its volume from its own track. Pick a session on that track.'""",
f"""			return {R}.workoutMismatch"""),
("""			return 'That is already at that end of its order.'""",
f"""			return {R}.atEdge"""),
("""			return 'Your season keeps its first anchor — every week up to your next re-anchor is derived from it. Change its value instead, or remove a later re-anchor.'""",
f"""			return {R}.earliestAnchor"""),
# --- copy ------------------------------------------------------------------
("""		title: 'Week copied',
		description: copySentence(copied.report),""",
"""		title: SESONG_COPY_LABELS.done,
		description: copySentence(copied.report),"""),
("""function copySentence(report: CopyWeekReport): string {
	const sessions = `${report.sessions} ${report.sessions === 1 ? 'session' : 'sessions'}`
	const replaced =
		report.replaced > 0
			? ` ${report.replaced} ${report.replaced === 1 ? 'session was' : 'sessions were'} replaced.`
			: ''
	const skipped = copySkippedSentence(report.skipped)
	return `${sessions} from week ${report.sourceWeekInPlan} onto week ${report.targetWeekInPlan}, exactly as you wrote them. Edit either week — the other does not move.${replaced}${skipped}`
}""",
"""function copySentence(report: CopyWeekReport): string {
	const skipped = copySkippedSentence(report.skipped)
	return `${SESONG_COPY_LABELS.sentence(
		report.sessions,
		report.sourceWeekInPlan,
		report.targetWeekInPlan,
		report.replaced,
	)}${skipped}`
}"""),
("""	'no-prescription':
		'A session with no workout behind it was left out — there was nothing to copy.',
}""",
"""	'no-prescription': SESONG_COPY_LABELS.noPrescription,
}"""),
("""		case 'same-week':
			return 'That is the same week twice. Pick a different week to copy it onto.'
		case 'source-week-empty':
			return 'That week has no sessions in it, so there is nothing to copy. Pick a week you have already filled in.'""",
f"""		case 'same-week':
			return {R}.sameWeek
		case 'source-week-empty':
			return {R}.sourceEmpty"""),
("""			return 'That week only holds recorded activities, which carry no workout to copy. Nothing was changed.'""",
f"""			return {R}.nothingToCopy"""),
# --- strength refusals -----------------------------------------------------
("""			return 'Lifting blocks belong to a strength track, and that one is an endurance track. Nothing was changed.'""",
f"""			return {R}.notStrengthTrack"""),
("""			return 'That block would run past the last week of your plan. Make it shorter, open it earlier, or add weeks to your plan.'
		case 'week-already-opens-a-segment':
			return 'Another lifting block already opens that week. Open this one on a different week.'
		case 'segments-overlap':
			return 'That block would overlap another lifting block. Blocks sit one after another, and the weeks between two of them are no lifting.'""",
f"""			return {R}.segmentPastPlan
		case 'week-already-opens-a-segment':
			return {R}.weekOpensSegment
		case 'segments-overlap':
			return {R}.segmentsOverlap"""),
# --- hero ------------------------------------------------------------------
("""					<PlanHero
						eyebrow="You’re building toward"
""",
"""					<PlanHero
						eyebrow={SESONG_PAGE_LABELS.heroToward}
"""),
("""							<>
								{/* The Event's date is a calendar day anchor, formatted in UTC like
								    every other Event date in the app (ADR 0023). */}
								{formatDate(season.eventDate, 'UTC')} ·{' '}
								{totalWeeks === 1 ? '1 week' : `${totalWeeks} weeks`} from{' '}
								{formatDate(season.phases[0]!.startsAt, timezone)}
							</>""",
"""							// The Event's date is a calendar day anchor, formatted in UTC
							// like every other Event date in the app (ADR 0023).
							SESONG_PAGE_LABELS.heroMeta(
								formatNbDate(season.eventDate, 'UTC'),
								totalWeeks,
								formatNbDate(season.phases[0]!.startsAt, timezone),
							)"""),
("""								<Icon name="calendar" size="sm" />
								Change what you’re building toward""",
"""								<Icon name="calendar" size="sm" />
								{SESONG_PAGE_LABELS.heroChange}"""),
("""							<>
								Ingen løp og ingen sluttdato · fra{' '}
								{formatDate(season.phases[0]!.startsAt, timezone)}
							</>""",
"""							SESONG_PAGE_LABELS.openEndedMeta(
								formatNbDate(season.phases[0]!.startsAt, timezone),
							)"""),
("""						Planen hviler mens planen mot løpet ditt er i gang. Den tar over
						igjen når løpet er over.{' '}
						<Link to="/training/plan" className="underline">
							Åpne løpsplanen
						</Link>""",
"""						{SESONG_PAGE_LABELS.resting}{' '}
						<Link to="/training/plan" className="underline">
							{SESONG_PAGE_LABELS.restingLink}
						</Link>"""),
("""					title="What this plan comes to\"""",
"""					title={SESONG_PAGE_LABELS.summaryTitle}"""),
("""					label="Season views\"""",
"""					label={SESONG_PAGE_LABELS.readings}"""),
# --- span headline ---------------------------------------------------------
("""									<span>
										{group.disciplines
											.map((discipline) => DISCIPLINE_LABELS[discipline])
											.join(' · ')}
									</span>
									{group.marker === 'derived' ? (
										// The marker is binary and shown on the figure it qualifies,
										// never as a footnote (ADR 0045 §9).
										<Badge variant="secondary">Derived</Badge>
									) : null}""",
"""									<span>
										{SESONG_PAGE_LABELS.spanTracks(
											group.disciplines.map(nbTrackName),
										)}
									</span>
									{group.marker === 'derived' ? (
										// The marker is binary and shown on the figure it qualifies,
										// never as a footnote (ADR 0045 §9).
										<Badge variant="secondary">
											{SESONG_PAGE_LABELS.derived}
										</Badge>
									) : null}"""),
("""							{formatWeeklyVolume(group.span.anchor, group.currency)} →{' '}
							{formatWeeklyVolume(group.span.peak, group.currency)}
						</p>
						<p className="text-muted-foreground text-sm">
							{group.marker === 'derived' &&
							accumulatesAcrossDisciplines(group.currency)
								? `${ACCUMULATED_SPAN_LABELS[group.currency]} `
								: null}
							Where you start to your peak loading week
							{peakWeek ? `, week ${peakWeek.weekInPlan}` : null} · read from
							your {several ? 'anchors' : 'anchor'} and your ramps, never added
							up from sessions
							{group.total == null
								? null
								: ` · ${formatVolumeTotal(group.total, group.currency)} across the season`}
						</p>""",
"""							{formatNbWeeklyVolume(group.span.anchor, group.currency)} →{' '}
							{formatNbWeeklyVolume(group.span.peak, group.currency)}
						</p>
						<p className="text-muted-foreground text-sm">
							{group.marker === 'derived' &&
							accumulatesAcrossDisciplines(group.currency)
								? `${NB_ACCUMULATED_SPAN_LABELS[group.currency]} `
								: null}
							{SESONG_PAGE_LABELS.spanNote(
								peakWeek ? weekNumberOf(peakWeek) : null,
								several,
							)}
							{group.total == null
								? null
								: SESONG_PAGE_LABELS.spanTotal(
										formatNbVolumeTotal(group.total, group.currency),
									)}
						</p>"""),
# --- dismissible -----------------------------------------------------------
("""			<p ref={closed} tabIndex={-1} className="sr-only">
				The {name} is dismissed. It comes back if what it says changes.
			</p>""",
"""			<p ref={closed} tabIndex={-1} className="sr-only">
				{SESONG_NOTICE_LABELS.dismissed(name)}
			</p>"""),
("""					aria-label={`Dismiss the ${name}`}""",
"""					aria-label={SESONG_NOTICE_LABELS.dismiss(name)}"""),
# --- ramp guard ------------------------------------------------------------
("""			name="ramp note"
		>
			<ul className="space-y-1">
				{warnings.map((warning, position) => {
					const phase = phases[warning.phaseIndex]?.name ?? 'A block'
					const rate =
						warning.subject === 'ramp'
							? `ramps ${formatSignedPercent(warning.authored)} a loading week`
							: `steps ${formatSignedPercent(warning.authored)} at its opening`
					return (
						// The position disambiguates: two tracks can warn about the same
						// phase and the same subject, once each.
						<li key={`${warning.phaseIndex}-${warning.subject}-${position}`}>
							{warning.lifting ? (
								<>
									<span className="font-medium">
										{DISCIPLINE_LABELS[warning.discipline]}
									</span>{' '}
									{rate}, in the block opening in {phase}.
								</>
							) : (
								<>
									<span className="font-medium">{phase}</span> {rate}.
								</>
							)}
						</li>
					)
				})}
			</ul>
			<p>
				The convention is {formatSignedPercent(RAMP_GUARD_MAX)} — per loading
				week for a ramp, and in one go for a step at an opening. Bigger than
				that is unusual rather than unsafe: no volume rule has been shown to
				prevent injury, so this is a note and not a limit. Your numbers are
				saved exactly as you authored them.
				{anyStrength
					? ' A lifting block is dated rather than tied to a phase, so the phase named beside one is only where its opening week falls.'
					: null}
			</p>""",
"""			name={SESONG_NOTICE_LABELS.rampName}
		>
			<ul className="space-y-1">
				{warnings.map((warning, position) => {
					const stored = phases[warning.phaseIndex]?.name
					const phase = stored
						? nbPhaseName(stored)
						: SESONG_NOTICE_LABELS.aBlock
					const rate =
						warning.subject === 'ramp'
							? SESONG_NOTICE_LABELS.rampRate(
									formatNbSignedPercent(warning.authored),
								)
							: SESONG_NOTICE_LABELS.stepRate(
									formatNbSignedPercent(warning.authored),
								)
					return (
						// The position disambiguates: two tracks can warn about the same
						// phase and the same subject, once each.
						<li key={`${warning.phaseIndex}-${warning.subject}-${position}`}>
							{warning.lifting ? (
								<>
									<span className="font-medium">
										{nbTrackName(warning.discipline)}
									</span>{' '}
									{SESONG_NOTICE_LABELS.rampLifting('', rate, phase).trim()}
								</>
							) : (
								<>
									<span className="font-medium">{phase}</span> {rate}.
								</>
							)}
						</li>
					)
				})}
			</ul>
			<p>
				{SESONG_NOTICE_LABELS.rampNote(formatNbSignedPercent(RAMP_GUARD_MAX))}
				{anyStrength ? SESONG_NOTICE_LABELS.rampLiftingNote : null}
			</p>"""),
# --- availability ----------------------------------------------------------
("""			name="training availability note"
		>
			<ul className="space-y-1">
				{warnings.map((warning, position) => {
					const single = warning.fromWeekInPlan === warning.toWeekInPlan
					return (
						<li key={`days-${warning.fromWeekInPlan}-${position}`}>
							<span className="font-medium">
								{formatWeekSpan(warning.fromWeekInPlan, warning.toWeekInPlan)}
							</span>{' '}
							{single ? 'asks' : 'ask'} for {formatSessionCounts(warning)} a
							week, and you have {warning.trainableWeekdays} trainable{' '}
							{warning.trainableWeekdays === 1 ? 'weekday' : 'weekdays'}.
						</li>
					)
				})}
				{hoursWarnings.map((warning, position) => {
					const single = warning.fromWeekInPlan === warning.toWeekInPlan
					return (
						<li key={`hours-${warning.fromWeekInPlan}-${position}`}>
							<span className="font-medium">
								{formatWeekSpan(warning.fromWeekInPlan, warning.toWeekInPlan)}
							</span>{' '}
							{/* "up to" for a span and never for a single week: the figure is
							    the run's worst week, so claiming it of every week in the run
							    would be a number nothing derived. */}
							{single ? 'asks' : 'ask'} for {single ? '' : 'up to '}
							{formatWeeklyVolume(warning.peakHours, 'hours')} of endurance
							training, and your weekly capacity is{' '}
							{formatWeeklyVolume(warning.weeklyCapacityHours, 'hours')}.
						</li>
					)
				})}
			</ul>
			<p>
				{warnings.length > 0 && hoursWarnings.length > 0
					? 'Those are two separate comparisons — sessions against the weekdays you train, and hours against the capacity you set — and a week can miss one without missing the other. '
					: warnings.length > 0
						? 'That is days against days: sessions against the weekdays you train. '
						: 'That is hours against hours: the hours your endurance weeks work out to, against the capacity you set. '}
				It may be exactly what you meant: two sessions can share a day, and both
				numbers are settings rather than facts about your week. Your plan is
				saved exactly as you authored it.
			</p>
			{hoursWarnings.length === 0 && weeklyCapacityHours == null ? (
				<p>
					Hours are the second comparison, and your{' '}
					<Link className="underline" to="/settings/profile">
						athlete profile
					</Link>{' '}
					carries no weekly capacity yet — so nothing here has been checked
					against your hours.
				</p>
			) : null}""",
"""			name={SESONG_NOTICE_LABELS.availabilityName}
		>
			<ul className="space-y-1">
				{warnings.map((warning, position) => {
					const single = warning.fromWeekInPlan === warning.toWeekInPlan
					const span = weekSpan(warning.fromWeekInPlan, warning.toWeekInPlan)
					const [lead, ...rest] = SESONG_NOTICE_LABELS.daysAsk(
						span,
						single,
						SESONG_NOTICE_LABELS.sessionCounts(
							warning.qualitySessions,
							warning.strengthSessions,
						),
						warning.trainableWeekdays,
					).split(span)
					return (
						<li key={`days-${warning.fromWeekInPlan}-${position}`}>
							{lead}
							<span className="font-medium">{span}</span>
							{rest.join(span)}
						</li>
					)
				})}
				{hoursWarnings.map((warning, position) => {
					const single = warning.fromWeekInPlan === warning.toWeekInPlan
					const span = weekSpan(warning.fromWeekInPlan, warning.toWeekInPlan)
					// "opptil" for a span and never for a single week: the figure is
					// the run's worst week, so claiming it of every week in the run
					// would be a number nothing derived.
					const [lead, ...rest] = SESONG_NOTICE_LABELS.hoursAsk(
						span,
						single,
						formatNbWeeklyVolume(warning.peakHours, 'hours'),
						formatNbWeeklyVolume(warning.weeklyCapacityHours, 'hours'),
					).split(span)
					return (
						<li key={`hours-${warning.fromWeekInPlan}-${position}`}>
							{lead}
							<span className="font-medium">{span}</span>
							{rest.join(span)}
						</li>
					)
				})}
			</ul>
			<p>
				{warnings.length > 0 && hoursWarnings.length > 0
					? SESONG_NOTICE_LABELS.bothChecks
					: warnings.length > 0
						? SESONG_NOTICE_LABELS.daysCheck
						: SESONG_NOTICE_LABELS.hoursCheck}
				{SESONG_NOTICE_LABELS.fitNote}
			</p>
			{hoursWarnings.length === 0 && weeklyCapacityHours == null ? (
				<p>
					{SESONG_NOTICE_LABELS.noCapacity}{' '}
					<Link className="underline" to="/settings/profile">
						{SESONG_NOTICE_LABELS.noCapacityLink}
					</Link>{' '}
					{SESONG_NOTICE_LABELS.noCapacityEnd}
				</p>
			) : null}"""),
# --- band ------------------------------------------------------------------
("""			name="load band note"
		>
			<ul className="space-y-1">
				{warnings.map((warning) => (
					<li key={warning.sessionId}>
						<Link
							to={`/training/sessions/${warning.sessionId}`}
							className="font-medium hover:underline"
						>
							Week {warning.weekInPlan},{' '}
							{formatDate(warning.scheduledAt, timezone)}
						</Link>{' '}
						is authored at {formatPct1RMs(warning.outsidePct1RMs)}, outside the{' '}
						{formatPct1RMBand(warning.band)} that{' '}
						{STRENGTH_GOAL_SENTENCE_LABELS[warning.goal]} works in.
					</li>
				))}
			</ul>
			<p>
				That band is <strong>derived</strong> from the Strength Goal you
				authored on the block, never typed beside it — change the goal and the
				band moves with it, or leave the session as it is. This is a note and
				not a limit: your blocks and your sessions are saved exactly as you
				authored them.
			</p>""",
"""			name={SESONG_NOTICE_LABELS.bandName}
		>
			<ul className="space-y-1">
				{warnings.map((warning) => (
					<li key={warning.sessionId}>
						<Link
							to={`/training/sessions/${warning.sessionId}`}
							className="font-medium hover:underline"
						>
							{weekSpan(warning.weekInPlan, warning.weekInPlan)},{' '}
							{formatNbDayMonth(warning.scheduledAt, timezone)}
						</Link>{' '}
						{SESONG_NOTICE_LABELS.bandLine(
							formatNbPct1RMs(warning.outsidePct1RMs),
							formatNbPct1RMBand(warning.band),
							NB_STRENGTH_GOAL_SENTENCE_LABELS[warning.goal],
						)}
					</li>
				))}
			</ul>
			<p>{SESONG_NOTICE_LABELS.bandNote}</p>"""),
# --- unavailable readings --------------------------------------------------
("""			<h2 id="unavailable-readings" className="text-lg font-semibold">
				What this plan cannot tell you
			</h2>
			<ul className="text-muted-foreground space-y-2 text-sm">
				{readings.map((reading) => (
					<li key={reading}>{UNAVAILABLE_READING_LABELS[reading]}</li>
				))}
			</ul>""",
"""			<h2 id="unavailable-readings" className="text-lg font-semibold">
				{SESONG_PAGE_LABELS.cannotTellTitle}
			</h2>
			<ul className="text-muted-foreground space-y-2 text-sm">
				{readings.map((reading) => (
					<li key={reading}>{NB_UNAVAILABLE_READING_LABELS[reading]}</li>
				))}
			</ul>"""),
# --- blocks reading --------------------------------------------------------
("""			<ol aria-label="Phases" className="space-y-3">""",
"""			<ol aria-label={SESONG_PAGE_LABELS.phasesList} className="space-y-3">"""),
("""											label={`${phase.name}: ${phaseWeeks.length === 1 ? 'one week' : `${phaseWeeks.length} weeks`} of ${DISCIPLINE_LABELS[sparkTrack.discipline]} volume`}""",
"""											label={SESONG_PHASE_LABELS.sparkLabel(
												nbPhaseName(phase.name),
												phaseWeeks.length,
												nbTrackName(sparkTrack.discipline),
											)}"""),
("""										enduranceTracks.length > 1
											? DISCIPLINE_LABELS[track.discipline]
											: null""",
"""										enduranceTracks.length > 1
											? nbTrackName(track.discipline)
											: null"""),
("""							<p className="text-sm font-medium">Start from a shape</p>""",
"""							<p className="text-sm font-medium">
								{SESONG_PAGE_LABELS.shapeTitle}
							</p>"""),
("""						<Disclosure
							summary="Start from a shape"
							detail="Three built-in periodization shapes, each drawn as the load profile it lays down. Applying one replaces your blocks."
						>""",
"""						<Disclosure
							summary={SESONG_PAGE_LABELS.shapeTitle}
							detail={SESONG_PAGE_LABELS.shapeDetail}
						>"""),
("""					<Disclosure
						summary="Season anchors"
						detail={anchorSummary(anchorTracks)}
					>""",
"""					<Disclosure
						summary={SESONG_PAGE_LABELS.anchorsTitle}
						detail={anchorSummary(anchorTracks)}
					>"""),
("""						<Disclosure
							summary="Lifting blocks"
							detail={strengthSummary(strengthTracks)}
						>""",
"""						<Disclosure
							summary={SESONG_PAGE_LABELS.liftingTitle}
							detail={strengthSummary(strengthTracks)}
						>"""),
("""					<Disclosure
						summary="Add a phase"
						detail="A new phase at a position you choose. Your plan’s start week never moves."
					>""",
"""					<Disclosure
						summary={SESONG_PAGE_LABELS.addPhaseTitle}
						detail={SESONG_PAGE_LABELS.addPhaseDetail}
					>"""),
("""				<Disclosure
					summary="Delete this plan"
					detail={
						season.eventId
							? 'Your event and the sessions you have already trained stay.'
							: 'The sessions you have already trained stay.'
					}
				>""",
"""				<Disclosure
					summary={SESONG_PAGE_LABELS.deleteTitle}
					detail={
						season.eventId
							? SESONG_PAGE_LABELS.deleteDetailEvent
							: SESONG_PAGE_LABELS.deleteDetail
					}
				>"""),
# --- starter + readings ----------------------------------------------------
("""	const built =
		proposal.source === 'availability'
			? `Built from the ${days === 1 ? 'day' : `${days} days`} you say you can train on`
			: 'A four-day week as a starting point — you have not set your training days, so nothing was read from them'
	return `${built}, with the last day long. Every day is yours to move, re-weight or remove.`""",
"""	const built =
		proposal.source === 'availability'
			? SESONG_PATTERN_LABELS.starterFromProfile(days)
			: SESONG_PATTERN_LABELS.starterFromDefault
	return SESONG_PATTERN_LABELS.starterTail(built)"""),
("""		const subject =
			tracks.length > 1 ? DISCIPLINE_LABELS[track.discipline] : 'It'
		const climb =
			segment.ramp == null
				? 'does not climb — every week is the size of the one before'
				: `climbs ${formatSignedPercent(segment.ramp)} a loading week`
		const step =
			segment.boundaryStep == null
				? ''
				: `, opening ${formatSignedPercent(segment.boundaryStep)} against the block before`
		const count = qualitySessionCount(segment.mix)
		const quality =
			count === 0
				? 'no quality sessions'
				: `${count === 1 ? '1 quality session' : `${count} quality sessions`} a week — ${formatEmphasisLabel(emphasisTerms(segment.mix))}`
		return [`${subject} ${climb}${step}, with ${quality}.`]""",
"""		const subject = SESONG_SEGMENT_LABELS.readingSubject(
			tracks.length > 1 ? nbTrackName(track.discipline) : null,
		)
		const climb =
			segment.ramp == null
				? SESONG_SEGMENT_LABELS.readingFlat
				: SESONG_SEGMENT_LABELS.readingClimb(
						formatNbSignedPercent(segment.ramp),
					)
		const step =
			segment.boundaryStep == null
				? ''
				: SESONG_SEGMENT_LABELS.readingStep(
						formatNbSignedPercent(segment.boundaryStep),
					)
		const quality = SESONG_SEGMENT_LABELS.readingQuality(
			qualitySessionCount(segment.mix),
			formatNbEmphasisLabel(emphasisTerms(segment.mix)),
		)
		return [`${subject} ${climb}${step}, ${quality}.`]"""),
("""	if (tracks.length === 0) return 'No track to anchor yet.'
	return tracks
		.map((track) => {
			const first = track.anchors[0]
			const opening = first
				? formatWeeklyVolume(first.value, track.currency)
				: 'not set'
			const again = track.anchors.length - 1
			return `${DISCIPLINE_LABELS[track.discipline]} from ${opening}${
				again > 0
					? `, re-anchored ${again === 1 ? 'once' : `${again} times`}`
					: ''
			}`
		})
		.join(' · ')""",
"""	if (tracks.length === 0) return SESONG_ANCHOR_LABELS.summaryNone
	return tracks
		.map((track) => {
			const first = track.anchors[0]
			const opening = first
				? formatNbWeeklyVolume(first.value, track.currency)
				: SESONG_ANCHOR_LABELS.summaryNotSet
			return SESONG_ANCHOR_LABELS.summary(
				nbTrackName(track.discipline),
				opening,
				track.anchors.length - 1,
			)
		})
		.join(' · ')"""),
("""	if (blocks === 0) {
		return 'No lifting block yet — the weeks between blocks are weeks you do not lift.'
	}
	return `${blocks === 1 ? '1 block' : `${blocks} blocks`}, each dated rather than tied to a phase.`""",
"""	if (blocks === 0) return SESONG_LIFTING_LABELS.summaryNone
	return SESONG_LIFTING_LABELS.summary(blocks)"""),
# --- progression form ------------------------------------------------------
("""			{trackLabel ? (
				<p className="text-sm font-medium">{trackLabel} progression</p>
			) : null}""",
"""			{trackLabel ? (
				<p className="text-sm font-medium">
					{SESONG_SEGMENT_LABELS.progression(trackLabel)}
				</p>
			) : null}"""),
("""					label="Volume ramp, % a loading week"
					meaning={
						segment.ramp == null
							? 'Blank — volume holds level through this block.'
							: `${formatSignedPercent(segment.ramp)} on every loading week. Recovery weeks and tapers do not step.`
					}""",
"""					label={SESONG_SEGMENT_LABELS.ramp}
					meaning={
						segment.ramp == null
							? SESONG_SEGMENT_LABELS.rampBlank
							: SESONG_SEGMENT_LABELS.rampSet(
									formatNbSignedPercent(segment.ramp),
								)
					}"""),
("""						label="Boundary step at this block’s opening, %"
						meaning={
							segment.boundaryStep == null
								? 'Blank — this block opens continuous with the week before it.'
								: `${formatSignedPercent(segment.boundaryStep)} once, at the opening. A deliberate drop into an intensity block belongs here rather than in the ramp.`
						}""",
"""						label={SESONG_SEGMENT_LABELS.step}
						meaning={
							segment.boundaryStep == null
								? SESONG_SEGMENT_LABELS.stepBlank
								: SESONG_SEGMENT_LABELS.stepSet(
										formatNbSignedPercent(segment.boundaryStep),
									)
						}"""),
("""							{BOUNDARY_STEP_OUT_OF_FORCE_LABELS[boundaryStep.reason]}""",
"""							{NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS[boundaryStep.reason]}"""),
("""						label="Recovery week cut, %"
						nonNegative
						meaning={
							segment.recoveryCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_RECOVERY_CUT)} off your last loading week. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.recoveryCut)} off your last loading week.`
						}""",
"""						label={SESONG_SEGMENT_LABELS.recoveryCut}
						nonNegative
						meaning={
							segment.recoveryCut == null
								? SESONG_SEGMENT_LABELS.recoveryBlank(
										formatNbSignedPercent(-DEFAULT_RECOVERY_CUT),
									)
								: SESONG_SEGMENT_LABELS.recoverySet(
										formatNbSignedPercent(-segment.recoveryCut),
									)
						}"""),
("""						label="Taper cut by the event, %"
						nonNegative
						meaning={`${
							segment.taperCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_TAPER_CUT)} by your event. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.taperCut)} by your event.`
						} The taper descends across the block rather than dropping in its last week.`}""",
"""						label={SESONG_SEGMENT_LABELS.taperCut}
						nonNegative
						meaning={`${
							segment.taperCut == null
								? SESONG_SEGMENT_LABELS.taperBlank(
										formatNbSignedPercent(-DEFAULT_TAPER_CUT),
									)
								: SESONG_SEGMENT_LABELS.taperSet(
										formatNbSignedPercent(-segment.taperCut),
									)
						}${SESONG_SEGMENT_LABELS.taperNote}`}"""),
("""				Save {trackLabel ? `${trackLabel} ` : ''}progression""",
"""				{SESONG_SEGMENT_LABELS.saveProgression(trackLabel)}"""),
# --- mix form --------------------------------------------------------------
("""	const emphasis = formatEmphasisLabel(emphasisTerms(segment.mix))""",
"""	const emphasis = formatNbEmphasisLabel(emphasisTerms(segment.mix))"""),
("""			<p className="text-sm font-medium">
				{trackLabel ? `${trackLabel} quality ` : 'Quality '}session mix
			</p>
			<p className="text-muted-foreground text-sm">
				Sessions a week in each quality zone. <strong>Blank or 0</strong> leaves
				a zone out of the mix — all three blank is a block with no quality
				sessions, which is a plan and not a gap. This blank is not the
				ramp&rsquo;s blank above: there is no convention for a mix to fall back
				on.
			</p>""",
"""			<p className="text-sm font-medium">
				{SESONG_SEGMENT_LABELS.mix(trackLabel)}
			</p>
			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.mixIntro}
			</p>"""),
("""								children: `Zone ${zone} ${QUALITY_ZONE_LABELS[zone]}, sessions a week`,""",
"""								children: SESONG_SEGMENT_LABELS.mixField(
									zone,
									NB_QUALITY_ZONE_LABELS[zone],
								),"""),
("""					<dt className="text-muted-foreground">Intensity emphasis, derived</dt>""",
"""					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.emphasis}
					</dt>"""),
("""					<dt className="text-muted-foreground">
						Quality sessions a week, derived
					</dt>""",
"""					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.count}
					</dt>"""),
("""			<p className="text-muted-foreground text-sm">
				Both are read off the mix you saved, which is why there is nothing to
				type here: a block is named for the work it holds, so the name follows
				the mix rather than the other way round. It keeps reading the mix once
				the weeks fill with real sessions, so this block does not change
				character as the season goes on.
			</p>""",
"""			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.derivedNote}
			</p>"""),
("""				Save {trackLabel ? `${trackLabel} ` : ''}quality mix""",
"""				{SESONG_SEGMENT_LABELS.saveMix(trackLabel)}"""),
# --- weeks reading ---------------------------------------------------------
("""	const discipline = DISCIPLINE_LABELS[target.discipline]
	return (
		<div className="space-y-1">
			<p className="text-sm font-medium">
				{discipline}, {VOLUME_CURRENCY_UNITS[target.currency]}
			</p>
			{target.overridden ? (
				<p className="text-muted-foreground text-sm">
					{target.derivedValue == null
						? 'Hand-set. The rule has no number for this week.'
						: `Hand-set. The rule gives ${formatWeeklyVolume(target.derivedValue, target.currency)}.`}
				</p>
			) : null}""",
"""	const discipline = nbTrackName(target.discipline)
	return (
		<div className="space-y-1">
			<p className="text-sm font-medium">
				{discipline}, {NB_WEEKLY_UNITS[target.currency]}
			</p>
			{target.overridden ? (
				<p className="text-muted-foreground text-sm">
					{target.derivedValue == null
						? SESONG_PAGE_LABELS.handSetNoRule
						: SESONG_PAGE_LABELS.handSetRule(
								formatNbWeeklyVolume(target.derivedValue, target.currency),
							)}
				</p>
			) : null}"""),
("""					aria-label={`${SEASON_EDIT_LABELS.weekTargetOpen}: week ${week.weekInPlan} ${discipline}`}""",
"""					aria-label={`${SEASON_EDIT_LABELS.weekTargetOpen}: uke ${weekNumberOf(week)} ${discipline.toLowerCase()}`}"""),
("""						<span className="text-muted-foreground text-xs">
							{DISCIPLINE_LABELS[target.discipline]}
						</span>""",
"""						<span className="text-muted-foreground text-xs">
							{nbTrackName(target.discipline)}
						</span>"""),
("""						<span className="text-muted-foreground">Unavailable</span>""",
"""						<span className="text-muted-foreground">
							{SESONG_PAGE_LABELS.unavailable}
						</span>"""),
("""						<span>No lifting</span>""",
"""						<span>{SESONG_PAGE_LABELS.noLifting}</span>"""),
("""								{formatWeeklyVolume(target.value, target.currency)}""",
"""								{formatNbWeeklyVolume(target.value, target.currency)}"""),
("""								<span className="text-muted-foreground">· Deload</span>""",
"""								<span className="text-muted-foreground">
									· {SESONG_PAGE_LABELS.deload}
								</span>"""),
("""						<Badge variant="secondary">Hand-set</Badge>""",
"""						<Badge variant="secondary">{SESONG_PAGE_LABELS.handSet}</Badge>"""),
("""				title="Week by week"
				aside={
					season.weeks.length === 1 ? '1 week' : `${season.weeks.length} weeks`
				}
			>
				<ul aria-label="Training weeks" className="divide-border/70 divide-y">""",
"""				title={SESONG_PAGE_LABELS.weekByWeek}
				aside={SESONG_PAGE_LABELS.weekCount(season.weeks.length)}
			>
				<ul
					aria-label={SESONG_PAGE_LABELS.weeksList}
					className="divide-border/70 divide-y"
				>"""),
("""										{phase.name}
									</p>""",
"""										{nbPhaseName(phase.name)}
									</p>"""),
("""											<span className="block text-sm font-medium">
												Week {week.weekInPlan}
											</span>
											<span className="text-muted-foreground block text-xs tabular-nums">
												{formatDate(week.startsAt, season.timezone)}
											</span>""",
"""											<span className="block text-sm font-medium tabular-nums">
												Uke {weekNumberOf(week)}
											</span>
											<span className="text-muted-foreground block text-xs tabular-nums">
												{formatNbDayMonth(week.startsAt, season.timezone)}
											</span>"""),
("""											{WEEK_ROLE_LABELS[week.role]}""",
"""											{NB_WEEK_ROLE_LABELS[week.role]}"""),
("""					<p className="text-muted-foreground text-sm">
						Open a week to change its target in <em>Endre sesongen</em>, where
						you see the change before it applies. A hand-set target is that
						week&rsquo;s final number — no recovery or taper cut on top — and it
						changes that week only: the rest of your season still follows your
						anchor and your ramps. <strong>0</strong> is a week without
						training, which is a plan and not a gap.
					</p>""",
"""					<p className="text-muted-foreground text-sm">
						{SESONG_PAGE_LABELS.weeksFootnote}
					</p>"""),
("""						<p key={track.discipline} className="text-muted-foreground text-sm">
							{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — no
							Season Anchor covers this plan yet.
						</p>""",
"""						<p key={track.discipline} className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.unpricedTrack(nbTrackName(track.discipline))}
						</p>"""),
("""						<p className="text-muted-foreground text-sm">
							<strong>Deload</strong> is a lifting block&rsquo;s own tail: it
							comes from the weeks you gave that block, and your phases&rsquo;
							rhythm does not reach it. So it can land on a different week from
							a recovery week in your plan — that is what a dated block is for,
							not the two disagreeing.
						</p>""",
"""						<p className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.deloadFootnote}
						</p>"""),
("""				<Disclosure
					summary="Your typical week"
					detail={patternSummary(season.patterns)}""",
"""				<Disclosure
					summary={SESONG_PAGE_LABELS.patternTitle}
					detail={patternSummary(season.patterns)}"""),
("""				<Disclosure
					summary="Copy a week you liked"
					detail="Carries a week’s sessions as you authored them, without a pattern."
					defaultOpen={pendingCopy !== null}
				>""",
"""				<Disclosure
					summary={SESONG_PAGE_LABELS.copyTitle}
					detail={SESONG_PAGE_LABELS.copyDetail}
					defaultOpen={pendingCopy !== null}
				>"""),
("""		return 'Author the week you usually train, then stamp it across the season.'""",
"""		return SESONG_PAGE_LABELS.patternEmpty"""),
# --- fit -------------------------------------------------------------------
("""	const weeks = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	const plural = weeks === 1 ? 'week' : 'weeks'
	if (fit.kind === 'ends-on-event-week') {
		return 'Your plan ends on your event’s week.'
	}
	return fit.kind === 'ends-before'
		? `Your plan ends ${weeks} ${plural} before your event’s week.`
		: `Your plan runs ${weeks} ${plural} past your event’s week.`""",
"""	if (fit.kind === 'ends-on-event-week') return SESONG_PAGE_LABELS.fitEnds
	return fit.kind === 'ends-before'
		? SESONG_PAGE_LABELS.fitBefore(fit.weeks)
		: SESONG_PAGE_LABELS.fitPast(fit.weeks)"""),
("""	const verb = proposal.delta > 0 ? 'Add' : 'Take off'
	const weeks = Math.abs(proposal.delta)""",
"""	const weeks = Math.abs(proposal.delta)"""),
("""				{verb} {weeks === 1 ? '1 week' : `${weeks} weeks`} so it lands on your
				event""",
"""				{proposal.delta > 0
					? SESONG_REFUSAL_LABELS.fitAdd(weeks)
					: SESONG_REFUSAL_LABELS.fitRemove(weeks)}"""),
("""	const changes = proposal.changes
		.map((change) => `${change.name} ${change.from} → ${change.to} weeks`)
		.join(', ')
	return proposal.delta > 0
		? `Lengthens your base to reach it: ${changes}.`
		: `Takes the weeks off your base first, then forward through your season: ${changes}. Your taper is untouched.`""",
"""	const changes = proposal.changes
		.map((change) =>
			SESONG_REFUSAL_LABELS.fitChange(
				nbPhaseName(change.name),
				change.from,
				change.to,
			),
		)
		.join(', ')
	return proposal.delta > 0
		? SESONG_REFUSAL_LABELS.fitLengthens(changes)
		: SESONG_REFUSAL_LABELS.fitShortens(changes)"""),
]

ALL = [
("""					formErrors: ['That block is no longer part of your plan.'],""",
"""					formErrors: [SESONG_SEGMENT_LABELS.gone],"""),
]
