/**
 * The season beside the list, on a large screen (#505 story 60).
 *
 * A phone reads I dag as one column: the strip on top, the days below. A wide
 * screen has room the column does not use, and the athlete who plans their own
 * season wants the season *beside* the days rather than a second app — so from
 * `lg` up the curve and a table of every week sit to the right of the list.
 *
 * Both are readings that already exist, reused rather than rebuilt: the curve
 * is the plan page's **season chart** on the Chart Primitive (`SeasonChart`,
 * ADR 0029 / 0066), fed by its own resource route so a phone never pays for
 * it; the table is the same week model the list's headers read, so a row and
 * the header it jumps to cannot disagree. The full spreadsheet season (variant
 * N) is deliberately not this — it waits until the owner misses it.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { useFetcher } from 'react-router'
import {
	DRIFT_MARK,
	SEASON_PANE_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type loader as homeSeasonLoader } from '../../resources/home-season.tsx'
import { SeasonChart } from '../../training/__season-chart.tsx'
import { type TimelineWeek } from './presenter.ts'

/** Tailwind's `lg`: where the pane has room beside a readable column. */
const LARGE_SCREEN = '(min-width: 1024px)'

/**
 * Whether the screen is wide enough for the pane. False on the server and on
 * the first client render, so hydration matches; the pane then mounts only
 * where it is drawn, and a phone never mounts — or fetches — it at all.
 */
export function useLargeScreen(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const query = mediaQuery()
			query?.addEventListener('change', onChange)
			return () => query?.removeEventListener('change', onChange)
		},
		() => mediaQuery()?.matches ?? false,
		() => false,
	)
}

/** The query, where the environment has one (jsdom does not). */
function mediaQuery(): MediaQueryList | null {
	return typeof window.matchMedia === 'function'
		? window.matchMedia(LARGE_SCREEN)
		: null
}

export function SeasonPane({
	weeks,
	frame,
	onJump,
}: {
	weeks: TimelineWeek[]
	/** The weeks the list is showing, highlighted in the table. */
	frame: { from: string; to: string }
	onJump: (key: string) => void
}) {
	const fetcher = useFetcher<typeof homeSeasonLoader>()
	const { load, state, data } = fetcher
	useEffect(() => {
		if (state === 'idle' && !data) void load('/resources/home-season')
	}, [load, state, data])

	// The season the table reads is the plan's: history from before it has no
	// target to stand beside, and the list already folds it above today.
	const rows = weeks.filter((week) => !week.imported)
	const lead =
		weeks[0]?.tracks.find((t) => t.currency !== 'sets') ??
		weeks[0]?.tracks[0] ??
		null

	return (
		<aside
			data-season-pane
			aria-labelledby="season-pane-heading"
			className="border-hairline-edge flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-l px-8 py-6"
		>
			<h2
				id="season-pane-heading"
				className="text-foreground text-[15px]/[1.2] font-semibold tracking-[-0.015em]"
			>
				{SEASON_PANE_LABELS.heading}
			</h2>
			{data?.season ? (
				<SeasonChart
					season={data.season}
					contexts={data.conversionContexts}
					fitnessAnchor={data.fitnessAnchor}
				/>
			) : data && !data.season ? (
				<p className="text-muted-foreground text-[13px]/[1.5]">
					{SEASON_PANE_LABELS.noPlan}
				</p>
			) : null}
			<table className="w-full border-collapse text-left text-[12.5px]/[1.3] tabular-nums">
				<thead>
					<tr className="text-ink-dimmer border-hairline-edge border-b text-[11px] uppercase">
						<th scope="col" className="py-2 pr-3 font-semibold">
							{SEASON_PANE_LABELS.week}
						</th>
						<th scope="col" className="py-2 pr-3 font-semibold">
							{SEASON_PANE_LABELS.phase}
						</th>
						{lead ? (
							<>
								<th scope="col" className="py-2 pr-3 text-right font-semibold">
									{WEEK_FIGURE_LABELS.target}
								</th>
								<th scope="col" className="py-2 pr-3 text-right font-semibold">
									{WEEK_FIGURE_LABELS.planned}
								</th>
								<th scope="col" className="py-2 pr-3 text-right font-semibold">
									{`${WEEK_FIGURE_LABELS.done} (${lead.unit})`}
								</th>
								<th scope="col" className="py-2 font-semibold">
									<span className="sr-only">{SEASON_PANE_LABELS.grade}</span>
								</th>
							</>
						) : (
							<th scope="col" className="py-2 font-semibold">
								<span className="sr-only">{SEASON_PANE_LABELS.load}</span>
							</th>
						)}
					</tr>
				</thead>
				<tbody>
					{rows.map((week) => {
						const track = lead
							? week.tracks.find((t) => t.trackId === lead.trackId)
							: undefined
						const inView = week.key >= frame.from && week.key <= frame.to
						return (
							<tr
								key={week.key}
								data-season-row={week.key}
								className={cn(
									'border-hairline border-b',
									inView && 'bg-primary/7',
									week.isNow && 'text-primary font-semibold',
								)}
							>
								<td className="py-1.5 pr-3">
									<button
										type="button"
										onClick={() => onJump(week.key)}
										aria-label={SEASON_PANE_LABELS.jumpTo(
											`${week.relativeName}, ${week.rangeLabel}`,
										)}
										className="hover:text-primary text-left underline-offset-2 hover:underline"
									>
										{week.relativeName}
									</button>
								</td>
								<td className="text-ink-dim py-1.5 pr-3">
									{[week.phaseName, week.roleLabel].filter(Boolean).join(' · ')}
								</td>
								{lead ? (
									<>
										<td className="py-1.5 pr-3 text-right">
											{track?.figures.target ?? '–'}
										</td>
										<td className="py-1.5 pr-3 text-right">
											{track?.figures.planned ?? '–'}
											{track?.driftLabel ? (
												<span
													role="img"
													aria-label={track.driftLabel}
													className="text-warning ml-1"
												>
													{DRIFT_MARK}
												</span>
											) : null}
										</td>
										<td className="py-1.5 pr-3 text-right">
											{track?.figures.done ?? '–'}
										</td>
										<td className="text-ink-dim py-1.5">
											{track?.gradeLabel ?? ''}
										</td>
									</>
								) : (
									<td className="text-ink-dim py-1.5">{week.loadLine}</td>
								)}
							</tr>
						)
					})}
				</tbody>
			</table>
		</aside>
	)
}
