import { cn } from '#app/utils/misc.tsx'
import {
	type ProfileBar,
	type ProfileBarGroup,
	type TrainingZone,
} from '#app/utils/session-profile.ts'
import { NOTATION_SEPARATORS } from '#app/utils/workout-notation.ts'

const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-sky-400 dark:bg-sky-500',
	2: 'bg-emerald-400 dark:bg-emerald-500',
	3: 'bg-amber-400 dark:bg-amber-500',
	4: 'bg-orange-500',
	5: 'bg-rose-500 dark:bg-rose-600',
}

const ZONE_HEIGHT: Record<TrainingZone, string> = {
	1: 'h-2',
	2: 'h-3',
	3: 'h-4',
	4: 'h-5',
	5: 'h-6',
}

/**
 * Render an intensity profile as zone-coloured bars whose widths track each
 * segment's duration. Shared by planned workouts (authored steps) and recordings
 * (HR-derived phases) so both read identically. An empty profile renders a muted
 * "—" rather than an empty strip.
 *
 * `groups` is additive: pass the Workout Shape's repeat-group brackets and a
 * `× N` bracket is drawn over each grouped run of bars (used by the editor,
 * detail view, and ledger from this one component). Omit it — as recordings and
 * every pre-existing caller do — and the bars render exactly as before.
 */
export function ProfileBars({
	bars,
	groups,
	className,
}: {
	bars: ProfileBar[]
	groups?: ProfileBarGroup[]
	className?: string
}) {
	if (bars.length === 0) {
		return <span className="text-muted-foreground/60 text-xs">—</span>
	}
	const hasDuration = bars.some((b) => b.durationSec > 0)
	const barsRow = (
		<span
			aria-hidden
			className={cn(
				'flex h-6 w-full items-end gap-px overflow-hidden',
				className,
			)}
		>
			{bars.map((bar) => (
				<span
					key={bar.id}
					style={
						hasDuration ? { flexGrow: bar.durationSec || 0.001 } : undefined
					}
					className={cn(
						'block min-w-px rounded-[1px]',
						hasDuration ? '' : 'flex-1',
						bar.zone == null
							? 'bg-muted-foreground/30 h-1.5'
							: ZONE_COLOR[bar.zone],
						bar.zone == null ? '' : ZONE_HEIGHT[bar.zone],
					)}
				/>
			))}
		</span>
	)
	if (!groups || groups.length === 0) return barsRow
	return (
		<span className="flex w-full flex-col gap-0.5">
			<RepeatBracketTrack
				bars={bars}
				groups={groups}
				hasDuration={hasDuration}
			/>
			{barsRow}
		</span>
	)
}

/**
 * The bracket rail above the bars: one flex row mirroring the bars' width
 * proportions (each region's flex-grow is the sum of its bars' weights), with
 * a `× N` bracket over each repeat group and empty spacers elsewhere. Purely
 * decorative — the Token Sentence carries the repeat count to screen readers —
 * so the whole rail is `aria-hidden`.
 */
function RepeatBracketTrack({
	bars,
	groups,
	hasDuration,
}: {
	bars: ProfileBar[]
	groups: ProfileBarGroup[]
	hasDuration: boolean
}) {
	const weightOf = (i: number) =>
		hasDuration ? bars[i]!.durationSec || 0.001 : 1
	const rangeWeight = (start: number, end: number) => {
		let sum = 0
		for (let i = start; i < end; i++) sum += weightOf(i)
		return sum
	}
	const sorted = [...groups].sort((a, b) => a.startIndex - b.startIndex)
	const segments: Array<{
		key: string
		grow: number
		repeatCount: number | null
	}> = []
	let cursor = 0
	for (const group of sorted) {
		if (group.startIndex > cursor) {
			segments.push({
				key: `gap-${cursor}`,
				grow: rangeWeight(cursor, group.startIndex),
				repeatCount: null,
			})
		}
		const end = group.startIndex + group.span
		segments.push({
			key: `group-${group.startIndex}`,
			grow: rangeWeight(group.startIndex, end),
			repeatCount: group.repeatCount,
		})
		cursor = end
	}
	if (cursor < bars.length) {
		segments.push({
			key: `gap-${cursor}`,
			grow: rangeWeight(cursor, bars.length),
			repeatCount: null,
		})
	}
	return (
		<span aria-hidden className="flex w-full items-end gap-px">
			{segments.map((segment) =>
				segment.repeatCount == null ? (
					<span key={segment.key} style={{ flexGrow: segment.grow }} />
				) : (
					<span
						key={segment.key}
						data-testid="profile-bracket"
						style={{ flexGrow: segment.grow }}
						className="flex min-w-0 flex-col items-center"
					>
						<span className="text-muted-foreground/80 text-[9px] leading-none font-medium">
							{`${NOTATION_SEPARATORS.repeat} ${segment.repeatCount}`}
						</span>
						<span className="border-muted-foreground/40 h-1 w-full rounded-t-[2px] border-x border-t" />
					</span>
				),
			)}
		</span>
	)
}
