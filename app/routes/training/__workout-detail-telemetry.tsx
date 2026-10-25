/**
 * **The recording over time** — the Workout Detail View's telemetry card: the
 * Recording's real per-sample stream plotted against the plan's targets
 * (PRD #135, ADR 0019/0020, ADR 0029/0030 for the chart and its scrub).
 *
 * Its own module, loaded only when the card is about to be seen (#505 round
 * 2). Measured on a completed ride at 4× CPU (390×844, production build), this
 * card was 311 of the page's 597 elements — 248 of them its hidden data table
 * (ADR 0030) — and it sat below the fold at ~1 540 px. Every one of them was
 * hydrated, style-recalculated and laid out on load, inside the page's longest
 * task, before anybody scrolled to it. Now the route ships it as a separate
 * chunk, mounts it when it nears the viewport, and the page loads with half the
 * DOM (`sessions.$sessionId.tsx`, `DeferredTelemetry`).
 *
 * Within the card the scrub is the hot path — a `pointermove` per frame. The
 * static marks (the gapped polylines over up to ~1 000 samples, the target
 * bands, the pauses) are built once per stream; a move re-renders only the
 * crosshair, the dots and the readout.
 */
import { memo, useMemo } from 'react'
import {
	ChartFigure,
	useChartInspect,
	type ChartDataTableModel,
	type ChartGeom,
} from '#app/components/chart/chart.tsx'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { type ActivityStream, isNum } from '#app/utils/activity-stream.ts'
import { formatClockDuration, formatPace } from '#app/utils/format.ts'
import {
	resolveStepBand,
	resolveStepRange,
	type BandChannel,
	type DisciplineThresholdMap,
	type StepBand,
} from '#app/utils/intensity-target.ts'
import { nbDurationLabel, WORKOUT_DETAIL_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { deriveSessionProfile } from '#app/utils/session-profile.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import { workoutReps } from '#app/utils/workout-reps.ts'

const L = WORKOUT_DETAIL_LABELS.telemetry

type WorkoutDetail = NonNullable<SessionDetail['workout']>

/** A planned target on the band channel; `max` is null when it is open above. */
type PlannedTarget = StepBand

/** A planned step laid out as a fraction of the workout's planned duration,
 * carrying its resolved Intensity Target on the chosen channel (when any). */
type PlannedSegment = {
	id: string
	startFrac: number
	endFrac: number
	target: PlannedTarget | null
}

const sameTarget = (a: PlannedTarget | null, b: PlannedTarget | null) =>
	a === b || (a != null && b != null && a.min === b.min && a.max === b.max)

/**
 * Lay the workout's planned steps out as fractions of its total planned
 * duration. This is the *plan's* shape, stretched across the chart's width — it
 * is deliberately not aligned sample-by-sample to the recording (that fragile
 * telemetry-to-step alignment is out of scope per PRD #135), so we never assert a
 * per-step verdict; the athlete eyeballs the comparison.
 *
 * Walks the steps `workoutReps` draws, the ones the Workout Shape draws: every
 * rep while that fits, a dense block thinned to the reps that do, so its work
 * and its recoveries keep their own targets. Each step resolves once, and
 * neighbours with the same target merge.
 */
function buildPlannedSegments(
	workout: WorkoutDetail | null,
	thresholds: DisciplineThresholdMap,
	channel: BandChannel | null,
): PlannedSegment[] {
	if (!workout) return []
	const { steps } = workoutReps(workout)
	const total = steps.reduce((sum, s) => sum + s.durationSec, 0)
	if (total <= 0) return []
	// Resolved now, never off the cached range columns, which fill only on a
	// threshold change and so are empty on most new sessions (#616).
	const targets = new Map<
		(typeof steps)[number]['step'],
		PlannedTarget | null
	>()
	const targetOf = (step: (typeof steps)[number]['step']) => {
		if (!targets.has(step)) {
			targets.set(
				step,
				channel
					? resolveStepBand(step, workout.discipline, thresholds, channel)
					: null,
			)
		}
		return targets.get(step)!
	}

	const segments: PlannedSegment[] = []
	let cum = 0
	for (const s of steps) {
		const target = targetOf(s.step)
		const startFrac = cum / total
		cum += s.durationSec
		const last = segments.at(-1)
		if (last && sameTarget(last.target, target)) {
			last.endFrac = cum / total
		} else {
			segments.push({ id: s.id, startFrac, endFrac: cum / total, target })
		}
	}
	return segments
}

/** Plot bands on the channel the plan targets *and* the stream actually carries;
 * power wins when both are available (the richer signal), else heart rate. */
function pickBandChannel(
	stream: ActivityStream,
	workout: WorkoutDetail | null,
	thresholds: DisciplineThresholdMap,
): BandChannel | null {
	// Each authored step once, not once per rep: a rep repeats its step.
	const targets = workout
		? workout.blocks.flatMap((block) =>
				block.steps.map((step) =>
					resolveStepRange(step, workout.discipline, thresholds),
				),
			)
		: []
	const hasPowerTarget = targets.some((r) => isNum(r.powerMin))
	const hasHrTarget = targets.some((r) => isNum(r.hrMin))
	if ((stream.power?.some(isNum) ?? false) && hasPowerTarget) return 'power'
	if ((stream.heartrate?.some(isNum) ?? false) && hasHrTarget)
		return 'heartrate'
	return null
}

/** Contiguous runs of `null` on a channel — the paused stretches the chart shades
 * and breaks its lines across, rather than interpolating through them. */
function nullRuns(values: Array<number | null>): Array<[number, number]> {
	const runs: Array<[number, number]> = []
	let start: number | null = null
	for (let i = 0; i < values.length; i++) {
		if (!isNum(values[i])) {
			if (start == null) start = i
		} else if (start != null) {
			runs.push([start, i])
			start = null
		}
	}
	if (start != null) runs.push([start, values.length])
	return runs
}

/** Min and max without spreading a 1 000-sample array onto the call stack. */
function rangeOf(values: Array<number | null>): [number, number] | null {
	let lo = Infinity
	let hi = -Infinity
	for (const v of values) {
		if (!isNum(v)) continue
		if (v < lo) lo = v
		if (v > hi) hi = v
	}
	return lo === Infinity ? null : [lo, hi]
}

// The channels the card can plot, each with its identity (line + dot + legend
// mark) and how it scales and formats. Power reads from a zero baseline; heart
// rate and pace zoom to their own range for legibility (pace inverted, so
// faster sits higher). The hues are the app's status tokens, used here as
// marks only: every reading is foreground text beside its dot, because a hue
// is never what carries a word (design-system.md, contrast).
type TelemetryChannelKey = 'power' | 'heartrate' | 'pace'

type TelemetryChannel = {
	key: TelemetryChannelKey
	label: string
	values: Array<number | null>
	format: (v: number) => string
	strokeClass: string
	markClass: string
	invert: boolean
	includeZero: boolean
	range: [number, number] | null
}

const CHANNEL_META: Record<
	TelemetryChannelKey,
	Omit<TelemetryChannel, 'key' | 'values' | 'range'>
> = {
	power: {
		label: L.power,
		format: (v) => `${Math.round(v)} W`,
		strokeClass: 'stroke-status-over',
		markClass: 'bg-status-over',
		invert: false,
		includeZero: true,
	},
	heartrate: {
		label: L.heartRate,
		format: (v) => `${Math.round(v)} ${L.bpm}`,
		strokeClass: 'stroke-status-missed opacity-80',
		markClass: 'bg-status-missed',
		invert: false,
		includeZero: false,
	},
	pace: {
		label: L.pace,
		format: (v) => formatPace(v),
		strokeClass: 'stroke-status-under',
		markClass: 'bg-status-under',
		invert: true,
		includeZero: false,
	},
}

const CHANNEL_ORDER: TelemetryChannelKey[] = ['power', 'heartrate', 'pace']

function buildChannels(stream: ActivityStream): TelemetryChannel[] {
	return CHANNEL_ORDER.filter((k) => stream[k]?.some(isNum) ?? false).map(
		(k) => ({
			key: k,
			values: stream[k]!,
			range: rangeOf(stream[k]!),
			...CHANNEL_META[k],
		}),
	)
}

/** Up to `max` evenly-spaced sample indices spanning `[0, n)` (both ends kept). */
function sampleIndices(n: number, max: number): number[] {
	if (n <= 0) return []
	if (n <= max) return Array.from({ length: n }, (_, i) => i)
	const out: number[] = []
	for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)))
	return Array.from(new Set(out))
}

