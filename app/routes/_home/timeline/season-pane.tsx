/**
 * The season beside the list, on a large screen (#505 story 60, ADR 0087,
 * Arket variant Q's left column).
 *
 * A phone reads I dag as one column: the strip on top, the days below. From
 * `lg` up there is room the column does not use, and the athlete who plans
 * their own season wants the season *beside* the days rather than a second
 * app. Three parts, top to bottom:
 *
 * - **The plan card** — which plan, what it counts toward and how far off
 *   (`⚑ Halvmaraton · 13. des`, `om 12 uker`; `Blokk 3 av ∞` for an
 *   open-ended plan, ADR 0079), and the way back to today.
 * - **The season table** — one row per plan week: the ISO week number, the
 *   phase's colour and the week's rhythm, and `mål · gjort` per Training
 *   Track. This week is outlined, the weeks the list shows are tinted, and a
 *   dashed row marks the Planning Horizon. A row jumps the list to its week.
 * - **The compact curve** — the lead track's target as a line, what was done
 *   as bars, today, the horizon, the phases as a colour strip and the race's
 *   flag, on the Chart Primitive (ADR 0029, 0066) as a **static** chart: the
 *   table above it is where a week is read and reached, so the curve does not
 *   ask for a second way in.
 *
 * Everything is read off the season the list renders (`season-table.ts`), so
 * nothing here is fetched and the table, the curve and the week header a row
 * jumps to cannot disagree. The plan page's interactive `SeasonChart` (English,
 * with layers and read-in switches) stays on Sesong; the full spreadsheet
 * season (variant N) is deliberately not this.
 */
import { memo, useMemo, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { ChartFigure, niceLinearTicks } from '#app/components/chart/chart.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	DRIFT_MARK,
	SEASON_PANE_LABELS,
	SEASON_STRIP_LABELS,
	WEEK_FIGURE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type VolumeGrade } from '#app/utils/plan-outline/week-volumes.ts'
import {
	type PhaseTone,
	type TimelineEndCap,
	type TimelineSeason,
	type TimelineTopLine,
} from './presenter.ts'
import {
	buildSeasonCurve,
	buildSeasonTable,
	type SeasonCurve as SeasonCurveModel,
	type SeasonTableColumn,
	type SeasonTableRow,
} from './season-table.ts'

/** Tailwind's `lg`: where the season pane has room beside a readable list. */
const LARGE_SCREEN = '(min-width: 1024px)'
/** Tailwind's `xl`: where the day pane has room as a third column. */
const WIDE_SCREEN = '(min-width: 1280px)'

/**
 * Whether the screen is at least `lg`. False on the server and on the first
 * client render, so hydration matches; the panes then fill only where they
 * are drawn, and a phone never mounts them at all.
 */
export function useLargeScreen(): boolean {
	return useMinWidth(LARGE_SCREEN)
}

/** Whether the screen is at least `xl`: three columns, the day pane beside. */
export function useWideScreen(): boolean {
	return useMinWidth(WIDE_SCREEN)
}

function useMinWidth(query: string): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const list = mediaQuery(query)
			list?.addEventListener('change', onChange)
			return () => list?.removeEventListener('change', onChange)
		},
		() => mediaQuery(query)?.matches ?? false,
		() => false,
	)
}

/** The query, where the environment has one (jsdom does not). */
function mediaQuery(query: string): MediaQueryList | null {
	return typeof window.matchMedia === 'function'
		? window.matchMedia(query)
		: null
}

/** A phase's colour, as a fill and as a background. Literal for Tailwind. */
const PHASE_BG: Record<PhaseTone, string> = {
	base: 'bg-phase-base',
	build: 'bg-phase-build',
	peak: 'bg-phase-peak',
	taper: 'bg-phase-taper',
}
const PHASE_FILL: Record<PhaseTone, string> = {
	base: 'fill-phase-base',
	build: 'fill-phase-build',
	peak: 'fill-phase-peak',
	taper: 'fill-phase-taper',
}
const TRACK_FILL: Record<string, string> = {
	run: 'fill-track-run',
	bike: 'fill-track-bike',
	swim: 'fill-track-swim',
	strength: 'fill-track-strength',
}
const TRACK_BG: Record<string, string> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}
/** The done figure's ink: the verdict's, so the table reads like the header. */
const GRADE_INK: Record<VolumeGrade, string> = {
	under: 'text-status-under',
	on: 'text-status-on',
	over: 'text-status-over',
	'not-yet': '',
	ungraded: '',
}

