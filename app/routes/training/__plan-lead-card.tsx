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
 * `children` is the lead's last slot, for what changes the plan as a whole:
 * _Bytt treningsform_ (#581) goes there, after _Legg til et løp_.
 *
 * No motion of its own: the lead is the page's resting state, and the morph
 * from _Planen er klar_'s curve into this one is #582's.
 */
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatNbDate } from '#app/utils/format.ts'
import {
	OPEN_ENDED_PLAN_LABEL,
	openEndedBlockLabel,
	PHILOSOPHY_LABELS,
	PLAN_LEAD_LABELS,
	SESONG_PAGE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'
import {
	AttachEventOffer,
	type AttachableEvent,
	type AttachEventReply,
} from './__attach-event.tsx'
import { PillLink, PlanCard } from './__plan-chrome.tsx'
import { type NextEasyWeek, planPlainName } from './__plan-lead.ts'
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
	className?: string
	/** The lead's last slot: _Bytt treningsform_ (#581). */
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
		</section>
	)
}
