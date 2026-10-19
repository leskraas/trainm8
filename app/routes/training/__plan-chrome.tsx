/**
 * The planning surface's visual language, in one module — now on the design
 * system (ADR 0085, round 2): `ui/card`, `ui/collapsible`, `ui/button` and the
 * `SegmentedControl`, with the luma radii, the type steps and one motion curve.
 *
 * #366 chose **variant F**, and spec #399 restates what that means: *Apple's
 * posture carrying TrainingPeaks' instrumentation* — one thing at a time,
 * generous whitespace, progressive disclosure, the season as the primary object,
 * and the numbers dense only where density is the point. This module is the
 * posture, factored out so the readings can wear it without each of them
 * inventing a card.
 *
 * **These are presentation primitives and nothing else.** No component here reads
 * a plan, derives a figure or decides a word — every one takes what it draws. That
 * is deliberate: the honesty rules this surface lives by (a derived figure marked
 * derived, an **Unavailable Metric** carrying its reason, a guard that warns and
 * never blocks) are the readings' to state, and a chrome module that started
 * deciding them would be a second opinion about the plan.
 *
 * Three notes on how this sits inside the house standard (ADR 0028, ADR 0085,
 * `docs/design/design-system.md`):
 *
 * - **Cards are earned here.** §1.6 keeps cards for repeated list items, stat
 *   modules and self-contained interactive widgets, and forbids them around plain
 *   prose and forms. A phase is a repeated unit, the span headline is a stat
 *   module, the season picture is a widget. `CollapsibleSection` deliberately is
 *   *not* a card — it wraps prose and forms, so it draws a rule and a summary row.
 * - **A section that opens is a `Collapsible`**, and its body renders only while
 *   it is open (Base UI unmounts a closed panel). Sesong closed everything an
 *   athlete does rarely, and every closed form still rendered: 300 KB of HTML and
 *   a one-second hydration task on a throttled phone (audit §7). The cost is the
 *   no-JS reading of a closed section, which this page never had for its forms
 *   anyway (each posts through React Router). The panel animates its height on
 *   `motion-collapse`, the one sanctioned layout animation (ADR 0085 §4).
 * - **Every row and pill is a 44px target** (ADR 0028 §2): the summary rows are
 *   `min-h-11`, the pills are `Button`s with their hit area, the segments are the
 *   `SegmentedControl`'s.
 *
 * `Disclosure`, the native `<details>` section, stays for the surfaces that still
 * import it from here (the catalogue) until it moves.
 */
import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
} from '#app/components/ui/card.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { toggleVariants } from '#app/components/ui/toggle.tsx'
import { cn } from '#app/utils/misc.tsx'

/**
 * The native disclosure's chevron, keyed to **its own** `<details>` and nothing
 * above it: `details[open]>summary>&` reads exactly one element's state, where a
 * `group` would read any ancestor's (audit B5).
 */
const DISCLOSURE_CHEVRON =
	'text-muted-foreground shrink-0 [details[open]>summary>&]:rotate-180 motion-safe:transition-transform motion-safe:duration-press motion-safe:ease-out'

/**
 * A collapsible's chevron, keyed to **its own** trigger: Base UI marks the
 * trigger `data-panel-open`, and the chevron is the trigger's direct child, so a
 * section nested in an open one still points closed (audit B5). The turn is the
 * answer to a press — transform only, the strong ease-out at the press duration,
 * and no travel under reduced motion.
 */
export const COLLAPSIBLE_CHEVRON =
	'text-muted-foreground shrink-0 [[data-panel-open]>&]:rotate-180 motion-safe:transition-transform motion-safe:duration-press motion-safe:ease-out'

/**
 * A summary row's press: an instant tint on pointer-down rather than a scale,
 * because a full-width row that shrinks reads as the page flinching (design
 * system, mobile baseline). Hover is gated to fine pointers app-wide.
 */
export const ROW_PRESS =
	'hover:bg-muted/50 active:bg-muted motion-safe:transition-colors motion-safe:duration-press motion-safe:ease-out touch-manipulation'

/**
 * The one question the surface opens with: **what are you building toward?**
 *
 * Centred and given the page's title step because #366 made the anchor the
 * surface's subject rather than a field on it. The eyebrow is what makes the name
 * a *sentence* rather than a heading. It does not replace `PageHeader`: §3.1 owns
 * the route's identity, and this is the plan's own statement underneath it.
 */
