type BandChannel = 'power' | 'heartrate'

type Step = NonNullable<
	SessionDetail['workout']
>['blocks'][number]['steps'][number]

/** A planned step laid out as a fraction of the workout's planned duration,
 * carrying its resolved Intensity Target on the chosen channel (when any). */
type PlannedSegment = {
	id: string
	startFrac: number
	endFrac: number
	target: { min: number; max: number } | null
}

function resolveStepTarget(
	step: Step,
	channel: BandChannel,
): { min: number; max: number } | null {
	if (step.kind !== 'cardio') return null
	if (channel === 'power') {
		if (!isNum(step.intensityPowerMin)) return null
		return {
			min: step.intensityPowerMin,
			max: step.intensityPowerMax ?? step.intensityPowerMin,
		}
	}
	if (!isNum(step.intensityHrMin)) return null
	return {
		min: step.intensityHrMin,
		max: step.intensityHrMax ?? step.intensityHrMin,
	}
}

/**
 * Lay the workout's planned steps out as fractions of its total planned
 * duration. This is the *plan's* shape, stretched across the chart's width — it
 * is deliberately not aligned sample-by-sample to the recording (that fragile
 * telemetry-to-step alignment is out of scope per PRD #135), so we never assert a
 * per-step verdict; the athlete eyeballs the comparison.
 */
function buildPlannedSegments(
	workout: WorkoutDetail | null,
	channel: BandChannel | null,
): PlannedSegment[] {
	const expanded = expandWorkoutSteps(workout)
	const total = expanded.reduce((sum, e) => sum + e.durationSec, 0)
	if (total <= 0) return []
	let cum = 0
	return expanded.map((e) => {
		const startFrac = cum / total
		cum += e.durationSec
		return {
			id: e.id,
			startFrac,
			endFrac: cum / total,
			target: channel ? resolveStepTarget(e.step, channel) : null,
		}
	})
}

/** Plot bands on the channel the plan targets *and* the stream actually carries;
 * power wins when both are available (the richer signal), else heart rate. */