/**
 * A channel's value → svg-y mapping over the plot. Power keeps a zero baseline;
 * the others zoom to their own (padded) range so a narrow HR or pace band still
 * reads. `extra` folds the planned-band targets into the domain so bands on the
 * chosen channel never clip. Pace inverts: a lower seconds-per-km (faster) sits
 * higher.
 */
function channelScale(
	ch: TelemetryChannel,
	baselineY: number,
	plotH: number,
	extra: number[] = [],
): (v: number) => number {
	let lo = ch.range ? ch.range[0] : 0
	let hi = ch.range ? ch.range[1] : 1
	for (const v of extra) {
		if (v < lo) lo = v
		if (v > hi) hi = v
	}
	if (ch.includeZero) {
		lo = 0
		hi = Math.max(hi * 1.08, 1)
	} else {
		const span = hi - lo || 1
		lo = Math.max(0, lo - span * 0.08)
		hi = hi + span * 0.08
	}
	const range = hi - lo || 1
	return (v) =>
		ch.invert
			? baselineY - ((hi - v) / range) * plotH
			: baselineY - ((v - lo) / range) * plotH
}

function buildScales(
	channels: TelemetryChannel[],
	bands: PlannedSegment[],
	bandChannel: BandChannel | null,
	baselineY: number,
	plotH: number,
): Array<(v: number) => number> {
	return channels.map((c) =>
		channelScale(
			c,
			baselineY,
			plotH,
			c.key === bandChannel
				? bands.flatMap((b) =>
						b.target!.max != null
							? [b.target!.min, b.target!.max]
							: [b.target!.min],
					)
				: [],
		),
	)
}

