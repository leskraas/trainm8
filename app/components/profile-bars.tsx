import { type CSSProperties } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	type ProfileBar,
	type ProfileBarGroup,
	type TrainingZone,
} from '#app/utils/session-profile.ts'
import { NOTATION_SEPARATORS } from '#app/utils/workout-notation.ts'

/**
 * The zone hues are the app's `zone-1…5` tokens (#505 round 2), the same five
 * the Workout Shape strip and the sentence's intensity chip paint with. The
 * bars had their own Tailwind palette ramp (sky → rose), so a planned zone 2
 * was one green in the strip and another here, on the same card.
 */
const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-zone-1',
	2: 'bg-zone-2',
	3: 'bg-zone-3',
	4: 'bg-zone-4',
	5: 'bg-zone-5',
}

const ZONE_HEIGHT: Record<TrainingZone, string> = {
	1: 'h-2',
	2: 'h-3',
	3: 'h-4',
	4: 'h-5',
	5: 'h-6',
}

/**
 * The same profile at row scale: a 14px band, for a list where the shape is a
 * glance rather than a reading. The proportions are the full scale's, halved —
 * a zone-5 bar is still the tallest thing in the band, so a hard session and an
 * easy one are told apart at either size.
 */
const ZONE_HEIGHT_ROW: Record<TrainingZone, string> = {
	1: 'h-1',
	2: 'h-1.5',
	3: 'h-2.5',
	4: 'h-3',
	5: 'h-3.5',
}

/** How tall the band is, and how tall the bars in it may be. */
export type ProfileBarsScale = 'full' | 'row'

/**
 * The most bars drawn: every bar has a 1px floor and a 1px gap after it, so n
 * bars need 2n - 1 pixels, and the narrowest box the profile draws in is the
 * 140px session detail. Past 70 a bar's floor went under a pixel there and
 * the shape smeared to a haze.
 */
export const MAX_PROFILE_BARS = 70

/** A bar's weight in the row: its time, or a sliver for a timeless one. */
function weightOf(bar: ProfileBar, hasDuration: boolean) {
	return hasDuration ? bar.durationSec || 0.001 : 1
}

/**
 * Where each drawn bar starts, as an index into the `n` bars, when every one
 * of `segments` (the stretches between bracket edges) must be cut into `max`
 * slices in all: each its share of the slots by length, at least one, so a
 * slice never straddles a bracket's edge.
 */
function sliceStarts(
	segments: Array<[number, number]>,
	n: number,
	max: number,
) {
	if (segments.length > max) {
		return Array.from({ length: max }, (_, k) => Math.floor((k * n) / max))
	}
	const quotas = segments.map(([start, end]) =>
		Math.max(1, Math.floor(((end - start) * max) / n)),
	)
	// The floor of one can overshoot by a slot or two: the longest give it back.
	for (let over = quotas.reduce((a, b) => a + b, 0) - max; over > 0; over--) {
		const most = quotas.indexOf(Math.max(...quotas))
		quotas[most]!--
	}
	return segments.flatMap(([start, end], s) =>
		Array.from(
			{ length: quotas[s]! },
			(_, k) => start + Math.floor((k * (end - start)) / quotas[s]!),
		),
	)
}

/**
 * The bars a profile is drawn with, at most `max`. A profile that fits is drawn
 * as it is. Past that, a run of one zone is one bar (a steady block drawn rep
 * by rep reads the same as one block); still past it, the bars are cut into
 * `max` slices, each painted by the zone it spends the most time in. Neither
 * crosses a `× N` bracket's edge, so a bracket spans exactly its reps' bars,
 * and every drawn bar carries the time it stands for, so width stays time.
 */
