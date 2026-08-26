/**
 * The stream — the season's vertical axis, and the screen's reading surface.
 *
 * A week is a sticky header plus its **days** in order, always: an unplanned
 * session that landed in a past week goes in by weekday, never appended, because
 * the athlete reads their week as a week and not as an audit log.
 *
 * A row is a day and a day owns zero or more sessions (ADR 0065 §1), so the date
 * gutter is stated once per day and a morning run and an evening lift stack
 * under it. A day with nothing on it is a **cell**: the grid exists before the
 * content does, and forward of today every date has one — at the 44px control
 * floor, as a real button rather than a clickable box (ADR 0028 §2, ADR 0065 §7).
 *
 * Behind today the days are still there, but a **run** of empty ones renders as
 * one band — `7 days · nothing logged` — that expands in place (ADR 0065 §3).
 * A record that is 80% blank rows reads worse than one that is not, and the
 * band states the fact the blanks only imply.
 *
 * Both ends of the season are **stated**. An infinite scroll that runs out of
 * content and stops is indistinguishable from one that broke, so the first week
 * says how far back this screen reads and the last says how far the plan is
 * written — and offers to write the rest.
 */
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { paletteFor } from '#app/utils/dashboard.ts'
import { cn } from '#app/utils/misc.tsx'
import { bandScrollTop, offsetWithin } from './anchoring.ts'
import {
	type TimelineBand,
	type TimelineDay,
	type TimelineEndCap,
	type TimelineSession,
	type TimelineWeek,
} from './presenter.ts'
import { type RowChipTone } from './row-content.ts'
import { STREAM_ATTR, TODAY_ATTR, WEEK_ATTR } from './use-timeline-scroll.ts'

/**
 * The discipline's lane dot. It came here from the Cockpit's shared vocabulary
 * when the rest of that vocabulary was retired with the zones it dressed (#499);
 * the stream's row is the only thing that draws one now, and this is the only
 * thing on that row naming the discipline.
 */
function DiscDot({
	discipline,
	className,
	solid = false,
}: {
	discipline: string
	className?: string
	/**
	 * Fill the dot with the discipline's own ink instead of its 15%-alpha chip
	 * tint. The tint is right inside a chip, where it sits behind a label; on its
	 * own at 6px it is all but invisible, and the home timeline's lane dot is the
	 * only thing naming the discipline on that row.
	 */
	solid?: boolean
}) {
	const palette = paletteFor(discipline)
	return (
		<span
			className={cn(
				'inline-block size-2 rounded-full',
				solid ? cn('bg-current', palette.ink) : palette.chip,
				className,
			)}
		/>
	)
}

export function WeekBlock({
	week,
	anchorDayKey,
}: {
	week: TimelineWeek
	/**
	 * The day the landing aims at, as `YYYY-MM-DD`. A day, not a session: today
	 * can hold a morning run already done and a lifting session still to come,
	 * and the anchor has to be a single node — which the day it belongs to is,
	 * whether it holds two sessions, one, or none.
	 */
	anchorDayKey: string
}) {
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
			{streamRows(week).map((row) =>
				row.band ? (
					<PastBand key={row.band.key} band={row.band} days={row.days} />
				) : (
					<DayRow
						key={row.day.key}
						day={row.day}
						isAnchor={row.day.key === anchorDayKey}
					/>
				),
			)}
		</div>
	)
}

/**
 * One thing the stream renders between the week header and the next: a day, or
 * a band standing in for a run of them.
 */
type StreamRow =
	| { band: TimelineBand; days: TimelineDay[] }
	| { band: null; day: TimelineDay }

/**
 * The week's rows in order, with each run of empty days behind today replaced by
 * the band that speaks for it.
 *
 * The days themselves are not dropped — they are handed to the band, which is
 * what lets it expand into them without asking the presenter for anything more.
 * A day the presenter left out of a band (a single empty one behind today, or
 * any day forward of it) is rendered exactly as it always was.
 */
