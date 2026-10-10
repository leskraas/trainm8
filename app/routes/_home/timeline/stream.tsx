/**
 * The stream — the season's vertical axis, and I dag's reading surface. It
 * reads like a calendar (ADR 0086, the owner's decision of 2026-10-10): every
 * week is drawn whole — its header and all seven days — and nothing folds.
 *
 * A week is a header plus its **days** in order, always: an unplanned session
 * that landed in a past week goes in by weekday, never appended, because the
 * athlete reads their week as a week and not as an audit log. The header
 * names the week on one line with its phase's colour on its left edge, draws
 * one line per Training Track (the name in the track's colour, `done / target
 * unit`, a Meter), and closes on one muted sentence. A past week is the same
 * week, muted; a week past the Planning Horizon is the same week with empty
 * days under a target, and the first of them stands under the horizon's
 * divider.
 *
 * A row is a day and a day owns zero or more sessions (ADR 0065 §1), so the date
 * gutter — weekday over date, today's date circled — is stated once per day
 * and a morning run and an evening lift stack under it. A day with nothing on
 * it reads `fri` and is the control that writes one, at the 44px floor, as a
 * real button (ADR 0028 §2, ADR 0065 §7). Rows are separated by hairlines; no
 * row is a card.
 *
 * A session is one line (#505 D6): a thin rule in its track's colour, a small
 * glyph saying whose session it is, the whole session sentence — wrapped,
 * never cut — and its own volume at the right in tabular figures (`6,1 km`),
 * with a dot in the verdict's colour once it is done. The glyph opens a
 * popover with what the row knows and its quieter actions (_Lås opp_, _Tell i
 * Annet_, _Angre kobling_), said once rather than under every row.
 *
 * **Today's row is emphasised** by tone, not by a loud colour: a tint, its
 * date circled, and what the hero used to carry — `Se økta` beside _Gjort_,
 * and the coach's one line under it.
 *
 * Both ends of the season are **stated**. A list that runs out of content and
 * stops is indistinguishable from one that broke, so the first week says how
 * far back this screen reads and the last says how far the plan is written —
 * and offers to write the rest.
 *
 * **Cost.** With every day drawn a season is up to ~900 rows, so each week is
 * `content-visibility: auto` with an intrinsic size estimated from what it
 * holds (`weekHeightEstimate`): the browser skips laying out and painting the
 * weeks off screen, and the estimate keeps the scrollbar honest until it does.
 * Only where the browser also anchors scrolling, so a week that turns out
 * taller than estimated above the reader is absorbed by the browser rather
 * than seen (ADR 0086). `WeekBlock` and `DayRow` are memoised and carry no
 * effects.
 *
 * Motion (ADR 0077 as amended by 0085 and 0086): the press (`pressable`) on
 * every control, the popover's origin-aware entry, and the 200ms reflow when a
 * draft opens. Nothing moves with the scroll.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Fragment, memo, type ReactNode } from 'react'
import { Link, useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Meter, MeterIndicator, MeterTrack } from '#app/components/ui/meter.tsx'
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
	HORIZON_LABELS,
	ownerGlyphName,
	RELEASE_ACTION_LABELS,
	SESSION_DETAIL_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import {
	SESSION_RELEASE_ACTION,
	SessionReleaseSchema,
} from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { SESSION_ANNET_ACTION } from '#app/utils/session-annet-schema.ts'
import { weekHeightEstimate } from './anchoring.ts'
import { StampDraft, StampedSentence } from './day-stamp-cell.tsx'
import { useDayStamp } from './day-stamp-context.tsx'
import { ImportLinkAction, MarkDoneAction } from './import-actions.tsx'
import {
	type PhaseTone,
	type TimelineDay,
	type TimelineEndCap,
	type TimelineSession,
	type TimelineTrackWeek,
	type TimelineWeek,
} from './presenter.ts'
import { type RowChipTone } from './row-content.ts'
import { StrengthLogPanel } from './strength-log-panel.tsx'
import {
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
 * A week and its days — every one of them (ADR 0086).
 *
 * **Memoised, and that is load-bearing at full span** (#503). Every time the
 * reader crosses a week header the active week changes, and a re-render of
 * the frame re-renders every week mounted in it: measured on a 52-week season,
 * one fling cost 1,470 `WeekBlock` renders for a state change no week block
 * reads. Every week before today is mounted from the start, so the memo
 * matters more, not less. A week's props are the week itself (off a memoised
 * season), the anchor day (a string), and on today's week only, today's
 * extras and the Ukeskiftet card (both memoised).
 *
 * The block is `content-visibility: auto` (see the module's note on cost):
 * off screen, the browser keeps only its estimated box.
 */
