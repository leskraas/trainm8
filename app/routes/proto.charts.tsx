/**
 * ⚠️ THROWAWAY PROTOTYPE — delete once #311 is decided. ⚠️
 *
 * Answers the approach question for the "interactive shadcn-style charts" map
 * (#309): Recharts (shadcn `chart`) vs hand-rolled SVG made interactive. It
 * renders BOTH the weekly training-load bar chart (TSS planned vs actual, keyed
 * to the Adherence Band) and the CTL fitness curve, once each way, so they can
 * be reacted to on a real phone viewport (390×844) — tap-to-inspect, the
 * Unavailable-week case (ADR-0008), and SSR first paint.
 *
 * Switch approach with `?impl=recharts` / `?impl=handrolled` or the floating
 * bar. Public route (no auth), synthetic data, no persistence — pure prototype.
 */
import { type ReactNode, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from 'recharts'
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	type ChartConfig,
} from '#app/components/ui/chart.tsx'
import { cn } from '#app/utils/misc.tsx'

export const meta = () => [{ title: 'PROTOTYPE · charts' }]

// ---------------------------------------------------------------------------
// Synthetic data — a training block of eight weeks. Adherence bands assigned
// directly; one week is Unavailable (no resolvable plan/actual pair) so both
// implementations have to face the honesty case, not a zero bar.
// ---------------------------------------------------------------------------

type Band = 'under' | 'on-target' | 'over' | 'unavailable'

type Week = {
	label: string
	planned: number | null
	actual: number | null
	band: Band
}

const WEEKS: Week[] = [
	{ label: '12 May', planned: 320, actual: 298, band: 'on-target' },
	{ label: '19 May', planned: 340, actual: 265, band: 'under' },
	{ label: '26 May', planned: 300, actual: 372, band: 'over' },
	{ label: '2 Jun', planned: 360, actual: 355, band: 'on-target' },
	// The Unavailable week: a plan exists but no trustworthy actual landed, so
	// there is nothing honest to compare. Never a zero bar (ADR-0008).
	{ label: '9 Jun', planned: 340, actual: null, band: 'unavailable' },
	{ label: '16 Jun', planned: 380, actual: 401, band: 'over' },
	{ label: '23 Jun', planned: 300, actual: 289, band: 'on-target' },
	{ label: '30 Jun', planned: 220, actual: 210, band: 'on-target' },
]

const BAND_HEX: Record<Band, string> = {
	under: '#38bdf8', // sky-400
	'on-target': '#10b981', // emerald-500
	over: '#f43f5e', // rose-500
	unavailable: '#94a3b8', // slate-400
}

// A CTL curve: ~13 weeks of daily "fitness", a steady ramp with a taper.
const CTL: { day: number; ctl: number }[] = Array.from(
	{ length: 91 },
	(_, i) => {
		const ramp = 42 + i * 0.55
		const wobble = Math.sin(i / 6) * 3
		const taper = i > 78 ? -(i - 78) * 1.2 : 0
		return { day: i, ctl: Math.round((ramp + wobble + taper) * 10) / 10 }
	},
)

const MAX_TSS = Math.max(
	...WEEKS.flatMap((w) => [w.planned ?? 0, w.actual ?? 0]),
)

const BAND_LABEL: Record<Band, string> = {
	under: 'Under',
	'on-target': 'On target',
	over: 'Over',
	unavailable: 'Unavailable',
}

// ===========================================================================
// HAND-ROLLED — the incumbent approach (extends fitness-journey.tsx): a pure
// function of props → SVG, SSR-native, tap-to-inspect via component state.
// ===========================================================================

