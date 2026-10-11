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
 * with a dot in the verdict's colour once it is done. The row and its glyph
 * open the session's details in the composer's container — the Drawer at
 * full on a phone, the day pane on a large screen (ADR 0088) — with what the
 * row knows and its quieter actions (_Lås opp_, _Tell i Annet_, _Angre
 * kobling_), said once rather than under every row.
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
 * Motion (ADR 0077 as amended by 0085, 0086 and 0088): the press
 * (`pressable`) on every control, the week details' origin-aware popover, and
 * a written session's landing — the row rises 4px into place and fades in
 * (200ms ease-out, `@starting-style`; reduced motion keeps the fade). Nothing
 * moves with the scroll.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Fragment, memo, type ReactNode, useEffect, useRef } from 'react'
import { Link, useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Meter, MeterIndicator, MeterTrack } from '#app/components/ui/meter.tsx'
import {
	Popover,
	PopoverContent,
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
	SESSION_COMPOSER_LABELS,
	SESSION_DETAIL_LABELS,
	sessionCountLabel,
	WEEK_DETAIL_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import {
	SESSION_RELEASE_ACTION,
	SessionReleaseSchema,
} from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { weekHeightEstimate } from './anchoring.ts'
import { useComposer, useComposerLanding } from './composer-context.tsx'
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
						// One quiet line at most per track (`trackEssentials`); the
						// rest is behind the summary's disclosure.
						noteCount: trackEssentials(track).length > 0 ? 1 : 0,
					})),
					rows: week.rows.map((day) => ({
						sessions: day.sessions,
						addAnother: offersAnother(day, anchorDayKey),
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
					addAnother={offersAnother(day, anchorDayKey)}
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
 * draws it — three lines and a tail: one line naming the week — `Denne uka ·
 * 5.–11. okt · Spissing · hard uke` — with the phase's colour on its left
 * edge; one line per Training Track with the track's name, `done / target
 * unit`, the planned figure where it says something, the `≠` mark and the
 * verdict, beside a Meter (done filled, planned dashed, the target a tick); and the week's one
 * muted sentence (`week.summary`).
 *
 * Only that much is **sticky**. Under it, in the flow, at most **one quiet
 * line per track**, and only for what keeps the numbers above it honest: the
 * sessions with no number beside a sum (`gjort +1 uten km`, its side named,
 * story 34) and a strength week logged only part-way. Everything else the
 * wave-1 notes said — why a track is not graded, pace, the easy share, the
 * zone split and that a planned split is an intention, Annet — sits behind the
 * summary line (`WeekDetails`): one tap opens it in a popover, and a screen
 * reader reads it in place. A header no longer stands a third of a phone tall
 * over its own rows.
 *
 * It sits on the card the days sit on, marked by its phase's edge and a
 * hairline under it rather than a heavy rule; the top bar above the list is
 * the page's own tone, which is what sets the two apart.
 */
function WeekHeader({ week }: { week: TimelineWeek }) {
	const past = week.shape === 'past'
	const tracks = week.tracks.filter((track) => track.hasFigures)
	const details = weekDetails(week)
	const essentials = tracks
		.map((track) => ({ track, notes: trackEssentials(track) }))
		.filter(({ notes }) => notes.length > 0)
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
				{week.tracks.length === 0 ? (
					<span className="text-muted-foreground text-caption font-normal">
						{week.loadLine}
					</span>
				) : null}
				{tracks.map((track) => (
					<TrackMeter key={track.trackId} track={track} past={past} />
				))}
				{week.summary || details.length > 0 ? (
					<WeekDetails week={week} details={details} />
				) : null}
			</div>
			{essentials.length > 0 ? (
				<div
					data-week-notes
					className={cn(
						'bg-card flex flex-col gap-0.5 border-l-4 pr-4 pb-2 pl-3',
						phaseEdge(week),
					)}
				>
					{essentials.map(({ track, notes }) => (
						<span
							key={track.trackId}
							data-week-track-notes={track.trackId}
							className={NOTE}
						>
							{`${track.name} · ${notes.join(' · ')}`}
						</span>
					))}
				</div>
			) : null}
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

/** One group of a week's details: a track (or Annet) and what it says. */
type WeekDetailGroup = { key: string; name: string; facts: string[] }

/**
 * What a track's line keeps in view under the header: the sessions with no
 * number beside a sum, with their side named (story 34), and a strength week
 * logged only part-way. The figures above would read wrong without them.
 */
function trackEssentials(track: TimelineTrackWeek): string[] {
	return [
		track.actualUnmeasuredLabel,
		track.plannedUnmeasuredLabel,
		track.partialLabel,
	].filter((part): part is string => !!part)
}

/**
 * The week's details, for the disclosure: per track, why it is not graded,
 * its pace, its easy share or zone split (the planned side always beside
 * `hensikt, ikke en måling`), then Annet. Nothing here changes a number in
 * the header; it qualifies one.
 */
function weekDetails(week: TimelineWeek): WeekDetailGroup[] {
	const groups: WeekDetailGroup[] = week.tracks
		.filter((track) => track.hasFigures)
		.map((track) => ({
			key: track.trackId,
			name: track.name,
			facts: [
				track.gradeNote,
				track.paceLabel,
				track.zoneLabel
					? track.zoneIntentNote
						? `${track.zoneLabel} (${track.zoneIntentNote})`
						: track.zoneLabel
					: null,
				track.zoneSplit?.done ?? null,
				track.zoneSplit?.planned
					? [track.zoneSplit.planned, track.zoneIntentNote]
							.filter(Boolean)
							.join(' · ')
					: null,
			].filter((fact): fact is string => !!fact),
		}))
		.filter((group) => group.facts.length > 0)
	if (week.otherTrack) {
		groups.push({
			key: 'annet',
			name: week.otherTrack.label,
			facts: [
				`${sessionCountLabel(week.otherTrack.sessions)} · ${week.otherTrack.note}`,
			],
		})
	}
	return groups
}

/**
 * The week's summary line, and — where the week has details to give — the
 * disclosure behind it (#505 polish): the line is the trigger, with a small
 * info mark, and the details open in a popover anchored to it. The same
 * details ride along as screen-reader text right after it, so nothing the
 * notes used to say is hidden from anyone; it is only out of the sighted
 * reader's way until asked for.
 *
 * The trigger is the whole width of the header and reaches up over the track
 * lines (which hold nothing to press) to make a 44px target without making
 * the sticky header any taller.
 */
function WeekDetails({
	week,
	details,
}: {
	week: TimelineWeek
	details: WeekDetailGroup[]
}) {
	const summaryClass =
		'text-caption text-muted-foreground font-normal [text-wrap:pretty] italic'
	if (details.length === 0) {
		return (
			<p data-week-summary className={summaryClass}>
				{week.summary}
			</p>
		)
	}
	return (
		<>
			<Popover>
				<PopoverTrigger
					data-week-details-trigger
					className="pressable hover:text-foreground aria-expanded:text-foreground text-muted-foreground relative -mt-1 -mb-2 flex w-full items-start gap-1.5 pt-1 pb-2 text-left after:absolute after:inset-x-0 after:-top-4 after:bottom-0"
				>
					<span data-week-summary className={cn(summaryClass, 'min-w-0')}>
						{week.summary ?? WEEK_DETAIL_LABELS.trigger}
					</span>
					<Icon
						name="info-circle"
						size="xs"
						aria-hidden
						className="mt-0.5 flex-none"
					/>
					<span className="sr-only">{` · ${WEEK_DETAIL_LABELS.more}`}</span>
				</PopoverTrigger>
				<PopoverContent
					align="start"
					data-week-details-popover={week.key}
					className="w-72 gap-3"
				>
					<PopoverHeader>
						<PopoverTitle className="text-callout font-semibold tabular-nums">
							{WEEK_DETAIL_LABELS.title(week.relativeName, week.rangeLabel)}
						</PopoverTitle>
					</PopoverHeader>
					<WeekDetailList details={details} />
				</PopoverContent>
			</Popover>
			<div className="sr-only" data-week-details-text>
				<WeekDetailList details={details} />
			</div>
		</>
	)
}

function WeekDetailList({ details }: { details: WeekDetailGroup[] }) {
	return (
		<dl className="text-footnote flex flex-col gap-2 tabular-nums">
			{details.map((group) => (
				<div key={group.key} className="flex flex-col gap-0.5">
					<dt className="text-foreground font-semibold">{group.name}</dt>
					{group.facts.map((fact, index) => (
						<dd key={`${index}-${fact}`} className="text-muted-foreground">
							{fact}
						</dd>
					))}
				</div>
			))}
		</dl>
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
 * a session's rule, a meter's fill and outline — never for text (at caption
 * size most hues are under 4.5:1 on a light card) and never for a fill under
 * text. Text that names a track takes {@link TRACK_INK}. Literal classes, for
 * Tailwind.
 */
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
/** A track's name in its own colour: the `-ink` step of the hue, ≥ 5:1 on the
 * card and the page in both themes (#505 round 2). */
const TRACK_INK: Record<string, string> = {
	run: 'text-track-run-ink',
	bike: 'text-track-bike-ink',
	swim: 'text-track-swim-ink',
	strength: 'text-track-strength-ink',
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
 * One track's line in a week header, after variant P: the track's name,
 * `11,6 / 36 km` (or `mål 52 km` before anything is done), what was
 * planned where it says something, a strength week's sessions (`0 av 2
 * økter`), the `≠` mark and the verdict — and beside it a **Meter** (`components/ui/meter.tsx`): done
 * filled in the track's colour, planned as a dashed outline, the target as a
 * tick. A week with a
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
			className="grid grid-cols-[minmax(0,auto)_minmax(72px,1fr)] items-center gap-x-3"
		>
			<span className="text-caption flex min-w-0 flex-wrap items-baseline gap-x-1.5 font-normal tabular-nums">
				{/* The name in its track's ink — the hue's text step, AA at
				    caption size — while the Meter beside it keeps the mark hue. */}
				<span
					className={cn(
						'font-semibold break-words',
						TRACK_INK[track.discipline] ?? 'text-foreground',
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
				{track.sessionsLabel ? (
					<span className="text-muted-foreground whitespace-nowrap">
						· {track.sessionsLabel}
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
 * (ADR 0065 §6 lets the past be written into too). A day with sessions, from
 * today on, ends in **legg til en til** — one more on the same day, through
 * the same composer (ADR 0088).
 *
 * Today's day carries the session's action (`Se økta`, {@link
 * TodayRowExtras}) on its session, and the coach's line under it all — the
 * hero's today pane, in one row.
 *
 * Memoised: a day's props are its model, three flags and today's extras, all
 * stable across the scroll-driven renders of the frame.
 */
const DayRow = memo(function DayRow({
	day,
	past,
	isAnchor,
	addAnother,
	today = null,
}: {
	day: TimelineDay
	/** In a week before this one: the row is the record, muted. */
	past: boolean
	isAnchor: boolean
	/** Whether the day ends in "legg til en til" ({@link offersAnother}). */
	addAnother: boolean
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
					<SessionRow
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
			{addAnother ? <AddAnother day={day} /> : null}
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
 * Whether a day ends in "legg til en til": a day with sessions, from today
 * on. A day gone by is written into through its empty cell or _Ny økt_; a
 * line under every past day would make the calendar a form.
 */
function offersAnother(day: TimelineDay, todayKey: string): boolean {
	return day.sessions.length > 0 && day.key >= todayKey
}

/**
 * One more session on a day that has one (#505 audit §7, ADR 0088): a quiet
 * line under the day's sessions that opens the same composer on the same
 * day. A real button with a 44px hit area on a 32px line, so a day with
 * sessions costs the calendar as little height as it can.
 */
function AddAnother({ day }: { day: TimelineDay }) {
	const composer = useComposer()
	return (
		<button
			type="button"
			data-timeline-add-another={day.key}
			onClick={() => composer.openComposer(day.key)}
			aria-label={SESSION_COMPOSER_LABELS.addAnotherOn(
				`${day.dayLabel} ${day.dateLabel}`,
			)}
			className={cn(
				'pressable text-footnote text-muted-foreground relative -mt-1 flex h-8 w-full items-center justify-between gap-2 pr-2 pb-1 text-left italic after:absolute after:inset-x-0 after:-inset-y-1.5',
				TITLE_INSET,
			)}
		>
			{SESSION_COMPOSER_LABELS.addAnother}
			<span
				aria-hidden
				className="text-primary flex size-8 flex-none items-center justify-center not-italic"
			>
				<Icon name="plus" size="sm" />
			</span>
		</button>
	)
}

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
 * Pressing it opens the **composer** on the day (ADR 0088): the Drawer on a
 * phone, the day's own pane or Sheet on a large screen. Nothing opens in the
 * row itself any more, so a large screen never shows two composers for one
 * day.
 */
function EmptyDay({ day, past }: { day: TimelineDay; past: boolean }) {
	const composer = useComposer()
	return (
		<button
			type="button"
			data-timeline-empty={day.key}
			onClick={() => composer.openComposer(day.key)}
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
								: // Past or not, the muted ink: a step lighter than it fell
									// under 4.5:1. The past reads quieter by its muted date.
									'text-muted-foreground italic',
						)}
					>
						{day.isToday ? DAY_ROW_LABELS.nothingToday : DAY_ROW_LABELS.free}
					</span>
					<span
						aria-hidden
						className={cn(
							'flex size-8 flex-none items-center justify-center',
							past ? 'text-muted-foreground' : 'text-primary',
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
 * One session, as variant P draws it: one line under the day's gutter. A thin
 * rule in the track's colour; the glyph saying whose session it is; the whole
 * session sentence, wrapped and never cut (#505 story 32); and at the right
 * its own volume in tabular figures (`6,1 km`), with a dot in the verdict's
 * colour once it is done. A missed session is struck through and says
 * `ikke gjort`.
 *
 * What the row used to spell out on lines of its own — load, the comparison,
 * RPE, the shape bars, the chips — is in the session's **details**, which the
 * row and its glyph open in the composer's container (ADR 0088): on a phone
 * the same Drawer, at full. The row's link keeps its address, so a new tab or
 * a large screen still reaches the Workout Detail View. What the row knows
 * also rides on the link as text for a screen reader. What asks for an
 * answer stays on the row: the import's question, _Gjort_, the quick
 * strength log, and on today's row _Se økta_.
 *
 * **The landing** (ADR 0088): the session the composer just wrote rises 4px
 * into place and fades in, is tinted, scrolled into view if it is near, and
 * carries its own _Angre_ for as long as the toast that announced it.
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
	const composer = useComposer()
	const { landedSessionId, undoingSessionId } = useComposerLanding()
	const landed = landedSessionId === session.id
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		// Optional-called: jsdom has no scroller.
		if (landed) ref.current?.scrollIntoView?.({ block: 'nearest' })
	}, [landed])
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
	const openDetail = () => composer.openDetail(session.id, day.key)
	return (
		<div
			ref={ref}
			data-session-row={session.id}
			data-landed={landed ? '' : undefined}
			className={cn(
				// The landing: rises 4px and fades in as it mounts (`@starting-style`,
				// 200ms ease-out); reduced motion keeps the fade. The tint leaves on
				// the colour curve when the toast does.
				'duration-collapse ease-out [transition-property:opacity,translate,background-color]',
				'starting:opacity-0 starting:translate-y-1 motion-reduce:starting:translate-y-0',
				landed && 'bg-primary/6',
			)}
		>
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
					<SessionGlyph session={session} onOpen={openDetail} />
					<Link
						to={session.to}
						prefetch="intent"
						data-status={session.status}
						onClick={(event) => {
							// On a phone the details open in the same Drawer as the
							// composer, at full; a modified click still opens the page.
							if (composer.container !== 'drawer') return
							if (event.metaKey || event.ctrlKey || event.shiftKey) return
							event.preventDefault()
							openDetail()
						}}
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
						{/* What the row knows, for a screen reader: the details show it
						    to everyone else. */}
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
			{/* The primary action, _Gjort_ and a landing's _Angre_ share one line:
			    all are about this session, and a row should not grow a line per
			    offer. */}
			{cta || session.markDone || landed ? (
				<div
					data-session-actions
					className={cn(
						'flex flex-wrap items-center gap-x-4 pr-4 pb-2',
						TITLE_INSET,
					)}
				>
					{landed ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							data-landed-undo={session.id}
							disabled={undoingSessionId === session.id}
							aria-label={SESSION_COMPOSER_LABELS.undoFor(session.title)}
							onClick={() => composer.undo(session.id)}
							className="rounded-full"
						>
							{undoingSessionId === session.id
								? SESSION_COMPOSER_LABELS.undoing
								: SESSION_COMPOSER_LABELS.undo}
						</Button>
					) : null}
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
 * opens the session's details in the composer's container (ADR 0088): the
 * Drawer at full on a phone, the day pane or its Sheet on a large screen —
 * the popover it used to open would have been a second place for the same
 * details. A sibling of the row's link, never inside it.
 */
function SessionGlyph({
	session,
	onOpen,
}: {
	session: TimelineSession
	onOpen: () => void
}) {
	const athlete = session.owner === 'athlete'
	const owner = session.ownerLabel
	return (
		<button
			type="button"
			data-owner-glyph={session.owner}
			onClick={onOpen}
			aria-label={
				owner
					? ownerGlyphName(owner, session.title)
					: SESSION_DETAIL_LABELS.name(session.title)
			}
			// 20px wide on screen, 44px under a thumb (the `after:` hit area),
			// and above the row's link where the two meet.
			className="pressable text-muted-foreground hover:bg-muted relative z-1 flex h-7 w-5 flex-none items-center justify-center rounded-full after:absolute after:-inset-x-3 after:-inset-y-2"
		>
			{athlete ? (
				<Icon name="pencil-1" size="xs" />
			) : (
				<span
					aria-hidden
					className="border-muted-foreground size-2.5 rounded-full border-[1.5px] border-dashed"
				/>
			)}
		</button>
	)
}
/**
 * "Lås opp" (#505 story 55): hand one of the athlete's own planned sessions
 * back to the app, so the Week Replan may adjust it again (`releaseSession`).
 * In the session's details (ADR 0088), with the one sentence that says what
 * the tap gives away.
 *
 * Once it has taken, home revalidates and the row's lock opens — the mark is
 * the confirmation. While the post is in flight the action already says so.
 * The large screen's day pane offers it too (ADR 0087).
 */
export function ReleaseAction({
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
