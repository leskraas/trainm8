import { type ReactNode } from 'react'
import { FIRST_RUN_LABELS } from '#app/utils/labels.ts'

/** The first run's five screens, in order (#505 story 61–68). */
export const FIRST_RUN_STEP_COUNT = 5

/**
 * One screen of the first run: which step it is, its heading, and its body —
 * a phone-first column, the way every #505 surface is read.
 */
export function FirstRunFrame({
	step,
	title,
	intro,
	children,
}: {
	step: number
	title: string
	intro?: ReactNode
	children: ReactNode
}) {
	return (
		<main className="mx-auto w-full max-w-md px-4 pt-6 pb-16">
			<p
				className="text-muted-foreground text-[13px] font-medium"
				data-first-run-step={step}
			>
				{FIRST_RUN_LABELS.stepOf(step, FIRST_RUN_STEP_COUNT)}
			</p>
			<h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
			{intro ? (
				<div className="text-muted-foreground mt-2 text-[15px]/[1.5]">
					{intro}
				</div>
			) : null}
			<div className="mt-6 space-y-6">{children}</div>
		</main>
	)
}

/** A primary way forward, full width on a phone. */
export const PRIMARY_ACTION =
	'bg-primary text-primary-foreground hover:bg-primary/85 flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-[15px] font-semibold'

/** A quieter way: back, skip, or the other way out. */
export const SECONDARY_ACTION =
	'border-input hover:bg-accent flex min-h-11 w-full items-center justify-center rounded-xl border px-4 text-[15px] font-medium'