/** Everything the card derives from the stream and the plan, built once per
 * stream rather than once per scrub. */
function useTelemetryModel(
	stream: ActivityStream,
	workout: WorkoutDetail | null,
	thresholds: DisciplineThresholdMap,
) {
	return useMemo(() => {
		const bandChannel = pickBandChannel(stream, workout, thresholds)
		const time = stream.timeSec
		const totalSec = time[time.length - 1] ?? 0
		// The channels actually carried, in a stable read order (effort first,
		// then heart rate, then pace) — one list drives the lines, the inspect
		// readout, the legend, and the data-table columns.
		const channels = buildChannels(stream)
		const powerChannel = channels.find((c) => c.key === 'power')
		const hrChannel = channels.find((c) => c.key === 'heartrate')
		const paceChannel = channels.find((c) => c.key === 'pace')
		// The pause runs shade off the densest effort channel present.
		const primary = (powerChannel ?? hrChannel ?? paceChannel)?.values ?? []
		const pauseRuns = nullRuns(primary)
		const pauseCount = pauseRuns.filter(
			([s, e]) => s > 0 && e < primary.length,
		).length
		const bands =
			bandChannel != null
				? buildPlannedSegments(workout, thresholds, bandChannel).filter(
						(s) => s.target,
					)
				: []
		const targetLabels = Array.from(
			new Set(bands.map((b) => L.targetRange(b.target!.min, b.target!.max))),
		)
		const targetUnit = bandChannel === 'power' ? 'W' : L.bpm
		return {
			bandChannel,
			time,
			totalSec,
			channels,
			pauseRuns,
			pauseCount,
			bands,
			targetLabels,
			targetUnit,
			powerRange: powerChannel?.range ?? null,
			hrRange: hrChannel?.range ?? null,
			paceRange: paceChannel?.range ?? null,
			profile: deriveSessionProfile(workout),
		}
	}, [stream, workout, thresholds])
}

type TelemetryModel = ReturnType<typeof useTelemetryModel>

/** The planned target active at a sample, by fraction of the plan's duration
 * (the plan's shape stretched across the axis, never sample-aligned — PRD
 * #135), or null. */
function targetAt(model: TelemetryModel, i: number): PlannedSegment['target'] {
	if (model.totalSec <= 0) return null
	const frac = (model.time[i] ?? 0) / model.totalSec
	return (
		model.bands.find((b) => frac >= b.startFrac && frac <= b.endFrac)?.target ??
		null
	)
}