/**
 * Memoised, and so are its parts: the frame moves on every scroll that crosses
 * a week, and only the table's rows read it. The plan card and the curve read
 * nothing that scrolls, so they never re-render for one (#503's lesson).
 */
export const SeasonPane = memo(function SeasonPane({
	season,
	frame,
	onJump,
	onToday,
}: {
	season: TimelineSeason
	/** The weeks the list is showing, tinted in the table. */
	frame: { from: string; to: string }
	onJump: (key: string) => void
	onToday: () => void
}) {
	const table = useMemo(
		() => buildSeasonTable(season.weeks, season.leadTrackId),
		[season.weeks, season.leadTrackId],
	)
	const curve = useMemo(() => buildSeasonCurve(season), [season])
	const hasPlan =
		season.topLine.goal != null || season.topLine.planLabel != null
	return (
		<div data-season-pane className="flex flex-col gap-4">
			<PlanCard
				line={season.topLine}
				endCap={season.endCap}
				onToday={onToday}
			/>
			{hasPlan || table.rows.length > 0 ? (
				<>
					<SeasonTableView table={table} frame={frame} onJump={onJump} />
					<SeasonCurveView curve={curve} />
				</>
			) : null}
		</div>
	)
})

/**
 * The plan and its goal, after Q's card: the plan's name and where in it
 * today falls, then the goal with its countdown on a quieter tone, and the
 * way back to today. With no plan, it says so and leads to Sesong.
 */
const PlanCard = memo(function PlanCard({
	line,
	endCap,
	onToday,
}: {
	line: TimelineTopLine
	endCap: TimelineEndCap
	onToday: () => void
}) {
	const today = (
		<button
			type="button"
			data-plan-card-today
			onClick={onToday}
			aria-label={SEASON_STRIP_LABELS.todayName}
			className={cn(
				buttonVariants({ variant: 'outline', size: 'sm' }),
				'flex-none rounded-full',
			)}
		>
			{SEASON_STRIP_LABELS.today}
		</button>
	)
	if (!line.goal && !line.planLabel) {
		return (
			<section
				data-plan-card="none"
				aria-label={SEASON_PANE_LABELS.plan}
				className="bg-muted/60 flex items-center gap-3 rounded-3xl p-3"
			>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="text-callout text-foreground font-semibold">
						{SEASON_PANE_LABELS.noPlan}
					</p>
					<p className="text-footnote text-muted-foreground">
						{SEASON_PANE_LABELS.noPlanNote}
					</p>
					<Link
						to="/training/plan"
						className="text-footnote text-primary self-start font-semibold underline-offset-4 hover:underline"
					>
						{SEASON_PANE_LABELS.noPlanAction}
					</Link>
				</div>
				{today}
			</section>
		)
	}
	const raceDate = endCap.plan === 'event' ? endCap.eventDateLabel : null
	return (
		<section
			data-plan-card={endCap.plan}
			aria-label={SEASON_PANE_LABELS.plan}
			className="flex flex-col gap-2"
		>
			{line.planLabel ? (
				<p className="text-footnote text-muted-foreground">
					<span className="text-foreground text-callout font-semibold">
						{line.planLabel.split(' · ')[0]}
					</span>
					{line.planLabel.includes(' · ')
						? ` · ${line.planLabel.split(' · ').slice(1).join(' · ')}`
						: null}
				</p>
			) : null}
			<div className="bg-muted/60 flex items-center gap-3 rounded-3xl py-2.5 pr-2.5 pl-3.5">
				<p className="text-footnote flex min-w-0 flex-1 flex-col">
					{line.goal?.name ? (
						<span className="text-foreground font-semibold [overflow-wrap:anywhere]">
							<span aria-hidden>⚑ </span>
							{line.goal.name}
						</span>
					) : null}
					{line.goal ? (
						<span
							data-plan-card-when
							className={cn(
								'tabular-nums',
								line.goal.name
									? 'text-muted-foreground'
									: 'text-foreground font-semibold',
							)}
						>
							{/* The date and the countdown share a line under the race's
							    name, so a long name never leaves a `·` dangling. */}
							{raceDate ? `${raceDate} · ` : null}
							<span
								className={
									line.goal.name ? 'text-foreground font-semibold' : undefined
								}
							>
								{line.goal.when}
							</span>
						</span>
					) : null}
				</p>
				{today}
			</div>
		</section>
	)
})

