/**
 * The stream — the season's vertical axis, and I dag's reading surface.
 *
 * A week is a sticky header plus its **days** in order, always: an unplanned
 * session that landed in a past week goes in by weekday, never appended, because
 * the athlete reads their week as a week and not as an audit log. The header
 * carries the phase's colour on its left edge, as the strip's phase band does.
 *
 * A row is a day and a day owns zero or more sessions (ADR 0065 §1), so the date
 * gutter is stated once per day and a morning run and an evening lift stack
 * under it. A day with nothing on it is a **cell**: every date is one in the
 * model, at the 44px control floor, as a real button rather than a clickable
 * box (ADR 0028 §2, ADR 0065 §7).
 *
 * **Today's row is emphasised** by tone, not by a loud colour (ADR 0086): its
 * date sits in a ring, and it carries what the hero used to — the primary
 * action (`Se økta`) and the coach's one line (`Form -13, sliten — …`). On a
 * day with nothing on it, it says so and is the cell that writes one.
 *
 * A session row reads like a printed plan (#505 D6): the whole title, wrapped
 * and never cut; its own volume in its track's unit at the right edge
 * (`6,1 km`), in tabular figures; and whose session it is as a small glyph,
 * whose meaning — and the _Lås opp_ that hands it back — sit behind it in a
 * popover, said once rather than under every row.
 *
 * On screen, a **run** of two or more empty days renders as one band that
 * opens in place: behind today `7 dager · ingenting logget` (ADR 0065 §3, ADR
 * 0075), ahead of it `3 ledige dager` (ADR 0082 §4, #505 story 30). Today never
 * folds. A closed week folds to one line, and a week past the Planning Horizon
 * collapses to one (ADR 0082 §2–3).
 *
 * Both ends of the season are **stated**. A list that runs out of content and
 * stops is indistinguishable from one that broke, so the first week says how
 * far back this screen reads and the last says how far the plan is written —
 * and offers to write the rest.
 *
 * Motion (ADR 0077 as amended by 0085 and 0086): the press (`pressable`) on
 * every row, cell, band and fold, and the 200ms reflow when a draft, a band or
 * a folded week opens. Nothing else here moves.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Fragment, memo, type ReactNode, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import { type action as sessionReleaseAction } from '#app/routes/resources/session-release.tsx'
import {
	ANNET_ACTION_LABELS,
	CAP_LABELS,
	DAY_ROW_LABELS,
	DRIFT_MARK,
	foldedWeekControlLabel,
	ownerGlyphName,
	RELEASE_ACTION_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import {
	SESSION_RELEASE_ACTION,
	SessionReleaseSchema,
} from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { SESSION_ANNET_ACTION } from '#app/utils/session-annet-schema.ts'
import { bandScrollTop, offsetWithin } from './anchoring.ts'
import { StampDraft, StampedSentence } from './day-stamp-cell.tsx'
import { useDayStamp } from './day-stamp-context.tsx'
import { DiscDot } from './disc-dot.tsx'
import { ImportLinkAction, MarkDoneAction } from './import-actions.tsx'
import {
	type PhaseTone,
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
	STREAM_ATTR,
	TODAY_ATTR,
	WEEK_ATTR,
	WEEK_HEADER_ATTR,
} from './use-timeline-scroll.ts'

/**
 * What today's row carries beyond its sessions (ADR 0086): the action the
 * hero used to hold — `Se økta`, for today's own session — and the coach's
 * one line. Built once per change of what it reads, so the memo below holds.
 */
export type TodayRowExtras = {
	/**
	 * Today's session's action, on that session's row beside _Gjort_; null
	 * when today holds no session to open.
	 */
	cta: { label: string; to: string; sessionId: string } | null
	/** `Form -13, sliten — neste økt er gjort lettere: 60 min rolig i sone 2`. */
	verdict: string | null
}

/**
 * A week and its days — or, folded or collapsed, a week as one line (#505
 * stories 27, 31).
 *
 * **Memoised, and that is load-bearing at full span** (#503). Every time the
 * reader crosses a week header the active week changes, and a re-render of
 * the frame re-renders every week mounted in it: measured on a 52-week season,
 * one fling cost 1,470 `WeekBlock` renders for a state change no week block
 * reads. Since ADR 0086 every week before today is mounted from the start, so
 * the memo matters more, not less. A week's props are the week itself (off a
 * memoised season), the anchor day (a string), a folded week's open flag and
 * stable toggle, and today's extras (memoised, and only on today's week).
 */