export default function TelemetryOverlay({
	stream,
	workout,
	thresholds,
}: {
	stream: ActivityStream
	workout: WorkoutDetail | null
	/** What the plan's targets resolve against for their bands (#616). */
	thresholds: DisciplineThresholdMap
}) {
	const model = useTelemetryModel(stream, workout, thresholds)
	const { time, totalSec, channels, bands, pauseCount, profile } = model

	// The Chart Inspect controller scrubs sample-by-sample across the whole
	// stream — continuous `trackProps` on touch/desktop, arrow keys for keyboard
	// — so the count is the sample count, not a discrete-mark count (ADR
	// 0029/0030).
	const inspect = useChartInspect(time.length)

	// Elapsed-time fraction → nearest sample index, for the continuous track.
	// The samples are in time order, so a binary search finds it rather than a
	// scan of every sample on every pointer move.
	const indexAtFraction = (frac: number) => {
		if (time.length === 0) return 0
		const target = frac * totalSec
		let lo = 0
		let hi = time.length - 1
		while (lo < hi) {
			const mid = (lo + hi) >> 1
			if ((time[mid] ?? 0) < target) lo = mid + 1
			else hi = mid
		}
		const prev = Math.max(0, lo - 1)
		return Math.abs((time[prev] ?? 0) - target) <=
			Math.abs((time[lo] ?? 0) - target)
			? prev
			: lo
	}

	// The accessible data table (ADR 0030): each channel's value at a bounded set
	// of sample times. Capped so a dense (≤1000-sample) stream can't bloat the
	// hidden DOM; full per-sample resolution stays reachable by keyboard scrub
	// (the aria-live inspect panel steps every sample). A `null` reading is
	// stated as missing, never interpolated (ADR 0008/0020).
	const dataTable: ChartDataTableModel = useMemo(
		() => ({
			caption: L.tableCaption,
			columns: [
				L.time,
				...channels.map((c) => c.label),
				...(bands.length > 0 ? [L.plannedColumn(model.targetUnit)] : []),
			],
			rows: sampleIndices(time.length, 48).map((i) => [
				formatClockDuration(time[i] ?? 0),
				...channels.map((c) => {
					const v = c.values[i]
					return isNum(v) ? c.format(v) : L.missing
				}),
				...(bands.length > 0
					? [
							(() => {
								const t = targetAt(model, i)
								return t ? L.targetRange(t.min, t.max) : '—'
							})(),
						]
					: []),
			]),
		}),
		[model, channels, bands, time],
	)

	const ariaLabel =
		channels.length > 0
			? L.ariaLabel(
					channels.map((c) => c.label.toLowerCase()).join(', '),
					bands.length > 0,
				)
			: L.ariaFallback

	return (
		<Card className="mt-6" data-telemetry-card>
			<CardHeader>
				<CardTitle className="text-heading">{L.title}</CardTitle>
				<CardDescription className="text-footnote">
					{L.description}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="text-caption flex flex-wrap items-center gap-x-4 gap-y-1">
					{channels.map((c) => (
						<span key={c.key} className="flex items-center gap-1.5">
							<span className={cn('h-0.5 w-4 rounded-full', c.markClass)} />{' '}
							{c.label}
						</span>
					))}
					{bands.length > 0 ? (
						<span className="flex items-center gap-1.5">
							<span className="bg-primary/20 ring-primary/50 size-3 rounded-sm ring-1" />{' '}
							{L.plannedTarget}
						</span>
					) : null}
					{pauseCount > 0 ? (
						<span className="text-muted-foreground flex items-center gap-1.5">
							<span className="bg-muted-foreground/20 size-3 rounded-sm" />{' '}
							{L.paused}
						</span>
					) : null}
				</div>

				<ChartFigure
					inspect={inspect}
					count={time.length}
					yMax={100}
					ariaLabel={ariaLabel}
					dataTable={dataTable}
					padding={{ top: 14, right: 8, bottom: 8, left: 8 }}
					renderMarks={(geom) => (
						<>
							<StaticMarks
								model={model}
								left={geom.padding.left}
								top={geom.padding.top}
								plotW={geom.plotW}
								plotH={geom.plotH}
								baselineY={geom.baselineY}
							/>
							<Crosshair geom={geom} model={model} index={inspect.index} />
							{/* The continuous pointer track (ADR 0029): one full-plot hit
							    area that maps the pointer's x to the nearest sample.
							    Desktop hovers to read; touch drags to scrub. Transparent,
							    on top, so it catches every pointer. */}
							<rect
								x={geom.padding.left}
								y={geom.padding.top}
								width={geom.plotW}
								height={geom.plotH}
								fill="transparent"
								className="cursor-crosshair"
								{...inspect.trackProps(indexAtFraction)}
							/>
						</>
					)}
					renderOverlay={(geom) => (
						<TelemetryDots
							geom={geom}
							model={model}
							inspectedIndex={inspect.index}
						/>
					)}
					renderInspect={(index) => (
						<TelemetryReading index={index} model={model} />
					)}
				/>

				<div className="text-caption text-muted-foreground flex items-center justify-between tabular-nums">
					<span>{L.start}</span>
					<span>{L.total(formatClockDuration(totalSec))}</span>
				</div>

				{profile.bars.length > 0 ? (
					<div className="space-y-1">
						<p className="text-caption text-muted-foreground">
							{L.plannedShape}
						</p>
						<ProfileBars
							bars={profile.bars}
							groups={profile.groups}
							className="h-6"
						/>
					</div>
				) : null}

				<TelemetrySummary model={model} />
			</CardContent>
		</Card>
	)
}

