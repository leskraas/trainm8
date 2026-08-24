/**
 * The stream — the season's vertical axis, and the screen's reading surface.
 *
 * A week is a sticky header plus its sessions in day order, always: an unplanned
 * session that landed in a past week goes in by weekday, never appended, because
 * the athlete reads their week as a week and not as an audit log.
 *
 * Both ends of the season are **stated**. An infinite scroll that runs out of
 * content and stops is indistinguishable from one that broke, so the first week
 * says how far back the history goes and the last says how far the plan is
 * written — and offers to write the rest.
 */
import { Link } from 'react-router'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { cn } from '#app/utils/misc.tsx'
import { DiscDot } from '../cockpit/shared.tsx'
import {
	type TimelineEndCap,
	type TimelineRow,
	type TimelineWeek,
} from './presenter.ts'
import { type RowChipTone } from './row-content.ts'
import { TODAY_ATTR, WEEK_ATTR } from './use-timeline-scroll.ts'

export function WeekBlock({ week }: { week: TimelineWeek }) {
	return (
		<div {...{ [WEEK_ATTR]: week.key }}>
			<div className="bg-background border-hairline-week sticky top-0 z-2 flex flex-col gap-1.5 border-t border-b px-[18px] py-[10px]">
				<div className="flex items-baseline justify-between gap-2.5">
					<h2
						className={cn(
							'text-[11.5px]/[1.2] font-bold tracking-[0.02em] uppercase',
							week.isNow
								? 'text-primary'
								: week.imported
									? 'text-muted-foreground'
									: 'text-foreground',
						)}
					>
						{week.rangeLabel}
					</h2>
					{week.phaseLabel ? (
						<span className="text-ink-dimmer text-right text-[10.5px]/[1.2] uppercase">
							{week.phaseLabel}
						</span>
					) : null}
				</div>
				<span className="text-ink-dim text-[11px]/[1.2]">
					{week.statsLabel}
				</span>
			</div>
			{/* The line where the plan begins. Above it is history the athlete
			    brought with them, and saying so once — here — is what lets every
			    imported row above stay chip-free. */}
			{week.planStart ? (
				<p className="border-hairline text-muted-foreground bg-primary/5 border-b px-[18px] py-[11px] text-[11.5px]/[1.45]">
					Everything above this line is history you brought with you — no plan
					to compare it against.
				</p>
			) : null}
			{week.rows.map((row) => (
				<SessionRow key={row.id} row={row} />
			))}
		</div>
	)
}

/** A quiet outline link, at the caps' own scale. */
const CAP_LINK =
	'border-hairline-edge text-foreground hover:border-primary flex h-[42px] items-center rounded-[13px] border px-[15px] text-[12.5px]/[1] font-semibold'

/** The chip palette. See `RowChipTone` for why `warn` covers both band edges. */
const CHIP_TONE: Record<RowChipTone, string> = {
	primary: 'border-primary/40 text-primary',
	warn: 'border-warning/40 text-warning',
	bad: 'border-destructive/40 text-destructive',
	muted: 'border-hairline-edge text-ink-dim',
}

