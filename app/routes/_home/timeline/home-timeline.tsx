/**
 * I dag: the season as one list, opened on today, with nothing in front of it
 * (#505 owner decision 3, Arket variant P, ADR 0086).
 *
 * Three things in one column, top to bottom:
 *
 * - **The top bar**, pinned, on the page's own tone with a soft shadow over
 *   the list: one line with the plan and what it counts toward (`Klassisk
 *   3:1 · Halvmaraton om 12 uker`, `Blokk 3 av ∞`, or `Ingen plan` with the
 *   way to Sesong), the Ukeskiftet badge while a proposal waits (`1 forslag`,
 *   a jump to the card — never a row of its own), a compact "+ Ny", and the
 *   **I dag pill**, outlined while today is on screen and filled with the way
 *   back once it is not.
 * - **The season strip** under it — every week as a bar, the plan's phases
 *   under it, a frame over the weeks the list is showing (`week-strip.tsx`).
 * - **The list**, which gets every pixel left, and reads like a calendar:
 *   every week whole, every day a row (`stream.tsx`). Today's row carries what
 *   the hero used to: the session's action and the coach's one line.
 *
 * There is no hero, no collapsing header and nothing folds, with the scroll or
 * otherwise: the top is a fixed ~115px, and the list under it is a plain
 * scroller.
 *
 * **On a large screen** (ADR 0087, Arket variant Q) the frame is three cards:
 * the season — plan card, season table, compact curve (`season-pane.tsx`) —
 * left of the list, and the selected day (`day-pane.tsx`) right of it from
 * `xl`, in a Sheet from `lg` to `xl`. The strip steps aside for the table.
 * A click on a row picks its day without navigating (`use-day-selection.ts`). The hero's Form and Rekorder panes live on the Meg tab now; its
 * "Uka" pane was already the week header.
 *
 * The measuring lives in `use-timeline-scroll.ts` (which never writes under a
 * scrolling reader), the arithmetic in `anchoring.ts`, and what a row is
 * allowed to say in `row-content.ts`. What is left here is composition.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Form, Link } from 'react-router'
import { CreateMenu } from '#app/components/create-menu.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	DAY_PANE_LABELS,
	RECOMPUTE_NOTICE_LABELS,
	SEASON_PANE_LABELS,
	SEASON_STRIP_LABELS,
	TOP_LINE_LABELS,
} from '#app/utils/labels.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { type WeekChangeData } from '#app/utils/load/week-change-card.ts'
import { cn } from '#app/utils/misc.tsx'
import { useNonce } from '#app/utils/nonce-provider.ts'
import { timelineWindow } from '#app/utils/timeline-window.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import {
	buildLoadRecomputeLine,
	type LoadRecomputeLine,
	type LoadRecomputeNotice,
} from '../presenter.ts'
import { type AwayFromToday, landingScript } from './anchoring.ts'
import { DayDetail, DaySheet } from './day-pane.tsx'
import { DayStampProvider } from './day-stamp-context.tsx'
import {
	buildTimelineSeason,
	buildTodayRow,
	type TimelineTopLine,
} from './presenter.ts'
import { SeasonPane, useLargeScreen, useWideScreen } from './season-pane.tsx'
import { EndCap, StartCap, type TodayRowExtras, WeekBlock } from './stream.tsx'
import { useDaySelection } from './use-day-selection.ts'
import {
	AHEAD_SENTINEL_ATTR,
	ReadingHold,
	STREAM_ATTR,
	useTimelineScroll,
} from './use-timeline-scroll.ts'
import {
	useWeekChange,
	WeekChangeBadge,
	WeekChangeCard,
} from './week-change-card.tsx'
import { buildWeekChangeCard } from './week-change.ts'
import { WeekStrip } from './week-strip.tsx'
import { WritingPanel } from './writing-line.tsx'

export type HomeTimelineData = {
	now?: Date | string
	ledger: LedgerSession[]
	current: LoadTriad | null
	tsbTrust: TsbTrust
	activePlan: ActivePlan | null
	sustained: SustainedDeviation | null
	nudge: SessionNudge
	thresholds: DisciplineThresholdMap
	loadRecomputeNotice: LoadRecomputeNotice | null
	/**
	 * The Ukeskiftet card's proposals (#505 stories 42–55): the closed week's,
	 * while one still waits for an answer; null otherwise.
	 */
	weekChange?: WeekChangeData | null
	/**
	 * Whether an import source is connected (#505 story 82): a session done by
	 * hand then says its numbers come from the import.
	 */
	importConnected?: boolean
	/**
	 * The Discipline a tapped empty cell prefills — the athlete's **most-trained**,
	 * read from their own history, or null when there is none to read (ADR 0065
	 * §5). Never a default: the cell asks rather than assigning one.
	 */
	stampDiscipline: Discipline | null
}

