/**
 * PROTOTYPE — throwaway. The layered season chart for variant E.
 *
 * One picture with switchable layers rather than one picture per question:
 * volume, projected fitness, rhythm, ramp and focus stack on the same time
 * axis and can be turned on and off independently. Form/TSB is offered as a
 * layer and honestly declines — a flat daily-average replay makes ATL and TSB
 * meaningless (CONTEXT.md), so it explains itself instead of drawing a lie.
 *
 * Delete with the route.
 */
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	CURRENCY_UNIT,
	type Currency,
	FOCUS,
	fromHours,
	type PlannedWeek,
	rampPercent,
} from './__manual-prototype-x-model.ts'

export type LayerKey = 'volume' | 'fitness' | 'rhythm' | 'ramp' | 'focus' | 'form'

export const LAYERS: Array<{
	key: LayerKey
	label: string
	swatch: string
	unavailable?: string
}> = [
	{ key: 'volume', label: 'Volume', swatch: 'var(--zone-2)' },
	{ key: 'fitness', label: 'Fitness', swatch: 'var(--primary)' },
	{ key: 'rhythm', label: 'Rhythm', swatch: 'var(--muted-foreground)' },
	{ key: 'ramp', label: 'Ramp', swatch: 'var(--zone-4)' },
	{ key: 'focus', label: 'Focus', swatch: 'var(--zone-5)' },
	{
		key: 'form',
		label: 'Form',
		swatch: 'var(--muted-foreground)',
		unavailable:
			'Form needs day-by-day load. A plan replays as a flat weekly average, which makes ATL and TSB meaningless — so this layer stays empty rather than drawing a curve the plan can’t support.',
	},
]

const RAMP_WARN = 8
const RAMP_HOT = 12

export function LayerChips({
	active,
	onToggle,
}: {
	active: LayerKey[]
	onToggle: (k: LayerKey) => void
}) {
	return (
		<div className="flex flex-wrap gap-1.5" role="group" aria-label="Chart layers">
			{LAYERS.map((l) => {
				const on = active.includes(l.key)
				return (
					<button
						key={l.key}
						type="button"
						onClick={() => onToggle(l.key)}
						aria-pressed={on}
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-150 active:scale-95',
							on
								? 'bg-foreground text-background'
								: 'bg-muted text-muted-foreground',
						)}
					>
						<span
							className="size-2 rounded-full"
							style={{
								background: on ? 'currentColor' : l.swatch,
								opacity: on ? 0.7 : 1,
							}}
						/>
						{l.label}
					</button>
				)
			})}
		</div>
	)
}

