/**
 * The plan page's advisory notices (`plan.tsx`, #533): the ramp guard, the
 * availability and band fit notices, what the plan cannot tell, and where the
 * laid weeks disagree with the mix. Each warns and none blocks a save.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
	Alert,
	AlertAction,
	AlertDescription,
} from '#app/components/ui/alert.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	formatNbDayMonth,
	formatNbPct1RMBand,
	formatNbPct1RMs,
	formatNbSignedPercent,
	formatNbWeeklyVolume,
} from '#app/utils/format.ts'
import {
	NB_QUALITY_ZONE_LABELS,
	NB_STRENGTH_GOAL_SENTENCE_LABELS,
	NB_UNAVAILABLE_READING_LABELS,
	nbPhaseName,
	nbTrackName,
	SESONG_NOTICE_LABELS,
	SESONG_PAGE_LABELS,
} from '#app/utils/labels.ts'
import {
	RAMP_GUARD_MAX,
	type RampWarning,
} from '#app/utils/plan-outline/ramp-guard.ts'
import { type StampedMixWarning } from '#app/utils/plan-outline/stamp.server.ts'
import { type UnavailableReading } from '#app/utils/plan-outline/unavailable-readings.ts'
import {
	type SeasonAvailabilityWarning,
	type SeasonBandWarning,
	type SeasonDayClashWarning,
	type SeasonHoursFitWarning,
} from '#app/utils/training.server.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'
import {
	isoWeekOfPlanWeek,
	weekSpan,
	type SeasonPhaseData,
} from './__plan-season.ts'

/**
 * A guard notice, open on arrival and closable once it has been read (#399 story
 * 95: *warnings are dismissible signals rather than blocked saves, so that the app
 * advises and I author*).
 *
 * **Dismissal is not progressive disclosure, and this page refuses one while
 * offering the other.** Disclosure hides a warning *before* it has been read, so
 * the athlete has to go looking for something they do not yet know is there — that
 * is a warning withheld, and it is why none of the three notices below ships behind
 * a `Disclosure`. Dismissal closes a warning the athlete has read and *decided
 * about*: "yes, four sessions a week is what I meant." Refusing them that is not
 * safety, it is the app arguing with an author it has already told everything it
 * knows — and every one of these notices ends by saying the plan is saved exactly
 * as authored, so there is nothing left for the open state to enforce.
 *
 * **Per visit, and stored nowhere.** It is component state: a reload brings every
 * notice back, and so does re-keying on what the notice *says* (each caller does
 * that below). A dismissal that outlived the words it was about would silence a
 * warning the athlete has never seen — and the alternative, a stored "seen" flag
 * per warning, is a schema column for a judgement that is only ever about the
 * sentence currently on screen.
 *
 * The control is a real button with a name that says what it closes, never a bare
 * ×: a screen-reader user meeting three of these in a row is owed which one they
 * are about to dismiss.
 *
 * **And the dismissal leaves something behind for focus to land on.** A notice that
 * unmounted into nothing would drop focus on `<body>`: the next Tab restarts at the
 * top of a long authoring page, and the athlete is told nothing about the button
 * they just pressed. Three of these can sit in a row, so losing your place on the
 * first is losing it before you have read the other two.
 */
function DismissibleNotice({
	name,
	children,
}: {
	/**
	 * What this notice *is*, mid-sentence — "ramp note". The dismiss control's
	 * accessible name and the line that replaces the notice are both built from it,
	 * so the two can never come to call one notice by two names. Never "close": a
	 * screen-reader user meeting three of these is owed which one they are closing.
	 */
	name: string
	children: ReactNode
}) {
	const [dismissed, setDismissed] = useState(false)
	const closed = useRef<HTMLParagraphElement>(null)
	useEffect(() => {
		if (dismissed) closed.current?.focus()
	}, [dismissed])

	if (dismissed) {
		return (
			// Focusable programmatically and never in the tab order, so nobody tabs onto
			// a sentence about a warning that is gone — it exists for the one moment
			// focus is moved onto it, and holds the reading position the notice had.
			// Visually hidden, because the space closing up *is* the sighted reading of
			// a dismissal.
			<p ref={closed} tabIndex={-1} className="sr-only">
				{SESONG_NOTICE_LABELS.dismissed(name)}
			</p>
		)
	}

	return (
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">{children}</AlertDescription>
			{/* After the words it closes, not before them: `AlertAction` is positioned
			    absolutely, so the control sits top-right either way, and reading order
			    should be *warning, then the decision about it*. */}
			<AlertAction>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={SESONG_NOTICE_LABELS.dismiss(name)}
					// ~44px effective touch target on a 32px control (#280), the idiom
					// `OverlayHeader`'s close button uses.
					className="relative shrink-0 after:absolute after:-inset-1.5"
					onClick={() => setDismissed(true)}
				>
					<Icon name="cross-1" />
				</Button>
			</AlertAction>
		</Alert>
	)
}

