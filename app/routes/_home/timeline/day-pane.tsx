/**
 * The selected day, beside the list on a large screen (#505 story 60, ADR
 * 0087, Arket variant Q's right column).
 *
 * The list says a day in a line per session; this says it whole, for the day
 * the athlete has picked (today until they pick another): each session with
 * what it asks or what was done, its status and whose it is, and its actions —
 * `Se økta` on what is done, `Rediger` on what is planned (the Workout Detail
 * View *is* the editor), today's own action where it is today's session, and
 * _Lås opp_ on the athlete's own planned session. Under them, "Skriv økt her"
 * opens the writing line on that day, and the week's zones close the pane.
 *
 * From `xl` up it is the third column; from `lg` to `xl` the same detail opens
 * in a Sheet from the right (`DaySheet`), since the list needs the width.
 *
 * It reads only the season the list renders, so a session here and its row
 * cannot disagree. Picking a day never navigates and never scrolls the list.
 */
import { memo, useState } from 'react'
import { Link } from 'react-router'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
} from '#app/components/ui/sheet.tsx'
import { isoWeekNumber, weekdayIndex } from '#app/utils/athlete-calendar.ts'
import {
	DAY_PANE_LABELS,
	dayPaneTitle,
	weekNumberLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type TimelineDay,
	type TimelineSession,
	type TimelineWeek,
} from './presenter.ts'
import { ReleaseAction, type TodayRowExtras } from './stream.tsx'
import { WritingPanel } from './writing-line.tsx'

/** The day `key` and the week it sits in, or null where the season has none. */
export function findDay(
	weeks: readonly TimelineWeek[],
	key: string,
): { week: TimelineWeek; day: TimelineDay } | null {
	for (const week of weeks) {
		if (key < week.key) continue
		const day = week.rows.find((row) => row.key === key)
		if (day) return { week, day }
	}
	return null
}

/** `torsdag 17. sep`, from the day's own key. */
export function dayTitle(key: string): string {
	return dayPaneTitle(
		weekdayIndex(key),
		Number(key.slice(8, 10)),
		Number(key.slice(5, 7)) - 1,
	)
}

/** The track's colour, as the session's rule in the list draws it. */
const TRACK_BG: Record<string, string> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}

const STATUS_INK: Record<TimelineSession['status'], string> = {
	planned: 'text-foreground',
	completed: 'text-status-on',
	missed: 'text-status-missed',
}

type DayDetailProps = {
	weeks: readonly TimelineWeek[]
	dayKey: string
	todayKey: string
	/** The first day the writing line may write on (the loader's window). */
	minWriteKey: string
	/** Today's action, on today's own session (ADR 0086). */
	today: TodayRowExtras | null
	/** The heading's id, so the pane or the sheet is named by it. */
	headingId: string
}

/**
 * The day, whole. Memoised on its props: the list's scroll never reaches it,
 * only a new pick or a new season does.
 */
export const DayDetail = memo(function DayDetail({
	weeks,
	dayKey,
	todayKey,
	minWriteKey,
	today,
	headingId,
}: DayDetailProps) {
	const found = findDay(weeks, dayKey)
	// A new day is a new writing line: keyed, so an open one closes on a pick.
	return found ? (
		<DayBody
			key={dayKey}
			week={found.week}
			day={found.day}
			todayKey={todayKey}
			minWriteKey={minWriteKey}
			today={today}
			headingId={headingId}
		/>
	) : null
})

function DayBody({
	week,
	day,
	todayKey,
	minWriteKey,
	today,
	headingId,
}: {
	week: TimelineWeek
	day: TimelineDay
	todayKey: string
	minWriteKey: string
	today: TodayRowExtras | null
	headingId: string
}) {
	const [writing, setWriting] = useState(false)
	const weekName = weekNumberLabel(isoWeekNumber(week.key))
	const subtitle = [weekName, week.kindLabel].filter(Boolean).join(' · ')
	const zones = week.tracks.flatMap((track) => {
		const lines = [
			track.zoneSplit?.done,
			track.zoneSplit?.planned,
			track.zoneSplit ? null : track.zoneLabel,
		].filter((line): line is string => !!line)
		return lines.length > 0
			? [{ id: track.trackId, name: track.name, lines }]
			: []
	})
	return (
		<div data-day-detail={day.key} className="flex flex-col gap-4">
			<header className="flex flex-col gap-0.5 pr-10">
				<h2
					id={headingId}
					className="text-heading text-foreground [overflow-wrap:anywhere]"
				>
					{dayTitle(day.key)}
					{day.isToday ? (
						<>
							{' '}
							<span className="text-primary">{`· ${DAY_PANE_LABELS.today}`}</span>
						</>
					) : null}
				</h2>
				<p className="text-footnote text-muted-foreground">{subtitle}</p>
			</header>

			{day.sessions.length > 0 ? (
				<ul className="flex flex-col gap-2.5">
					{day.sessions.map((session) => (
						<li key={session.id}>
							<SessionCard
								session={session}
								cta={today?.cta?.sessionId === session.id ? today.cta : null}
							/>
						</li>
					))}
				</ul>
			) : (
				<p className="text-footnote text-muted-foreground italic">
					{DAY_PANE_LABELS.free}
				</p>
			)}

			{day.key >= minWriteKey ? (
				writing ? (
					<div className="-mx-1 overflow-hidden rounded-3xl">
						<WritingPanel
							todayKey={todayKey}
							minDayKey={minWriteKey}
							initialDayKey={day.key}
							onClose={() => setWriting(false)}
						/>
					</div>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-day-write
						onClick={() => setWriting(true)}
						className="self-start rounded-full"
					>
						<Icon name="pencil-1" size="xs" />
						{DAY_PANE_LABELS.write}
					</Button>
				)
			) : null}

			<section
				aria-labelledby={`${headingId}-zones`}
				className="flex flex-col gap-1"
			>
				<h3
					id={`${headingId}-zones`}
					className="text-overline text-muted-foreground uppercase"
				>
					{DAY_PANE_LABELS.zones(weekName)}
				</h3>
				{zones.length > 0 ? (
					zones.map((zone) => (
						<p
							key={zone.id}
							data-day-zones={zone.id}
							className="text-footnote text-foreground tabular-nums"
						>
							<span className="font-semibold">{zone.name}</span>
							{zone.lines.map((line) => (
								<span key={line} className="text-muted-foreground">
									{` · ${line}`}
								</span>
							))}
						</p>
					))
				) : (
					<p className="text-footnote text-muted-foreground">
						{DAY_PANE_LABELS.noZones}
					</p>
				)}
			</section>
		</div>
	)
}