function streamRows(week: TimelineWeek): StreamRow[] {
	if (week.bands.length === 0) {
		return week.rows.map((day) => ({ band: null, day }))
	}
	const byKey = new Map(week.rows.map((day) => [day.key, day]))
	const startsAt = new Map(week.bands.map((band) => [band.key, band]))
	const covered = new Set(week.bands.flatMap((band) => band.dayKeys))
	const rows: StreamRow[] = []
	for (const day of week.rows) {
		const band = startsAt.get(day.key)
		if (band) {
			rows.push({
				band,
				days: band.dayKeys.flatMap((key) => byKey.get(key) ?? []),
			})
		} else if (!covered.has(day.key)) {
			rows.push({ band: null, day })
		}
	}
	return rows
}

/**
 * A run of empty days behind today, as one row that opens into them (ADR 0065
 * §3, ADR 0075, #500).
 *
 * A **disclosure**, and a real one (ADR 0075 §5): a button that owns
 * `aria-expanded`, states the count and the dates it stands for, and keeps
 * standing there once open so there is a way back. Expanded, the days below it are ordinary `DayRow`s —
 * they take the same add gesture a day forward of today takes, because they are
 * the same component rendering the same model.
 *
 * **Opening it does not move the reader.** The days are inserted *below* the
 * button, so everything above the band — every pixel the reader is actually
 * looking at — keeps its position and `scrollTop` is left alone. The one case
 * that needs arithmetic is a band whose own top has gone up past the reading
 * edge, and `bandScrollTop` is that arithmetic (ADR 0075 §6). The measurement
 * either side of the toggle has to belong to one reading position, which is why
 * the state is flushed synchronously rather than left to an effect a paint
 * later.
 */
