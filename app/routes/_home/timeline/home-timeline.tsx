/**
 * I dag: the season as one list, opened on today, with nothing in front of it
 * (#505 owner decision 3, Arket variant P, ADR 0086).
 *
 * Three things in one column, top to bottom:
 *
 * - **The top line** — the plan and what it counts toward (`Klassisk 3:1 ·
 *   Halvmaraton om 12 uker`, `Blokk 3 av ∞`, or `Ingen plan` with the way to
 *   Sesong), the Ukeskiftet badge while a proposal waits, "+ Ny", and the
 *   **I dag pill**, quiet while today is on screen and filled with the way back
 *   once it is not.
 * - **The season strip** — every week as a bar, the plan's phases under it,
 *   a frame over the weeks the list is showing (`week-strip.tsx`).
 * - **The list**, which gets every pixel left. Today's row carries what the
 *   hero used to: the session's action and the coach's one line.
 *
 * There is no hero, no collapsing header and nothing folds with the scroll:
 * the top is a fixed ~110px, and the list under it is a plain scroller. The
 * hero's Form and Rekorder panes live on the Meg tab now; its "Uka" pane was
 * already the week header.
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
	RECOMPUTE_NOTICE_LABELS,
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
import { DayStampProvider } from './day-stamp-context.tsx'
import {
	buildTimelineSeason,
	buildTodayRow,
	type TimelineTopLine,
} from './presenter.ts'
import { SeasonPane, useLargeScreen } from './season-pane.tsx'
import { EndCap, StartCap, type TodayRowExtras, WeekBlock } from './stream.tsx'
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

	// The closed weeks the athlete has opened (#505 story 31). Held here rather
	// than in each week, so a strip jump into a folded week can open it on the
	// way — a jump is a request to see the week, not its one-line fold.
	const [openWeeks, setOpenWeeks] = useState<ReadonlySet<string>>(
		() => new Set(),
	)
	const toggleWeek = useCallback((key: string) => {
		setOpenWeeks((value) => {
			const next = new Set(value)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])
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
	// The open set as of the last render, read by the jump rather than depended
	// on: a strip tap must not get a new callback every time a week opens, or
	// every memoised strip bar and table row would re-render with it.
	const openWeeksRef = useRef(openWeeks)
	openWeeksRef.current = openWeeks
	const jumpToWeek = useCallback(
		(key: string) => {
			const week = season.weeks.find((w) => w.key === key)
			if (week?.shape === 'folded' && !openWeeksRef.current.has(key)) {
				// The days open below the week's own top, which is where the jump
				// lands, so nothing above the reader moves for it.
				setOpenWeeks((value) => new Set(value).add(key))
			}
			goToWeek(key)
		},
		[goToWeek, season.weeks],
	)
	const large = useLargeScreen()

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
			className="relative flex h-[calc(100dvh-var(--tab-bar-space))] min-h-0 overflow-hidden"
		>
			{/* The list: one column, the whole width on a phone and a readable
			    column beside the season on a large screen (#505 story 60). */}
			<div
				data-timeline-column
				className="relative flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[480px]"
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
						onToday={scroll.backToToday}
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
					 * phases under it, the frame over the weeks in view.
					 */}
					<WeekStrip
						strip={season.strip}
						activeWeekKey={scroll.activeWeekKey}
						frame={scroll.frame}
						onSelect={jumpToWeek}
					/>
				</header>

				<div
					ref={streamRef}
					id={streamId}
					data-testid="timeline-stream"
					// Named for the markup as well as for the tests: a past band deep
					// in the stream finds the box it scrolls in through this.
					{...{ [STREAM_ATTR]: 'true' }}
					// `overscroll-behavior: contain` so the end of the list never drags
					// the page behind it (mobile baseline, #505 P7). `overflow-anchor:
					// none` because the one compensation this list makes is its own
					// (`ReadingHold`), and the browser's anchoring would make it twice.
					// `scroll-behavior: smooth` is for the reader's own keyboard
					// scrolling only — every write the app makes is a jump.
					className="bg-card relative min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] motion-safe:[scroll-behavior:smooth]"
				>
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
									open={openWeeks.has(week.key)}
									onToggle={toggleWeek}
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

			{large ? (
				<SeasonPane
					weeks={season.weeks}
					leadTrackId={season.leadTrackId}
					frame={scroll.frame}
					onJump={jumpToWeek}
				/>
			) : null}
		</main>
	)
}

/**
 * The top line (variant P): the plan and its goal on the left, then the
 * Ukeskiftet badge while a proposal waits, "+ Ny" (icon only, named `Lag
 * ny`), and the I dag pill — one 44px line, as variant P's. The plan's name
 * gives way first, then the race's name; the countdown and the controls never
 * do.
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
		<div className="flex h-11 items-center gap-2">
			<p
				data-top-line-plan
				className="text-footnote flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap"
			>
				{line.goal || line.planLabel ? (
					<>
						{/* The plan's name gives way first; then the race's name; the
						    countdown never does — it is the part an ellipsis would eat. */}
						{line.planLabel ? (
							// On a phone the goal has the line: the plan's name, squeezed beside
							// the badge, "+ Ny" and the pill, would read `S…`.
							<span className="text-muted-foreground min-w-[3ch] shrink-[4] truncate max-sm:hidden">
								{line.planLabel}
							</span>
						) : null}
						{line.goal ? (
							<span
								data-top-line-goal
								className="text-foreground flex min-w-0 shrink items-baseline gap-1 font-semibold"
							>
								{line.goal.name ? (
									<>
										<span aria-hidden className="flex-none">
											⚑
										</span>
										<span className="min-w-0 truncate">
											{line.goal.name}
										</span>{' '}
									</>
								) : null}
								<span className="flex-none tabular-nums">{line.goal.when}</span>
							</span>
						) : null}
					</>
				) : (
					<>
						<span className="text-muted-foreground">
							{TOP_LINE_LABELS.noPlan}
						</span>
						<Link
							to="/training/plan"
							className="text-primary min-w-0 truncate font-semibold underline-offset-4 hover:underline"
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
					'text-caption relative h-8 flex-none rounded-full border px-3 font-semibold whitespace-nowrap after:absolute after:inset-x-0 after:-inset-y-1.5',
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