/**
 * The **ramp guard**, worded (ADR 0040 §12–13).
 *
 * Three things this copy must do and does. It names the threshold as a
 * **convention** and makes **no injury claim** — the 10% rule's own RCT found no
 * difference (Buist 2008), so "steeper than usual" is the whole of what can
 * honestly be said. It says the numbers are saved, because the guard warns and never
 * blocks. And it speaks about the ramp and the step the athlete *authored*, never
 * about a week-over-week difference, so it stays silent on a recovery week's rebound
 * and on a taper.
 *
 * The two subjects are worded separately because they are different quantities. A
 * ramp is a rate *per loading week*; a boundary step happens **once**, at a
 * segment's opening. `RAMP_GUARD_MAX` is one constant measured against both — which
 * is what #403 asks for — so the copy must not describe the step with the ramp's
 * "a week", or it would state a per-week rule about a one-time number.
 *
 * **It guards both tracks now** (ADR 0047 §1), which the copy has to survive. A
 * strength warning's `phaseIndex` is the phase its **opening week** falls in — where
 * the athlete looks for the block, and never a claim that a dated block belongs to
 * that phase (ADR 0047 §6) — so a lifting warning says "opening in Base" rather than
 * naming the phase as its subject, and the closing paragraph says why.
 */
export function RampGuardNotice({
	warnings,
	phases,
	anyStrength,
}: {
	warnings: Array<RampWarning & { discipline: Discipline; lifting: boolean }>
	phases: SeasonPhaseData[]
	/** Whether any line below is about a dated lifting block. */
	anyStrength: boolean
}) {
	return (
		<DismissibleNotice
			// Re-keyed on what the guard currently says, so an edit that changes the
			// warnings brings the notice back rather than leaving a dismissal standing
			// over sentences the athlete has not read. The same re-keying a hand-set
			// week's field uses when a save changes what it should show.
			key={warnings
				.map(
					(warning) =>
						`${warning.discipline}:${warning.phaseIndex}:${warning.subject}:${warning.authored}`,
				)
				.join('|')}
			name={SESONG_NOTICE_LABELS.rampName}
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
			</p>
		</DismissibleNotice>
	)
}

/**
 * The **availability fit notice**, worded (ADR 0042 §9, ADR 0045 §8, ADR 0047 §4,
 * ADR 0050).
 *
 * Advisory, exactly like `RampGuardNotice` above and for the same reasons. Three
 * things the copy has to do. It names the **comparison** each line made — sessions
 * against trainable weekdays, or hours against the **Weekly Capacity** — because
 * neither number means anything without the other side of it. It makes **no injury
 * or safety claim** of any kind (ADR 0040 §13): more session days than trainable days
 * is a scheduling fact, and nothing is known about what it does to a body. And it says
 * the plan is stored as authored, because this notice cannot block a save and does not.
 *
 * **What ADR 0047 §4 fixed still holds.** The days check is the *combined* one —
 * quality sessions **plus** **Strength Frequency** — because a session is a session
 * whichever track prescribes it; both counts are named where both exist and a zero
 * half is dropped, since "0 lifting sessions" is a sentence about nothing; and the
 * locator is a **week span** rather than a phase name, because a lifting block floats
 * free of the phases. The hours lines take the same locator for the same reason.
 *
 * **Two comparisons, in one notice.** ADR 0050 gave Training Availability a capacity,
 * so the paragraph that used to say days-against-days is "the only comparison your
 * training availability can make" is retired: the two checks are independent, they
 * decline for different reasons, and a week can miss one without missing the other
 * (ADR 0050 §5). They share one notice rather than taking two, because two dismissible
 * cards about "does my week fit" would be one thought split across two dismissals.
 *
 * **What it will not say.** It never reports that the hours fit. An empty hours list
 * has three causes — no capacity authored, no week the conversion can price in hours,
 * or a plan that genuinely fits — and this component can tell only the first apart, so
 * a verdict would be a claim the reading does not carry (ADR 0043 §5). Where the
 * capacity is simply missing it says so and points at the field, which is a statement
 * about the *setting* rather than about the plan.
 *
 * The whole reading comes off `season` — derived once at the read boundary, never in
 * here. Silence is the answer when the athlete never set their availability: both
 * readings are empty for a null counterpart, so there is no list to render rather
 * than a guess to word.
 */
/**
 * One line per clash — the same reason on the same weekday — however many
 * stretches of the plan hold it: a season whose phases move the mix can
 * break one clash into several spans, and a line per span would say one
 * thing many times. In the order the clashes first appear.
 */