export const WeekBlock = memo(function WeekBlock({
	week,
	anchorDayKey,
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
	return (
		<section
			{...{ [WEEK_ATTR]: week.key }}
			data-week-shape={week.shape}
			aria-label={`${week.relativeName}, ${week.rangeLabel}`}
			// Off screen, a box of the estimated size and nothing laid out or
			// painted inside it — only where the browser anchors scrolling too,
			// so the estimate being off never moves what the reader sees.
			className="supports-[overflow-anchor:auto]:[content-visibility:auto]"
			style={{
				containIntrinsicSize: `auto ${weekHeightEstimate({
					...week,
					tracks: week.tracks.map((track) => ({
						hasFigures: track.hasFigures,
						noteCount:
							(trackNotes(track).length > 0 ? 1 : 0) +
							(track.zoneSplit?.done ? 1 : 0) +
							(track.zoneSplit?.planned ? 1 : 0),
					})),
				})}px`,
			}}
		>
			{week.opensHorizon ? (
				<HorizonDivider far={week.phaseName == null} />
			) : null}
			<WeekHeader week={week} />
			{/* The line where the plan begins. Above it is history the athlete
			    brought with them, and saying so once — here — is what lets every
			    imported row above stay chip-free. */}
			{week.planStart ? (
				<p className="border-border/70 text-muted-foreground bg-primary/5 text-footnote border-b px-4 py-2.5">
					{DAY_ROW_LABELS.planStart}
				</p>
			) : null}
			{week.rows.map((day) => (
				<DayRow
					key={day.key}
					day={day}
					past={week.shape === 'past'}
					isAnchor={day.key === anchorDayKey}
					today={day.key === anchorDayKey ? today : null}
				/>
			))}
			{afterDays}
		</section>
	)
})

/**
 * The Planning Horizon, drawn once above the first week past it (ADR 0086):
 * `Horisont · herfra bare mål, ingen økter ennå`. From here the weeks are a
 * target and empty days, and the strip draws the same line dashed.
 */
function HorizonDivider({ far }: { far: boolean }) {
	return (
		<div
			data-horizon-divider
			role="separator"
			aria-label={`${HORIZON_LABELS.name}: ${far ? HORIZON_LABELS.far : HORIZON_LABELS.plan}`}
			className="border-foreground/30 bg-background text-muted-foreground text-caption flex min-h-11 items-center gap-1.5 border-t-[1.5px] border-dashed px-4 pt-3 pb-2"
		>
			<span className="text-foreground text-overline uppercase">
				{HORIZON_LABELS.name}
			</span>
			<span aria-hidden>·</span>
			<span className="font-normal">
				{far ? HORIZON_LABELS.far : HORIZON_LABELS.plan}
			</span>
		</div>
	)
}

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
 * The header a week reads under (#505 stories 19, 23), drawn as variant P
 * draws it: one line naming the week — `Denne uka · 5.–11. okt · Spissing ·
 * hard uke` — with the phase's colour on its left edge; one line per Training
 * Track with the track's name in its colour, `done / target unit`, the planned
 * figure where it says something, the `≠` mark and the verdict, beside a
 * Meter (done filled, planned dashed, the target a tick); and the week's one
 * muted sentence (`week.summary`).
 *
 * Only that much is **sticky**: the notes under it — what was not measured,
 * pace, the zone split, Annet — follow in the flow and scroll away, so a
 * header never stands a third of a phone tall over its own rows.
 *
 * It sits on the card the days sit on, marked by its phase's edge and a
 * hairline under it rather than a heavy rule; the top bar above the list is
 * the page's own tone, which is what sets the two apart.
 */
function WeekHeader({ week }: { week: TimelineWeek }) {
	const past = week.shape === 'past'
	return (
		<>
			<div
				{...{ [WEEK_HEADER_ATTR]: '' }}
				className={cn(
					'bg-card sticky top-0 z-2 flex flex-col gap-1 border-l-4 py-2 pr-4 pl-3',
					phaseEdge(week),
				)}
			>
				<WeekTitle week={week} />
				<WeekFigures week={week} part="numbers" />
				{week.summary ? (
					<p
						data-week-summary
						className={cn(
							'text-caption font-normal [text-wrap:pretty] italic',
							past ? 'text-muted-foreground/80' : 'text-muted-foreground',
						)}
					>
						{week.summary}
					</p>
				) : null}
			</div>
			<WeekFigures
				week={week}
				part="notes"
				className={cn('bg-card border-l-4 pr-4 pb-2 pl-3', phaseEdge(week))}
			/>
		</>
	)
}

/**
 * `Denne uka · 5.–11. okt · Oppbygging · hard uke`, on one line where it fits.
 * The week's own name leads in the ink of what it is: this week in the green,
 * a past week muted, history from before the plan quieter still.
 */
function WeekTitle({ week }: { week: TimelineWeek }) {
	return (
		<h2 className="text-footnote text-muted-foreground min-w-0 [text-wrap:pretty]">
			<span
				className={cn(
					'font-semibold',
					week.isNow
						? 'text-primary'
						: week.imported || week.shape === 'past'
							? 'text-foreground/70'
							: 'text-foreground',
				)}
			>
				{week.relativeName}
			</span>
			{' · '}
			<span className="tabular-nums">{week.rangeLabel}</span>
			{week.kindLabel ? (
				<>
					{' · '}
					<span data-week-kind>{week.kindLabel}</span>
				</>
			) : null}
		</h2>
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
				<Fragment key={track.trackId}>
					{part === 'notes' ? null : (
						<TrackMeter track={track} past={week.shape === 'past'} />
					)}
					{part === 'numbers' ? null : <TrackLine track={track} part="notes" />}
				</Fragment>
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
 * A Training Track's colour, by its sport (`track-*`, ADR 0085): for marks —
 * a track's name in a header, a session's rule, a meter's fill — never for a
 * fill under text. Literal classes, for Tailwind.
 */
const TRACK_TEXT: Record<string, string> = {
	run: 'text-track-run',
	bike: 'text-track-bike',
	swim: 'text-track-swim',
	strength: 'text-track-strength',
}
const TRACK_BG: Record<string, string> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}
const TRACK_BORDER: Record<string, string> = {
	run: 'border-track-run',
	bike: 'border-track-bike',
	swim: 'border-track-swim',
	strength: 'border-track-strength',
}

/** The done figure's colour: the verdict's, only once there is one. */
const GRADE_INK: Record<TimelineTrackWeek['grade']['status'], string> = {
	'not-yet': 'text-foreground',
	ungraded: 'text-foreground',
	under: 'text-status-under',
	on: 'text-status-on',
	over: 'text-status-over',
}

/**
 * One track's line in a week header, after variant P: the track's name in its
 * colour, `11,6 / 36 km` (or `mål 52 km` before anything is done), what was
 * planned where it says something, the `≠` mark and the verdict — and beside
 * it a **Meter** (`components/ui/meter.tsx`): done filled in the track's
 * colour, planned as a dashed outline, the target as a tick. A week with a
 * target and nothing planned yet — ahead, or past the horizon — draws the
 * target itself dashed, the way the strip draws an unfilled week.
 *
 * The wave-1 rules hold: a side with sessions but no number says so in the
 * number's place (`2 økter uten km`), never `0`; a target of 0 is no
 * reference, so the line states what was done and never `12 / 0 km`; and the
 * verdict is a word as well as a colour.
 */
function TrackMeter({
	track,
	past,
}: {
	track: TimelineTrackWeek
	past: boolean
}) {
	const { planned, actual } = track
	const target = track.target != null && track.target > 0 ? track.target : null
	const scale = Math.max(target ?? 0, planned ?? 0, actual ?? 0)
	const share = (value: number | null) =>
		value == null || scale <= 0 ? 0 : Math.min(100, (value / scale) * 100)
	const done = track.figures.done ?? track.figureNotes.done
	const plannedText = track.figures.planned ?? track.figureNotes.planned
	// The outline the sessions add up to; where nothing is laid yet, the target.
	const outline =
		planned != null && planned > 0 ? planned : past ? null : target
	const name = `${track.name}: ${[
		track.figures.done != null
			? `${WEEK_FIGURE_LABELS.done} ${track.figures.done}`
			: null,
		target != null
			? `${WEEK_FIGURE_LABELS.target} ${track.figures.target}`
			: null,
		track.figures.planned != null
			? `${WEEK_FIGURE_LABELS.planned} ${track.figures.planned}`
			: null,
	]
		.filter(Boolean)
		.join(', ')} ${track.unit}`
	return (
		<div
			data-week-track={track.trackId}
			className="grid grid-cols-[minmax(0,auto)_minmax(40px,1fr)] items-center gap-x-3"
		>
			<span className="text-caption flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-normal tabular-nums">
				<span
					className={cn(
						'font-semibold break-words',
						TRACK_TEXT[track.discipline] ?? 'text-foreground',
					)}
				>
					{track.name}
				</span>
				{done != null ? (
					<span className="whitespace-nowrap">
						<span
							className={cn(
								'font-semibold',
								track.figures.done != null
									? GRADE_INK[track.grade.status]
									: 'text-muted-foreground',
							)}
						>
							{done}
						</span>
						<span className="text-muted-foreground">
							{target != null ? ` / ${track.figures.target}` : null}{' '}
							{track.figures.done != null ? track.unit : null}
							{target == null && track.figures.done != null
								? ` ${WEEK_FIGURE_LABELS.done}`
								: null}
						</span>
					</span>
				) : target != null ? (
					<span className="whitespace-nowrap">
						<span className="text-muted-foreground">
							{WEEK_FIGURE_LABELS.target}{' '}
						</span>
						<span className="font-semibold">{track.figures.target}</span>{' '}
						<span className="text-muted-foreground">{track.unit}</span>
					</span>
				) : null}
				{plannedText != null ? (
					<span className="text-muted-foreground whitespace-nowrap">
						· {WEEK_FIGURE_LABELS.planned} {plannedText}
					</span>
				) : null}
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
							'font-semibold whitespace-nowrap',
							GRADE_INK[track.grade.status],
						)}
					>
						{track.gradeLabel}
					</span>
				) : null}
			</span>
			<Meter
				value={Math.min(actual ?? 0, scale > 0 ? scale : 1)}
				max={scale > 0 ? scale : 1}
				aria-label={name}
				className="block"
			>
				<MeterTrack className="relative h-2 overflow-visible bg-transparent">
					{outline != null ? (
						<span
							data-meter-planned
							className={cn(
								'absolute inset-y-0 left-0 rounded-full border-[1.5px] border-dashed opacity-80',
								TRACK_BORDER[track.discipline] ?? 'border-muted-foreground',
							)}
							style={{ width: `${share(outline)}%` }}
						/>
					) : (
						<span className="bg-muted absolute inset-0 rounded-full" />
					)}
					<MeterIndicator
						className={cn(
							'relative rounded-full',
							past && 'opacity-80',
							TRACK_BG[track.discipline] ?? 'bg-muted-foreground',
						)}
					/>
					{/* The target: a tick, where the week is asked to reach. */}
					{target != null ? (
						<span
							data-meter-target
							className="bg-foreground absolute -inset-y-[3px] w-0.5 -translate-x-1/2 rounded-full"
							style={{ left: `${share(target)}%` }}
						/>
					) : null}
				</MeterTrack>
			</Meter>
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

/** A quiet outline link, at the caps' own scale. */
const CAP_LINK = cn(buttonVariants({ variant: 'outline' }), 'rounded-full')
/** The caps' one primary action. */
const CAP_PRIMARY = cn(buttonVariants(), 'rounded-full')

/**
 * Today's row's tone (ADR 0086, after variant P): a tint of the green, quiet
 * enough that the row reads as *here* rather than as a warning.
 */
const TODAY_TONE = 'bg-primary/6 dark:bg-primary/10'

/** The hairline between two rows. A rule, never a card per row. */
const ROW_RULE = 'border-border/60 border-b'

/**
 * Every row's grid: the 42px date gutter and the content beside it, so the
 * gutters of a week line up whatever the rows hold (ADR 0065 §7).
 */
const DAY_GRID =
	'grid grid-cols-[42px_minmax(0,1fr)] items-start gap-x-2.5 pl-4'

/**
 * Where a session's sentence starts — the gutter (16 + 42 + 10), the track's
 * rule (3 + 6) and the glyph (20 + 6) — so what hangs under a session (its
 * actions, today's coach line) lines up with its words.
 */
const TITLE_INSET = 'pl-[103px]'

/**
 * The date gutter every row of a day aligns to (ADR 0065 §7): the weekday in
 * small capitals over the date. Today's date is circled — the one mark that
 * says "you are here" without colouring the row loud — and a past day's date
 * is muted, as a calendar greys the days gone by.
 */
function DateGutter({
	day,
	past = false,
	show = true,
	className,
}: {
	day: TimelineDay
	past?: boolean
	show?: boolean
	className?: string
}) {
	if (!show) return <span aria-hidden />
	return (
		<span
			className={cn(
				'flex flex-col items-center gap-0.5 pt-1.5 text-center',
				className,
			)}
		>
			<span className="text-overline text-muted-foreground uppercase">
				{day.dayLabel}
			</span>
			<span
				data-gutter-date
				className={cn(
					'text-callout grid min-w-7 place-items-center rounded-full px-1 tabular-nums',
					day.isToday
						? 'ring-primary text-primary bg-primary/10 h-7 font-bold ring-[1.5px]'
						: past
							? 'text-muted-foreground font-normal'
							: 'text-foreground font-normal',
				)}
			>
				{day.dayOfMonth}
			</span>
		</span>
	)
}

/**
 * One day of the stream: a row, every day (ADR 0086). The date gutter is the
 * day's, stated once, and every session on the day aligns to it — the gutter
 * is the grid's alignment contract, which is what makes a column of
 * ragged-height rows read as a grid (ADR 0065 §7).
 *
 * A day with no sessions is an **empty cell** rather than nothing at all, which
 * is what makes today addressable on a rest day and every date a write target
 * (ADR 0065 §6 lets the past be written into too).
 *
 * Today's day carries the session's action (`Se økta`, {@link
 * TodayRowExtras}) on its session, and the coach's line under it all — the
 * hero's today pane, in one row.
 *
 * Memoised: a day's props are its model, two flags and today's extras, all
 * stable across the scroll-driven renders of the frame.
 */
const DayRow = memo(function DayRow({
	day,
	past,
	isAnchor,
	today = null,
}: {
	day: TimelineDay
	/** In a week before this one: the row is the record, muted. */
	past: boolean
	isAnchor: boolean
	today?: TodayRowExtras | null
}) {
	return (
		<div
			// The landing anchor is today itself — not a zero-height marker: it is
			// the day, so it survives the day being empty.
			{...(isAnchor ? { [TODAY_ATTR]: 'true' } : {})}
			// The row states which day it is: how the 390×844 spec proves the
			// grid has no holes in it.
			data-timeline-day={day.key}
			className={cn(ROW_RULE, day.isToday && TODAY_TONE)}
		>
			{day.sessions.length === 0 ? (
				<EmptyDay day={day} past={past} />
			) : (
				day.sessions.map((session, index) => (
					<DaySession
						key={session.id}
						session={session}
						day={day}
						past={past}
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
					className={cn(
						'text-footnote text-muted-foreground pr-4 pb-2.5 [text-wrap:pretty]',
						TITLE_INSET,
					)}
				>
					{today.verdict}
				</p>
			) : null}
		</div>
	)
})

/**
 * A day with nothing on it — the cell the grid is made of, after variant P:
 * `fri` in quiet italics and a plus at the right edge, the whole row the
 * control.
 *
 * A **real button**, not a clickable box: ADR 0028's second pillar is the actual
 * 44px control rather than a hit-area painted around something inert, and this
 * is the row the athlete is meant to write into. `min-h-11` because 44px is a
 * **floor**.
 *
 * It says only what the app knows (ADR 0065 §4). `Hviledag` is written where
 * the **Plan Outline** prescribes recovery and nowhere else, so today it is
 * written nowhere; `fri` says only that nothing is written in the day.
 * **Today** says it holds nothing in words, because it is the row the athlete
 * opened the app to read. A past day is quieter: its plus is muted, since
 * writing into the past is allowed (ADR 0065 §6) but is not what the row is
 * for.
 *
 * Pressing it opens the **draft** in place (#501) — see `day-stamp-cell.tsx`.
 */
function EmptyDay({ day, past }: { day: TimelineDay; past: boolean }) {
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
			// One of up to hundreds of identical-looking cells, so the name says
			// which day it is. Sighted readers get that from the gutter beside it.
			aria-label={
				day.restPrescribed
					? DAY_ROW_LABELS.restDayOn(`${day.dayLabel} ${day.dateLabel}`)
					: DAY_ROW_LABELS.addWorkoutOn(`${day.dayLabel} ${day.dateLabel}`)
			}
			className={cn(DAY_GRID, 'pressable min-h-11 w-full pr-2 text-left')}
		>
			<DateGutter day={day} past={past} />
			{day.restPrescribed ? (
				<span className="flex min-w-0 flex-col gap-0.5 pt-2">
					<span className="text-foreground text-callout">
						{DAY_ROW_LABELS.restDay}
					</span>
					<span className="text-muted-foreground text-footnote">
						{DAY_ROW_LABELS.restDayNote}
					</span>
				</span>
			) : (
				<span className="flex min-h-11 min-w-0 items-center justify-between gap-2 self-stretch">
					<span
						className={cn(
							'text-footnote',
							day.isToday
								? 'text-foreground'
								: past
									? 'text-muted-foreground/70 italic'
									: 'text-muted-foreground italic',
						)}
					>
						{day.isToday ? DAY_ROW_LABELS.nothingToday : DAY_ROW_LABELS.free}
					</span>
					<span
						aria-hidden
						className={cn(
							'flex size-8 flex-none items-center justify-center',
							past ? 'text-muted-foreground/60' : 'text-primary',
						)}
					>
						<Icon name="plus" size="sm" />
					</span>
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
	past,
	showDate,
	cta = null,
}: {
	session: TimelineSession
	day: TimelineDay
	past: boolean
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
		<SessionRow
			session={session}
			day={day}
			past={past}
			showDate={showDate}
			cta={cta}
		/>
	)
}

/**
 * One session, as variant P draws it: one line under the day's gutter. A thin
 * rule in the track's colour; the glyph saying whose session it is; the whole
 * session sentence, wrapped and never cut (#505 story 32); and at the right
 * its own volume in tabular figures (`6,1 km`), with a dot in the verdict's
 * colour once it is done (#505 D6). A missed session is struck through and
 * says `ikke gjort`.
 *
 * What the row used to spell out on lines of its own — load, the comparison,
 * RPE, the shape bars, the chips — sits behind the glyph, with whose session
 * it is and the row's quieter actions (_Lås opp_, _Tell i Annet_, _Angre
 * kobling_). It also rides on the row's link as text for a screen reader, so
 * nothing the row knows is hidden from anyone; it is only out of the sighted
 * reader's way. What asks for an answer stays on the row: the import's
 * question, _Gjort_, the quick strength log, and on today's row _Se økta_.
 */
function SessionRow({
	session,
	day,
	past,
	showDate,
	cta = null,
}: {
	session: TimelineSession
	day: TimelineDay
	past: boolean
	showDate: boolean
	/** Today's action (`Se økta`), on the session it opens (ADR 0086). */
	cta?: TodayRowExtras['cta']
}) {
	const missed = session.status === 'missed'
	const done = session.status === 'completed'
	const verdict = session.chips.find((chip) => chip.id === 'compliance')
	const facts = [
		session.externalLoad,
		session.internalLoad,
		session.doneNote,
		session.extraLabel,
		session.annet?.inAnnet ? ANNET_ACTION_LABELS.chip : null,
		...session.chips.map((chip) => chip.label),
	].filter((fact): fact is string => !!fact)
	return (
		<div data-session-row={session.id}>
			<div className={cn(DAY_GRID, 'pr-4')}>
				<DateGutter day={day} past={past} show={showDate} />
				<div className="flex min-w-0 items-stretch gap-1.5 py-1.5">
					{/* The track's rule: the one mark naming the discipline, so it
					    carries the name — a colour alone is not a label. */}
					<span
						role="img"
						aria-label={
							missed
								? DAY_ROW_LABELS.missedMark(session.disciplineLabel)
								: session.disciplineLabel
						}
						title={session.disciplineLabel}
						className={cn(
							'my-0.5 w-[3px] flex-none rounded-full',
							missed
								? 'bg-muted-foreground/50'
								: (TRACK_BG[session.discipline] ?? 'bg-muted-foreground/60'),
						)}
					/>
					<SessionGlyph session={session} facts={facts} />
					<Link
						to={session.to}
						prefetch="intent"
						data-status={session.status}
						className="pressable relative flex min-h-8 min-w-0 flex-1 items-start gap-2 py-1 after:absolute after:inset-x-0 after:-inset-y-1.5"
					>
						<span
							data-session-title
							className={cn(
								'text-callout min-w-0 flex-1 font-normal [text-wrap:pretty] [overflow-wrap:anywhere]',
								missed
									? 'text-muted-foreground line-through decoration-1'
									: past
										? 'text-foreground/80'
										: 'text-foreground',
								day.isToday && !missed ? 'font-medium' : null,
							)}
						>
							{session.title}
						</span>{' '}
						<span className="text-footnote flex flex-none items-center gap-1.5 pt-0.5 text-right whitespace-nowrap tabular-nums">
							{missed ? (
								<span className="text-status-missed italic">
									{SESSION_DETAIL_LABELS.missed}
								</span>
							) : session.volumeLabel ? (
								<span
									data-session-volume
									className={done ? 'text-foreground' : 'text-muted-foreground'}
								>
									{session.volumeLabel}
								</span>
							) : null}
							{done ? (
								<span
									data-done-dot
									role="img"
									aria-label={verdict?.label ?? SESSION_DETAIL_LABELS.done}
									className={cn(
										'size-[7px] rounded-full',
										verdict ? VERDICT_DOT[verdict.tone] : 'bg-status-on',
									)}
								/>
							) : null}
						</span>
						{/* What the row knows, for a screen reader: the glyph shows it to
						    everyone else. */}
						{facts.length > 0 ? (
							<span className="sr-only">
								{facts.map((fact, index) => (
									<Fragment key={`${index}-${fact}`}>
										{' · '}
										<span>{fact}</span>
									</Fragment>
								))}
							</span>
						) : null}
					</Link>
				</div>
			</div>
			{session.importLink?.kind === 'ask' ? (
				<ImportLinkAction link={session.importLink} />
			) : null}
			{/* The primary action and _Gjort_ share one line: both are about this
			    session, and a row should not grow a line per offer. */}
			{cta || session.markDone ? (
				<div
					data-session-actions
					className={cn(
						'flex flex-wrap items-center gap-x-4 pr-4 pb-2',
						TITLE_INSET,
					)}
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

/** The done dot's colour, off the comparison's tone. */
const VERDICT_DOT: Record<RowChipTone, string> = {
	primary: 'bg-status-on',
	warn: 'bg-status-under',
	bad: 'bg-status-missed',
	muted: 'bg-muted-foreground',
}

/**
 * The row's glyph (#505 story 29, D6), at the left of the sentence as in
 * variant P: ✎ for a session the athlete wrote or changed — the app does not
 * change it without a yes (ADR 0080) — and ◌ for the plan's own. Tapping it
 * opens the row's details once, in a popover anchored to it: whose session it
 * is and what that means, what the row knows (load, the comparison, the
 * shape), and the quieter actions — _Lås opp_ on the athlete's planned
 * session, _Tell i Annet_, _Angre kobling_. A sibling of the row's link,
 * never inside it.
 */
function SessionGlyph({
	session,
	facts,
}: {
	session: TimelineSession
	facts: string[]
}) {
	const athlete = session.owner === 'athlete'
	const owner = session.ownerLabel
	return (
		<Popover>
			<PopoverTrigger
				data-owner-glyph={session.owner}
				aria-label={
					owner
						? ownerGlyphName(owner, session.title)
						: SESSION_DETAIL_LABELS.name(session.title)
				}
				// 20px wide on screen, 44px under a thumb (the `after:` hit area),
				// and above the row's link where the two meet.
				className="pressable text-muted-foreground hover:bg-muted aria-expanded:bg-muted relative z-1 flex h-7 w-5 flex-none items-center justify-center rounded-full after:absolute after:-inset-x-3 after:-inset-y-2"
			>
				{athlete ? (
					<Icon name="pencil-1" size="xs" />
				) : (
					<span
						aria-hidden
						className="border-muted-foreground/70 size-2.5 rounded-full border-[1.5px] border-dashed"
					/>
				)}
			</PopoverTrigger>
			<PopoverContent
				align="start"
				data-owner-popover={session.owner}
				className="w-72 gap-3"
			>
				<PopoverHeader>
					<PopoverTitle className="text-callout font-semibold">
						{session.title}
					</PopoverTitle>
					{owner && session.ownerNote ? (
						<PopoverDescription className="text-footnote">
							<span className="text-foreground font-semibold">
								{`${owner[0]?.toUpperCase() ?? ''}${owner.slice(1)}`}
							</span>
							{' · '}
							{session.ownerNote}
						</PopoverDescription>
					) : null}
				</PopoverHeader>
				{session.bars.length > 0 ? (
					<span className="block w-[120px]">
						<ProfileBars
							bars={session.bars}
							groups={session.groups}
							scale="row"
						/>
					</span>
				) : null}
				{facts.length > 0 ? (
					<ul className="text-footnote text-muted-foreground flex flex-col gap-0.5">
						{facts.map((fact, index) => (
							<li key={`${index}-${fact}`}>{fact}</li>
						))}
					</ul>
				) : null}
				{session.release ? (
					<ReleaseAction
						sessionId={session.id}
						title={session.title}
						label={session.release.actionLabel}
						note={session.release.note}
					/>
				) : null}
				{session.annet ? (
					<AnnetAction
						sessionId={session.id}
						inAnnet={session.annet.inAnnet}
						label={session.annet.actionLabel}
					/>
				) : null}
				{session.importLink && session.importLink.kind !== 'ask' ? (
					<ImportLinkAction link={session.importLink} inline />
				) : null}
				<Link
					to={session.to}
					className={cn(
						buttonVariants({ variant: 'outline', size: 'sm' }),
						'self-start rounded-full',
					)}
				>
					{SESSION_DETAIL_LABELS.open}
				</Link>
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
 * Count the session in Annet, or put it back in its track (#505 story 33) —
 * behind the row's glyph, with the row's other quiet actions (ADR 0086), never
 * inside the row's link: a control inside a link is two targets under one
 * thumb.
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
		<fetcher.Form method="post" action={SESSION_ANNET_ACTION} className="flex">
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
