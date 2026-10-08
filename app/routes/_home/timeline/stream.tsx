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
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Fragment, memo, type ReactNode, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type action as sessionReleaseAction } from '#app/routes/resources/session-release.tsx'
import {
	ANNET_ACTION_LABELS,
	CAP_LABELS,
	DAY_ROW_LABELS,
	DRIFT_MARK,
	foldedWeekControlLabel,
	RELEASE_ACTION_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import {
	SESSION_RELEASE_ACTION,
	SessionReleaseSchema,
} from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { bandScrollTop, offsetWithin } from './anchoring.ts'
import { StampDraft, StampedSentence } from './day-stamp-cell.tsx'
import { useDayStamp } from './day-stamp-context.tsx'
import { DiscDot } from './disc-dot.tsx'
import { ImportLinkAction, MarkDoneAction } from './import-actions.tsx'
import {
	type TimelineBand,
	type TimelineDay,
	type TimelineEndCap,
	type TimelineSession,
	type TimelineTrackWeek,
	type TimelineWeek,
} from './presenter.ts'
import { growIn } from './reflow.ts'
import { type RowChipTone } from './row-content.ts'
import { StrengthLogPanel } from './strength-log-panel.tsx'
import {
	HELD_ATTR,
	STREAM_ATTR,
	TODAY_ATTR,
	WEEK_ATTR,
	WEEK_HEADER_ATTR,
} from './use-timeline-scroll.ts'

/**
 * A week and its days — or, folded or collapsed, a week as one line (#505
 * stories 27, 31).
 *
 * **Memoised, and that is load-bearing at full span** (#503). Every scroll frame
 * that crosses a week header sets the active week, and a re-render of the frame
 * re-renders every week mounted in it: measured on a 52-week season, one fling
 * cost 1,470 `WeekBlock` renders — thirty full passes over the whole stream —
 * for a state change no week block reads. A week's props are the week itself,
 * which comes off a memoised season, the anchor day, which is a date string,
 * and a folded week's open flag and its stable toggle, so the comparison stays
 * a handful of reference checks and the fan-out is gone.
 */
export const WeekBlock = memo(function WeekBlock({
	week,
	anchorDayKey,
	open = false,
	onToggle,
	afterAnchor = null,
}: {
	week: TimelineWeek
	/**
	 * The day the landing aims at, as `YYYY-MM-DD`. A day, not a session: today
	 * can hold a morning run already done and a lifting session still to come,
	 * and the anchor has to be a single node — which the day it belongs to is,
	 * whether it holds two sessions, one, or none.
	 */
	anchorDayKey: string
	/** A folded week the athlete (or a strip jump) has opened. */
	open?: boolean
	/** Open or close a folded week; stable, so the memo above holds. */
	onToggle?: (key: string) => void
	/**
	 * What sits right under today's row — the Ukeskiftet card (#505 story 42).
	 * Below the anchor rather than above it, so the landing, which parks today
	 * under the week header, lands with the card in view instead of scrolled
	 * past it.
	 */
	afterAnchor?: ReactNode
}) {
	const ref = useRef<HTMLDivElement>(null)
	const runRef = useRef<HTMLDivElement>(null)
	const folded = week.shape === 'folded'
	const showDays = !folded || open

	/**
	 * Open or close a folded week without moving the reader — the past band's
	 * own arithmetic, for the same reason (ADR 0075 §6): the days arrive below
	 * the fold's line, so only a fold whose top has gone up past the reading
	 * edge needs the height handed back, and the stream's own compensation is
	 * told the insertion is paid for.
	 */
	function toggle() {
		const node = ref.current
		const stream = node?.closest<HTMLElement>(`[${STREAM_ATTR}]`)
		if (!onToggle) return
		if (!node || !stream) {
			onToggle(week.key)
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
		const was = runRef.current?.scrollHeight ?? 0
		// Held **before** the render, not after it. Unlike a band's, this toggle
		// is the stream's own state, so the render it causes runs the stream's
		// compensation inside the `flushSync` — and that compensation, crediting
		// the run to the week the reader was last parked in, threw the stream
		// hundreds of pixels down and the hero half back open (#505 S9 review).
		stream.setAttribute(HELD_ATTR, '')
		flushSync(() => onToggle(week.key))
		const run = runRef.current
		const next = bandScrollTop(before, (run?.scrollHeight ?? 0) - was)
		if (next != null) stream.scrollTop = next
		if (run) growIn(run)
	}

	const days = (
		<>
			{/* The line where the plan begins. Above it is history the athlete
			    brought with them, and saying so once — here — is what lets every
			    imported row above stay chip-free. */}
			{week.planStart ? (
				<p className="border-hairline text-muted-foreground bg-primary/5 border-b px-[18px] py-[11px] text-[11.5px]/[1.45]">
					{DAY_ROW_LABELS.planStart}
				</p>
			) : null}
			{streamRows(week).map((row) =>
				row.band ? (
					<PastBand key={row.band.key} band={row.band} days={row.days} />
				) : (
					<Fragment key={row.day.key}>
						<DayRow day={row.day} isAnchor={row.day.key === anchorDayKey} />
						{row.day.key === anchorDayKey ? afterAnchor : null}
					</Fragment>
				),
			)}
		</>
	)

	return (
		<div ref={ref} {...{ [WEEK_ATTR]: week.key }} data-week-shape={week.shape}>
			{week.shape === 'collapsed' ? (
				<CollapsedHeader week={week} />
			) : folded ? (
				<FoldedHeader week={week} open={open} onToggle={toggle} />
			) : (
				<WeekHeader week={week} />
			)}
			{folded ? (
				open ? (
					<div ref={runRef} data-timeline-fold-run className="reflow">
						<WeekFigures
							week={week}
							className="border-hairline border-b px-[18px] py-[10px]"
						/>
						{days}
					</div>
				) : null
			) : showDays ? (
				days
			) : null}
		</div>
	)
})

/**
 * The header a week reads under (#505 stories 19, 23): which week, its phase
 * and rhythm, and its numbers — per Training Track, the Week Target, the
 * Planned Volume and the Actual Volume side by side in the track's own unit.
 *
 * Sticky, so the week being read always says what it is.
 */
function WeekHeader({ week }: { week: TimelineWeek }) {
	return (
		<div
			{...{ [WEEK_HEADER_ATTR]: '' }}
			className="bg-background border-hairline-week sticky top-0 z-2 flex flex-col gap-1.5 border-t border-b px-[18px] py-[10px]"
		>
			<WeekTitle week={week} />
			<WeekFigures week={week} />
		</div>
	)
}

/** `DENNE UKA 18–24 Feb` … `Build · hard uke`. */
function WeekTitle({ week }: { week: TimelineWeek }) {
	return (
		<div className="flex items-baseline justify-between gap-2.5">
			<h2
				className={cn(
					'flex min-w-0 items-baseline gap-2 text-[11.5px]/[1.2] font-bold tracking-[0.02em] uppercase',
					week.isNow
						? 'text-primary'
						: week.imported
							? 'text-muted-foreground'
							: 'text-foreground',
				)}
			>
				<span>{week.relativeName}</span>{' '}
				<span className="text-ink-dimmer text-[10.5px]/[1.2] font-semibold tracking-normal normal-case">
					{week.rangeLabel}
				</span>
			</h2>
			{week.kindLabel ? (
				<span
					data-week-kind
					className={cn(
						'flex-none text-right text-[10.5px]/[1.2]',
						week.role === 'loading' ? 'text-ink-dim' : 'text-ink-dimmer',
					)}
				>
					{week.kindLabel}
				</span>
			) : null}
		</div>
	)
}

/**
 * The week's numbers. A plan week reads one line per track — `Løping · mål 46
 * · planlagt 44 · gjort 35 km`, its verdict, and the `≠` mark — with what has
 * no number said beside it (`+1 uten km`), never folded into the sum. A week
 * with no track to read it in carries its sessions and load instead, and Annet
 * sits apart, counting in nothing.
 */
function WeekFigures({
	week,
	className,
}: {
	week: TimelineWeek
	className?: string
}) {
	return (
		<div className={cn('flex flex-col gap-1', className)}>
			{week.tracks.length === 0 ? (
				<span className="text-ink-dim text-[12px]/[1.3]">{week.loadLine}</span>
			) : (
				// A track with no target, nothing planned and nothing done is a line of
				// zeros: left out, by the rule the strip's lifting dot is drawn by.
				week.tracks
					.filter((track) => track.hasFigures)
					.map((track) => <TrackLine key={track.trackId} track={track} />)
			)}
			{week.otherTrack ? (
				<span data-week-annet className="text-ink-dimmer text-[11px]/[1.3]">
					{`${week.otherTrack.label} · ${week.otherTrack.sessions} · ${week.otherTrack.note}`}
				</span>
			) : null}
		</div>
	)
}

/** A figure, or a quiet dash where the week has none to state. */
function Figure({ label, value }: { label: string; value: string | null }) {
	return (
		<span className="whitespace-nowrap">
			<span className="text-ink-dimmer">{label}</span>{' '}
			<span className="text-foreground font-semibold">{value ?? '–'}</span>
		</span>
	)
}

export function TrackLine({
	track,
	review = false,
}: {
	track: TimelineTrackWeek
	/**
	 * Drawn in the Ukeskiftet card's review of the week that went, not in a
	 * week header — marked apart, so the two are never read as one.
	 */
	review?: boolean
}) {
	const extras = [
		track.gradeNote,
		track.sessionsLabel,
		track.plannedUnmeasuredLabel,
		track.actualUnmeasuredLabel,
		track.partialLabel,
		track.paceLabel,
		track.zoneLabel
			? track.zoneIntentNote
				? `${track.zoneLabel} (${track.zoneIntentNote})`
				: track.zoneLabel
			: null,
	].filter((part): part is string => !!part)
	return (
		<div
			{...(review
				? { 'data-review-track': track.trackId }
				: { 'data-week-track': track.trackId })}
			className="flex flex-col gap-0.5"
		>
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]/[1.3] tabular-nums">
				<span className="text-ink-dim font-semibold">{track.name}</span>
				<span className="flex flex-wrap items-baseline gap-x-1.5">
					<Figure
						label={WEEK_FIGURE_LABELS.target}
						value={track.figures.target}
					/>
					<span className="text-ink-dimmest">·</span>
					<Figure
						label={WEEK_FIGURE_LABELS.planned}
						value={track.figures.planned}
					/>
					<span className="text-ink-dimmest">·</span>
					<Figure label={WEEK_FIGURE_LABELS.done} value={track.figures.done} />
					<span className="text-ink-dim">{track.unit}</span>
				</span>
				{track.driftLabel ? (
					<span
						role="img"
						aria-label={track.driftLabel}
						title={track.driftLabel}
						className="text-warning font-bold"
					>
						{DRIFT_MARK}
					</span>
				) : null}
				{track.gradeLabel ? (
					<span
						data-week-grade={track.grade.status}
						className={cn(
							'rounded-[6px] border px-[6px] text-[11px]/[1.45] font-semibold',
							GRADE_TONE[track.grade.status],
						)}
					>
						{track.gradeLabel}
					</span>
				) : null}
			</div>
			{extras.length > 0 ? (
				<span className="text-ink-dimmer text-[11px]/[1.35]">
					{extras.join(' · ')}
				</span>
			) : null}
		</div>
	)
}

/**
 * A verdict's tone. Muted, and coloured only on a deviation — the reference
 * apps' lesson that a compliance colour on every week is a colour nobody reads.
 */
const GRADE_TONE: Record<TimelineTrackWeek['grade']['status'], string> = {
	'not-yet': 'border-hairline-edge text-ink-dim',
	ungraded: 'border-hairline-edge text-ink-dimmer',
	under: 'border-warning/40 text-warning',
	on: 'border-hairline-edge text-ink-dim',
	over: 'border-warning/40 text-warning',
}

/**
 * A closed week, folded to one line above today (#505 story 31): its name and
 * dates, and what was done against what was asked — `35 av 46 km · under`.
 * Reachable, but out of the way: a tap opens the whole week below the line,
 * and the line stays, carrying the way back (ADR 0075 §5's disclosure).
 */
function FoldedHeader({
	week,
	open,
	onToggle,
}: {
	week: TimelineWeek
	open: boolean
	onToggle: () => void
}) {
	return (
		<button
			type="button"
			data-timeline-fold={week.key}
			onClick={onToggle}
			aria-expanded={open}
			aria-label={foldedWeekControlLabel(
				`${week.relativeName}, ${week.rangeLabel}`,
				week.foldLabel ?? '',
			)}
			className={cn(
				'border-hairline-week press flex min-h-11 w-full items-center gap-3 border-t border-b px-[18px] py-[7px] text-left',
				open && 'bg-background sticky top-0 z-2',
			)}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-baseline justify-between gap-2.5">
					<span className="text-ink-dim flex min-w-0 items-baseline gap-2 text-[11px]/[1.2] font-bold tracking-[0.02em] uppercase">
						<span className="whitespace-nowrap">{week.relativeName}</span>
						<span className="text-ink-dimmer text-[10.5px]/[1.2] font-semibold tracking-normal normal-case">
							{week.rangeLabel}
						</span>
					</span>
					{week.kindLabel ? (
						<span className="text-ink-dimmer flex-none text-[10.5px]/[1.2]">
							{week.kindLabel}
						</span>
					) : null}
				</span>
				<span className="text-ink-body text-[12px]/[1.3] tabular-nums">
					{week.foldLabel}
				</span>
			</span>
			<Icon
				name={open ? 'chevron-up' : 'chevron-down'}
				size="xs"
				className="text-ink-dimmest flex-none"
			/>
		</button>
	)
}

/**
 * A plan week past the Planning Horizon (#505 story 27): one line saying what
 * it will be and when the week change fills it. Not a control — there is
 * nothing in it to open — and the athlete's own sessions there follow as
 * ordinary rows, because their fixed points are never hidden (story 28).
 */
function CollapsedHeader({ week }: { week: TimelineWeek }) {
	return (
		<div
			data-timeline-collapsed={week.key}
			className="border-hairline-week flex min-h-11 flex-col justify-center gap-0.5 border-t border-b px-[18px] py-[7px]"
		>
			<span className="text-ink-dim text-[12px]/[1.3]">{week.foldLabel}</span>
			<span className="text-ink-dimmer text-[10.5px]/[1.2]">
				{[week.rangeLabel, week.roleLabel].filter(Boolean).join(' · ')}
			</span>
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
	// A collapsed week draws only the days holding the athlete's own sessions.
	const shown = new Set(week.shownDayKeys)
	const rowsShown = week.rows.filter((day) => shown.has(day.key))
	if (week.bands.length === 0) {
		return rowsShown.map((day) => ({ band: null, day }))
	}
	const byKey = new Map(week.rows.map((day) => [day.key, day]))
	const startsAt = new Map(week.bands.map((band) => [band.key, band]))
	const covered = new Set(week.bands.flatMap((band) => band.dayKeys))
	const rows: StreamRow[] = []
	for (const day of rowsShown) {
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
 *
 * The run **grows in** rather than appearing (#502): seven rows arriving in one
 * frame is the jarring change the band exists to prevent, so it is one of the
 * two places the timeline animates `height`. That is also why the delta handed
 * to `bandScrollTop` is read off the run's *content* and not off the band's
 * box — mid-transition the box is a number on its way somewhere, and the
 * position has to be compensated for where the run ends up.
 */
function PastBand({ band, days }: { band: TimelineBand; days: TimelineDay[] }) {
	const [expanded, setExpanded] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	const runRef = useRef<HTMLDivElement>(null)

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
		// What the run is worth, either side of the toggle. Closing, the wrapper
		// is gone afterwards and its height is what was taken away; opening, it
		// arrives at its natural height and is what was added.
		const was = runRef.current?.scrollHeight ?? 0
		flushSync(() => setExpanded((open) => !open))
		const run = runRef.current
		const next = bandScrollTop(before, (run?.scrollHeight ?? 0) - was)
		if (next != null) stream.scrollTop = next
		// Whether or not the position moved, this insertion is **settled**: the
		// band is the finer-grained judge of whether its own run opened above the
		// reading edge, and the stream's week-keyed compensation must not decide
		// again on top of it (#503). Set even when `next` is null — "no correction
		// needed" is an answer, not an absence of one.
		stream.setAttribute(HELD_ATTR, '')
		// After the compensation, never before it: the growth starts by writing
		// the closed height back onto the box, and the position it is being
		// compensated against is the open one.
		if (run) growIn(run)
	}

	return (
		<div
			ref={ref}
			data-timeline-band={band.key}
			data-band-kind={band.kind}
			// The days the band stands for, so a reader of the DOM — the 390×844
			// spec — can tell a folded day from a missing one.
			data-band-days={band.dayKeys.join(' ')}
		>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={expanded}
				// The dates, then the fact. One of several bands in a season, so the
				// name has to say *which* run this is — the gutter says that to a
				// sighted reader and nothing else would say it to anyone else.
				aria-label={band.controlLabel}
				className="border-hairline press grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 border-b px-[18px] py-[7px] text-left"
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
			{expanded ? (
				<div ref={runRef} className="reflow">
					{days.map((day) => (
						// Never the anchor: a band is behind today by construction, and
						// today is not behind itself.
						<DayRow key={day.key} day={day} isAnchor={false} />
					))}
				</div>
			) : null}
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
					<DaySession
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
 * Pressing it opens the **draft** in place (#501): the Discipline chip prefilled
 * from the athlete's most-trained discipline and shown before anything commits,
 * the sentence the stamp is about to write, and the **More** escape to the full
 * route for what the line cannot say. Confirming stamps a one-step block and the
 * row renders it as a Token Sentence — see `day-stamp-cell.tsx`.
 */
function EmptyDay({ day }: { day: TimelineDay }) {
	const stamp = useDayStamp()

	// The tapped cell opens **in place**, as layout rather than as a floating
	// panel: it is the row that grew, and the days below it moved down. That is
	// what keeps the draft — and the token popover the stamp leads to — off the
	// next day's row at 390×844, where a 44px cell has no room underneath it.
	if (stamp.draftDayKey === day.key) {
		return (
			<StampDraft
				dayKey={day.key}
				dayLabel={day.dayLabel}
				dateLabel={day.dateLabel}
			/>
		)
	}

	return (
		<button
			type="button"
			data-timeline-empty={day.key}
			onClick={() => stamp.openDraft(day.key)}
			// One of up to 182 identical-looking cells, so the name says which day
			// it is. Sighted readers get that from the gutter beside it; a screen
			// reader user would otherwise hear "Add a workout" 182 times.
			aria-label={
				day.restPrescribed
					? DAY_ROW_LABELS.restDayOn(`${day.dayLabel} ${day.dateLabel}`)
					: DAY_ROW_LABELS.addWorkoutOn(`${day.dayLabel} ${day.dateLabel}`)
			}
			className={cn(
				'press grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 px-[18px] py-[7px] text-left',
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
						{DAY_ROW_LABELS.restDay}
					</span>
					<span className="text-ink-dimmer text-[11.5px]/[1.35]">
						{DAY_ROW_LABELS.restDayNote}
					</span>
				</span>
			) : (
				/* No label where the plan has said nothing — just the affordance,
				   quieter than any row that carries content, so a week of them reads
				   as a blank column rather than as a list of prompts. */
				<span className="text-ink-dimmest text-[12.5px]/[1.2]">
					{DAY_ROW_LABELS.addWorkout}
				</span>
			)}
		</button>
	)
}

/**
 * One session under its day — either the row it reads as, or, for the session
 * the athlete has just stamped into this cell, the **editable Token Sentence**
 * it was written as (ADR 0065 §5).
 *
 * Which of the two is client state and nothing else: the session itself is one
 * session, arriving through the ledger like every other, and nothing about it
 * records which surface authored it.
 */
function DaySession({
	session,
	day,
	showDate,
}: {
	session: TimelineSession
	day: TimelineDay
	showDate: boolean
}) {
	const stamp = useDayStamp()
	const ledger = stamp.openSessionId === session.id ? stamp.openSession : null

	if (ledger) {
		return (
			<StampedSentence
				session={ledger}
				dayLabel={showDate ? day.dayLabel : ''}
				dateLabel={showDate ? day.dateLabel : ''}
				thresholds={stamp.thresholds}
			/>
		)
	}
	return <SessionRow session={session} day={day} showDate={showDate} />
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
	const row = (
		<Link
			to={session.to}
			prefetch="intent"
			data-status={session.status}
			className={cn(
				'press grid grid-cols-[46px_1fr] items-start gap-3 px-[18px] py-[13px]',
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
				{/* Top-aligned, because the title wraps: the dot, the mark and the
				    action sit on its first line, the way a printed plan reads. */}
				<span className="flex items-start gap-2">
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
							aria-label={DAY_ROW_LABELS.missedMark(session.disciplineLabel)}
							title={DAY_ROW_LABELS.missedMark(session.disciplineLabel)}
							className="bg-ink-dimmest mt-[6px] size-[6px] flex-none rounded-full"
						/>
					) : (
						<span
							role="img"
							aria-label={session.disciplineLabel}
							className="mt-[6px] flex"
						>
							<DiscDot
								solid
								discipline={session.discipline}
								className="size-[6px] flex-none"
							/>
						</span>
					)}
					{/* The whole title, wrapped, never cut with "…" (#505 story 32): a
					    session the athlete cannot read in full is one they have to
					    open to find out what it is. */}
					<span
						data-session-title
						className={cn(
							'min-w-0 flex-1 text-[14.5px]/[1.25] font-semibold tracking-[-0.015em] [text-wrap:pretty] break-words',
							missed ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</span>
					{/* Whose session this is (#505 story 29). The athlete's own carries a
					    small closed lock — the app may not change it, and "lås opp" is
					    how it is handed back. The app's own, the plan's default, carries
					    an open lock one step quieter on the ink ladder: visible, so the
					    athlete can tell the two apart, but never louder than the title. */}
					{session.ownerLabel == null ? null : (
						<span
							role="img"
							aria-label={session.ownerLabel}
							title={session.ownerLabel}
							className={cn(
								'mt-[3px] flex flex-none',
								session.owner === 'athlete'
									? 'text-ink-dimmer'
									: 'text-ink-dimmest',
							)}
						>
							<Icon
								name={
									session.owner === 'athlete' ? 'lock-closed' : 'lock-open-1'
								}
								size="xs"
							/>
						</span>
					)}
					{/* Today's row carries the action inline: the one row the athlete
					    came here to act on should not need a second tap to find. */}
					{day.isToday ? (
						<span className="bg-primary text-primary-foreground -my-[5px] h-[28px] flex-none rounded-[9px] px-3 text-[11.5px]/[28px] font-bold">
							{DAY_ROW_LABELS.open}
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
				{/* Done with no numbers: where they will come from (story 82). */}
				{session.doneNote ? (
					<span
						data-done-note
						className="text-ink-dim text-[11.5px]/[1.35] [text-wrap:pretty]"
					>
						{session.doneNote}
					</span>
				) : null}
				{session.chips.length > 0 ||
				session.annet?.inAnnet ||
				session.extraLabel ? (
					<span className="flex flex-wrap gap-1.5">
						{/* Recorded with no plan behind it (#505 story 79). */}
						{session.extraLabel ? (
							<span
								data-extra-chip
								className={cn(
									'rounded-[6px] border px-[7px] py-[2px] text-[10px]/[1.5]',
									CHIP_TONE.muted,
								)}
							>
								{session.extraLabel}
							</span>
						) : null}
						{/* Counted in nothing, by the athlete's own choice (story 33). */}
						{session.annet?.inAnnet ? (
							<span
								data-annet-chip
								className={cn(
									'rounded-[6px] border px-[7px] py-[2px] text-[10px]/[1.5]',
									CHIP_TONE.muted,
								)}
							>
								{ANNET_ACTION_LABELS.chip}
							</span>
						) : null}
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
	if (
		!session.annet &&
		!session.release &&
		!session.importLink &&
		!session.markDone &&
		!session.strengthLog
	) {
		return row
	}
	return (
		<div className={cn(day.isToday && 'bg-primary/7')}>
			{row}
			{session.importLink ? (
				<ImportLinkAction link={session.importLink} />
			) : null}
			{session.annet ? (
				<AnnetAction
					sessionId={session.id}
					inAnnet={session.annet.inAnnet}
					label={session.annet.actionLabel}
				/>
			) : null}
			{/* _Gjort_ and _Lås opp_ share one line: both are about a planned
			    session, and a row should not grow a line per offer. */}
			{session.markDone || session.release ? (
				<div className="-mt-[14px] flex flex-wrap items-center gap-x-4 pr-[18px] pl-[76px]">
					{session.markDone ? (
						<MarkDoneAction
							sessionId={session.id}
							label={session.markDone.actionLabel}
							ariaLabel={session.markDone.label}
						/>
					) : null}
					{session.release ? (
						<ReleaseAction
							sessionId={session.id}
							title={session.title}
							label={session.release.actionLabel}
							note={session.release.note}
						/>
					) : null}
				</div>
			) : null}
			{session.strengthLog ? (
				<StrengthLogPanel sessionId={session.id} words={session.strengthLog} />
			) : null}
		</div>
	)
}

/**
 * "Lås opp" (#505 story 55): hand one of the athlete's own planned sessions
 * back to the app, so the Week Replan may adjust it again
 * (`releaseSession`). Beside the row's closed lock, as quiet as the Annet
 * action, with the one sentence that says what the tap gives away.
 *
 * Once it has taken, home revalidates and the row's lock opens — the mark is
 * the confirmation. While the post is in flight the action already says so.
 */
function ReleaseAction({
	sessionId,
	title,
	label,
	note,
}: {
	sessionId: string
	title: string
	label: string
	note: string
}) {
	const fetcher = useFetcher<typeof sessionReleaseAction>()
	const [form, fields] = useForm({
		id: `release-${sessionId}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionReleaseSchema })
		},
		defaultValue: { sessionId },
	})
	// Said once it is sent, and kept once the server agreed; a refusal (the
	// session is gone) puts the action back, with why, rather than claiming a
	// release.
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	const noteId = `${form.id}-note`
	return (
		<fetcher.Form
			method="post"
			action={SESSION_RELEASE_ACTION}
			{...getFormProps(form)}
			className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2"
		>
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			{sent ? (
				<span
					aria-live="polite"
					className="text-ink-dimmer flex min-h-11 items-center text-[11px]/[1.35]"
				>
					{RELEASE_ACTION_LABELS.released}
				</span>
			) : (
				<>
					<button
						type="submit"
						aria-label={RELEASE_ACTION_LABELS.actionFor(title)}
						aria-describedby={noteId}
						className="text-ink-dimmer flex min-h-11 flex-none items-center gap-1 text-[11px]/[1] font-semibold underline decoration-dotted underline-offset-[3px]"
					>
						<Icon name="lock-open-1" size="xs" />
						{label}
					</button>
					<span
						id={noteId}
						className="text-ink-dimmest min-w-0 flex-1 text-[11px]/[1.35]"
					>
						{note}
					</span>
				</>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
	)
}

/**
 * The row's one action besides opening it: count the session in Annet, or put
 * it back in its track (#505 story 33). A sibling of the row's link rather than
 * inside it — a control inside a link is two targets under one thumb — set on
 * the gutter's edge, quiet, under the row it belongs to.
 *
 * It posts to its own resource route, owner-scoped on the server
 * (`setCountsInNoTrack`), and the home loader revalidates after it, so the week
 * header's numbers move with the tap. While the post is in flight the button
 * already says what it will say after, so a second tap is not needed to see
 * that the first one took.
 */
function AnnetAction({
	sessionId,
	inAnnet,
	label,
}: {
	sessionId: string
	inAnnet: boolean
	label: string
}) {
	const fetcher = useFetcher()
	const pending = fetcher.formData?.get('countsInNoTrack')
	const willBeInAnnet = pending == null ? inAnnet : pending === 'true'
	return (
		<fetcher.Form
			method="post"
			action="/resources/session-annet"
			className="-mt-[14px] flex pr-[18px] pl-[76px]"
		>
			<input type="hidden" name="sessionId" value={sessionId} />
			<input
				type="hidden"
				name="countsInNoTrack"
				value={String(!willBeInAnnet)}
			/>
			<button
				type="submit"
				data-annet-action={sessionId}
				// The 44px floor is the control's (ADR 0028 §2); the words are as
				// quiet as the row's own facts, so the action never outranks the
				// session it belongs to.
				className="text-ink-dimmer flex min-h-11 items-center text-[11px]/[1] font-semibold underline decoration-dotted underline-offset-[3px]"
			>
				{pending == null
					? label
					: willBeInAnnet
						? ANNET_ACTION_LABELS.toTrack
						: ANNET_ACTION_LABELS.toAnnet}
			</button>
		</fetcher.Form>
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
	reachWeeks,
}: {
	loggedFromLabel: string | null
	reachesBackToLabel: string
	reachWeeks: number
}) {
	return (
		<div className="border-hairline-week flex flex-col gap-[5px] border-b px-[18px] pt-[20px] pb-[14px]">
			<span className="text-muted-foreground text-[12.5px]/[1.3] font-semibold">
				{CAP_LABELS.readsBackTo(reachesBackToLabel)}
			</span>
			<span className="text-ink-dimmer text-[11.5px]/[1.45]">
				{CAP_LABELS.reach(reachWeeks, loggedFromLabel)}
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
	// would be an empty promise. The honest next step is planning one. Events,
	// the Catalogue and Programs used to be linked from here too, for want of
	// anywhere else; they live in the Sesong and Bibliotek tabs now (ADR 0083).
	const planned = cap.eventDateLabel != null
	return (
		<div className="border-hairline-week flex flex-col gap-2.5 border-t p-[18px]">
			<span className="text-foreground text-[15px]/[1.2] font-semibold tracking-[-0.015em]">
				{CAP_LABELS.writtenThrough(cap.writtenThroughLabel)}
			</span>
			<span className="text-muted-foreground text-[12.5px]/[1.5]">
				{!planned
					? CAP_LABELS.noPlan
					: unwritten > 0
						? CAP_LABELS.sketched(
								unwritten,
								cap.eventName,
								cap.eventDateLabel ?? '',
							)
						: CAP_LABELS.whole}
			</span>
			<div className="flex flex-wrap gap-2">
				{planned && unwritten > 0 ? (
					<Link
						to="/training/plan"
						className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[42px] items-center rounded-[13px] px-[15px] text-[12.5px]/[1] font-bold"
					>
						{CAP_LABELS.writeLast(unwritten)}
					</Link>
				) : null}
				{planned ? (
					<Link to="/training/plan" className={CAP_LINK}>
						{CAP_LABELS.seasonPlan}
					</Link>
				) : (
					<Link
						to="/start"
						className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[42px] items-center rounded-[13px] px-[15px] text-[12.5px]/[1] font-bold"
					>
						{CAP_LABELS.planASeason}
					</Link>
				)}
			</div>
		</div>
	)
}
