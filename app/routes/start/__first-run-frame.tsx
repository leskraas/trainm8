import { type ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { FIRST_RUN_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

/** The first run's five screens, in order (#505 story 61–68). */
export const FIRST_RUN_STEP_COUNT = 5

/**
 * The simple start's screens so far: the level, the activities (#563), then
 * the **Start Options** (#566).
 */
export const SIMPLE_START_STEP_COUNT = 3

/**
 * One screen of the first run: which step it is, its heading, and its body —
 * a phone-first column, the way every #505 surface is read.
 *
 * On the design system (round 2, ADR 0085): the heading is the `title` step,
 * the intro `body`, the step count a footnote beside five segments that fill
 * as the athlete goes (static: progress never animates, design-system D6), and
 * steps 2–5 carry the 44px back arrow every non-top-level screen has (Arket
 * J; `PageHeader`'s own control), so "back" is never a link at the bottom.
 */
export function FirstRunFrame({
	step,
	stepCount = FIRST_RUN_STEP_COUNT,
	title,
	intro,
	back,
	children,
}: {
	step: number
	/** How many screens the flow has; the old first run's five by default. */
	stepCount?: number
	title: string
	intro?: ReactNode
	/** The step before, by URL, and what the arrow is read out as. */
	back?: { to: string; label: string }
	children: ReactNode
}) {
	return (
		<main className="mx-auto w-full max-w-md px-4 pt-4 pb-16">
			<div className="flex min-h-11 items-center gap-3">
				{back ? (
					<Link
						to={back.to}
						aria-label={back.label}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'icon' }),
							'-ml-2 shrink-0',
						)}
					>
						<Icon name="arrow-left" size="md" />
					</Link>
				) : null}
				<p
					className="text-footnote text-muted-foreground shrink-0 tabular-nums"
					data-first-run-step={step}
				>
					{FIRST_RUN_LABELS.stepOf(step, stepCount)}
				</p>
				<div aria-hidden className="flex flex-1 gap-1">
					{Array.from({ length: stepCount }, (_, index) => (
						<span
							key={index}
							className={cn(
								'h-1 flex-1 rounded-full',
								index < step ? 'bg-primary' : 'bg-muted',
							)}
						/>
					))}
				</div>
			</div>
			<h1 className="text-title mt-3 text-balance">{title}</h1>
			{intro ? (
				<div className="text-body text-muted-foreground mt-2">{intro}</div>
			) : null}
			<div className="mt-6 space-y-6">{children}</div>
		</main>
	)
}

/**
 * The step's way forward, as a link: the system's primary button, full width
 * on a phone (it was a hand-made `rounded-xl` copy beside the real pill).
 */
export const PRIMARY_ACTION = cn(buttonVariants(), 'text-callout w-full')

/** A quieter way: skip, or the other way out. */
export const SECONDARY_ACTION = cn(
	buttonVariants({ variant: 'outline' }),
	'text-callout h-auto min-h-11 w-full py-2 text-balance whitespace-normal',
)

/**
 * A disclosure's row ("Noe er feil", "Bytt filosofi"): the whole card-width
 * row is the 44px+ target, with an instant tint on press — the row is a
 * surface, not a button to scale — and the chevron turns as the panel opens.
 */
export const DISCLOSURE_TRIGGER =
	'text-callout flex min-h-12 w-full items-center justify-between gap-3 rounded-4xl px-4 py-3 text-left font-medium active:bg-muted/60 hover:bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/30'

/**
 * The chevron of a {@link DISCLOSURE_TRIGGER}: a half turn on the panel's
 * curve (`duration-collapse`, ease-out), so it arrives with the panel. Reduced
 * motion turns it at once.
 */
export const DISCLOSURE_CHEVRON =
	'text-muted-foreground shrink-0 transition-transform duration-collapse ease-out in-data-[panel-open]:rotate-180 motion-reduce:transition-none'