function fitBars(
	bars: ProfileBar[],
	groups: ProfileBarGroup[] | undefined,
	max: number,
): { bars: ProfileBar[]; groups: ProfileBarGroup[] | undefined } {
	if (bars.length <= max) return { bars, groups }
	const hasDuration = bars.some((b) => b.durationSec > 0)
	const edges = new Set([0, bars.length])
	for (const group of groups ?? []) {
		edges.add(Math.min(group.startIndex, bars.length))
		edges.add(Math.min(group.startIndex + group.span, bars.length))
	}
	// Where each drawn bar starts, as an index into `bars`.
	let starts = bars.flatMap((bar, i) =>
		edges.has(i) || bar.zone !== bars[i - 1]!.zone ? [i] : [],
	)
	if (starts.length > max) {
		const sorted = [...edges].sort((a, b) => a - b)
		const segments = sorted
			.slice(1)
			.map((end, s): [number, number] => [sorted[s]!, end])
		starts = sliceStarts(segments, bars.length, max)
	}
	const drawnIndexOf: number[] = []
	const drawn = starts.map((start, k) => {
		const slice = bars.slice(start, starts[k + 1] ?? bars.length)
		for (let i = 0; i < slice.length; i++) drawnIndexOf.push(k)
		const timeIn = new Map<ProfileBar['zone'], number>()
		for (const bar of slice) {
			const time = (timeIn.get(bar.zone) ?? 0) + weightOf(bar, hasDuration)
			timeIn.set(bar.zone, time)
		}
		let zone = slice[0]!.zone
		for (const [z, time] of timeIn) if (time > timeIn.get(zone)!) zone = z
		return {
			id: slice[0]!.id,
			zone,
			durationSec: slice.reduce((sum, bar) => sum + bar.durationSec, 0),
		}
	})
	let cursor = 0
	const fittedGroups = groups
		?.slice()
		.sort((a, b) => a.startIndex - b.startIndex)
		.flatMap((group) => {
			const first = drawnIndexOf[group.startIndex]
			const last = drawnIndexOf[group.startIndex + group.span - 1]
			if (first == null || last == null) return []
			// Two brackets never share a bar: the earlier keeps it.
			const startIndex = Math.max(first, cursor)
			const span = last + 1 - startIndex
			if (span <= 0) return []
			cursor = startIndex + span
			return [{ ...group, startIndex, span }]
		})
	return { bars: drawn, groups: fittedGroups }
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
	bars: givenBars,
	groups: givenGroups,
	className,
	scale = 'full',
}: {
	bars: ProfileBar[]
	groups?: ProfileBarGroup[]
	/** On the box the bars draw in, the box their floor is measured off. */
	className?: string
	scale?: ProfileBarsScale
}) {
	if (givenBars.length === 0) {
		return <span className="text-muted-foreground text-xs">—</span>
	}
	const { bars, groups } = fitBars(givenBars, givenGroups, MAX_PROFILE_BARS)
	const hasDuration = bars.some((b) => b.durationSec > 0)
	const heights = scale === 'row' ? ZONE_HEIGHT_ROW : ZONE_HEIGHT
	// The box is its own container, so `100cqw` in the floor is the width the
	// bars actually share: a caller's width or height lands on it, never on a
	// row inside a wider wrapper.
	const barsRow = (
		<span
			aria-hidden
			className={cn(
				'@container block w-full',
				scale === 'row' ? 'h-3.5' : 'h-6',
				className,
			)}
		>
			<span className="flex h-full w-full items-end gap-(--profile-bar-px) overflow-hidden">
				{bars.map((bar) => (
					<span
						key={bar.id}
						data-profile-bar
						style={
							hasDuration ? { flexGrow: bar.durationSec || 0.001 } : undefined
						}
						className={cn(
							'block min-w-(--profile-bar-px) rounded-[1px]',
							hasDuration ? '' : 'flex-1',
							bar.zone == null
								? cn(
										'bg-muted-foreground/30',
										scale === 'row' ? 'h-0.5' : 'h-1.5',
									)
								: ZONE_COLOR[bar.zone],
							bar.zone == null ? '' : heights[bar.zone],
						)}
					/>
				))}
			</span>
		</span>
	)
	// Every bar has a floor and a gap after it, 1px each, so n bars need 2n - 1
	// pixels. Past half the width (122 bars in a 140px timeline row) the end of
	// the session was clipped, cool-down first. The floor is the smaller of 1px
	// and the width over 2n - 1, read where it is used off the nearest
	// container (the bars' own box; for the bracket rail, this wrapper), so the
	// whole session always fits and anything that already fit draws as before.
	// The cap keeps it a whole pixel down to the narrowest box.
	const fit = {
		'--profile-bar-px': `min(1px, 100cqw / ${2 * bars.length - 1})`,
	} as CSSProperties
	if (!groups || groups.length === 0) {
		return (
			<span data-profile-fit style={fit} className="block w-full">
				{barsRow}
			</span>
		)
	}
	return (
		<span
			data-profile-fit
			style={fit}
			className="@container flex w-full flex-col gap-0.5"
		>
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
	const rangeWeight = (start: number, end: number) => {
		let sum = 0
		for (let i = start; i < end; i++) sum += weightOf(bars[i]!, hasDuration)
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
		<span aria-hidden className="flex w-full items-end gap-(--profile-bar-px)">
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
						<span className="text-muted-foreground text-[9px] leading-none font-medium tabular-nums">
							{`${NOTATION_SEPARATORS.repeat} ${segment.repeatCount}`}
						</span>
						<span className="border-muted-foreground/40 h-1 w-full rounded-t-[2px] border-x border-t" />
					</span>
				),
			)}
		</span>
	)
}
