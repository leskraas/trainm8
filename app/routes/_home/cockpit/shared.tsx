// Shared vocabulary for the Cockpit zones: the discipline dot, the zone-profile
// bar, the card shell, the adherence-band palette, and a couple of formatters.
// Kept in one place so every zone reads the same colours and shapes.
import { type ReactNode } from 'react'
import { paletteFor } from '#app/utils/dashboard.ts'
import { type AdherenceBand } from '#app/utils/load/adherence.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type ProfileBar,
	type TrainingZone,
} from '#app/utils/session-profile.ts'

// The headline Intensity Target string helper lives with the formatter so the
// Cockpit zones and the session detail render it the same way.
export { targetText } from '#app/utils/intensity-target.ts'

// Number rendering lives in the shared formatting layer (#172); dates come to
// the zones pre-formatted by the presenter (locale-fixed, Athlete Timezone).
export { formatSigned as signed } from '#app/utils/format.ts'

// Training-zone palette, shared with the Session Ledger profile bars: 1 (easy)
// → 5 (max). The taller the bar the harder the zone; a step the model can't
// truthfully map to a zone (null) renders muted rather than guessing a colour.
const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-sky-400',
	2: 'bg-emerald-400',
	3: 'bg-amber-400',
	4: 'bg-orange-500',
	5: 'bg-rose-500',
}
const ZONE_H: Record<TrainingZone, string> = {
	1: 'h-3',
	2: 'h-5',
	3: 'h-7',
	4: 'h-9',
	5: 'h-11',
}
const ZONE_H_MINI: Record<TrainingZone, string> = {
	1: 'h-1.5',
	2: 'h-2.5',
	3: 'h-3.5',
	4: 'h-4',
	5: 'h-5',
}

/** The workout's intensity shape: one bar per step, weighted by Step Duration. */
export function SessionStructure({
	bars,
	scale = 'full',
}: {
	bars: ProfileBar[]
	scale?: 'full' | 'mini'
}) {
	if (bars.length === 0) return null
	const heights = scale === 'mini' ? ZONE_H_MINI : ZONE_H
	return (
		<div
			className={cn(
				'flex w-full items-end gap-px overflow-hidden rounded',
				scale === 'mini' ? 'h-5' : 'h-11',
			)}
		>
			{bars.map((b) => (
				<div
					key={b.id}
					style={{ flexGrow: Math.max(b.durationSec, 1) }}
					className={cn(
						'min-w-px rounded-[1px]',
						b.zone
							? cn(ZONE_COLOR[b.zone], heights[b.zone])
							: cn('bg-muted-foreground/30', scale === 'mini' ? 'h-2' : 'h-4'),
					)}
					title={b.zone ? `Zone ${b.zone}` : 'Unzoned'}
				/>
			))}
		</div>
	)
}

export function DiscDot({
	discipline,
	className,
}: {
	discipline: string
	className?: string
}) {
	return (
		<span
			className={cn(
				'inline-block size-2 rounded-full',
				paletteFor(discipline).chip,
				className,
			)}
		/>
	)
}

// Plan Adherence band palette, matching the Session Ledger: under reads as a
// cool caution, on-target green, over the strongest warning.
export const BAND: Record<
	AdherenceBand['tone'],
	{ dot: string; ink: string; wash: string }
> = {
	under: {
		dot: 'bg-sky-400',
		ink: 'text-sky-600 dark:text-sky-400',
		wash: 'bg-sky-500/10',
	},
	'on-target': {
		dot: 'bg-emerald-500',
		ink: 'text-emerald-600 dark:text-emerald-400',
		wash: 'bg-emerald-500/10',
	},
	over: {
		dot: 'bg-rose-500',
		ink: 'text-rose-600 dark:text-rose-400',
		wash: 'bg-rose-500/10',
	},
}

/** A titled card shell — the repeating container for each analyse/history zone. */
export function Tile({
	children,
	className,
	title,
	action,
	labelledBy,
}: {
	children: ReactNode
	className?: string
	title?: string
	action?: ReactNode
	labelledBy?: string
}) {
	return (
		<section
			aria-labelledby={labelledBy}
			className={cn(
				'bg-card border-border/60 rounded-2xl border p-5',
				className,
			)}
		>
			{title ? (
				<div className="mb-4 flex items-baseline justify-between gap-2">
					<h2
						id={labelledBy}
						className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
					>
						{title}
					</h2>
					{action}
				</div>
			) : null}
			{children}
		</section>
	)
}