export const WeekBlock = memo(function WeekBlock({
	week,
	anchorDayKey,
	open = false,
	onToggle,
	afterDays = null,
	today = null,
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
	 * What follows the week's last day — the Ukeskiftet card (#505 story 42),
	 * on this week. After the days rather than right under today's row (ADR
	 * 0086): the card is tall, and under today it pushed every other day of
	 * the week off the first screen. The top line's badge jumps to it.
	 */
	afterDays?: ReactNode
	/** Today's action and coach line; passed to today's week only. */
	today?: TodayRowExtras | null
}) {
	const ref = useRef<HTMLDivElement>(null)
	const runRef = useRef<HTMLDivElement>(null)
	const folded = week.shape === 'folded'
	const showDays = !folded || open

	/**
	 * Open or close a folded week without moving the reader — the past band's
	 * own arithmetic, for the same reason (ADR 0075 §6): the days arrive below
	 * the fold's line, so only a fold whose top has gone up past the reading
	 * edge needs the height handed back. A tap, never a scroll in flight.
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
				<p className="border-border/70 text-muted-foreground bg-primary/5 text-footnote border-b px-4 py-2.5">
					{DAY_ROW_LABELS.planStart}
				</p>
			) : null}
			{streamRows(week).map((row) =>
				row.band ? (
					<PastBand key={row.band.key} band={row.band} days={row.days} />
				) : (
					<Fragment key={row.day.key}>
						<DayRow
							day={row.day}
							isAnchor={row.day.key === anchorDayKey}
							today={row.day.key === anchorDayKey ? today : null}
						/>
					</Fragment>
				),
			)}
			{afterDays}
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
							className="border-border/70 border-b px-4 py-2.5"
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
 * The left edge a week's header carries: its phase's colour, as the strip's
 * phase band draws it (variant P). Literal classes, for Tailwind.
 */
const PHASE_EDGE: Record<PhaseTone, string> = {
	base: 'border-l-phase-base',
	build: 'border-l-phase-build',
	peak: 'border-l-phase-peak',
	taper: 'border-l-phase-taper',
}

function phaseEdge(week: TimelineWeek): string {
	return week.phaseTone ? PHASE_EDGE[week.phaseTone] : 'border-l-transparent'
}

/**
 * The header a week reads under (#505 stories 19, 23): which week, its phase
 * and rhythm, and its numbers — per Training Track, the Week Target, the
 * Planned Volume and the Actual Volume side by side in the track's own unit.
 *
 * Only the name and the numbers are **sticky** (ADR 0086): the notes under
 * them — what was not measured, pace, the zone split, Annet — follow in the
 * flow and scroll away. A sticky header with every note in it stood a third
 * of a phone's list tall over every row of its week.
 */
function WeekHeader({ week }: { week: TimelineWeek }) {
	return (
		<>
			<div
				{...{ [WEEK_HEADER_ATTR]: '' }}
				className={cn(
					'bg-card border-border/70 sticky top-0 z-2 flex flex-col gap-1 border-b border-l-4 py-2 pr-4 pl-3',
					phaseEdge(week),
				)}
			>
				<WeekTitle week={week} />
				<WeekFigures week={week} part="numbers" />
			</div>
			<WeekFigures
				week={week}
				part="notes"
				className={cn(
					'bg-card border-border border-b border-l-4 pt-1 pr-4 pb-2 pl-3',
					phaseEdge(week),
				)}
			/>
		</>
	)
}

/** `DENNE UKA 5.–11. okt` … `Oppbygging · hard uke`. */
function WeekTitle({ week }: { week: TimelineWeek }) {
	return (
		<div className="flex items-baseline justify-between gap-2.5">
			<h2
				className={cn(
					'text-overline flex min-w-0 items-baseline gap-2 uppercase',
					week.isNow
						? 'text-primary'
						: week.imported
							? 'text-muted-foreground'
							: 'text-foreground',
				)}
			>
				<span>{week.relativeName}</span>{' '}
				<span className="text-muted-foreground text-caption normal-case tabular-nums">
					{week.rangeLabel}
				</span>
			</h2>
			{week.kindLabel ? (
				<span
					data-week-kind
					className={cn(
						'text-caption flex-none text-right font-normal',
						week.role === 'loading'
							? 'text-foreground/80'
							: 'text-muted-foreground',
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
	part = 'all',
}: {
	week: TimelineWeek
	className?: string
	/** The numbers (the sticky half), the notes (the flowing half), or both. */
	part?: TrackLinePart
}) {
	// A track with no target, nothing planned and nothing done is a line of
	// zeros: left out, by the rule the strip's lifting dot is drawn by.
	const tracks = week.tracks.filter((track) => track.hasFigures)
	if (
		part === 'notes' &&
		!week.otherTrack &&
		!tracks.some((track) => trackNotes(track).length > 0 || track.zoneSplit)
	) {
		return null
	}
	return (
		<div
			{...(part === 'notes' ? { 'data-week-notes': '' } : {})}
			className={cn('flex flex-col gap-0.5', className)}
		>
			{part === 'notes' ? null : week.tracks.length === 0 ? (
				<span className="text-muted-foreground text-caption font-normal">
					{week.loadLine}
				</span>
			) : null}
			{tracks.map((track) => (
				<TrackLine key={track.trackId} track={track} part={part} />
			))}
			{part !== 'numbers' && week.otherTrack ? (
				<span data-week-annet className={NOTE}>
					{`${week.otherTrack.label} · ${week.otherTrack.sessions} · ${week.otherTrack.note}`}
				</span>
			) : null}
		</div>
	)
}

/**
 * A figure; or, where the side has sessions none of which has a number, what
 * stands in its place (`2 økter uten km`); or a quiet dash where the week has
 * nothing to state.
 */
function Figure({
	label,
	value,
	note = null,
}: {
	label: string
	value: string | null
	note?: string | null
}) {
	return (
		<span className="whitespace-nowrap">
			<span className="text-muted-foreground">{label}</span>{' '}
			{value == null && note != null ? (
				<span className="text-muted-foreground">{note}</span>
			) : (
				<span className="text-foreground font-semibold">{value ?? '–'}</span>
			)}
		</span>
	)
}

/** Which half of a track's line to draw: its numbers, its notes, or both. */
type TrackLinePart = 'all' | 'numbers' | 'notes'

/** What a track's line says beside its numbers, in the order it says it. */
function trackNotes(track: TimelineTrackWeek): string[] {
	return [
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
}

/** A note's type: 11px, as ADR 0082 §9 sets a header's extras. */
const NOTE = 'text-muted-foreground text-[11px]/[15px]'

export function TrackLine({
	track,
	review = false,
	part = 'all',
}: {
	track: TimelineTrackWeek
	/**
	 * Drawn in the Ukeskiftet card's review of the week that went, not in a
	 * week header — marked apart, so the two are never read as one.
	 */
	review?: boolean
	/** The numbers, the notes, or both — a week header splits them (ADR 0086). */
	part?: TrackLinePart
}) {
	const extras = trackNotes(track)
	if (part === 'notes' && extras.length === 0 && !track.zoneSplit) return null
	return (
		<div
			{...(review
				? { 'data-review-track': track.trackId }
				: part === 'notes'
					? { 'data-week-track-notes': track.trackId }
					: { 'data-week-track': track.trackId })}
			className="flex flex-col gap-0.5"
		>
			{part === 'notes' ? null : (
				<div className="text-caption flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-normal tabular-nums">
					<span className="text-muted-foreground font-semibold">
						{track.name}
					</span>
					<span className="flex flex-wrap items-baseline gap-x-1.5">
						<Figure
							label={WEEK_FIGURE_LABELS.target}
							value={track.figures.target}
						/>
						<span className="text-muted-foreground/70">·</span>
						<Figure
							label={WEEK_FIGURE_LABELS.planned}
							value={track.figures.planned}
							note={track.figureNotes.planned}
						/>
						<span className="text-muted-foreground/70">·</span>
						<Figure
							label={WEEK_FIGURE_LABELS.done}
							value={track.figures.done}
							note={track.figureNotes.done}
						/>
						<span className="text-muted-foreground">{track.unit}</span>
					</span>
					{track.driftLabel ? (
						<span
							role="img"
							aria-label={track.driftLabel}
							title={track.driftLabel}
							className="text-status-under font-bold"
						>
							{DRIFT_MARK}
						</span>
					) : null}
					{track.gradeLabel ? (
						<span
							data-week-grade={track.grade.status}
							className={cn(
								'text-caption rounded-full border px-2 font-semibold',
								GRADE_TONE[track.grade.status],
							)}
						>
							{track.gradeLabel}
						</span>
					) : null}
				</div>
			)}
			{part !== 'numbers' && extras.length > 0 ? (
				<span className={NOTE}>
					{part === 'notes' ? `${track.name} · ` : null}
					{extras.join(' · ')}
				</span>
			) : null}
			{/* A skier's zone split, one side a line (story 21): what was done,
			    then what the plan meant — never read as one measurement. */}
			{part !== 'numbers' && track.zoneSplit?.done ? (
				<span data-zone-split="done" className={NOTE}>
					{track.zoneSplit.done}
				</span>
			) : null}
			{part !== 'numbers' && track.zoneSplit?.planned ? (
				<span data-zone-split="planned" className={NOTE}>
					{[track.zoneSplit.planned, track.zoneIntentNote]
						.filter(Boolean)
						.join(' · ')}
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
	'not-yet': 'border-border text-muted-foreground',
	ungraded: 'border-border text-muted-foreground',
	under: 'border-status-under/40 text-status-under',
	on: 'border-border text-muted-foreground',
	over: 'border-status-under/40 text-status-under',
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
				'border-border pressable flex min-h-11 w-full items-center gap-3 border-b border-l-4 py-2 pr-4 pl-3 text-left',
				phaseEdge(week),
				open && 'bg-card sticky top-0 z-2',
			)}
		>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="flex items-baseline justify-between gap-2.5">
					<span className="text-muted-foreground text-overline flex min-w-0 items-baseline gap-2 uppercase">
						<span className="whitespace-nowrap">{week.relativeName}</span>
						<span className="text-caption normal-case tabular-nums">
							{week.rangeLabel}
						</span>
					</span>
					{week.kindLabel ? (
						<span className="text-muted-foreground text-caption flex-none font-normal">
							{week.kindLabel}
						</span>
					) : null}
				</span>
				<span className="text-foreground text-footnote tabular-nums">
					{week.foldLabel}
				</span>
			</span>
			<Icon
				name={open ? 'chevron-up' : 'chevron-down'}
				size="xs"
				className="text-muted-foreground/70 flex-none"
			/>
		</button>
	)
}

/**
 * A plan week past the Planning Horizon (#505 story 27): one line saying what
 * it will be and when the week change fills it. Not a control — there is
 * nothing in it to open — and the athlete's own sessions there follow as
 * ordinary rows, because their fixed points are never hidden (story 28).
 * Hatched, as the strip draws the same week dashed: a target, not a plan yet.
 */
function CollapsedHeader({ week }: { week: TimelineWeek }) {
	return (
		<div
			data-timeline-collapsed={week.key}
			className={cn(
				'border-border flex min-h-11 flex-col justify-center gap-0.5 border-b border-l-4 bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--color-muted)_6px_7px)] py-2 pr-4 pl-3',
				phaseEdge(week),
			)}
		>
			<span className="text-foreground/80 text-footnote">{week.foldLabel}</span>
			<span className="text-muted-foreground text-caption font-normal">
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
 * A run of empty days, as one row that opens into them: behind today the past
 * band (ADR 0065 §3, ADR 0075, #500), ahead of it the free days (ADR 0082 §4).
 * Its summary wraps rather than being cut with "…" (#505 story 32).
 *
 * A **disclosure**, and a real one (ADR 0075 §5): a button that owns
 * `aria-expanded`, states the count and the dates it stands for, and keeps
 * standing there once open so there is a way back. Expanded, the days below it
 * are ordinary `DayRow`s — they take the same add gesture any empty day takes,
 * because they are the same component rendering the same model.
 *
 * **Opening it does not move the reader.** The days are inserted *below* the
 * button, so everything above the band — every pixel the reader is actually
 * looking at — keeps its position and `scrollTop` is left alone. The one case
 * that needs arithmetic is a band whose own top has gone up past the reading
 * edge, and `bandScrollTop` is that arithmetic (ADR 0075 §6). The measurement
 * either side of the toggle has to belong to one reading position, which is why
 * the state is flushed synchronously rather than left to an effect a paint
 * later. It is a write the reader asked for with a tap; the list never writes
 * under a scrolling one (ADR 0086).
 *
 * The run **grows in** rather than appearing (#502): seven rows arriving in one
 * frame is the jarring change the band exists to prevent, so it is one of the
 * accordions the timeline animates `height` on — the draft, a band's run and a
 * folded week's days (ADR 0082 §6). That is also why the delta handed
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
				className="border-border/70 pressable grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 border-b py-2 pr-4 pl-4 text-left"
			>
				<span className="flex flex-col items-center gap-0.5 text-center">
					<span className="text-muted-foreground text-overline tabular-nums">
						{band.daysLabel}
					</span>
					<span className="text-muted-foreground text-caption font-normal">
						{band.monthLabel}
					</span>
				</span>
				<span className="flex min-w-0 items-center gap-2">
					<span className="text-muted-foreground text-footnote min-w-0 flex-1 text-pretty break-words">
						{band.summaryLabel}
					</span>
					<Icon
						name={expanded ? 'chevron-up' : 'chevron-down'}
						size="xs"
						className="text-muted-foreground/70 flex-none"
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
const CAP_LINK = cn(buttonVariants({ variant: 'outline' }), 'rounded-full')
/** The caps' one primary action. */
const CAP_PRIMARY = cn(buttonVariants(), 'rounded-full')

/** The chip palette. See `RowChipTone` for why `warn` covers both band edges. */
const CHIP_TONE: Record<RowChipTone, string> = {
	primary: 'border-primary/40 text-primary',
	warn: 'border-status-under/40 text-status-under',
	bad: 'border-destructive/40 text-destructive',
	muted: 'border-border text-muted-foreground',
}

/**
 * Today's row's tone (ADR 0086, after variant P): a tint of the green, quiet
 * enough that the row reads as *here* rather than as a warning.
 */
const TODAY_TONE = 'bg-primary/6 dark:bg-primary/10'

/**
 * The date gutter every row of a day aligns to (ADR 0065 §7): the weekday over
 * the date. Today's date sits in a ring — the one mark that says "you are
 * here" without colouring the row loud.
 */
function DateGutter({
	day,
	show = true,
}: {
	day: TimelineDay
	show?: boolean
}) {
	if (!show) return <span aria-hidden />
	return (
		<span className="flex flex-col items-center gap-0.5 pt-px text-center">
			<span className="text-overline text-muted-foreground uppercase">
				{day.dayLabel}
			</span>
			<span
				data-gutter-date
				className={cn(
					'text-footnote tabular-nums',
					day.isToday
						? 'ring-primary text-primary rounded-full px-1.5 font-bold ring-[1.5px]'
						: 'text-muted-foreground',
				)}
			>
				{day.dateLabel}
			</span>
		</span>
	)
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
 *
 * Today's day carries {@link TodayRowExtras} under its sessions: the coach's
 * line and the session's action, where the hero used to hold them.
 */
function DayRow({
	day,
	isAnchor,
	today = null,
}: {
	day: TimelineDay
	isAnchor: boolean
	today?: TodayRowExtras | null
}) {
	return (
		<div
			// The landing anchor is today itself — not a zero-height marker: it is
			// the day, so it survives the day being empty.
			{...(isAnchor ? { [TODAY_ATTR]: 'true' } : {})}
			// The row states which day it is. Nothing reads it at runtime; it is how
			// the 390×844 spec proves the grid has no holes in it.
			data-timeline-day={day.key}
			className={cn('border-border/70 border-b', day.isToday && TODAY_TONE)}
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
						// prints it. The column stays reserved for the rest.
						showDate={index === 0}
						cta={today?.cta?.sessionId === session.id ? today.cta : null}
					/>
				))
			)}
			{today?.verdict ? (
				<p
					data-today-verdict
					className="text-footnote text-foreground/80 -mt-1 pr-4 pb-3 pl-[74px] [text-wrap:pretty]"
				>
					{today.verdict}
				</p>
			) : null}
		</div>
	)
}

/**
 * A day with nothing on it — the cell the grid is made of.
 *
 * A **real button**, not a clickable box: ADR 0028's second pillar is the actual
 * 44px control rather than a hit-area painted around something inert, and this
 * is the row the athlete is meant to write into. `min-h-11` because 44px is a
 * **floor**. What makes the column read as a grid is the date gutter every row
 * aligns to, not a uniform height (ADR 0065 §7).
 *
 * It says only what the app knows (ADR 0065 §4). `Rest day` is written where the
 * **Plan Outline** prescribes recovery and nowhere else, so today it is written
 * nowhere. Every other empty day is a blank cell carrying its date and the add
 * affordance — except **today**, which says that it holds nothing, because it
 * is the row the athlete opened the app to read (ADR 0086).
 *
 * Pressing it opens the **draft** in place (#501) — see `day-stamp-cell.tsx`.
 */
function EmptyDay({ day }: { day: TimelineDay }) {
	const stamp = useDayStamp()

	// The tapped cell opens **in place**, as layout rather than as a floating
	// panel: it is the row that grew, and the days below it moved down.
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
			// it is. Sighted readers get that from the gutter beside it.
			aria-label={
				day.restPrescribed
					? DAY_ROW_LABELS.restDayOn(`${day.dayLabel} ${day.dateLabel}`)
					: DAY_ROW_LABELS.addWorkoutOn(`${day.dayLabel} ${day.dateLabel}`)
			}
			className="pressable grid min-h-11 w-full grid-cols-[46px_1fr] items-center gap-3 py-2 pr-4 pl-4 text-left"
		>
			<DateGutter day={day} />
			{day.restPrescribed ? (
				<span className="flex min-w-0 flex-col gap-0.5">
					<span className="text-foreground text-callout">
						{DAY_ROW_LABELS.restDay}
					</span>
					<span className="text-muted-foreground text-footnote">
						{DAY_ROW_LABELS.restDayNote}
					</span>
				</span>
			) : day.isToday ? (
				<span className="flex min-w-0 items-center justify-between gap-2">
					<span className="text-foreground text-callout">
						{DAY_ROW_LABELS.nothingToday}
					</span>
					<span className="text-primary text-footnote flex flex-none items-center gap-1 font-semibold">
						<Icon name="plus" size="xs" />
						{DAY_ROW_LABELS.addWorkout}
					</span>
				</span>
			) : (
				/* No label where the plan has said nothing — just the affordance,
				   quieter than any row that carries content. */
				<span className="text-muted-foreground/70 text-footnote">
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
 */
function DaySession({
	session,
	day,
	showDate,
	cta = null,
}: {
	session: TimelineSession
	day: TimelineDay
	showDate: boolean
	cta?: TodayRowExtras['cta']
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
	return (
		<SessionRow session={session} day={day} showDate={showDate} cta={cta} />
	)
}

function SessionRow({
	session,
	day,
	showDate,
	cta = null,
}: {
	session: TimelineSession
	day: TimelineDay
	showDate: boolean
	/** Today's action (`Se økta`), on the session it opens (ADR 0086). */
	cta?: TodayRowExtras['cta']
}) {
	const missed = session.status === 'missed'
	const done = session.status === 'completed'
	return (
		<div data-session-row={session.id}>
			<div className="flex items-start">
				<Link
					to={session.to}
					prefetch="intent"
					data-status={session.status}
					className="pressable grid min-w-0 flex-1 grid-cols-[46px_1fr] items-start gap-3 py-3 pl-4"
				>
					<DateGutter day={day} show={showDate} />
					<span className="flex min-w-0 flex-col gap-1.5">
						{/* Top-aligned, because the title wraps: the dot and the figure
						    sit on its first line, the way a printed plan reads. */}
						<span className="flex items-start gap-2">
							{/* Named, because the dot is the only thing on the row that says
							    which discipline this was — a colour alone is not a label. A
							    missed session's dot goes quiet: it never happened. */}
							{missed ? (
								<span
									role="img"
									aria-label={DAY_ROW_LABELS.missedMark(
										session.disciplineLabel,
									)}
									title={DAY_ROW_LABELS.missedMark(session.disciplineLabel)}
									className="bg-muted-foreground/60 mt-[7px] size-[6px] flex-none rounded-full"
								/>
							) : (
								<span
									role="img"
									aria-label={session.disciplineLabel}
									className="mt-[7px] flex"
								>
									<DiscDot
										solid
										discipline={session.discipline}
										className="size-[6px] flex-none"
									/>
								</span>
							)}
							{/* The whole title, wrapped, never cut with "…" (#505 story 32). */}
							<span
								data-session-title
								className={cn(
									'text-callout min-w-0 flex-1 font-semibold [text-wrap:pretty] break-words',
									missed
										? 'text-muted-foreground line-through decoration-1'
										: 'text-foreground',
								)}
							>
								{session.title}
							</span>
							{/* Its own volume in its track's unit, right-aligned in tabular
							    figures so a week's column of them reads down (#505 D6). */}
							{session.volumeLabel ? (
								<span
									data-session-volume
									className={cn(
										'text-footnote flex-none pt-px text-right whitespace-nowrap tabular-nums',
										done ? 'text-foreground' : 'text-muted-foreground',
									)}
								>
									{session.volumeLabel}
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
							<span className="text-muted-foreground text-footnote">
								{session.externalLoad}
							</span>
						) : null}
						{/* Lighter than the line above on purpose — see `row-content.ts`. */}
						{session.internalLoad ? (
							<span className="text-foreground/80 text-footnote [text-wrap:pretty]">
								{session.internalLoad}
							</span>
						) : null}
						{/* Done with no numbers: where they will come from (story 82). */}
						{session.doneNote ? (
							<span
								data-done-note
								className="text-muted-foreground text-footnote [text-wrap:pretty]"
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
									<span data-extra-chip className={cn(CHIP, CHIP_TONE.muted)}>
										{session.extraLabel}
									</span>
								) : null}
								{/* Counted in nothing, by the athlete's own choice (story 33). */}
								{session.annet?.inAnnet ? (
									<span data-annet-chip className={cn(CHIP, CHIP_TONE.muted)}>
										{ANNET_ACTION_LABELS.chip}
									</span>
								) : null}
								{session.chips.map((chip) => (
									<span
										key={chip.id}
										className={cn(
											CHIP,
											// A measurement is set in capitals; a stored note is prose
											// somebody wrote, and shouting it back would be rude.
											chip.id === 'replan'
												? null
												: 'font-semibold tracking-[0.06em]',
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
				{/* Whose session this is (#505 story 29, D6): a glyph, with what it
				    means and the way to hand it back behind it — once, not under
				    every row. A sibling of the link, never inside it. The column is
				    reserved on every row so the volumes line up. */}
				{session.ownerLabel && session.ownerNote ? (
					<OwnerGlyph session={session} />
				) : (
					<span aria-hidden className="w-10 flex-none" />
				)}
			</div>
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
			{/* The primary action and _Gjort_ share one line: both are about this
			    session, and a row should not grow a line per offer. */}
			{cta || session.markDone ? (
				<div
					data-session-actions
					className="-mt-1 flex flex-wrap items-center gap-x-4 pr-4 pb-2 pl-[74px]"
				>
					{cta ? (
						<Link
							to={cta.to}
							data-today-cta
							className={cn(
								buttonVariants({ size: 'sm' }),
								'rounded-full px-4',
							)}
						>
							{cta.label}
						</Link>
					) : null}
					{session.markDone ? (
						<MarkDoneAction
							sessionId={session.id}
							label={session.markDone.actionLabel}
							ariaLabel={session.markDone.label}
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

/** A row's small chip: a fact or a verdict, quieter than the title. */
const CHIP = 'text-caption rounded-full border px-2 py-px font-normal'

/**
 * The ownership glyph (#505 story 29, D6): a closed lock on the athlete's own
 * session — the app may not change it without a yes (ADR 0080) — and an open
 * one on the app's. Tapping it says what that means, once, and on the
 * athlete's own session offers _Lås opp_, which hands it back
 * (`releaseSession`). A Popover: anchored to the glyph, origin-aware, and
 * small enough for a phone; the 40px column gives it a 44px target.
 */
function OwnerGlyph({ session }: { session: TimelineSession }) {
	const athlete = session.owner === 'athlete'
	const label = session.ownerLabel ?? ''
	return (
		<Popover>
			<PopoverTrigger
				data-owner-glyph={session.owner}
				aria-label={ownerGlyphName(label, session.title)}
				className={cn(
					'pressable hover:bg-muted aria-expanded:bg-muted relative mt-1.5 mr-2 flex size-8 flex-none items-center justify-center rounded-full after:absolute after:-inset-1.5',
					athlete ? 'text-muted-foreground' : 'text-muted-foreground/70',
				)}
			>
				<Icon name={athlete ? 'lock-closed' : 'lock-open-1'} size="xs" />
			</PopoverTrigger>
			<PopoverContent
				align="end"
				data-owner-popover={session.owner}
				className="w-72 gap-3"
			>
				<PopoverHeader>
					<PopoverTitle className="text-callout font-semibold">
						{`${label[0]?.toUpperCase() ?? ''}${label.slice(1)}`}
					</PopoverTitle>
					<PopoverDescription className="text-footnote">
						{session.ownerNote}
					</PopoverDescription>
				</PopoverHeader>
				{session.release ? (
					<ReleaseAction
						sessionId={session.id}
						title={session.title}
						label={session.release.actionLabel}
						note={session.release.note}
					/>
				) : null}
			</PopoverContent>
		</Popover>
	)
}

/**
 * "Lås opp" (#505 story 55): hand one of the athlete's own planned sessions
 * back to the app, so the Week Replan may adjust it again (`releaseSession`).
 * Behind the ownership glyph, with the one sentence that says what the tap
 * gives away.
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
			className="flex flex-col items-start gap-2"
		>
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			{sent ? (
				<span
					aria-live="polite"
					className="text-muted-foreground text-footnote"
				>
					{RELEASE_ACTION_LABELS.released}
				</span>
			) : (
				<>
					<span id={noteId} className="text-muted-foreground text-footnote">
						{note}
					</span>
					<Button
						type="submit"
						variant="outline"
						size="sm"
						aria-label={RELEASE_ACTION_LABELS.actionFor(title)}
						aria-describedby={noteId}
						className="rounded-full"
					>
						<Icon name="lock-open-1" size="xs" />
						{label}
					</Button>
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
			action={SESSION_ANNET_ACTION}
			className="-mt-2 flex pr-4 pl-[74px]"
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
				className="text-muted-foreground text-caption flex min-h-11 items-center underline decoration-dotted underline-offset-[3px]"
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
		<div className="border-border flex flex-col gap-1 border-b px-4 pt-5 pb-3.5">
			<span className="text-muted-foreground text-footnote font-semibold">
				{CAP_LABELS.readsBackTo(reachesBackToLabel)}
			</span>
			<span className="text-muted-foreground text-caption font-normal">
				{CAP_LABELS.reach(reachWeeks, loggedFromLabel)}
			</span>
		</div>
	)
}

/**
 * The far end. A plan that is sketched past its written weeks says so and
 * offers the next step; a plan written all the way through just points at
 * itself. Either way the athlete is told which of the two they are looking at.
 *
 * An open-ended plan (ADR 0079) is a plan like any other here: it has no race
 * to name, so it says where its last round ends and that the next one is
 * proposed before then — never "there is no season plan".
 */
export function EndCap({ cap }: { cap: TimelineEndCap }) {
	const unwritten = cap.unwrittenWeeks
	// With no active plan there is no season plan to open, and pointing at one
	// would be an empty promise. The honest next step is planning one. Events,
	// the Catalogue and Programs used to be linked from here too, for want of
	// anywhere else; they live in the Sesong and Bibliotek tabs now (ADR 0083).
	const planned = cap.plan !== 'none'
	return (
		<div
			data-end-cap={cap.plan}
			className="border-border flex flex-col gap-2.5 border-t p-4"
		>
			<span className="text-foreground text-callout font-semibold">
				{CAP_LABELS.writtenThrough(cap.writtenThroughLabel)}
			</span>
			<span className="text-muted-foreground text-footnote">
				{cap.plan === 'none'
					? CAP_LABELS.noPlan
					: cap.plan === 'open-ended'
						? CAP_LABELS.openEnded(unwritten, cap.planEndLabel ?? '')
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
					<Link to="/training/plan" className={CAP_PRIMARY}>
						{CAP_LABELS.writeLast(unwritten)}
					</Link>
				) : null}
				{planned ? (
					<Link to="/training/plan" className={CAP_LINK}>
						{CAP_LABELS.seasonPlan}
					</Link>
				) : (
					<Link to="/start" className={CAP_PRIMARY}>
						{CAP_LABELS.planASeason}
					</Link>
				)}
			</div>
		</div>
	)
}