/**
 * Every cell in the stream is a write target (ADR 0065 §5), so the whole screen
 * sits inside the Day Stamp's provider — a wrapper rather than a hook in the
 * body below, so that what a row asks ("is this day mine to open?") never has to
 * be threaded through `WeekBlock` and `DayRow` as a prop neither has an opinion
 * about.
 */
export function HomeTimeline({ data }: { data: HomeTimelineData }) {
	return (
		<DayStampProvider
			prefill={data.stampDiscipline}
			thresholds={data.thresholds}
			ledger={data.ledger}
		>
			<TimelineFrame data={data} />
		</DayStampProvider>
	)
}

function TimelineFrame({ data }: { data: HomeTimelineData }) {
	// Destructured up front so the memo dependency lists name the values they
	// actually read.
	const {
		ledger,
		activePlan,
		current,
		tsbTrust,
		sustained,
		nudge,
		thresholds,
		loadRecomputeNotice,
		weekChange = null,
		importConnected = false,
	} = data
	// `now` comes from the loader so SSR and hydration agree on "today", and the
	// Athlete Timezone fixes which calendar day that instant reads as (#172).
	const now = useMemo(
		() => (data.now ? new Date(data.now) : new Date()),
		[data.now],
	)
	const timezone = useAthleteTimezone()

	const season = useMemo(
		() =>
			buildTimelineSeason({
				ledger,
				now,
				timezone,
				activePlan,
				importConnected,
			}),
		[activePlan, importConnected, ledger, now, timezone],
	)
	// What the hero used to say about today, now said in today's row: the
	// session's action — only on today's own session — and the coach's line.
	const today = useMemo<TodayRowExtras>(
		() =>
			buildTodayRow({
				ledger,
				now,
				timezone,
				thresholds,
				current,
				trust: tsbTrust,
				sustained,
				nudge,
			}),
		[current, ledger, nudge, sustained, thresholds, tsbTrust, now, timezone],
	)

	// How much chrome sits above the frame — see the `style` note on `<main>`.
	const frameRef = useRef<HTMLElement>(null)
	const [chrome, setChrome] = useState<number | null>(null)
	useEffect(() => {
		const el = frameRef.current
		if (!el) return
		const measure = () => {
			const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
			setChrome((value) => (value === top ? value : top))
		}
		measure()
		window.addEventListener('resize', measure)
		return () => window.removeEventListener('resize', measure)
	}, [])

	const weekKeys = useMemo(
		() => season.weeks.map((week) => week.key),
		[season.weeks],
	)
	const scroll = useTimelineScroll({
		weekKeys,
		todayIndex: season.todayWeekIndex,
	})

	// Every week before today, always (ADR 0086), and the weeks ahead the
	// reader has come near. Memoised on the bound, because the week blocks are
	// memoised on props that come off this list (#503).
	const to = Math.min(
		season.weeks.length - 1,
		season.todayWeekIndex + scroll.after,
	)
	const visibleWeeks = useMemo(
		() => season.weeks.slice(0, to + 1),
		[season.weeks, to],
	)
	const notice = buildLoadRecomputeLine(loadRecomputeNotice)

	// The creation menu's writing line (#505 story 40): open under the top line
	// until the write lands or the athlete closes it.
	const [writing, setWriting] = useState(false)
	// The first day the line may write on: the loader's own window. It writes
	// any distance ahead (story 40), so there is no last day.
	const writable = useMemo(
		() => timelineWindow({ now, timezone, plan: activePlan }),
		[activePlan, now, timezone],
	)
	const openWriting = useCallback(() => setWriting(true), [])
	const closeWriting = useCallback(() => setWriting(false), [])

	const streamNode = useRef<HTMLDivElement | null>(null)
	const { streamRef: scrollStreamRef, goToWeek, readerKey } = scroll
	const streamRef = useCallback(
		(node: HTMLDivElement | null) => {
			streamNode.current = node
			scrollStreamRef(node)
		},
		[scrollStreamRef],
	)
	const streamOf = useCallback(() => streamNode.current, [])
	// The large screen (ADR 0087): the season pane from `lg`, and the day
	// beside the list from `xl` — in a Sheet between the two. False on the
	// server and on a phone, where none of it mounts.
	const large = useLargeScreen()
	const wide = useWideScreen()
	const dayPaneRef = useRef<HTMLElement>(null)
	const revealDay = useCallback(() => dayPaneRef.current?.focus(), [])
	const days = useDaySelection({
		stream: streamOf,
		todayKey: season.todayKey,
		mode: large ? (wide ? 'pane' : 'sheet') : 'off',
		revision: visibleWeeks,
		onReveal: revealDay,
	})
	const { select: selectDay } = days
	const { backToToday } = scroll
	const toToday = useCallback(() => {
		selectDay(season.todayKey)
		backToToday()
	}, [backToToday, selectDay, season.todayKey])
	const dayHeadingId = useId()

	// The Ukeskiftet card, after this week's days (#505 story 42), and the badge on
	// the top line that leads to it. Built once per change of what it reads, so
	// today's memoised week block keeps its props.
	const { held: weekChangeData, onCard } = useWeekChange(weekChange)
	const weekChangeView = useMemo(
		() =>
			buildWeekChangeCard({
				data: weekChangeData,
				weeks: season.weeks,
				ledger,
				activePlan,
				now,
				timezone,
			}),
		[weekChangeData, season.weeks, ledger, activePlan, now, timezone],
	)
	const weekChangeCard = useMemo(
		() => <WeekChangeCard card={weekChangeView} onCard={onCard} />,
		[weekChangeView, onCard],
	)

	const streamId = useId()
	const nonce = useNonce()

	return (
		<main
			ref={frameRef}
			// The landing script sets this same height before hydration, so the
			// first paint is measured in the box it will keep.
			suppressHydrationWarning
			// The list can only scroll inside a box with a **definite** height, and
			// `app/root.tsx` gives its layout `min-h-screen` — a minimum — so the
			// frame states its own: the viewport, less the chrome above it and the
			// phone's tab bar below it (`--tab-bar-space`, ADR 0083; 0 from `md`
			// up). `100dvh` is the server-rendered answer, right to within the
			// wordmark row; the measured value takes that row out.
			style={
				chrome == null
					? undefined
					: { height: `calc(100dvh - ${chrome}px - var(--tab-bar-space))` }
			}
			//
			// From `lg` up the frame is a grid of cards on the page's tone (ADR
			// 0087, Arket variant Q): the season, the list at a reading width, and
			// from `xl` the selected day. Each card scrolls on its own and keeps
			// its scroll to itself. The cards are drawn by CSS from the first byte,
			// so the list does not move sideways when the panes fill in on the
			// client.
			className={cn(
				'relative flex h-[calc(100dvh-var(--tab-bar-space))] min-h-0 overflow-hidden',
				'lg:grid lg:grid-cols-[300px_minmax(0,760px)] lg:justify-center lg:gap-3 lg:p-3',
				'xl:grid-cols-[300px_minmax(0,760px)_340px] 2xl:grid-cols-[320px_minmax(0,800px)_380px]',
			)}
		>
			{/* The season, left of the list (#505 story 60). Its card is drawn at
			    `lg` whatever runs; its content only once the screen is known to be
			    large, so a phone never renders a table it would hide. */}
			<aside
				data-season-pane-column
				aria-label={SEASON_PANE_LABELS.heading}
				className={cn(LARGE_CARD, 'hidden p-4 lg:flex')}
			>
				{large ? (
					<SeasonPane
						season={season}
						frame={scroll.frame}
						onJump={goToWeek}
						onToday={toToday}
					/>
				) : null}
			</aside>

			{/* The list: one column, the whole width on a phone; a card at a
			    reading width between the season and the day on a large screen. */}
			<div
				data-timeline-column
				className="lg:ring-foreground/5 relative flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-4xl lg:shadow-md lg:ring-1"
			>
				{/* Why a number the athlete had already read moved (ADR 0046 §2). It
				    sits above everything because it is a one-shot explanation, not a
				    panel. */}
				{notice ? <LoadRecomputeNoticeBar line={notice} /> : null}

				<header
					data-testid="timeline-top"
					// Pinned above the list, and set apart from it by tone and a soft
					// shadow rather than a rule (the luma direction, ADR 0085).
					className="bg-background relative z-10 flex flex-none flex-col gap-0.5 px-4 pb-2 shadow-[0_1px_3px_oklch(0_0_0/0.06)]"
				>
					<TopLine
						line={season.topLine}
						weekChangeCount={weekChangeView?.waitingCount ?? 0}
						away={scroll.away}
						onToday={toToday}
						onWrite={openWriting}
					/>
					{writing ? (
						<WritingPanel
							todayKey={season.todayKey}
							minDayKey={writable.firstDayKey}
							onClose={closeWriting}
						/>
					) : null}
					{/*
					 * The season strip (#505 stories 17–18, D5): every week, the
					 * phases under it, the frame over the weeks in view. From `lg`
					 * the season pane's table and curve say the same beside the list
					 * (ADR 0087), so the strip steps aside.
					 */}
					<div className="lg:hidden">
						<WeekStrip
							strip={season.strip}
							activeWeekKey={scroll.activeWeekKey}
							frame={scroll.frame}
							onSelect={goToWeek}
						/>
					</div>
				</header>

				<div
					ref={streamRef}
					id={streamId}
					data-testid="timeline-stream"
					// Named for the markup as well as for the tests: a row deep in the
					// stream finds the box it scrolls in through this.
					{...{ [STREAM_ATTR]: 'true' }}
					// `overscroll-behavior: contain` so the end of the list never drags
					// the page behind it (mobile baseline, #505 P7). The browser's own
					// scroll anchoring is left on: it is what absorbs a week above the
					// reader turning out taller than its `content-visibility` estimate
					// (`ReadingHold` stands in for it where there is none).
					// `scroll-behavior: smooth` is for the reader's own keyboard
					// scrolling only — every write the app makes is a jump.
					//
					// On a large screen a click on a day's row picks it for the day
					// pane (`use-day-selection.ts`), and the picked row carries a
					// green edge — drawn here, so the memoised rows never re-render
					// for a pick.
					className={cn(
						'bg-card relative min-h-0 flex-1 overflow-y-auto overscroll-contain motion-safe:[scroll-behavior:smooth]',
						'lg:[&_[data-day-selected]]:shadow-[inset_3px_0_0_var(--color-primary)] lg:[&_[data-timeline-day]]:cursor-pointer',
					)}
					aria-describedby={large && !wide ? `${streamId}-keys` : undefined}
				>
					{large && !wide ? (
						<p id={`${streamId}-keys`} className="sr-only">
							{DAY_PANE_LABELS.keyHint}
						</p>
					) : null}
					<ReadingHold
						revision={season.weeks}
						stream={streamOf}
						readerKey={readerKey}
					>
						{/* One box for the list's content: what the landing's
						    `ResizeObserver` watches for late layout. */}
						<div data-timeline-content>
							<StartCap
								loggedFromLabel={season.loggedFromLabel}
								reachesBackToLabel={season.reachesBackToLabel}
								reachWeeks={season.reachWeeks}
							/>
							{visibleWeeks.map((week) => (
								<WeekBlock
									key={week.key}
									week={week}
									anchorDayKey={season.todayKey}
									afterDays={week.isNow ? weekChangeCard : null}
									today={week.isNow ? today : null}
								/>
							))}
							{to === season.weeks.length - 1 ? (
								<EndCap cap={season.endCap} />
							) : (
								// In reach, the next weeks ahead mount below — which moves
								// nothing the reader can see.
								<div aria-hidden {...{ [AHEAD_SENTINEL_ATTR]: '' }} />
							)}
						</div>
					</ReadingHold>
				</div>
				{/*
				 * Park the list on today **before the first paint** (ADR 0086, #505
				 * P6): the browser runs this as it parses, right after the list, so
				 * the server-rendered page opens on today instead of on the start
				 * of the season and jumping once the app hydrates. The hook's layout
				 * effect then measures the same position and writes nothing.
				 */}
				<script
					nonce={nonce}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{ __html: landingScript(streamId) }}
				/>
			</div>

			{/* The selected day, right of the list from `xl` (ADR 0087). Focusable
			    so `I` on a row in the list can bring the reader here. */}
			<aside
				ref={dayPaneRef}
				tabIndex={-1}
				data-day-pane
				aria-labelledby={large && wide ? dayHeadingId : undefined}
				aria-label={large && wide ? undefined : DAY_PANE_LABELS.region}
				className={cn(
					LARGE_CARD,
					'focus-visible:outline-ring hidden p-5 focus-visible:outline-2 xl:flex',
				)}
			>
				{large && wide ? (
					<DayDetail
						weeks={season.weeks}
						dayKey={days.selected}
						todayKey={season.todayKey}
						minWriteKey={writable.firstDayKey}
						today={today}
						headingId={dayHeadingId}
					/>
				) : null}
			</aside>
			{large && !wide ? (
				<DaySheet
					open={days.sheetOpen}
					onOpenChange={days.setSheetOpen}
					weeks={season.weeks}
					dayKey={days.selected}
					todayKey={season.todayKey}
					minWriteKey={writable.firstDayKey}
					today={today}
					headingId={dayHeadingId}
				/>
			) : null}
		</main>
	)
}

