/**
 * The home screen: one bi-directional timeline anchored on today.
 *
 * It opens on today's session, scrolls back through everything that has been
 * done — including the weeks imported from before the plan existed — and forward
 * through everything that is written. Above it sits a week strip for crossing
 * the season at speed. Today is not a separate surface here; it is the row the
 * athlete happens to be parked on.
 *
 * Three children, in one column: the header block (which holds the hero and the
 * strip), the stream, and the back-to-today pill floating over both. The header
 * collapses as the athlete moves away from today in **either** direction, so the
 * stream gets the whole screen the moment it is being read rather than looked at.
 *
 * The screen carries **two horizontal axes** and they are different instruments
 * (ADR 0065 §8): the hero pages sideways through facets of today and moves
 * nothing else, while the strip scrolls continuously and takes the stream with
 * it. The hero never moves in time; the strip and the stream always do.
 *
 * The measuring lives in `use-timeline-scroll.ts`, the arithmetic in
 * `anchoring.ts`, the hero's gesture in `hero-pager.ts`, and what a row is
 * allowed to say in `row-content.ts`. What is left here is markup and
 * composition.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Form, Link } from 'react-router'
import { CreateMenu } from '#app/components/create-menu.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { RECOMPUTE_NOTICE_LABELS } from '#app/utils/labels.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { type WeekChangeData } from '#app/utils/load/week-change-card.ts'
import { cn } from '#app/utils/misc.tsx'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import { type StrengthSummaryCount } from '#app/utils/strength-log.ts'
import {
	type ActivePlan,
	type LedgerSession,
	type WeekReplanSummary,
} from '#app/utils/training.server.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import {
	buildLoadRecomputeLine,
	type LoadRecomputeLine,
	type LoadRecomputeNotice,
} from '../presenter.ts'
import { DayStampProvider } from './day-stamp-context.tsx'
import { buildHeroPanes } from './hero-panes.ts'
import { HeroPager } from './hero.tsx'
import { buildTimelineHero, buildTimelineSeason } from './presenter.ts'
import { SeasonPane, useLargeScreen } from './season-pane.tsx'
import { EndCap, StartCap, WeekBlock } from './stream.tsx'
import {
	HELD_ATTR,
	STREAM_ATTR,
	useTimelineScroll,
} from './use-timeline-scroll.ts'
import {
	useWeekChange,
	WeekChangeCard,
	WeekChangeWaiting,
} from './week-change-card.tsx'
import { buildWeekChangeCard } from './week-change.ts'
import { WeekStrip } from './week-strip.tsx'

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
	/*
	 * The other three hero panes' data (#496). Every field here was already
	 * fetched on every home request and rendered by nothing: the load snapshots,
	 * the records, the week's adherence, the strength count and the stored Week
	 * Replan decision. Nothing new is queried — the panes are a surface, not a
	 * feature.
	 */
	snapshots: Array<{ date: string; ctl: number }>
	weeklyAdherence: WeeklyAdherence | null
	strengthCount: StrengthSummaryCount | null
	weekReplan: WeekReplanSummary | null
	/**
	 * The Ukeskiftet card's proposals (#505 stories 42–55): the closed week's,
	 * while one still waits for an answer; null otherwise.
	 */
	weekChange?: WeekChangeData | null
	personalRecords: PersonalRecord[]
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
	// actually read; a `data.x` dependency is a property read on a mutable object,
	// which the exhaustive-deps rule cannot verify.
	const {
		ledger,
		activePlan,
		current,
		tsbTrust,
		sustained,
		nudge,
		thresholds,
		loadRecomputeNotice,
		snapshots,
		weeklyAdherence,
		strengthCount,
		weekReplan,
		personalRecords,
		weekChange = null,
	} = data
	// `now` comes from the loader so SSR and hydration agree on "today", and the
	// Athlete Timezone fixes which calendar day that instant reads as — the same
	// contract every other surface holds (#172).
	const now = useMemo(
		() => (data.now ? new Date(data.now) : new Date()),
		[data.now],
	)
	const timezone = useAthleteTimezone()

	const season = useMemo(
		() => buildTimelineSeason({ ledger, now, timezone, activePlan }),
		[activePlan, ledger, now, timezone],
	)
	const hero = useMemo(
		() =>
			buildTimelineHero({
				ledger,
				now,
				timezone,
				thresholds,
				activePlan,
				current,
				trust: tsbTrust,
				sustained,
				nudge,
			}),
		[
			activePlan,
			current,
			ledger,
			nudge,
			sustained,
			thresholds,
			tsbTrust,
			now,
			timezone,
		],
	)
	// The hero's other three panes (#496). The week pane reads the week today
	// falls in off the season that was already built, so the pane and the stream
	// header it summarises cannot disagree about the week they are both about.
	const panes = useMemo(
		() =>
			buildHeroPanes({
				current,
				trust: tsbTrust,
				snapshots,
				thisWeek: season.weeks[season.todayWeekIndex] ?? null,
				weeklyAdherence,
				strengthCount,
				weekReplan,
				personalRecords,
				timezone,
			}),
		[
			current,
			personalRecords,
			season,
			snapshots,
			strengthCount,
			timezone,
			tsbTrust,
			weekReplan,
			weeklyAdherence,
		],
	)

	// How much chrome sits above the frame — see the `style` note on `<main>`.
	const frameRef = useRef<HTMLElement>(null)
	const [chrome, setChrome] = useState<number | null>(null)
	useEffect(() => {
		const el = frameRef.current
		if (!el) return
		const measure = () => {
			const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
			setChrome((current) => (current === top ? current : top))
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

	// The window: one week either side of today at first, widening as the athlete
	// reads past either edge.
	const from = Math.max(0, season.todayWeekIndex - scroll.loaded.before)
	const to = Math.min(
		season.weeks.length - 1,
		season.todayWeekIndex + scroll.loaded.after,
	)
	// Memoised on the bounds rather than sliced inline (#503). This frame
	// re-renders on every scroll frame that crosses a week header, and the week
	// blocks are memoised on props that come off this list.
	const visibleWeeks = useMemo(
		() => season.weeks.slice(from, to + 1),
		[season.weeks, from, to],
	)
	const notice = buildLoadRecomputeLine(loadRecomputeNotice)

	// The closed weeks the athlete has opened (#505 story 31). Held here rather
	// than in each week, so a strip jump into a folded week can open it on the
	// way — a jump is a request to see the week, not its one-line fold.
	const [openWeeks, setOpenWeeks] = useState<ReadonlySet<string>>(
		() => new Set(),
	)
	const toggleWeek = useCallback((key: string) => {
		setOpenWeeks((current) => {
			const next = new Set(current)
			if (next.has(key)) next.delete(key)
			else next.add(key)
			return next
		})
	}, [])
	const streamNode = useRef<HTMLDivElement | null>(null)
	const { streamRef: scrollStreamRef, goToWeek } = scroll
	const streamRef = useCallback(
		(node: HTMLDivElement | null) => {
			streamNode.current = node
			scrollStreamRef(node)
		},
		[scrollStreamRef],
	)
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
				// lands — so the reading position this render produces is the
				// jump's, and the stream's compensation must not credit it again.
				streamNode.current?.setAttribute(HELD_ATTR, '')
				setOpenWeeks((current) => new Set(current).add(key))
			}
			goToWeek(key)
		},
		[goToWeek, season.weeks],
	)
	const large = useLargeScreen()

	// The Ukeskiftet card, under today's row (#505 story 42), and the line on
	// top that leads to it. Built once per change of what it reads, so today's
	// memoised week block keeps its props.
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

	return (
		<main
			ref={frameRef}
			// The stream can only scroll inside a box with a **definite** height, and
			// `app/root.tsx` gives its layout `min-h-screen` — a minimum, not a
			// height — so a `flex-1` child here inherits nothing to scroll within and
			// the whole page scrolls instead. The frame therefore states its own
			// height: the viewport, less whatever chrome sits above it.
			//
			// `100dvh` is the server-rendered and no-JS answer, which is right to
			// within the height of the wordmark row; the measured value below takes
			// that row out. Measuring rather than hardcoding, because how tall the
			// only persistent chrome (#178) happens to be is not this screen's
			// business.
			style={
				chrome == null ? undefined : { height: `calc(100dvh - ${chrome}px)` }
			}
			className="relative flex h-[100dvh] min-h-0 overflow-hidden"
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
				{weekChangeView?.waitingLabel ? (
					<WeekChangeWaiting label={weekChangeView.waitingLabel} />
				) : null}

				<div
					className={cn(
						'bg-background z-4 flex-none',
						scroll.collapsed && 'border-hairline-edge border-b',
					)}
				>
					<div className="flex items-center gap-3 px-[18px] py-[14px]">
						{scroll.collapsed && hero ? (
							<>
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="truncate text-[13px]/[1.2] font-semibold">
										{hero.collapsed.title}
									</span>
									<span className="text-primary text-[10.5px]/[1.2]">
										{hero.collapsed.summary}
									</span>
								</span>
								<Link
									to={hero.cta.to}
									className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[34px] flex-none items-center rounded-[10px] px-[14px] text-[12.5px]/[1] font-bold"
								>
									{hero.cta.label}
								</Link>
							</>
						) : (
							<>
								{/*
								 * "+ New" is the app's single creation menu (#178). It was the
								 * Cockpit header's, and creation has to survive the
								 * re-composition: the design's header has only a wordmark, a
								 * date and an avatar — and `app/root.tsx` already renders the
								 * first and the last — so this row has the room for it.
								 *
								 * Expanded only. The collapsed row is the session summary and
								 * its action, and squeezing a third control in beside them
								 * would crowd the one thing the athlete scrolled away from.
								 */}
								<CreateMenu />
								<span className="text-muted-foreground flex-1 text-right text-[12px]/[1.2]">
									{season.headerLabel}
								</span>
							</>
						)}
					</div>

					{/*
					 * The hero is a scroll-position-driven collapse, not a drawer: it
					 * has no open/closed control, no focus to trap and nothing to
					 * dismiss.
					 *
					 * It is also not an animation (#498). The height, the opacity and
					 * the lift are read off the scroll offset and written by
					 * `use-timeline-scroll.ts` on the same pass that measures
					 * everything else, so a gesture gets continuous feedback instead
					 * of a 280ms transition that fired once the gesture was over.
					 * There is nothing to style here but the clip and the lift: no
					 * transition, no `max-h` pairs, and no height at all until
					 * something has measured one — which is what the server render
					 * and a no-JS browser get, and it is right, because an unmeasured
					 * hero is an open one.
					 *
					 * `inert` rather than `aria-hidden` (#487). A hero folded to
					 * nothing is away from the eye but not from the tab order, so
					 * `aria-hidden` alone left its two links focusable while
					 * unreadable — a keyboard user tabbing into a box that is not
					 * there. `inert` takes the subtree out of the accessibility tree
					 * *and* the tab order, which is the whole of what collapsed means
					 * here.
					 */}
					<div
						ref={scroll.heroRef}
						data-testid="hero-fold"
						inert={scroll.collapsed}
						className="overflow-hidden"
					>
						<div className="hero-lift">
							<HeroPager hero={hero} panes={panes} />
						</div>
					</div>

					{/*
					 * The season strip (#505 stories 17–18): every week at once, a
					 * frame over the weeks in view, and the "I dag" pill — which is
					 * the way back to today, always in the same place, quiet while
					 * today is on screen and filled once it is not. It replaced the
					 * pill that used to float over the stream's bottom edge.
					 */}
					<WeekStrip
						strip={season.strip}
						activeWeekKey={scroll.activeWeekKey}
						frame={scroll.frame}
						away={scroll.away}
						onSelect={jumpToWeek}
						onToday={scroll.backToToday}
					/>
				</div>

				<div
					ref={streamRef}
					onScroll={scroll.onStreamScroll}
					data-testid="timeline-stream"
					// Named for the markup as well as for the tests: a past band deep
					// in the stream finds the box it scrolls in through this, so
					// expanding it can hold the reading position (#500).
					{...{ [STREAM_ATTR]: 'true' }}
					// `overflow-anchor: none` because the browser's own scroll
					// anchoring fights the manual compensation a week loading in above
					// needs. `scroll-behavior: smooth` is for the athlete's own
					// keyboard scrolling only — every write this screen makes is a
					// jump, and `motion-safe:` is what the Motion sheet asks of the
					// scroller.
					className="relative min-h-0 flex-1 overflow-y-auto [overflow-anchor:none] motion-safe:[scroll-behavior:smooth]"
				>
					{from === 0 ? (
						<StartCap
							loggedFromLabel={season.loggedFromLabel}
							reachesBackToLabel={season.reachesBackToLabel}
							reachWeeks={season.reachWeeks}
						/>
					) : null}
					{visibleWeeks.map((week) => (
						<WeekBlock
							key={week.key}
							week={week}
							anchorDayKey={season.todayKey}
							open={openWeeks.has(week.key)}
							onToggle={toggleWeek}
							afterAnchor={week.isNow ? weekChangeCard : null}
						/>
					))}
					{to === season.weeks.length - 1 ? (
						<EndCap cap={season.endCap} />
					) : null}
				</div>
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
 * The Load Recompute Notice (ADR 0046 §2) as a one-line bar: what moved, why,
 * and an acknowledgement. It is deliberately not a card — it is above the
 * timeline, not part of it, and it leaves for good once acknowledged.
 */
function LoadRecomputeNoticeBar({ line }: { line: LoadRecomputeLine }) {
	return (
		<section
			data-testid="load-recompute-notice"
			aria-labelledby="load-recompute-kicker"
			className="border-hairline-edge flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-[18px] py-2.5"
		>
			<h2
				id="load-recompute-kicker"
				className="text-foreground text-[11px]/[1.2] font-semibold tracking-wide uppercase"
			>
				{line.kicker}
			</h2>
			<p className="text-foreground text-[11.5px]/[1.35] font-medium tabular-nums">
				{line.movement}
			</p>
			<p className="text-muted-foreground w-full text-[11.5px]/[1.4]">
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
					className="border-hairline-edge text-foreground hover:border-primary rounded-[8px] border px-2.5 py-1 text-[11px]/[1.2] font-semibold"
				>
					{RECOMPUTE_NOTICE_LABELS.gotIt}
				</button>
			</Form>
		</section>
	)
}