export function SeasonChart({
	weeks,
	ctl,
	layers,
	selected,
	onSelect,
	currentIndex,
	raceName,
	repeatFrom,
}: {
	weeks: PlannedWeek[]
	ctl: number[]
	layers: LayerKey[]
	selected: number | null
	onSelect: (i: number) => void
	currentIndex: number | null
	raceName: string | null
	repeatFrom: number | null
}) {
	const has = (k: LayerKey) => layers.includes(k)
	const colW = 34
	const padX = 14
	const plotH = 138
	const rampH = has('ramp') ? 26 : 0
	const focusH = has('focus') ? 16 : 0
	const H = plotH + rampH + focusH + 20
	const W = weeks.length * colW + padX * 2
	const maxVol = Math.max(...weeks.map((w) => w.hours), 0.1)
	const maxCtl = Math.max(...ctl, 40) * 1.2
	const x = (i: number) => padX + i * colW
	const yVol = (h: number) => plotH - (h / maxVol) * (plotH - 18)
	const yCtl = (c: number) => plotH - (c / maxCtl) * (plotH - 18)

	const spans: Array<{ key: string; from: number; to: number; focus: string }> =
		[]
	weeks.forEach((w, i) => {
		const last = spans[spans.length - 1]
		if (last && last.key.startsWith(`${w.phaseId}|`) && last.to === i - 1)
			last.to = i
		else
			spans.push({ key: `${w.phaseId}|${i}`, from: i, to: i, focus: w.focus })
	})

	const ctlPath = ctl
		.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i) + colW / 2} ${yCtl(c)}`)
		.join(' ')
	const ctlArea = `${ctlPath} L ${x(weeks.length - 1) + colW / 2} ${plotH} L ${x(0) + colW / 2} ${plotH} Z`

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-auto w-full"
			role="img"
			aria-label={`Season chart showing ${layers.filter((l) => l !== 'form').join(', ')}`}
		>
			<defs>
				<linearGradient id="proto-x-ctl" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
					<stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
				</linearGradient>
			</defs>

			{/* Rhythm layer: recovery weeks get a soft trough behind everything. */}
			{has('rhythm')
				? weeks.map((w, i) =>
						w.role === 'recovery' || w.role === 'taper' ? (
							<rect
								key={`r${w.index}`}
								x={x(i) + 1}
								y={0}
								width={colW - 2}
								height={plotH}
								rx={8}
								fill="var(--muted)"
								opacity={0.7}
							/>
						) : null,
					)
				: null}

			{/* Hit targets always live, so the chart stays inspectable. */}
			{weeks.map((w, i) => (
				<rect
					key={`h${w.index}`}
					x={x(i)}
					y={0}
					width={colW}
					height={plotH}
					fill={selected === i ? 'var(--accent)' : 'transparent'}
					opacity={selected === i ? 0.8 : 1}
					rx={8}
					className="cursor-pointer"
					onClick={() => onSelect(i)}
				/>
			))}

			{has('fitness') ? (
				<path d={ctlArea} fill="url(#proto-x-ctl)" className="pointer-events-none" />
			) : null}

			{has('volume')
				? weeks.map((w, i) => {
						const top = yVol(w.hours)
						const noLoad = !w.countsTowardLoad
						return (
							<g key={`v${w.index}`} className="pointer-events-none">
								<rect
									x={x(i) + colW * 0.2}
									y={top}
									width={colW * 0.6}
									height={Math.max(3, plotH - top)}
									rx={colW * 0.3}
									fill={FOCUS[w.focus].hue}
									opacity={
										noLoad
											? 0.22
											: selected === i
												? 1
												: w.role === 'load'
													? 0.6
													: 0.32
									}
									className="transition-opacity duration-300"
								/>
								{noLoad ? (
									<rect
										x={x(i) + colW * 0.2}
										y={top}
										width={colW * 0.6}
										height={Math.max(3, plotH - top)}
										rx={colW * 0.3}
										fill="none"
										stroke={FOCUS[w.focus].hue}
										strokeWidth={1.5}
										strokeDasharray="3 3"
									/>
								) : null}
								{w.overridden ? (
									<circle
										cx={x(i) + colW / 2}
										cy={top - 7}
										r={2.4}
										fill="var(--foreground)"
									/>
								) : null}
							</g>
						)
					})
				: null}

			{has('fitness') ? (
				<path
					d={ctlPath}
					fill="none"
					stroke="var(--primary)"
					strokeWidth={2}
					strokeLinecap="round"
					strokeLinejoin="round"
					className="pointer-events-none"
				/>
			) : null}

			{/* Rhythm layer: the load number under each week. */}
			{has('rhythm')
				? weeks.map((w, i) => (
						<text
							key={`n${w.index}`}
							x={x(i) + colW / 2}
							y={plotH + 11}
							textAnchor="middle"
							className="pointer-events-none fill-muted-foreground text-[8px] font-semibold"
						>
							{w.role === 'recovery'
								? 'rec'
								: w.role === 'taper'
									? 'tap'
									: w.loadNumber}
						</text>
					))
				: null}

			{/* Ramp layer: a tick per week, coloured by the guard thresholds. */}
			{has('ramp')
				? weeks.map((w, i) => {
						const r = rampPercent(weeks, i)
						if (r === null) return null
						const mid = plotH + (has('rhythm') ? 18 : 8) + rampH / 2
						const mag = Math.min(Math.abs(r) / 40, 1) * (rampH / 2 - 2)
						const up = r > 0
						return (
							<g key={`p${w.index}`} className="pointer-events-none">
								<line
									x1={x(i) + colW / 2}
									y1={mid}
									x2={x(i) + colW / 2}
									y2={up ? mid - mag : mid + mag}
									stroke={
										r > RAMP_HOT
											? 'var(--destructive)'
											: r > RAMP_WARN
												? 'var(--zone-4)'
												: 'var(--muted-foreground)'
									}
									strokeWidth={3}
									strokeLinecap="round"
									opacity={r > RAMP_WARN ? 1 : 0.5}
								/>
							</g>
						)
					})
				: null}
			{has('ramp') ? (
				<line
					x1={padX}
					y1={plotH + (has('rhythm') ? 18 : 8) + rampH / 2}
					x2={W - padX}
					y2={plotH + (has('rhythm') ? 18 : 8) + rampH / 2}
					stroke="var(--border)"
					strokeWidth={1}
				/>
			) : null}

			{/* Focus layer: the Plan Outline phases as pills on the time axis. */}
			{has('focus')
				? spans.map((s) => (
						<rect
							key={s.key}
							x={x(s.from) + 3}
							y={H - 12}
							width={(s.to - s.from + 1) * colW - 6}
							height={6}
							rx={3}
							fill={FOCUS[s.focus as keyof typeof FOCUS].hue}
							opacity={0.6}
							className="pointer-events-none"
						/>
					))
				: null}

			{currentIndex !== null ? (
				<line
					x1={x(currentIndex) + colW / 2}
					y1={4}
					x2={x(currentIndex) + colW / 2}
					y2={plotH}
					stroke="var(--foreground)"
					strokeWidth={1}
					strokeDasharray="2 4"
					opacity={0.45}
					className="pointer-events-none"
				/>
			) : null}

			{repeatFrom !== null ? (
				<g className="pointer-events-none">
					<line
						x1={x(repeatFrom)}
						y1={4}
						x2={x(repeatFrom)}
						y2={H - 6}
						stroke="var(--muted-foreground)"
						strokeWidth={1}
						strokeDasharray="3 3"
					/>
					<text
						x={x(repeatFrom) + 4}
						y={11}
						className="fill-muted-foreground text-[9px] font-semibold"
					>
						↻
					</text>
				</g>
			) : null}

			{raceName ? (
				<g className="pointer-events-none">
					<line
						x1={W - padX + 4}
						y1={4}
						x2={W - padX + 4}
						y2={H - 6}
						stroke="var(--destructive)"
						strokeWidth={1.5}
					/>
					<circle cx={W - padX + 4} cy={4} r={3} fill="var(--destructive)" />
				</g>
			) : null}
		</svg>
	)
}

/** Axis hints appear only for the layers that are actually on. */
export function ChartScale({
	layers,
	maxVolume,
	maxCtl,
	currency,
}: {
	layers: LayerKey[]
	maxVolume: number
	maxCtl: number
	currency: Currency
}) {
	const bits: string[] = []
	if (layers.includes('volume'))
		bits.push(`peak ${fromHours(maxVolume, currency)} ${CURRENCY_UNIT[currency]}`)
	if (layers.includes('fitness')) bits.push(`peak ${maxCtl.toFixed(0)} CTL`)
	if (layers.includes('ramp')) bits.push('ramp ±40%')
	if (!bits.length) return null
	return (
		<p className="mt-1 px-1 text-right text-[11px] text-muted-foreground">
			{bits.join(' · ')}
		</p>
	)
}

export function FormLayerNotice() {
	const layer = LAYERS.find((l) => l.key === 'form')
	if (!layer?.unavailable) return null
	return (
		<div className="mt-2 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px] text-muted-foreground">
			<Icon name="info-circle" size="sm" className="mt-0.5 shrink-0" />
			<span>
				<strong className="font-medium text-foreground">Form is empty.</strong>{' '}
				{layer.unavailable}
			</span>
		</div>
	)
}
