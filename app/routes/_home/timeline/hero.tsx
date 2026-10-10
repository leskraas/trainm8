/**
 * **Going with the hero (#505).** The owner removed the hero from I dag on
 * 2026-10-10. Form and Records now live on Meg
 * (`app/routes/__me-form-records-presenter.ts`, with the Norwegian number
 * formatting the hero never had); the week pane is folded into the list. This
 * file, `hero-panes.ts` and its test stay only while `home-timeline.tsx` still
 * renders `HeroPager`, and are deleted with that import.
 *
 * The hero — the top pane of the home timeline, and the first of two horizontal
 * axes on the screen (ADR 0065 §8).
 *
 * **The hero never moves in time.** It is anchored on today, permanently, and
 * pages sideways through facets of *now*: today's session, Form, this week,
 * records. The strip below it and the stream below that are the things that
 * travel; paging here moves neither, which is the rule the whole screen is
 * explained by.
 *
 * Two swipeable bands stacked on one screen only stay legible as two
 * instruments if they behave like two instruments, so nothing about this is
 * shared with the strip:
 *
 * - The hero **pages** — one full-width pane, mandatory snap, four dots. A pane
 *   that fills the width says *"one of several"*.
 * - The strip **scrolls** — cells cut off at both edges, proximity snap, no
 *   indicator. A cell sliced in half says *"this keeps going"*.
 * - The dots row between them belongs to neither and swallows a stray thumb.
 * - Both take `touch-action: pan-x`, so a diagonal drag reaches the vertical
 *   stream instead of being eaten sideways.
 *
 * The gesture maths is in `hero-pager.ts` (pure, so a flick can be tested with a
 * velocity), the pane content in `hero-panes.ts` and `presenter.ts`. What is
 * left here is markup, the spring, and the keyboard.
 */
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { LoadLegendLabel } from '#app/components/load-legend.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import {
	HERO_LABELS,
	HERO_PANE_LABELS,
	HERO_PANE_TEXT,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	HERO_PANES,
	type HeroPaneName,
	PANE_SPRING,
	paneAfterFlick,
} from './hero-pager.ts'
import {
	type HeroFormPane,
	type HeroPanes,
	type HeroRecordsPane,
	type HeroWeekPane,
} from './hero-panes.ts'
import { type TimelineHero } from './presenter.ts'

/** The pane kicker — the same mark the Today pane's own kicker wears. */
const KICKER =
	'text-primary font-mono text-[10px]/[1] font-bold tracking-[0.16em] uppercase'

/** Every pane sits on the hero's own gutters, so paging cannot shift the text. */
const PANE = 'flex w-full flex-none flex-col gap-3.5 px-[18px] pt-1 pb-[18px]'

export function HeroPager({
	hero,
	panes,
}: {
	/** Today's pane; null when there is no session ahead at all. */
	hero: TimelineHero | null
	panes: HeroPanes
}) {
	const [index, setIndex] = useState(0)
	const viewportRef = useRef<HTMLDivElement>(null)
	const x = useMotionValue(0)
	// The pane width is the viewport's, measured rather than assumed: the frame
	// is the viewport less the chrome above it (`home-timeline.tsx`), and a phone
	// that rotates changes it. Zero until layout exists, which is the server
	// render's answer and jsdom's — both of which page by index alone.
	const widthRef = useRef(0)
	const indexRef = useRef(0)
	const [paneWidth, setPaneWidth] = useState(0)
	// Reduced motion drops the spring, not the paging (the Motion sheet's rule:
	// gentler, never zero). The pane still changes; it just arrives.
	const reduced = useReducedMotion()

	useEffect(() => {
		const el = viewportRef.current
		if (!el) return
		const measure = () => {
			const width = el.getBoundingClientRect().width
			widthRef.current = width
			// Re-pin rather than animate: a resize is not a page turn.
			x.jump(-indexRef.current * width)
			setPaneWidth((current) => (current === width ? current : width))
		}
		measure()
		window.addEventListener('resize', measure)
		return () => window.removeEventListener('resize', measure)
	}, [x])

	const goTo = useCallback(
		(next: number) => {
			const target = Math.min(HERO_PANES.length - 1, Math.max(0, next))
			indexRef.current = target
			setIndex(target)
			const to = -target * widthRef.current
			if (reduced) x.jump(to)
			else void animate(x, to, PANE_SPRING)
		},
		[reduced, x],
	)

	return (
		<>
			<div
				ref={viewportRef}
				data-testid="hero-pager"
				// A carousel rather than tabs: all four panes exist at once and a
				// swipe is the primary gesture. `tabIndex` because neither band was
				// keyboard-reachable at all, and a pager only reachable by touch is
				// not reachable.
				role="group"
				aria-roledescription="carousel"
				aria-label={HERO_LABELS.carousel}
				tabIndex={0}
				onKeyDown={(event) => {
					if (event.key === 'ArrowRight') goTo(index + 1)
					else if (event.key === 'ArrowLeft') goTo(index - 1)
					else if (event.key === 'Home') goTo(0)
					else if (event.key === 'End') goTo(HERO_PANES.length - 1)
					else return
					// Only once a key did something: the stream owns the arrow keys
					// everywhere else on this screen.
					event.preventDefault()
				}}
				className="focus-visible:outline-ring [touch-action:pan-x] overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2"
			>
				<motion.div
					className="flex"
					style={{ x }}
					drag="x"
					dragDirectionLock
					// The projection decides where a flick lands (`hero-pager.ts`), so
					// motion's own momentum must not also have a say.
					dragMomentum={false}
					dragConstraints={{
						left: -(HERO_PANES.length - 1) * paneWidth,
						right: 0,
					}}
					onDragEnd={(_event, info) =>
						goTo(
							paneAfterFlick({
								index,
								offsetPx: info.offset.x,
								velocityPxPerSec: info.velocity.x,
								paneWidthPx: widthRef.current,
							}),
						)
					}
				>
					{HERO_PANES.map((name, i) => (
						<div
							key={name}
							role="group"
							aria-roledescription="slide"
							aria-label={HERO_LABELS.pane(
								HERO_PANE_LABELS[name],
								i + 1,
								HERO_PANES.length,
							)}
							// `inert` on the panes that are not showing, for the reason
							// #487 gave the folded hero: a pane off screen is out of the
							// eye but not out of the tab order, and a keyboard user must
							// not land inside something they cannot read. The dots and the
							// arrow keys are how the other three are reached.
							inert={i !== index}
							className={PANE}
						>
							<PaneContent name={name} hero={hero} panes={panes} />
						</div>
					))}
				</motion.div>
			</div>

			{/* The pane change, said out loud. A carousel that only animates has
			    nothing to announce to a reader who cannot see it move. */}
			<p aria-live="polite" className="sr-only">
				{HERO_LABELS.pane(
					HERO_PANE_LABELS[HERO_PANES[index]!],
					index + 1,
					HERO_PANES.length,
				)}
			</p>

			<PaneDots index={index} onSelect={goTo} />
		</>
	)
}

