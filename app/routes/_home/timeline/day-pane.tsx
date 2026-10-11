/**
 * The selected day, beside the list on a large screen (#505 story 60, ADR
 * 0087, Arket variant Q's right column).
 *
 * The list says a day in a line per session; this says it whole, for the day
 * the athlete has picked (today until they pick another): each session's
 * details (`SessionDetail` — the same body the phone's Drawer shows at full),
 * and under them **the composer** for that day (ADR 0088): the same component
 * every "+" opens on a phone, here inline, since the day is already chosen.
 * The week's zones close the pane.
 *
 * From `xl` up it is the third column; from `lg` to `xl` the same detail opens
 * in a Sheet from the right (`DaySheet`), since the list needs the width.
 *
 * It reads only the season the list renders, so a session here and its row
 * cannot disagree. Picking a day never navigates and never scrolls the list.
 */
import { memo, useEffect, useRef, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetTitle,
} from '#app/components/ui/sheet.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	DAY_PANE_LABELS,
	SESSION_COMPOSER_LABELS,
	weekNumberLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { SessionComposer } from './composer.tsx'
import { dayTitle, findDay } from './day-lookup.ts'
import {
	type TimelineDay,
	type TimelineSession,
	type TimelineWeek,
} from './presenter.ts'
import { SessionDetail } from './session-detail.tsx'
import { type TodayRowExtras } from './stream.tsx'

export { dayTitle, findDay }

/** The track's colour, as the session's rule in the list draws it. */
const TRACK_BG: Record<string, string> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}

type DayDetailProps = {
	weeks: readonly TimelineWeek[]
	dayKey: string
	todayKey: string
	/** The first day a write may land on (the loader's window). */
	minWriteKey: string
	/** Today's action, on today's own session (ADR 0086). */
	today: TodayRowExtras | null
	/** The heading's id, so the pane or the sheet is named by it. */
	headingId: string
	/**
	 * Bumps when a "+" asks for the composer on this day: the line takes
	 * focus. Never on a pick in the list — reading a day is not writing one.
	 */
	composeRequest?: number
	/** Leave the composer: the Sheet closes; the pane only starts over. */
	onComposerCancel?: () => void
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
	composeRequest = 0,
	onComposerCancel,
}: DayDetailProps) {
	const found = findDay(weeks, dayKey)
	return found ? (
		<DayBody
			week={found.week}
			day={found.day}
			todayKey={todayKey}
			minWriteKey={minWriteKey}
			today={today}
			headingId={headingId}
			composeRequest={composeRequest}
			onComposerCancel={onComposerCancel}
		/>
	) : null
})

function DayBody({
	week,
	day,
	minWriteKey,
	today,
	headingId,
	composeRequest,
	onComposerCancel,
}: {
	week: TimelineWeek
	day: TimelineDay
	todayKey: string
	minWriteKey: string
	today: TodayRowExtras | null
	headingId: string
	composeRequest: number
	onComposerCancel?: () => void
}) {
	const weekName = weekNumberLabel(isoWeekNumber(week.key))
	const subtitle = [weekName, week.kindLabel].filter(Boolean).join(' · ')
	const [full, setFull] = useState(false)
	// "Avbryt" in the pane starts the composer over; the pane stays.
	const [composerKey, setComposerKey] = useState(0)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const seenRequest = useRef(composeRequest)
	useEffect(() => {
		if (composeRequest === seenRequest.current) return
		seenRequest.current = composeRequest
		inputRef.current?.focus()
	}, [composeRequest])
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
				<section
					aria-labelledby={`${headingId}-compose`}
					data-day-compose
					className="bg-muted/40 ring-foreground/5 flex flex-col gap-3 rounded-3xl p-3.5 ring-1"
				>
					<h3
						id={`${headingId}-compose`}
						className="text-callout text-foreground font-semibold"
					>
						{SESSION_COMPOSER_LABELS.title}
					</h3>
					<SessionComposer
						key={composerKey}
						dayKey={day.key}
						layout="pane"
						full={full}
						onDeeper={() => setFull(true)}
						onCancel={() => {
							setFull(false)
							setComposerKey((k) => k + 1)
							onComposerCancel?.()
						}}
						inputRef={inputRef}
						headingId={`${headingId}-compose`}
					/>
				</section>
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

/** One session on the picked day: its sentence, then its details. */
function SessionCard({
	session,
	cta,
}: {
	session: TimelineSession
	cta: TodayRowExtras['cta']
}) {
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
				<SessionDetail session={session} cta={cta} />
			</div>
		</article>
	)
}

/**
 * The day, in a Sheet from the right — between `lg` and `xl`, where the list
 * keeps the width and the day comes over it when asked for. Base UI's Dialog
 * traps focus, closes on Escape and returns focus to where it was. When a "+"
 * opened it, the composer's line takes focus once the Sheet has arrived,
 * never while it slides.
 */
export function DaySheet({
	open,
	onOpenChange,
	composing = false,
	...detail
}: DayDetailProps & {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Opened by a "+": focus the line once the Sheet has settled. */
	composing?: boolean
}) {
	const [settledRequest, setSettledRequest] = useState(0)
	return (
		<Sheet
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={(isOpen) => {
				if (isOpen && composing) setSettledRequest((n) => n + 1)
			}}
		>
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
				<DayDetail
					{...detail}
					composeRequest={(detail.composeRequest ?? 0) + settledRequest}
					onComposerCancel={() => onOpenChange(false)}
				/>
			</SheetContent>
		</Sheet>
	)
}