/**
 * The screen-reader / non-visual ranged summary, kept beside the data-table
 * equivalent (ADR 0030) so the review is never chart-only (PRD #135 user story
 * 18).
 */
function TelemetrySummary({ model }: { model: TelemetryModel }) {
	const { powerRange, hrRange, paceRange, pauseCount, targetLabels } = model
	return (
		<p className="sr-only">
			{L.srOver(nbDurationLabel(Math.round(model.totalSec)))}
			{powerRange ? L.srPower(powerRange[0], powerRange[1]) : ''}
			{hrRange ? L.srHeartRate(hrRange[0], hrRange[1]) : ''}
			{paceRange
				? L.srPace(formatPace(paceRange[0]), formatPace(paceRange[1]))
				: ''}
			{pauseCount > 0 ? L.srPauses(pauseCount) : ''}
			{targetLabels.length > 0 && model.bandChannel
				? L.srTargets(
						model.bandChannel,
						targetLabels.join(', '),
						model.targetUnit,
					)
				: ''}
		</p>
	)
}

/**
 * The marks that do not move while the athlete scrubs: the pauses, the target
 * bands and one gapped polyline per channel. Memoised on the plot's numbers
 * (the chart's viewBox is fixed, so they only change with the stream), so a
 * pointer move never rebuilds a thousand-point path.
 */
const StaticMarks = memo(function StaticMarks({
	model,
	left,
	top,
	plotW,
	plotH,
	baselineY,
}: {
	model: TelemetryModel
	left: number
	top: number
	plotW: number
	plotH: number
	baselineY: number
}) {
	const { time, totalSec, channels, bands, bandChannel, pauseRuns } = model
	const x = (sec: number) => left + (totalSec > 0 ? sec / totalSec : 0) * plotW
	const xFrac = (frac: number) => left + frac * plotW
	const scales = buildScales(channels, bands, bandChannel, baselineY, plotH)
	const bandIdx = channels.findIndex((c) => c.key === bandChannel)
	const bandScale = bandIdx >= 0 ? scales[bandIdx]! : null

	const gappedPath = (
		values: Array<number | null>,
		y: (n: number) => number,
	) => {
		const parts: string[] = []
		let pen = false
		for (let i = 0; i < time.length; i++) {
			const v = values[i]
			if (!isNum(v)) {
				pen = false
				continue
			}
			parts.push(
				`${pen ? 'L' : 'M'}${x(time[i] ?? 0).toFixed(1)} ${y(v).toFixed(1)}`,
			)
			pen = true
		}
		return parts.join(' ')
	}

	return (
		<>
			{/* Paused stretches shaded as known-empty, so a gap never reads as zero. */}
			{pauseRuns.map(([s, e], i) => {
				const x0 = x(time[s] ?? 0)
				const x1 = x(time[Math.min(e, time.length - 1)] ?? 0)
				const width = Math.max(0, x1 - x0)
				return width > 0 ? (
					<rect
						key={`pause-${i}`}
						x={x0}
						y={top}
						width={width}
						height={plotH}
						className="fill-muted-foreground/10"
					/>
				) : null
			})}

			{/* Planned target bands on the channel the plan targets. */}
			{bandScale
				? bands.map((b) => {
						const x0 = xFrac(b.startFrac)
						const x1 = xFrac(b.endFrac)
						const width = Math.max(0, x1 - x0)
						const floor = bandScale(b.target!.min)
						const { max } = b.target!
						if (max != null) {
							return (
								<rect
									key={`band-${b.id}`}
									x={x0}
									y={bandScale(max)}
									width={width}
									height={Math.max(0, floor - bandScale(max))}
									data-planned-band
									className="fill-primary/15 stroke-primary/40"
									strokeWidth={1}
									vectorEffect="non-scaling-stroke"
								/>
							)
						}
						// An open-ended zone (`172+`) has a floor and no ceiling: the band
						// fills to the top of the plot, edged only at its floor, so it
						// never draws a ceiling the plan does not have.
						return (
							<g key={`band-${b.id}`}>
								<rect
									x={x0}
									y={top}
									width={width}
									height={Math.max(0, floor - top)}
									data-planned-band
									data-open-ended
									className="fill-primary/15"
								/>
								<line
									x1={x0}
									x2={x0 + width}
									y1={floor}
									y2={floor}
									className="stroke-primary/40"
									strokeWidth={1}
									vectorEffect="non-scaling-stroke"
								/>
							</g>
						)
					})
				: null}

			{/* One gapped polyline per channel — `null` breaks the line, never
			    interpolated across (ADR 0008/0020). */}
			{channels.map((c, ci) => (
				<path
					key={c.key}
					d={gappedPath(c.values, scales[ci]!)}
					fill="none"
					className={c.strokeClass}
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			))}
		</>
	)
})