function clashLines(clashes: readonly SeasonDayClashWarning[]) {
	const lines = new Map<
		string,
		{ clash: SeasonDayClashWarning; spans: Array<[number, number]> }
	>()
	for (const clash of clashes) {
		const key = `${clash.weekday}|${clash.reason}|${clash.pinned}`
		const line = lines.get(key) ?? { clash, spans: [] }
		line.spans.push([clash.fromWeekInPlan, clash.toWeekInPlan])
		lines.set(key, line)
	}
	return [...lines.values()]
}

export function AvailabilityFitNotice({
	warnings,
	hoursWarnings,
	dayClashes,
	weeklyCapacityHours,
	startWeekKey,
}: {
	/** The plan's first week, so a week in the plan reads as its ISO number. */
	startWeekKey: string
	warnings: SeasonAvailabilityWarning[]
	hoursWarnings: SeasonHoursFitWarning[]
	/**
	 * The day check (ADR 0104 §6): where the laid days clash, each naming its
	 * weekday and why, and whether a day the athlete chose is part of it. Its
	 * own list and paragraph under the counts, which stay exactly as they were.
	 */
	dayClashes: SeasonDayClashWarning[]
	/** `null` when the athlete has never authored one — unavailable, not passing. */
	weeklyCapacityHours: number | null
}) {
	const counted = warnings.length > 0 || hoursWarnings.length > 0
	return (
		<DismissibleNotice
			// Re-keyed on the spans and both comparisons, for `RampGuardNotice`'s
			// reason: a mix edit — or a capacity edit — that moves what is compared is a
			// new thing to read.
			key={[
				...warnings.map(
					(warning) =>
						`${warning.fromWeekInPlan}-${warning.toWeekInPlan}:${warning.qualitySessions}+${warning.strengthSessions}/${warning.trainableWeekdays}`,
				),
				...hoursWarnings.map(
					(warning) =>
						`${warning.fromWeekInPlan}-${warning.toWeekInPlan}:${warning.peakHours}/${warning.weeklyCapacityHours}h`,
				),
				...dayClashes.map(
					(clash) =>
						`${clash.fromWeekInPlan}-${clash.toWeekInPlan}:${clash.reason}@${clash.weekday}${clash.pinned ? '!' : ''}`,
				),
			].join('|')}
			name={SESONG_NOTICE_LABELS.availabilityName}
		>
			{counted ? (
				<>
					<ul className="space-y-1">
						{warnings.map((warning, position) => {
							const single = warning.fromWeekInPlan === warning.toWeekInPlan
							const span = weekSpan(
								startWeekKey,
								warning.fromWeekInPlan,
								warning.toWeekInPlan,
							)
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
							const span = weekSpan(
								startWeekKey,
								warning.fromWeekInPlan,
								warning.toWeekInPlan,
							)
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
					) : null}
				</>
			) : null}
			{dayClashes.length > 0 ? (
				<>
					<ul className="space-y-1">
						{clashLines(dayClashes).map(({ clash, spans }) => {
							const span = SESONG_NOTICE_LABELS.weekSpans(
								spans.map(([from, to]) => weekSpan(startWeekKey, from, to)),
							)
							const [lead, ...rest] = SESONG_NOTICE_LABELS.dayClashLine(
								span,
								SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday),
								clash.pinned,
							).split(span)
							return (
								<li
									key={`clash-${clash.weekday}-${clash.reason}-${clash.pinned}`}
								>
									{lead}
									<span className="font-medium">{span}</span>
									{rest.join(span)}
								</li>
							)
						})}
					</ul>
					<p>
						{SESONG_NOTICE_LABELS.dayClashCheck}
						{SESONG_NOTICE_LABELS.dayClashNote}
					</p>
				</>
			) : null}
		</DismissibleNotice>
	)
}

/**
 * The **band fit notice**: sessions already on the calendar whose authored `%1RM`
 * sits outside the band their block's **Strength Goal** derives (ADR 0042 §9,
 * ADR 0047 §3).
 *
 * The same `Alert` treatment as the ramp guard, because it has the same standing: it
 * **warns and never blocks**, and nothing on a write path consults it. Two things the
 * copy must do beyond that. It says the band is **derived from the goal you
 * authored** rather than typed beside it — the athlete has no band field, so a
 * warning about one is otherwise a warning about a number they never entered. And it
 * points at the *session*, since that is the thing to change if the athlete wants to
 * change something; the other way out is to change the goal, and the copy says both.
 */