export function PlanHero({
	eyebrow,
	title,
	meta,
	action,
}: {
	/** The lead-in that makes the title a sentence — "Du bygger mot". */
	eyebrow: string
	title: ReactNode
	/** When it happens and how far away it is; one line, never wrapped in prose. */
	meta: ReactNode
	/** The way out of the decision, as a quiet pill rather than a form. */
	action?: ReactNode
}) {
	return (
		<section className="space-y-2 py-2 text-center">
			<p className="text-overline text-muted-foreground uppercase">{eyebrow}</p>
			<h1 className="text-title text-balance [overflow-wrap:anywhere]">
				{title}
			</h1>
			<p className="text-footnote text-muted-foreground tabular-nums">{meta}</p>
			{action ? <div className="flex justify-center pt-2">{action}</div> : null}
		</section>
	)
}

/**
 * A quiet pill: the surface's secondary action, as a `Button` rendered as a
 * link — the press, the colours on the app's curve and the 44px hit area come
 * with the primitive (ADR 0085), so nothing here restates them.
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
				buttonVariants({ variant: 'secondary', size: 'sm' }),
				'rounded-full px-4',
				className,
			)}
		>
			{children}
		</Link>
	)
}

/**
 * A surface card: `ui/card`, the luma card (`rounded-4xl`, `shadow-md`, a
 * `ring-foreground/5` hairline), with a header row whose aside qualifies *this*
 * card's contents. `title` is optional: a card whose contents name themselves
 * needs no second name.
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
			 * Names the card as a landmark (`role="region"`). Pass it wherever the
			 * card is a place an athlete navigates *to*.
			 */
			titleId?: string
	  }
	// `titleId` without a `title` would point `aria-labelledby` at an element this
	// component never renders — a compile error rather than a silent hole.
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
	return (
		<Card
			// A region only when it is named: an unnamed one is one more anonymous
			// landmark in a screen reader's list.
			role={titleId ? 'region' : undefined}
			aria-labelledby={titleId}
			// 16px inside on a phone, luma's 24px from `md` (ui-conventions §1.4).
			className={cn(
				'text-foreground gap-4 text-base [--card-spacing:--spacing(4)] md:[--card-spacing:--spacing(6)]',
				className,
			)}
		>
			{title ? (
				<CardHeader className="items-baseline">
					<h2 id={titleId} className="text-heading">
						{title}
					</h2>
					{aside ? (
						<CardAction className="text-footnote text-muted-foreground self-center tabular-nums">
							{aside}
						</CardAction>
					) : null}
				</CardHeader>
			) : null}
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	)
}

/**
 * A section that opens: the surface's unit of progressive disclosure, on
 * `ui/collapsible`. Closed, it is one 44px row — its name and one line of what
 * is inside; open, it is exactly the surface that shipped.
 *
 * `defaultOpen` is for the section an athlete came to use. `open` /
 * `onOpenChange` make it controlled, for a section that must open on an answer
 * (a confirmation the athlete has to read cannot sit behind a closed row).
 */