/**
 * A pane's card on a large screen (ADR 0087): the luma card — rounded, on the
 * card tone, a soft shadow and a hairline ring rather than a border — that
 * scrolls on its own and keeps its overscroll to itself.
 */
const LARGE_CARD =
	'bg-card min-h-0 flex-col overflow-y-auto overscroll-contain rounded-4xl shadow-md ring-1 ring-foreground/5'

/**
 * The top line (variant P): the plan and its goal on the left, then the
 * Ukeskiftet badge while a proposal waits, "+ Ny" (icon only, named `Lag
 * ny`), and the I dag pill — a 44px line, as variant P's. On a phone the
 * plan's name gives way to the goal; the goal itself is **never cut** (#505
 * story 32): a race's name that does not fit beside the controls wraps to a
 * second line inside the same 44px (13/18 type, two lines are 36px), and only
 * a name too long for two lines makes the bar taller. The countdown never
 * breaks inside itself (`om 2 uker` is one unit), and the controls keep their
 * size and stay centred on the line.
 */
function TopLine({
	line,
	weekChangeCount,
	away,
	onToday,
	onWrite,
}: {
	line: TimelineTopLine
	weekChangeCount: number
	away: AwayFromToday
	onToday: () => void
	onWrite: () => void
}) {
	return (
		<div className="flex min-h-11 items-center gap-2 py-1">
			{/* From `lg` up the season pane's plan card already names the plan
			    and its goal (ADR 0087), so the line keeps only its controls,
			    pushed right by a spacer. */}
			<span aria-hidden className="hidden flex-1 lg:block" />
			<p
				data-top-line-plan
				className="text-footnote flex min-w-0 flex-1 items-center gap-1.5 lg:hidden"
			>
				{line.goal || line.planLabel ? (
					<>
						{line.planLabel ? (
							// On a phone the goal has the line: the plan's name, squeezed beside
							// the badge, "+ Ny" and the pill, would read `S…`. From `sm` up it
							// is the one part allowed to give way, as a cut with its whole
							// name in the tooltip — the goal beside it never is.
							<span
								title={line.planLabel}
								className="text-muted-foreground min-w-[3ch] shrink-[4] truncate whitespace-nowrap max-sm:hidden"
							>
								{line.planLabel}
							</span>
						) : null}
						{line.goal ? (
							// Inline text, so the race's name wraps between words like any
							// sentence (and anywhere, for a name with no space to break at),
							// and the countdown wraps only as a whole.
							<span
								data-top-line-goal
								className="text-foreground min-w-0 font-semibold [text-wrap:balance] [overflow-wrap:anywhere]"
							>
								{line.goal.name ? (
									<>
										<span aria-hidden>⚑ </span>
										{line.goal.name}{' '}
									</>
								) : null}
								<span className="whitespace-nowrap tabular-nums">
									{line.goal.when}
								</span>
							</span>
						) : null}
					</>
				) : (
					<>
						<span className="text-muted-foreground flex-none whitespace-nowrap">
							{TOP_LINE_LABELS.noPlan}
						</span>
						{/* Wraps rather than cuts; the line's own 44px is its hit area. */}
						<Link
							to="/training/plan"
							className="text-primary relative min-w-0 font-semibold underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 hover:underline"
						>
							{TOP_LINE_LABELS.noPlanAction}
						</Link>
					</>
				)}
			</p>
			{weekChangeCount > 0 ? <WeekChangeBadge count={weekChangeCount} /> : null}
			<CreateMenu onWrite={onWrite} compact />
			{/*
			 * The "I dag" pill (#505, idea I): always there, quiet while today is
			 * on screen, and filled — with the way back in its arrow — once the
			 * reader has scrolled today away. It changes look rather than coming
			 * and going, and it changes instantly: a look that eases in lags the
			 * scroll it reports (Emil: tens of times a day, no animation).
			 */}
			<button
				type="button"
				data-today-pill
				data-away={away}
				aria-label={
					away < 0
						? SEASON_STRIP_LABELS.todayNameUp
						: away > 0
							? SEASON_STRIP_LABELS.todayNameDown
							: SEASON_STRIP_LABELS.todayName
				}
				onClick={onToday}
				className={cn(
					// Press feedback with no transition: the pill's look changes
					// instantly, so its press does too.
					'text-caption relative h-8 flex-none rounded-full border px-3 font-semibold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5 active:opacity-80',
					away === 0
						? 'border-border text-muted-foreground bg-card'
						: 'bg-primary text-primary-foreground border-primary shadow-sm',
				)}
			>
				{away < 0
					? SEASON_STRIP_LABELS.todayUp
					: away > 0
						? SEASON_STRIP_LABELS.todayDown
						: SEASON_STRIP_LABELS.today}
			</button>
		</div>
	)
}