function HandRolledBars() {
	const [sel, setSel] = useState<number | null>(null)
	const W = 720
	const H = 240
	const pad = { top: 16, bottom: 28, left: 8, right: 8 }
	const plotH = H - pad.top - pad.bottom
	const slot = (W - pad.left - pad.right) / WEEKS.length
	const barW = slot * 0.28
	const y = (v: number) => pad.top + plotH - (v / (MAX_TSS * 1.1)) * plotH

	const active = sel != null ? WEEKS[sel] : null

	return (
		<figure className="m-0">
			<div className="relative">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					preserveAspectRatio="none"
					className="h-60 w-full touch-manipulation"
					role="img"
					aria-label="Weekly training load, planned versus actual TSS per week"
				>
					{[0.25, 0.5, 0.75, 1].map((g) => (
						<line
							key={g}
							x1={pad.left}
							x2={W - pad.right}
							y1={pad.top + plotH * (1 - g)}
							y2={pad.top + plotH * (1 - g)}
							className="text-border"
							stroke="currentColor"
							strokeWidth={1}
							vectorEffect="non-scaling-stroke"
						/>
					))}
					{WEEKS.map((wk, i) => {
						const cx = pad.left + slot * (i + 0.5)
						const isUnavail = wk.actual == null
						return (
							<g
								key={wk.label}
								onClick={() => setSel(i === sel ? null : i)}
								className="cursor-pointer"
							>
								{/* Full-height hit target — easy to tap on a phone. */}
								<rect
									x={pad.left + slot * i}
									y={pad.top}
									width={slot}
									height={plotH}
									fill="transparent"
								/>
								{sel === i ? (
									<rect
										x={pad.left + slot * i}
										y={pad.top}
										width={slot}
										height={plotH}
										className="fill-foreground/5"
									/>
								) : null}
								{/* Planned — a ghost outline behind actual. */}
								{wk.planned != null ? (
									<rect
										x={cx - barW}
										y={y(wk.planned)}
										width={barW}
										height={pad.top + plotH - y(wk.planned)}
										rx={2}
										className="fill-muted-foreground/15 stroke-muted-foreground/40"
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
								) : null}
								{/* Actual — filled, coloured by Adherence Band. Unavailable
								    weeks paint nothing but a hatch + label, never a bar. */}
								{isUnavail ? (
									<>
										<rect
											x={cx - barW / 2}
											y={pad.top + plotH - 6}
											width={barW}
											height={6}
											className="fill-muted-foreground/20"
										/>
										<text
											x={cx}
											y={pad.top + plotH - 14}
											textAnchor="middle"
											className="fill-muted-foreground text-[9px]"
											style={{ fontSize: 9 }}
										>
											n/a
										</text>
									</>
								) : (
									<rect
										x={cx + barW * 0.05}
										y={y(wk.actual!)}
										width={barW}
										height={pad.top + plotH - y(wk.actual!)}
										rx={2}
										fill={BAND_HEX[wk.band]}
									/>
								)}
								<text
									x={cx}
									y={H - 8}
									textAnchor="middle"
									className="fill-muted-foreground"
									style={{ fontSize: 11 }}
								>
									{wk.label}
								</text>
							</g>
						)
					})}
				</svg>
			</div>
			{/* Tap-to-inspect panel — anchored below, never covers the bars, no
			    hover needed (ADR-0028). */}
			<figcaption
				className="bg-muted/40 mt-3 min-h-16 rounded-xl p-3 text-sm"
				aria-live="polite"
			>
				{active ? (
					active.actual == null ? (
						<div>
							<span className="font-medium">{active.label}</span> ·{' '}
							<span className="text-muted-foreground">
								Actual load Unavailable — planned {active.planned} TSS, no
								trustworthy recording to compare.
							</span>
						</div>
					) : (
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
							<span className="font-medium">{active.label}</span>
							<span className="text-muted-foreground">
								Planned {active.planned} TSS
							</span>
							<span style={{ color: BAND_HEX[active.band] }}>
								Actual {active.actual} TSS
							</span>
							<span
								className="rounded-full px-2 py-0.5 text-xs font-medium"
								style={{
									color: BAND_HEX[active.band],
									background: `${BAND_HEX[active.band]}1a`,
								}}
							>
								{BAND_LABEL[active.band]}
							</span>
						</div>
					)
				) : (
					<span className="text-muted-foreground">
						Tap a week to inspect its planned-vs-actual load.
					</span>
				)}
			</figcaption>
		</figure>
	)
}

function HandRolledCurve() {
	const [sel, setSel] = useState<number | null>(null)
	const W = 720
	const H = 220
	const lo = Math.min(...CTL.map((p) => p.ctl))
	const hi = Math.max(...CTL.map((p) => p.ctl))
	const yMin = Math.max(0, lo - 6)
	const yMax = hi + 6
	const x = (day: number) => (day / (CTL.length - 1)) * W
	const y = (ctl: number) => H - ((ctl - yMin) / (yMax - yMin)) * H
	const line = CTL.map((p) => `${x(p.day)},${y(p.ctl)}`).join(' ')
	const area = `${x(0)},${H} ${line} ${x(CTL.length - 1)},${H}`
	const active = sel != null ? CTL[sel] : null

	return (
		<figure className="m-0">
			<div className="relative">
				<svg
					viewBox={`0 0 ${W} ${H}`}
					preserveAspectRatio="none"
					className="h-56 w-full touch-none"
					role="img"
					aria-label="Fitness (CTL) over the training block"
					onPointerDown={(e) => {
						const rect = e.currentTarget.getBoundingClientRect()
						const frac = (e.clientX - rect.left) / rect.width
						setSel(Math.round(frac * (CTL.length - 1)))
					}}
					onPointerMove={(e) => {
						if (e.buttons === 0) return
						const rect = e.currentTarget.getBoundingClientRect()
						const frac = (e.clientX - rect.left) / rect.width
						setSel(
							Math.max(
								0,
								Math.min(CTL.length - 1, Math.round(frac * (CTL.length - 1))),
							),
						)
					}}
				>
					<defs>
						<linearGradient id="protoFit" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
							<stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.02" />
						</linearGradient>
					</defs>
					<polygon points={area} fill="url(#protoFit)" />
					<polyline
						points={line}
						fill="none"
						stroke="#0ea5e9"
						strokeWidth={2.5}
						vectorEffect="non-scaling-stroke"
					/>
					{active ? (
						<>
							<line
								x1={x(active.day)}
								x2={x(active.day)}
								y1={0}
								y2={H}
								className="text-foreground/40"
								stroke="currentColor"
								strokeWidth={1}
								strokeDasharray="3 3"
								vectorEffect="non-scaling-stroke"
							/>
							<circle
								cx={x(active.day)}
								cy={y(active.ctl)}
								r={4}
								fill="#0ea5e9"
							/>
						</>
					) : null}
				</svg>
			</div>
			<figcaption
				className="bg-muted/40 mt-3 min-h-10 rounded-xl p-3 text-sm"
				aria-live="polite"
			>
				{active ? (
					<span>
						Day {active.day + 1} ·{' '}
						<span className="font-medium">
							Fitness {Math.round(active.ctl)}
						</span>
					</span>
				) : (
					<span className="text-muted-foreground">
						Drag across the curve to read fitness on a day.
					</span>
				)}
			</figcaption>
		</figure>
	)
}

