/**
 * What _Plan_ opens on (ADR 0101 §2, #558 stories 117 and 119): the plan in
 * plain words, in one card, read in one glance.
 *
 * In order: the plain name — the Start Option's own words, so the plan reads as
 * the card the athlete picked — with the family small under it; what the plan
 * is toward (a race, or no end); the season as one curve with this week marked
 * (ADR 0090 §1); the next easy week; and _Legg til et løp_ for a plan with no
 * race (ADR 0079 §4). Everything else the old Sesong page held is below, behind
 * the closed _Avansert_ (`__plan-advanced.tsx`).
 *
 * `children` is the card's last slot, for what changes the plan as a whole:
 * the _Ukevolum_ rows ({@link PlanLeadVolume}, #673) and _Bytt treningsform_
 * (#581) go there, after _Legg til et løp_. `notices` is the lead's, outside
 * the card and after the resting line: the plan's Guard Notices (ADR 0118),
 * which follow the card they are about rather than sit in it.
 *
 * No motion of its own: the lead is the page's resting state, and the morph
 * from _Planen er klar_'s curve into this one is #582's.
 */
import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { formatNbDate, formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	NB_VOLUME_UNITS,
	NB_WEEK_ROLE_LABELS,
	nbTrackName,
	OPEN_ENDED_PLAN_LABEL,
	openEndedBlockLabel,
	PHILOSOPHY_LABELS,
	PLAN_LEAD_LABELS,
	SESONG_PAGE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'
import { type SeasonAnchorChoice } from '#app/utils/plan-outline/season-edit.ts'
import {
	AttachEventOffer,
	type AttachableEvent,
	type AttachEventReply,
} from './__attach-event.tsx'
import { PillLink, PlanCard } from './__plan-chrome.tsx'
import { type NextEasyWeek, planPlainName } from './__plan-lead.ts'
import { seasonEditAnchor } from './__season-edits.tsx'
import { type SeasonPicture as SeasonPictureData } from './__season-picture.server.ts'
import { SeasonLeadCurve } from './__season-picture.tsx'

/** Where the lead's heading sits, so a link can land on the plan's name. */
export const PLAN_LEAD_ID = 'plan'

type Toward =
	| {
			kind: 'event'
			eventId: string
			name: string
			/** The race day, a calendar anchor formatted in UTC (ADR 0023). */
			date: Date
			weeks: number
	  }
	| { kind: 'open-ended'; round: number }

export function PlanLeadCard({
	family,
	toward,
	startsAt,
	timezone,
	picture,
	nextEasyWeek,
	attach,
	resting,
	notices,
	className,
	children,
}: {
	family: PresetFamily | null
	toward: Toward
	/** The plan's first day, for the meta line. */
	startsAt: Date
	timezone: string
	/** The curve; null when the plan reads no season (it then says no curve). */
	picture: SeasonPictureData | null
	nextEasyWeek: NextEasyWeek | null
	/**
	 * _Legg til et løp_'s choices and its last answer — a refusal, or the
	 * preview to confirm under (#518) — for a plan with no race.
	 */
	attach: {
		outlineId: string
		events: AttachableEvent[]
		reply: AttachEventReply | null
	}
	/** A line under the card when this plan rests or another one does. */
	resting?: ReactNode
	/**
	 * The plan's **Guard Notices** (`PlanGuardNotices`, ADR 0118): after the
	 * resting line and outside the card, before Bibliotek. Renders nothing of its
	 * own when there are none.
	 */
	notices?: ReactNode
	className?: string
	/** The card's last slot: _Ukevolum_ (#673) and _Bytt treningsform_ (#581). */
	children?: ReactNode
}) {
	const from = formatNbDate(startsAt, timezone)
	return (
		<section
			aria-labelledby={`${PLAN_LEAD_ID}-name`}
			data-plan-lead
			// `relative` holds the curve's screen-reader table inside the card, so
			// it never widens the page (the #566 rail's lesson).
			className={cn('relative space-y-3', className)}
		>
			<PlanCard contentClassName="space-y-4">
				<header className="space-y-1">
					<h1
						id={`${PLAN_LEAD_ID}-name`}
						className="text-title text-balance [overflow-wrap:anywhere]"
					>
						{planPlainName(family)}
					</h1>
					{family ? (
						<p data-plan-family className="text-footnote text-muted-foreground">
							{PLAN_LEAD_LABELS.familyName(PHILOSOPHY_LABELS[family])}
						</p>
					) : null}
					{toward.kind === 'event' ? (
						<p className="text-footnote text-muted-foreground [overflow-wrap:anywhere] tabular-nums">
							{PLAN_LEAD_LABELS.toward}{' '}
							<Link
								to={`/training/events/${toward.eventId}`}
								className="text-foreground font-semibold underline-offset-4 hover:underline"
							>
								{toward.name}
							</Link>
							{' · '}
							{SESONG_PAGE_LABELS.heroMeta(
								formatNbDate(toward.date, 'UTC'),
								toward.weeks,
								from,
							)}
						</p>
					) : (
						// No race and no end (ADR 0079): which round, never a race day
						// it would have to invent (#505 story 9).
						<p className="text-footnote text-muted-foreground tabular-nums">
							{OPEN_ENDED_PLAN_LABEL} ·{' '}
							<span data-open-ended-round>
								{openEndedBlockLabel(toward.round)}
							</span>{' '}
							· {SESONG_PAGE_LABELS.openEndedMeta(from)}
						</p>
					)}
				</header>

				{picture ? <SeasonLeadCurve picture={picture} /> : null}

				{nextEasyWeek ? (
					<p data-next-easy-week className="text-callout">
						{nextEasyWeek.isThisWeek
							? PLAN_LEAD_LABELS.thisWeekEasy
							: PLAN_LEAD_LABELS.nextEasyWeek(
									nextEasyWeek.weekNumber,
									// A week key is a calendar day: formatted at noon UTC so
									// no zone moves it across midnight.
									formatNbDate(
										new Date(`${nextEasyWeek.weekKey}T12:00:00Z`),
										'UTC',
									),
								)}
					</p>
				) : null}

				{toward.kind === 'open-ended' ? (
					<AttachEventOffer
						outlineId={attach.outlineId}
						events={attach.events}
						reply={attach.reply}
					/>
				) : (
					<PillLink to={`/training/events/${toward.eventId}`}>
						<Icon name="calendar" size="sm" />
						{SESONG_PAGE_LABELS.heroChange}
					</PillLink>
				)}

				{children}
			</PlanCard>
			{resting}
			{notices}
		</section>
	)
}

/** A track's name in its own colour: the `-ink` step, readable as text. */
const TRACK_INK: Record<string, string> = {
	run: 'text-track-run-ink',
	bike: 'text-track-bike-ink',
	swim: 'text-track-swim-ink',
}

/**
 * _Ukevolum_ in Plan's lead (#673): one row per endurance track with a Season
 * Anchor — its name, the first unbegun week's target with its role word, so an
 * easy week does not read as a cut — and _Endre volumet_, which opens
 * _Endre startnivået_ for that track inside _Avansert_, behind its preview. A
 * strength track gets one line pointing to Avansert, where its blocks are.
 *
 * The athlete knows their weekly volume, not their anchor, so the row shows
 * the week's target and never the anchor's value.
 */
export function PlanLeadVolume({
	tracks,
	hasStrength,
}: {
	tracks: SeasonAnchorChoice[]
	hasStrength: boolean
}) {
	const location = useLocation()
	const rows = tracks.filter((track) => track.weeks.length > 0)
	if (rows.length === 0 && !hasStrength) return null
	const hrefFor = (trackId: string) => {
		const params = new URLSearchParams(location.search)
		for (const name of ['weekKey', 'phaseId']) params.delete(name)
		params.set('edit', 'season-anchor')
		params.set('trackId', trackId)
		return `?${params.toString()}#${seasonEditAnchor('season-anchor')}`
	}
	return (
		<div className="space-y-1" data-plan-lead-volume>
			<h2
				id="plan-lead-volume"
				className="text-caption text-muted-foreground font-semibold"
			>
				{PLAN_LEAD_LABELS.volume}
			</h2>
			{rows.length > 0 ? (
				<ul aria-labelledby="plan-lead-volume">
					{rows.map((track) => {
						const week = track.weeks[0]!
						const name = nbTrackName(track.discipline)
						return (
							<li
								key={track.trackId}
								className="border-border/50 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 first:border-t-0"
								data-plan-lead-volume-row={track.discipline}
							>
								<span className="min-w-0 flex-1">
									<span
										className={cn(
											'text-callout block font-semibold',
											TRACK_INK[track.discipline],
										)}
									>
										{name}
									</span>
									<span className="text-footnote text-muted-foreground block tabular-nums">
										{PLAN_LEAD_LABELS.volumeWeek(
											isoWeekNumber(week.weekKey),
											NB_WEEK_ROLE_LABELS[week.role],
											week.target == null
												? null
												: `${formatNbVolumeFigure(week.target, track.currency)} ${NB_VOLUME_UNITS[track.currency]}`,
											week.overridden,
										)}
									</span>
								</span>
								<PillLink
									to={hrefFor(track.trackId)}
									// 32 px tall like the lead's other pills; the invisible
									// box above and below makes the target 44 px.
									className="relative shrink-0 px-3 after:absolute after:inset-x-0 after:-inset-y-1.5"
									aria-label={PLAN_LEAD_LABELS.changeVolumeFor(name)}
								>
									<Icon name="bar-chart" size="sm" />
									{PLAN_LEAD_LABELS.changeVolume}
								</PillLink>
							</li>
						)
					})}
				</ul>
			) : null}
			{hasStrength ? (
				<p className="text-footnote text-muted-foreground">
					{PLAN_LEAD_LABELS.strengthVolume}
				</p>
			) : null}
		</div>
	)
}