const SeasonTableView = memo(function SeasonTableView({
	table,
	frame,
	onJump,
}: {
	table: ReturnType<typeof buildSeasonTable>
	frame: { from: string; to: string }
	onJump: (key: string) => void
}) {
	const { columns, rows } = table
	return (
		<section aria-labelledby="season-table-caption" className="flex flex-col">
			<p
				aria-hidden
				className="text-overline text-muted-foreground flex justify-between uppercase"
			>
				<span>{SEASON_PANE_LABELS.perWeek}</span>
				<span>{SEASON_PANE_LABELS.cellKey}</span>
			</p>
			<table
				data-season-table
				className="text-caption w-full table-fixed border-collapse text-left font-normal tabular-nums"
			>
				<caption id="season-table-caption" className="sr-only">
					{SEASON_PANE_LABELS.table}
				</caption>
				<colgroup>
					<col className="w-8" />
					<col className="w-24" />
					{columns.map((column) => (
						<col
							key={column.id}
							className={column.narrow ? 'w-12' : undefined}
						/>
					))}
				</colgroup>
				<thead>
					<tr className="text-muted-foreground border-border/70 border-b">
						<th scope="col" className="px-1 py-1 align-bottom font-semibold">
							{SEASON_PANE_LABELS.week}
						</th>
						<th scope="col" className="px-1 py-1 align-bottom font-semibold">
							{SEASON_PANE_LABELS.rhythm}
						</th>
						{columns.map((column) => (
							<ColumnHead key={column.id} column={column} />
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<SeasonRow
							key={row.key}
							row={row}
							span={columns.length + 2}
							inView={row.key >= frame.from && row.key <= frame.to}
							onJump={onJump}
						/>
					))}
				</tbody>
			</table>
		</section>
	)
})

function ColumnHead({ column }: { column: SeasonTableColumn }) {
	return (
		<th
			scope="col"
			className="px-1 py-1 text-right align-bottom leading-[14px] font-semibold"
		>
			{/* Name over unit: two tracks side by side in 300px would cut
			    `Styrke økter` to `Styrke ø…` on one line. */}
			<span className="block truncate">{column.name}</span>
			<span className="text-muted-foreground/80 block truncate font-normal">
				{column.unit}
			</span>
		</th>
	)
}

/**
 * One week's row; memoised so a frame move re-renders only the rows it
 * crosses. The whole row takes a pointer's click; the week number is the
 * real button, for a keyboard and a screen reader.
 */