/**
 * The Load Recompute Notice (ADR 0046 §2) as a one-line bar: what moved, why,
 * and an acknowledgement. It is deliberately not a card — it is above the
 * timeline, not part of it, and it leaves for good once acknowledged.
 */
function LoadRecomputeNoticeBar({ line }: { line: LoadRecomputeLine }) {
	return (
		<section
			data-testid="load-recompute-notice"
			aria-labelledby="load-recompute-kicker"
			className="border-border flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5"
		>
			<h2
				id="load-recompute-kicker"
				className="text-foreground text-overline uppercase"
			>
				{line.kicker}
			</h2>
			<p className="text-foreground text-caption tabular-nums">
				{line.movement}
			</p>
			<p className="text-muted-foreground text-caption w-full font-normal">
				{line.explanation}
			</p>
			<Form method="post">
				{/* The kind travels with the acknowledgement so the action dismisses
				    this explanation only, never one the athlete hasn't seen. */}
				<input type="hidden" name="kind" value={line.kind} />
				<button
					type="submit"
					name="intent"
					value="dismiss-load-recompute-notice"
					className="border-border text-foreground pressable text-caption hover:border-primary rounded-full border px-3 py-1 font-semibold"
				>
					{RECOMPUTE_NOTICE_LABELS.gotIt}
				</button>
			</Form>
		</section>
	)
}