/**
 * The dots: the indicator *and* the boundary. They belong to neither scroller,
 * so the row takes `touch-action: none` — a thumb that lands between the two
 * bands should move nothing rather than pick one at random.
 *
 * Real buttons, because they are the way every pane is reached without a swipe.
 * A dot is a glyph mark and cannot be 44px tall, so it takes the `after:`
 * hit-area extension the mobile standard keeps for exactly that case (ADR 0028).
 */
function PaneDots({
	index,
	onSelect,
}: {
	index: number
	onSelect: (index: number) => void
}) {
	return (
		<div
			role="group"
			aria-label={HERO_LABELS.choosePane}
			data-testid="hero-pane-dots"
			className="flex [touch-action:none] items-center justify-center gap-2 pb-2"
		>
			{HERO_PANES.map((name, i) => (
				<button
					key={name}
					type="button"
					onClick={() => onSelect(i)}
					aria-label={HERO_PANE_LABELS[name]}
					aria-current={i === index ? 'true' : undefined}
					className="focus-visible:outline-ring relative grid size-[26px] place-items-center rounded-full after:absolute after:-inset-y-1 focus-visible:outline-2 focus-visible:outline-offset-1"
				>
					{/* The dot changes, it does not animate (#502). It is the
					    indicator for a gesture the athlete is still making, and a
					    width that eases into place lags the pane it is reporting on —
					    the pager's own spring is the movement, and this says where it
					    landed. */}
					<span
						className={cn(
							'block h-[6px] rounded-full',
							i === index ? 'bg-primary w-[16px]' : 'bg-hairline w-[6px]',
						)}
					/>
				</button>
			))}
		</div>
	)
}

function PaneContent({
	name,
	hero,
	panes,
}: {
	name: HeroPaneName
	hero: TimelineHero | null
	panes: HeroPanes
}) {
	switch (name) {
		case 'today':
			return hero ? <Hero hero={hero} /> : <NothingScheduled />
		case 'form':
			return <FormPane pane={panes.form} />
		case 'week':
			return <WeekPane pane={panes.week} />
		case 'records':
			return <RecordsPane pane={panes.records} />
	}
}

/** Today: the session, its shape, the coach's verdict, and one honest action. */
function Hero({ hero }: { hero: TimelineHero }) {
	return (
		<>
			<div>
				<p className={KICKER}>{hero.kicker}</p>
				<h1 className="mt-[11px] text-[30px]/[1.08] font-semibold tracking-[-0.035em]">
					{hero.title}
				</h1>
				{/*
				 * Today holds nothing to do, so the heading said so and the session
				 * below is the next one — named here as a fact rather than dressed up
				 * as today's headline (#493). The kicker above already says which day
				 * it falls on.
				 */}
				{hero.next ? (
					<p className="text-foreground mt-2 text-[15px]/[1.3] font-medium">
						{hero.next}
					</p>
				) : null}
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
					{HERO_LABELS.seasonPlan}
				</Link>
			</div>
		</>
	)
}