const SeasonRow = memo(function SeasonRow({
	row,
	span,
	inView,
	onJump,
}: {
	row: SeasonTableRow
	span: number
	inView: boolean
	onJump: (key: string) => void
}) {
	return (
		<>
			{row.opensHorizon ? (
				<tr data-season-horizon aria-hidden>
					<td
						colSpan={span}
						className="border-foreground/30 text-muted-foreground border-t-[1.5px] border-dashed pt-0.5 pb-1 text-center text-[10.5px]/[14px] italic"
					>
						{SEASON_PANE_LABELS.horizon}
					</td>
				</tr>
			) : null}
			<tr
				data-season-row={row.key}
				data-in-view={inView || undefined}
				aria-current={row.isNow ? 'date' : undefined}
				onClick={() => onJump(row.key)}
				className={cn(
					'border-border/60 h-7 cursor-pointer border-b',
					'hover:bg-muted',
					row.easy && 'bg-muted/50',
					inView && 'bg-primary/10 hover:bg-primary/15',
					row.isNow &&
						'text-primary outline-primary font-semibold outline-[1.5px] -outline-offset-[1.5px]',
				)}
			>
				<th scope="row" className="px-1 font-semibold">
					<button
						type="button"
						onClick={(event) => {
							// The row's own click jumps; one jump per press.
							event.stopPropagation()
							onJump(row.key)
						}}
						aria-label={SEASON_PANE_LABELS.jumpTo(row.name)}
						className="pressable focus-visible:outline-ring w-full rounded-sm text-left tabular-nums focus-visible:outline-2"
					>
						{row.weekNumber}
					</button>
				</th>
				<td className="truncate px-1">
					<span
						aria-hidden
						className={cn(
							'mr-1.5 inline-block h-3 w-1.5 rounded-[2px] align-[-1px]',
							row.phaseTone
								? PHASE_BG[row.phaseTone]
								: row.phaseName
									? 'bg-muted-foreground/40'
									: 'bg-transparent',
						)}
					/>
					{row.phaseName ? (
						<span className="sr-only">{`${row.phaseName}, `}</span>
					) : null}
					<span className={row.isNow ? undefined : 'text-muted-foreground'}>
						{row.roleLabel ?? ''}
					</span>
				</td>
				{row.cells.map((cell, index) => (
					<td
						key={index}
						aria-label={cell.name}
						className="truncate px-1 text-right whitespace-nowrap"
					>
						<span aria-hidden>
							<span className={row.isNow ? undefined : 'text-foreground'}>
								{cell.target ?? '–'}
							</span>
							{/* Thin spaces: `71,6 · 6,5≠` has to fit a 70px column. */}
							<span className="text-muted-foreground/70">
								{'\u2009·\u2009'}
							</span>
							{cell.done != null ? (
								<span className={cn(cell.grade && GRADE_INK[cell.grade])}>
									{cell.done}
								</span>
							) : (
								<span className="text-muted-foreground/70">–</span>
							)}
							{cell.drift ? (
								<span className="text-status-under ml-0.5 font-bold">
									{DRIFT_MARK}
								</span>
							) : null}
						</span>
					</td>
				))}
			</tr>
		</>
	)
})

const CURVE_WIDTH = 300
const CURVE_HEIGHT = 92

/**
 * The compact curve, after Q: the lead track's Week Target as a line, done as
 * bars, today a green rule, the Planning Horizon dashed, the phases as a strip
 * under the bars and the race's flag over its week. A static chart on the
 * primitive — every value it draws is in its data table.
 */