function SessionRow({ row }: { row: TimelineRow }) {
	const missed = row.status === 'missed'
	return (
		<Link
			to={row.to}
			prefetch="intent"
			// The landing anchor is today's row itself — not a zero-height marker
			// and not the hero, both of which move independently of the thing the
			// athlete is trying to look at.
			{...(row.isToday ? { [TODAY_ATTR]: 'true' } : {})}
			data-status={row.status}
			className={cn(
				'border-hairline grid grid-cols-[46px_1fr] items-start gap-3 border-b px-[18px] py-[13px] hover:bg-white/4',
				row.isToday && 'bg-primary/7',
			)}
		>
			<span className="flex flex-col gap-0.5 pt-px">
				<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{row.dayLabel}
				</span>
				<span className="text-ink-dimmer text-[12px]/[1.1]">
					{row.dateLabel}
				</span>
			</span>
			<span className="flex min-w-0 flex-col gap-1.5">
				<span className="flex items-center gap-2">
					{/* A missed session's lane goes quiet: it never happened, so it
					    should not carry the colour of a session that did. */}
					{/* Named, because the dot is the only thing on the row that says
					    which discipline this was — a colour alone is not a label. */}
					{missed ? (
						<span
							role="img"
							aria-label={`${row.disciplineLabel} — missed`}
							title={`${row.disciplineLabel} — missed`}
							className="size-[6px] flex-none rounded-full bg-white/18"
						/>
					) : (
						<span role="img" aria-label={row.disciplineLabel} className="flex">
							<DiscDot
								solid
								discipline={row.discipline}
								className="size-[6px] flex-none"
							/>
						</span>
					)}
					<span
						className={cn(
							'min-w-0 flex-1 truncate text-[14.5px]/[1.25] font-semibold tracking-[-0.015em]',
							missed ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{row.title}
					</span>
					{/* Today's row carries the action inline: the one row the athlete
					    came here to act on should not need a second tap to find. */}
					{row.isToday ? (
						<span className="bg-primary text-primary-foreground h-[28px] flex-none rounded-[9px] px-3 text-[11.5px]/[28px] font-bold">
							Open
						</span>
					) : null}
				</span>
				{row.bars.length > 0 ? (
					<span className="block w-[100px]">
						<ProfileBars bars={row.bars} groups={row.groups} scale="row" />
					</span>
				) : null}
				{row.externalLoad ? (
					<span className="text-ink-dim text-[11.5px]/[1.35]">
						{row.externalLoad}
					</span>
				) : null}
				{/* Lighter than the line above on purpose — see `row-content.ts`. */}
				{row.internalLoad ? (
					<span className="text-ink-facts text-[11.5px]/[1.4] [text-wrap:pretty]">
						{row.internalLoad}
					</span>
				) : null}
				{row.chips.length > 0 ? (
					<span className="flex flex-wrap gap-1.5">
						{row.chips.map((chip) => (
							<span
								key={chip.id}
								className={cn(
									'rounded-[6px] border px-[7px] py-[2px]',
									// A measurement is set in mono capitals; a stored note is
									// prose somebody wrote, and shouting it back would be rude.
									chip.id === 'replan'
										? 'text-[10px]/[1.5]'
										: 'font-mono text-[10px]/[1.5] font-semibold tracking-[0.06em]',
									CHIP_TONE[chip.tone],
								)}
							>
								{chip.label}
							</span>
						))}
					</span>
				) : null}
			</span>
		</Link>
	)
}

/**
 * The near end. It names the date rather than saying "no more results", because
 * the honest answer to "why does this stop?" is when the athlete's history
 * starts — and both axes stop at the same place, which is worth saying once.
 */
export function StartCap({
	loggedFromLabel,
}: {
	loggedFromLabel: string | null
}) {
	return (
		<div className="border-hairline-week flex flex-col gap-[5px] border-b px-[18px] pt-[20px] pb-[14px]">
			<span className="text-muted-foreground text-[12.5px]/[1.3] font-semibold">
				{loggedFromLabel
					? `Nothing logged before ${loggedFromLabel}`
					: 'Nothing logged yet'}
			</span>
			<span className="text-ink-dimmer text-[11.5px]/[1.45]">
				This is as far back as your history goes — the strip has no earlier
				cells either.
			</span>
		</div>
	)
}

/**
 * The far end. A plan that is sketched past its written weeks says so and
 * offers the next step; a plan written all the way through just points at
 * itself. Either way the athlete is told which of the two they are looking at.
 */
export function EndCap({ cap }: { cap: TimelineEndCap }) {
	const unwritten = cap.unwrittenWeeks
	// With no active plan there is no season plan to open, and pointing at one
	// would be an empty promise. The honest next step is picking the race the
	// season is for — so the slot carries the Events entry instead. It is also
	// the only route from home to Events now that the plan-less Cockpit slot
	// that used to carry it is gone (#178: destinations live in page elements).
	const planned = cap.eventDateLabel != null
	return (
		<div className="border-hairline-week flex flex-col gap-2.5 border-t p-[18px]">
			<span className="text-foreground text-[15px]/[1.2] font-semibold tracking-[-0.015em]">
				{`Everything is written through ${cap.writtenThroughLabel}`}
			</span>
			<span className="text-muted-foreground text-[12.5px]/[1.5]">
				{!planned
					? 'There is no season plan yet, so the timeline is only as long as what you have written.'
					: unwritten > 0
						? `The rest of the season is sketched, not written — ${unwritten} ${unwritten === 1 ? 'week' : 'weeks'} with no sessions in them yet, up to ${cap.eventName ?? 'race day'} on ${cap.eventDateLabel}.`
						: 'That is the whole plan. Nothing beyond this is scheduled.'}
			</span>
			<div className="flex flex-wrap gap-2">
				{planned && unwritten > 0 ? (
					<Link
						to="/training/plan"
						className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[42px] items-center rounded-[13px] px-[15px] text-[12.5px]/[1] font-bold"
					>
						{`Write the last ${unwritten === 1 ? 'week' : `${unwritten} weeks`}`}
					</Link>
				) : null}
				{planned ? (
					<Link to="/training/plan" className={CAP_LINK}>
						Season plan
					</Link>
				) : (
					<Link
						to="/training/plan/new"
						className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[42px] items-center rounded-[13px] px-[15px] text-[12.5px]/[1] font-bold"
					>
						Plan a season
					</Link>
				)}
			</div>
			{/*
			 * The destinations home only links to. The design puts them in a bottom
			 * tab bar; `app/root.tsx` says the wordmark row is the only persistent
			 * chrome (#178), so they live at the far end of the stream instead — the
			 * one place on this screen that is already about leaving it.
			 *
			 * Not optional garnish: before the re-composition these were the
			 * Cockpit header's plan slot, and Programs and the Catalogue have no
			 * other way in at all (#471, #477). Each earns its place in **both**
			 * plan states — retrieving one catalogue session, or running a program
			 * off the last weight lifted, is exactly what an athlete with no season
			 * wants to do.
			 *
			 * TODO(#178): if the bottom tab bar is adopted, these move into it.
			 */}
			<nav
				aria-label="Elsewhere in trainm8"
				className="border-hairline mt-1 flex flex-wrap gap-2 border-t pt-3.5"
			>
				<Link to="/training/events" className={CAP_LINK}>
					Events
				</Link>
				<Link to="/training/catalogue" className={CAP_LINK}>
					Catalogue
				</Link>
				<Link to="/training/programs" className={CAP_LINK}>
					Programs
				</Link>
			</nav>
		</div>
	)
}