function PastBand({ band, days }: { band: TimelineBand; days: TimelineDay[] }) {
	const [expanded, setExpanded] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	function toggle() {
		const node = ref.current
		const stream = node?.closest<HTMLElement>(`[${STREAM_ATTR}]`)
		if (!node || !stream) {
			setExpanded((open) => !open)
			return
		}
		const before = {
			offset: offsetWithin(
				{
					top: stream.getBoundingClientRect().top,
					scrollTop: stream.scrollTop,
				},
				{ top: node.getBoundingClientRect().top },
			),
			scrollTop: stream.scrollTop,
		}
		const was = node.getBoundingClientRect().height
		flushSync(() => setExpanded((open) => !open))
		const next = bandScrollTop(
			before,
			node.getBoundingClientRect().height - was,
		)
		if (next != null) stream.scrollTop = next
	}

	return (
		<div ref={ref} data-timeline-band={band.key}>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={expanded}
				// The dates, then the fact. One of several bands in a season, so the
				// name has to say *which* run this is — the gutter says that to a
				// sighted reader and nothing else would say it to anyone else.
				aria-label={`${band.dayKeys.length} days with nothing logged, ${band.rangeLabel}`}
				className="border-hairline hover:bg-foreground/4 grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 border-b px-[18px] py-[7px] text-left"
			>
				<span className="flex flex-col gap-0.5">
					<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
						{band.daysLabel}
					</span>
					<span className="text-ink-dimmer text-[12px]/[1.1]">
						{band.monthLabel}
					</span>
				</span>
				<span className="flex min-w-0 items-center gap-2">
					<span className="text-ink-dim min-w-0 flex-1 truncate text-[12.5px]/[1.25]">
						{band.summaryLabel}
					</span>
					<Icon
						name={expanded ? 'chevron-up' : 'chevron-down'}
						size="xs"
						className="text-ink-dimmest flex-none"
					/>
				</span>
			</button>
			{expanded
				? days.map((day) => (
						// Never the anchor: a band is behind today by construction, and
						// today is not behind itself.
						<DayRow key={day.key} day={day} isAnchor={false} />
					))
				: null}
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

/**
 * One day of the stream. The date gutter is the day's, stated once, and every
 * session on the day aligns to it — the gutter is the grid's alignment
 * contract, which is what makes a column of ragged-height rows read as a grid
 * (ADR 0065 §7).
 *
 * A day with no sessions is an **empty cell** rather than nothing at all, which
 * is what makes today addressable on a rest day and every date ahead a write
 * target. Which days get one is the presenter's call, not this component's: it
 * renders the days it is handed.
 */
function DayRow({ day, isAnchor }: { day: TimelineDay; isAnchor: boolean }) {
	return (
		<div
			// The landing anchor is today itself — not a zero-height marker and not
			// the hero, both of which move independently of the thing the athlete is
			// trying to look at. It is the day, so it survives the day being empty.
			{...(isAnchor ? { [TODAY_ATTR]: 'true' } : {})}
			// The row states which day it is. Nothing reads it at runtime; it is how
			// the 390×844 spec proves the grid has no holes in it, which is a claim
			// about a *set of dates* and not about any one row's content.
			data-timeline-day={day.key}
			className="border-hairline border-b"
		>
			{day.sessions.length === 0 ? (
				<EmptyDay day={day} />
			) : (
				day.sessions.map((session, index) => (
					<SessionRow
						key={session.id}
						session={session}
						day={day}
						// The gutter belongs to the day, so only the first session under it
						// prints it. The column stays reserved for the rest: every line of
						// the day hangs off the same 46px edge.
						showDate={index === 0}
					/>
				))
			)}
		</div>
	)
}

/**
 * A day with nothing on it — the cell the grid is made of.
 *
 * A **real button**, not a clickable box: ADR 0028's second pillar is the actual
 * `h-11` control rather than a hit-area painted around something inert, and this
 * is the row the athlete is meant to write into. `min-h-11` rather than `h-11`
 * because 44px is a **floor** — a rest day says two things and is allowed to be
 * taller — while session rows keep whatever height their content earns. What
 * makes the column read as a grid is the 46px date gutter every row aligns to,
 * not a uniform height (ADR 0065 §7).
 *
 * It says only what the app knows (ADR 0065 §4). `Rest day` is written where the
 * **Plan Outline** prescribes recovery and nowhere else, so today it is written
 * nowhere: `restPrescribed` has no producer, and naming an unplanned empty day a
 * rest day would be the app inventing a fact about the athlete's training. Every
 * other empty day is a blank cell carrying its date and the add affordance.
 *
 * TODO(#501): pressing it stamps a one-step block for the athlete's most-trained
 * discipline and renders it as a Token Sentence in the row — the authoring path
 * has to accept a date and stop hardcoding a discipline first, which reaches
 * beyond this directory. The control is here because the grid is what #497 owes;
 * the gesture is #501's, and until it lands this button opens nothing.
 */
function EmptyDay({ day }: { day: TimelineDay }) {
	return (
		<button
			type="button"
			data-timeline-empty={day.key}
			// One of up to 182 identical-looking cells, so the name says which day
			// it is. Sighted readers get that from the gutter beside it; a screen
			// reader user would otherwise hear "Add a workout" 182 times.
			aria-label={
				day.restPrescribed
					? `Rest day — ${day.dayLabel} ${day.dateLabel}`
					: `Add a workout on ${day.dayLabel} ${day.dateLabel}`
			}
			className={cn(
				'hover:bg-foreground/4 grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 px-[18px] py-[7px] text-left',
				day.isToday && 'bg-primary/7',
			)}
		>
			<span className="flex flex-col gap-0.5">
				<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{day.dayLabel}
				</span>
				<span className="text-ink-dimmer text-[12px]/[1.1]">
					{day.dateLabel}
				</span>
			</span>
			{day.restPrescribed ? (
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="text-ink-body text-[13px]/[1.25] font-semibold">
						Rest day
					</span>
					<span className="text-ink-dimmer text-[11.5px]/[1.35]">
						The plan asks for nothing today.
					</span>
				</span>
			) : (
				/* No label where the plan has said nothing — just the affordance,
				   quieter than any row that carries content, so a week of them reads
				   as a blank column rather than as a list of prompts. */
				<span className="text-ink-dimmest text-[12.5px]/[1.2]">
					Add a workout
				</span>
			)}
		</button>
	)
}

function SessionRow({
	session,
	day,
	showDate,
}: {
	session: TimelineSession
	day: TimelineDay
	showDate: boolean
}) {
	const missed = session.status === 'missed'
	return (
		<Link
			to={session.to}
			prefetch="intent"
			data-status={session.status}
			className={cn(
				'hover:bg-foreground/4 grid grid-cols-[46px_1fr] items-start gap-3 px-[18px] py-[13px]',
				day.isToday && 'bg-primary/7',
			)}
		>
			<span className="flex flex-col gap-0.5 pt-px">
				{showDate ? (
					<>
						<span className="text-ink-dim text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
							{day.dayLabel}
						</span>
						<span className="text-ink-dimmer text-[12px]/[1.1]">
							{day.dateLabel}
						</span>
					</>
				) : null}
			</span>
			<span className="flex min-w-0 flex-col gap-1.5">
				<span className="flex items-center gap-2">
					{/* A missed session's lane goes quiet: it never happened, so it
					    should not carry the colour of a session that did. It reads off
					    the ink ladder rather than as an alpha on the foreground,
					    because a lane gone quiet is a tone of its own and not a
					    weaker version of the row it sits on. */}
					{/* Named, because the dot is the only thing on the row that says
					    which discipline this was — a colour alone is not a label. */}
					{missed ? (
						<span
							role="img"
							aria-label={`${session.disciplineLabel} — missed`}
							title={`${session.disciplineLabel} — missed`}
							className="bg-ink-dimmest size-[6px] flex-none rounded-full"
						/>
					) : (
						<span
							role="img"
							aria-label={session.disciplineLabel}
							className="flex"
						>
							<DiscDot
								solid
								discipline={session.discipline}
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
						{session.title}
					</span>
					{/* Today's row carries the action inline: the one row the athlete
					    came here to act on should not need a second tap to find. */}
					{day.isToday ? (
						<span className="bg-primary text-primary-foreground h-[28px] flex-none rounded-[9px] px-3 text-[11.5px]/[28px] font-bold">
							Open
						</span>
					) : null}
				</span>
				{session.bars.length > 0 ? (
					<span className="block w-[100px]">
						<ProfileBars
							bars={session.bars}
							groups={session.groups}
							scale="row"
						/>
					</span>
				) : null}
				{session.externalLoad ? (
					<span className="text-ink-dim text-[11.5px]/[1.35]">
						{session.externalLoad}
					</span>
				) : null}
				{/* Lighter than the line above on purpose — see `row-content.ts`. */}
				{session.internalLoad ? (
					<span className="text-ink-facts text-[11.5px]/[1.4] [text-wrap:pretty]">
						{session.internalLoad}
					</span>
				) : null}
				{session.chips.length > 0 ? (
					<span className="flex flex-wrap gap-1.5">
						{session.chips.map((chip) => (
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
 * the honest answer to "why does this stop?" is worth stating — and both axes
 * stop at the same place, which is worth saying once.
 *
 * What it must **not** say is what it used to: `Nothing logged before 7 July`
 * over `This is as far back as your history goes`. Home queries half a year
 * (`TIMELINE_TRAILING_DAYS`), so the first session the stream can see is the
 * first one *inside that window* — and for any athlete with a longer history
 * that sentence was the query's own bound dressed up as a fact about their
 * training. The bound is real and worth stating; whose bound it is, is the
 * whole of the fix (ADR 0075 §3, #500).
 */
export function StartCap({
	loggedFromLabel,
	reachesBackToLabel,
	reachLabel,
}: {
	loggedFromLabel: string | null
	reachesBackToLabel: string
	reachLabel: string
}) {
	return (
		<div className="border-hairline-week flex flex-col gap-[5px] border-b px-[18px] pt-[20px] pb-[14px]">
			<span className="text-muted-foreground text-[12.5px]/[1.3] font-semibold">
				{`Home reads back to ${reachesBackToLabel}`}
			</span>
			<span className="text-ink-dimmer text-[11.5px]/[1.45]">
				{loggedFromLabel
					? `${reachLabel} of it, and the earliest session in that reach is ${loggedFromLabel}. Older training is not on this screen — the strip stops here too.`
					: `${reachLabel} of it, with nothing logged in that reach. Older training is not on this screen — the strip stops here too.`}
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