const SeasonCurveView = memo(function SeasonCurveView({
	curve,
}: {
	curve: SeasonCurveModel
}) {
	const { points } = curve
	if (points.length === 0) return null
	const ticks = niceLinearTicks(curve.max * 1.1)
	const yMax = ticks[ticks.length - 1] ?? 1
	const discipline = curve.discipline
	return (
		<section data-season-curve className="flex flex-col gap-1.5">
			<ChartFigure
				ariaLabel={SEASON_PANE_LABELS.curveName(curve.trackName, curve.unit)}
				count={points.length}
				yMax={yMax}
				width={CURVE_WIDTH}
				height={CURVE_HEIGHT}
				padding={{ top: 14, right: 2, bottom: 18, left: 2 }}
				plotHeightClass="h-[92px]"
				gridlines={false}
				renderMarks={(geom) => {
					const x = (at: number) => geom.padding.left + geom.slotW * at
					const targets = points
						.map((point, i) =>
							point.target == null
								? null
								: `${geom.slotCenter(i)},${geom.scaleY(point.target)}`,
						)
						.filter((p): p is string => p != null)
					return (
						<>
							{points.map((point, i) => (
								<rect
									key={`phase-${point.key}`}
									x={geom.slotLeft(i)}
									y={geom.baselineY + 2}
									width={Math.max(0, geom.slotW - 0.5)}
									height={3}
									className={
										point.phaseTone
											? PHASE_FILL[point.phaseTone]
											: point.inPhase
												? 'fill-muted-foreground/40'
												: 'fill-transparent'
									}
								/>
							))}
							{points.map((point, i) =>
								point.done != null && point.done > 0 ? (
									<rect
										key={`done-${point.key}`}
										data-curve-done={point.key}
										x={geom.slotCenter(i) - geom.slotW * 0.3}
										y={geom.scaleY(point.done)}
										width={geom.slotW * 0.6}
										height={geom.baselineY - geom.scaleY(point.done)}
										rx={1}
										className={
											(discipline && TRACK_FILL[discipline]) ??
											'fill-muted-foreground/60'
										}
									/>
								) : null,
							)}
							{targets.length > 1 ? (
								<polyline
									data-curve-target
									points={targets.join(' ')}
									fill="none"
									stroke="currentColor"
									strokeWidth={1.5}
									strokeLinejoin="round"
									vectorEffect="non-scaling-stroke"
									className="text-foreground"
								/>
							) : null}
							{curve.horizonAt != null ? (
								<line
									data-curve-horizon
									x1={x(curve.horizonAt)}
									x2={x(curve.horizonAt)}
									y1={geom.padding.top - 6}
									y2={geom.baselineY}
									stroke="currentColor"
									strokeWidth={1}
									strokeDasharray="3 2"
									vectorEffect="non-scaling-stroke"
									className="text-foreground/40"
								/>
							) : null}
							{curve.todayAt != null ? (
								<line
									data-curve-today
									x1={x(curve.todayAt)}
									x2={x(curve.todayAt)}
									y1={geom.padding.top - 6}
									y2={geom.baselineY}
									stroke="currentColor"
									strokeWidth={1.5}
									vectorEffect="non-scaling-stroke"
									className="text-primary"
								/>
							) : null}
						</>
					)
				}}
				renderOverlay={(geom) => (
					<>
						{curve.horizonAt != null ? (
							<span
								className="text-muted-foreground absolute top-0 pl-1 text-[10px]/[12px]"
								style={{
									left: geom.leftPct(
										geom.padding.left + geom.slotW * curve.horizonAt,
									),
								}}
							>
								{SEASON_PANE_LABELS.legendHorizon}
							</span>
						) : null}
						{curve.eventAt != null ? (
							<span
								className="text-foreground absolute top-0 -translate-x-1/2 text-[11px]/[12px]"
								style={{ left: geom.leftPct(geom.slotCenter(curve.eventAt)) }}
							>
								⚑
							</span>
						) : null}
						{points.map((point, i) =>
							i % 4 === 0 || point.isNow ? (
								<span
									key={point.key}
									className={cn(
										'absolute bottom-0 -translate-x-1/2 text-[10px]/[12px] tabular-nums',
										point.isNow
											? 'text-primary font-semibold'
											: 'text-muted-foreground',
									)}
									style={{ left: geom.leftPct(geom.slotCenter(i)) }}
								>
									{point.weekNumber}
								</span>
							) : null,
						)}
					</>
				)}
				dataTable={{
					caption: SEASON_PANE_LABELS.curveCaption(curve.trackName),
					columns: [
						SEASON_PANE_LABELS.week,
						`${WEEK_FIGURE_LABELS.target} (${curve.unit})`,
						`${WEEK_FIGURE_LABELS.done} (${curve.unit})`,
					],
					rows: points.map((point) => [
						String(point.weekNumber),
						point.target == null ? '–' : curve.figure(point.target),
						point.done == null ? '–' : curve.figure(point.done),
					]),
				}}
			/>
			<p
				aria-hidden
				className="text-muted-foreground text-[11px]/[16px] [text-wrap:pretty]"
			>
				<span className="text-foreground">—</span>{' '}
				{SEASON_PANE_LABELS.legendTarget(curve.trackName, curve.unit)} ·{' '}
				<span
					className={cn(
						'inline-block h-2.5 w-1.5 rounded-[1px] align-[-1px]',
						(discipline && TRACK_BG[discipline]) ?? 'bg-muted-foreground/60',
					)}
				/>{' '}
				{SEASON_PANE_LABELS.legendDone} ·{' '}
				<span className="text-primary font-semibold">|</span>{' '}
				{SEASON_PANE_LABELS.legendToday} · ┆ {SEASON_PANE_LABELS.legendHorizon}{' '}
				· {SEASON_PANE_LABELS.legendPhase} · {SEASON_PANE_LABELS.legendDrift}
			</p>
		</section>
	)
})