export function BandFitNotice({
	warnings,
	timezone,
	startWeekKey,
}: {
	/** The plan's first week, so a week in the plan reads as its ISO number. */
	startWeekKey: string
	warnings: SeasonBandWarning[]
	timezone: string
}) {
	return (
		<DismissibleNotice
			// Re-keyed on everything the lines below *say*, for `RampGuardNotice`'s
			// reason — and that is more than which sessions are named. The band is
			// derived from the block's Strength Goal, so changing the goal rewrites
			// every sentence here while the session ids stay exactly as they were: a key
			// of ids alone would hold a dismissal over a band the athlete has never
			// seen, which is the one failure the re-keying exists to prevent.
			key={warnings
				.map(
					(warning) =>
						`${warning.sessionId}:${warning.weekInPlan}:${warning.goal}:${warning.band.minPct1RM}-${warning.band.maxPct1RM}:${warning.outsidePct1RMs.join(',')}`,
				)
				.join('|')}
			name={SESONG_NOTICE_LABELS.bandName}
		>
			<ul className="space-y-1">
				{warnings.map((warning) => (
					<li key={warning.sessionId}>
						<Link
							to={`/training/sessions/${warning.sessionId}`}
							className="font-medium hover:underline"
						>
							{weekSpan(startWeekKey, warning.weekInPlan, warning.weekInPlan)},{' '}
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
			<p>{SESONG_NOTICE_LABELS.bandNote}</p>
		</DismissibleNotice>
	)
}

/**
 * What a plan carrying a strength track **cannot** state, one sentence each
 * (ADR 0047 §5).
 *
 * The sentences themselves are `UNAVAILABLE_READING_LABELS`' in `labels.ts`, beside
 * every other athlete-facing word this app puts on an enum value: one sentence per
 * reading with its own reason, because a single "not available" would tell the
 * athlete that something is missing while hiding which of their own data would
 * change it (Unavailable Metric: the reason is the point). This component owns only
 * the heading and the list.
 *
 * Rendered **above both readings** rather than inside one — see where it is mounted
 * for why: the lifter these sentences are about is authoring blocks, not auditing
 * weeks.
 */
export function UnavailableReadingsNotice({
	readings,
}: {
	readings: UnavailableReading[]
}) {
	// Behind a closed line since round 2 (#505 Look): three paragraphs of honesty
	// in the middle of the page pushed the edits below the fold. The line says
	// what is inside before it opens, so nothing is withheld unannounced — this
	// is a statement about the plan, not a warning about an edit.
	return (
		<section aria-label={SESONG_PAGE_LABELS.cannotTellTitle}>
			<CollapsibleSection
				summary={SESONG_PAGE_LABELS.cannotTellTitle}
				detail={SESONG_PAGE_LABELS.cannotTellDetail}
				className="border-b"
			>
				<ul className="text-footnote text-muted-foreground space-y-2">
					{readings.map((reading) => (
						<li key={reading}>{NB_UNAVAILABLE_READING_LABELS[reading]}</li>
					))}
				</ul>
			</CollapsibleSection>
		</section>
	)
}

/**
 * Where a week the plan laid disagrees with the **Quality Session Mix** its block
 * authors (ADR 0042 §9). Advisory, in the shape the ramp guard and the
 * availability notice take: it names the two figures and stops. Nothing here
 * suggests a fix, because there is nothing to fix — the mix says what the block
 * is for and the week says what the plan now is, and both are the athlete's.
 */
export function MixNotices({
	notices,
	startWeekKey,
}: {
	notices: StampedMixWarning[]
	startWeekKey: string
}) {
	return (
		<section
			aria-labelledby="mix-notices"
			className="bg-muted/50 space-y-2 rounded-3xl px-4 py-3"
			data-mix-notices
		>
			<h2 id="mix-notices" className="text-callout font-semibold">
				{SESONG_PAGE_LABELS.mixNoticesTitle}
			</h2>
			<ul className="text-footnote space-y-1.5">
				{notices.map((notice) => (
					<li key={`${notice.weekKey}-${notice.discipline}`}>
						<span className="font-semibold tabular-nums">
							Uke {isoWeekOfPlanWeek(startWeekKey, notice.weekInPlan)}
						</span>
						<span className="text-muted-foreground">
							{' '}
							· {nbTrackName(notice.discipline).toLowerCase()} ·{' '}
							{notice.disagreements
								.map((disagreement) =>
									SESONG_PAGE_LABELS.mixDisagreement(
										NB_QUALITY_ZONE_LABELS[disagreement.zone],
										disagreement.authored,
										disagreement.stamped,
									),
								)
								.join('; ')}
						</span>
					</li>
				))}
			</ul>
			<p className="text-caption text-muted-foreground">
				{SESONG_PAGE_LABELS.mixNoticesNote}
			</p>
		</section>
	)
}
