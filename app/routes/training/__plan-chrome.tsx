/**
 * The planning surface's visual language, in one module.
 *
 * #366 chose **variant F**, and spec #399 restates what that means: *Apple's
 * posture carrying TrainingPeaks' instrumentation* — one thing at a time,
 * generous whitespace, progressive disclosure, the season chart as the primary
 * object, and the numbers dense only where density is the point. The
 * instrumentation shipped first (#400–#412) and the posture did not, which left a
 * surface that says everything correctly in one unbroken column of open forms.
 * This module is the posture, factored out so the readings can wear it without
 * each of them inventing a card.
 *
 * **These are presentation primitives and nothing else.** No component here reads
 * a plan, derives a figure or decides a word — every one takes what it draws. That
 * is deliberate: the honesty rules this surface lives by (a derived figure marked
 * derived, an **Unavailable Metric** carrying its reason, a guard that warns and
 * never blocks) are the readings' to state, and a chrome module that started
 * deciding them would be a second opinion about the plan.
 *
 * Three notes on how this sits inside the house standard (ADR 0028,
 * `docs/design/ui-conventions.md`):
 *
 * - **Cards are earned here.** §1.6 keeps cards for repeated list items, stat
 *   modules and self-contained interactive widgets, and forbids them around plain
 *   prose and forms. Every card below is one of the three: a phase is a repeated
 *   unit, the span headline is a stat module, the chart is an interactive widget.
 *   `Disclosure` deliberately is *not* a card — it wraps prose and forms, so it
 *   draws a rule and a summary row instead.
 * - **Disclosure is native.** `<details>`/`<summary>` rather than React state, so
 *   a section opens with no JavaScript, is linkable by the browser's own find-in-page,
 *   and keeps its content in the accessibility tree's reach. The prototype used
 *   sheets; a sheet over a long form is worse on a phone than a section that opens
 *   in place, and this app has no sheet primitive to reach for (§3.2's overlay is a
 *   dialog).
 * - **No control physics.** Nothing here sets a control height or font: those
 *   belong to the ui primitives (§2.6). Chips and summary rows get the hit-area
 *   floor §2.2 asks of controls that cannot be 44 px tall.
 */
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'

/**
 * The one question the surface opens with: **what are you building toward?**
 *
 * Centred and given the page's largest type because #366 made the anchor the
 * surface's subject rather than a field on it — an athlete who cannot say what the
 * season is for has nothing to shape. The eyebrow is what makes the name a
 * *sentence* rather than a heading, which is the whole difference between this and
 * the title it replaces.
 *
 * It does not replace `PageHeader`: §3.1 owns the back affordance and the route's
 * identity, and this is the plan's own statement underneath it. The sizes are
 * §1.3's page-title pair, not the prototype's `2.4rem` — a bespoke size here would
 * be the one screen in the app whose title is bigger than every other screen's.
 */
export function PlanHero({
	eyebrow,
	title,
	meta,
	action,
}: {
	/** The lead-in that makes the title a sentence — "You're building toward". */
	eyebrow: string
	title: ReactNode
	/** When it happens and how far away it is; one line, never wrapped in prose. */
	meta: ReactNode
	/** The way out of the decision, as a quiet pill rather than a form. */
	action?: ReactNode
}) {
	return (
		<section className="space-y-3 py-2 text-center">
			<p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
				{eyebrow}
			</p>
			<h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
				{title}
			</h1>
			<p className="text-muted-foreground text-sm">{meta}</p>
			{action ? <div className="flex justify-center pt-1">{action}</div> : null}
		</section>
	)
}

/**
 * A quiet pill: the surface's secondary action shape.
 *
 * Rounded rather than the default control's radius, because these sit *inside*
 * readings — beside a headline, at the foot of a card — where a full-height
 * rectangular button reads as the section's primary act and is not one. It renders
 * as a link or as anything passed in, so the pill is a look and never a decision
 * about what the control *is*.
 */
export function PillLink({
	to,
	children,
	className,
}: {
	to: string
	children: ReactNode
	className?: string
}) {
	return (
		<Link
			to={to}
			className={cn(
				'bg-muted text-foreground hover:bg-muted/70 inline-flex min-h-9 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
				// §2.2: a pill is one of the controls that cannot be 44 px tall, so it
				// takes the invisible hit-area extension instead.
				'relative after:absolute after:inset-x-0 after:top-1/2 after:min-h-11 after:-translate-y-1/2',
				className,
			)}
		>
			{children}
		</Link>
	)
}

/**
 * A surface card: the container the chart, the headline and each phase sit in.
 *
 * The header row is part of the card rather than a heading above it, because the
 * aside — "10 weeks · read in km/wk" — qualifies *this* card's contents and would
 * read as a claim about the page if it floated free. `title` is optional: a card
 * whose contents name themselves needs no second name.
 */
