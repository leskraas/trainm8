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
 * The measuring lives in `use-timeline-scroll.ts`, the arithmetic in
 * `anchoring.ts`, and what a row is allowed to say in `row-content.ts`. What is
 * left here is markup and composition.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Form, Link } from 'react-router'
import { CreateMenu } from '#app/components/create-menu.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadTriad } from '#app/utils/load/types.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import {
	buildLoadRecomputeLine,
	type LoadRecomputeLine,
	type LoadRecomputeNotice,
} from '../cockpit/presenter.ts'
import {
	buildTimelineHero,
	buildTimelineSeason,
	type TimelineHero,
} from './presenter.ts'
import { EndCap, StartCap, WeekBlock } from './stream.tsx'
import { useTimelineScroll } from './use-timeline-scroll.ts'
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
}

export function HomeTimeline({ data }: { data: HomeTimelineData }) {
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
	const visibleWeeks = season.weeks.slice(from, to + 1)
	const loadedKeys = useMemo(
		() => new Set(visibleWeeks.map((week) => week.key)),
		[visibleWeeks],
	)
	const notice = buildLoadRecomputeLine(loadRecomputeNotice)

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
			className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden"
		>
			{/* Why a number the athlete had already read moved (ADR 0046 §2). It sits
			    above everything because it is a one-shot explanation, not a panel. */}
			{notice ? <LoadRecomputeNoticeBar line={notice} /> : null}

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
				 * The hero is a scroll-position-driven collapse, not a drawer: it has
				 * no open/closed control, no focus to trap and nothing to dismiss. A
				 * max-height plus opacity transition is the whole of it, and the two
				 * run at different speeds so the fade finishes before the fold does.
				 *
				 * `inert` rather than `aria-hidden` (#487). Folding to `max-h-0` takes
				 * the hero away from the eye but not from the tab order, so
				 * `aria-hidden` alone left its two links focusable while unreadable —
				 * a keyboard user tabbing into a box that is not there. `inert` takes
				 * the subtree out of the accessibility tree *and* the tab order, which
				 * is the whole of what collapsed means here.
				 */}
				<div
					inert={scroll.collapsed}
					className={cn(
						'overflow-hidden [transition:max-height_.28s_ease,opacity_.18s_ease]',
						scroll.collapsed
							? 'max-h-0 opacity-0'
							: 'max-h-[470px] opacity-100',
					)}
				>
					{hero ? <Hero hero={hero} /> : <NothingScheduled />}
				</div>

				<WeekStrip
					weeks={season.weeks}
					activeWeekKey={scroll.activeWeekKey}
					loadedKeys={loadedKeys}
					heaviestPlannedTss={season.heaviestPlannedTss}
					raceDayLabel={season.endCap.eventDateLabel}
					onSelect={scroll.goToWeek}
					stripRef={scroll.stripRef}
				/>
			</div>

			<div
				ref={scroll.streamRef}
				onScroll={scroll.onStreamScroll}
				data-testid="timeline-stream"
				// `overflow-anchor: none` because the browser's own scroll anchoring
				// fights the manual compensation a week loading in above needs.
				className="relative min-h-0 flex-1 overflow-y-auto [scroll-behavior:smooth] [overflow-anchor:none]"
			>
				{from === 0 ? (
					<StartCap loggedFromLabel={season.loggedFromLabel} />
				) : null}
				{visibleWeeks.map((week) => (
					<WeekBlock
						key={week.key}
						week={week}
						anchorRowId={season.todayRowId}
					/>
				))}
				{to === season.weeks.length - 1 ? <EndCap cap={season.endCap} /> : null}
			</div>

			{/*
			 * The back-to-today pill. The design floats it 70px up to clear a bottom
			 * tab bar; there is no tab bar in this app — `app/root.tsx` states the
			 * wordmark row is the only persistent chrome (#178) — so it sits just
			 * above the bottom edge instead.
			 *
			 * TODO(#178): if the bottom tab bar is ever adopted, it mounts here as
			 * the third child of the frame and this pill goes back to `bottom-[70px]`.
			 */}
			{scroll.away !== 0 ? (
				<button
					type="button"
					onClick={scroll.backToToday}
					className="bg-primary text-primary-foreground hover:bg-primary/85 absolute bottom-4 left-1/2 z-5 h-[40px] -translate-x-1/2 rounded-[40px] px-[18px] text-[12.5px]/[1] font-bold shadow-(--shadow-pill)"
				>
					{scroll.away < 0 ? '↑ Back to today' : '↓ Back to today'}
				</button>
			) : null}
		</main>
	)
}

function Hero({ hero }: { hero: TimelineHero }) {
	return (
		<div className="flex flex-col gap-3.5 px-[18px] pt-1 pb-[18px]">
			<div>
				<p className="text-primary font-mono text-[10px]/[1] font-bold tracking-[0.16em] uppercase">
					{hero.kicker}
				</p>
				<h1 className="mt-[11px] text-[30px]/[1.08] font-semibold tracking-[-0.035em]">
					{hero.title}
				</h1>
			</div>
			{hero.bars.length > 0 ? (
				<ProfileBars
					bars={hero.bars}
					groups={hero.groups}
					className="h-[34px]"
				/>
			) : null}
			{hero.facts.length > 0 ? (
				<p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px]/[1.3]">
					{hero.facts.map((fact) => (
						<span key={fact}>{fact}</span>
					))}
				</p>
			) : null}
			<p className="text-ink-body text-[13.5px]/[1.5]">{hero.verdict}</p>
			<div className="flex gap-[9px]">
				<Link
					to={hero.cta.to}
					className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[50px] flex-1 items-center justify-center rounded-[15px] text-[14.5px]/[1] font-bold"
				>
					{hero.cta.label}
				</Link>
				{/*
				 * The design's second button is "Ease". There is no athlete-invocable
				 * ease: a Week Replan is applied on the load-recompute path and never
				 * on demand (ADR 0025), so a button here would either lie or do
				 * nothing. The slot goes to the season plan instead — the destination
				 * the excluded tab bar would otherwise have carried.
				 */}
				<Link
					to="/training/plan"
					className="border-hairline-edge text-foreground hover:border-primary flex h-[50px] flex-none items-center rounded-[15px] border px-4 text-[13px]/[1] font-semibold"
				>
					Season plan
				</Link>
			</div>
		</div>
	)
}

/** No session ahead: the hero says so rather than showing an empty shape. */
function NothingScheduled() {
	return (
		<div className="flex flex-col gap-3.5 px-[18px] pt-1 pb-[18px]">
			<h1 className="text-[30px]/[1.08] font-semibold tracking-[-0.035em]">
				Nothing scheduled
			</h1>
			<p className="text-muted-foreground text-[13.5px]/[1.5]">
				There is no session ahead of you on the calendar.
			</p>
			<Link
				to="/training/sessions/new"
				className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[50px] items-center justify-center rounded-[15px] text-[14.5px]/[1] font-bold"
			>
				Plan a session
			</Link>
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
					Got it
				</button>
			</Form>
		</section>
	)
}