function pickBandChannel(
	stream: ActivityStream,
	workout: WorkoutDetail | null,
): BandChannel | null {
	const expanded = expandWorkoutSteps(workout)
	const hasPowerTarget = expanded.some((e) => isNum(e.step.intensityPowerMin))
	const hasHrTarget = expanded.some((e) => isNum(e.step.intensityHrMin))
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

function rangeOf(values: Array<number | null>): [number, number] | null {
	const nums = values.filter(isNum)
	if (nums.length === 0) return null
	return [Math.min(...nums), Math.max(...nums)]
}

function TelemetryOverlay({
	stream,
	workout,
}: {
	stream: ActivityStream
	workout: WorkoutDetail | null
}) {
	const bandChannel = pickBandChannel(stream, workout)
	const profile = deriveSessionProfile(workout)

	const time = stream.timeSec
	const totalSec = time[time.length - 1] ?? 0

	// The channels actually carried, in a stable read order (effort first, then
	// heart rate, then pace) — one list drives the lines, the inspect readout, the
	// legend, and the data-table columns.
	const channels = buildChannels(stream)

	const hasPower = stream.power?.some(isNum) ?? false
	const hasHr = stream.heartrate?.some(isNum) ?? false
	const hasPace = stream.pace?.some(isNum) ?? false
	// The pause runs shade off the densest effort channel present.
	const primary = hasPower
		? stream.power!
		: hasHr
			? stream.heartrate!
			: hasPace
				? stream.pace!
				: []
	const pauseCount = nullRuns(primary).filter(
		([s, e]) => s > 0 && e < primary.length,
	).length
	const powerRange = hasPower ? rangeOf(stream.power!) : null
	const hrRange = hasHr ? rangeOf(stream.heartrate!) : null
	const paceRange = hasPace ? rangeOf(stream.pace!) : null

	const bands =
		bandChannel != null
			? buildPlannedSegments(workout, bandChannel).filter((s) => s.target)
			: []
	const targetLabels = Array.from(
		new Set(bands.map((b) => `${b.target!.min}–${b.target!.max}`)),
	)
	const targetUnit = bandChannel === 'power' ? 'W' : 'bpm'

	// The Chart Inspect controller scrubs sample-by-sample across the whole stream
	// — continuous `trackProps` on touch/desktop, arrow keys for keyboard — so the
	// count is the sample count, not a discrete-mark count (ADR 0029/0030).
	const inspect = useChartInspect(time.length)

	// Elapsed-time fraction → nearest sample index, for the continuous track.
	const indexAtFraction = (frac: number) => {
		if (time.length === 0) return 0
		const target = frac * totalSec
		let best = 0
		let bestDist = Infinity
		for (let i = 0; i < time.length; i++) {
			const d = Math.abs((time[i] ?? 0) - target)
			if (d < bestDist) {
				bestDist = d
				best = i
			}
		}
		return best
	}

	// The planned target active at a sample, by fraction of the plan's duration
	// (the plan's shape stretched across the axis, never sample-aligned — PRD
	// #135), or null.
	const targetAt = (i: number): PlannedSegment['target'] => {
		if (totalSec <= 0) return null
		const frac = (time[i] ?? 0) / totalSec
		return (
			bands.find((b) => frac >= b.startFrac && frac <= b.endFrac)?.target ??
			null
		)
	}

	// The accessible data table (ADR 0030): each channel's value at a bounded set
	// of sample times. Capped so a dense (≤1000-sample) stream can't bloat the
	// hidden DOM; full per-sample resolution stays reachable by keyboard scrub (the
	// aria-live inspect panel steps every sample). A `null` reading is `n/a`, never
	// interpolated (ADR 0008/0020).
	const tableIdx = sampleIndices(time.length, 48)
	const dataTable: ChartDataTableModel = {
		caption:
			'Recorded telemetry sampled across the session, earliest to latest.',
		columns: [
			'Time',
			...channels.map((c) => c.label),
			...(bands.length > 0 ? [`Planned ${targetUnit}`] : []),
		],
		rows: tableIdx.map((i) => [
			formatClockDuration(time[i] ?? 0),
			...channels.map((c) => {
				const v = c.values[i]
				return isNum(v) ? c.format(v) : 'n/a'
			}),
			...(bands.length > 0
				? [
						(() => {
							const t = targetAt(i)
							return t ? `${t.min}–${t.max}` : '—'
						})(),
					]
				: []),
		]),
	}

	const ariaLabel =
		channels.length > 0
			? `Recorded ${channels
					.map((c) => c.label.toLowerCase())
					.join(', ')} over time${
					bands.length > 0 ? ' against the planned target bands' : ''
				}. Move across the recording to read each channel at any point.`
			: 'Recorded telemetry over time.'

	return (
		<Card className="mt-6">
			<CardHeader>
				<CardTitle className="text-h5">Telemetry overlay</CardTitle>
				<CardDescription>
					Your recorded effort over time, with the planned targets and shape
					laid across it.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
					{channels.map((c) => (
						<span key={c.key} className="flex items-center gap-1.5">
							<span className={cn('h-0.5 w-4', c.legendClass)} /> {c.label}
						</span>
					))}
					{bands.length > 0 ? (
						<span className="flex items-center gap-1.5">
							<span className="size-3 rounded-sm bg-emerald-500/25 ring-1 ring-emerald-500/40" />{' '}
							Planned target
						</span>
					) : null}
					{pauseCount > 0 ? (
						<span className="text-muted-foreground flex items-center gap-1.5">
							<span className="bg-muted-foreground/20 size-3 rounded-sm" />{' '}
							Paused
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
						<TelemetryMarks
							geom={geom}
							time={time}
							totalSec={totalSec}
							channels={channels}
							bands={bands}
							bandChannel={bandChannel}
							primary={primary}
							inspect={inspect}
							indexAtFraction={indexAtFraction}
						/>
					)}
					renderOverlay={(geom) => (
						<TelemetryDots
							geom={geom}
							time={time}
							totalSec={totalSec}
							channels={channels}
							bands={bands}
							bandChannel={bandChannel}
							inspectedIndex={inspect.index}
						/>
					)}
					renderInspect={(index) => (
						<TelemetryReading
							index={index}
							time={time}
							channels={channels}
							targetAt={targetAt}
							targetUnit={targetUnit}
						/>
					)}
				/>

				<div className="text-muted-foreground flex items-center justify-between text-xs">
					<span>0:00 · start</span>
					<span>{formatClockDuration(totalSec)} · total</span>
				</div>

				{profile.bars.length > 0 ? (
					<div className="space-y-1">
						<p className="text-muted-foreground text-xs">
							Planned Workout Shape
						</p>
						<ProfileBars
							bars={profile.bars}
							groups={profile.groups}
							className="h-6"
						/>
					</div>
				) : null}

				{/* Screen-reader / non-visual ranged summary, kept alongside the
				    data-table equivalent (ADR 0030) so the review is never chart-only
				    (PRD #135 user story 18). */}
				<p className="sr-only">
					Recorded telemetry over {formatDuration(totalSec)}.
					{powerRange
						? ` Power ranged ${powerRange[0]} to ${powerRange[1]} W.`
						: ''}
					{hrRange
						? ` Heart rate ranged ${hrRange[0]} to ${hrRange[1]} bpm.`
						: ''}
					{paceRange
						? ` Pace ranged ${formatPace(paceRange[0])} to ${formatPace(paceRange[1])}.`
						: ''}
					{pauseCount > 0
						? ` ${pauseCount} paused ${pauseCount === 1 ? 'stretch' : 'stretches'} shown as gaps.`
						: ''}
					{targetLabels.length > 0
						? ` Planned ${bandChannel === 'power' ? 'power' : 'heart-rate'} ${
								targetLabels.length === 1 ? 'target' : 'targets'
							} ${targetLabels.join(', ')} ${targetUnit}.`
						: ''}
				</p>
			</CardContent>
		</Card>
	)
}

// The channels the Telemetry Overlay can plot, each with its identity (line +
// dot + legend colours) and how it scales and formats. Power reads from a zero
// baseline; heart rate and pace zoom to their own range for legibility (pace
// inverted, so faster sits higher).
type TelemetryChannelKey = 'power' | 'heartrate' | 'pace'

type TelemetryChannel = {
	key: TelemetryChannelKey
	label: string
	values: Array<number | null>
	format: (v: number) => string
	strokeClass: string
	legendClass: string
	dotClass: string
	textClass: string
	invert: boolean
	includeZero: boolean
}

const CHANNEL_META: Record<
	TelemetryChannelKey,
	Omit<TelemetryChannel, 'key' | 'values'>
> = {
	power: {
		label: 'Power',
		format: (v) => `${Math.round(v)} W`,
		strokeClass: 'stroke-sky-500',
		legendClass: 'bg-sky-500',
		dotClass: 'bg-sky-500',
		textClass: 'text-sky-600 dark:text-sky-400',
		invert: false,
		includeZero: true,
	},
	heartrate: {
		label: 'Heart rate',
		format: (v) => `${Math.round(v)} bpm`,
		strokeClass: 'stroke-rose-500 opacity-70',
		legendClass: 'bg-rose-500',
		dotClass: 'bg-rose-500',
		textClass: 'text-rose-600 dark:text-rose-400',
		invert: false,
		includeZero: false,
	},
	pace: {
		label: 'Pace',
		format: (v) => formatPace(v),
		strokeClass: 'stroke-amber-500',
		legendClass: 'bg-amber-500',
		dotClass: 'bg-amber-500',
		textClass: 'text-amber-600 dark:text-amber-400',
		invert: true,
		includeZero: false,
	},
}

const CHANNEL_ORDER: TelemetryChannelKey[] = ['power', 'heartrate', 'pace']

function buildChannels(stream: ActivityStream): TelemetryChannel[] {
	return CHANNEL_ORDER.filter((k) => stream[k]?.some(isNum) ?? false).map(
		(k) => ({ key: k, values: stream[k]!, ...CHANNEL_META[k] }),
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
	geom: ChartGeom,
	extra: number[] = [],
): (v: number) => number {
	const { baselineY, plotH } = geom
	const nums = [...ch.values.filter(isNum), ...extra]
	let lo = nums.length ? Math.min(...nums) : 0
	let hi = nums.length ? Math.max(...nums) : 1
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
	geom: ChartGeom,
): Array<(v: number) => number> {
	return channels.map((c) =>
		channelScale(
			c,
			geom,
			c.key === bandChannel
				? bands.flatMap((b) => [b.target!.min, b.target!.max])
				: [],
		),
	)
}

function TelemetryMarks({
	geom,
	time,
	totalSec,
	channels,
	bands,
	bandChannel,
	primary,
	inspect,
	indexAtFraction,
}: {
	geom: ChartGeom
	time: number[]
	totalSec: number
	channels: TelemetryChannel[]
	bands: PlannedSegment[]
	bandChannel: BandChannel | null
	primary: Array<number | null>
	inspect: ReturnType<typeof useChartInspect>
	indexAtFraction: (frac: number) => number
}) {
	const { padding, plotW, plotH } = geom
	const x = (sec: number) =>
		padding.left + (totalSec > 0 ? sec / totalSec : 0) * plotW
	const xFrac = (frac: number) => padding.left + frac * plotW

	const scales = buildScales(channels, bands, bandChannel, geom)
	const bandIdx = channels.findIndex((c) => c.key === bandChannel)
	const bandScale = bandIdx >= 0 ? scales[bandIdx]! : null

	const gappedPath = (
		values: Array<number | null>,
		y: (n: number) => number,
	) => {
		let d = ''
		let pen = false
		for (let i = 0; i < time.length; i++) {
			const v = values[i]
			if (!isNum(v)) {
				pen = false
				continue
			}
			d += `${pen ? 'L' : 'M'}${x(time[i] ?? 0).toFixed(1)} ${y(v).toFixed(1)} `
			pen = true
		}
		return d
	}

	const pauses = nullRuns(primary).map(([s, e]) => {
		const x0 = x(time[s] ?? 0)
		const x1 = x(time[Math.min(e, time.length - 1)] ?? 0)
		return { x: x0, width: Math.max(0, x1 - x0) }
	})

	const inspected = inspect.index

	return (
		<>
			{/* Paused stretches shaded as known-empty, so a gap never reads as zero. */}
			{pauses.map((r, i) =>
				r.width > 0 ? (
					<rect
						key={`pause-${i}`}
						x={r.x}
						y={padding.top}
						width={r.width}
						height={plotH}
						className="fill-muted-foreground/10"
					/>
				) : null,
			)}

			{/* Planned target bands on the channel the plan targets. */}
			{bandScale
				? bands.map((b) => {
						const x0 = xFrac(b.startFrac)
						const x1 = xFrac(b.endFrac)
						return (
							<rect
								key={`band-${b.id}`}
								x={x0}
								y={bandScale(b.target!.max)}
								width={Math.max(0, x1 - x0)}
								height={Math.max(
									0,
									bandScale(b.target!.min) - bandScale(b.target!.max),
								)}
								className="fill-emerald-500/15 stroke-emerald-500/40"
								strokeWidth={1}
								vectorEffect="non-scaling-stroke"
							/>
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

			{/* The inspection crosshair at the scrubbed sample. Per-channel dots ride
			    as crisp HTML overlays (see `TelemetryDots`). */}
			{inspected != null ? (
				<line
					x1={x(time[inspected] ?? 0)}
					x2={x(time[inspected] ?? 0)}
					y1={padding.top}
					y2={padding.top + plotH}
					stroke="currentColor"
					className="text-foreground/60"
					strokeWidth={1.5}
					vectorEffect="non-scaling-stroke"
				/>
			) : null}

			{/* The continuous pointer track (ADR 0029): one full-plot hit area that
			    maps the pointer's x to the nearest sample. Desktop hovers to read;
			    touch drags to scrub. Transparent, on top, so it catches every
			    pointer. */}
			<rect
				x={padding.left}
				y={padding.top}
				width={plotW}
				height={plotH}
				fill="transparent"
				className="cursor-crosshair"
				{...inspect.trackProps(indexAtFraction)}
			/>
		</>
	)
}

function TelemetryDots({
	geom,
	time,
	totalSec,
	channels,
	bands,
	bandChannel,
	inspectedIndex,
}: {
	geom: ChartGeom
	time: number[]
	totalSec: number
	channels: TelemetryChannel[]
	bands: PlannedSegment[]
	bandChannel: BandChannel | null
	inspectedIndex: number | null
}) {
	if (inspectedIndex == null) return null
	const { padding, plotW, leftPct, topPct } = geom
	const scales = buildScales(channels, bands, bandChannel, geom)
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
								c.dotClass,
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
	time,
	channels,
	targetAt,
	targetUnit,
}: {
	index: number | null
	time: number[]
	channels: TelemetryChannel[]
	targetAt: (i: number) => PlannedSegment['target']
	targetUnit: string
}) {
	if (index == null) {
		return (
			<span className="text-muted-foreground">
				Move across the recording to read each channel at any point — tap and
				drag on a phone, hover on desktop.
			</span>
		)
	}

	const target = targetAt(index)

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
			<span className="font-medium">
				{formatClockDuration(time[index] ?? 0)}
			</span>
			{channels.map((c) => {
				const v = c.values[index]
				return (
					<span
						key={c.key}
						className={isNum(v) ? c.textClass : 'text-muted-foreground'}
					>
						{c.label} {isNum(v) ? c.format(v) : 'n/a'}
					</span>
				)
			})}
			{target ? (
				<span className="text-emerald-600 dark:text-emerald-400">
					Planned {target.min}–{target.max} {targetUnit}
				</span>
			) : null}
		</div>
	)
}