/** The inspection crosshair at the scrubbed sample. Per-channel dots ride as
 * crisp HTML overlays (see `TelemetryDots`). */
function Crosshair({
	geom,
	model,
	index,
}: {
	geom: ChartGeom
	model: TelemetryModel
	index: number | null
}) {
	if (index == null) return null
	const { padding, plotW, plotH } = geom
	const x =
		padding.left +
		(model.totalSec > 0 ? (model.time[index] ?? 0) / model.totalSec : 0) * plotW
	return (
		<line
			x1={x}
			x2={x}
			y1={padding.top}
			y2={padding.top + plotH}
			stroke="currentColor"
			className="text-foreground/60"
			strokeWidth={1.5}
			vectorEffect="non-scaling-stroke"
		/>
	)
}

function TelemetryDots({
	geom,
	model,
	inspectedIndex,
}: {
	geom: ChartGeom
	model: TelemetryModel
	inspectedIndex: number | null
}) {
	const { time, totalSec, channels, bands, bandChannel } = model
	const { padding, plotW, plotH, baselineY, leftPct, topPct } = geom
	const scales = useMemo(
		() => buildScales(channels, bands, bandChannel, baselineY, plotH),
		[channels, bands, bandChannel, baselineY, plotH],
	)
	if (inspectedIndex == null) return null
	const svgX =
		padding.left +
		(totalSec > 0 ? (time[inspectedIndex] ?? 0) / totalSec : 0) * plotW

	return (
		<>
			{channels.map((c, ci) => {
				const v = c.values[inspectedIndex]
				if (!isNum(v)) return null
				return (
					<span
						key={c.key}
						className="absolute -translate-x-1/2 -translate-y-1/2"
						style={{ left: leftPct(svgX), top: topPct(scales[ci]!(v)) }}
					>
						<span
							className={cn(
								'ring-background block size-2.5 rounded-full ring-2',
								c.markClass,
							)}
						/>
					</span>
				)
			})}
		</>
	)
}

function TelemetryReading({
	index,
	model,
}: {
	index: number | null
	model: TelemetryModel
}) {
	if (index == null) {
		return <span className="text-muted-foreground">{L.inspectHint}</span>
	}

	const target = targetAt(model, index)

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
			<span className="font-medium">
				{formatClockDuration(model.time[index] ?? 0)}
			</span>
			{model.channels.map((c) => {
				const v = c.values[index]
				return (
					<span
						key={c.key}
						className={cn(
							'inline-flex items-center gap-1.5',
							!isNum(v) && 'text-muted-foreground',
						)}
					>
						<span
							aria-hidden
							className={cn('size-2 shrink-0 rounded-full', c.markClass)}
						/>
						{c.label} {isNum(v) ? c.format(v) : L.missing}
					</span>
				)
			})}
			{target ? (
				<span className="inline-flex items-center gap-1.5">
					<span
						aria-hidden
						className="bg-primary/30 ring-primary/60 size-2 shrink-0 rounded-sm ring-1"
					/>
					{L.plannedRange(target.min, target.max, model.targetUnit)}
				</span>
			) : null}
		</div>
	)
}