// ===========================================================================
// RECHARTS — the shadcn `chart` approach. ChartContainer wraps
// ResponsiveContainer; ChartTooltip trigger="click" for tap-to-inspect.
// ===========================================================================

const barConfig = {
	planned: { label: 'Planned', color: '#94a3b8' },
	actual: { label: 'Actual', color: '#10b981' },
} satisfies ChartConfig

function RechartsBars() {
	// Recharts has no Unavailable concept: an actual of null simply draws no bar
	// (good — no zero-bar fabrication), but nothing marks WHY. The honest label
	// is our layer regardless of library.
	return (
		<ChartContainer config={barConfig} className="aspect-auto h-60 w-full">
			<BarChart
				data={WEEKS}
				margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
			>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="label"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
				/>
				<YAxis tickLine={false} axisLine={false} width={40} />
				<ChartTooltip
					trigger="click"
					content={<ChartTooltipContent indicator="dashed" />}
				/>
				<Bar dataKey="planned" fill="var(--color-planned)" radius={3} />
				<Bar dataKey="actual" radius={3}>
					{WEEKS.map((wk) => (
						<Cell key={wk.label} fill={BAND_HEX[wk.band]} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	)
}

const curveConfig = {
	ctl: { label: 'Fitness (CTL)', color: '#0ea5e9' },
} satisfies ChartConfig

function RechartsCurve() {
	return (
		<ChartContainer config={curveConfig} className="aspect-auto h-56 w-full">
			<LineChart data={CTL} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="day"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					tickFormatter={(d) => `d${Number(d) + 1}`}
					interval={14}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={40}
					domain={['dataMin - 6', 'dataMax + 6']}
				/>
				<ChartTooltip trigger="click" content={<ChartTooltipContent />} />
				<Line
					dataKey="ctl"
					type="monotone"
					stroke="var(--color-ctl)"
					strokeWidth={2.5}
					dot={false}
				/>
			</LineChart>
		</ChartContainer>
	)
}

// ===========================================================================
// The prototype shell — switch approach, both charts stacked as they'd appear
// on the Trends tab.
// ===========================================================================

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="bg-card border-border/60 rounded-2xl border p-5">
			<h2 className="text-muted-foreground mb-4 text-xs font-medium tracking-wide uppercase">
				{title}
			</h2>
			{children}
		</section>
	)
}

export default function ProtoCharts() {
	const [params] = useSearchParams()
	const impl = params.get('impl') === 'recharts' ? 'recharts' : 'handrolled'

	return (
		<div className="mx-auto max-w-md space-y-5 p-4 pb-24">
			<header>
				<p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
					⚠️ Throwaway prototype · #311
				</p>
				<h1 className="text-lg font-semibold">
					Interactive charts —{' '}
					{impl === 'recharts' ? 'Recharts (shadcn)' : 'Hand-rolled SVG'}
				</h1>
				<p className="text-muted-foreground text-sm">
					Weekly training load and the fitness curve, both approaches. Tap a bar
					/ the curve to inspect.
				</p>
			</header>

			<Section title="Weekly training load">
				{impl === 'recharts' ? <RechartsBars /> : <HandRolledBars />}
			</Section>

			<Section title="Fitness curve">
				{impl === 'recharts' ? <RechartsCurve /> : <HandRolledCurve />}
			</Section>

			{/* Floating switcher (prototype convention). */}
			<div className="border-border bg-background/90 fixed inset-x-0 bottom-4 mx-auto flex w-max gap-1 rounded-full border p-1 shadow-lg backdrop-blur">
				{(['handrolled', 'recharts'] as const).map((k) => (
					<Link
						key={k}
						to={`?impl=${k}`}
						className={cn(
							'rounded-full px-4 py-2 text-sm font-medium',
							impl === k
								? 'bg-foreground text-background'
								: 'text-muted-foreground',
						)}
					>
						{k === 'handrolled' ? 'Hand-rolled' : 'Recharts'}
					</Link>
				))}
			</div>
		</div>
	)
}