type PlanCardProps = {
	/** The quiet right-hand qualifier — a count, a unit, a state. */
	aside?: ReactNode
	children: ReactNode
	className?: string
	contentClassName?: string
} & (
	| {
			title: ReactNode
			/**
			 * Names the card as a landmark. Pass it wherever the card is a place an
			 * athlete navigates *to* — the season chart is one, and was a named
			 * `section` before it wore a card, so dropping the name would trade a
			 * landmark for a border.
			 */
			titleId?: string
	  }
	// `titleId` without a `title` would point `aria-labelledby` at an element this
	// component never renders — a landmark named by nothing, which is worse than an
	// unnamed one. A union rather than a runtime guard, so the broken pair is a
	// compile error at the call site instead of a silent hole here.
	| { title?: never; titleId?: never }
)

export function PlanCard({
	title,
	aside,
	titleId,
	children,
	className,
	contentClassName,
}: PlanCardProps) {
	// A `section` only when it is named: an unnamed region is one more anonymous
	// landmark in a screen reader's list, which is worse than a `div`.
	const Wrapper = titleId ? 'section' : 'div'
	return (
		<Wrapper
			aria-labelledby={titleId}
			className={cn(
				'border-border/70 bg-card rounded-3xl border shadow-xs',
				className,
			)}
		>
			{title ? (
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-4 md:px-6 md:pt-5">
					<h2 id={titleId} className="text-base font-semibold">
						{title}
					</h2>
					{aside ? (
						<span className="text-muted-foreground text-xs">{aside}</span>
					) : null}
				</div>
			) : null}
			<div className={cn('p-4 md:p-6', title ? 'pt-3 md:pt-4' : '')}>
				<div className={contentClassName}>{children}</div>
			</div>
		</Wrapper>
	)
}

/**
 * A section that opens: the surface's unit of progressive disclosure.
 *
 * What it buys is the whole complaint this module answers. Every control the
 * planning surface owns was rendered at once — the preset gallery's six paragraphs,
 * both anchor forms per track, four forms per phase, the pattern editor, the stamp
 * and the copy — so the page opened at ~13,000 px and an athlete looking for their
 * ramp scrolled past everything else to reach it. Closed by default, each of those
 * is a line; open, it is exactly the surface that shipped.
 *
 * **`<details>` and not state.** It works before hydration, survives find-in-page,
 * and — the reason it is worth stating — leaves its content in the DOM, so the
 * behaviour these sections already have under test is the behaviour they keep.
 *
 * `defaultOpen` is for the section an athlete came to use: a plan's *current* phase
 * opens, its finished ones do not.
 */
export function Disclosure({
	summary,
	detail,
	aside,
	defaultOpen = false,
	children,
	className,
}: {
	/** The section's name, and the whole of what a closed section says. */
	summary: ReactNode
	/** One line under the summary — what is inside, or what state it is in. */
	detail?: ReactNode
	/** A right-pinned qualifier: a count, a badge, a sparkline. */
	aside?: ReactNode
	defaultOpen?: boolean
	children: ReactNode
	className?: string
}) {
	return (
		<details
			open={defaultOpen}
			className={cn('group border-border/70 border-t py-1', className)}
		>
			<summary
				className={cn(
					'flex cursor-pointer list-none items-center gap-3 rounded-xl py-3 text-left',
					'hover:bg-muted/40 -mx-2 px-2 transition-colors',
					// The marker is ours, drawn below; Safari needs the pseudo-element
					// killed by name or it draws a second triangle.
					'[&::-webkit-details-marker]:hidden',
				)}
			>
				<span className="min-w-0 flex-1">
					<span className="block text-sm font-medium">{summary}</span>
					{detail ? (
						<span className="text-muted-foreground block text-xs">
							{detail}
						</span>
					) : null}
				</span>
				{aside ? <span className="shrink-0">{aside}</span> : null}
				<Icon
					name="chevron-down"
					size="sm"
					className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180"
				/>
			</summary>
			<div className="space-y-4 pt-1 pb-4">{children}</div>
		</details>
	)
}

/**
 * `Disclosure`'s card form: a repeated unit that opens in place.
 *
 * Separate from `Disclosure` rather than a flag on it because the two answer to
 * different halves of §1.6. A disclosure hides prose and forms and so must *not* be
 * a card; a phase is a repeated interactive unit and so must be one. They share the
 * summary row's anatomy and nothing else.
 *
 * `accent` is the strip down the left edge. It is the only thing that tells a
 * closed card apart at a glance on a phone, and it carries no meaning of its own —
 * the badges say what is current and what tapers, in words.
 */