/** No session ahead: the hero says so rather than showing an empty shape. */
function NothingScheduled() {
	return (
		<>
			<h1 className="text-[30px]/[1.08] font-semibold tracking-[-0.035em]">
				{HERO_LABELS.nothingScheduled}
			</h1>
			<p className="text-muted-foreground text-[13.5px]/[1.5]">
				{HERO_LABELS.nothingScheduledNote}
			</p>
			<Link
				to="/training/sessions/new"
				className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[50px] items-center justify-center rounded-[15px] text-[14.5px]/[1] font-bold"
			>
				{HERO_LABELS.planASession}
			</Link>
		</>
	)
}

/**
 * Form: the Training Load triad, and the evidence behind the verdict on the
 * Today pane (ADR 0008). Each abbreviation is a legend trigger again (#181) —
 * hover or focus spells out the glossary definition, and the trigger's
 * accessible name is the full term, never the three-letter shorthand.
 */
function FormPane({ pane }: { pane: HeroFormPane }) {
	return (
		<>
			<h2 className={KICKER}>{HERO_PANE_LABELS.form}</h2>
			<dl className="flex gap-6">
				{pane.stats.map((stat) => (
					// `dt` before `dd` in the markup, reversed in the layout: the
					// number reads first and the term explains it, but a definition
					// list says what it is defining before it defines it.
					<div
						key={stat.legend.short}
						className="flex flex-col-reverse gap-1.5"
					>
						<dt className="text-muted-foreground text-[11.5px]/[1.2]">
							<LoadLegendLabel legend={stat.legend} />
						</dt>
						<dd className="text-[27px]/[1] font-semibold tracking-[-0.03em] tabular-nums">
							{stat.value ?? '—'}
						</dd>
					</div>
				))}
			</dl>
			{pane.caveat ? (
				<p className="text-ink-body text-[13.5px]/[1.5]">{pane.caveat}</p>
			) : null}
			{pane.trend ? (
				<p className="text-muted-foreground text-[12.5px]/[1.35] tabular-nums">
					{pane.trend}
				</p>
			) : null}
		</>
	)
}

/** This week: what the plan asked for, what happened, and what closing the last one decided. */
function WeekPane({ pane }: { pane: HeroWeekPane }) {
	return (
		<>
			<h2 className={KICKER}>{HERO_PANE_LABELS.week}</h2>
			{pane.phase ? (
				<p className="text-[17px]/[1.2] font-semibold tracking-[-0.02em]">
					{pane.phase}
				</p>
			) : null}
			<p className="text-ink-body text-[13.5px]/[1.4] tabular-nums">
				{pane.stats}
			</p>
			<p className="text-muted-foreground text-[12.5px]/[1.35] tabular-nums">
				{pane.adherence}
			</p>
			<p className="text-muted-foreground text-[12.5px]/[1.35] tabular-nums">
				{pane.strength}
			</p>
			{/* The stored Week Replan decision, read never re-derived (ADR 0025): the
			    outcome's name, then its reason exactly as the applier wrote it. */}
			{pane.replan ? (
				<p
					data-testid="hero-week-replan"
					className="border-hairline-edge flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-2.5 text-[12px]/[1.4]"
				>
					<span className="text-foreground text-[11px]/[1.2] font-semibold tracking-wide uppercase">
						{pane.replan.outcome}
					</span>
					<span className="text-muted-foreground">{pane.replan.reason}</span>
				</p>
			) : null}
		</>
	)
}

/**
 * Records: the Proof Strip's Personal Records (ADR 0021). With no qualifying
 * effort it says so — never a fabricated zero, and never an empty shape.
 */
function RecordsPane({ pane }: { pane: HeroRecordsPane }) {
	return (
		<>
			<h2 className={KICKER}>{HERO_PANE_LABELS.records}</h2>
			{pane.records.length === 0 ? (
				<p className="text-muted-foreground text-[13.5px]/[1.5]">
					{HERO_PANE_TEXT.noRecords}
				</p>
			) : (
				<ul className="flex flex-col">
					{pane.records.map((record) => (
						<li
							key={`${record.discipline}-${record.label}`}
							className="border-hairline flex items-baseline justify-between gap-3 border-b py-2 first:pt-0 last:border-0 last:pb-0"
						>
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="text-ink-dim text-[10px]/[1.2] font-medium tracking-[0.08em] uppercase">
									{record.label}
								</span>
								<span className="text-[17px]/[1.15] font-semibold tabular-nums">
									{record.value}
								</span>
							</span>
							<span className="text-muted-foreground flex-none text-[11.5px]/[1.3] tabular-nums">
								{record.delta
									? HERO_PANE_TEXT.overBest(record.delta)
									: HERO_PANE_TEXT.firstOnRecord}
							</span>
						</li>
					))}
				</ul>
			)}
		</>
	)
}