export function CollapsibleSection({
	summary,
	detail,
	aside,
	defaultOpen = false,
	open,
	onOpenChange,
	children,
	className,
	contentClassName,
}: {
	/** The section's name, and the whole of what a closed section says. */
	summary: ReactNode
	/** One line under the summary — what is inside, or what state it is in. */
	detail?: ReactNode
	/** A right-pinned qualifier: a count, a badge, a sparkline. */
	aside?: ReactNode
	defaultOpen?: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
	children: ReactNode
	className?: string
	contentClassName?: string
}) {
	return (
		<Collapsible
			defaultOpen={defaultOpen}
			open={open}
			onOpenChange={onOpenChange}
			className={cn('border-border/60 border-t', className)}
		>
			<CollapsibleTrigger
				className={cn(
					'-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2.5 text-left',
					ROW_PRESS,
				)}
			>
				<span className="min-w-0 flex-1">
					<span className="text-callout block [overflow-wrap:anywhere]">
						{summary}
					</span>
					{detail ? (
						<span className="text-footnote text-muted-foreground block">
							{detail}
						</span>
					) : null}
				</span>
				{aside ? <span className="shrink-0">{aside}</span> : null}
				<Icon name="chevron-down" size="sm" className={COLLAPSIBLE_CHEVRON} />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className={cn('space-y-4 pt-1 pb-4', contentClassName)}>
					{children}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}

/**
 * The native `<details>` section, kept for the surfaces outside Sesong that
 * still import it (the catalogue). Sesong itself uses
 * {@link CollapsibleSection}.
 */
export function Disclosure({
	summary,
	detail,
	aside,
	defaultOpen = false,
	children,
	className,
}: {
	summary: ReactNode
	detail?: ReactNode
	aside?: ReactNode
	defaultOpen?: boolean
	children: ReactNode
	className?: string
}) {
	return (
		<details
			open={defaultOpen}
			className={cn('border-border/70 border-t py-1', className)}
		>
			<summary
				className={cn(
					'-mx-2 flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-2xl px-2 py-3 text-left',
					ROW_PRESS,
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
				<Icon name="chevron-down" size="sm" className={DISCLOSURE_CHEVRON} />
			</summary>
			<div className="space-y-4 pt-1 pb-4">{children}</div>
		</details>
	)
}

/**
 * A repeated unit that opens in place: a luma card whose header row is the
 * collapsible's trigger. Separate from `CollapsibleSection` because the two
 * answer to different halves of §1.6 — a section hides prose and forms and so
 * must *not* be a card; a phase is a repeated interactive unit and so must be.
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
	/** Named states — Nå, Trapper ned — beside the title, never colour alone. */
	badges?: ReactNode
	aside?: ReactNode
	accent?: boolean
	defaultOpen?: boolean
	/** How the opened body stacks — a plain gap by default. */
	contentClassName?: string
	children: ReactNode
}) {
	return (
		<Card
			role="article"
			className="gap-0 py-0 [--card-spacing:--spacing(4)] md:[--card-spacing:--spacing(5)]"
		>
			<Collapsible defaultOpen={defaultOpen}>
				<CollapsibleTrigger
					className={cn(
						'flex min-h-11 w-full flex-wrap items-center gap-3 p-(--card-spacing) text-left',
						ROW_PRESS,
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
						<span className="text-callout flex flex-wrap items-center gap-2 font-semibold [overflow-wrap:anywhere]">
							{summary}
							{badges}
						</span>
						{detail ? (
							<span className="text-footnote text-muted-foreground block tabular-nums">
								{detail}
							</span>
						) : null}
					</span>
					{aside ? (
						// Wraps to its own row on a phone rather than hiding: the aside is
						// where a phase card carries its `PhaseSpark`, the only thing on a
						// closed card that shows the phase's rhythm. `order-last` keeps the
						// chevron on the title row.
						<span className="order-last mt-1 shrink-0 basis-full pl-4 sm:order-none sm:mt-0 sm:basis-auto sm:pl-0">
							{aside}
						</span>
					) : null}
					<Icon name="chevron-down" size="sm" className={COLLAPSIBLE_CHEVRON} />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div
						className={cn(
							'px-(--card-spacing) pt-1 pb-5',
							contentClassName ?? 'space-y-4',
						)}
					>
						{children}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	)
}

/**
 * A phase's weeks as bars, at the size of a word.
 *
 * The point is the *rhythm*: a closed phase card has to show that its loading weeks
 * climb and its recovery week cuts. Heights are relative to the tallest week drawn
 * **inside this phase**, so it is a shape and never a magnitude, and it carries no
 * axis because it is not a chart (ADR 0029's charts are the ones you can read
 * numbers off).
 *
 * A week the plan cannot price draws **nothing** — no bar of any height, only the
 * gap where one would be. A week priced at `0` is the opposite case and does draw:
 * zero is a number an athlete authored, so it gets the shortest visible bar.
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
				// the positions their season gives them.
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
 * The Blokker / Uker control, drawn as the design system's `SegmentedControl`
 * (the muted track, the pressed segment lifted out of it) but made of **links**,
 * not toggles: the reading is URL state, so a reload or a shared link lands on
 * the same reading, the browser's own navigation works before hydration, and a
 * screen reader hears two links with the current one marked `aria-current`
 * rather than toggle buttons that navigate. Each segment takes the toggle's
 * size and its `after:` hit area to 44px (`toggleVariants`).
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
			className="bg-muted inline-flex w-fit items-center rounded-full p-1"
		>
			{options.map((option) => {
				const active = option.key === current
				return (
					<Link
						key={option.key}
						to={hrefFor(option.key)}
						aria-current={active ? 'page' : undefined}
						className={cn(
							toggleVariants({ size: 'default' }),
							'touch-manipulation rounded-full px-5',
							active
								? 'bg-background text-foreground dark:bg-input/50 hover:bg-background shadow-sm'
								: 'text-muted-foreground',
						)}
					>
						{option.label}
					</Link>
				)
			})}
		</nav>
	)
}