export function DisclosureCard({
	summary,
	detail,
	badges,
	aside,
	accent,
	defaultOpen = false,
	contentClassName,
	children,
}: {
	summary: ReactNode
	detail?: ReactNode
	/** Named states — Current, Tapers — beside the title, never colour alone. */
	badges?: ReactNode
	aside?: ReactNode
	accent?: boolean
	defaultOpen?: boolean
	/** How the opened body stacks — a plain gap by default, rules where the card
	 *  holds several independent forms that would otherwise run together. */
	contentClassName?: string
	children: ReactNode
}) {
	return (
		<article className="border-border/70 bg-card overflow-hidden rounded-3xl border shadow-xs">
			<details open={defaultOpen} className="group">
				<summary
					className={cn(
						'flex cursor-pointer list-none items-center gap-3 p-4 text-left md:px-5',
						'hover:bg-muted/40 transition-colors',
						'[&::-webkit-details-marker]:hidden',
					)}
				>
					<span
						aria-hidden
						className={cn(
							'h-10 w-1 shrink-0 rounded-full',
							accent ? 'bg-primary' : 'bg-border',
						)}
					/>
					<span className="min-w-0 flex-1">
						<span className="flex flex-wrap items-center gap-2 text-base font-medium">
							{summary}
							{badges}
						</span>
						{detail ? (
							<span className="text-muted-foreground block text-sm">
								{detail}
							</span>
						) : null}
					</span>
					{aside ? (
						<span className="hidden shrink-0 sm:block">{aside}</span>
					) : null}
					<Icon
						name="chevron-down"
						size="sm"
						className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180"
					/>
				</summary>
				<div
					className={cn(
						'px-4 pt-1 pb-5 md:px-5',
						contentClassName ?? 'space-y-4',
					)}
				>
					{children}
				</div>
			</details>
		</article>
	)
}

/**
 * A phase's weeks as bars, at the size of a word.
 *
 * The point is the *rhythm*: a closed phase card has to show that its loading weeks
 * climb and its recovery week cuts, or the athlete has to open all of them to find
 * the block they meant. Heights are relative to the tallest week drawn **inside
 * this phase**, so the shape is legible in a 3-week block and a 12-week one alike —
 * which also means it is a shape and never a magnitude, and it carries no axis
 * because it is not a chart (ADR 0029's charts are the ones you can read numbers
 * off).
 *
 * A week the plan cannot price draws **nothing** — no bar of any height, only the
 * gap where one would be. A floor bar would put a small quantity where the plan has
 * no quantity at all, which is the picture version of fabricating a figure to fill
 * a slot. A week priced at `0` is the opposite case and does draw: zero is a number
 * an athlete authored, so it gets the shortest visible bar rather than none.
 */
export function PhaseSpark({
	values,
	recovery,
	label,
}: {
	/** One entry per week of the phase; `null` where the plan has no figure. */
	values: Array<number | null>
	/** Which of those weeks are cuts — drawn quiet rather than solid. */
	recovery?: boolean[]
	label: string
}) {
	const peak = Math.max(...values.map((value) => value ?? 0), 0)
	return (
		<span
			className="flex h-8 items-end gap-[3px]"
			role="img"
			aria-label={label}
		>
			{values.map((value, index) => {
				// Kept in the flow at zero height, so the weeks that *are* priced stay in
				// the positions their season gives them: dropping the element instead
				// would slide a phase's shape left by one week per missing figure.
				const missing = value == null
				return (
					<span
						key={index}
						className={cn(
							'w-1.5 rounded-full',
							missing
								? 'bg-transparent'
								: recovery?.[index]
									? 'bg-primary/35'
									: 'bg-primary/80',
						)}
						style={{
							height: missing
								? 0
								: // Every priced week is at least visible, so a zero week and a
									// tiny one both read as "there is a number here".
									`${Math.max(3, Math.round((value / (peak || 1)) * 32))}px`,
						}}
					/>
				)
			})}
		</span>
	)
}

/**
 * The Blocks / Weeks control, as one segmented track rather than two buttons.
 *
 * Segmented because the two are *one* choice with two answers, and a pair of
 * buttons — one filled, one outlined — reads as a primary action beside a secondary
 * one. #366 was explicit that this surface gets a tab only where a tab is
 * navigation, and that these two qualify: Blocks shapes the season, Weeks audits
 * it. They stay links, because the reading is URL state.
 */
export function SegmentedNav<T extends string>({
	label,
	options,
	current,
	hrefFor,
}: {
	label: string
	options: ReadonlyArray<{ key: T; label: string }>
	current: T
	hrefFor: (key: T) => string
}) {
	return (
		<nav
			aria-label={label}
			className="bg-muted inline-flex rounded-full p-1 text-sm"
		>
			{options.map((option) => {
				const active = option.key === current
				return (
					<Link
						key={option.key}
						to={hrefFor(option.key)}
						aria-current={active ? 'page' : undefined}
						className={cn(
							'inline-flex min-h-9 items-center rounded-full px-4 font-medium transition-colors',
							active
								? 'bg-background text-foreground shadow-xs'
								: 'text-muted-foreground hover:text-foreground',
						)}
					>
						{option.label}
					</Link>
				)
			})}
		</nav>
	)
}