/**
 * One session, said whole: its sentence, what the row's glyph keeps behind it
 * (the figures, whose it is and what that means), and its actions.
 */
function SessionCard({
	session,
	cta,
}: {
	session: TimelineSession
	cta: TodayRowExtras['cta']
}) {
	const facts = [
		session.externalLoad,
		session.internalLoad,
		session.doneNote,
		session.extraLabel,
		...session.chips.map((chip) => chip.label),
	].filter((fact): fact is string => !!fact)
	const planned = session.status === 'planned'
	return (
		<article
			data-day-session={session.id}
			aria-label={session.title}
			className="bg-card ring-foreground/8 flex gap-3 rounded-3xl p-3.5 shadow-sm ring-1"
		>
			<span
				aria-hidden
				className={cn(
					'w-[3px] flex-none rounded-full',
					session.status === 'missed'
						? 'bg-muted-foreground/50'
						: (TRACK_BG[session.discipline] ?? 'bg-muted-foreground/60'),
				)}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<h3
					className={cn(
						'text-callout text-foreground font-semibold [overflow-wrap:anywhere]',
						session.status === 'missed' &&
							'text-muted-foreground line-through decoration-1',
					)}
				>
					{session.title}
				</h3>
				<dl className="text-footnote grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
					<dt className="text-muted-foreground">{DAY_PANE_LABELS.track}</dt>
					<dd>{session.disciplineLabel}</dd>
					<dt className="text-muted-foreground">{DAY_PANE_LABELS.status}</dt>
					<dd data-day-session-status className={STATUS_INK[session.status]}>
						{DAY_PANE_LABELS.statusWord[session.status]}
					</dd>
					{session.volumeLabel ? (
						<>
							<dt className="text-muted-foreground">
								{DAY_PANE_LABELS.volume}
							</dt>
							<dd className="tabular-nums">{session.volumeLabel}</dd>
						</>
					) : null}
					{session.ownerLabel ? (
						<>
							<dt className="text-muted-foreground">{DAY_PANE_LABELS.owner}</dt>
							<dd data-day-session-owner={session.owner}>
								<span aria-hidden className="text-muted-foreground mr-1">
									{session.owner === 'athlete' ? '✎' : '◌'}
								</span>
								{session.ownerLabel}
							</dd>
						</>
					) : null}
				</dl>
				{facts.length > 0 ? (
					<ul className="text-footnote text-muted-foreground flex flex-col gap-0.5 tabular-nums">
						{facts.map((fact, index) => (
							<li key={`${index}-${fact}`}>{fact}</li>
						))}
					</ul>
				) : null}
				{session.ownerNote && !session.release ? (
					<p className="text-footnote text-muted-foreground">
						{session.ownerNote}
					</p>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					{cta ? (
						<Link
							to={cta.to}
							data-day-cta
							className={cn(
								buttonVariants({ size: 'sm' }),
								'rounded-full px-4',
							)}
						>
							{cta.label}
						</Link>
					) : null}
					<Link
						to={session.to}
						prefetch="intent"
						data-day-open
						aria-label={
							planned
								? DAY_PANE_LABELS.editFor(session.title)
								: DAY_PANE_LABELS.openFor(session.title)
						}
						className={cn(
							buttonVariants({ variant: 'outline', size: 'sm' }),
							'rounded-full',
						)}
					>
						{planned ? DAY_PANE_LABELS.edit : DAY_PANE_LABELS.open}
					</Link>
				</div>
				{session.release ? (
					<ReleaseAction
						sessionId={session.id}
						title={session.title}
						label={session.release.actionLabel}
						note={session.release.note}
					/>
				) : null}
			</div>
		</article>
	)
}

/**
 * The day, in a Sheet from the right — between `lg` and `xl`, where the list
 * keeps the width and the day comes over it when asked for. Base UI's Dialog
 * traps focus, closes on Escape and returns focus to where it was.
 */
export function DaySheet({
	open,
	onOpenChange,
	...detail
}: DayDetailProps & {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showCloseButton={false}
				data-day-sheet
				className="w-[min(380px,90vw)] gap-0 overflow-y-auto overscroll-contain p-5 sm:max-w-[380px]"
			>
				{/* The Dialog's own name; the day's heading below says it to sight. */}
				<SheetTitle className="sr-only">
					{`${DAY_PANE_LABELS.sheet}: ${dayTitle(detail.dayKey)}`}
				</SheetTitle>
				<SheetClose
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							className="bg-secondary absolute top-4 right-4 rounded-full"
						/>
					}
				>
					<Icon name="cross-1" aria-hidden="true" />
					<span className="sr-only">{DAY_PANE_LABELS.close}</span>
				</SheetClose>
				<DayDetail {...detail} />
			</SheetContent>
		</Sheet>
	)
}
